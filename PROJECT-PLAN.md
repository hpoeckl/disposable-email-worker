# Disposable Email Gateway — Project Plan

Serverless disposable email address service built on Cloudflare Email Workers.
Inspired by [Spamgourmet](https://www.spamgourmet.com) and
[addy.io](https://addy.io), redesigned for a serverless, MTA-free architecture.

## Goals

- Disposable email addresses with automatic expiry after N messages.
- No self-hosted MTA. No servers. Runs entirely on Cloudflare's free tier.
- Main domain MX stays on Google Workspace; disposable addresses live on
  per-user subdomains.
- Mobile-friendly web UI for alias management.
- Multi-user via Cloudflare Access identity — no separate user management.
- Public GitHub repository with no personal data, proper documentation.

---

## Address Format

```
<tag>@<user>.drop.example.com
```

Example: `amazon@service.drop.example.com` — forwards to
`service@example.com`. Each alias has a configurable message limit (default:
24). After the limit is reached, messages are rejected but still counted.

The tag is the entire local part — clean, no separators, no counter in the
address. The user is encoded in the subdomain, derived from the localpart of
their Cloudflare Access email identity.

### DNS Provisioning

Per-user subdomains (e.g., `service.drop.example.com`) are provisioned
automatically via the Cloudflare API on first user login.

**Primary approach — CNAME wildcard (needs verification):**

- Set `*.drop.example.com CNAME -> drop.example.com` in DNS.
- Configure Email Routing + catch-all on `drop.example.com`.
- If Cloudflare Email Routing follows the CNAME and processes mail for
  arbitrary subdomains, this works with zero per-user setup.
- Verification required: send a test email to `test@x.drop.example.com`
  and confirm the Worker receives it.

**Fallback — Cloudflare API provisioning:**

- On first login, Worker creates MX + SPF records for
  `<user>.drop.example.com` via the Cloudflare API.
- Requires a Cloudflare API token with `Zone.DNS:Edit` and
  `Email Routing:Edit` permissions (stored as a secret).
- DNS propagation delay of a few minutes on first user setup.
- Worker needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` secrets.

---

## Authentication & User Model

- Users authenticate via Cloudflare Access with email OTP.
- The localpart of the authenticated email maps to the `user` subdomain.
  E.g., `service@example.com` authenticates → manages aliases for
  `<tag>@service.drop.example.com`.
- On first login, the Worker provisions the user's subdomain DNS records
  (if CNAME wildcard is not in use) and creates a `user_settings` row.
- No separate user table or registration flow. Users exist implicitly.
- Regular users can only manage their own aliases (scoped by `user` derived
  from their Access identity).
- Admin users can manage aliases for all users. Admin list configured via
  environment variable (e.g., `ADMIN_USERS=admin@example.com,ops@example.com`).
  No admin data stored in the repository.
- API and UI enforce authorization: all endpoints filter by authenticated
  user unless the caller has the admin flag.

---

## Functional Requirements

### Core Email Handling

- [x] Parse inbound recipient: extract `tag` (local part) and `user`
      (subdomain prefix before `.drop.example.com`).
- [x] Look up alias state in D1; create on first contact if catch-all is
      enabled for the user (see User Settings). New aliases use the user's
      configured default limit (default: 24).
- [x] Forward message via `message.forward()` if under the limit.
- [x] Reject message if over the limit (configurable: reject vs. silent drop).
- [x] Continue counting messages after expiry (track both `forwarded` and
      `rejected` counts).
- [x] Reject addresses where the user subdomain is unknown.
- [x] Track message size (`message.rawSize`) for bandwidth accounting.
- [x] Rewrite `From` header before forwarding to prevent bounce/DSN
      notifications from the recipient mailbox leaking back to the original
      sender. Counter embedded in the display name so the user can see
      remaining messages at a glance. Configurable display format per user.
- [x] Support multiple recipients per alias — call `message.forward()` for
      each attached recipient.
- [x] Evaluate rule engine before whitelist/counter logic (rules take
      precedence — see Rule Engine).
- [x] Log failed deliveries to D1 (sender, recipient, subject, timestamp,
      error reason, message size).

### Whitelisting

- [x] Per-alias whitelist of sender addresses, domains, or domain segments
      (e.g., `*.example.com`).
- [x] Whitelisted senders bypass the counter entirely — messages always
      forward regardless of expiry.
- [x] Whitelist entries manageable per alias via the web UI and API.

### Counter Management

- [x] Reset counter for any alias (via UI or API), re-enabling forwarding.
- [x] Change the forwarding limit for an existing alias.
- [x] Display both `forwarded` and `rejected` counts per alias.

### Alias Metadata

- [x] Description field per alias — free-text note for what the alias is used
      for (e.g., "Amazon orders", "Newsletter signup 2026").
- [x] Multiple recipients per alias — each alias can forward to one or more
      verified email addresses. Default: the user's primary address.

### Rule Engine

- [x] User-level rules evaluated in priority order on every inbound message.
- [x] Each rule has ordered conditions (AND/OR logic) matching against:
      sender address, sender domain, subject, recipient alias tag.
- [x] Each rule has an action: forward (default), block (silently drop),
      reject (with bounce), forward to specific recipient(s).
- [x] Rules evaluated before whitelist and counter logic — a rule match
      short-circuits further processing.
- [x] Rules have active/inactive toggle and execution counter.
- [x] Manageable via API and UI (drag-and-drop reordering not yet implemented).

### User Settings

- [x] Catch-all toggle per user — when enabled, unknown tags at
      `<tag>@<user>.drop.example.com` auto-provision on first contact.
      When disabled, only pre-created aliases accept mail.
- [x] Display from-name format — controls how the `From` header and
      counter visibility appear on forwarded messages. Format options:
  - `sender_count_alias`: `"sender@ext.com [3/24] via amazon" <noreply@...>`
    (default — shows sender, counter, and alias tag)
  - `sender_via_alias`: `"sender@ext.com via amazon" <noreply@...>`
    (no counter)
  - `count_subject`: From shows `"sender via tag" <noreply@...>`, subject
    rewritten to `[3/24] Original Subject` (counter in subject line)
  - `alias_only`: `"amazon" <noreply@...>`
  - `noreply`: `<noreply@...>` (no display name)
- [x] Default forwarding limit for new auto-provisioned aliases (default: 24).

### Bandwidth Tracking

- [x] Track cumulative bytes forwarded per user (from `message.rawSize`).
- [x] Configurable monthly bandwidth limit per user (env var default,
      overridable per user by admin).
- [x] Reject forwarding when bandwidth exceeded; log as failed delivery.

### Failed Delivery Tracking

- [x] Log all failed/rejected deliveries to a `failed_deliveries` D1 table.
- [x] Record: alias, sender, subject (truncated), timestamp, failure reason,
      message size.
- [x] Viewable and searchable in UI; deletable by user.
- [ ] Retention policy: auto-purge after configurable number of days.

### Web UI (Management Dashboard)

- [x] Single-page application, mobile-friendly (responsive).
- [x] Served directly from Worker (no separate Pages deployment).
- [x] Protected by Cloudflare Access with email OTP (no passwords, no
      additional auth infrastructure).
- [x] Features:
  - [x] List all aliases with status (active/expired), counts, description,
        recipient summary — scoped to authenticated user.
  - [x] Create alias manually (pre-provision before first use).
  - [x] Edit alias: reset counter, change limit, toggle active/inactive,
        update description, manage recipients.
  - [x] Manage whitelist entries per alias (add/remove addresses, domains,
        patterns).
  - [x] Delete alias (removes D1 records entirely).
  - [x] Search/filter aliases.
  - [x] Rule management: list, create, edit, reorder, toggle rules.
  - [x] Failed deliveries view: list, search, delete.
  - [x] User settings: catch-all toggle, display from-name format, default
        limit.
  - [x] Bandwidth usage display (current month vs. limit).
  - [x] Admin view: list/manage all users' aliases (visible only to admins).

### API (Worker `fetch()` Handler)

**Aliases:**

- [x] `GET    /api/aliases`              — List aliases (own user; all if admin).
- [x] `POST   /api/aliases`              — Create alias (own user only).
- [x] `GET    /api/aliases/:tag`         — Get alias details (own or admin).
- [x] `PATCH  /api/aliases/:tag`         — Update alias (reset counter, change
      limit, toggle state, description, recipients). Own or admin.
- [x] `DELETE /api/aliases/:tag`         — Delete alias (own or admin).

**Whitelist:**

- [x] `GET    /api/aliases/:tag/whitelist`     — List whitelist entries.
- [x] `POST   /api/aliases/:tag/whitelist`     — Add whitelist entry.
- [x] `DELETE /api/aliases/:tag/whitelist/:id` — Remove whitelist entry.

**Recipients:**

- [x] `GET    /api/recipients`                 — List verified recipients.
- [x] `POST   /api/recipients`                 — Add recipient (triggers
      verification email).
- [x] `DELETE /api/recipients/:id`             — Remove recipient.

**Rules:**

- [x] `GET    /api/rules`                      — List rules (ordered).
- [x] `POST   /api/rules`                      — Create rule.
- [x] `GET    /api/rules/:id`                  — Get rule details.
- [x] `PATCH  /api/rules/:id`                  — Update rule.
- [x] `DELETE /api/rules/:id`                  — Delete rule.
- [x] `POST   /api/rules/reorder`              — Reorder rules.

**Failed Deliveries:**

- [x] `GET    /api/failed-deliveries`          — List failed deliveries.
- [x] `DELETE /api/failed-deliveries/:id`      — Delete entry.

**User Settings:**

- [x] `GET    /api/settings`                   — Get user settings.
- [x] `PATCH  /api/settings`                   — Update settings (catch-all,
      from-name format, default limit).

**Auth & Common:**

- [x] API protected by Cloudflare Access JWT validation (same policy as UI).
- [x] All endpoints derive `user` from JWT identity; admin flag checked
      against `ADMIN_USERS` env var for cross-user access.

---

## Architecture

```
                         ┌──────────────────────────────┐
                         │   Cloudflare Edge             │
                         │                               │
  inbound mail ────────▶ │  Email Worker (email())       │
  tag@user.drop.example  │    ├─ parse tag + user        │
                         │    ├─ evaluate rules          │
                         │    ├─ check whitelist         │
                         │    ├─ check counter / limit   │
                         │    ├─ rewrite From header     │
                         │    ├─ forward or reject       │
                         │    ├─ update counters + bw    │
                         │    └─ log failed deliveries   │
                         │                               │
  browser ─────────────▶ │  Same Worker (fetch())        │
  drop.example.com       │    ├─ API routes              │
                         │    ├─ JWT auth + admin        │
                         │    ├─ user subdomain setup    │
                         │    └─ serves static UI        │
                         │          (or Pages)            │
                         │                               │
                         │  D1 Database                  │
                         │    ├─ aliases                  │
                         │    ├─ recipients               │
                         │    ├─ whitelist_entries        │
                         │    ├─ rules                    │
                         │    ├─ rule_conditions          │
                         │    ├─ user_settings            │
                         │    └─ failed_deliveries        │
                         │                               │
                         │  Cloudflare API (if needed)   │
                         │    └─ DNS record provisioning  │
                         │                               │
                         │  Cloudflare Access            │
                         │    └─ email OTP gate          │
                         └──────────────────────────────┘
```

### D1 Schema

```sql
-- User preferences (created on first login)
CREATE TABLE user_settings (
  user              TEXT PRIMARY KEY,
  catch_all         INTEGER NOT NULL DEFAULT 1,  -- auto-provision aliases
  from_name_format  TEXT    NOT NULL DEFAULT 'sender_count_alias',
  default_limit     INTEGER NOT NULL DEFAULT 24,
  bandwidth_limit   INTEGER NOT NULL DEFAULT 104857600,  -- 100 MB in bytes
  bandwidth_used    INTEGER NOT NULL DEFAULT 0,
  bandwidth_reset_at TEXT   NOT NULL DEFAULT (datetime('now'))
);

-- Verified forwarding destinations
CREATE TABLE recipients (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user              TEXT    NOT NULL,
  email             TEXT    NOT NULL,
  verified_at       TEXT,
  cf_destination_id TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user, email)
);

CREATE INDEX idx_recipients_user ON recipients(user);

-- Disposable aliases
CREATE TABLE aliases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user        TEXT    NOT NULL,
  tag         TEXT    NOT NULL,
  description TEXT,
  "limit"     INTEGER NOT NULL DEFAULT 24,
  forwarded   INTEGER NOT NULL DEFAULT 0,
  rejected    INTEGER NOT NULL DEFAULT 0,
  bytes_forwarded INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  last_forwarded_at TEXT,
  last_rejected_at  TEXT,
  UNIQUE(user, tag)
);

