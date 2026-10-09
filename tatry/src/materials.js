import * as THREE from 'three';
import { limeTexture } from './geology.js';

// aerial perspective: the scene's exp² fog (weather: haze, mist, rain) plus a constant thin haze of the air
// itself, linear in the distance. Exp² alone left ridges 3-10 km away as saturated as the near slopes
// (0.6 % of fog at 4 km); photos show them already blue (~27 % at 3.5 km, ~60 % at 10 km)
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
  `float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth - 9.0e-5 * vFogDepth );`);

// Shared lighting uniforms, updated by the time-of-day / weather code.
export const light = {
  sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  sunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  ambCol: { value: new THREE.Color(0.35, 0.4, 0.5) },
  time: { value: 0 },
  cloudCover: { value: 0.35 },       // 0 clear .. 1 overcast (set by the weather)
  windK: { value: 1 },               // wind strength for grass and trees: 0.5 calm .. 2.5 gale
  wetK: { value: 0 },                // 0 dry .. 1 soaked: darker ground and rock
  snowK: { value: 0 },               // fresh snow over the ground above snowLine
  snowLine: { value: 9000 },
  rainK: { value: 0 },               // how hard it rains: rings on the lakes
  winterK: { value: 0 },             // winter: snow over everything above the valleys, frozen lakes, snow caps
};

// Cumulus layer at ~3.4 km, drifting with the wind. The same density drives the clouds in the sky
// (objects/Sky shader patch in main.js) and their shadows on the ground, so the shadows sit under them.
export const CLOUDS = /* glsl */`
uniform float cloudCover; uniform float windK; uniform float wetK; uniform float snowK; uniform float snowLine; uniform float winterK;
float cl_h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float cl_n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(cl_h(i),cl_h(i+vec2(1,0)),u.x), mix(cl_h(i+vec2(0,1)),cl_h(i+vec2(1,1)),u.x), u.y); }
const float CLOUD_Y = 3400.0;
float cloudDensity(vec2 p, float t){
  p += vec2(7.0, 3.0) * t;                         // wind ~8 m/s from the west
  // a warped domain and two finer octaves: billowy cumulus edges instead of soft cotton-wool blobs
  vec2 q = p + vec2(cl_n(p / 900.0), cl_n(p / 900.0 + 5.3)) * 260.0;
  float n = cl_n(q / 2600.0) * 0.5 + cl_n(q / 1100.0 + 3.1) * 0.27 + cl_n(q / 420.0 + 7.7) * 0.13
    + cl_n(q / 180.0 + 1.3) * 0.07 + cl_n(q / 70.0 + 9.1) * 0.03;
  float c = clamp(cloudCover, 0.0, 1.0);
  return smoothstep(0.8 - c * 0.6, 0.86 - c * 0.6, n);
}
// the shadows on the ground: the same clouds without the fine octaves (every terrain pixel pays for them)
float cloudDensityLo(vec2 p, float t){
  p += vec2(7.0, 3.0) * t;
  vec2 q = p + vec2(cl_n(p / 900.0), cl_n(p / 900.0 + 5.3)) * 260.0;
  float n = cl_n(q / 2600.0) * 0.5 + cl_n(q / 1100.0 + 3.1) * 0.27 + cl_n(q / 420.0 + 7.7) * 0.13 + 0.05;
  float c = clamp(cloudCover, 0.0, 1.0);
  return smoothstep(0.78 - c * 0.6, 0.88 - c * 0.6, n);
}
`;

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
    sunDir: light.sunDir, time: light.time, cloudCover: light.cloudCover,
    windK: light.windK, wetK: light.wetK, snowK: light.snowK, snowLine: light.snowLine, winterK: light.winterK,
    shSteps: { value: { low: 8, mid: 18, high: 28, ultra: 40 }[quality] ?? 28 },
    limeMap: { value: limeTexture([outer.x0, outer.z0, outer.x1, outer.z1]) },
    limeRect: { value: new THREE.Vector4(outer.x0, outer.z0, outer.x1, outer.z1) },
  };
}

// 0 granite .. 1 limestone (geology.js)
const LIME = /* glsl */`
uniform sampler2D limeMap; uniform vec4 limeRect;
float limeAt(vec2 p){ return texture2D(limeMap, clamp((p - limeRect.xy) / (limeRect.zw - limeRect.xy), 0.0, 1.0)).r; }
`;

