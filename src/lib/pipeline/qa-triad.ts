// The founder's three QA questions for one asset — IDENTITY, ANATOMY, REALISM — derived from the stored QA results. PURE.
// Honesty: a category is PASS only when something actually inspected the image. If nothing did, it is REVIEW with confidence "none".
import type { QaResult } from "@/lib/db/records";
import { activeQa } from "./qa";

export type TriadVerdict = "PASS" | "REVIEW" | "FAIL" | "NOT RUN";
export interface TriadPart { verdict: TriadVerdict; confidence: "high" | "medium" | "low" | "none"; issues: string[]; recommendation: string; inspected: boolean }
export interface Triad { identity: TriadPart; anatomy: TriadPart; realism: TriadPart; overall: TriadVerdict }

const ANATOMY = new Set(["anatomy", "hands"]);
const REALISM = new Set(["objects", "background_geometry", "reflections", "unwanted_text", "unwanted_logos", "generation_artifacts", "camera_plausibility", "lighting_plausibility"]);
const RANK: TriadVerdict[] = ["FAIL", "REVIEW", "NOT RUN", "PASS"];
const worst = (xs: TriadVerdict[]): TriadVerdict => RANK.find((r) => xs.includes(r)) ?? "NOT RUN";

const REC: Record<TriadVerdict, Record<"identity" | "anatomy" | "realism", string>> = {
  PASS: { identity: "Identity holds.", anatomy: "No anatomy problems found.", realism: "Reads as a real photo." },
  REVIEW: { identity: "Compare face, eyes and permanent markers with the master reference before approving.", anatomy: "Check hands, fingers and limbs at full size.", realism: "Check skin, text/signage and background at full size." },
  FAIL: { identity: "Reject or regenerate: this is not reliably her.", anatomy: "Regenerate: visible anatomy defect.", realism: "Regenerate or crop: obvious generation artifact." },
  "NOT RUN": { identity: "Identity QA has not run.", anatomy: "Technical QA has not run.", realism: "Technical QA has not run." },
};

function part(which: "identity" | "anatomy" | "realism", rows: QaResult[], filter: (lockId: string | null) => boolean): TriadPart {
  if (!rows.length) return { verdict: "NOT RUN", confidence: "none", issues: [], recommendation: REC["NOT RUN"][which], inspected: false };
  const visual = rows.filter((r) => r.inspectedImage);
  const findings = rows.flatMap((r) => r.findings.filter((f) => which === "identity" || filter(f.lockId)));
  const issues = [...new Set(findings.map((f) => f.message))].slice(0, 6);
  let verdict: TriadVerdict;
  if (findings.some((f) => f.severity === "HARD_FAIL")) verdict = "FAIL";
  else if (findings.length) verdict = "REVIEW";
  else if (!visual.length) verdict = "REVIEW"; // nobody looked at the image: a human must
  else verdict = rows.some((r) => r.status === "HARD_FAIL" && which === "identity") ? "FAIL" : "PASS";
  const manual = rows.some((r) => r.method === "manual" && r.decidedBy);
  const confidence: TriadPart["confidence"] = manual ? "high" : !visual.length ? "none" : visual.some((r) => r.status === "REVIEW" || r.status === "MANUAL_REVIEW_REQUIRED") ? "low" : "medium";
  if (!visual.length && !issues.length) issues.push("Image was not visually inspected by any automated checker");
  return { verdict, confidence, issues, recommendation: REC[verdict][which], inspected: visual.length > 0 };
}

export function qaTriad(results: QaResult[], assetId: string): Triad {
  const mine = activeQa(results.filter((r) => r.assetId === assetId));
  const identity = part("identity", mine.filter((r) => r.kind === "IDENTITY" && r.method !== "prompt_rules"), () => true);
  const tech = mine.filter((r) => r.kind === "TECHNICAL");
  const anatomy = part("anatomy", tech, (id) => !!id && ANATOMY.has(id));
  const realism = part("realism", tech, (id) => !id || REALISM.has(id) || !ANATOMY.has(id));
  return { identity, anatomy, realism, overall: worst([identity.verdict, anatomy.verdict, realism.verdict]) };
}
