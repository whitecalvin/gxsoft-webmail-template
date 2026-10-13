// EmailSubmission/get with ids:null has no cursor. A response at the server's
// advertised limit may omit older pending submissions and cannot be complete.
export function hasCompleteSubmissionList(count: number, maxObjectsInGet: number | null): boolean {
  return Number.isSafeInteger(count) && count >= 0 &&
    maxObjectsInGet !== null && Number.isSafeInteger(maxObjectsInGet) &&
    maxObjectsInGet > 0 && count < maxObjectsInGet;
}
