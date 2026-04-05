import { Env } from "./email-handler";
import { validateAccessJwt, AuthError } from "./auth";
import { renderDashboard } from "./ui";
import { checkRateLimit } from "./rate-limit";
import { collectMetrics } from "./metrics";

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

  // robots.txt — disallow all
  if (path === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // security.txt
  if (path === "/.well-known/security.txt") {
    if (!env.SECURITY_CONTACT) {
      return new Response("Not found", { status: 404 });
    }
    const body = `Contact: ${env.SECURITY_CONTACT}\nExpires: ${new Date(Date.now() + 365 * 86400000).toISOString()}\n`;
    return new Response(body, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Serve UI for non-API routes
  if (!path.startsWith("/api/")) {
    return renderDashboard();
  }

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders(),
    });
  }

  // Health check — no auth required
  if (path === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1").first();
      return json({ status: "ok", timestamp: new Date().toISOString() });
    } catch {
      return json({ status: "degraded", error: "database unreachable" }, 503);
    }
  }

  // Prometheus metrics — no auth required
  if (path === "/api/metrics" && request.method === "GET") {
    try {
      const body = await collectMetrics(env.DB);
      return new Response(body, {
        headers: {
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
          ...corsHeaders(),
        },
      });
    } catch (err) {
      return new Response("# error collecting metrics\n", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
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

  // Rate limit: 120 requests/minute per authenticated user
  const rl = checkRateLimit(ctx.email, 120, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
        ...corsHeaders(),
      },
    });
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
      // Add CORS and rate-limit headers to response
      for (const [k, v] of Object.entries(corsHeaders())) {
        response.headers.set(k, v);
      }
      response.headers.set("X-RateLimit-Remaining", String(rl.remaining));
      response.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
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

/**
 * Resolve effective user: admins can use ?user= to act on behalf of another user.
 */
export function effectiveUser(ctx: RequestContext, request: Request): string {
  if (ctx.isAdmin) {
    const url = new URL(request.url);
    const targetUser = url.searchParams.get("user");
    if (targetUser) return targetUser;
  }
  return ctx.user;
}

/**
 * Returns true when admin is viewing without a specific ?user= target (i.e. "All users" mode).
 */
export function isAdminAllUsers(ctx: RequestContext, request: Request): boolean {
  if (!ctx.isAdmin) return false;
  const url = new URL(request.url);
  return !url.searchParams.has("user");
}

// Built-in route: current user info
route("GET", "/api/me", async (ctx) => {
  return json({ user: ctx.user, email: ctx.email, isAdmin: ctx.isAdmin });
});

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
