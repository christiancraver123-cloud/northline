// Provider abstractions. Provider-specific logic lives ONLY in adapters under this folder.
import type { TalentCode } from "@/lib/domain/types";

export interface ImageRequest { productionCode: string; shotN: number; prompt: string; negative: string; talent: TalentCode; referencePaths: string[] }
export interface ImageResult { provider: string; model: string | null; bytes: Uint8Array | null; mime: string; costUsd: number | null; credits: number | null; externalId: string | null }
export interface ImageProvider { readonly name: string; generate(req: ImageRequest): Promise<ImageResult> }

export interface VideoRequest { productionCode: string; prompt: string; sourceStillPath: string | null; durationSec: number }
export interface VideoResult { provider: string; externalId: string; state: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED"; url: string | null; credits: number | null }
export interface VideoProvider { readonly name: string; submit(req: VideoRequest): Promise<VideoResult>; poll(externalId: string): Promise<VideoResult> }

export interface StorageProvider { save(path: string, bytes: Uint8Array, mime: string): Promise<string>; read(path: string): Promise<{ bytes: Uint8Array; mime: string } | null> }

/** Publishing is intentionally NOT implemented: Northline is draft-first. See lib/publishing/gate.ts. */
export class ProviderError extends Error {
  constructor(public provider: string, message: string, public retryable = true) { super(`[${provider}] ${message}`); }
}
