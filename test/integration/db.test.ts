import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import { getSettings, updateSettings, addBandwidth, resetBandwidth, resetAllBandwidth } from "../../src/db/settings";
import { createAlias, getAlias, listAliases, updateAlias, deleteAlias, incrementForwarded, incrementRejected, resetCounter } from "../../src/db/aliases";
import { addRecipient, listRecipients, getRecipient, deleteRecipient } from "../../src/db/recipients";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_settings (user TEXT PRIMARY KEY, catch_all INTEGER NOT NULL DEFAULT 1, from_name_format TEXT NOT NULL DEFAULT 'sender_count_alias', default_limit INTEGER NOT NULL DEFAULT 24, bandwidth_limit INTEGER NOT NULL DEFAULT 104857600, bandwidth_used INTEGER NOT NULL DEFAULT 0, bandwidth_reset_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS recipients (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, email TEXT NOT NULL, verified_at TEXT, cf_destination_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user, email));
CREATE TABLE IF NOT EXISTS aliases (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, tag TEXT NOT NULL, description TEXT, "limit" INTEGER NOT NULL DEFAULT 24, forwarded INTEGER NOT NULL DEFAULT 0, rejected INTEGER NOT NULL DEFAULT 0, bytes_forwarded INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_forwarded_at TEXT, last_rejected_at TEXT, UNIQUE(user, tag));
CREATE TABLE IF NOT EXISTS whitelist_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, alias_id INTEGER NOT NULL, type TEXT NOT NULL, pattern TEXT NOT NULL, UNIQUE(alias_id, type, pattern));
CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, name TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, operator TEXT NOT NULL DEFAULT 'and', action TEXT NOT NULL DEFAULT 'block', forward_to TEXT, active INTEGER NOT NULL DEFAULT 1, hit_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_hit_at TEXT);
CREATE TABLE IF NOT EXISTS rule_conditions (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id INTEGER NOT NULL, field TEXT NOT NULL, match TEXT NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS failed_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, alias_tag TEXT, sender TEXT, subject TEXT, reason TEXT NOT NULL, message_size INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`;

describe("DB integration tests", () => {
  beforeAll(async () => {
    await env.DB.exec(SCHEMA);
  });

  beforeEach(async () => {
    const tables = ["failed_deliveries", "rule_conditions", "rules", "whitelist_entries", "aliases", "recipients", "user_settings"];
    for (const table of tables) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
  });

  describe("settings", () => {
    it("auto-creates settings on first access", async () => {
      const settings = await getSettings(env.DB, "testuser");
      expect(settings.user).toBe("testuser");
      expect(settings.catch_all).toBe(1);
      expect(settings.from_name_format).toBe("sender_count_alias");
      expect(settings.default_limit).toBe(24);
      expect(settings.bandwidth_used).toBe(0);
    });

    it("updates settings", async () => {
      await getSettings(env.DB, "testuser");
      await updateSettings(env.DB, "testuser", {
        catch_all: 0,
        from_name_format: "noreply",
        default_limit: 50,
      });
      const updated = await getSettings(env.DB, "testuser");
      expect(updated.catch_all).toBe(0);
      expect(updated.from_name_format).toBe("noreply");
      expect(updated.default_limit).toBe(50);
    });

    it("tracks bandwidth", async () => {
      await getSettings(env.DB, "testuser");
      await addBandwidth(env.DB, "testuser", 1024);
      await addBandwidth(env.DB, "testuser", 2048);
      const settings = await getSettings(env.DB, "testuser");
      expect(settings.bandwidth_used).toBe(3072);
    });

    it("resets bandwidth for a single user", async () => {
      await getSettings(env.DB, "testuser");
      await addBandwidth(env.DB, "testuser", 5000);
      await resetBandwidth(env.DB, "testuser");
      const settings = await getSettings(env.DB, "testuser");
      expect(settings.bandwidth_used).toBe(0);
    });

    it("resets all bandwidth (cron)", async () => {
      await getSettings(env.DB, "user1");
      await getSettings(env.DB, "user2");
      await addBandwidth(env.DB, "user1", 1000);
      await addBandwidth(env.DB, "user2", 2000);

      const count = await resetAllBandwidth(env.DB);
      expect(count).toBe(2);

      const s1 = await getSettings(env.DB, "user1");
      const s2 = await getSettings(env.DB, "user2");
      expect(s1.bandwidth_used).toBe(0);
      expect(s2.bandwidth_used).toBe(0);
    });

    it("resetAllBandwidth skips users with zero bandwidth", async () => {
      await getSettings(env.DB, "user1");
      const count = await resetAllBandwidth(env.DB);
      expect(count).toBe(0);
    });
  });

  describe("aliases", () => {
    it("creates and retrieves an alias", async () => {
      const alias = await createAlias(env.DB, "testuser", "shop", 10, "Shopping");
      expect(alias.user).toBe("testuser");
      expect(alias.tag).toBe("shop");
      expect(alias.limit).toBe(10);
      expect(alias.description).toBe("Shopping");
      expect(alias.forwarded).toBe(0);
      expect(alias.active).toBe(1);

      const fetched = await getAlias(env.DB, "testuser", "shop");
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(alias.id);
    });

    it("lists aliases for a user", async () => {
      await createAlias(env.DB, "testuser", "a1", 10);
      await createAlias(env.DB, "testuser", "a2", 20);
      await createAlias(env.DB, "other", "a3", 5);

      const list = await listAliases(env.DB, "testuser");
      expect(list).toHaveLength(2);
      expect(list.map((a) => a.tag).sort()).toEqual(["a1", "a2"]);
    });

    it("updates alias fields", async () => {
      await createAlias(env.DB, "testuser", "shop", 10);
      await updateAlias(env.DB, "testuser", "shop", { limit: 50, description: "Updated", active: 0 });
      const alias = await getAlias(env.DB, "testuser", "shop");
      expect(alias!.limit).toBe(50);
      expect(alias!.description).toBe("Updated");
      expect(alias!.active).toBe(0);
    });

    it("increments forwarded counter and bytes", async () => {
      const alias = await createAlias(env.DB, "testuser", "shop", 10);
      await incrementForwarded(env.DB, alias.id, 512);
      await incrementForwarded(env.DB, alias.id, 1024);
      const updated = await getAlias(env.DB, "testuser", "shop");
      expect(updated!.forwarded).toBe(2);
      expect(updated!.bytes_forwarded).toBe(1536);
    });

    it("increments rejected counter", async () => {
      const alias = await createAlias(env.DB, "testuser", "shop", 10);
      await incrementRejected(env.DB, alias.id);
      await incrementRejected(env.DB, alias.id);
      const updated = await getAlias(env.DB, "testuser", "shop");
      expect(updated!.rejected).toBe(2);
    });

    it("resets counters", async () => {
      const alias = await createAlias(env.DB, "testuser", "shop", 10);
      await incrementForwarded(env.DB, alias.id, 100);
      await incrementRejected(env.DB, alias.id);
      await resetCounter(env.DB, "testuser", "shop");
      const updated = await getAlias(env.DB, "testuser", "shop");
      expect(updated!.forwarded).toBe(0);
      expect(updated!.rejected).toBe(0);
    });

    it("deletes an alias", async () => {
      await createAlias(env.DB, "testuser", "shop", 10);
      await deleteAlias(env.DB, "testuser", "shop");
      const alias = await getAlias(env.DB, "testuser", "shop");
      expect(alias).toBeNull();
    });
  });

  describe("recipients", () => {
    it("adds and lists recipients", async () => {
      await addRecipient(env.DB, "testuser", "a@example.com");
      await addRecipient(env.DB, "testuser", "b@example.com");

      const list = await listRecipients(env.DB, "testuser");
      expect(list).toHaveLength(2);
      expect(list.map((r) => r.email).sort()).toEqual(["a@example.com", "b@example.com"]);
    });

    it("recipient starts unverified with no cf_destination_id", async () => {
      const r = await addRecipient(env.DB, "testuser", "a@example.com");
      expect(r.verified_at).toBeNull();
      expect(r.cf_destination_id).toBeNull();
      expect(r.active).toBe(1);
    });

    it("deletes a recipient", async () => {
      const r = await addRecipient(env.DB, "testuser", "a@example.com");
      const deleted = await deleteRecipient(env.DB, "testuser", r.id);
      expect(deleted).not.toBeNull();
      expect(deleted!.email).toBe("a@example.com");

      const fetched = await getRecipient(env.DB, "testuser", r.id);
      expect(fetched).toBeNull();
    });

    it("does not delete another user's recipient", async () => {
      const r = await addRecipient(env.DB, "user1", "a@example.com");
      const deleted = await deleteRecipient(env.DB, "user2", r.id);
      expect(deleted).toBeNull();

      const still = await getRecipient(env.DB, "user1", r.id);
      expect(still).not.toBeNull();
    });
  });
});
