// Persistent record shapes (camelCase in TS; snake_case in Postgres — see supabase/migrations).
import type {
  ApprovalState, AssetKind, AssetStatus, CollabScope, ContentType, Origin, Platform, ProductionStatus,
  ReferenceSlot, TalentCode, WorkflowState,
} from "@/lib/domain/types";

export interface Base { id: string; origin: Origin; createdAt: string; updatedAt: string }

export interface Campaign extends Base {
  name: string; concept: string; scope: CollabScope; talent: TalentCode[]; status: ProductionStatus;
}

export interface CreativeBrief {
  hook: string;
  location: string;
  outfit: string;
  lighting: string;
  storyBeat: string;
  shots: { n: number; kind: AssetKind; description: string; camera?: string }[];
  reel?: {
    sourceStill: string; durationSec: number; cameraMovement: string; subjectAction: string;
    transition: string; audioConcept: string; loopStrategy: string; higgsfieldPrompt: string;
  };
}

export interface Production extends Base {
  code: string; // e.g. SIE-2026-014
  talent: TalentCode[]; // primary creator first
  scope: CollabScope;
  contentType: ContentType;
  platform: Platform;
  concept: string;
  status: ProductionStatus;
  campaignId: string | null;
  storylineId: string | null;
  brief: CreativeBrief | null;
  qaNotes: string[];
  costUsd: number;
}

export interface Asset extends Base {
  productionId: string;
  talent: TalentCode[];
  kind: AssetKind;
  seq: number;
  status: AssetStatus;
  approval: ApprovalState;
  provider: string;
  promptId: string | null;
  storagePath: string | null; // null = no file yet (mock/demo placeholder)
  filename: string; // organisational only — metadata lives in this record
  isReference: false;
  publication: "UNPUBLISHED" | "PUBLISHED";
}

/** Canonical identity references — separate from generated assets and never auto-promoted. */
export interface ReferenceAsset extends Base {
  talent: TalentCode; slot: ReferenceSlot; storagePath: string | null; approvedBy: string | null;
}

export interface Prompt extends Base {
  productionId: string; provider: string; version: number; shotN: number;
  positive: string; negative: string; identityRefs: ReferenceSlot[]; qa: { ok: boolean; issues: string[] };
}

export interface Caption extends Base {
  productionId: string; talent: TalentCode; text: string; kind: "FEED" | "STORY"; approval: ApprovalState;
}

export interface Approval extends Base {
  productionId: string; subject: "PRODUCTION" | "ASSET" | "CAPTION" | "CAMPAIGN" | "PUBLISH";
  subjectId: string; state: ApprovalState; decidedBy: string | null; decidedAt: string | null; notes: string;
}

export interface WorkflowRun extends Base {
  workflow: string; state: WorkflowState; productionId: string | null; provider: string | null;
  startedAt: string | null; finishedAt: string | null; error: string | null; retryCount: number;
  costUsd: number; outputAssetIds: string[]; input: unknown;
}

export interface ProviderJob extends Base {
  runId: string | null; productionId: string; provider: string; model: string | null; operation: string;
  state: WorkflowState; externalId: string | null; error: string | null; assetId: string | null; shotN: number;
  costUsd: number | null; credits: number | null;
}

export interface CalendarEntry extends Base {
  productionId: string; talent: TalentCode; platform: Platform; date: string; time: string;
  state: "PLANNED" | "APPROVED" | "SCHEDULED" | "PUBLISHED";
}

export interface Storyline extends Base { talent: TalentCode[]; title: string; summary: string; status: "ACTIVE" | "DONE" }

export interface LaunchState extends Base {
  talent: TalentCode; accountCreated: boolean; handle: string | null; bioDone: boolean; aiDisclosure: boolean;
  profilePicture: boolean; masterFace: boolean; referencesDone: boolean; initialContent: boolean; approved: boolean;
}

export interface AnalyticsRecord extends Base {
  productionId: string; source: "imported" | "manual" | "demo"; views: number | null; reach: number | null;
  likes: number | null; comments: number | null; shares: number | null; saves: number | null;
  profileVisits: number | null; follows: number | null; watchTimeSec: number | null; completionRate: number | null;
}

// ---- Agent Operations Center ------------------------------------------------
export type AgentCode =
  | "ORCHESTRATOR" | "CONTENT_STRATEGIST" | "CREATIVE_DIRECTOR" | "PROMPT_ENGINEER" | "CAPTION_WRITER"
  | "IDENTITY_QA" | "CONTENT_QA" | "PRODUCTION_MANAGER" | "PERFORMANCE_AGENT" | "GROWTH_STRATEGIST";
