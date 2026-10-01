"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cloudTexture } from "../textures";
import { PALETTE, SUN_DIR, useQuality } from "./context";

const VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`;
const FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunCol; varying vec3 vDir;
void main(){
  float h = clamp(vDir.y, -.1, 1.);
  vec3 col = mix(uHorizon, uMid, smoothstep(0., .22, h)); col = mix(col, uTop, smoothstep(.2, .85, h));
  float s = max(dot(normalize(vDir), uSun), 0.);
  col += uSunCol * (pow(s, 600.)*3. + pow(s, 24.)*.35 + pow(s, 5.)*.16);          // disc + glow + warm wash
  col = mix(col, uHorizon, smoothstep(.06, -.04, vDir.y) * .9);                     // haze below the horizon line
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function Sky() {
  const q = useQuality(), dome = useRef<THREE.Mesh>(null), clouds = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => ({ uTop: { value: new THREE.Color(PALETTE.skyTop) }, uMid: { value: new THREE.Color(PALETTE.skyMid) }, uHorizon: { value: new THREE.Color(PALETTE.horizon) }, uSun: { value: new THREE.Vector3(...SUN_DIR) }, uSunCol: { value: new THREE.Color(PALETTE.sun) } }), []);
  const tex = useMemo(() => cloudTexture(), []), mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9, color: "#fff6ea" }), [tex]);
  const spots = useMemo(() => Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2 + 0.4; return { x: Math.sin(a) * 520, z: Math.cos(a) * 520, y: 150 + (i % 4) * 28, s: 220 + (i % 5) * 40 }; }), []);
  useFrame((s, dt) => {
    if (dome.current) dome.current.position.copy(s.camera.position);
    if (clouds.current) { clouds.current.position.set(s.camera.position.x * 0.9, 0, s.camera.position.z * 0.9); if (q.clouds) clouds.current.rotation.y += dt * 0.0035; }
  });
  return (
    <>
      <mesh ref={dome} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[900, 32, 16]} /><shaderMaterial uniforms={uniforms} vertexShader={VERT} fragmentShader={FRAG} side={THREE.BackSide} depthWrite={false} fog={false} /></mesh>
      <group ref={clouds}>{spots.slice(0, q.clouds).map((c, i) => <sprite key={i} material={mat} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.42, 1]} />)}</group>
    </>
  );
}
