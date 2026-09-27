// Builds src/data/figures.js from the army men modelled in Blender (tools/blender/army_men.py ->
// .cache/figures/blender) and src/data/vehicles.js + public/scenery-*.js from the other Blender scripts.
// Turns them Y-up and facing +X, shrinks them to game size, simplifies them and stores them as
// compact meshopt-compressed base64 arrays. Painted parts (<pose>__<rrggbb>.stl) keep their colour.
//   python tools/blender/army_men.py   (needs: pip install bpy)
//   node tools/figures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(HERE, '..', '.cache', 'figures');
const OUT = path.join(HERE, '..', 'src', 'data', 'figures.js');
const OUT_VEH = path.join(HERE, '..', 'src', 'data', 'vehicles.js');
// yaw: degrees to turn the figure so that where it aims ends up along +X (after +Z -> +X)
const SOURCES = ['rifleman', 'kneel', 'prone', 'officer', 'mg', 'sniper', 'bazooka', 'bazooka-stand', 'manpads', 'manpads-kneel',
  'grenadier', 'grenadier-idle', 'medic', 'medic-heal', 'drag', 'gunner', 'lookout', 'sapper', 'driver', 'mgstand']
  .map(key => ({ key, name: `blender/${key}.stl`, yaw: 0, keepCentre: true }));   // built facing -Y around the hips
const NEAR_TRIS = 8000, FAR_TRIS = 1500, HEIGHT_MM = 37, HEIGHT = 1.08, Q = 16000;

function readFile(src) {
  const dst = path.join(CACHE, src.name);
  if (!fs.existsSync(dst)) throw new Error(`${dst} missing - run: python tools/blender/army_men.py`);
  return fs.readFileSync(dst);
}
// -> { pos: Float32Array (x,y,z mm, Z-up), idx: Uint32Array }, vertices welded
function parse(name, buf) {
  const pts = [], tris = [];
  const n = buf.readUInt32LE(80);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 3; k++) pts.push([buf.readFloatLE(o + k * 12), buf.readFloatLE(o + k * 12 + 4), buf.readFloatLE(o + k * 12 + 8)]);
    tris.push([i * 3, i * 3 + 1, i * 3 + 2]);
  }

  const map = new Map(), pos = [], remap = new Int32Array(pts.length);
  pts.forEach((p, i) => {
    const k = p.map(v => Math.round(v * 1e4)).join();
    if (!map.has(k)) { map.set(k, pos.length / 3); pos.push(...p); }
    remap[i] = map.get(k);
  });
  const idx = [];
  for (const [a, b, c] of tris) { const A = remap[a], B = remap[b], C = remap[c]; if (A !== B && B !== C && A !== C) idx.push(A, B, C); }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

// mm, Z-up, facing -Y  ->  game units, Y-up, facing +X (after the extra yaw), feet on y = 0
function transform(pos, yawDeg) {
  const s = HEIGHT / HEIGHT_MM, th = (90 + yawDeg) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 2], z = -pos[i + 1];      // Z-up -> Y-up (front -Y -> +Z)
    out[i] = (x * c + z * sn) * s; out[i + 1] = y * s; out[i + 2] = (-x * sn + z * c) * s;
  }
  return out;
}
function placement(pos, keepCentre) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { min[i % 3] = Math.min(min[i % 3], pos[i]); max[i % 3] = Math.max(max[i % 3], pos[i]); }
  return keepCentre ? [0, 0, 0] : [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];   // Blender figures already stand on y = 0
}
function shift(pos, off) { for (let i = 0; i < pos.length; i += 3) { pos[i] -= off[0]; pos[i + 1] -= off[1]; pos[i + 2] -= off[2]; } return pos; }

