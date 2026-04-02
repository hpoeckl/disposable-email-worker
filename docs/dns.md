# DNS Configuration

This document covers the DNS setup for the disposable email gateway.

## Overview

The gateway uses a dedicated subdomain (e.g., `drop.example.com`) for email routing. Each user gets a sub-subdomain (e.g., `alice.drop.example.com`). The apex domain's MX records (e.g., Google Workspace) remain untouched.

## Records Managed by Pulumi

All records below are created automatically by `pulumi up`. See [infrastructure.md](infrastructure.md) for setup instructions.

### MX Records

Three MX records on the base domain point to Cloudflare's email routing infrastructure:

| Name | Type | Content | Priority |
|---|---|---|---|
| `drop.example.com` | MX | `route1.mx.cloudflare.net` | 69 |
| `drop.example.com` | MX | `route2.mx.cloudflare.net` | 34 |
| `drop.example.com` | MX | `route3.mx.cloudflare.net` | 98 |

### SPF Record

Authorizes Cloudflare to send on behalf of the base domain:

| Name | Type | Content |
|---|---|---|
| `drop.example.com` | TXT | `v=spf1 include:_spf.mx.cloudflare.net ~all` |

### CNAME Wildcard

Routes all per-user subdomains to the base domain:

| Name | Type | Content | Proxied |
|---|---|---|---|
| `*.drop.example.com` | CNAME | `drop.example.com` | No |

The CNAME must be unproxied (DNS-only / grey cloud) because MX resolution requires direct DNS lookups. Cloudflare's proxy does not handle MX traffic.

## CNAME Wildcard Verification

The primary approach assumes Cloudflare Email Routing follows the CNAME and processes mail for arbitrary subdomains. This needs verification:

1. Provision infrastructure: `cd infra && pulumi up`
2. Send a test email to `test@x.drop.example.com`
3. Check if the Worker receives the email

**If it works**: no per-user DNS setup needed. All subdomains route through the wildcard.

**If it doesn't work**: the Worker falls back to provisioning individual MX + SPF records per user via the Cloudflare API at runtime. This requires:
- `CLOUDFLARE_API_TOKEN` secret (with `Zone.DNS:Edit` permission)
- `CLOUDFLARE_ZONE_ID` secret
- A few minutes of DNS propagation delay on first user login

## Preserving Existing MX Records

The gateway only creates records on `drop.example.com` and its subdomains. Your apex domain MX records (e.g., Google Workspace on `example.com`) are not modified.

Verify after deployment:

```bash
dig MX example.com +short          # Should show Google Workspace MX
dig MX drop.example.com +short     # Should show Cloudflare email routing MX
```

## Troubleshooting

**Email not reaching the Worker**:
1. Verify Email Routing is enabled on the zone in the Cloudflare dashboard.
2. Check MX records resolve correctly: `dig MX drop.example.com +short`
3. Verify the catch-all rule exists and points to the Worker.
4. Check the CNAME wildcard resolves: `dig CNAME test.drop.example.com +short`

**SPF failures on forwarded mail**:
- Cloudflare Email Routing handles SPF alignment for forwarded messages. The SPF record on the base domain authorizes Cloudflare's infrastructure.

**DKIM/DMARC**:
- Cloudflare Email Routing preserves original DKIM signatures on forwarded messages. No additional DKIM setup is needed for the base domain.
