# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.7.0] - 2026-04-17

### Added

- `tag_number_sender` From format: `tag [n/m] sender` display name
- `subject_format` setting — separate control for Subject header rewriting
  - `original`: no change (default)
  - `count_prefix`: `[n/m] original subject`
  - `tag_count_prefix`: `tag [n/m] original subject`
- DB migration `0005_subject_format`: new `subject_format` column, migrates existing `count_subject` users to `sender_via_alias` + `count_prefix`

### Changed

- `count_subject` From format retired from UI — replaced by combining `sender_via_alias` with `subject_format = count_prefix`
- Alias modal: Save button removed; fields auto-save on change/blur; Reset counter requires explicit Confirm button
- Rule modal: Save button disabled on open when editing; re-enables on first change
- Whitelist add/remove now refreshes alias list immediately (whitelist_count badge was stale)

### Fixed

- Tab switch re-fetches data when stale (>30s), so newly auto-provisioned aliases appear without a full page reload
- Rule edit modal Save button visually distinct from enabled state when disabled

## [0.6.0] - 2026-04-06

### Added

- Inline SVG favicon (envelope icon)
- Security headers: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff
- `Cache-Control: no-cache` on dashboard HTML
- `robots.txt` disallow-all at `/robots.txt`
- `<meta name="theme-color">` for mobile browser chrome
- Optional `/.well-known/security.txt` via `SECURITY_CONTACT` env var
- Auto-save settings on change (removed Save button)
- Background tint when admin impersonates another user
- Admin tabs grayed out based on context (per-user vs all-users view)

### Fixed

- Admin selecting own user in dropdown now correctly filters aliases and deliveries
- "Acting as" labels use warn color for visibility, hidden in all-users mode
- Admin alias "user" input hidden when a specific user is selected

## [0.5.0] - 2026-04-05

### Added

- Admin user management: `GET /api/users`, `POST /api/users`, `DELETE /api/users/:user`
- Users tab in dashboard (admin only) — view, create, delete users with summary stats
- Pulumi `accessAllowedEmails` config accepts comma-separated list (replaces `accessAllowedEmail`)

### Fixed

- Admin "View as" dropdown now includes users without aliases
- Rules, Recipients, and Settings panels show "Select a user" when admin has "All users" selected
- Table row borders span full row height when cells wrap to multiple lines
- Mobile responsiveness: scrollable tables, stacked forms, responsive modals on <640px

## [0.4.0] - 2026-04-05

### Added

