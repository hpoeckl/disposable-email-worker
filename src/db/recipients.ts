import type { Recipient } from "./types";

export async function listRecipients(
  db: D1Database,
  user: string,
): Promise<Recipient[]> {
  const result = await db
    .prepare("SELECT * FROM recipients WHERE user = ? ORDER BY created_at DESC")
    .bind(user)
    .all<Recipient>();
  return result.results;
}

export async function getRecipient(
  db: D1Database,
  user: string,
  id: number,
): Promise<Recipient | null> {
  return db
    .prepare("SELECT * FROM recipients WHERE id = ? AND user = ?")
    .bind(id, user)
    .first<Recipient>();
}

export async function getRecipientByEmail(
  db: D1Database,
  user: string,
  email: string,
): Promise<Recipient | null> {
  return db
    .prepare("SELECT * FROM recipients WHERE user = ? AND email = ?")
    .bind(user, email)
    .first<Recipient>();
}

export async function addRecipient(
  db: D1Database,
  user: string,
  email: string,
  cfDestinationId?: string,
): Promise<Recipient> {
  const result = await db
    .prepare("INSERT INTO recipients (user, email, cf_destination_id) VALUES (?, ?, ?)")
    .bind(user, email, cfDestinationId ?? null)
    .run();

  return db
    .prepare("SELECT * FROM recipients WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Recipient>() as Promise<Recipient>;
}

export async function updateRecipientVerification(
  db: D1Database,
  id: number,
  verifiedAt: string | null,
): Promise<void> {
  await db
    .prepare("UPDATE recipients SET verified_at = ? WHERE id = ?")
    .bind(verifiedAt, id)
    .run();
}

export async function updateRecipientCfId(
  db: D1Database,
  id: number,
  cfDestinationId: string,
): Promise<void> {
  await db
    .prepare("UPDATE recipients SET cf_destination_id = ? WHERE id = ?")
    .bind(cfDestinationId, id)
    .run();
}

export async function deleteRecipient(
  db: D1Database,
  user: string,
  id: number,
): Promise<Recipient | null> {
  const recipient = await db
    .prepare("SELECT * FROM recipients WHERE id = ? AND user = ?")
    .bind(id, user)
    .first<Recipient>();
  if (recipient) {
    await db
      .prepare("DELETE FROM recipients WHERE id = ? AND user = ?")
      .bind(id, user)
      .run();
  }
  return recipient;
}

export async function listAllRecipients(
  db: D1Database,
): Promise<Recipient[]> {
  const result = await db
    .prepare("SELECT * FROM recipients ORDER BY created_at DESC")
    .all<Recipient>();
  return result.results;
}

export async function countRecipientsByEmail(
  db: D1Database,
  email: string,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as cnt FROM recipients WHERE LOWER(email) = LOWER(?)")
    .bind(email)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

