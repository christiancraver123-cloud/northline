import { Card, PageHeader, Pill } from "@/components/ui";

const AGENTS: [string, string, string][] = [
  ["ORCHESTRATOR", "Interprets the request, identifies creators/format, builds the task plan", "intent.ts + plan.ts"],
  ["CONTENT_STRATEGIST", "Concept angles; avoids recent repeats from production history", "agents.ts"],
  ["CREATIVE_DIRECTOR", "Location, outfit, lighting, shot list, Reel plan", "agents.ts"],
  ["PROMPT_ENGINEER", "Provider-ready prompts with canonical identity block + negatives", "agents.ts"],
  ["CAPTION_WRITER", "Creator-voice captions (template v0)", "agents.ts"],
  ["IDENTITY_QA", "Checks identity-critical markers in prompts before generation", "identity.ts"],
  ["CONTENT_QA", "Duplicate prompts / recent-location checks", "agents.ts"],
  ["PRODUCTION_MANAGER", "Production IDs, assets, provider jobs, retries, approvals", "execute.ts"],
  ["PERFORMANCE_AGENT", "Reads real analytics", "not built"],
  ["GROWTH_STRATEGIST", "Turns analytics into recommendations", "not built"],
];
export default function Agents() {
  return (
    <>
      <PageHeader title="Agents" sub="Agents are request-driven functions with structured inputs/outputs — not continuously running processes." />
      <Card className="mb-4 text-[13px] text-muted">Current implementation is deterministic rule-based (v0, testable, no LLM calls). An LLM-backed agent can replace any of them behind the same typed signature.</Card>
      <div className="grid gap-3 md:grid-cols-2">{AGENTS.map(([n, d, where]) => (
        <Card key={n}><div className="flex items-center justify-between"><b className="font-mono">{n}</b><Pill tone={where === "not built" ? "mute" : "ok"}>{where === "not built" ? "not built" : "rule-based v0"}</Pill></div><p className="mt-1 text-muted">{d}</p><p className="mt-1 font-mono text-[11px] text-faint">{where}</p></Card>
      ))}</div>
    </>
  );
}
