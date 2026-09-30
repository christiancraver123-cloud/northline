import { timingSafeEqual } from "node:crypto";

/** Bearer-token check for machine endpoints. Fails closed if NORTHLINE_WEBHOOK_SECRET is unset. */
export function authorized(req: Request): boolean {
  const secret = process.env.NORTHLINE_WEBHOOK_SECRET;
  if (!secret) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
