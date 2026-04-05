import type { UserSettings, FromNameFormat } from "./types";

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
