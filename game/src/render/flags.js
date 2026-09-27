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
    const x = (u - 0.14) * W, y = (v - 0.78) * H;
    const a = Math.atan2(y, x), r = Math.hypot(x, y), star = 0.024 * (0.55 + 0.45 * Math.cos(5 * (a - Math.PI / 2)) ** 8);
    if (r < star + 0.006 && v > 0.84) return C.yellow;
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

// the flag and its staff, standing on the hull at (x, y, z) and flying towards the back (-x)
function flagMesh(pattern, x, y, z) {
  const pos = [], nor = [], col = [];
  const top = y + STAFF;
  const at = (u, v) => [x - 0.02 - u * W, top - H + v * H, z + Math.sin(u * 5.2 + 0.4) * 0.035 * u];
  const quad = (a, b, c, d, n, rgb) => { for (const p of [a, b, c, a, c, d]) { pos.push(...p); nor.push(...n); col.push(...rgb); } };
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const u0 = i / NU, u1 = (i + 1) / NU, v0 = j / NV, v1 = (j + 1) / NV;
    const rgb = pattern((u0 + u1) / 2, (v0 + v1) / 2);
    const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1);
    const off = (p, k) => [p[0], p[1], p[2] + k * 0.004];
    quad(off(a, 1), off(b, 1), off(c, 1), off(d, 1), [0, 0, 1], rgb);                   // one face each side
    quad(off(a, -1), off(d, -1), off(c, -1), off(b, -1), [0, 0, -1], rgb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const staff = new THREE.CylinderGeometry(0.012, 0.014, STAFF + 0.04, 8).toNonIndexed().translate(x, y + STAFF / 2, z);
  const sc = new Float32Array(staff.attributes.position.count * 3).fill(0.3);
  staff.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  staff.deleteAttribute('uv');
  const knob = new THREE.SphereGeometry(0.022, 8, 6).toNonIndexed().translate(x, top + 0.03, z);
  knob.setAttribute('color', new THREE.BufferAttribute(new Float32Array(knob.attributes.position.count * 3).fill(0.75), 3));
  knob.deleteAttribute('uv');
  return [g, staff, knob];
}

// a flag for the nation's vehicle `main` (its hull, crew included): the staff stands near the back
// on the far side, on whatever surface is there
const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
export function vehicleFlag(main, nation) {
  const pattern = PATTERNS[nation] || PATTERNS.us;
  main.computeBoundingBox();
  const b = main.boundingBox, x = b.min.x + (b.max.x - b.min.x) * 0.14, z = b.min.z + (b.max.z - b.min.z) * 0.22;
  const mesh = new THREE.Mesh(main, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  ray.set(new THREE.Vector3(x, b.max.y + 1, z), down);
  const hit = ray.intersectObject(mesh, false)[0];
  return flagMesh(pattern, x, hit ? hit.point.y : b.max.y * 0.6, z);
}
