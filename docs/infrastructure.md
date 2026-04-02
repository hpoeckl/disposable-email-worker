# Infrastructure (Pulumi)

All Cloudflare infrastructure is managed via Pulumi with YAML. The entire stack is defined in `infra/Pulumi.yaml` — no build step, no dependencies beyond the Pulumi CLI.

## Managed Resources

| Resource | Pulumi Type | Purpose |
|---|---|---|
| MX records (x3) | `cloudflare.DnsRecord` | Route mail to Cloudflare Email Routing |
| SPF record | `cloudflare.DnsRecord` | Authorize Cloudflare to send on behalf of base domain |
| CNAME wildcard | `cloudflare.DnsRecord` | Route `*.drop.example.com` to base domain |
| D1 database | `cloudflare.D1Database` | Application database |
| Access application | `cloudflare.ZeroTrustAccessApplication` | Protect dashboard with auth gate |
| Access policy | `cloudflare.ZeroTrustAccessPolicy` | Email OTP allow policy |
| Email catch-all | `cloudflare.EmailRoutingCatchAll` | Forward unmatched addresses to Worker |

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
| `accessAllowedEmails` | Comma-separated allowed emails for Access | `alice@example.com,bob@example.com` |
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
pulumi config set accessAllowedEmails "you@example.com"
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

## Provider Notes

The Cloudflare Pulumi provider wraps the Cloudflare Terraform provider. Resource availability mirrors the Terraform provider. The YAML runtime doesn't support dynamic providers — if a resource isn't available, manage it manually or switch the stack to TypeScript/Go.

Known considerations:
- Email Routing zone-level enablement may need to be done in the Cloudflare dashboard before the catch-all rule can be created.
- MX record values (`route1.mx.cloudflare.net`, etc.) are Cloudflare's standard email routing targets. Verify these haven't changed when deploying.
