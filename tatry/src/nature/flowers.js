// The catalogue's plants where they grow: at every plant's spot a patch of little plants built here from a
// few shapes (bells, stars, cups, spikes, rosettes, fronds, tufts, shrubs) in the species' colours and
// sizes, so the plant one has just discovered is there to see. Trees are the forest's own; the patches
// are for flowers, herbs, ferns, grasses and dwarf shrubs. One mesh for all patches of a route (vertex
// colours), a few hundred triangles each.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BY_ID } from './catalog.js';
import { rng } from '../noise.js';
import { cullByDistance } from '../lod.js';

// the best-known plants modelled in Blender (tools/blender/make_flowers.py): drawn as instances of the
// model instead of the simple shapes
const MODELS = ['szarotka', 'goryczka-krotkolodygowa', 'goryczka-kropkowana', 'goryczka-przezroczysta', 'krokus', 'sasanka', 'urdzik'];
export async function loadFlowerModels() {
  const loader = new GLTFLoader(), out = {};
  await Promise.all(MODELS.map(async (id) => {
    try {
      const g = await loader.loadAsync(`models/flowers/${id}.glb`);
      g.scene.updateMatrixWorld(true);
      let geo = null;
      g.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry.clone().applyMatrix4(o.matrixWorld); });
      if (!geo) return;
      geo.computeBoundingBox();
      out[id] = { geo, height: Math.max(0.01, geo.boundingBox.max.y) };
    } catch (e) { /* missing model: the simple shapes */ }
  }));
  return out;
}

