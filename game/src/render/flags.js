// National flags flown from a short staff at the back of every ground vehicle, painted in their
// real colours (they go into a model's painted "accent" part). Each flag is a small grid of flat
// coloured cells, gently waving, built for the nation that owns the vehicle.
import * as THREE from 'three';

const W = 0.4, H = 0.27, NU = 30, NV = 20;           // flag size (game units) and its cells
const STAFF = 0.5;                                     // how far the staff rises above the hull

const C = {
  red: [0.75, 0.1, 0.12], white: [0.95, 0.94, 0.9], blue: [0.1, 0.18, 0.5], navy: [0.08, 0.13, 0.36],
  black: [0.08, 0.08, 0.09], yellow: [0.98, 0.8, 0.15], green: [0.0, 0.52, 0.27], fgrey: [0.46, 0.49, 0.47],
  fblue: [0.0, 0.2, 0.6], fred: [0.93, 0.16, 0.22], ired: [0.8, 0.16, 0.2],
};

// is (u, v) inside a five-pointed star of outer radius R, one point up (inner radius 0.382 R)?
function inStar(u, v, R) {
  let inside = false;
  const P = Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.382 : R; return [Math.cos(a) * r, Math.sin(a) * r]; });
  for (let i = 0, j = 9; i < 10; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// the flag as a function of (u, v): u from the staff (0) to the fly (1), v from the foot (0) to the top (1)
const PATTERNS = {
  // the 48-star flag: 13 stripes and the blue canton with rows of stars
  us: (u, v) => {
    if (u < 0.4 && v > 7 / 13) {
      const su = (u / 0.4) * 6, sv = ((v - 7 / 13) / (6 / 13)) * 5;
      return Math.hypot(su - Math.floor(su) - 0.5, sv - Math.floor(sv) - 0.5) < 0.2 ? C.white : C.navy;
    }
    return Math.floor(v * 13) % 2 === 0 ? C.red : C.white;
  },
  // the Balkenkreuz, as painted on the Wehrmacht's vehicles, on field grey
  de: (u, v) => {
    const x = Math.abs(u - 0.5) * W, y = Math.abs(v - 0.5) * H, arm = Math.max(x, y) < 0.1;
    if (arm && Math.min(x, y) < 0.024) return C.black;
    if (arm && Math.min(x, y) < 0.04) return C.white;
    return C.fgrey;
  },
  // red, with the gold star and hammer and sickle in the upper hoist
  su: (u, v) => {
    if (inStar((u - 0.14) * W, (v - 0.86) * H, 0.022)) return C.yellow;
    const hx = (u - 0.14) * W, hy = (v - 0.62) * H;
    if (Math.abs(Math.hypot(hx, hy) - 0.028) < 0.006 && hx > -0.01) return C.yellow;      // the sickle
    if (Math.abs(hx + hy) < 0.005 && Math.abs(hx) < 0.028) return C.yellow;               // the hammer's shaft
    return C.red;
  },
  // the Union Jack
  gb: (u, v) => {
    const x = (u - 0.5) * W, y = (v - 0.5) * H, d1 = Math.abs(x * H - y * W) / Math.hypot(W, H), d2 = Math.abs(x * H + y * W) / Math.hypot(W, H);
    if (Math.abs(x) < 0.022 || Math.abs(y) < 0.022) return C.red;
    if (Math.abs(x) < 0.036 || Math.abs(y) < 0.036) return C.white;
    const d = Math.min(d1, d2), side = d1 < d2 ? (x * y > 0 ? 1 : -1) : (x * y < 0 ? 1 : -1);
    if (d < 0.012 && side * (x > 0 ? 1 : -1) > 0) return C.red;                            // the counterchanged red saltire
    if (d < 0.028) return C.white;
    return C.navy;
  },
  // the Hinomaru
  jp: (u, v) => Math.hypot((u - 0.5) * W, (v - 0.5) * H) < H * 0.3 ? C.red : C.white,
  // the tricolour
  fr: u => u < 1 / 3 ? C.fblue : u < 2 / 3 ? C.white : C.fred,
  // the Kingdom's tricolour with the shield of Savoy
  it: (u, v) => {
    const x = (u - 0.5) * W, y = (v - 0.52) * H;
    if (Math.abs(x) < 0.035 && y < 0.045 && y > -0.045 + Math.abs(x) * 0.5) {
      if (Math.abs(x) > 0.028 || y > 0.038 || y < -0.038 + Math.abs(x) * 0.5) return C.blue;   // its blue border
      return Math.abs(x) < 0.008 || Math.abs(y) < 0.008 ? C.white : C.ired;
    }
    return u < 1 / 3 ? C.green : u < 2 / 3 ? C.white : C.ired;
  },
};

// a flag of w x h flying from the top of its staff at (x, top, z) towards dir (+1 or -1 along x),
// waving by `wave`; with a staff from y0 up, or none (when it hangs on a pole of the model)
function flagMesh(pattern, { x, top, z, dir = -1, w = W, h = H, wave = 0.035, y0 = null, gap = 0.004 }) {
  const pos = [], nor = [], col = [];
  const at = (u, v) => [x + dir * (0.02 + u * w), top - h + v * h, z + Math.sin(u * 5.2 + 0.4) * wave * u];
  const quad = (a, b, c, d, n, rgb) => { for (const p of [a, b, c, a, c, d]) { pos.push(...p); nor.push(...n); col.push(...rgb); } };
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const u0 = i / NU, u1 = (i + 1) / NU, v0 = j / NV, v1 = (j + 1) / NV;
    const rgb = pattern((u0 + u1) / 2, (v0 + v1) / 2);
    const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1);
    const off = (p, k) => [p[0], p[1], p[2] + k * gap];
    const [f, bk] = dir < 0 ? [-1, 1] : [1, -1];                                        // one face each side, each facing out
    quad(off(a, f), off(b, f), off(c, f), off(d, f), [0, 0, f], rgb);
    quad(off(a, bk), off(d, bk), off(c, bk), off(b, bk), [0, 0, bk], rgb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (y0 == null) return [g];
  const staff = tinted(new THREE.CylinderGeometry(0.012, 0.014, top - y0 + 0.04, 8).translate(x, (top + y0) / 2, z), 0.3);
  const knob = tinted(new THREE.SphereGeometry(0.022, 8, 6).translate(x, top + 0.03, z), 0.75);
  return [g, staff, knob];
}
function tinted(geo, grey) {
  const g = geo.toNonIndexed(); g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(grey), 3));
  return g;
}

