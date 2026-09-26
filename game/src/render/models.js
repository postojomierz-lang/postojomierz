// Procedural plastic toy models. Every model is merged into at most two geometries
// ("main" in the army colour and "dark" for recesses), so each piece is one or two draw calls.
import { FIGURES, FIGURE_SCALE } from '../data/figures.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry } from '../sim/rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

class Builder {
  constructor() { this.main = []; this.dark = []; this.accent = []; }
  add(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], q = null, dark = false, accent = null } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    const m = new THREE.Matrix4().compose(V(...p), q || new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(...s));
    g.applyMatrix4(m);
    if (accent) {
      const c = new THREE.Color(accent), n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.accent.push(g);
    } else (dark ? this.dark : this.main).push(g);
    return this;
  }
  box(w, h, d, o = {}, radius = 0) { return this.add(radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d), o); }
  cyl(rt, rb, h, o = {}, seg = 16) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), o); }
  sphere(r, o = {}, ws = 14, hs = 10) { return this.add(new THREE.SphereGeometry(r, ws, hs), o); }
  // capsule from point a to point b
  limb(a, b, r, o = {}) {
    const va = V(...a), vb = V(...b), len = va.distanceTo(vb);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, vb.clone().sub(va).normalize());
    return this.add(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, 8), { ...o, p: va.add(vb).multiplyScalar(0.5).toArray(), q });
  }
  wheel(x, y, z, r, w, o = {}) {
    this.cyl(r, r, w, { p: [x, y, z], r: [Math.PI / 2, 0, 0], dark: true, ...o }, 14);
    return this.cyl(r * 0.55, r * 0.55, w + 0.02, { p: [x, y, z], r: [Math.PI / 2, 0, 0] }, 10);
  }
  done() {
    const out = {};
    if (this.main.length) out.main = mergeGeometries(this.main);
    if (this.dark.length) out.dark = mergeGeometries(this.dark);
    if (this.accent.length) out.accent = mergeGeometries(this.accent);
    for (const g of [...this.main, ...this.dark, ...this.accent]) g.dispose();
    for (const k in out) { out[k].computeBoundingSphere(); out[k].computeBoundingBox(); }
    return out;
  }
}

