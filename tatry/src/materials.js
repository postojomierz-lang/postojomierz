import * as THREE from 'three';

// Shared lighting uniforms, updated by the time-of-day / weather code.
export const light = {
  sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  sunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  ambCol: { value: new THREE.Color(0.35, 0.4, 0.5) },
  time: { value: 0 },
};

const NOISE = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y);
}
float fbm2(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=0.5; } return s; }
// cellular noise: x = distance to the cell border, y = cell id
vec2 vor(vec2 p){
  vec2 i=floor(p), f=fract(p); float d1=8.0, d2=8.0, id=0.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(x,y); vec2 o=vec2(h21(i+g), h21(i+g+13.7)); vec2 r=g+o-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=h21(i+g+7.1); } else if(d<d2) d2=d;
  }
  return vec2(sqrt(d2)-sqrt(d1), id);
}
`;

// ---------------------------------------------------------------- terrain lighting helpers
// Heights of the whole area as textures, so shaders can ray-march mountain shadows toward the sun
// and darken hollows (cheap ambient occlusion). `env` holds the shared uniforms.
export function makeEnv({ inner, outer, quality }) {
  const tex = (g) => {
    const d = new Uint16Array(g.w * g.h);
    for (let i = 0; i < d.length; i++) d[i] = THREE.DataUtils.toHalfFloat(g.data[i] - 1000);
    const t = new THREE.DataTexture(d, g.w, g.h, THREE.RedFormat, THREE.HalfFloatType);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  };
  return {
    hInner: { value: tex(inner) }, hOuter: { value: tex(outer) },
    bInner: { value: new THREE.Vector4(inner.x0, inner.z0, inner.x1, inner.z1) },
    bOuter: { value: new THREE.Vector4(outer.x0, outer.z0, outer.x1, outer.z1) },
    nInner: { value: new THREE.Vector2(inner.w, inner.h) },
    nOuter: { value: new THREE.Vector2(outer.w, outer.h) },
    sunDir: light.sunDir, time: light.time,
    shSteps: { value: quality === 'low' ? 14 : 28 },
  };
}

const HEIGHTS = /* glsl */`
uniform sampler2D hInner; uniform sampler2D hOuter;
uniform vec4 bInner; uniform vec4 bOuter; uniform vec2 nInner; uniform vec2 nOuter;
uniform vec3 sunDir; uniform float time; uniform int shSteps;
vec2 gridUV(vec2 p, vec4 b, vec2 n){ vec2 f=(p-b.xy)/(b.zw-b.xy); return (f*(n-1.0)+0.5)/n; }
float hAt(vec2 p){
  vec2 f=(p-bInner.xy)/(bInner.zw-bInner.xy);
  if (f.x>0.01 && f.y>0.01 && f.x<0.99 && f.y<0.99) return texture(hInner, gridUV(p,bInner,nInner)).r+1000.0;
  return texture(hOuter, gridUV(p,bOuter,nOuter)).r+1000.0;
}
// soft shadow cast by the terrain itself (ridges, peaks), up to ~12 km away
float terrainShadow(vec3 wp){
  vec3 L = sunDir;
  if (L.y <= -0.02) return 0.0;
  float t = 25.0, sh = 1.0;
  float grow = shSteps > 20 ? 1.28 : 1.62;
  for (int i=0; i<40; i++){
    if (i >= shSteps) break;
    vec3 q = wp + L*t;
    float h = hAt(q.xz);
    sh = min(sh, clamp((q.y + 10.0 - h) / (t*0.035) + 0.5, 0.0, 1.0));
    if (sh <= 0.0 || t > 12000.0) break;
    t *= grow;
  }
  return sh;
}
float terrainAO(vec3 wp){
  vec2 p = wp.xz;
  float s1 = (hAt(p+vec2(45,0))+hAt(p-vec2(45,0))+hAt(p+vec2(0,45))+hAt(p-vec2(0,45)))*0.25;
  float s2 = (hAt(p+vec2(160,160))+hAt(p-vec2(160,160))+hAt(p+vec2(160,-160))+hAt(p-vec2(160,-160)))*0.25;
  float c = (s1 - wp.y)*0.012 + (s2 - wp.y)*0.0018;
  return clamp(1.0 - c, 0.72, 1.1);
}
`;

// Adds terrain shadow (and optionally wind sway) to a built-in material, e.g. trees and rocks.
export function patchShading(material, env, { wind = 0, perVertexShadow = true } = {}) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, env);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HEIGHTS + '\nvarying float vTerrSh;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 ip = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix * ip;
          #endif
          float phase = time * 1.3 + ip.x * 0.05 + ip.z * 0.07;
          float amt = ${wind.toFixed(3)} * position.y * position.y * 0.02;
          transformed.x += sin(phase) * amt + sin(phase * 2.7) * amt * 0.3;
          transformed.z += cos(phase * 0.8) * amt;
        }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 wpS = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wpS = instanceMatrix * wpS;
          #endif
          wpS = modelMatrix * wpS;
          vTerrSh = ${perVertexShadow ? 'terrainShadow(wpS.xyz)' : '1.0'};
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTerrSh;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directDiffuse *= vTerrSh;');
  };
  material.customProgramCacheKey = () => 'patched' + wind + perVertexShadow;
}

// Satellite-textured terrain with close-range procedural detail (rock grain, grass, trail),
// lit by the scene lights (so it receives tree and rock shadows) plus terrain shadow and AO.
export function terrainMaterial({ map, trailMap, bounds, detail, env, aoStrength = 1 }) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const u = {
    satMap: { value: map }, trailMap: { value: trailMap },
    bounds: { value: new THREE.Vector4(...bounds) }, detail: { value: detail ? 1 : 0 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, env, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorld; varying vec3 vWN;
        uniform sampler2D satMap; uniform sampler2D trailMap; uniform vec4 bounds; uniform float detail;
        ${NOISE}
        ${HEIGHTS}`)
      .replace('#include <map_fragment>', `{
        vec2 uv = (vWorld.xz - bounds.xy) / (bounds.zw - bounds.xy);
        vec3 sat = texture2D(satMap, uv).rgb;
        // lift the baked-in satellite shadows a bit, real-time light adds relief back
        sat = sat * 1.55 + 0.01;
        vec3 N = normalize(vWN);
        float slope = 1.0 - N.y;
        float dist = length(cameraPosition - vWorld);
        vec3 col = sat;
        if (detail > 0.5) {
          float near = 1.0 - smoothstep(60.0, 700.0, dist);
          float mid = 1.0 - smoothstep(1500.0, 6000.0, dist);
          vec3 satBlur = textureLod(satMap, uv, 1.5).rgb * 1.55 + 0.01;
          float green = clamp((satBlur.g - max(satBlur.r, satBlur.b)) * 14.0, 0.0, 1.0);
          // triplanar noise so cliffs are not smeared by the top-down photo
          vec3 an = pow(abs(N), vec3(3.0)); an /= (an.x + an.y + an.z);
          vec3 w = vWorld;
          float t1 = fbm2(w.zy * 0.22) * an.x + fbm2(w.xz * 0.22) * an.y + fbm2(w.xy * 0.22) * an.z;
          float t2 = vnoise(w.zy * 1.6) * an.x + vnoise(w.xz * 1.6) * an.y + vnoise(w.xy * 1.6) * an.z;
          float t3 = vnoise(w.zy * 6.0) * an.x + vnoise(w.xz * 6.0) * an.y + vnoise(w.xy * 6.0) * an.z;
          float strata = 0.88 + 0.12 * sin(w.y * 0.7 + t1 * 9.0);
          float glum = dot(satBlur, vec3(0.3, 0.45, 0.25));
          // granite: satellite brightness, grey hue, cracks and lichen
          vec3 rock = vec3(glum) * vec3(1.02, 1.0, 0.95) * (0.55 + 0.9 * t1) * (0.82 + 0.36 * t2) * strata;
          rock = mix(rock, rock * vec3(0.85, 0.95, 0.7), smoothstep(0.6, 0.72, t2) * 0.6);
          rock *= 1.0 - 0.35 * smoothstep(0.52, 0.56, t3) * near;
          float steep = smoothstep(0.32, 0.7, slope) * (1.0 - green * 0.6);
          col = mix(sat, rock, steep * mid);
          // close range: stones and gravel on rocky ground, grass texture on green ground
          float n1 = fbm2(w.xz * 0.9), n3 = vnoise(w.xz * 5.0);
          float close = 1.0 - smoothstep(15.0, 220.0, dist);
          // planar coordinates that follow the slope, so stones are not stretched on steep ground
          vec2 hz = normalize(vec2(N.z, -N.x) + 1e-4);
          vec2 sp = mix(vec2(dot(w.xz, hz), w.y), w.xz, smoothstep(0.55, 0.85, N.y));
          vec2 st = vor(sp * 0.7 + vec2(t1, t2) * 1.4);
          vec2 gr = vor(sp * 4.0 + t1);
          float stones = (0.84 + 0.3 * st.y) * mix(0.93, 1.0, smoothstep(0.0, 0.1, st.x + 0.08 * n3));
          float gravel = (0.86 + 0.28 * gr.y) * mix(0.82, 1.0, smoothstep(0.0, 0.15, gr.x));
          vec3 rockyGround = mix(col, vec3(dot(col, vec3(0.33))), 0.45 * close) * mix(1.0, stones * gravel, close) * (0.85 + 0.3 * n1);
          float blades = vnoise(w.xz * vec2(11.0, 3.0) + n1 * 4.0) * 0.5 + vnoise(w.xz * vec2(3.0, 13.0)) * 0.5;
          vec3 grass = satBlur * vec3(0.8, 1.08, 0.75) * (0.55 + 0.8 * n1) * mix(1.0, 0.7 + 0.6 * blades, close);
          vec3 closeCol = mix(rockyGround, grass, green * (1.0 - steep));
          col = mix(col, closeCol, near * 0.9);
          col *= mix(1.0, 0.92 + 0.16 * t1, (1.0 - near) * mid);
        }
        // trail
        float tr = texture2D(trailMap, uv).r;
        if (tr > 0.01) {
          float n = vnoise(vWorld.xz * 2.3);
          vec2 sl = vor(vWorld.xz * 1.1 + n * 0.8);
          vec3 path = mix(vec3(0.3,0.28,0.25), vec3(0.5,0.48,0.44), 0.5 * n + 0.5 * sl.y) * mix(0.7, 1.0, smoothstep(0.0, 0.12, sl.x));
          path = mix(path, col, 0.3);
          col = mix(col, path, 0.8 * smoothstep(0.25, 0.8, tr) * (1.0 - smoothstep(900.0, 2500.0, dist) * 0.7));
        }
        diffuseColor.rgb = col;
      }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float tsh = terrainShadow(vWorld);
          float ao = mix(1.0, terrainAO(vWorld), ${aoStrength.toFixed(2)});
          reflectedLight.directDiffuse *= tsh * mix(1.0, ao, 0.35);
          reflectedLight.indirectDiffuse *= ao;
        }`);
  };
  m.customProgramCacheKey = () => 'terrain' + (detail ? 1 : 0);
  return m;
}

