# Server contract required for non-flashing account icons

Status: request specification only. No new endpoint is assumed to exist; no Rust, database or production change performed.

## Current source evidence (2026-10-08)

TASTEMAIL `crates/tastemail-api/src/lib.rs`:

- `UserPreferencesResponse` (line 471): signature text/HTML/format, onboarding completed/revision and identities only.
- `UpdateUserPreferencesRequest` (line 532): identity ID and signature fields only.
- `user_preferences_get` / `user_preferences_update` (lines 2199 / 2224): reads preferences and updates identity signature; no appearance-icon read/write path.

`crates/tastemail-store/src/lib.rs` `UserPreferences` (line 1431) likewise has no icon preferences.

GXWebMail's existing `/api/mail/preferences` BFF validates exactly four signature fields. Sending icon fields there would be invalid; never overload the signature to store icons.

## Why preloading alone does not complete first-paint acceptance

The common glyph now renders stored SVGs in initial HTML, but its selection still comes from a 3,000-character browser cookie mirrored from localStorage. Missing or evicted entries cannot distinguish default from an existing custom icon. Returning a default would show the wrong icon; returning `pending` still shows the icon later than the text.

Acceptance is simultaneous final icon + text, as with the sidebar logout button, not a hidden placeholder or suppression of hydration warnings.

## Required server capability (proposal; agree before implementation)

- Authenticated, account-scoped appearance preference read/update/reset, with an explicit revision for concurrent updates.
- Targets: own profile, system mailbox ID/role, personal mailbox ID, accessible shared-account ID. A display-icon preference never modifies identity, mailbox membership, mail content or shared permissions.
- Values: default, installed-package icon identifier or validated emoji identifier. Never raw SVG/HTML, external image URL, filesystem path or arbitrary module import.
- Partial changes preserve other targets; reset is scoped to the authenticated owner and named target/group. Reject stale revision without silently overwriting another device's change.
- Bound target count, identifier length and payload bytes. Authenticate owner from session, not from an untrusted request email address. Validate referenced resources/permissions where applicable.
- Return authoritative defaults/absence, updated values and revision so SSR can render the final icon synchronously, including default icons with no custom preference.
- Existing browser-only preferences need a bounded, explicit migration policy. Do not upload or apply them silently across a different account. Server-saved values take precedence after migration.
- Standard error contract: unauthorized, forbidden, invalid request, conflict, rate limit and retryable server failure. No quiet local-only success when persistence fails.

## Frontend follow-up once actual server contract is confirmed

1. Extend the existing server-only adapter/BFF using confirmed paths and schemas, retaining HttpOnly authentication and same-origin writes.
2. Read authoritative icon preferences during initial authenticated HTML rendering; use current package-derived selected-only SVG payload.
3. Update/reset through the BFF, preserve the previous visible icon until success and retain CSR state on later navigation. Do not restore `pending` for authoritative default values.
4. Verify reload and cross-device/account isolation, revision conflict, failure rollback, all three icon surfaces, both SVG packages and emoji, ten locales and mobile/desktop first paint.

Sending this request to another Codex chat requires explicit human authorization. Deployment and database changes are separate approval gates.