// ---------------------------------------------------------------------------------
// Soldiers: poses sketched side-on in "pixels" (x forward, y down), z = sideways offset.
const S = 0.022;
function pose(type) {
  const L = (x1, y1, x2, y2, w, z1 = 0, z2 = z1) => ({ t: 'l', x1, y1, z1, x2, y2, z2, w });
  const C = (x, y, r, z = 0) => ({ t: 'c', x, y, z, r });
  const Hm = (x, y) => ({ t: 'h', x, y });
  const Bx = (x, y, w, h, d, z = 0) => ({ t: 'b', x, y, w, h, d, z });
  const Ax = (x, y, w, h, d, z, c) => ({ t: 'b', x, y, w, h, d, z, c });          // painted part (keeps its own colour)
  const W = '#f4f1e8', R = '#d63a2f';
  // white satchel with a red cross on the side facing -z
  const kit = (x, y, z) => [Ax(x, y, 6, 5, 3, z, W), Ax(x, y, 1.4, 3.8, 0.5, z - 1.6, R), Ax(x, y, 3.8, 1.4, 0.5, z - 1.6, R)];
  const legs = [Object.assign(L(-5, -2, -3, -20, 5.8, -3.5), { leg: 0 }), Object.assign(L(6, -2, 2, -20, 5.8, 3.5), { leg: 1 })];
  const kneelLegs = [L(-7, -2, -2, -12, 5.8, -3.5), L(-7, -2, -16, -2, 5.2, -3.5), L(-2, -12, 7, -12, 5.8, 3.5), L(7, -12, 7, -2, 5.8, 3.5)];
  const body = [L(-1, -20, 0, -34, 11.5), C(1, -39, 5.6), Hm(1, -41), Bx(-7, -30, 5, 9, 9)];   // torso, head, helmet, backpack
  const rifle = (x1, y1, x2, y2, z) => [L(x1, y1, x2, y2, 3.2, z), Bx(x1 + 2, y1 + 1.5, 7, 4, 3, z)];
  switch (type) {
    case 'rifleman': return [...legs, ...body, L(-1, -31, 10, -31, 4.6, 6, 3), L(-1, -31, 6, -29, 4.6, -6, 2), ...rifle(-4, -31, 24, -33, 3)];
    case 'officer': return [...legs, ...body, L(0, -32, 16, -39, 4.6, 6, 7), C(17, -40, 2.6, 7), L(-1, -30, -6, -24, 4.6, -6), L(-6, -24, -2, -21, 4, -6, -5), Bx(3, -26, 4, 3, 5, -6)];
    case 'medic': return [...legs, L(-1, -20, 0, -34, 11.5), C(1, -39, 5.6), Hm(1, -41), Ax(-7, -30, 5, 9, 9, 0, W), Ax(-9.8, -30, 0.6, 6, 2, 0, R), Ax(-9.8, -30, 0.6, 2, 6, 0, R),
      L(-1, -31, 9, -30, 4.6, 6, 4), Ax(0, -30.5, 3.2, 2.4, 2.6, 6.2, W), L(-1, -31, 0, -21, 4.6, -6, -7), ...kit(0, -17, -7.5)];
    case 'pose-medic-heal': return [...kneelLegs, L(-2, -12, 5, -24, 11.5), C(8, -28, 5.6), Hm(8, -30), Ax(-3, -20, 5, 8, 9, 0, W), Ax(-5.8, -20, 0.6, 5, 2, 0, R), Ax(-5.8, -20, 0.6, 2, 5, 0, R),
      L(5, -22, 15, -8, 4.6, 6, 3), L(5, -22, 15, -9, 4.6, -6, -3), Ax(6, -21, 3.2, 2.4, 2.6, 6.2, W), ...kit(14, -3, -9)];
    case 'grenadier': return [...legs, ...body, L(-1, -32, -9, -45, 4.6, 6), C(-10, -48, 3.8, 6), L(1, -30, 11, -27, 4.6, -6, -3), ...rifle(4, -27, 16, -12, -4)];
    // extra poses used by the toy-style animation (the figure is swapped, like a kid repositioning it)
    case 'pose-kneel': return [...kneelLegs, L(-2, -12, 0, -26, 11.5), C(2, -31, 5.6), Hm(2, -33), Bx(-8, -22, 5, 8, 9),
      L(1, -24, 10, -25, 4.6, 6, 3), L(1, -24, 6, -23, 4.6, -6, 2), ...rifle(-3, -24, 24, -26, 3)];
    case 'pose-prone': return [L(-24, -3, -8, -5, 5.8, -5, -2), L(-24, -3, -8, -5, 5.8, 5, 2), L(-9, -6, 6, -8, 11.5), C(11, -11, 5.6), Hm(11, -13), Bx(-4, -12, 8, 4, 8),
      L(4, -8, 12, -9, 4.2, -6, -1), L(4, -8, 13, -9, 4.2, 6, 1), ...rifle(4, -10, 30, -11, 0)];
    case 'pose-drag': return [Object.assign(L(-5, -2, -7, -20, 5.8, -3.5), { leg: 0 }), Object.assign(L(7, -2, 0, -20, 5.8, 3.5), { leg: 1 }), L(-4, -20, -9, -33, 11.5), C(-10, -38, 5.6), Hm(-10, -40), Bx(-15, -29, 5, 9, 9),
      L(-8, -30, 6, -21, 4.6, 6, 5), L(-8, -30, 6, -21, 4.6, -6, -5), L(-14, -20, -6, -38, 3.2, -7)];
    case 'pose-bazooka-stand': return [...legs, ...body, L(0, -31, 7, -35, 4.6, 6, 4), L(0, -31, 8, -34, 4.6, -6, 2), L(-15, -37, 20, -40, 7.4, 5), C(20, -40, 4.6, 5)];
    case 'pose-manpads-kneel': return [...kneelLegs, L(-2, -12, 0, -26, 11.5), C(2, -31, 5.6), Hm(2, -33), Bx(-8, -22, 5, 8, 9),
      L(1, -24, 6, -29, 4.6, 6, 5), L(1, -24, 8, -30, 4.6, -6, 3), L(-12, -22, 20, -40, 6.2, 5), Bx(19, -40, 5, 5, 6, 5)];
    case 'pose-grenadier-idle': return [...legs, ...body, L(-1, -31, 8, -27, 4.6, 6, 3), L(-1, -31, 6, -24, 4.6, -6, 2), ...rifle(-2, -22, 14, -38, 3), C(-4, -24, 3.2, -6)];
    case 'manpads': return [...legs, ...body, L(0, -31, 6, -36, 4.6, 6, 5), L(0, -31, 8, -37, 4.6, -6, 3), L(-14, -30, 20, -46, 6.2, 5), Bx(19, -46, 5, 5, 6, 5), Bx(4, -38, 4, 5, 3, 5)];
    case 'bazooka': return [L(-7, -2, -2, -12, 5.8, -3.5), L(-7, -2, -16, -2, 5.2, -3.5), L(-2, -12, 7, -12, 5.8, 3.5), L(7, -12, 7, -2, 5.8, 3.5),
      L(-2, -12, 0, -26, 11.5), C(2, -31, 5.6), Hm(2, -33), Bx(-8, -22, 5, 8, 9),
      L(1, -24, 7, -29, 4.6, 6, 4), L(1, -24, 9, -28, 4.6, -6, 2), L(-16, -30, 22, -33, 7.4, 5), C(22, -33, 4.6, 5)];
    case 'sniper': return [L(-24, -3, -8, -5, 5.8, -5, -2), L(-24, -3, -8, -5, 5.8, 5, 2), L(-9, -6, 6, -8, 11.5), C(11, -11, 5.6), Hm(11, -13), Bx(-4, -12, 8, 4, 8),
      L(4, -8, 12, -9, 4.2, -6, -1), L(4, -8, 13, -9, 4.2, 6, 1), L(6, -10, 36, -11, 2.6), Bx(14, -14, 8, 3, 3), L(28, -10, 29, -2, 1.6, 0, -3), L(28, -10, 29, -2, 1.6, 0, 3)];
    case 'mg': return [L(-22, -3, -8, -5, 5.8, -5, -2), L(-22, -3, -8, -5, 5.8, 5, 2), L(-9, -6, 6, -8, 11.5), C(11, -11, 5.6), Hm(11, -13), Bx(-4, -12, 8, 4, 8),
      L(4, -8, 12, -9, 4.2, -6, -1), L(4, -8, 13, -9, 4.2, 6, 1), L(8, -10, 28, -11, 4.2), Bx(14, -12, 8, 6, 4), L(23, -10, 25, -2, 1.8, 0, -3.5), L(23, -10, 25, -2, 1.8, 0, 3.5), Bx(14, -6, 4, 5, 4, -5)];
  }
  return [];
}
// living = "Living soldiers" mode: no plastic base, legs are separate parts that swing when walking
function buildSoldier(type, living = false) {
  const b = new Builder(), legs = [], lift = living ? 0 : 0.05;
  for (const p of pose(type)) {
    if (p.t === 'l' && living && p.leg !== undefined) {
      const hip = [p.x2 * S, -p.y2 * S + lift, p.z2 * S], lb = new Builder();
      lb.limb([p.x1 * S - hip[0], -p.y1 * S + lift - hip[1], p.z1 * S - hip[2]], [0, 0, 0], p.w / 2 * S);
      legs.push({ geo: lb.done().main, hip });
      continue;
    }
    if (p.t === 'l') b.limb([p.x1 * S, -p.y1 * S + lift, p.z1 * S], [p.x2 * S, -p.y2 * S + lift, p.z2 * S], p.w / 2 * S);
    else if (p.t === 'c') b.sphere(p.r * S, { p: [p.x * S, -p.y * S + lift, p.z * S] });
    else if (p.t === 'b') b.box(p.w * S, p.h * S, p.d * S, { p: [p.x * S, -p.y * S + lift, p.z * S], accent: p.c || null }, p.c ? 0 : 0.01);
    else {
      b.add(new THREE.SphereGeometry(7.4 * S, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), { p: [p.x * S, -p.y * S + lift, 0], s: [1, 0.82, 1] });
      b.cyl(9.2 * S, 9.4 * S, 0.02, { p: [p.x * S, -p.y * S + lift, 0] }, 18);
    }
  }
  if (!living) b.cyl(0.29, 0.31, 0.05, { p: [0, 0.025, 0] }, 24);    // the plastic base
  const out = b.done();
  if (legs.length) out.legs = legs;
  return out;
}

