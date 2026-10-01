// A small procedural humanoid rig (stylised, smooth capsules) shared by the operator and the agent. Faces +z. Pure three.js, no React.
import * as THREE from "three";

export type PropKind = "tablet" | "clipboard" | "headset" | "loupe" | "folder" | "tablet-grid" | "none";
export interface HumanoidSpec { skin: string; hair: string; top: string; bottom: string; shoes: string; accent: string; hat: "beret" | "cap" | "visor" | "none"; prop: PropKind; propTexture?: THREE.Texture | null; tall?: number }
export interface Rig {
  root: THREE.Group; hips: THREE.Group; torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; foreL: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; shinL: THREE.Group; shinR: THREE.Group; prop: THREE.Group | null; disposables: (THREE.BufferGeometry | THREE.Material)[];
}
export interface PoseParams { phase: number; walk: number; run: number; work: number; look: number; fly: number; bank: number; t: number }

const std = (color: string, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export function buildHumanoid(spec: HumanoidSpec): Rig {
  const d: Rig["disposables"] = [], mat = (c: string, r = 0.7, m = 0) => { const x = std(c, r, m); d.push(x); return x; }, geo = <G extends THREE.BufferGeometry>(g: G) => { d.push(g); return g; };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; return o; };
  const root = new THREE.Group(), k = spec.tall ?? 1, hips = new THREE.Group(); hips.position.y = 0.95 * k; root.add(hips);
  const skin = mat(spec.skin, 0.62), top = mat(spec.top, 0.78), bottom = mat(spec.bottom, 0.8), shoe = mat(spec.shoes, 0.55), accent = mat(spec.accent, 0.6);
  // torso + head
  const torso = new THREE.Group(); hips.add(torso);
  const chest = mesh(geo(new THREE.CapsuleGeometry(0.19, 0.34, 6, 14)), top); chest.scale.set(1.12, 1, 0.74); chest.position.y = 0.3; torso.add(chest);
  const hip = mesh(geo(new THREE.CapsuleGeometry(0.17, 0.08, 4, 12)), bottom); hip.scale.set(1.1, 1, 0.8); hip.position.y = 0.02; hips.add(hip);
  const scarf = mesh(geo(new THREE.TorusGeometry(0.15, 0.04, 8, 18)), accent); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.58; scarf.scale.set(1.15, 1, 0.9); torso.add(scarf);
  const head = new THREE.Group(); head.position.y = 0.7; torso.add(head);
  const skull = mesh(geo(new THREE.SphereGeometry(0.125, 20, 16)), skin); skull.position.set(0, 0.14, 0); head.add(skull);
  const hair = mesh(geo(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)), mat(spec.hair, 0.5)); hair.position.set(0, 0.155, -0.012); hair.rotation.x = -0.25; head.add(hair);
  const neck = mesh(geo(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10)), skin); neck.position.y = 0.02; head.add(neck);
  const eyeM = mat("#1b1f2a", 0.3); for (const sx of [-0.045, 0.045]) { const e = mesh(geo(new THREE.SphereGeometry(0.014, 8, 8)), eyeM, false); e.position.set(sx, 0.15, 0.115); head.add(e); }
  if (spec.hat === "beret") { const b = mesh(geo(new THREE.CylinderGeometry(0.16, 0.14, 0.05, 20)), accent); b.position.set(0.03, 0.27, 0); b.rotation.z = -0.22; head.add(b); const nub = mesh(geo(new THREE.SphereGeometry(0.018, 8, 8)), accent); nub.position.set(0.03, 0.31, 0); head.add(nub); }
  if (spec.hat === "cap") { const c1 = mesh(geo(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), accent); c1.position.y = 0.19; head.add(c1); const br = mesh(geo(new THREE.BoxGeometry(0.15, 0.015, 0.1)), accent); br.position.set(0, 0.2, 0.15); head.add(br); }
  if (spec.hat === "visor") { const br = mesh(geo(new THREE.BoxGeometry(0.26, 0.012, 0.12)), accent); br.position.set(0, 0.235, 0.09); head.add(br); const band = mesh(geo(new THREE.TorusGeometry(0.13, 0.012, 6, 18)), accent); band.rotation.x = Math.PI / 2; band.position.y = 0.235; head.add(band); }
  // arms / legs (pivot groups: rotation.x < 0 swings FORWARD)
  const limb = (x: number, y: number, len: number, r: number, m: THREE.Material, handM?: THREE.Material) => {
    const g = new THREE.Group(); g.position.set(x, y, 0);
    const up = mesh(geo(new THREE.CapsuleGeometry(r, len, 4, 10)), m); up.position.y = -len / 2 - r * 0.4; g.add(up);
    const fore = new THREE.Group(); fore.position.y = -len - r * 0.6; g.add(fore);
    const lo = mesh(geo(new THREE.CapsuleGeometry(r * 0.88, len, 4, 10)), handM ?? m); lo.position.y = -len / 2 - r * 0.3; fore.add(lo);
    return { g, fore };
  };
  const aL = limb(-0.255 * k, 0.56, 0.24, 0.05, top, skin), aR = limb(0.255 * k, 0.56, 0.24, 0.05, top, skin);
  torso.add(aL.g, aR.g);
  const lL = limb(-0.1, 0.0, 0.4, 0.075, bottom), lR = limb(0.1, 0.0, 0.4, 0.075, bottom);
  for (const l of [lL, lR]) { const foot = mesh(geo(new THREE.BoxGeometry(0.11, 0.07, 0.25)), shoe); foot.position.set(0, -0.44, 0.05); l.fore.add(foot); }
  hips.add(lL.g, lR.g);
  // prop (carried in the LEFT hand)
  let prop: THREE.Group | null = null;
  if (spec.prop !== "none") {
    prop = new THREE.Group(); prop.position.set(0, -0.3, 0.02); aL.fore.add(prop);
    const frame = mat("#1f2937", 0.4, 0.3);
    if (spec.prop === "tablet" || spec.prop === "tablet-grid") {
      const body = mesh(geo(new THREE.BoxGeometry(0.3, 0.22, 0.018)), frame); prop.add(body);
      const sm = new THREE.MeshStandardMaterial({ color: "#ffffff", map: spec.propTexture ?? null, emissive: "#ffffff", emissiveMap: spec.propTexture ?? null, emissiveIntensity: 0.55, roughness: 0.4 }); d.push(sm);
      const screen = mesh(geo(new THREE.PlaneGeometry(0.27, 0.19)), sm, false); screen.position.z = 0.0105; prop.add(screen);
    } else if (spec.prop === "clipboard") { prop.add(mesh(geo(new THREE.BoxGeometry(0.22, 0.3, 0.015)), mat("#7c5a3a", 0.8))); const paper = mesh(geo(new THREE.PlaneGeometry(0.19, 0.26)), mat("#f8fafc", 0.9), false); paper.position.z = 0.009; prop.add(paper); }
    else if (spec.prop === "loupe") { const ring = mesh(geo(new THREE.TorusGeometry(0.07, 0.012, 8, 18)), mat("#d4a017", 0.3, 0.6)); ring.position.y = 0.08; prop.add(ring); const h = mesh(geo(new THREE.CylinderGeometry(0.01, 0.012, 0.14, 8)), mat("#8b5a2b", 0.6)); h.position.y = -0.04; prop.add(h); }
    else if (spec.prop === "folder") prop.add(mesh(geo(new THREE.BoxGeometry(0.24, 0.3, 0.03)), accent));
    else if (spec.prop === "headset") { const band = mesh(geo(new THREE.TorusGeometry(0.15, 0.012, 6, 18, Math.PI)), frame); band.position.set(0, 0.34, 0); head.add(band); prop = null; }
  }
  return { root, hips, torso, head, armL: aL.g, armR: aR.g, foreL: aL.fore, foreR: aR.fore, legL: lL.g, legR: lR.g, shinL: lL.fore, shinR: lR.fore, prop, disposables: d };
}

