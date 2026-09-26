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
import { MeshoptSimplifier } from 'meshoptimizer';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(HERE, '..', '.cache', 'figures');
const OUT = path.join(HERE, '..', 'src', 'data', 'figures.js');
// yaw: degrees to turn the figure so that where it aims ends up along +X (after +Z -> +X)
const SOURCES = [
  { key: 'rifle',   print: 449280, file: 1953262, name: 'min2rifle.stl',      yaw: 0 },
  { key: 'sniper',  print: 449280, file: 1953264, name: 'min4sniper.stl',     yaw: 0 },
  { key: 'crawl',   print: 744788, file: 3154784, name: 'Mini7Crawl.3mf',     yaw: 45 },
  { key: 'pointer', print: 744788, file: 3154785, name: 'Mini3_2GunMojo.3mf', yaw: -107 },
  { key: 'kneel',   print: 744788, file: 3154787, name: 'Mini5Sitting.3mf',   yaw: 0 },
  { key: 'mg50',    print: 744788, file: 3154790, name: 'Mini6MaDeuce.3mf',   yaw: 21 },
  // made in Blender (built facing -Y around the hips, so they keep their own centre)
  ...['bazooka', 'bazooka-stand', 'manpads', 'manpads-kneel', 'grenadier', 'grenadier-idle', 'medic', 'medic-heal', 'drag']
    .map(key => ({ key, name: `blender/${key}.stl`, yaw: 0, keepCentre: true })),
];
const TARGET_TRIS = 1500, HEIGHT_MM = 37, HEIGHT = 1.08, Q = 16000;

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
  if (name.endsWith('.stl')) {
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
  return keepCentre ? [0, min[1], 0] : [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
}
function shift(pos, off) { for (let i = 0; i < pos.length; i += 3) { pos[i] -= off[0]; pos[i + 1] -= off[1]; pos[i + 2] -= off[2]; } return pos; }

// simplify, drop unused vertices, quantise to int16 -> { p, i } base64
function pack(idx, pos, tris) {
  const [sidx] = MeshoptSimplifier.simplify(idx, pos, 3, tris * 3, 0.02, []);
  const used = new Map(), q = [], ind = new Uint16Array(sidx.length);
  for (let i = 0; i < sidx.length; i++) {
    let v = used.get(sidx[i]);
    if (v === undefined) { v = used.size; used.set(sidx[i], v); for (let k = 0; k < 3; k++) q.push(Math.round(pos[sidx[i] * 3 + k] * Q)); }
    ind[i] = v;
  }
  return { p: Buffer.from(Int16Array.from(q).buffer).toString('base64'), i: Buffer.from(ind.buffer).toString('base64'), tris: sidx.length / 3, verts: used.size };
}

await MeshoptSimplifier.ready;
const lines = [];
for (const src of SOURCES) {
  const mesh = parse(src.name, await fetchFile(src));
  const pos = transform(mesh.pos, src.yaw), off = placement(pos, src.keepCentre);
  const body = pack(mesh.idx, shift(pos, off), TARGET_TRIS);
  // painted parts next to a local figure: <name>__<rrggbb>.stl
  const paint = [];
  const dir = path.join(CACHE, path.dirname(src.name)), base = path.basename(src.name, '.stl');
  if (src.keepCentre) for (const f of fs.readdirSync(dir).filter(f => f.startsWith(base + '__') && f.endsWith('.stl')).sort()) {
    const m = parse(f, fs.readFileSync(path.join(dir, f)));
    const pk = pack(m.idx, shift(transform(m.pos, src.yaw), off), 300);
    paint.push(`{ c: '#${f.slice(base.length + 2, -4)}', p: '${pk.p}', i: '${pk.i}' }`);
  }
  lines.push(`  '${src.key}': { p: '${body.p}', i: '${body.i}'${paint.length ? `, a: [${paint.join(', ')}]` : ''} },`);
  console.log(`${src.key.padEnd(15)} ${mesh.idx.length / 3} -> ${body.tris} tris, ${body.verts} verts${paint.length ? `, ${paint.length} painted parts` : ''}`);
}
fs.writeFileSync(OUT, `// Generated by tools/figures.mjs - do not edit.
// rifle, sniper, crawl, pointer, kneel, mg50: "Miniature Army Men" 1 & 2 by alo89
// (https://www.printables.com/model/449280, https://www.printables.com/model/744788), CC BY 4.0,
// simplified and re-oriented for the game. The other poses were modelled for the game in Blender.
// Positions: int16 (units x ${Q}), Y-up, facing +X, feet at y = 0. Indices: uint16.
export const FIGURE_SCALE = ${Q};
export const FIGURES = {
${lines.join('\n')}
};
`);
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