// Classic army-men figures ("Miniature Army Men" by alo89, CC BY 4.0), see tools/figures.mjs.
const FIGURE_FOR = { rifleman: 'rifle', para: 'rifle', officer: 'pointer', mg: 'mg50', sniper: 'sniper', 'pose-kneel': 'kneel', 'pose-prone': 'crawl' };
function b64(s, T) { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); }
function buildFigure(key) {
  const f = FIGURES[key], q = b64(f.p, Int16Array), pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = q[i] / FIGURE_SCALE;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(b64(f.i, Uint16Array), 1));
  geo.computeVertexNormals(); geo.computeBoundingSphere(); geo.computeBoundingBox();
  return { main: geo };
}

// ---------------------------------------------------------------------------------
function buildJeep() {
  const b = new Builder();
  b.box(1.8, 0.28, 1.0, { p: [0, 0.42, 0] }, 0.05);
  b.box(0.62, 0.18, 0.92, { p: [0.55, 0.62, 0] }, 0.05);
  b.box(0.06, 0.16, 0.8, { p: [0.88, 0.5, 0], dark: true });
  b.box(0.05, 0.36, 0.96, { p: [0.2, 0.78, 0], r: [0, 0, -0.25] }, 0.02);
  b.box(0.04, 0.26, 0.86, { p: [0.21, 0.76, 0], r: [0, 0, -0.25], dark: true });
  for (const z of [-0.24, 0.24]) b.box(0.32, 0.1, 0.34, { p: [-0.05, 0.62, z], dark: true }, 0.03);
  b.box(0.42, 0.1, 0.8, { p: [-0.55, 0.62, 0], dark: true }, 0.03);
  for (const [x, z] of [[0.58, 0.5], [0.58, -0.5], [-0.58, 0.5], [-0.58, -0.5]]) {
    b.wheel(x, 0.26, z, 0.26, 0.18);
    b.box(0.6, 0.06, 0.24, { p: [x, 0.56, z * 1.02] }, 0.02);
  }
  b.wheel(-0.96, 0.52, 0, 0.22, 0.14, { r: [0, 0, Math.PI / 2] });
  b.cyl(0.04, 0.05, 0.45, { p: [-0.4, 0.85, 0] });
  b.limb([-0.48, 1.08, 0], [0.25, 1.1, 0], 0.045);
  b.box(0.2, 0.12, 0.1, { p: [-0.4, 1.08, 0], dark: true });
  return b.done();
}

function sideProfile(points, width) {
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) sh.lineTo(x, y);
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  g.translate(0, 0, -width / 2);
  return g;
}

function buildApc() {
  const b = new Builder();
  b.add(sideProfile([[-0.95, 0.3], [0.7, 0.3], [1.0, 0.55], [0.75, 0.95], [-0.95, 0.95]], 1.0));
  for (let i = 0; i < 3; i++) for (const z of [-0.52, 0.52]) b.wheel(-0.6 + i * 0.6, 0.26, z, 0.26, 0.2);
  b.cyl(0.26, 0.3, 0.2, { p: [-0.1, 1.05, 0] }, 16);
  b.limb([0.1, 1.08, 0], [0.75, 1.08, 0], 0.05);
  for (const z of [-0.3, 0.3]) b.box(0.3, 0.05, 0.2, { p: [0.55, 0.98, z], r: [0, 0, 0.6], dark: true });
  b.box(0.05, 0.3, 0.4, { p: [-0.98, 0.6, 0], dark: true });
  return b.done();
}

