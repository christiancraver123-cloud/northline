// Create-studio prompt preview. PURE and client-safe: assembles the SAME prompt the pipeline will build for a one-image production
// (same buildPrompts, same canonical identity), split into labelled sections so the founder can see what goes to the provider.
import type { GenerationBriefData } from "@/lib/db/records";
import type { ReferenceAuthority, ReferenceType, TalentCode } from "@/lib/domain/types";
import { buildCanonicalIdentity } from "@/lib/identity/canonical";
import { buildPrompts, GLOBAL_NEGATIVES, hardLockLines } from "./prompts";
import { providerRequirements } from "./brief";
import type { CreativeInput, GenerationSettings } from "@/lib/orchestrator/contracts";
import type { QaSeverity } from "@/lib/domain/types";

export interface StudioBrief {
  scene: string; location: string; activity: string; outfit: string; mood: string; pose: string; camera: string; lighting: string; storyBeat: string; notes: string;
}
export const EMPTY_BRIEF: StudioBrief = { scene: "", location: "", activity: "", outfit: "", mood: "", pose: "", camera: "", lighting: "", storyBeat: "", notes: "" };

/** The single shot description the pipeline receives (scene + activity + pose + mood + notes). */
export function shotDescription(b: StudioBrief): string {
  return [b.scene, b.activity && `Activity: ${b.activity}`, b.pose && `Pose: ${b.pose}`, b.mood && `Mood: ${b.mood}`, b.notes && `Notes: ${b.notes}`].filter(Boolean).join(". ");
}

/** Studio form → the operator creative input the existing pipeline already accepts (one shot). */
export function toCreative(b: StudioBrief, g: GenerationSettings): CreativeInput & { shots: { n: number; kind: "IMG"; description: string; camera?: string }[]; generation: GenerationSettings } {
  return {
    hook: (b.mood || b.scene).slice(0, 300), location: b.location, outfit: b.outfit, lighting: b.lighting, storyBeat: (b.storyBeat || b.scene).slice(0, 600),
    shots: [{ n: 1, kind: "IMG" as const, description: shotDescription(b).slice(0, 800), camera: b.camera || undefined }], generation: g,
  };
}

export const briefComplete = (b: StudioBrief) => [b.scene, b.location, b.outfit, b.lighting].every((x) => x.trim().length > 0);

export interface PreviewSection { key: string; label: string; text: string }
export interface StudioPreview { sections: PreviewSection[]; finalPrompt: string; negative: string; severity: QaSeverity; findings: string[]; size: string; aspect: string }

export function previewPrompt(code: TalentCode, b: StudioBrief, g: GenerationSettings, refs: { id: string; type: ReferenceType; authority: ReferenceAuthority }[], provider = { name: "mock", model: null as string | null }): StudioPreview {
  const ci = buildCanonicalIdentity(code);
  const creative = toCreative(b, g);
  const req = providerRequirements({ image: { name: provider.name, model: provider.model, generate: async () => { throw new Error("preview"); } } }, creative);
  const data: GenerationBriefData = {
    production: { code: `${code}-PREVIEW`, format: "POST", platform: "instagram" }, creator: { code, name: ci.name }, identityVersion: ci.id, identityBlock: ci.providerBlock,
    hardLocks: ci.hardLocks.map((l) => ({ id: l.id, label: l.label })), negativeConstraints: [...new Set(ci.negativeConstraints)],
    references: refs.map((r) => ({ ...r, hasImage: true })), referencePolicy: "", concept: b.scene, location: b.location,
    timeOfDay: /golden/i.test(b.lighting) ? "golden hour" : /night|flash|candle|neon/i.test(b.lighting) ? "night" : /dawn/i.test(b.lighting) ? "dawn" : "daytime",
    visualDirection: { outfit: b.outfit, lighting: b.lighting, palette: ci.visualLanguage.palette, mood: ci.visualLanguage.expression },
    continuity: [creative.storyBeat], recentConsiderations: [], providerRequirements: req,
    shots: creative.shots.map((s) => ({ n: s.n, kind: s.kind ?? "IMG", description: s.description, camera: s.camera })), revision: null,
  };
  // Reference choice mirrors selectReferences: master first, up to 4.
  const refIds = [...refs.filter((r) => r.type === "MASTER_FACE"), ...refs.filter((r) => r.type !== "MASTER_FACE")].slice(0, 4).map((r) => r.id);
  const [p] = buildPrompts(data, ci, { refsByShot: { 1: refIds } });
  const negatives = [...new Set([...GLOBAL_NEGATIVES, ...data.negativeConstraints])];
  return {
    sections: [
      { key: "identity", label: "Canonical identity", text: `${ci.providerBlock}\nHard locks: ${hardLockLines(ci).join(" | ")}` },
      { key: "dna", label: "Creator DNA", text: `${ci.personalityVoice.personality.join(", ")} — ${ci.personalityVoice.tone}. Expression: ${ci.visualLanguage.expression}. Palette: ${ci.visualLanguage.palette.join(", ")}.` },
      { key: "scene", label: "Scene", text: [b.scene, b.location && `Location: ${b.location}`, b.activity && `Activity: ${b.activity}`, b.outfit && `Outfit: ${b.outfit}`, b.storyBeat && `Story beat: ${b.storyBeat}`].filter(Boolean).join(". ") || "—" },
      { key: "pose", label: "Pose", text: b.pose || "— (natural, unposed)" },
      { key: "camera", label: "Camera", text: `${b.camera || "natural phone-style photography"} · ${req.aspect} · ${req.size}${req.quality ? ` · quality ${req.quality}` : ""}` },
      { key: "lighting", label: "Lighting", text: b.lighting || "—" },
      { key: "realism", label: "Realism", text: "Natural candid photography, natural skin texture, correct anatomy and hands, coherent background geometry and reflections." },
      { key: "negatives", label: "Negatives", text: negatives.join(", ") },
    ],
    finalPrompt: p.positive, negative: p.negative, severity: p.severity, findings: p.findings.map((f) => f.message), size: req.size, aspect: req.aspect,
  };
}
