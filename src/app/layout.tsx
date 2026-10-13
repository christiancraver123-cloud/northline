import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getRepo, storeDriver } from "@/lib/db";
import { isReadOnly } from "@/lib/runtime/mode";
import { pickPortraits } from "@/lib/talent/portrait";
import { ROSTER } from "@/lib/talent/roster";

export const viewport = { themeColor: "#121013", width: "device-width", initialScale: 1, viewportFit: "cover" };
export const metadata: Metadata = { appleWebApp: { capable: true, title: "Northline", statusBarStyle: "black-translucent" }, title: "Northline Command Center", description: "Virtual talent + digital media studio operations." };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const repo = await getRepo();
  const pending = (await repo.list("approvals", { state: "PENDING" })).length;
  const unreadReports = (await repo.list("agentReports", { read: false })).length;
  const portraits = pickPortraits(await repo.list("referenceAssets"));
  const creators = ROSTER.map((t) => ({ code: t.code, first: t.first, name: t.name, color: t.color, url: portraits[t.code].url }));
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/instrument-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/bodoni-moda-latin-opsz-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body suppressHydrationWarning>
        <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] lg:grid-cols-[252px_minmax(0,1fr)]">
          <Sidebar pending={pending} unreadReports={unreadReports} driver={storeDriver()} creators={creators} />
          <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 sm:pb-28 lg:px-10 lg:pb-14 lg:pt-9"><div className="mx-auto w-full max-w-[1320px]">
            {isReadOnly() && <div role="status" className="mx-auto mb-5 max-w-[1320px] rounded-xl border border-warn/30 bg-warn/[0.07] px-3.5 py-2.5 text-[13px] text-warn"><b>Read-only mode.</b> You can view everything; creating, generating, QA, approvals and edits are disabled on this deployment.</div>}
            {children}
          </div></main>
        </div>
      </body>
    </html>
  );
}
