# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project plan and architecture documentation
- Pulumi infrastructure stack (DNS, D1, Access, Email Routing catch-all)
- D1 initial migration with full schema
- Repository scaffolding (package.json, tsconfig, wrangler.toml.example)
- Address parser for `<tag>@<user>.<baseDomain>` format
- D1 data access layer (settings, aliases, recipients, failed deliveries)
- From header rewriter with 5 display formats
- MIME header rewriter with whitelist-based stripping
- Email handler with raw MIME forwarding via SendEmail binding
- Worker entry point (`email()` and stub `fetch()` handlers)
- Post-deploy smoke test script with parent zone DNS checks
- Deployment guide, DNS docs, infrastructure docs

### Changed

- Converted Pulumi stack from YAML to TypeScript for conditional catch-all
  support (`enableCatchAll` config flag)

### Fixed

- SPF/DKIM/DMARC alignment for forwarded emails (parent zone DNS docs)
- Cloudflare SendEmail "invalid headers set" rejection (whitelist approach)
