// Plastic toy models. Every piece comes from src/data/figures.js and src/data/vehicles.js
// (our Blender models, see tools/) and is split into at most a few
// geometries - "main" in the army colour, "dark", painted parts - so each is a handful of draw calls.
import { FIGURES, FIGURE_SCALE } from '../data/figures.js';
import { VEHICLES, VEHICLE_SCALE } from '../data/vehicles.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { vehicleFlag, hqFlag, aircraftMarkings, tankMarkings } from './flags.js';

// The army men (tools/blender/army_men.py): which figure each unit type and pose uses.
const FIGURE_FOR = {
  rifleman: 'rifleman', para: 'rifleman', officer: 'officer', mg: 'mg', sniper: 'sniper', 'pose-kneel': 'kneel', 'pose-prone': 'prone',
  bazooka: 'bazooka', 'pose-bazooka-stand': 'bazooka-stand', manpads: 'manpads', 'pose-manpads-kneel': 'manpads-kneel',
  grenadier: 'grenadier', 'pose-grenadier-idle': 'grenadier-idle', medic: 'medic', 'pose-medic-heal': 'medic-heal', 'pose-drag': 'drag',
  'pose-sapper': 'sapper', 'pose-driver': 'driver', mp: 'mp',
};
// figure data is meshopt-compressed: wait for the (tiny, built-in) decoder before building models
export const modelsReady = MeshoptDecoder.ready;

// Every nation but the Americans (built into the game) has its own figures, vehicles and aircraft in
// a file next to the game (public/nation-xx.js), downloaded when one of its armies takes the field.
// Anything a nation does not have falls back to the American model.
const PACKS = {};
export async function loadNation(nation) {
  if (!nation || nation === 'us' || PACKS[nation]) return true;
  try {
    PACKS[nation] = await import(/* @vite-ignore */ new URL(`nation-${nation}.js`, document.baseURI).href);
    return true;
  } catch (e) { console.warn('nation models not available:', nation, e); return false; }
}
const figData = (key, nation) => (PACKS[nation] && PACKS[nation].FIGURES[key]) || FIGURES[key];
const vehData = (key, nation) => (PACKS[nation] && PACKS[nation].VEHICLES[key]) || VEHICLES[key];
const own = (key, nation) => !!(PACKS[nation] && PACKS[nation].VEHICLES[key]);

