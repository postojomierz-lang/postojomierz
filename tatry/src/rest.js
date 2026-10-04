// Places to rest and to get water along the route, from OpenStreetMap (tools/prepare_rest.py): log benches,
// picnic tables, shelters (wiaty) and springs, as small instanced models beside the path; the springs also get
// a label (💧, the drinking ones say so). Only those within 80 m of the route; one standing on the path is
// moved to its edge.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchShading } from './materials.js';
import { toLocal } from './region.js';

const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  return g.translate(x, y, z);
};
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);

// each kind: its parts by material (wood, stone, water), in metres, x along the trail
function models() {
  const bench = { wood: [cyl(0.16, 0.19, 0.42, -0.6, 0.21, 0), cyl(0.16, 0.19, 0.42, 0.6, 0.21, 0), box(1.7, 0.08, 0.34, 0, 0.46, 0)] };
  const table = {
    wood: [box(1.8, 0.06, 0.8, 0, 0.76, 0), box(0.08, 0.76, 0.7, -0.7, 0.38, 0), box(0.08, 0.76, 0.7, 0.7, 0.38, 0),
      box(1.8, 0.05, 0.28, 0, 0.45, 0.64), box(1.8, 0.05, 0.28, 0, 0.45, -0.64), box(0.08, 0.45, 1.6, -0.7, 0.22, 0), box(0.08, 0.45, 1.6, 0.7, 0.22, 0)],
  };
  const shelter = {
    wood: [...[[-1.6, -1.3], [1.6, -1.3], [-1.6, 1.3], [1.6, 1.3]].map(([x, z]) => box(0.15, 2.3, 0.15, x, 1.15, z)),
      box(3.9, 0.07, 1.75, 0, 2.62, 0.7, 0.55), box(3.9, 0.07, 1.75, 0, 2.62, -0.7, -0.55), box(3.4, 0.1, 0.12, 0, 2.3, 0),
      box(2.6, 0.07, 0.34, 0, 0.46, -1.0), cyl(0.15, 0.18, 0.42, -1.0, 0.21, -1.0), cyl(0.15, 0.18, 0.42, 1.0, 0.21, -1.0)],
  };
  // a spring: a ring of stones round a little pool, the water out of a pipe from a stone block
  const stones = [];
  for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; stones.push(new THREE.DodecahedronGeometry(0.2).scale(1, 0.8, 1).translate(Math.cos(a) * 0.6, 0.12, Math.sin(a) * 0.6)); }
  const spring = {
    stone: [...stones, box(0.5, 0.45, 0.35, 0, 0.22, -0.75)],
    wood: [new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6).rotateX(Math.PI / 2).translate(0, 0.32, -0.5)],
    water: [new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2).translate(0, 0.16, 0)],
  };
  // drinking water: the same with a post and a blue plate
  const pitna = { ...spring, wood: [...spring.wood, box(0.08, 1.2, 0.08, 0.75, 0.6, -0.6)], plate: [box(0.3, 0.22, 0.02, 0.75, 1.1, -0.55)] };
  const merged = (m) => Object.fromEntries(Object.entries(m).map(([k, list]) => [k, mergeGeometries(list.map((g) => g.index ? g.toNonIndexed() : g))]));
  return { bench: merged(bench), table: merged(table), shelter: merged(shelter), zrodlo: merged(spring), pitna: merged(pitna) };
}

export function buildRest({ scene, terrain, shade, trail, data, isPath = () => false, maxDist = 80 }) {
  const N = trail.X.length;
  // the route's points in 50 m cells
  const C = 50, cells = new Map();
  for (let i = 0; i < N; i += 2) {
    const k = Math.floor(trail.X[i] / C) * 100003 + Math.floor(trail.Z[i] / C);
    let l = cells.get(k); if (!l) cells.set(k, l = []);
    l.push(i);
  }
  const nearest = (x, z) => {
    let best = -1, bd = maxDist;
    const R = Math.ceil(maxDist / C);
    for (let cx = Math.floor(x / C) - R; cx <= Math.floor(x / C) + R; cx++) {
      for (let cz = Math.floor(z / C) - R; cz <= Math.floor(z / C) + R; cz++) {
        for (const i of cells.get(cx * 100003 + cz) || []) { const d = Math.hypot(trail.X[i] - x, trail.Z[i] - z); if (d < bd) { bd = d; best = i; } }
      }
    }
    return best;
  };
  const place = (lon, lat) => {
    let [x, z] = toLocal(lon, lat);
    const i = nearest(x, z);
    if (i < 0) return null;
    const a = Math.max(0, i - 3), b = Math.min(N - 1, i + 3);
    const tx = trail.X[b] - trail.X[a], tz = trail.Z[b] - trail.Z[a], tl = Math.hypot(tx, tz) || 1;
    // standing on the path: moved off it, to the side it is on
    if (isPath(x, z)) {
      const side = Math.sign((x - trail.X[i]) * -tz + (z - trail.Z[i]) * tx) || 1;
      for (let k = 0; k < 8 && isPath(x, z); k++) { x += -tz / tl * side * 0.5; z += tx / tl * side * 0.5; }
    }
    // the long side along the trail, the seat facing the path
    const yaw = Math.atan2(tz, tx), face = Math.sign((trail.X[i] - x) * -tz + (trail.Z[i] - z) * tx) || 1;
    return { x, z, y: terrain.height(x, z), yaw: -yaw + (face < 0 ? Math.PI : 0) };
  };
  const M = models();
  const mats = {
    wood: new THREE.MeshLambertMaterial({ color: 0x7d5c3e }), stone: new THREE.MeshLambertMaterial({ color: 0x75736c }),
    water: new THREE.MeshLambertMaterial({ color: 0x4f8fb0 }), plate: new THREE.MeshLambertMaterial({ color: 0x2a6fd0 }),
  };
  for (const m of Object.values(mats)) patchShading(m, shade);
  const at = { bench: [], table: [], shelter: [], zrodlo: [], pitna: [] };
  const labels = [];
  for (const [lon, lat, kind] of data.r || []) { const p = place(lon, lat); if (p) at[kind].push(p); }
  for (const [lon, lat, kind, name] of data.w || []) {
    const p = place(lon, lat);
    if (!p) continue;
    at[kind].push(p);
    labels.push({ kind: 'spring', x: p.x, z: p.z, name: name || (kind === 'pitna' ? 'Woda pitna' : 'Źródło'), ele: 0, noFind: true,
      note: kind === 'pitna' ? 'woda pitna' : 'woda niesprawdzona' });
  }
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const [kind, list] of Object.entries(at)) {
    if (!list.length) continue;
    for (const [mat, geo] of Object.entries(M[kind])) {
      const im = new THREE.InstancedMesh(geo, mats[mat], list.length);
      list.forEach((p, k) => { q.setFromAxisAngle(up, p.yaw); m4.compose(new THREE.Vector3(p.x, p.y - 0.04, p.z), q, one); im.setMatrixAt(k, m4); });
      im.castShadow = mat === 'wood'; im.receiveShadow = true; im.userData.kind = kind;
      group.add(im);
    }
  }
  scene.add(group);
  return { group, labels, counts: Object.fromEntries(Object.entries(at).map(([k, l]) => [k, l.length])) };
}
