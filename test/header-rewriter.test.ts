import { describe, it, expect } from "vitest";
import { rewriteHeaders, RewriteInput } from "../src/header-rewriter";

const base: RewriteInput = {
  sender: "shop@amazon.com",
  tag: "amazon",
  forwarded: 3,
  limit: 24,
  format: "sender_count_alias",
  subjectFormat: "original",
  noReplyAddress: "noreply@drop.example.com",
};

describe("rewriteHeaders", () => {
  describe("sender_count_alias", () => {
    it("includes sender, counter, and alias tag", () => {
      const result = rewriteHeaders(base, "Your order");
      expect(result.from).toBe(
        '"shop@amazon.com [3/24] via amazon" <noreply@drop.example.com>',
      );
      expect(result.subject).toBeNull();
    });
  });

  describe("sender_via_alias", () => {
    it("includes sender and alias tag without counter", () => {
      const result = rewriteHeaders(
        { ...base, format: "sender_via_alias" },
        "Your order",
      );
      expect(result.from).toBe(
        '"shop@amazon.com via amazon" <noreply@drop.example.com>',
      );
      expect(result.subject).toBeNull();
    });
  });

  describe("count_subject (legacy)", () => {
    it("behaves as sender_via_alias + count_prefix after migration", () => {
      const result = rewriteHeaders(
        { ...base, format: "count_subject", subjectFormat: "count_prefix" },
        "Your order",
      );
      expect(result.from).toBe(
        '"shop@amazon.com via amazon" <noreply@drop.example.com>',
      );
      expect(result.subject).toBe("[3/24] Your order");
    });
  });

  describe("alias_only", () => {
    it("uses alias tag as display name", () => {
      const result = rewriteHeaders(
        { ...base, format: "alias_only" },
        "Your order",
      );
      expect(result.from).toBe('"amazon" <noreply@drop.example.com>');
      expect(result.subject).toBeNull();
    });
  });

  describe("noreply", () => {
    it("uses bare noreply address with no display name", () => {
      const result = rewriteHeaders(
        { ...base, format: "noreply" },
        "Your order",
      );
      expect(result.from).toBe("<noreply@drop.example.com>");
      expect(result.subject).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("escapes double quotes in sender", () => {
      const result = rewriteHeaders(
        { ...base, sender: 'John "JD" Doe <john@test.com>' },
        "Hello",
      );
      expect(result.from).toContain('John \\"JD\\" Doe');
    });

    it("escapes backslashes in sender", () => {
      const result = rewriteHeaders(
        { ...base, sender: "back\\slash@test.com" },
        "Hello",
      );
      expect(result.from).toContain("back\\\\slash@test.com");
    });

    it("handles zero forwarded count", () => {
      const result = rewriteHeaders(
        { ...base, forwarded: 0 },
        "Welcome",
      );
      expect(result.from).toContain("[0/24]");
    });

    it("handles limit reached", () => {
      const result = rewriteHeaders(
        { ...base, forwarded: 24, limit: 24 },
        "Final",
      );
      expect(result.from).toContain("[24/24]");
    });
  });

  describe("tag_number_sender", () => {
    it("formats as tag counter sender", () => {
      const result = rewriteHeaders(
        { ...base, format: "tag_number_sender" },
        "Your order",
      );
      expect(result.from).toBe(
        '"amazon [3/24] shop@amazon.com" <noreply@drop.example.com>',
      );
      expect(result.subject).toBeNull();
    });
  });

  describe("subject_format", () => {
    it("count_prefix prepends counter to subject", () => {
      const result = rewriteHeaders(
        { ...base, format: "sender_via_alias", subjectFormat: "count_prefix" },
        "Your order",
      );
      expect(result.subject).toBe("[3/24] Your order");
    });

    it("tag_count_prefix prepends tag and counter to subject", () => {
      const result = rewriteHeaders(
        { ...base, format: "sender_via_alias", subjectFormat: "tag_count_prefix" },
        "Your order",
      );
      expect(result.subject).toBe("amazon [3/24] Your order");
    });
  });

  describe("whitelisted", () => {
    it("overrides format to sender via tag (whitelisted)", () => {
      const result = rewriteHeaders(
        { ...base, whitelisted: true },
        "Your order",
      );
      expect(result.from).toBe(
        '"shop@amazon.com via amazon (whitelisted)" <noreply@drop.example.com>',
      );
      expect(result.subject).toBeNull();
    });

    it("ignores format setting when whitelisted", () => {
      const result = rewriteHeaders(
        { ...base, format: "noreply", whitelisted: true },
        "Your order",
      );
      expect(result.from).toContain("via amazon (whitelisted)");
    });
  });
});
