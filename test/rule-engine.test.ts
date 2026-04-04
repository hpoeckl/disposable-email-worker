import { describe, it, expect } from "vitest";
import { evaluateRules, RuleContext } from "../src/rule-engine";
import type { RuleWithConditions, RuleCondition } from "../src/db/types";

const baseCtx: RuleContext = {
  sender: "spam@evil.com",
  senderDomain: "evil.com",
  subject: "Buy cheap stuff",
  aliasTag: "shop",
};

function makeRule(
  overrides: Partial<RuleWithConditions> & { conditions: Omit<RuleCondition, "id" | "rule_id">[] },
): RuleWithConditions {
  return {
    id: 1,
    user: "testuser",
    name: "Test Rule",
    priority: 0,
    operator: "and",
    action: "block",
    forward_to: null,
    active: 1,
    hit_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    last_hit_at: null,
    ...overrides,
    conditions: overrides.conditions.map((c, i) => ({
      id: i + 1,
      rule_id: overrides.id ?? 1,
      ...c,
    })),
  };
}

describe("evaluateRules", () => {
  it("returns null for empty rules", () => {
    expect(evaluateRules([], baseCtx)).toBeNull();
  });

  it("returns null when no rules match", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "sender", match: "equals", value: "friend@good.com" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).toBeNull();
  });

  it("matches sender equals", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "sender", match: "equals", value: "spam@evil.com" }],
      }),
    ];
    const result = evaluateRules(rules, baseCtx);
    expect(result).toEqual({ ruleId: 1, action: "block", forwardTo: null });
  });

  it("match is case-insensitive", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "sender", match: "equals", value: "SPAM@EVIL.COM" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("matches sender_domain", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "sender_domain", match: "equals", value: "evil.com" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("matches subject contains", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "subject", match: "contains", value: "cheap" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("matches alias_tag", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "alias_tag", match: "equals", value: "shop" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("matches starts_with", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "subject", match: "starts_with", value: "Buy" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("matches ends_with", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "subject", match: "ends_with", value: "stuff" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("matches regex", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "sender", match: "regex", value: "^spam@.*\\.com$" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("invalid regex does not match", () => {
    const rules = [
      makeRule({
        conditions: [{ field: "sender", match: "regex", value: "[invalid" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).toBeNull();
  });

  it("AND operator requires all conditions", () => {
    const rules = [
      makeRule({
        operator: "and",
        conditions: [
          { field: "sender_domain", match: "equals", value: "evil.com" },
          { field: "subject", match: "contains", value: "nonexistent" },
        ],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).toBeNull();
  });

  it("AND operator passes when all match", () => {
    const rules = [
      makeRule({
        operator: "and",
        conditions: [
          { field: "sender_domain", match: "equals", value: "evil.com" },
          { field: "subject", match: "contains", value: "cheap" },
        ],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("OR operator requires any condition", () => {
    const rules = [
      makeRule({
        operator: "or",
        conditions: [
          { field: "sender", match: "equals", value: "nobody@nowhere.com" },
          { field: "subject", match: "contains", value: "cheap" },
        ],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).not.toBeNull();
  });

  it("skips inactive rules", () => {
    const rules = [
      makeRule({
        active: 0,
        conditions: [{ field: "sender", match: "equals", value: "spam@evil.com" }],
      }),
    ];
    expect(evaluateRules(rules, baseCtx)).toBeNull();
  });

  it("skips rules with no conditions", () => {
    const rules = [makeRule({ conditions: [] })];
    expect(evaluateRules(rules, baseCtx)).toBeNull();
  });

  it("returns first matching rule in priority order", () => {
    const rules = [
      makeRule({
        id: 1,
        priority: 0,
        action: "reject",
        conditions: [{ field: "sender_domain", match: "equals", value: "evil.com" }],
      }),
      makeRule({
        id: 2,
        priority: 1,
        action: "block",
        conditions: [{ field: "sender_domain", match: "equals", value: "evil.com" }],
      }),
    ];
    const result = evaluateRules(rules, baseCtx);
    expect(result).toEqual({ ruleId: 1, action: "reject", forwardTo: null });
  });

  it("returns forward_to when set", () => {
    const rules = [
      makeRule({
        action: "forward",
        forward_to: "override@safe.com",
        conditions: [{ field: "sender_domain", match: "equals", value: "evil.com" }],
      }),
    ];
    const result = evaluateRules(rules, baseCtx);
    expect(result).toEqual({ ruleId: 1, action: "forward", forwardTo: "override@safe.com" });
  });
});
