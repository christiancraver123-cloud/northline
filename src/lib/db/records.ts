// Persistent record shapes (camelCase in TS; snake_case in Postgres — see supabase/migrations).
import type {
  ApprovalState, AssetKind, AssetStatus, CollabScope, ContentType, JobState, Origin, Platform, ProductionStatus,
  QaSeverity, QaStatus, ReferenceAuthority, ReferenceType, TalentCode, WorkflowState,
} from "@/lib/domain/types";
import type { CanonicalIdentity } from "@/lib/identity/canonical";

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
  /** Optional operator-supplied shared continuity facts for multi-frame productions (anything omitted is derived). */
  continuity?: Partial<Pick<ContinuitySpec, "bag" | "props" | "timeWindow" | "cameraStyle" | "locationProgression">>;
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
  /** Canonical identity version used (e.g. "SIE-IDENTITY-v1.0"). Facts live in canonical_identities, not here. */
  identityVersion: string | null;
  currentAttemptId: string | null;
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
  isReference: false; // generated assets NEVER carry canonical authority
  publication: "UNPUBLISHED" | "PUBLISHED";
  // --- lineage: exactly how was this image created? ---
  attemptId: string | null; attemptNo: number; briefId: string | null; generationJobId: string | null;
  identityVersion: string | null; referenceIds: string[]; model: string | null;
  qaStatus: QaStatus; current: boolean; // current = part of the production's live set (latest attempt per shot)
  width: number | null; height: number | null; bytes: number | null; sha256: string | null;
}

/** Canonical identity references — a separate authority from generated assets. Only explicit operator actions create them. */
export interface ReferenceAsset extends Base {
  talent: TalentCode; referenceType: ReferenceType; authority: ReferenceAuthority; status: "ACTIVE" | "ARCHIVED";
  storagePath: string; filename: string; mime: string; bytes: number; sha256: string; notes: string;
  identityVersion: string; createdBy: string;
  source: "upload" | "promoted_from_generated"; sourceAssetId: string | null; replacedById: string | null;
}

/** Immutable versioned snapshot of a creator's canonical identity (id e.g. SIE-IDENTITY-v1.0). */
export interface CanonicalIdentityRecord extends Base {
  code: TalentCode; version: string; identityId: string; contentHash: string; status: "ACTIVE" | "SUPERSEDED"; data: CanonicalIdentity;
}

/** Shared continuity state for a multi-frame production. Persisted in the Generation Brief and inherited by EVERY frame prompt. */
export interface ContinuitySpec {
  outfit: string; hair: string; jewelry: string; bag: string; props: string[];
  /** One continuous window, e.g. "one Miami morning, ~8:30-10:30 AM" — frames must not drift across it. */
  timeWindow: string; lighting: string;
  /** Where the creator is in each frame, in order (index = frame number - 1). */
  locationProgression: string[]; cameraStyle: string;
}

