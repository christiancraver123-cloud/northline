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

export interface Tables {
  campaigns: Campaign; productions: Production; assets: Asset; referenceAssets: ReferenceAsset; prompts: Prompt;
  captions: Caption; approvals: Approval; workflowRuns: WorkflowRun; providerJobs: ProviderJob;
  calendarEntries: CalendarEntry; storylines: Storyline; launchStates: LaunchState; analytics: AnalyticsRecord;
}
export type TableName = keyof Tables;
export const TABLE_NAMES: TableName[] = [
  "campaigns", "productions", "assets", "referenceAssets", "prompts", "captions", "approvals", "workflowRuns",
  "providerJobs", "calendarEntries", "storylines", "launchStates", "analytics",
];
