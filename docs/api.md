# REST API Reference

All endpoints require a valid Cloudflare Access JWT (passed automatically by the browser after Access authentication). The JWT is validated against the configured `CF_ACCESS_TEAM` and `CF_ACCESS_AUD`.

## Authentication

The Worker validates the `Cf-Access-Jwt-Assertion` header on every `/api/*` request. The user identity is derived from the JWT `email` claim — the localpart becomes the `user` field used for scoping.

Admin users (listed in `ADMIN_USERS` env var) can act on behalf of other users by appending `?user=<target>` to any endpoint.

## Rate Limiting

All authenticated API requests are rate-limited to **120 requests per minute** per user (based on JWT email). Rate limit state is per-isolate (in-memory), so limits reset on Worker restarts or across different isolates.

Response headers on all authenticated requests:
- `X-RateLimit-Remaining` — requests remaining in the current window
- `X-RateLimit-Reset` — Unix timestamp (seconds) when the window resets

When the limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header (seconds until reset).

## Endpoints

### Health Check

#### `GET /api/health`

No authentication required. Returns Worker and database status.

```json
{ "status": "ok", "timestamp": "2026-04-05T12:00:00.000Z" }
```

Returns `503` if the database is unreachable:

```json
{ "status": "degraded", "error": "database unreachable" }
```

---

### Metrics

#### `GET /api/metrics`

No authentication required. Returns Prometheus exposition format (`text/plain; version=0.0.4`).

Exposed metrics:

| Metric | Type | Description |
|---|---|---|
| `email_aliases_total` | gauge | Total aliases |
| `email_aliases_active` | gauge | Active, non-expired aliases |
| `email_forwarded_total` | gauge | Total emails forwarded |
| `email_rejected_total` | gauge | Total emails rejected |
| `email_bytes_forwarded_total` | gauge | Total bytes forwarded |
| `email_users_total` | gauge | Distinct users |
| `email_recipients_total{status}` | gauge | Recipients by status (verified/pending) |
| `email_rules_total{status}` | gauge | Rules by status (active/inactive) |
| `email_failed_deliveries_total` | gauge | Total failed delivery records |
| `email_failed_deliveries_24h` | gauge | Failed deliveries in the last 24h |
| `email_bandwidth_used_bytes` | gauge | Total bandwidth used |

Like `/api/health`, this endpoint requires a Cloudflare Access bypass policy to be accessible to external scrapers.

---

### Identity

#### `GET /api/me`

Returns the authenticated user's identity and admin status.

```json
{ "user": "alice", "email": "alice@example.com", "isAdmin": false }
```

---

### Users (admin only)

#### `GET /api/users`

List all users with summary stats (alias count, recipient count, rule count, bandwidth).

```json
[
  { "user": "alice", "alias_count": 5, "recipient_count": 2, "rule_count": 1, "bandwidth_used": 0, "bandwidth_limit": 104857600, "created_at": "2026-04-01 12:00:00" }
]
```

#### `POST /api/users`

Create (pre-provision) a user. Auto-creates their `user_settings` row with defaults.

```json
{ "user": "bob" }
```

#### `DELETE /api/users/:user`

Delete a user and all their data (aliases, rules, recipients, settings, failed deliveries). Cannot delete yourself.

---

### Aliases

#### `GET /api/aliases`

List aliases. Admin without `?user=` sees all users' aliases.

#### `POST /api/aliases`

Create an alias. Body:

```json
{ "tag": "amazon", "limit": 24, "description": "Amazon orders" }
```

Admin can target a user with `?user=alice`.

#### `GET /api/aliases/:tag`

Get a single alias. Admin resolves across all users if no `?user=` specified.

#### `PATCH /api/aliases/:tag`

Update an alias. Body (all fields optional):

```json
{ "limit": 50, "description": "updated", "active": true, "reset_counter": true }
```

#### `DELETE /api/aliases/:tag`

Delete an alias and its whitelist entries (cascaded).

---

### Whitelist

Whitelist entries are scoped to an alias. Admin must specify `?user=` if the alias belongs to another user.

#### `GET /api/aliases/:tag/whitelist`

List whitelist entries for an alias.

#### `POST /api/aliases/:tag/whitelist`

Add a whitelist entry. Body:

```json
{ "type": "domain", "pattern": "example.com" }
```

Types: `email` (exact match), `domain` (exact domain), `segment` (domain suffix).

#### `DELETE /api/aliases/:tag/whitelist/:id`

Remove a whitelist entry.

---

### Rules

