/** Only background reads with a confirmed snapshot may defer a transient alert. */
export class MailboxRefreshRecovery {
  private failures = 0;
  delayMs = 60_000;

  success(): void {
    this.failures = 0;
    this.delayMs = 60_000;
  }

  failure(status: string, background: boolean): boolean {
    if (status !== "retryable" || !background) {
      this.success();
      return true;
    }
    this.failures = Math.min(this.failures + 1, 3);
    // 일시적 조회 실패만 두 번 재시도합니다. 지속 장애에는 정상 주기로 돌아갑니다.
    this.delayMs = this.failures === 1 ? 5_000 : this.failures === 2 ? 15_000 : 60_000;
    return this.failures >= 3;
  }
}
