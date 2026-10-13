# Account icon import confirmation boundary — 2026-10-08

## Implemented

- Pure planner prepares one batch without writing browser storage or uploading it.
- `IconPreferencesClient.importChoices` accepts the expected account and preview revision. It requires ready state, no pending request, valid changes, available targets and no existing preference for any imported target.
- Captures the batch before notifying subscribers; uses the normal authenticated BFF update/receipt path. Duplicate requests and unconfirmed-result retries remain blocked.
- The account-matched provider exposes the snapshot and guarded import operation. Foreign accounts cannot obtain the snapshot or upload through this hook.
- Existing server choices, including default icons with folder kinds, are protected. The visible 512-entry capacity check is conservative guidance only: inaccessible stored entries can still cause a server rejection.

## Verification

- Synthetic controller/adapter tests cover wrong owner, stale revision, unavailable target, empty batch, existing-choice protection, duplicate submission and unconfirmed-result retry prohibition. No real server requests.
- Import planner and account-provider/SSR tests pass in development; provider tests also pass with production React.
- Full lint completed with exit 0 (session 74266). Isolated production build completed with exit 0, TypeScript and 380 generated pages (session 98477, `.next-folder-drag`). These local gates do not prove deployment or browser acceptance.
- Preview UI continuation: synthetic UI and settings reset tests passed; all ten locale catalogs (2980 keys), locale usages (1146 literal calls), full lint (session 10674) and isolated production build (session 75703) passed. Browser/hydration/mobile behavior and actual upload were not tested.
- Personal consumer continuation: personal icons, creation kind-only retry, tree drag, sidebar, all ten-language manager UI, account provider, locale catalogs (2982 keys), locale usages (1151 literal calls) and full lint passed (session 63055). Added provider owner/access/fresh-icon tests and updated tree authority tests passed; production React personal SSR tests and scoped lint for changed test inputs passed. Isolated production build, TypeScript and 380 pages completed with exit 0 (session 91508). No real-account writes or deployment performed.
- Kind-preserving reset continuation: synthetic controller/adapter reset batching and settings/provider tests, ten-language catalogs/usages and full lint passed (session 70130). Production React provider tests and isolated production build, TypeScript and 380 pages passed with exit 0 (session 86432). Existing type metadata was preserved in synthetic receipts, not verified against production. No actual account reset was executed.

## Incomplete

- Settings now has a local-settings preview and explicit batch confirmation UI. Reads only known keys for the authenticated account's accessible targets, never scans storage or deletes browser choices. It uploads no more than one confirmed batch, hides another account's preview and blocks stale revisions. Real server upload remains unverified and has not been executed by this task.
- Personal folder icon and tree consumers now prefer matched server preferences, with authoritative server defaults. Icon updates preserve displayKind. Creation performs a fresh read before saving the type; failed type saves are retried separately, never by repeating creation. Synthetic SSR, UI, provider/access/account-switch and kind-only retry tests passed. Actual deployment and server persistence remain unverified.
- Actual server deployment, cross-device persistence, first-paint/browser validation and broader live acceptance remain unverified.
- Settings reset now updates system and personal mailbox icons in bounded 64-entry batches, preserving displayKind and profile/shared-account choices. Stops on conflicts, partial/unconfirmed receipts or account switches; local reset/success occurs only after full acknowledgment. Synthetic batching, duplicate lock, kind preservation, partial-failure stop and account-switch tests passed. Actual reset remains unverified.
- Continue with actual authorized acceptance. Existing local kinds require the explicit import preview to enter server storage; absent server entries use the server default mailbox kind. Do not erase browser choices or reset mailbox display kinds as a shortcut.

Later explicit user requests to remove mock mode and retire port 7531 remain authoritative; this checkpoint does not restore either.
