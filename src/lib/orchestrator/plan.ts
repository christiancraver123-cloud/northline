// Orchestrator planning: CreateRequest -> structured TaskPlan with productions, dependencies and agent assignments.
import type { CollabScope, ContentType, TalentCode } from "@/lib/domain/types";
import type { CreateRequest } from "./contracts";

export interface PlannedProduction {
  talent: TalentCode[]; // primary first
  contentType: ContentType;
  concept: string;
  assetCount?: number;
  role: "solo" | "creator-perspective" | "shared";
  /** Operator-supplied creative direction; replaces the rule-based Creative Director for this production. */
  creative?: CreateRequest["creative"];
}
export interface Task { id: string; agent: string; dependsOn: string[]; summary: string }
export interface TaskPlan {
  campaign: { name: string; scope: CollabScope; talent: TalentCode[] } | null;
  productions: PlannedProduction[];
  tasks: Task[];
}

export function scopeFor(n: number): CollabScope {
  return n <= 1 ? "SOLO" : n === 2 ? "DUO" : n >= 6 ? "ALL_SIX" : "GROUP";
}

export function planRequest(req: CreateRequest): TaskPlan {
  const isCampaignish = req.format === "CAMPAIGN" || req.format === "COLLAB";
  const concept = req.concept || (isCampaignish ? "weekend campaign" : "");
  const productions: PlannedProduction[] = [];

  if (isCampaignish) {
    for (const t of req.talent) {
      productions.push({ talent: [t, ...req.talent.filter((x) => x !== t)], contentType: "CAROUSEL", concept, assetCount: req.asset_count, role: "creator-perspective" });
      productions.push({ talent: [t, ...req.talent.filter((x) => x !== t)], contentType: "STORY", concept, assetCount: 3, role: "creator-perspective" });
    }
    if (req.talent.length > 1) productions.push({ talent: [...req.talent], contentType: "REEL", concept, role: "shared" });
  } else {
    for (const t of req.talent) for (let i = 0; i < req.quantity; i++) {
      productions.push({ talent: [t], contentType: req.format, concept, assetCount: req.asset_count, role: "solo", creative: req.creative });
    }
  }

  const campaign = isCampaignish || req.talent.length > 1
    ? { name: req.campaign_name || (concept ? concept[0].toUpperCase() + concept.slice(1) : "Untitled campaign"), scope: scopeFor(req.talent.length), talent: [...req.talent] }
    : null;

  const tasks: Task[] = [
    { id: "t1", agent: "ORCHESTRATOR", dependsOn: [], summary: `Interpret request (${req.format}, ${req.talent.join("+")})` },
    { id: "t2", agent: "CONTENT_STRATEGIST", dependsOn: ["t1"], summary: "Pick concept angles, avoid recent repeats" },
    { id: "t3", agent: "CREATIVE_DIRECTOR", dependsOn: ["t2"], summary: "Scene, location, outfit, shot list" },
    { id: "t4", agent: "PROMPT_ENGINEER", dependsOn: ["t3"], summary: "Provider-ready prompts with canonical identity" },
    { id: "t5", agent: "IDENTITY_QA", dependsOn: ["t4"], summary: "Validate identity-critical markers before generation" },
    { id: "t6", agent: "CAPTION_WRITER", dependsOn: ["t3"], summary: "Creator-voice captions" },
    { id: "t7", agent: "PRODUCTION_MANAGER", dependsOn: ["t5", "t6"], summary: "Create production records, run provider jobs, track assets" },
    { id: "t8", agent: "CONTENT_QA", dependsOn: ["t7"], summary: "Duplication / consistency checks" },
    { id: "t9", agent: "HUMAN", dependsOn: ["t8"], summary: "Approval required before anything is scheduled or published" },
  ];
  return { campaign, productions, tasks };
}
