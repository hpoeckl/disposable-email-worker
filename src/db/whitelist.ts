import type { WhitelistEntry, WhitelistEntryType } from "./types";

export async function listWhitelistEntries(
  db: D1Database,
  aliasId: number,
): Promise<WhitelistEntry[]> {
  const result = await db
    .prepare("SELECT * FROM whitelist_entries WHERE alias_id = ?")
    .bind(aliasId)
    .all<WhitelistEntry>();
  return result.results;
}

export async function addWhitelistEntry(
  db: D1Database,
  aliasId: number,
  type: WhitelistEntryType,
  pattern: string,
): Promise<WhitelistEntry> {
  const result = await db
    .prepare(
      "INSERT INTO whitelist_entries (alias_id, type, pattern) VALUES (?, ?, ?)",
    )
    .bind(aliasId, type, pattern)
    .run();

  return db
    .prepare("SELECT * FROM whitelist_entries WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<WhitelistEntry>() as Promise<WhitelistEntry>;
}

export async function removeWhitelistEntry(
  db: D1Database,
  id: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM whitelist_entries WHERE id = ?")
    .bind(id)
    .run();
}

export async function removeWhitelistEntriesByAlias(
  db: D1Database,
  aliasId: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM whitelist_entries WHERE alias_id = ?")
    .bind(aliasId)
    .run();
}
