# Deployment Guide

Step-by-step guide to deploying the disposable email gateway from scratch.

## Prerequisites

- A domain with nameservers pointed to Cloudflare
- Cloudflare account (free plan is sufficient)
- Node.js >= 18 installed
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- [Pulumi CLI](https://www.pulumi.com/docs/install/) installed

## Step 1: Create a Cloudflare API Token

Create a token at [Cloudflare Dashboard > API Tokens](https://dash.cloudflare.com/profile/api-tokens) with these permissions:

- **Zone > DNS > Edit**
- **Zone > Email Routing Rules > Edit**
- **Account > Access: Apps and Policies > Edit**
- **Account > D1 > Edit**

Scope: the specific zone you're deploying to.

## Step 2: Clone and Install

```bash
git clone https://github.com/<your-org>/disposable-email-worker.git
cd disposable-email-worker
cp wrangler.toml.example wrangler.toml
npm install
```

## Step 3: Enable Email Routing

In the Cloudflare dashboard:

1. Go to your zone > **Email** > **Email Routing**
2. Click **Get started** or **Enable Email Routing**
3. Follow the prompts (this may add initial DNS records — Pulumi will manage the final state)

This step may be required before the catch-all rule can be created via Pulumi.

## Step 4: Configure and Deploy Infrastructure (Phase 1)

The catch-all email routing rule requires the Worker to exist first, so
deployment happens in two phases. The `enableCatchAll` config flag (default:
`false`) gates the catch-all resource.

```bash
cd infra
npm install
pulumi stack init dev

# Required configuration — all values must be non-empty
pulumi config set zoneId <your-zone-id>
pulumi config set accountId <your-account-id>
pulumi config set baseDomain drop.example.com
pulumi config set accessAllowedEmails "you@example.com,other@example.com"
pulumi config set cloudflare:apiToken <your-api-token> --secret

# Preview and deploy
pulumi preview
pulumi up
```

This creates DNS records, D1 database, and Access application with inline
email OTP policy.

Note the D1 database ID from the output:

```bash
pulumi stack output databaseId
```

## Step 5: Configure wrangler.toml

Update `wrangler.toml` (copied from `wrangler.toml.example` in step 2) with:
- `database_id`: the D1 database ID from the previous step
- `BASE_DOMAIN`: your base domain (e.g., `drop.example.com`)

## Step 6: Run Migrations

```bash
# Remote (production)
wrangler d1 migrations apply disposable-email-db

# Or local (development)
wrangler d1 migrations apply disposable-email-db --local
```

## Step 7: Set Worker Secrets

```bash
# Required — for Email Routing destination address management
wrangler secret put CLOUDFLARE_API_TOKEN
# Create a token at https://dash.cloudflare.com/profile/api-tokens
# Required permission: Email Routing Addresses: Edit
```

`ADMIN_USERS` and `CLOUDFLARE_ACCOUNT_ID` are set in `wrangler.toml` `[vars]` (not secrets).

## Step 8: Configure Parent Zone DNS (SPF/DKIM/DMARC)

Cloudflare's SendEmail uses SRS and DKIM signing on the parent domain.
Without these records, forwarded emails will fail SPF/DMARC checks.

See [dns.md](dns.md#parent-zone-dns-requirements) for full details. In short:

1. **SPF**: Add `include:_spf.mx.cloudflare.net` to the SPF record on `example.com`
2. **DKIM**: Verify `cf2024-1._domainkey.example.com` exists (auto-provisioned by Cloudflare)
3. **DMARC**: Add a DMARC record via **Email > DMARC Management** in the dashboard

## Step 9: Verify Destination Addresses (Cloudflare Requirement)

Cloudflare Email Routing requires each forwarding destination to be a verified
destination address. When `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
are configured, this is automated:

1. Add a recipient in the dashboard — the Worker creates the CF destination address via API
2. Cloudflare sends a verification email to the address
3. The recipient clicks the verification link
4. Click **Sync CF** in the dashboard to update the verification status

Without the API token, destination addresses must be added manually:

1. Go to Cloudflare Dashboard > your zone > **Email** > **Email Routing**
   > **Destination addresses**
2. Add each email address that aliases will forward to
3. Click the verification link sent to each address

**Important**: Recipients on the same Cloudflare zone cannot receive mail
via the SendEmail binding. See [known-limitations.md](known-limitations.md).

## Step 10: Deploy the Worker

```bash
wrangler deploy
```

## Step 11: Enable Email Routing Catch-All

Now that the Worker exists, enable the catch-all via config flag:

```bash
cd infra
pulumi config set enableCatchAll true
pulumi up
```

## Step 12: Run Smoke Tests

Validate that infrastructure was provisioned correctly:

```bash
# Basic checks (DNS, Access gate, D1)
./scripts/smoke-test.sh drop.example.com

# Full checks (includes email routing API verification)
CLOUDFLARE_API_TOKEN=<token> ./scripts/smoke-test.sh drop.example.com <zone-id>
```

## Step 13: Verify CNAME Wildcard

Send a test email to `test@anyuser.drop.example.com` and check if the Worker processes it. See [dns.md](dns.md) for details.

## Step 14: Test End-to-End

1. Open `https://drop.example.com` in a browser
2. Authenticate via Cloudflare Access (email OTP)
3. Send an email to `test@<youruser>.drop.example.com`
4. Verify it arrives in your inbox with the rewritten `From` header

## Step 15: Configure Access Bypass Policies

The `/api/health` and `/api/metrics` endpoints are designed to be publicly accessible (no auth). However, if your Cloudflare Access application protects the entire domain, it will block unauthenticated requests before they reach the Worker.

To allow external monitoring tools (Uptime Robot, Prometheus scrapers, etc.) to reach these endpoints:

1. Go to **Zero Trust > Access > Applications**
2. Edit your application
3. Add two bypass policies:

| Policy Name | Action | Selector | Value |
|---|---|---|---|
| Health Check Bypass | Bypass | URI Path | `/api/health` |
| Metrics Bypass | Bypass | URI Path | `/api/metrics` |

These policies must be ordered **above** your main Allow policy so they match first.

## Updating

```bash
git pull
npm install
cd infra && npm install && cd ..

# If infrastructure changed
cd infra && pulumi up && cd ..

# If migrations added
wrangler d1 migrations apply disposable-email-db

# Deploy Worker
wrangler deploy
```

## Destroying

To tear down all infrastructure:

```bash
cd infra
pulumi destroy   # Removes DNS, Access, Email Routing, D1
```

This is destructive and will delete the D1 database and all data.
