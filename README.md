# GXWebMail

## Current runtime and acceptance — 2026-10-13

Linked-account operations now use durable UUID receipts for LIST, batch sync and selected/all-folder scheduling. Unknown/partial writes remain locked after reload; result recovery is GET-only, with explicit remaining-prefix continuation and revision-fenced pause/resume controls. Synthetic production browser checks and approved isolated DB race tests passed (four Debug/four Release tests, migration0068 and test Clippy). Production DB/deployment and real external-worker acceptance remain separate; the user will deploy and apply the DB migration directly, then report completion. [Current scope](docs/linked-job-control-server-request-20261013.md).

Runtime is **live-only**, following the user's later removal of demo data. `GXWEBMAIL_DATA_MODE` cannot enable mock mode, and upstream failures never substitute sample mail. `TASTEMAIL_API_URL` is server-only and accepts HTTPS or loopback HTTP; use the documented SSH development tunnel for a remote API. Browser requests stay on the Next.js origin and authentication stays in HttpOnly cookies/server code.

The current Rust router (`crates/tastemail-api/src/lib.rs`) provides POST/DELETE `/api/auth/session`; session reads use GET `/.well-known/jmap`, not an invented auth-session GET.

Latest scoped live evidence:

- Approved self-mail: actual receipt, read/star persistence, Archive/Spam/Trash moves and Inbox restoration, with no permanent deletion. [Mail state evidence](docs/self-mail-acceptance-20261013.md), [Spam/Trash evidence](docs/self-mail-spam-trash-20261013.md).
- Approved draft: v1/v2 save and resume, one self-send and attachment download with matching size/SHA-256. [Draft/attachment evidence](docs/draft-attachment-live-20261013.md).
- One approved session: real 120-second expiry and login redirect, followed by removal of the temporary server approval. The translated login notice is separately covered by isolated production HTTP checks. [Expiry](docs/session-expiry-live-20261013.md), [Notice](docs/session-login-notice-20261013.md).
- Ten-locale desktop/mobile viewing of the synthetic mail, actual pagination, and read-only contacts/empty calendar/shared lists. These are scoped observations, not whole-product or real-device qualification. [Mail UI](docs/self-mail-acceptance-20261013.md), [Pagination](docs/mail-pagination-live-20261013.md), [Auxiliary reads](docs/auxiliary-readonly-20261013.md).

Previous MFA success/failure, recovery-code and recovery-code reuse rejection were completed by the user and are reused as user-confirmed acceptance; activation was directly observed. This is not a claim that the agent independently observed every authentication attempt, and the same test is not requested again. [MFA evidence reuse](docs/mfa-prior-acceptance-20261013.md).

Overall integration is **not complete**. External-account authorization/worker/cache correctness, shared-account rights and remaining failure/uncertain-operation/privileged-change paths still need their own authorized acceptance. [Requirement-by-requirement status](docs/live-integration-acceptance-20261011.md). The dated entries below are earlier checkpoints; their pending or mock-mode statements do not override this current scope.

2026-10-11 follow-up: approved Archive hiding, save, reload persistence, restoration and a second reload were verified live. Personal-mailbox persistence, account isolation and failure paths remain separate. [Evidence](docs/mailbox-visibility-integration-20261011.md).

Mailbox visibility: select system/personal mailboxes in Settings > Inbox and reading. Account-scoped general settings drive the saved SSR sidebar; hiding never deletes or moves mail. Live list rendering/draft cancellation and relevant checks/build passed; live save persistence remains unverified. [Scope](docs/mailbox-visibility-integration-20261011.md).

Linked recurring sync scheduling: the selected-folder POST/202 receipt is connected through shared confirmation and Provider guards. Confirmation discloses ongoing scheduling, existing-job restart and unavailable individual stopping. Synthetic contract/UI/ten-locale checks passed; actual jobs/workers, all-folder scheduling, stopping and durable recovery remain unverified or pending. [Scope](docs/linked-sync-queue-20261011.md).

Sync jobs UI follow-up: linked-account mail viewing now has an explicitly opened read-only status panel with account/generation, size and late-response guards. Ten-locale synthetic checks passed. Actual GUI/live-data acceptance, queue controls and durable unknown-operation recovery remain pending. [Scope](docs/linked-sync-jobs-20261011.md).

Linked sync jobs: the actual Rust job-list GET is connected through an ownership/generation-fenced, bounded read-only BFF. Queue controls, UI integration and live acceptance remain pending. Job listings are not operation receipts and do not unlock uncertain requests or trigger retries. [Scope](docs/linked-sync-jobs-20261011.md).

Linked CID images: referenced raster images are preloaded through the existing attachment BFF and isolated renderer; retries fetch failures only. Primary JMAP paths/settings writes remain disabled. Count/size/signature, account-switch and ten-locale synthetic regressions passed. Real-image/UI acceptance remains pending. [Scope](docs/linked-inline-images-20261011.md).

Linked folder sync: a receive-mirror single-batch POST, scoped receipts, Provider serialization and shared confirmation UI are connected. Remote mail state is not modified; confirmed success refreshes cached messages. Synthetic contracts/actual UI event handlers and ten-locale regressions passed. Real-service/UI acceptance, all-folder queues and durable uncertain-operation recovery remain pending. [Scope](docs/linked-sync-20261011.md).

Linked attachment downloads: a fixed GET BFF and row-level download icon are bound to account/folder/UIDVALIDITY/UID/index and metadata byte size. Forced octet-stream/download headers, cancellation and duplicate-click guards are preserved. Synthetic contracts and ten-locale checks passed. Real-service/file-save acceptance and inline images remain pending. [Scope](docs/linked-attachment-download-20261011.md).

