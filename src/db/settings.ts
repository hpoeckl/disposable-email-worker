import type { UserSettings, FromNameFormat, SubjectFormat } from "./types";

export async function getSettings(
  db: D1Database,
  user: string,
): Promise<UserSettings> {
  const row = await db
    .prepare("SELECT * FROM user_settings WHERE user = ?")
    .bind(user)
    .first<UserSettings>();

  if (row) return row;

  // Auto-create on first access with defaults
  await db
    .prepare("INSERT OR IGNORE INTO user_settings (user) VALUES (?)")
    .bind(user)
    .run();

  return db
    .prepare("SELECT * FROM user_settings WHERE user = ?")
    .bind(user)
    .first<UserSettings>() as Promise<UserSettings>;
}

export async function updateSettings(
  db: D1Database,
  user: string,
  updates: {
    catch_all?: number;
    from_name_format?: FromNameFormat;
    subject_format?: SubjectFormat;
    default_limit?: number;
  },
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.catch_all !== undefined) {
    fields.push("catch_all = ?");
    values.push(updates.catch_all);
  }
  if (updates.from_name_format !== undefined) {
    fields.push("from_name_format = ?");
    values.push(updates.from_name_format);
  }
  if (updates.subject_format !== undefined) {
    fields.push("subject_format = ?");
    values.push(updates.subject_format);
  }
  if (updates.default_limit !== undefined) {
    fields.push("default_limit = ?");
    values.push(updates.default_limit);
  }

  if (fields.length === 0) return;

  values.push(user);
  await db
    .prepare(`UPDATE user_settings SET ${fields.join(", ")} WHERE user = ?`)
    .bind(...values)
    .run();
}

export interface UserSummary {
  user: string;
  alias_count: number;
  recipient_count: number;
  rule_count: number;
  bandwidth_used: number;
  bandwidth_limit: number;
  created_at: string | null;
}

export async function listUsers(db: D1Database): Promise<UserSummary[]> {
  return (
    await db
      .prepare(
        `SELECT
          s.user,
          s.bandwidth_used,
          s.bandwidth_limit,
          (SELECT MIN(created_at) FROM aliases WHERE user = s.user) as created_at,
          (SELECT COUNT(*) FROM aliases WHERE user = s.user) as alias_count,
          (SELECT COUNT(*) FROM recipients WHERE user = s.user) as recipient_count,
          (SELECT COUNT(*) FROM rules WHERE user = s.user) as rule_count
        FROM user_settings s
        ORDER BY s.user`,
      )
      .all<UserSummary>()
  ).results;
}

export async function deleteUser(db: D1Database, user: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM failed_deliveries WHERE user = ?").bind(user),
    db.prepare("DELETE FROM rules WHERE user = ?").bind(user),
    db.prepare("DELETE FROM aliases WHERE user = ?").bind(user),
    db.prepare("DELETE FROM recipients WHERE user = ?").bind(user),
    db.prepare("DELETE FROM user_settings WHERE user = ?").bind(user),
  ]);
}

export async function addBandwidth(
  db: D1Database,
  user: string,
  bytes: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE user_settings SET bandwidth_used = bandwidth_used + ? WHERE user = ?",
    )
    .bind(bytes, user)
    .run();
}

export async function resetBandwidth(
  db: D1Database,
  user: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE user_settings SET bandwidth_used = 0, bandwidth_reset_at = datetime('now') WHERE user = ?",
    )
    .bind(user)
    .run();
}

export async function resetAllBandwidth(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      "UPDATE user_settings SET bandwidth_used = 0, bandwidth_reset_at = datetime('now') WHERE bandwidth_used > 0",
    )
    .run();
  return result.meta.changes ?? 0;
}
