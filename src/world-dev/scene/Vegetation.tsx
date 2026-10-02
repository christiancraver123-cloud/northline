"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCENERY, supportHeight } from "@/lib/world/layout";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise2, rng } from "@/lib/world/math";
import { useQuality } from "./context";

/** Wind sway injected into a standard material (vertex-only; costs nothing on LOW because uTime stays 0). */
function swayMaterial(base: THREE.MeshStandardMaterial, amp: number, timeRef: { value: number }) {
  base.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeRef;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iw = vec3(instanceMatrix[3][0], 0., instanceMatrix[3][2]);
      #else
        vec3 iw = vec3(0.);
      #endif
      float sway = clamp(position.y * ${amp.toFixed(3)}, 0., 1.) ;
      transformed.x += sin(uTime*1.3 + iw.x*.37 + iw.z*.21) * sway * .55;
      transformed.z += cos(uTime*1.1 + iw.z*.31) * sway * .35;`);
  };
  return base;
}

const bendTrunk = () => {
  const g = new THREE.CylinderGeometry(0.17, 0.3, 8, 9, 12, false); g.translate(0, 4, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = y / 8; p.setX(i, p.getX(i) + 1.15 * k * k);
    const ring = Math.floor(y / 0.32) % 2 ? 0.86 : 1; c.set("#9b7b57").lerp(new THREE.Color("#7a5c3d"), k * 0.5).multiplyScalar(ring); col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
};
const frond = () => {
  const g = new THREE.PlaneGeometry(1.15, 4.4, 4, 10); g.translate(0, 2.2, 0); g.rotateX(Math.PI / 2 * 0.0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), t = y / 4.4, taper = Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04)) * 0.9 + 0.1;
    p.setX(i, x * taper * (1 - 0.35 * t)); p.setZ(i, 0.45 * t * t * 4.4 * -0.45 + Math.abs(x) * 0.28 * taper); p.setY(i, y - t * t * 0.9);
    c.set("#2f7a3c").lerp(new THREE.Color("#8fc65a"), t * 0.8 + (noise2(x * 5, y) - 0.5) * 0.15); col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
};

export function Vegetation({ shadows }: { shadows: boolean }) {
  const q = useQuality(), time = useRef({ value: 0 }), trunkRef = useRef<THREE.InstancedMesh>(null), frondRef = useRef<THREE.InstancedMesh>(null), tuftRef = useRef<THREE.InstancedMesh>(null), rockRef = useRef<THREE.InstancedMesh>(null), bushRef = useRef<THREE.InstancedMesh>(null);
  const FR = 9;
  const geos = useMemo(() => ({ trunk: bendTrunk(), frond: frond(), tuft: (() => { // a clump of 6 thin curved blades (merged) so lawn/dune grass reads as grass, not spikes
      const parts: THREE.BufferGeometry[] = [], r = rng(5), k = new THREE.Color();
      for (let i = 0; i < 6; i++) { const g = new THREE.ConeGeometry(0.045, 0.62 + r.range(0, 0.3), 3, 3); g.translate(0, 0.33, 0); const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let j = 0; j < p.count; j++) { const t = p.getY(j) / 0.9; p.setX(j, p.getX(j) + t * t * 0.18); k.set("#5f8f3a").lerp(new THREE.Color("#c9cf7c"), Math.min(1, t)); c.set([k.r, k.g, k.b], j * 3); } g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.rotateY(r.range(0, 6.28)); g.translate(r.range(-0.14, 0.14), 0, r.range(-0.14, 0.14)); g.rotateZ(r.range(-0.2, 0.2)); parts.push(g.toNonIndexed()); }
      const m = mergeGeometries(parts)!; return m; })(), rock: new THREE.IcosahedronGeometry(1, 1), bush: new THREE.IcosahedronGeometry(1, 2) }), []);
  const mats = useMemo(() => ({
    trunk: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    frond: swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), 0.22, time.current),
    tuft: swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 1.0, time.current),
    rock: new THREE.MeshStandardMaterial({ color: "#aaa594", roughness: 0.95 }),
    bush: new THREE.MeshStandardMaterial({ color: "#4d8645", roughness: 0.92 }),
  }), []);
  const m4 = useMemo(() => {
    const trunks: THREE.Matrix4[] = [], fronds: THREE.Matrix4[] = [], r = rng(99), o = new THREE.Object3D(), e = new THREE.Euler(), q2 = new THREE.Quaternion();
    for (const p of SCENERY.palms) {
      const sy = p.h / 8, s = p.s; o.position.set(p.x, supportHeight(p.x, p.z, 1.2) - 0.1, p.z); o.rotation.set(0, p.yaw, 0); o.scale.set(s, sy, s); o.updateMatrix(); trunks.push(o.matrix.clone());
      const base = new THREE.Matrix4().makeRotationY(p.yaw), top = new THREE.Vector3(1.15 * s, p.h, 0).applyMatrix4(base).add(new THREE.Vector3(p.x, supportHeight(p.x, p.z, 1.2) - 0.1, p.z));
      for (let i = 0; i < FR; i++) {
        const a = (i / FR) * Math.PI * 2 + r.range(-0.2, 0.2), droop = r.range(0.55, 1.05); e.set(-droop, a, 0, "YXZ"); q2.setFromEuler(e);
        o.position.copy(top); o.quaternion.copy(q2); const sc = s * r.range(0.85, 1.15); o.scale.set(sc, sc, sc); o.updateMatrix(); fronds.push(o.matrix.clone());
      }
    }
    const tufts = SCENERY.tufts.map((t) => { o.position.set(t.x, supportHeight(t.x, t.z, 1.2), t.z); o.rotation.set(0, r.range(0, 6.28), 0); o.scale.set(t.s * 1.0, t.s * 0.95, t.s * 1.0); o.updateMatrix(); return o.matrix.clone(); });
    const rocks = SCENERY.rocks.map((t) => { o.position.set(t.x, supportHeight(t.x, t.z, 1.2) + t.s * 0.2, t.z); o.rotation.set(r.range(0, 3), r.range(0, 3), 0); o.scale.set(t.s * 1.4, t.s * 0.8, t.s); o.updateMatrix(); return o.matrix.clone(); });
    const bushes = SCENERY.bushes.map((t) => { o.position.set(t.x, supportHeight(t.x, t.z, 1.2) + t.s * 0.4, t.z); o.rotation.set(0, 0, 0); o.scale.set(t.s * 1.2, t.s * 0.8, t.s); o.updateMatrix(); return o.matrix.clone(); });
    return { trunks, fronds, tufts, rocks, bushes };
  }, []);
  useEffect(() => {
    const set = (ref: React.RefObject<THREE.InstancedMesh | null>, a: THREE.Matrix4[]) => { const m = ref.current; if (!m) return; a.forEach((x, i) => m.setMatrixAt(i, x)); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); };
    set(trunkRef, m4.trunks); set(frondRef, m4.fronds); set(tuftRef, m4.tufts); set(rockRef, m4.rocks); set(bushRef, m4.bushes);
  }, [m4]);
  useEffect(() => { // bounded vegetation by tier: show only a stable prefix of the instances
    const n = SCENERY.palms.length; if (bushRef.current) bushRef.current.count = Math.ceil(m4.bushes.length * Math.max(0.4, q.tuftDensity)); if (trunkRef.current) trunkRef.current.count = Math.ceil(n * q.palmDensity); if (frondRef.current) frondRef.current.count = Math.ceil(n * q.palmDensity) * FR; if (tuftRef.current) tuftRef.current.count = Math.ceil(m4.tufts.length * q.tuftDensity);
  }, [q.palmDensity, q.tuftDensity, m4]);
  useFrame((s) => { time.current.value = q.foliageSway ? s.clock.elapsedTime : 0; });
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[geos.trunk, mats.trunk, m4.trunks.length]} castShadow={shadows} />
      <instancedMesh ref={frondRef} args={[geos.frond, mats.frond, m4.fronds.length]} castShadow={shadows} />
      <instancedMesh ref={tuftRef} args={[geos.tuft, mats.tuft, m4.tufts.length]} />
      <instancedMesh ref={rockRef} args={[geos.rock, mats.rock, m4.rocks.length]} castShadow={shadows} />
      <instancedMesh ref={bushRef} args={[geos.bush, mats.bush, m4.bushes.length]} castShadow={shadows} />
    </group>
  );
}
