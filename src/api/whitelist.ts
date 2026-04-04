import { route, json } from "../router";
import { getAlias } from "../db/aliases";
import {
  listWhitelistEntries,
  addWhitelistEntry,
  removeWhitelistEntry,
} from "../db/whitelist";
import type { WhitelistEntryType } from "../db/types";

route("GET", "/api/aliases/:tag/whitelist", async (ctx) => {
  const alias = await getAlias(ctx.db, ctx.user, ctx.params.tag);
  if (!alias) return json({ error: "Alias not found" }, 404);

  const entries = await listWhitelistEntries(ctx.db, alias.id);
  return json(entries);
});

route("POST", "/api/aliases/:tag/whitelist", async (ctx, request) => {
  const alias = await getAlias(ctx.db, ctx.user, ctx.params.tag);
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

route("DELETE", "/api/aliases/:tag/whitelist/:id", async (ctx) => {
  const alias = await getAlias(ctx.db, ctx.user, ctx.params.tag);
  if (!alias) return json({ error: "Alias not found" }, 404);

  await removeWhitelistEntry(ctx.db, parseInt(ctx.params.id));
  return json({ ok: true });
});