// a flag for the nation's vehicle `main` (its hull, crew included): the staff stands near the back
// on the far side, on whatever surface is there
const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
// the surface normal at a ray's hit, turned to face back along the ray (whatever the model's winding)
const facing = h => { const n = h.face.normal.clone(); if (n.dot(ray.ray.direction) > 0) n.negate(); return n; };
export function vehicleFlag(main, nation) {
  const pattern = PATTERNS[nation] || PATTERNS.us;
  main.computeBoundingBox();
  const b = main.boundingBox, x = b.min.x + (b.max.x - b.min.x) * 0.14, z = b.min.z + (b.max.z - b.min.z) * 0.22;
  const mesh = new THREE.Mesh(main, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  ray.set(new THREE.Vector3(x, b.max.y + 1, z), down);
  const hit = ray.intersectObject(mesh, false)[0];
  const y = hit ? hit.point.y : b.max.y * 0.6;
  return flagMesh(pattern, { x, top: y + STAFF, z, y0: y });
}

// the headquarters' flags: where each nation's model has its pole, the plain plastic flag's top
// corner at the pole [x, y, z], and its size (the painted one covers it on both sides)
const HQ_FLAGS = { us: [-1.37, 4.45, -1.2, 0.67, 0.43, 0.02], de: [0.9, 2.98, 0.9], su: [0.8, 2.88, -0.9], gb: [1.8, 2.58, 1.0],
  jp: [1.7, 2.78, -1.3], fr: [1.8, 2.78, -1.2], it: [1.8, 2.78, 1.2] };
export function hqFlag(nation) {
  const [x, top, z, w = 0.65, h = 0.42, t = 0.012] = HQ_FLAGS[nation] || HQ_FLAGS.us;
  return flagMesh(PATTERNS[nation] || PATTERNS.us, { x: x - 0.02, top: top + 0.01, z, dir: 1, w: w + 0.01, h: h + 0.02, wave: 0, gap: t / 2 + 0.003 });
}

// ---- aircraft: the national markings on the wings and the sides of the fuselage
const INSIGNIA = {
  // the star and bars: a white star on a blue disc with white bars either side
  us: (u, v) => {
    const r = Math.hypot(u, v);
    if (Math.abs(v) < 0.2 && Math.abs(u) < 1 && Math.abs(u) > 0.5) return Math.abs(v) < 0.14 ? C.white : C.navy;
    if (r > 0.5) return null;
    return inStar(u, v, 0.48) ? C.white : C.navy;
  },
  // the Balkenkreuz
  de: (u, v) => { const x = Math.abs(u), y = Math.abs(v); if (Math.max(x, y) > 0.8) return null; const m = Math.min(x, y); return m < 0.18 ? C.black : m < 0.3 ? C.white : null; },
  // the red star, edged white and red
  su: (u, v) => inStar(u, v + 0.08, 0.72) ? C.red : inStar(u, v + 0.08, 0.88) ? C.white : inStar(u, v + 0.08, 1.0) ? C.red : null,
  // the RAF roundel
  gb: (u, v) => { const r = Math.hypot(u, v); return r < 0.32 ? C.red : r < 0.55 ? C.white : r < 0.85 ? C.navy : r < 0.95 ? C.yellow : null; },
  // the Hinomaru, edged white
  jp: (u, v) => { const r = Math.hypot(u, v); return r < 0.8 ? C.red : r < 0.95 ? C.white : null; },
  // the cocarde: blue in the middle, white, red outside
  fr: (u, v) => { const r = Math.hypot(u, v); return r < 0.32 ? C.fblue : r < 0.62 ? C.white : r < 0.95 ? C.fred : null; },
  // the black roundel with the white fasces
  it: (u, v) => {
    const r = Math.hypot(u, v); if (r > 0.95) return null; if (r > 0.85) return C.white;
    for (const x0 of [-0.35, 0, 0.35]) if (Math.abs(u - x0) < 0.08 && Math.abs(v) < 0.55) return C.white;
    return C.black;
  },
};

// a decal of `size` across lying on the surface at p (normal n), its u along the aircraft's length
function decal(pattern, p, n, size) {
  const N = new THREE.Vector3(n.x, n.y, n.z).normalize();
  const T = new THREE.Vector3(1, 0, 0).addScaledVector(N, -N.x);
  if (T.lengthSq() < 1e-4) T.set(0, 0, 1).addScaledVector(N, -N.z);
  T.normalize(); const B = new THREE.Vector3().crossVectors(N, T);
  if (B.y < -0.5) { T.negate(); B.negate(); }                              // keep the marking upright on either side
  const o = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(N, 0.006), K = 16, pos = [], nor = [], col = [];
  const at = (u, v) => o.clone().addScaledVector(T, u * size / 2).addScaledVector(B, v * size / 2);
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
    const u0 = -1 + 2 * i / K, u1 = -1 + 2 * (i + 1) / K, v0 = -1 + 2 * j / K, v1 = -1 + 2 * (j + 1) / K;
    const rgb = pattern((u0 + u1) / 2, (v0 + v1) / 2); if (!rgb) continue;
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]]) { pos.push(...at(u, v).toArray()); nor.push(N.x, N.y, N.z); col.push(...rgb); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// markings for an aircraft whose body is `main`: on the top of each wing, where it is widest, and
// on both sides of the fuselage behind the wing. Helicopters (wings=false) get the fuselage only.
export function aircraftMarkings(main, nation, { wings = true, big = false } = {}) {
  const pattern = INSIGNIA[nation] || INSIGNIA.us, out = [];
  main.computeBoundingBox();
  const b = main.boundingBox, mesh = new THREE.Mesh(main, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const hitAt = (o, d) => { ray.set(o, d); return ray.intersectObject(mesh, false)[0]; };
  if (wings) {
    const span = Math.max(-b.min.z, b.max.z), steps = 90;
    for (const s of [1, -1]) {
      const z = s * span * 0.7; let run = [], best = [];
      for (let i = 0; i <= steps; i++) {
        const x = b.max.x - (b.max.x - b.min.x) * i / steps, h = hitAt(new THREE.Vector3(x, b.max.y + 1, z), down);
        if (h && facing(h).y > 0.5) run.push(x); else { if (run.length > best.length) best = run; run = []; }
      }
      if (run.length > best.length) best = run;
      if (best.length < 3) continue;
      const chord = best[0] - best[best.length - 1], x = (best[0] + best[best.length - 1]) / 2;
      const h = hitAt(new THREE.Vector3(x, b.max.y + 1, z), down);
      if (h) out.push(decal(pattern, h.point, facing(h), Math.min(chord * 0.75, big ? 0.42 : 0.3)));
    }
  }
  const x = b.min.x + (b.max.x - b.min.x) * 0.32;
  for (const s of [1, -1]) {
    const h = hitAt(new THREE.Vector3(x, 0, s * (b.max.z + 1)), new THREE.Vector3(0, 0, -s));
    if (h && Math.abs(h.face.normal.z) > 0.5 && s * h.point.z > 0.03) out.push(decal(pattern, h.point, facing(h), big ? 0.24 : 0.15));
  }
  return out;
}

// ---- tanks: the markings painted on the sides of the turret and the hull
const TANK_MARKS = {
  us: (u, v) => inStar(u, v + 0.08, 1.0) ? C.white : null,
  de: INSIGNIA.de,
  // a red star with a broad white edge, so it shows on the red plastic too
  su: (u, v) => inStar(u, v + 0.08, 0.66) ? C.red : inStar(u, v + 0.08, 1.0) ? C.white : null,
  // the white-red-white recognition flash
  gb: (u, v) => Math.abs(u) > 0.9 || Math.abs(v) > 0.7 ? null : Math.abs(u) < 0.3 ? C.red : C.white,
  // the Imperial Army's yellow star
  jp: (u, v) => inStar(u, v + 0.08, 0.8) ? C.yellow : inStar(u, v + 0.08, 1.0) ? C.black : null,          // outlined, for the white plastic
  fr: INSIGNIA.fr,
  // a company rectangle: red, with the white bar of the platoon
  it: (u, v) => Math.abs(u) > 0.95 || Math.abs(v) > 0.6 ? null : Math.abs(u) < 0.14 ? C.white : C.ired,
};

// markings for a tank (or armoured car) `main`: on both sides of the hull and, if it has one, of
// the turret - found as the narrower part standing on the hull
export function tankMarkings(main, nation, { turret = true, size = 0.2 } = {}) {
  const pattern = TANK_MARKS[nation] || TANK_MARKS.us, out = [];
  main.computeBoundingBox();
  const b = main.boundingBox, mesh = new THREE.Mesh(main, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const side = (x, y, s) => { ray.set(new THREE.Vector3(x, y, s * (b.max.z + 1)), new THREE.Vector3(0, 0, -s)); return ray.intersectObject(mesh, false)[0]; };
  const len = b.max.x - b.min.x, hullX = b.min.x + len * 0.42, hullY = b.max.y * 0.5, width = Math.max(b.max.z, -b.min.z);
  for (const s of [1, -1]) {
    const h = side(hullX, hullY, s);
    if (h && Math.abs(h.face.normal.z) > 0.6) out.push(decal(pattern, h.point, facing(h), size));
  }
  if (!turret) return out;
  // the turret: sample the top from above, keep what stands high and inside the hull's width
  let sx = 0, n = 0;
  for (let i = 0; i <= 24; i++) for (let j = 0; j <= 8; j++) {
    const x = b.min.x + len * i / 24, z = (j / 8 - 0.5) * width;
    ray.set(new THREE.Vector3(x, b.max.y + 1, z), down);
    const h = ray.intersectObject(mesh, false)[0];
    if (h && h.point.y > b.max.y * 0.72) { sx += x; n++; }
  }
  if (!n) return out;
  const tx = sx / n;
  for (const s of [1, -1]) {
    for (let k = 0; k < 12; k++) {                                            // highest ray that meets a side wall well in from the hull's edge
      const h = side(tx, b.max.y * (0.86 - k * 0.025), s);
      if (h && Math.abs(h.face.normal.z) > 0.6 && Math.abs(h.point.z) < width * 0.8) { out.push(decal(pattern, h.point, facing(h), size * 0.8)); break; }
    }
  }
  return out;
}
