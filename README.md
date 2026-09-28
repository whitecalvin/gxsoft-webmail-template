# GXWebMail

**Language:** English · [한국어](README.ko.md)

GXWebMail is a high-fidelity, multilingual enterprise webmail UI template built with Next.js App Router. It demonstrates mail, collaboration, personal settings, administration, onboarding, and system-message experiences with realistic mock data and fully connected client-side interactions.

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

In live mode, `/setup` offers first-install setup only when this Next.js process has the TASTEMAIL package's `TASTEMAIL_INITIAL_SETUP_CONFIG`, `TASTEMAIL_INITIAL_SETUP_REQUEST`, `TASTEMAIL_INITIAL_SETUP_STATUS`, and `TASTEMAIL_INITIAL_SETUP_TOKEN` paths. A one-time token authorizes an atomic `TASTEMAIL_INITIAL_SETUP_V6` request for the package installer; the UI reads its status file. The regular Rust API on port 7531 cannot perform first installation by itself. Without the package environment, the page reports that setup is unavailable. This path has not been exercised against an installed package.

For the TASTEMAIL live-integration contract, deployment verification status, and features without a confirmed server API, see [TASTEMAIL integration gaps](docs/TASTEMAIL_INTEGRATION_GAPS.md). This document does not imply that the current mock UI is already connected to the server.

The server-only integration boundary is under `lib/tastemail/`. `GXWEBMAIL_DATA_MODE` defaults to `mock`; in `live` mode, the Next.js server uses `http://127.0.0.1:7531` by default. `TASTEMAIL_API_URL` can override that server-only address when necessary and is never a `NEXT_PUBLIC_` setting. Loopback works only when GXWebMail and the Rust API run on the same host (or a local tunnel exposes the API there); a browser or a different computer's `127.0.0.1` is not the deployed mail server. Live login submits to the same-origin session route without a prerequisite health check; the optional unauthenticated `/health` diagnostic does not prove account validity or database readiness. Authentication requests are rejected unless the configured API origin uses HTTPS or loopback HTTP. The live login form and session route also reject non-loopback browser HTTP; remote browsers need an HTTPS ingress to Next.js. The UI guard prevents normal form submission but cannot retroactively protect credentials sent over an insecure connection. Live mode connects login/MFA, session checks, logout, mailbox pages, JMAP text-based mail search, personal contacts with create/edit/delete, monthly calendar viewing, attendee-free personal event create/edit/cancel, invitation RSVP, and shared-mailbox listings, approval requests with creation and active-approver approve/reject decisions, revision-checked user mail-rule editing with Sieve syntax validation and side-effect-free sample preview, and admin-only quarantine listings/details through same-origin route handlers. Readable shared accounts can be opened to browse their server folders, paginated messages, and sanitized HTML or text bodies. HTML bodies are isolated in sandboxed iframes with external resources blocked; bounded inline raster images use the authorized attachment proxy. Opening a personal live message marks it read, its star button changes the `$flagged` keyword, and personal mail can be moved to archive, spam, trash, or back to inbox through `Email/set`; these changes refresh only after server confirmation. It does not fall back to sample mail when the server fails. Live search excludes mock people and file results, live contacts exclude the mock organization chart, live calendar excludes mock AI suggestions and room availability, and the live shared-mailbox page excludes mock scheduled sends and templates. Shared attachment downloads are available through the same-origin authorized proxy. Personal plain-text compose, explicit draft save, attachment upload, and submission are wired through same-origin routes; shared-account mutations, permanent deletion, rich HTML composition, and scheduled sending remain disabled. Submission and upload have only been statically checked against source contracts, not tested with a deployed account. Other template modules still contain mock flows. The deployed API connection and real-account behavior have **not** been verified, so do not enable live mode for users yet.

Current live-calendar scope additionally allows creating an event with attendee email addresses and cancelling an organizer event with attendees. Invitations or cancellation notices may be sent by TASTEMAIL, so the UI warns before these actions. Editing an event with attendees remains disabled to avoid replacing the attendee list. System-mailbox moves preserve any custom mailbox membership. The live sidebar lists personal custom mailboxes returned by `Mailbox/get`, can read their messages, and includes them in the search-folder filter; custom-mailbox creation, rename, and deletion remain unconnected. In live mode, settings without a server contract are labeled as demonstrations; language, theme, accessibility, and shortcuts remain browser-local preferences. These additions have not been verified with a real account.

