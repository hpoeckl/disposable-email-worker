import { route, json, RequestContext } from "../router";
import {
  listAliases,
  listAllAliases,
  getAlias,
  createAlias,
  updateAlias,
  deleteAlias,
  resetCounter,
} from "../db/aliases";

route("GET", "/api/aliases", async (ctx) => {
  const aliases = ctx.isAdmin
    ? await listAllAliases(ctx.db)
    : await listAliases(ctx.db, ctx.user);
  return json(aliases);
});

route("POST", "/api/aliases", async (ctx, request) => {
  const body = await request.json<{ tag: string; limit?: number; description?: string }>();
  if (!body.tag) return json({ error: "tag is required" }, 400);

  const existing = await getAlias(ctx.db, ctx.user, body.tag);
  if (existing) return json({ error: "Alias already exists" }, 409);

  const alias = await createAlias(
    ctx.db,
    ctx.user,
    body.tag,
    body.limit ?? 24,
    body.description,
  );
  return json(alias, 201);
});

route("GET", "/api/aliases/:tag", async (ctx) => {
  const alias = await resolveAlias(ctx);
  if (!alias) return json({ error: "Alias not found" }, 404);
  return json(alias);
});

route("PATCH", "/api/aliases/:tag", async (ctx, request) => {
  const alias = await resolveAlias(ctx);
  if (!alias) return json({ error: "Alias not found" }, 404);

  const body = await request.json<{
    limit?: number;
    description?: string | null;
    active?: boolean;
    reset_counter?: boolean;
  }>();

  const updates: { limit?: number; description?: string | null; active?: number } = {};
  if (body.limit !== undefined) updates.limit = body.limit;
  if (body.description !== undefined) updates.description = body.description;
  if (body.active !== undefined) updates.active = body.active ? 1 : 0;

  if (Object.keys(updates).length > 0) {
    await updateAlias(ctx.db, alias.user, alias.tag, updates);
  }

  if (body.reset_counter) {
    await resetCounter(ctx.db, alias.user, alias.tag);
  }

  const updated = await getAlias(ctx.db, alias.user, alias.tag);
  return json(updated);
});

route("DELETE", "/api/aliases/:tag", async (ctx) => {
  const alias = await resolveAlias(ctx);
  if (!alias) return json({ error: "Alias not found" }, 404);

  await deleteAlias(ctx.db, alias.user, alias.tag);
  return json({ ok: true });
});

async function resolveAlias(ctx: RequestContext) {
  const { tag } = ctx.params;
  // Admin can access any user's aliases via ?user= query param
  // Regular users can only access their own
  const alias = await getAlias(ctx.db, ctx.user, tag);
  if (alias) return alias;

  // Admin fallback: search all users
  if (ctx.isAdmin) {
    const all = await listAllAliases(ctx.db);
    return all.find((a) => a.tag === tag) ?? null;
  }

  return null;
}
