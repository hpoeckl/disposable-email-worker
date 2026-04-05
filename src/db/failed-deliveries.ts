import type { FailedDelivery } from "./types";

export async function logFailedDelivery(
  db: D1Database,
  entry: {
    user: string;
    alias_tag?: string;
    sender?: string;
    subject?: string;
    reason: string;
    message_size?: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO failed_deliveries (user, alias_tag, sender, subject, reason, message_size)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.user,
      entry.alias_tag ?? null,
      entry.sender ?? null,
      entry.subject ? entry.subject.substring(0, 200) : null,
      entry.reason,
      entry.message_size ?? null,
    )
    .run();
}

export async function listFailedDeliveries(
  db: D1Database,
  user: string,
): Promise<FailedDelivery[]> {
  const result = await db
    .prepare(
      "SELECT * FROM failed_deliveries WHERE user = ? ORDER BY created_at DESC",
    )
    .bind(user)
    .all<FailedDelivery>();
  return result.results;
}

export async function listAllFailedDeliveries(
  db: D1Database,
): Promise<FailedDelivery[]> {
  const result = await db
    .prepare("SELECT * FROM failed_deliveries ORDER BY created_at DESC")
    .all<FailedDelivery>();
  return result.results;
}

export async function deleteFailedDelivery(
  db: D1Database,
  user: string,
  id: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM failed_deliveries WHERE id = ? AND user = ?")
    .bind(id, user)
    .run();
}

export async function purgeOldDeliveries(
  db: D1Database,
  user: string,
  days: number,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM failed_deliveries
       WHERE user = ? AND created_at < datetime('now', '-' || ? || ' days')`,
    )
    .bind(user, days)
    .run();
}

export async function purgeAllOldDeliveries(
  db: D1Database,
  days: number,
): Promise<number> {
  const result = await db
    .prepare(
      "DELETE FROM failed_deliveries WHERE created_at < datetime('now', '-' || ? || ' days')",
    )
    .bind(days)
    .run();
  return result.meta.changes ?? 0;
}
