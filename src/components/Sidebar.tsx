"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  ["/", "Dashboard"], ["/talent", "Talent"], ["/create", "Create"], ["/productions", "Productions"], ["/approvals", "Approvals"], ["/launch", "Launch"],
  ["/calendar", "Calendar"], ["/assets", "Assets"], ["/analytics", "Analytics"], ["/agents", "Agents"], ["/automations", "Automations"], ["/settings", "Settings"],
] as const;

export function Sidebar({ pending, driver }: { pending: number; driver: string }) {
  const path = usePathname();
  return (
    <aside className="flex flex-col gap-4 border-b border-edge bg-[#0a1024]/90 p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-auto lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2.5 text-base font-extrabold"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-blue to-violet shadow-[0_0_18px_rgba(63,107,255,.45)]">✦</span>Northline</div>
      <nav className="flex gap-1 overflow-x-auto lg:grid" aria-label="Sections">
        {NAV.map(([href, label]) => {
          const on = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined}
              className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-[10px] px-3 py-2 font-medium ${on ? "bg-blue/20 text-ink shadow-[inset_2px_0_0_var(--color-blue2)]" : "text-muted hover:bg-blue2/10 hover:text-ink"}`}>
              {label}{label === "Approvals" && pending > 0 && <span className="rounded-full bg-warn/20 px-1.5 font-mono text-[11px] text-warn">{pending}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden rounded-xl border border-edge p-3 text-xs text-muted lg:block">
        Store: <b className="text-ink">{driver === "file" ? "local demo file" : "Supabase"}</b>
        {driver === "file" && <div className="mt-1 text-warn">Demo persistence — not production.</div>}
        <div className="mt-1">Draft-first: nothing publishes without approval.</div>
      </div>
    </aside>
  );
}