export const HEIGHTS = /* glsl */`
${CLOUDS}
${LIME}
uniform sampler2D hInner; uniform sampler2D hOuter;
uniform vec4 bInner; uniform vec4 bOuter; uniform vec2 nInner; uniform vec2 nOuter;
uniform vec3 sunDir; uniform float time; uniform int shSteps;
vec2 gridUV(vec2 p, vec4 b, vec2 n){ vec2 f=(p-b.xy)/(b.zw-b.xy); return (f*(n-1.0)+0.5)/n; }
float hAt(vec2 p){
  vec2 f=(p-bInner.xy)/(bInner.zw-bInner.xy);
  float h;   // one way out: Direct3D (Windows) warns of an uninitialised result otherwise
  if (f.x>0.01 && f.y>0.01 && f.x<0.99 && f.y<0.99) h = texture(hInner, gridUV(p,bInner,nInner)).r;
  else h = texture(hOuter, gridUV(p,bOuter,nOuter)).r;
  return h+1000.0;
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
// shadow of the cloud layer: follow the sun ray up to the clouds
float cloudShadow(vec3 wp){
  if (cloudCover < 0.02 || sunDir.y <= 0.02) return 1.0;
  vec2 p = wp.xz + sunDir.xz / sunDir.y * (CLOUD_Y - wp.y);
  return 1.0 - 0.62 * cloudDensityLo(p, time);
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
          float amt = ${wind.toFixed(3)} * position.y * position.y * 0.02 * windK;
          phase *= 0.8 + 0.2 * windK;
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
          vTerrSh = ${perVertexShadow ? 'terrainShadow(wpS.xyz)' : '1.0'} * cloudShadow(wpS.xyz);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTerrSh; uniform float wetK; uniform float winterK;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n if (winterK > 0.0) { float upS = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.94), winterK * smoothstep(0.35, 0.7, upS)); }')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directDiffuse *= vTerrSh * (1.0 - 0.3 * wetK);\n reflectedLight.indirectDiffuse *= 1.0 - 0.3 * wetK;');
  };
  material.customProgramCacheKey = () => 'patched' + wind + perVertexShadow;
}

// Satellite-textured terrain with close-range procedural detail (rock grain, grass, trail),
// lit by the scene lights (so it receives tree and rock shadows) plus terrain shadow and AO.
// `near` (shared object) holds the sharp orthophoto window around the camera and the rectangle
// covered by the 1 m patch mesh; `lowerUnderPatch` hides this mesh where the patch replaces it.
// desmear: the walls' de-smearing (below; ?odmaz=0 turns it off, to compare)
// hole: { value: Vector4 } x0, z0, x1, z1 where a finer mesh lies and this one is not drawn
export function terrainMaterial({ map, trailMap, bounds, detail, env, aoStrength = 1, textures, near, hole = null, desmear = true, debug = 0, debugId = 0 }) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const u = {
    nearMap: near.map, nearRect: near.rect, clsNear: near.cls, trailNear: near.trail, trailRect: near.trailRect, holeRect: hole || { value: new THREE.Vector4(0, 0, 0, 0) },
    shoreMap: near.shore || { value: null }, shoreRect: near.shoreRect || { value: new THREE.Vector4(0, 0, 0, 0) },
    texD: { value: textures.diff }, texN: { value: textures.nor },
    texMean: { value: textures.mean }, texScale: { value: textures.scale },
    satMap: { value: map }, trailMap: { value: trailMap },
    bounds: { value: new THREE.Vector4(...bounds) }, detail: { value: detail ? 1 : 0 }, desmear: { value: +desmear },
    dbgMode: { value: debug }, dbgId: { value: debugId },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, env, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld; varying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorld; varying vec3 vWN; uniform vec4 holeRect;
        uniform sampler2D satMap; uniform sampler2D trailMap; uniform vec4 bounds; uniform float detail; uniform float desmear;
        // ?debug=teren: which stage of this shader decided a pixel's colour (see debugTerrain in main.js)
        uniform float dbgMode; uniform float dbgId;
        float dbgFar = 0.0, dbgCliff = 0.0, dbgSmear = 0.0, dbgSnow = 0.0, dbgGrey = 0.0, dbgRock = 0.0;
        uniform sampler2D shoreMap; uniform vec4 shoreRect;
        uniform sampler2D nearMap; uniform vec4 nearRect; uniform sampler2D clsNear; uniform sampler2D trailNear; uniform vec4 trailRect;
        uniform sampler2DArray texD; uniform sampler2DArray texN; uniform vec3 texMean[6]; uniform float texScale[6];
        ${NOISE}
        // one texture layer at two scales, blended by noise to hide tiling; returns colour and tangent normal
        vec3 texLayer(vec2 p, float l, float scale, out vec3 n) {
          const mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
          vec2 a = p / scale, b = R * p / (scale * 2.7) + 0.37;
          float m = smoothstep(0.3, 0.7, vnoise(p / (scale * 5.0)));
          vec3 ca = texture(texD, vec3(a, l)).rgb, cb = texture(texD, vec3(b, l)).rgb;
          vec3 na = texture(texN, vec3(a, l)).xyz * 2.0 - 1.0, nb = texture(texN, vec3(b, l)).xyz * 2.0 - 1.0;
          nb.xy = transpose(R) * nb.xy;
          n = normalize(mix(na, nb, m));
          return mix(ca, cb, m);
        }
        // triplanar: three axis-aligned projections blended by the normal, so steep and broken
        // lidar terrain is not smeared; returns colour and a world-space normal
        vec3 texTri(vec3 w, vec3 N, float l, float scale, out vec3 nw) {
          vec3 bw = pow(abs(N), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 c = vec3(0.0), nx, ny, nz;
          nx = ny = nz = vec3(0.0, 0.0, 1.0);
          if (bw.x > 0.02) c += texLayer(w.zy, l, scale, nx) * bw.x;
          if (bw.y > 0.02) c += texLayer(w.xz, l, scale, ny) * bw.y;
          if (bw.z > 0.02) c += texLayer(w.xy, l, scale, nz) * bw.z;
          c /= max(bw.x * step(0.02, bw.x) + bw.y * step(0.02, bw.y) + bw.z * step(0.02, bw.z), 1e-3);
          // UDN blend of the tangent-space normals into world space
          vec3 s = sign(N);
          vec3 wx = vec3(0.0, nx.y, nx.x * s.x);
          vec3 wy = vec3(ny.x, 0.0, ny.y);
          vec3 wz = vec3(nz.x * s.z, nz.y, 0.0);
          nw = normalize(N + wx * bw.x + wy * bw.y + wz * bw.z);
          return c;
        }
        ${HEIGHTS}
        // summer snow on the photo: the Slovak 2025 images keep white patches of old snow and pale scree on whole
        // slopes (under Lomnica the meadows went white). Bright and pale: towards the meadow lower down,
        // grey rock up high and on steep ground (not in winter, when the snow is meant). c: the photo as sampled
        float snowiness(vec3 c) {
          float L = dot(c, vec3(0.3, 0.55, 0.15));
          // (the Slovak photo's snow is cream- or mint-white: a low saturation, not none; vivid green is not touched;
          // in the coarse whole-region photo it is blurred to a mid grey, L ~0.3)
          float mx = max(max(c.r, c.g), c.b), sat0 = (mx - min(min(c.r, c.g), c.b)) / max(mx, 0.02);
          return smoothstep(0.2, 0.35, L) * (1.0 - smoothstep(0.5, 0.7, sat0));
        }
        // cb: the photo blurred around the point. The edge between dark mugo and snow is a cream-yellow blend
        // (and the sharpening rings it brighter), too saturated to pass as snow: inside a snowy neighbourhood
        // it goes too, only the dark mugo itself stays
        vec3 desnow(vec3 c, vec3 cb, float sl) {
          float summer = (1.0 - winterK) * (1.0 - snowK);
          // the dwarf pine in the Slovak photo is near black (deep shade between the bushes): a floor of mugo green
          // in its belt, not on the walls
          float L0 = dot(c, vec3(0.3, 0.55, 0.15));
          c = mix(c, vec3(0.055, 0.075, 0.03), (1.0 - smoothstep(0.04, 0.10, L0)) * summer * (1.0 - smoothstep(0.4, 0.6, sl))
            * smoothstep(1400.0, 1500.0, vWorld.y) * (1.0 - smoothstep(1900.0, 2000.0, vWorld.y)));
          // down to Hrebienok (1280 m): there not on the roads and paths (pale gravel; higher up the photo's
          // paths are snow too), nor on pale limestone
          float road = texture2D(trailMap, (vWorld.xz - bounds.xy) / (bounds.zw - bounds.xy)).r;
          float k = max(snowiness(c), snowiness(cb) * smoothstep(0.07, 0.15, L0)) * summer
            * smoothstep(1100.0, 1250.0, vWorld.y) * (1.0 - smoothstep(0.15, 0.5, road) * (1.0 - smoothstep(1350.0, 1450.0, vWorld.y))) * (1.0 - limeAt(vWorld.xz));
          dbgSnow = max(dbgSnow, k);
          if (k <= 0.0) return c;
          float up = max(smoothstep(2050.0, 2300.0, vWorld.y), smoothstep(0.35, 0.6, sl));   // meadows to ~2100 m
          vec3 tgt = mix(vec3(0.085, 0.11, 0.05), vec3(0.22, 0.215, 0.2), up) * (0.85 + 0.3 * vnoise(vWorld.xz * 0.05));
          return mix(c, tgt, k);
        }
        vec3 desnow(vec3 c, float sl) { return desnow(c, c, sl); }
        // relief normal from the 4 m height texture: sharper ridges and gullies than the mesh normals
        vec3 hNormal(vec2 p, float e) {
          float hx = hAt(p + vec2(e, 0.0)) - hAt(p - vec2(e, 0.0));
          float hz = hAt(p + vec2(0.0, e)) - hAt(p - vec2(0.0, e));
          return normalize(vec3(-hx, 2.0 * e, -hz));
        }
        // fall-line detail on steep ground: ribs and couloirs running down the slope, which the height
        // data is too coarse to hold. Noise stretched along the slope direction; each octave fades out
        // before it would alias. Returns the change of brightness, bends N in place.
        float fallLine(vec3 w, inout vec3 N, vec3 Ns, float amount) {
          float st = smoothstep(0.22, 0.6, 1.0 - Ns.y) * amount;
          if (st < 0.01) return 0.0;
          vec2 dn = normalize(Ns.xz + vec2(1e-4, 0.0)), ac = vec2(-dn.y, dn.x);
          float s = dot(w.xz, ac), t = dot(w.xz, dn);
          float warp = vnoise(w.xz / 90.0) * 3.0;
          float bright = 0.0; vec2 bend = vec2(0.0);
          float P = 7.0, a = 1.0;
          for (int o = 0; o < 3; o++) {
            float fw = fwidth(s) / P;
            float k = (1.0 - smoothstep(0.07, 0.16, fw)) * a;     // fade out below ~8 px per period
            if (k > 0.01) {
              vec2 q = vec2(s / P + warp, t / (P * 5.0) + float(o) * 7.3);
              float e = 0.08;
              float n0 = vnoise(q), n1 = vnoise(q + vec2(e, 0.0)), n2 = vnoise(q + vec2(0.0, e * 3.0));
              // ridged: ribs with rounded gullies (a softened abs, so the creases do not draw thin lines)
              float r0 = 1.0 - sqrt(pow(n0 * 2.0 - 1.0, 2.0) + 0.03);
              float r1 = 1.0 - sqrt(pow(n1 * 2.0 - 1.0, 2.0) + 0.03), r2 = 1.0 - sqrt(pow(n2 * 2.0 - 1.0, 2.0) + 0.03);
              bright += (r0 - 0.58) * k;                            // ridged noise sits above 0.5 on average
              bend += vec2((r1 - r0) / e, (r2 - r0) / (e * 3.0) * 0.2) * k;
            }
            P *= 2.9; a *= 0.8;
          }
          vec3 acW = vec3(ac.x, 0.0, ac.y), dnW = vec3(dn.x, 0.0, dn.y);
          float wall = smoothstep(0.45, 0.8, 1.0 - Ns.y);
          N = normalize(N - (acW * bend.x + dnW * bend.y) * (0.16 + 0.14 * wall) * st);
          // granite walls: broken horizontal ledges whose tops face up and catch the light
          float lv = w.y / 11.0 + vnoise(w.xz / 23.0) * 1.7 + vnoise(vec2(s / 40.0, 3.1)) * 0.8;
          float lk = (1.0 - smoothstep(0.05, 0.12, fwidth(lv))) * wall * st;
          if (lk > 0.01) {
            float fr = fract(lv);
            float top = smoothstep(0.6, 0.9, fr) * (1.0 - smoothstep(0.9, 1.0, fr));
            top *= smoothstep(0.45, 0.65, vnoise(vec2(s / 16.0, floor(lv) * 1.7)));   // ledges break off
            N = normalize(N + vec3(0.0, 0.7 * top * lk, 0.0));
            bright += top * 0.25 * lk / max(st, 0.01);
          }
          return bright * st;
        }
        // unsharp mask relative to the level of detail actually shown: local contrast of the photo
        vec3 sharpen(sampler2D tex, vec2 uv, vec3 c, float amount) {
          vec2 sz = vec2(textureSize(tex, 0));
          float lod = log2(max(max(length(dFdx(uv * sz)), length(dFdy(uv * sz))), 1.0));
          vec3 b = textureLod(tex, uv, lod + 1.6).rgb;
          return max(c + (c - b) * amount, vec3(0.0));
        }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // not drawn where a finer mesh lies (the panorama under the detailed area, the coarse mesh under the
        // 1 m patch around the camera). They used to be pushed down there, but where the edge of the finer one
        // crossed a wall, the big triangles of the coarser one rose through it as wedges with the top-down photo
        // drawn out into green streaks on them. The finer meshes' skirts hide the seams.
        if (vWorld.x > holeRect.x + 1.0 && vWorld.x < holeRect.z - 1.0 && vWorld.z > holeRect.y + 1.0 && vWorld.z < holeRect.w - 1.0) discard;`)
      .replace('#include <map_fragment>', `vec3 detN = vec3(0.0, 1.0, 0.0); float detW = 0.0; float asphK = 0.0; float pathK = 0.0;
      {
        vec2 uv = (vWorld.xz - bounds.xy) / (bounds.zw - bounds.xy);
        vec3 sat = texture2D(satMap, uv).rgb;
        {
          // sharper orthophoto (0.5 m) in a window around the camera, faded in at its edges
          vec2 nuv = (vWorld.xz - nearRect.xy) / (nearRect.zw - nearRect.xy);
          if (nuv.x > 0.0 && nuv.y > 0.0 && nuv.x < 1.0 && nuv.y < 1.0) {
            float e = min(min(nuv.x, 1.0 - nuv.x), min(nuv.y, 1.0 - nuv.y));
            sat = mix(sat, texture2D(nearMap, nuv).rgb, smoothstep(0.0, 0.06, e));
          }
        }
        float dist = length(cameraPosition - vWorld);
        sat = sharpen(satMap, uv, sat, detail > 0.5 ? 0.9 * smoothstep(150.0, 600.0, dist) : 0.8);
        vec3 N = normalize(vWN);
        float slope = 1.0 - N.y;
        sat = desnow(sat, textureLod(satMap, uv, 3.0).rgb, slope);
        // the rock's colour: Tatra granite (grey, a little warm) or the pale grey limestone and dolomite of the
        // northern belt (Giewont, Czerwone Wierchy, the Belianske Tatry), lighter and cooler
        float lime = limeAt(vWorld.xz);
        vec3 ROCK = mix(vec3(1.02, 1.0, 0.95), vec3(1.0, 1.0, 0.975) * 1.25, lime);
        // lift the baked-in satellite shadows a bit, real-time light adds relief back; less on walls,
        // which the sun lights head-on while the photo (taken from above) already shows them bright
        // bright photos (light granite scree on the Slovak 2025 photo) are not lifted, or they burn out to white
        float satL = dot(sat, vec3(0.3, 0.55, 0.15));
        // dark green (dwarf pine, spruce forest) keeps its depth: lifted like the meadows it went the same smooth
        // green as the grass beside it, where photos show dark fields of pine; a clumpy texture of its own
        // (bushes and crowns, a few metres) reads from afar
        float dkG = clamp((sat.g - sat.b) * 7.0, 0.0, 1.0) * (1.0 - smoothstep(0.1, 0.24, satL));
        float lift = mix(1.55 - 0.3 * smoothstep(0.35, 0.75, slope), 1.0, smoothstep(0.38, 0.72, satL));
        sat = sat * mix(lift, 1.08, dkG * 0.75) + 0.01;
        sat *= 1.0 - dkG * 0.35 * smoothstep(0.35, 0.75, vnoise(vWorld.xz * 0.22) * 0.6 + vnoise(vWorld.xz * 0.9) * 0.4);
        // meadows a little less vivid (the Western Tatras' halls went a bright lawn green): towards grey-green
        float lawn = clamp((sat.g - max(sat.r, sat.b)) * 6.0, 0.0, 1.0) * (1.0 - dkG);
        sat = mix(sat, vec3(dot(sat, vec3(0.3, 0.55, 0.15))) * vec3(0.98, 1.02, 0.96), lawn * 0.2);
        // the high rock is warm grey granite: the photo's cold blue-cyan cast and the green of the grass on its
        // ledges (lifted above into a camouflage of green patches on the walls) turned towards the stone's grey,
        // from ~30° up above the dwarf pine
        {
          float hiRock = smoothstep(1550.0, 1750.0, vWorld.y) * smoothstep(0.13, 0.32, slope);
          // limestone walls stand out of the forest far lower (Kościeliska, Giewont's north face): pale grey from
          // ~900 m, only where the ground is a wall (forest grows on the gentler limestone slopes)
          hiRock = max(hiRock, lime * smoothstep(850.0, 1000.0, vWorld.y) * smoothstep(0.3, 0.5, slope));
          float Ls = dot(sat, vec3(0.3, 0.55, 0.15));
          // and the pale scree and slabs of any slope up there: greys with a mint cast in the photo
          float chroma = max(max(sat.r, sat.g), sat.b) - min(min(sat.r, sat.g), sat.b);
          float grey = (1.0 - smoothstep(0.05, 0.14, chroma)) * smoothstep(1500.0, 1700.0, vWorld.y);
          sat = mix(sat, ROCK * vec3(1.1, 1.0, 0.9) * Ls, max(hiRock * 0.75, grey * 0.7));
        }
        // relief normal: from the 4 m heights past the 1 m patch; the panorama keeps its mesh normals
        vec3 Nr = N;
        if (detail > 0.5) Nr = normalize(mix(N, hNormal(vWorld.xz, 4.0), smoothstep(60.0, 200.0, dist)));
        vec3 Nsm = Nr;                                              // slope direction for the fall lines
        float slopeH = 1.0 - Nr.y;                                  // from the 4 m heights: real walls read as walls
        // de-smearing of the walls: a photo taken from above covers a wall of slope θ with 1/cos θ times fewer
        // pixels, drawn out down the fall line into streaks, and where grass grows on a ledge above, into green
        // smears down the rock. The more a spot is stretched, the more of the photo's detail is dropped (its
        // blurred level instead, as blurred as the photo is drawn out there) and its colour turned to granite
        // (its brightness kept); the fine detail comes from the granite texture, laid on from three sides
        float stretch = 1.0 / max(min(N.y, Nr.y), 0.12);
        float smear = smoothstep(1.3, 2.4, stretch) * min(desmear, 1.0);   // ~40° .. 65°
        dbgSmear = smear;
        if (smear > 0.0) {
          const vec3 LW = vec3(0.3, 0.55, 0.15);
          vec2 tsz = vec2(textureSize(satMap, 0));
          float lod = log2(max(max(length(dFdx(uv * tsz)), length(dFdy(uv * tsz))), 1.0));
          float L = dot(sat, LW), Lraw = max(dot(texture2D(satMap, uv).rgb, LW), 0.02);
          float Llow = dot(textureLod(satMap, uv, lod + log2(stretch) + 0.5).rgb, LW) * clamp(L / Lraw, 0.5, 3.0);
          float Lc = mix(L, Llow, smear);
          sat = mix(sat, ROCK * Lc, smear * 0.9);
          float fine = 1.0 - smoothstep(400.0, 1500.0, dist);
          if (fine > 0.0) {
            // a wall faces mostly sideways: one projection (the one it faces) is enough, 2 reads instead of up to 6
            vec3 gn;
            vec3 gc = texLayer(abs(N.x) > abs(N.z) ? vWorld.zy : vWorld.xy, 0.0, texScale[0] * 2.0, gn);
            sat *= mix(1.0, clamp(dot(gc, LW) / max(dot(texMean[0], LW), 0.02), 0.6, 1.4), smear * 0.6 * fine);
          }
        }
        // ribs and gullies belong to rock and scree, not to grass and dwarf pine
        float greenish = clamp((sat.g - max(sat.r, sat.b)) * 9.0 - 0.25, 0.0, 1.0);
        float fl = fallLine(vWorld, Nr, Nsm, (detail > 0.5 ? 1.0 : 0.8) * (1.0 - 0.9 * greenish));
        vec3 col = sat;
        if (detail > 0.5) {
          float mid = 1.0 - smoothstep(1500.0, 6000.0, dist);
          vec3 satBlur = desnow(textureLod(satMap, uv, 1.5).rgb, slope) * 1.55 + 0.01;
          float green = clamp((satBlur.g - max(satBlur.r, satBlur.b)) * 14.0, 0.0, 1.0);
          vec3 w = vWorld;
          // far/mid range: procedural granite on steep ground so cliffs are not smeared by the top-down photo
          vec3 an = pow(abs(N), vec3(3.0)); an /= (an.x + an.y + an.z);
          float t1 = fbm2(w.zy * 0.22) * an.x + fbm2(w.xz * 0.22) * an.y + fbm2(w.xy * 0.22) * an.z;
          float t2 = vnoise(w.zy * 1.6) * an.x + vnoise(w.xz * 1.6) * an.y + vnoise(w.xy * 1.6) * an.z;
          float strata = 0.88 + 0.12 * sin(w.y * 0.7 + t1 * 9.0);
          // its brightness from the photo blurred as much as the photo is drawn out on the wall (de-smearing, above)
          vec3 satWall = smear > 0.0 ? mix(satBlur, desnow(textureLod(satMap, uv, 1.5 + 1.6 * log2(stretch)).rgb, slope) * 1.55 + 0.01, smear) : satBlur;
          float glum = dot(satWall, vec3(0.3, 0.45, 0.25));
          // limestone is pale: the photo's shade and trees on the wall made it dark green-grey
          glum = mix(glum, max(glum, 0.36), lime);
          vec3 rock = vec3(glum) * ROCK * (0.55 + 0.9 * t1) * (0.82 + 0.36 * t2) * strata;
          // walls are granite whatever green the top-down photo smeared over them (from ~40° up the photo's
          // green is ignored; the mesh normals are smoothed, so real walls show up from ~0.4)
          float sl = max(slope, slopeH);
          float steep = smoothstep(0.3, 0.6, sl) * (1.0 - green * 0.6 * (1.0 - smoothstep(0.38, 0.52, sl)));
          col = mix(sat, rock, steep * mid);
          dbgRock = steep * mid;

          // close range: photo textures (Poly Haven), coloured by the satellite image
          float near = 1.0 - smoothstep(180.0, 1100.0, dist);
          if (near > 0.0) {
            vec2 sp = w.xz;
            float nBig = vnoise(w.xz / 38.0);
            float forest = 1.0 - smoothstep(1500.0, 1620.0, w.y);
            float wCliff = steep;
            float wGreen = green * (1.0 - steep);
            float wRocky = (1.0 - green) * (1.0 - steep);
            float wT[6];
            float nC = smoothstep(0.3, 0.7, vnoise(sp / 9.0));
            wT[0] = wCliff * (1.0 - nC);                        // granite
            wT[1] = wCliff * nC + wRocky * (1.0 - nBig);        // lichen slabs
            wT[2] = wRocky * nBig;                                // scree
            wT[3] = 0.0;                                          // trail (below)
            wT[4] = wGreen * (1.0 - forest);                      // alpine grass
            wT[5] = wGreen * forest;                              // forest floor
            {
              // the 1 m ground map around the camera (tools/prepare_classes.py) where there is one:
              // R rock face, G scree / gravel, B meadow, A dwarf pine / forest
              vec2 cuv = (w.xz - nearRect.xy) / (nearRect.zw - nearRect.xy);
              float ce = min(min(cuv.x, 1.0 - cuv.x), min(cuv.y, 1.0 - cuv.y));
              if (ce > 0.0) {
                vec4 cw = texture2D(clsNear, cuv);
                float cs = cw.r + cw.g + cw.b + cw.a;
                if (cs > 0.05) {
                  cw /= cs;
                  float kc = smoothstep(0.0, 0.06, ce) * min(1.0, cs * 2.0);
                  wT[0] = mix(wT[0], cw.r * (1.0 - nC), kc);
                  wT[1] = mix(wT[1], cw.r * nC + cw.g * (1.0 - nBig) * 0.6, kc);
                  wT[2] = mix(wT[2], cw.g * (0.4 + 0.6 * nBig), kc);
                  wT[4] = mix(wT[4], cw.b, kc);
                  wT[5] = mix(wT[5], cw.a, kc);
                }
              }
            }
            // a stretched wall is rock whatever grass the top-down photo and the ground map (made from it) smear
            // down it from the ledges above: granite and lichen slabs, no meadow or forest floor (de-smearing)
            if (smear > 0.0) {
              float ks = smear * 0.85;
              wT[0] = mix(wT[0], 1.0 - nC, ks); wT[1] = mix(wT[1], nC, ks);
              wT[2] *= 1.0 - ks; wT[4] *= 1.0 - ks; wT[5] *= 1.0 - ks;
              wCliff = max(wCliff, smear);
            }
            // the path: the sharp window around the camera where there is one (R = path, G = R * paved),
            // with a ragged, trodden edge; the coarse whole-area mask elsewhere
            float tr = texture2D(trailMap, uv).r, paved = 0.0, asph = 0.0;
            float wTrail = smoothstep(0.2, 0.75, tr);
            {
              vec2 tuv = (w.xz - trailRect.xy) / (trailRect.zw - trailRect.xy);
              float te = min(min(tuv.x, 1.0 - tuv.x), min(tuv.y, 1.0 - tuv.y));
              if (te > 0.0) {
                vec4 tn4 = texture2D(trailNear, tuv);
                float k = smoothstep(0.0, 0.08, te);
                float edge = 0.22 + 0.5 * (vnoise(w.xz * 1.3) * 0.6 + vnoise(w.xz * 4.7) * 0.4);
                wTrail = mix(wTrail, smoothstep(edge - 0.07, edge + 0.07, tn4.r), k);
                paved = tn4.r > 0.02 ? clamp(tn4.g / tn4.r, 0.0, 1.0) * k : 0.0;
                asph = tn4.r > 0.02 ? clamp(tn4.b / tn4.r, 0.0, 1.0) * k : 0.0;
                tr = mix(tr, tn4.r, k);
              }
              pathK = wTrail * near;
            }
            for (int i = 0; i < 6; i++) wT[i] *= 1.0 - wTrail;
            wT[3] = wTrail;
            vec3 tc = vec3(0.0), tm = vec3(0.0), tn = vec3(0.0);
            float wsum = 0.0;
            for (int i = 0; i < 6; i++) {
              if (wT[i] < 0.02) continue;
              vec3 n;
              vec3 c = texTri(w, N, float(i), texScale[i], n);
              tc += c * wT[i]; tm += texMean[i] * wT[i]; tn += n * wT[i]; wsum += wT[i];
            }
            if (wsum > 0.0) {
              tc /= wsum; tm /= wsum; tn = normalize(tn);
              // top-down photos smear on walls: there, take their colour from a blurred level
              vec3 satLow = desnow(textureLod(satMap, uv, 3.0).rgb, slope) * (1.55 - 0.3 * smoothstep(0.35, 0.75, slope)) + 0.01;
              satLow = mix(satLow, ROCK * dot(satLow, vec3(0.3, 0.55, 0.15)), smear * 0.9);   // its green smears too
              vec3 baseC = mix(col, satLow * (0.8 + 0.4 * nBig), wCliff * 0.85);
              dbgCliff = wCliff * 0.85 * near;
              // the top-down photo smears green and white streaks down the walls: keep only its
              // brightness there, the colour is Tatra granite (grey, a little warm, lichen spots)
              float wl = dot(baseC, vec3(0.3, 0.55, 0.15));
              vec3 granite = ROCK * clamp(wl, 0.18 + 0.16 * lime, 0.62 + 0.14 * lime) * (0.9 + 0.2 * vnoise(w.xz / 7.0 + w.y / 9.0));
              // lichen spots on granite; limestone gets dark rain streaks down the wall instead
              granite = mix(granite, granite * vec3(0.92, 1.0, 0.8), smoothstep(0.55, 0.8, vnoise(w.xz / 3.0 + w.y / 4.0)) * 0.6 * (1.0 - lime));
              granite *= 1.0 - lime * 0.3 * smoothstep(0.55, 0.85, vnoise(vec2(dot(w.xz, vec2(0.7, 0.7)) / 2.5, w.y / 40.0)));
              baseC = mix(baseC, granite, wCliff * smoothstep(0.45, 0.7, max(slope, slopeH)) * 0.8);
              float lt = dot(tm, vec3(0.3, 0.55, 0.15)), ls = dot(baseC, vec3(0.3, 0.55, 0.15));
              vec3 byRatio = baseC * (tc / max(tm, vec3(0.02)));
              vec3 photo = tc * (ls / max(lt, 0.02));
              vec3 nearCol = mix(byRatio, photo, 0.45 + 0.35 * wTrail);
              // the trail itself: worn stone and gravel, light beige-grey; through a meadow it took the photo's
              // dark green brightness and read as a faint greenish band (Hala Kondratowa)
              nearCol = mix(nearCol, tc / max(lt, 0.02) * 0.3 * vec3(1.03, 1.0, 0.9), wTrail * 0.65);
              // walls: the granite texture once more at ~9x its scale, as blocks and cracks of 20-40 m
              // that the fine texture (averaged away past ~80 m) and the blurred photo lack
              if (wCliff > 0.05) {
                vec3 nm;
                vec3 mc = texTri(w, N, 0.0, texScale[0] * 9.0, nm);
                float ml = dot(mc, vec3(0.3, 0.55, 0.15)) / max(dot(texMean[0], vec3(0.3, 0.55, 0.15)), 0.02);
                nearCol *= mix(1.0, clamp(ml, 0.55, 1.45), wCliff * 0.85);
                tn = normalize(tn + (nm - N) * wCliff * 0.7);
              }
              // limestone: the photo textures' granite specks and green lichen slabs washed out to pale grey
              {
                float rk = clamp(wCliff + wT[1] + wT[2], 0.0, 1.0) * lime * (1.0 - wTrail);
                nearCol = mix(nearCol, vec3(dot(nearCol, vec3(0.3, 0.55, 0.15))) * vec3(1.0, 1.0, 0.97) * 1.18, rk * 0.7);
              }
              // tame the lime tint of sunlit grass in the satellite image
              nearCol = mix(nearCol, vec3(dot(nearCol, vec3(0.3, 0.55, 0.15))), 0.22 * wGreen);
              // trodden fringe: grass worn brown at the edge of the path
              float fringe = smoothstep(0.08, 0.3, tr) * (1.0 - wTrail);
              nearCol = mix(nearCol, nearCol * vec3(0.86, 0.8, 0.7), fringe * 0.6);
              // asphalt (the roads up the valleys): dark grey, a fine grain, darker patches of newer tar
              if (asph > 0.05 && wTrail > 0.01) {
                // the fine grain fades out before a pixel spans its period (aliased, it drew moiré stripes and a grid)
                float px = length(fwidth(w.xz));
                float g1 = mix(0.5, vnoise(w.xz * 9.0), 1.0 - smoothstep(0.03, 0.08, px));
                float g3 = mix(0.5, vnoise(w.xz * 2.1), 1.0 - smoothstep(0.15, 0.35, px)), g2 = vnoise(w.xz * 0.35);
                vec3 ac = vec3(0.13, 0.125, 0.115) * (0.85 + 0.25 * g1) * (0.9 + 0.2 * g2) * (0.95 + 0.1 * g3);
                ac = mix(ac, vec3(0.075, 0.075, 0.08), smoothstep(0.62, 0.7, g2) * 0.7);   // patches of newer tar
                float body = smoothstep(0.35, 0.75, wTrail);
                nearCol = mix(nearCol, ac, asph * body);
                tn = normalize(mix(tn, N, asph * body * 0.8));
                asphK = asph * body;
              }
              // granite paving: irregular blocks of different sizes set in soil, some missing (gravel
              // and dirt there), dirty and mossy from the photo; each block tilted a little
              if (paved > 0.05 && wTrail > 0.01) {
                vec2 wp = vec2(vnoise(w.xz * 0.7), vnoise(w.xz * 0.7 + 5.2)) - 0.5;
                vec2 pp = w.xz / 0.5 + wp * 1.4;               // fixed scale: a varying one would swirl at world coordinates
                vec2 vc = vor(pp);
                float fade = 1.0 - smoothstep(0.12, 0.35, fwidth(pp.x));
                float missing = step(vc.y, 0.2 + 0.35 * (1.0 - paved));
                float joint = smoothstep(0.05, 0.17, vc.x + (vnoise(w.xz * 9.0) - 0.5) * 0.07);
                joint = mix(0.75, joint, fade) * (1.0 - missing);
                float lum = mix(0.5, vc.y, fade);
                vec3 stone = vec3(0.2, 0.197, 0.185) * (0.7 + 0.5 * lum) * (0.85 + 0.3 * vnoise(w.xz * 6.0));
                // weathering: moss at the edges of the path and in shaded stones, dirt trodden in the middle
                float moss = smoothstep(0.45, 0.8, vnoise(w.xz * 1.7 + vc.y * 5.0)) * (0.35 + 0.65 * (1.0 - smoothstep(0.55, 0.95, tr)));
                stone = mix(stone, stone * vec3(0.72, 0.9, 0.55), moss * 0.7);
                stone = mix(stone, vec3(0.3, 0.26, 0.21), smoothstep(0.6, 0.9, vnoise(w.xz * 3.3 + 1.7)) * 0.45);
                stone = mix(stone, nearCol, 0.35);            // moss and dirt, as the photo shows them
                vec3 pave = mix(nearCol * vec3(0.7, 0.64, 0.56), stone, joint);
                float pw = wTrail * paved * smoothstep(0.35, 0.8, tr);
                nearCol = mix(nearCol, pave, pw);
                vec3 tilt = normalize(Nr + vec3((vc.y - 0.5) * 0.3, 0.0, (fract(vc.y * 7.3) - 0.5) * 0.3));   // relative to the slope
                tn = normalize(mix(tn, tilt, pw * fade * joint * 0.8));
              }
              col = mix(col, nearCol, near);
              // tn is already a world normal here; exaggerate its tilt on rock faces
              detN = normalize(Nr + (tn - N) * (1.0 + 0.8 * wCliff));
              detW = near * 0.9;
            }
          }
        } else {
          float tr = texture2D(trailMap, uv).r;
          col = mix(col, vec3(0.4, 0.38, 0.35), smoothstep(0.2, 0.75, tr) * 0.6);
          // panorama: the 10 m satellite photo on a 58 m mesh breaks into green and white camouflage
          // patches (snow fields, shadows). Paint the far mountains by height and slope instead
          // (forest, dwarf pine, alpine meadow, grey granite and scree) and keep only the photo's
          // broad colour, taken from a blurred level
          vec3 satB = desnow(textureLod(satMap, uv, 4.0).rgb, slope) * 1.5;
          float y = vWorld.y + (vnoise(vWorld.xz / 400.0) - 0.5) * 160.0;
          // limestone crags show bare on gentler (mesh-smoothed) slopes: Giewont's ridge was a green dome
          float st = smoothstep(mix(0.28, 0.16, lime), mix(0.62, 0.4, lime), slope);
          vec3 forestC = vec3(0.10, 0.15, 0.08), mugoC = vec3(0.16, 0.21, 0.10), meadowC = vec3(0.30, 0.33, 0.18);
          vec3 rockC = mix(vec3(0.36, 0.355, 0.34), vec3(0.62, 0.62, 0.6), lime) * (0.85 + 0.3 * vnoise(vWorld.xz / 90.0));
          // granite scree in the sun is mid grey (photos: ~137 of 255); 0.55 lit up whole Slovak ridges white from afar
          vec3 screeC = mix(vec3(0.39, 0.385, 0.37), vec3(0.64, 0.64, 0.62), lime);
          vec3 veg = mix(forestC, mugoC, smoothstep(1450.0, 1600.0, y));
          veg = mix(veg, meadowC, smoothstep(1750.0, 1950.0, y));
          vec3 bare = mix(screeC, rockC, st);
          float rocky = max(st, smoothstep(2050.0, 2350.0, y));   // the alpine meadows reach ~2100 m (under Lomnica too)
          vec3 paint = mix(veg, bare, rocky);
          // the photo still decides between green and bare where it is sure (broad scale only)
          float g = clamp((satB.g - max(satB.r, satB.b)) * 8.0, 0.0, 1.0);
          paint = mix(paint, veg, g * (1.0 - st) * (1.0 - smoothstep(1800.0, 2100.0, y)) * 0.5);
          float lum = dot(satB, vec3(0.3, 0.55, 0.15));
          paint *= mix(1.0, clamp(lum / 0.32, 0.8, 1.0), 0.3);   // a bright photo (old snow) does not lighten it
          float far = smoothstep(500.0, 2500.0, dist);
          dbgFar = far * 0.92;
          col = mix(col, paint, far * 0.92);
          fl *= 1.0 - far * 0.7;               // the ribs would re-draw the patches at this distance
        }
        // not on a road or a path: one cut across a slope took the slope's ribs as stripes across it
        col *= clamp(1.0 + fl * 1.1 * (1.0 - max(asphK, pathK)), 0.45, 1.5);
        // soft shoulder for very light ground (granite scree, limestone): keeps texture instead of white
        { float cl = dot(col, vec3(0.3, 0.55, 0.15)); col *= 1.0 / (1.0 + max(cl - 0.42, 0.0) * 1.6); }
        // weather: wet ground is darker; fresh snow settles above the snow line on the gentler slopes
        // up high, whatever path the colour took (photo, far procedural granite, close textures): no cold
        // cyan or mint cast on the stone, which is a warm grey
        {
          float hiC = smoothstep(1500.0, 1700.0, vWorld.y);
          float lumC = dot(col, vec3(0.3, 0.55, 0.15));
          float chromaC = max(max(col.r, col.g), col.b) - min(min(col.r, col.g), col.b);
          float cool = clamp((min(col.g, col.b) - col.r) / max(lumC, 0.02) * 4.0, 0.0, 1.0);
          float greyC = 1.0 - smoothstep(0.03, 0.09, chromaC / max(lumC, 0.05) * 0.3);
          col = mix(col, vec3(lumC) * vec3(1.08, 1.0, 0.9), hiC * max(cool * 0.8, greyC * 0.5));
          dbgGrey = hiC * max(cool * 0.8, greyC * 0.5);
          // scree: the pale cones of broken granite under the walls, lighter than the walls themselves
          col *= 1.0 + 0.35 * hiC * greyC * smoothstep(0.06, 0.18, slope) * (1.0 - smoothstep(0.45, 0.65, slope));   // (the Bula's blocks are pale, ~160 of 255)
        }
        // mountain lakes: a band of pale granite gravel and stones along the water, a few metres wide
        if (shoreRect.z > shoreRect.x) {
          vec2 suv = (vWorld.xz - shoreRect.xy) / (shoreRect.zw - shoreRect.xy);
          vec2 sd = texture2D(shoreMap, suv).rg * 60.0;
          float band = (1.0 - smoothstep(0.8, 4.5 + 2.0 * vnoise(vWorld.xz * 0.15), sd.g)) * (1.0 - smoothstep(0.0, 2.0, sd.r));
          band *= smoothstep(1250.0, 1400.0, vWorld.y) * (1.0 - smoothstep(0.55, 0.8, slope));
          if (band > 0.0) {
            vec2 cell = vor(vWorld.xz * 2.2);
            float stone = smoothstep(0.02, 0.12, cell.x);                       // the gaps between pebbles darker
            vec3 gravel = vec3(0.4, 0.39, 0.36) * (0.75 + 0.45 * cell.y) * (0.6 + 0.4 * stone);
            col = mix(col, gravel, band * 0.85);
          }
        }
        col *= 1.0 - 0.3 * wetK;
        if (snowK > 0.0) {
          float sy = vWorld.y + (vnoise(vWorld.xz / 60.0) - 0.5) * 120.0;
          float flatN = smoothstep(0.5, 0.78, normalize(vWN).y);
          float sn = snowK * smoothstep(snowLine - 80.0, snowLine + 120.0, sy) * flatN;
          col = mix(col, vec3(0.78, 0.8, 0.84), clamp(sn, 0.0, 0.92));
        }
        if (winterK > 0.0) {
          // winter: snow lies everywhere above the valley floors, thinner on steep faces (rock shows through
          // on the walls), the trail trodden into it
          float wy = vWorld.y + (vnoise(vWorld.xz / 40.0) - 0.5) * 80.0;
          float steep = smoothstep(0.42, 0.72, normalize(vWN).y);
          float patchy = 0.75 + 0.25 * vnoise(vWorld.xz / 7.0);
          float wsn = winterK * smoothstep(820.0, 950.0, wy) * mix(0.25, 1.0, steep) * patchy;
          vec3 snowC = vec3(0.84, 0.87, 0.92) * (0.92 + 0.08 * vnoise(vWorld.xz * 1.7));
          // the trail: a trodden track, packed and a little grey, with footprint dimples
          float trk = texture2D(trailMap, uv).r;
          vec2 tuvW = (vWorld.xz - trailRect.xy) / (trailRect.zw - trailRect.xy);
          if (min(min(tuvW.x, 1.0 - tuvW.x), min(tuvW.y, 1.0 - tuvW.y)) > 0.0) trk = max(trk, texture2D(trailNear, tuvW).r);
          float track = smoothstep(0.25, 0.7, trk);
          snowC = mix(snowC, vec3(0.66, 0.68, 0.72) * (0.85 + 0.3 * vnoise(vWorld.xz * 3.1)), track * 0.7);
          col = mix(col, snowC, clamp(wsn, 0.0, 0.96));
        }
        diffuseColor.rgb = col;
        if (dbgMode > 1.5) {
          // which mesh: the detailed area (red), the 1 m patch around the camera (green), the panorama (blue)
          diffuseColor.rgb = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))) * 1.5, dbgId < 1.5 ? vec3(1.0, 0.15, 0.1) : dbgId < 2.5 ? vec3(0.1, 1.0, 0.2) : vec3(0.15, 0.35, 1.0), 0.55);
        } else if (dbgMode > 0.5) {
          // which stage: the colour of the latest stage that weighed in, over the pixel's own brightness in grey
          vec3 d = vec3(dot(col, vec3(0.3, 0.55, 0.15))) * 1.4;
          d = mix(d, vec3(0.1, 0.35, 1.0), dbgFar);         // blue: the far panorama painted by height
          d = mix(d, vec3(1.0, 0.95, 0.95), dbgRock * 0.8); // white: procedural granite on steep ground
          d = mix(d, vec3(1.0, 0.5, 0.0), dbgCliff);        // orange: a cliff from the ground map
          d = mix(d, vec3(1.0, 0.0, 0.0), dbgSmear * 0.8);  // red: the wall's de-smearing
          d = mix(d, vec3(1.0, 0.0, 1.0), dbgSnow * 0.8);   // magenta: the photo's summer snow removed
          d = mix(d, vec3(0.0, 1.0, 1.0), dbgGrey * 0.8);   // cyan: high stone turned grey
          d = mix(d, vec3(1.0, 1.0, 0.0), max(asphK, pathK)); // yellow: roads and paths
          diffuseColor.rgb = d;
        }
        if (desmear > 1.5) diffuseColor.rgb = mix(col, vec3(1.0, 0.0, 0.0), smear * 0.8);   // ?odmaz=pokaz: where it works
        if (detW <= 0.0) { detN = Nr; detW = 1.0; }
        else { detN = normalize(mix(Nr, detN, detW)); detW = 1.0; }
        // a road is smooth: only the normal of the 4 m heights (any share of the mesh's, whose 1 m laser
        // bumps sit on a 2.5 m grid, lit the asphalt in stripes across it)
        if (asphK > 0.0) detN = normalize(mix(detN, hNormal(vWorld.xz, 4.0), smoothstep(0.0, 0.6, asphK)));
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (detW > 0.0) {
          vec3 nw = normalize(mix(normalize(vWN), detN, detW));
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float tsh = terrainShadow(vWorld) * cloudShadow(vWorld);
          float ao = mix(1.0, terrainAO(vWorld), ${aoStrength.toFixed(2)});
          reflectedLight.directDiffuse *= tsh * mix(1.0, ao, 0.35);
          reflectedLight.indirectDiffuse *= ao;
        }`);
  };
  m.customProgramCacheKey = () => 'terrain' + (detail ? 1 : 0);
  return m;
}

