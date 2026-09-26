// Builds src/data/figures.js from
//  - the "Miniature Army Men" 3D-print models by alo89 (https://www.printables.com/model/449280
//    and /744788, CC BY 4.0), downloaded into .cache/, and
//  - our own Blender figures for the missing poses (tools/blender/army_men.py -> .cache/figures/blender).
// Turns them Y-up and facing +X, shrinks them to game size, simplifies them to ~1500 triangles
// and stores them as compact base64 arrays. Painted parts (<pose>__<rrggbb>.stl) keep their colour.
//   python tools/blender/army_men.py   (needs: pip install bpy)
//   node tools/figures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(HERE, '..', '.cache', 'figures');
const OUT = path.join(HERE, '..', 'src', 'data', 'figures.js');
const OUT_VEH = path.join(HERE, '..', 'src', 'data', 'vehicles.js');
// yaw: degrees to turn the figure so that where it aims ends up along +X (after +Z -> +X)
const SOURCES = [
  { key: 'rifle',   print: 449280, file: 1953262, name: 'min2rifle.stl',      yaw: 0 },
  { key: 'sniper',  print: 449280, file: 1953264, name: 'min4sniper.stl',     yaw: 0 },
  { key: 'crawl',   print: 744788, file: 3154784, name: 'Mini7Crawl.3mf',     yaw: 45 },
  { key: 'pointer', print: 744788, file: 3154785, name: 'Mini3_2GunMojo.3mf', yaw: -107 },
  { key: 'kneel',   print: 744788, file: 3154787, name: 'Mini5Sitting.3mf',   yaw: 0 },
  { key: 'mg50',    print: 744788, file: 3154790, name: 'Mini6MaDeuce.3mf',   yaw: 21 },
  // made in Blender (built facing -Y around the hips, so they keep their own centre)
  ...['bazooka', 'bazooka-stand', 'manpads', 'manpads-kneel', 'grenadier', 'grenadier-idle', 'medic', 'medic-heal', 'drag', 'gunner', 'lookout']
    .map(key => ({ key, name: `blender/${key}.stl`, yaw: 0, keepCentre: true })),
  // "Living soldiers" mode: no stands; standing ones come with separate legs (see army_men.py)
  ...['bazooka', 'bazooka-stand', 'manpads', 'manpads-kneel', 'grenadier', 'grenadier-idle', 'medic', 'medic-heal', 'drag', 'rifleman', 'officer', 'sniper']
    .map(k => ({ key: 'living-' + k, name: `blender/living-${k}.stl`, yaw: 0, keepCentre: true })),
];
const LEG_TRIS = 700;
const NEAR_TRIS = 5000, FAR_TRIS = 1200, HEIGHT_MM = 37, HEIGHT = 1.08, Q = 16000;

async function fetchFile(src) {
  const dst = path.join(CACHE, src.name);
  if (fs.existsSync(dst)) return fs.readFileSync(dst);
  if (!src.print) throw new Error(`${dst} missing - run: python tools/blender/army_men.py`);
  fs.mkdirSync(CACHE, { recursive: true });
  const r = await fetch('https://api.printables.com/graphql/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: `mutation { getDownloadLink(id: ${src.file}, printId: ${src.print}, fileType: stl, source: model_detail) { ok output { link } } }` }),
  });
  const link = (await r.json()).data.getDownloadLink.output.link;
  const buf = Buffer.from(await (await fetch(link)).arrayBuffer());
  fs.writeFileSync(dst, buf);
  return buf;
}

