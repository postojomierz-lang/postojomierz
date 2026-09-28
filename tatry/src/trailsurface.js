// The footpath itself: sections with their width and surface (granite paving below, bare rock above
// the Bula), a sharp path mask around the camera (0.25 m per pixel instead of the 1.3 m of the whole
// area mask), and stone steps on the steep paved stretches.
import * as THREE from 'three';
import { patchShading } from './materials.js';
import { rng } from './noise.js';

// [from s (m), width (m), paved 0..1, wear 0..1] - Morskie Oko -> Rysy, read off the trail profile
export const SECTIONS = [
  [0, 2.6, 1.0, 1.0],      // along Morskie Oko: wide paved path
  [1250, 2.0, 1.0, 1.0],   // stone stairs up to Czarny Staw
  [1800, 1.6, 0.6, 0.9],   // round Czarny Staw: partly paved, rocky
  [2650, 1.35, 0.75, 0.85],// the climb to the Bula: stone path and steps
  [3650, 1.0, 0.0, 0.45],  // above the Bula: bare rock, scree, a faint worn line
];
const lerp = (a, b, t) => a + (b - a) * t;
// section values at s, blended over 40 m across each change
export function sectionAt(s) {
  let k = 0;
  while (k + 1 < SECTIONS.length && SECTIONS[k + 1][0] <= s) k++;
  const cur = SECTIONS[k], next = SECTIONS[k + 1], prev = SECTIONS[k - 1];
  if (next && next[0] - s < 20) return mixSec(cur, next, (20 - (next[0] - s)) / 40);
  if (prev && s - cur[0] < 20) return mixSec(cur, prev, (20 - (s - cur[0])) / 40);
  return mixSec(cur, cur, 0);
}
const mixSec = (a, b, t) => ({ width: lerp(a[1], b[1], t), paved: lerp(a[2], b[2], t), wear: lerp(a[3], b[3], t) });

// sharp path mask in a window around the camera: R = path (soft edge), G = R * paved
export function makeTrailWindow({ trail, px = 1024, size = 256, sections = sectionAt }) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = px;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const rect = { value: new THREE.Vector4(0, 0, 0, 0) };
  const N = trail.X.length, step = trail.step;
  // width with a little natural variation
  const W = new Float32Array(N), P = new Float32Array(N), E = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = i * step, sec = sections(s);
    W[i] = sec.width * (1 + 0.12 * Math.sin(s / 7.3) + 0.08 * Math.sin(s / 2.9 + 1.3));
    P[i] = sec.paved; E[i] = sec.wear;
  }
  let c = null;
  function update(cx, cz) {
    if (c && Math.hypot(cx - c.x, cz - c.z) < size * 0.25) return;
    c = { x: cx, z: cz };
    const x0 = Math.round(cx / 16) * 16 - size / 2, z0 = Math.round(cz / 16) * 16 - size / 2, k = px / size;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, px, px);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // three layers: worn fringe, path, trodden middle; blending keeps G/R = paved
    const layers = [[1.0, 0.3], [0, 0.55], [-0.45, 0.8]];
    for (const [extra, alpha] of layers) {
      for (let i = 0; i < N - 1; i++) {
        const x = trail.X[i], z = trail.Z[i];
        if (x < x0 - 4 || z < z0 - 4 || x > x0 + size + 4 || z > z0 + size + 4) continue;
        const w = extra < 0 ? W[i] * (1 + extra) : W[i] + extra;
        g.strokeStyle = `rgba(255,${Math.round(P[i] * 255)},0,${(alpha * E[i]).toFixed(3)})`;
        g.lineWidth = Math.max(1, w * k);
        g.beginPath(); g.moveTo((x - x0) * k, (z - z0) * k); g.lineTo((trail.X[i + 1] - x0) * k, (trail.Z[i + 1] - z0) * k); g.stroke();
      }
    }
    tex.needsUpdate = true;
    rect.value.set(x0, z0, x0 + size, z0 + size);
  }
  return { map: { value: tex }, rect, update };
}

// stone steps: horizontal granite treads across the path wherever the paved path climbs steeply
export function buildSteps({ scene, terrain, trail, TH, shade, rockTex, sections = sectionAt }) {
  const N = trail.X.length, step = trail.step;
  const r = rng(314);
  const grade = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 3), b = Math.min(N - 1, i + 3);
    grade[i] = (TH[b] - TH[a]) / ((b - a) * step);
  }
  const mats = [];
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4();
  let lastY = -Infinity, lastI = -99;
  for (let i = 2; i < N - 2; i++) {
    const s = i * step, sec = sections(s);
    if (sec.paved < 0.5 || grade[i] < 0.2) { lastY = -Infinity; continue; }
    const rise = 0.2 + r() * 0.08;
    if (TH[i] - lastY < rise || i - lastI < 1) continue;
    lastY = TH[i]; lastI = i;
    const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
    let tx = trail.X[b] - trail.X[a], tz = trail.Z[b] - trail.Z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const depth = 0.34 + r() * 0.1;
    // the tread is level with the ground at its back (uphill) edge, so it stands out at the front
    const bx = trail.X[i] + tx * depth / 2, bz = trail.Z[i] + tz * depth / 2;
    const top = terrain.height(bx, bz) + 0.03;
    const width = sections(s).width * (0.8 + r() * 0.15);
    // now and then two blocks instead of one
    const parts = r() < 0.35 ? [[-0.25, 0.48], [0.26, 0.5]] : [[0, 1]];
    for (const [off, frac] of parts) {
      const yaw = Math.atan2(tx, tz) + (r() - 0.5) * 0.12;
      q.setFromAxisAngle(up, yaw);
      const nx = tz, nz = -tx;   // across the path
      const cx = trail.X[i] + nx * off * width, cz = trail.Z[i] + nz * off * width;
      const h = 0.45;
      m4.compose(new THREE.Vector3(cx, top - h / 2, cz), q, new THREE.Vector3(width * frac * (0.95 + r() * 0.08), h, depth));
      mats.push(m4.clone());
    }
  }
  // unit block, slightly rounded, UVs in metres after scaling (set per face below)
  const geo = new THREE.BoxGeometry(1, 1, 1, 3, 1, 2);
  const p = geo.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    // bevel the top edges a little
    const e = (Math.abs(x) > 0.49 ? 1 : 0) + (Math.abs(z) > 0.49 ? 1 : 0);
    if (y > 0.49 && e) p.setY(k, y - 0.04 * e);
  }
  geo.computeVertexNormals();
  rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshLambertMaterial({ map: rockTex, color: new THREE.Color(1.2, 1.26, 1.32) });
  patchShading(mat, shade);
  // world-scaled texture coordinates: the instance scale stretches the unit box, undo it in the shader
  mat.onBeforeCompile = ((prev) => (sh) => {
    prev(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
      {
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 an = abs(normal);
        vec2 f = an.y > 0.5 ? sc.xz : an.x > 0.5 ? sc.zy : sc.xy;
        vMapUv = uv * f * 0.9 + instanceMatrix[3].xz * 0.37;
      }
      #endif`);
  })(mat.onBeforeCompile);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  mats.forEach((x, k) => mesh.setMatrixAt(k, x));
  mesh.count = mats.length;
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, count: mats.length };
}
