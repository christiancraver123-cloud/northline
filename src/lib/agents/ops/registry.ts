// Static definition of the ten agents. DB rows (agents table) hold persistent identity + operator config;
// this registry says what each agent can actually do today. `implemented:false` is shown honestly in the UI.
import type { AgentCode } from "@/lib/db/records";

export interface AgentDef {
  code: AgentCode; name: string; role: string; purpose: string;
  /** Task kinds this agent can execute. */
  handles: string[]; implemented: boolean; mode: "rule-based";
}

export const AGENT_DEFS: AgentDef[] = [
  { code: "ORCHESTRATOR", name: "Orchestrator", role: "Operator liaison and task router", purpose: "Understands operator requests, answers from real Northline state, creates and prioritises tasks, consolidates multi-agent work.", handles: ["orchestrator.consolidate"], implemented: true, mode: "rule-based" },
  { code: "CONTENT_STRATEGIST", name: "Content Strategist", role: "Concepts and content mix", purpose: "Proposes content concepts per creator from roster rules and production history; avoids repeats.", handles: ["strategist.concepts"], implemented: true, mode: "rule-based" },
  { code: "CREATIVE_DIRECTOR", name: "Creative Director", role: "Scenes, styling, shot direction", purpose: "Turns concepts into scene/location/outfit/lighting directions.", handles: ["director.concepts"], implemented: true, mode: "rule-based" },
  { code: "PROMPT_ENGINEER", name: "Prompt Engineer", role: "Provider-ready prompts", purpose: "Builds prompts with canonical identity blocks and negatives.", handles: [], implemented: true, mode: "rule-based" },
  { code: "CAPTION_WRITER", name: "Caption Writer", role: "Creator-voice copy", purpose: "Writes captions in each creator's voice (template v0).", handles: [], implemented: true, mode: "rule-based" },
  { code: "IDENTITY_QA", name: "Identity QA", role: "Identity-critical checks", purpose: "Validates canonical identity markers in prompts and explains rejections.", handles: ["identity_qa.review", "identity_qa.attempt"], implemented: true, mode: "rule-based" },
  { code: "CONTENT_QA", name: "Content QA", role: "Quality and duplication checks", purpose: "Checks duplication, repeated locations and asset health.", handles: ["content_qa.review", "content_qa.audit", "technical_qa.attempt", "content_qa.production"], implemented: true, mode: "rule-based" },
  { code: "PRODUCTION_MANAGER", name: "Production Manager", role: "Productions, assets, approvals", purpose: "Runs the production workflow, tracks approvals, publishes status digests.", handles: ["production.create", "production.regenerate", "production.finalize", "approval.wait", "production.digest"], implemented: true, mode: "rule-based" },
  { code: "PERFORMANCE_AGENT", name: "Performance Agent", role: "Analytics interpretation", purpose: "Reports on real analytics. With no analytics data it says so.", handles: ["performance.report"], implemented: true, mode: "rule-based" },
  { code: "GROWTH_STRATEGIST", name: "Growth Strategist", role: "Recommendations from data", purpose: "Recommends experiments from real analytics and production history.", handles: ["growth.recommendations"], implemented: true, mode: "rule-based" },
];
export const AGENT_BY_CODE = Object.fromEntries(AGENT_DEFS.map((a) => [a.code, a])) as Record<AgentCode, AgentDef>;

/** Default recurring jobs. Seeded DISABLED: nothing runs on a schedule until the operator enables it. */
export const DEFAULT_SCHEDULES: { agentId: AgentCode; name: string; cron: string; taskKind: string }[] = [
  { agentId: "PRODUCTION_MANAGER", name: "Daily production digest", cron: "0 14 * * *", taskKind: "production.digest" },
  { agentId: "PERFORMANCE_AGENT", name: "Weekly performance report", cron: "0 15 * * 1", taskKind: "performance.report" },
];
