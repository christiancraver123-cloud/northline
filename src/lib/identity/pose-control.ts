// TEST-ONLY PROTOTYPES (Sienna pose-control design). Pure data representations + validators. NOTHING here calls a provider, generates an image,
// reads storage, or changes a canonical reference/identity. It exists so that a later, separately approved experiment needs no engineering delay.
// Three representations: (1) identity-reference ROLE metadata, (2) a ZERO-AUTHORITY pose guide, (3) an edit-base request (+ the exact multipart plan it
// would produce on the images/edits endpoint). Status of the strategy: MASTER_FACE ONLY + HIGH INPUT FIDELITY is partially validated; pose generalization unvalidated.
import type { ReferenceAsset } from "@/lib/db/records";
import type { ReferenceType } from "@/lib/domain/types";
import { cropRaster, encodePng, type Raster } from "@/lib/media/png";

// ---- (1) Identity-reference role metadata -----------------------------------------------------
/** What a reference is FOR in one request. Role is per-request metadata; it never changes the stored reference. */
export type ReferenceRole = "IDENTITY_AUTHORITY" | "IDENTITY_SUPPORT" | "POSE_GUIDE" | "EDIT_BASE" | "STYLE_HINT";
export interface RoleTaggedReference { role: ReferenceRole; label: string; sha256: string; referenceId: string | null; referenceType: ReferenceType | null; /** MASTER/SUPPORTING for canonical references; NONE for everything else */ authority: "MASTER" | "SUPPORTING" | "NONE"; canonical: boolean }
export class RoleViolation extends Error {}

/** Default role for a canonical reference: the ACTIVE MASTER_FACE is the identity authority, other canonical types are support. Archived/non-canonical are refused. */
export function identityRoleFor(r: Pick<ReferenceAsset, "id" | "referenceType" | "authority" | "status" | "sha256" | "source">): RoleTaggedReference {
  if (r.status !== "ACTIVE") throw new RoleViolation("only ACTIVE canonical references can carry an identity role");
  if (r.source !== "upload") throw new RoleViolation("a reference promoted from a generated image has no identity authority for experiments");
  return { role: r.referenceType === "MASTER_FACE" ? "IDENTITY_AUTHORITY" : "IDENTITY_SUPPORT", label: r.referenceType, sha256: r.sha256, referenceId: r.id, referenceType: r.referenceType, authority: r.authority, canonical: true };
}
/** A request's reference set must have exactly one IDENTITY_AUTHORITY (the MASTER_FACE), listed first; only canonical references may carry an identity role; guides/bases carry NO authority. */
export function assertRoleSet(refs: RoleTaggedReference[]): void {
  const auth = refs.filter((r) => r.role === "IDENTITY_AUTHORITY");
  if (auth.length !== 1) throw new RoleViolation(`exactly one IDENTITY_AUTHORITY is required (found ${auth.length})`);
  if (auth[0].referenceType !== "MASTER_FACE") throw new RoleViolation("the IDENTITY_AUTHORITY must be the canonical MASTER_FACE");
  if (refs[0] !== auth[0] && !(refs.some((r) => r.role === "EDIT_BASE") && refs[0].role === "EDIT_BASE")) throw new RoleViolation("the IDENTITY_AUTHORITY must be listed first (after an explicit EDIT_BASE, if any)");
  for (const r of refs) {
    const identity = r.role === "IDENTITY_AUTHORITY" || r.role === "IDENTITY_SUPPORT";
    if (identity && !r.canonical) throw new RoleViolation(`"${r.label}" is not canonical and cannot carry an identity role`);
    if (!identity && (r.authority !== "NONE" || r.canonical)) throw new RoleViolation(`${r.role} "${r.label}" must have zero authority and must not be canonical`);
  }
}

// ---- (2) Zero-authority pose guide ----------------------------------------------------------------
export interface PoseGuide {
  kind: "angles" | "silhouette" | "keypoints" | "depth";
  /** Head orientation in degrees, camera-relative: yaw + = turned toward camera-right, pitch + = chin up, roll + = tilted clockwise. */
  headAngles: { yawDeg: number; pitchDeg: number; rollDeg: number };
  source: "synthetic" | "operator-sketch";
  /** ALWAYS NONE. A guide describes pose only; it is never identity and never becomes a reference. */
  authority: "NONE"; canonical: false; isReference: false; note: string;
}
export function makePoseGuide(o: { kind?: PoseGuide["kind"]; yawDeg: number; pitchDeg?: number; rollDeg?: number; source?: PoseGuide["source"]; note?: string }): PoseGuide {
  const a = { yawDeg: o.yawDeg, pitchDeg: o.pitchDeg ?? 0, rollDeg: o.rollDeg ?? 0 };
  if (Object.values(a).some((v) => !Number.isFinite(v))) throw new RoleViolation("pose angles must be finite numbers");
  if (Math.abs(a.yawDeg) > 90 || Math.abs(a.pitchDeg) > 60 || Math.abs(a.rollDeg) > 45) throw new RoleViolation("pose angles are outside the supported range (|yaw|<=90, |pitch|<=60, |roll|<=45)");
  return { kind: o.kind ?? "angles", headAngles: a, source: o.source ?? "synthetic", authority: "NONE", canonical: false, isReference: false, note: o.note ?? "pose only; carries no identity" };
}
/** Words for the prompt side of a guide. Camera-relative so the model is not asked to reason in anatomical left/right. */
export function describePose(g: PoseGuide): string {
  const { yawDeg: y, pitchDeg: p, rollDeg: r } = g.headAngles;
  const dir = y === 0 ? "facing the camera" : `head turned about ${Math.abs(y)}° toward the ${y > 0 ? "right" : "left"} side of the frame`;
  return `${dir}${p ? `, chin ${p > 0 ? "raised" : "lowered"} about ${Math.abs(p)}°` : ""}${r ? `, head tilted about ${Math.abs(r)}° ${r > 0 ? "clockwise" : "counter-clockwise"}` : ""}. (Pose description only — identity comes solely from the MASTER_FACE.)`;
}
export function asRoleTagged(g: PoseGuide, sha256: string): RoleTaggedReference { return { role: "POSE_GUIDE", label: `pose-guide:${g.kind}`, sha256, referenceId: null, referenceType: null, authority: "NONE", canonical: false }; }

