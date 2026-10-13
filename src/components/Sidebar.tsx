"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/login/actions";

const NAV = [
  ["/", "Dashboard"], ["/talent", "Talent"], ["/create", "Studio"], ["/productions", "Productions"], ["/approvals", "Approvals"],
  ["/calendar", "Calendar"], ["/collabs", "Collabs"], ["/inbox", "Inbox"], ["/analytics", "Analytics"], ["/live", "Live"], ["/agents", "Agents"], ["/world", "World"], ["/settings", "Settings"],
] as const;
/** Still reachable, not primary: launch checklists, the asset library and automations. */
const MORE = [["/assets", "Assets"], ["/launch", "Launch"], ["/automations", "Automations"]] as const;

export function Sidebar({ pending, unreadReports, driver }: { pending: number; unreadReports: number; driver: string }) {
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
              {label}{label === "Approvals" && pending > 0 && <span className="rounded-full bg-warn/20 px-1.5 font-mono text-[11px] text-warn">{pending}</span>}{label === "Agents" && unreadReports > 0 && <span className="rounded-full bg-blue2/20 px-1.5 font-mono text-[11px] text-blue2">{unreadReports}</span>}
            </Link>
          );
        })}
      </nav>
      <nav className="flex gap-1 overflow-x-auto lg:grid lg:gap-0.5" aria-label="More">
        <div className="hidden px-3 text-[10.5px] font-bold uppercase tracking-wider text-faint lg:block">More</div>
        {MORE.map(([href, label]) => <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined} className={`rounded-[10px] px-3 py-1.5 text-[13px] ${path.startsWith(href) ? "bg-blue/20 text-ink" : "text-muted hover:text-ink"}`}>{label}</Link>)}
      </nav>
      <div className="mt-auto hidden rounded-xl border border-edge p-3 text-xs text-muted lg:block">
        Store: <b className="text-ink">{driver === "file" ? "local demo file" : "Supabase"}</b>
        {driver === "file" && <div className="mt-1 text-warn">Demo persistence — not production.</div>}
        <div className="mt-1">Nothing publishes without your click. Instagram: <b className="text-bad">blocked</b>.</div>
        <form action={logoutAction} className="mt-2"><button className="text-blue2 hover:underline">Sign out</button></form>
      </div>
    </aside>
  );
}
