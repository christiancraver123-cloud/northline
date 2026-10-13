import Link from "next/link";
import { getRepo } from "@/lib/db";
import { ROSTER } from "@/lib/talent/roster";
import { PageHeader } from "@/components/ui";
import { CreatorPortrait } from "@/components/cc";
import { loadPortraits } from "@/lib/talent/portraits-server";

export default async function TalentPage() {
  const repo = await getRepo();
  const [prods, portraits] = await Promise.all([repo.list("productions"), loadPortraits(repo)]);
  return (
    <>
      <PageHeader title="Talent" sub="The six creators on the roster. Every portrait here comes from that creator’s canonical references." />
      <div className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3">
        {ROSTER.map((t) => (
          <Link key={t.code} href={`/talent/${t.code}`} className="group block">
            <div className="relative overflow-hidden rounded-2xl ring-1 ring-edge/70 transition-[box-shadow] duration-300 group-hover:ring-[color:var(--c)]" style={{ ["--c" as string]: t.color }}>
              <CreatorPortrait code={t.code} portrait={portraits[t.code]} className="aspect-[4/5] w-full transition duration-500 group-hover:scale-[1.03]" />
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-0.5 text-[11.5px] font-medium backdrop-blur-md"><span className={`h-1.5 w-1.5 rounded-full ${t.launchStatus === "active" ? "bg-ok" : "bg-warn"}`} />{t.launchStatus === "active" ? "Active" : "In setup"}</span>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 px-0.5">
              <div className="min-w-0">
                <div className="display truncate text-[24px] font-semibold leading-tight sm:text-[28px]">{t.name}</div>
                <div className="mt-0.5 truncate text-[13px] text-muted">{t.age} · {t.markets.join(" / ")}</div>
                <p className="mt-1 line-clamp-1 text-[12.5px] text-faint">{t.role}</p>
              </div>
              <span className="num mt-2 flex-none text-[12px] text-faint" title="Productions">{prods.filter((p) => p.talent.includes(t.code)).length} prod.</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
