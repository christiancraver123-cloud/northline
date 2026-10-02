"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SCENERY, supportHeight } from "@/lib/world/layout";
import { useQuality } from "./context";

type Place = { x: number; y?: number; z: number; yaw?: number; sx?: number; sy?: number; sz?: number };
function fill(ref: React.RefObject<THREE.InstancedMesh | null>, items: Place[], colors?: string[]) {
  const m = ref.current; if (!m) return; const o = new THREE.Object3D(), c = new THREE.Color();
  items.forEach((p, i) => { o.position.set(p.x, p.y ?? supportHeight(p.x, p.z, 1.2), p.z); o.rotation.set(0, p.yaw ?? 0, 0); o.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (colors) { c.set(colors[i % colors.length]); m.setColorAt(i, c); } });
  m.count = items.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
}
const std = (color: string, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m });

/** Repeated outdoor props, all instanced: street lamps, bollards, beach umbrella sets. (Buildings, benches, rails, pools etc. live in the town plan.) */
export function Props({ shadows }: { shadows: boolean }) {
  const q = useQuality();
  const lampPole = useRef<THREE.InstancedMesh>(null), lampHead = useRef<THREE.InstancedMesh>(null), bollard = useRef<THREE.InstancedMesh>(null), pole = useRef<THREE.InstancedMesh>(null), canopy = useRef<THREE.InstancedMesh>(null), lounger = useRef<THREE.InstancedMesh>(null), loungerBack = useRef<THREE.InstancedMesh>(null);
  const g = useMemo(() => ({ lamp: new THREE.CylinderGeometry(0.035, 0.055, 4.2, 8), head: new THREE.SphereGeometry(0.15, 12, 8), bol: new THREE.CylinderGeometry(0.12, 0.14, 0.8, 10), pole: new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), canopy: (() => { const c = new THREE.ConeGeometry(1.7, 0.55, 16, 1, true); c.translate(0, 2.55, 0); return c; })(), box: new THREE.BoxGeometry(1, 1, 1) }), []);
  const mt = useMemo(() => ({ lampPole: std("#2b3138", 0.5, 0.5), lampHead: new THREE.MeshBasicMaterial({ color: "#fff0cc" }), bol: std("#d8d2c6", 0.8), metal: std("#e8e4da", 0.5, 0.3), canopy: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide, color: "#ffffff" }), lounger: std("#f2eee6", 0.8) }), []);
  useEffect(() => {
    fill(lampPole, SCENERY.lamps.map((p) => ({ x: p.x, y: supportHeight(p.x, p.z, 1.2) + 2.1, z: p.z }))); fill(lampHead, SCENERY.lamps.map((p) => ({ x: p.x, y: supportHeight(p.x, p.z, 1.2) + 4.3, z: p.z })));
    fill(bollard, SCENERY.bollards.map((p) => ({ x: p.x, y: supportHeight(p.x, p.z, 1.2) + 0.4, z: p.z })));
    const U = SCENERY.beachSets.slice(0, Math.max(1, Math.ceil(SCENERY.beachSets.length * q.propDensity)));
    fill(pole, U.map((u) => ({ x: u.x, z: u.z }))); fill(canopy, U.map((u) => ({ x: u.x, z: u.z, yaw: u.yaw })), ["#ffffff", "#f4b942", "#ef6f5e", "#3aa6c4", "#ffffff", "#8bc34a"]);
    const L = U.flatMap((u) => [{ x: u.x - 1.2, z: u.z + 1.5, yaw: u.yaw * 0.1 }, { x: u.x + 1.2, z: u.z + 1.6, yaw: -u.yaw * 0.1 }]);
    fill(lounger, L.map((l) => ({ x: l.x, y: supportHeight(l.x, l.z, 1.2) + 0.2, z: l.z, yaw: l.yaw, sx: 0.7, sy: 0.12, sz: 1.9 }))); fill(loungerBack, L.map((l) => ({ x: l.x, y: supportHeight(l.x, l.z, 1.2) + 0.42, z: l.z - 0.85, yaw: l.yaw, sx: 0.7, sy: 0.4, sz: 0.1 })));
  }, [q.propDensity]);
  const c = shadows, im = (ref: React.RefObject<THREE.InstancedMesh | null>, geo: THREE.BufferGeometry, mat: THREE.Material, n: number, cast = c) => <instancedMesh ref={ref} args={[geo, mat, Math.max(1, n)]} castShadow={cast} />;
  const nU = SCENERY.beachSets.length;
  return (<group>{im(lampPole, g.lamp, mt.lampPole, SCENERY.lamps.length)}{im(lampHead, g.head, mt.lampHead, SCENERY.lamps.length, false)}{im(bollard, g.bol, mt.bol, SCENERY.bollards.length)}{im(pole, g.pole, mt.metal, nU)}{im(canopy, g.canopy, mt.canopy, nU)}{im(lounger, g.box, mt.lounger, nU * 2, false)}{im(loungerBack, g.box, mt.lounger, nU * 2, false)}</group>);
}
