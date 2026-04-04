import type { RuleWithConditions, RuleAction, RuleCondition } from "./db/types";

export interface RuleContext {
  sender: string;
  senderDomain: string;
  subject: string;
  aliasTag: string;
}

export interface RuleMatch {
  ruleId: number;
  action: RuleAction;
  forwardTo: string | null;
}

/**
 * Evaluate rules in priority order against the message context.
 * Returns the first matching rule, or null if none match.
 */
export function evaluateRules(
  rules: RuleWithConditions[],
  ctx: RuleContext,
): RuleMatch | null {
  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.conditions.length === 0) continue;

    const matched =
      rule.operator === "and"
        ? rule.conditions.every((c) => matchCondition(c, ctx))
        : rule.conditions.some((c) => matchCondition(c, ctx));

    if (matched) {
      return {
        ruleId: rule.id,
        action: rule.action,
        forwardTo: rule.forward_to,
      };
    }
  }

  return null;
}

function matchCondition(cond: RuleCondition, ctx: RuleContext): boolean {
  const fieldValue = getFieldValue(cond.field, ctx);
  const target = cond.value;

  switch (cond.match) {
    case "equals":
      return fieldValue.toLowerCase() === target.toLowerCase();
    case "contains":
      return fieldValue.toLowerCase().includes(target.toLowerCase());
    case "starts_with":
      return fieldValue.toLowerCase().startsWith(target.toLowerCase());
    case "ends_with":
      return fieldValue.toLowerCase().endsWith(target.toLowerCase());
    case "regex":
      try {
        return new RegExp(target, "i").test(fieldValue);
      } catch {
        // Invalid regex — treat as no match
        return false;
      }
  }
}

function getFieldValue(field: RuleCondition["field"], ctx: RuleContext): string {
  switch (field) {
    case "sender":
      return ctx.sender;
    case "sender_domain":
      return ctx.senderDomain;
    case "subject":
      return ctx.subject;
    case "alias_tag":
      return ctx.aliasTag;
  }
}
