import { route, json, effectiveUser } from "../router";
import { getAlias, listAllAliases } from "../db/aliases";
import {
  listWhitelistEntries,
  addWhitelistEntry,
  removeWhitelistEntry,
} from "../db/whitelist";
import type { WhitelistEntryType } from "../db/types";

async function resolveAlias(ctx: import("../router").RequestContext, request: Request) {
  const { tag } = ctx.params;
  const user = effectiveUser(ctx, request);
  const alias = await getAlias(ctx.db, user, tag);
  if (alias) return alias;

  // Admin without ?user=: search all users
  if (ctx.isAdmin && user === ctx.user) {
    const all = await listAllAliases(ctx.db);
    return all.find((a) => a.tag === tag) ?? null;
  }
  return null;
}

route("GET", "/api/aliases/:tag/whitelist", async (ctx, request) => {
  const alias = await resolveAlias(ctx, request);
  if (!alias) return json({ error: "Alias not found" }, 404);

  const entries = await listWhitelistEntries(ctx.db, alias.id);
  return json(entries);
});

route("POST", "/api/aliases/:tag/whitelist", async (ctx, request) => {
  const alias = await resolveAlias(ctx, request);
  if (!alias) return json({ error: "Alias not found" }, 404);

  const body = await request.json<{ type: WhitelistEntryType; pattern: string }>();
  if (!body.type || !body.pattern) {
    return json({ error: "type and pattern are required" }, 400);
  }

  const validTypes: WhitelistEntryType[] = ["email", "domain", "segment"];
  if (!validTypes.includes(body.type)) {
    return json({ error: "type must be email, domain, or segment" }, 400);
  }

  const entry = await addWhitelistEntry(ctx.db, alias.id, body.type, body.pattern);
  return json(entry, 201);
});

route("DELETE", "/api/aliases/:tag/whitelist/:id", async (ctx, request) => {
  const alias = await resolveAlias(ctx, request);
  if (!alias) return json({ error: "Alias not found" }, 404);

  await removeWhitelistEntry(ctx.db, parseInt(ctx.params.id));
  return json({ ok: true });
});
