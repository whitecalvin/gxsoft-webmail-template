# Mail reader readability verification — 2026-10-09

- Observed in the existing authenticated browser tab: 626px fixed-width HTML was scaled to a 342px frame (`scale(0.546326)`), reducing 14px text to about 7.6px visually.
- Removed whole-body scaling. Fixed-width HTML retains its measured width and uses horizontal scrolling inside the isolated iframe; responsive content continues to use the frame width. Narrow panes therefore require horizontal scrolling rather than shrinking text.
- ReadingPane action headers (loaded and loading states) now use `h-12` (48px).
- Live browser measured after the change: body font 14px, no transform, horizontal overflow auto, action header 48px. Sender/date are visible at the top but still scroll with the content; this change does not make them sticky or alter stored pane widths.
- Synthetic extracted resize callback test passed across 720/640/360/390/720px and a hidden frame. Existing iframe privacy/CSP/CID tests passed (4 tests); scoped ESLint passed.
- No mail mutation, server configuration, deployment or service restart. Existing unrelated worktree changes are preserved. The scoped diff check reports pre-existing whitespace in ReadingPane at lines 60, 168 and 358, outside this change.
- Screenshot: `mail-readable-body-20261009.jpg` (reader only).
- Production build passed (session 52039, exit 0; TypeScript and 392 generated pages). Initial restricted build failed creating an output directory; resumed the build gate with approved local permissions after the lint correction. No deployment was performed.
