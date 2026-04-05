# Disposable Email Gateway

Serverless disposable email address service built on [Cloudflare Email Workers](https://developers.cloudflare.com/email-routing/email-workers/). Inspired by [Spamgourmet](https://www.spamgourmet.com) and [addy.io](https://addy.io), redesigned for a serverless, MTA-free architecture.

## How It Works

Each user gets a subdomain under your base domain:

```
<tag>@<user>.drop.example.com
```

- **tag**: any string — becomes the alias name (e.g., `amazon`, `newsletter`)
- **user**: derived from the authenticated user's email localpart

Aliases auto-expire after a configurable number of messages (default: 24). After expiry, messages are rejected but still counted. Whitelisted senders bypass the counter entirely.

## Features

- Disposable email aliases with automatic expiry after N messages
- No self-hosted MTA — runs entirely on Cloudflare's free tier
- Per-alias sender whitelisting (email, domain, pattern)
- User-level rule engine (AND/OR conditions, block/reject/forward actions)
- Multiple recipients per alias
- Configurable `From` header rewriting with counter visibility
- Bandwidth tracking with monthly limits
- Failed delivery logging
- Mobile-friendly web dashboard
- Multi-user via Cloudflare Access (email OTP, no passwords)
- Admin role for cross-user management
- Infrastructure as Code with Pulumi (YAML)

## Architecture

```
Inbound mail ──▶ Cloudflare Email Routing ──▶ Email Worker (email handler)
                                                  ├─ Parse tag + user
                                                  ├─ Evaluate rules
                                                  ├─ Check whitelist
                                                  ├─ Check counter / limit
                                                  ├─ Rewrite From header
                                                  ├─ Forward or reject
                                                  └─ Log to D1

Browser ───────▶ Cloudflare Access ──▶ Same Worker (fetch handler)
                                          ├─ REST API
                                          ├─ JWT auth + admin check
                                          └─ Serves dashboard UI
```

**Stack**: Cloudflare Workers, D1 (SQLite), Email Routing, Access, Pages. Zero external dependencies.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) >= 4
- [Pulumi CLI](https://www.pulumi.com/docs/install/) >= 3
- A Cloudflare account with a domain configured
- Cloudflare API token with permissions: `Zone.DNS:Edit`, `Email Routing:Edit`, `Email Routing Addresses:Edit`, `Access:Edit`, `D1:Edit`

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/<your-org>/disposable-email-worker.git
cd disposable-email-worker
cp wrangler.toml.example wrangler.toml
npm install
```

### 2. Configure Pulumi stack

```bash
cd infra
pulumi stack init dev
pulumi config set zoneId <your-zone-id>
pulumi config set accountId <your-account-id>
pulumi config set baseDomain drop.example.com
pulumi config set parentDomain example.com
pulumi config set accessAllowedEmail "you@example.com"
pulumi config set cloudflare:apiToken <token> --secret
```

### 3. Provision infrastructure

```bash
pulumi up
```

This creates DNS records, Cloudflare Access policy, Email Routing catch-all, and the D1 database.

### 4. Update wrangler.toml

Copy the D1 database ID from Pulumi output into `wrangler.toml`:

```bash
pulumi stack output databaseId
```

### 5. Run D1 migrations

```bash
wrangler d1 migrations apply disposable-email-db
```

### 6. Configure wrangler.toml

Set the required variables in `[vars]`:

- `BASE_DOMAIN` — your base domain (e.g., `drop.example.com`)
- `ADMIN_USERS` — comma-separated admin emails
- `CF_ACCESS_TEAM` — Cloudflare Access team name
- `CF_ACCESS_AUD` — Access application audience tag
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID

### 7. Set Worker secrets

```bash
wrangler secret put CLOUDFLARE_API_TOKEN  # Email Routing destination management
```

### 8. Deploy

```bash
wrangler deploy
```

### 9. Verify

1. Open `https://drop.example.com` — authenticate via Cloudflare Access
2. Add a recipient email in the dashboard, verify it via the link Cloudflare sends
3. Send an email to `test@<user>.drop.example.com` and confirm it forwards

## Development

```bash
npm run dev          # Local dev server (wrangler dev)
npm test             # Run tests
npm run lint         # Type check
npm run migrate:local # Apply migrations to local D1
```

## Project Structure

```
├── infra/              Pulumi IaC (YAML)
├── migrations/         D1 SQL migrations
├── src/                Worker source code
│   ├── api/            REST API route handlers
│   ├── db/             D1 data access layer
│   └── ui.ts           Dashboard SPA (served from Worker)
├── test/               Tests
└── docs/               Technical documentation
```

See [docs/](docs/) for detailed documentation:
- [API Reference](docs/api.md)
- [Deployment Guide](docs/setup.md)
- [DNS Setup](docs/dns.md)
- [Infrastructure](docs/infrastructure.md)
- [Known Limitations](docs/known-limitations.md)

## Versioning

This project follows [Semantic Versioning](https://semver.org/). See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
