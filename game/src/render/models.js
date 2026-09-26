// Plastic toy models. Every piece comes from src/data/figures.js and src/data/vehicles.js
// (alo89's army men and our own Blender models, see tools/) and is split into at most a few
// geometries - "main" in the army colour, "dark", painted parts - so each is a handful of draw calls.
import { FIGURES, FIGURE_SCALE } from '../data/figures.js';
import { VEHICLES, VEHICLE_SCALE } from '../data/vehicles.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as THREE from 'three';

// Classic army-men figures ("Miniature Army Men" by alo89, CC BY 4.0), see tools/figures.mjs.
// The bazooka, AA missile, grenadier, medic and drag poses were modelled for the game in Blender
// (tools/blender/army_men.py), as was every "Living soldiers" figure (no stands, legs that swing).
const FIGURE_FOR = {
  rifleman: 'rifle', para: 'rifle', officer: 'pointer', mg: 'mg50', sniper: 'sniper', 'pose-kneel': 'kneel', 'pose-prone': 'crawl',
  bazooka: 'bazooka', 'pose-bazooka-stand': 'bazooka-stand', manpads: 'manpads', 'pose-manpads-kneel': 'manpads-kneel',
  grenadier: 'grenadier', 'pose-grenadier-idle': 'grenadier-idle', medic: 'medic', 'pose-medic-heal': 'medic-heal', 'pose-drag': 'drag',
};
const LIVING_FOR = {
  rifleman: 'rifleman', para: 'rifleman', officer: 'officer', sniper: 'sniper', grenadier: 'grenadier', 'pose-grenadier-idle': 'grenadier-idle',
  bazooka: 'bazooka', 'pose-bazooka-stand': 'bazooka-stand', manpads: 'manpads', 'pose-manpads-kneel': 'manpads-kneel',
  medic: 'medic', 'pose-medic-heal': 'medic-heal', 'pose-drag': 'drag',
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
  if (f.legs) out.legs = f.legs.map(l => ({ geo: figureGeometry(l), hip: l.hip }));    // swung from the hip while walking
  return out;
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
    m = LIVING_FOR[t] ? buildFigure('living-' + LIVING_FOR[t]) : buildFigure(FIGURE_FOR[t] || 'rifle');
    cache.set(k, m);
    return m;
  }
  if (FIGURE_FOR[type]) { m = buildFigure(FIGURE_FOR[type]); cache.set(k, m); return m; }
  // walls and sandbags come in two shapes, picked by the placement seed
  const vk = type === 'wall' || type === 'sandbags' ? type + (seed % 2) : type;
  m = buildVehicle(VEHICLES[vk] ? vk : 'barrel');
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
