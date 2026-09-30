// Real 3D spruces near the camera: a tapered trunk and whorls of drooping branch cards (wedges of the
// Poly Haven fir crown baked from above, tools/blender/bake_branches.py). Within ~R metres of the
// camera the flat impostors dissolve and these take their place (a dithered cross-fade over 12 m, the
// same noise in both, so there is no gap and no double tree), shadows included.
import * as THREE from 'three';
import { HEIGHTS } from './materials.js';
import { treeFade, mugoFade } from './impostor.js';
import { rng } from './noise.js';

const FADE = 12;
const IGN = 'fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))';

// one card spruce of unit height (y 0..1), crown radius 0.5 at the bottom; scaled per instance
function spruceGeometry(seed, cards) {
  const r = rng(seed), rows = cards.length;
  const B = { pos: [], nor: [], uv: [], idx: [] }, T = { pos: [], nor: [], uv: [], idx: [] };
  const ASPECT = 0.32;                        // crown width / height of a typical spruce (vertical offsets)
  // trunk: 7-sided tube tapering to the top
  const SIDES = 7, RINGS = 6;
  for (let j = 0; j <= RINGS; j++) {
    const t = j / RINGS, y = t * 0.97, rad = 0.028 * (1 - t) + 0.003;
    for (let k = 0; k <= SIDES; k++) {
      const a = k / SIDES * 6.2832, cx = Math.cos(a), cz = Math.sin(a);
      T.pos.push(cx * rad, y, cz * rad); T.nor.push(cx, 0, cz); T.uv.push(k / SIDES, y * 8);
    }
  }
  for (let j = 0; j < RINGS; j++) for (let k = 0; k < SIDES; k++) {
    const a = j * (SIDES + 1) + k, b = a + SIDES + 1;
    T.idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // branches: whorls every ~2.5 % of the height, 5-7 per whorl, shorter towards the top
  const card = (o, d, L, w, roll, row) => {
    const px = -d[2], pz = d[0];                                     // horizontal, across the branch
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const c = [px * cr, sr * ASPECT, pz * cr];
    const base = B.pos.length / 3;
    const SEG = 3;
    for (let s = 0; s <= SEG; s++) {
      const f = s / SEG;
      // droops along its length, the tip turning up a little
      const dy = -L * ASPECT * (0.55 * f - 0.25 * f * f);
      const x = o[0] + d[0] * L * f, y = o[1] + dy, z = o[2] + d[2] * L * f;
      // normal: across x along (roughly up)
      const ax = d[0], ay = -ASPECT * (0.55 - 0.5 * f), az = d[2];
      let nx = c[1] * az - c[2] * ay, ny = c[2] * ax - c[0] * az, nz = c[0] * ay - c[1] * ax;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      for (const side of [-1, 1]) {
        B.pos.push(x + c[0] * w * 0.5 * side, y + c[1] * w * 0.5 * side, z + c[2] * w * 0.5 * side);
        B.nor.push(nx / nl, ny / nl, nz / nl);
        B.uv.push(f, (row + (side < 0 ? 1 : 0)) / rows);
      }
    }
    for (let s = 0; s < SEG; s++) { const a = base + s * 2; B.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  for (let y = 0.07; y < 0.975; y += 0.021 + r() * 0.008) {
    const R = 0.5 * Math.pow(1 - y, 0.92) * (0.85 + r() * 0.3) + 0.015;
    const n = 5 + Math.floor(r() * 3), a0 = r() * 6.2832;
    for (let k = 0; k < n; k++) {
      const az = a0 + k * 6.2832 / n + (r() - 0.5) * 0.6;
      const d = [Math.cos(az), 0, Math.sin(az)];
      const L = R * (0.8 + r() * 0.3), w = L * 0.55;
      const row = Math.floor(r() * rows);
      card([d[0] * 0.02, y, d[2] * 0.02], d, L, w, 0.45 + r() * 0.2, row);
      card([d[0] * 0.02, y - 0.004, d[2] * 0.02], d, L * 0.95, w, -0.45 - r() * 0.2, (row + 1) % rows);
    }
  }
  const make = (G) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
    g.setIndex(G.idx);
    return g;
  };
  return { branches: make(B), trunk: make(T) };
}

// shared shader additions: terrain shadow, wind, and the cross-fade with the impostors
function patch(m, shade, { wind = 0.5, upNormal = 0, depth = false, fadeR = treeFade.R, key = 'tree3d' } = {}) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shade, { fadeCam: treeFade.cam, fadeR });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${depth ? 'uniform float time;' : HEIGHTS + '\nvarying float vTerrSh;'}
        uniform vec3 fadeCam; varying float vFadeD;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ipos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vFadeD = distance(ipos.xz, fadeCam.xz);
        {
          float ph = time * 1.3 + ipos.x * 0.07 + ipos.z * 0.05;
          float amt = ${wind.toFixed(2)} * position.y * position.y * 0.012;
          transformed.x += sin(ph) * amt; transformed.z += cos(ph * 0.8) * amt;
        }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        ${depth ? '' : 'vTerrSh = terrainShadow((modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz) * cloudShadow(ipos);'}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float fadeR; varying float vFadeD; ${depth ? '' : 'varying float vTerrSh;'}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (${IGN} >= clamp((fadeR - vFadeD) / ${FADE.toFixed(1)}, 0.0, 1.0)) discard;`);
    if (!depth) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), ${upNormal.toFixed(2)}));`)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directDiffuse *= vTerrSh;');
    }
  };
  m.customProgramCacheKey = () => key + depth + upNormal + wind;
  return m;
}

