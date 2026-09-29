// Real 3D spruces near the camera: a tapered trunk and whorls of drooping branch cards (wedges of the
// Poly Haven fir crown baked from above, tools/blender/bake_branches.py). Within ~R metres of the
// camera the flat impostors dissolve and these take their place (a dithered cross-fade over 12 m, the
// same noise in both, so there is no gap and no double tree), shadows included.
import * as THREE from 'three';
import { HEIGHTS } from './materials.js';
import { treeFade } from './impostor.js';
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
function patch(m, shade, { wind = 0.5, upNormal = 0, depth = false } = {}) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shade, { fadeCam: treeFade.cam, fadeR: treeFade.R });
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
  m.customProgramCacheKey = () => 'tree3d' + depth + upNormal + wind;
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