CREATE INDEX idx_aliases_user ON aliases(user);

-- Per-alias sender whitelist
CREATE TABLE whitelist_entries (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_id INTEGER NOT NULL REFERENCES aliases(id) ON DELETE CASCADE,
  type     TEXT    NOT NULL CHECK(type IN ('email', 'domain', 'segment')),
  pattern  TEXT    NOT NULL,
  UNIQUE(alias_id, type, pattern)
);

CREATE INDEX idx_whitelist_alias ON whitelist_entries(alias_id);

-- User-level filtering rules (evaluated in priority order)
CREATE TABLE rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user       TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 0,
  operator   TEXT    NOT NULL DEFAULT 'and' CHECK(operator IN ('and', 'or')),
  action     TEXT    NOT NULL DEFAULT 'block'
             CHECK(action IN ('forward', 'block', 'reject')),
  forward_to TEXT,  -- comma-separated recipient emails (NULL = default active recipients)
  active     INTEGER NOT NULL DEFAULT 1,
  hit_count  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  last_hit_at TEXT
);

CREATE INDEX idx_rules_user_priority ON rules(user, priority);

-- Conditions attached to rules
CREATE TABLE rule_conditions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id  INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  field    TEXT    NOT NULL CHECK(field IN ('sender', 'sender_domain',
           'subject', 'alias_tag')),
  match    TEXT    NOT NULL CHECK(match IN ('equals', 'contains',
           'starts_with', 'ends_with', 'regex')),
  value    TEXT    NOT NULL
);