- `GET /api/health` endpoint — no auth required, checks DB connectivity (returns 200/503)
- API rate limiting — 120 requests/minute per user, in-memory per-isolate sliding window
  - `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers on all authenticated responses
  - `429 Too Many Requests` with `Retry-After` header when exceeded
- `GET /api/metrics` endpoint — Prometheus exposition format, no auth required
  - Alias, forwarding, rejection, bandwidth, recipient, rule, and failure counts
- Auto-purge of failed deliveries older than 30 days via monthly cron trigger
- Drag-and-drop rule reordering in dashboard UI (calls `POST /api/rules/reorder`)

## [0.3.0] - 2026-04-05

### Added

- Monthly bandwidth reset via cron trigger (`0 0 1 * *` — 1st of each month, 00:00 UTC)
- `scheduled()` handler and `resetAllBandwidth()` function
- Recipient `active` flag — toggle default forwarding per recipient (`PATCH /api/recipients/:id`)
- Rule `forward_to` as multi-select of verified recipients (comma-separated)
- Integration tests using `@cloudflare/vitest-pool-workers` with real D1 (37 tests)
- `npm run test:integration` and `npm run test:all` scripts
- REST API with route dispatcher and param extraction (`src/router.ts`)
- Cloudflare Access JWT validation middleware (RS256, JWKS cache, no external deps)
- `GET /api/me` endpoint returns current user info and admin status
- Admin scoping: `?user=` query param for cross-user operations on all endpoints
- `effectiveUser()` helper for consistent admin override across all API routes
- HTML dashboard SPA served directly from Worker (`src/ui.ts`)
  - Alias management with description, whitelist count, status badges
  - Per-alias whitelist management modal
  - Rule CRUD with condition builder modal
  - Recipient management with Cloudflare verification sync
  - Failed deliveries view with user column for admin
  - Settings editor (catch-all, from format, default limit, bandwidth display)
  - Admin user selector dropdown for cross-user management
  - Client-side search/filter on aliases and failed deliveries
  - "Acting as" labels on all panels when admin targets a user
  - All dates displayed in browser-local timezone
- Cloudflare Email Routing destination address integration (`src/cf-email-routing.ts`)
  - Auto-creates CF destination address when recipient is added
  - `POST /api/recipients/sync` syncs verification status from CF API
  - Deletes CF destination address on recipient removal (only if no other user references it)
  - `cf_destination_id` column on recipients table (`migrations/0002`)
- Multiple recipients: fallback now forwards to all verified recipients, not just one
- `workers_dev = false` to disable the unprotected `workers.dev` route
- `CLOUDFLARE_ACCOUNT_ID` env var for Email Routing API calls
- `CLOUDFLARE_API_TOKEN` secret for Email Routing destination management
- API reference documentation (`docs/api.md`)
- Known limitations documentation (`docs/known-limitations.md`)

### Changed

- All POST create endpoints (aliases, rules, recipients) now use `?user=` query
  param instead of `body.user` for admin targeting — consistent with other endpoints
- Whitelist API endpoints now use `effectiveUser()` for admin scoping
- `count_subject` from format now shows `"sender via tag"` in From display name
  and puts counter only in subject (previously used `"[n/m]"` as From display name)
- Dropped `alias_recipients` table — recipient routing handled via rules with `forward_to`
- Vitest upgraded from v3 to v4 for `@cloudflare/vitest-pool-workers` compatibility
- Recipient delete now returns the deleted record (needed for CF destination cleanup)

### Fixed

- Admin could not manage whitelists for other users' aliases (404 — was using
  `ctx.user` instead of `effectiveUser()`)
- Recipient/alias/rule creation as admin always created under admin's user
  regardless of selected target user
- `count_subject` format caused "From header does not match mail from" rejection
  because From was left as original sender while envelope was noreply@

## [0.2.0] - 2026-04-04

### Added

- Per-alias sender whitelist with email, domain, and segment pattern matching
- Whitelisted senders bypass counter and bandwidth limits
- From header shows "(whitelisted)" for whitelisted senders
- User-level rule engine with AND/OR conditions and block/reject/forward actions
- Rules evaluated before all other checks, with optional recipient override
- D1 data access layer for whitelist and rule tables (single JOIN query)

## [0.1.0] - 2026-04-04

### Added

- Project plan and architecture documentation
- Pulumi infrastructure stack (DNS, D1, Access, Email Routing catch-all)
- D1 initial migration with full schema
- Repository scaffolding (package.json, tsconfig, wrangler.toml.example)
- Address parser for `<tag>@<user>.<baseDomain>` format
- D1 data access layer (settings, aliases, recipients, failed deliveries)
- From header rewriter with 5 display formats
- MIME header rewriter with whitelist-based header stripping
- Email handler with raw MIME forwarding via SendEmail binding
- Worker entry point (`email()` and stub `fetch()` handlers)
- Post-deploy smoke test script with parent zone DNS checks
- Deployment guide, DNS docs, infrastructure docs

### Changed

- Converted Pulumi stack from YAML to TypeScript for conditional catch-all
  support (`enableCatchAll` config flag)

### Fixed

- SPF/DKIM/DMARC alignment for forwarded emails (parent zone DNS docs)
- Cloudflare SendEmail "invalid headers set" rejection (whitelist approach)
