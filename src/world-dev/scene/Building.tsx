"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { BUILDING, DESK } from "@/lib/world/layout";
import { moodBoardTexture, signTexture, stuccoTexture } from "../textures";

type Box = [cx: number, cy: number, cz: number, sx: number, sy: number, sz: number];
/** Many boxes of one material in ONE draw call (instanced unit cube, scaled per instance). */
function BoxBatch({ boxes, material, cast }: { boxes: Box[]; material: THREE.Material; cast: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => { const m = ref.current; if (!m) return; const o = new THREE.Object3D(); boxes.forEach((b, i) => { o.position.set(b[0], b[1], b[2]); o.scale.set(b[3], b[4], b[5]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }, [boxes]);
  return <instancedMesh ref={ref} args={[undefined, material, boxes.length]} castShadow={cast} receiveShadow><boxGeometry args={[1, 1, 1]} /></instancedMesh>;
}

/** Northline Studio — a modern coastal hero-building PLACEHOLDER built procedurally (a custom hero asset may replace it later). ~13 draw calls. */
export function Building({ shadows }: { shadows: boolean }) {
  const m = useMemo(() => ({
    stucco: new THREE.MeshStandardMaterial({ map: stuccoTexture(), roughness: 0.92, color: "#f8f4ec" }),
    stuccoWarm: new THREE.MeshStandardMaterial({ color: "#eadfca", roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#86c3d8", roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: "#e9c28a" }),
    teak: new THREE.MeshStandardMaterial({ color: "#b07a42", roughness: 0.65 }),
    dark: new THREE.MeshStandardMaterial({ color: "#2a313a", roughness: 0.45, metalness: 0.45 }),
    roof: new THREE.MeshStandardMaterial({ color: "#e4dfd5", roughness: 0.85 }),
    fascia: new THREE.MeshStandardMaterial({ color: "#2a313a", roughness: 0.5, metalness: 0.3 }),
    sign: new THREE.MeshBasicMaterial({ map: signTexture("NORTHLINE") }),
    board: new THREE.MeshStandardMaterial({ map: moodBoardTexture(), emissive: "#ffffff", emissiveMap: moodBoardTexture(), emissiveIntensity: 0.6 }),
    plant: new THREE.MeshStandardMaterial({ color: "#5a9a4c", roughness: 0.9 }),
    planter: new THREE.MeshStandardMaterial({ color: "#e4ddd0", roughness: 0.8 }),
  }), []);
  const { minX, maxX, minZ, maxZ, entrance } = BUILDING, cx = (minX + maxX) / 2, w = maxX - minX, zf = maxZ, d = maxZ - minZ, cz = (minZ + maxZ) / 2;
  const y0 = 0.58, h1 = 4.1, h2 = 3.9, roofY = y0 + h1 + h2;
  const teak = useMemo<Box[]>(() => {
    const b: Box[] = [];
    for (let i = 0; i < 16; i++) b.push([entrance.x - 8.4 + i * 0.28 + 0.6, y0 + 1.75, zf + 0.16, 0.15, 3.5, 0.18]);                                         // entrance slat screen
    for (let i = 0; i < 15; i++) b.push([minX + 4 + (w - 4) / 2 - 9.8 + 1.4 + i * 0.6 + 8.0, y0 + h1 + 1.95, zf - 0.28, 0.18, 3.5, 0.2]);                  // upper-floor battens (east end)
    b.push([-2, roofY + 3.45, cz + 2, 16, 0.12, 0.3]); for (let i = 0; i < 12; i++) b.push([-9.3 + i * 1.5, roofY + 3.52, cz + 2, 0.1, 0.08, 4.6]);          // roof pergola
    for (let i = 0; i < 9; i++) b.push([DESK.x - 1.4 + i * 0.35, 0.58 + 3.25, DESK.z, 0.14, 0.1, 3.2]); b.push([DESK.x, 0.58 + 0.78, DESK.z, 1.8, 0.07, 0.9]);  // desk pergola + desk top
    return b;
  }, [entrance.x, zf, minX, w, cz, roofY]);
  const dark = useMemo<Box[]>(() => {
    const b: Box[] = [];
    for (const x of [-5, -2.5, 0, 2.5, 5]) b.push([minX + 7.5 + x, y0 + 2.05, zf + 0.09, 0.07, 3.3, 0.08]);                                                 // mullions
    b.push([entrance.x, y0 + 1.2, zf + 0.02, 2.4, 2.4, 0.1]);                                                                                                 // door
    for (const x of [-9, -4, 1, 5]) b.push([x, roofY + 1.9, cz + 2, 0.15, 3, 0.15]);                                                                           // roof pergola posts
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) b.push([DESK.x + dx, 0.58 + 1.6, DESK.z + dz, 0.2, 3.2, 0.2]);               // desk pergola posts
    for (const [dx, dz] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) b.push([DESK.x + dx, 0.58 + 0.38, DESK.z + dz, 0.06, 0.76, 0.06]);       // desk legs
    b.push([DESK.x - 0.45, 0.58 + 0.83, DESK.z + 0.05, 0.38, 0.03, 0.26]);                                                                                    // laptop
    b.push([maxX - 0.4, y0 + h1 / 2, zf - 0.9, 0.4, h1, 0.4]);                                                                                                // cantilever column
    return b;
  }, [entrance.x, zf, minX, maxX, cz, roofY]);
  const planters = useMemo<Box[]>(() => [-1.0, 1.0].map((x) => [DESK.x + x, 0.58 + 0.3, DESK.z + 1.05, 1.2, 0.6, 0.5] as Box), []);
  const shrubs = useRef<THREE.InstancedMesh>(null);
  useEffect(() => { const s = shrubs.current; if (!s) return; const o = new THREE.Object3D(); [-16, -13, -10, 2, 5].forEach((x, i) => { const r = 0.65 + (i % 3) * 0.12; o.position.set(x, 0.58 + r * 0.55, zf + 0.95 + (i % 2) * 0.3); o.scale.set(r, r * 0.8, r); o.updateMatrix(); s.setMatrixAt(i, o.matrix); }); s.instanceMatrix.needsUpdate = true; s.computeBoundingSphere(); }, [zf]);
  const c = shadows;
  return (
    <group>
      <RoundedBox args={[w - 6, h1, d]} radius={0.12} smoothness={3} position={[minX + (w - 6) / 2, y0 + h1 / 2, cz]} castShadow={c} receiveShadow={c} material={m.stucco} />
      <RoundedBox args={[w - 4, h2, d - 0.6]} radius={0.14} smoothness={3} position={[minX + 4 + (w - 4) / 2, y0 + h1 + h2 / 2, cz]} castShadow={c} receiveShadow={c} material={m.stuccoWarm} />
      <RoundedBox args={[w + 1.2, 0.34, d + 1.2]} radius={0.08} smoothness={2} position={[cx + 0.4, roofY + 0.17, cz]} castShadow={c} material={m.roof} />
      <mesh position={[cx + 0.4, roofY - 0.02, zf + 0.7]}><boxGeometry args={[w + 1.2, 0.12, 0.08]} /><primitive object={m.fascia} attach="material" /></mesh>
      {/* glazing + warm interior glow */}
      <mesh position={[minX + 7.5, y0 + 2.05, zf + 0.04]} renderOrder={4}><boxGeometry args={[11, 3.3, 0.06]} /><primitive object={m.glass} attach="material" /></mesh>
      <mesh position={[minX + 7.5, y0 + 2.05, zf - 0.35]}><planeGeometry args={[10.6, 3.1]} /><primitive object={m.glow} attach="material" /></mesh>
      <mesh position={[minX + 4 + (w - 4) / 2, y0 + h1 + 2.1, zf - 0.25]} renderOrder={4}><boxGeometry args={[w - 7, 2.7, 0.06]} /><primitive object={m.glass} attach="material" /></mesh>
      <mesh position={[minX + 4 + (w - 4) / 2, y0 + h1 + 2.1, zf - 0.7]}><planeGeometry args={[w - 7.2, 2.5]} /><primitive object={m.glow} attach="material" /></mesh>
      <mesh position={[entrance.x, y0 + h1 + 0.75, zf + 0.12]}><planeGeometry args={[5.6, 1.4]} /><primitive object={m.sign} attach="material" /></mesh>
      <mesh position={[DESK.x + 0.25, 0.58 + 1.08, DESK.z - 0.1]} rotation={[-0.25, 0, 0]}><boxGeometry args={[0.6, 0.42, 0.02]} /><primitive object={m.board} attach="material" /></mesh>
      <BoxBatch boxes={teak} material={m.teak} cast={c} /><BoxBatch boxes={dark} material={m.dark} cast={c} /><BoxBatch boxes={planters} material={m.planter} cast={c} />
      <instancedMesh ref={shrubs} args={[undefined, m.plant, 5]} castShadow={c}><icosahedronGeometry args={[1, 2]} /></instancedMesh>
    </group>
  );
}
