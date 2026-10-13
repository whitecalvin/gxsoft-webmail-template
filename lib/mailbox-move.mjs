/**
 * Aggregate views resolve only an unambiguous filing mailbox.
 * @param {readonly { id: string, role: string | null }[]} mailboxes
 * @param {readonly string[]} memberships
 * @param {string | null} sourceId
 * @returns {string | null}
 */
export function resolveMoveSource(mailboxes, memberships, sourceId) {
  const current = mailboxes.filter(mailbox => memberships.includes(mailbox.id));
  if (sourceId) return current.some(mailbox => mailbox.id === sourceId) ? sourceId : null;
  // 보낸편지함은 수신 사본의 이동과 독립적이다. 여러 원본 후보가 있으면 추측하지 않는다.
  const filing = current.filter(mailbox => mailbox.role && ["inbox", "archive", "junk", "trash", "drafts"].includes(mailbox.role));
  if (filing.length === 1) return filing[0].id;
  return current.length === 1 ? current[0].id : null;
}

/** @param {readonly string[]} memberships @param {string} sourceId @param {string} targetId */
export function movedMailboxIds(memberships, sourceId, targetId) {
  return [...new Set([...memberships.filter(id => id !== sourceId), targetId])];
}
