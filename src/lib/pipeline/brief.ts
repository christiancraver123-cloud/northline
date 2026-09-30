// Generation Brief: the persisted, reproducible input to image generation. Combines production, creator, identity version,
// references, concept, location, time, visual direction, continuity, recent-content considerations, negatives and provider requirements.
import type { Repo } from "@/lib/db/repo";
import type { CreativeBrief, GenerationBrief, GenerationBriefData, Production, ReferenceAsset } from "@/lib/db/records";
import type { CanonicalIdentity } from "@/lib/identity/canonical";
import type { Deps } from "./deps";
import type { ContentHistory } from "./content";

const timeOfDay = (lighting: string) => (/golden/i.test(lighting) ? "golden hour" : /night|flash|candle|neon/i.test(lighting) ? "night" : /dawn/i.test(lighting) ? "dawn" : "daytime");

export function briefData(a: {
  production: Pick<Production, "code" | "contentType" | "platform" | "concept">; identity: CanonicalIdentity; brief: CreativeBrief; refs: ReferenceAsset[];
  history: ContentHistory; deps: Deps; revision: GenerationBriefData["revision"];
}): GenerationBriefData {
  const { identity, brief } = a;
  const rec: string[] = [];
  if (a.history.recentLocations.length) rec.push(`Recent locations to avoid repeating: ${a.history.recentLocations.slice(0, 4).join(", ")}`);
  if (a.history.recentFormats.length) rec.push(`Recent formats: ${a.history.recentFormats.slice(0, 4).join(", ")}`);
  if (a.history.themeCounts.length) rec.push(`Recent themes: ${a.history.themeCounts.map(([t, n]) => `${t}×${n}`).join(", ")}`);
  return {
    production: { code: a.production.code, format: a.production.contentType, platform: a.production.platform },
    creator: { code: identity.code, name: identity.name },
    identityVersion: identity.id, identityBlock: identity.providerBlock,
    hardLocks: identity.hardLocks.map((l) => ({ id: l.id, label: l.label })), negativeConstraints: [...new Set(identity.negativeConstraints)],
    references: a.refs.map((r) => ({ id: r.id, type: r.referenceType, authority: r.authority, hasImage: true })),
    referencePolicy: a.refs.length ? "Canonical references override textual ambiguity; the master face has highest authority." : "No canonical references uploaded — identity relies on the written canonical identity only.",
    concept: a.production.concept, location: brief.location, timeOfDay: timeOfDay(brief.lighting),
    visualDirection: { outfit: brief.outfit, lighting: brief.lighting, palette: identity.visualLanguage.palette, mood: identity.visualLanguage.expression },
    continuity: [brief.storyBeat, "same creator identity, outfit and time of day across every frame", "identity has priority over outfit, pose, environment, lighting and activity"],
    recentConsiderations: rec,
    providerRequirements: { provider: a.deps.image.name, model: a.deps.image.model ?? null, size: "1024x1536", aspect: "2:3 portrait", count: brief.shots.length },
    shots: brief.shots.map((s) => ({ n: s.n, kind: s.kind, description: s.description, camera: s.camera })),
    revision: a.revision,
  };
}

export async function saveBrief(repo: Repo, productionId: string, data: GenerationBriefData, refIds: string[], origin: Production["origin"]): Promise<GenerationBrief> {
  const version = (await repo.list("generationBriefs", { productionId })).length + 1;
  return repo.insert("generationBriefs", { productionId, version, identityVersion: data.identityVersion, referenceIds: refIds, data, origin });
}
