# HTML mail clipping correction

- Scope: the HTML reading pane already visible in the user's browser. Only already-read mail was opened; no mail flags, folders, settings or content were written.
- Before: frame viewport 342px, measured natural content 626px. Author email CSS overrode the host's inline body width to 342px; `scale(0.546326)` then reduced the body clipping box to about 187px while the full table would occupy 342px. The right half was clipped.
- Fix: the measured body width uses inline `!important` while scaled and removes that width override when scaling is unnecessary. Email tables, body styles, CSP, sandbox, link handling and remote-image policy are otherwise unchanged.
- After: iframe body clientWidth 626px, visible bounding width 342px, inline width priority important. The full-width table is visible without the former right-edge clipping in the same observed email.
- Regression: actual resize callback tests cover measured-width priority and its removal on viewport expansion. Frame resize, frame policy, image policy, image loading and mobile viewport synthetic checks passed (5/5). Scoped ESLint and diff whitespace check passed.
- Production: `.next-rules-confirmation` webpack build, TypeScript and 392-page generation passed, exit 0. No deployment or server restart.
- UI evidence: `mail-body-width-fixed-20261009.jpg`, cropped to the reading pane to exclude unrelated mail-list content. This is a desktop check at the current viewport, not a full ten-language or physical-device UI qualification.
- Input SHA256: LiveHtmlMessageBody.tsx `5B487867334168DC63DAE2C05DBDF914950BA78BDBA804F62E6333F1E4D359BF`; test-mail-frame-resize.mjs `F45CC4B3B5AC63BD1AC1D5664FAE8C801E43ADEF8E38CD999AE583FF965220E2`.
