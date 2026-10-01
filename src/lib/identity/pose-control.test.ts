// Prototype tests for the pose-control representations. NO provider call is made anywhere in this file (fetch is a recorder that throws on use outside the adapter-shape test,
// and even there it never reaches a network: it is a local stub).
import { describe, expect, it, vi } from "vitest";
import type { ReferenceAsset } from "@/lib/db/records";
import { decodePng } from "@/lib/media/png";
import { openaiImage } from "@/lib/providers/openai";
import { pngBytes } from "@/test/png";
import { asRoleTagged, assertRoleSet, buildEditMaskPng, buildEditsFormPlan, describePose, identityRoleFor, makePoseGuide, RoleViolation, validateEditBaseRequest, type EditBaseRequest } from "./pose-control";

const ref = (t: ReferenceAsset["referenceType"], o: Partial<ReferenceAsset> = {}) => ({ id: `r-${t}`, referenceType: t, authority: t === "MASTER_FACE" ? "MASTER" : "SUPPORTING", status: "ACTIVE", sha256: `sha-${t}`, source: "upload", ...o }) as ReferenceAsset;
const master = identityRoleFor(ref("MASTER_FACE"));
const baseOf = (m = master) => ({ ...m, role: "EDIT_BASE" as const });
const req = (o: Partial<EditBaseRequest> = {}): EditBaseRequest => ({ base: baseOf(), baseWidth: 1024, baseHeight: 1536, identity: master, extra: [], mask: null, instruction: "same woman, plain wall", size: "1024x1536", inputFidelity: "high", ...o });

describe("identity-reference role metadata", () => {
  it("MASTER_FACE is the identity authority; other canonical types are support; archived and promoted-from-generated are refused", () => {
    expect(master).toMatchObject({ role: "IDENTITY_AUTHORITY", authority: "MASTER", canonical: true });
    expect(identityRoleFor(ref("FACE_FRONT")).role).toBe("IDENTITY_SUPPORT");
    expect(() => identityRoleFor(ref("MASTER_FACE", { status: "ARCHIVED" }))).toThrow(RoleViolation);
    expect(() => identityRoleFor(ref("FACE_FRONT", { source: "promoted_from_generated" }))).toThrow(/generated/);
  });
  it("a request needs exactly one IDENTITY_AUTHORITY, it must be the MASTER_FACE and come first", () => {
    expect(() => assertRoleSet([master])).not.toThrow();
    expect(() => assertRoleSet([])).toThrow(/exactly one/);
    expect(() => assertRoleSet([master, master])).toThrow(/exactly one/);
    expect(() => assertRoleSet([identityRoleFor(ref("FACE_FRONT")), master])).toThrow(/first/);
  });
  it("only canonical references may carry an identity role; guides and bases must have zero authority", () => {
    const fake = { ...identityRoleFor(ref("FACE_FRONT")), canonical: false };
    expect(() => assertRoleSet([master, fake])).toThrow(/not canonical/);
    const guide = asRoleTagged(makePoseGuide({ yawDeg: 30 }), "g1");
    expect(() => assertRoleSet([master, guide])).not.toThrow();
    expect(() => assertRoleSet([master, { ...guide, authority: "SUPPORTING" }])).toThrow(/zero authority/);
  });
});

describe("zero-authority pose guide", () => {
  it("has authority NONE, is never canonical or a reference, and validates angle ranges", () => {
    const g = makePoseGuide({ yawDeg: -35, pitchDeg: -10, rollDeg: 5 });
    expect(g).toMatchObject({ authority: "NONE", canonical: false, isReference: false, source: "synthetic" });
    expect(() => makePoseGuide({ yawDeg: 120 })).toThrow(/outside/);
    expect(() => makePoseGuide({ yawDeg: NaN })).toThrow(/finite/);
  });
  it("describes pose camera-relatively and states that identity comes only from the master", () => {
    expect(describePose(makePoseGuide({ yawDeg: 35, pitchDeg: -10 }))).toMatch(/turned about 35° toward the right side of the frame, chin lowered about 10°.*MASTER_FACE/);
    expect(describePose(makePoseGuide({ yawDeg: 0 }))).toMatch(/^facing the camera/);
  });
});

