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
): Promise<Recipient> {
  const result = await db
    .prepare("INSERT INTO recipients (user, email) VALUES (?, ?)")
    .bind(user, email)
    .run();

  return db
    .prepare("SELECT * FROM recipients WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Recipient>() as Promise<Recipient>;
}

export async function verifyRecipient(
  db: D1Database,
  id: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE recipients SET verified_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .run();
}

export async function deleteRecipient(
  db: D1Database,
  user: string,
  id: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM recipients WHERE id = ? AND user = ?")
    .bind(id, user)
    .run();
}
