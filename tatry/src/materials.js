import * as THREE from 'three';

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
};

// Cumulus layer at ~3.4 km, drifting with the wind. The same density drives the clouds in the sky
// (objects/Sky shader patch in main.js) and their shadows on the ground, so the shadows sit under them.
export const CLOUDS = /* glsl */`
uniform float cloudCover; uniform float windK; uniform float wetK; uniform float snowK; uniform float snowLine;
float cl_h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float cl_n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(cl_h(i),cl_h(i+vec2(1,0)),u.x), mix(cl_h(i+vec2(0,1)),cl_h(i+vec2(1,1)),u.x), u.y); }
const float CLOUD_Y = 3400.0;
float cloudDensity(vec2 p, float t){
  p += vec2(7.0, 3.0) * t;                         // wind ~8 m/s from the west
  float n = cl_n(p / 2600.0) * 0.55 + cl_n(p / 1100.0 + 3.1) * 0.3 + cl_n(p / 420.0 + 7.7) * 0.15;
  float c = clamp(cloudCover, 0.0, 1.0);
  return smoothstep(0.78 - c * 0.6, 0.9 - c * 0.6, n);
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
    windK: light.windK, wetK: light.wetK, snowK: light.snowK, snowLine: light.snowLine,
    shSteps: { value: { low: 8, mid: 18, high: 28, ultra: 40 }[quality] ?? 28 },
  };
}

export const HEIGHTS = /* glsl */`
${CLOUDS}
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
// shadow of the cloud layer: follow the sun ray up to the clouds
float cloudShadow(vec3 wp){
  if (cloudCover < 0.02 || sunDir.y <= 0.02) return 1.0;
  vec2 p = wp.xz + sunDir.xz / sunDir.y * (CLOUD_Y - wp.y);
  return 1.0 - 0.62 * cloudDensity(p, time);
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
      .replace('#include <common>', '#include <common>\nvarying float vTerrSh; uniform float wetK;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directDiffuse *= vTerrSh * (1.0 - 0.3 * wetK);\n reflectedLight.indirectDiffuse *= 1.0 - 0.3 * wetK;');
  };
  material.customProgramCacheKey = () => 'patched' + wind + perVertexShadow;
}

