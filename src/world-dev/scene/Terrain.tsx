"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { BOARDWALK, ROAD, TOWN, groundHeight, shoreZ } from "@/lib/world/layout";
import { useQuality } from "./context";
import { clamp, lerp, noise2, smoothstep } from "@/lib/world/math";
import { asphaltTexture, paversTexture, woodTexture } from "../textures";

const col = (hex: string) => new THREE.Color(hex);
const C = { lawn: col("#7fae57"), lawnDry: col("#b3b567"), sand: col("#ecdcb6"), sandLight: col("#f4e8c8"), wet: col("#c9b48a"), sea1: col("#d6cca8"), sea2: col("#86a698"), hill: col("#648f50"), hill2: col("#7da45a"), rock: col("#9a9684"), paved: col("#cfc6b6") };
const tmp = new THREE.Color();

function terrainColor(x: number, z: number, h: number, out: THREE.Color) {
  const n = noise2(x * 0.08, z * 0.08), n2 = noise2(x * 0.5, z * 0.5), sz = shoreZ(x);
  if (h < 0) { out.copy(C.sea1).lerp(C.sea2, smoothstep(0, -6, h)); return out.multiplyScalar(0.93 + n2 * 0.1); }
  if (z < -34 && h > 1.5) { out.copy(C.hill).lerp(C.hill2, n); out.lerp(C.lawnDry, smoothstep(0.55, 0.9, noise2(x * 0.04, z * 0.07)) * 0.5); out.lerp(C.rock, smoothstep(9, 16, h) * 0.35 * n); return out.multiplyScalar(0.9 + n2 * 0.15); }
  const beach = smoothstep(14, 21, z) * (z > 0 ? 1 : 0);
  out.copy(C.lawn).lerp(C.lawnDry, clamp(n * 0.9 + (n2 - 0.5) * 0.4, 0, 1) * 0.55);
  out.lerp(C.sand, beach).lerp(C.sandLight, beach * smoothstep(0.35, 0.8, n) * 0.5);
  out.lerp(C.wet, smoothstep(sz - 4, sz + 0.5, z) * 0.85 * (z > 0 ? 1 : 0)); // wet sand near the waterline
  for (const p of TOWN.paved) out.lerp(C.paved, 0.55 * smoothstep(p.minZ - 1, p.minZ, z) * smoothstep(p.maxZ + 1, p.maxZ, z) * smoothstep(p.minX - 1, p.minX, x) * smoothstep(p.maxX + 1, p.maxX, x));
  return out.multiplyScalar(0.93 + n2 * 0.12);
}

function makeGrid(x0: number, x1: number, z0: number, z1: number, step: number, skip?: (x: number, z: number) => boolean) {
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), pos = new Float32Array((nx + 1) * (nz + 1) * 3), colr = new Float32Array((nx + 1) * (nz + 1) * 3), idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, h = groundHeight(x, z), k = j * (nx + 1) + i;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; terrainColor(x, z, h, tmp); colr[k * 3] = tmp.r; colr[k * 3 + 1] = tmp.g; colr[k * 3 + 2] = tmp.b;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    if (skip && skip(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
    idx.push(a, c, b, b, c, d); // counter-clockwise seen from above (+y normal)
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

export function Terrain({ receiveShadow }: { receiveShadow: boolean }) {
  const q = useQuality();
  const { inner, outer } = useMemo(() => ({ inner: makeGrid(-130, 130, -90, 76, q.terrainStep), outer: makeGrid(-640, 640, -330, 150, 8, (x, z) => x > -130 && x < 130 && z > -90 && z < 76) }), [q.terrainStep]);
  const tex = useMemo(() => { const road = asphaltTexture(), wood = woodTexture(), pave = paversTexture(); return { road, wood, pave, paved: TOWN.paved.map((p) => { const t = pave.clone(); t.repeat.set((p.maxX - p.minX) / 3.2, (p.maxZ - p.minZ) / 3.2); t.needsUpdate = true; return t; }) }; }, []);
  const curb = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d8d2c6", roughness: 0.9 }), []), edge = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8a6a47", roughness: 0.8 }), []);
  const vc = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), []);
  const roadW = ROAD.z1 - ROAD.z0, bwW = BOARDWALK.z1 - BOARDWALK.z0;
  return (
    <group>
      <mesh geometry={outer} material={vc} position={[0, -0.04, 0]} />
      <mesh geometry={inner} material={vc} receiveShadow={receiveShadow} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ROAD.h + 0.03, (ROAD.z0 + ROAD.z1) / 2]} receiveShadow={receiveShadow}><planeGeometry args={[260, roadW]} /><meshStandardMaterial map={tex.road} roughness={0.92} /></mesh>
      {[ROAD.z0 - 0.15, ROAD.z1 + 0.15].map((z) => <mesh key={z} position={[0, ROAD.h + 0.1, z]} receiveShadow={receiveShadow}><boxGeometry args={[260, 0.2, 0.3]} /><primitive object={curb} attach="material" /></mesh>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BOARDWALK.h + 0.03, (BOARDWALK.z0 + BOARDWALK.z1) / 2]} receiveShadow={receiveShadow}><planeGeometry args={[204, bwW]} /><meshStandardMaterial map={tex.wood} roughness={0.78} /></mesh>
      {[BOARDWALK.z0, BOARDWALK.z1].map((z) => <mesh key={z} position={[0, BOARDWALK.h - 0.12, z]} castShadow receiveShadow={receiveShadow}><boxGeometry args={[204, 0.34, 0.22]} /><primitive object={edge} attach="material" /></mesh>)}
      {TOWN.paved.map((p, i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[(p.minX + p.maxX) / 2, 0.63, (p.minZ + p.maxZ) / 2]} receiveShadow={receiveShadow}><planeGeometry args={[p.maxX - p.minX, p.maxZ - p.minZ]} /><meshStandardMaterial map={tex.paved[i]} roughness={0.85} /></mesh>)}
    </group>
  );
}
export { lerp };
