type RuleInput = { id: string | null; name: string; kind: string; source: string; enabled: boolean };
type SavedRule = { id: string; name: string; kind: string; source: string; enabled: boolean; position: number };

export function confirmsMailRuleReplacement(
  saved: { mode: string; enabled: boolean; rules: readonly SavedRule[] },
  requested: readonly RuleInput[],
): boolean {
  if (saved.mode !== "rules" || saved.rules.length !== requested.length ||
      saved.enabled !== requested.some((rule) => rule.enabled)) return false;
  const ids = new Set<string>();
  return requested.every((rule, position) => {
    const actual = saved.rules[position];
    if (!actual || !actual.id || ids.has(actual.id)) return false;
    ids.add(actual.id);
    return actual.position === position && (rule.id === null || actual.id === rule.id) &&
      actual.name === rule.name.trim() && actual.kind === rule.kind &&
      actual.source === rule.source.replace(/\r\n?/gu, "\n") && actual.enabled === rule.enabled;
  });
}
