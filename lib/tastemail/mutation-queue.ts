/** Serializes mutations of one message without blocking mutations of other messages. */
export class MailMutationQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly keys = new Set<string>();
  private readonly visibleCounts = new Map<string, number>();
  private readonly onVisibleChange: (ids: string[]) => void;
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(onVisibleChange: (ids: string[]) => void) {
    this.onVisibleChange = onVisibleChange;
  }

  hasVisiblePending(id: string): boolean {
    return this.visibleCounts.has(id);
  }

  enqueue(id: string, key: string, operation: () => Promise<void>, showPending = true): void {
    if (this.keys.has(key)) return;
    this.keys.add(key);
    if (showPending) {
      const count = this.visibleCounts.get(id) ?? 0;
      this.visibleCounts.set(id, count + 1);
      if (count === 0) this.onVisibleChange([...this.visibleCounts.keys()]);
    }

    const previous = this.tails.get(id) ?? Promise.resolve();
    // A page-wide operation must not launch 100 simultaneous API writes.
    // Per-message ordering and duplicate suppression remain unchanged.
    const execute = async () => {
      if (this.running >= 4) await new Promise<void>(resolve => this.waiting.push(resolve));
      else this.running += 1;
      try { await operation(); }
      finally {
        const next = this.waiting.shift();
        if (next) next(); else this.running -= 1;
      }
    };
    const current = previous.then(execute, execute);
    this.tails.set(id, current);
    const finish = () => {
      this.keys.delete(key);
      if (showPending) {
        const count = this.visibleCounts.get(id) ?? 0;
        if (count <= 1) {
          this.visibleCounts.delete(id);
          this.onVisibleChange([...this.visibleCounts.keys()]);
        } else {
          this.visibleCounts.set(id, count - 1);
        }
      }
      if (this.tails.get(id) !== current) return;
      this.tails.delete(id);
    };
    void current.then(finish, finish);
  }
}