// Lakes: deep green-blue, sky reflection by fresnel, rippling sun glint.
export function waterMaterial() {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { skyCol: { value: new THREE.Color(0.5, 0.65, 0.85) } }]),
    fog: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 ambCol; uniform vec3 skyCol; uniform float time;
      varying vec3 vWorld;
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = vWorld.xz;
        float e = 0.6;
        float h0 = fbm2(p*0.35 + time*vec2(0.05,0.03)) + 0.5*fbm2(p*1.3 - time*vec2(0.04,-0.06));
        float hx = fbm2((p+vec2(e,0))*0.35 + time*vec2(0.05,0.03)) + 0.5*fbm2((p+vec2(e,0))*1.3 - time*vec2(0.04,-0.06));
        float hz = fbm2((p+vec2(0,e))*0.35 + time*vec2(0.05,0.03)) + 0.5*fbm2((p+vec2(0,e))*1.3 - time*vec2(0.04,-0.06));
        vec3 N = normalize(vec3(-(hx-h0)*0.35, 1.0, -(hz-h0)*0.35));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 deep = vec3(0.004, 0.03, 0.035) * (ambCol + sunCol * 0.4);
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, sunDir), 0.0), 220.0) * 6.0;
        vec3 col = mix(deep, skyCol, fres) + sunCol * spec * step(0.0, sunDir.y);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, { sunDir: light.sunDir, sunCol: light.sunCol, ambCol: light.ambCol, time: light.time });
  return m;
}
