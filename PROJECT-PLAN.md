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

- [ ] Parse inbound recipient: extract `tag` (local part) and `user`
      (subdomain prefix before `.drop.example.com`).
- [ ] Look up alias state in D1; create on first contact if catch-all is
      enabled for the user (see User Settings). New aliases use the user's
      configured default limit (default: 24).
- [ ] Forward message via `message.forward()` if under the limit.
- [ ] Reject message if over the limit (configurable: reject vs. silent drop).
- [ ] Continue counting messages after expiry (track both `forwarded` and
      `rejected` counts).
- [ ] Reject addresses where the user subdomain is unknown.
- [ ] Track message size (`message.rawSize`) for bandwidth accounting.
- [ ] Rewrite `From` header before forwarding to prevent bounce/DSN
      notifications from the recipient mailbox leaking back to the original
      sender. Counter embedded in the display name so the user can see
      remaining messages at a glance. Configurable display format per user.
- [ ] Support multiple recipients per alias — call `message.forward()` for
      each attached recipient.
- [ ] Evaluate rule engine before whitelist/counter logic (rules take
      precedence — see Rule Engine).
- [ ] Log failed deliveries to D1 (sender, recipient, subject, timestamp,
      error reason, message size).

### Whitelisting

- [ ] Per-alias whitelist of sender addresses, domains, or domain segments
      (e.g., `*.example.com`).
- [ ] Whitelisted senders bypass the counter entirely — messages always
      forward regardless of expiry.
- [ ] Whitelist entries manageable per alias via the web UI and API.

### Counter Management

- [ ] Reset counter for any alias (via UI or API), re-enabling forwarding.
- [ ] Change the forwarding limit for an existing alias.
- [ ] Display both `forwarded` and `rejected` counts per alias.

### Alias Metadata

- [ ] Description field per alias — free-text note for what the alias is used
      for (e.g., "Amazon orders", "Newsletter signup 2026").
- [ ] Multiple recipients per alias — each alias can forward to one or more
      verified email addresses. Default: the user's primary address.

### Rule Engine

- [ ] User-level rules evaluated in priority order on every inbound message.
- [ ] Each rule has ordered conditions (AND/OR logic) matching against:
      sender address, sender domain, subject, recipient alias tag.
- [ ] Each rule has an action: forward (default), block (silently drop),
      reject (with bounce), forward to specific recipient(s).
- [ ] Rules evaluated before whitelist and counter logic — a rule match
      short-circuits further processing.
- [ ] Rules have active/inactive toggle and execution counter.
- [ ] Manageable via API and UI with drag-and-drop reordering.

### User Settings

- [ ] Catch-all toggle per user — when enabled, unknown tags at
      `<tag>@<user>.drop.example.com` auto-provision on first contact.
      When disabled, only pre-created aliases accept mail.
- [ ] Display from-name format — controls how the `From` header and
      counter visibility appear on forwarded messages. Format options:
  - `sender_count_alias`: `"sender@ext.com [3/24] via amazon" <noreply@...>`
    (default — shows sender, counter, and alias tag)
  - `sender_via_alias`: `"sender@ext.com via amazon" <noreply@...>`
    (no counter)
  - `count_subject`: From unchanged, subject rewritten to
    `[3/24] Original Subject` (counter in subject line instead)
  - `alias_only`: `"amazon" <noreply@...>`
  - `noreply`: `<noreply@...>` (no display name)
- [ ] Default forwarding limit for new auto-provisioned aliases (default: 24).

### Bandwidth Tracking

- [ ] Track cumulative bytes forwarded per user (from `message.rawSize`).
- [ ] Configurable monthly bandwidth limit per user (env var default,
      overridable per user by admin).
- [ ] Reject forwarding when bandwidth exceeded; log as failed delivery.

### Failed Delivery Tracking

- [ ] Log all failed/rejected deliveries to a `failed_deliveries` D1 table.
- [ ] Record: alias, sender, subject (truncated), timestamp, failure reason,
      message size.
- [ ] Viewable and searchable in UI; deletable by user.
- [ ] Retention policy: auto-purge after configurable number of days.

### Web UI (Management Dashboard)

- [ ] Single-page application, mobile-friendly (responsive).
- [ ] Hosted on Cloudflare Pages (static site, calls Worker API).
- [ ] Protected by Cloudflare Access with email OTP (no passwords, no
      additional auth infrastructure).
