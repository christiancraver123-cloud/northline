// Minimal 5-field cron (minute hour dom month dow), UTC. Supports *, N, N-M, lists, and */n.
function field(expr: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of expr.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) return null;
    const step = m[2] ? parseInt(m[2], 10) : 1;
    let lo = min, hi = max;
    if (m[1] !== "*") { const [a, b] = m[1].split("-").map(Number); lo = a; hi = b ?? (m[2] ? max : a); }
    if (lo < min || hi > max || lo > hi || step < 1) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(cron: string) {
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return null;
  const f = [field(p[0], 0, 59), field(p[1], 0, 23), field(p[2], 1, 31), field(p[3], 1, 12), field(p[4], 0, 7)];
  if (f.some((x) => !x)) return null;
  if (f[4]!.has(7)) f[4]!.add(0);
  return f as Set<number>[];
}
export const validCron = (c: string) => parseCron(c) !== null;

/** Next fire time strictly after `from` (UTC), or null if invalid / none within ~1 year. */
export function nextRun(cron: string, from: Date): Date | null {
  const f = parseCron(cron);
  if (!f) return null;
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0); d.setUTCMinutes(d.getUTCMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (f[0].has(d.getUTCMinutes()) && f[1].has(d.getUTCHours()) && f[2].has(d.getUTCDate()) && f[3].has(d.getUTCMonth() + 1) && f[4].has(d.getUTCDay())) return d;
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}