// a lake's own water: deep navy in the granite cirques, emerald where the name says so (Zielony Staw, Zelené pleso),
// olive-brown and calm in the forest below ~1400 m (Smreczyński Staw, Štrbské pleso: humic water, sheltered)
export function lakeTint(name, level) {
  if (/Zielon|Zelen/i.test(name || '')) return [0.012, 0.06, 0.04, 0.8];
  // Skalnaté pleso: shallow, silted, olive-brown under Lomnica; Morskie Oko (1395 m) is a deep cirque lake, navy
  if (/Skalnat/i.test(name || '')) return [0.035, 0.04, 0.02, 0.6];
  if (level < 1400 && !/Morskie Oko/i.test(name || '')) return [0.03, 0.034, 0.02, 0.5];
  return [0.008, 0.03, 0.068, 1];
}

// Lakes: deep green-blue, mirror reflection of the mountains (planar, for the lake nearest to the
// camera; others reflect the sky colour), fresnel, rippling sun glint.
export function waterMaterial() {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      skyCol: { value: new THREE.Color(0.5, 0.65, 0.85) },
      reflMap: { value: null }, reflMat: { value: new THREE.Matrix4() }, reflLevel: { value: -1e4 }, reflOn: { value: 0 },
      skyEnv: { value: null }, skyEnvOn: { value: 0 },
      // metres to the shore (0..60 in the red channel) over shoreRect (x0, z0, x1, z1): shallows by the shore
      shoreMap: { value: null }, shoreRect: { value: new THREE.Vector4(0, 0, 0, 0) },
    }]),
    fog: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorld;
      // per lake: the colour of its deep water (rgb) and how rough it gets in the wind (w)
      attribute vec4 aLake; varying vec4 vLake;
      void main(){
        vLake = aLake;
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
      uniform sampler2D reflMap; uniform mat4 reflMat; uniform float reflLevel; uniform float reflOn;
      uniform float windK; uniform float rainK; uniform float winterK;
      uniform samplerCube skyEnv; uniform float skyEnvOn;
      uniform sampler2D shoreMap; uniform vec4 shoreRect;
      varying vec3 vWorld; varying vec4 vLake;
      ${NOISE}
      // rain: rings spreading from where the drops fall, one drop per cell every second or so
      vec2 rainRings(vec2 p, float t) {
        vec2 g = vec2(0.0);
        for (int k = 0; k < 2; k++) {
          vec2 q = p * (k == 0 ? 1.7 : 2.9) + float(k) * 7.3;
          vec2 c = floor(q), f = fract(q) - 0.5;
          float h = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
          float ph = fract(t * (0.8 + 0.5 * h) + h * 7.0);
          vec2 o = vec2(fract(h * 17.0), fract(h * 31.0)) - 0.5;
          vec2 d = f - o * 0.6; float r = length(d);
          float ring = sin((r - ph * 0.55) * 48.0) * smoothstep(0.08, 0.0, abs(r - ph * 0.55)) * (1.0 - ph);
          g += d / max(r, 1e-3) * ring;
        }
        return g;
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = vWorld.xz;
        float e = 0.6;
        // the wind: stronger waves moving faster downwind, gusts darkening patches of the surface
        float w = clamp(windK, 0.3, 2.6);
        vec2 drift = vec2(0.8, 0.6) * (0.3 + 0.7 * w);
        // waves fade with distance (far away they only shimmered like gravel), the small ones sooner;
        // close up a finer ripple, not a cloth of big regular waves
        float dist = length(cameraPosition - vWorld);
        float amp = (0.08 + 0.3 * w) / (1.0 + dist / 150.0) * vLake.w;
        float fine = 0.5 / (1.0 + dist / 40.0);
        float h0 = fbm2(p*0.5 + time*vec2(0.05,0.03)*drift) + fine*fbm2(p*1.6 - time*vec2(0.04,-0.06)*drift);
        float hx = fbm2((p+vec2(e,0))*0.5 + time*vec2(0.05,0.03)*drift) + fine*fbm2((p+vec2(e,0))*1.6 - time*vec2(0.04,-0.06)*drift);
        float hz = fbm2((p+vec2(0,e))*0.5 + time*vec2(0.05,0.03)*drift) + fine*fbm2((p+vec2(0,e))*1.6 - time*vec2(0.04,-0.06)*drift);
        float gust = smoothstep(0.45, 0.75, fbm2(p * 0.02 - time * 0.08 * drift));
        vec3 N = normalize(vec3(-(hx-h0)*amp*(1.0 + gust*w*0.8), 1.0, -(hz-h0)*amp*(1.0 + gust*w*0.8)));
        if (rainK > 0.01) { vec2 rr = rainRings(p, time); N = normalize(N + vec3(rr.x, 0.0, rr.y) * 0.25 * rainK); }
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // a deep navy lake, turquoise over the pale granite gravel of the shallows by the shore
        vec3 deep = vLake.rgb * (ambCol + sunCol * 0.5) * 1.6;
        if (shoreRect.z > shoreRect.x) {
          float sd = texture2D(shoreMap, (vWorld.xz - shoreRect.xy) / (shoreRect.zw - shoreRect.xy)).r * 60.0;
          float sh = 1.0 - smoothstep(1.5, 12.0, sd);
          deep = mix(deep, vec3(0.035, 0.12, 0.115) * (ambCol + sunCol * max(sunDir.y, 0.0)) * 1.4, sh * 0.6);
        }
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, sunDir), 0.0), 220.0) * 6.0;
        // the sky as it is now (the environment cube taken from the live sky), else a flat sky colour
        vec3 refl = skyEnvOn > 0.5 ? textureCube(skyEnv, vec3(R.x, max(R.y, 0.02), R.z)).rgb * 0.85 : skyCol;
        // without the mirror (phones): the dark walls of the cirque round the lake fill the low part of the
        // reflection, not a bright horizon that turned the whole lake silver
        if (reflOn < 0.5) refl = mix(vec3(0.16, 0.17, 0.17) * (ambCol * 1.4 + sunCol * 0.35), refl, smoothstep(0.04, 0.32, R.y));
        if (reflOn > 0.5 && abs(vWorld.y - reflLevel) < 0.6) {
          vec4 pc = reflMat * vec4(vWorld, 1.0);
          // ripples bend the mirror image, less so far away (they are too small to see there)
          vec2 ruv = pc.xy / pc.w + N.xz * (0.035 / (1.0 + dist * 0.004));
          vec3 m = texture2D(reflMap, clamp(ruv, 0.001, 0.999)).rgb;
          // soften the edge of the reflection texture
          float edge = smoothstep(0.0, 0.03, min(min(ruv.x, 1.0 - ruv.x), min(ruv.y, 1.0 - ruv.y)));
          refl = mix(refl, m, edge);
          // a calm mountain lake: reflection stays visible even looking down
          fres = max(fres, 0.32);
        }
        // a glittering path towards a low sun
        float glit = pow(max(dot(R, sunDir), 0.0), 40.0) * smoothstep(0.35, 0.0, sunDir.y) * step(0.93, fbm2(p * 6.0 + time * 0.7));
        vec3 col = mix(deep, refl, fres) + sunCol * (spec + glit * 3.0) * step(0.0, sunDir.y);
        // whitecaps in a gale
        if (w > 1.7) col = mix(col, vec3(0.85) * (ambCol + sunCol * 0.5), smoothstep(0.62, 0.72, h0 + gust * 0.15) * (w - 1.7) * 0.6);
        if (winterK > 0.5) {
          // frozen and snowed over: white with wind-swept blue-grey ice showing through, dull, no waves
          float sweep = smoothstep(0.35, 0.75, fbm2(p * 0.06 + vec2(3.1, 7.7)));
          vec3 ice = vec3(0.42, 0.52, 0.58), snowL = vec3(0.86, 0.89, 0.93);
          vec3 lit = ambCol * 1.6 + sunCol * max(sunDir.y, 0.0) * 1.1;
          col = mix(ice, snowL, sweep * 0.8 + 0.2) * lit * 0.75 + sunCol * pow(max(dot(reflect(-V, vec3(0.0, 1.0, 0.0)), sunDir), 0.0), 60.0) * (1.0 - sweep) * 0.8;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, { sunDir: light.sunDir, sunCol: light.sunCol, ambCol: light.ambCol, time: light.time, windK: light.windK, rainK: light.rainK, winterK: light.winterK });
  return m;
}

