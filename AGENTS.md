<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI tooltips

- Use the shared `components/ui/Tooltip.tsx` for all user-facing tooltips, including new features and changes to existing hints.
- Do not use HTML `title` attributes for user-facing tooltips. Keep accessible names on controls via `aria-label` or visible labels.
- Preserve flex sizing and interaction handlers when wrapping a control. The shared portal tooltip handles theme colors and clipping; do not create a separate native or page-local tooltip implementation.