function buildAmphib() {
  const b = new Builder();
  const top = new THREE.Shape();
  top.moveTo(-1.0, -0.5); top.lineTo(0.55, -0.5); top.quadraticCurveTo(1.05, -0.35, 1.1, 0); top.quadraticCurveTo(1.05, 0.35, 0.55, 0.5); top.lineTo(-1.0, 0.5); top.lineTo(-1.0, -0.5);
  const hull = new THREE.ExtrudeGeometry(top, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  b.add(hull, { r: [Math.PI / 2, 0, 0], p: [0, 0.82, 0] });
  b.box(0.7, 0.4, 0.8, { p: [-0.2, 1.05, 0] }, 0.06);
  b.box(0.05, 0.22, 0.7, { p: [0.16, 1.1, 0], dark: true });
  for (const [x, z] of [[0.55, 0.5], [0.55, -0.5], [-0.55, 0.5], [-0.55, -0.5]]) b.wheel(x, 0.24, z, 0.24, 0.16);
  b.cyl(0.03, 0.03, 0.3, { p: [-1.1, 0.35, 0], r: [0, 0, Math.PI / 2] });
  b.box(0.04, 0.26, 0.08, { p: [-1.24, 0.35, 0], dark: true });
  b.cyl(0.04, 0.05, 0.3, { p: [-0.5, 1.4, 0] });
  b.limb([-0.55, 1.58, 0], [0.1, 1.6, 0], 0.045);
  return b.done();
}

function buildTank() {
  const b = new Builder();
  for (const z of [-0.62, 0.62]) {
    b.box(2.6, 0.46, 0.34, { p: [0, 0.26, z], dark: true }, 0.16);
    for (let i = 0; i < 6; i++) b.cyl(0.15, 0.15, 0.36, { p: [-1.0 + i * 0.4, 0.2, z], r: [Math.PI / 2, 0, 0] }, 12);
    b.box(2.5, 0.05, 0.4, { p: [0, 0.52, z] }, 0.02);
  }
  b.add(sideProfile([[-1.25, 0.34], [1.05, 0.34], [1.3, 0.62], [1.0, 0.85], [-1.2, 0.85], [-1.3, 0.6]], 0.95));
  const tur = new THREE.CylinderGeometry(0.5, 0.6, 0.38, 20);
  b.add(tur, { p: [-0.15, 1.05, 0], s: [1.15, 1, 0.95] });
  b.box(0.3, 0.26, 0.42, { p: [0.45, 1.03, 0] }, 0.06);
  b.cyl(0.075, 0.085, 1.45, { p: [1.3, 1.05, 0], r: [0, 0, Math.PI / 2] }, 12);
  b.cyl(0.11, 0.11, 0.18, { p: [2.0, 1.05, 0], r: [0, 0, Math.PI / 2] }, 12);
  b.cyl(0.14, 0.15, 0.12, { p: [-0.35, 1.3, 0.18] }, 14);
  b.box(0.3, 0.14, 0.5, { p: [-0.95, 0.98, 0], dark: true }, 0.03);
  b.limb([-0.25, 1.42, -0.2], [0.2, 1.44, -0.2], 0.03);
  return b.done();
}

function buildRockets() {
  const b = new Builder();
  b.box(2.5, 0.2, 0.9, { p: [0, 0.48, 0] }, 0.04);
  b.box(0.7, 0.62, 1.0, { p: [0.9, 0.86, 0] }, 0.08);
  b.box(0.05, 0.26, 0.86, { p: [1.26, 0.98, 0], dark: true });
  for (const x of [0.9, -0.3, -0.9]) for (const z of [-0.5, 0.5]) b.wheel(x, 0.28, z, 0.28, 0.2);
  b.box(0.2, 0.4, 0.3, { p: [-0.35, 0.72, 0] });
  const tilt = 0.42, ct = Math.cos(tilt), st = Math.sin(tilt);
  const px = -0.45, py = 1.0; // pivot of the tube pack
  const at = (x, y) => [px + x * ct - y * st, py + x * st + y * ct];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const [x, y] = at(0, 0.12 + r * 0.19);
    b.cyl(0.085, 0.085, 1.5, { p: [x, y, -0.3 + c * 0.2], r: [0, 0, -(Math.PI / 2 - tilt)] }, 10);
    const [ex, ey] = at(0.76, 0.12 + r * 0.19);
    b.cyl(0.055, 0.055, 0.02, { p: [ex, ey, -0.3 + c * 0.2], r: [0, 0, -(Math.PI / 2 - tilt)], dark: true }, 8);
  }
  const [bx, by] = at(0, 0);
  b.box(1.5, 0.06, 0.9, { p: [bx, by, 0], r: [0, 0, tilt] });
  b.box(0.12, 0.5, 0.5, { p: [-0.45, 0.78, 0] });
  return b.done();
}

