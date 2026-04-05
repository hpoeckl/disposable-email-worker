import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { env, exports } from "cloudflare:workers";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_settings (user TEXT PRIMARY KEY, catch_all INTEGER NOT NULL DEFAULT 1, from_name_format TEXT NOT NULL DEFAULT 'sender_count_alias', default_limit INTEGER NOT NULL DEFAULT 24, bandwidth_limit INTEGER NOT NULL DEFAULT 104857600, bandwidth_used INTEGER NOT NULL DEFAULT 0, bandwidth_reset_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS recipients (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, email TEXT NOT NULL, verified_at TEXT, cf_destination_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user, email));
CREATE TABLE IF NOT EXISTS aliases (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, tag TEXT NOT NULL, description TEXT, "limit" INTEGER NOT NULL DEFAULT 24, forwarded INTEGER NOT NULL DEFAULT 0, rejected INTEGER NOT NULL DEFAULT 0, bytes_forwarded INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_forwarded_at TEXT, last_rejected_at TEXT, UNIQUE(user, tag));
CREATE TABLE IF NOT EXISTS whitelist_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, alias_id INTEGER NOT NULL, type TEXT NOT NULL, pattern TEXT NOT NULL, UNIQUE(alias_id, type, pattern));
CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, name TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, operator TEXT NOT NULL DEFAULT 'and', action TEXT NOT NULL DEFAULT 'block', forward_to TEXT, active INTEGER NOT NULL DEFAULT 1, hit_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_hit_at TEXT);
CREATE TABLE IF NOT EXISTS rule_conditions (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id INTEGER NOT NULL, field TEXT NOT NULL, match TEXT NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS failed_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, alias_tag TEXT, sender TEXT, subject TEXT, reason TEXT NOT NULL, message_size INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`;

// Mock the auth module — bypass JWT validation
vi.mock("../../src/auth", () => ({
  validateAccessJwt: async () => ({ email: "testuser@example.com" }),
  AuthError: class AuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthError";
    }
  },
}));

async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      "Cf-Access-Jwt-Assertion": "mock-token",
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  return exports.default.fetch!(
    new Request(`http://localhost${path}`, init),
    env,
  );
}

async function apiJson<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const resp = await apiRequest(method, path, body);
  const data = (await resp.json()) as T;
  return { status: resp.status, data };
}

