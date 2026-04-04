import { Env } from "./email-handler";
import { validateAccessJwt, AuthError } from "./auth";

export interface RequestContext {
  user: string;      // derived from JWT email localpart
  email: string;     // full JWT email
  isAdmin: boolean;
  db: D1Database;
  env: Env;
  params: Record<string, string>;
}

type Handler = (ctx: RequestContext, request: Request) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

const routes: Route[] = [];

export function route(
  method: string,
  path: string,
  handler: Handler,
): void {
  const paramNames: string[] = [];
  const pattern = path.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  routes.push({
    method,
    pattern: new RegExp(`^${pattern}$`),
    paramNames,
    handler,
  });
}

export async function handleFetch(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Serve UI for non-API routes
  if (!path.startsWith("/api/")) {
    // Will be implemented — serve static HTML
    return new Response("Not implemented", { status: 501 });
  }

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders(),
    });
  }

  // Authenticate
  let ctx: RequestContext;
  try {
    ctx = await buildContext(request, env);
  } catch (err) {
    if (err instanceof AuthError) {
      return json({ error: err.message }, 401);
    }
    throw err;
  }

  // Match route
  for (const r of routes) {
    if (r.method !== request.method) continue;
    const match = path.match(r.pattern);
    if (!match) continue;

    const params: Record<string, string> = {};
    r.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });
    ctx.params = params;

    try {
      const response = await r.handler(ctx, request);
      // Add CORS headers to response
      for (const [k, v] of Object.entries(corsHeaders())) {
        response.headers.set(k, v);
      }
      return response;
    } catch (err) {
      console.error("Handler error:", err);
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
}

async function buildContext(
  request: Request,
  env: Env,
): Promise<RequestContext> {
  if (!env.CF_ACCESS_TEAM || !env.CF_ACCESS_AUD) {
    throw new AuthError("Access configuration missing");
  }

  const identity = await validateAccessJwt(
    request,
    env.CF_ACCESS_TEAM,
    env.CF_ACCESS_AUD,
  );

  const email = identity.email;
  const user = email.split("@")[0];

  const adminList = (env.ADMIN_USERS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminList.includes(email.toLowerCase());

  return {
    user,
    email,
    isAdmin,
    db: env.DB,
    env,
    params: {},
  };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion",
  };
}