- [ ] Features:
  - [ ] List all aliases with status (active/expired), counts, description,
        recipient summary — scoped to authenticated user.
  - [ ] Create alias manually (pre-provision before first use).
  - [ ] Edit alias: reset counter, change limit, toggle active/inactive,
        update description, manage recipients.
  - [ ] Manage whitelist entries per alias (add/remove addresses, domains,
        patterns).
  - [ ] Delete alias (removes D1 records entirely).
  - [ ] Search/filter aliases.
  - [ ] Rule management: list, create, edit, reorder, toggle rules.
  - [ ] Failed deliveries view: list, search, delete.
  - [ ] User settings: catch-all toggle, display from-name format, default
        limit.
  - [ ] Bandwidth usage display (current month vs. limit).
  - [ ] Admin view: list/manage all users' aliases (visible only to admins).

### API (Worker `fetch()` Handler)

**Aliases:**

- [ ] `GET    /api/aliases`              — List aliases (own user; all if admin).
- [ ] `POST   /api/aliases`              — Create alias (own user only).
- [ ] `GET    /api/aliases/:tag`         — Get alias details (own or admin).
- [ ] `PATCH  /api/aliases/:tag`         — Update alias (reset counter, change
      limit, toggle state, description, recipients). Own or admin.
- [ ] `DELETE /api/aliases/:tag`         — Delete alias (own or admin).

**Whitelist:**

- [ ] `GET    /api/aliases/:tag/whitelist`     — List whitelist entries.
- [ ] `POST   /api/aliases/:tag/whitelist`     — Add whitelist entry.
- [ ] `DELETE /api/aliases/:tag/whitelist/:id` — Remove whitelist entry.

**Recipients:**

- [ ] `GET    /api/recipients`                 — List verified recipients.
- [ ] `POST   /api/recipients`                 — Add recipient (triggers
      verification email).
- [ ] `DELETE /api/recipients/:id`             — Remove recipient.

**Rules:**

- [ ] `GET    /api/rules`                      — List rules (ordered).
- [ ] `POST   /api/rules`                      — Create rule.
- [ ] `GET    /api/rules/:id`                  — Get rule details.
- [ ] `PATCH  /api/rules/:id`                  — Update rule.
- [ ] `DELETE /api/rules/:id`                  — Delete rule.
- [ ] `POST   /api/rules/reorder`              — Reorder rules.

**Failed Deliveries:**

- [ ] `GET    /api/failed-deliveries`          — List failed deliveries.
- [ ] `DELETE /api/failed-deliveries/:id`      — Delete entry.

**User Settings:**

- [ ] `GET    /api/settings`                   — Get user settings.
- [ ] `PATCH  /api/settings`                   — Update settings (catch-all,
      from-name format, default limit).

**Auth & Common:**

- [ ] API protected by Cloudflare Access JWT validation (same policy as UI).
- [ ] All endpoints derive `user` from JWT identity; admin flag checked
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
                         │    ├─ alias_recipients         │
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
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user        TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  verified_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
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

