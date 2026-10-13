import "server-only";
import { loadLiveMailboxSummary } from "./mail";
import { serviceStatus, tastemailRequest } from "./server";
import { personalFolderReceipt, type PersonalFolderChange } from "./personal-folder-contract";

export class PersonalFolderError extends Error {
  constructor(readonly status: ReturnType<typeof serviceStatus> | "invalid_request" | "not_found" | "conflict" | "mutation_uncertain") { super(status); }
}

export async function changePersonalFolder(token: string, input: PersonalFolderChange) {
  const before = await loadLiveMailboxSummary(token);
  if (input.operation !== "create") {
    const folder = before.mailboxes.find(folder => folder.id === input.mailboxId);
    if (!folder) throw new PersonalFolderError("not_found");
    if (folder.role !== null || folder.name.toLowerCase() === "inbox") throw new PersonalFolderError("invalid_request");
    if (input.operation === "delete" && (folder.totalEmails !== 0 || before.mailboxes.some(child => child.name.startsWith(`${folder.name}/`)))) {
      throw new PersonalFolderError("conflict");
    }
  }
  let response: Response;
  try {
    response = await tastemailRequest("/api/personal-folders", token, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new PersonalFolderError("mutation_uncertain"); }
  if (!response.ok) {
    const status = response.status;
    // A transport/upstream failure after POST cannot prove rollback. Never retry it automatically.
    if (status === 408 || status === 425 || status >= 500) throw new PersonalFolderError("mutation_uncertain");
    throw new PersonalFolderError(status === 400 ? "invalid_request" : status === 404 ? "not_found" : status === 409 ? "conflict" : serviceStatus(status));
  }
  try {
    if (response.status !== 200) throw new Error();
    const text = await response.text();
    if (text.length > 4_194_304) throw new Error();
    const mailboxes = personalFolderReceipt(JSON.parse(text), input, before.mailboxes);
    return { ...before, mailboxes };
  } catch { throw new PersonalFolderError("mutation_uncertain"); }
}
