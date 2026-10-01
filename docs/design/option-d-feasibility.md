# Option D (identity-preserving edit from the canonical MASTER_FACE) — architecture feasibility
**Analysis only. Nothing was generated or spent; this is not approval to generate.** Evidence: `src/lib/providers/openai.ts`, `src/lib/identity/pose-control.ts` + tests (mocked fetch only).

## What the current architecture already does
- With references, the OpenAI adapter calls **`/v1/images/edits`** with every reference as `image[]` (order preserved; `selectReferences` puts MASTER_FACE first) plus optional `input_fidelity`. The validated strategy (MASTER_FACE only + `input_fidelity=high`) is therefore *already* an edits call whose "base" is the master — the model composes a new scene from it, it does not copy pixels.
- Asserted by test: `image[]` ordering, `input_fidelity`, and the **absence of a `mask` field** in both `ImageRequest` and the adapter.

## What true Option D needs (gaps)
| Need | Today | Change |
|---|---|---|
| `mask` multipart field | not supported | add optional `mask` (PNG with alpha) to `ImageRequest` + adapter (≈10 lines) |
| Mask PNG creation | none | `buildEditMaskPng` (prototype, tested): transparent = editable, opaque = kept; RGBA via the existing PNG codec |
| "Edit base" distinct from "reference" | only `references[]` | role metadata (`EDIT_BASE`, prototype) + lineage field (`editBaseAssetId`/sha) on the asset; output stays a zero-authority generated asset |
| Guard: base must be canonical | n/a | `validateEditBaseRequest` (prototype) refuses any non-canonical / generated base |
| Identity-role metadata in QA/UI | reference types only | `RoleTaggedReference` (prototype) so a guide/base is never mistaken for identity |

## Constraints (from the API's documented behaviour; **UNVERIFIED against the live API** — confirm in one approved, capped test)
1. The mask applies to the **first** `image[]`; it must have an alpha channel and the **same dimensions** as that image. Transparent pixels are regenerated, opaque pixels are intended to be kept — but the model may still alter "kept" regions slightly (not a pixel-exact guarantee).
2. The master is a tilted 3/4 portrait. A mask that keeps the face preserves identity **and the master's head pose** — so Option D can change *scene, wardrobe, background, framing* but **cannot** produce a different head pose without un-masking the face, which gives up the pixel-level identity advantage.
3. A pose guide (Option C) would be an additional `image[]` input; gpt-image-1 composes extra images, it does not treat them as ControlNet pose maps. Guides can leak jaw/face contour; a guide must be zero-authority and abstract.
4. `input_fidelity=high` multiplies image-input tokens (4,483 for one master); a mask adds no extra generated output but one more uploaded image. Cost stays dominated by the output (≈6,240 tokens) — the budget governor counts images, so cost is capped by count either way.
5. Size must be one of the endpoint's supported sizes; Northline's 4:5 delivery is a *derived crop* (already implemented), unaffected.

## Verdict
- **Supported now, with no code change:** edits-from-MASTER_FACE with high fidelity (the validated strategy).
- **Supported after a small, test-covered adapter change (not made here):** masked edits for scene/wardrobe/background variation with the face region kept.
- **Not supported by any option here:** reliable *new head poses* with pixel-level identity — pose generalization remains UNVALIDATED and needs an approved, capped experiment (≤ budget limits) chosen by a human.
## Human decisions still needed (none taken)
Whether to spend on a capped experiment, which arm(s) (A–E), and the subjective identity judgement of any result. Nothing was generated; no reference, identity or provider setting was changed.
