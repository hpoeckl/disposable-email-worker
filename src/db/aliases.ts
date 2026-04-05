import type { Alias } from "./types";

export async function getAlias(
  db: D1Database,
  user: string,
  tag: string,
): Promise<Alias | null> {
  return db
    .prepare("SELECT * FROM aliases WHERE user = ? AND tag = ?")
    .bind(user, tag)
    .first<Alias>();
}

export async function listAliases(
  db: D1Database,
  user: string,
): Promise<Alias[]> {
  const result = await db
    .prepare(
      `SELECT a.*, (SELECT COUNT(*) FROM whitelist_entries w WHERE w.alias_id = a.id) AS whitelist_count
       FROM aliases a WHERE a.user = ? ORDER BY a.created_at DESC`,
    )
    .bind(user)
    .all<Alias>();
  return result.results;
}

export async function listAllAliases(db: D1Database): Promise<Alias[]> {
  const result = await db
    .prepare(
      `SELECT a.*, (SELECT COUNT(*) FROM whitelist_entries w WHERE w.alias_id = a.id) AS whitelist_count
       FROM aliases a ORDER BY a.user, a.created_at DESC`,
    )
    .all<Alias>();
  return result.results;
}

export async function createAlias(
  db: D1Database,
  user: string,
  tag: string,
  limit: number,
  description?: string,
): Promise<Alias> {
  const result = await db
    .prepare(
      `INSERT INTO aliases (user, tag, "limit", description) VALUES (?, ?, ?, ?)`,
    )
    .bind(user, tag, limit, description ?? null)
    .run();

  return db
    .prepare("SELECT * FROM aliases WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Alias>() as Promise<Alias>;
}

export async function updateAlias(
  db: D1Database,
  user: string,
  tag: string,
  updates: {
    limit?: number;
    description?: string | null;
    active?: number;
  },
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.limit !== undefined) {
    fields.push('"limit" = ?');
    values.push(updates.limit);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.active !== undefined) {
    fields.push("active = ?");
    values.push(updates.active);
  }

  if (fields.length === 0) return;

  values.push(user, tag);
  await db
    .prepare(
      `UPDATE aliases SET ${fields.join(", ")} WHERE user = ? AND tag = ?`,
    )
    .bind(...values)
    .run();
}

export async function resetCounter(
  db: D1Database,
  user: string,
  tag: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE aliases SET forwarded = 0, rejected = 0 WHERE user = ? AND tag = ?",
    )
    .bind(user, tag)
    .run();
}

export async function incrementForwarded(
  db: D1Database,
  aliasId: number,
  messageSize: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE aliases SET forwarded = forwarded + 1,
       bytes_forwarded = bytes_forwarded + ?,
       last_forwarded_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(messageSize, aliasId)
    .run();
}

export async function incrementRejected(
  db: D1Database,
  aliasId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE aliases SET rejected = rejected + 1,
       last_rejected_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(aliasId)
    .run();
}

export async function deleteAlias(
  db: D1Database,
  user: string,
  tag: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM aliases WHERE user = ? AND tag = ?")
    .bind(user, tag)
    .run();
}

export async function getAliasRecipientEmails(
  db: D1Database,
  aliasId: number,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT r.email FROM recipients r
       INNER JOIN alias_recipients ar ON ar.recipient_id = r.id
       WHERE ar.alias_id = ? AND r.verified_at IS NOT NULL`,
    )
    .bind(aliasId)
    .all<{ email: string }>();
  return result.results.map((r) => r.email);
}

export async function setAliasRecipients(
  db: D1Database,
  aliasId: number,
  recipientIds: number[],
): Promise<void> {
  await db
    .prepare("DELETE FROM alias_recipients WHERE alias_id = ?")
    .bind(aliasId)
    .run();

  for (const recipientId of recipientIds) {
    await db
      .prepare(
        "INSERT INTO alias_recipients (alias_id, recipient_id) VALUES (?, ?)",
      )
      .bind(aliasId, recipientId)
      .run();
  }
}
