export function remainingFailedUploadNames(
  current: readonly string[],
  incoming: readonly string[],
  statuses: readonly ("fulfilled" | "rejected")[],
): string[] {
  const remaining = new Set(current);
  incoming.forEach((name, index) => {
    if (statuses[index] === "fulfilled") remaining.delete(name);
  });
  incoming.forEach((name, index) => {
    if (statuses[index] !== "fulfilled") remaining.add(name);
  });
  return [...remaining];
}
