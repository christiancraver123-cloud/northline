import Link from "next/link";
import { getRepo } from "@/lib/db";
import { ROSTER } from "@/lib/talent/roster";
import { PageHeader, Pill } from "@/components/ui";
import { CreatorPortrait } from "@/components/cc";
import { loadPortraits } from "@/lib/talent/portraits-server";

export default async function TalentPage() {
  const repo = await getRepo();
  const [prods, portraits] = await Promise.all([repo.list("productions"), loadPortraits(repo)]);
  return (
    <>
      <PageHeader title="Talent" sub="Six canonical virtual creators. Portraits come from each creator's canonical references only." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {ROSTER.map((t) => (
          <Link key={t.code} href={`/talent/${t.code}`} className="group overflow-hidden rounded-2xl border border-edge bg-panel/70 transition hover:-translate-y-0.5 hover:border-blue2/60" style={{ boxShadow: `0 14px 34px -22px ${t.color}` }}>
            <div className="relative">
              <CreatorPortrait code={t.code} portrait={portraits[t.code]} className="aspect-[3/4] w-full transition duration-300 group-hover:scale-[1.02]" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-12">
                <div className="text-[18px] font-extrabold leading-tight">{t.name}</div>
                <div className="text-[12px] text-ink/75">{t.age} · {t.markets.join(" / ")}</div>
              </div>
            </div>
            <div className="grid gap-2 p-3">
              <p className="line-clamp-2 text-[12.5px] text-muted">{t.role}</p>
              <div className="flex flex-wrap gap-1.5"><Pill tone={t.launchStatus === "active" ? "ok" : "warn"}>{t.launchStatus}</Pill><Pill>{prods.filter((p) => p.talent.includes(t.code)).length} productions</Pill></div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
