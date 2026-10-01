// Prompt builder: compact canonical identity block + EXPLICIT hard locks + references + production direction + shared continuity + negatives + technical requirements.
// The creator's full biography is NOT pasted; identity has priority over outfit, pose, environment, lighting and activity.
// Hard locks and creator-specific negatives are LOADED from the canonical identity — nothing creator-specific is hard-coded in this file.
import type { GenerationBriefData } from "@/lib/db/records";
import { buildCanonicalIdentity, type CanonicalIdentity } from "@/lib/identity/canonical";
import { identityPromptFindings, worst, type QaFinding } from "@/lib/agents/identity";
import type { QaSeverity } from "@/lib/domain/types";

export interface BuiltPrompt { shotN: number; positive: string; negative: string; findings: QaFinding[]; severity: QaSeverity; identityRefs: string[] }

/** Constraints that apply to EVERY generated frame regardless of creator. Creator-specific negatives (e.g. "heterochromia") come from the identity. */
export const GLOBAL_NEGATIVES = [
  "generated text", "readable signage or lettering on buildings, windows, doors, cups or clothing", "logos or brand marks", "watermarks", "captions or overlays",
  "eye-color drift or mismatched eyes unless the identity locks specify them", "jewelry changes unless the scene asks for one",
];

export const hardLockLines = (ci: CanonicalIdentity) => ci.hardLocks.map((l) => `${l.label}: ${l.description}`);

export function buildPrompts(b: GenerationBriefData, ci: CanonicalIdentity = buildCanonicalIdentity(b.creator.code), opts: { shots?: number[]; refsByShot?: Record<number, string[]> } = {}): BuiltPrompt[] {
  const fixes = b.revision ? ci.hardLocks.concat(ci.softLocks).filter((l) => b.revision!.feedback.some((f) => f.includes(l.id))).map((l) => l.description) : [];
  const spec = b.continuitySpec;
  const total = b.shots.length;
  const negatives = [...new Set([...GLOBAL_NEGATIVES, ...b.negativeConstraints])];
  return b.shots.filter((s) => !opts.shots || opts.shots.includes(s.n)).map((s) => {
    const refIds = opts.refsByShot?.[s.n] ?? [];
    const continuity = spec
      ? `Shared continuity for ALL ${total} frames of this one story (identical in every frame): outfit — ${spec.outfit}; hair — ${spec.hair}; jewelry — ${spec.jewelry} (unchanged); bag — ${spec.bag}${spec.props.length ? `; props — ${spec.props.join(", ")}` : ""}; time window — ${spec.timeWindow}; lighting — ${spec.lighting}; camera — ${spec.cameraStyle}. This is frame ${s.n} of ${total}; frame ${s.n} location/moment: ${spec.locationProgression[s.n - 1] ?? s.description}${s.n > 1 ? `; the previous frame was: ${spec.locationProgression[s.n - 2] ?? ""}` : ""}.`
      : `Continuity: ${b.continuity[0]}.`;
    const positive = [
      `Photorealistic ${s.kind === "STORY" ? "vertical 9:16 Instagram Story frame" : "Instagram photo"} of ${b.identityBlock}`,
      `HARD IDENTITY LOCKS (non-negotiable, must be clearly true in this frame): ${hardLockLines(ci).join(" | ")}.`,
      `Priority: identity first, then outfit, pose, environment, lighting.`,
      refIds.length ? `Match the attached canonical reference images for face and permanent markers; references override text where ambiguous.` : "",
      fixes.length ? `Identity corrections for this revision: ${fixes.join(" ")}` : "",
      `Scene: ${s.description}. Location: ${b.location}, ${b.timeOfDay}. Outfit: ${b.visualDirection.outfit}. Lighting: ${b.visualDirection.lighting}. ${s.camera ?? ""}`,
      continuity,
      `Composition: leave breathing room above and below the subject so a centered 4:5 crop keeps the full head, face and key props inside the frame.`,
      `Technical: natural candid photography, natural skin texture, correct anatomy and hands, coherent background geometry and reflections. Do not include: ${negatives.slice(0, 7).map((n) => `no ${n}`).join("; ")}.`,
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const notes = b.revision ? ` Revision notes from review: ${b.revision.feedback.join(" | ")}` : "";
    const negative = `Avoid (strict): ${negatives.map((n) => `NO ${n}`).join(", ")}.${notes}`;
    const findings = identityPromptFindings(b.creator.code, positive, ci);
    return { shotN: s.n, positive, negative, findings, severity: worst(findings), identityRefs: refIds };
  });
}