// Granite close up, over the baked texture of the rocks: the grain of the stone (black biotite, white
// feldspar and grey quartz specks, a few millimetres), a fine rough relief in the normal, and lichens on
// the faces turned to the sky: the yellow-green map lichen (Rhizocarpon) in patches with dark rims, grey
// crusts, now and then the orange Xanthoria. Fades out beyond ~40 m, where it would only flicker.
export function rockDetail(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 rw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            rw = instanceMatrix * rw;
          #endif
          vRW = (modelMatrix * rw).xyz;
          mat3 nm = mat3(modelMatrix);
          #ifdef USE_INSTANCING
            nm = nm * mat3(instanceMatrix);
          #endif
          vRN = normalize(nm * objectNormal);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRW; varying vec3 vRN;
        ${NOISE}
        ${LIME}
        // value noise on the three planes, weighted by the normal (no stretching on steep faces)
        float tri(vec3 p, vec3 n, float f) {
          vec3 w = abs(n); w /= (w.x + w.y + w.z);
          return vnoise(p.yz * f) * w.x + vnoise(p.xz * f) * w.y + vnoise(p.xy * f) * w.z;
        }
        float trifbm(vec3 p, vec3 n, float f) {
          vec3 w = abs(n); w /= (w.x + w.y + w.z);
          return fbm2(p.yz * f) * w.x + fbm2(p.xz * f) * w.y + fbm2(p.xy * f) * w.z;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float rdist = length(vRW - cameraPosition);
        float rnear = 1.0 - smoothstep(18.0, 45.0, rdist);
        vec3 rn = normalize(vRN);
        float rlime = limeAt(vRW.xz);
        if (rnear > 0.0) {
          // grains: dark and light specks (granite; limestone is fine-grained, hardly any)
          float g1 = tri(vRW + 3.1, rn, 90.0), g2 = tri(vRW - 7.7, rn, 55.0);
          float dark = smoothstep(0.72, 0.8, g1), light = smoothstep(0.7, 0.78, g2);
          vec3 gcol = diffuseColor.rgb * (1.0 - 0.45 * dark) + vec3(0.08) * light;
          diffuseColor.rgb = mix(diffuseColor.rgb, gcol, rnear * (1.0 - 0.8 * rlime));
        }
        {
          // lichens on the faces open to the sky (they fade into the baked texture far away)
          float upf = smoothstep(0.1, 0.7, rn.y);
          float patchN = trifbm(vRW * 1.0 + 11.0, rn, 1.6);
          float mapL = smoothstep(0.58, 0.63, patchN) * upf;
          float rim = smoothstep(0.56, 0.58, patchN) - smoothstep(0.58, 0.6, patchN);
          float crust = smoothstep(0.55, 0.62, trifbm(vRW + 41.0, rn, 3.0)) * (0.4 + 0.6 * upf);
          float orange = smoothstep(0.72, 0.75, trifbm(vRW - 23.0, rn, 2.2)) * upf;
          vec3 c = diffuseColor.rgb;
          c = mix(c, c * 1.15 + vec3(0.05), crust * 0.5);
          // the map lichen shuns limestone
          c = mix(c, vec3(0.52, 0.58, 0.18) * (0.8 + 0.4 * tri(vRW, rn, 20.0)), mapL * 0.85 * (1.0 - rlime));
          c = mix(c, vec3(0.05), rim * upf * 0.7 * (0.3 + 0.7 * rnear) * (1.0 - rlime));
          c = mix(c, vec3(0.75, 0.35, 0.08), orange * 0.8);
          diffuseColor.rgb = c;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (rnear > 0.0) {
          // a fine rough relief: the gradient of the noise tilts the normal
          float e = 0.02, h0 = trifbm(vRW, rn, 6.0);
          vec3 gr = vec3(trifbm(vRW + vec3(e, 0.0, 0.0), rn, 6.0) - h0, trifbm(vRW + vec3(0.0, e, 0.0), rn, 6.0) - h0, trifbm(vRW + vec3(0.0, 0.0, e), rn, 6.0) - h0) / e;
          gr -= rn * dot(gr, rn);
          vec3 nw = normalize(rn - gr * 0.06 * rnear);
          normal = normalize(mix(normal, normalize((viewMatrix * vec4(nw, 0.0)).xyz), 0.5 * rnear));
        }`);
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
  material.customProgramCacheKey = () => key() + '-rockdetail';
  return material;
}
