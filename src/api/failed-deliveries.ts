import { route, json } from "../router";
import {
  listFailedDeliveries,
  deleteFailedDelivery,
  purgeOldDeliveries,
} from "../db/failed-deliveries";

route("GET", "/api/failed-deliveries", async (ctx) => {
  const deliveries = await listFailedDeliveries(ctx.db, ctx.user);
  return json(deliveries);
});

route("DELETE", "/api/failed-deliveries/:id", async (ctx) => {
  await deleteFailedDelivery(ctx.db, ctx.user, parseInt(ctx.params.id));
  return json({ ok: true });
});

route("POST", "/api/failed-deliveries/purge", async (ctx) => {
  await purgeOldDeliveries(ctx.db, ctx.user, 30);
  return json({ ok: true });
});
