import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getRepo, storeDriver } from "@/lib/db";

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
          <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