// ---- (3) Edit-base request + multipart plan -------------------------------------------------------
export interface EditMask { /** Edit region in base-image pixels. OpenAI semantics: TRANSPARENT mask pixels are the ones the model may change; opaque pixels are kept. */ region: { x: number; y: number; w: number; h: number }; invert: boolean; sha256: string | null }
export interface EditBaseRequest {
  base: RoleTaggedReference; baseWidth: number; baseHeight: number;
  identity: RoleTaggedReference; extra: RoleTaggedReference[];
  mask: EditMask | null; instruction: string; size: "1024x1024" | "1024x1536" | "1536x1024" | "auto"; inputFidelity: "high" | "low";
}
export const MAX_EDIT_IMAGES = 16;
/** Rules for an identity-preserving edit. The base must be the CANONICAL MASTER_FACE (the pixels ARE the identity) — never a generated image. */
export function validateEditBaseRequest(r: EditBaseRequest): string[] {
  const p: string[] = [];
  if (r.base.role !== "EDIT_BASE") p.push("base must carry the EDIT_BASE role");
  if (!r.base.canonical || r.base.referenceType !== "MASTER_FACE") p.push("the edit base must be the canonical MASTER_FACE (a generated image can never be the identity base)");
  if (r.identity.role !== "IDENTITY_AUTHORITY" || r.identity.referenceType !== "MASTER_FACE") p.push("identity authority must be the canonical MASTER_FACE");
  if (r.identity.sha256 !== r.base.sha256) p.push("identity authority and edit base must be the same MASTER_FACE file (same sha256)");
  for (const x of r.extra) if (x.role === "IDENTITY_AUTHORITY" || x.role === "EDIT_BASE") p.push(`extra reference "${x.label}" cannot be a second ${x.role}`); else if (x.role !== "POSE_GUIDE" && x.role !== "STYLE_HINT" && x.role !== "IDENTITY_SUPPORT") p.push(`unsupported role ${x.role}`);
  for (const x of r.extra) if ((x.role === "POSE_GUIDE" || x.role === "STYLE_HINT") && (x.authority !== "NONE" || x.canonical)) p.push(`${x.role} must have zero authority`);
  if (r.extra.length + 1 > MAX_EDIT_IMAGES) p.push(`too many input images (max ${MAX_EDIT_IMAGES})`);
  if (r.inputFidelity !== "high") p.push("identity edits require input_fidelity=high");
  if (r.mask) {
    const m = r.mask.region;
    if (m.w <= 0 || m.h <= 0 || m.x < 0 || m.y < 0 || m.x + m.w > r.baseWidth || m.y + m.h > r.baseHeight) p.push("mask region is outside the base image");
  }
  if (!r.instruction.trim()) p.push("instruction is empty");
  return p;
}

/** A transparent-where-editable RGBA PNG the size of the base. Pure; the base image bytes are never touched. */
export function buildEditMaskPng(width: number, height: number, region: { x: number; y: number; w: number; h: number }, invert = false): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h;
    const editable = invert ? !inside : inside, o = (y * width + x) * 4;
    data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = editable ? 0 : 255;
  }
  const r: Raster = { width, height, channels: 4, data };
  return encodePng(cropRaster(r, 0, 0, width, height));
}

export interface FormPlan { method: "POST"; endpoint: "/v1/images/edits"; fields: [string, string][]; files: { field: "image[]" | "mask"; role: ReferenceRole | "MASK"; label: string; sha256: string | null }[] }
/** The multipart request the edits endpoint would receive. DESCRIPTION ONLY: no bytes, no fetch. The no-mask form is asserted equal to what the current adapter sends. */
export function buildEditsFormPlan(r: EditBaseRequest, model = "gpt-image-1"): FormPlan {
  const problems = validateEditBaseRequest(r);
  if (problems.length) throw new RoleViolation(problems.join("; "));
  const images = [r.base, ...r.extra.filter((x) => x.sha256 !== r.base.sha256)];
  return {
    method: "POST", endpoint: "/v1/images/edits",
    fields: [["model", model], ["prompt", r.instruction], ["size", r.size], ["n", "1"], ["input_fidelity", r.inputFidelity]],
    files: [...images.map((x) => ({ field: "image[]" as const, role: x.role, label: x.label, sha256: x.sha256 })), ...(r.mask ? [{ field: "mask" as const, role: "MASK" as const, label: "edit-mask", sha256: r.mask.sha256 }] : [])],
  };
}
