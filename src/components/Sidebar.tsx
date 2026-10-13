"use client";
// App chrome: desktop sidebar (sections, creators, ⌘K), phone top bar + bottom tabs + menu sheet, and the command palette.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { Icon } from "./Icon";
import { CommandPalette, openPalette, type PaletteItem } from "./CommandPalette";

type Item = readonly [href: string, label: string, icon: string, hint?: string];
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Today", items: [["/", "Dashboard", "home"], ["/approvals", "Approvals", "check", "Review and approve"], ["/inbox", "Inbox", "inbox", "Images waiting in your folder"], ["/live", "Live", "live", "What's happening right now"]] },
  { title: "Make", items: [["/create", "Studio", "spark", "Import or generate images"], ["/collabs", "Collabs", "collab", "Plan creator collaborations"], ["/productions", "Productions", "film"], ["/calendar", "Calendar", "calendar"]] },
  { title: "Roster", items: [["/talent", "Talent", "user"], ["/launch", "Launch", "flag", "Launch checklist"], ["/assets", "Assets", "image"]] },
  { title: "Measure", items: [["/analytics", "Analytics", "chart"]] },
  { title: "System", items: [["/agents", "Agents", "bot"], ["/automations", "Automations", "repeat"], ["/world", "World", "globe"], ["/settings", "Settings", "settings"]] },
];
const TABS: Item[] = [["/", "Home", "home"], ["/approvals", "Approve", "check"], ["/create", "Studio", "spark"], ["/talent", "Talent", "user"]];
export interface SidebarCreator { code: string; first: string; color: string; url: string | null; name?: string }

