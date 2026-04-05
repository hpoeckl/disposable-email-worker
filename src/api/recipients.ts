import { route, json, effectiveUser } from "../router";
import {
  listRecipients,
  addRecipient,
  deleteRecipient,
  listAllRecipients,
  updateRecipientVerification,
  updateRecipientCfId,
  countRecipientsByEmail,
} from "../db/recipients";
import { CfEmailRouting } from "../cf-email-routing";

function getCfClient(env: { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string }): CfEmailRouting | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) return null;
  return new CfEmailRouting(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
}

route("GET", "/api/recipients", async (ctx, request) => {
  const user = effectiveUser(ctx, request);
  return json(await listRecipients(ctx.db, user));
});

route("POST", "/api/recipients", async (ctx, request) => {
  const body = await request.json<{ email: string }>();
  if (!body.email) return json({ error: "email is required" }, 400);

  const user = effectiveUser(ctx, request);

  // Create destination address in Cloudflare Email Routing
  const cf = getCfClient(ctx.env);
  let cfDestId: string | undefined;
  if (cf) {
    try {
      const dest = await cf.createDestination(body.email);
      cfDestId = dest.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // If already exists, try to find it in the list
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        const all = await cf.listDestinations();
        const existing = all.find(d => d.email.toLowerCase() === body.email.toLowerCase());
        if (existing) cfDestId = existing.id;
      } else {
        return json({ error: "Failed to create destination address: " + msg }, 502);
      }
    }
  }

  const recipient = await addRecipient(ctx.db, user, body.email, cfDestId);
  return json(recipient, 201);
});

route("POST", "/api/recipients/sync", async (ctx, request) => {
  const cf = getCfClient(ctx.env);
  if (!cf) return json({ error: "Cloudflare Email Routing not configured" }, 501);

  // Fetch all CF destination addresses
  const cfAddresses = await cf.listDestinations();
  const cfByEmail = new Map(cfAddresses.map(a => [a.email.toLowerCase(), a]));

  // Sync all recipients (admin sees all, user sees own)
  const user = effectiveUser(ctx, request);
  const recipients = ctx.isAdmin && user === ctx.user
    ? await listAllRecipients(ctx.db)
    : await listRecipients(ctx.db, user);

  let synced = 0;
  for (const r of recipients) {
    const cfAddr = cfByEmail.get(r.email.toLowerCase());
    if (!cfAddr) continue;

    // Update CF destination ID if missing
    if (!r.cf_destination_id) {
      await updateRecipientCfId(ctx.db, r.id, cfAddr.id);
    }

    // Sync verification status
    const isVerified = cfAddr.verified !== null;
    const wasVerified = r.verified_at !== null;
    if (isVerified !== wasVerified) {
      await updateRecipientVerification(ctx.db, r.id, cfAddr.verified);
      synced++;
    }
  }

  return json({ ok: true, synced });
});

route("PATCH", "/api/recipients/:id", async (ctx, request) => {
  const user = effectiveUser(ctx, request);
  const body = await request.json<{ active?: boolean }>();
  if (body.active !== undefined) {
    await ctx.db
      .prepare("UPDATE recipients SET active = ? WHERE id = ? AND user = ?")
      .bind(body.active ? 1 : 0, parseInt(ctx.params.id), user)
      .run();
  }
  return json({ ok: true });
});

route("DELETE", "/api/recipients/:id", async (ctx, request) => {
  const user = effectiveUser(ctx, request);
  const recipient = await deleteRecipient(ctx.db, user, parseInt(ctx.params.id));

  // Only delete from CF if no other user references this email
  if (recipient?.cf_destination_id) {
    const remaining = await countRecipientsByEmail(ctx.db, recipient.email);
    if (remaining === 0) {
      const cf = getCfClient(ctx.env);
      if (cf) {
        try {
          await cf.deleteDestination(recipient.cf_destination_id);
        } catch {
          // Non-fatal — may already be deleted in CF
        }
      }
    }
  }

  return json({ ok: true });
});