The live workspace sidebar loads mailbox counts and quota metadata through a separate authenticated summary route on non-mail pages; it does not fetch message bodies just to populate navigation. Summary failures show an error and retry control instead of mock counts. This route has not been verified with a deployed account.

Live compose now offers recipient suggestions from TASTEMAIL's account-scoped `/api/contacts/suggestions` through an authenticated same-origin route. The browser never receives the API token; mock compose remains independent. Suggestion lookup and selection have not been verified with a deployed account.

The live quarantine screen now connects administrator-only release-to-inbox and permanent discard actions. Both require confirmation and refresh the list after a confirmed result; an interrupted or unparseable mutation response is shown as uncertain rather than success. Bulk quarantine actions remain unconnected. These actions have not been exercised against a deployed account.

Live attachment links stream authorized JMAP downloads through `/api/mail/attachments`; filenames and attachment bytes never pass through the browser's API-token storage. This path has only been tested against the synthetic loopback server, not a deployed account.

In live mode, `/files` lists real mail attachments through JMAP attachment search and the authorized download proxy; it does not show demo storage totals, large-file links, or cleanup actions. `/security` reads the server's TOTP status, remaining recovery-code count, sessions, and security events. After confirmation, it can revoke one other-device session or all other-device sessions through the server; the current session is excluded. Other security mutations remain unconnected. These screens and revocation results have not been verified with a deployed account.

Live mode does not present demo sign-up or setup-wizard links from the login screen. Direct entry to `/signup` shows an account-provisioning notice and sign-in link instead of a simulated registration. Mock mode retains the sign-up demo.
Direct entry to `/setup` in live mode likewise shows an unavailable notice instead of simulated database, DNS, and invitation results. The seven-step setup demo remains available in mock mode.
The three demo admin routes (`/admin`, `/admin/onboarding`, `/admin/system`) show a not-connected notice in live mode; the mock admin console remains available in mock mode. This is a UI boundary, not an authorization mechanism for the Rust admin API.

Live `/settings/signature` reads and saves the server's per-sender plain-text and HTML signatures. New plain-text messages use the default sender's text signature after compose options load; existing body text and text already entered by the user are not overwritten. The mock multi-signature list remains mock-only. This path has not been verified with a deployed account.

GXWebMail is a **design and interaction prototype**, not a production mail client.

- In the default mock mode, no backend, mail transport, or database is required. Demo data is seeded from `lib/mock-*.ts` and held in React state.
- Mock login and signup simulate a successful flow. Live login uses TASTEMAIL authentication and keeps the token in an HttpOnly cookie; live account creation is not connected.
- A browser refresh resets most mutable feature state to the bundled mock data. User settings and published theme preferences are the deliberate exceptions and persist in versioned browser storage.
- In mock mode, buttons and controls provide visible prototype behavior without calling production services. The separately listed live-mode actions use TASTEMAIL through same-origin server routes.
- AI tone rewriting, account operations, delivery actions, migration, backup, billing, and similar administrative operations are demonstrations only.
- No payment flow, subscription service, licensing server, or other business-model implementation is included.

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

Mock people, organization names, authored email subjects and bodies, calendar event descriptions, and file names remain sample content rather than translated interface labels. Review locale copy and sample content with native speakers before production use.

## Main routes

Replace `{locale}` with one of the supported locale codes.

| Route | Experience |
| --- | --- |
| `/{locale}` | Main mail workspace |
| `/{locale}/login` | Mock login by default; TASTEMAIL authentication in live mode |
| `/{locale}/signup` | Mock account registration |
| `/{locale}/mailboxes` | Shared mailboxes |
| `/{locale}/search` | Advanced mail search |
| `/{locale}/rules` | Compatibility redirect to the canonical filter settings page |
| `/{locale}/quarantine` | Quarantine review |
| `/{locale}/calendar` | Calendar views |
| `/{locale}/contacts` | Contacts and organization chart |
| `/{locale}/files` | Mock file workspace or live mail-attachment browser |
| `/{locale}/approvals` | Approval workflow prototype |
| `/{locale}/security` | Mock personal security or live server status and other-device sign-out |
| `/{locale}/settings` | User settings |
| `/{locale}/accessibility` | Accessibility options |
| `/{locale}/shortcuts` | Keyboard shortcuts |
| `/{locale}/admin` | Administrator console |
| `/{locale}/admin/onboarding` | Tenant onboarding |
| `/{locale}/admin/system` | System mail, print, and error-page management |
| `/{locale}/setup` | Initial setup flow |