// -> { pos: Float32Array (x,y,z mm, Z-up), idx: Uint32Array }, vertices welded
function parse(name, buf) {
  const pts = [], tris = [];
  if (!name.endsWith('.3mf')) {
    const n = buf.readUInt32LE(80);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 3; k++) pts.push([buf.readFloatLE(o + k * 12), buf.readFloatLE(o + k * 12 + 4), buf.readFloatLE(o + k * 12 + 8)]);
      tris.push([i * 3, i * 3 + 1, i * 3 + 2]);
    }
  } else {
    const xml = strFromU8(unzipSync(new Uint8Array(buf))['3D/3dmodel.model']);
    for (const m of xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)) pts.push([+m[1], +m[2], +m[3]]);
    for (const m of xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) tris.push([+m[1], +m[2], +m[3]]);
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
function pack(idx, pos, tris, scale = Q) {
  const [sidx] = tris && tris * 3 < idx.length ? MeshoptSimplifier.simplify(idx, pos, 3, tris * 3, 0.02, []) : [idx];
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
const lines = [];
for (const src of SOURCES) {
  const mesh = parse(src.name, await fetchFile(src));
  const pos = transform(mesh.pos, src.yaw), off = placement(pos, src.keepCentre);
  shift(pos, off);
  const living = src.key.startsWith('living-');   // the second set of figures: a little lighter
  const near = pack(mesh.idx, pos, living ? 3500 : NEAR_TRIS), far = pack(mesh.idx, pos, living ? 1000 : FAR_TRIS);
  // painted parts next to a local figure: <name>__<rrggbb>.stl
  const paint = [];
  const dir = path.join(CACHE, path.dirname(src.name)), base = path.basename(src.name, '.stl');
  if (src.keepCentre) for (const f of fs.readdirSync(dir).filter(f => f.startsWith(base + '__') && f.endsWith('.stl')).sort()) {
    const m = parse(f, fs.readFileSync(path.join(dir, f)));
    const pk = pack(m.idx, shift(transform(m.pos, src.yaw), off), 900);
    paint.push(`{ c: '#${f.slice(base.length + 2, -4)}', ...${lit(pk)} }`);
  }
  // separate legs swung from the hips (Living soldiers), each stored relative to its hip pivot
  const legs = [];
  const hipFile = path.join(dir, base + '.json');
  if (src.keepCentre && fs.existsSync(hipFile)) {
    const s = HEIGHT / HEIGHT_MM;
    JSON.parse(fs.readFileSync(hipFile, 'utf8')).hips.forEach(([f, l, u], i) => {
      const hip = [f * s, u * s, l * s];
      const m = parse('leg', fs.readFileSync(path.join(dir, `${base}-leg${i ? 'R' : 'L'}.stl`)));
      const pk = pack(m.idx, shift(transform(m.pos, src.yaw), hip), LEG_TRIS);
      legs.push(`{ hip: [${hip.map(v => +v.toFixed(4)).join(', ')}], ...${lit(pk)} }`);
    });
  }
  lines.push(`  '${src.key}': { near: ${lit(near)}, far: ${lit(far)}${paint.length ? `, a: [${paint.join(', ')}]` : ''}${legs.length ? `, legs: [${legs.join(', ')}]` : ''} },`);
  console.log(`${src.key.padEnd(15)} ${mesh.idx.length / 3} -> ${near.tris} / ${far.tris} tris${paint.length ? `, ${paint.length} painted parts` : ''}`);
}
fs.writeFileSync(OUT, `// Generated by tools/figures.mjs - do not edit.
// rifle, sniper, crawl, pointer, kneel, mg50: "Miniature Army Men" 1 & 2 by alo89
// (https://www.printables.com/model/449280, https://www.printables.com/model/744788), CC BY 4.0,
// simplified and re-oriented for the game. The other poses were modelled for the game in Blender.
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
const VEHICLES = ['jeep', 'ambulance', 'apc', 'amphib', 'tank', 'rockets', 'heli', 'fighter', 'attacker', 'bomber', 'transport',
  // headquarters, emplacements and fortifications (tools/blender/structures.py)
  'hq', 'mgnest', 'fieldgun', 'aa', 'tower', 'sandbags0', 'sandbags1', 'wall0', 'wall1', 'wire', 'barrel', 'chute'];
const BUDGET = { main: [7000, 1800], dark: [4500, 1000], turret_main: [2500, 1000], turret_dark: [1200, 600] };
// structures are made of many small pieces (bricks, sacks): smaller budgets keep the download light
const OVERRIDE = { hq: { main: [6000, 1800] }, mgnest: { main: [3000, 900] }, tower: { main: [4000, 1200] }, aa: { main: [3000, 900] },
  sandbags0: { main: [1800, 600] }, sandbags1: { main: [1800, 600] }, wall0: { main: [3500, 1000] }, wall1: { main: [3500, 1000] },
  wire: { dark: [1800, 700] }, barrel: { main: [1500, 500] } };
const vdir = path.join(CACHE, 'vehicles');
const vlines = [];
for (const key of VEHICLES) {
  const parts = [], paint = [];
  for (const f of fs.readdirSync(vdir).filter(f => f.startsWith(key + '__')).sort()) {
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
fs.writeFileSync(OUT_VEH, `// Generated by tools/figures.mjs from tools/blender/vehicles.py - do not edit.
// Toy vehicles and aircraft modelled for the game in Blender. Same encoding as figures.js,
// positions in game units x ${VQ}; main/dark come as near + far versions, painted parts keep their colour.
export const VEHICLE_SCALE = ${VQ};
export const VEHICLES = {
${vlines.join('\n')}
};
`);
console.log('wrote', OUT_VEH, fs.statSync(OUT_VEH).size, 'bytes');