CREATE INDEX idx_rule_conditions_rule ON rule_conditions(rule_id);

-- Failed delivery log
CREATE TABLE failed_deliveries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user       TEXT    NOT NULL,
  alias_tag  TEXT,
  sender     TEXT,
  subject    TEXT,
  reason     TEXT    NOT NULL,
  message_size INTEGER,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_failed_user ON failed_deliveries(user, created_at);
```

---

## Infrastructure as Code (Pulumi)

All Cloudflare infrastructure is managed via Pulumi with TypeScript — declarative,
no build step, no additional dependencies beyond the Pulumi CLI. State stored
in Pulumi Cloud (free tier) or a self-managed backend.

### Managed Resources

- **DNS records**: MX for `drop.example.com`, SPF, CNAME wildcard
  `*.drop.example.com`.
- **Cloudflare Access application + policy**: email OTP gate for the
  dashboard URL.
- **Email Routing**: catch-all rule routing to the Email Worker.
- **D1 database**: database resource creation (schema managed separately
  via `wrangler d1 migrations apply`).

### Not Managed by Pulumi

- **Worker deployment**: handled by `wrangler deploy` (bindings, secrets,
  routes configured in `wrangler.toml`).
- **D1 schema migrations**: handled by `wrangler d1 migrations apply`.
- **Per-user subdomain DNS** (if CNAME wildcard fails): runtime
  provisioning via Cloudflare API in the Worker — application logic, not
  IaC.

### Infrastructure Setup Checklist

- [x] Domain added to Cloudflare (free plan), nameservers migrated.
- [x] Verify Google Workspace MX records on apex domain are intact.
- [x] Run `pulumi up` in `infra/` to provision:
  - [x] MX record for `drop.example.com` → Cloudflare email routing.
  - [x] SPF record: `v=spf1 include:_spf.mx.cloudflare.net -all`.
  - [x] CNAME wildcard `*.drop.example.com -> drop.example.com`.
  - [x] Email Routing catch-all → Email Worker.
  - [x] Cloudflare Access application with email OTP policy.
  - [x] D1 database.
- [x] Test CNAME wildcard approach for per-user subdomains:
  - [x] Send test email to `test@x.drop.example.com` and verify Worker
        receives it.
  - [x] If CNAME wildcard works: no further DNS setup needed per user.
  - [x] If CNAME wildcard fails: implement Cloudflare API provisioning in
        Worker (create MX + SPF records per user on first login). Store
        `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` as secrets.
- [x] Run `wrangler d1 migrations apply` to initialize schema.

---

## Versioning

This project uses [Semantic Versioning](https://semver.org/). While in
initial development (`0.x.y`):

- `0.MINOR.PATCH` — MINOR increments for new features or breaking changes,
  PATCH for bug fixes.
- `1.0.0` release when the core feature set (Phases 1–4) is stable and
  deployed.

Tags follow `v0.1.0` format. Changelog maintained in `CHANGELOG.md`
(Keep a Changelog format).

---

## Project Structure (Public GitHub Repository)

```
/
├── README.md                  # Setup guide, architecture overview
├── CHANGELOG.md               # Versioned changelog (Keep a Changelog)
├── LICENSE
├── package.json               # Root: scripts, version (semver)
├── tsconfig.json              # Shared TypeScript config
├── wrangler.toml.example      # Cloudflare Worker config template (wrangler.toml gitignored)
├── .gitignore
├── infra/                     # Pulumi IaC (TypeScript)
│   └── Pulumi.yaml            # Project definition
├── migrations/
│   └── 0001_initial.sql       # D1 schema (full)
├── src/
│   ├── index.ts               # Worker entry (email + fetch handlers)
│   ├── email-handler.ts       # Inbound email processing logic
│   ├── header-rewriter.ts     # From header rewriting logic
│   ├── api/                   # REST API route handlers
│   ├── db/                    # D1 data access layer
│   ├── auth.ts                # CF Access JWT validation + admin check
│   ├── router.ts              # API route dispatcher
│   ├── ui.ts                  # Dashboard SPA (served from Worker)
│   ├── cf-email-routing.ts    # CF Email Routing destination API client
│   ├── rule-engine.ts         # Rule condition evaluation
│   └── whitelist-matcher.ts   # Sender matching (email, domain, segment)
├── test/                      # Unit tests
│   └── integration/           # Integration tests (Workers runtime + D1)
├── scripts/                   # CI helpers
├── docs/                      # Technical documentation
└── .github/
    └── workflows/
        └── ci.yml             # CI: lint, test, deploy
