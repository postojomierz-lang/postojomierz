// Grass as in games: tens of thousands of single blades around the camera, drawn in one instanced call.
// Each blade is a tapered, curved strip, dark at the base and light at the tip, bending with the wind.
// The field moves with the camera without any work on the CPU: every blade has a fixed spot in a square
// that wraps around the camera (so a blade never jumps while you walk). Two fields: a dense one near the
// camera and a sparse one of bigger blades further out.
// Where it grows and how it looks comes from a small window of data around the camera, rebuilt on the
// CPU when the camera has moved: the 1 m terrain height, the terrain's own shadow (ridges at low sun),
// the density (the 1 m class map: meadows full, gravel and dwarf pine thin, scree hardly, no grass on the
// path, water or rock faces; the photo where there is no map), the blade height (shorter up high) and
// the colour of the ground in the orthophoto (so the grass blends into the ground further away).
import * as THREE from 'three';

const hash = (i, j, k) => {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// one instance = a tuft of `blades` blades, each with `seg` segments and a pointed tip: x across
// (-0.5..0.5), y up (0..1); aSub per vertex: the blade's offset in the tuft (m), its own turn, its height
function bladeGeometry(seg, blades) {
  const pos = [], sub = [], idx = [];
  let rs = 12345;
  const rand = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  for (let b = 0; b < blades; b++) {
    const a = rand() * 6.2832, r = Math.sqrt(rand()) * 0.12;
    const sb = [Math.cos(a) * r, Math.sin(a) * r, rand() * 6.2832, 0.6 + rand() * 0.6];
    const v0 = pos.length / 3;
    for (let s = 0; s < seg; s++) {
      const y = s / seg;
      pos.push(-0.5, y, 0, 0.5, y, 0); sub.push(...sb, ...sb);
    }
    pos.push(0, 1, 0); sub.push(...sb);
    for (let s = 0; s < seg - 1; s++) { const q = v0 + s * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    const q = v0 + (seg - 1) * 2; idx.push(q, q + 1, v0 + seg * 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('aSub', new THREE.Float32BufferAttribute(sub, 4));
  g.setIndex(idx);
  return g;
}

const VERT_HEAD = /* glsl */`
  attribute vec4 aBlade;                 // x, z in the field (0..1), two random numbers
  attribute vec4 aSub;                   // the blade in its tuft: offset x, z (m), turn, height
  uniform vec2 gCam; uniform float gSize; uniform float gHole; uniform float gFade;
  uniform vec4 gWin; uniform float gYRef; uniform sampler2D gData; uniform sampler2D gCol;
  uniform float gW; uniform float gH; uniform float gTime; uniform float gDensity; uniform float gWind;
  varying vec3 vGCol; varying float vGSh; varying float vGY;
  vec3 gPos; vec3 gNor;
  float gHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void grassBlade() {
    // the blade's spot: its fixed place in a square of gSize metres that wraps around the camera
    vec2 o = gCam - gSize * 0.5;
    vec2 w = o + mod(aBlade.xy * gSize - o, gSize);
    float d = distance(w, gCam);
    vec2 uv = (w - gWin.xy) / (gWin.zw - gWin.xy);
    vec4 dat = texture2D(gData, uv);                 // height, terrain shadow, blade height, -
    vec4 col = texture2D(gCol, uv);                  // ground colour, density
    // fewer blades towards the edge of the field (and inside the hole of the outer one): no hard line
    float edge = clamp((gSize * 0.5 - d) / gFade, 0.0, 1.0) * clamp((d - gHole) / gFade, 0.0, 1.0);
    float keep = col.a * gDensity * edge;
    bool inside = uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0;
    if (!inside || aBlade.z >= keep) { gPos = vec3(0.0, -1e5, 0.0); gNor = vec3(0.0, 1.0, 0.0); return; }
    float r = aBlade.w;
    float H = gH * dat.b * (0.6 + 0.7 * fract(r * 7.13)) * aSub.w * (0.6 + 0.4 * edge);
    float W = gW * (0.7 + 0.6 * fract(r * 3.71));
    float yaw = r * 6.2832 + aSub.z;
    float cy = cos(r * 6.2832), sy = sin(r * 6.2832);
    w += vec2(aSub.x * cy - aSub.y * sy, aSub.x * sy + aSub.y * cy);
    vec2 face = vec2(cos(yaw), sin(yaw)), across = vec2(-face.y, face.x);
    // bend: a resting curve along the blade's facing, plus the wind (a slow swell and gusts)
    float y = position.y;
    float gust = sin(gTime * (1.2 + 0.5 * gWind) + w.x * 0.21 + w.y * 0.17) * 0.5 + 0.5;
    gust = min(gust * (0.6 + 0.4 * sin(gTime * 0.53 + w.x * 0.05)) * gWind, 1.7);
    vec2 windDir = normalize(vec2(0.8, 0.6));
    float lean = 0.2 + 0.5 * fract((r + aSub.z) * 11.3);
    vec2 bendXZ = (face * lean + windDir * gust * 0.55) * H * y * y;
    float drop = (lean * lean * 0.3 + gust * 0.12) * H * y * y;
    gPos = vec3(w.x, dat.r + gYRef, w.y)
      + vec3(across.x, 0.0, across.y) * position.x * W * (1.0 - y * 0.85)
      + vec3(bendXZ.x, y * H - drop, bendXZ.y);
    // normal: the blade's face, bent towards the sky (thin blades scatter light; flat ones go dark edge-on)
    vec3 n = normalize(vec3(face.x, 0.0, face.y) * (1.0 - y * 0.4) + vec3(0.0, 0.25 + y, 0.0));
    gNor = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.55));
    // colour: the photo's ground colour pulled towards a lush green, darker at the root, light at the tip
    vec3 ground = pow(col.rgb, vec3(2.2));
    vec3 lush = vec3(0.10, 0.22, 0.035);
    vec3 base = mix(ground, lush, 0.4);
    float v = 0.85 + 0.3 * fract(r * 5.9);
    vGCol = mix(base * 0.4, base * 1.15 + vec3(0.02, 0.03, 0.0), y) * v;
    vGSh = dat.g;
    vGY = y;
  }
`;

function grassMaterial(uniforms, shade) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <beginnormal_vertex>', 'grassBlade();\nvec3 objectNormal = gNor;')
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGCol; varying float vGSh; varying float vGY;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vGCol;')
      // both faces of a blade take the same normal (the flipped back face would go black against the sun)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= vGSh;
        // light through the blades when the sun is behind them
        reflectedLight.indirectDiffuse += vGCol * 0.25 * vGY;`);
  };
  m.customProgramCacheKey = () => 'grass-blades';
  void shade;
  return m;
}

export function buildGrass({ scene, terrain, shade, quality, photo, bounds, groundClass, masks, blocked = () => false }) {
  const t = (low, mid, high, ultra) => ({ low, mid, high, ultra })[quality] ?? high;
  // [field size (m), blades per m², blade width, blade height, segments, hole]
  const INNER = { size: t(16, 22, 30, 38), per: t(10, 22, 55, 75), w: 0.05, h: 0.32, seg: t(3, 3, 4, 4), blades: 5 };   // tufts per m²
  const OUTER = quality === 'low' ? null : { size: t(0, 56, 90, 120), per: t(0, 1.5, 2.5, 3.5), w: 0.06, h: 0.38, seg: 2, blades: 4 };
  const WIN = Math.ceil((OUTER ? OUTER.size : INNER.size) + 32);      // the data window (1 m texels)

  // half floats filter linearly everywhere (full floats not on every phone); heights relative to the camera's
  const data = new Float32Array(WIN * WIN * 4), half = new Uint16Array(WIN * WIN * 4), cols = new Uint8Array(WIN * WIN * 4);
  const dataTex = new THREE.DataTexture(half, WIN, WIN, THREE.RGBAFormat, THREE.HalfFloatType);
  dataTex.magFilter = dataTex.minFilter = THREE.LinearFilter;
  const colTex = new THREE.DataTexture(cols, WIN, WIN, THREE.RGBAFormat);
  colTex.magFilter = colTex.minFilter = THREE.LinearFilter;
  const common = {
    gCam: { value: new THREE.Vector2() }, gWin: { value: new THREE.Vector4(0, 0, 1, 1) }, gYRef: { value: 0 },
    gData: { value: dataTex }, gCol: { value: colTex }, gTime: shade.time, gWind: shade.windK,
  };

  const fields = [];
  for (const [k, F] of [INNER, OUTER].entries()) {
    if (!F) continue;
    const n = Math.round(F.size * F.size * F.per);
    const g = bladeGeometry(F.seg, F.blades);
    // a proper generator (mulberry32): a hash of consecutive indices lines the blades up in rows
    const a = new Float32Array(n * 4);
    let seed = 0x9e3779b9 ^ (k * 0x85ebca6b);
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < n * 4; i++) a[i] = rand();
    g.setAttribute('aBlade', new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = n;
    const u = {
      ...common, gSize: { value: F.size }, gHole: { value: k ? INNER.size * 0.5 - 4 : -1 }, gFade: { value: k ? 6 : 4 },
      gW: { value: F.w }, gH: { value: F.h }, gDensity: { value: 1 },
    };
    const mesh = new THREE.Mesh(g, grassMaterial(u, shade));
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    scene.add(mesh);
    fields.push({ mesh, n, u, blades: F.blades });
  }

  // the terrain's own shadow at (x, y, z) for the current sun, as in the terrain shader
  const sun = shade.sunDir.value;
  const shadowAt = (x, y, z) => {
    if (sun.y <= -0.02) return 0;
    let tt = 25, s = 1;
    for (let i = 0; i < 26; i++) {
      const qx = x + sun.x * tt, qy = y + sun.y * tt, qz = z + sun.z * tt;
      s = Math.min(s, Math.max(0, Math.min(1, (qy + 10 - terrain.base(qx, qz)) / (tt * 0.035) + 0.5)));
      if (s <= 0 || tt > 12000) break;
      tt *= 1.45;
    }
    return s;
  };
  const [bx0, bz0, bx1, bz1] = bounds;
  let last = { x: Infinity, z: Infinity }, lastSun = new THREE.Vector3();
  // thinner grass where the catalogue's small plants grow, so the flowers are not lost in it
  let clearings = [];
  function setClearings(list) { clearings = list; last = { x: Infinity, z: Infinity }; }
  function rebuild(cx, cz) {
    const x0 = Math.round(cx) - WIN / 2, z0 = Math.round(cz) - WIN / 2, yRef = terrain.height(cx, cz);
    for (let j = 0; j < WIN; j++) for (let i = 0; i < WIN; i++) {
      const x = x0 + i + 0.5, z = z0 + j + 0.5, o = (j * WIN + i) * 4;
      const y = terrain.height(x, z);
      data[o] = y;
      // terrain shadow on a 4 m grid is plenty (it is soft), copied in between
      data[o + 1] = (i % 4 === 0 && j % 4 === 0) ? shadowAt(x, y, z) : data[((j - j % 4) * WIN + (i - i % 4)) * 4 + 1];
      data[o + 2] = y > 1850 ? Math.max(0.45, 1 - (y - 1850) / 500) : 1;      // alpine sward: shorter
      // ground colour from the photo
      const u = Math.floor((x - bx0) / (bx1 - bx0) * photo.w), v = Math.floor((z - bz0) / (bz1 - bz0) * photo.h);
      let r = 90, g = 110, b = 60;
      if (u >= 0 && v >= 0 && u < photo.w && v < photo.h) { const p = (v * photo.w + u) * 4; r = photo.d[p]; g = photo.d[p + 1]; b = photo.d[p + 2]; }
      cols[o] = r; cols[o + 1] = g; cols[o + 2] = b;
      // density
      // the class map, raised where the photo shows grass (the map's 'dwarf pine' and 'forest' include the
      // meadow patches between the clumps and trees; grassy scree is common too)
      const exg = (2 * g - r - b) / Math.max(1, r + g + b);
      const fromPhoto = exg > 0.08 ? 0.9 : exg > 0.04 ? 0.6 : exg > 0.015 ? 0.3 : 0.05;
      let dens;
      const gc = groundClass(x, z);
      if (gc) {
        dens = [0, 0, 0.03, 0.12 * (1 - Math.min(1, gc.r / 120)), 1, 0.5, 0.35, 0, 0.4][gc.c] ?? 0;
        if (gc.c !== 1 && gc.c !== 2 && gc.c !== 7) dens = Math.max(dens, fromPhoto * (gc.c === 3 ? 0.6 : 0.9));
      } else dens = fromPhoto;
      if (dens > 0) {
        // water: the class map knows it to the metre; the lake mask (drawn with a 30 m stroke on a 5 m grid,
        // it reaches ~20 m onto the shores) only where there is no map
        if ((!gc && terrain.maskAt(masks.lake, x, z) > 0.5) || blocked(x, z)) dens = 0;
        else {
          const path = terrain.maskAt(masks.path, x, z);           // the sharp path mask (1.3 m texels)
          if (path > 0.3) dens = 0;
          else if (terrain.maskAt(masks.pathSide, x, z) > 0) dens *= 0.7;        // trodden fringe
          const n = terrain.normal(x, z, 1.5);
          // Tatra grass holds on steep slopes too (bare rock is the class map's job); only very steep ground thins
          if (n.y < 0.5) dens *= Math.max(0, (n.y - 0.3) / 0.2);
        }
      }
      for (const c of clearings) if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r) { dens *= 0.3; break; }
      cols[o + 3] = Math.round(Math.max(0, Math.min(1, dens)) * 255);
    }
    for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat((i & 3) === 0 ? data[i] - yRef : data[i]);
    common.gYRef.value = yRef;
    dataTex.needsUpdate = true; colTex.needsUpdate = true;
    common.gWin.value.set(x0, z0, x0 + WIN, z0 + WIN);
    last = { x: cx, z: cz }; lastSun.copy(sun);
  }
  function update(cam) {
    common.gCam.value.set(cam.x, cam.z);
    if (Math.hypot(cam.x - last.x, cam.z - last.z) > 12 || sun.dot(lastSun) < 0.99995) rebuild(cam.x, cam.z);
  }
  const debug = () => { const c = ((WIN / 2) * WIN + WIN / 2) * 4; return { yRef: common.gYRef.value, cam: common.gCam.value.toArray(), win: common.gWin.value.toArray(), h: data[c], half: half[c], back: THREE.DataUtils.fromHalfFloat(half[c]), dens: cols[c + 3], sh: data[c + 1], share: (() => { let k = 0, m = 0; for (let i = 3; i < cols.length; i += 4) { if (cols[i] > 0) k++; m += cols[i]; } return [k / (WIN * WIN), m / (WIN * WIN) / 255]; })(), hs: [data[0], data[(WIN * 10 + 70) * 4], data[(WIN * 90 + 30) * 4]].map((v) => v - common.gYRef.value) }; };
  const at = (x, z) => { const w = common.gWin.value, i = Math.floor(x - w.x), j = Math.floor(z - w.y); if (i < 0 || j < 0 || i >= WIN || j >= WIN) return null; const o = (j * WIN + i) * 4; return { dens: cols[o + 3], h: data[o], sh: data[o + 1], gc: groundClass(x, z), n: terrain.normal(x, z, 1.5).y, path: terrain.maskAt(masks.path, x, z), side: terrain.maskAt(masks.pathSide, x, z), lake: terrain.maskAt(masks.lake, x, z), blocked: blocked(x, z) }; };
  return { update, setClearings, debug, at, blades: fields.reduce((s, f) => s + f.n * f.blades, 0), fields };
}
