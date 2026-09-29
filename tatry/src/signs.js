// PTTK signposts: a grey steel pole with a white location plate (name, altitude) and yellow arrow-shaped
// direction boards with the red trail colour and the walking time. Times are computed from the trail
// profile with PTTK-style norms (see walkMinutes), rounded to 5 minutes; close to, but not, the official times.
import * as THREE from 'three';
import { patchShading } from './materials.js';
import { stepMinutes } from './planner/graph.js';

const fmt = (min) => {
  const m = Math.max(5, Math.round(min / 5) * 5);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
};

function plateTexture(title, ele) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 122);
  g.fillStyle = '#1d1d1d'; g.textAlign = 'center';
  let size = 44; g.font = `700 ${size}px system-ui, sans-serif`;
  while (g.measureText(title).width > 480 && size > 22) { size -= 2; g.font = `700 ${size}px system-ui, sans-serif`; }
  g.fillText(title, 256, ele ? 62 : 78);
  if (ele) { g.font = '500 34px system-ui, sans-serif'; g.fillText(`${ele} m n.p.m.`, 256, 108); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// arrow-shaped yellow board; left = true draws the tip on the left (the back face of the same board)
function boardTexture(dest, time, left = false) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 128;
  const g = c.getContext('2d');
  const X = (x) => (left ? 640 - x : x);
  g.fillStyle = '#f2c400';
  g.beginPath(); g.moveTo(X(0), 0); g.lineTo(X(580), 0); g.lineTo(X(640), 64); g.lineTo(X(580), 128); g.lineTo(X(0), 128); g.closePath(); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 5; g.stroke();
  // trail colour: red stripe between white, at the blunt end
  const sx = left ? 640 - 78 : 18;
  g.fillStyle = '#fff'; g.fillRect(sx, 28, 60, 72);
  g.fillStyle = '#c8201c'; g.fillRect(sx, 52, 60, 24);
  const tx0 = left ? 70 : 96, tx1 = left ? 544 : 570;
  g.fillStyle = '#1b1b1b'; g.textAlign = 'left';
  let size = 42; g.font = `700 ${size}px system-ui, sans-serif`;
  while (g.measureText(dest).width > 340 && size > 22) { size -= 2; g.font = `700 ${size}px system-ui, sans-serif`; }
  if (left) { g.textAlign = 'right'; g.fillText(dest, tx1, 78); g.textAlign = 'left'; g.font = '700 40px system-ui, sans-serif'; g.fillText(time, tx0, 80); }
  else { g.fillText(dest, tx0, 78); g.textAlign = 'right'; g.font = '700 40px system-ui, sans-serif'; g.fillText(time, tx1, 80); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// minutes of walking from s0 to s1 along the trail, by the planner's norms (fitted to the signpost times)
export function walkMinutes(profile, step, s0, s1) {
  const a = Math.round(Math.min(s0, s1) / step), b = Math.round(Math.max(s0, s1) / step);
  const dir = s1 >= s0 ? 1 : -1;
  let t = 0;
  for (let i = a; i < b; i += 10) {
    const j = Math.min(b, i + 10);
    t += stepMinutes((j - i) * step, dir * (profile[j] - profile[i]));
  }
  return t;
}

// posts: [{ s, title, ele, side, boards: [{ dest, toS }] }]
export function buildSigns({ scene, terrain, trail, profile, shade, posts }) {
  const group = new THREE.Group();
  const N = trail.X.length, step = trail.step;
  const steel = new THREE.MeshLambertMaterial({ color: 0x9a9da0 });
  patchShading(steel, shade);
  const at = (s) => Math.min(N - 1, Math.max(0, Math.round(s / step)));
  for (const p of posts) {
    const i = at(p.s);
    const a = Math.max(0, i - 4), b = Math.min(N - 1, i + 4);
    let tx = trail.X[b] - trail.X[a], tz = trail.Z[b] - trail.Z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const side = p.side || 1, nx = -tz * side, nz = tx * side;
    const x = trail.X[i] + nx * 1.8, z = trail.Z[i] + nz * 1.8, y = terrain.height(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.6, 8), steel);
    pole.position.set(x, y + 1.2, z); pole.castShadow = true;
    group.add(pole);
    p.at = { x, y, z, nx, nz, tx, tz };
    // plate faces the trail
    const face = Math.atan2(-nx, -nz);
    const pm = new THREE.MeshLambertMaterial({ map: plateTexture(p.title, p.ele) });
    patchShading(pm, shade);
    // two faces back to back, so the text reads from both sides
    for (const back of [0, 1]) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), pm);
      plate.position.set(x - nx * (back ? 0.02 : 0.04), y + 2.35, z - nz * (back ? 0.02 : 0.04));
      plate.rotation.y = face + back * Math.PI; plate.castShadow = !back;
      group.add(plate);
    }
    p.boards.forEach((bd, k) => {
      const mins = walkMinutes(profile, step, p.s, bd.toS);
      const tex = boardTexture(bd.dest, fmt(mins)), texB = boardTexture(bd.dest, fmt(mins), true);
      // the arrow points along the trail towards the destination; the board sticks out from the pole
      const dir = bd.toS >= p.s ? 1 : -1;
      const ax = tx * dir, az = tz * dir;
      const theta = Math.atan2(-az, ax);   // local +x (the arrow tip) -> (ax, az)
      for (const back of [0, 1]) {
        const m = new THREE.MeshLambertMaterial({ map: back ? texB : tex });
        patchShading(m, shade);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.15), m);
        board.position.set(x + ax * 0.4, y + 2.08 - k * 0.19, z + az * 0.4);
        board.rotation.y = theta + back * Math.PI;   // the back face carries a left-pointing arrow: same direction, readable text
        board.castShadow = !back;
        group.add(board);
      }
    });
  }
  scene.add(group);
  return { group, posts };
}