```

---

## Security & Privacy

- No personal data in the repository. All configuration via `wrangler.toml`
  environment variables and Cloudflare secrets.
- `wrangler.toml` references D1 database bindings by name, not by ID.
  Actual IDs set per-environment.
- `ADMIN_USERS` stored as a Cloudflare secret or environment variable, never
  committed to the repository.
- Cloudflare Access protects all `fetch()` routes (API + UI). Email handler
  is invoked by Cloudflare's email routing infrastructure, not exposed via
  HTTP.
- JWT audience and issuer validated in the Worker for defense in depth.
- User identity derived from JWT `email` claim; admin check against
  `ADMIN_USERS` env var.
- `.env`, `*.secret`, `wrangler.toml` with secrets, and `Pulumi.*.yaml`
  stack configs with secrets never committed. Add to `.gitignore`.
- Pulumi state stored externally (Pulumi Cloud or self-managed backend),
  never in the repository.

---

## Phased Implementation

### Phase 0 — DNS Verification

1. Add `drop.example.com` to Cloudflare Email Routing with catch-all.
2. Add `*.drop.example.com CNAME -> drop.example.com`.
3. Send test email to `test@x.drop.example.com` — verify if Worker
   receives it (CNAME wildcard test).
4. Result determines whether DNS provisioning via Cloudflare API is
   needed (Phase 1 step 5).

### Phase 1 — Foundation

5. Initialize repository: `package.json` (v0.1.0), `tsconfig.json`,
   `wrangler.toml`, `.gitignore`.
6. Create Pulumi stack in `infra/`: DNS, Access, Email Routing, D1.
7. Create D1 migration (`0001_initial.sql`) with full schema.
8. Implement address parser (extract `tag` from local part, `user` from
   subdomain) with tests.
9. If CNAME wildcard failed: implement DNS provisioner (Cloudflare API
   to create MX + SPF per user subdomain on first login).
10. Implement D1 access layer (aliases, user settings, recipients).
11. Implement From header rewriter with configurable display formats.
12. Implement email handler: parse → lookup → forward/reject → update
    counters → track bandwidth → log failures.
13. Support multiple recipients per alias.
14. Run `pulumi up` to provision infrastructure, then `wrangler deploy`.
15. End-to-end test: send email to `amazon@service.drop.example.com`,
    verify forwarding, counter behavior, and header rewriting.

### Phase 2 — Whitelisting & Rules

16. Implement whitelist matcher (email, domain, segment patterns) with tests.
17. Integrate whitelist check into email handler (bypass counter for matches).
18. Implement rule engine: condition evaluation (AND/OR), action dispatch.
19. Integrate rule engine into email handler (rules evaluated first, before
    whitelist and counter logic).
20. Implement rule and whitelist D1 layers.
21. End-to-end tests: whitelisted sender bypasses expired alias; rule blocks
    matching sender; rule forwards to override recipient.

### Phase 3 — API & Auth

22. [x] Implement `fetch()` handler with route dispatcher.
23. [x] Implement Cloudflare Access JWT validation middleware.
24. [x] Implement user-scoping: derive `user` from JWT email, filter queries.
25. [x] Implement admin check against `ADMIN_USERS` env var.
26. [x] Implement alias API endpoints (user-scoped + admin override).
27. [x] Implement recipient API endpoints (add, verify via CF API, remove).
28. [x] Implement whitelist API endpoints.
29. [x] Implement rule API endpoints (CRUD + reorder).
30. [x] Implement failed deliveries API endpoints.
31. [x] Implement user settings API endpoints.
32. [x] API integration tests (including auth/admin scenarios).

### Phase 4 — Web UI

33. [x] Build responsive SPA (mobile-first, served from Worker).
34. [x] Alias list view with status, counts, description, whitelist count, search/filter.
35. [x] Alias detail/edit view (reset, limit change, toggle, description).
36. [x] Whitelist management per alias.
37. [x] Rule management: list, create, edit, reorder, toggle.
38. [x] Failed deliveries view (with user column for admin).
39. [x] User settings page (catch-all, from-name format, default limit).
40. [x] Bandwidth usage display.
41. [x] Admin view: user switcher, cross-user management, "acting as" labels.
42. [x] Deploy UI served from Worker (no separate Pages deployment).

### Phase 5 — CI/CD & Documentation

43. [x] GitHub Actions workflow: lint, test, `wrangler deploy`.
44. [x] Write `README.md` (quick start, architecture, deployment).
45. [x] Write `docs/` pages (DNS, infrastructure, API reference, known limitations).
46. [x] Review repo for any leaked personal data or secrets. Tag release.

---

## Cloudflare Free Tier Limits (Verification Needed)

| Resource             | Free Tier Limit        | Likely Sufficient? |
|----------------------|------------------------|--------------------|
| Workers requests     | 100,000 / day          | Yes                |
| D1 reads             | 5,000,000 / day        | Yes                |
| D1 writes            | 100,000 / day          | Yes                |
| D1 storage           | 5 GB                   | Yes                |
| Email Routing        | Unlimited (I believe — needs verification) | Likely |
| Cloudflare Access    | 50 users free          | Yes                |
| Pages                | 500 builds / month     | Yes                |

---

## Out of Scope (For Now)

- **Reply-through anonymization**: Requires outbound SMTP relay (SES,
  Mailgun). Not part of initial implementation.
- **GPG/PGP encryption**: Server-side encryption of forwarded messages.
  Possible in Workers via Web Crypto or WASM but significant complexity.
- **Browser extension**: API supports it; dedicated extension could be a
  future addition for generating aliases on the fly while browsing.
- **Open registration**: Users must be added to the Cloudflare Access policy
  manually. No self-service signup.