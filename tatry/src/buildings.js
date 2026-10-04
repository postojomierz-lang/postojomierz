// Buildings from OpenStreetMap footprints (tools/prepare_buildings.py). The mountain huts by the trails are
// drawn after the real ones (tables HUTS below: walls of logs, stone or plaster, a stone ground floor, the
// number of floors, roof shape, pitch and colour, from photos of each hut); the other buildings get a look
// from their name and size: hotels, churches, schools and other large buildings plastered with hipped roofs,
// houses of wood in the Zakopane / Liptov style (steep roofs, often half-hipped), small wooden shepherd huts
// (szałas). Roofs of wide buildings are kept low instead of rising to a giant gable. Colours vary from one
// building to the next (vertex colours over the shared textures). Textures: Poly Haven (CC0).
import * as THREE from 'three';
import { patchShading } from './materials.js';

const STYLE = {
  hut: { wall: 'logs', floorH: 2.9, pitch: 52, eave: 1.1, gable: 0.7, plinth: 1.0, windows: 2.5, chimney: 2, base: 1 },
  old_hut: { wall: 'logs', floorH: 2.2, pitch: 55, eave: 0.9, gable: 0.5, plinth: 0.7, windows: 2.6, chimney: 1 },
  house: { wall: 'logs', floorH: 2.7, pitch: 48, eave: 0.8, gable: 0.4, plinth: 0.5, windows: 2.8, chimney: 1 },
  stone_hut: { wall: 'stone', floorH: 2.8, pitch: 35, eave: 0.5, gable: 0.3, plinth: 0.3, windows: 3.2, chimney: 1 },
  szalas: { wall: 'planks', floorH: 2.0, pitch: 50, eave: 0.6, gable: 0.3, plinth: 0.25, windows: 0, chimney: 0 },
  shed: { wall: 'planks', floorH: 2.3, pitch: 40, eave: 0.4, gable: 0.2, plinth: 0.2, windows: 0, chimney: 0 },
  plaster: { wall: 'plaster', floorH: 3.0, pitch: 32, eave: 0.7, gable: 0.7, plinth: 0.6, windows: 2.6, chimney: 2, hip: 1 },
};
// texture size in metres
const TILE = { logs: 2.5, planks: 2.2, stone: 2.0, roof: 2.4, plaster: 3.0 };
// tints (linear, over the material's texture and colour)
const WOOD = [1, 1, 1], DARK = [0.68, 0.62, 0.58], HONEY = [1.15, 1.0, 0.78], GREYWOOD = [0.85, 0.85, 0.86];
const CREAM = [1, 0.93, 0.8], WHITE = [1, 1, 1], YELLOW = [1, 0.9, 0.62], PALE = [0.86, 0.87, 0.88];
const SHINGLE = [0.86, 0.72, 0.58], GREY_ROOF = [0.82, 0.85, 0.9], DARK_ROOF = [0.5, 0.5, 0.53],
  RED_ROOF = [1.25, 0.62, 0.5], GREEN_ROOF = [0.58, 0.8, 0.6], BROWN_ROOF = [0.8, 0.58, 0.45];

