"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildHumanoid, disposeRig, poseHumanoid, type HumanoidSpec } from "./humanoid";
import { roleStyle } from "@/lib/world/schema";
import { damp } from "@/lib/world/math";

export interface AvatarPose { walk?: number; run?: number; work?: number; look?: number; fly?: number; sit?: number; talk?: number; bank?: number; moving?: number; jump?: number }
export interface AvatarHandle { group: THREE.Group; setPose(p: AvatarPose, dt: number): void; setRigVisible(v: boolean): void; setCastShadow(v: boolean): void; readonly rigVisible: boolean }
interface Props { kind: "operator" | "agent"; agentId?: string }

/** One humanoid driven imperatively each frame by the game loop. Far avatars hide the rig (`setRigVisible(false)`); a shared proxy draws them instead. */
export const Avatar = forwardRef<AvatarHandle, Props>(function Avatar({ kind, agentId = "" }, ref) {
  const built = useMemo(() => {
    const st = roleStyle(agentId);
    const spec: HumanoidSpec = kind === "operator"
      ? { skin: "#e0b48f", hair: "#2a2118", top: "#1e2f4a", bottom: "#d9d4c7", shoes: "#f3f3f3", accent: "#60a5fa", hat: "none", prop: "none" }
      : { skin: st.skin, hair: st.hair, top: st.color, bottom: st.bottom, shoes: "#e9e4da", accent: st.accent, hat: st.hat, prop: st.prop, hairStyle: st.hairStyle, outfit: st.outfit, acc: st.acc, build: st.build };
    const rig = buildHumanoid(spec), group = new THREE.Group(); group.add(rig.root); return { rig, group };
  }, [kind, agentId]);
  const a = useRef({ walk: 0, run: 0, work: 0, look: 0, fly: 0, jump: 0, sit: 0, talk: 0, bank: 0, phase: 0, t: (agentId.length * 1.3) % 10, vis: true, shadow: true });
  useImperativeHandle(ref, () => ({
    group: built.group, get rigVisible() { return a.current.vis; },
    setRigVisible(v: boolean) { a.current.vis = v; built.rig.root.visible = v; },
    setCastShadow(v: boolean) { if (a.current.shadow === v) return; a.current.shadow = v; built.rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.shadowCaster !== false) m.castShadow = v; }); },
    setPose(p, dt) {
      const s = a.current; if (!s.vis) return; s.t += dt;
      s.walk = damp(s.walk, p.walk ?? 0, 9, dt); s.run = damp(s.run, p.run ?? 0, 7, dt); s.work = damp(s.work, p.work ?? 0, 4.5, dt); s.look = damp(s.look, p.look ?? 0, 5, dt); s.fly = damp(s.fly, p.fly ?? 0, 4, dt); s.sit = damp(s.sit, p.sit ?? 0, 4, dt); s.talk = damp(s.talk, p.talk ?? 0, 5, dt); s.bank = damp(s.bank, p.bank ?? 0, 6, dt); s.jump = damp(s.jump, p.jump ?? 0, 14, dt);
      s.phase += dt * (3.2 + (p.moving ?? 0) * 1.15 + s.run * 3.0) * (s.walk > 0.05 ? 1 : 0);
      poseHumanoid(built.rig, { phase: s.phase, walk: s.walk, run: s.run, work: s.work, look: s.look, fly: s.fly, sit: s.sit, talk: s.talk, bank: s.bank, t: s.t, jump: s.jump });
    },
  }), [built]);
  useEffect(() => () => disposeRig(built.rig), [built]);
  return <primitive object={built.group} />;
});
