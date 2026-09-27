// Trail blazes: the Polish mark (white–red–white stripes) painted on stones beside the path every
// ~30 m, facing the hiker coming up. Each stone is a small block with one flat, weathered face that
// carries the mark; stones and marks are instanced.
import * as THREE from 'three';
import { patchShading } from './materials.js';
import { rng, simplex } from './noise.js';

function blazeTexture(color = '#c8201c') {
  const c = document.createElement('canvas'); c.width = 96; c.height = 128;
  const g = c.getContext('2d');
  const r = rng(5);
  g.clearRect(0, 0, 96, 128);
  const band = (y, h, col) => {
    g.fillStyle = col;
    // hand-painted: slightly wavy edges
    g.beginPath(); g.moveTo(6, y + (r() - 0.5) * 3);
    for (let x = 6; x <= 90; x += 12) g.lineTo(x, y + (r() - 0.5) * 3);
    for (let x = 90; x >= 6; x -= 12) g.lineTo(x, y + h + (r() - 0.5) * 3);
    g.closePath(); g.fill();
  };
  band(8, 36, '#f1eee6'); band(46, 36, color); band(84, 36, '#f1eee6');
  // weathering: speckles of rock showing through
  const d = g.getImageData(0, 0, 96, 128);
  for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3] > 0 && r() < 0.08) d.data[i + 3] = 60 + r() * 100;
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// block ~1 x 0.7 x 0.6 m, front (+z) face kept flat for the paint, the rest knobbly
function stoneGeometry() {
  const g = new THREE.BoxGeometry(1, 0.7, 0.6, 6, 5, 4);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const front = v.z > 0.29;
    // pull the box towards an ellipsoid (rounded boulder), keep the painted face flatter
    const e = v.clone().multiply(new THREE.Vector3(2, 2 / 0.7, 2 / 0.6)).normalize().multiply(new THREE.Vector3(0.5, 0.35, 0.3));
    v.lerp(e, front ? 0.25 : 0.6);
    const n = simplex(v.x * 3.1 + 11, v.y * 3.1 + v.z * 2.3) + 0.5 * simplex(v.x * 7 + 3, v.z * 7 - v.y * 5);
    v.multiplyScalar(1 + 0.12 * n * (front ? 0.25 : 1));
    p.setXYZ(i, v.x, v.y + 0.3, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildTrailMarks({ scene, terrain, trail, shade, rockTex, blocked, every = 30 }) {
  const N = trail.X.length, step = trail.step;
  const r = rng(99);
  const stones = [], marks = [];
  const heading = (i) => {
    const a = Math.max(0, i - 4), b = Math.min(N - 1, i + 4);
    const dx = trail.X[b] - trail.X[a], dz = trail.Z[b] - trail.Z[a], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const n = Math.round(every / step);
  for (let i = Math.round(25 / step); i < N - 10; i += n + Math.round((r() - 0.5) * n * 0.4)) {
    const [tx, tz] = heading(i);
    // the side with less drop (do not put the stone over the edge), else alternate
    let best = null;
    for (const side of (r() < 0.5 ? [1, -1] : [-1, 1])) {
      const nx = -tz * side, nz = tx * side;
      const x = trail.X[i] + nx * 2.1, z = trail.Z[i] + nz * 2.1;
      if (blocked(x, z)) continue;
      const drop = terrain.height(trail.X[i], trail.Z[i]) - terrain.height(x, z);
      if (!best || drop < best.drop) best = { x, z, side, drop };
    }
    if (!best) continue;
    const s = 0.8 + r() * 0.4;
    // front faces down the trail, turned ~35° towards the path so it reads from the approach
    const yaw = Math.atan2(-tx, -tz) + best.side * 0.6;
    q.setFromAxisAngle(up, yaw);
    const y = terrain.height(best.x, best.z) - 0.18 * s;
    m4.compose(new THREE.Vector3(best.x, y, best.z), q, new THREE.Vector3(s, s * (0.8 + r() * 0.4), s));
    stones.push(m4.clone());
    // the painted mark on the flat front face
    const fy = y + 0.34 * s, off = 0.305 * s + 0.012;
    const fx = best.x + Math.sin(yaw) * off, fz = best.z + Math.cos(yaw) * off;
    m4.compose(new THREE.Vector3(fx, fy, fz), q, new THREE.Vector3(0.2 / s, 0.27 / s, 1).multiplyScalar(s));
    marks.push(m4.clone());
  }
  rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
  const stoneMat = new THREE.MeshLambertMaterial({ map: rockTex, color: new THREE.Color(1.25, 1.32, 1.38) });
  patchShading(stoneMat, shade);
  const markMat = new THREE.MeshLambertMaterial({ map: blazeTexture(), transparent: true, alphaTest: 0.3,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  patchShading(markMat, shade);
  const group = new THREE.Group();
  const inst = (geo, mat, list, shadow) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((x, k) => m.setMatrixAt(k, x));
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
  };
  inst(stoneGeometry(), stoneMat, stones, true);
  inst(new THREE.PlaneGeometry(1, 1), markMat, marks, false);
  scene.add(group);
  return { group, count: stones.length };
}