Linked mail viewer: an account-specific mail icon in settings opens folder confirmation, cached message pagination and a reading modal. The existing isolated HTML renderer is reused without primary-account mutations. Ten-locale and synthetic GET/SSR/shared-renderer checks passed. Real-service/UI acceptance, sync and attachment downloads remain pending. [Scope](docs/linked-mail-viewer-20261011.md).

Linked folder client: the Provider now exposes explicit folder loading with serialized requests, account/generation-bound receipts and conservative unknown-result locks. Synthetic regressions and scoped lint passed. Folder selection/mail reading UI and real-service acceptance remain pending; safe reconciliation of an uncertain LIST needs a server operation receipt. [Details](docs/linked-folders-contract-20261011.md).

Linked-folder checkpoint: the scoped same-origin POST now follows the Rust IMAP LIST contract, validates account revision/generation before and after the operation, and preserves raw Modified UTF-7 names with separate decoded labels. Fixed 65-second transport and synthetic contract/regression checks passed. It is not an automatic cached GET; user controls/account-view integration and actual IMAP acceptance remain pending. [Contract](docs/linked-folders-contract-20261011.md).

Linked-mail read checkpoint: authenticated same-origin GET routes now validate the server's cached list/detail contracts with exact linked-account/folder/UIDVALIDITY/UID identity, bounded responses and explicit failures. Synthetic adapter/BFF tests and scoped lint passed. Folder enumeration is a stateful IMAP POST, not a pure cached GET; it is not automatically called. Actual cache data and account-switching/reading screens remain pending. [Contract](docs/linked-mail-read-contract-20261011.md).

Gmail start-button checkpoint: the account list now uses shared icon buttons, tooltips and confirmation dialogs to start server-advertised Gmail authorization over HTTPS. Validated Google/PKCE URLs only, duplicate locks and secret-free uncertain recovery are covered by synthetic Provider and ten-locale SSR tests. Confirmation discloses Google's full-mail grant; sending/mutation through linked accounts stays disabled. Actual Google authorization, linked-mail synchronization/reading and browser acceptance remain pending. [Scope](docs/gmail-linked-oauth-contract-20261011.md). This supersedes the start-button-pending notes below.

Gmail OAuth return checkpoint: the authenticated start/complete/cancel routes and Google return GET now connect to a ten-locale completion screen. Codes are removed from the address before one user-triggered submission; the original Strict session policy remains unchanged. Synthetic handlers/controls, locale checks and the desktop/mobile invalid-return screen passed. The account-list start button and actual Google authorization acceptance remain pending. [Checkpoint](docs/gmail-linked-oauth-contract-20261011.md). This supersedes the unexposed-handler notes below.

Gmail OAuth BFF checkpoint: start/completion handlers now use a short-lived AES-GCM proof bound to the original session and HTTPS origin, with a Secure/HttpOnly/Strict cookie. Synthetic proof/BFF checks passed. These handlers are not exposed as HTTP routes until the Google return screen is connected; actual authorization remains untested. [Checkpoint](docs/gmail-linked-oauth-contract-20261011.md).

Gmail OAuth contract checkpoint (2026-10-11): server-only start/completion adapters validate Google URLs, PKCE, exact HTTPS callback and account-scoped receipts against Rust source. Synthetic tests and production build passed. HTTP callback/BFF and authentication UI remain pending; no actual Google authorization was started. [Checkpoint](docs/gmail-linked-oauth-contract-20261011.md).

Naver linked authentication (2026-10-11): provider-advertised accounts can set an app password and separately verify the IMAP connection through the authenticated BFF and shared dialogs. Unknown outcomes block retransmission and retain no secret in reconciliation metadata. Synthetic contracts/controls and the existing add-account browser flow passed; actual credentials, Naver authentication and mobile acceptance were not performed. Gmail OAuth and linked-mail synchronization/reading remain pending. [Scope](docs/naver-linked-authentication-20261011.md). This supersedes the authentication-UI-pending note below for Naver only.

Linked-account contract update (2026-10-11): the account list now accepts the server's provider-specific authentication availability and connected/temporary-error cache states, while retaining the registration-only contract. Ten-locale status rendering and synthetic receipt checks passed. External authentication, synchronization and linked-mail reading UI are still pending; no real account or mail was changed. [Scope](docs/linked-account-contract-20261011.md).

Selected-rule application (2026-10-11): each rule's ▶ icon opens the shared application modal using its saved server UUID. Unsaved or inactive rules cannot apply. Synthetic contracts and button states plus browser modal rendering were checked; real plan creation and mail execution were not performed. [Scope and verification](docs/selected-rule-application-20261011.md).

Current acceptance (2026-10-10, supersedes the deployment-pending observations below): authenticated accessibility settings were read in ten locales at desktop1280px/mobile390×844px. With explicit approval, font100%→110% was saved and retained after reload, then restored to100% and retained after another reload. This proves that account's font-setting path, not every setting, first-response SSR, account isolation or failure recovery. The server chat reports API0.1.31/migration0064 deployed; direct operating DB access was not performed. [Current evidence](docs/general-settings-integration-checkpoint-20261010.md).

Draft-list context menus offer **Continue writing** only when the sender matches the signed-in account. Full-detail reads now classify the message by its current server mailbox membership, rather than hardcoding Inbox. Recipients, full text/HTML, attachments/CID and previousDraftId are preserved; unsupported HTML uses the shared confirmation. One newly authorized synthetic draft was saved as v1, resumed, resaved as v2 and resumed after reload, with one QA row and no console errors. No existing user draft was changed and nothing was sent in this verification. Actual attachment/CID and complex-HTML acceptance remain separate. [Scope and verification](docs/continue-draft-context-menu-20261010.md).

