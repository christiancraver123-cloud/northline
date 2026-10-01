"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE, SUN_DIR, useQuality } from "./context";

const VERT = /* glsl */ `
uniform float uTime; uniform float uDetail;
varying vec3 vWorld; varying vec3 vN;
#include <fog_pars_vertex>
float shoreZ(float x){ return 30.5 + 2.2*sin(x*.06+.7) + 1.1*sin(x*.17); }
vec3 waves(vec2 p, float calm, out vec2 grad){
  vec2 d1 = normalize(vec2(1.,.35)), d2 = normalize(vec2(-.6,1.)), d3 = normalize(vec2(.3,-.9));
  float a1 = .20*calm, a2 = .11*calm, a3 = .05*calm;
  float p1 = dot(p,d1)*.085 + uTime*1.0, p2 = dot(p,d2)*.16 + uTime*1.5, p3 = dot(p,d3)*.30 + uTime*2.1;
  grad = d1*cos(p1)*a1*.085 + d2*cos(p2)*a2*.16 + d3*cos(p3)*a3*.30;
  return vec3(sin(p1)*a1 + sin(p2)*a2 + sin(p3)*a3, 0., 0.);
}
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  float calm = smoothstep(-3., 10., wp.z - shoreZ(wp.x)); // waves flatten into the shallows
  vec2 g; wp.y += waves(wp.xz, calm, g).x;
  vN = normalize(vec3(-g.x, 1., -g.y)); vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */ `
uniform float uTime; uniform float uDetail; uniform vec3 uSun; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunCol;
varying vec3 vWorld; varying vec3 vN;
#include <common>
#include <fog_pars_fragment>
float shoreZ(float x){ return 30.5 + 2.2*sin(x*.06+.7) + 1.1*sin(x*.17); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec3 V = normalize(cameraPosition - vWorld); vec3 N = vN;
  if (uDetail > .5) { // fine ripples (MEDIUM/HIGH)
    vec2 q = vWorld.xz*.55; float e = .02;
    float a = vn(q + vec2(uTime*.35, uTime*.2)), b = vn(q*1.9 - vec2(uTime*.25, -uTime*.3));
    float ax = vn(q + vec2(e,0.) + vec2(uTime*.35, uTime*.2)) - a, az = vn(q + vec2(0.,e) + vec2(uTime*.35, uTime*.2)) - a;
    N = normalize(N + vec3(-ax, 0., -az) * (uDetail > 1.5 ? 1.6 : 1.0) + (b-.5)*vec3(.05,0.,.05));
  }
  float d = vWorld.z - shoreZ(vWorld.x);                 // metres seaward of the waterline
  float depth = clamp(d / 24., 0., 1.);
  vec3 base = mix(uShallow, uDeep, smoothstep(0., 1., pow(depth, .55)));
  base = mix(vec3(.80,.82,.66), base, smoothstep(-1.5, 3.2, d));
  float fres = pow(1. - max(dot(N, V), 0.), 4.) * .82 + .04;
  vec3 col = mix(base, uSky, fres);
  vec3 R = reflect(-uSun, N); float spec = pow(max(dot(R, V), 0.), uDetail > .5 ? 220. : 90.);
  col += uSunCol * spec * (uDetail > 1.5 ? 2.4 : 1.5);
  // foam: wash line + breaking crest
  float t = uTime;
  float edge = d - (1.4 + 1.2*sin(t*.8 + vWorld.x*.11) + .5*sin(t*1.7 + vWorld.x*.33));
  float foam = smoothstep(1.1, 0., abs(edge)) * (.55 + .45*vn(vWorld.xz*.9 + t*.4));
  foam += smoothstep(1.6, 0., d + .4) * .65; // thin wash in the swash zone
  foam *= smoothstep(-1.2, .2, d);
  col = mix(col, vec3(1.), clamp(foam, 0., .92));
  float alpha = mix(.46, .97, smoothstep(-.6, 6., d)); alpha = mix(alpha, 1., clamp(foam, 0., 1.));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function Ocean() {
  const q = useQuality(), mat = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(1500, 900, q.waterSegments, Math.max(24, Math.round(q.waterSegments * 0.55))); g.rotateX(-Math.PI / 2); return g; }, [q.waterSegments]);
  const uniforms = useMemo(() => THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uDetail: { value: q.waterDetail }, uSun: { value: new THREE.Vector3(...SUN_DIR) }, uSunCol: { value: new THREE.Color(PALETTE.sun) },
    uDeep: { value: new THREE.Color("#0b5d7a") }, uShallow: { value: new THREE.Color("#35bfc0") }, uSky: { value: new THREE.Color("#a9cfe8") },
  }]), []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((s) => { const m = mat.current; if (!m) return; m.uniforms.uTime.value = s.clock.elapsedTime; m.uniforms.uDetail.value = q.waterDetail; });
  return (
    <mesh geometry={geo} position={[0, 0, 340]} renderOrder={1} frustumCulled={false}>
      <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={VERT} fragmentShader={FRAG} transparent fog depthWrite={false} />
    </mesh>
  );
}
