// Buildings from OpenStreetMap footprints (tools/prepare_buildings.py): the mountain huts at Morskie
// Oko in the Zakopane style (granite plinth, log walls, steep shingle roof with wide eaves, small-paned
// windows), Chata pod Rysmi in stone, wooden shepherd huts (szałas) and plain wooden houses.
// Textures: Poly Haven (CC0).
import * as THREE from 'three';
import { patchShading } from './materials.js';

const STYLE = {
  hut: { wall: 'logs', floorH: 2.9, pitch: 52, eave: 1.1, gable: 0.7, plinth: 1.0, windows: 2.5, chimney: 2, dormers: true },
  old_hut: { wall: 'logs', floorH: 2.7, pitch: 55, eave: 0.9, gable: 0.5, plinth: 0.7, windows: 2.6, chimney: 1 },
  house: { wall: 'logs', floorH: 2.7, pitch: 48, eave: 0.8, gable: 0.4, plinth: 0.5, windows: 2.8, chimney: 1 },
  stone_hut: { wall: 'stone', floorH: 2.8, pitch: 35, eave: 0.5, gable: 0.3, plinth: 0.3, windows: 3.2, chimney: 1 },
  szalas: { wall: 'planks', floorH: 2.0, pitch: 50, eave: 0.6, gable: 0.3, plinth: 0.25, windows: 0, chimney: 0 },
  shed: { wall: 'planks', floorH: 2.3, pitch: 40, eave: 0.4, gable: 0.2, plinth: 0.2, windows: 0, chimney: 0 },
};
// texture size in metres
const TILE = { logs: 2.5, planks: 2.2, stone: 2.0, roof: 2.4 };

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e2d0'; g.fillRect(0, 0, 128, 192);            // frame
  g.fillStyle = '#1b2228';
  const px = 14, py = 14, pw = 100, ph = 164;
  g.fillRect(px, py, pw, ph);                                       // glass
  const grad = g.createLinearGradient(0, py, 128, py + ph);         // sky reflection
  grad.addColorStop(0, 'rgba(160,185,210,0.45)'); grad.addColorStop(0.5, 'rgba(60,70,80,0.1)'); grad.addColorStop(1, 'rgba(140,160,180,0.3)');
  g.fillStyle = grad; g.fillRect(px, py, pw, ph);
  g.fillStyle = '#e9e2d0';
  g.fillRect(60, py, 8, ph);                                        // mullion
  for (const y of [py + ph / 3, py + 2 * ph / 3]) g.fillRect(px, y - 3, pw, 6); // transoms: small panes
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function doorTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a2616'; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#24170d'; g.lineWidth = 4;
  for (let x = 16; x < 128; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.strokeRect(10, 10, 108, 236);
  g.fillStyle = '#b8a070'; g.beginPath(); g.arc(100, 136, 6, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

class Mesher {
  constructor() { this.parts = {}; }
  list(k) { return this.parts[k] || (this.parts[k] = { pos: [], nor: [], uv: [], idx: [] }); }
  // quad a, b, c, d (counter-clockwise seen from outside) with uv in metres/tile
  quad(k, a, b, c, d, uvs) {
    const L = this.list(k), n = L.pos.length / 3;
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) {
      L.pos.push(p.x, p.y, p.z); L.nor.push(nrm.x, nrm.y, nrm.z); L.uv.push(t[0], t[1]);
    }
    L.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  tri(k, a, b, c, uvs) {
    const L = this.list(k), n = L.pos.length / 3;
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]]]) {
      L.pos.push(p.x, p.y, p.z); L.nor.push(nrm.x, nrm.y, nrm.z); L.uv.push(t[0], t[1]);
    }
    L.idx.push(n, n + 1, n + 2);
  }
  // box wall slab between two points along the facade (used for walls, plinth, chimneys)
  box(k, cx, cy, cz, sx, sy, sz, rot, tile) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (x, y, z) => new THREE.Vector3(cx + x * c + z * s, cy + y, cz - x * s + z * c);
    const hx = sx / 2, hz = sz / 2;
    const v = [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz), P(-hx, sy, -hz), P(hx, sy, -hz), P(hx, sy, hz), P(-hx, sy, hz)];
    const u = (a, b) => [[0, 0], [a / tile, 0], [a / tile, b / tile], [0, b / tile]];
    this.quad(k, v[3], v[2], v[6], v[7], u(sx, sy));   // +z
    this.quad(k, v[1], v[0], v[4], v[5], u(sx, sy));   // -z
    this.quad(k, v[2], v[1], v[5], v[6], u(sz, sy));   // +x
    this.quad(k, v[0], v[3], v[7], v[4], u(sz, sy));   // -x
    this.quad(k, v[7], v[6], v[5], v[4], u(sx, sz));   // top
  }
  geometries() {
    const out = {};
    for (const [k, L] of Object.entries(this.parts)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(L.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(L.uv, 2));
      g.setIndex(L.idx);
      g.computeBoundingSphere();
      out[k] = g;
    }
    return out;
  }
}

