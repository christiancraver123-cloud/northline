"use client";
import { useMemo } from "react";
import * as THREE from "three";

/** Distant islands / headland on the horizon: smooth blobs that the fog turns into atmospheric silhouettes (cheap, no textures). */
export function Backdrop() {
  const mats = useMemo(() => [new THREE.MeshStandardMaterial({ color: "#5d8a7a", roughness: 1 }), new THREE.MeshStandardMaterial({ color: "#6c97a0", roughness: 1 })], []);
  const items: [number, number, number, number, number, number, number][] = [[-260, 0, 620, 150, 38, 60, 0], [-120, 0, 700, 90, 22, 45, 1], [330, 0, 640, 210, 52, 70, 0], [90, 0, 760, 120, 20, 50, 1], [-520, 0, 400, 180, 46, 80, 1], [560, 0, 330, 160, 40, 60, 0]];
  return <group>{items.map(([x, y, z, sx, sy, sz, mi], i) => <mesh key={i} position={[x, y - 4, z]} scale={[sx, sy, sz]} material={mats[mi]}><sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>)}</group>;
}
