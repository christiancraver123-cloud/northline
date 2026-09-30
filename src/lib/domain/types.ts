// Core domain types. Enumerations are the single source for both TS and the SQL enums (see supabase/migrations).

export const TALENT_CODES = ["SIE", "ALE", "MIL", "VES", "ZOE", "SKY"] as const;
export type TalentCode = (typeof TALENT_CODES)[number];

export const CONTENT_TYPES = ["POST", "CAROUSEL", "REEL", "STORY", "CAMPAIGN", "COLLAB"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const PRODUCTION_STATUSES = [
  "IDEA", "GENERATING", "RAW", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "REJECTED", "ARCHIVED",
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const COLLAB_SCOPES = ["SOLO", "DUO", "GROUP", "ALL_SIX"] as const;
export type CollabScope = (typeof COLLAB_SCOPES)[number];

export const PLATFORMS = ["instagram", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const ASSET_KINDS = ["IMG", "REEL", "STORY"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ["PENDING", "RAW", "APPROVED", "REJECTED", "FAILED"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const APPROVAL_STATES = ["PENDING", "APPROVED", "REJECTED", "REVISION_REQUESTED"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const WORKFLOW_STATES = ["QUEUED", "RUNNING", "WAITING", "FAILED", "RETRYING", "COMPLETE"] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const REFERENCE_TYPES = [
  "MASTER_FACE", "FACE_FRONT", "FACE_3Q_LEFT", "FACE_3Q_RIGHT", "FACE_PROFILE", "UPPER_BODY", "FULL_BODY", "NATURAL_CANDID",
] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];
/** MASTER_FACE is the single highest-authority reference; other canonical types are supporting; generated content has zero canonical authority. */
export type ReferenceAuthority = "MASTER" | "SUPPORTING";
export const authorityFor = (t: ReferenceType): ReferenceAuthority => (t === "MASTER_FACE" ? "MASTER" : "SUPPORTING");
export const AUTHORITY_RANK: Record<ReferenceAuthority, number> = { MASTER: 100, SUPPORTING: 80 };
export const GENERATED_AUTHORITY_RANK = 0;

/** Generation/provider job lifecycle. */
export const JOB_STATES = ["QUEUED", "SUBMITTED", "PROCESSING", "SUCCEEDED", "FAILED", "RETRYING"] as const;
export type JobState = (typeof JOB_STATES)[number];

/** QA outcome for an asset/attempt. QA_PENDING = not yet checked; MANUAL_REVIEW_REQUIRED = no capable inspector ran, a human must look. */
export const QA_STATUSES = ["QA_PENDING", "PASS", "REVIEW", "HARD_FAIL", "MANUAL_REVIEW_REQUIRED"] as const;
export type QaStatus = (typeof QA_STATUSES)[number];
export type QaSeverity = "PASS" | "REVIEW" | "HARD_FAIL";

/** Whether a record is demo/seed data or real operational data. Never mix silently. */
export type Origin = "demo" | "live";

export type LaunchStatus = "active" | "setup";
