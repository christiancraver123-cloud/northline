// Feature flags for the Command Center milestone. PURE: reads only the env object it is given. Names only, never secret values.
//  NORTHLINE_IMAGE_GENERATION   on        → paid image providers (openai) may be called. Mock generation never needs it.
//  NORTHLINE_PUBLISHING         off|mock|live → publishing workflow. Default: mock in development, off in production.
//  NORTHLINE_INSTAGRAM_LIVE     on        → reserved for a future Meta adapter. No live adapter exists in this build.
//  NORTHLINE_AUTONOMOUS_GENERATION (existing, lib/governor/service.ts) stays the gate for unattended generation.
import { autonomousGenerationEnabled, governorEnabled } from "@/lib/governor/service";
import { isReadOnly } from "@/lib/runtime/mode";

import { imageGenerationEnabled, instagramLiveRequested, publishingMode, type PublishingMode } from "./flags-core";
export { imageGenerationEnabled, instagramLiveRequested, publishingMode, type PublishingMode };

type Env = Record<string, string | undefined>;

/** Live Instagram is BLOCKED in this build: the creator account is suspended (Meta requests phone verification) and no Meta adapter exists. */
export interface IntegrationStatus { state: "BLOCKED" | "DISCONNECTED" | "NOT CONFIGURED" | "CONNECTED"; label: string; detail: string }
export function instagramStatus(env: Env = process.env): IntegrationStatus {
  if (instagramLiveRequested(env)) return { state: "BLOCKED", label: "INSTAGRAM — BLOCKED", detail: "NORTHLINE_INSTAGRAM_LIVE is on, but no live Meta adapter is built yet. Nothing is sent to Meta." };
  return { state: "BLOCKED", label: "INSTAGRAM — BLOCKED / DISCONNECTED", detail: "Creator account suspended; Meta is requesting phone verification. No live Meta calls are made. Publishing and insights run on the mock provider." };
}

export interface FlagView { key: string; label: string; value: string; tone: "ok" | "warn" | "bad" | "mute"; note: string }
export function flagViews(env: Env = process.env): FlagView[] {
  const pub = publishingMode(env);
  return [
    { key: "NORTHLINE_READONLY", label: "Read-only", value: isReadOnly(env) ? "ON" : "OFF", tone: isReadOnly(env) ? "warn" : "mute", note: "Blocks every write when on." },
    { key: "NORTHLINE_GOVERNOR", label: "Budget governor", value: governorEnabled(env) ? "ON" : "OFF", tone: governorEnabled(env) ? "ok" : "warn", note: "Daily image limits + audit (migration 0007)." },
    { key: "NORTHLINE_IMAGE_GENERATION", label: "Paid image generation", value: imageGenerationEnabled(env) ? "ON" : "OFF", tone: imageGenerationEnabled(env) ? "warn" : "mute", note: "Off = only the mock provider can generate." },
    { key: "NORTHLINE_AUTONOMOUS_GENERATION", label: "Autonomous generation", value: autonomousGenerationEnabled(env) ? "ON" : "OFF", tone: autonomousGenerationEnabled(env) ? "bad" : "mute", note: "Unattended generation. Keep off." },
    { key: "NORTHLINE_PUBLISHING", label: "Publishing", value: pub.toUpperCase(), tone: pub === "live" ? "bad" : pub === "mock" ? "ok" : "mute", note: pub === "live" ? "Live publishing requested — no live adapter exists, every publish is refused." : pub === "mock" ? "Mock Instagram only. Founder click required." : "Publishing disabled." },
    { key: "NORTHLINE_INSTAGRAM_LIVE", label: "Instagram live", value: instagramLiveRequested(env) ? "REQUESTED" : "OFF", tone: "mute", note: "Reserved for a future Meta adapter." },
  ];
}