Selecting a parent personal mailbox includes its own mail and all descendant personal mailboxes in one server-side query with shared sorting, unique results and pagination. The authenticated Development8/Github8/ChatGPT0 UI comparison passed; multiple nonempty descendants and multi-page live acceptance remain unverified. Personal mailboxes may now be moved into other personal mailboxes under the latest user policy; self/descendant cycles, built-in targets and name collisions stay blocked. [Subtree evidence](docs/mailbox-subtree-view-20261010.md), [move-policy change](docs/mailbox-drag-start-20261010.md).

Saved drafts close without a confirmation when unchanged or reverted. Actual changes, uncertain submissions and failed uploads retain the shared confirmation; editor HTML sanitization remains enabled. The existing QA draft passed unchanged/changed/reverted UI checks without any save or send, alongside comparison/race checks, lint and the final production build. [Close verification](docs/saved-draft-close-20261010.md). These scoped results are not overall integration completion; see the [remaining acceptance audit](docs/INTEGRATION_COMPLETION_REVIEW_20261009.md).

General settings update (2026-10-10): account-specific UI preferences use the confirmed TASTEMAIL `GET/PATCH /api/user/general-settings` contract through a same-origin BFF. The root layout passes the authenticated snapshot and accessibility attributes into the first HTML; the Provider no longer reads or writes localStorage. Save success requires a validated server receipt. Initial settings, icons and workspace share one SSR authentication lookup per request; API routes retain independent authentication. Synthetic loopback verification covers successful snapshots in 10 locales and browser save/reload persistence with console checks. The last real-server screen check showed API-unavailable status; production API/migration64 deployment and real database persistence remain unverified. Storing preferences does not implement every notification, scheduling or undo execution feature. [Implementation and synthetic acceptance checkpoints](docs/general-settings-integration-checkpoint-20261010.md) and [real-server unavailable screen/mobile limits](docs/general-settings-browser-qa-20261010.md).

Secure development connection (2026-10-08): `npm run dev:secure` uses existing SSH keys with strict host-key verification to reach the 109 API on port 6711. It starts a loopback web server only after an unauthenticated health check succeeds. Stop your existing 7540 process in its own terminal first, or use `npm run dev:secure -- --web-port 17540`. Existing processes and `.env` files are never changed. Only the launched process receives the loopback API origin, and owned SSH/Next processes are cleaned up on exit. [Options and verification scope](docs/TASTEMAIL_SECURE_DEV_20261008.md). Remote browsers still require HTTPS; this is not authenticated acceptance evidence.

2026-10-06: The application is now TASTEMAIL-server-only. Demo mode, simulated login and sample account data have been removed. `GXWEBMAIL_DATA_MODE` no longer selects a runtime mode; configure the upstream with `TASTEMAIL_API_URL`. Calendar, contacts and shared-mailbox lists use SSR for initial HTML visits and CSR for subsequent internal navigation and interaction. Inbox display and other general preferences use the account-scoped server contract above. Older mock-mode and browser-local preference notes below describe historical behavior, not the current startup contract.

Latest acceptance update (2026-10-06): the deployed API port is now `192.168.0.109:6711` (the original 7531 reference is historical). MFA activation was observed and the user reports completing expired-code, valid-code, recovery-code and reuse-rejection checks; these are not agent-observed authentication attempts. Direct denied shared access, elapsed valid-session expiry and controlled outage/recovery remain unverified. Personal mailbox refresh now retains the list/open message and reports response-driven success/failure; a successful click was observed on local 7540. See the [current acceptance audit](docs/TASTEMAIL_ACCEPTANCE_AUDIT.md) for evidence boundaries; older dated notes below are history, not a blanket current verdict.

Live MFA enrollment is now available under Security: current-password verification, manual TOTP setup-key registration, activation and one-time recovery codes. Actual account activation and a subsequent MFA login challenge remain user-run acceptance steps. [Enrollment details](docs/TASTEMAIL_MFA_ENROLLMENT.md).

Personal-folder management is available in the expanded live sidebar, backed by the server-only `POST /api/mail/folders` BFF and TASTEMAIL's `/api/personal-folders` contract (create, rename, empty-folder deletion). Inputs cannot select another account or special-use role. Confirmed results update the sidebar, deletion requires confirmation, and uncertain writes lock further folder changes without automatic retries. Read-only refresh remains available. On 2026-10-03, the approved test account created and renamed a synthetic empty folder, then deleted that folder after explicit approval; rename and deletion persisted after reload. The management form passed 20 live checks across ten locales at 360/1280px. Live failure paths remain unverified. See [contract and verification scope](docs/TASTEMAIL_INTEGRATION_GAPS.md).

Live administration uses a persistent AdminShell with 24 destinations: overview, 19 management resources, quarantine, shared-mailbox administration, installation/updates and guided setup. Directory, outbound queue, audit, policy/relay/DKIM, API keys/webhooks, branding/themes, license, usage and backup-evidence contracts are connected through authenticated Next.js routes. When the upstream supports remote management, guarded network/node-role changes, update check/install/rollback/policy commands and job acceptance/status are available. Acceptance is not application success; operating-worker acceptance remains separate. Backup evidence registration does not execute backup/restore jobs. Migration, HR sync, AI, DLP and sandbox execution are not supported by the inspected server contracts. See [administrator implementation and verification boundaries](docs/TASTEMAIL_ADMIN_IMPLEMENTATION.md) and [source parity and scoped verification](docs/admin-source-parity-20261010.md).

