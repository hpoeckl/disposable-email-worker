import { route, json } from "../router";
import { listUsers, getSettings, deleteUser } from "../db/settings";

route("GET", "/api/users", async (ctx) => {
  if (!ctx.isAdmin) return json({ error: "Admin only" }, 403);
  return json(await listUsers(ctx.db));
});

route("POST", "/api/users", async (ctx, request) => {
  if (!ctx.isAdmin) return json({ error: "Admin only" }, 403);
  const body = await request.json<{ user: string }>();
  if (!body.user || !body.user.trim()) {
    return json({ error: "user is required" }, 400);
  }
  const user = body.user.trim().toLowerCase();
  // getSettings auto-creates the user_settings row
  const settings = await getSettings(ctx.db, user);
  return json(settings, 201);
});

route("DELETE", "/api/users/:user", async (ctx) => {
  if (!ctx.isAdmin) return json({ error: "Admin only" }, 403);
  const user = ctx.params.user;
  if (user === ctx.user) {
    return json({ error: "Cannot delete yourself" }, 400);
  }
  await deleteUser(ctx.db, user);
  return json({ ok: true });
});