// simplify, drop unused vertices, quantise to int16 (x, y, z, pad), reorder for the GPU cache and
// meshopt-compress -> { v: vertex count, n: index count, p, i: base64 }
function pack(idx, pos, tris, scale = Q, error = 0.02) {
  const [sidx] = tris && tris * 3 < idx.length ? MeshoptSimplifier.simplify(idx, pos, 3, tris * 3, error, []) : [idx];
  const used = new Map(), q = [], ind = new Uint32Array(sidx.length);
  for (let i = 0; i < sidx.length; i++) {
    let v = used.get(sidx[i]);
    if (v === undefined) { v = used.size; used.set(sidx[i], v); for (let k = 0; k < 3; k++) q.push(Math.round(pos[sidx[i] * 3 + k] * scale)); q.push(0); }
    ind[i] = v;
  }
  const src16 = new Int16Array(q), n = ind.length, ib = new Uint32Array(ind);
  const [remap, v] = MeshoptEncoder.reorderMesh(ib, true, false);   // vertex-cache order; indices now point at remapped vertices
  const verts = new Int16Array(v * 4);
  for (let old = 0; old < used.size; old++) if (remap[old] !== 0xffffffff) verts.set(src16.subarray(old * 4, old * 4 + 4), remap[old] * 4);
  const vb = new Uint8Array(verts.buffer);
  const p = MeshoptEncoder.encodeVertexBuffer(vb, v, 8), i = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(ib.buffer), n, 4);
  return { v, n, p: Buffer.from(p).toString('base64'), i: Buffer.from(i).toString('base64'), tris: n / 3 };
}
const lit = pk => `{ v: ${pk.v}, n: ${pk.n}, p: '${pk.p}', i: '${pk.i}' }`;

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
function packFigures(sources) {
  const lines = [];
  for (const src of sources) {
  const mesh = parse(src.name, readFile(src));
  const pos = transform(mesh.pos, src.yaw), off = placement(pos, src.keepCentre);
  shift(pos, off);
  const near = pack(mesh.idx, pos, NEAR_TRIS), far = pack(mesh.idx, pos, FAR_TRIS);
  // painted parts next to a local figure: <name>__<rrggbb>.stl
  const paint = [];
  const dir = path.join(CACHE, path.dirname(src.name)), base = path.basename(src.name, '.stl');
  if (src.keepCentre) for (const f of fs.readdirSync(dir).filter(f => f.startsWith(base + '__') && f.endsWith('.stl')).sort()) {
    const m = parse(f, fs.readFileSync(path.join(dir, f)));
    const pk = pack(m.idx, shift(transform(m.pos, src.yaw), off), 900);
    paint.push(`{ c: '#${f.slice(base.length + 2, -4)}', ...${lit(pk)} }`);
  }
  lines.push(`  '${src.key}': { near: ${lit(near)}, far: ${lit(far)}${paint.length ? `, a: [${paint.join(', ')}]` : ''} },`);
  console.log(`${src.key.padEnd(15)} ${mesh.idx.length / 3} -> ${near.tris} / ${far.tris} tris${paint.length ? `, ${paint.length} painted parts` : ''}`);
}
  return lines;
}
const lines = packFigures(SOURCES);
fs.writeFileSync(OUT, `// Generated by tools/figures.mjs - do not edit.
// The army men, modelled for the game in Blender (tools/blender/army_men.py), each on its stand.
// Each mesh: meshopt-compressed int16 positions (x, y, z, pad; units x ${Q}), Y-up, facing +X, feet at y = 0,
// and uint32 indices. near = close-up detail, far = light version for distant figures.
export const FIGURE_SCALE = ${Q};
export const FIGURES = {
${lines.join('\n')}
};
`);
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');

// ---- vehicles and aircraft (tools/blender/vehicles.py): already in game units, Z-up -> Y-up
const VQ = 8000;
const VEHICLES = ['jeep', 'ambulance', 'engtruck', 'apc', 'amphib', 'tank', 'tank_light', 'tank_heavy', 'rockets', 'heli', 'fighter', 'attacker', 'bomber', 'transport',
  // headquarters, emplacements and fortifications (tools/blender/structures.py)
  'hq', 'mgnest', 'fieldgun', 'aa', 'tower', 'sandbags0', 'sandbags1', 'wall0', 'wall1', 'wire', 'barrel', 'tanktrap', 'mine_at', 'mine_ap', 'chute'];