/** Procedural animation. All inputs are smoothed weights, so state changes blend instead of popping. */
export function poseHumanoid(r: Rig, p: PoseParams) {
  const { phase: ph, walk, run, work, look, fly, bank, t } = p, sw = Math.sin(ph), amp = walk * (0.62 + run * 0.35), idle = 1 - Math.max(walk, work, fly);
  r.hips.position.y = 0.95 + Math.abs(Math.sin(ph)) * 0.035 * walk * (1 + run) - fly * 0.0 + Math.sin(t * 1.6) * 0.004 * idle - (0.04 * work);
  r.hips.rotation.y = sw * 0.12 * walk;
  // legs
  const legSwing = sw * amp * 0.85, back = Math.max(0, Math.sin(ph + 0.9)), back2 = Math.max(0, Math.sin(ph + Math.PI + 0.9));
  r.legL.rotation.x = -legSwing * (1 - fly) + fly * 0.45; r.legR.rotation.x = legSwing * (1 - fly) + fly * 0.65;
  r.shinL.rotation.x = back * 0.95 * walk * (1 - fly) + fly * 0.3 + work * 0.0; r.shinR.rotation.x = back2 * 0.95 * walk * (1 - fly) + fly * 0.4;
  r.legL.rotation.z = r.legR.rotation.z = 0;
  // torso: lean forward when running / flying; breathe when idle; settle when working
  r.torso.rotation.x = 0.04 + run * 0.14 + fly * 0.75 + work * 0.14 + Math.sin(t * 1.6) * 0.012 * idle; r.torso.rotation.z = bank * 0.6; r.torso.rotation.y = -sw * 0.1 * walk;
  r.root.rotation.x = fly * 0.62; r.root.position.y = fly * 0.45; r.root.position.z = fly * 0.12; // superhero-style prone glide while flying
  // arms
  const armSwing = -sw * amp * 0.75;
  const idleL = Math.sin(t * 1.1) * 0.03, idleR = Math.sin(t * 1.1 + 1.2) * 0.03;
  r.armL.rotation.x = armSwing * (1 - work) * (1 - fly) + work * -0.95 + fly * 0.9 + idleL; r.armR.rotation.x = -armSwing * (1 - work) * (1 - fly) + work * (-1.15 + Math.sin(t * 7.0) * 0.06) + fly * 0.9 + idleR;
  r.armL.rotation.z = -0.07 - fly * 0.35; r.armR.rotation.z = 0.07 + fly * 0.35;
  r.foreL.rotation.x = -0.25 - amp * 0.4 * Math.max(0, -armSwing) - work * 0.85 - fly * 0.25; r.foreR.rotation.x = -0.25 - amp * 0.4 * Math.max(0, armSwing) - work * (0.85 + Math.sin(t * 9) * 0.1) - fly * 0.25;
  if (r.prop) { r.prop.rotation.x = -0.2 - work * 0.9; r.prop.rotation.z = 0.15; r.prop.position.set(0.02, -0.3 + work * 0.12, 0.05 + work * 0.06); }
  // head: gentle idle glances; a clear look-around on request; looks down when working
  r.head.rotation.y = Math.sin(t * 0.55) * 0.12 * idle + Math.sin(t * 2.3) * look * 0.7 - sw * 0.04 * walk;
  r.head.rotation.x = work * 0.4 - fly * 0.5 + Math.sin(t * 0.8) * 0.03 * idle;
  r.head.rotation.z = bank * -0.2;
}
export function disposeRig(r: Rig) { for (const d of r.disposables) d.dispose(); }
