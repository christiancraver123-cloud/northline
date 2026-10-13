"use client";
// Page-level keyboard shortcuts that click elements marked with data-key="…". Ignored while typing in a field or with a modifier held.
import { useEffect } from "react";

export function KeyNav({ map }: { map: Record<string, string> }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable],[role=dialog]")) return;
      const k = map[e.key] ?? map[e.key.toLowerCase()];
      const el = k ? document.querySelector<HTMLElement>(`[data-key="${k}"]`) : null;
      if (el && !(el as HTMLButtonElement).disabled) { e.preventDefault(); el.click(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [map]);
  return null;
}
