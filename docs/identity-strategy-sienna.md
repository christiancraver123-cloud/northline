# Sienna identity strategy — current status (operator decision, 2026-10-01)

**BEST KNOWN OpenAI strategy:** `MASTER_FACE ONLY` + `input_fidelity: high`, master explicitly labelled the exact identity authority, canonical hard locks from the identity record, no supporting full-scene references, no generated references.
**Status: PARTIALLY VALIDATED · POSE GENERALIZATION UNVALIDATED.** This is a *strategy*, not an identity asset, and it is **not** "Sienna identity solved".

## Evidence (all images preserved in storage `experiments/…`; none is a reference)
| Locks | Probe B (frontal) | Validation (asked for 3/4) |
|---|---|---|
| Both eyes light green-gray, no heterochromia | held | held |
| Freckle density | held | held |
| Dark messy center-parted hair | held | held |
| Gold hoops + small round pendant | held | held |
| Facial geometry (brow arch, lip fullness/shape, nose width, jaw/forehead width) | drifts | drifts |
| Complexion treatment / apparent age | drifts | drifts |
| **3/4 pose** | n/a | **NOT achieved (frontal)** → the question "does identity survive pose change?" is open |

## Rules in force
- MASTER_FACE remains the sole identity authority. Do NOT promote the probe/validation images, do NOT use them (or Probe B) as references.
- FACE_3Q_RIGHT is NOT added back to production yet. No provider switch yet. Canonical identity unchanged.
- No further Sienna image generation (single image or carousel) until the operator approves a specific, bounded next test.
- Unrelated engineering continues; Sienna calibration never blocks it.
- Design-only comparison of pose-control approaches: `docs/design/sienna-pose-control-options.md` (no winner selected).
