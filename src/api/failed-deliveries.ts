import { route, json, effectiveUser, isAdminAllUsers } from "../router";
import {
  listFailedDeliveries,
  listAllFailedDeliveries,
  deleteFailedDelivery,
  purgeOldDeliveries,
} from "../db/failed-deliveries";

route("GET", "/api/failed-deliveries", async (ctx, request) => {
  if (isAdminAllUsers(ctx, request)) {
    return json(await listAllFailedDeliveries(ctx.db));
  }
  const user = effectiveUser(ctx, request);
  return json(await listFailedDeliveries(ctx.db, user));
});

route("DELETE", "/api/failed-deliveries/:id", async (ctx) => {
  const id = parseInt(ctx.params.id);
  if (ctx.isAdmin) {
    await ctx.db.prepare("DELETE FROM failed_deliveries WHERE id = ?").bind(id).run();
  } else {
    await deleteFailedDelivery(ctx.db, ctx.user, id);
  }
  return json({ ok: true });
});

route("POST", "/api/failed-deliveries/purge", async (ctx, request) => {
  const user = effectiveUser(ctx, request);
  await purgeOldDeliveries(ctx.db, user, 30);
  return json({ ok: true });
});
