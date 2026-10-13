/** Keep opening a message separate from double-click/long-press selection. */
export class MailSelectionGestures {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private origin: { x: number; y: number } | undefined;
  private heldId: string | undefined;
  cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.origin = undefined;
  }
  single(open: () => void) {
    this.cancel();
    this.timer = setTimeout(open, 300);
  }
  double(select: () => void) { this.cancel(); select(); }
  press(id: string, x: number, y: number, select: () => void) {
    this.cancel();
    this.heldId = undefined;
    this.origin = { x, y };
    this.timer = setTimeout(() => { this.heldId = id; select(); }, 500);
  }
  move(x: number, y: number) {
    if (this.origin && Math.hypot(x - this.origin.x, y - this.origin.y) > 10) this.cancel();
  }
  consume(id: string) {
    if (this.heldId !== id) return false;
    this.heldId = undefined;
    return true;
  }
}
