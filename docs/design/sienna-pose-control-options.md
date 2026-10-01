# Sienna — pose variation while preserving MASTER_FACE identity (DESIGN ONLY)
**Nothing here was generated or spent. No option is selected.** Status: MASTER_FACE-only + high input fidelity is the best known OpenAI strategy — PARTIALLY VALIDATED, POSE GENERALIZATION UNVALIDATED (`docs/identity-strategy-sienna.md`).

## What the evidence already says (our own, real runs)
| Observation | Source | Implication |
|---|---|---|
| High fidelity + master only produced the same **frontal** pose twice, even when the prompt asked for a tilted 3/4 turn | Probe B, validation (n=2, one prompt style) | Text pose instructions are weak against a high-fidelity reference; may be prompt wording, may be structural — **unknown** |
| Low fidelity + 3 full-scene references produced varied poses (over-shoulder, walking, seated) but weaker likeness | Attempt 3 | There is an **identity ↔ pose-freedom trade-off** controlled largely by input fidelity / reference weight |
| Two face crops (master + 3Q) at high fidelity drifted to hazel/brown eyes | Probe C | Multiple identity images can **average**; the master alone held the eye colour better |
| High fidelity costs more input tokens (4,483 image tokens for one reference vs 840 for three at default; two crops 8,708) | usage records | Cost scales with number of high-fidelity inputs; output tokens (6,240) dominate and are constant |
| Cost per image ≈ $0.30–0.34 on remembered OpenAI list prices | **unverified**; Northline stores usage, not dollars | Budget caps will be counts |

## The five approaches
Ratings are **expectations to be tested, not results** (L/M/H = low/medium/high).

| | A. Master only + stronger pose-first prompt | B. Master (high fidelity) + FACE_3Q_RIGHT, strict roles | C. Master (high fidelity) + derived pose/control reference (ZERO identity authority) | D. Identity-preserving **edit** workflow (edits endpoint, base image + optional mask) | E. Higgsfield identity/character (benchmark only) |
|---|---|---|---|---|---|
| **Expected identity preservation** | M–H (same as validation) | M (3Q adds real 3/4 geometry, but Probe C showed drift) | M–H if the guide carries no face cues | **H when the base is the MASTER_FACE itself** (the pixels are the identity); falls as the edit gets bigger | Unknown; trained identities are often strong, **unverified here** |
| **Pose controllability** | L (n=2 ignored) — may improve with camera-relative wording/ordering | M (a real 3/4 reference exists) | M, uncertain: gpt-image-1 has no ControlNet; extra images are *composed*, not obeyed as pose maps | **Limited by the base**: editing the master keeps its tilted 3/4 pose (exactly the canonical geometry) but cannot reach new poses | M–H by the vendor's claims; unverified |
| **Risk of identity averaging** | L | **M–H** (observed hazel eyes in C) | L–M (depends on how abstract the guide is; contour of a real head leaks jaw/face shape) | L | L (single trained subject) but depends on training set |
| **Scene leakage risk** | M (master's sunset/beach can bleed) | **M–H** (3Q is a sunset balcony; a tight crop lowers it) | M (guide's background/composition can be copied) | M (background is replaced via prompt; a mask can confine the change) | L–M |
| **Implementation complexity** | **Trivial** (prompt only) | Low (config exists: references list + roles) | **Medium–High** (create/curate a zero-authority guide; lineage; adapter must label it; QA must know it is not identity) | Medium (adapter needs the `mask` field and an "edit base" notion distinct from "reference"; lineage = base asset) | **High** (new async adapter + media upload + QA path; Higgsfield stub exists, nothing live) |
| **Expected cost** | ≈ one image (≈ $0.3) per try | ≈ +0.04 vs A (more image tokens) | ≈ +0.04 plus guide creation effort | ≈ one image per try | Credits (plan-dependent, unknown) + training time (~10 min) |
| **Compatible with Northline** | Fully (no change) | Fully (existing `selectReferences`/roles; **operator said not yet**) | Needs a new `ReferenceAuthority` value (e.g. `GUIDE`, authority NONE) so QA/UI never treat it as identity | Needs `inputImage`/`mask` on `ImageRequest` + lineage field (`editBaseAssetId`); generated outputs stay zero-authority | Needs a provider adapter, a data-governance decision, and a QA policy |
| **Canonical references stay authoritative?** | Yes | Yes (master first, 3Q supporting, hierarchy unchanged) | Yes, provided the guide is stored as derived/NONE and the prompt says it carries no identity | Yes: the master is an **edit base**, not a modified canonical (never overwritten); the output is a generated asset with zero authority | **Only if** the trained Soul is treated as a derived model and **never** trained on generated images; uploading canonical references to a third party is itself a decision for the operator |

## Cross-cutting constraints
- **Never** train, edit-from, or reference a *generated* image as identity (Probe B / validation outputs are excluded by your rule). D's base is the canonical MASTER_FACE file, not a generation.
- E is blocked by data today: Higgsfield Soul training wants **5–20 photos** of one person; Sienna has **3 canonical references**. More *canonical* material (not generated outputs) would be needed — a human decision about what counts as canonical.
- Whatever is tested must keep the production prompt system unchanged until a human chooses.

## Proposed evaluation protocol (NOT run; needs your approval of scope and spend)
1. Pre-register: one variable per arm; the same 3 pose prompts (e.g. "head turned ~35° to camera-left, chin down", "looking over her right shoulder", "profile-ish 3/4 looking off-frame"), same scene/wardrobe/lighting.
2. Small, capped sample (e.g. ≤ 2 images per arm per prompt) with an explicit image budget; arms chosen by you from A–E.
3. Judge **blind** (arm labels hidden) on a fixed checklist: hard locks (eyes, freckles, hair, pendant, hoops), geometry (brow arch, lip fullness, nose width, jaw/forehead width), complexion, apparent age, **pose achieved Y/N**, scene leakage Y/N, AI tells.
4. Record usage per image (stored separately from price), the exact reference configuration and prompt, and mark the experiment AWAITING HUMAN SELECTION; stop after the sample.
5. Gemini identity QA (once quota allows) can add an objective second opinion on hard locks; it never replaces the human choice.

## Zero-cost checks available now (no generation)
- Re-read Attempt 3 and Probe C against the canonical crops for pose/identity trade-offs (done informally above).
- Prototype the guide-reference *data model* (authority `NONE`, lineage) and the `mask`/`editBase` request fields behind tests, so a later approved test needs no engineering delay.
