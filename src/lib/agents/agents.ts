// Specialised agents as typed, deterministic functions with structured inputs/outputs.
// v0 is rule-based (no LLM needed, fully testable). An LLM-backed implementation can replace any agent
// behind the same signature without touching the orchestrator.
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import type { AssetKind, ContentType, TalentCode } from "@/lib/domain/types";
import type { CreativeBrief } from "@/lib/db/records";
import { identityBlock, identityQa, negativeBlock, type QaResult } from "./identity";

export interface AgentContext {
  recentLocations: string[]; // from production history
  recentConcepts: string[];
  variant: number; // which production in a batch (drives variety)
}

const pick = <T,>(arr: T[], i: number) => arr[((i % arr.length) + arr.length) % arr.length];

// ---- CONTENT STRATEGIST -----------------------------------------------------
export function strategist(talent: TalentCode, type: ContentType, concept: string, ctx: AgentContext): { concept: string; angle: string } {
  const t = ROSTER_BY_CODE[talent];
  const angles = ["a slice-of-day outing", "a candid behind-the-scenes angle", "a golden-moment highlight", "a low-key everyday take"];
  const clean = concept.trim() || `${pick(t.visual.lifestyle, ctx.variant)} day`;
  const repeat = ctx.recentConcepts.some((c) => c.toLowerCase() === clean.toLowerCase());
  return { concept: clean, angle: repeat ? `a fresh take (recent repeat avoided): ${pick(angles, ctx.variant + 1)}` : pick(angles, ctx.variant) };
}

// ---- CREATIVE DIRECTOR ------------------------------------------------------
const SHOT_TEMPLATE: { kind: AssetKind; description: string; camera?: string }[] = [
  { kind: "IMG", description: "strong opening hook portrait", camera: "eye level, shallow depth of field" },
  { kind: "IMG", description: "walking / full-body shot in the outing", camera: "full-length, slightly low angle" },
  { kind: "IMG", description: "activity or detail close-up", camera: "close detail, natural crop" },
  { kind: "IMG", description: "environment / food-or-drink detail (creator's hand at most)", camera: "overhead or table level" },
  { kind: "IMG", description: "candid personality moment", camera: "handheld candid" },
  { kind: "IMG", description: "imperfect, slightly blurry ending frame", camera: "casual phone snap, slight motion blur" },
];

export function creativeDirector(talent: TalentCode, type: ContentType, concept: string, angle: string, ctx: AgentContext, assetCount?: number): CreativeBrief {
  const t = ROSTER_BY_CODE[talent];
  const fresh = t.visual.environments.filter((e) => !ctx.recentLocations.includes(e));
  const location = pick(fresh.length ? fresh : t.visual.environments, ctx.variant);
  const lighting = pick(t.visual.lighting, ctx.variant);
  const palette = t.visual.palette.slice(0, 2).join(" and ");
  const outfit = `${palette} outfit suited to ${concept}`;
  const n = type === "CAROUSEL" ? Math.min(Math.max(assetCount ?? 6, 2), 10) : type === "STORY" ? Math.max(assetCount ?? 3, 1) : type === "REEL" ? 1 : Math.max(assetCount ?? 1, 1);
  const shots = Array.from({ length: n }, (_, i) => {
    const tpl = type === "CAROUSEL" ? (i === n - 1 && n > 2 ? SHOT_TEMPLATE[5] : SHOT_TEMPLATE[Math.min(i, 4)]) : SHOT_TEMPLATE[0];
    return { n: i + 1, kind: (type === "STORY" ? "STORY" : tpl.kind) as AssetKind, description: type === "CAROUSEL" ? `${tpl.description} — ${concept}` : concept, camera: tpl.camera };
  });
  const brief: CreativeBrief = {
    hook: `${t.first}: ${concept}`,
    location, outfit, lighting,
    storyBeat: `${angle}; one connected outing, same outfit and time of day across frames`,
    shots,
  };
  if (type === "REEL") {
    brief.reel = {
      sourceStill: `Approved still of ${t.first} (shot 1) — generate and approve this before the video stage`,
      durationSec: 6,
      cameraMovement: "slow push-in, subtle handheld drift",
      subjectAction: `${t.first} ${concept.toLowerCase().includes("walk") ? "walks toward camera" : "turns to camera with a natural look"}`,
      transition: "hard cut on movement",
      audioConcept: "add trending audio inside Instagram (not in the generated video)",
      loopStrategy: "end on the pose that opens the clip so the loop is seamless",
      higgsfieldPrompt: `${t.first} in ${location}, ${lighting}. ${identityBlock(talent)} Slow push-in, subtle handheld drift, natural motion, 6 seconds, vertical 9:16.`,
    };
  }
  return brief;
}

// ---- PROMPT ENGINEER --------------------------------------------------------
export interface BuiltPrompt { shotN: number; positive: string; negative: string; qa: QaResult }

export function promptEngineer(talent: TalentCode, brief: CreativeBrief): BuiltPrompt[] {
  const t = ROSTER_BY_CODE[talent];
  return brief.shots.map((s) => {
    const positive = [
      `Photorealistic ${s.kind === "STORY" ? "vertical 9:16 Instagram Story frame" : "Instagram photo"} of ${identityBlock(talent)}`,
      `Scene: ${s.description}. Location: ${brief.location}. Outfit: ${brief.outfit}. Lighting: ${brief.lighting}.`,
      `Style: ${t.visual.lifestyle.slice(0, 3).join(", ")} lifestyle; natural, slightly imperfect, candid photography. ${s.camera ?? ""}`,
    ].join(" ").replace(/\s+/g, " ").trim();
    return { shotN: s.n, positive, negative: negativeBlock(talent), qa: identityQa(talent, positive) };
  });
}

// ---- CAPTION WRITER ---------------------------------------------------------
export function captionWriter(talent: TalentCode, _concept: string, collabWith: TalentCode[] = []): string {
  // v0: creator-voice template. Operators edit captions in Approvals; an LLM caption agent can replace this.
  const t = ROSTER_BY_CODE[talent];
  const tag = collabWith.length ? ` w/ ${collabWith.map((c) => `@${ROSTER_BY_CODE[c].first.toLowerCase()}`).join(" ")}` : "";
  return `${t.voice.sample}${tag}`;
}

// ---- CONTENT QA -------------------------------------------------------------
export function contentQa(prompts: BuiltPrompt[], ctx: AgentContext, location: string): string[] {
  const notes: string[] = [];
  if (new Set(prompts.map((p) => p.positive)).size < prompts.length) notes.push("Duplicate prompts detected within the production");
  if (ctx.recentLocations.includes(location)) notes.push(`Location "${location}" was used recently for this creator`);
  return notes;
}