const BUDGET = { main: [7000, 1800], dark: [4500, 1000], turret_main: [2500, 1000], turret_dark: [1200, 600] };
// structures are made of many small pieces (bricks, sacks): smaller budgets keep the download light
const OVERRIDE = { tank: { main: [11000, 2500] }, tank_light: { main: [9000, 2200] }, tank_heavy: { main: [12000, 2800] }, apc: { main: [8000, 2000] }, hq: { main: [6000, 1800] }, mgnest: { main: [3000, 900] }, tower: { main: [4000, 1200] }, aa: { main: [3000, 900] },
  sandbags0: { main: [1800, 600] }, sandbags1: { main: [1800, 600] }, wall0: { main: [3500, 1000] }, wall1: { main: [3500, 1000] },
  wire: { dark: [1800, 700] }, barrel: { main: [1500, 500] },
  tanktrap: { main: [700, 250], dark: [400, 150] }, mine_at: { main: [200, 80], dark: [400, 120] }, mine_ap: { main: [150, 60], dark: [150, 60] } };
function packVehicles(vdir, keys) {
  const vlines = [];
  for (const key of keys) {
  const parts = [], paint = [];
  const files = fs.readdirSync(vdir).filter(f => f.startsWith(key + '__')).sort();
  if (!files.length) continue;
  for (const f of files) {
    const part = f.slice(key.length + 2, -4), m = parse(f, fs.readFileSync(path.join(vdir, f)));
    const pos = new Float32Array(m.pos.length);
    for (let i = 0; i < pos.length; i += 3) { pos[i] = m.pos[i]; pos[i + 1] = m.pos[i + 2]; pos[i + 2] = -m.pos[i + 1]; }
    if (BUDGET[part]) {
      const [n, fa] = (OVERRIDE[key] && OVERRIDE[key][part]) || BUDGET[part];
      parts.push(`${part}: { near: ${lit(pack(m.idx, pos, Math.min(n, m.idx.length / 3), VQ))}, far: ${lit(pack(m.idx, pos, fa, VQ))} }`);
    } else if (part === 'rotor' || part === 'tail') parts.push(`${part}: ${lit(pack(m.idx, pos, 0, VQ))}`);
    else paint.push(`{ c: '#${part}', ...${lit(pack(m.idx, pos, 0, VQ))} }`);
  }
  vlines.push(`  ${key}: { ${parts.join(', ')}${paint.length ? `, a: [${paint.join(', ')}]` : ''} },`);
  console.log(`${key.padEnd(10)} ${parts.length} parts, ${paint.length} painted`);
}
  return vlines;
}
const vlines = packVehicles(path.join(CACHE, 'vehicles'), VEHICLES);
fs.writeFileSync(OUT_VEH, `// Generated by tools/figures.mjs from tools/blender/vehicles.py - do not edit.
// Toy vehicles and aircraft modelled for the game in Blender. Same encoding as figures.js,
// positions in game units x ${VQ}; main/dark come as near + far versions, painted parts keep their colour.
export const VEHICLE_SCALE = ${VQ};
export const VEHICLES = {
${vlines.join('\n')}
};
`);
console.log('wrote', OUT_VEH, fs.statSync(OUT_VEH).size, 'bytes');

