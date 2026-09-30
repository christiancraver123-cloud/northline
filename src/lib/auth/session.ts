// Single-operator session auth: password (NORTHLINE_ADMIN_PASSWORD) -> HMAC-signed, expiring cookie.
// Secrets are server-side env only. Multi-user auth (Supabase Auth) is a later upgrade (see TODO.md).
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "nl_session";
export const SESSION_TTL_SEC = 60 * 60 * 12;

export interface AuthConfig { password?: string; secret?: string; disabled: boolean }

export function authConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const explicitlyOff = env.NORTHLINE_AUTH_DISABLED === "true";
  const dev = env.NODE_ENV !== "production";
  return { password: env.NORTHLINE_ADMIN_PASSWORD, secret: env.NORTHLINE_SESSION_SECRET, disabled: explicitlyOff || (dev && !env.NORTHLINE_ADMIN_PASSWORD) };
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function issueToken(secret: string, now = Date.now()): string {
  const body = b64(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_TTL_SEC }));
  return `${body}.${sign(body, secret)}`;
}

export function verifyToken(token: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const good = sign(body, secret);
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()).exp * 1000 > now; } catch { return false; }
}

export function passwordOk(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(input), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Is this request path reachable without an operator session? Machine endpoints authenticate with Bearer tokens themselves. */
export function isPublicPath(p: string): boolean {
  return p === "/login" || p === "/api/health" || p.startsWith("/api/n8n/") || p === "/api/create" || p === "/api/agents/tick";
}
