"use client";
// App chrome: grouped desktop sidebar with creator shortcuts; on phones a slim top bar + bottom tab bar + full menu sheet.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/actions";

type Item = readonly [href: string, label: string, icon: string];
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Today", items: [["/", "Dashboard", "◉"], ["/approvals", "Approvals", "✓"], ["/inbox", "Inbox", "⇩"], ["/live", "Live", "●"]] },
  { title: "Make", items: [["/create", "Studio", "✦"], ["/collabs", "Collabs", "⚭"], ["/productions", "Productions", "▤"], ["/calendar", "Calendar", "▦"]] },
  { title: "Roster", items: [["/talent", "Talent", "☺"], ["/launch", "Launch", "⚑"], ["/assets", "Assets", "▣"]] },
  { title: "Measure", items: [["/analytics", "Analytics", "↗"]] },
  { title: "System", items: [["/agents", "Agents", "⚙"], ["/automations", "Automations", "↻"], ["/world", "World", "◌"], ["/settings", "Settings", "≡"]] },
];
const TABS: Item[] = [["/", "Home", "◉"], ["/approvals", "Approve", "✓"], ["/inbox", "Inbox", "⇩"], ["/talent", "Talent", "☺"]];
export interface SidebarCreator { code: string; first: string; color: string; url: string | null }

export function Sidebar({ pending, unreadReports, driver, creators = [] }: { pending: number; unreadReports: number; driver: string; creators?: SidebarCreator[] }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  if (path.startsWith("/login")) return null; // no app chrome on the sign-in screen
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const badge = (label: string) => label === "Approvals" || label === "Approve" ? (pending > 0 ? <span className="rounded-full bg-warn/25 px-1.5 font-mono text-[10.5px] text-warn">{pending}</span> : null) : label === "Agents" && unreadReports > 0 ? <span className="rounded-full bg-blue2/20 px-1.5 font-mono text-[10.5px] text-blue2">{unreadReports}</span> : null;
  const Logo = <Link href="/" className="flex items-center gap-2.5 text-[17px] font-extrabold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-blue via-violet to-[#ff7ab6] text-[15px] shadow-[0_0_22px_rgba(91,140,255,.5)]">✦</span>Northline</Link>;
  const nav = (
    <nav aria-label="Sections" className="grid gap-4">
      {GROUPS.map((g) => (
        <div key={g.title} className="grid gap-0.5">
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">{g.title}</div>
          {g.items.map(([href, label, icon]) => (
            <Link key={href} href={href} aria-current={on(href) ? "page" : undefined}
              className={`group flex items-center gap-2.5 rounded-[10px] px-3 py-[7px] text-[13.5px] font-medium transition ${on(href) ? "bg-gradient-to-r from-blue/30 to-transparent text-ink shadow-[inset_2px_0_0_var(--color-blue2)]" : "text-muted hover:bg-white/[0.04] hover:text-ink"}`}>
              <span className={`w-4 text-center text-[13px] ${on(href) ? "text-blue2" : "text-faint group-hover:text-muted"}`} aria-hidden>{icon}</span>
              <span className="flex-1">{label}</span>{badge(label)}
            </Link>
          ))}
          {g.title === "Roster" && creators.length > 0 && (
            <div className="mt-1 flex gap-1.5 px-3" aria-label="Creators">{creators.map((c) => (
              <Link key={c.code} href={`/talent/${c.code}`} title={c.first} aria-current={path === `/talent/${c.code}` ? "page" : undefined}
                className={`h-7 w-7 overflow-hidden rounded-full transition hover:scale-110 ${path === `/talent/${c.code}` ? "ring-2 ring-offset-2 ring-offset-[#0a1024]" : "opacity-85 hover:opacity-100"}`} style={{ background: c.color, boxShadow: `0 0 0 1.5px ${c.color}`, ["--tw-ring-color" as string]: c.color }}>
                {c.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.url} alt={c.first} className="h-full w-full object-cover object-[50%_30%]" /> : <span className="grid h-full place-items-center text-[11px] font-bold text-[#0a0f24]">{c.first[0]}</span>}
              </Link>))}</div>
          )}
        </div>
      ))}
    </nav>
  );
  const status = (
    <div className="rounded-xl border border-edge bg-panel/60 p-3 text-[11.5px] text-muted">
      <div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${driver === "file" ? "bg-ok" : "bg-blue2"}`} />{driver === "file" ? "Saved on this computer" : "Saved in the cloud (Supabase)"}</div>
      <div className="mt-1 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-bad" />Instagram not connected · you post by hand</div>
      <form action={logoutAction} className="mt-2"><button className="text-blue2 hover:underline">Sign out</button></form>
    </div>
  );
  return (
    <>
      {/* Desktop */}
      <aside className="hidden flex-col gap-5 border-r border-edge bg-[#080d20]/85 p-4 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-auto">
        <div className="px-1 pt-1">{Logo}</div>
        {nav}
        <div className="mt-auto">{status}</div>
      </aside>
      {/* Phone: top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-edge bg-[#080d20]/90 px-4 py-3 backdrop-blur lg:hidden">
        {Logo}
        <div className="flex items-center gap-1.5">{creators.slice(0, 6).map((c) => <Link key={c.code} href={`/talent/${c.code}`} className="h-6 w-6 overflow-hidden rounded-full" style={{ background: c.color, boxShadow: `0 0 0 1.5px ${c.color}` }} aria-label={c.first}>{c.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.url} alt="" className="h-full w-full object-cover object-[50%_30%]" />}</Link>)}</div>
      </header>
      {/* Phone: bottom tabs */}
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-edge bg-[#080d20]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {TABS.map(([href, label, icon]) => (
          <Link key={href} href={href} aria-current={on(href) ? "page" : undefined} className={`relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold ${on(href) ? "text-ink" : "text-faint"}`}>
            <span className={`text-[17px] ${on(href) ? "text-blue2" : ""}`} aria-hidden>{icon}</span>{label}
            {label === "Approve" && pending > 0 && <span className="absolute right-[22%] top-1 rounded-full bg-warn px-1 font-mono text-[9.5px] font-bold text-[#0a0f24]">{pending}</span>}
          </Link>
        ))}
        <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold ${menu ? "text-ink" : "text-faint"}`}><span className="text-[17px]" aria-hidden>☰</span>More</button>
      </nav>
      {menu && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-x-0 bottom-[58px] max-h-[75vh] overflow-auto rounded-t-3xl border-t border-edge bg-[#0a1024] p-5" onClick={(e) => e.stopPropagation()}>{nav}<div className="mt-4">{status}</div></div>
        </div>
      )}
    </>
  );
}
