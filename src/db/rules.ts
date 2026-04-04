import type {
  Rule,
  RuleCondition,
  RuleWithConditions,
  RuleOperator,
  RuleAction,
  ConditionField,
  ConditionMatch,
} from "./types";

export async function listRules(
  db: D1Database,
  user: string,
): Promise<Rule[]> {
  const result = await db
    .prepare("SELECT * FROM rules WHERE user = ? ORDER BY priority ASC")
    .bind(user)
    .all<Rule>();
  return result.results;
}

export async function getRuleWithConditions(
  db: D1Database,
  ruleId: number,
): Promise<RuleWithConditions | null> {
  const rule = await db
    .prepare("SELECT * FROM rules WHERE id = ?")
    .bind(ruleId)
    .first<Rule>();

  if (!rule) return null;

  const conditions = await db
    .prepare("SELECT * FROM rule_conditions WHERE rule_id = ?")
    .bind(ruleId)
    .all<RuleCondition>();

  return { ...rule, conditions: conditions.results };
}

interface RuleConditionRow extends Rule {
  cond_id: number | null;
  cond_rule_id: number | null;
  cond_field: RuleCondition["field"] | null;
  cond_match: RuleCondition["match"] | null;
  cond_value: string | null;
}

export async function listRulesWithConditions(
  db: D1Database,
  user: string,
): Promise<RuleWithConditions[]> {
  const { results } = await db
    .prepare(
      `SELECT r.*,
              rc.id AS cond_id,
              rc.rule_id AS cond_rule_id,
              rc.field AS cond_field,
              rc.match AS cond_match,
              rc.value AS cond_value
       FROM rules r
       LEFT JOIN rule_conditions rc ON rc.rule_id = r.id
       WHERE r.user = ?
       ORDER BY r.priority ASC, rc.id ASC`,
    )
    .bind(user)
    .all<RuleConditionRow>();

  const rulesMap = new Map<number, RuleWithConditions>();

  for (const row of results) {
    if (!rulesMap.has(row.id)) {
      rulesMap.set(row.id, {
        id: row.id,
        user: row.user,
        name: row.name,
        priority: row.priority,
        operator: row.operator,
        action: row.action,
        forward_to: row.forward_to,
        active: row.active,
        hit_count: row.hit_count,
        created_at: row.created_at,
        last_hit_at: row.last_hit_at,
        conditions: [],
      });
    }

    if (row.cond_id !== null) {
      rulesMap.get(row.id)!.conditions.push({
        id: row.cond_id,
        rule_id: row.cond_rule_id!,
        field: row.cond_field!,
        match: row.cond_match!,
        value: row.cond_value!,
      });
    }
  }

  return Array.from(rulesMap.values());
}

export async function createRule(
  db: D1Database,
  user: string,
  input: {
    name: string;
    priority?: number;
    operator?: RuleOperator;
    action?: RuleAction;
    forward_to?: string | null;
    conditions: { field: ConditionField; match: ConditionMatch; value: string }[];
  },
): Promise<RuleWithConditions> {
  const result = await db
    .prepare(
      `INSERT INTO rules (user, name, priority, operator, action, forward_to)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      user,
      input.name,
      input.priority ?? 0,
      input.operator ?? "and",
      input.action ?? "block",
      input.forward_to ?? null,
    )
    .run();

  const ruleId = result.meta.last_row_id;

  for (const cond of input.conditions) {
    await db
      .prepare(
        "INSERT INTO rule_conditions (rule_id, field, match, value) VALUES (?, ?, ?, ?)",
      )
      .bind(ruleId, cond.field, cond.match, cond.value)
      .run();
  }

  return getRuleWithConditions(db, ruleId as number) as Promise<RuleWithConditions>;
}

export async function updateRule(
  db: D1Database,
  ruleId: number,
  updates: {
    name?: string;
    priority?: number;
    operator?: RuleOperator;
    action?: RuleAction;
    forward_to?: string | null;
    active?: number;
  },
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.priority !== undefined) {
    fields.push("priority = ?");
    values.push(updates.priority);
  }
  if (updates.operator !== undefined) {
    fields.push("operator = ?");
    values.push(updates.operator);
  }
  if (updates.action !== undefined) {
    fields.push("action = ?");
    values.push(updates.action);
  }
  if (updates.forward_to !== undefined) {
    fields.push("forward_to = ?");
    values.push(updates.forward_to);
  }
  if (updates.active !== undefined) {
    fields.push("active = ?");
    values.push(updates.active);
  }

  if (fields.length === 0) return;

  values.push(ruleId);
  await db
    .prepare(`UPDATE rules SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteRule(
  db: D1Database,
  ruleId: number,
): Promise<void> {
  await db.prepare("DELETE FROM rules WHERE id = ?").bind(ruleId).run();
}

export async function setRuleConditions(
  db: D1Database,
  ruleId: number,
  conditions: { field: ConditionField; match: ConditionMatch; value: string }[],
): Promise<void> {
  await db
    .prepare("DELETE FROM rule_conditions WHERE rule_id = ?")
    .bind(ruleId)
    .run();

  for (const cond of conditions) {
    await db
      .prepare(
        "INSERT INTO rule_conditions (rule_id, field, match, value) VALUES (?, ?, ?, ?)",
      )
      .bind(ruleId, cond.field, cond.match, cond.value)
      .run();
  }
}

export async function incrementRuleHit(
  db: D1Database,
  ruleId: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE rules SET hit_count = hit_count + 1, last_hit_at = datetime('now') WHERE id = ?",
    )
    .bind(ruleId)
    .run();
}

export async function reorderRules(
  db: D1Database,
  user: string,
  ruleIds: number[],
): Promise<void> {
  for (let i = 0; i < ruleIds.length; i++) {
    await db
      .prepare("UPDATE rules SET priority = ? WHERE id = ? AND user = ?")
      .bind(i, ruleIds[i], user)
      .run();
  }
}
