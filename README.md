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

GXWebMail is a **design and interaction prototype**, not a production mail client.

- There is no backend, mail transport, or database. Feature data is seeded from `lib/mock-*.ts` and held in React state.
- There is no real authentication or authorization. Login and signup simulate a successful flow, and the session indicator is stored only in `localStorage`.
- A browser refresh resets most mutable feature state to the bundled mock data. User settings and published theme preferences are the deliberate exceptions and persist in versioned browser storage.
- Buttons and controls are wired to visible prototype behavior such as state changes, dialogs, navigation, and toast feedback, but they do not call production services.
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
| `/{locale}/login` | Mock login |
| `/{locale}/signup` | Mock account registration |
| `/{locale}/mailboxes` | Shared mailboxes |
| `/{locale}/search` | Advanced mail search |
| `/{locale}/rules` | Compatibility redirect to the canonical filter settings page |
| `/{locale}/quarantine` | Quarantine review |
| `/{locale}/calendar` | Calendar views |
| `/{locale}/contacts` | Contacts and organization chart |
| `/{locale}/files` | File workspace |
| `/{locale}/approvals` | Approval workflow prototype |
| `/{locale}/security` | Personal security |
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

This remains a frontend template: settings do not update a server account, mail service, identity provider, notification service, or integration API. Password changes, session operations, synchronization, and connection states update typed mock state and provide visible feedback only.

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

Open [http://localhost:3000](http://localhost:3000). The locale middleware redirects the request to the Korean default route. You can open another language directly, for example [http://localhost:3000/en](http://localhost:3000/en) or [http://localhost:3000/ja](http://localhost:3000/ja).

Login accepts any non-empty email and password because authentication is mocked.

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

- No SMTP, IMAP, JMAP, Exchange, calendar, contact, or file-service integration
- No database, durable persistence, server-side validation, or multi-user synchronization
- User-setting persistence is browser-local mock state only; clearing site data removes it, and it is not synchronized across devices or users
- No production authentication, authorization, audit guarantees, or security enforcement
- No real backup, restore, migration, billing, API-key, or delivery operation
- No email HTML delivery compatibility or cross-client rendering certification
- Machine-assisted translations and mock content require professional language review before production use
- The compatibility translation layer is transitional; remaining detailed screens should gradually move to named message keys

## Extending the template

When adding a feature, check the existing shared components and mock-data patterns first. Keep service integration behind a separate data or API layer so the UI can continue to run in prototype mode. For production adoption, replace the mock state, authentication, and administrative operations with validated backend contracts and add the security, accessibility, integration, and end-to-end tests required by your environment.

See `AGENTS.md` for repository-specific Next.js agent guidance.
