import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, authConfig, verifyToken } from "./session";
import { isReadOnly } from "@/lib/runtime/mode";

/**
 * Defence in depth for server actions (the proxy already gates them). Throws when no valid operator session.
 * Every server action is a mutation, so in read-only mode (NORTHLINE_READONLY) it is refused here before any work starts
 * (the repo/storage wrappers refuse writes as a second, independent layer).
 */
export async function requireOperator(): Promise<void> {
  const cfg = authConfig();
  const authed = cfg.disabled || (!!cfg.secret && verifyToken((await cookies()).get(COOKIE)?.value, cfg.secret));
  if (!authed) throw new Error("Not authenticated");
  if (isReadOnly()) redirect("/?readonly=1");
}