function buildHeli() {
  const b = new Builder();
  b.sphere(0.5, { p: [0.35, 0, 0], s: [1.9, 1, 0.95] }, 20, 14);
  b.sphere(0.3, { p: [0.95, 0.03, 0], s: [1, 0.9, 0.9], dark: true }, 16, 10);
  b.cyl(0.08, 0.2, 1.7, { p: [-1.0, 0.12, 0], r: [0, 0, Math.PI / 2 + 0.06] }, 12);
  b.box(0.36, 0.55, 0.05, { p: [-1.8, 0.4, 0], r: [0, 0, -0.35] }, 0.02);
  b.box(0.3, 0.05, 0.6, { p: [-1.6, 0.14, 0] }, 0.02);
  for (const z of [-0.42, 0.42]) {
    b.limb([-0.4, -0.55, z], [0.95, -0.55, z], 0.035);
    b.limb([-0.15, -0.55, z], [-0.05, -0.28, z * 0.6], 0.03);
    b.limb([0.55, -0.55, z], [0.55, -0.28, z * 0.6], 0.03);
  }
  for (const z of [-0.5, 0.5]) { b.cyl(0.08, 0.08, 0.5, { p: [0.35, -0.15, z], r: [0, 0, Math.PI / 2] }, 10); b.box(0.2, 0.06, 0.3, { p: [0.35, -0.02, z * 0.8] }); }
  b.cyl(0.06, 0.08, 0.28, { p: [0.3, 0.55, 0] }, 10);
  const body = b.done();
  const r = new Builder();
  r.box(3.0, 0.03, 0.16, { p: [0, 0, 0] }, 0.01);
  r.box(0.16, 0.03, 3.0, { p: [0, 0, 0] }, 0.01);
  r.cyl(0.12, 0.12, 0.08, { p: [0, 0, 0] });
  body.rotor = r.done().main;
  const t = new Builder();
  t.box(0.04, 0.5, 0.06, {}, 0.01); t.box(0.04, 0.06, 0.5, {}, 0.01);
  body.tailRotor = t.done().main;
  return body;
}

function sandbagRing(b, cx, cz, radius, from, to, layers = 2, n = 10) {
  for (let l = 0; l < layers; l++) for (let i = 0; i <= n; i++) {
    const a = from + (to - from) * (i + (l % 2) * 0.5) / n;
    if (l % 2 && i === n) continue;
    const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
    b.add(new THREE.CapsuleGeometry(0.13, 0.22, 3, 8), { p: [x, 0.13 + l * 0.2, z], r: [0, Math.PI / 2 - a, Math.PI / 2], s: [1, 1, 0.8] });
  }
}

// Emplacements come in two parts: a fixed base and a "turret" that turns to aim.
function buildMgNest() {
  const b = new Builder(), t = new Builder();
  sandbagRing(b, 0, 0, 0.8, -Math.PI * 0.62, Math.PI * 0.62, 3, 9);
  b.cyl(0.95, 1.0, 0.04, { p: [0, 0.02, 0], dark: true }, 24);
  t.cyl(0.05, 0.05, 0.4, { p: [0.35, 0.35, 0] });
  t.limb([0.1, 0.6, 0], [1.0, 0.62, 0], 0.055);
  t.box(0.3, 0.14, 0.12, { p: [0.25, 0.6, 0], dark: true });
  for (const p of pose('rifleman')) {
    if (p.t === 'l' && p.w > 10) t.limb([p.x1 * S - 0.3, -p.y1 * S - 0.1, 0], [p.x2 * S - 0.3, -p.y2 * S - 0.1, 0], p.w / 2 * S);
    if (p.t === 'c' && p.r > 5) t.sphere(p.r * S, { p: [p.x * S - 0.3, -p.y * S - 0.1, 0] });
    if (p.t === 'h') t.add(new THREE.SphereGeometry(7.4 * S, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), { p: [p.x * S - 0.3, -p.y * S - 0.1, 0], s: [1, 0.82, 1] });
  }
  t.limb([-0.3, 0.6, 0.12], [0.2, 0.6, 0.05], 0.05);
  const out = b.done(); out.turret = t.done();
  return out;
}

function buildFieldGun() {
  const b = new Builder();
  b.box(0.08, 0.7, 1.1, { p: [0.25, 0.65, 0], r: [0, 0, -0.15] }, 0.02);
  b.cyl(0.07, 0.09, 1.8, { p: [0.95, 0.85, 0], r: [0, 0, -(Math.PI / 2 - 0.25)] }, 12);
  b.cyl(0.1, 0.1, 0.2, { p: [0.95 + Math.cos(0.25) * 0.9, 0.85 + Math.sin(0.25) * 0.9, 0], r: [0, 0, -(Math.PI / 2 - 0.25)] }, 12);
  b.box(0.6, 0.22, 0.28, { p: [0.05, 0.62, 0] }, 0.05);
  for (const z of [-0.5, 0.5]) b.wheel(0.05, 0.4, z, 0.4, 0.12);
  b.limb([-0.05, 0.45, 0.12], [-1.2, 0.08, 0.55], 0.06);
  b.limb([-0.05, 0.45, -0.12], [-1.2, 0.08, -0.55], 0.06);
  b.box(0.2, 0.04, 0.25, { p: [-1.2, 0.04, 0.55] }); b.box(0.2, 0.04, 0.25, { p: [-1.2, 0.04, -0.55] });
  return b.done();
}

function buildAA() {
  const b = new Builder(), t = new Builder();
  b.cyl(0.85, 0.95, 0.18, { p: [0, 0.09, 0] }, 24);
  sandbagRing(b, 0, 0, 1.0, 0, Math.PI * 2, 1, 16);
  t.cyl(0.45, 0.5, 0.25, { p: [0, 0.3, 0] }, 18);
  t.box(0.5, 0.5, 0.6, { p: [0, 0.65, 0] }, 0.06);
  for (const z of [-0.18, 0.18]) {
    t.cyl(0.045, 0.055, 1.4, { p: [0.45, 1.25, z], r: [0, 0, -Math.PI / 4] }, 10);
    t.cyl(0.07, 0.07, 0.3, { p: [0.18, 0.95, z], r: [0, 0, -Math.PI / 4] }, 10);
  }
  t.box(0.25, 0.08, 0.3, { p: [-0.35, 0.72, 0], dark: true });
  const out = b.done(); out.turret = t.done();
  return out;
}

