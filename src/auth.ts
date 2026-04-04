/**
 * Cloudflare Access JWT validation using Web Crypto API.
 * No external dependencies.
 */

export interface AccessIdentity {
  email: string;
}

interface JwtHeader {
  kid: string;
  alg: string;
}

interface JwtPayload {
  email: string;
  aud: string[];
  iss: string;
  exp: number;
  iat: number;
}

interface JwksKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg: string;
}

// Module-level JWKS cache (persists across requests in same isolate)
let cachedKeys: JwksKey[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function validateAccessJwt(
  request: Request,
  teamName: string,
  expectedAud: string,
): Promise<AccessIdentity> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    throw new AuthError("Missing Access JWT");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthError("Malformed JWT");
  }

  const header = JSON.parse(b64Decode(parts[0])) as JwtHeader;
  const payload = JSON.parse(b64Decode(parts[1])) as JwtPayload;

  // Check expiry
  if (payload.exp < Date.now() / 1000) {
    throw new AuthError("JWT expired");
  }

  // Check audience
  if (!payload.aud.includes(expectedAud)) {
    throw new AuthError("JWT audience mismatch");
  }

  // Fetch and cache JWKS
  const keys = await getKeys(teamName);
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) {
    // Key may have rotated — force refresh
    cachedKeys = null;
    const freshKeys = await getKeys(teamName);
    const freshKey = freshKeys.find((k) => k.kid === header.kid);
    if (!freshKey) {
      throw new AuthError("JWT signing key not found");
    }
    await verifySignature(freshKey, parts);
  } else {
    await verifySignature(key, parts);
  }

  if (!payload.email) {
    throw new AuthError("JWT missing email claim");
  }

  return { email: payload.email };
}

async function getKeys(teamName: string): Promise<JwksKey[]> {
  if (cachedKeys && Date.now() < cacheExpiry) {
    return cachedKeys;
  }

  const url = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new AuthError(`Failed to fetch JWKS: ${resp.status}`);
  }

  const data = (await resp.json()) as { keys: JwksKey[] };
  cachedKeys = data.keys;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedKeys;
}

async function verifySignature(
  jwk: JwksKey,
  parts: string[],
): Promise<void> {
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = b64DecodeBytes(parts[2]);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature,
    data,
  );

  if (!valid) {
    throw new AuthError("JWT signature invalid");
  }
}

function b64Decode(str: string): string {
  return new TextDecoder().decode(b64DecodeBytes(str));
}

function b64DecodeBytes(str: string): Uint8Array {
  // Base64url to base64
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
