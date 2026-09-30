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

export const REFERENCE_SLOTS = [
  "MASTER_FACE", "FRONT", "THREE_QUARTER", "PROFILE", "UPPER_BODY", "FULL_BODY", "NATURAL", "CHARACTER_SHEET",
] as const;
export type ReferenceSlot = (typeof REFERENCE_SLOTS)[number];

/** Whether a record is demo/seed data or real operational data. Never mix silently. */
export type Origin = "demo" | "live";

export type LaunchStatus = "active" | "setup";