Implementation coverage is not complete runtime acceptance: administrator reads, selected multilingual/mobile views and read-only shared-mailbox UI have live evidence, but deployed privileged mutations, MFA and direct denied shared access/write requests remain unverified. There is no separate mock administration runtime. Latest receipt handling requires an explicit identity-change session-revocation flag; conflicts remain visible during reload and stale mutations are never automatically replayed.

Shared forwarding now preserves HTML and attachment metadata through the existing shared compose flow. One synthetic self-addressed HTML/attachment forward was received and its downloaded attachment matched the original size/hash. Shared CID preservation has synthetic checks; complex newsletter forwarding and denied-rights failures are not yet live-verified.

Current requirement-by-requirement status: [TASTEMAIL acceptance audit](docs/TASTEMAIL_ACCEPTANCE_AUDIT.md). Personal/shared self-delivery and recoverable shared changes have evidence; actual MFA, valid-session expiry, denied/read-only rights, outage recovery and complete interaction regression remain unverified. Older broad limitations below are historical, not the current verdict.

Latest shared cancellation evidence: one synthetic self-recipient reservation was canceled before its due time; queue removal survived reload and its Inbox subject search was empty. This supersedes older shared-cancellation limitations below, but does not prove post-due non-delivery. Shared-list mode/auth/rights/error boundaries also have source-level synthetic checks; actual denied-account permissions, MFA, valid-session expiry and outage recovery remain unverified.

Pending live scheduled-send lists refresh automatically while the tab is visible, without interrupting active reads or cancellations. Queue removal is confirmed by the server; reaching the scheduled time alone is not treated as proof of delivery. One scheduled self-send from the approved shared test account was absent before its due time, appeared once in Inbox and Sent afterward, and survived reload. Personal due-time delivery, shared cancellation and failure paths remain unverified. This latest evidence supersedes older blanket delayed-delivery limitations below.

Live shared mailboxes support search within the selected folder, including existing search operators such as `subject:`. Requests stay scoped to the shared account and its read permission. The global search page remains personal-account only. Shared subject search, invalid syntax, empty results and clearing the search were verified on the test account; cross-folder shared search and URL-persisted shared filters are not provided.

Personal HTML forwards initialize the sanitized rich editor with the original markup and CID attachment metadata. A synthetic CID forward was saved, reopened, sent only to the same test account, and received with its decoded image intact. Complex newsletter CSS, external images, and shared-account forwards remain unverified.

**Language:** English · [한국어](README.ko.md)

Latest verification scope and remaining completion gates: [TASTEMAIL integration checkpoint](docs/TASTEMAIL_INTEGRATION_CHECKPOINT.md). On October 1, 2026, a separate test account verified personal read/star changes, recoverable folder moves with immediate usage updates, self-received HTML/CID mail, CID draft save/re-edit/replacement without duplicates, and scheduled submission cancellation. Synthetic personal contacts and an attendee-free calendar event survived create/edit/reload. Actual delayed delivery, MFA/session expiry, shared-account mutations and fault recovery remain unverified; these checks do not establish production readiness.

GXWebMail is a multilingual enterprise webmail client built with Next.js App Router and connected to TASTEMAIL through server-only API adapters. Runtime is live-only; features without a confirmed server contract are not presented as simulated server results.

The repository is intended for interface prototyping, design review, frontend demonstrations, and as a starting point for integration with a real mail platform. It is not a mail server and does not include a commercial or billing implementation.

## Highlights

- Responsive enterprise mail shell with desktop and mobile navigation
- Inbox, reading pane, compose flow, shared mailboxes, search, rules, and quarantine
- Calendar, contacts, organization chart, files, approvals, notifications, and accessibility screens
- Complete user settings workspace with editable mail, appearance, accessibility, account, security, integration, and shortcut preferences
- Administrator console with 13 management areas
- Tenant onboarding and system mail, print, and error-page previews
- Live theme customization with color, typography, density, radius, layout, and light/dark options
- Ten locale-prefixed variants generated from the same application
- Reusable overlays, toasts, form controls, and responsive UI primitives

## Project scope

Live scheduled sends have a server-backed pending list and cancellation action for personal and authorized shared accounts. Synthetic JMAP tests cover both, and personal test-account scheduling and cancellation were verified. Timed delivery and shared-account scheduling changes remain unverified.

In live mode, `/setup` offers first-install setup only when this Next.js process has the TASTEMAIL package's `TASTEMAIL_INITIAL_SETUP_CONFIG`, `TASTEMAIL_INITIAL_SETUP_REQUEST`, `TASTEMAIL_INITIAL_SETUP_STATUS`, and `TASTEMAIL_INITIAL_SETUP_TOKEN` paths. A one-time token authorizes an atomic `TASTEMAIL_INITIAL_SETUP_V6` request for the package installer; the UI reads its status file. The regular Rust API on port 6711 cannot perform first installation by itself. Without the package environment, the page reports that first installation is unavailable and offers a separate local development API-connection form. The package-install path has not been exercised against an installed package.

For the TASTEMAIL live-integration contract, deployment verification status, and features without a confirmed server API, see [TASTEMAIL integration gaps](docs/TASTEMAIL_INTEGRATION_GAPS.md). Connected source paths do not by themselves prove complete deployed runtime acceptance.

