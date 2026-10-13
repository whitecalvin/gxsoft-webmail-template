"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { MailboxIconPreferences } from "@/lib/mailbox-icon-preferences";
import { IconPreferencesClient, type IconClientState } from "@/lib/icon-preferences-client";
import type { IconPreference, IconPreferences } from "@/lib/tastemail/icon-preferences-contract";
import { snapshotMailboxIconPreferences } from "@/lib/mailbox-icon-snapshot";

const MailboxIconContext = createContext<MailboxIconPreferences>({});
const MailboxGlyphContext = createContext<Record<string, string>>({});
const ServerIconContext = createContext<{ controller: IconPreferencesClient | null; required: boolean }>({ controller: null, required: false });
const EMPTY_STATE: IconClientState = { account: "", snapshot: null, status: "unavailable" };
const emptySnapshot = () => EMPTY_STATE;
const emptySubscribe = () => () => {};
export function MailboxIconProvider({ initialPreferences, initialGlyphs = {}, initialServer = null, serverRequired = false, children }: {
  initialPreferences: MailboxIconPreferences; initialGlyphs?: Record<string, string>; initialServer?: { account: string; preferences: IconPreferences } | null; serverRequired?: boolean; children: ReactNode;
}) {
  const [controller, setController] = useState(() => initialServer ? new IconPreferencesClient(initialServer.account, initialServer.preferences) : null);
  // 첫 조회 실패 후 새 SSR props가 도착하면 한 번만 초기화합니다. 기존 store는 렌더 중 변경하지 않습니다.
  if (!controller && initialServer) setController(new IconPreferencesClient(initialServer.account, initialServer.preferences));
  const state = useSyncExternalStore(controller?.subscribe ?? emptySubscribe, controller?.getSnapshot ?? emptySnapshot, controller?.getSnapshot ?? emptySnapshot);
  useLayoutEffect(() => {
    if (initialServer) controller?.reconcileServerSnapshot(initialServer.account, initialServer.preferences);
  }, [controller, initialServer, state.status]);
  useEffect(() => () => controller?.cancelPending(), [controller]);
  const server = useMemo(() => ({ controller, required: serverRequired }), [controller, serverRequired]);
  return <ServerIconContext.Provider value={server}><MailboxIconContext.Provider value={initialPreferences}><MailboxGlyphContext.Provider value={initialGlyphs}>{children}</MailboxGlyphContext.Provider></MailboxIconContext.Provider></ServerIconContext.Provider>;
}
export function useInitialMailboxIcons() { return useContext(MailboxIconContext); }
export function useInitialMailboxGlyphs() { return useContext(MailboxGlyphContext); }
export function useServerMailboxIcons(accountAddress: string) {
  const { controller, required } = useContext(ServerIconContext);
  const state = useSyncExternalStore(controller?.subscribe ?? emptySubscribe, controller?.getSnapshot ?? emptySnapshot, controller?.getSnapshot ?? emptySnapshot);
  const account = accountAddress.trim().toLowerCase();
  const matched = Boolean(account && state.account === account);
  const preferences = useMemo(() => matched && state.snapshot ? snapshotMailboxIconPreferences(account, state.snapshot) : {}, [account, matched, state.snapshot]);
  return { required, preferences, matched, status: state.status,
    snapshot: matched ? state.snapshot : null,
    importChoices: (revision: number, changes: IconPreference[]) => matched && controller ? controller.importChoices(account, revision, changes) : Promise.resolve(false),
    refresh: () => matched && controller ? controller.refresh() : Promise.resolve(null),
    update: (changes: IconPreference[]) => matched && controller ? controller.update(changes) : Promise.resolve(false),
    resetMailboxIcons: () => matched && controller ? controller.resetMailboxIcons(account) : Promise.resolve(false),
    saveCreatedKind: async (id: string, kind: "folder" | "mailbox") => {
      if (!matched || !controller || !await controller.refresh()) return false;
      const current = controller.getSnapshot();
      if (current.account !== account || current.status !== "ready" || !current.snapshot ||
        !current.snapshot.availableTargets.some(target => target.type === "mailbox" && target.id === id)) return false;
      const saved = current.snapshot.preferences.find(entry => entry.target.type === "mailbox" && entry.target.id === id);
      // Preserve a concurrent icon choice; the fresh revision still protects against later races.
      return controller.update([{ target: { type: "mailbox", id }, icon: saved?.icon ?? "default", displayKind: kind }]);
    },
    // Reset only system icons: the server's mailboxes scope would also erase personal folder kinds.
    resetSystemIcons: () => {
      if (!matched || !controller || !state.snapshot || state.status !== "ready") return Promise.resolve(false);
      const changes = state.snapshot.preferences.filter(entry => entry.target.type === "system" && entry.icon !== "default")
        .map(entry => ({ target: entry.target, icon: "default" }));
      return changes.length ? controller.update(changes) : Promise.resolve(true);
    },
  };
}
