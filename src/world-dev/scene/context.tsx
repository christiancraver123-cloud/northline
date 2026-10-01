"use client";
import { createContext, useContext } from "react";
import { TIERS, type TierConfig } from "@/lib/world/quality";

export const QualityContext = createContext<TierConfig>(TIERS.MEDIUM);
export const useQuality = () => useContext(QualityContext);
/** Direction TOWARD the sun (late-afternoon, low over the ocean so the studio facade is warmly front-lit and the water glints). */
export const SUN_DIR: [number, number, number] = (() => { const v = [0.42, 0.4, 0.82], l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
export const PALETTE = { skyTop: "#3f86d6", skyMid: "#8fc3ea", horizon: "#f6dcc0", fog: "#cfdde6", sun: "#ffd9a3", hemiSky: "#bcd8f0", hemiGround: "#d9c39a" };
