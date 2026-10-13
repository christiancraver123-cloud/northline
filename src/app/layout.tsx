import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getRepo, storeDriver } from "@/lib/db";
import { isReadOnly } from "@/lib/runtime/mode";
import { pickPortraits } from "@/lib/talent/portrait";
import { ROSTER } from "@/lib/talent/roster";

export const viewport = { themeColor: "#070b1a", width: "device-width", initialScale: 1, viewportFit: "cover" };
export const metadata: Metadata = { appleWebApp: { capable: true, title: "Northline", statusBarStyle: "black-translucent" }, title: "Northline Command Center", description: "Virtual talent + digital media studio operations." };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const repo = await getRepo();
  const pending = (await repo.list("approvals", { state: "PENDING" })).length;
  const unreadReports = (await repo.list("agentReports", { read: false })).length;
  const portraits = pickPortraits(await repo.list("referenceAssets"));
  const creators = ROSTER.map((t) => ({ code: t.code, first: t.first, color: t.color, url: portraits[t.code].url }));
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body suppressHydrationWarning>
        <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] lg:grid-cols-[236px_minmax(0,1fr)]">
          <Sidebar pending={pending} unreadReports={unreadReports} driver={storeDriver()} creators={creators} />
          <main className="min-w-0 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-10 lg:pb-10">
            {isReadOnly() && <div role="status" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13px] text-warn"><b>Read-only mode.</b> You can view everything; creating, generating, QA, approvals and edits are disabled on this deployment.</div>}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
