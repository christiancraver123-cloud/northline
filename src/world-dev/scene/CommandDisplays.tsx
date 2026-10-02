"use client";
// The live HQ displays: command-table map, Command Center wall dashboard, founder-suite panel. Painted from the shared BoardData a few times a second,
// only when the camera is near (or in the management overview), so they cost nothing elsewhere.
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { DISPLAYS } from "@/lib/world/layout";
import type { BoardData } from "@/lib/world/board";
import { useQuality } from "./context";
import { paintSuite, paintTable, paintWall } from "./boards";

const SIZE: Record<string, [number, number]> = { table: [1024, 580], wall: [1536, 420], suite: [320, 200] };
export function CommandDisplays({ board, overview }: { board: MutableRefObject<BoardData>; overview: MutableRefObject<boolean> }) {
  const q = useQuality(), { camera } = useThree(), last = useRef(0), seq = useRef(-99);
  const items = useMemo(() => DISPLAYS.map((d) => { const [w, h] = SIZE[d.kind], canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return { d, canvas, tex, ctx: canvas.getContext("2d")!, w, h }; }), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useEffect(() => () => items.forEach((i) => i.tex.dispose()), [items]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, hz = q.tier === "LOW" ? 2 : q.tier === "MEDIUM" ? 4 : 6, due = t - last.current > 1 / hz; if (due) last.current = t;
    items.forEach((it, i) => {
      const m = refs.current[i]; if (!m) return; const near = Math.hypot(camera.position.x - it.d.x, camera.position.y - it.d.y, camera.position.z - it.d.z) < (it.d.kind === "suite" ? 9 : 24) || (overview.current && it.d.kind !== "suite");
      m.visible = near; if (!near || !due) return; const b = board.current; if (b.seq === -1) return;
      (it.d.kind === "table" ? paintTable : it.d.kind === "wall" ? paintWall : paintSuite)(it.ctx, it.w, it.h, b); it.tex.needsUpdate = true;
    });
    seq.current = board.current.seq;
  });
  return <>{items.map((it, i) => {
    const d = it.d, rot: [number, number, number] = d.kind === "table" ? [-Math.PI / 2, 0, 0] : d.kind === "suite" ? [-Math.PI / 2 - 0.45, 0, 0] : [0, d.rotY, 0];
    return <mesh key={d.id} ref={(m) => { refs.current[i] = m; }} position={[d.x, d.y, d.z]} rotation={rot} visible={false} renderOrder={4}><planeGeometry args={[d.w, d.h]} /><meshBasicMaterial map={it.tex} toneMapped={false} polygonOffset polygonOffsetFactor={-2} /></mesh>;
  })}</>;
}
