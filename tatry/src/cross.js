// The cross on Wielki Giewont (1894 m): the steel lattice cross put up in 1901, 15 m high on a concrete
// base, seen from Zakopane. Built as a truss of thin rods (four corner bars and the diagonal bracing on
// every face), merged into one mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchShading } from './materials.js';
import { toLocal } from './region.js';

const SITE = [19.93396, 49.25097];            // the summit rock, a few metres north-west of the survey point
const UP = new THREE.Vector3(0, 1, 0);

export function buildCross({ scene, terrain, shade }) {
  const [x, z] = toLocal(SITE[0], SITE[1]);
  const g0 = terrain.height(x, z);
  if (!Number.isFinite(g0)) return null;
  const parts = [];
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion();
  function rod(a, b, t = 0.06) {
    const d = tmp.subVectors(b, a), len = d.length();
    const geo = new THREE.BoxGeometry(t, len, t);
    q.setFromUnitVectors(UP, d.clone().normalize());
    geo.applyQuaternion(q);
    geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(geo);
  }
  // a square lattice beam from a to b, s wide, braced every `bay` metres
  function beam(a, b, s, side) {
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length(); dir.normalize();
    const u = side.clone().normalize().multiplyScalar(s / 2), w = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(s / 2);
    const corners = [u.clone().add(w), u.clone().sub(w), u.clone().negate().sub(w), u.clone().negate().add(w)];
    for (const c of corners) rod(a.clone().add(c), b.clone().add(c), 0.09);
    const n = Math.max(1, Math.round(len / s));
    for (let i = 0; i < n; i++) {
      const p0 = a.clone().addScaledVector(dir, len * i / n), p1 = a.clone().addScaledVector(dir, len * (i + 1) / n);
      for (let k = 0; k < 4; k++) {
        const c0 = corners[k], c1 = corners[(k + 1) % 4];
        rod(p0.clone().add(i % 2 ? c0 : c1), p1.clone().add(i % 2 ? c1 : c0), 0.045);   // zig-zag on each face
        rod(p0.clone().add(c0), p0.clone().add(c1), 0.045);                              // the rungs
      }
    }
  }
  const base = 1.2, H = 15, armY = 10.3, arm = 3.1, s = 0.75;
  const east = new THREE.Vector3(1, 0, 0), north = new THREE.Vector3(0, 0, 1);
  beam(new THREE.Vector3(0, base, 0), new THREE.Vector3(0, base + H, 0), s, east);
  beam(new THREE.Vector3(-arm, base + armY, 0), new THREE.Vector3(arm, base + armY, 0), s * 0.85, north);
  const steel = new THREE.MeshLambertMaterial({ color: 0x5d6166 });
  patchShading(steel, shade);
  const mesh = new THREE.Mesh(mergeGeometries(parts), steel);
  parts.forEach((p) => p.dispose());
  // the concrete foot, set into the rock
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.6, base + 1.5, 1.6), new THREE.MeshLambertMaterial({ color: 0x8c8a84 }));
  patchShading(foot.material, shade);
  foot.position.y = (base - 1.5) / 2;
  const cross = new THREE.Group();
  cross.add(mesh, foot);
  // the arms face Zakopane (north-east, as seen from the town)
  cross.rotation.y = 0.35;
  cross.position.set(x, g0, z);
  cross.name = 'giewont-cross';
  scene.add(cross);
  return cross;
}
