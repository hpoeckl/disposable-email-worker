# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-04-05

### Added

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
- `count_subject` from format now rewrites From header to `"[n/m]" <noreply@...>`
  (previously left original From, causing envelope mismatch rejections)
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
