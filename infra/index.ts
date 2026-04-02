import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const config = new pulumi.Config();
const cfConfig = new pulumi.Config("cloudflare");

const zoneId = config.require("zoneId");
const accountId = config.require("accountId");
const baseDomain = config.require("baseDomain"); // e.g. "drop.example.com"
const parentDomain = config.require("parentDomain"); // e.g. "example.com"
const workerName = config.get("workerName") || "disposable-email-worker";

// Allowed email addresses for Cloudflare Access OTP policy.
// Comma-separated list — e.g. "alice@example.com,bob@example.com"
const accessAllowedEmails = config.require("accessAllowedEmails").split(",");

// ---------------------------------------------------------------------------
// DNS Records
// ---------------------------------------------------------------------------

// MX record for the base domain — routes mail to Cloudflare Email Routing.
// Cloudflare Email Routing requires specific MX values; these are the
// standard Cloudflare email routing MX targets.
const mxRecord1 = new cloudflare.DnsRecord("mx-route1", {
  zoneId,
  name: baseDomain,
  type: "MX",
  content: "route1.mx.cloudflare.net",
  priority: 69,
  ttl: 1, // Auto
});

const mxRecord2 = new cloudflare.DnsRecord("mx-route2", {
  zoneId,
  name: baseDomain,
  type: "MX",
  content: "route2.mx.cloudflare.net",
  priority: 34,
  ttl: 1,
});

const mxRecord3 = new cloudflare.DnsRecord("mx-route3", {
  zoneId,
  name: baseDomain,
  type: "MX",
  content: "route3.mx.cloudflare.net",
  priority: 98,
  ttl: 1,
});

// SPF record — authorize Cloudflare to send on behalf of the base domain.
const spfRecord = new cloudflare.DnsRecord("spf", {
  zoneId,
  name: baseDomain,
  type: "TXT",
  content: "v=spf1 include:_spf.mx.cloudflare.net ~all",
  ttl: 1,
});

// CNAME wildcard — route all per-user subdomains to the base domain.
// This is the primary approach; if Cloudflare Email Routing doesn't follow
// the CNAME for mail delivery, per-user MX records will need to be
// provisioned at runtime via the Cloudflare API (see dns-provisioner.ts).
const wildcardCname = new cloudflare.DnsRecord("wildcard-cname", {
  zoneId,
  name: `*.${baseDomain}`,
  type: "CNAME",
  content: baseDomain,
  proxied: false, // MX resolution requires unproxied DNS
  ttl: 1,
});

// ---------------------------------------------------------------------------
// D1 Database
// ---------------------------------------------------------------------------

const d1Database = new cloudflare.D1Database("disposable-email-db", {
  accountId,
  name: "disposable-email-db",
});

// ---------------------------------------------------------------------------
// Cloudflare Access — Application + OTP Policy
// ---------------------------------------------------------------------------

// Access application protecting the management dashboard.
const accessApp = new cloudflare.ZeroTrustAccessApplication("dashboard", {
  zoneId,
  name: "Disposable Email Dashboard",
  domain: baseDomain,
  type: "self_hosted",
  sessionDuration: "24h",
});

// Access policy: allow specific email addresses via OTP.
const accessPolicy = new cloudflare.ZeroTrustAccessPolicy("email-otp", {
  applicationId: accessApp.id,
  zoneId,
  name: "Email OTP",
  decision: "allow",
  precedence: 1,
  includes: [
    {
      emails: accessAllowedEmails,
    },
  ],
});

// ---------------------------------------------------------------------------
// Email Routing — Catch-All Rule
// ---------------------------------------------------------------------------

// Enable email routing on the zone. Note: this may need to be done manually
// in the Cloudflare dashboard first, as the API/Pulumi resource for enabling
// email routing at the zone level may not be available. The catch-all rule
// below assumes email routing is already enabled.

// Catch-all rule: forward all unmatched addresses to the Worker.
const catchAllRule = new cloudflare.EmailRoutingCatchAll("catch-all", {
  zoneId,
  name: "Forward to Worker",
  enabled: true,
  matchers: [
    {
      type: "all",
    },
  ],
  actions: [
    {
      type: "worker",
      values: [workerName],
    },
  ],
});

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export const databaseId = d1Database.id;
export const databaseName = d1Database.name;
export const accessAppId = accessApp.id;
export const wildcardCnameHostname = wildcardCname.name;
export const mxRecords = [mxRecord1.name, mxRecord2.name, mxRecord3.name];