// The huts and other buildings by the trails, after photos: [name, look]. base: floors of stone at the
// bottom; hip: how far the roof's ends are hipped (0 a gable, about 0.3 the half-hip of the Zakopane style,
// 1 a hipped roof).
const HUTS = [
  [/Hala Kondratowa/, { wall: 'logs', wallTint: DARK, base: 0, floors: 1, floorH: 2.9, pitch: 57, roofTint: SHINGLE, chimney: 1, windows: 2.2 }],
  [/Kalatówki/, { wall: 'plaster', wallTint: CREAM, base: 1, floors: 3, pitch: 45, hip: 0.35, roofTint: DARK_ROOF }],
  [/^Murowaniec$/, { wall: 'stone', floors: 3, pitch: 52, hip: 0.3, roofTint: DARK_ROOF, chimney: 2 }],
  [/^Schronisko PTTK Morskie Oko/, { wall: 'logs', base: 1, floors: 3, pitch: 52, roofTint: SHINGLE }],
  [/Stare Schronisko/, { wall: 'logs', wallTint: DARK, base: 0, floors: 2, pitch: 55, roofTint: SHINGLE }],
  [/Pięciu Stawów/, { wall: 'logs', base: 1, floors: 2, pitch: 42, roofTint: GREY_ROOF }],
  [/Dolinie Roztoki/, { wall: 'logs', base: 1, floors: 3, pitch: 50, roofTint: SHINGLE }],
  [/Polanie Chochołowskiej$/, { wall: 'logs', base: 1, floors: 3, pitch: 48, hip: 0.3, roofTint: SHINGLE }],
  [/Hali Ornak/, { wall: 'logs', wallTint: DARK, base: 1, floors: 2, pitch: 50, roofTint: SHINGLE }],
  [/^Betlejemka$/, { wall: 'logs', wallTint: DARK, floors: 2, pitch: 50, roofTint: SHINGLE }],
  [/Murań/, { wall: 'logs', floors: 3, pitch: 50, hip: 0.3, roofTint: SHINGLE }],
  [/Obserwatorium Meteorologiczne Kasprowy|Stacja IMGW/, { wall: 'stone', floors: 2, pitch: 25, hip: 1, roofTint: GREY_ROOF, windows: 3 }],
  [/Górna stacja kolei linowej Kasprowy/, { wall: 'stone', floors: 2, pitch: 18, hip: 1, roofTint: GREY_ROOF }],
  [/Pośrednia stacja kolei linowej/, { wall: 'stone', floors: 2, pitch: 30, roofTint: GREY_ROOF }],
  [/Dolna stacja kolei linowej/, { wall: 'plaster', wallTint: CREAM, base: 1, floors: 3, pitch: 40, roofTint: DARK_ROOF }],
  [/Włosienicy/, { wall: 'logs', floors: 1, pitch: 45, roofTint: SHINGLE }],
  [/^Téryho chata/, { wall: 'stone', floors: 2, pitch: 38, roofTint: GREY_ROOF }],
  [/^Zbojnícka chata/, { wall: 'logs', base: 1, floors: 2, pitch: 45, roofTint: GREY_ROOF }],
  [/Chata pri Zelenom plese/, { wall: 'logs', base: 1, floors: 2, pitch: 40, roofTint: GREY_ROOF }],
  [/Zamkovského chata/, { wall: 'logs', wallTint: DARK, base: 1, floors: 2, pitch: 50, roofTint: SHINGLE }],
  [/^Rainerova chata/, { wall: 'stone', floors: 1, pitch: 45, roofTint: SHINGLE }],
  [/^Bilíkova chata/, { wall: 'logs', wallTint: DARK, floors: 2, pitch: 48, roofTint: SHINGLE }],
  [/^Skalnatá chata/, { wall: 'stone', floors: 1, pitch: 35, roofTint: GREY_ROOF }],
  [/^Žiarska chata/, { wall: 'logs', base: 1, floors: 3, pitch: 45, roofTint: GREY_ROOF }],
  [/^Ťatliakova chata/, { wall: 'logs', floors: 2, pitch: 48, roofTint: GREY_ROOF }],
  [/^Chata pod Soliskom/, { wall: 'logs', floors: 1, pitch: 40, roofTint: GREY_ROOF }],
  [/Horský hotel Popradské pleso/, { wall: 'plaster', wallTint: CREAM, base: 1, floors: 4, pitch: 38, hip: 0.6, roofTint: DARK_ROOF }],
  [/^Majláthova chata/, { wall: 'logs', floors: 1, pitch: 45, roofTint: SHINGLE }],
  [/^Krivánska chata/, { wall: 'stone', floors: 2, pitch: 45, roofTint: SHINGLE }],
  [/^Chata Zverovka/, { wall: 'logs', base: 1, floors: 2, pitch: 45, roofTint: GREY_ROOF }],
  [/Chata pod Rysmi/, { wall: 'stone', floors: 2, pitch: 30, roofTint: GREY_ROOF }],
  [/Horská ubytovňa Hrebienok|Bistro Strednica/, { wall: 'logs', base: 1, floors: 3, pitch: 40, roofTint: DARK_ROOF }],
];
// large or public buildings in the villages and towns: plastered, hipped roofs
const PUBLIC = /hotel|kostol|kościół|kaplic|kaplnk|klasztor|plebania|škol|szkoł|úrad|urząd|sanat|kúpe|dom seniorov|centrum|ośrodek|zotavov|ústav|múzeum|muzeum|stanica|observat|resort|residence|grand|apartm|penzi|pensjonat|willa|vila|villa|internat|hala /i;
const pick = (h, list) => list[Math.floor(h * list.length) % list.length];

