import { loginAction } from "./actions";
import { authConfig } from "@/lib/auth/session";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const cfg = authConfig();
  const misconfigured = !cfg.disabled && (!cfg.password || !cfg.secret);
  const { error } = await searchParams;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-bg p-4" style={{ backgroundImage: "radial-gradient(900px 500px at 50% -10%, rgba(226,200,150,.09), transparent 65%)" }}>
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-blue2/30 bg-gradient-to-b from-[#2c2620] to-[#1a1714] text-blue2 shadow-[0_1px_0_rgba(255,255,255,.08)_inset,0_20px_40px_-20px_rgba(226,200,150,.4)]">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M5 20V4l14 16V4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <h1 className="display mt-5 text-[46px] font-semibold leading-none">Northline</h1>
          <p className="mt-2 text-muted">Talent studio. Sign in to continue.</p>
        </div>
        <div className="rounded-2xl border border-edge/80 bg-panel/80 p-6 shadow-[0_40px_80px_-40px_rgba(0,0,0,.9)]">
          {misconfigured && <p role="alert" className="mb-4 rounded-xl border border-warn/30 bg-warn/[0.07] p-3 text-[13px] text-warn">Sign-in isn’t set up yet: set NORTHLINE_ADMIN_PASSWORD and NORTHLINE_SESSION_SECRET in the server settings. The app stays locked until then.</p>}
          {error && <p role="alert" className="mb-4 rounded-xl border border-bad/30 bg-bad/[0.07] p-3 text-[13px] text-bad">{error}</p>}
          <form action={loginAction} className="grid gap-4">
            <label className="grid gap-1.5 text-[13px] font-medium text-muted">Password<input type="password" name="password" autoComplete="current-password" required autoFocus className="py-2.5 text-[15px]" /></label>
            <button className="rounded-xl bg-blue2 px-4 py-2.5 text-[14px] font-semibold text-[#1a1410] shadow-[0_1px_0_rgba(255,255,255,.35)_inset,0_8px_20px_-10px_rgba(226,200,150,.6)] hover:bg-[#ecd6ab]">Sign in</button>
          </form>
        </div>
      </div>
    </div>
  );
}
