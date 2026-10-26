# Next upgrade commit checkpoint — 2026-10-27

- Next.js and eslint-config-next: 16.3.4 -> 16.4.2; lockfile matched. React and next-intl unchanged.
- Added the specific LAN hostname to allowedDevOrigins; did not disable origin checking.
- Current production build/type check: PASS, Next16.4.2 Turbopack, 432 static pages, BUILD_ID `ffNd26uDlGnXj1jvqKVqn`, isolated `.next-upgrade-1642-validation`.
- Current change-scoped ESLint: PASS (`next.config.ts`).
- Current offline regression: secure-dev lifecycle/loopback/health contract and OAuth return controls (ten locales), PASS in development and NODE_ENV=production.
- LAN/relay PowerShell parsing: PASS. Restarter uses BasicParsing to avoid a hidden Windows PowerShell prompt. LAN existing-rule validation accepts equivalent CIDR/netmask subnet notation and checks TCP.
- The earlier 2026-10-18 framework validation passed213 offline test files in development and production, full ESLint, synthetic production HTTP/SSR fixture checks, and isolated browser login/settings/dropdown checks. Unchanged application sources were not retested wholesale for this commit; the later Next configuration change invalidated the old build, so the production build above was rerun.
- Synthetic browser screenshot is checked in; actual business reply screenshots and private email contents are not.
- Network scripts are committed, not executed by this commit. Direct LAN activation/proxy transition remains pending administrator application and end-to-end verification. The recovery document describes historical temporary relay results, not current availability.
- The requested general reply timeline is not implemented in these changes. Email-draft editing was browser-only and no email was sent by the agent.
- No deployment, live OAuth consent, new mail submission, remote Nginx change or firewall change was performed for this commit/push.
