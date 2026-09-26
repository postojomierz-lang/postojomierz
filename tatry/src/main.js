import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Grid, Terrain, gridGeometry, meshHeight } from './terrain.js';
import { terrainMaterial, waterMaterial, light } from './materials.js';
import { rng, simplex } from './noise.js';
import meta from './data/meta.json';
import innerHUrl from './data/inner.u16?url';
import outerHUrl from './data/outer.u16?url';
import innerImgUrl from './data/inner.jpg?url';
import outerImgUrl from './data/outer.jpg?url';
import landUrl from './data/landcover.png?url';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('loading-text').textContent = t; };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const P = new URLSearchParams(location.search);
const QUALITY = P.get('q') === 'low' ? 'low' : 'high';

// ---------------------------------------------------------------- loading
async function bin(url) { return new Uint16Array(await (await fetch(url)).arrayBuffer()); }
async function bitmap(url) {
  const b = await (await fetch(url)).blob();
  return createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
}
function pixels(bmp) {
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, bmp.width, bmp.height).data;
}
function texture(bmp, aniso) {
  const t = new THREE.Texture(bmp);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.flipY = false;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- trail helpers
function resample(pts, step) {
  const X = [], Z = [];
  let carry = 0;
  X.push(pts[0][0]); Z.push(pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    let d = step - carry;
    while (d <= L) { X.push(ax + (bx - ax) * d / L); Z.push(az + (bz - az) * d / L); d += step; }
    carry = L - (d - step);
  }
  return { X: Float32Array.from(X), Z: Float32Array.from(Z), step };
}
function smoothArr(a, r) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; n++; } }
    out[i] = s / n;
  }
  return out;
}

function drawMask(size, bounds, draw) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext('2d', { willReadFrequently: true });
  const [x0, z0, x1, z1] = bounds;
  const sx = size / (x1 - x0), sz = size / (z1 - z0);
  g.setTransform(sx, 0, 0, sz, -x0 * sx, -z0 * sz);
  g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g, sx);
  const d = g.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
  return { data: out, size };
}

// ---------------------------------------------------------------- sun
// Sun position for 2 July at the Rysy latitude, local summer time (CEST).
function sunAt(hour) {
  const lat = THREE.MathUtils.degToRad(49.19), decl = THREE.MathUtils.degToRad(23.0);
  const ha = THREE.MathUtils.degToRad((hour - 13.15) * 15);
  const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha));
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  // x = east, z = south, y = up
  return { el, dir: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)) };
}

