import { accountIconKey, type MailboxIconPreferences } from "./mailbox-icon-preferences";
import { iconTargetKey, type IconPreferences, type IconTarget } from "./tastemail/icon-preferences-contract";

/** Convert only accessible targets from the authenticated server snapshot; never merge local cookies. */
export function snapshotMailboxIconPreferences(accountAddress: string, snapshot: IconPreferences): MailboxIconPreferences {
  const account = accountAddress.trim().toLowerCase();
  if (!account) return {};
  const result: MailboxIconPreferences = {};
  const saved = new Map(snapshot.preferences.map(entry => [iconTargetKey(entry.target), entry]));
  for (const target of snapshot.availableTargets) {
    const preference = saved.get(iconTargetKey(target));
    result[iconPreferenceKey(account, target)] = preference?.icon ?? snapshot.defaultIcon;
    if (target.type === "mailbox") {
      result[`gxmail:folder-kind:v1:${encodeURIComponent(account)}:${encodeURIComponent(target.id)}`] = preference?.displayKind ?? snapshot.defaultDisplayKind;
    }
  }
  return result;
}

export function iconPreferenceKey(accountAddress: string, target: IconTarget): string {
  const account = accountAddress.trim().toLowerCase();
  if (target.type === "profile") return accountIconKey(account);
  if (target.type === "sharedAccount") return accountIconKey(account, `shared:${target.id}`);
  // JMAP uses junk; the existing translated UI folder is named spam.
  const id = target.type === "system" ? `system:${target.role === "junk" ? "spam" : target.role}` : target.id;
  return `gxmail:folder-icon:v1:${encodeURIComponent(account)}:${encodeURIComponent(id)}`;
}
