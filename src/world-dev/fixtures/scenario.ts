// SIMULATED fixture — development only. Nothing here is real Northline state: names, ids, tasks and times are invented to exercise the world.
// The CAST is the real agent registry (via the roster); only the statuses/tasks below are simulated. Importable only by the /world-dev route (a test enforces it);
// every snapshot carries simulated:true, source:"FIXTURE".
import { WORLD_ROSTER } from "@/lib/world/roster";
import type { WorldSnapshot } from "@/lib/world/schema";

const CYCLE = 150; // seconds; each agent runs the same cycle shifted by an offset so the town is never in lock-step
interface Beat { kind: string; title: string; next: string; event: string }
/** What each (registered) agent's simulated task looks like. Task kinds are the registry's own handled kinds where one exists. */
const BEATS: Record<string, Beat> = {
  ORCHESTRATOR: { kind: "orchestrator.consolidate", title: "Consolidate the SIMULATED beach-day assignment", next: "Hand the summary to the operator (simulated)", event: "Collected results from 3 simulated tasks" },
  CONTENT_STRATEGIST: { kind: "strategist.concepts", title: "Propose 3 SIMULATED content concepts", next: "Send concepts to the Creative Director (simulated)", event: "Compared concepts against simulated history" },
  CREATIVE_DIRECTOR: { kind: "director.concepts", title: "Draft a SIMULATED beach-day concept board", next: "Hand the concept to the Prompt Engineer (simulated)", event: "Reviewing a simulated brief for SIM-PROD-0001" },
  PROMPT_ENGINEER: { kind: "prompt.build (no registered handler; simulated)", title: "Assemble SIMULATED provider-ready prompts", next: "Pass prompts to Identity QA (simulated)", event: "Applied simulated negatives to 4 prompts" },
  CAPTION_WRITER: { kind: "caption.draft (no registered handler; simulated)", title: "Draft SIMULATED creator-voice captions", next: "Send captions to Content QA (simulated)", event: "Drafted 2 simulated captions" },
  IDENTITY_QA: { kind: "identity_qa.review", title: "Review SIMULATED attempt for identity markers", next: "Report findings to the Production Manager (simulated)", event: "Checked 5 simulated hard locks" },
  CONTENT_QA: { kind: "content_qa.audit", title: "Audit SIMULATED recent productions for repeats", next: "Publish the audit report (simulated)", event: "Compared 12 simulated productions" },
  PRODUCTION_MANAGER: { kind: "production.digest", title: "Compile the SIMULATED production digest", next: "Wait for the simulated approval", event: "Tracked 3 simulated productions" },
  PERFORMANCE_AGENT: { kind: "performance.report", title: "Interpret SIMULATED analytics (none real exists)", next: "Report to the Growth Strategist (simulated)", event: "Read 0 real analytics records" },
  GROWTH_STRATEGIST: { kind: "growth.recommendations", title: "Draft SIMULATED growth experiments", next: "Share recommendations with the Orchestrator (simulated)", event: "Ranked 3 simulated experiments" },
};
const WORK_LEN = 70;
export class SimulatedScenario {
  private forced = new Map<string, { from: number; until: number }>();
  constructor(private startMs: number) {}
  /** Dev control: give one agent a simulated task for 60 s starting now. */
  forceTask(code: string, nowMs: number) { this.forced.set(code, { from: nowMs, until: nowMs + 60_000 }); }
  endTask(code: string) { this.forced.delete(code); }
  private phase(code: string, i: number, nowMs: number): { state: "WORKING" | "IDLE" | "WAITING" | "BLOCKED"; startedMs: number } {
    const f = this.forced.get(code); if (f && nowMs < f.until) return { state: "WORKING", startedMs: f.from };
    const t = (((nowMs - this.startMs) / 1000 + i * 17) % CYCLE + CYCLE) % CYCLE, base = nowMs - t * 1000, start = 25 + (i % 5) * 9;
    if (code === "IDENTITY_QA" && t >= start + 20 && t < start + 62) return { state: "BLOCKED", startedMs: base + (start + 20) * 1000 };
    if (code === "PRODUCTION_MANAGER" && t >= start + WORK_LEN - 10 && t < start + WORK_LEN + 25) return { state: "WAITING", startedMs: base + (start + WORK_LEN - 10) * 1000 };
    return t >= start && t < start + WORK_LEN ? { state: "WORKING", startedMs: base + start * 1000 } : { state: "IDLE", startedMs: 0 };
  }
  snapshot(nowMs: number, seq: number): WorldSnapshot {
    const iso = (ms: number) => new Date(ms).toISOString();
    return {
      seq, serverTime: iso(nowMs), simulated: true, source: "FIXTURE", system: { status: "SIMULATED", paused: false, mode: "world-dev fixture" },
      agents: WORLD_ROSTER.map((r, i) => {
        const { state, startedMs } = this.phase(r.code, i, nowMs), b = BEATS[r.code], active = state !== "IDLE";
        return {
          agentId: r.code, name: r.persona, persona: r.persona, role: r.registryName, opState: state, taskId: active ? `SIM-TASK-${String(i + 1).padStart(4, "0")}` : null, taskKind: active ? b.kind : null, taskTitle: active ? b.title : null,
          productionId: active ? "SIM-PROD-0001" : null, creator: active ? "SIMULATED creator" : null, attempt: active ? 1 : null, maxAttempts: active ? 3 : null, startedAt: active ? iso(startedMs) : null,
          blockedReason: state === "BLOCKED" ? "provider quota exhausted (SIMULATED)" : null, provider: null, location: active ? r.workspace : "TOWN",
          nextAction: state === "BLOCKED" ? "Wait for a human to unblock (simulated)" : active ? b.next : "Wait for the next simulated task", lastActivityAt: iso(nowMs - 9_000 - i * 1_000),
          recentActivity: active ? [{ at: iso(startedMs), text: `Started simulated task SIM-TASK-${String(i + 1).padStart(4, "0")}` }, { at: iso(startedMs + 6_000), text: b.event }] : [{ at: iso(nowMs - 25_000), text: `Finished simulated task SIM-TASK-${String(i).padStart(4, "0")}` }],
          workspace: r.workplaceLabel, lastEvent: active ? b.event : "Finished the previous simulated task", dataSource: "SIMULATED FIXTURE — not real Northline state",
        };
      }),
      budget: { imagesToday: 4, limitsRemaining: 6 }, approvals: { waiting: 2 }, alerts: [],
    };
  }
}
