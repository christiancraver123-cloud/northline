import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getRepo, storeDriver } from "@/lib/db";
import { isReadOnly } from "@/lib/runtime/mode";

export const metadata: Metadata = { title: "Northline Command Center", description: "Virtual talent + digital media studio operations." };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const repo = await getRepo();
  const pending = (await repo.list("approvals", { state: "PENDING" })).length;
  const unreadReports = (await repo.list("agentReports", { read: false })).length;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body>
        <div className="grid min-h-screen lg:grid-cols-[250px_minmax(0,1fr)]">
          <Sidebar pending={pending} unreadReports={unreadReports} driver={storeDriver()} />
          <main className="min-w-0 p-4 sm:p-6 lg:p-8">
            {isReadOnly() && <div role="status" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13px] text-warn"><b>Read-only mode.</b> You can view everything; creating, generating, QA, approvals and edits are disabled on this deployment.</div>}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
