import { getRepo } from "@/lib/db";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";

export default async function Analytics() {
  const rows = await (await getRepo()).list("analytics");
  return (
    <>
      <PageHeader title="Analytics" sub="Real data only. Northline never fabricates performance numbers." />
      {rows.length === 0 ? <Empty>No analytics yet. Nothing has been published through Northline, and no importer is connected. Planned: manual entry + platform import (see TODO.md).</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full text-left"><thead className="text-[11px] uppercase text-faint"><tr><th>Source</th><th>Views</th><th>Reach</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Saves</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-edge"><td><Pill tone={r.source === "imported" ? "ok" : "warn"}>{r.source}</Pill></td><td>{r.views ?? "—"}</td><td>{r.reach ?? "—"}</td><td>{r.likes ?? "—"}</td><td>{r.comments ?? "—"}</td><td>{r.shares ?? "—"}</td><td>{r.saves ?? "—"}</td></tr>)}</tbody></table></Card>
      )}
    </>
  );
}