function buildTower() {
  const b = new Builder();
  b.cyl(0.78, 0.9, 2.5, { p: [0, 1.25, 0] }, 24);
  for (let i = 0; i < 5; i++) b.cyl(0.8 + 0.1 * (1 - i / 5), 0.82 + 0.1 * (1 - i / 5), 0.03, { p: [0, 0.25 + i * 0.5, 0], dark: true }, 24);
  b.cyl(0.95, 0.95, 0.18, { p: [0, 2.58, 0] }, 24);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    b.box(0.32, 0.3, 0.2, { p: [Math.cos(a) * 0.85, 2.82, Math.sin(a) * 0.85], r: [0, -a, 0] }, 0.02);
  }
  b.box(0.1, 0.8, 0.5, { p: [0.86, 0.4, 0], dark: true }, 0.03);
  b.box(0.1, 0.35, 0.25, { p: [0.8, 1.7, 0], dark: true });
  b.box(0.25, 0.35, 0.1, { p: [0, 1.7, 0.8], dark: true });
  // lookout soldier
  b.cyl(0.09, 0.09, 0.26, { p: [0.1, 2.8, 0] }); b.sphere(0.12, { p: [0.1, 3.02, 0] });
  b.add(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), { p: [0.1, 3.05, 0], s: [1, 0.8, 1] });
  b.limb([0.1, 2.9, 0.08], [0.6, 2.95, 0.05], 0.035);
  return b.done();
}

function buildWall(seed) {
  const b = new Builder(), rng = mulberry(seed);
  const L = 2.9, H = 1.5, T = 0.36;
  // ruined brick wall with a window hole and a broken top
  const cols = 7;
  for (let i = 0; i < cols; i++) {
    const x0 = -L / 2 + i * L / cols, w = L / cols;
    const hTop = H * (0.7 + rng() * 0.35) * (i === 0 || i === cols - 1 ? 1.05 : 1);
    const window = i === 2 || i === 3;
    if (window) {
      b.box(w, 0.45, T, { p: [x0 + w / 2, 0.225, 0] });
      b.box(w, Math.max(0.05, hTop - 1.1), T, { p: [x0 + w / 2, 1.1 + (hTop - 1.1) / 2, 0] });
    } else b.box(w + 0.001, hTop, T, { p: [x0 + w / 2, hTop / 2, 0] });
  }
  // brick courses and loose bricks
  for (let r = 1; r < 6; r++) b.box(L + 0.02, 0.018, T + 0.02, { p: [0, r * 0.26, 0], dark: true });
  for (let i = 0; i < 7; i++) b.box(0.24, 0.1, 0.12, { p: [-L / 2 + rng() * L, 0.05, (rng() < 0.5 ? -1 : 1) * (0.3 + rng() * 0.2)], r: [0, rng() * 3, 0] }, 0.015);
  b.box(L + 0.2, 0.1, T + 0.2, { p: [0, 0.05, 0] }, 0.03);
  return b.done();
}

function buildSandbags(seed) {
  const b = new Builder(), rng = mulberry(seed);
  for (let l = 0; l < 3; l++) {
    const n = 5 - (l === 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = -0.8 + (i + (l % 2) * 0.5) * 0.4;
      if (x > 0.85) continue;
      b.add(new THREE.CapsuleGeometry(0.13, 0.2, 3, 8), { p: [x, 0.12 + l * 0.2, (rng() - 0.5) * 0.04], r: [(rng() - 0.5) * 0.2, (rng() - 0.5) * 0.3, Math.PI / 2], s: [1, 1, 0.78] });
    }
  }
  return b.done();
}

function buildWire() {
  const b = new Builder();
  for (const x of [-0.8, 0, 0.8]) {
    b.box(0.05, 0.75, 0.05, { p: [x, 0.33, 0], r: [0.6, 0, 0] });
    b.box(0.05, 0.75, 0.05, { p: [x, 0.33, 0], r: [-0.6, 0, 0] });
  }
  b.limb([-0.95, 0.52, 0], [0.95, 0.52, 0], 0.012);
  for (let i = 0; i < 14; i++) b.add(new THREE.TorusGeometry(0.24, 0.013, 4, 16), { p: [-0.9 + i * 0.138, 0.3, 0], r: [0, Math.PI / 2 + 0.35, 0] });
  for (let i = 0; i < 26; i++) b.box(0.01, 0.06, 0.01, { p: [-0.9 + i * 0.07, 0.52, 0], r: [0.7 * (i % 2 ? 1 : -1), 0, 0] });
  return b.done();
}

