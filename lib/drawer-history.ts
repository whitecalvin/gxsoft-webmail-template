const DRAWER_STATE = "gxmailDrawer";

// 메뉴 전용 기록을 먼저 소비한 뒤 페이지를 이동해 빈 뒤로 가기 단계를 남기지 않습니다.
export class DrawerHistory {
  private active = false;
  private closing = false;
  private afterClose: (() => void) | undefined;
  private navigationTimer: number | undefined;
  private browser: Window;
  private dismiss: () => void;
  private token: string;

  constructor(browser: Window, dismiss: () => void, token: string) {
    this.browser = browser;
    this.dismiss = dismiss;
    this.token = token;
    browser.addEventListener("popstate", this.onPop);
  }

  open() {
    if (this.active || this.closing) return false;
    this.browser.history.pushState({ ...this.browser.history.state, [DRAWER_STATE]: this.token }, "", this.browser.location.href);
    this.active = true;
    return true;
  }

  close(afterClose?: () => void) {
    if (this.closing) return;
    this.afterClose = afterClose;
    if (this.active && this.browser.history.state?.[DRAWER_STATE] === this.token) {
      this.closing = true;
      this.browser.history.back();
    } else {
      this.finishClose();
    }
  }

  private finishClose() {
    this.active = false;
    this.closing = false;
    const next = this.afterClose;
    this.afterClose = undefined;
    this.dismiss();
    if (next) {
      // Next의 popstate 복원이 같은 이벤트의 이동을 덮어쓰지 않도록 다음 작업에서 실행합니다.
      this.closing = true;
      this.navigationTimer = this.browser.setTimeout(() => {
        this.navigationTimer = undefined;
        this.closing = false;
        next();
      }, 0);
    }
  }

  private onPop = () => {
    if (this.active) this.finishClose();
  };

  dispose() {
    this.browser.removeEventListener("popstate", this.onPop);
    if (this.navigationTimer !== undefined) this.browser.clearTimeout(this.navigationTimer);
    this.navigationTimer = undefined;
    this.afterClose = undefined;
  }
}
