import { route, json } from "../router";
import {
  listRulesWithConditions,
  getRuleWithConditions,
  createRule,
  updateRule,
  deleteRule,
  setRuleConditions,
  reorderRules,
} from "../db/rules";
import type {
  RuleOperator,
  RuleAction,
  ConditionField,
  ConditionMatch,
} from "../db/types";

route("GET", "/api/rules", async (ctx) => {
  const rules = await listRulesWithConditions(ctx.db, ctx.user);
  return json(rules);
});

route("POST", "/api/rules", async (ctx, request) => {
  const body = await request.json<{
    name: string;
    priority?: number;
    operator?: RuleOperator;
    action?: RuleAction;
    forward_to?: string | null;
    conditions: { field: ConditionField; match: ConditionMatch; value: string }[];
  }>();

  if (!body.name) return json({ error: "name is required" }, 400);
  if (!body.conditions || body.conditions.length === 0) {
    return json({ error: "At least one condition is required" }, 400);
  }

  const rule = await createRule(ctx.db, ctx.user, body);
  return json(rule, 201);
});

route("GET", "/api/rules/:id", async (ctx) => {
  const rule = await getRuleWithConditions(ctx.db, parseInt(ctx.params.id));
  if (!rule || rule.user !== ctx.user) {
    return json({ error: "Rule not found" }, 404);
  }
  return json(rule);
});

route("PATCH", "/api/rules/:id", async (ctx, request) => {
  const ruleId = parseInt(ctx.params.id);
  const existing = await getRuleWithConditions(ctx.db, ruleId);
  if (!existing || existing.user !== ctx.user) {
    return json({ error: "Rule not found" }, 404);
  }

  const body = await request.json<{
    name?: string;
    priority?: number;
    operator?: RuleOperator;
    action?: RuleAction;
    forward_to?: string | null;
    active?: boolean;
    conditions?: { field: ConditionField; match: ConditionMatch; value: string }[];
  }>();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.operator !== undefined) updates.operator = body.operator;
  if (body.action !== undefined) updates.action = body.action;
  if (body.forward_to !== undefined) updates.forward_to = body.forward_to;
  if (body.active !== undefined) updates.active = body.active ? 1 : 0;

  if (Object.keys(updates).length > 0) {
    await updateRule(ctx.db, ruleId, updates);
  }

  if (body.conditions) {
    await setRuleConditions(ctx.db, ruleId, body.conditions);
  }

  const updated = await getRuleWithConditions(ctx.db, ruleId);
  return json(updated);
});

route("DELETE", "/api/rules/:id", async (ctx) => {
  const ruleId = parseInt(ctx.params.id);
  const existing = await getRuleWithConditions(ctx.db, ruleId);
  if (!existing || existing.user !== ctx.user) {
    return json({ error: "Rule not found" }, 404);
  }

  await deleteRule(ctx.db, ruleId);
  return json({ ok: true });
});

route("POST", "/api/rules/reorder", async (ctx, request) => {
  const body = await request.json<{ rule_ids: number[] }>();
  if (!body.rule_ids || !Array.isArray(body.rule_ids)) {
    return json({ error: "rule_ids array is required" }, 400);
  }

  await reorderRules(ctx.db, ctx.user, body.rule_ids);
  const rules = await listRulesWithConditions(ctx.db, ctx.user);
  return json(rules);
});
