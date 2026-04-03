#!/usr/bin/env bash
#
# Post-deploy smoke tests for Cloudflare infrastructure.
# Validates DNS records, Access gate, D1 database, and email routing.
#
# Usage:
#   ./scripts/smoke-test.sh <base-domain> [zone-id]
#
# Arguments:
#   base-domain   e.g. drop.example.com
#   zone-id       Cloudflare zone ID (required for API checks;
#                 skipped if omitted or CLOUDFLARE_API_TOKEN is unset)
#
# Environment:
#   CLOUDFLARE_API_TOKEN  API token for Cloudflare API checks (optional)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WRANGLER="${PROJECT_ROOT}/node_modules/.bin/wrangler"

BASE_DOMAIN="${1:?Usage: $0 <base-domain> [zone-id]}"
ZONE_ID="${2:-}"
PASS=0
FAIL=0

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }

check() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    green "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== DNS Records ==="

check "MX records exist for ${BASE_DOMAIN}" \
  bash -c "dig +short MX ${BASE_DOMAIN} | grep -q 'mx.cloudflare.net'"

check "SPF record exists for ${BASE_DOMAIN}" \
  bash -c "dig +short TXT ${BASE_DOMAIN} | grep -q 'v=spf1.*cloudflare.*-all'"

check "CNAME wildcard resolves for test.${BASE_DOMAIN}" \
  bash -c "dig +short CNAME test.${BASE_DOMAIN} | grep -qi '${BASE_DOMAIN}'"

echo ""
echo "=== Cloudflare Access ==="

check "Access gate active on https://${BASE_DOMAIN} (non-200 response)" \
  bash -c "code=\$(curl -s -o /dev/null -w '%{http_code}' https://${BASE_DOMAIN}); [ \"\$code\" != '200' ]"

echo ""
echo "=== D1 Database ==="

check "D1 database 'disposable-email-db' exists" \
  bash -c "${WRANGLER} d1 list 2>/dev/null | grep -q 'disposable-email-db'"

echo ""
echo "=== Email Routing (API) ==="

if [ -n "$ZONE_ID" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  check "Catch-all rule is enabled" \
    bash -c "curl -sf -H 'Authorization: Bearer ${CLOUDFLARE_API_TOKEN}' \
      'https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/email/routing/rules/catch_all' \
      | grep -q '\"enabled\":true'"
else
  echo "  SKIP: ZONE_ID or CLOUDFLARE_API_TOKEN not set"
fi

echo ""
echo "=== CNAME Wildcard Email Routing (Phase 0) ==="
echo "  Manual: send email to test@x.${BASE_DOMAIN} and check Worker logs"
echo "  Run: wrangler tail --format json  (after Worker is deployed)"

echo ""
echo "=== Results ==="
echo "  ${PASS} passed, ${FAIL} failed"

[ "$FAIL" -eq 0 ] || exit 1
