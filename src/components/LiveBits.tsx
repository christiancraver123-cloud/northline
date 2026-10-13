"use client";
// Ported from the original Command Center: broadcast clock + single-series area chart (crosshair, table fallback).

import { useEffect, useState } from "react";

/** Blinking LIVE badge + running NY clock, like a broadcast board. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-wider text-ink">
      <span className="h-2 w-2 animate-pulse rounded-full bg-bad" aria-hidden />
      LIVE {now ? now.toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" }) : "--:--:--"} ET
    </span>
  );
}

const SERIES = "#46a97a"; // validated vs the dark surface (lightness band + contrast)

/** Single-series area chart with a crosshair tooltip and a table fallback. */
export function AreaChart({ points, label }: { points: Array<{ day: string; value: number }>; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 640;
  const H = 180;
  const P = { l: 36, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z`;
  const total = points.reduce((s, p) => s + p.value, 0);
  const fmtDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const h = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[12px] font-bold uppercase tracking-wider text-muted">{label}</p>
        <button className="font-mono text-[10px] text-muted underline" onClick={() => setTable((v) => !v)}>
          {table ? "chart" : "table"}
        </button>
      </div>
      {total === 0 ? (
        <p className="py-10 text-center text-[12.5px] text-muted">No views recorded yet. Real Instagram numbers show up here once insights are connected.</p>
      ) : table ? (
        <table className="w-full text-left font-mono text-[11px]">
          <tbody>
            {points.map((p) => (
              <tr key={p.day} className="border-b border-edge">
                <td className="py-1 text-muted">{fmtDay(p.day)}</td>
                <td className="text-ink">{p.value.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label}: ${total.toLocaleString()} total`} onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={P.l} x2={W - P.r} y1={y(max * f)} y2={y(max * f)} stroke="#26305e" strokeWidth={1} />
                <text x={P.l - 6} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill="#6b76a8" fontFamily="monospace">
                  {Math.round(max * f).toLocaleString()}
                </text>
              </g>
            ))}
            <path d={area} fill={SERIES} fillOpacity={0.18} />
            <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" />
            {points.map((p, i) => (
              <rect key={p.day} x={x(i) - (W - P.l - P.r) / points.length / 2} y={P.t} width={(W - P.l - P.r) / points.length} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
            {hover !== null ? (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="#8b95c9" strokeWidth={1} strokeDasharray="2 3" />
                <circle cx={x(hover)} cy={y(points[hover]!.value)} r={4} fill={SERIES} stroke="#0b1128" strokeWidth={2} />
              </>
            ) : null}
            <text x={P.l} y={H - 6} fontSize={9} fill="#6b76a8" fontFamily="monospace">{fmtDay(points[0]!.day)}</text>
            <text x={W - P.r} y={H - 6} textAnchor="end" fontSize={9} fill="#6b76a8" fontFamily="monospace">{fmtDay(points[points.length - 1]!.day)}</text>
          </svg>
          {h ? (
            <div className="pointer-events-none absolute top-0 border border-edge bg-panel2 px-2 py-1 font-mono text-[10.5px]" style={{ left: `${(x(hover!) / W) * 100}%`, transform: "translateX(-50%)" }}>
              <span className="text-muted">{fmtDay(h.day)}</span> <span className="text-ink">{h.value.toLocaleString()}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