// ---------------------------------------------------------------- main
async function main() {
  status('Pobieranie danych terenu…');
  const [innerU, outerU, innerBmp, outerBmp, landBmp] = await Promise.all([
    bin(innerHUrl), bin(outerHUrl), bitmap(innerImgUrl), bitmap(outerImgUrl), bitmap(landUrl)]);
  const inner = new Grid(innerU, meta.inner.n, meta.inner.bounds);
  const outer = new Grid(outerU, meta.outer.n, meta.outer.bounds);
  const IB = meta.inner.bounds, OB = meta.outer.bounds;

  const trailPts = meta.trail;
  const trail = resample(trailPts, 1);
  const N = trail.X.length, LENGTH = (N - 1) * trail.step;

  // trail masks: R = the visible path (≈2 m), wide = flattened corridor for the height field
  const TM = 4096;
  const trailVis = drawMask(TM, IB, (g, sx) => {
    g.strokeStyle = 'rgb(255,0,0)'; g.lineWidth = 2.2;
    g.beginPath(); trailPts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.stroke();
    void sx;
  });
  const trailWide = drawMask(1024, IB, (g) => {
    g.filter = 'blur(1.5px)';
    g.strokeStyle = 'rgb(255,0,0)'; g.lineWidth = 16;
    g.beginPath(); trailPts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.stroke();
  });
  const lakeMask = drawMask(1024, IB, (g) => {
    g.fillStyle = g.strokeStyle = 'rgb(255,0,0)'; g.lineWidth = 30;
    for (const l of meta.lakes) {
      g.beginPath(); l.ring.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.closePath(); g.fill(); g.stroke();
    }
  });
  // keeps boulders off the footpath itself
  const trailVisWide = drawMask(2048, IB, (g) => {
    g.strokeStyle = 'rgb(255,0,0)'; g.lineWidth = 3.5;
    g.beginPath(); trailPts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.stroke();
  });
  const terrain = new Terrain(inner, outer, trailWide, lakeMask);

  // ---------- renderer / scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY === 'low' ? 1 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  $('app').appendChild(renderer.domElement);
  const aniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb8c8d8, 2.2e-5);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 120000);

  const sky = new Sky();
  sky.scale.setScalar(100000);
  sky.material.fog = false;
  scene.add(sky);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a3a2a, 1.1);
  scene.add(sunLight, hemi);

  // ---------- terrain meshes
  status('Budowanie terenu (to chwilę trwa)…'); await frame();
  const innerTex = texture(innerBmp, aniso), outerTex = texture(outerBmp, aniso);
  const trailTex = new THREE.DataTexture(trailVis.data, TM, TM, THREE.RedFormat, THREE.UnsignedByteType);
  trailTex.magFilter = THREE.LinearFilter; trailTex.minFilter = THREE.LinearMipmapLinearFilter;
  trailTex.generateMipmaps = true; trailTex.needsUpdate = true;
  const blank = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat); blank.needsUpdate = true;

  const step = QUALITY === 'low' ? 12 : 7;
  const inx = Math.round((IB[2] - IB[0]) / step), inz = Math.round((IB[3] - IB[1]) / step);
  const innerGeo = gridGeometry(IB[0], IB[1], IB[2], IB[3], inx, inz, (x, z) => terrain.height(x, z), 40);
  const innerMat = terrainMaterial({ map: innerTex, trailMap: trailTex, bounds: IB, detail: true });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  scene.add(innerMesh);

  status('Budowanie panoramy Tatr…'); await frame();
  const shrink = 120;
  const outerGeo = gridGeometry(OB[0], OB[1], OB[2], OB[3], meta.outer.n[0] - 1, meta.outer.n[1] - 1, (x, z) => {
    const h = terrain.base(x, z);
    return inner.inside(x, z, shrink) ? h - 60 : h;
  });
  const outerMesh = new THREE.Mesh(outerGeo, terrainMaterial({ map: outerTex, trailMap: blank, bounds: OB, detail: false }));
  scene.add(outerMesh);

  // ---------- lakes
  const water = waterMaterial();
  for (const l of meta.lakes) {
    const shape = new THREE.Shape(l.ring.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, water);
    m.position.y = l.level;
    scene.add(m);
  }

  // ---------- trail heights (smoothed, never under the rendered surface)
  const TH = new Float32Array(N);
  for (let i = 0; i < N; i++) TH[i] = terrain.height(trail.X[i], trail.Z[i]);
  const THs = smoothArr(TH, 6);
  const ground = (x, z) => inner.inside(x, z) ? meshHeight(innerGeo, x, z) : terrain.base(x, z);
  const EYE = new Float32Array(N);
  for (let i = 0; i < N; i++) EYE[i] = Math.max(THs[i], ground(trail.X[i], trail.Z[i]) + 0.05);
  const profile = smoothArr(TH, 30);

  // ---------- vegetation and boulders
  status('Sadzenie lasu i kosodrzewiny…'); await frame();
  const land = pixels(landBmp), LW = landBmp.width, LH = landBmp.height;
  const r = rng(7);
  const spruce = [], pine = [];
  const px = (IB[2] - IB[0]) / LW, pz = (IB[3] - IB[1]) / LH;
  const density = QUALITY === 'low' ? 0.35 : 0.9;
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
    const c = land[(j * LW + i) * 4];
    if (c !== 10 && c !== 20) continue;
    const tries = c === 10 ? 1 : 2;
    for (let t = 0; t < tries; t++) {
      if (r() > density) continue;
      const x = IB[0] + (i + r()) * px, z = IB[1] + (j + r()) * pz;
      if (terrain.maskAt(trailWide, x, z) > 0.05 || terrain.maskAt(lakeMask, x, z) > 0.05) continue;
      const h = terrain.height(x, z);
      if (c === 10 && h < 1560) spruce.push(x, h, z);
      else if (h < 1950 && terrain.normal(x, z, 4).y > 0.8) pine.push(x, h, z);
    }
  }
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  {
    const parts = [];
    for (const [rad, hgt, y] of [[1, 0.45, 0.2], [0.78, 0.4, 0.42], [0.55, 0.36, 0.62], [0.32, 0.3, 0.8]]) {
      const c = new THREE.ConeGeometry(rad * 0.42, hgt, 7); c.translate(0, y, 0); parts.push(c);
    }
    const trunk = new THREE.CylinderGeometry(0.03, 0.04, 0.25, 5); trunk.translate(0, 0.02, 0);
    const geo = mergeGeos([...parts, trunk]);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spruce.length / 3);
    for (let k = 0; k < spruce.length / 3; k++) {
      const s = 14 + r() * 14;
      // the elevation model already contains the forest canopy, so sink trees into it
      dummy.position.set(spruce[k * 3], spruce[k * 3 + 1] - s * 0.45, spruce[k * 3 + 2]);
      dummy.rotation.set(0, r() * 6.28, 0);
      dummy.scale.set(s * (0.85 + r() * 0.3), s, s * (0.85 + r() * 0.3));
      dummy.updateMatrix(); mesh.setMatrixAt(k, dummy.matrix);
      mesh.setColorAt(k, col.setHSL(0.3 + r() * 0.05, 0.4, 0.1 + r() * 0.07));
    }
    scene.add(mesh);
  }
  {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, Math.max(p.getY(k), -0.2));
    geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), pine.length / 3);
    for (let k = 0; k < pine.length / 3; k++) {
      const s = 2.2 + r() * 3.2;
      dummy.position.set(pine[k * 3], pine[k * 3 + 1] - s * 0.25, pine[k * 3 + 2]);
      dummy.rotation.set(0, r() * 6.28, 0);
      dummy.scale.set(s * (0.8 + r() * 0.7), s * 0.6, s * (0.8 + r() * 0.7));
      dummy.updateMatrix(); mesh.setMatrixAt(k, dummy.matrix);
      mesh.setColorAt(k, col.setHSL(0.25 + r() * 0.06, 0.45, 0.12 + r() * 0.07));
    }
    scene.add(mesh);
  }
  {
    // boulders and scree near the trail
    // lumpy rock: displacement depends on the vertex position only, so shared corners stay welded
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const f = 1 + 0.28 * simplex(x * 1.3 + z * 0.7, y * 1.3 - z * 0.9);
      p.setXYZ(k, x * f, Math.max(y * f * 0.7, -0.35), z * f);
    }
    geo.computeVertexNormals();
    const count = QUALITY === 'low' ? 5000 : 16000;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), count);
    const ip = pixels(innerBmp), IW = innerBmp.width;
    let k = 0, guard = 0;
    while (k < count && guard++ < count * 20) {
      const i = Math.floor(r() * N);
      const d = 2.5 + Math.pow(r(), 2.6) * 220, a = r() * 6.28;
      const x = trail.X[i] + Math.cos(a) * d, z = trail.Z[i] + Math.sin(a) * d;
      if (!inner.inside(x, z) || terrain.maskAt(lakeMask, x, z) > 0.02 || terrain.maskAt(trailVisWide, x, z) > 0.02) continue;
      const u = Math.floor((x - IB[0]) / (IB[2] - IB[0]) * IW), v = Math.floor((z - IB[1]) / (IB[3] - IB[1]) * IW);
      const o = (v * IW + u) * 4, R = ip[o], G = ip[o + 1], B = ip[o + 2];
      if (G > R + 6 && G > B) continue; // green: grass or dwarf pine
      const ny = terrain.normal(x, z, 3).y;
      if (ny < 0.55) continue; // no boulders glued to cliffs
      const s = (0.25 + Math.pow(r(), 3) * (d < 8 ? 0.8 : 2.8)) * Math.min(1, (ny - 0.45) * 2.5);
      dummy.position.set(x, ground(x, z) - s * 0.25, z);
      dummy.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28);
      dummy.scale.set(s * (0.7 + r() * 0.6), s * (0.5 + r() * 0.5), s * (0.7 + r() * 0.6));
      dummy.updateMatrix(); mesh.setMatrixAt(k, dummy.matrix);
      const g = 0.22 + r() * 0.16;
      mesh.setColorAt(k, col.setRGB(g, g * 0.98, g * 0.94));
      k++;
    }
    mesh.count = k;
    scene.add(mesh);
  }

  // hiker marker (visible in drone mode)
  const hiker = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), new THREE.MeshLambertMaterial({ color: 0xd0281f, emissive: 0x401010 }));
    body.position.y = 0.9;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a4a8a }));
    pack.position.set(0, 1.1, 0.3);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, fog: false }));
    beacon.name = 'beacon';
    hiker.add(body, pack, beacon);
  }
  scene.add(hiker);

  // ---------------------------------------------------------------- environment
  const env = { hour: 10.5, weather: 'clear' };
  const WEATHER = {
    clear: { fog: 2.0e-5, turb: 2.5, ray: 1.2, sun: 1, amb: 1, fogMix: 0 },
    haze: { fog: 5.5e-5, turb: 8, ray: 2.2, sun: 0.8, amb: 1.1, fogMix: 0.25 },
    mist: { fog: 1.1e-3, turb: 12, ray: 3, sun: 0.35, amb: 1.35, fogMix: 0.85 },
    cloudy: { fog: 3.5e-5, turb: 16, ray: 0.6, sun: 0.35, amb: 1.4, fogMix: 0.6 },
  };
  function applyEnv() {
    const w = WEATHER[env.weather];
    const { el, dir } = sunAt(env.hour);
    const e = Math.max(el, -0.2);
    const day = THREE.MathUtils.smoothstep(e, -0.1, 0.25);
    const low = 1 - THREE.MathUtils.smoothstep(e, 0.02, 0.5);
    const u = sky.material.uniforms;
    u.turbidity.value = w.turb; u.rayleigh.value = w.ray;
    u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(dir);
    light.sunDir.value.copy(dir.y < 0.02 ? dir.clone().setY(0.02).normalize() : dir);
    const sc = new THREE.Color(1, 0.96, 0.88).lerp(new THREE.Color(1, 0.55, 0.25), low);
    light.sunCol.value.copy(sc).multiplyScalar(w.sun * THREE.MathUtils.smoothstep(e, -0.03, 0.1));
    const amb = new THREE.Color(0.32, 0.38, 0.5).lerp(new THREE.Color(0.4, 0.3, 0.35), low * 0.6);
    light.ambCol.value.copy(amb).multiplyScalar(w.amb * (0.08 + 0.92 * day));
    sunLight.position.copy(dir).multiplyScalar(1000);
    sunLight.color.copy(light.sunCol.value); sunLight.intensity = 2.4;
    hemi.intensity = 1.2 * w.amb * (0.1 + 0.9 * day);
    const fogDay = new THREE.Color(0.66, 0.74, 0.84).lerp(new THREE.Color(0.9, 0.7, 0.55), low * 0.7);
    const fogGrey = new THREE.Color(0.7, 0.72, 0.74);
    const fc = fogDay.lerp(fogGrey, w.fogMix).multiplyScalar(0.12 + 0.88 * day);
    scene.fog.color.copy(fc);
    scene.fog.density = w.fog;
    water.uniforms.skyCol.value.copy(fc).multiplyScalar(0.55);
    sky.visible = w.fogMix < 0.8;
    scene.background = fc.clone();
    renderer.toneMappingExposure = 0.55;
    sky.material.uniforms.up.value.set(0, 1, 0);
    // cloudy: flatten the sky toward grey by blending with fog colour via exposure trick
    if (env.weather === 'cloudy') { u.turbidity.value = 20; u.rayleigh.value = 0.3; }
    $('hour-label').textContent = `${String(Math.floor(env.hour)).padStart(2, '0')}:${String(Math.round((env.hour % 1) * 60)).padStart(2, '0')}`;
  }
  applyEnv();

  // ---------------------------------------------------------------- walking state
  const state = {
    s: 0, auto: false, speedMul: 1, mode: 'walk',
    yawOff: 0, pitchOff: 0, yaw: 0, walkedTime: 0,
  };
  const at = (s) => {
    const f = Math.min(N - 1, Math.max(0, s / trail.step));
    const i = Math.min(N - 2, Math.floor(f)), t = f - i;
    return { x: trail.X[i] + (trail.X[i + 1] - trail.X[i]) * t, z: trail.Z[i] + (trail.Z[i + 1] - trail.Z[i]) * t, y: EYE[i] + (EYE[i + 1] - EYE[i]) * t, i };
  };
  const gradeAt = (s) => {
    const a = Math.max(0, s - 40), b = Math.min(LENGTH, s + 40);
    const ia = Math.round(a / trail.step), ib = Math.round(b / trail.step);
    return (profile[ib] - profile[ia]) / Math.max(1, b - a);
  };
  const headingAt = (s) => {
    const a = at(Math.max(0, s - 10)), b = at(Math.min(LENGTH, s + 45));
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  state.yaw = headingAt(0);

  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'Space') { state.auto = !state.auto; e.preventDefault(); updateButtons(); }
    if (e.code === 'KeyF') toggleMode();
    if (e.code === 'KeyR') { state.yawOff = 0; state.pitchOff = 0; }
    if (e.code === 'KeyT') { env.hour = env.hour >= 21 ? 4.5 : env.hour + 1; $('hour').value = env.hour; applyEnv(); }
    if (e.code === 'KeyM') { const ks = Object.keys(WEATHER); env.weather = ks[(ks.indexOf(env.weather) + 1) % ks.length]; $('weather').value = env.weather; applyEnv(); }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') setSpeed(1);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') setSpeed(-1);
    if (e.code === 'KeyH') $('help').classList.toggle('hidden');
    if (e.code === 'Home') state.s = 0;
    if (e.code === 'End') state.s = LENGTH;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const SPEEDS = [1, 3, 10, 30];
  function setSpeed(d) {
    const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(state.speedMul) + d));
    state.speedMul = SPEEDS[i];
    updateButtons();
  }

  // mouse / touch look
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { if (state.mode === 'walk') { drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); } });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.yawOff -= (e.clientX - drag.x) * 0.004;
    state.pitchOff = Math.max(-1.2, Math.min(1.2, state.pitchOff - (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', () => { drag = null; });

  // drone mode
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enabled = false; orbit.enableDamping = true; orbit.maxDistance = 25000; orbit.minDistance = 20;
  orbit.maxPolarAngle = Math.PI * 0.495;
  function toggleMode() {
    state.mode = state.mode === 'walk' ? 'drone' : 'walk';
    const p = at(state.s);
    if (state.mode === 'drone') {
      orbit.target.set(p.x, p.y, p.z);
      const yaw = state.yaw + state.yawOff;
      camera.position.set(p.x - Math.sin(yaw) * 450, p.y + 380, p.z - Math.cos(yaw) * 450);
      orbit.enabled = true; orbit.update();
    } else orbit.enabled = false;
    hiker.visible = state.mode === 'drone';
    updateButtons();
  }
  hiker.visible = false;

  // ---------------------------------------------------------------- HUD
  const pc = $('profile'), pg = pc.getContext('2d');
  let pmin = Infinity, pmax = -Infinity;
  for (const v of profile) { pmin = Math.min(pmin, v); pmax = Math.max(pmax, v); }
  function drawProfile() {
    const w = pc.width = pc.clientWidth * devicePixelRatio, h = pc.height = pc.clientHeight * devicePixelRatio;
    pg.clearRect(0, 0, w, h);
    const X = (s) => s / LENGTH * w, Y = (e) => h - 6 * devicePixelRatio - (e - pmin) / (pmax - pmin) * (h - 16 * devicePixelRatio);
    pg.beginPath(); pg.moveTo(0, h);
    for (let i = 0; i < N; i += 4) pg.lineTo(X(i * trail.step), Y(profile[i]));
    pg.lineTo(w, h); pg.closePath();
    pg.fillStyle = 'rgba(255,255,255,0.16)'; pg.fill();
    pg.beginPath(); for (let i = 0; i < N; i += 4) pg.lineTo(X(i * trail.step), Y(profile[i]));
    pg.strokeStyle = 'rgba(255,255,255,0.7)'; pg.lineWidth = 1.5 * devicePixelRatio; pg.stroke();
    const sx = X(state.s), i = Math.round(state.s / trail.step);
    pg.beginPath(); pg.moveTo(0, h);
    for (let k = 0; k <= i; k += 4) pg.lineTo(X(k * trail.step), Y(profile[k]));
    pg.lineTo(sx, Y(profile[i])); pg.lineTo(sx, h); pg.closePath();
    pg.fillStyle = 'rgba(230,60,40,0.45)'; pg.fill();
    pg.beginPath(); pg.arc(sx, Y(profile[i]), 4 * devicePixelRatio, 0, 7); pg.fillStyle = '#ff5a3c'; pg.fill();
  }
  pc.addEventListener('click', (e) => { const b = pc.getBoundingClientRect(); state.s = (e.clientX - b.left) / b.width * LENGTH; });

  const PLACES = [
    { s: 0, name: 'Schronisko nad Morskim Okiem' },
    ...nearestNamed(),
    { s: LENGTH, name: 'Rysy' },
  ];
  function nearestNamed() {
    // where the trail passes the lakes
    const out = [];
    for (const l of meta.lakes) {
      if (l.name !== 'Czarny Staw pod Rysami') continue;
      let best = 1e9, bs = 0;
      const cx = l.ring.reduce((a, p) => a + p[0], 0) / l.ring.length, cz = l.ring.reduce((a, p) => a + p[1], 0) / l.ring.length;
      for (let i = 0; i < N; i += 2) { const d = Math.hypot(trail.X[i] - cx, trail.Z[i] - cz); if (d < best) { best = d; bs = i * trail.step; } }
      out.push({ s: bs, name: 'Czarny Staw pod Rysami' });
    }
    return out;
  }

  function updateButtons() {
    $('btn-auto').textContent = state.auto ? '⏸ Stop' : '▶ Idź sam';
    $('btn-auto').classList.toggle('on', state.auto);
    $('btn-mode').textContent = state.mode === 'walk' ? '🚁 Dron' : '🥾 Spacer';
    $('speed').textContent = `×${state.speedMul}`;
  }
  $('btn-auto').onclick = () => { state.auto = !state.auto; updateButtons(); };
  $('btn-mode').onclick = toggleMode;
  $('btn-faster').onclick = () => setSpeed(1);
  $('btn-slower').onclick = () => setSpeed(-1);
  $('hour').oninput = (e) => { env.hour = +e.target.value; applyEnv(); };
  $('weather').onchange = (e) => { env.weather = e.target.value; applyEnv(); };
  $('btn-help').onclick = () => $('help').classList.toggle('hidden');
  $('sources').textContent = meta.sources;
  updateButtons();

  const fmtTime = (sec) => { const m = Math.floor(sec / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  const TREAD_MAX = 0.15;

  // ---------------------------------------------------------------- loop
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); drawProfile();
  });
  const clock = new THREE.Clock();
  let hudT = 0;
  $('loading').classList.add('done');

  function tick() {
    const dt = Math.min(0.1, clock.getDelta());
    light.time.value += dt;
    const grade = gradeAt(state.s);
    // Tobler's hiking function: realistic walking pace on this slope (km/h)
    const tobler = 6 * Math.exp(-3.5 * Math.abs(grade + 0.05));
    let dir = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dir = 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dir = -1;
    if (state.auto && dir === 0) dir = 1;
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.5 : 1;
    const v = tobler / 3.6 * state.speedMul * run * dir;
    if (dir !== 0) {
      state.s = Math.max(0, Math.min(LENGTH, state.s + v * dt));
      if (state.s < LENGTH) state.walkedTime += Math.abs(v * dt) / (tobler / 3.6);
      if (state.s >= LENGTH && state.auto) { state.auto = false; updateButtons(); }
    }
    if (keys.has('KeyA') || keys.has('ArrowLeft')) state.yawOff += 1.4 * dt;
    if (keys.has('KeyD') || keys.has('ArrowRight')) state.yawOff -= 1.4 * dt;
    if (keys.has('KeyQ')) state.pitchOff = Math.min(1.2, state.pitchOff + dt);
    if (keys.has('KeyE')) state.pitchOff = Math.max(-1.2, state.pitchOff - dt);

    const p = at(state.s);
    const target = headingAt(state.s);
    let d = target - state.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    state.yaw += d * Math.min(1, dt * 1.1);
    hiker.position.set(p.x, p.y, p.z);
    hiker.rotation.y = state.yaw;
    const beacon = hiker.getObjectByName('beacon');
    const cd = camera.position.distanceTo(hiker.position);
    beacon.position.y = 3 + cd * 0.012; beacon.scale.setScalar(Math.max(0.4, cd * 0.006));

    if (state.mode === 'walk') {
      const bob = dir ? Math.sin(state.s * 3.4) * 0.03 : 0;
      camera.position.set(p.x, p.y + 1.7 + bob, p.z);
      const yaw = state.yaw + state.yawOff;
      const along = Math.max(0, Math.cos(state.yawOff)); // follow the slope only when looking along the trail
      const pitch = state.pitchOff + (Math.atan(Math.max(0, grade)) * 0.6 + Math.atan(Math.min(0, grade)) * 0.2) * along - 0.03;
      camera.lookAt(p.x + Math.sin(yaw) * Math.cos(pitch), p.y + 1.7 + Math.sin(pitch), p.z + Math.cos(yaw) * Math.cos(pitch));
    } else {
      const delta = new THREE.Vector3(p.x, p.y, p.z).sub(orbit.target);
      orbit.target.add(delta); camera.position.add(delta);
      orbit.update();
      const gy = ground(camera.position.x, camera.position.z) + 15;
      if (camera.position.y < gy) camera.position.y = gy;
    }

    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.2;
      const ie = Math.round(state.s / trail.step);
      $('h-dist').textContent = `${(state.s / 1000).toFixed(2)} / ${(LENGTH / 1000).toFixed(2)} km`;
      $('h-elev').textContent = `${Math.round(profile[ie])} m n.p.m.`;
      $('h-grade').textContent = `${(grade * 100).toFixed(0)}%`;
      const tread = Math.max(0, Math.min(TREAD_MAX, grade));
      $('h-tread').textContent = `${(tread * 100).toFixed(1)}%` + (grade > TREAD_MAX ? ' (max)' : grade < 0 ? ' (zejście)' : '');
      $('h-time').textContent = fmtTime(state.walkedTime);
      $('h-pace').textContent = `${tobler.toFixed(1)} km/h`;
      let place = '';
      for (const pl of PLACES) if (Math.abs(pl.s - state.s) < 60) place = pl.name;
      $('place').textContent = place;
      $('place').classList.toggle('show', !!place);
      drawProfile();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  window.__rysy = { state, LENGTH, env, applyEnv, toggleMode, camera, renderer, terrain, trail, EYE, TH, ground, at, headingAt };
  tick();
}

function mergeGeos(geos) {
  const nonIdx = geos.map((g) => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of nonIdx) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of nonIdx) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

main().catch((e) => { console.error(e); status('Błąd: ' + e.message); });
