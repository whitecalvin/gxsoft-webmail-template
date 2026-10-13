export function editedEventTimezone(
  originalTimezone: string,
  originalLocalStart: string,
  originalLocalEnd: string,
  nextLocalStart: string,
  nextLocalEnd: string,
  viewerTimezone: string,
): string {
  return originalLocalStart === nextLocalStart && originalLocalEnd === nextLocalEnd
    ? originalTimezone || viewerTimezone
    : viewerTimezone;
}
