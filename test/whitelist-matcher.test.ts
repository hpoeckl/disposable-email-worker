import { describe, it, expect } from "vitest";
import { isWhitelisted } from "../src/whitelist-matcher";
import type { WhitelistEntry } from "../src/db/types";

function entry(
  type: WhitelistEntry["type"],
  pattern: string,
  id = 1,
  alias_id = 1,
): WhitelistEntry {
  return { id, alias_id, type, pattern };
}

describe("isWhitelisted", () => {
  it("returns false for empty entries", () => {
    expect(isWhitelisted("user@example.com", [])).toBe(false);
  });

  it("matches exact email", () => {
    const entries = [entry("email", "trusted@example.com")];
    expect(isWhitelisted("trusted@example.com", entries)).toBe(true);
    expect(isWhitelisted("other@example.com", entries)).toBe(false);
  });

  it("email match is case-insensitive", () => {
    const entries = [entry("email", "Trusted@Example.COM")];
    expect(isWhitelisted("trusted@example.com", entries)).toBe(true);
  });

  it("matches exact domain", () => {
    const entries = [entry("domain", "example.com")];
    expect(isWhitelisted("anyone@example.com", entries)).toBe(true);
    expect(isWhitelisted("anyone@sub.example.com", entries)).toBe(false);
    expect(isWhitelisted("anyone@other.com", entries)).toBe(false);
  });

  it("domain match is case-insensitive", () => {
    const entries = [entry("domain", "Example.COM")];
    expect(isWhitelisted("user@example.com", entries)).toBe(true);
  });

  it("matches segment (suffix match on domain)", () => {
    const entries = [entry("segment", "example.com")];
    expect(isWhitelisted("user@example.com", entries)).toBe(true);
    expect(isWhitelisted("user@sub.example.com", entries)).toBe(true);
    expect(isWhitelisted("user@deep.sub.example.com", entries)).toBe(true);
    expect(isWhitelisted("user@notexample.com", entries)).toBe(false);
  });

  it("segment match is case-insensitive", () => {
    const entries = [entry("segment", "Example.COM")];
    expect(isWhitelisted("user@sub.example.com", entries)).toBe(true);
  });

  it("returns true if any entry matches", () => {
    const entries = [
      entry("email", "specific@other.com", 1),
      entry("domain", "trusted.com", 2),
    ];
    expect(isWhitelisted("anyone@trusted.com", entries)).toBe(true);
  });

  it("returns false for malformed sender (no @)", () => {
    const entries = [entry("email", "bad")];
    expect(isWhitelisted("bad", entries)).toBe(false);
  });

  it("uses last @ for domain extraction", () => {
    const entries = [entry("domain", "example.com")];
    expect(isWhitelisted("weird@name@example.com", entries)).toBe(true);
  });
});
