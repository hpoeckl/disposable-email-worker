import type { WhitelistEntry } from "./db/types";

/**
 * Check if a sender matches any whitelist entry for an alias.
 *
 * Entry types:
 *   - email:   exact match on full sender address
 *   - domain:  exact match on sender's domain
 *   - segment: suffix match on sender's domain (e.g. "example.com" matches
 *              "sub.example.com" and "example.com" itself)
 */
export function isWhitelisted(
  sender: string,
  entries: WhitelistEntry[],
): boolean {
  if (entries.length === 0) return false;

  const senderLower = sender.toLowerCase();
  const atIndex = senderLower.lastIndexOf("@");
  if (atIndex === -1) return false;

  const senderDomain = senderLower.substring(atIndex + 1);

  for (const entry of entries) {
    const pattern = entry.pattern.toLowerCase();

    switch (entry.type) {
      case "email":
        if (senderLower === pattern) return true;
        break;
      case "domain":
        if (senderDomain === pattern) return true;
        break;
      case "segment":
        if (
          senderDomain === pattern ||
          senderDomain.endsWith("." + pattern)
        ) {
          return true;
        }
        break;
    }
  }

  return false;
}
