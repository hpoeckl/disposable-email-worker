// Patches wrangler.toml with values from environment variables.
// Used by CI deploy — wrangler.toml is gitignored, so CI copies the
// example and runs this script to fill in actual values.

import { readFileSync, writeFileSync } from "node:fs";

const replacements = {
  'database_id = ""': `database_id = "${env("D1_DATABASE_ID")}"`,
  'BASE_DOMAIN = ""': `BASE_DOMAIN = "${env("BASE_DOMAIN")}"`,
  'ADMIN_USERS = ""': `ADMIN_USERS = "${env("ADMIN_USERS")}"`,
  'CF_ACCESS_TEAM = ""': `CF_ACCESS_TEAM = "${env("CF_ACCESS_TEAM")}"`,
  'CF_ACCESS_AUD = ""': `CF_ACCESS_AUD = "${env("CF_ACCESS_AUD")}"`,
  'CLOUDFLARE_ACCOUNT_ID = ""': `CLOUDFLARE_ACCOUNT_ID = "${env("CLOUDFLARE_ACCOUNT_ID")}"`,
};

let toml = readFileSync("wrangler.toml", "utf8");

for (const [search, replace] of Object.entries(replacements)) {
  toml = toml.replace(search, replace);
}

// Uncomment routes line if BASE_DOMAIN is set
const baseDomain = process.env.BASE_DOMAIN;
if (baseDomain) {
  const parentDomain = baseDomain.split(".").slice(1).join(".");
  toml = toml.replace(
    /# routes = .*/,
    `routes = [{ pattern = "${baseDomain}/*", zone_name = "${parentDomain}" }]`,
  );
}

writeFileSync("wrangler.toml", toml);
console.log("wrangler.toml configured for deploy");

function env(name) {
  const val = process.env[name];
  if (!val) {
    console.warn(`Warning: ${name} is not set`);
    return "";
  }
  return val;
}
