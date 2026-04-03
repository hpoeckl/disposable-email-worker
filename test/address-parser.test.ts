import { describe, it, expect } from "vitest";
import { parseRecipient } from "../src/address-parser";

const opts = { baseDomain: "drop.example.com" };

describe("parseRecipient", () => {
  it("parses a valid address", () => {
    expect(parseRecipient("amazon@service.drop.example.com", opts)).toEqual({
      tag: "amazon",
      user: "service",
    });
  });

  it("lowercases tag and user", () => {
    expect(parseRecipient("Amazon@Service.Drop.Example.Com", opts)).toEqual({
      tag: "amazon",
      user: "service",
    });
  });

  it("handles hyphenated tags", () => {
    expect(
      parseRecipient("my-newsletter@alice.drop.example.com", opts),
    ).toEqual({
      tag: "my-newsletter",
      user: "alice",
    });
  });

  it("handles numeric tags", () => {
    expect(parseRecipient("123@bob.drop.example.com", opts)).toEqual({
      tag: "123",
      user: "bob",
    });
  });

  it("handles dotted tags (local part with dots)", () => {
    expect(
      parseRecipient("first.last@alice.drop.example.com", opts),
    ).toEqual({
      tag: "first.last",
      user: "alice",
    });
  });

  it("returns null for wrong base domain", () => {
    expect(parseRecipient("tag@user.other.com", opts)).toBeNull();
  });

  it("returns null for bare base domain (no user subdomain)", () => {
    expect(parseRecipient("tag@drop.example.com", opts)).toBeNull();
  });

  it("returns null for nested subdomains (user contains dots)", () => {
    expect(
      parseRecipient("tag@sub.user.drop.example.com", opts),
    ).toBeNull();
  });

  it("returns null for missing tag (empty local part)", () => {
    expect(parseRecipient("@user.drop.example.com", opts)).toBeNull();
  });

  it("returns null for missing @ sign", () => {
    expect(parseRecipient("noatsign", opts)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRecipient("", opts)).toBeNull();
  });

  it("handles plus-addressed tags", () => {
    expect(
      parseRecipient("shop+returns@alice.drop.example.com", opts),
    ).toEqual({
      tag: "shop+returns",
      user: "alice",
    });
  });
});
