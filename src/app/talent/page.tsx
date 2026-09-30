import Link from "next/link";
import { getRepo } from "@/lib/db";
import { ROSTER } from "@/lib/talent/roster";
import { Avatar, Card, PageHeader, Pill } from "@/components/ui";

export default async function TalentPage() {
  const prods = await (await getRepo()).list("productions");
  return (
    <>
      <PageHeader title="Talent" sub="Six canonical virtual creators." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ROSTER.map((t) => (
          <Link key={t.code} href={`/talent/${t.code}`}>
            <Card className="relative h-full overflow-hidden hover:border-blue2/50">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-15 blur-3xl" style={{ background: t.color }} />
              <div className="relative flex items-center gap-3"><Avatar code={t.code} size={44} /><div><div className="font-bold">{t.name}</div><div className="text-muted">{t.code} · {t.age} · {t.markets.join(" / ")}</div></div></div>
              <p className="relative mt-3 text-muted">{t.role}</p>
              <div className="relative mt-3 flex flex-wrap gap-1.5"><Pill tone={t.launchStatus === "active" ? "ok" : "warn"}>{t.launchStatus}</Pill><Pill>{prods.filter((p) => p.talent.includes(t.code)).length} productions</Pill></div>
              <ul className="relative mt-3 list-disc pl-4 text-[13px] text-[#c6cdf0]">{t.criticalRules.slice(0, 2).map((r) => <li key={r}>{r}</li>)}</ul>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