export interface GenerationBriefData {
  production: { code: string; format: string; platform: string };
  creator: { code: TalentCode; name: string };
  identityVersion: string; identityBlock: string; hardLocks: { id: string; label: string }[]; negativeConstraints: string[];
  references: { id: string; type: ReferenceType; authority: ReferenceAuthority; hasImage: boolean }[];
  referencePolicy: string;
  concept: string; location: string; timeOfDay: string;
  visualDirection: { outfit: string; lighting: string; palette: string[]; mood: string };
  continuity: string[]; recentConsiderations: string[];
  providerRequirements: { provider: string; model: string | null; size: string; aspect: string; count: number };
  shots: { n: number; kind: string; description: string; camera?: string }[];
  /** Present for multi-frame productions (>= 2 frames). */
  continuitySpec?: ContinuitySpec;
  revision: { fromAttemptId: string; feedback: string[] } | null;
}
export interface GenerationBrief extends Base {
  productionId: string; version: number; identityVersion: string; referenceIds: string[]; data: GenerationBriefData;
}
export interface GenerationAttempt extends Base {
  productionId: string; attemptNo: number; briefId: string; trigger: "initial" | "regenerate" | "retry";
  status: "GENERATING" | "QA_PENDING" | "PASS" | "REVIEW" | "HARD_FAIL" | "MANUAL_REVIEW_REQUIRED" | "ERROR";
  shots: number[]; parentAttemptId: string | null; reason: string; feedback: string[]; finishedAt: string | null;
}
export interface QaFindingRecord { lockId: string | null; severity: Exclude<QaSeverity, "PASS">; message: string }
/** One QA evaluation. `inspectedImage` is true ONLY if something actually looked at image content (vision model / human). */
export interface QaResult extends Base {
  productionId: string; attemptId: string | null; assetId: string | null; kind: "IDENTITY" | "TECHNICAL" | "CONTENT" | "CONTINUITY";
  method: "prompt_rules" | "file_inspection" | "vision_model" | "data_rules" | "manual";
  status: QaStatus; inspectedImage: boolean; provider: string | null; model: string | null;
  findings: QaFindingRecord[]; summary: string; recommendation: string | null; decidedBy: string | null;
  /** nth evaluation for the same asset + QA type + layer (1 = first). Older evaluations are kept for audit. */
  qaAttempt: number;
  /** When set, this result no longer counts toward the aggregate: the referenced newer result replaces it. History is never deleted. */
  supersededById: string | null;
  /** What the retry logic did for this evaluation (null = no model call was needed or none was retried). */
  retry: QaRetryInfo | null;
}
export interface QaRetryInfo { attempts: number; maxAttempts: number; transient: boolean; errors: string[]; exhausted: boolean; note: string | null }

/** A derived delivery file (e.g. 4:5 crop). The RAW source asset is never modified. */
export interface AssetDerivative extends Base {
  productionId: string; sourceAssetId: string; kind: "DELIVERY_4X5"; storagePath: string; filename: string; mime: string;
  width: number | null; height: number | null; bytes: number | null; sha256: string | null; sourceSha256: string | null;
  derivation: Record<string, unknown>; createdBy: string | null;
}

export interface Prompt extends Base {
  productionId: string; provider: string; version: number; shotN: number;
  positive: string; negative: string; identityRefs: string[]; qa: { ok: boolean; issues: string[] };
  briefId: string | null; attemptId: string | null;
}

export interface Caption extends Base {
  productionId: string; talent: TalentCode; text: string; kind: "FEED" | "STORY"; approval: ApprovalState;
}

export interface Approval extends Base {
  productionId: string; subject: "PRODUCTION" | "ASSET" | "CAPTION" | "CAMPAIGN" | "PUBLISH";
  subjectId: string; state: ApprovalState; decidedBy: string | null; decidedAt: string | null; notes: string;
  selectedAssetIds: string[]; // assets the operator approved; only these become eligible for Calendar/Launch
}

export interface WorkflowRun extends Base {
  workflow: string; state: WorkflowState; productionId: string | null; provider: string | null;
  startedAt: string | null; finishedAt: string | null; error: string | null; retryCount: number;
  costUsd: number; outputAssetIds: string[]; input: unknown;
}

export interface ProviderJob extends Base {
  runId: string | null; productionId: string; provider: string; model: string | null; operation: string;
  state: JobState; externalId: string | null; error: string | null; assetId: string | null; shotN: number;
  costUsd: number | null; credits: number | null;
  briefId: string | null; attemptId: string | null; promptId: string | null;
  retryCount: number; retryOfJobId: string | null; startedAt: string | null; finishedAt: string | null;
  failureCategory: string | null; metadata: Record<string, unknown>;
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
  /** Atomic claim + lease: only the worker that wins the QUEUED→RUNNING transition runs the task. */
  claimedBy: string | null; leaseExpiresAt: string | null; attempts: number;
  /** Optional dedupe key: enqueue with an existing key returns the existing task (idempotent retries from n8n). */
  idempotencyKey: string | null;
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
  canonicalIdentities: CanonicalIdentityRecord; generationBriefs: GenerationBrief; generationAttempts: GenerationAttempt; qaResults: QaResult; assetDerivatives: AssetDerivative;
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
  "canonicalIdentities", "generationBriefs", "generationAttempts", "qaResults", "assetDerivatives",
];