// ---- diorama scenery (tools/blender/scenery.py, town.py, beach.py): painted parts only, one budget per model
const SCENERY = { hedge0: 700, hedge1: 700, oak0: 1300, oak1: 1300, apple: 900, house: 4200, barn: 3800, stonewall: 700, hay: 900, reeds: 250, crater: 500,
  // the ruined town (tools/blender/town.py)
  house2a: 2600, house2b: 2600, house3a: 3000, house3b: 3000, house1: 1600, ruin2: 2800, ruin3: 3200, ruin1: 2000, church: 5000,
  monument: 1500, rubble: 700, barricade: 1500, hedgehog: 200, bridge: 2500, quay: 400, lamp: 200,
  // the beach landing (tools/blender/beach.py)
  casemate: 3000, pillbox: 2000, tobruk: 600, trench: 900, wire: 300, gate: 400, stakes: 300, dune: 500, lighthouse: 2500, rocks: 800, lcvp: 1800, mines: 100,
  // winter (tools/blender/winter.py)
  pine0: 300, pine1: 360, chalet: 3500, shed: 800, foxhole: 700, logs: 900, fallen: 500,
  // the desert (tools/blender/desert.py)
  palm0: 700, palm1: 700, adobe: 2200, adobe_ruin: 2600, outcrop: 1400, mesa: 2200, ridge: 500, sanddune: 400, sangar: 900, wreck: 1600, drums: 600, scrub: 250,
  // the jungle (tools/blender/jungle.py)
  jtree0: 600, jtree1: 650, fern: 150, bamboo: 700, hut: 2200, logbunker: 1800, banyan: 2200, planewreck: 1500, woodbridge: 1500,
  // mountains and the fortress (tools/blender/mountain.py)
  fir0: 300, fir1: 360, scree: 500, fwall: 500, ftower: 1500, fgate: 1500, keep: 2500 };