export type AgentStatus = "WORKING" | "QUEUED" | "WAITING" | "SCHEDULED" | "IDLE" | "FAILED" | "PAUSED";
export type TaskStatus = "QUEUED" | "RUNNING" | "WAITING" | "COMPLETE" | "FAILED" | "CANCELLED";

/** Persistent agent identity + operator-editable config. Status is DERIVED from tasks/schedules, never stored. */
export interface Agent extends Base {
  code: AgentCode; name: string; role: string; paused: boolean; notes: string;
  /** Orchestrator-only operational flags (priority / paused creators). */
  config: { priorityTalent?: TalentCode[]; pausedTalent?: TalentCode[]; model?: { provider: "gemini" | "openai" | "mock" | "rules" | "auto"; model?: string; allowFallback?: boolean } };
}
export interface AgentTask extends Base {
  agentId: AgentCode; kind: string; title: string; input: Record<string, unknown>; output: Record<string, unknown> | null;
  status: TaskStatus; priority: number; // 1 = highest, 5 = lowest
  dependsOn: string[]; parentTaskId: string | null; assignmentId: string | null; productionId: string | null; talent: TalentCode | null;
  createdBy: string; // operator | orchestrator | schedule:<id> | event:<name> | n8n
  waitingOn: string | null; runAfter: string | null; startedAt: string | null; finishedAt: string | null; error: string | null;
}
export interface AgentRun extends Base {
  agentId: AgentCode; taskId: string | null; trigger: "queue" | "schedule" | "event" | "operator" | "n8n";
  state: WorkflowState; startedAt: string; finishedAt: string | null; error: string | null; summary: string;
  costUsd: number | null; tokens: number | null; // null = no model call was made / unknown
  /** Actual provider/model that did the work: "gemini"/"openai"/"mock", an image/video provider, or "rules" (deterministic, no model). */
  provider: string | null; model: string | null; usedFallback: boolean;
}
/** One model-provider attempt (success or failure), linked to an agent run. Usage/cost null = not reported / no reliable pricing. */
export interface LlmCall extends Base {
  runId: string | null; taskId: string | null; agentId: AgentCode; provider: string; model: string;
  status: "COMPLETE" | "FAILED" | "RATE_LIMITED" | "UNAVAILABLE" | "SKIPPED"; error: string | null;
  startedAt: string; finishedAt: string; latencyMs: number; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  costUsd: number | null; fallbackFrom: string | null;
}
/** Operational activity log: what happened (tool/task results), NOT model reasoning. */
export interface AgentEvent extends Base {
  agentId: AgentCode; taskId: string | null; runId: string | null; level: "info" | "warn" | "error";
  kind: string; message: string; data: Record<string, unknown>;
}
export interface AgentMessage extends Base {
  agentId: AgentCode; role: "operator" | "agent" | "system"; content: string; taskIds: string[]; reportIds: string[];
}
export interface AgentReport extends Base {
  agentId: AgentCode; kind: "STATUS" | "CREATORS" | "QA" | "ALERT" | "CONCEPTS" | "ASSIGNMENT" | "PERFORMANCE" | "DIGEST";
  title: string; body: string; data: Record<string, unknown>; sources: string[]; runId: string | null; read: boolean;
}
export interface AgentSchedule extends Base {
  agentId: AgentCode; name: string; cron: string; taskKind: string; taskInput: Record<string, unknown>;
  enabled: boolean; lastRunAt: string | null; nextRunAt: string | null; source: "northline" | "n8n";
}

export interface Tables {
  agents: Agent; agentTasks: AgentTask; agentRuns: AgentRun; agentEvents: AgentEvent; agentMessages: AgentMessage;
  agentReports: AgentReport; agentSchedules: AgentSchedule; llmCalls: LlmCall;
  campaigns: Campaign; productions: Production; assets: Asset; referenceAssets: ReferenceAsset; prompts: Prompt;
  captions: Caption; approvals: Approval; workflowRuns: WorkflowRun; providerJobs: ProviderJob;
  calendarEntries: CalendarEntry; storylines: Storyline; launchStates: LaunchState; analytics: AnalyticsRecord;
}
export type TableName = keyof Tables;
export const TABLE_NAMES: TableName[] = [
  "campaigns", "productions", "assets", "referenceAssets", "prompts", "captions", "approvals", "workflowRuns",
  "providerJobs", "calendarEntries", "storylines", "launchStates", "analytics",
  "agents", "agentTasks", "agentRuns", "agentEvents", "agentMessages", "agentReports", "agentSchedules", "llmCalls",
];