-- Many-to-many: alias → recipients
CREATE TABLE alias_recipients (
  alias_id     INTEGER NOT NULL REFERENCES aliases(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  PRIMARY KEY (alias_id, recipient_id)
);

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
  forward_to TEXT,  -- recipient email override (NULL = default recipients)
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

All Cloudflare infrastructure is managed via Pulumi with YAML — declarative,
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

- [ ] Domain added to Cloudflare (free plan), nameservers migrated.
- [ ] Verify Google Workspace MX records on apex domain are intact.
- [ ] Run `pulumi up` in `infra/` to provision:
  - [ ] MX record for `drop.example.com` → Cloudflare email routing.
  - [ ] SPF record: `v=spf1 include:_spf.mx.cloudflare.net -all`.
  - [ ] CNAME wildcard `*.drop.example.com -> drop.example.com`.
  - [ ] Email Routing catch-all → Email Worker.
  - [ ] Cloudflare Access application with email OTP policy.
  - [ ] D1 database.
- [ ] Test CNAME wildcard approach for per-user subdomains:
  - [ ] Send test email to `test@x.drop.example.com` and verify Worker
        receives it.
  - [ ] If CNAME wildcard works: no further DNS setup needed per user.
  - [ ] If CNAME wildcard fails: implement Cloudflare API provisioning in
        Worker (create MX + SPF records per user on first login). Store
        `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` as secrets.
- [ ] Run `wrangler d1 migrations apply` to initialize schema.

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
├── wrangler.toml              # Cloudflare Worker config (no secrets)
├── .gitignore
├── infra/                     # Pulumi IaC (YAML)
│   └── Pulumi.yaml            # Project definition + all resources
├── migrations/
│   └── 0001_initial.sql       # D1 schema (full)
├── src/
│   ├── index.ts               # Worker entry (email + fetch handlers)
│   ├── email-handler.ts       # Inbound email processing logic
│   ├── header-rewriter.ts     # From header rewriting logic
│   ├── api/
│   │   ├── router.ts          # API route dispatcher
│   │   ├── aliases.ts         # Alias CRUD handlers
│   │   ├── whitelist.ts       # Whitelist CRUD handlers
│   │   ├── recipients.ts      # Recipient CRUD + verification
│   │   ├── rules.ts           # Rule CRUD + reorder
│   │   ├── failed-deliveries.ts
│   │   └── settings.ts        # User settings handlers
│   ├── db/
│   │   ├── aliases.ts         # D1 access layer for aliases
│   │   ├── recipients.ts      # D1 access layer for recipients
│   │   ├── whitelist.ts       # D1 access layer for whitelists
│   │   ├── rules.ts           # D1 access layer for rules
│   │   ├── failed-deliveries.ts
│   │   └── settings.ts        # D1 access layer for user settings
│   ├── auth.ts                # CF Access JWT validation + admin check
│   ├── address-parser.ts      # Recipient address parsing (tag + user)
│   ├── dns-provisioner.ts     # Cloudflare API: per-user subdomain setup
│   ├── rule-engine.ts         # Rule condition evaluation
│   └── whitelist-matcher.ts   # Sender matching (email, domain, segment)
├── ui/
│   ├── index.html             # SPA shell
│   ├── app.js                 # UI logic (vanilla JS or lightweight framework)
│   └── style.css              # Mobile-first responsive styles
├── test/
│   ├── email-handler.test.ts
│   ├── address-parser.test.ts
│   ├── rule-engine.test.ts
│   ├── whitelist-matcher.test.ts
│   └── api.test.ts
├── docs/
│   ├── setup.md               # Step-by-step deployment guide
│   ├── dns.md                 # DNS configuration reference
│   ├── infrastructure.md      # Pulumi stack reference
│   ├── cloudflare-access.md   # Access policy setup
│   └── address-format.md      # Address convention documentation
└── .github/
    └── workflows/
        └── deploy.yml         # CI: lint, test, pulumi preview, deploy
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

22. Implement `fetch()` handler with route dispatcher.
23. Implement Cloudflare Access JWT validation middleware.
24. Implement user-scoping: derive `user` from JWT email, filter queries.
25. Implement admin check against `ADMIN_USERS` env var.
26. Implement alias API endpoints (user-scoped + admin override).
27. Implement recipient API endpoints (add, verify, remove).
28. Implement whitelist API endpoints.
29. Implement rule API endpoints (CRUD + reorder).
30. Implement failed deliveries API endpoints.
31. Implement user settings API endpoints.
32. API integration tests (including auth/admin scenarios).

### Phase 4 — Web UI

33. Build responsive SPA (mobile-first).
34. Alias list view with status, counts, description, search/filter.
35. Alias detail/edit view (reset, limit change, toggle, description,
    recipients).
36. Whitelist management per alias.
37. Rule management: list, create, edit, reorder, toggle.
38. Failed deliveries view.
39. User settings page (catch-all, from-name format, default limit).
40. Bandwidth usage display.
41. Admin view: user switcher, cross-user alias management.
42. Deploy UI via Cloudflare Pages or serve from Worker.

### Phase 5 — CI/CD & Documentation

43. GitHub Actions workflow: lint, test, `pulumi preview`, `wrangler deploy`.
44. Write `README.md` (quick start, architecture, deployment).
45. Write `docs/` pages (DNS, infrastructure, Cloudflare Access, address
    format, rules).
46. Review repo for any leaked personal data or secrets. Tag `v0.1.0`.

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