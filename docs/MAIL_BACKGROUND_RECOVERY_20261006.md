# Background mailbox refresh recovery — 2026-10-06

The runtime remains live-only. This change does not alter credentials, upstream
configuration, server timeout, mutation behavior or HTML isolation permissions.

- A confirmed mailbox summary is retained after a transient background read failure.
- The first two consecutive background `retryable` failures do not change the summary
  status to an error; retries are scheduled after 5 seconds and 15 seconds.
- The third failure is exposed through the existing error toast. Further retries use
  the normal 60-second interval, without an unbounded fast retry loop.
- A successful summary or message-page response resets the recovery state.
- Initial reads, explicit refreshes, 401, 403, 429 and non-transient failures are
  reported immediately. Authentication/permission failures still clear account data.
- There is no mock fallback and no mutation retry introduced by this change.

Local verification: `test-mailbox-refresh-recovery.mjs`,
`test-workspace-navigation-ssr.mjs` and scoped ESLint passed. The isolated production
build (`GXWEBMAIL_BUILD_DIR=.next-live-only-check`) also passed after the runtime
change. Controlled real-server
outage/recovery has not been performed; the server was not stopped or reconfigured.

The recovery test also executes the actual mailbox-summary effect extracted from
`context/mail-context.tsx`, with synthetic responses and a simulated clock. It
confirms timer delays of 5/15/60 seconds, unchanged confirmed data during transient
failures, recovery resetting the counter, immediate initial/manual/401/403/429/502
errors, account-data clearing on 401/403, and cancellation on route cleanup not
producing an error. The existing manual-refresh receipt/feedback test also passed.
This is local behavioral evidence, not proof of the cause of the user's intermittent
production connection failure. Only test/documentation inputs changed during this
follow-up; application compilation was not repeated.

Separate reported newsletter CTA: the current delivered HTML has one advertisement
image and seven footer links, but no CTA link or image-map association. The Rust
received-HTML sanitizer in `crates/tastemail-message/src/lib.rs` explicitly removes
`map` and `area`. This is consistent with an image-map CTA being lost upstream,
but the original unsanitized message has not been inspected. The frontend cannot
recover a destination which is absent from its payload. No URL was guessed, no
subscription/footer links were clicked, and no sandbox permissions were weakened.
