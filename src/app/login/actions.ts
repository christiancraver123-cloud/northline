"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, SESSION_TTL_SEC, authConfig, issueToken, passwordOk } from "@/lib/auth/session";

// Naive in-memory throttle (per process): 8 failures / 10 min per client.
const fails = new Map<string, number[]>();

export async function loginAction(formData: FormData) {
  const cfg = authConfig();
  if (cfg.disabled) redirect("/");
  if (!cfg.password || !cfg.secret) redirect("/login?error=" + encodeURIComponent("Authentication is not configured on the server."));
  const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (fails.get(ip) ?? []).filter((t) => now - t < 600_000);
  if (recent.length >= 8) redirect("/login?error=" + encodeURIComponent("Too many attempts. Try again later."));
  if (!passwordOk(String(formData.get("password") ?? ""), cfg.password)) {
    fails.set(ip, [...recent, now]);
    redirect("/login?error=" + encodeURIComponent("Incorrect password."));
  }
  (await cookies()).set(COOKIE, issueToken(cfg.secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SEC });
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