The server-only integration boundary is under `lib/tastemail/`. Runtime is live-only; `GXWEBMAIL_DATA_MODE` is ignored. The Next.js server uses `http://127.0.0.1:6711` by default. `TASTEMAIL_API_URL` can override that server-only address and is never a `NEXT_PUBLIC_` setting. API requests accept HTTPS or loopback HTTP only. A private LAN address does not make HTTP safe: direct LAN HTTP is rejected before sending passwords, bearer tokens or any upstream request. Loopback requires GXWebMail and Rust on the same host or a verified local SSH tunnel; remote browsers also need HTTPS ingress to Next.js. Login uses a same-origin session route without making `/health` a prerequisite; health alone does not prove account validity. The Rust API provides `POST` and `DELETE /api/auth/session`, but not `GET` on that path; GXWebMail checks an existing session with authenticated `GET /.well-known/jmap`. Tokens remain in HttpOnly cookies and server code.

Live mode connects login/MFA, session checks and logout; JMAP mailbox pages, search, message bodies and attachment downloads; personal contacts, calendar events, approvals, user mail rules, and administrator-only quarantine operations through same-origin routes. Personal mail supports read/star changes, system-folder moves, plain-text and formatted HTML compose, draft save/re-edit, uploads, queued submission, and confirmed permanent deletion from Trash. Shared accounts with read rights can browse their server folders, paginated mail, sanitized bodies, and attachments. Shared read/star changes, moves among permitted shared folders, and confirmed permanent deletion from Trash require `mayWrite`; shared compose, draft re-editing, and submission additionally require `mayRead` and `maySend`. Shared moves allow Inbox, Archive, Junk, Trash, and custom destinations returned by the same account, but not Drafts or Sent destinations. Re-editing a shared draft creates a replacement and only then removes the previous draft; submission likewise preserves the previous draft until accepted. Synthetic JMAP contracts passed; on 2026-10-01 a real shared test account verified draft save/re-edit/replacement without duplicates, self-send to the same shared address, matching Sent/Inbox bodies, and star/unstar persistence after reload. Shared Archive/Junk moves and recoverable Trash deletion/restoration were verified with the synthetic received copy, including reload and unchanged body. A 120-byte shared attachment self-send, download SHA-256 and Sent/Inbox persistence after reload were also verified. Permanent deletion, large/multiple attachments, scheduling and forbidden-rights combinations remain unverified. HTML draft re-editing keeps matching CID attachment references and loads bounded previews through the authenticated attachment route; a separate personal test account verified HTML/CID self-delivery and CID draft save/re-edit/replacement. Live rich composition uploads bounded raster images and serializes their previews as CID references; plain composition still attaches images as ordinary files. Administrator creation and user/group rights management are connected under `/admin/shared-mailboxes`; deployed privilege changes remain unverified. Scheduled sends use the advertised JMAP maxDelayedSend limit and a UTC HOLDUNTIL envelope parameter; synthetic contract tests and personal test-account scheduling/cancellation pass; actual delayed delivery and shared-account scheduling remain unverified.

Live requests never silently fall back to mock data. HTML bodies use sandboxed iframes sized to their content so the reading pane has one scroll area. New profiles display HTTPS external images by default; previously saved `contacts` or `never` preferences remain in force, with per-message and persistent display actions for blocked images. Loading external images may notify the sender that the message was opened. Bounded CID inline images use the authorized attachment proxy. One received HTML message displayed its external images and single reading-pane scrollbar in the local browser; other senders and browsers remain unverified. Mock people/files in search, mock organization contacts, calendar AI/room suggestions, and mock shared scheduled-send/templates are hidden in live mode; live shared compose offers server-backed scheduling when the account advertises support. Two earlier self-sends on a separate test account—one with a 117-byte attachment—appeared in Sent and Inbox after reload; the received attachment matched the source SHA-256. Real-account login, inbox listing and pagination, basic search, selected read/star and Inbox/Archive/Spam moves, and draft save/re-edit were also checked. Shared draft replacement, self-send and star restoration were verified on a separate shared test account. Shared Archive/Junk/Trash round trips and Inbox restoration were also checked on the synthetic received copy. A 120-byte shared attachment upload, self-delivery and matching download SHA-256 were verified. Shared permanent deletion/large-attachment/rights-denial paths, personal permanent deletion, external-recipient delivery, send-failure paths, MFA, session expiry, and broad rollout remain unverified. Do not enable live mode for users yet.

Personal and shared mail pages and search results request list-only fields and fetch one full message when selected if its body is absent. Shared detail access rechecks account read rights on the server. Older Rust servers still return full bodies for these requests, which remains supported and displays immediately. The local TASTEMAIL source now contains an in-progress `Email/get` property and body-value projection; it is not yet verified as deployed, and list/search latency remains unmeasured.

The personal Sent-to-Trash JMAP patch and the server-only API-origin guard have focused synthetic tests; neither proves a live Sent deletion. If a mail move or permanent-delete response has an uncertain outcome, GXWebMail prevents further changes to that message in the current page and asks the user to inspect the mailbox before retrying. This client-side lock does not provide server-side idempotency. A separate test account is still needed to verify the actual server result.

The local development `/setup` API-connection form checks the Rust `/health` endpoint, then saves only `TASTEMAIL_API_URL` to `.env.development.local`. Use HTTPS for an API on another machine, or a local tunnel so the Windows Next.js host can use loopback HTTP. Private-network HTTP is not accepted for authentication. A successful health check is not a successful login.

Saving this connection also requires `GXWEBMAIL_CONNECTION_SETUP_TOKEN` from the development server's `.env.development.local`. The connection form appears on the setup-service-unavailable screen. After saving, navigation to login uses a full page load to pick up the server connection. The token is not delivered to the browser automatically. Do not expose the development setup endpoint to other machines.

