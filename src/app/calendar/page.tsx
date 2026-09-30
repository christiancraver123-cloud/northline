import { getRepo } from "@/lib/db";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { Card, DemoBadge, Empty, PageHeader, Pill, ProdLink } from "@/components/ui";

export default async function Calendar() {
  const repo = await getRepo();
  const [entries, prods] = await Promise.all([repo.list("calendarEntries"), repo.list("productions")]);
  const byId = Object.fromEntries(prods.map((p) => [p.id, p]));
  const days = [...new Set(entries.map((e) => e.date))].sort();
  return (
    <>
      <PageHeader title="Calendar" sub="Suggested slots for approved content. Rules: one post per creator per day, 90+ minutes between creators. External scheduling is not connected." />
      {days.length === 0 ? <Empty>Nothing planned yet. Approved productions get a suggested slot here.</Empty> : days.map((d) => (
        <Card key={d} className="mb-3">
          <h2 className="mb-2 font-mono font-bold">{d}</h2>
          {entries.filter((e) => e.date === d).sort((a, b) => a.time.localeCompare(b.time)).map((e) => {
            const p = byId[e.productionId];
            return <div key={e.id} className="flex flex-wrap items-center gap-3 border-t border-edge py-1.5 first:border-0"><span className="font-mono text-muted">{e.time}</span><span className="h-2 w-2 rounded-full" style={{ background: ROSTER_BY_CODE[e.talent as keyof typeof ROSTER_BY_CODE]?.color }} />{p && <ProdLink p={p} />}<span className="text-muted">{p?.concept}</span><Pill>{e.platform}</Pill><Pill tone="info">{e.state}</Pill>{p && <DemoBadge origin={p.origin} />}</div>;
          })}
        </Card>
      ))}
    </>
  );
}