// the building's look: its style, overridden by its entry in HUTS, or chosen from its name and size
export function lookOf(b) {
  const h = Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233) * 43758.5453) % 1, h2 = (h * 7.31) % 1;
  let lk = { ...(STYLE[b.style] || STYLE.house), wallTint: WOOD, roofTint: SHINGLE, hip: 0, base: 0, floors: b.floors || 1 };
  const hut = HUTS.find(([re]) => re.test(b.name || ''));
  if (hut) Object.assign(lk, STYLE[hut[1].wall === 'stone' ? 'stone_hut' : 'hut'], { base: 0, hip: 0 }, hut[1]);
  else if (b.style === 'house' && (PUBLIC.test(b.name || '') || b.w * b.d > 450)) {
    Object.assign(lk, STYLE.plaster, { wallTint: pick(h, [CREAM, WHITE, YELLOW, PALE, CREAM]),
      roofTint: pick(h2, [RED_ROOF, BROWN_ROOF, DARK_ROOF, GREY_ROOF, GREEN_ROOF]), hip: h2 < 0.3 ? 0.5 : 1, base: h < 0.25 ? 1 : 0 });
  } else if (b.style === 'house') {
    Object.assign(lk, { wallTint: pick(h, [WOOD, DARK, HONEY, GREYWOOD, WOOD]), roofTint: pick(h2, [SHINGLE, GREY_ROOF, DARK_ROOF, BROWN_ROOF, GREEN_ROOF, RED_ROOF]),
      hip: h2 < 0.45 ? 0.3 : 0, base: h > 0.8 ? 1 : 0 });
  } else if (b.style === 'szalas' || b.style === 'shed') {
    Object.assign(lk, { wallTint: pick(h, [WOOD, DARK, GREYWOOD]), roofTint: pick(h2, [SHINGLE, DARK_ROOF, GREY_ROOF]) });
  } else if (b.style === 'hut' || b.style === 'old_hut') lk.roofTint = SHINGLE;
  else if (b.style === 'stone_hut') lk.roofTint = GREY_ROOF;
  // no giant roofs: wide buildings get a lower pitch (a roof at most ~7-9 m high)
  const maxRise = lk.wall === 'plaster' ? 7 : 9, rise = Math.tan(lk.pitch * Math.PI / 180) * b.d / 2;
  if (rise > maxRise) lk.pitch = Math.atan(maxRise / (b.d / 2)) * 180 / Math.PI;
  if (lk.hip) lk.gable = lk.eave;                 // the hipped ends overhang like the eaves
  return lk;
}

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


// light plaster with a faint grain and stains
function plasterTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const x = i % 256, y = (i / 256) | 0;
    const v = 228 + (Math.random() - 0.5) * 16 + 6 * Math.sin(x * 0.05 + Math.sin(y * 0.07) * 2) - (y > 230 ? (y - 230) * 0.9 : 0);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v - 3; img.data[i * 4 + 2] = v - 8; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

