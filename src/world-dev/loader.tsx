"use client";
import dynamic from "next/dynamic";

/** The 3D stack is its own lazily loaded chunk: the normal Command Center never downloads it. */
const WorldDevClient = dynamic(() => import("./WorldDevClient"), { ssr: false, loading: () => <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b1020] text-slate-300">Loading Northline World…</div> });
export default function WorldDevLoader() { return <WorldDevClient />; }