### User settings workspace

`/{locale}/settings` is the grouped entry point for the user-facing settings system. On desktop, the same groups appear in a persistent settings navigation pane; on mobile, the entry page shows touch-friendly grouped lists and each detail route provides a back action. The settings routes are:

| Group | Routes |
| --- | --- |
| General | `/settings/locale`, `/settings/theme`, `/settings/accessibility` |
| Mail | `/settings/signature`, `/settings/inbox-display`, `/settings/sending`, `/settings/away`, `/settings/notifications` |
| Mail management | `/settings/labels`, `/settings/filters`, `/settings/blocked-senders` |
| Account | `/settings/account`, `/settings/security`, `/settings/integrations`, `/settings/shortcuts` |

Every route contains editable controls rather than placeholder or report-only cards. Shared settings patterns provide save, discard, default reset, validation, confirmation dialogs, and toast feedback. Destructive operations such as label/filter removal, sender unblocking, session revocation, backup-code regeneration, and integration disconnection require confirmation where appropriate.

The prototype distinguishes three states: bundled defaults, the last saved snapshot, and the current draft. Saved user settings are stored under the versioned `gxmail:user-settings:v1` localStorage key and reloaded after hydration. Unsaved drafts are never written automatically; enabled save actions persist them, cancel restores the saved snapshot, and reset prepares defaults as a new draft. Same-origin navigation and browser unload are guarded while either user settings or the theme draft has unsaved changes.

Locale, theme, and workspace-sidebar preferences retain their specialized behavior:

- Locale changes continue through `next-intl`, retain the current path, query, and hash, and save the draft before replacing the locale-prefixed URL.
- Theme changes use the same `ThemeContext` as the global customizer, apply as a live preview, and persist only when published.
- The initial collapsed sidebar state remains server-rendered from the `workspace_sidebar_collapsed` cookie so a refresh does not briefly show the expanded sidebar.

The user accessibility route controls font scale, contrast, motion, focus, screen-reader detail, and keyboard-navigation document attributes. It is separate from the top-level `/accessibility` audit/reference experience. Likewise, the editable shortcut route is separate from the printable `/shortcuts` reference. `/rules` redirects to `/settings/filters`, making the filter editor the canonical rule-management surface.

In mock mode, settings do not update a server account, mail service, identity provider, notification service, or integration API. Password changes, security-session operations, synchronization, and connection states update typed mock state only. In live mode, the mail-rule editor and per-sender signature editor use TASTEMAIL, the security page reads real server status and can sign out other-device sessions, and other server-backed settings are not yet connected.

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
- Theme changes are previewed live. Published theme values are stored in `localStorage` for the current browser.
- Shared overlays and toast feedback should be reused so prototype interactions remain visually and behaviorally consistent.
- New screens should support narrow/mobile layouts and all configured locales from the start.

## Known limitations

- Mock mode has no server integration. Live mode has partial TASTEMAIL JMAP, calendar, contact, and mail-attachment integration, but no independent file service or Exchange integration.
- Mock mode has no database or multi-user synchronization; live-mode durability and validation depend on TASTEMAIL and have not been verified with a deployed account.
- Browser-local theme and interface preferences are not synchronized across devices or users. Live mail rules use the server; most other account settings are not connected.
- Live authentication and authorization boundaries are implemented but have not been qualified as production security or audit guarantees.
- No real backup, restore, migration, billing, or API-key operation; the live send path is wired but delivery has not been verified with an approved test account.
- No email HTML delivery compatibility or cross-client rendering certification
- Machine-assisted translations and mock content require professional language review before production use
- The compatibility translation layer is transitional; remaining detailed screens should gradually move to named message keys

## Extending the template

When adding a feature, check the existing shared components and mock-data patterns first. Keep service integration behind a separate data or API layer so the UI can continue to run in prototype mode. For production adoption, replace the mock state, authentication, and administrative operations with validated backend contracts and add the security, accessibility, integration, and end-to-end tests required by your environment.

See `AGENTS.md` for repository-specific Next.js agent guidance.