class Mesher {
  constructor() { this.parts = {}; this.col = [1, 1, 1]; }
  list(k) { return this.parts[k] || (this.parts[k] = { pos: [], nor: [], uv: [], col: [], idx: [] }); }
  put(L, p, t, nrm) { L.pos.push(p.x, p.y, p.z); L.nor.push(nrm.x, nrm.y, nrm.z); L.uv.push(t[0], t[1]); L.col.push(...this.col); }
  // quad a, b, c, d (counter-clockwise seen from outside) with uv in metres/tile
  quad(k, a, b, c, d, uvs) {
    const L = this.list(k), n = L.pos.length / 3;
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    [a, b, c, d].forEach((p, i) => this.put(L, p, uvs[i], nrm));
    L.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  // a convex polygon, its normal turned towards out (a fan of triangles; points may repeat)
  poly(k, pts, uvs, out) {
    const nrm = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {           // Newell's normal
      const a = pts[i], b = pts[(i + 1) % pts.length];
      nrm.x += (a.y - b.y) * (a.z + b.z); nrm.y += (a.z - b.z) * (a.x + b.x); nrm.z += (a.x - b.x) * (a.y + b.y);
    }
    if (nrm.lengthSq() < 1e-8) return;
    nrm.normalize();
    let order = pts.map((_, i) => i);
    if (nrm.dot(out) < 0) { nrm.negate(); order = order.reverse(); }
    const L = this.list(k), n = L.pos.length / 3;
    for (const i of order) this.put(L, pts[i], uvs[i], nrm);
    for (let i = 1; i < pts.length - 1; i++) L.idx.push(n, n + i, n + i + 1);
  }
  // box between two points along the facade (used for walls, plinth, chimneys)
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
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.col, 3));
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
    // on steep ground a mountain building stands on the upper part of its footprint with a tall stone
    // plinth on the downhill side, instead of being dug into the slope: level from the upper heights
    // (70th percentile), a terrace just under the footprint
    const lvl = hs[Math.floor(hs.length * 0.7)];
    return { x: b.x, z: b.z, c, s, w: b.w + 1, d: b.d + 1, level: lvl, blend: 3 };
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
    const m = new THREE.MeshLambertMaterial({ map, normalMap, color, side, vertexColors: true });
    patchShading(m, shade);
    return m;
  };
  const M = {
    logs: mat(logD, logN, new THREE.Color(2.1, 1.8, 1.5)), planks: mat(plD, plN, new THREE.Color(1.3, 1.2, 1.1)), stone: mat(stD, stN, 0xd0d0d0),
    plaster: mat(plasterTexture(), null, 0xf2efe8),
    roof: mat(rfD, rfN, 0x9a8c80, THREE.DoubleSide), window: mat(windowTexture(), null), door: mat(doorTexture(), null),
    trim: mat(null, null, 0x3b2819),
  };
  const mesher = new Mesher();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ONE = [1, 1, 1];
  const rects = [];

  for (const b of list) {
    const lk = lookOf(b);
    const W = b.w, D = b.d, rot = b.a - Math.PI / 2;  // local x along the ridge
    const c = Math.cos(rot), s = Math.sin(rot);
    const L = (x, y, z) => V(b.x + x * c + z * s, y, b.z - x * s + z * c);
    const dir = (x, y, z) => V(x * c + z * s, y, -x * s + z * c);   // a local direction in the world
    // ground under the footprint
    let gMin = Infinity, gMax = -Infinity;
    for (let i = -1; i <= 1; i += 0.5) for (let j = -1; j <= 1; j += 0.5) {
      const p = L(i * W / 2, 0, j * D / 2), h = terrain.height(p.x, p.z);
      gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
      // just outside the walls (downhill the ground falls away): the plinth reaches down to it
      const q = L(i * (W / 2 + 1.2), 0, j * (D / 2 + 1.2));
      gMin = Math.min(gMin, terrain.height(q.x, q.z) - 0.3);
    }
    const y0 = gMin - 0.5, yP = gMax + lk.plinth;                   // plinth from below ground to above the high side
    const floors = Math.max(1, lk.floors), wallH = lk.floorH * floors;
    const yW = yP + wallH;
    const wallKind = lk.wall, baseH = Math.min(lk.base || 0, floors) * lk.floorH;
    rects.push({ x: b.x, z: b.z, w: W + 2 * lk.eave, d: D + 2 * lk.eave, c, s });

    // plinth (granite), the stone ground floor, walls
    mesher.col = ONE;
    mesher.box('stone', b.x, y0, b.z, W + 0.1, yP - y0, D + 0.1, rot, TILE.stone);
    if (baseH > 0) mesher.box('stone', b.x, yP, b.z, W + 0.06, baseH, D + 0.06, rot, TILE.stone);
    mesher.col = lk.wallTint;
    if (baseH < wallH) mesher.box(wallKind, b.x, yP + baseH, b.z, W, wallH - baseH, D, rot, TILE[wallKind]);

    // roof: two sides from the eaves to the ridge; its ends hipped as far as lk.hip (a gable below)
    const tan = Math.tan(lk.pitch * Math.PI / 180), rise = tan * D / 2;
    const e = lk.eave, g = lk.gable, hx = W / 2 + g, hz = D / 2 + e;
    const eY = yW - tan * e, R = yW + rise, Rt = R - eY;
    const t = Math.min(lk.hip || 0, hx / hz * 0.98);
    const zk = hz * t, yk = eY + Rt * (1 - t), xr = hx - zk;
    const sinA = Rt / Math.hypot(Rt, hz), TR = TILE.roof;
    const ruv = (u, y) => [u / TR, (y - eY) / sinA / TR];
    mesher.col = lk.roofTint;
    for (const sz of [-1, 1]) {
      const P = [[-hx, eY, sz * hz], [hx, eY, sz * hz], [hx, yk, sz * zk], [xr, R, 0], [-xr, R, 0], [-hx, yk, sz * zk]];
      mesher.poly('roof', P.map((p) => L(...p)), P.map((p) => ruv(p[0], p[1])), dir(0, 1, sz));
    }
    if (zk > 0.05) for (const sx of [-1, 1]) {
      const P = [[sx * hx, yk, -zk], [sx * hx, yk, zk], [sx * xr, R, 0]];
      mesher.poly('roof', P.map((p) => L(...p)), P.map((p) => ruv(p[2], p[1])), dir(sx, 1, 0));
    }
    // gables up to under the roof, in the wall material (stone where the whole building is)
    const yc = Math.min(R, yk + g * Rt / hz);
    mesher.col = baseH >= wallH ? ONE : lk.wallTint;
    const gk = baseH >= wallH ? 'stone' : wallKind;
    if (yc > yW + 0.05) for (const sx of [-1, 1]) {
      const zc = D / 2 * Math.max(0, 1 - (yc - yW) / rise), T = TILE[gk];
      const P = [[sx * W / 2, yW, -D / 2], [sx * W / 2, yW, D / 2], [sx * W / 2, yc, zc], [sx * W / 2, yc, -zc]];
      mesher.poly(gk, P.map((p) => L(...p)), P.map((p) => [p[2] / T, (p[1] - yW) / T]), dir(sx, 0, 0));
    }
    // fascia along the eaves
    mesher.col = lk.wall === 'plaster' ? lk.roofTint : ONE;
    for (const sz of [-1, 1]) {
      const m = L(0, eY - 0.18, sz * hz);
      mesher.box('trim', m.x, m.y, m.z, 2 * (zk > 0.05 ? hx - 0.05 : hx), 0.18, 0.08, rot, 1);
    }
    // chimneys
    mesher.col = lk.wall === 'plaster' ? lk.wallTint : ONE;
    for (let k = 0; k < lk.chimney; k++) {
      const cx = (k - (lk.chimney - 1) / 2) * W * 0.4, p = L(cx, 0, D * 0.12);
      mesher.box(lk.wall === 'plaster' ? 'plaster' : 'stone', p.x, yW + rise * 0.6, p.z, 0.8, rise * 0.55 + 1.0, 0.8, rot, TILE.stone);
    }
    // windows and doors on the long facades, and on the gable ends of the larger buildings
    mesher.col = ONE;
    if (lk.windows) {
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const sz of [-1, 1]) {
        const n = Math.max(1, Math.floor((W - 1.6) / lk.windows));
        for (let f = 0; f < floors; f++) for (let k = 0; k < n; k++) {
          const x = -W / 2 + 0.8 + (k + 0.5) * (W - 1.6) / n;
          const yb = yP + f * lk.floorH + 0.9;
          const isDoor = f === 0 && sz > 0 && k === Math.floor(n / 2);
          const ww = isDoor ? 1.1 : 0.9, wh = isDoor ? 2.1 : 1.3, yy = isDoor ? yP + 0.02 : yb;
          const o = sz * (D / 2 + 0.05);
          const a = L(x - ww / 2, yy, o), bb = L(x + ww / 2, yy, o), cc = L(x + ww / 2, yy + wh, o), d = L(x - ww / 2, yy + wh, o);
          if (sz > 0) mesher.quad(isDoor ? 'door' : 'window', a, bb, cc, d, uv);
          else mesher.quad('window', bb, a, d, cc, uv);
        }
      }
      if (D >= 6) for (const sx of [-1, 1]) for (let f = 0; f < floors + 1; f++) {
        const yb = yP + f * lk.floorH + 0.9, o = sx * (W / 2 + 0.05);
        if (yb + 1.3 > (f < floors ? yW : yc - 0.4)) continue;      // the attic window only where the gable is tall enough
        const zs = f < floors && D >= 9 ? [-D / 4, D / 4] : [0];
        for (const z of zs) {
          const a = L(o, yb, z - 0.45), bb = L(o, yb, z + 0.45), cc = L(o, yb + 1.3, z + 0.45), d = L(o, yb + 1.3, z - 0.45);
          if (sx > 0) mesher.quad('window', bb, a, d, cc, uv); else mesher.quad('window', a, bb, cc, d, uv);
        }
      }
    } else {
      // szałas: a low plank door on one long side
      const o = D / 2 + 0.05, a = L(-0.45, yP, o), bb = L(0.45, yP, o), cc = L(0.45, yP + 1.6, o), d = L(-0.45, yP + 1.6, o);
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