describe("API integration tests", () => {
  beforeAll(async () => {
    await env.DB.exec(SCHEMA);
  });

  beforeEach(async () => {
    const tables = ["failed_deliveries", "rule_conditions", "rules", "whitelist_entries", "aliases", "recipients", "user_settings"];
    for (const table of tables) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
  });

  describe("GET /api/me", () => {
    it("returns current user info", async () => {
      const { status, data } = await apiJson("GET", "/api/me");
      expect(status).toBe(200);
      expect(data).toMatchObject({
        user: "testuser",
        email: "testuser@example.com",
      });
    });
  });

  describe("/api/aliases", () => {
    it("creates and lists aliases", async () => {
      const { status: createStatus, data: created } = await apiJson(
        "POST", "/api/aliases", { tag: "shop", limit: 10, description: "Shopping" },
      );
      expect(createStatus).toBe(201);
      expect(created).toMatchObject({ tag: "shop", limit: 10, description: "Shopping" });

      const { data: list } = await apiJson<unknown[]>("GET", "/api/aliases");
      expect(list).toHaveLength(1);
    });

    it("rejects duplicate alias", async () => {
      await apiRequest("POST", "/api/aliases", { tag: "dup" });
      const { status } = await apiJson("POST", "/api/aliases", { tag: "dup" });
      expect(status).toBe(409);
    });

    it("gets a single alias", async () => {
      await apiRequest("POST", "/api/aliases", { tag: "myalias" });
      const { status, data } = await apiJson("GET", "/api/aliases/myalias");
      expect(status).toBe(200);
      expect(data).toMatchObject({ tag: "myalias" });
    });

    it("patches alias fields", async () => {
      await apiRequest("POST", "/api/aliases", { tag: "patchme", limit: 5 });
      const { data } = await apiJson("PATCH", "/api/aliases/patchme", {
        limit: 100,
        description: "Updated",
        active: false,
      });
      expect(data).toMatchObject({ limit: 100, description: "Updated", active: 0 });
    });

    it("resets counter via PATCH", async () => {
      await apiRequest("POST", "/api/aliases", { tag: "counted" });
      // Manually increment to simulate forwarding
      const { data: alias } = await apiJson<{ id: number }>("GET", "/api/aliases/counted");
      await env.DB.prepare("UPDATE aliases SET forwarded = 5, rejected = 3 WHERE id = ?").bind(alias.id).run();

      const { data } = await apiJson("PATCH", "/api/aliases/counted", { reset_counter: true });
      expect(data).toMatchObject({ forwarded: 0, rejected: 0 });
    });

    it("deletes an alias", async () => {
      await apiRequest("POST", "/api/aliases", { tag: "deleteme" });
      const { status } = await apiJson("DELETE", "/api/aliases/deleteme");
      expect(status).toBe(200);

      const { status: getStatus } = await apiJson("GET", "/api/aliases/deleteme");
      expect(getStatus).toBe(404);
    });

    it("returns 404 for nonexistent alias", async () => {
      const { status } = await apiJson("GET", "/api/aliases/nope");
      expect(status).toBe(404);
    });
  });

  describe("/api/rules", () => {
    it("creates a rule with conditions", async () => {
      const { status, data } = await apiJson("POST", "/api/rules", {
        name: "Block spam",
        action: "block",
        conditions: [{ field: "sender_domain", match: "equals", value: "spam.com" }],
      });
      expect(status).toBe(201);
      expect(data).toMatchObject({ name: "Block spam", action: "block" });
    });

    it("rejects rule without conditions", async () => {
      const { status } = await apiJson("POST", "/api/rules", {
        name: "No conditions",
        conditions: [],
      });
      expect(status).toBe(400);
    });

    it("lists rules", async () => {
      await apiRequest("POST", "/api/rules", {
        name: "R1",
        conditions: [{ field: "sender", match: "contains", value: "test" }],
      });
      await apiRequest("POST", "/api/rules", {
        name: "R2",
        conditions: [{ field: "subject", match: "contains", value: "promo" }],
      });

      const { data } = await apiJson<unknown[]>("GET", "/api/rules");
      expect(data).toHaveLength(2);
    });

    it("deletes a rule", async () => {
      const { data: created } = await apiJson<{ id: number }>("POST", "/api/rules", {
        name: "ToDelete",
        conditions: [{ field: "sender", match: "equals", value: "x@y.com" }],
      });

      const { status } = await apiJson("DELETE", `/api/rules/${created.id}`);
      expect(status).toBe(200);

      const { status: getStatus } = await apiJson("GET", `/api/rules/${created.id}`);
      expect(getStatus).toBe(404);
    });
  });

  describe("/api/settings", () => {
    it("returns default settings", async () => {
      const { data } = await apiJson("GET", "/api/settings");
      expect(data).toMatchObject({
        catch_all: 1,
        from_name_format: "sender_count_alias",
        default_limit: 24,
      });
    });

    it("updates settings via direct DB then API", async () => {
      // First, verify direct DB update works within the worker context
      const { getSettings, updateSettings } = await import("../../src/db/settings");
      await getSettings(env.DB, "testuser"); // auto-create
      await updateSettings(env.DB, "testuser", {
        catch_all: 0,
        from_name_format: "alias_only",
        default_limit: 50,
      });
      const s = await getSettings(env.DB, "testuser");
      expect(s.catch_all).toBe(0);
      expect(s.from_name_format).toBe("alias_only");
      expect(s.default_limit).toBe(50);
    });

    it("updates settings via API", async () => {
      // GET first to auto-create row
      await apiRequest("GET", "/api/settings");

      const { status, data } = await apiJson("PATCH", "/api/settings", {
        catch_all: false,
        from_name_format: "alias_only",
        default_limit: 50,
      });
      expect(status).toBe(200);
      expect(data).toMatchObject({
        catch_all: 0,
        from_name_format: "alias_only",
        default_limit: 50,
      });

      // Verify via separate GET
      const { data: fetched } = await apiJson("GET", "/api/settings");
      expect(fetched).toMatchObject({
        catch_all: 0,
        from_name_format: "alias_only",
        default_limit: 50,
      });
    });
  });

  describe("/api/recipients", () => {
    it("adds a recipient (without CF API)", async () => {
      const { status, data } = await apiJson("POST", "/api/recipients", {
        email: "dest@example.com",
      });
      expect(status).toBe(201);
      expect(data).toMatchObject({ email: "dest@example.com", verified_at: null });
    });

    it("lists recipients", async () => {
      await apiRequest("POST", "/api/recipients", { email: "a@test.com" });
      await apiRequest("POST", "/api/recipients", { email: "b@test.com" });
      const { data } = await apiJson<unknown[]>("GET", "/api/recipients");
      expect(data).toHaveLength(2);
    });

    it("toggles recipient active flag", async () => {
      const { data: r } = await apiJson<{ id: number }>("POST", "/api/recipients", {
        email: "toggle@test.com",
      });
      await apiRequest("PATCH", `/api/recipients/${r.id}`, { active: false });

      // Verify via DB directly
      const row = await env.DB.prepare("SELECT active FROM recipients WHERE id = ?")
        .bind(r.id).first<{ active: number }>();
      expect(row!.active).toBe(0);
    });

    it("deletes a recipient", async () => {
      const { data: r } = await apiJson<{ id: number }>("POST", "/api/recipients", {
        email: "delete@test.com",
      });
      const { status } = await apiJson("DELETE", `/api/recipients/${r.id}`);
      expect(status).toBe(200);

      const { data: list } = await apiJson<unknown[]>("GET", "/api/recipients");
      expect(list).toHaveLength(0);
    });
  });

  describe("404 handling", () => {
    it("returns 404 for unknown API route", async () => {
      const { status, data } = await apiJson("GET", "/api/nonexistent");
      expect(status).toBe(404);
      expect(data).toMatchObject({ error: "Not found" });
    });
  });
});
