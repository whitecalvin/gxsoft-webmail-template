# Live calendar responsive verification — 2026-10-06

Target: the existing authenticated local frontend on `http://127.0.0.1:7540`.
This is not remote deployment verification.

Languages: ko, en, de, es, fr, it, pt, ja, zh, zh-hant.

All 20 language/viewport combinations passed the three view transitions:

| Viewport | Day | Week | Month | Horizontal overflow |
| --- | --- | --- | --- | --- |
| 390 × 844 | mobile date strip: 1 button | mobile date strip: 7 buttons | visible month region: 42 date buttons | none |
| 1280 × 900 | visible time grid: 1 day column | visible time grid: 7 day columns | visible month region: 42 date buttons | none |

The browser's captured console contained zero errors, zero warnings and zero
hydration-related entries after the checks. This describes the available captured
log, not an assurance against every future asynchronous failure.

Only locale-route navigation and day/week/month view buttons were used. No event
creation, update, cancellation, attendee response, email mutation or account setting
change was performed. The original route and default viewport were restored.

Source SHA-256 at verification:

- `components/calendar/LiveCalendar.tsx`:
  `1359BBE63E8588F55631F97C49E82EBA7A08A3DC3BEA47301A216FB5267B2ED8`
- `components/calendar/CalendarMonthGrid.tsx`:
  `9A761EC92BEE27D94918B11B6B0F7E06126025F5F818B04911086F572CEBC52B`
- `components/calendar/CalendarTimeGrid.tsx`:
  `09A1379111DFBC463C555E9E091CA57B1DFE4BF4ABAFB419F71C97929154F4E7`

Scope limits: this does not prove populated-event layout, calendar mutations,
permissions/session expiration, outage recovery, every theme, or all other pages.
No application source changed in this verification pass, so application build and
unchanged unit tests were not repeated.
