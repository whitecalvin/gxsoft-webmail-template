type PendingRead = { id: string; mark: () => void };

export class PendingAutoRead {
  private pending: PendingRead | null = null;

  schedule(id: string, mark: () => void): void {
    this.pending = { id, mark };
  }

  clear(id?: string): void {
    if (id === undefined || this.pending?.id === id) this.pending = null;
  }

  complete(id: string): boolean {
    if (this.pending?.id !== id) return false;
    const { mark } = this.pending;
    this.pending = null;
    mark();
    return true;
  }

  completeAvailable(messages: readonly { id: string; detailLoaded?: boolean }[]): boolean {
    const id = this.pending?.id;
    if (!id || !messages.some((message) => message.id === id && message.detailLoaded !== false)) return false;
    return this.complete(id);
  }
}
