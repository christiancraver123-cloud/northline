// Provider abstractions. Provider-specific logic lives ONLY in adapters under this folder.
import type { ReferenceType, TalentCode } from "@/lib/domain/types";

export type FailureCategory = "provider_unavailable" | "quota_exceeded" | "rate_limited" | "auth" | "invalid_request" | "content_policy" | "timeout" | "unknown";

export interface ImageReference { bytes: Uint8Array; mime: string; type: ReferenceType }
export interface ImageRequest { productionCode: string; shotN: number; prompt: string; negative: string; talent: TalentCode; references: ImageReference[]; size?: string }
export interface ImageResult { provider: string; model: string | null; bytes: Uint8Array | null; mime: string; costUsd: number | null; credits: number | null; externalId: string | null; metadata?: Record<string, unknown> }
export interface ImageProvider { readonly name: string; readonly model?: string | null; generate(req: ImageRequest): Promise<ImageResult> }

export interface VideoRequest { productionCode: string; prompt: string; sourceStillPath: string | null; durationSec: number }
export interface VideoResult { provider: string; externalId: string; state: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED"; url: string | null; credits: number | null }
export interface VideoProvider { readonly name: string; submit(req: VideoRequest): Promise<VideoResult>; poll(externalId: string): Promise<VideoResult> }

export interface StorageProvider { save(path: string, bytes: Uint8Array, mime: string): Promise<string>; read(path: string): Promise<{ bytes: Uint8Array; mime: string } | null> }

/** Publishing is intentionally NOT implemented: Northline is draft-first. See lib/publishing/gate.ts. */
export class ProviderError extends Error {
  constructor(public provider: string, message: string, public retryable = true, public category: FailureCategory = "unknown") { super(`[${provider}] ${message}`); }
}
