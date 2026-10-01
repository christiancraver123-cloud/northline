// World state schema + the WorldStateAdapter's view-model. The 3D client renders a DERIVED snapshot; it never owns business logic.
// POC: only SIMULATED snapshots exist (source "FIXTURE"). Phase 2 swaps the source for the real, auth-gated /api/world/state with the SAME shape.
import { z } from "zod";

export const OP_STATES = ["WORKING", "WAITING", "BLOCKED", "FAILED", "IDLE", "PAUSED"] as const;
export const AgentEntitySchema = z.object({
  agentId: z.string().min(1), name: z.string().min(1), role: z.string().min(1), opState: z.enum(OP_STATES),
  taskId: z.string().nullable(), taskKind: z.string().nullable(), taskTitle: z.string().nullable(), productionId: z.string().nullable(), creator: z.string().nullable(),
  attempt: z.number().int().nullable(), maxAttempts: z.number().int().nullable(), startedAt: z.string().nullable(), blockedReason: z.string().nullable(), provider: z.string().nullable(),
  location: z.string(), nextAction: z.string().nullable(), lastActivityAt: z.string().nullable(), recentActivity: z.array(z.object({ at: z.string(), text: z.string() })).max(8),
});
export const WorldSnapshotSchema = z.object({
  seq: z.number().int().nonnegative(), serverTime: z.string(),
  /** Hard provenance flags: a SIMULATED snapshot must say so, and the dev route refuses anything else. */
  simulated: z.boolean(), source: z.enum(["FIXTURE", "REAL"]),
  system: z.object({ status: z.string(), paused: z.union([z.boolean(), z.literal("UNKNOWN")]), mode: z.string() }),
  agents: z.array(AgentEntitySchema).max(32),
  budget: z.object({ imagesToday: z.union([z.number(), z.literal("UNKNOWN")]), limitsRemaining: z.union([z.number(), z.literal("UNKNOWN"), z.literal("NOT CONFIGURED")]) }),
  approvals: z.object({ waiting: z.union([z.number(), z.literal("UNKNOWN")]) }),
  alerts: z.array(z.object({ kind: z.string(), text: z.string() })).max(32),
});
export type AgentEntityState = z.infer<typeof AgentEntitySchema>;
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;

export class SnapshotRejected extends Error {}
/** Parse + enforce the dev-route provenance rule. Throws SnapshotRejected (never returns a half-trusted snapshot). */
export function parseSimulatedSnapshot(raw: unknown): WorldSnapshot {
  const r = WorldSnapshotSchema.safeParse(raw);
  if (!r.success) throw new SnapshotRejected(`invalid world snapshot: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  if (!r.data.simulated || r.data.source !== "FIXTURE") throw new SnapshotRejected("the /world-dev POC only accepts SIMULATED fixture snapshots; real state is not connected in this phase");
  return r.data;
}

// ---- role identity (colour + glyph + prop + silhouette cue; never colour alone) ----------------------------------------------
export interface RoleStyle { color: string; accent: string; glyph: string; glyphName: string; prop: "tablet" | "clipboard" | "headset" | "loupe" | "folder" | "tablet-grid" | "none"; hat: "beret" | "cap" | "none" | "visor"; short: string }
export const ROLE_STYLES: Record<string, RoleStyle> = {
  CREATIVE_DIRECTOR: { color: "#8b5cf6", accent: "#f0abfc", glyph: "◆", glyphName: "diamond", prop: "tablet", hat: "beret", short: "Creative Director" },
  PROMPT_ENGINEER: { color: "#06b6d4", accent: "#a5f3fc", glyph: "▲", glyphName: "triangle", prop: "tablet-grid", hat: "cap", short: "Prompt Engineer" },
  IDENTITY_QA: { color: "#f59e0b", accent: "#fde68a", glyph: "●", glyphName: "circle", prop: "loupe", hat: "none", short: "Identity QA" },
  PRODUCTION_MANAGER: { color: "#10b981", accent: "#a7f3d0", glyph: "■", glyphName: "square", prop: "clipboard", hat: "visor", short: "Production Manager" },
  ORCHESTRATOR: { color: "#3b82f6", accent: "#bfdbfe", glyph: "★", glyphName: "star", prop: "headset", hat: "none", short: "Orchestrator" },
};
export const roleStyle = (agentId: string): RoleStyle => ROLE_STYLES[agentId] ?? { color: "#94a3b8", accent: "#e2e8f0", glyph: "✚", glyphName: "cross", prop: "none", hat: "none", short: agentId };

// ---- view-model for the panel / HUD (derived only) --------------------------------------------------------------------------
export const humanElapsed = (fromIso: string | null, nowIso: string) => {
  if (!fromIso) return "—";
  const s = Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(fromIso)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
export interface AgentPanelModel { title: string; roleLine: string; statusLabel: "WORKING" | "WAITING" | "BLOCKED" | "FAILED" | "PAUSED" | "IDLE"; ambientNote: string | null; rows: [string, string][]; recent: { at: string; text: string }[]; simulated: boolean; banner: string }
/** `ambient` is the cosmetic idle activity from the world layer. It is only ever surfaced when opState is IDLE, and always labelled cosmetic. */
export function buildAgentPanel(snap: WorldSnapshot, agentId: string, ambient: string | null): AgentPanelModel | null {
  const a = snap.agents.find((x) => x.agentId === agentId); if (!a) return null;
  const idle = a.opState === "IDLE";
  return {
    title: a.name, roleLine: roleStyle(a.agentId).short, statusLabel: a.opState,
    ambientNote: idle && ambient ? `Ambient (cosmetic — no work in progress): ${ambient}` : null,
    rows: [
      ["Status", idle ? "IDLE — no task" : a.opState + (a.blockedReason ? ` — ${a.blockedReason}` : "")],
      ["Current task", a.taskTitle ?? "—"], ["Production", a.productionId ?? "—"], ["Creator", a.creator ?? "—"],
      ["Elapsed", a.opState === "WORKING" ? humanElapsed(a.startedAt, snap.serverTime) : "—"],
      ["Attempt", a.attempt != null ? `${a.attempt}${a.maxAttempts ? ` / ${a.maxAttempts}` : ""}` : "—"], ["Provider", a.provider ?? "none (no model call)"], ["Next action", a.nextAction ?? "—"],
    ],
    recent: a.recentActivity, simulated: snap.simulated,
    banner: snap.simulated ? "SIMULATED DATA — not real Northline state. No task, production, creator or model call shown here is real." : "",
  };
}
