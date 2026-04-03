# Infrastructure (Pulumi)

All Cloudflare infrastructure is managed via Pulumi with YAML. The entire stack is defined in `infra/Pulumi.yaml` — no build step, no dependencies beyond the Pulumi CLI.

## Managed Resources

| Resource | Pulumi Type | Purpose |
|---|---|---|
| MX records (x3) | `cloudflare.DnsRecord` | Route mail to Cloudflare Email Routing |
| SPF record | `cloudflare.DnsRecord` | Authorize Cloudflare to send on behalf of base domain |
| CNAME wildcard | `cloudflare.DnsRecord` | Route `*.drop.example.com` to base domain |
| D1 database | `cloudflare.D1Database` | Application database |
| Access application | `cloudflare.ZeroTrustAccessApplication` | Protect dashboard with auth gate (inline email OTP policy) |
| Email catch-all | `cloudflare.EmailRoutingCatchAll` | Forward unmatched addresses to Worker |

**Note:** The email catch-all rule references the Worker by name. The Worker
must be deployed via `wrangler deploy` before the catch-all can be created.
See [Deployment Order](#deployment-order) below.

## Not Managed by Pulumi

- **Worker deployment**: `wrangler deploy` handles code, bindings, secrets, routes.
- **D1 schema**: `wrangler d1 migrations apply` manages table creation and evolution.
- **Per-user DNS** (fallback only): if the CNAME wildcard approach doesn't work for email routing, per-user MX records are provisioned at runtime by the Worker via the Cloudflare API.

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/install/) >= 3
- Cloudflare API token with: `Zone.DNS:Edit`, `Email Routing:Edit`, `Access:Edit`, `D1:Edit`

## Stack Configuration

Required config values (set via `pulumi config set`):

| Key | Description | Example |
|---|---|---|
| `zoneId` | Cloudflare zone ID | `abc123...` |
| `accountId` | Cloudflare account ID | `def456...` |
| `baseDomain` | Base domain for email routing | `drop.example.com` |
| `parentDomain` | Parent domain | `example.com` |
| `accessAllowedEmail` | Email address allowed via Access OTP | `alice@example.com` |
| `workerName` | Worker script name (optional, default: `disposable-email-worker`) | `disposable-email-worker` |
| `cloudflare:apiToken` | Cloudflare API token (**secret**) | — |

## Commands

```bash
cd infra

# Initialize a new stack
pulumi stack init dev

# Set configuration
pulumi config set zoneId <value>
pulumi config set accountId <value>
pulumi config set baseDomain drop.example.com
pulumi config set parentDomain example.com
pulumi config set accessAllowedEmail "you@example.com"
pulumi config set cloudflare:apiToken <token> --secret

# Preview changes
pulumi preview

# Apply changes
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

## Provider Notes

The Cloudflare Pulumi provider wraps the Cloudflare Terraform provider. Resource availability mirrors the Terraform provider. The YAML runtime doesn't support dynamic providers — if a resource isn't available, manage it manually or switch the stack to TypeScript/Go.

Known considerations:
- Email Routing zone-level enablement may need to be done in the Cloudflare dashboard before the catch-all rule can be created.
- MX record values (`route1.mx.cloudflare.net`, etc.) are Cloudflare's standard email routing targets. Verify these haven't changed when deploying.
- All config values must be non-empty. Empty values pass Pulumi validation but cause cryptic Cloudflare API errors (e.g., "invalid email rule").

## Deployment Order

The catch-all email routing rule references the Worker script by name.
Cloudflare validates that the Worker exists when creating the rule, so
deployment must happen in two phases:

1. **First `pulumi up`**: creates DNS records, D1 database, Access
   application. The catch-all rule is commented out in `Pulumi.yaml`.
2. **`wrangler deploy`**: deploys the Worker script to Cloudflare.
3. **Second `pulumi up`**: uncomment the catch-all block in `Pulumi.yaml`
   and run `pulumi up` to create the email routing rule.

For additional users, add more `include` entries to the inline policy in
`Pulumi.yaml` and run `pulumi up`:

```yaml
policies:
  - name: Email OTP
    decision: allow
    precedence: 1
    includes:
      - email:
          email: alice@example.com
      - email:
          email: bob@example.com
```