export function Sidebar({ pending, unreadReports, driver, creators = [] }: { pending: number; unreadReports: number; driver: string; creators?: SidebarCreator[] }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [mac, setMac] = useState(true);
  useEffect(() => setMenu(false), [path]);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  if (path.startsWith("/login")) return null; // no app chrome on the sign-in screen
  const on = (href: string) => (href === "/" ? path === "/" : href === "/talent" ? path === "/talent" : path === href || path.startsWith(href + "/"));
  const count = (label: string) => (label === "Approvals" || label === "Approve") && pending > 0 ? pending : label === "Agents" && unreadReports > 0 ? unreadReports : 0;

  const palette: PaletteItem[] = [
    { href: "/create", label: "Import images", icon: "upload", group: "Actions", hint: "Studio" },
    { href: "/create?mode=generate", label: "Generate an image", icon: "spark", group: "Actions", hint: "Studio" },
    { href: "/approvals?view=grid", label: "Review approvals in a grid", icon: "checks", group: "Actions", hint: pending ? `${pending} waiting` : undefined },
    { href: "/inbox", label: "Send inbox images to Approvals", icon: "inbox", group: "Actions" },
    ...creators.map((c) => ({ href: `/talent/${c.code}`, label: c.name ?? c.first, icon: "user", group: "Creators", hint: c.code, img: c.url, color: c.color })),
    ...GROUPS.flatMap((g) => g.items.map(([href, label, icon, hint]) => ({ href, label, icon, group: "Pages", hint }))),
  ];

  const Logo = (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Northline home">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] border border-blue2/30 bg-gradient-to-b from-[#2c2620] to-[#1a1714] text-blue2 shadow-[0_1px_0_rgba(255,255,255,.08)_inset]">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M5 20V4l14 16V4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="leading-none"><span className="display block text-[20px] font-semibold">Northline</span><span className="mt-0.5 block text-[11px] text-faint">Talent studio</span></span>
    </Link>
  );

  const nav = (
    <nav aria-label="Sections" className="grid gap-5">
      {GROUPS.map((g) => (
        <div key={g.title} className="grid gap-px">
          <div className="px-3 pb-1.5 text-[11.5px] font-medium text-faint">{g.title}</div>
          {g.items.map(([href, label, icon]) => {
            const active = on(href), n = count(label);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 rounded-[10px] px-3 py-[7px] text-[13.5px] transition-colors ${active ? "bg-white/[0.06] font-semibold text-ink" : "text-muted hover:bg-white/[0.035] hover:text-ink"}`}>
                {active && <span className="absolute -left-4 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-blue2" aria-hidden />}
                <Icon name={icon} className={active ? "text-blue2" : "text-faint group-hover:text-muted"} />
                <span className="flex-1">{label}</span>
                {n > 0 && <span className={`num rounded-full px-1.5 text-[11px] leading-[18px] ${label === "Agents" ? "bg-white/[0.07] text-muted" : "bg-warn/15 text-warn"}`}>{n}</span>}
              </Link>
            );
          })}
          {g.title === "Roster" && creators.length > 0 && (
            <div className="mt-2 grid gap-px" aria-label="Creators">
              {creators.map((c) => {
                const active = path === `/talent/${c.code}`;
                return (
                  <Link key={c.code} href={`/talent/${c.code}`} aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-[13px] transition-colors ${active ? "bg-white/[0.06] text-ink" : "text-muted hover:bg-white/[0.035] hover:text-ink"}`}>
                    <span className="h-[22px] w-[22px] flex-none overflow-hidden rounded-full" style={{ background: c.color, boxShadow: `0 0 0 1.5px ${active ? c.color : c.color + "88"}` }}>
                      {c.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.url} alt="" className="h-full w-full object-cover object-[50%_30%]" /> : <span className="grid h-full place-items-center text-[10px] font-bold text-[#141016]">{c.first[0]}</span>}
                    </span>
                    <span className="flex-1 truncate">{c.first}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </nav>
  );

  const status = (
    <div className="grid gap-1.5 rounded-xl border border-edge/70 bg-white/[0.02] p-3 text-[12px] text-muted">
      <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${driver === "file" ? "bg-ok" : "bg-blue2"}`} />{driver === "file" ? "Saved on this Mac" : "Saved in the cloud"}</div>
      <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-faint" />Instagram not connected — you post by hand</div>
      <form action={logoutAction} className="mt-1"><button className="inline-flex items-center gap-1.5 text-faint hover:text-ink"><Icon name="logout" size={13} />Sign out</button></form>
    </div>
  );

  return (
    <>
      <CommandPalette items={palette} />
      {/* Desktop */}
      <aside className="hidden flex-col gap-6 border-r border-edge/70 bg-[#141115]/90 px-4 pb-4 pt-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-auto">
        <div className="px-1">{Logo}</div>
        <button type="button" onClick={openPalette} className="flex items-center gap-2.5 rounded-xl border border-edge/80 bg-sheet/60 px-3 py-2 text-[13px] text-faint hover:border-[#4a414c] hover:text-muted">
          <Icon name="search" size={15} /><span className="flex-1 text-left">Jump to…</span><span className="kbd">{mac ? "⌘" : "Ctrl"}</span><span className="kbd -ml-1.5">K</span>
        </button>
        {nav}
        <div className="mt-auto">{status}</div>
      </aside>
      {/* Phone: top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-edge/70 bg-[#141115]/92 px-4 py-2.5 backdrop-blur-md lg:hidden">
        {Logo}
        <button type="button" onClick={openPalette} aria-label="Search" className="grid h-9 w-9 place-items-center rounded-xl border border-edge text-muted"><Icon name="search" /></button>
      </header>
      {/* Phone: bottom tabs */}
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-edge/70 bg-[#141115]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {TABS.map(([href, label, icon]) => (
          <Link key={href} href={href} aria-current={on(href) ? "page" : undefined} className={`relative flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${on(href) ? "text-ink" : "text-faint"}`}>
            <Icon name={icon} size={20} className={on(href) ? "text-blue2" : ""} />{label}
            {label === "Approve" && pending > 0 && <span className="num absolute right-[22%] top-1 rounded-full bg-warn px-1 text-[10px] font-bold text-[#141016]">{pending}</span>}
          </Link>
        ))}
        <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${menu ? "text-ink" : "text-faint"}`}><Icon name="menu" size={20} />More</button>
      </nav>
      {menu && (
        <div className="anim-fade fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMenu(false)}>
          <div className="anim-pop absolute inset-x-0 bottom-[62px] max-h-[75vh] overflow-auto rounded-t-3xl border-t border-edge bg-[#161317] p-5" onClick={(e) => e.stopPropagation()}>{nav}<div className="mt-5">{status}</div></div>
        </div>
      )}
    </>
  );
}
