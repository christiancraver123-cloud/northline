"use client";
import { createContext, useContext } from "react";
import { TIERS, type TierConfig } from "@/lib/world/quality";

export const QualityContext = createContext<TierConfig>(TIERS.MEDIUM);
export const useQuality = () => useContext(QualityContext);
/** Direction TOWARD the sun: clean midday-afternoon coastal daylight (high sun, slightly toward the ocean so south-facing facades are lit). Golden hour can return later as a time-of-day state. */
export const SUN_DIR: [number, number, number] = (() => { const v = [0.34, 0.8, 0.5], l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
export const PALETTE = { skyTop: "#2b78d4", skyMid: "#6eb2ee", horizon: "#e6f1f9", fog: "#cfe2f0", sun: "#fff6e6", hemiSky: "#cfe6ff", hemiGround: "#d3c7a8" };