Rules are per-user and evaluated in priority order during email processing.

#### `GET /api/rules`

List rules with conditions.

#### `POST /api/rules`

Create a rule. Body:

```json
{
  "name": "Block spam domain",
  "operator": "and",
  "action": "block",
  "forward_to": null,
  "conditions": [
    { "field": "sender_domain", "match": "equals", "value": "spam.com" }
  ]
}
```

- `operator`: `and` | `or`
- `action`: `block` (silent drop) | `reject` (bounce) | `forward` (override recipients)
- `forward_to`: comma-separated list of verified recipient emails; required when action is `forward`
- Condition fields: `sender`, `sender_domain`, `subject`, `alias_tag`
- Condition matches: `equals`, `contains`, `starts_with`, `ends_with`, `regex`

#### `GET /api/rules/:id`

Get a single rule with conditions.

#### `PATCH /api/rules/:id`

Update a rule. Same body as POST, all fields optional.

#### `DELETE /api/rules/:id`

Delete a rule and its conditions (cascaded).

#### `POST /api/rules/reorder`

Reorder rules. Body:

```json
{ "rule_ids": [3, 1, 2] }
```

---

### Recipients

#### `GET /api/recipients`

List recipients for the current user.

#### `POST /api/recipients`

Add a recipient. If `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are configured, automatically creates a Cloudflare Email Routing destination address.

Body:

```json
{ "email": "user@gmail.com" }
```

#### `POST /api/recipients/sync`

Sync verification status from Cloudflare Email Routing API. Checks all destination addresses and updates `verified_at` for matching recipients. Returns:

```json
{ "ok": true, "synced": 2 }
```

#### `PATCH /api/recipients/:id`

Toggle the recipient's default forwarding flag. Body:

```json
{ "active": false }
```

Recipients with `active: true` receive all forwarded mail by default. Inactive recipients are still usable as explicit targets in rule `forward_to` but won't receive mail unless a rule routes to them.

#### `DELETE /api/recipients/:id`

Delete a recipient. If no other user references the same email, also deletes the Cloudflare destination address.

---

### Failed Deliveries

#### `GET /api/failed-deliveries`

List failed deliveries. Admin without `?user=` sees all users' deliveries.

#### `DELETE /api/failed-deliveries/:id`

Delete a failed delivery record. Admin can delete any record.

#### `POST /api/failed-deliveries/purge`

Delete failed deliveries older than 30 days.

---

### Settings

#### `GET /api/settings`

Get user settings. Auto-creates defaults on first access.

```json
{
  "user": "alice",
  "catch_all": 1,
  "from_name_format": "sender_count_alias",
  "default_limit": 24,
  "bandwidth_limit": 104857600,
  "bandwidth_used": 0,
  "bandwidth_reset_at": "2026-04-05 00:00:00"
}
```

#### `PATCH /api/settings`

Update settings. Body (all fields optional):

```json
{
  "catch_all": true,
  "from_name_format": "sender_via_alias",
  "default_limit": 50
}
```

Valid `from_name_format` values:

| Value | From header | Subject |
|---|---|---|
| `sender_count_alias` | `"sender [n/m] via tag" <noreply@...>` | unchanged |
| `sender_via_alias` | `"sender via tag" <noreply@...>` | unchanged |
| `count_subject` | `"sender via tag" <noreply@...>` | `[n/m] original subject` |
| `alias_only` | `"tag" <noreply@...>` | unchanged |
| `noreply` | `<noreply@...>` | unchanged |

## Admin Scoping

Any endpoint that accepts `?user=<target>` allows an admin to operate on another user's data. The `ADMIN_USERS` env var is a comma-separated list of full email addresses (e.g., `admin@example.com,ops@example.com`).

Admin-specific behaviors:
- `GET /api/aliases` without `?user=` returns all users' aliases
- `GET /api/failed-deliveries` without `?user=` returns all users' deliveries
- Alias edit/delete resolves across all users when no `?user=` is specified

## Error Responses

All errors return JSON:

```json
{ "error": "description of the error" }
```

Common status codes:
- `400` — invalid request body
- `401` — authentication failed (invalid/missing JWT)
- `403` — forbidden (e.g., non-admin calling admin-only endpoint)
- `404` — resource not found (or not accessible to current user)
- `429` — rate limit exceeded (check `Retry-After` header)
- `409` — conflict (e.g., alias already exists)
- `500` — internal server error
- `501` — feature not configured (e.g., CF Email Routing API not set up)
- `502` — upstream error (e.g., Cloudflare API failure)
