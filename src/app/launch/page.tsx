import { getRepo } from "@/lib/db";
import { ensureLaunchStates } from "@/lib/db/seed";
import { ROSTER } from "@/lib/talent/roster";
import { launchAction } from "../actions";
import { Avatar, Btn, Card, PageHeader, Pill } from "@/components/ui";

const FIELDS: [string, string][] = [
  ["accountCreated", "Account created"], ["bioDone", "Bio completed"], ["aiDisclosure", "Virtual / AI disclosure on"], ["profilePicture", "Profile picture"],
  ["masterFace", "Master face reference"], ["referencesDone", "Reference set complete"], ["initialContent", "Initial content approved"], ["approved", "Cleared to launch"],
];

export default async function Launch() {
  const repo = await getRepo();
  await ensureLaunchStates(repo);
  const rows = await repo.list("launchStates");
  return (
    <>
      <PageHeader title="Launch" sub="Track each creator to launch. Toggle only what is actually true — Northline does not assume external accounts exist." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ROSTER.map((t) => {
          const l = rows.find((r) => r.talent === t.code);
          if (!l) return null;
          const done = FIELDS.filter(([k]) => (l as unknown as Record<string, boolean>)[k]).length;
          return (
            <Card key={t.code}>
              <form action={launchAction} className="grid gap-2">
                <input type="hidden" name="talent" value={t.code} />
                <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><Avatar code={t.code} size={30} />{t.name}</span><Pill tone={t.launchStatus === "active" ? "ok" : "warn"}>{t.launchStatus === "active" ? "pilot" : "setup"} · {done}/{FIELDS.length}</Pill></div>
                <label className="text-[12px] text-muted">Handle<input name="handle" defaultValue={l.handle ?? ""} placeholder="not selected" /></label>
                {FIELDS.map(([k, label]) => <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name={k} defaultChecked={(l as unknown as Record<string, boolean>)[k]} className="!w-auto" />{label}</label>)}
                <Btn>Save</Btn>
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
