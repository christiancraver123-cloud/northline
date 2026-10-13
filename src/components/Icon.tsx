// Small inline stroke icon set (no icon dependency). 24px grid, drawn at 1.7 stroke; size via the `size` prop.
const P: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  check: "M4 12.5 9.5 18 20 6",
  checks: "M2 12.5 7 17.5 17 6.5M12 16.5l1 1L22.5 7",
  inbox: "M3 13h5l1.5 3h5L16 13h5M5.5 5h13L21 13v6H3v-6z",
  live: "M12 12h.01M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  collab: "M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM15.5 11a3.5 3.5 0 1 0 0-7M2.5 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15.5 14c3.3 0 6 2.7 6 6",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5h.01",
  chart: "M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7",
  bot: "M6 8h12v11H6zM12 4v4M9 13h.01M15 13h.01M3 12v4M21 12v4",
  repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  chevron: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 4 2.5 20h19zM12 10v4M12 17h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  menu: "M4 7h16M4 12h16M4 17h16",
  kit: "M4 8h16v12H4zM9 8V5h6v3M4 13h16",
  pen: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  bolt: "M13 3 5 13h6l-1 8 8-10h-6z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5",
  dot: "M12 12h.01",
};
export type IconName = keyof typeof P;
export function Icon({ name, size = 16, className = "", stroke = 1.7 }: { name: IconName | string; size?: number; className?: string; stroke?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className}`}>
      <path d={P[name] ?? P.dot} />
    </svg>
  );
}
