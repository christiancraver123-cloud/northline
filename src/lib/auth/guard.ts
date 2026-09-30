import { cookies } from "next/headers";
import { COOKIE, authConfig, verifyToken } from "./session";

/** Defence in depth for server actions (the proxy already gates them). Throws when no valid operator session. */
export async function requireOperator(): Promise<void> {
  const cfg = authConfig();
  if (cfg.disabled) return;
  if (cfg.secret && verifyToken((await cookies()).get(COOKIE)?.value, cfg.secret)) return;
  throw new Error("Not authenticated");
}
