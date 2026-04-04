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
| `drop.example.com` | TXT | `v=spf1 include:_spf.mx.cloudflare.net -all` |

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

## Parent Zone DNS Requirements

Cloudflare's SendEmail rewrites the envelope sender via SRS to `@example.com`
(the parent zone), and signs DKIM with `d=example.com`. This means the
**parent zone** (not `drop.example.com`) needs these records for SPF, DKIM,
and DMARC to pass:

### SPF on parent zone

Add `include:_spf.mx.cloudflare.net` to the existing SPF record on `example.com`:

```
v=spf1 <existing-includes> include:_spf.mx.cloudflare.net -all
```

### DKIM on parent zone

Cloudflare signs with selector `cf2024-1`. The public key record
`cf2024-1._domainkey.example.com` should be provisioned automatically when
Email Routing is enabled. Verify:

```bash
dig TXT cf2024-1._domainkey.example.com +short
```

If missing, check **Email > Email Routing > Settings** in the Cloudflare
dashboard.

### DMARC on parent zone

Add a DMARC record on `_dmarc.example.com`. Cloudflare offers a default
record via **Email > DMARC Management**:

```
v=DMARC1; p=none; rua=mailto:<cloudflare-generated>@dmarc-reports.cloudflare.net
```

With relaxed alignment (`aspf=r`, `adkim=r` — the defaults), DMARC passes
because the organizational domain (`example.com`) matches across SPF/DKIM and
the header From (`drop.example.com`).

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
- Cloudflare's SendEmail uses SRS (Sender Rewriting Scheme), rewriting the envelope sender to `@example.com` (parent domain). The SPF record on the **parent zone** must include Cloudflare's email infrastructure. See "Parent Zone DNS Requirements" above.

**DKIM/DMARC**:
- Cloudflare signs outbound messages with a DKIM key on the parent domain (selector `cf2024-1`). Verify the DKIM record exists: `dig TXT cf2024-1._domainkey.example.com`. If missing, enable it via **Email > Email Routing** in the Cloudflare dashboard.
- DMARC must be configured on the parent domain. Cloudflare's dashboard offers a default DMARC record under **Email > DMARC Management**.