// Levelled terraces for the buildings: must be set on the terrain before its meshes are built.
export function buildingFlats(meta, terrain) {
  return (meta.buildings || []).map((b) => {
    const st = STYLE[b.style] || STYLE.house, rot = b.a - Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);
    const hs = [];
    for (let i = -1; i <= 1; i += 0.5) for (let j = -1; j <= 1; j += 0.5) {
      const x = b.x + i * b.w / 2 * c + j * b.d / 2 * s, z = b.z - i * b.w / 2 * s + j * b.d / 2 * c;
      hs.push(terrain.rawHeight(x, z));
    }
    hs.sort((p, q) => p - q);
    // a terrace a little wider than the eaves, at the median ground level
    return { x: b.x, z: b.z, c, s, w: b.w + 2 * st.eave + 2, d: b.d + 2 * st.eave + 2, level: hs[Math.floor(hs.length / 2)] };
  });
}

export async function buildBuildings({ scene, meta, terrain, shade, loadTexture }) {
  const list = meta.buildings || [];
  const tex = async (name, srgb, rep = true) => {
    const t = await loadTexture(`textures/${name}.jpg`, srgb);
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const [logD, logN, plD, plN, stD, stN, rfD, rfN] = await Promise.all([
    tex('wood_plank_wall_diff', true), tex('wood_plank_wall_nor', false),
    tex('weathered_brown_planks_diff', true), tex('weathered_brown_planks_nor', false),
    tex('stone_wall_diff', true), tex('stone_wall_nor', false),
    tex('roof_slates_02_diff', true), tex('roof_slates_02_nor', false)]);
  const mat = (map, normalMap, color = 0xffffff, side = THREE.DoubleSide) => {
    const m = new THREE.MeshLambertMaterial({ map, normalMap, color, side });
    patchShading(m, shade);
    return m;
  };
  const M = {
    logs: mat(logD, logN, new THREE.Color(2.1, 1.8, 1.5)), planks: mat(plD, plN, new THREE.Color(1.3, 1.2, 1.1)), stone: mat(stD, stN, 0xd0d0d0),
    roof: mat(rfD, rfN, 0x9a8c80, THREE.DoubleSide), window: mat(windowTexture(), null), door: mat(doorTexture(), null),
    trim: mat(null, null, 0x3b2819),
  };
  const mesher = new Mesher();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rects = [];

  for (const b of list) {
    const st = STYLE[b.style] || STYLE.house;
    const W = b.w, D = b.d, rot = b.a - Math.PI / 2;  // local x along the ridge
    const c = Math.cos(rot), s = Math.sin(rot);
    const L = (x, y, z) => V(b.x + x * c + z * s, y, b.z - x * s + z * c);
    // ground under the footprint
    let gMin = Infinity, gMax = -Infinity;
    for (let i = -1; i <= 1; i += 0.5) for (let j = -1; j <= 1; j += 0.5) {
      const p = L(i * W / 2, 0, j * D / 2), h = terrain.height(p.x, p.z);
      gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
    }
    const y0 = gMin - 0.5, yP = gMax + st.plinth;                   // plinth from below ground to above the high side
    const wallH = st.floorH * (b.floors || 1) * (b.style === 'old_hut' ? 0.8 : 1);
    const yW = yP + wallH;
    const wallKind = st.wall;
    rects.push({ x: b.x, z: b.z, w: W + 2 * st.eave, d: D + 2 * st.eave, c, s });

    // plinth (granite) and walls
    mesher.box('stone', b.x, y0, b.z, W + 0.1, yP - y0, D + 0.1, rot, TILE.stone);
    mesher.box(wallKind, b.x, yP, b.z, W, wallH, D, rot, TILE[wallKind]);
    // gables: triangles on both short ends, in the wall material
    const rise = Math.tan(st.pitch * Math.PI / 180) * D / 2;
    for (const sx of [-1, 1]) {
      const a = L(sx * W / 2, yW, -sx * D / 2), bb = L(sx * W / 2, yW, sx * D / 2), top = L(sx * W / 2, yW + rise, 0);
      mesher.tri(wallKind, a, bb, top, [[0, 0], [D / TILE[wallKind], 0], [D / 2 / TILE[wallKind], rise / TILE[wallKind]]]);
    }
    // roof: two planes with eaves and gable overhang, plus a thin fascia
    const e = st.eave, g = st.gable, hx = W / 2 + g, hz = D / 2 + e;
    const drop = Math.tan(st.pitch * Math.PI / 180) * e;
    const slope = Math.hypot(hz, rise + drop);
    for (const sz of [-1, 1]) {
      const p1 = L(-hx, yW - drop, sz * hz), p2 = L(hx, yW - drop, sz * hz), p3 = L(hx, yW + rise, 0), p4 = L(-hx, yW + rise, 0);
      const uv = [[0, 0], [2 * hx / TILE.roof, 0], [2 * hx / TILE.roof, slope / TILE.roof], [0, slope / TILE.roof]];
      if (sz > 0) mesher.quad('roof', p1, p2, p3, p4, uv); else mesher.quad('roof', p2, p1, p4, p3, uv);
      mesher.box('trim', ...(() => { const m = L(0, yW - drop - 0.18, sz * hz); return [m.x, m.y, m.z]; })(), 2 * hx, 0.18, 0.08, rot, 1);
    }
    // chimneys
    for (let k = 0; k < st.chimney; k++) {
      const cx = (k - (st.chimney - 1) / 2) * W * 0.4, p = L(cx, 0, D * 0.12);
      mesher.box('stone', p.x, yW + rise * 0.6, p.z, 0.8, rise * 0.55 + 1.0, 0.8, rot, TILE.stone);
    }
    // windows and doors on the long facades (and a few on the gable ends of big huts)
    if (st.windows) {
      const floors = Math.max(1, Math.round(wallH / st.floorH));
      for (const sz of [-1, 1]) {
        const n = Math.max(1, Math.floor((W - 1.6) / st.windows));
        for (let f = 0; f < floors; f++) for (let k = 0; k < n; k++) {
          const x = -W / 2 + 0.8 + (k + 0.5) * (W - 1.6) / n;
          const yb = yP + f * st.floorH + 0.9;
          const isDoor = f === 0 && sz > 0 && k === Math.floor(n / 2);
          const ww = isDoor ? 1.1 : 0.9, wh = isDoor ? 2.1 : 1.3, yy = isDoor ? yP + 0.02 : yb;
          const o = sz * (D / 2 + 0.04);
          const a = L(x - ww / 2, yy, o), bb = L(x + ww / 2, yy, o), cc = L(x + ww / 2, yy + wh, o), d = L(x - ww / 2, yy + wh, o);
          const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
          if (sz > 0) mesher.quad(isDoor ? 'door' : 'window', a, bb, cc, d, uv);
          else mesher.quad('window', bb, a, d, cc, uv);
        }
      }
      if (b.style === 'hut' || b.style === 'stone_hut') {
        for (const sx of [-1, 1]) for (let f = 0; f < floors + 1; f++) {
          const yb = yP + f * st.floorH + 0.9, o = sx * (W / 2 + 0.04);
          const zs = f < floors ? [-D / 4, D / 4] : [0];
          if (f === floors && yb + 1.3 > yW + rise * 0.5) continue;
          for (const z of zs) {
            const a = L(o, yb, z - 0.45), bb = L(o, yb, z + 0.45), cc = L(o, yb + 1.3, z + 0.45), d = L(o, yb + 1.3, z - 0.45);
            const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
            if (sx > 0) mesher.quad('window', bb, a, d, cc, uv); else mesher.quad('window', a, bb, cc, d, uv);
          }
        }
      }
    } else {
      // szałas: a low plank door on one long side
      const o = D / 2 + 0.04, a = L(-0.45, yP, o), bb = L(0.45, yP, o), cc = L(0.45, yP + 1.6, o), d = L(-0.45, yP + 1.6, o);
      mesher.quad('door', a, bb, cc, d, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }
  const group = new THREE.Group();
  for (const [k, g] of Object.entries(mesher.geometries())) {
    const m = new THREE.Mesh(g, M[k]);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  scene.add(group);
  // is (x, z) inside a building (incl. its eaves, plus a margin)?
  const inside = (x, z, margin = 0) => {
    for (const r of rects) {
      const dx = x - r.x, dz = z - r.z;
      const u = dx * r.c - dz * r.s, v = dx * r.s + dz * r.c;
      if (Math.abs(u) < r.w / 2 + margin && Math.abs(v) < r.d / 2 + margin) return true;
    }
    return false;
  };
  return { group, inside, count: list.length };
}
