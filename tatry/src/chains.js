// Fixed chains and steel staples (klamry) on the rocky upper part of the Rysy trail: above the Bula
// pod Rysami (~2075 m) wherever the trail is steep. Chains run beside the path on the uphill-rock side,
// hung from anchor pins every ~3 m and sagging between them; staples sit on the steepest slabs as
// rungs. Links are instanced tori (alternating by 90°), pins and staples instanced too.
import * as THREE from 'three';
import { patchShading } from './materials.js';

export function buildChains({ scene, terrain, trail, TH, shade, isPath }) {
  const N = trail.X.length, step = trail.step;
  // smoothed grade per metre of trail
  const grade = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 8), b = Math.min(N - 1, i + 8);
    grade[i] = (TH[b] - TH[a]) / ((b - a) * step);
  }
  const runs = (test, gap, minLen) => {
    const out = [];
    let s = -1, last = -1;
    for (let i = 0; i < N; i++) {
      if (test(i)) { if (s < 0) s = i; last = i; }
      else if (s >= 0 && i - last > gap) { if (last - s >= minLen) out.push([s, last]); s = -1; }
    }
    if (s >= 0 && last - s >= minLen) out.push([s, last]);
    return out;
  };
  const chainRuns = runs((i) => TH[i] > 2075 && grade[i] > 0.4, 14, 12);
  const stapleRuns = runs((i) => TH[i] > 2075 && grade[i] > 0.88, 3, 4);

  const heading = (i) => {
    const a = Math.max(0, i - 3), b = Math.min(N - 1, i + 3);
    const dx = trail.X[b] - trail.X[a], dz = trail.Z[b] - trail.Z[a], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  // which side of the path is the rock (higher ground): +1 left, -1 right
  const sideAt = (i) => {
    const [tx, tz] = heading(i), nx = -tz, nz = tx;
    const x = trail.X[i], z = trail.Z[i];
    return terrain.height(x + nx * 1.6, z + nz * 1.6) >= terrain.height(x - nx * 1.6, z - nz * 1.6) ? 1 : -1;
  };

  const anchors = [];   // [x, y, z] rock pins
  const links = [];     // matrices
  const staples = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0), dirV = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const LINK = 0.07;    // link pitch (m)

  for (const [s, e] of chainRuns) {
    // one side for the whole run, decided by the majority
    let vote = 0;
    for (let i = s; i <= e; i += 4) vote += sideAt(i);
    const side = vote >= 0 ? 1 : -1;
    const pts = [];
    for (let i = s; i <= e; i += Math.round(3 / step)) {
      const [tx, tz] = heading(i), nx = -tz * side, nz = tx * side;
      let x = trail.X[i] + nx * 0.9, z = trail.Z[i] + nz * 0.9;
      if (isPath(x, z)) { x += nx * 0.4; z += nz * 0.4; }
      pts.push([x, terrain.height(x, z) + 0.55, z]);
    }
    for (const p of pts) anchors.push(p);
    // links along a sagging curve between neighbouring anchors
    let k = 0;
    for (let a = 0; a < pts.length - 1; a++) {
      const A = pts[a], B = pts[a + 1];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      const n = Math.max(2, Math.round(L * 1.03 / LINK));
      const sag = 0.18 * L / 3;
      let prev = null;
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        const p = new THREE.Vector3(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t);
        const g = terrain.height(p.x, p.z) + 0.08;
        if (p.y < g) p.y = g;                           // rests on the rock instead of cutting through it
        if (prev) {
          dirV.subVectors(p, prev).normalize();
          q.setFromUnitVectors(X, dirV);
          q2.setFromAxisAngle(X, (k++ % 2) * Math.PI / 2);
          m4.compose(prev.clone().lerp(p, 0.5), q.clone().multiply(q2), new THREE.Vector3(1, 1, 1));
          links.push(m4.clone());
        }
        prev = p;
      }
    }
  }
  for (const [s, e] of stapleRuns) {
    const side = sideAt(Math.round((s + e) / 2));
    let lastY = -Infinity;
    for (let i = s; i <= e; i++) {
      if (TH[i] - lastY < 0.45) continue;               // a rung every ~45 cm of height
      lastY = TH[i];
      const [tx, tz] = heading(i), nx = -tz * side, nz = tx * side;
      const x = trail.X[i] + nx * 0.2, z = trail.Z[i] + nz * 0.2;
      const nrm = terrain.normal(x, z, 0.8);
      const y = terrain.height(x, z);
      // staple lies across the path direction, standing out of the rock along its normal
      q.setFromUnitVectors(up, nrm);
      const across = Math.atan2(-nz, nx);   // local x (the rung) across the path
      q2.setFromAxisAngle(up, across);
      // the drawn 1.25 m mesh can sit a few cm above the 1 m height field: lift the rung clear of it
      m4.compose(new THREE.Vector3(x, y + 0.05, z).addScaledVector(nrm, 0.03), q.clone().multiply(q2), new THREE.Vector3(1.3, 1.3, 1.3));
      staples.push(m4.clone());
    }
  }

  const steel = new THREE.MeshLambertMaterial({ color: 0x8a8d90 });
  const rusty = new THREE.MeshLambertMaterial({ color: 0x6d6760 });
  patchShading(steel, shade); patchShading(rusty, shade);
  const group = new THREE.Group();
  const inst = (geo, mat, list) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((x, i) => m.setMatrixAt(i, x));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  };
  // link: elongated torus along x
  const linkGeo = new THREE.TorusGeometry(0.03, 0.007, 5, 10); linkGeo.scale(1.45, 1, 1);
  inst(linkGeo, steel, links);
  // anchor pin: a short bar out of the rock with an eye on top
  const pin = new THREE.CylinderGeometry(0.016, 0.016, 0.6, 6); pin.translate(0, -0.28, 0);
  inst(pin, rusty, anchors.map((p) => new THREE.Matrix4().makeTranslation(p[0], p[1], p[2])));
  // staple: U-shaped rung, 40 cm wide, 15 cm out of the rock
  const u = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, -0.05, 0), new THREE.Vector3(-0.2, 0.15, 0), new THREE.Vector3(-0.16, 0.19, 0),
    new THREE.Vector3(0.16, 0.19, 0), new THREE.Vector3(0.2, 0.15, 0), new THREE.Vector3(0.2, -0.05, 0)], false, 'catmullrom', 0.1);
  inst(new THREE.TubeGeometry(u, 16, 0.012, 5), steel, staples);
  scene.add(group);
  const chainedMetres = chainRuns.reduce((a, [s, e]) => a + (e - s) * step, 0);
  return { group, chainRuns, stapleRuns, counts: { links: links.length, anchors: anchors.length, staples: staples.length, chainedMetres } };
}