export async function buildTrees3D({ scene, shade, items, radius, base = 'models/', loadTexture }) {
  const meta = await (await fetch(base + 'branch.json')).json();
  const [albedo, normal, bark] = await Promise.all([
    loadTexture(base + 'branch_albedo.webp', true), loadTexture(base + 'branch_normal.webp', false), loadTexture(base + 'bark.jpg', true)]);
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  const branchMat = patch(new THREE.MeshLambertMaterial({ map: albedo, normalMap: normal, normalScale: new THREE.Vector2(1, -1),
    alphaTest: 0.5, side: THREE.DoubleSide }), shade, { upNormal: 0.3 });
  const trunkMat = patch(new THREE.MeshLambertMaterial({ map: bark }), shade, { wind: 0.2 });
  const branchDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: albedo, alphaTest: 0.5, side: THREE.DoubleSide }), shade, { depth: true });
  const trunkDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), shade, { depth: true, wind: 0.2 });

  const VARIANTS = 3, CAP = 700;
  const variants = [];
  for (let v = 0; v < VARIANTS; v++) {
    const g = spruceGeometry(101 + v * 17, meta.cards);
    const mk = (geo, mat, dm) => {
      const m = new THREE.InstancedMesh(geo, mat, CAP);
      m.customDepthMaterial = dm; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(m);
      return m;
    };
    variants.push({ branches: mk(g.branches, branchMat, branchDepth), trunk: mk(g.trunk, trunkMat, trunkDepth) });
  }
  const tris = variants[0].branches.geometry.index.count / 3;
  treeFade.R.value = radius;

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  let last = { x: Infinity, z: Infinity };
  function update(cam) {
    treeFade.cam.value.copy(cam);
    if (Math.hypot(cam.x - last.x, cam.z - last.z) < 4) return;
    last = { x: cam.x, z: cam.z };
    const counts = new Array(VARIANTS).fill(0);
    const r2 = (radius + 2) * (radius + 2);
    for (const list of items) for (const t of list) {
      const dx = t.x - cam.x, dz = t.z - cam.z;
      if (dx * dx + dz * dz > r2) continue;
      const v = t.row % VARIANTS, V = variants[v];
      const i = counts[v];
      if (i >= CAP) continue;
      Q.setFromAxisAngle(Y, t.rot);
      S.set(t.cw, t.th, t.cw); Pv.set(t.x, t.ty, t.z);
      M.compose(Pv, Q, S);
      V.branches.setMatrixAt(i, M); V.trunk.setMatrixAt(i, M);
      const k = 0.9 + t.tint * 0.25;
      V.branches.setColorAt(i, col.setRGB(k * 1.1, k * 1.1, k * 1.1));
      counts[v]++;
    }
    variants.forEach((V, v) => {
      for (const m of [V.branches, V.trunk]) {
        m.count = counts[v];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    });
  }
  return { update, tris, get count() { return variants.reduce((s, V) => s + V.branches.count, 0); } };
}

