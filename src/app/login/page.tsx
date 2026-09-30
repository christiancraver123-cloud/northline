import { loginAction } from "./actions";
import { authConfig } from "@/lib/auth/session";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const cfg = authConfig();
  const misconfigured = !cfg.disabled && (!cfg.password || !cfg.secret);
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-2xl border border-edge bg-panel/80 p-6">
      <h1 className="mb-1 text-xl font-extrabold">Northline</h1>
      <p className="mb-4 text-muted">Operator sign-in</p>
      {misconfigured && <p role="alert" className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-2 text-warn">Not configured: set NORTHLINE_ADMIN_PASSWORD and NORTHLINE_SESSION_SECRET (server env). The app stays locked until then.</p>}
      {error && <p role="alert" className="mb-3 text-bad">{error}</p>}
      <form action={loginAction} className="grid gap-3">
        <label>Password<input type="password" name="password" autoComplete="current-password" required autoFocus /></label>
        <button className="rounded-xl bg-gradient-to-br from-blue to-[#4d5cf0] px-4 py-2 font-bold">Sign in</button>
      </form>
    </div>
  );
}
