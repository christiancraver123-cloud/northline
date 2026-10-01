// Durable job worker. Runs the BACKGROUND queue (same code path as /api/agents/tick), stage-gated by NORTHLINE_JOB_STAGE.
// Requires NORTHLINE_DURABLE_JOBS=on (migrations 0007+0008 applied). Never advances the stage by itself.
//
//   npx tsx scripts/worker.ts --once                 # one pass, then exit
//   npx tsx scripts/worker.ts --loop [--every 30]    # poll every N seconds (default 30)
//   npx tsx scripts/worker.ts --enqueue-test noop|echo|flaky|fail|blocked|slow   # enqueue a safe NON-PROVIDER test job, then exit
import { getRepo } from "../src/lib/db";
import { durableEnabled, jobStage } from "../src/lib/jobs/durable";
import { enqueue, ensureAgents, materializeDueSchedules } from "../src/lib/agents/ops/service";
import { processQueue } from "../src/lib/agents/ops/worker";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
async function pass() {
  const repo = await getRepo();
  await ensureAgents(repo);
  const due = await materializeDueSchedules(repo);
  const res = await processQueue(repo, { max: 25, trigger: "queue", background: true });
  console.log(`${new Date().toISOString()} stage=${jobStage()} scheduled=${due.length} ran=${res.ran.length} queued=${res.remainingQueued}${res.ran.map((r) => ` [${r.status} ${r.agent}]`).join("")}`);
}
async function main() {
  if (!durableEnabled()) { console.error("NORTHLINE_DURABLE_JOBS is not 'on' — refusing to run the durable worker."); process.exit(2); }
  const t = arg("--enqueue-test");
  if (t) {
    if (!["noop", "echo", "flaky", "fail", "blocked", "slow"].includes(t)) throw new Error("unknown test job");
    const task = await enqueue(await getRepo(), { agentId: "ORCHESTRATOR", kind: `system.${t}`, title: `system.${t} (test job, no provider calls)`, input: t === "flaky" ? { succeedOnAttempt: 2 } : {}, createdBy: "operator (test job)" });
    console.log(`enqueued ${task.kind} ${task.id}`); return;
  }
  if (process.argv.includes("--loop")) {
    const every = Math.max(5, parseInt(arg("--every") ?? "30", 10)) * 1000;
    for (;;) { try { await pass(); } catch (e) { console.error("pass failed:", e instanceof Error ? e.message : e); } await new Promise((r) => setTimeout(r, every)); }
  }
  await pass();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
