// Prompt builder: compact canonical identity block + references + production direction + negatives + technical requirements.
// The creator's full biography is NOT pasted; identity has priority over outfit, pose, environment, lighting and activity.
import type { GenerationBriefData } from "@/lib/db/records";
import { buildCanonicalIdentity, type CanonicalIdentity } from "@/lib/identity/canonical";
import { identityPromptFindings, worst, type QaFinding } from "@/lib/agents/identity";
import type { QaSeverity } from "@/lib/domain/types";

export interface BuiltPrompt { shotN: number; positive: string; negative: string; findings: QaFinding[]; severity: QaSeverity; identityRefs: string[] }

export function buildPrompts(b: GenerationBriefData, ci: CanonicalIdentity = buildCanonicalIdentity(b.creator.code), opts: { shots?: number[]; refsByShot?: Record<number, string[]> } = {}): BuiltPrompt[] {
  const fixes = b.revision ? ci.hardLocks.concat(ci.softLocks).filter((l) => b.revision!.feedback.some((f) => f.includes(l.id))).map((l) => l.description) : [];
  return b.shots.filter((s) => !opts.shots || opts.shots.includes(s.n)).map((s) => {
    const refIds = opts.refsByShot?.[s.n] ?? [];
    const positive = [
      `Photorealistic ${s.kind === "STORY" ? "vertical 9:16 Instagram Story frame" : "Instagram photo"} of ${b.identityBlock}`,
      `Priority: identity first, then outfit, pose, environment, lighting.`,
      refIds.length ? `Match the attached canonical reference images for face and permanent markers; references override text where ambiguous.` : "",
      fixes.length ? `Identity corrections for this revision: ${fixes.join(" ")}` : "",
      `Scene: ${s.description}. Location: ${b.location}, ${b.timeOfDay}. Outfit: ${b.visualDirection.outfit}. Lighting: ${b.visualDirection.lighting}. ${s.camera ?? ""}`,
      `Continuity: ${b.continuity[0]}.`,
      `Technical: natural candid photography, natural skin texture, correct anatomy and hands, coherent background geometry and reflections, no text, no logos.`,
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const notes = b.revision ? ` Revision notes from review: ${b.revision.feedback.join(" | ")}` : "";
    const negative = `Avoid: ${b.negativeConstraints.join(", ")}.${notes}`;
    const findings = identityPromptFindings(b.creator.code, positive, ci);
    return { shotN: s.n, positive, negative, findings, severity: worst(findings), identityRefs: refIds };
  });
}
