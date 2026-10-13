export interface SystemErrorAction { actionLabel?: string; onAction?: () => void }
type Entry = { id: string; owners: Map<symbol, SystemErrorAction> };

/** Share one notification across error hosts; release it only when all hosts recover. */
export class SystemErrorToasts {
  private entries = new Map<string, Entry>();
  private push: (message: string, action: SystemErrorAction) => string;
  private dismiss: (id: string) => void;
  constructor(push: (message: string, action: SystemErrorAction) => string, dismiss: (id: string) => void) {
    this.push = push;
    this.dismiss = dismiss;
  }

  acquire(message: string, action: SystemErrorAction): () => void {
    const owner = Symbol();
    let entry = this.entries.get(message);
    if (!entry) {
      const owners = new Map([[owner, action]]);
      const id = this.push(message, { actionLabel: action.actionLabel, onAction: () => {
        // The first host may have unmounted since this toast was created.
        [...owners.values()].find(item => item.onAction)?.onAction?.();
      } });
      entry = { id, owners };
      this.entries.set(message, entry);
    } else entry.owners.set(owner, action);
    const acquired = entry;
    return () => {
      acquired.owners.delete(owner);
      if (!acquired.owners.size && this.entries.get(message) === acquired) {
        this.entries.delete(message);
        this.dismiss(acquired.id);
      }
    };
  }
}
