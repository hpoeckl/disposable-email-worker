import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

const config = new pulumi.Config();
const zoneId = config.require("zoneId");
const accountId = config.require("accountId");
const baseDomain = config.require("baseDomain");
const workerName = config.get("workerName") ?? "disposable-email-worker";
const accessAllowedEmail = config.require("accessAllowedEmail");
const enableCatchAll = config.getBoolean("enableCatchAll") ?? false;

// ---------------------------------------------------------------------------
// DNS Records
// ---------------------------------------------------------------------------

// MX records — route mail to Cloudflare Email Routing
const mxRoute1 = new cloudflare.DnsRecord("mx-route1", {
  zoneId,
  name: baseDomain,
  type: "MX",
  content: "route1.mx.cloudflare.net",
  priority: 69,
  ttl: 1,
});

const mxRoute2 = new cloudflare.DnsRecord("mx-route2", {
  zoneId,
  name: baseDomain,
  type: "MX",
  content: "route2.mx.cloudflare.net",
  priority: 34,
  ttl: 1,
});

const mxRoute3 = new cloudflare.DnsRecord("mx-route3", {
  zoneId,
  name: baseDomain,
  type: "MX",
  content: "route3.mx.cloudflare.net",
  priority: 98,
  ttl: 1,
});

// SPF — authorize Cloudflare to send on behalf of the base domain
const spf = new cloudflare.DnsRecord("spf", {
  zoneId,
  name: baseDomain,
  type: "TXT",
  content: "v=spf1 include:_spf.mx.cloudflare.net -all",
  ttl: 1,
});

// Proxied A record — routes HTTP traffic for the dashboard to Cloudflare.
// 192.0.2.1 is a dummy (documentation) IP; Cloudflare's proxy handles the
// actual routing to the Worker via the configured route/custom domain.
const dashboardDns = new cloudflare.DnsRecord("dashboard-dns", {
  zoneId,
  name: baseDomain,
  type: "A",
  content: "192.0.2.1",
  proxied: true,
  ttl: 1,
});

// CNAME wildcard — route all per-user subdomains to the base domain.
// Must be unproxied (DNS-only) for MX resolution.
const wildcardCname = new cloudflare.DnsRecord("wildcard-cname", {
  zoneId,
  name: `*.${baseDomain}`,
  type: "CNAME",
  content: baseDomain,
  proxied: false,
  ttl: 1,
});

// ---------------------------------------------------------------------------
// D1 Database
// ---------------------------------------------------------------------------

const db = new cloudflare.D1Database("disposable-email-db", {
  accountId,
  name: "disposable-email-db",
});

// ---------------------------------------------------------------------------
// Cloudflare Access — Application + OTP Policy
// ---------------------------------------------------------------------------

const dashboard = new cloudflare.ZeroTrustAccessApplication("dashboard", {
  zoneId,
  name: "Disposable Email Dashboard",
  domain: baseDomain,
  type: "self_hosted",
  sessionDuration: "24h",
  policies: [
    {
      name: "Email OTP",
      decision: "allow",
      precedence: 1,
      includes: [{ email: { email: accessAllowedEmail } }],
    },
  ],
});

// ---------------------------------------------------------------------------
// Email Routing — Catch-All Rule (requires Worker to be deployed first)
// ---------------------------------------------------------------------------

let catchAll: cloudflare.EmailRoutingCatchAll | undefined;

if (enableCatchAll) {
  catchAll = new cloudflare.EmailRoutingCatchAll("catch-all", {
    zoneId,
    name: "Forward to Worker",
    enabled: true,
    matchers: [{ type: "all" }],
    actions: [{ type: "worker", values: [workerName] }],
  });
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export const databaseId = db.id;
export const databaseName = db.name;
export const accessAppId = dashboard.id;
export const wildcardCnameHostname = wildcardCname.name;