// ---------------------------------------------------------------- dwarf pine
// Kosodrzewina near the camera: 9-13 stems rise from one root, lean outwards (the outer ones almost lie on
// the slope) and turn up at the ends; the upper part of each carries crossed cards of upturned needle
// shoots (the tops of pine saplings baked from the side, tools/blender/bake_mugo_cards.py), the tip a
// longer one and a rosette seen from above. Unit clump: 1 wide, 1 high; scaled per instance.
function mugoGeometry(seed, cards) {
  const r = rng(seed);
  const side = cards.map((c, i) => ({ ...c, i })).filter((c) => c.view === 'side'), top = cards.findIndex((c) => c.view === 'top');
  const n = cards.length;
  const B = { pos: [], nor: [], uv: [], idx: [] }, T = { pos: [], nor: [], uv: [], idx: [] };
  // a quad card from p along dir (length L, width W, across vector a), texture column `col`
  const quad = (p, dir, a, L, W, col) => {
    const nx = dir[1] * a[2] - dir[2] * a[1], ny = dir[2] * a[0] - dir[0] * a[2], nz = dir[0] * a[1] - dir[1] * a[0];
    const base = B.pos.length / 3;
    for (const [f, sd] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
      B.pos.push(p[0] + dir[0] * L * f + a[0] * W * 0.5 * sd, p[1] + dir[1] * L * f + a[1] * W * 0.5 * sd, p[2] + dir[2] * L * f + a[2] * W * 0.5 * sd);
      // the card's own normal, tilted to the sky: needles scatter light, flat cards would go dark edge-on
      const up = 0.6, l = Math.hypot(nx * (1 - up), ny * (1 - up) + up, nz * (1 - up)) || 1;
      B.nor.push(nx * (1 - up) / l, (Math.abs(ny) * (1 - up) + up) / l, nz * (1 - up) / l);
      B.uv.push((col + (sd < 0 ? 0 : 1)) / n, 1 - f);            // the bitmap is not flipped: v = 0 is the top
    }
    B.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const stems = 9 + Math.floor(r() * 5);
  for (let k = 0; k < stems; k++) {
    const az = (k + r() * 0.7) / stems * 6.2832, inner = k < 2;
    const tilt = inner ? 0.25 + r() * 0.35 : 0.95 + r() * 0.45;          // from vertical, radians
    const L = inner ? 0.45 + r() * 0.2 : 0.5 + r() * 0.25;
    const h = [Math.cos(az), 0, Math.sin(az)];
    // the stem: leaves the root at `tilt`, bends up towards the tip
    const P = (t) => {
      const reach = L * Math.sin(tilt) * t - 0.15 * L * t * t * Math.sin(tilt);
      const rise = L * Math.cos(tilt) * t + 0.35 * L * t * t;
      return [h[0] * (0.03 + reach), rise, h[2] * (0.03 + reach)];
    };
    // bark tube, 4 sides
    const SEG = 4, SIDES = 4, t0 = T.pos.length / 3;
    for (let j = 0; j <= SEG; j++) {
      const t = j / SEG, c = P(t), d = norm(P(Math.min(1, t + 0.05)).map((v, q) => v - P(Math.max(0, t - 0.05))[q]));
      const a = norm(cross(d, [0, 1, 0]).map((v, q) => v || (q === 0 ? 1 : 0))), b = cross(a, d);
      const rad = 0.018 * (1 - t * 0.7);
      for (let q = 0; q <= SIDES; q++) {
        const an = q / SIDES * 6.2832, ca = Math.cos(an), sa = Math.sin(an);
        const nn = [a[0] * ca + b[0] * sa, a[1] * ca + b[1] * sa, a[2] * ca + b[2] * sa];
        T.pos.push(c[0] + nn[0] * rad, c[1] + nn[1] * rad, c[2] + nn[2] * rad); T.nor.push(...nn); T.uv.push(q / SIDES, t * 3);
      }
    }
    for (let j = 0; j < SEG; j++) for (let q = 0; q < SIDES; q++) {
      const a = t0 + j * (SIDES + 1) + q, b = a + SIDES + 1;
      T.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    // needle shoots along the upper stem, pointing mostly up; two crossed cards each
    for (let t = 0.3 + r() * 0.1; t <= 1.001; t += 0.13 + r() * 0.06) {
      const p = P(Math.min(1, t)), tip = t > 0.93;
      const sd = norm(P(Math.min(1, t + 0.05)).map((v, q) => v - P(Math.max(0, t - 0.05))[q]));
      const out = [h[0] * (r() - 0.3), 0, h[2] * (r() - 0.3)];
      const dir = norm([sd[0] * 0.35 + out[0] * 0.3, 0.75 + sd[1] * 0.3, sd[2] * 0.35 + out[2] * 0.3]);
      const c = side[Math.floor(r() * side.length)];
      const Ls = (tip ? 0.36 : 0.24 + r() * 0.1) * (inner ? 0.9 : 1);
      const a0 = norm(cross(dir, [Math.cos(az + r()), 0, Math.sin(az + r())]));
      const a1 = norm(cross(dir, a0));
      quad(p, dir, a0, Ls, Ls, c.i);
      quad(p, dir, a1, Ls, Ls, c.i);
      if (tip && top >= 0) {
        // a rosette of needles on top of the shoot
        const q = [p[0] + dir[0] * Ls * 0.55, p[1] + dir[1] * Ls * 0.55, p[2] + dir[2] * Ls * 0.55];
        const ra = r() * 6.28, fx = [Math.cos(ra), 0, Math.sin(ra)];
        quad([q[0] - fx[2] * Ls * 0.35, q[1], q[2] + fx[0] * Ls * 0.35], [fx[2], 0.15, -fx[0]], fx, Ls * 0.7, Ls * 0.7, top);
      }
    }
  }
  // normalise: width 1 (x and z within ±0.5), height 1
  let mx = 0, my = 0;
  for (let i = 0; i < B.pos.length; i += 3) { mx = Math.max(mx, Math.abs(B.pos[i]), Math.abs(B.pos[i + 2])); my = Math.max(my, B.pos[i + 1]); }
  for (const G of [B, T]) for (let i = 0; i < G.pos.length; i += 3) { G.pos[i] *= 0.5 / mx; G.pos[i + 1] /= my; G.pos[i + 2] *= 0.5 / mx; }
  const make = (G) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
    g.setIndex(G.idx);
    return g;
  };
  return { branches: make(B), trunk: make(T) };
}

export async function buildMugo3D({ scene, shade, items, radius, base = 'models/', loadTexture }) {
  const meta = await (await fetch(base + 'mugo_cards.json')).json();
  const [albedo, normal, bark] = await Promise.all([
    loadTexture(base + 'mugo_card_albedo.webp', true), loadTexture(base + 'mugo_card_normal.webp', false), loadTexture(base + 'bark.jpg', true)]);
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  const o = { fadeR: mugoFade.R, key: 'mugo3d' };
  const needleMat = patch(new THREE.MeshLambertMaterial({ map: albedo, normalMap: normal, normalScale: new THREE.Vector2(1, -1),
    alphaTest: 0.5, side: THREE.DoubleSide }), shade, { ...o, upNormal: 0.35, wind: 0.8 });
  const barkMat = patch(new THREE.MeshLambertMaterial({ map: bark, color: 0x6a5a4a }), shade, { ...o, wind: 0.4 });
  const needleDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: albedo, alphaTest: 0.5, side: THREE.DoubleSide }), shade, { ...o, depth: true, wind: 0.8 });
  const VARIANTS = 4, CAP = 500;
  const variants = [];
  for (let v = 0; v < VARIANTS; v++) {
    const g = mugoGeometry(311 + v * 29, meta.cards);
    const mk = (geo, mat, dm) => {
      const m = new THREE.InstancedMesh(geo, mat, CAP);
      if (dm) { m.customDepthMaterial = dm; m.castShadow = true; }
      m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(m);
      return m;
    };
    variants.push({ branches: mk(g.branches, needleMat, needleDepth), trunk: mk(g.trunk, barkMat, null) });
  }
  const tris = (variants[0].branches.geometry.index.count + variants[0].trunk.geometry.index.count) / 3;
  mugoFade.R.value = radius;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  let last = { x: Infinity, z: Infinity };
  function update(cam) {
    if (Math.hypot(cam.x - last.x, cam.z - last.z) < 3) return;
    last = { x: cam.x, z: cam.z };
    const counts = new Array(VARIANTS).fill(0);
    const r2 = (radius + 2) * (radius + 2);
    for (const t of items) {
      const dx = t.x - cam.x, dz = t.z - cam.z;
      if (dx * dx + dz * dz > r2) continue;
      const v = t.row % VARIANTS, V = variants[v], i = counts[v];
      if (i >= CAP) continue;
      Q.setFromAxisAngle(Y, t.rot);
      S.set(t.cw, t.th, t.cw); Pv.set(t.x, t.ty, t.z);
      M.compose(Pv, Q, S);
      V.branches.setMatrixAt(i, M); V.trunk.setMatrixAt(i, M);
      const k = 0.85 + t.tint * 0.3;
      V.branches.setColorAt(i, col.setRGB(k, k, k));
      counts[v]++;
    }
    variants.forEach((V, v) => {
      for (const m of [V.branches, V.trunk]) {
        m.count = counts[v];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    });
  }
  return { update, tris, get count() { return variants.reduce((s, V) => s + V.branches.count, 0); } };
}