// Satellite-textured terrain with close-range procedural detail (rock grain, grass, trail),
// lit by the scene lights (so it receives tree and rock shadows) plus terrain shadow and AO.
// `near` (shared object) holds the sharp orthophoto window around the camera and the rectangle
// covered by the 1 m patch mesh; `lowerUnderPatch` hides this mesh where the patch replaces it.
export function terrainMaterial({ map, trailMap, bounds, detail, env, aoStrength = 1, textures, near, lowerUnderPatch = false }) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const u = {
    nearMap: near.map, nearRect: near.rect, clsNear: near.cls, patchRect: near.patch, trailNear: near.trail, trailRect: near.trailRect, lowerInside: { value: lowerUnderPatch ? 1 : 0 },
    texD: { value: textures.diff }, texN: { value: textures.nor },
    texMean: { value: textures.mean }, texScale: { value: textures.scale },
    satMap: { value: map }, trailMap: { value: trailMap },
    bounds: { value: new THREE.Vector4(...bounds) }, detail: { value: detail ? 1 : 0 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, env, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld; varying vec3 vWN; uniform vec4 patchRect; uniform float lowerInside;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normal;
        if (lowerInside > 0.5 && vWorld.x > patchRect.x + 6.0 && vWorld.x < patchRect.z - 6.0 && vWorld.z > patchRect.y + 6.0 && vWorld.z < patchRect.w - 6.0) {
          transformed.y -= 30.0; vWorld.y -= 30.0;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorld; varying vec3 vWN;
        uniform sampler2D satMap; uniform sampler2D trailMap; uniform vec4 bounds; uniform float detail;
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
      .replace('#include <map_fragment>', `vec3 detN = vec3(0.0, 1.0, 0.0); float detW = 0.0;
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
        // lift the baked-in satellite shadows a bit, real-time light adds relief back; less on walls,
        // which the sun lights head-on while the photo (taken from above) already shows them bright
        // bright photos (light granite scree on the Slovak 2025 photo) are not lifted, or they burn out to white
        float satL = dot(sat, vec3(0.3, 0.55, 0.15));
        sat = sat * mix(1.55 - 0.3 * smoothstep(0.35, 0.75, slope), 1.0, smoothstep(0.38, 0.72, satL)) + 0.01;
        // relief normal: from the 4 m heights past the 1 m patch; the panorama keeps its mesh normals
        vec3 Nr = N;
        if (detail > 0.5) Nr = normalize(mix(N, hNormal(vWorld.xz, 4.0), smoothstep(60.0, 200.0, dist)));
        vec3 Nsm = Nr;                                              // slope direction for the fall lines
        float slopeH = 1.0 - Nr.y;                                  // from the 4 m heights: real walls read as walls
        // ribs and gullies belong to rock and scree, not to grass and dwarf pine
        float greenish = clamp((sat.g - max(sat.r, sat.b)) * 9.0 - 0.25, 0.0, 1.0);
        float fl = fallLine(vWorld, Nr, Nsm, (detail > 0.5 ? 1.0 : 0.8) * (1.0 - 0.9 * greenish));
        vec3 col = sat;
        if (detail > 0.5) {
          float mid = 1.0 - smoothstep(1500.0, 6000.0, dist);
          vec3 satBlur = textureLod(satMap, uv, 1.5).rgb * 1.55 + 0.01;
          float green = clamp((satBlur.g - max(satBlur.r, satBlur.b)) * 14.0, 0.0, 1.0);
          vec3 w = vWorld;
          // far/mid range: procedural granite on steep ground so cliffs are not smeared by the top-down photo
          vec3 an = pow(abs(N), vec3(3.0)); an /= (an.x + an.y + an.z);
          float t1 = fbm2(w.zy * 0.22) * an.x + fbm2(w.xz * 0.22) * an.y + fbm2(w.xy * 0.22) * an.z;
          float t2 = vnoise(w.zy * 1.6) * an.x + vnoise(w.xz * 1.6) * an.y + vnoise(w.xy * 1.6) * an.z;
          float strata = 0.88 + 0.12 * sin(w.y * 0.7 + t1 * 9.0);
          float glum = dot(satBlur, vec3(0.3, 0.45, 0.25));
          vec3 rock = vec3(glum) * vec3(1.02, 1.0, 0.95) * (0.55 + 0.9 * t1) * (0.82 + 0.36 * t2) * strata;
          // walls are granite whatever green the top-down photo smeared over them (from ~40° up the photo's
          // green is ignored; the mesh normals are smoothed, so real walls show up from ~0.4)
          float sl = max(slope, slopeH);
          float steep = smoothstep(0.3, 0.6, sl) * (1.0 - green * 0.6 * (1.0 - smoothstep(0.38, 0.52, sl)));
          col = mix(sat, rock, steep * mid);

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
            // the path: the sharp window around the camera where there is one (R = path, G = R * paved),
            // with a ragged, trodden edge; the coarse whole-area mask elsewhere
            float tr = texture2D(trailMap, uv).r, paved = 0.0;
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
                tr = mix(tr, tn4.r, k);
              }
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
              vec3 satLow = textureLod(satMap, uv, 3.0).rgb * (1.55 - 0.3 * smoothstep(0.35, 0.75, slope)) + 0.01;
              vec3 baseC = mix(col, satLow * (0.8 + 0.4 * nBig), wCliff * 0.85);
              // the top-down photo smears green and white streaks down the walls: keep only its
              // brightness there, the colour is Tatra granite (grey, a little warm, lichen spots)
              float wl = dot(baseC, vec3(0.3, 0.55, 0.15));
              vec3 granite = vec3(1.02, 1.0, 0.95) * clamp(wl, 0.18, 0.62) * (0.9 + 0.2 * vnoise(w.xz / 7.0 + w.y / 9.0));
              granite = mix(granite, granite * vec3(0.92, 1.0, 0.8), smoothstep(0.55, 0.8, vnoise(w.xz / 3.0 + w.y / 4.0)) * 0.6);
              baseC = mix(baseC, granite, wCliff * smoothstep(0.45, 0.7, max(slope, slopeH)) * 0.8);
              float lt = dot(tm, vec3(0.3, 0.55, 0.15)), ls = dot(baseC, vec3(0.3, 0.55, 0.15));
              vec3 byRatio = baseC * (tc / max(tm, vec3(0.02)));
              vec3 photo = tc * (ls / max(lt, 0.02));
              vec3 nearCol = mix(byRatio, photo, 0.45 + 0.35 * wTrail);
              // walls: the granite texture once more at ~9x its scale, as blocks and cracks of 20-40 m
              // that the fine texture (averaged away past ~80 m) and the blurred photo lack
              if (wCliff > 0.05) {
                vec3 nm;
                vec3 mc = texTri(w, N, 0.0, texScale[0] * 9.0, nm);
                float ml = dot(mc, vec3(0.3, 0.55, 0.15)) / max(dot(texMean[0], vec3(0.3, 0.55, 0.15)), 0.02);
                nearCol *= mix(1.0, clamp(ml, 0.55, 1.45), wCliff * 0.85);
                tn = normalize(tn + (nm - N) * wCliff * 0.7);
              }
              // tame the lime tint of sunlit grass in the satellite image
              nearCol = mix(nearCol, vec3(dot(nearCol, vec3(0.3, 0.55, 0.15))), 0.22 * wGreen);
              // trodden fringe: grass worn brown at the edge of the path
              float fringe = smoothstep(0.08, 0.3, tr) * (1.0 - wTrail);
              nearCol = mix(nearCol, nearCol * vec3(0.86, 0.8, 0.7), fringe * 0.6);
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
          vec3 satB = textureLod(satMap, uv, 4.0).rgb * 1.5;
          float y = vWorld.y + (vnoise(vWorld.xz / 400.0) - 0.5) * 160.0;
          float st = smoothstep(0.28, 0.62, slope);
          vec3 forestC = vec3(0.10, 0.15, 0.08), mugoC = vec3(0.16, 0.21, 0.10), meadowC = vec3(0.30, 0.33, 0.18);
          vec3 rockC = vec3(0.47, 0.46, 0.44) * (0.85 + 0.3 * vnoise(vWorld.xz / 90.0)), screeC = vec3(0.55, 0.54, 0.51);
          vec3 veg = mix(forestC, mugoC, smoothstep(1450.0, 1600.0, y));
          veg = mix(veg, meadowC, smoothstep(1750.0, 1950.0, y));
          vec3 bare = mix(screeC, rockC, st);
          float rocky = max(st, smoothstep(1950.0, 2250.0, y));
          vec3 paint = mix(veg, bare, rocky);
          // the photo still decides between green and bare where it is sure (broad scale only)
          float g = clamp((satB.g - max(satB.r, satB.b)) * 8.0, 0.0, 1.0);
          paint = mix(paint, veg, g * (1.0 - st) * (1.0 - smoothstep(1800.0, 2100.0, y)) * 0.5);
          float lum = dot(satB, vec3(0.3, 0.55, 0.15));
          paint *= mix(1.0, clamp(lum / 0.32, 0.8, 1.15), 0.3);
          float far = smoothstep(500.0, 2500.0, dist);
          col = mix(col, paint, far * 0.92);
          fl *= 1.0 - far * 0.7;               // the ribs would re-draw the patches at this distance
        }
        col *= clamp(1.0 + fl * 1.1, 0.45, 1.5);
        // soft shoulder for very light ground (granite scree, limestone): keeps texture instead of white
        { float cl = dot(col, vec3(0.3, 0.55, 0.15)); col *= 1.0 / (1.0 + max(cl - 0.42, 0.0) * 1.6); }
        // weather: wet ground is darker; fresh snow settles above the snow line on the gentler slopes
        col *= 1.0 - 0.3 * wetK;
        if (snowK > 0.0) {
          float sy = vWorld.y + (vnoise(vWorld.xz / 60.0) - 0.5) * 120.0;
          float flatN = smoothstep(0.5, 0.78, normalize(vWN).y);
          float sn = snowK * smoothstep(snowLine - 80.0, snowLine + 120.0, sy) * flatN;
          col = mix(col, vec3(0.78, 0.8, 0.84), clamp(sn, 0.0, 0.92));
        }
        diffuseColor.rgb = col;
        if (detW <= 0.0) { detN = Nr; detW = 1.0; }
        else { detN = normalize(mix(Nr, detN, detW)); detW = 1.0; }
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

// Lakes: deep green-blue, mirror reflection of the mountains (planar, for the lake nearest to the
// camera; others reflect the sky colour), fresnel, rippling sun glint.
export function waterMaterial() {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      skyCol: { value: new THREE.Color(0.5, 0.65, 0.85) },
      reflMap: { value: null }, reflMat: { value: new THREE.Matrix4() }, reflLevel: { value: -1e4 }, reflOn: { value: 0 },
    }]),
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
      uniform sampler2D reflMap; uniform mat4 reflMat; uniform float reflLevel; uniform float reflOn;
      uniform float windK; uniform float rainK;
      varying vec3 vWorld;
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
        float amp = 0.12 + 0.35 * w;
        float h0 = fbm2(p*0.35 + time*vec2(0.05,0.03)*drift) + 0.5*fbm2(p*1.3 - time*vec2(0.04,-0.06)*drift);
        float hx = fbm2((p+vec2(e,0))*0.35 + time*vec2(0.05,0.03)*drift) + 0.5*fbm2((p+vec2(e,0))*1.3 - time*vec2(0.04,-0.06)*drift);
        float hz = fbm2((p+vec2(0,e))*0.35 + time*vec2(0.05,0.03)*drift) + 0.5*fbm2((p+vec2(0,e))*1.3 - time*vec2(0.04,-0.06)*drift);
        float gust = smoothstep(0.45, 0.75, fbm2(p * 0.02 - time * 0.08 * drift));
        vec3 N = normalize(vec3(-(hx-h0)*amp*(1.0 + gust*w*0.8), 1.0, -(hz-h0)*amp*(1.0 + gust*w*0.8)));
        if (rainK > 0.01) { vec2 rr = rainRings(p, time); N = normalize(N + vec3(rr.x, 0.0, rr.y) * 0.25 * rainK); }
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 deep = vec3(0.004, 0.03, 0.035) * (ambCol + sunCol * 0.4);
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, sunDir), 0.0), 220.0) * 6.0;
        vec3 refl = skyCol;
        if (reflOn > 0.5 && abs(vWorld.y - reflLevel) < 0.6) {
          vec4 pc = reflMat * vec4(vWorld, 1.0);
          float dist = length(cameraPosition - vWorld);
          // ripples bend the mirror image, less so far away (they are too small to see there)
          vec2 ruv = pc.xy / pc.w + N.xz * (0.035 / (1.0 + dist * 0.004));
          vec3 m = texture2D(reflMap, clamp(ruv, 0.001, 0.999)).rgb;
          // soften the edge of the reflection texture
          float edge = smoothstep(0.0, 0.03, min(min(ruv.x, 1.0 - ruv.x), min(ruv.y, 1.0 - ruv.y)));
          refl = mix(skyCol, m, edge);
          // a calm mountain lake: reflection stays visible even looking down
          fres = max(fres, 0.32);
        }
        // a glittering path towards a low sun
        float glit = pow(max(dot(R, sunDir), 0.0), 40.0) * smoothstep(0.35, 0.0, sunDir.y) * step(0.93, fbm2(p * 6.0 + time * 0.7));
        vec3 col = mix(deep, refl, fres) + sunCol * (spec + glit * 3.0) * step(0.0, sunDir.y);
        // whitecaps in a gale
        if (w > 1.7) col = mix(col, vec3(0.85) * (ambCol + sunCol * 0.5), smoothstep(0.62, 0.72, h0 + gust * 0.15) * (w - 1.7) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, { sunDir: light.sunDir, sunCol: light.sunCol, ambCol: light.ambCol, time: light.time, windK: light.windK, rainK: light.rainK });
  return m;
}
