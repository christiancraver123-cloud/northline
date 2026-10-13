// Friendship graph between the six (ported from the original Command Center), with canonical portraits.
import { EDGES } from "@/lib/collab/network";
import { ROSTER } from "@/lib/talent/roster";
import type { Portraits } from "@/lib/talent/portrait";

const POS: Record<string, [number, number]> = { SIE: [90, 40], ZOE: [330, 40], VES: [90, 140], SKY: [330, 140], ALE: [90, 240], MIL: [330, 240] };
const LEFT = new Set(["SIE", "VES", "ALE"]);

export function NetworkGraph({ portraits, live, highlight = [] }: { portraits: Portraits; live: Record<string, boolean>; highlight?: string[] }) {
  return (
    <svg viewBox="0 0 420 285" className="w-full max-w-[520px]" role="img" aria-label="Friendship graph between the six creators">
      {EDGES.map((e) => {
        const [x1, y1] = POS[e.a], [x2, y2] = POS[e.b], on = highlight.includes(e.a) && highlight.includes(e.b);
        return <g key={e.a + e.b}><title>{`${e.a} ↔ ${e.b}: ${e.how}`}</title><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? "#46a97a" : "#2a3566"} strokeWidth={on ? 3 : 1.5} /></g>;
      })}
      {ROSTER.map((t) => {
        const [x, y] = POS[t.code], on = highlight.includes(t.code), url = portraits[t.code]?.url, left = LEFT.has(t.code);
        return (
          <g key={t.code} opacity={highlight.length && !on ? 0.45 : 1}>
            <defs><clipPath id={`clip-${t.code}`}><circle cx={x} cy={y} r={22} /></clipPath></defs>
            <circle cx={x} cy={y} r={24} fill={t.color} />
            {url && <image href={url} x={x - 22} y={y - 22} width={44} height={44} clipPath={`url(#clip-${t.code})`} preserveAspectRatio="xMidYMid slice" />}
            <text x={left ? x - 32 : x + 32} y={y + 4} textAnchor={left ? "end" : "start"} fontSize={12} fill="#e8ecff">{t.first}</text>
            <text x={left ? x - 32 : x + 32} y={y + 17} textAnchor={left ? "end" : "start"} fontSize={9} fill={live[t.code] ? "#46a97a" : "#6b76a8"} fontFamily="monospace">{live[t.code] ? "● live" : "○ setup"}</text>
          </g>
        );
      })}
    </svg>
  );
}