// which models each battlefield needs
const THEME_MODELS = {
  normandy: ['hedge0', 'hedge1', 'oak0', 'oak1', 'apple', 'house', 'barn', 'stonewall', 'hay', 'reeds', 'crater'],
  town: ['house2a', 'house2b', 'house3a', 'house3b', 'house1', 'ruin2', 'ruin3', 'ruin1', 'church', 'monument', 'rubble', 'barricade', 'hedgehog', 'bridge', 'quay', 'lamp', 'crater', 'oak0', 'oak1'],
  winter: ['pine0', 'pine1', 'chalet', 'shed', 'foxhole', 'logs', 'fallen', 'crater'],
  desert: ['palm0', 'palm1', 'adobe', 'adobe_ruin', 'outcrop', 'mesa', 'ridge', 'sanddune', 'sangar', 'wreck', 'drums', 'scrub', 'crater', 'mines', 'wire'],
  jungle: ['jtree0', 'jtree1', 'fern', 'bamboo', 'hut', 'logbunker', 'banyan', 'planewreck', 'woodbridge', 'palm0', 'palm1', 'crater'],
  mountain: ['fir0', 'fir1', 'pine0', 'pine1', 'rocks', 'scree', 'house', 'chalet', 'crater', 'fwall', 'ftower', 'fgate', 'keep'],
  // the fortress can stand on any battlefield (scenarios)
  fortress: ['fwall', 'ftower', 'fgate', 'keep'],
  beach: ['casemate', 'pillbox', 'tobruk', 'trench', 'wire', 'gate', 'stakes', 'dune', 'lighthouse', 'rocks', 'lcvp', 'mines', 'hedgehog', 'crater', 'house2a', 'house2b', 'ruin2', 'palm0', 'palm1'],
};
// buildings are boxes with thin walls and frames: simplify them carefully (a small error bound, so the
// budget is only a cap) and add a light "far" version for the town beyond the play area
const FAR = { chalet: 1200, house2a: 1100, house2b: 1100, house3a: 1200, house3b: 1200, house1: 800, ruin2: 1400, ruin3: 1500, ruin1: 1100, church: 1800, house: 1600, barn: 1400 };
const SOFTKEYS = new Set(['hedge0', 'hedge1', 'oak0', 'oak1', 'apple', 'hay', 'crater', 'rubble', 'reeds', 'dune', 'rocks', 'trench', 'tobruk', 'pine0', 'pine1', 'foxhole', 'fallen', 'logs', 'outcrop', 'mesa', 'ridge', 'sanddune', 'scrub', 'sangar', 'palm0', 'palm1', 'jtree0', 'jtree1', 'fern', 'bamboo', 'banyan', 'fir0', 'fir1', 'scree']);
const sdir = path.join(CACHE, 'scenery'), slines = {}, flines = {};
const packModel = (meshes, budget, error) => {
  const total = meshes.reduce((a, m) => a + m.idx.length / 3, 0);
  let got = 0;
  const parts = meshes.map(m => {
    const want = Math.max(12, Math.round(budget * (m.idx.length / 3) / total));
    const pk = pack(m.idx, m.pos, Math.min(want, m.idx.length / 3), VQ, error); got += pk.tris;
    return `{ c: '#${m.c}', ...${lit(pk)} }`;
  });
  return { parts, got, total };
};
for (const [key, budget] of Object.entries(SCENERY)) {
  const files = fs.readdirSync(sdir).filter(f => f.startsWith(key + '__')).sort();
  const meshes = files.map(f => {
    const m = parse(f, fs.readFileSync(path.join(sdir, f)));
    const pos = new Float32Array(m.pos.length);
    for (let i = 0; i < pos.length; i += 3) { pos[i] = m.pos[i]; pos[i + 1] = m.pos[i + 2]; pos[i + 2] = -m.pos[i + 1]; }
    return { c: f.slice(key.length + 2, -4), idx: m.idx, pos };
  });
  const near = packModel(meshes, budget, SOFTKEYS.has(key) ? 0.02 : 0.004);
  slines[key] = `  ${key}: [${near.parts.join(', ')}],`;
  let msg = `${key.padEnd(10)} ${meshes.length} parts, ${near.total} -> ${near.got} tris`;
  if (FAR[key]) { const far = packModel(meshes, FAR[key], 0.03); flines[key] = `  ${key}: [${far.parts.join(', ')}],`; msg += ` (far ${far.got})`; }
  console.log(msg);
}
// one file per battlefield next to the game (public/scenery-<theme>.js), downloaded when it is picked
for (const [theme, keys] of Object.entries(THEME_MODELS)) {
  const out = path.join(HERE, '..', 'public', `scenery-${theme}.js`);
  fs.writeFileSync(out, `// Generated by tools/figures.mjs from tools/blender/*.py - do not edit.
// Diorama scenery for the "${theme}" battlefield, modelled in Blender. Same encoding as vehicles.js
// (positions in game units x ${VQ}); every part keeps its colour; buildings also come in a light version.
export const SCENERY = {
${keys.map(k => slines[k]).join('\n')}
};
export const SCENERY_FAR = {
${keys.filter(k => flines[k]).map(k => flines[k]).join('\n')}
};
`);
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
}

// ---- the other armies (tools/blender/army_men.py --nation=xx, tools/blender/vehicles_xx.py): every
// model that looks different for that nation, in a file of its own next to the game
// (public/nation-xx.js), downloaded only when an army of that nation is in the battle
for (const nation of ['de']) {
  const fdir = path.join(CACHE, 'blender', nation), vdir = path.join(CACHE, 'vehicles', nation);
  const figs = fs.existsSync(fdir) ? packFigures(SOURCES.filter(src => fs.existsSync(path.join(fdir, src.key + '.stl')))
    .map(src => ({ ...src, name: `blender/${nation}/${src.key}.stl` }))) : [];
  const vehs = fs.existsSync(vdir) ? packVehicles(vdir, VEHICLES) : [];
  const out = path.join(HERE, '..', 'public', `nation-${nation}.js`);
  fs.writeFileSync(out, `// Generated by tools/figures.mjs - do not edit.
// The ${nation} army's own figures, vehicles and aircraft; same encoding as src/data/figures.js and vehicles.js.
export const FIGURES = {
${figs.join('\n')}
};
export const VEHICLES = {
${vehs.join('\n')}
};
`);
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
}
