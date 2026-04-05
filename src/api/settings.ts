import { route, json, effectiveUser } from "../router";
import { getSettings, updateSettings } from "../db/settings";
import type { FromNameFormat } from "../db/types";

route("GET", "/api/settings", async (ctx, request) => {
  const user = effectiveUser(ctx, request);
  const settings = await getSettings(ctx.db, user);
  return json(settings);
});

route("PATCH", "/api/settings", async (ctx, request) => {
  const user = effectiveUser(ctx, request);
  const body = await request.json<{
    catch_all?: boolean;
    from_name_format?: FromNameFormat;
    default_limit?: number;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.catch_all !== undefined) updates.catch_all = body.catch_all ? 1 : 0;
  if (body.from_name_format !== undefined) updates.from_name_format = body.from_name_format;
  if (body.default_limit !== undefined) updates.default_limit = body.default_limit;

  if (Object.keys(updates).length > 0) {
    await updateSettings(ctx.db, user, updates);
  }

  const settings = await getSettings(ctx.db, user);
  return json(settings);
});
