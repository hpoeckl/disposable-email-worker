# Infrastructure (Pulumi)

All Cloudflare infrastructure is managed via Pulumi with TypeScript. The stack
is defined in `infra/index.ts` (converted from YAML to support conditional
resources like the catch-all rule).

## Managed Resources

| Resource | Pulumi Type | Purpose |
|---|---|---|
| MX records (x3) | `cloudflare.DnsRecord` | Route mail to Cloudflare Email Routing |
| SPF record | `cloudflare.DnsRecord` | Authorize Cloudflare to send on behalf of base domain |
| CNAME wildcard | `cloudflare.DnsRecord` | Route `*.drop.example.com` to base domain |
| D1 database | `cloudflare.D1Database` | Application database |
| Access application | `cloudflare.ZeroTrustAccessApplication` | Protect dashboard with auth gate (inline email OTP policy) |
| Email catch-all | `cloudflare.EmailRoutingCatchAll` | Forward unmatched addresses to Worker (conditional) |

**Note:** The email catch-all rule references the Worker by name. The Worker
must be deployed via `wrangler deploy` before the catch-all can be created.
See [Deployment Order](#deployment-order) below.

## Not Managed by Pulumi

- **Worker deployment**: `wrangler deploy` handles code, bindings, secrets, routes.
- **D1 schema**: `wrangler d1 migrations apply` manages table creation and evolution.
- **Parent zone DNS** (SPF, DKIM, DMARC): configured on the parent domain, not the base subdomain. See [dns.md](dns.md#parent-zone-dns-requirements).
- **Per-user DNS** (fallback only): if the CNAME wildcard approach doesn't work for email routing, per-user MX records are provisioned at runtime by the Worker via the Cloudflare API.

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/install/) >= 3
- Node.js >= 18 (for TypeScript runtime)
- Cloudflare API token with: `Zone.DNS:Edit`, `Email Routing:Edit`, `Access:Edit`, `D1:Edit`

## Stack Configuration

Required config values (set via `pulumi config set`):

| Key | Description | Example |
|---|---|---|
| `zoneId` | Cloudflare zone ID | `abc123...` |
| `accountId` | Cloudflare account ID | `def456...` |
| `baseDomain` | Base domain for email routing | `drop.example.com` |
| `accessAllowedEmails` | Comma-separated emails allowed via Access OTP | `alice@example.com,bob@example.com` |
| `cloudflare:apiToken` | Cloudflare API token (**secret**) | — |

Optional:

| Key | Default | Description |
|---|---|---|
| `workerName` | `disposable-email-worker` | Worker script name |
| `enableCatchAll` | `false` | Create email routing catch-all rule (set `true` after Worker is deployed) |

## Commands

```bash
cd infra
npm install

# Initialize a new stack
pulumi stack init dev

# Set configuration
pulumi config set zoneId <value>
pulumi config set accountId <value>
pulumi config set baseDomain drop.example.com
pulumi config set accessAllowedEmail "you@example.com"
pulumi config set cloudflare:apiToken <token> --secret

# Preview changes
pulumi preview

# Apply changes
pulumi up

# After wrangler deploy, enable catch-all
pulumi config set enableCatchAll true
pulumi up

# View outputs (e.g., D1 database ID for wrangler.toml)
pulumi stack output databaseId

# Destroy all resources (destructive)
pulumi destroy
```

## Outputs

| Output | Description |
|---|---|
| `databaseId` | D1 database ID — copy to `wrangler.toml` `database_id` field |
| `databaseName` | D1 database name |
| `accessAppId` | Cloudflare Access application ID |
| `wildcardCnameHostname` | Wildcard CNAME record hostname |

## State Backend

Pulumi state is stored externally, never in the repository. Options:

- **Pulumi Cloud** (default, free tier): `pulumi login`
- **Local file**: `pulumi login --local` (state in `~/.pulumi/`)
- **S3/GCS/Azure Blob**: `pulumi login s3://bucket-name`

## Smoke Tests

A post-deploy validation script is available at `scripts/smoke-test.sh`.
It checks DNS records, Access gate, D1 database, and email routing:

```bash
# DNS + Access + D1 (no API token needed)
./scripts/smoke-test.sh drop.example.com

# Full (includes email routing catch-all via API)
CLOUDFLARE_API_TOKEN=<token> ./scripts/smoke-test.sh drop.example.com <zone-id>
```

Exits non-zero on any failure. The CNAME wildcard email routing test is
flagged as manual — it requires a deployed Worker and a real email send.

## Deployment Order

The catch-all email routing rule references the Worker script by name.
Cloudflare validates that the Worker exists when creating the rule. The
`enableCatchAll` config flag (default: `false`) gates this resource:

1. **First `pulumi up`**: creates DNS records, D1 database, Access
   application. Catch-all is skipped (`enableCatchAll` defaults to `false`).
2. **`wrangler deploy`**: deploys the Worker script to Cloudflare.
3. **Enable catch-all**:
   ```bash
   pulumi config set enableCatchAll true
   pulumi up
   ```

For additional users, add more `include` entries to the inline policy in
`infra/index.ts` and run `pulumi up`:

```typescript
includes: [
  { email: { email: "alice@example.com" } },
  { email: { email: "bob@example.com" } },
],
```
