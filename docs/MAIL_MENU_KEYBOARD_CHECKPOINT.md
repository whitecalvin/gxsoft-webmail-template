# Mail menu keyboard checkpoint

Date: 2026-10-01

## Implemented

- Personal mailbox row menus support ArrowUp/ArrowDown with wraparound, Home and End.
- Disabled actions are excluded from keyboard navigation.
- Escape closes the menu and restores focus to its connected trigger.
- Tab closes the menu and allows navigation onward from the trigger.
- ArrowLeft returns from the destination submenu to the action menu.
- Scrolling within a long destination menu no longer dismisses it.
- More-action buttons expose menu expansion state.

## Verification

- `node scripts/test-menu-keyboard.mjs`: passed.
- Scoped ESLint for the three changed code/test files: passed; MailList rechecked after its final scroll-handler change.
- `npm run build`: passed, build ID `NShwtL9-Sbi5zGARquQcB`.
- Live browser follow-up: separate `@tastedev.net` test account on local 7540; the existing synthetic CID-forwarded mail's menu confirmed ArrowDown, Home/End, ArrowLeft submenu return, Escape dismissal and focus return to its trigger. No move/delete action selected. Long-menu scroll and Tab behavior were not exercised in this browser follow-up.
- No live mail mutations, server restarts, deployment, commit or push.
- Earlier whole-application build evidence predates this change; do not treat its build ID as current.

Verified SHA-256 inputs:

| File | SHA-256 |
| --- | --- |
| components/mail/MailList.tsx | 0C95E62FE0B4CDDBCB8A1B88DF2149CD523BC2BF14A8E2C6C628AE5833BEC9AE |
| lib/menu-keyboard.ts | 320F1EC457E5D5FC4D3A127CB497813A90E72E2EFF861FCA5E663525EAA02BF4 |
| scripts/test-menu-keyboard.mjs | 52F7989B396AE11C17180B9DFB40B06EEBDBBF94E885CB5922D092D6B3671FCE |

MFA and shared-mailbox live validation remain deferred pending suitable accounts. This independent mailbox-menu improvement does not complete those gates or the overall integration goal.
