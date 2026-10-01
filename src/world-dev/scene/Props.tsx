"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BOARDWALK, SCENERY, groundHeight } from "@/lib/world/layout";
import { useQuality } from "./context";

type Place = { x: number; y?: number; z: number; yaw?: number; sx?: number; sy?: number; sz?: number };
function fill(ref: React.RefObject<THREE.InstancedMesh | null>, items: Place[], colors?: string[]) {
  const m = ref.current; if (!m) return; const o = new THREE.Object3D(), c = new THREE.Color();
  items.forEach((p, i) => { o.position.set(p.x, p.y ?? groundHeight(p.x, p.z), p.z); o.rotation.set(0, p.yaw ?? 0, 0); o.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (colors) { c.set(colors[i % colors.length]); m.setColorAt(i, c); } });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
}
const std = (color: string, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m });

/** All repeated props are instanced: a handful of draw calls regardless of count. */
export function Props({ shadows }: { shadows: boolean }) {
  const q = useQuality();
  const poles = useRef<THREE.InstancedMesh>(null), canopies = useRef<THREE.InstancedMesh>(null), lounger = useRef<THREE.InstancedMesh>(null), loungerBack = useRef<THREE.InstancedMesh>(null), lampPole = useRef<THREE.InstancedMesh>(null), lampHead = useRef<THREE.InstancedMesh>(null),
    bench = useRef<THREE.InstancedMesh>(null), benchBack = useRef<THREE.InstancedMesh>(null), planter = useRef<THREE.InstancedMesh>(null), planterBush = useRef<THREE.InstancedMesh>(null), bollard = useRef<THREE.InstancedMesh>(null), railPost = useRef<THREE.InstancedMesh>(null), railBar = useRef<THREE.InstancedMesh>(null), surf = useRef<THREE.InstancedMesh>(null);
  const g = useMemo(() => ({ pole: new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), canopy: (() => { const c = new THREE.ConeGeometry(1.7, 0.55, 16, 1, true); c.translate(0, 2.55, 0); return c; })(), box: new THREE.BoxGeometry(1, 1, 1), lamp: new THREE.CylinderGeometry(0.035, 0.055, 4.2, 8), head: new THREE.SphereGeometry(0.15, 14, 10), bol: new THREE.CylinderGeometry(0.12, 0.14, 0.8, 10), surf: new THREE.CapsuleGeometry(0.22, 2.0, 4, 10), bush: new THREE.IcosahedronGeometry(1, 2) }), []);
  const mt = useMemo(() => ({ metal: std("#e8e4da", 0.5, 0.3), canopy: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide, color: "#ffffff" }), lounger: std("#f2eee6", 0.8), wood: std("#a9763f", 0.75), lampPole: std("#2b3138", 0.5, 0.5), lampHead: new THREE.MeshBasicMaterial({ color: "#ffe3b0" }), planter: std("#e4ddd0", 0.85), bush: std("#5e9a4e", 0.9), bol: std("#d8d2c6", 0.8), surf: std("#f2c14e", 0.45) }), []);
  const rails = useMemo(() => { // boardwalk sea-side rail, with gaps where the beach paths cross it
    const gaps = [-30, -22, -14, -6, 2, 10, 18, 26], posts: Place[] = [], bars: Place[] = []; let x0 = -57;
    for (const gx of [...gaps, 58]) { const x1 = gx === 58 ? 57 : gx - 1.7; if (x1 - x0 > 1) { bars.push({ x: (x0 + x1) / 2, y: BOARDWALK.h + 1.0, z: BOARDWALK.z1 - 0.12, sx: x1 - x0, sy: 0.07, sz: 0.1 }); for (let x = x0; x <= x1 + 0.01; x += 3) posts.push({ x, y: BOARDWALK.h + 0.5, z: BOARDWALK.z1 - 0.12, sx: 0.09, sy: 1, sz: 0.09 }); } x0 = gx + 1.7; }
    return { posts, bars };
  }, []);
  useEffect(() => {
    const dens = (n: number) => Math.max(1, Math.ceil(n * q.propDensity));
    const U = SCENERY.umbrellas; fill(poles, U.map((u) => ({ x: u.x, z: u.z }))); fill(canopies, U.map((u) => ({ x: u.x, z: u.z, yaw: u.yaw })), ["#ffffff", "#f4b942", "#ef6f5e", "#3aa6c4", "#ffffff", "#8bc34a"]);
    fill(lounger, SCENERY.loungers.map((l) => ({ x: l.x, y: groundHeight(l.x, l.z) + 0.2, z: l.z, yaw: l.yaw, sx: 0.7, sy: 0.12, sz: 1.9 }))); fill(loungerBack, SCENERY.loungers.map((l) => ({ x: l.x, y: groundHeight(l.x, l.z) + 0.42, z: l.z - 0.85, yaw: l.yaw, sx: 0.7, sy: 0.4, sz: 0.1 })));
    fill(lampPole, SCENERY.lamps.map((p) => ({ x: p.x, y: groundHeight(p.x, p.z) + 2.1, z: p.z }))); fill(lampHead, SCENERY.lamps.map((p) => ({ x: p.x, y: groundHeight(p.x, p.z) + 4.3, z: p.z })));
    fill(bench, SCENERY.benches.map((b) => ({ x: b.x, y: groundHeight(b.x, b.z) + 0.45, z: b.z, sx: 1.8, sy: 0.08, sz: 0.5 }))); fill(benchBack, SCENERY.benches.map((b) => ({ x: b.x, y: groundHeight(b.x, b.z) + 0.8, z: b.z - 0.22, sx: 1.8, sy: 0.4, sz: 0.06 })));
    fill(planter, SCENERY.planters.map((p) => ({ x: p.x, y: groundHeight(p.x, p.z) + 0.32, z: p.z, sx: p.w, sy: 0.64, sz: 0.9 }))); fill(planterBush, SCENERY.planters.map((p) => ({ x: p.x, y: groundHeight(p.x, p.z) + 0.78, z: p.z, sx: p.w * 0.36, sy: 0.3, sz: 0.3 })));
    fill(bollard, SCENERY.bollards.map((p) => ({ x: p.x, y: groundHeight(p.x, p.z) + 0.4, z: p.z })));
    fill(railPost, rails.posts); fill(railBar, rails.bars);
    fill(surf, [0, 1, 2].map((i) => ({ x: 30.2 + i * 0.5, y: groundHeight(30, 28) + 1.1, z: 25.6, yaw: 0.1 * i, sx: 1, sy: 1, sz: 1 })));
    for (const [r, n] of [[canopies, U.length], [lounger, SCENERY.loungers.length], [bench, SCENERY.benches.length]] as const) if (r.current) r.current.count = dens(n as number);
  }, [q.propDensity, rails]);
  const c = shadows;
  const im = (ref: React.RefObject<THREE.InstancedMesh | null>, geo: THREE.BufferGeometry, mat: THREE.Material, n: number, cast = c) => <instancedMesh ref={ref} args={[geo, mat, Math.max(1, n)]} castShadow={cast} />;
  return (
    <group>
      {im(poles, g.pole, mt.metal, SCENERY.umbrellas.length)}{im(canopies, g.canopy, mt.canopy, SCENERY.umbrellas.length)}
      {im(lounger, g.box, mt.lounger, SCENERY.loungers.length)}{im(loungerBack, g.box, mt.lounger, SCENERY.loungers.length, false)}
      {im(lampPole, g.lamp, mt.lampPole, SCENERY.lamps.length)}{im(lampHead, g.head, mt.lampHead, SCENERY.lamps.length, false)}
      {im(bench, g.box, mt.wood, SCENERY.benches.length)}{im(benchBack, g.box, mt.wood, SCENERY.benches.length, false)}
      {im(planter, g.box, mt.planter, SCENERY.planters.length)}{im(planterBush, g.bush, mt.bush, SCENERY.planters.length)}
      {im(bollard, g.bol, mt.bol, SCENERY.bollards.length)}
      {im(railPost, g.box, mt.wood, rails.posts.length)}{im(railBar, g.box, mt.wood, rails.bars.length, false)}
      {im(surf, g.surf, mt.surf, 3, false)}
      {/* lifeguard tower */}
      <group position={[30, groundHeight(30, 27.3), 27.3]}>
        {[[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]].map(([x, z], i) => <mesh key={i} position={[x, 1.2, z]} castShadow={c}><boxGeometry args={[0.14, 2.4, 0.14]} /><primitive object={mt.wood} attach="material" /></mesh>)}
        <mesh position={[0, 2.45, 0]} castShadow={c}><boxGeometry args={[3, 0.14, 2.6]} /><primitive object={mt.wood} attach="material" /></mesh>
        <mesh position={[0, 3.3, 0]} castShadow={c}><boxGeometry args={[2.4, 1.6, 2]} /><meshStandardMaterial color="#f4efe6" roughness={0.85} /></mesh>
        <mesh position={[0, 4.3, 0]} castShadow={c}><boxGeometry args={[3.2, 0.2, 2.8]} /><meshStandardMaterial color="#e8533f" roughness={0.7} /></mesh>
      </group>
    </group>
  );
}
