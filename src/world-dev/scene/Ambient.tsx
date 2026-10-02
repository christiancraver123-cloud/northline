"use client";
// Restrained ambient life (all COSMETIC and clearly not agents): birds, boats at the marina + distant sailboats, golf carts on the main road,
// a few boardwalk walkers, flags. Instanced, bounded by quality tier, and driven by pure maths — no state, no network.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BOARDWALK, ROAD, TOWN } from "@/lib/world/layout";
import { useQuality } from "./context";

const colorGeo = (g: THREE.BufferGeometry, c: string) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute("uv"); const k = new THREE.Color(c), a = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = k.r; a[i + 1] = k.g; a[i + 2] = k.b; } n.setAttribute("color", new THREE.BufferAttribute(a, 3)); return n; };
const o3 = new THREE.Object3D();

export function Ambient() {
  const q = useQuality();
  const birds = useRef<THREE.InstancedMesh>(null), hulls = useRef<THREE.InstancedMesh>(null), sails = useRef<THREE.InstancedMesh>(null), carts = useRef<THREE.InstancedMesh>(null), wBody = useRef<THREE.InstancedMesh>(null), wHead = useRef<THREE.InstancedMesh>(null), flags = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const bird = new THREE.BufferGeometry(); bird.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.35, -1.1, 0.18, -0.15, 0, 0, -0.15, 0, 0, 0.35, 0, 0, -0.15, 1.1, 0.18, -0.15], 3)); bird.computeVertexNormals();
    const hull = mergeGeometries([colorGeo(new THREE.BoxGeometry(1.7, 0.8, 5.2), "#f4f1ea"), colorGeo((() => { const b = new THREE.ConeGeometry(0.85, 1.6, 4); b.rotateX(Math.PI / 2); b.rotateY(Math.PI / 4); b.translate(0, 0, 3.2); b.scale(1, 0.5, 1); return b; })(), "#f4f1ea"), colorGeo((() => { const b = new THREE.BoxGeometry(1.7, 0.12, 5.2); b.translate(0, 0.43, 0); return b; })(), "#7d5f43"), colorGeo((() => { const b = new THREE.CylinderGeometry(0.05, 0.06, 5.4, 6); b.translate(0, 3.2, -0.2); return b; })(), "#cfd6dc")])!;
    const sail = new THREE.BufferGeometry(); sail.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.9, -0.2, 0, 5.8, -0.2, 0, 0.9, 2.6, 0, 0.9, -0.2, 0, 0.9, 2.6, 0, 5.8, -0.2], 3)); sail.computeVertexNormals();
    const cart = mergeGeometries([colorGeo(new THREE.BoxGeometry(1.2, 0.5, 2.2), "#f2f0e8"), colorGeo((() => { const b = new THREE.BoxGeometry(1.3, 0.06, 1.6); b.translate(0, 1.5, -0.1); return b; })(), "#2f7a5f"), ...[-0.55, 0.55].flatMap((x) => [-0.8, 0.8].map((z) => colorGeo((() => { const b = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10); b.rotateZ(Math.PI / 2); b.translate(x, -0.12, z); return b; })(), "#23272d"))), ...[-0.6, 0.6].map((x) => colorGeo((() => { const b = new THREE.BoxGeometry(0.05, 1.0, 0.05); b.translate(x, 0.95, 0.55); return b; })(), "#9aa5ac"))])!;
    cart.translate(0, 0.45, 0);
    return { bird, hull, sail, cart, cap: new THREE.CapsuleGeometry(0.2, 0.7, 3, 8), head: new THREE.SphereGeometry(0.15, 8, 6), flag: new THREE.PlaneGeometry(1.6, 0.9) };
  }, []);
  const mat = useMemo(() => ({ vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), bird: new THREE.MeshBasicMaterial({ color: "#2b3138", side: THREE.DoubleSide }), sail: new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.9 }), body: new THREE.MeshStandardMaterial({ roughness: 0.8 }), skin: new THREE.MeshStandardMaterial({ color: "#d9a67c" }), flag: new THREE.MeshStandardMaterial({ color: "#2563eb", side: THREE.DoubleSide, roughness: 0.8 }) }), []);
  const slots = useMemo(() => TOWN.boatSlots, []);
  const nBoat = Math.min(q.boats, slots.length), nFar = q.boats > 0 ? 3 : 0, nWalk = q.walkers, nCart = q.carts, nBird = q.birds;
  const flagSpots = useMemo(() => [[-35.2, 9.7, -39.2], [0.8, 9.7, -39.2], [98, 3.6, 52.2], [-12, 4.4, 40]] as const, []);
  useEffect(() => {
    const c = new THREE.Color(); slots.slice(0, nBoat).forEach((s, i) => { hulls.current?.setColorAt(i, c.set(s.color)); }); if (hulls.current?.instanceColor) hulls.current.instanceColor.needsUpdate = true;
    const cols = ["#e0576b", "#4f8dd6", "#f2c14e", "#6bbf8a", "#b58ad6", "#ee8d4a", "#4fb8c4", "#d9d9d9"]; for (let i = 0; i < 8; i++) wBody.current?.setColorAt(i, c.set(cols[i])); if (wBody.current?.instanceColor) wBody.current.instanceColor.needsUpdate = true;
  }, [slots, nBoat]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (birds.current) { for (let i = 0; i < nBird; i++) { const a = t * (0.07 + (i % 4) * 0.015) + i * 1.7, R = 40 + (i % 5) * 18, cx = -20 + (i % 3) * 40, cz = 30 + (i % 4) * 6; o3.position.set(cx + Math.cos(a) * R, 24 + (i % 4) * 5 + Math.sin(t * 0.4 + i) * 1.5, cz + Math.sin(a) * R * 0.6); o3.rotation.set(0, -a + Math.PI, Math.sin(t * 7 + i) * 0.5); o3.scale.set(1, 1, 1); o3.updateMatrix(); birds.current.setMatrixAt(i, o3.matrix); } birds.current.count = nBird; birds.current.instanceMatrix.needsUpdate = true; }
    if (hulls.current && sails.current) {
      for (let i = 0; i < nBoat + nFar; i++) {
        if (i < nBoat) { const b = slots[i]; o3.position.set(b.x, -0.05 + Math.sin(t * 0.9 + i) * 0.07, b.z); o3.rotation.set(Math.sin(t * 0.7 + i * 2) * 0.03, b.yaw, Math.sin(t * 0.8 + i) * 0.04); o3.scale.setScalar(b.len / 7.5 * 1.0); }
        else { const k = i - nBoat, x = ((t * (1.2 + k * 0.4) + k * 150) % 520) - 260; o3.position.set(x, -0.05 + Math.sin(t * 0.6 + k) * 0.08, 150 + k * 40); o3.rotation.set(0, Math.PI / 2, Math.sin(t * 0.5 + k) * 0.05); o3.scale.setScalar(2.2); }
        o3.updateMatrix(); hulls.current.setMatrixAt(i, o3.matrix); sails.current.setMatrixAt(i, o3.matrix);
      }
      hulls.current.count = sails.current.count = nBoat + nFar; hulls.current.instanceMatrix.needsUpdate = sails.current.instanceMatrix.needsUpdate = true;
    }
    if (carts.current) { for (let i = 0; i < nCart; i++) { const period = 150 + i * 20, u = ((t * 3.2 + i * 90) % (period * 2)) / period, dir = u < 1 ? 1 : -1, x = (u < 1 ? u : 2 - u) * 170 - 85; o3.position.set(x, ROAD.h + 0.05, dir > 0 ? ROAD.z0 + 1.6 : ROAD.z1 - 1.6); o3.rotation.set(0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); o3.scale.setScalar(1); o3.updateMatrix(); carts.current.setMatrixAt(i, o3.matrix); } carts.current.count = nCart; carts.current.instanceMatrix.needsUpdate = true; }
    if (wBody.current && wHead.current) { for (let i = 0; i < nWalk; i++) { const speed = 1.25, span = 150 + i * 6, u = ((t * speed + i * 37) % (span * 2)) / span, x = (u < 1 ? u : 2 - u) * span - span / 2, z = BOARDWALK.z0 + 0.8 + (i % 3) * 0.9, bob = Math.abs(Math.sin(t * 5 + i)) * 0.04; o3.position.set(x, BOARDWALK.h + 0.55 + bob, z); o3.rotation.set(0, u < 1 ? Math.PI / 2 : -Math.PI / 2, 0); o3.scale.set(1, 1, 1); o3.updateMatrix(); wBody.current.setMatrixAt(i, o3.matrix); o3.position.y += 0.78; o3.updateMatrix(); wHead.current.setMatrixAt(i, o3.matrix); } wBody.current.count = wHead.current.count = nWalk; wBody.current.instanceMatrix.needsUpdate = wHead.current.instanceMatrix.needsUpdate = true; }
    if (flags.current) { flagSpots.forEach(([x, y, z], i) => { o3.position.set(x + 0.8, y + 2.3, z); o3.rotation.set(0, Math.sin(t * 1.7 + i) * 0.35, Math.sin(t * 5 + i) * 0.05); o3.scale.set(1 + Math.sin(t * 6 + i) * 0.05, 1, 1); o3.updateMatrix(); flags.current!.setMatrixAt(i, o3.matrix); }); flags.current.instanceMatrix.needsUpdate = true; }
  });
  return (
    <group>
      <instancedMesh ref={birds} args={[geo.bird, mat.bird, 16]} frustumCulled={false} />
      <instancedMesh ref={hulls} args={[geo.hull, mat.vc, 16]} frustumCulled={false} /><instancedMesh ref={sails} args={[geo.sail, mat.sail, 16]} frustumCulled={false} />
      <instancedMesh ref={carts} args={[geo.cart, mat.vc, 2]} frustumCulled={false} />
      <instancedMesh ref={wBody} args={[geo.cap, mat.body, 8]} frustumCulled={false} /><instancedMesh ref={wHead} args={[geo.head, mat.skin, 8]} frustumCulled={false} />
      {flagSpots.map(([x, y, z], i) => <mesh key={i} position={[x, y + 1.1, z]}><cylinderGeometry args={[0.05, 0.06, 2.4, 6]} /><meshStandardMaterial color="#cfd6dc" /></mesh>)}
      <instancedMesh ref={flags} args={[geo.flag, mat.flag, 4]} frustumCulled={false} />
    </group>
  );
}