// shape, flower colour, height (m), plants in the patch, [leaf colour]
const LOOK = {
  'goryczka-krotkolodygowa': ['bell', 0x1c3fc4, 0.08, 9], 'goryczka-przezroczysta': ['bell', 0xe9ecc8, 0.1, 7],
  'goryczka-kropkowana': ['bell', 0xe6c43a, 0.4, 6], szarotka: ['star', 0xe8e6dc, 0.12, 8, 0x9aa38f],
  debik: ['star', 0xf6f4ea, 0.08, 12], lepnica: ['cushion', 0xe06aa0, 0.05, 5], sasanka: ['star', 0xf4f1e6, 0.25, 7],
  rojnik: ['rosette', 0x9c3d52, 0.06, 7, 0x6f8a4a], pierwiosnek: ['star', 0xe86aa6, 0.04, 10],
  'jaskier-lodnikowy': ['star', 0xf4e2e6, 0.12, 8], 'jaskier-alpejski': ['star', 0xfafaf2, 0.1, 9],
  'rdest-wezownik': ['spike', 0xe79ab6, 0.6, 12], roseniec: ['cushion', 0xd9c64a, 0.25, 5, 0x6d8f5a],
  omieg: ['star', 0xf0c21e, 0.9, 7], milosna: ['umbel', 0xc27aa0, 1.1, 6], starzec: ['umbel', 0xf2c81c, 1.0, 7],
  tojad: ['spike', 0x3a2f8f, 1.2, 6], urdzik: ['bell', 0x9b6ad0, 0.1, 9], wietlica: ['fern', 0, 0.8, 7, 0x4f7a2e],
  kostrzewa: ['tuft', 0, 0.2, 14, 0xa58a4a], krokus: ['cup', 0xa46ad6, 0.12, 14], lilia: ['star', 0xd97aa8, 1.0, 4],
  ciemiezyca: ['leaves', 0xc9d6a0, 1.2, 5, 0x5f8a3a], obuwik: ['cup', 0xf0cc2a, 0.45, 4], zywiec: ['star', 0xd8c4ea, 0.4, 7],
  czosnek: ['umbel', 0xf2f0e2, 0.5, 6], zimoziol: ['bell', 0xf2c6d6, 0.08, 9], podbialek: ['star', 0x9b62a6, 0.25, 8, 0x3f6a2e],
  paprotnica: ['fern', 0, 0.3, 6, 0x5f8a3a], pieciornik: ['star', 0xf0c21e, 0.12, 10], naparstnica: ['spike', 0xf0dc6a, 0.9, 5],
  parnazja: ['star', 0xfafaf4, 0.25, 8], 'turzyca-mocna': ['tuft', 0, 0.12, 10, 0x6f7f4a], bniec: ['star', 0xe0529a, 0.6, 7],
  gnidosz: ['spike', 0xf2d23a, 0.8, 5],
  // dwarf shrubs and shrubs: leaves and berries
  borowka: ['shrub', 0x2a2e6a, 0.3, 8, 0x3f7a2e], 'wierzba-zielna': ['shrub', 0, 0.04, 8, 0x5f9a3e],
  'wierzba-zylkowana': ['shrub', 0, 0.06, 7, 0x6f8f4e], 'wierzba-wykrojona': ['shrub', 0, 0.06, 7, 0x5f8a3e],
  wawrzynek: ['shrub', 0xd8231c, 0.8, 3, 0x3f6a2e], 'porzeczka-skalna': ['shrub', 0xb8201c, 1.0, 3, 0x4f7a2e],
  rokitnik: ['shrub', 0xf08a1c, 1.4, 3, 0x8a9a7a],
  // the owner's second list
  'czysciec-alpejski': ['spike', 0xb0506a, 0.6, 6], 'kuklik-gorski': ['star', 0xf2c41c, 0.2, 9], 'kuklik-rozeslany': ['star', 0xf6d02a, 0.12, 7],
  'przelot-alpejski': ['umbel', 0xe8c040, 0.15, 8], 'lepnica-rozdeta': ['bell', 0xeeeadc, 0.35, 8], 'gozdzik-lsniacy': ['star', 0xd24a8a, 0.15, 6],
  'gozdzik-wczesny': ['star', 0xe07ab0, 0.2, 7], 'skalnica-tatrzanska': ['cushion', 0xf4f2ea, 0.06, 6, 0x5a7a3a],
  'skalnica-gronkowa': ['rosette', 0xf0eee4, 0.2, 6, 0x7a9a6a], 'skalnica-nakrapiana': ['cushion', 0xf0b42a, 0.1, 7, 0x5f8a3e],
  rzezuszka: ['cushion', 0xfafaf4, 0.05, 7], mikolajek: ['umbel', 0x5a7ab8, 0.6, 4, 0x5a7a8a], wierzbownica: ['spike', 0xd26a9a, 0.7, 6],
  goryczuszka: ['cup', 0x3a6ad8, 0.2, 7], 'tojad-moldawski': ['spike', 0x6a4ab0, 1.0, 5], wroniec: ['tuft', 0, 0.12, 8, 0x4f7a2e],
  widlak: ['fern', 0, 0.1, 9, 0x4f7a2e], paprotnik: ['fern', 0, 0.4, 5, 0x3f6a2e], bielistka: ['cushion', 0, 0.06, 6, 0x9ab89a],
  wielosil: ['umbel', 0x6a7ae0, 0.9, 5],
};

