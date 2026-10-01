"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { badgeTexture, markerTexture, moodBoardTexture } from "../textures";
import { buildHumanoid, disposeRig, poseHumanoid, type PoseParams, type Rig } from "./humanoid";
import { roleStyle } from "@/lib/world/schema";
import { clamp, damp } from "@/lib/world/math";

export interface AvatarHandle { group: THREE.Group; setPose(p: Partial<PoseParams> & { moving?: number }, dt: number): void; setBlob(altitude: number): void; badge: THREE.Sprite | null; marker: THREE.Sprite; ring: THREE.Mesh }

const blobTex = (() => { let t: THREE.Texture | null = null; return () => t ?? (t = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!, g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const tx = new THREE.CanvasTexture(c); return tx; })()); })();

interface Props { kind: "operator" | "agent"; agentId?: string; name?: string; simulated?: boolean }
/** One humanoid + blob shadow + overview marker (+ name/role badge for agents). Driven imperatively each frame by the game loop. */
export const Avatar = forwardRef<AvatarHandle, Props>(function Avatar({ kind, agentId = "", name = "", simulated = false }, ref) {
  const st = useMemo(() => roleStyle(agentId), [agentId]);
  const built = useMemo(() => {
    const spec = kind === "operator"
      ? { skin: "#e0b48f", hair: "#2a2118", top: "#1e2f4a", bottom: "#d9d4c7", shoes: "#f3f3f3", accent: "#60a5fa", hat: "none" as const, prop: "none" as const }
      : { skin: "#c98f68", hair: "#241a14", top: st.color, bottom: "#2c3340", shoes: "#e9e4da", accent: st.accent, hat: st.hat, prop: st.prop, propTexture: moodBoardTexture() };
    const rig: Rig = buildHumanoid(spec); rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    const group = new THREE.Group(); group.add(rig.root);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; blob.renderOrder = 2; group.add(blob);
    const ringCol = kind === "operator" ? "#60a5fa" : st.color;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 40), new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.renderOrder = 3; group.add(ring);
    const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(ringCol, kind === "operator" ? "▲" : st.glyph), transparent: true, depthTest: false, opacity: 0 })); mk.renderOrder = 10; mk.position.y = 3.2; group.add(mk);
    let badge: THREE.Sprite | null = null;
    if (kind === "agent") { badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(st.glyph, st.color, name, st.short, simulated), transparent: true, depthWrite: false })); badge.position.y = 2.45; badge.renderOrder = 9; group.add(badge); }
    return { rig, group, blob, ring, mk, badge };
  }, [kind, st, name, simulated]);
  const anim = useRef({ walk: 0, run: 0, work: 0, look: 0, fly: 0, phase: 0, t: Math.random() * 10, bank: 0 });
  useImperativeHandle(ref, () => ({
    group: built.group, badge: built.badge, marker: built.mk, ring: built.ring,
    setPose(p, dt) {
      const a = anim.current; a.t += dt; const moving = p.moving ?? 0;
      a.walk = damp(a.walk, p.walk ?? 0, 9, dt); a.run = damp(a.run, p.run ?? 0, 7, dt); a.work = damp(a.work, p.work ?? 0, 4.5, dt); a.look = damp(a.look, p.look ?? 0, 5, dt); a.fly = damp(a.fly, p.fly ?? 0, 4, dt); a.bank = damp(a.bank, p.bank ?? 0, 6, dt);
      a.phase += dt * (3.2 + moving * 1.15 + a.run * 3.0) * (a.walk > 0.05 ? 1 : 0);
      poseHumanoid(built.rig, { phase: a.phase, walk: a.walk, run: a.run, work: a.work, look: a.look, fly: a.fly, bank: a.bank, t: a.t });
    },
    setBlob(alt) { const k = clamp(1 - alt / 40, 0, 1); (built.blob.material as THREE.MeshBasicMaterial).opacity = k; built.blob.scale.setScalar(1 + alt * 0.06); },
  }), [built]);
  useEffect(() => () => { disposeRig(built.rig); }, [built]);
  return <primitive object={built.group} />;
});