If the Rust API listens on the mail host's loopback and SSH login is available, verify the SSH host key and open a separate terminal on the Windows Next.js host: `ssh -N -L 127.0.0.1:6711:127.0.0.1:6711 <SSH_USER>@192.168.0.109`. Keep `TASTEMAIL_API_URL=http://127.0.0.1:6711`. The earlier tunnel/login verification used the previous port 7531; it does not verify this 6711 example. The operator-selected LAN API at `192.168.0.109:6711` returned unauthenticated `/health` HTTP 200 on 2026-10-06.

Current live-calendar scope additionally allows creating an event with attendee email addresses and cancelling an organizer event with attendees. Invitations or cancellation notices may be sent by TASTEMAIL, so the UI warns before these actions. For invited events, the server-side adapter re-reads the current revision and attendee list, preserves all attendees in the update, and warns that updated invitations may be sent. Editing the attendee list itself remains unavailable. System-mailbox moves preserve other custom mailbox memberships. The live sidebar lists personal custom mailboxes returned by `Mailbox/get`, can read their messages, and includes them in the search-folder filter; custom-mailbox creation, rename, and deletion lack a current Rust HTTP/JMAP contract. Moving between system and custom mailboxes, or between two custom mailboxes, is wired but not live-verified; a move from a custom mailbox removes only the selected source membership. In live mode, settings without a server contract show an unavailable notice instead of sample state or controls. Language, theme, and accessibility remain browser-local; keyboard shortcuts are not implemented in live mode. Real-account calendar GET and sidebar mailbox summary succeeded; calendar invitation/cancellation and custom-mailbox mutation results remain unverified.

The live workspace sidebar loads mailbox counts and quota metadata through a separate authenticated summary route on non-mail pages; it does not fetch message bodies just to populate navigation. Summary failures show an error and retry control instead of mock counts. The test-domain calendar page retained real mailbox counts and quota metadata; error recovery remains unverified.

Live compose now offers recipient suggestions from TASTEMAIL's account-scoped `/api/contacts/suggestions` through an authenticated same-origin route. The browser never receives the API token. A deployed test account showed one suggestion and accepted its email address with Enter; touch selection and multiple-suggestion navigation remain unverified.

The workspace quarantine screen connects administrator-only release-to-inbox and permanent discard actions. The administrator console additionally provides confirmed current-page bulk processing. An interrupted or unparseable mutation response is shown as uncertain rather than success. These administrator actions have not been exercised against a deployed account.

Live attachment links stream authorized JMAP downloads through `/api/mail/attachments`; filenames and attachment bytes never pass through the browser's API-token storage. One existing sent-message attachment was downloaded through the local Next.js route with a real account; its 51,712-byte response matched the reported attachment size. The `/files` screen also downloaded a harmless test fixture in a browser; its 117-byte copy matched the uploaded source's SHA-256.

In live mode, `/files` lists real mail attachments through JMAP attachment search and the authorized download proxy; it does not show demo storage totals, large-file links, or cleanup actions. `/security` reads the server's TOTP status, remaining recovery-code count, sessions, and security events. After confirmation, it can revoke one other-device session or all other-device sessions through the server; the current session is excluded. Other security mutations remain unconnected. Real-account attachment search and security GET requests returned HTTP 200; file listing/filtering and the TOTP/session/security-event panels were displayed. An in-browser download of the harmless test attachment matched the source size and SHA-256; session revocation remains unverified.

Live mode does not present demo sign-up or setup-wizard links from the login screen. Direct entry to `/signup` shows an account-provisioning notice and sign-in link instead of a simulated registration.
In live mode, `/setup` uses the package's initial-setup contract when installed on the same host and otherwise shows a setup-service-unavailable notice.

Live workspace, settings, and administrator pages require a valid TASTEMAIL session before server rendering. Client navigation rechecks the session; API routes independently enforce authentication and authorization. Login, signup, and initial setup remain public routes.
The admin routes use a real server-authorized console in live mode, covering operational status, directory administration, shared mailbox creation and user/group delegation, queue/audit, spam/relay/DKIM, API keys/webhooks, backup evidence, branding, server themes/packages, existing licenses and usage reports. `/admin/onboarding` is the server-backed domain, DKIM/DNS, account and operational-readiness flow; `/admin/system` exposes remote installation/update management. Mutation requests independently require upstream administrator authorization, confirmation and same-origin checks. There is no mock administration runtime or silent mock fallback. Shared rights management is provided by `/admin/shared-mailboxes`, not the workspace mailbox browser. See [administrator integration scope](docs/TASTEMAIL_ADMIN_IMPLEMENTATION.md) for supported actions, remaining integration and live-verification limits.

Live `/settings/signature` reads and saves the server's per-sender plain-text and HTML signatures. New personal messages use the selected sender's text signature and, when configured, its HTML signature in the rich editor after compose options load. Existing drafts, body text, and content entered before loading are not overwritten. Shared mailboxes continue to use their server-provided text signature. The compose-options contract passed synthetic JMAP verification, but signature insertion and sending have not been verified with a deployed account.

GXWebMail is a live-only TASTEMAIL client with incomplete production acceptance.

- A TASTEMAIL backend and a verified secure transport path are required. No mock runtime, fake login or bundled-mail fallback is available.
- Authentication uses an HttpOnly session cookie and server-only API requests. Account settings use their documented server contracts; the free-form customizer remains browser-local.
- Mail and administrator mutations can have real effects. Confirmed implementation is not proof of production acceptance; unsupported operations must not be presented as simulated successes.
- See the [current requirement-by-requirement acceptance check](docs/live-integration-acceptance-20261011.md). Historical demo descriptions elsewhere in this document are not startup instructions.

## Supported languages

The default locale is Korean. All application routes use a locale prefix.