function b64(s) { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
function figureGeometry(part, colour = null, scale = FIGURE_SCALE, crease = true) {
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
// Drivers, gunners and commanders riding in the vehicles: [figure, x, y, z] (figure origin = its feet).
const CREW_SCALE = 0.8;
const CREW = {
  jeep: [['driver', -0.14, 0.47, -0.22], ['mgstand', -0.72, 0.43, 0]],
  engtruck: [['driver', -0.07, 0.42, -0.2]],
  amphib: [['driver', 0.09, 0.62, -0.2], ['mgstand', -0.58, 0.74, 0]],
  apc: [['lookout', -0.25, 0.55, 0.12]],
  tank: [['lookout', -0.35, 0.81, 0.2]],
  tank_light: [['lookout', -0.12, 0.6, 0.18]],
  tank_heavy: [['lookout', -0.45, 0.88, 0.3]],
};
// the German vehicles are shaped differently: their crews sit elsewhere
const CREW_NATION = {
  de: {
    jeep: [['driver', -0.07, 0.44, -0.2], ['mgstand', -0.72, 0.43, 0]],
    engtruck: [],
    amphib: [['driver', 0.07, 0.6, -0.2], ['mgstand', -0.6, 0.53, 0]],
    apc: [['lookout', -0.2, 0.62, 0.1]],
    tank: [['lookout', -0.58, 0.75, 0]],
    tank_light: [['lookout', -0.12, 0.6, 0.12]],
    tank_heavy: [['lookout', -0.52, 0.92, 0.34]],
    heli: [['driver', 0.45, -0.18, 0]],
  },
  su: {
    jeep: [['driver', -0.11, 0.44, -0.2], ['mgstand', -0.72, 0.43, 0]],
    engtruck: [],
    amphib: [['lookout', -0.1, 0.58, 0.15]],
    apc: [['lookout', -0.2, 0.7, 0]],
    tank: [['lookout', -0.33, 0.84, 0.2]],
    tank_light: [['lookout', -0.12, 0.62, 0.14]],
    tank_heavy: [['lookout', -0.33, 1.0, -0.3]],
    heli: [['driver', 0.2, -0.2, 0], ['driver', -0.25, -0.2, 0]],
  },
  jp: {
    jeep: [['driver', -0.07, 0.44, -0.2], ['mgstand', -0.7, 0.43, 0]],
    engtruck: [],
    apc: [['mgstand', -0.6, 0.5, 0]],
    amphib: [['lookout', -0.12, 0.58, 0.1]],
    tank: [['lookout', -0.18, 0.77, -0.1]],
    tank_light: [['lookout', -0.08, 0.6, 0.15]],
    tank_heavy: [['lookout', -0.52, 0.96, 0.26]],
    heli: [['driver', 0.2, -0.2, 0], ['driver', -0.25, -0.2, 0]],
  },
  it: {
    jeep: [['driver', -0.1, 0.44, -0.2], ['mgstand', -0.7, 0.43, 0]],
    engtruck: [],
    apc: [['lookout', -0.1, 0.72, 0]],
    tank: [['lookout', -0.2, 0.86, 0.15]],
    tank_light: [['lookout', -0.12, 0.6, -0.07]],
    tank_heavy: [['lookout', -0.3, 0.96, 0.18]],
    amphib: [],
    heli: [['driver', 0.3, -0.58, 0]],
  },
  fr: {
    jeep: [['driver', -0.1, 0.46, -0.2], ['mgstand', -0.7, 0.45, 0]],
    engtruck: [],
    apc: [['lookout', -0.1, 0.72, 0]],
    tank: [['lookout', -0.15, 0.9, 0.2]],
    tank_light: [['lookout', -0.12, 0.66, 0.12]],
    tank_heavy: [['lookout', 0.12, 1.02, 0.16]],
    amphib: [['driver', 0.09, 0.6, -0.2], ['mgstand', -0.58, 0.72, 0]],
    heli: [['driver', 0.2, -0.2, 0], ['driver', -0.25, -0.2, 0]],
  },
  gb: {
    jeep: [['driver', 0.25, 0.34, 0.2], ['driver', 0.25, 0.34, -0.2]],
    engtruck: [],
    amphib: [['driver', -0.15, 0.5, 0]],
    apc: [['lookout', -0.15, 0.6, 0.1]],
    tank: [['lookout', -0.43, 0.78, 0.22]],
    tank_light: [['lookout', -0.18, 0.55, 0.1]],
    tank_heavy: [['lookout', -0.15, 1.02, 0.24]],
    heli: [['driver', 0.2, -0.2, 0], ['driver', -0.25, -0.2, 0]],
  },
};
// helicopter rotors: hubs [x, y, z], lean (radians, about the length axis) and spin direction; tail rotor hub
const ROTORS = { us: { rotors: [[0.3, 0.7, 0, 0, 1]], tail: [-1.85, 0.45, 0.06] },
  de: { rotors: [[0.25, 0.72, 0.12, 0.2, 1], [0.25, 0.72, -0.12, -0.2, -1]], tail: null },   // Flettner's intermeshing pair
  su: { rotors: [[0.15, 0.8, 0, 0, 1]], tail: null },                                         // the Kamov autogyro
  gb: { rotors: [[0.1, 0.84, 0, 0, 1]], tail: null },                                          // the Cierva autogyro
  jp: { rotors: [[0.1, 0.84, 0, 0, 1]], tail: null },                                          // the Kayaba autogyro
  fr: { rotors: [[0.1, 0.84, 0, 0, 1]], tail: null },                                         // the LeO-built Cierva
  it: { rotors: [[0.0, 0.86, 0, 0, 1], [0.0, 0.98, 0, 0, -1]], tail: null } };                 // D'Ascanio's coaxial pair
// lorries and cars: where their markings go (the cab doors, and the bonnet of the small ones)
const SOFT_SKINS = { jeep: { sideX: 0.5, sideY: 0.55, bonnet: true, size: 0.15 }, amphib: { sideX: 0.45, sideY: 0.6, bonnet: true, size: 0.17 },
  ambulance: { sideX: [0.55, 0.85], sideAt: 0.7, size: 0.16 }, engtruck: { sideX: [0.55, 0.85], sideAt: 0.7, size: 0.16 }, rockets: { sideX: [0.55, 0.85], sideAt: 0.7, size: 0.16 } };
const TANKS = new Set(['tank_light', 'tank', 'tank_heavy', 'apc']);
const MARKED = new Set(['heli', 'fighter', 'attacker', 'bomber', 'transport']);
const FLAGGED = new Set(['jeep', 'ambulance', 'engtruck', 'apc', 'amphib', 'tank_light', 'tank', 'tank_heavy', 'rockets']);
// Toy vehicles and aircraft modelled in Blender (tools/blender/vehicles.py and vehicles_<nation>.py).
function buildVehicle(key, nation = 'us') {
  const v = vehData(key, nation), g = (p, c) => figureGeometry(p, c, VEHICLE_SCALE, true);
  const mine = own(key, nation) ? nation : 'us';                      // whose model this is
  const out = { main: g(v.main.near), far: { main: g(v.main.far) } };
  if (v.dark) { out.dark = g(v.dark.near); out.far.dark = g(v.dark.far); }
  if (v.a) out.accent = mergeGeometries(v.a.map(a => g(a, a.c)));
  if (v.rotor) {
    out.rotor = g(v.rotor); out.tailRotor = v.tail ? g(v.tail) : null;
    out.rotors = ROTORS[mine].rotors; out.tailAt = ROTORS[mine].tail;
  }
  if (v.turret_main) out.turret = { main: g(v.turret_main.near), dark: v.turret_dark ? g(v.turret_dark.near) : undefined };
  // the bare model (no crew, tracks and fittings included): where flags and markings are placed
  const bare = g => { const c = g.clone(); c.deleteAttribute('color'); return c; };          // painted parts too (windows)
  const body = mergeGeometries([out.main, out.dark, out.accent && bare(out.accent)].filter(Boolean));
  // crews: army-men figures placed into the model (the MG gunner turns with his gun)
  const crew = (geo, x, y, z, s = 1) => (geo.index ? geo.toNonIndexed() : geo.clone()).scale(s, s, s).translate(x, y, z);
  const crews = (CREW_NATION[mine] && CREW_NATION[mine][key]) || CREW[key];
  if (crews && crews.length) {
    out.main = mergeGeometries([out.main, ...crews.map(([f, x, y, z]) => crew(figure(f, nation).main, x, y, z, CREW_SCALE))]);
    out.far.main = mergeGeometries([out.far.main, ...crews.map(([f, x, y, z]) => crew(figure(f, nation).far.main, x, y, z, CREW_SCALE))]);
  }
  if (key === 'mgnest') out.turret.main = mergeGeometries([out.turret.main, crew(figure('gunner', nation).main, -0.12, 0.04, 0)]);
  // ground vehicles fly their nation's flag from a staff at the back, the headquarters from its
  // pole, and aircraft carry the national markings
  const paint = parts => { if (parts.length) out.accent = mergeGeometries(out.accent ? [out.accent, ...parts] : parts); };
  if (FLAGGED.has(key)) paint(vehicleFlag(body, nation));
  if (key === 'hq') paint(hqFlag(own(key, nation) ? nation : 'us'));
  if (SOFT_SKINS[key]) paint(tankMarkings(body, nation, { turret: false, ...SOFT_SKINS[key] }));
  if (TANKS.has(key)) paint(tankMarkings(body, nation, { size: key === 'tank_heavy' ? 0.24 : key === 'tank_light' || key === 'apc' ? 0.17 : 0.2 }));
  if (MARKED.has(key)) paint(aircraftMarkings(body, nation, { wings: key !== 'heli', big: key === 'bomber' || key === 'transport' }));
  if (key === 'tower') {
    out.main = mergeGeometries([out.main, crew(figure('lookout', nation).main, -0.15, 2.62, 0.25)]);
    out.far.main = mergeGeometries([out.far.main, crew(figure('lookout', nation).far.main, -0.15, 2.62, 0.25)]);
  }
  return out;
}
const SOFT = new Set(['#4f6b35', '#6a8a42', '#3f5a2e', '#5c6d38', '#cfae5e', '#6e5b41', '#8f877a', '#5d6b50']);
const LEAVES = new Set(['#4f6b35', '#6a8a42', '#3f5a2e', '#5c6d38']);
// painted foam foliage: sunlit tops lighter and yellower, undersides dark, blotchy in between
function shadeFoliage(g) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, col = g.attributes.color.array;
  const h = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };
  const blot = (x, y, z) => { const s = 3.2, fx = x * s, fy = y * s, fz = z * s, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let a = 0; for (let k = 0; k < 8; k++) { const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2;
      a += h(ix + dx, iy + dy, iz + dz) * (dx ? fx - ix : 1 - fx + ix) * (dy ? fy - iy : 1 - fy + iy) * (dz ? fz - iz : 1 - fz + iz); }
    return a; };
  for (let i = 0; i < pos.length; i += 3) {
    const up = nor[i + 1] * 0.5 + 0.5, n = blot(pos[i], pos[i + 1], pos[i + 2]);
    const k = 0.62 + up * 0.42 + (n - 0.5) * 0.35 + Math.min(0.15, pos[i + 1] * 0.04);
    col[i] *= k * (1 + up * 0.12); col[i + 1] *= k * (1 + up * 0.06); col[i + 2] *= k * 0.92;
  }
}
// Diorama scenery (tools/blender/*.py): one file per battlefield next to the game, downloaded when a
// battle on it starts (public/scenery-<theme>.js); all painted parts merged into one geometry
const SCENERY = {}, SCENERY_FAR = {}, SCENERY_SCALE = 8000, sceneryLoaded = new Set();
export async function loadScenery(theme) {
  if (sceneryLoaded.has(theme)) return true;
  try {
    const m = await import(/* @vite-ignore */ new URL(`scenery-${theme}.js`, document.baseURI).href);
    Object.assign(SCENERY, m.SCENERY); Object.assign(SCENERY_FAR, m.SCENERY_FAR);
    sceneryLoaded.add(theme);
    return true;
  } catch (e) { console.warn('scenery not available:', theme, e); return false; }
}
const scenery = new Map();
// part: 'all', 'tint' (only the plaster that is coloured per house) or 'rest' (everything else)
const TINT = '#ece6da';
// far: the light version of a building (if there is one)
export function sceneryGeometry(key, part = 'all', far = false) {
  far = far && !!SCENERY_FAR[key];
  const k = key + ':' + part + (far ? ':far' : '');
  if (!SCENERY[key]) return null;
  if (!scenery.has(k)) {
    const parts = (far ? SCENERY_FAR : SCENERY)[key].filter(p => part === 'all' || (part === 'tint') === (p.c === TINT));
    scenery.set(k, parts.length ? mergeGeometries(parts.map(p => {
      const g = figureGeometry(p, p.c, SCENERY_SCALE, !SOFT.has(p.c));   // foliage and earth: smooth; buildings: crisp
      if (LEAVES.has(p.c)) shadeFoliage(g);
      return g.index ? g.toNonIndexed() : g;
    })) : null);
  }
  return scenery.get(k);
}
export const hasTint = key => !!SCENERY[key] && SCENERY[key].some(p => p.c === TINT);
const figs = new Map();
function figure(key, nation = 'us') { const k = nation + ':' + key; if (!figs.has(k)) figs.set(k, buildFigure(key, nation)); return figs.get(k); }

