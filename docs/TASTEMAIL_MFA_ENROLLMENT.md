# MFA enrollment

Implemented on 2026-10-03 in live mode at /[locale]/security and /[locale]/settings/security.

- GXWebMail POST /api/mail/security/mfa forwards to the authenticated TASTEMAIL POST /api/user/security/mfa/totp/enrollments and /activate contracts.
- Begin requires the current password. Activation requires the enrollment UUID and a six-digit TOTP. The server enrollment expires after ten minutes.
- Add the setup key manually in an authenticator app using the current email address and time-based TOTP. No external QR service receives the secret; QR rendering is not included.
- Activation revokes other device sessions, retains the current session, and returns one-time recovery codes. Store these securely before dismissing the screen.
- Passwords, enrollment secrets, and recovery codes stay in transient form memory; they are not persisted to browser storage or logs. API responses are private/no-store. Unmounting or closing discards form secrets.
- Same-origin and authenticated HttpOnly-session checks protect the BFF. Unknown request fields are rejected. The browser never receives the session bearer token.
- Invalid TOTP and incorrect current password are not reported as session expiry. Actual 401 session failure, 403 denial, 429 throttling and upstream failures remain distinct.
- A lost activation acknowledgement blocks resubmission. Review server MFA status; do not assume failed transport means activation failed. Recovery-code regeneration and MFA disable are not included in this enrollment work.
- Background security refresh preserves the mounted recovery-code view. No automatic account enrollment or activation is performed by the agent.

Verification: synthetic contract/BFF/UI checks cover receipt validation, strict inputs, CSRF, mode/session boundaries, error classification, and no automatic retry. Actual password entry, activation, recovery-code storage, and a subsequent MFA login challenge must be performed by the user; these are not claimed as verified by implementation checks.

Follow-up execution checks run the actual submit function with synthetic responses. Eleven combined checks pass, including duplicate submissions while pending, password/code clearing, validated recovery-code retention, distinct failures, expired/enabled guards, unmounted response discard, and a synchronous uncertainty latch that blocks a stale callback before React commits state. These are not browser-rendering or real-account activation evidence.
