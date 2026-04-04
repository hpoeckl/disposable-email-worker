import { route, json } from "../router";
import {
  listRecipients,
  addRecipient,
  deleteRecipient,
} from "../db/recipients";

route("GET", "/api/recipients", async (ctx) => {
  const recipients = await listRecipients(ctx.db, ctx.user);
  return json(recipients);
});

route("POST", "/api/recipients", async (ctx, request) => {
  const body = await request.json<{ email: string }>();
  if (!body.email) return json({ error: "email is required" }, 400);

  const recipient = await addRecipient(ctx.db, ctx.user, body.email);
  return json(recipient, 201);
});

route("DELETE", "/api/recipients/:id", async (ctx) => {
  await deleteRecipient(ctx.db, ctx.user, parseInt(ctx.params.id));
  return json({ ok: true });
});