// near: full detail; far: a light version drawn for figures far from the camera
function buildFigure(key, nation = 'us') {
  const f = figData(key, nation), out = { main: figureGeometry(f.near), far: { main: figureGeometry(f.far) } };
  if (f.a) out.accent = mergeGeometries(f.a.map(a => figureGeometry(a, a.c)));   // painted parts (medic's white bag, red crosses)
  return out;
}

// Stretcher bearers: two of the army's men carrying its stretcher at hand height between them.
export const LITTER_LIFT = 0.33;                   // the stretcher's bed ends up about 0.47 up
function buildBearers(nation) {
  const front = figure('bearer-front', nation), back = figure('bearer-back', nation), lit = model('litter', 0, nation);
  const at = (geo, x, y = 0) => (geo.index ? geo.toNonIndexed() : geo.clone()).translate(x, y, 0);
  const both = get => [at(get(front), 0.88), at(get(back), -0.88)];
  const out = {
    main: mergeGeometries([...both(f => f.main), at(lit.main, 0, LITTER_LIFT)]),
    far: { main: mergeGeometries([...both(f => f.far.main), at(lit.main, 0, LITTER_LIFT)]) },
  };
  if (lit.dark) out.dark = at(lit.dark, 0, LITTER_LIFT);
  const acc = [...(front.accent ? both(f => f.accent) : []), ...(lit.accent ? [at(lit.accent, 0, LITTER_LIFT)] : [])];
  if (acc.length) out.accent = mergeGeometries(acc);
  return out;
}

// ---------------------------------------------------------------------------------
const cache = new Map();
export function modelKey(type, seed = 0, nation = 'us') { return nation + ':' + (type === 'wall' || type === 'sandbags' ? type + (seed % 4) : type); }
export function model(type, seed = 0, nation = 'us') {
  const k = modelKey(type, seed, nation);
  if (cache.has(k)) return cache.get(k);
  let m;
  if (FIGURE_FOR[type]) { m = figure(FIGURE_FOR[type], nation); cache.set(k, m); return m; }
  if (type === 'bearers') { m = buildBearers(nation); cache.set(k, m); return m; }
  // walls and sandbags come in two shapes, picked by the placement seed; all engineers share one truck
  const vk = type === 'wall' || type === 'sandbags' ? type + (seed % 2) : type.startsWith('eng_') ? 'engtruck' : type;
  m = buildVehicle(VEHICLES[vk] ? vk : 'barrel', nation);
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