| Locale | Language | Example |
| --- | --- | --- |
| `ko` | 한국어 | `/ko` |
| `en` | English | `/en` |
| `de` | Deutsch | `/de` |
| `es` | Español | `/es` |
| `fr` | Français | `/fr` |
| `it` | Italiano | `/it` |
| `pt` | Português | `/pt` |
| `ja` | 日本語 | `/ja` |
| `zh` | 简体中文 | `/zh` |
| `zh-hant` | 繁體中文 | `/zh-hant` |

Requests without a locale prefix are handled by `next-intl` middleware and resolved to the default locale.

### Internationalization architecture

`messages/{locale}.json` is the semantic `next-intl` catalog for interface labels, actions, statuses, and feedback across the workspace, settings, and administrator screens. Components render those messages directly on the server and client; there is no post-render text replacement. `npm run check:locales` checks key and ICU-placeholder parity across all ten catalogs.

Account names, authored messages and filenames are server content, not translated interface labels. Synthetic fixtures are restricted to verification scripts, not runtime data.

## Main routes

Replace `{locale}` with one of the supported locale codes.

| Route | Experience |
| --- | --- |
| `/{locale}` | Main mail workspace |
| `/{locale}/login` | TASTEMAIL authentication |
| `/{locale}/signup` | Administrator account-provisioning notice |
| `/{locale}/mailboxes` | Shared mailboxes |
| `/{locale}/search` | Advanced mail search |
| `/{locale}/rules` | Compatibility redirect to `/settings/rules` |
| `/{locale}/quarantine` | Quarantine review |
| `/{locale}/calendar` | Calendar views |
| `/{locale}/contacts` | Contacts and organization chart |
| `/{locale}/files` | Server-backed mail-attachment browser |
| `/{locale}/approvals` | Server-backed approval workflow; operating acceptance is separate |
| `/{locale}/security` | Server-backed personal security and other-device sign-out |
| `/{locale}/settings` | User settings |
| `/{locale}/accessibility` | Accessibility options |
| `/{locale}/shortcuts` | Keyboard shortcuts |
| `/{locale}/admin` | Administrator console |
| `/{locale}/admin/onboarding` | Server-backed domain, DKIM/DNS, account and readiness flow |
| `/{locale}/admin/system` | Remote network, node-role and update management; server configuration required |
| `/{locale}/setup` | Initial setup flow |

### User settings workspace

`/{locale}/settings` is the grouped entry point for the user-facing settings system. On desktop, the same groups appear in a persistent settings navigation pane; on mobile, the entry page shows touch-friendly grouped lists and each detail route provides a back action. The settings routes are:

| Group | Routes |
| --- | --- |
| General | `/settings/locale`, `/settings/theme`, `/settings/accessibility` |
| Mail | `/settings/signature`, `/settings/inbox-display`, `/settings/sending`, `/settings/away`, `/settings/notifications` |
| Mail management | `/settings/labels`, `/settings/rules`, `/settings/blocked-senders` |
| Account | `/settings/account`, `/settings/security`, `/settings/integrations`, `/settings/shortcuts` |

Settings expose only server-connected operations or explicitly identify unsupported features; no demonstration fallback is available. Shared settings patterns provide save, discard, default reset, validation, confirmation dialogs, and toast feedback. Destructive operations such as label/filter removal, sender unblocking, session revocation, backup-code regeneration, and integration disconnection require confirmation where appropriate.

General settings distinguish server-provided defaults, the last confirmed account snapshot, and the current draft. The server snapshot is supplied before hydration; a failed GET does not unlock editing or become a successful default/localStorage fallback. Save uses an expected revision and only adopts the validated receipt; uncertain writes are recovered through GET, not automatic resubmission. Cancel restores the confirmed snapshot and reset prepares defaults as a new draft. Legacy localStorage values are neither deleted nor automatically migrated. Same-origin navigation and browser unload are guarded while settings or theme changes remain unsaved.

Locale, theme, and workspace-sidebar preferences retain their specialized behavior:

- Locale changes continue through `next-intl`, retain the current path, query, and hash, and save the draft before replacing the locale-prefixed URL.
- `/settings/theme` reads and saves the account's theme ID/version, density, and color mode through TASTEMAIL, or restores the inherited system/domain theme. Installed choices come from the authenticated catalog; unsupported combinations are rejected. Revision conflicts and uncertain write results require reloading before another save. Free-form customizer values remain browser-local and are not saved to TASTEMAIL.
- The initial collapsed sidebar state remains server-rendered from the `workspace_sidebar_collapsed` cookie so a refresh does not briefly show the expanded sidebar.
- The inherited `(workspace)/layout.tsx` mounts the shared workspace shell once. Route changes keep the sidebar, top bar, and compose UI mounted; each page's `WorkspaceLayout` supplies only content and header configuration. Re-selecting the active mailbox no longer clears its selection unnecessarily.

The user accessibility route controls font scale, contrast, motion, focus and assistive-technology attributes. It is separate from the top-level accessibility reference. Shortcut preferences use the general account settings contract; unsupported execution is distinguished. `/rules` and legacy `/settings/filters` redirect to the canonical `/settings/rules` editor.

General preferences use account-scoped server snapshots and revision-matched receipts; mail rules, managed out-of-office replies, per-sender signatures, and account theme preferences use TASTEMAIL. Account identities are read-only; the security page reads server status and can sign out other-device sessions. Unsupported settings display an explicit unconnected notice instead of mock controls. Implementation and live verification are tracked separately in the [acceptance audit](docs/TASTEMAIL_ACCEPTANCE_AUDIT.md).

## Technology stack

