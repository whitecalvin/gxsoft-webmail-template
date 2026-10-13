# Isolated HTML mail link navigation — 2026-10-06

`LiveHtmlMessageBody` installs a parent-owned click delegate on the loaded mail
document. Native user clicks and middle-clicks on `a[href]` or `area[href]` are
checked before opening a new browsing context with `noopener,noreferrer`.

Allowed absolute URL schemes are HTTP, HTTPS and mailto. Credentials in URLs,
relative URLs, executable/data/file schemes and control characters are rejected.
Mailto URLs containing encoded CR/LF are rejected. Fragment links scroll within the
document. Synthetic clicks do not open links, and listeners are removed on cleanup.

The iframe remains `sandbox="allow-same-origin"`, with no script, form, popup or
parent-navigation sandbox permission. Existing CSP and image privacy policy remain
unchanged. The Next.js skill's client-boundary guidance was applied: event handling
stays inside the existing client-rendered mail body, without server browser APIs.

Local checks passed: link URL/event behavior, four frame-policy checks, frame-resize
behavior, scoped ESLint and the isolated production build (exit 0, including
compilation/type checking and generation of 378 pages).

This prepares the frontend to use safe server-preserved image-map links. It cannot
reconstruct a missing CTA URL. TASTEMAIL server image-map preservation was completed
in the `tastedev-mail` chat at the user's request. The received-message sanitizer now
preserves safe `map[name]`, `img[usemap]` and `area` coordinates/absolute HTTP(S)
links; the compose sanitizer still removes image maps.

Server evidence: 53 unique Debug and 53 unique Release unit tests, scoped Clippy
and the message-crate Release build passed. The current `lib.rs`,
`received_image_maps.rs` and Release rlib hashes match the server's recorded
evidence. This is library verification, not a rebuilt/deployed API executable.
The server's synthetic Chrome checks confirmed rect/circle/poly pointer targeting
and parent delegation at body scale 1 and 0.5 (six checks). The frontend already
delegates `area[href]`; its whole-body transform keeps original coordinates, so
no additional coordinate scaling is applied.

Server report: `D:/works/projects/GXSOFT/TASTEDEV/resources/verification/dev-01/tasks/tastemail/received-image-maps-20261006/RESULT.md`.
Deployment/restart is not authorized. Current real newsletter CTA navigation and
server-delivered maps remain unverified until corrected HTML is available. The
original advertisement MIME was not inspected, so image-map removal is a confirmed
sanitizer defect, not yet a confirmed diagnosis of that particular advertisement.
No real newsletter/footer link was followed as part of these tests.
