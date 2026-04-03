/**
 * Parses inbound email recipient addresses.
 *
 * Expected format: <tag>@<user>.<baseDomain>
 * Example: amazon@service.drop.example.com
 *   → tag: "amazon", user: "service"
 */

export interface ParsedAddress {
  tag: string;
  user: string;
}

export interface AddressParserOptions {
  baseDomain: string; // e.g. "drop.example.com"
}

export function parseRecipient(
  recipient: string,
  opts: AddressParserOptions,
): ParsedAddress | null {
  const atIndex = recipient.indexOf("@");
  if (atIndex < 1) return null;

  const tag = recipient.substring(0, atIndex).toLowerCase();
  const domain = recipient.substring(atIndex + 1).toLowerCase();

  const suffix = `.${opts.baseDomain.toLowerCase()}`;
  if (!domain.endsWith(suffix)) return null;

  // Extract user: everything before the baseDomain suffix
  const user = domain.substring(0, domain.length - suffix.length);

  // User must be a single label (no dots), non-empty
  if (!user || user.includes(".")) return null;

  return { tag, user };
}