function buildBarrel() {
  const b = new Builder();
  b.cyl(0.33, 0.33, 0.9, { p: [0, 0.45, 0] }, 20);
  for (const y of [0.05, 0.3, 0.6, 0.86]) b.add(new THREE.TorusGeometry(0.335, 0.025, 6, 20), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
  b.cyl(0.29, 0.29, 0.02, { p: [0, 0.905, 0], dark: true }, 20);
  b.cyl(0.05, 0.05, 0.04, { p: [0.15, 0.92, 0.1] }, 8);
  return b.done();
}

function buildHQ() {
  const b = new Builder();
  // ground floor + upper floor, like the "MILITARY" building in toy sets
  b.box(3.6, 1.5, 3.4, { p: [0, 0.75, 0] }, 0.04);
  b.box(3.7, 0.12, 3.5, { p: [0, 1.52, 0] }, 0.03);
  b.box(2.0, 1.25, 3.2, { p: [-0.75, 2.2, 0] }, 0.04);
  b.box(2.1, 0.1, 3.3, { p: [-0.75, 2.86, 0] }, 0.03);
  for (const z of [-1.62, 1.62]) b.box(1.6, 0.25, 0.08, { p: [0.95, 1.7, z * 1.0] });
  b.box(0.08, 0.25, 3.3, { p: [1.8, 1.7, 0] });
  // windows / door (dark recesses)
  for (const z of [-1.1, 1.1]) {
    b.box(0.05, 0.55, 0.6, { p: [1.81, 0.85, z], dark: true });
    b.box(0.05, 0.5, 0.55, { p: [0.26, 2.2, z * 0.9], dark: true });
  }
  b.box(0.05, 0.9, 0.7, { p: [1.81, 0.45, 0], dark: true });
  b.box(0.35, 0.1, 1.0, { p: [1.98, 0.05, 0] }, 0.02);
  for (const x of [-1.2, 0, 1.2]) for (const z of [-1.72, 1.72]) b.box(0.55, 0.55, 0.05, { p: [x, 0.85, z], dark: true });
  for (const x of [-1.4, -0.4]) for (const z of [-1.62, 1.62]) b.box(0.5, 0.45, 0.05, { p: [x, 2.2, z], dark: true });
  b.box(0.08, 0.35, 1.2, { p: [1.83, 1.3, 0], dark: true }, 0.02);  // sign board
  // flag pole
  b.cyl(0.03, 0.03, 1.6, { p: [-1.4, 3.7, -1.2] }, 8);
  b.box(0.7, 0.42, 0.03, { p: [-1.05, 4.25, -1.2] }, 0.01);
  b.cyl(0.12, 0.14, 0.1, { p: [-1.4, 2.95, -1.2] }, 10);
  return b.done();
}

function buildAmbulance() {
  const b = new Builder();
  b.box(1.85, 0.2, 0.95, { p: [0, 0.4, 0] }, 0.04);
  b.box(0.55, 0.55, 0.95, { p: [0.62, 0.78, 0] }, 0.08);
  b.box(0.05, 0.24, 0.8, { p: [0.9, 0.9, 0], dark: true });
  b.box(1.2, 0.85, 1.0, { p: [-0.3, 0.92, 0] }, 0.06);
  for (const z of [-0.505, 0.505]) {
    b.box(0.56, 0.56, 0.01, { p: [-0.3, 0.95, z], accent: '#f4f1e8' });
    b.box(0.36, 0.1, 0.02, { p: [-0.3, 0.95, z], accent: '#d63a2f' });
    b.box(0.1, 0.36, 0.02, { p: [-0.3, 0.95, z], accent: '#d63a2f' });
  }
  b.box(0.5, 0.02, 0.5, { p: [-0.3, 1.355, 0], accent: '#f4f1e8' });
  b.box(0.34, 0.03, 0.1, { p: [-0.3, 1.37, 0], accent: '#d63a2f' });
  b.box(0.1, 0.03, 0.34, { p: [-0.3, 1.37, 0], accent: '#d63a2f' });
  b.box(0.12, 0.08, 0.3, { p: [0.62, 1.1, 0], accent: '#3b8fe0' });
  for (const [x, z] of [[0.58, 0.5], [0.58, -0.5], [-0.58, 0.5], [-0.58, -0.5]]) b.wheel(x, 0.26, z, 0.26, 0.18);
  return b.done();
}

// toy jets: fuselage along +x, wings flat, tail fins at the back
function jetBody(b, { len, r, wing, sweep, tail, canopy = true }) {
  b.add(new THREE.CapsuleGeometry(r, len, 6, 14), { r: [0, 0, Math.PI / 2], s: [1, 1, 0.9] });
  b.add(new THREE.ConeGeometry(r * 0.95, r * 2.6, 14), { p: [len / 2 + r * 1.4, 0, 0], r: [0, 0, -Math.PI / 2] });
  if (canopy) b.add(new THREE.SphereGeometry(r * 0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), { p: [len * 0.28, r * 0.55, 0], s: [2.0, 0.9, 0.85], dark: true });
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.25, 0); wingShape.lineTo(-0.35, 0); wingShape.lineTo(-0.35 - sweep, wing); wingShape.lineTo(-0.1 - sweep, wing); wingShape.lineTo(0.25, 0);
  for (const side of [1, -1]) {
    const g = new THREE.ExtrudeGeometry(wingShape, { depth: 0.05, bevelEnabled: false });
    b.add(g, { p: [0, -r * 0.2, 0], r: [side * Math.PI / 2, 0, 0], s: [1, 1, 1] });
    const tl = new THREE.Shape(); tl.moveTo(0, 0); tl.lineTo(-0.3, 0); tl.lineTo(-0.45, tail * 0.6); tl.lineTo(-0.3, tail * 0.6); tl.lineTo(0, 0);
    b.add(new THREE.ExtrudeGeometry(tl, { depth: 0.04, bevelEnabled: false }), { p: [-len / 2 - r * 0.2, 0, 0], r: [side * Math.PI / 2, 0, 0] });
  }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-0.45, 0); fin.lineTo(-0.6, tail); fin.lineTo(-0.4, tail); fin.lineTo(0, 0);
  b.add(new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false }), { p: [-len / 2 + 0.05, r * 0.5, -0.025] });
}
function buildFighter() {
  const b = new Builder();
  jetBody(b, { len: 1.6, r: 0.17, wing: 0.95, sweep: 0.55, tail: 0.5 });
  for (const z of [-0.3, 0.3]) b.cyl(0.035, 0.035, 0.5, { p: [0.35, -0.12, z], r: [0, 0, Math.PI / 2], dark: true }, 8);
  return b.done();
}
function buildAttacker() {
  const b = new Builder();
  jetBody(b, { len: 1.8, r: 0.2, wing: 1.15, sweep: 0.15, tail: 0.5 });
  for (const z of [-0.2, 0.2]) b.cyl(0.13, 0.13, 0.55, { p: [-0.55, 0.28, z], r: [0, 0, Math.PI / 2] }, 12);
  for (const z of [-0.55, -0.8, 0.55, 0.8]) b.cyl(0.05, 0.05, 0.45, { p: [0.05, -0.18, z], r: [0, 0, Math.PI / 2], dark: true }, 8);
  return b.done();
}
function buildBomber() {
  const b = new Builder();
  jetBody(b, { len: 2.6, r: 0.3, wing: 1.8, sweep: 0.25, tail: 0.75 });
  for (const z of [-0.8, -1.3, 0.8, 1.3]) {
    b.cyl(0.11, 0.12, 0.6, { p: [0.15, -0.12, z], r: [0, 0, Math.PI / 2] }, 12);
    b.cyl(0.07, 0.07, 0.02, { p: [0.46, -0.12, z], r: [0, 0, Math.PI / 2], dark: true }, 10);
  }
  b.box(0.8, 0.04, 0.3, { p: [0.1, -0.3, 0], dark: true });
  return b.done();
}
function buildTransport() {
  const b = new Builder();
  jetBody(b, { len: 2.4, r: 0.36, wing: 1.9, sweep: 0.05, tail: 0.85 });
  for (const z of [-0.9, 0.9]) {
    b.cyl(0.13, 0.14, 0.5, { p: [0.25, 0.08, z], r: [0, 0, Math.PI / 2] }, 12);
    b.box(0.03, 0.55, 0.06, { p: [0.52, 0.08, z], dark: true });
  }
  b.box(0.5, 0.03, 0.5, { p: [-1.1, -0.28, 0], dark: true });
  return b.done();
}
function buildChute() {
  const b = new Builder();
  b.add(new THREE.SphereGeometry(0.75, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), { p: [0, 1.4, 0], s: [1, 0.55, 1] });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    b.limb([Math.cos(a) * 0.62, 1.48, Math.sin(a) * 0.62], [0, 0.75, 0], 0.01, { dark: true });
  }
  return b.done();
}

