# Known Limitations

## SendEmail Cannot Deliver to Same-Zone Addresses

**Impact**: Recipients with email addresses on the same Cloudflare zone (or any zone in the same account) will fail with `destination address is not a verified address`.

**Example**: If your Cloudflare account manages `example.com`, then `user@example.com` cannot be a forwarding recipient — even if the address exists in Gmail/Workspace and has a verified Cloudflare Email Routing destination address.

**Root Cause**: The Cloudflare SendEmail (SEB) binding enforces a restriction that prevents sending to addresses on zones managed by the same account. This is separate from Email Routing destination address verification and cannot be bypassed.

**Workarounds**:
- Use an external email address (e.g., `user@gmail.com`) as the recipient
- Use a different Cloudflare account for the zone that hosts the recipient addresses
- Enable Email Routing on the parent zone and change MX records to Cloudflare (breaks existing MX setup like Google Workspace)

**Affected Scenario**: The intended architecture is `tag@user.drop.example.com` → `user@example.com`. If `example.com` is in the same Cloudflare account, this won't work via SEB. The email handler will log these as `partial_forward_failure` in the failed deliveries table.

## Email Routing Must Be Enabled on the Subdomain Zone

Cloudflare Email Routing catch-all rules require Email Routing to be enabled on the zone. For `drop.example.com`, this is set up via Pulumi. The parent zone (`example.com`) does NOT need Email Routing enabled — only the subdomain zone where the Worker receives mail.

## Destination Addresses Require Verification

Every recipient email must be registered and verified as a Cloudflare Email Routing destination address before mail can be forwarded to it. When `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are configured, the Worker automates this:

1. Adding a recipient via the API/dashboard auto-creates the destination address
2. Cloudflare sends a verification email to the address
3. The recipient clicks the verification link
4. `POST /api/recipients/sync` updates the local verification status

Without the API token configured, destination addresses must be managed manually in the Cloudflare dashboard.

## From Header Rewriting

All from-name formats rewrite the `From` header to use `noreply@<base-domain>` as the sender address. This is required because the envelope sender (set by Cloudflare SRS) uses the parent domain, and the `From` header must match to pass DMARC alignment.

The `count_subject` format shows `"sender via tag"` in the From display name and prepends `[n/m]` to the subject line. The original sender is always available in the `Reply-To` and `X-Original-From` headers.

## Bandwidth Tracking

Bandwidth is tracked per-user in `user_settings.bandwidth_used`. The default limit is 100 MB. A cron trigger (`0 0 1 * *`) resets all users' bandwidth on the 1st of each month at 00:00 UTC.

## No Per-Alias Recipient Routing

All verified **active** recipients for a user receive all forwarded mail. Recipients can be toggled inactive via `PATCH /api/recipients/:id` — inactive recipients are still verified CF destinations but won't receive mail unless explicitly targeted by a rule.

To route specific aliases to specific recipients, use the rule engine with a `forward` action, an `alias_tag equals <tag>` condition, and a comma-separated list of target emails in `forward_to`.