describe("edit-base request", () => {
  it("accepts the canonical master as base + identity with high fidelity", () => { expect(validateEditBaseRequest(req())).toEqual([]); });
  it("rejects a generated image, a non-master base, mismatched files, low fidelity, bad masks and a second authority", () => {
    const generated = { ...baseOf(), canonical: false, authority: "NONE" as const, referenceType: null, sha256: "gen", role: "EDIT_BASE" as const };
    expect(validateEditBaseRequest(req({ base: generated })).join("|")).toMatch(/canonical MASTER_FACE/);
    expect(validateEditBaseRequest(req({ base: { ...baseOf(), sha256: "other" } })).join("|")).toMatch(/same MASTER_FACE file/);
    expect(validateEditBaseRequest(req({ inputFidelity: "low" })).join("|")).toMatch(/input_fidelity=high/);
    expect(validateEditBaseRequest(req({ mask: { region: { x: 1000, y: 0, w: 100, h: 100 }, invert: false, sha256: null } })).join("|")).toMatch(/outside/);
    expect(validateEditBaseRequest(req({ extra: [master] })).join("|")).toMatch(/second IDENTITY_AUTHORITY/);
    expect(validateEditBaseRequest(req({ instruction: " " })).join("|")).toMatch(/empty/);
  });
  it("mask PNG: transparent where editable, opaque where kept; the region and its inverse are exact complements", () => {
    const m = decodePng(buildEditMaskPng(8, 6, { x: 2, y: 1, w: 3, h: 2 })), inv = decodePng(buildEditMaskPng(8, 6, { x: 2, y: 1, w: 3, h: 2 }, true));
    expect(m.channels).toBe(4);
    const alpha = (r: typeof m, x: number, y: number) => r.data[(y * r.width + x) * 4 + 3];
    expect(alpha(m, 2, 1)).toBe(0); expect(alpha(m, 0, 0)).toBe(255);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) expect(alpha(m, x, y) + alpha(inv, x, y)).toBe(255);
  });
  it("builds the multipart plan: master first as the image, mask separate, no bytes and no network", () => {
    const fetchSpy = vi.fn(() => { throw new Error("network must not be used"); });
    vi.stubGlobal("fetch", fetchSpy);
    const plan = buildEditsFormPlan(req({ mask: { region: { x: 0, y: 0, w: 1024, h: 600 }, invert: false, sha256: "m" } }));
    expect(plan.endpoint).toBe("/v1/images/edits");
    expect(plan.files.map((f) => `${f.field}:${f.role}`)).toEqual(["image[]:EDIT_BASE", "mask:MASK"]);
    expect(Object.fromEntries(plan.fields)).toMatchObject({ model: "gpt-image-1", n: "1", input_fidelity: "high", size: "1024x1536" });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("an invalid request cannot produce a plan", () => { expect(() => buildEditsFormPlan(req({ inputFidelity: "low" }))).toThrow(RoleViolation); });
});

describe("what the CURRENT OpenAI adapter supports (architecture facts for Option D)", () => {
  it("sends references as image[] on /edits with input_fidelity, in the given order (master first), and has NO mask support", async () => {
    let captured: { url: string; form: FormData } | null = null;
    const stub = (async (url: string, init: RequestInit) => { captured = { url, form: init.body as FormData }; return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(pngBytes()).toString("base64") }] }), { status: 200 }); }) as unknown as typeof fetch;
    const img = openaiImage("test-key", "gpt-image-1", stub);
    await img.generate({ productionCode: "T", shotN: 1, prompt: "p", negative: "n", talent: "SIE", size: "1024x1536", inputFidelity: "high",
      references: [{ type: "MASTER_FACE", bytes: pngBytes(), mime: "image/png" }, { type: "FACE_FRONT", bytes: pngBytes(), mime: "image/png" }] });
    const form = captured!.form;
    expect(captured!.url).toMatch(/\/images\/edits$/);
    expect(form.getAll("image[]").length).toBe(2);
    expect((form.getAll("image[]")[0] as File).name).toMatch(/MASTER_FACE/);
    expect(form.get("input_fidelity")).toBe("high");
    expect(form.get("mask")).toBeNull(); // GAP: no mask field exists in ImageRequest/adapter
  });
  it("the plan's no-mask field set equals what the adapter sends (same endpoint family, same fields)", async () => {
    let form: FormData | null = null;
    const stub = (async (_u: string, init: RequestInit) => { form = init.body as FormData; return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(pngBytes()).toString("base64") }] }), { status: 200 }); }) as unknown as typeof fetch;
    await openaiImage("k", "gpt-image-1", stub).generate({ productionCode: "T", shotN: 1, prompt: "p", negative: "n", talent: "SIE", size: "1024x1536", inputFidelity: "high", references: [{ type: "MASTER_FACE", bytes: pngBytes(), mime: "image/png" }] });
    const sent = [...(form as unknown as FormData).keys()].filter((k, i, a) => a.indexOf(k) === i).sort();
    const planned = [...new Set([...buildEditsFormPlan(req()).fields.map(([k]) => k), "image[]"])].sort();
    expect(sent).toEqual(planned);
  });
});