export function buildFlowers({ scene, spots, groundAt, shade, patchShading, models = {} }) {
  const pos = [], nor = [], col = [];
  const c = new THREE.Color(), leafDefault = new THREE.Color(0x4f7f32);
  const tri = (a, b, d, n, cc) => { pos.push(...a, ...b, ...d); for (let k = 0; k < 3; k++) { nor.push(...n); col.push(cc.r, cc.g, cc.b); } };
  const quad = (a, b, d, e, n, cc) => { tri(a, b, d, n, cc); tri(a, d, e, n, cc); };
  const up = [0, 1, 0];
  // a thin stem as a crossed pair of quads
  const stem = (x, y, z, h, w, cc) => {
    for (const [dx, dz] of [[w, 0], [0, w]]) quad([x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + h, z + dz], [x - dx, y + h, z - dz], up, cc);
  };
  const petals = (x, y, z, r, n, tilt, cc, r2 = 0.35) => {
    // n petals around (x, y, z), each a small kite, tilted up by `tilt`
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.2832, b = a + 3.1416 / n, e = a - 3.1416 / n;
      const tip = [x + Math.cos(a) * r, y + tilt * r, z + Math.sin(a) * r];
      const s1 = [x + Math.cos(b) * r * r2, y + tilt * r * 0.4, z + Math.sin(b) * r * r2];
      const s2 = [x + Math.cos(e) * r * r2, y + tilt * r * 0.4, z + Math.sin(e) * r * r2];
      tri([x, y, z], s2, tip, up, cc); tri([x, y, z], tip, s1, up, cc);
    }
  };
  const leaf = (x, y, z, a, L, W, lift, cc) => {
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const tip = [x + dx * L, y + lift, z + dz * L];
    quad([x, y, z], [x + dx * L * 0.5 + px * W, y + lift * 0.6, z + dz * L * 0.5 + pz * W], tip,
      [x + dx * L * 0.5 - px * W, y + lift * 0.6, z + dz * L * 0.5 - pz * W], up, cc);
  };
  let n = 0;
  const clearings = [];
  const inst = {};                                   // model id -> instance matrices
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  for (const sp of spots) {
    const s = BY_ID[sp.id];
    const look = s && s.kind === 'flora' ? LOOK[sp.id] : null;
    if (!look) continue;
    const [shape, fc, H, count, lc] = look;
    const r = rng([...sp.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, Math.round(sp.x * 7 + sp.z * 13)));
    // spots right beside the path: the patch moves off it, onto the nearest ground where plants may grow
    // (the path and its verges are kept free); the label stays at the spot
    let cx = sp.x, cz = sp.z;
    const freeAround = (x, z) => { let ok = 0; for (let q = 0; q < 6; q++) if (groundAt(x + Math.cos(q) * 1.2, z + Math.sin(q) * 1.2) !== null) ok++; return ok; };
    if (freeAround(cx, cz) < 5) {
      let best = null;
      for (const d of [2, 3.5, 5, 7, 9]) {
        for (let q = 0; q < 12; q++) {
          const x = sp.x + Math.cos(q / 12 * 6.2832) * d, z = sp.z + Math.sin(q / 12 * 6.2832) * d;
          if (freeAround(x, z) >= 5) { best = { x, z }; break; }
        }
        if (best) break;
      }
      if (best) { cx = best.x; cz = best.z; }
    }
    const flower = new THREE.Color(fc), leafC = lc ? new THREE.Color(lc) : leafDefault;
    if (H < 0.6) clearings.push({ x: cx, z: cz, r: 1.8 });
    const model = models[sp.id];
    if (model) {
      const list = inst[sp.id] || (inst[sp.id] = []);
      // small plants come as denser carpets and a little larger than life, so a patch reads from the trail
      const small = H < 0.2, boost = small ? 1.5 : 1.15;
      for (let k = 0; k < Math.ceil(count * (small ? 3 : 1.5)); k++) {
        const a = r() * 6.2832, d = Math.sqrt(r()) * (H > 0.6 ? 2.2 : small ? 2.2 : 1.6);
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = groundAt(x, z);
        if (y === null) continue;
        const sc = H * boost * (0.7 + r() * 0.6) / model.height;
        E.set((r() - 0.5) * 0.15, r() * 6.2832, (r() - 0.5) * 0.15);
        list.push(new THREE.Matrix4().compose(P.set(x, y - 0.01, z), Q.setFromEuler(E), S.set(sc, sc, sc)));
      }
      n++;
      continue;
    }
    for (let k = 0; k < count * 2; k++) {
      const a = r() * 6.2832, d = Math.sqrt(r()) * (H > 0.6 ? 2.2 : 1.3);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = groundAt(x, z);
      if (y === null) continue;
      const h = H * (0.7 + r() * 0.6), v = 0.85 + r() * 0.3;
      c.copy(flower).multiplyScalar(v);
      const lcv = leafC.clone().multiplyScalar(0.85 + r() * 0.3);
      if (shape === 'bell' || shape === 'cup') {
        stem(x, y, z, h, 0.004, lcv);
        for (let q = 0; q < 3; q++) leaf(x, y + 0.01, z, r() * 6.28, h * 0.5 + 0.03, 0.012, 0.01, lcv);
        petals(x, y + h * 0.85, z, 0.02 + h * 0.08, shape === 'cup' ? 6 : 5, 2.2, c, 0.7);
      } else if (shape === 'star' || shape === 'umbel') {
        stem(x, y, z, h, 0.004 + h * 0.004, lcv);
        for (let q = 0; q < 4; q++) leaf(x, y + h * 0.1 * q, z, r() * 6.28, 0.05 + h * 0.18, 0.02 + h * 0.03, 0.02, lcv);
        const heads = shape === 'umbel' ? 5 : 1;
        for (let q = 0; q < heads; q++) {
          const o = heads > 1 ? 0.03 + h * 0.04 : 0;
          const hx = x + Math.cos(q * 1.26) * o, hz = z + Math.sin(q * 1.26) * o;
          petals(hx, y + h, hz, heads > 1 ? 0.015 + h * 0.012 : 0.012 + h * 0.035, heads > 1 ? 5 : 6, 0.25, c);
          petals(hx, y + h + 0.002, hz, 0.006 + h * 0.01, 5, 0.1, new THREE.Color(0xe8c030));      // centre
        }
      } else if (shape === 'spike') {
        stem(x, y, z, h, 0.005, lcv);
        for (let q = 0; q < 4; q++) leaf(x, y + 0.02, z, r() * 6.28, 0.1 + h * 0.15, 0.03, 0.03, lcv);
        for (let q = 0; q < 7; q++) petals(x, y + h * (0.62 + q * 0.055), z, 0.012 + h * 0.012 * (1 - q / 9), 4, 0.8, c);
      } else if (shape === 'rosette' || shape === 'cushion') {
        const R = 0.05 + h * 0.5;
        for (let q = 0; q < 10; q++) leaf(x, y, z, q * 0.63 + r(), R, R * 0.35, h * 0.4, q % 2 ? lcv : lcv.clone().lerp(c, 0.4));
        if (shape === 'cushion') for (let q = 0; q < 6; q++) petals(x + (r() - 0.5) * R, y + h * 0.6, z + (r() - 0.5) * R, 0.01, 5, 0.2, c);
        else petals(x, y + h * 0.5, z, R * 0.4, 8, 0.8, c, 0.5);
      } else if (shape === 'fern') {
        for (let q = 0; q < 6; q++) leaf(x, y, z, q * 1.05 + r() * 0.4, h * 0.9, h * 0.13, h * 0.55, lcv);
      } else if (shape === 'tuft') {
        for (let q = 0; q < 12; q++) leaf(x, y, z, r() * 6.28, h * (0.3 + r() * 0.4), 0.006, h, lcv);
      } else if (shape === 'shrub') {
        const R = 0.08 + h * 0.5;
        for (let q = 0; q < 14; q++) {
          const lx = x + (r() - 0.5) * R, lz = z + (r() - 0.5) * R, ly = y + r() * h;
          leaf(lx, ly, lz, r() * 6.28, 0.03 + h * 0.06, 0.015 + h * 0.03, 0.01, lcv);
        }
        if (fc) for (let q = 0; q < 6; q++) petals(x + (r() - 0.5) * R, y + h * (0.3 + r() * 0.6), z + (r() - 0.5) * R, 0.006, 4, 1.5, c, 0.9);
      }
    }
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  patchShading(m, shade, { perVertexShadow: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  scene.add(mesh);
  // the modelled plants: one instanced mesh per species, drawn within 250 m
  const culls = [];
  let modelTris = 0;
  const mm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  patchShading(mm, shade, { perVertexShadow: false });
  for (const [id, list] of Object.entries(inst)) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(models[id].geo, mm, list.length);
    list.forEach((mx, i) => im.setMatrixAt(i, mx));
    im.receiveShadow = true;
    scene.add(im);
    culls.push(cullByDistance(im, list, 250));
    modelTris += models[id].geo.index ? list.length * models[id].geo.index.count / 3 : 0;
  }
  void M;
  return { mesh, patches: n, tris: pos.length / 9 + modelTris, clearings, update: (cam) => culls.forEach((c) => c(cam)) };
}