- [Next.js 16](https://nextjs.org) with App Router and static locale generation
- [React 19](https://react.dev) and TypeScript
- [next-intl](https://next-intl.dev) for locale routing and message delivery
- [Tailwind CSS v4](https://tailwindcss.com) for styling
- [Lucide React](https://lucide.dev) for icons
- ESLint with the Next.js configuration

## Getting started

### Requirements

- Node.js 20 or newer
- npm

### Development

```bash
git clone https://github.com/whitecalvin/gxsoft-webmail-template.git
cd gxsoft-webmail-template
npm install
npm run dev
```

Open [http://localhost:7540](http://localhost:7540). The locale middleware redirects the request to the Korean default route. You can open another language directly, for example [http://localhost:7540/en](http://localhost:7540/en) or [http://localhost:7540/ja](http://localhost:7540/ja).

Only mock-mode login accepts any non-empty email and password. Live mode authenticates against TASTEMAIL.

### Production build

```bash
npm run build
npm run start
```

The build includes every application screen for all ten supported locales; request-dependent pages are server-rendered.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create an optimized production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint across the project |
| `npm run check:locales` | Validate semantic locale key and ICU-placeholder parity |
| `npm run check:locale-usages` | Check literal next-intl calls against all locale catalogs; dynamic keys require separate verification |

Run the following checks before committing UI or translation changes:

```bash
npm run check:locales
npm run lint
npm run build
```

## Project structure

```text
app/
  [locale]/                 Locale-prefixed App Router pages
    admin/                  Admin console, onboarding, and system pages
components/
  admin/                    Administrator navigation, tabs, and mobile UI
  banner/                   Global and inline callouts
  calendar/                 Day, week, month, and mobile calendar views
  compose/                  Compose modal and rich/plain editor
  contacts/                 Contacts and organization views
  customizer/               Live theme editor
  layout/                   Application shell, rails, top bar, and sidebars
  mail/                     Mail list, reading pane, and invitation cards
  notifications/            Notification popover
  overlay/                  Shared modal, drawer, sheet, and confirmation patterns
  settings/                 Grouped, editable desktop and mobile user settings
  toast/                    Toast feedback stack
  tour/                     First-run product tour
  ui/                       Shared Checkbox, Dropdown, and Switch controls
context/                    Mail, settings, sidebar, theme, and toast state providers
i18n/                       Locale routing and request configuration
lib/                        Mock feature data and utilities
messages/                   Named next-intl messages for each locale
scripts/                    Locale validation script
types/                      Shared TypeScript feature types
proxy.ts                    Locale middleware configuration
```

## Adding or updating translations

1. Add every stable interface message to the same namespace in all `messages/*.json` files.
2. Keep ICU variables and placeholders identical across locales.
3. Use `useTranslations("namespace")` for static interface copy.
4. Represent translatable mock-data labels and statuses with stable IDs and translate them when rendering; preserve authored names, messages, and file names as content.
5. Keep `i18n/routing.ts` and all semantic catalogs aligned when adding a locale.
6. Run `npm run check:locales` before linting and building.

Do not place runtime user-generated text into the static message catalog.

## Design-system conventions

- Forms and interactions reuse the themed controls in `components/ui/`, including buttons, inputs, textareas, switches, checkboxes, radio groups, dropdowns, segmented controls, avatars, progress indicators, tabs, panels, modals, popovers, toasts, badges, empty states, skeletons, spinners, and tooltips.
- Interactive buttons and `[role="button"]` elements receive pointer cursor behavior globally from `app/globals.css`.
- The customizer previews and publishes browser-local theme values. The live account-theme settings use server persistence and SSR; installed packages are versioned and their CSS/assets are served through the same-origin BFF. Do not treat local publication as an account-theme save.
- Shared overlays and toast feedback should be reused so prototype interactions remain visually and behaviorally consistent.
- New screens should support narrow/mobile layouts and all configured locales from the start.

## Known limitations

- Mock mode has no server integration. Live mode has partial TASTEMAIL JMAP, calendar, contact, and mail-attachment integration, but no independent file service or Exchange integration.
- Mock mode has no database or multi-user synchronization; live-mode durability depends on TASTEMAIL. Selected real-account read and session flows, mail mutations, one draft round trip, and two self-deliveries have been verified. External delivery and wider mutation cases have not been verified.
- Browser-local customizer and interface preferences are not synchronized across devices or users. Live account-theme preferences use the server, but real installed-package switching/rendering remains unverified and parent-version inheritance needs a server contract. Live mail rules and signatures also use the server. The out-of-office screen edits a managed server vacation rule (subject, one reply body, enabled state) and can initialize an empty account; scheduling, separate internal/external replies, and contacts-only replies are not supported. Most other account settings are not connected.
- Live authentication and authorization boundaries are implemented but have not been qualified as production security or audit guarantees.
- No real backup, restore, migration, billing, or API-key operation. Two approved self-sends were verified: one without an attachment and one from an existing draft with a 117-byte attachment. The latter appeared in both Sent and Inbox, and the received attachment's SHA-256 matched the original. External-domain delivery and failure-path outcomes remain unverified.
- No email HTML delivery compatibility or cross-client rendering certification
- Machine-assisted translations and mock content require professional language review before production use
- The compatibility translation layer is transitional; remaining detailed screens should gradually move to named message keys

## Extending the template

When adding a feature, check the existing shared components and mock-data patterns first. Keep service integration behind a separate data or API layer so the UI can continue to run in prototype mode. For production adoption, replace the mock state, authentication, and administrative operations with validated backend contracts and add the security, accessibility, integration, and end-to-end tests required by your environment.

See `AGENTS.md` for repository-specific Next.js agent guidance.
