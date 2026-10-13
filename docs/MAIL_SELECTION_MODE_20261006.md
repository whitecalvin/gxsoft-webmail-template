# Mail selection mode — 2026-10-06

- Default: row and header selection checkboxes are not rendered; folder total remains visible.
- Desktop: double-click enters selection without opening the message. Mouse single-click waits 300 ms to distinguish double-click. Keyboard activation still opens immediately; Shift+Space selects without opening.
- Touch: a 500 ms hold selects; movement over 10 px or pointer cancellation stops the timer. The subsequent click is consumed. Ordinary touch opens normally.
- Selection mode: clicking a row toggles selection; custom row/header checkboxes are visible. The header shows selected count instead of the folder total. Existing range selection and guarded bulk actions remain available.
- Selection actions are inside the same 56px list header, not a separate row. Refresh is hidden until selection ends. On narrow screens the accessible folder heading is visually hidden to prioritize the count and four 44px action targets. Local desktop and 320px viewport checks confirmed header placement, no horizontal overflow, and refresh restoration after Escape.
- Escape, clear, or Back cancels selection and restores the default header. A same-URL history entry preserves Next.js router state; closing a drawer above selection does not cancel selection. Account/folder/page boundaries discard selection.

Verification: gesture/history tests, existing range/bulk-selection tests, scoped ESLint, and isolated production build passed (378 generated pages). No meaningful separate optimized configuration exists for the Node gesture tests; they were not repeated under a different label.

Local 7540 desktop UI: default 0 checkboxes; double-click 51 checkboxes / 1 selected; header select-all 50 selected; Escape and Back return to 0 checkboxes and the folder total, with Back keeping `/ko`. Only selection was changed; no bulk mutation was dispatched. The temporary tab was closed and the user's existing settings tab preserved. Actual mobile long-press hardware behavior remains unverified. No server deployment, restart, commit or push.
