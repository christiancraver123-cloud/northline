import type { AgentCode } from "@/lib/db/records";
import type { Origin } from "@/lib/domain/types";
import { getImageProvider, getVideoProvider } from "@/lib/providers";
import { getStorage } from "@/lib/providers/storage";
import type { ImageProvider, StorageProvider, VideoProvider } from "@/lib/providers/types";
import type { VisionInspector } from "./qa";

export type Trace = (agent: AgentCode, kind: string, message: string, opts?: { level?: "info" | "warn" | "error"; data?: Record<string, unknown> }) => Promise<void> | void;
export interface Deps {
  image: ImageProvider; video: VideoProvider; storage: StorageProvider; origin: Origin; now?: () => Date;
  /** Operational activity sink (agent activity log). */
  trace?: Trace;
  /** Optional vision-capable inspector. When absent, image QA is reported as MANUAL_REVIEW_REQUIRED — never a fabricated PASS. */
  vision?: VisionInspector;
}
export const defaultDeps = (): Deps => ({ image: getImageProvider(), video: getVideoProvider(), storage: getStorage(), origin: "live" });
export const traceOf = (deps: Deps): Trace => async (a, k, m, o) => { try { await deps.trace?.(a, k, m, o); } catch { /* tracing must never break production */ } };
