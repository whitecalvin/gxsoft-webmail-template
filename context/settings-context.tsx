"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_USER_SETTINGS } from "@/lib/user-settings";
import { generalSettingsFromUser, userSettingsFromGeneral, type GeneralSettingsSnapshot } from "@/lib/general-settings";
import { GeneralSettingsState, type SettingsFailure } from "@/lib/general-settings-state";
import type { UserSettings } from "@/types/user-settings";

interface SettingsContextValue {
  saved: UserSettings;
  draft: UserSettings;
  hydrated: boolean;
  accountAvailable: boolean;
  isDirty: boolean;
  busy: boolean;
  uncertain: boolean;
  error: SettingsFailure | null;
  reload: () => Promise<boolean>;
  updateSection: <K extends keyof UserSettings>(section: K, patch: Partial<UserSettings[K]>) => void;
  replaceSection: <K extends keyof UserSettings>(section: K, value: UserSettings[K]) => void;
  setRemoteImages: (policy: UserSettings["inbox"]["remoteImages"]) => Promise<boolean>;
  trustImageSender: (account: string, sender: string, allow?: boolean) => Promise<boolean>;
  save: () => Promise<boolean>;
  discard: () => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyAccessibility(settings: UserSettings["accessibility"]) {
  const root = document.documentElement;
  root.style.setProperty("--user-font-scale", `${Number(settings.fontScale) / 100}`);
  root.dataset.highContrast = String(settings.highContrast);
  root.dataset.reduceMotion = String(settings.reduceMotion);
  root.dataset.enhancedFocus = String(settings.enhancedFocus);
  root.dataset.screenReaderDetails = String(settings.screenReaderDetails);
  root.dataset.keyboardNavigation = String(settings.keyboardNavigation);
}

export function SettingsProvider({ children, accountId = null, accountAddress = "", initialSnapshot = null, initialError = null }: {
  children: ReactNode; accountId?: string | null; accountAddress?: string; initialSnapshot?: GeneralSettingsSnapshot | null; initialError?: SettingsFailure | null;
}) {
  // 부모는 인증 계정을 key로 사용한다. 같은 계정의 재렌더링은 draft를 초기화하지 않는다.
  const [controller] = useState(() => new GeneralSettingsState(accountId, initialSnapshot, undefined, initialError));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const lifecycle = useRef({ generation: 0 });
  useEffect(() => {
    const lifetime = lifecycle.current;
    const generation = ++lifetime.generation;
    return () => { queueMicrotask(() => { if (lifetime.generation === generation) controller.dispose(); }); };
  }, [controller]);
  const saved = useMemo(() => state.snapshot ? userSettingsFromGeneral(state.snapshot, accountAddress) : structuredClone(DEFAULT_USER_SETTINGS), [state.snapshot, accountAddress]);
  const draft = useMemo(() => state.snapshot ? userSettingsFromGeneral({ ...state.snapshot, settings: state.draft }, accountAddress) : saved, [state.snapshot, state.draft, accountAddress, saved]);
  const hydrated = state.snapshot !== null;
  const isDirty = JSON.stringify(state.draft) !== JSON.stringify(state.snapshot?.settings ?? state.draft);

  useEffect(() => { if (hydrated) applyAccessibility(draft.accessibility); }, [draft.accessibility, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    const warn = (event: BeforeUnloadEvent) => { if (isDirty || state.busy || state.uncertain) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, state.busy, state.uncertain, hydrated]);

  const updateSection = useCallback(<K extends keyof UserSettings>(section: K, patch: Partial<UserSettings[K]>) => {
    controller.edit(current => {
      const full = userSettingsFromGeneral({ version: 1, accountId: accountId ?? "", revision: 0, settings: current }, accountAddress);
      return generalSettingsFromUser({ ...full, [section]: Object.assign({}, full[section], patch) }, accountAddress);
    });
  }, [controller, accountId, accountAddress]);
  const replaceSection = useCallback(<K extends keyof UserSettings>(section: K, value: UserSettings[K]) => {
    controller.edit(current => generalSettingsFromUser({ ...userSettingsFromGeneral({ version: 1, accountId: accountId ?? "", revision: 0, settings: current }, accountAddress), [section]: value }, accountAddress));
  }, [controller, accountId, accountAddress]);
  const cleanForImmediateSave = useCallback(() => {
    const current = controller.getSnapshot();
    return current.snapshot && !current.busy && !current.uncertain && JSON.stringify(current.draft) === JSON.stringify(current.snapshot.settings);
  }, [controller]);
  const setRemoteImages = useCallback(async (policy: UserSettings["inbox"]["remoteImages"]) => {
    if (!cleanForImmediateSave()) return false;
    controller.edit(current => ({ ...current, inbox: { ...current.inbox, remoteImages: policy } }));
    return controller.save();
  }, [controller, cleanForImmediateSave]);
  const trustImageSender = useCallback(async (account: string, sender: string, allow = true) => {
    const key = account.trim().toLowerCase();
    const address = sender.trim().toLowerCase();
    if (!key || key !== accountAddress || !address.includes("@") || !cleanForImmediateSave()) return false;
    controller.edit(current => ({ ...current, inbox: { ...current.inbox, remoteImageSenders: allow ? [...new Set([...current.inbox.remoteImageSenders, address])] : current.inbox.remoteImageSenders.filter(item => item !== address) } }));
    return controller.save();
  }, [controller, accountAddress, cleanForImmediateSave]);
  const save = useCallback(() => controller.save(), [controller]);
  const reload = useCallback(() => controller.reload(), [controller]);
  const discard = useCallback(() => controller.discard(), [controller]);
  const reset = useCallback(() => controller.edit(() => generalSettingsFromUser(DEFAULT_USER_SETTINGS, accountAddress)), [controller, accountAddress]);
  const value = useMemo(() => ({ saved, draft, hydrated, accountAvailable: controller.accountId !== null, isDirty, busy: state.busy, uncertain: state.uncertain, error: state.error, reload, updateSection, replaceSection, setRemoteImages, trustImageSender, save, discard, reset }), [controller, saved, draft, hydrated, isDirty, state.busy, state.uncertain, state.error, reload, updateSection, replaceSection, setRemoteImages, trustImageSender, save, discard, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
}
