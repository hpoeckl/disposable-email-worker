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
npm install
```

## Step 3: Enable Email Routing

In the Cloudflare dashboard:

1. Go to your zone > **Email** > **Email Routing**
2. Click **Get started** or **Enable Email Routing**
3. Follow the prompts (this may add initial DNS records — Pulumi will manage the final state)

This step may be required before the catch-all rule can be created via Pulumi.

## Step 4: Configure and Deploy Infrastructure

```bash
cd infra
pulumi stack init dev

# Required configuration
pulumi config set zoneId <your-zone-id>
pulumi config set accountId <your-account-id>
pulumi config set baseDomain drop.example.com
pulumi config set parentDomain example.com
pulumi config set accessAllowedEmails "you@example.com"
pulumi config set cloudflare:apiToken <your-api-token> --secret

# Preview and deploy
pulumi preview
pulumi up
```

Note the D1 database ID from the output:

```bash
pulumi stack output databaseId
```

## Step 5: Configure wrangler.toml

Update the `database_id` field in `wrangler.toml` with the D1 database ID from the previous step.

## Step 6: Run Migrations

```bash
# Remote (production)
wrangler d1 migrations apply disposable-email-db

# Or local (development)
wrangler d1 migrations apply disposable-email-db --local
```

## Step 7: Set Worker Secrets

```bash
wrangler secret put ADMIN_USERS
# Enter comma-separated admin emails, e.g.: admin@example.com,ops@example.com
```

If the CNAME wildcard approach fails (see [dns.md](dns.md)):

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_ZONE_ID
```

## Step 8: Deploy the Worker

```bash
wrangler deploy
```

## Step 9: Verify CNAME Wildcard

Send a test email to `test@anyuser.drop.example.com` and check if the Worker processes it. See [dns.md](dns.md) for details.

## Step 10: Test End-to-End

1. Open `https://drop.example.com` in a browser
2. Authenticate via Cloudflare Access (email OTP)
3. Send an email to `test@<youruser>.drop.example.com`
4. Verify it arrives in your inbox with the rewritten `From` header

## Updating

```bash
git pull
npm install

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
