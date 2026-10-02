"use client";
// Renders the whole town plan (src/lib/world/town.ts) as a handful of merged, vertex-coloured meshes (per render group × material) + one sign-atlas mesh.
import { useMemo, type MutableRefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SIGNS, TOWN } from "@/lib/world/layout";
import type { Piece, SignPiece } from "@/lib/world/kit";

export type GroupMeshes = Map<string, THREE.Mesh[]>;
const tmp = new THREE.Color();

function gableGeometry(lx: number, h: number, lz: number) {
  const x = lx / 2, z = lz / 2, y0 = -h / 2, y1 = h / 2, v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
  tri([-x, y0, z], [x, y0, z], [x, y1, 0]); tri([-x, y0, z], [x, y1, 0], [-x, y1, 0]);          // south slope
  tri([x, y0, -z], [-x, y0, -z], [-x, y1, 0]); tri([x, y0, -z], [-x, y1, 0], [x, y1, 0]);        // north slope
  tri([x, y0, z], [x, y0, -z], [x, y1, 0]); tri([-x, y0, -z], [-x, y0, z], [-x, y1, 0]);          // gable ends
  tri([-x, y0, z], [-x, y0, -z], [x, y0, -z]); tri([-x, y0, z], [x, y0, -z], [x, y0, z]);         // underside
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}
function pieceGeometry(p: Piece): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (p.shape === "box") g = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
  else if (p.shape === "cyl") g = new THREE.CylinderGeometry(p.sx / 2, p.sx / 2, p.sy, p.sx > 1.2 ? 20 : 10);
  else if (p.shape === "sphere") g = new THREE.SphereGeometry(p.sx / 2, 14, 10);
  else if (p.shape === "cone") g = new THREE.ConeGeometry(p.sx / 2, p.sy, 16);
  else { const ridgeZ = Math.abs(Math.sin(p.rotY)) > 0.5; g = gableGeometry(ridgeZ ? p.sz : p.sx, p.sy, ridgeZ ? p.sx : p.sz); }
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute("uv");
  if (p.rotY) g.rotateY(p.rotY); g.translate(p.x, p.y, p.z);
  tmp.set(p.color); const n = g.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return g;
}

const SIGN_STYLES: Record<SignPiece["style"], [string, string, string]> = { dark: ["#0f172a", "#f8fafc", "#60a5fa"], light: ["#fff7f2", "#1f2937", "#2a8f94"], teal: ["#0f3d44", "#e6fffb", "#5eead4"], wood: ["#7d5f43", "#fff4e0", "#d9a441"] };
function signAtlas(signs: SignPiece[]) {
  const cols = 2, rows = Math.max(1, Math.ceil(signs.length / cols)), W = 1024, H = rows * 128, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  signs.forEach((s, i) => {
    const x = (i % cols) * 512, y = Math.floor(i / cols) * 128, [bg, fg, ac] = SIGN_STYLES[s.style];
    c.fillStyle = bg; c.fillRect(x, y, 512, 128); c.fillStyle = ac; c.fillRect(x, y + 118, 512, 10);
    c.fillStyle = fg; c.textAlign = "center"; c.textBaseline = "middle"; const big = s.sub ? 56 : 64; c.font = `700 ${big}px 'Helvetica Neue', Arial, sans-serif`; c.fillText(s.text, x + 256, y + (s.sub ? 48 : 60), 480);
    if (s.sub) { c.font = "500 26px 'Helvetica Neue', Arial, sans-serif"; c.fillStyle = ac; c.fillText(s.sub, x + 256, y + 98, 480); }
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { t, cols, rows };
}

export function TownMesh({ shadows, groups }: { shadows: boolean; groups: MutableRefObject<GroupMeshes> }) {
  const built = useMemo(() => {
    const mats = {
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      water: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88 }),
    };
    const buckets = new Map<string, { g: THREE.BufferGeometry[]; group: string; mat: Piece["mat"] }>();
    for (const p of TOWN.kit.pieces) { const k = `${p.group}|${p.mat}`; (buckets.get(k) ?? buckets.set(k, { g: [], group: p.group, mat: p.mat }).get(k)!).g.push(pieceGeometry(p)); }
    const meshes: THREE.Mesh[] = [], byGroup: GroupMeshes = new Map();
    for (const [, b] of buckets) {
      const geo = mergeGeometries(b.g)!; b.g.forEach((x) => x.dispose());
      const m = new THREE.Mesh(geo, mats[b.mat]); m.userData.group = b.group; m.userData.mat = b.mat; m.frustumCulled = true; m.renderOrder = b.mat === "glass" ? 5 : 0; meshes.push(m); (byGroup.get(b.group) ?? byGroup.set(b.group, []).get(b.group)!).push(m);
    }
    // sign atlas: every sign is a textured quad in ONE draw call
    const { t, cols, rows } = signAtlas(SIGNS), quads: THREE.BufferGeometry[] = [];
    SIGNS.forEach((s, i) => { const g = new THREE.PlaneGeometry(s.w, s.h), uv = g.attributes.uv, cx = i % cols, cy = Math.floor(i / cols); for (let j = 0; j < uv.count; j++) uv.setXY(j, (cx + uv.getX(j)) / cols, 1 - (cy + 1 - uv.getY(j)) / rows); g.rotateY(s.rotY); g.translate(s.x, s.y, s.z); quads.push(g); });
    const signMesh = quads.length ? new THREE.Mesh(mergeGeometries(quads)!, new THREE.MeshBasicMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })) : null;
    if (signMesh) { signMesh.userData.group = "signs"; byGroup.set("signs", [signMesh]); }
    return { meshes, signMesh, byGroup };
  }, []);
  groups.current = built.byGroup;
  return (
    <group>
      {built.meshes.map((m, i) => { m.castShadow = shadows && m.userData.mat === "solid" && m.userData.group !== "hq-int"; m.receiveShadow = m.userData.mat === "solid" || m.userData.mat === "water"; return <primitive key={i} object={m} />; })}
      {built.signMesh && <primitive object={built.signMesh} />}
    </group>
  );
}
