// Gate every page and server action behind the operator session (fail-closed in production).
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, authConfig, isPublicPath, verifyToken } from "@/lib/auth/session";

export function proxy(req: NextRequest) {
  const cfg = authConfig();
  if (cfg.disabled || isPublicPath(req.nextUrl.pathname)) return NextResponse.next();
  if (cfg.secret && verifyToken(req.cookies.get(COOKIE)?.value, cfg.secret)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