// ---------------------------------------------------------------------------------
const cache = new Map();
export function modelKey(type, seed = 0) { return type === 'wall' || type === 'sandbags' ? type + (seed % 4) : type; }
export function model(type, seed = 0) {
  const k = modelKey(type, seed);
  if (cache.has(k)) return cache.get(k);
  let m;
  if (type.startsWith('living:')) {
    const t = type.slice(7);
    m = buildSoldier(t === 'para' ? 'rifleman' : t, true);
    cache.set(k, m);
    return m;
  }
  if (FIGURE_FOR[type]) { m = buildFigure(FIGURE_FOR[type]); cache.set(k, m); return m; }
  switch (type) {
    case 'rifleman': case 'mg': case 'bazooka': case 'sniper': case 'grenadier': case 'officer': case 'manpads': case 'medic': m = buildSoldier(type); break;
    case 'para': m = buildSoldier('rifleman'); break;
    case 'pose-kneel': case 'pose-prone': case 'pose-drag': case 'pose-bazooka-stand': case 'pose-manpads-kneel': case 'pose-grenadier-idle': case 'pose-medic-heal': m = buildSoldier(type); break;
    case 'ambulance': m = buildAmbulance(); break;
    case 'fighter': m = buildFighter(); break;
    case 'attacker': m = buildAttacker(); break;
    case 'bomber': m = buildBomber(); break;
    case 'transport': m = buildTransport(); break;
    case 'chute': m = buildChute(); break;
    case 'jeep': m = buildJeep(); break;
    case 'apc': m = buildApc(); break;
    case 'amphib': m = buildAmphib(); break;
    case 'tank': m = buildTank(); break;
    case 'rockets': m = buildRockets(); break;
    case 'heli': m = buildHeli(); break;
    case 'mgnest': m = buildMgNest(); break;
    case 'fieldgun': m = buildFieldGun(); break;
    case 'aa': m = buildAA(); break;
    case 'tower': m = buildTower(); break;
    case 'wall': m = buildWall(1000 + (seed % 4)); break;
    case 'sandbags': m = buildSandbags(2000 + (seed % 4)); break;
    case 'wire': m = buildWire(); break;
    case 'barrel': m = buildBarrel(); break;
    case 'hq': m = buildHQ(); break;
    default: m = buildBarrel();
  }
  cache.set(k, m);
  return m;
}

// Plastic materials per army colour (shared by every piece of that army).
const mats = new Map();
export function plastic(color, variant = 'main') {
  const k = color + variant;
  if (!mats.has(k)) {
    const c = new THREE.Color(color);
    if (variant === 'dead') c.lerp(new THREE.Color('#6f6c64'), 0.45).multiplyScalar(0.75);
    if (variant === 'burnt') c.lerp(new THREE.Color('#1c1a17'), 0.8);
    const m = new THREE.MeshPhysicalMaterial({
      color: c, roughness: variant === 'burnt' ? 0.9 : 0.42, metalness: 0,
      clearcoat: variant === 'main' || variant === 'dark' ? 0.35 : 0, clearcoatRoughness: 0.35,
    });
    if (variant === 'flash') { m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = 0.7; }
    mats.set(k, m);
  }
  return mats.get(k);
}
