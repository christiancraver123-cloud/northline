// SIMULATED fixture — development only. Nothing here is real Northline state: names, ids, tasks and times are invented to exercise the world.
// This file may only be imported by the /world-dev route (a test enforces it), and every snapshot it makes carries simulated:true, source:"FIXTURE".
import type { WorldSnapshot } from "@/lib/world/schema";

export const SIM_AGENT_ID = "CREATIVE_DIRECTOR";
const CYCLE = { idleFirst: 50, work: 70, idleAfter: 40 } as const; // seconds: the agent alternates between ambient idling and a simulated task

export class SimulatedScenario {
  private forcedUntil = 0; private forcedStart = 0;
  constructor(private startMs: number) {}
  /** Dev button: start a simulated task right now (lasts 60 s). */
  forceTask(nowMs: number) { this.forcedStart = nowMs; this.forcedUntil = nowMs + 60_000; }
  endTask() { this.forcedUntil = 0; this.forcedStart = 0; }
  private phase(nowMs: number): { working: boolean; startedMs: number } {
    if (nowMs < this.forcedUntil) return { working: true, startedMs: this.forcedStart };
    const total = CYCLE.idleFirst + CYCLE.work + CYCLE.idleAfter, t = ((nowMs - this.startMs) / 1000) % total, base = nowMs - t * 1000;
    return t >= CYCLE.idleFirst && t < CYCLE.idleFirst + CYCLE.work ? { working: true, startedMs: base + CYCLE.idleFirst * 1000 } : { working: false, startedMs: 0 };
  }
  snapshot(nowMs: number, seq: number): WorldSnapshot {
    const { working, startedMs } = this.phase(nowMs), iso = (ms: number) => new Date(ms).toISOString();
    return {
      seq, serverTime: iso(nowMs), simulated: true, source: "FIXTURE",
      system: { status: "SIMULATED", paused: false, mode: "world-dev fixture" },
      agents: [{
        agentId: SIM_AGENT_ID, name: "Mara Quill", role: "Creative Director", opState: working ? "WORKING" : "IDLE",
        taskId: working ? "SIM-TASK-0001" : null, taskKind: working ? "director.concepts (simulated)" : null,
        taskTitle: working ? "Draft a beach-day concept board (SIMULATED task)" : null, productionId: working ? "SIM-PROD-0001" : null, creator: working ? "SIMULATED creator" : null,
        attempt: working ? 1 : null, maxAttempts: working ? 3 : null, startedAt: working ? iso(startedMs) : null, blockedReason: null, provider: null,
        location: working ? "CREATIVE_STUDIO" : "TOWN", nextAction: working ? "Hand the concept to the Prompt Engineer (simulated)" : "Wait for the next simulated task",
        lastActivityAt: iso(nowMs - 12_000),
        recentActivity: working
          ? [{ at: iso(startedMs), text: "Started simulated task SIM-TASK-0001" }, { at: iso(startedMs + 6_000), text: "Reviewing simulated brief for SIM-PROD-0001" }]
          : [{ at: iso(nowMs - 25_000), text: "Finished simulated task SIM-TASK-0000" }],
      }],
      budget: { imagesToday: "UNKNOWN", limitsRemaining: "NOT CONFIGURED" }, approvals: { waiting: "UNKNOWN" }, alerts: [],
    };
  }
}
