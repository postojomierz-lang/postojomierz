// Procedural plastic toy models. Every model is merged into at most two geometries
// ("main" in the army colour and "dark" for recesses), so each piece is one or two draw calls.
import { FIGURES, FIGURE_SCALE } from '../data/figures.js';
import { VEHICLES, VEHICLE_SCALE } from '../data/vehicles.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
// The bazooka, AA missile, grenadier, medic and drag poses were modelled for the game in Blender
// (tools/blender/army_men.py).
const FIGURE_FOR = {
  rifleman: 'rifle', para: 'rifle', officer: 'pointer', mg: 'mg50', sniper: 'sniper', 'pose-kneel': 'kneel', 'pose-prone': 'crawl',
  bazooka: 'bazooka', 'pose-bazooka-stand': 'bazooka-stand', manpads: 'manpads', 'pose-manpads-kneel': 'manpads-kneel',
  grenadier: 'grenadier', 'pose-grenadier-idle': 'grenadier-idle', medic: 'medic', 'pose-medic-heal': 'medic-heal', 'pose-drag': 'drag',
};
// figure data is meshopt-compressed: wait for the (tiny, built-in) decoder before building models
export const modelsReady = MeshoptDecoder.ready;
function b64(s) { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
function figureGeometry(part, colour = null, scale = FIGURE_SCALE, crease = false) {
  const vb = new Uint8Array(part.v * 8), ib = new Uint8Array(part.n * 4);
  MeshoptDecoder.decodeVertexBuffer(vb, part.v, 8, b64(part.p));
  MeshoptDecoder.decodeIndexBuffer(ib, part.n, 4, b64(part.i));
  const q = new Int16Array(vb.buffer), pos = new Float32Array(part.v * 3);
  for (let i = 0; i < part.v; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = q[i * 4 + k] / scale;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = new Uint32Array(ib.buffer);
  geo.setIndex(new THREE.BufferAttribute(part.v < 65536 ? Uint16Array.from(idx) : idx, 1));
  let g2 = geo;
  if (crease) g2 = toCreasedNormals(geo, 0.7);   // hard-surface vehicles: keep panel edges crisp
  else geo.computeVertexNormals();
  return paintGeometry(g2, colour);
}
function paintGeometry(geo, colour) {
  const pos = geo.attributes.position.array;
  if (colour) {
    const c = new THREE.Color(colour), col = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}
// Toy vehicles and aircraft modelled in Blender (tools/blender/vehicles.py).
function buildVehicle(key) {
  const v = VEHICLES[key], g = (p, c) => figureGeometry(p, c, VEHICLE_SCALE, true);
  const out = { main: g(v.main.near), far: { main: g(v.main.far) } };
  if (v.dark) { out.dark = g(v.dark.near); out.far.dark = g(v.dark.far); }
  if (v.a) out.accent = mergeGeometries(v.a.map(a => g(a, a.c)));
  if (v.rotor) { out.rotor = g(v.rotor); out.tailRotor = g(v.tail); }
  if (v.turret_main) out.turret = { main: g(v.turret_main.near), dark: v.turret_dark ? g(v.turret_dark.near) : undefined };
  // crews: army-men figures placed into the model (the MG gunner turns with his gun)
  const crew = (geo, x, y, z) => geo.clone().toNonIndexed().translate(x, y, z);
  if (key === 'mgnest') out.turret.main = mergeGeometries([out.turret.main, crew(figure('gunner').main, -0.12, 0.04, 0)]);
  if (key === 'tower') {
    out.main = mergeGeometries([out.main, crew(figure('lookout').main, -0.15, 2.62, 0.25)]);
    out.far.main = mergeGeometries([out.far.main, crew(figure('lookout').far.main, -0.15, 2.62, 0.25)]);
  }
  return out;
}
const figs = new Map();
function figure(key) { if (!figs.has(key)) figs.set(key, buildFigure(key)); return figs.get(key); }

// near: full detail; far: a light version drawn for figures far from the camera
function buildFigure(key) {
  const f = FIGURES[key], out = { main: figureGeometry(f.near), far: { main: figureGeometry(f.far) } };
  if (f.a) out.accent = mergeGeometries(f.a.map(a => figureGeometry(a, a.c)));   // painted parts (medic's white bag, red crosses)
  return out;
}

// ---------------------------------------------------------------------------------
// parachute for dropping paratroopers
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
  // walls and sandbags come in two shapes, picked by the placement seed
  const vk = type === 'wall' || type === 'sandbags' ? type + (seed % 2) : type;
  m = VEHICLES[vk] ? buildVehicle(vk) : type === 'chute' ? buildChute() : buildVehicle('barrel');
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
