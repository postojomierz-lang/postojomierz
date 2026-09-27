// three.js view of a Sim: builds the table-top scene and animates it from simulation events.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { model, modelKey, plastic } from './models.js';
import { buildTerrain, floorTexture, FLOOR, buildTape } from './terrain.js';
import { buildDiorama } from './diorama.js';
import { DIORAMAS } from '../sim/map.js';
import { Fx } from './fx.js';
import { CATALOG, TEAM_COLORS } from '../data/catalog.js';

// where each piece's gun is, in its own space (forward = +x)
const MUZZLE = {
  rifleman: [0.47, 0.81], para: [0.47, 0.81], officer: [0.53, 0.76], grenadier: [-0.16, 1.1], bazooka: [0.47, 0.79], manpads: [0.32, 1.17], medic: [0.26, 0.82],
  sniper: [0.66, 0.76], mg: [0.9, 0.5], jeep: [0.3, 1.1], apc: [0.78, 1.08], amphib: [0.14, 1.47], tank: [2.05, 1.05], rockets: [0.2, 1.8],
  heli: [0.8, -0.25], fighter: [1.0, -0.1], attacker: [0.4, -0.2], bomber: [0, -0.35], transport: [-1, -0.35],
  mgnest: [1.0, 0.62], fieldgun: [1.85, 1.1], aa: [0.95, 1.75], tower: [0.6, 2.95], hq: [1.9, 1.75],
};
const HEIGHT = { mg: 0.95, tank: 1.5, jeep: 1.3, apc: 1.3, amphib: 1.7, rockets: 1.9, heli: 1.0, fighter: 0.6, attacker: 0.6, bomber: 0.8, transport: 0.9, ambulance: 1.5, eng_traps: 1.3, eng_at: 1.3, eng_ap: 1.3, tanktrap: 0.8, mgnest: 1.1, fieldgun: 1.3, aa: 1.9, tower: 3.3, hq: 4.4, wall: 1.7, sandbags: 0.7, wire: 0.7, barrel: 1.0 };
const CREW_SCALE = new THREE.Vector3(0.82, 0.82, 0.82);
const isAir = def => def.cls === 'air' || def.cls === 'plane';

// Toy-style animation: soldiers stay rigid plastic figures but are swapped between poses,
// as if a kid repositioned them. Returns the model name to draw.
const CAN_KNEEL = { rifleman: 'pose-kneel', officer: 'pose-kneel', para: 'pose-kneel', grenadier: 'pose-kneel', manpads: 'pose-manpads-kneel' };
const CAN_PRONE = new Set(['rifleman', 'officer', 'para', 'grenadier']);
function basePose(type) { return type === 'grenadier' ? 'pose-grenadier-idle' : type; }
function poseFor(v, now, battle) {
  const e = v.e, t = e.type;
  if (e.carrying) return 'pose-drag';
  if (e.healing) return 'pose-medic-heal';
  if (t === 'grenadier' && now < v.throwUntil) return 'grenadier';
  if (!battle) return basePose(t);
  if (e.moving) return t === 'bazooka' ? 'pose-bazooka-stand' : basePose(t);
  if (CAN_PRONE.has(t) && now - v.lastHit < 2500) return 'pose-prone';
  if (CAN_KNEEL[t] && now - v.lastFire < 2500) return CAN_KNEEL[t];
  return basePose(t);
}

// One InstancedMesh per model part, shared by every army (colour comes per instance),
// so hundreds of soldiers cost a handful of draw calls.
class Batches {
  constructor(parent) { this.parent = parent; this.list = new Map(); }
  get(key, geo, mat) {
    let b = this.list.get(key);
    if (!b) { b = { geo, mat, cap: 0, n: 0, mesh: null, ids: [] }; this.grow(b, 32); this.list.set(key, b); }
    return b;
  }
  grow(b, cap) {
    const m = new THREE.InstancedMesh(b.geo, b.mat, cap);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    if (b.mesh) {
      m.instanceMatrix.array.set(b.mesh.instanceMatrix.array.subarray(0, b.n * 16));
      m.instanceColor.array.set(b.mesh.instanceColor.array.subarray(0, b.n * 3));
      this.parent.remove(b.mesh); b.mesh.dispose();
    }
    b.mesh = m; b.cap = cap; m.userData.batch = b;
    this.parent.add(m);
  }
  begin() { for (const b of this.list.values()) b.n = 0; }
  push(b, matrix, color, id) {
    if (b.n >= b.cap) this.grow(b, b.cap * 2);
    b.mesh.setMatrixAt(b.n, matrix); b.mesh.setColorAt(b.n, color); b.ids[b.n] = id; b.n++;
  }
  end() {
    for (const b of this.list.values()) {
      b.mesh.count = b.n;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
  }
  clear() { for (const b of this.list.values()) { this.parent.remove(b.mesh); b.mesh.dispose(); } this.list.clear(); }
}

const WHITE = new THREE.Color(1, 1, 1);
function teamPalette(col) {
  const main = new THREE.Color(col.main), dark = new THREE.Color(col.dark);
  const dead = c => c.clone().lerp(new THREE.Color('#6f6c64'), 0.45).multiplyScalar(0.75);
  const burnt = c => c.clone().lerp(new THREE.Color('#1c1a17'), 0.8);
  return {
    main, dark, accent: WHITE,
    deadMain: dead(main), deadDark: dead(dark), deadAccent: dead(WHITE),
    burntMain: burnt(main), burntDark: burnt(dark), burntAccent: burnt(WHITE),
    flash: main.clone().lerp(WHITE, 0.75),
  };
}

export class View {
  constructor(stage, overlay) {
    this.stage = stage; this.overlay = overlay; this.octx = overlay.getContext('2d');
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    stage.prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1.6, 0.5, 600);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.09;
    c.minPolarAngle = 0.15; c.maxPolarAngle = 1.2; c.minDistance = 8; c.maxDistance = 160;
    c.screenSpacePanning = false; c.zoomToCursor = true;
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.03;
    this.sunDir = new THREE.Vector3(-0.6, 0.45, 0.4).normalize();
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.unitsGroup = new THREE.Group(); this.scene.add(this.unitsGroup);
    this.batches = new Batches(this.unitsGroup);
    this.plasticMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    this.accentMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, clearcoat: 0.3 });
    this.ents = new Map();
    this.palettes = [];
    this.quality = 'medium';
    this.ghost = null;
    this.now = performance.now();
    this.keys = new Set();
    this.tmpM = new THREE.Matrix4(); this.legM = new THREE.Matrix4();
    this.living = false;
    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
    window.addEventListener('keydown', e => { if (!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // "Living soldiers": figures without bases whose legs walk (toy style otherwise)
  setLiving(on) { this.living = !!on; }

  // ---------------------------------------------------------------- quality / post
  setQuality(q) {
    this.quality = q;
    const size = q === 'low' ? 2048 : 4096;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.resize();
  }
  buildComposer(w, h) {
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.composer = null; }
    if (this.quality === 'low') return;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    const comp = new EffectComposer(this.renderer, rt);
    comp.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      const ao = new GTAOPass(this.scene, this.camera, w, h);
      ao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1, thickness: 1.5, scale: 1.2, samples: 16 });
      ao.blendIntensity = 0.9;
      // the AO normal pass ignores sprite alpha, so smoke would shade the scene as solid squares
      const hide = ao.overrideVisibility.bind(ao);
      ao.overrideVisibility = () => { hide(); if (this.fx) this.fx.group.visible = false; };
      comp.addPass(ao);
    }
    this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
    this.tiltV = new ShaderPass(VerticalTiltShiftShader);
    comp.addPass(this.tiltH); comp.addPass(this.tiltV);
    comp.addPass(new OutputPass());
    this.composer = comp;
    this.updateTilt(w, h);
  }
  updateTilt(w, h) {
    if (!this.tiltH) return;
    const k = this.tiltStrength ?? 0.9;
    this.tiltH.uniforms.h.value = k / w; this.tiltH.uniforms.r.value = 0.5;
    this.tiltV.uniforms.v.value = k / h; this.tiltV.uniforms.r.value = 0.5;
  }
  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(this.quality === 'low' ? 1 : Math.min(dpr, this.quality === 'high' ? 2 : 1.5));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.overlay.width = w * dpr; this.overlay.height = h * dpr;
    this.overlay.style.width = w + 'px'; this.overlay.style.height = h + 'px';
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.buildComposer(w, h);
  }

  // ---------------------------------------------------------------- scene setup
  // Big flat arrow on the floor showing where an army marches this round (a = null hides it).
  setArrow(a) {
    const key = a ? [a.x1, a.z1, a.x2, a.z2, a.color, a.faint].map(v => (typeof v === 'number' ? v.toFixed(1) : v)).join() : '';
    if (key === this.arrowKey && this.arrow && this.arrow.parent) return;
    this.arrowKey = key;
    if (this.arrow) { this.world.remove(this.arrow); this.arrow.geometry.dispose(); this.arrow.material.dispose(); this.arrow = null; }
    if (!a) return;
    const x1 = this.wx(a.x1), z1 = this.wz(a.z1), x2 = this.wx(a.x2), z2 = this.wz(a.z2);
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 2) return;
    const w = Math.min(1.6, 0.5 + len * 0.03), head = Math.min(len * 0.35, w * 3.2);
    const sh = new THREE.Shape();
    sh.moveTo(0, -w / 2); sh.lineTo(len - head, -w / 2); sh.lineTo(len - head, -w * 1.3); sh.lineTo(len, 0);
    sh.lineTo(len - head, w * 1.3); sh.lineTo(len - head, w / 2); sh.lineTo(0, w / 2); sh.closePath();
    const geo = new THREE.ShapeGeometry(sh);
    geo.rotateX(Math.PI / 2);   // shape x -> world x, shape y -> world z
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: a.faint ? 0.3 : 0.55, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x1, 0.06, z1);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    m.renderOrder = 2;
    this.world.add(m); this.arrow = m;
  }
  wx(x) { return x - this.map.W / 2; }
  wz(z) { return z - this.map.H / 2; }

  load(sim, human, { keepCamera = false } = {}) {
    this.sim = sim; this.map = sim.map; this.human = human;
    if (this.ghost) { this.world.remove(this.ghost.g); this.world.remove(this.ghost.pad); this.ghost = null; }
    this.ents.clear();
    this.batches.clear();
    this.palettes = sim.teams.map(t => teamPalette(TEAM_COLORS[t.color]));
    this.world.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    this.world.clear(); this.arrow = null; this.arrowKey = '';
    if (this.fx) { this.fx.clear(); this.scene.remove(this.fx.group); this.fx.decalTex.dispose(); }
    const map = this.map, st = FLOOR[map.theme];
    this.scene.background = new THREE.Color(st.bg);
    const span0 = Math.max(map.W, map.H);
    this.scene.fog = new THREE.Fog(st.bg, span0 * 1.6, span0 * 3.6);
    this.controls.maxDistance = span0 * 2;
    this.hemi.color.set(st.sky); this.hemi.groundColor.set(st.ground);
    this.sun.color.set(st.sunColor);
    const span = Math.max(map.W, map.H);
    this.sunDir.set(...st.sun).normalize();
    this.span = span; this.shadowHalf = 0;

    this.groundPicture = null;
    if (DIORAMAS.includes(map.theme)) {
      const d = buildDiorama(map, this.quality);
      this.world.add(d.group); this.groundPicture = d.minimap;
    } else {
      const tex = floorTexture(map.theme, map.seed, map.tint);
      const FS = map.W + 160, FD = map.H + 160;
      tex.repeat.set(FS / 8, FD / 8);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(FS, FD), new THREE.MeshStandardMaterial({ map: tex, roughness: map.theme === 'kitchen' ? 0.35 : 0.85 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
      this.world.add(floor);
      this.world.add(buildTerrain(map));
      this.world.add(buildTape(map));
    }
    this.zones = new THREE.Group(); this.world.add(this.zones);
    for (const t of sim.teams) {
      const z = t.zone, col = TEAM_COLORS[t.color].main, own = t.id === human;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: own ? 0.16 : 0.08, depthWrite: false }));
      plane.rotation.x = -Math.PI / 2; plane.position.set(this.wx(z.x + z.w / 2), 0.02, this.wz(z.y + z.h / 2));
      this.zones.add(plane);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(z.w, z.h)), new THREE.LineDashedMaterial({ color: col, dashSize: 0.6, gapSize: 0.4 }));
      edges.rotation.x = -Math.PI / 2; edges.position.copy(plane.position); edges.position.y = 0.03; edges.computeLineDistances();
      this.zones.add(edges);
    }
    this.fx = new Fx(this.scene, map, this.world);
    for (const e of sim.ents) this.addEnt(e);
    this.buildMinimapBase();
    this.box = null;
    if (!keepCamera) this.focusZone(human);
  }

  // translucent rectangle used by the map editor to preview what will be drawn
  setBox(r, color = 0x9fe06a) {
    if (!r) { if (this.box) this.box.visible = false; return; }
    if (!this.box) {
      this.box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false }));
      this.world.add(this.box);
    }
    this.box.material.color.setHex(color);
    this.box.visible = true;
    this.box.scale.set(r.w, 0.6, r.h);
    this.box.position.set(this.wx(r.x + r.w / 2), 0.3, this.wz(r.y + r.h / 2));
  }

  // Sun and shadow camera follow what the player is looking at, so shadows stay crisp on big maps.
  updateSun() {
    const t = this.controls.target, dist = this.camera.position.distanceTo(t);
    const half = Math.max(18, Math.min(this.span * 0.8, dist * 0.85));
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).addScaledVector(this.sunDir, this.span * 1.4);
    if (Math.abs(half - this.shadowHalf) > this.shadowHalf * 0.08) {
      this.shadowHalf = half;
      const sc = this.sun.shadow.camera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = this.span * 4;
      sc.updateProjectionMatrix();
    }
  }

  focusZone(teamId) {
    const z = this.sim.teams[teamId].zone, map = this.map, few = this.sim.teams.length <= 2;
    const zx = this.wx(z.x + z.w / 2), zz = this.wz(z.y + z.h / 2);
    // frame our own zone plus the way towards the middle, looking from behind our lines
    const k = few ? 0.55 : 0.8;
    const tx = zx * k, tz = zz * k;
    let dx = -zx, dz = -zz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const dist = few ? Math.max(map.W, map.H) * 1.1 : Math.max(z.w, z.h) * 3.4;
    this.controls.target.set(tx, 0, tz);
    this.camera.position.set(tx - dx * dist * 0.62 + dz * dist * 0.18, dist * 0.8, tz - dz * dist * 0.62 - dx * dist * 0.18);
    this.controls.update();
  }
  lookAt(x, z) {
    const off = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(this.wx(x), 0, this.wz(z));
    this.camera.position.copy(this.controls.target).add(off);
  }

  // ---------------------------------------------------------------- entities
  addEnt(e) {
    if (this.ents.has(e.id)) return;
    const inf = e.def.cls === 'infantry';
    const first = inf ? (this.living ? 'living:' : '') + basePose(e.type) : null;
    const key = inf ? first : modelKey(e.type, e.id), m = inf ? model(first) : model(e.type, e.id);
    // transform-only scene graph (never rendered): root -> pivot -> parts
    const g = new THREE.Object3D(), pivot = new THREE.Object3D(); g.add(pivot);
    let rotor = null, tail = null, chute = null;
    if (m.rotor) {
      rotor = new THREE.Object3D(); rotor.position.set(0.3, 0.7, 0); pivot.add(rotor);
      tail = new THREE.Object3D(); tail.position.set(-1.85, 0.45, 0.06); pivot.add(tail);
    }
    if (e.def.cls === 'infantry') { chute = new THREE.Object3D(); g.add(chute); }
    let turret = null;
    if (m.turret) { turret = new THREE.Object3D(); pivot.add(turret); }
    const yaw = Math.atan2(-e.dirZ, e.dirX);
    const v = { e, g, pivot, rotor, tail, chute, turret, tyaw: yaw, key, m, yaw, pose: inf ? basePose(e.type) : e.type, poseAt: 0, walk: 0, swing: 0, lastFire: 0, fireAt: 0, lastHit: 0, wobbleAt: 0, throwUntil: 0, celebrate: false, roll: 0, pal: this.palettes[e.team], deadAt: 0, downAt: 0, flashUntil: 0, trackAcc: 0, lastX: e.x, lastZ: e.z, fallSide: e.id % 2 ? 1 : -1 };
    if (e.def.static && e.def.cls === 'fort') g.rotation.y = e.rot & 1 ? Math.PI / 2 : 0;
    else g.rotation.y = yaw;
    g.position.set(this.wx(e.x), e.y, this.wz(e.z));
    this.ents.set(e.id, v);
    if (e.dead) v.deadAt = this.now - 5000;
    if (e.down) v.downAt = this.now - 5000;
    return v;
  }
  removeEnt(id) { this.ents.delete(id); }

  muzzleOf(v) {
    let [f, h] = MUZZLE[v.e.type] || [0.4, 0.7];
    if (v.pose === 'pose-prone') { f = 0.52; h = 0.12; }            // the crawling army man
    else if (v.pose === 'pose-kneel') { f = 0.59; h = 0.56; }
    else if (v.pose === 'pose-manpads-kneel') { f = 0.29; h = 1.0; }
    const y = v.turret ? v.tyaw : v.g.rotation.y;
    return new THREE.Vector3(v.g.position.x + Math.cos(y) * f, v.g.position.y + h, v.g.position.z - Math.sin(y) * f);
  }

  // ---------------------------------------------------------------- events from the sim
  handle(events, sounds) {
    for (const ev of events) {
      switch (ev.t) {
        case 'spawn': { const e = this.sim.byId.get(ev.id); if (e) this.addEnt(e); break; }
        case 'remove': this.removeEnt(ev.id); break;
        case 'shot': {
          const v = this.ents.get(ev.id); if (!v) break;
          const from = this.muzzleOf(v), to = new THREE.Vector3(this.wx(ev.tx), ev.ty, this.wz(ev.tz));
          v.lastFire = v.fireAt = this.now;
          this.fx.tracer(from, to, ev.kind === 'flak');
          this.fx.muzzle(from, false);
          if (!ev.hit && ev.ty < 1) this.fx.dust(to);
          sounds && sounds.play(ev.kind === 'flak' ? 'flak' : v.e.type === 'mg' || v.e.type === 'mgnest' || v.e.def.vehicle || v.e.def.cls === 'plane' ? 'mg' : 'shot', from);
          break;
        }
        case 'launch': {
          const v = this.ents.get(ev.id); const p = ev.p;
          if (v) { v.lastFire = v.fireAt = this.now; if (p.kind === 'grenade') v.throwUntil = this.now + 550; }
          const from = v ? this.muzzleOf(v) : new THREE.Vector3(this.wx(p.fx), p.fy, this.wz(p.fz));
          const to = new THREE.Vector3(this.wx(p.tx), p.ty, this.wz(p.tz));
          this.fx.projectile(p, from, to);
          if (p.kind !== 'bomb') this.fx.muzzle(from, p.kind !== 'grenade');
          if (p.kind !== 'grenade' && p.kind !== 'bomb') this.fx.puff(from, 0.8, 0xd8d2c4, 0.6, 0.4, 900);
          sounds && sounds.play(p.kind === 'grenade' || p.kind === 'bomb' ? 'throw' : p.kind === 'shell' ? 'cannon' : 'rocket', from);
          break;
        }
        case 'boom': {
          const p = new THREE.Vector3(this.wx(ev.x), ev.y || 0, this.wz(ev.z));
          this.fx.explosion(p, ev.r, ev.kind);
          sounds && sounds.play(ev.r >= 1.5 || ev.kind === 'barrel' ? 'bigboom' : 'boom', p);
          break;
        }
        case 'deploy': this.fx.fadeDecals(0.45); break;
        case 'lay': {
          const p = new THREE.Vector3(this.wx(ev.x), 0.05, this.wz(ev.z));
          if (ev.kind === 'tanktrap' || ev.team === this.human) this.fx.puff(p, 0.6, 0xb8ab90, 0.5, 0.35, 700);
          if (ev.team === this.human || ev.kind === 'tanktrap') sounds && sounds.play('place', p);
          break;
        }
        case 'hit': { const v = this.ents.get(ev.id); if (v) { v.flashUntil = this.now + 70; v.lastHit = v.wobbleAt = this.now; } break; }
        case 'over': for (const v of this.ents.values()) if (v.e.team === ev.winner && !v.e.dead && !v.e.down && v.e.def.cls === 'infantry') v.celebrate = true; break;
        case 'healed': {
          // patched up: the soldier gets back on his feet
          const v = this.ents.get(ev.id); if (!v) break;
          v.downAt = 0; v.pivot.rotation.set(0, 0, 0); v.pivot.position.y = 0; v.poseAt = this.now;
          sounds && sounds.play('place', v.g.position);
          break;
        }
        case 'down': {
          const v = this.ents.get(ev.id); if (!v) break;
          v.downAt = this.now;
          sounds && sounds.play('topple', v.g.position);
          break;
        }
        case 'drop': { const v = this.ents.get(ev.id); if (v) sounds && sounds.play('start', v.g.position); break; }
        case 'death': {
          const v = this.ents.get(ev.id); if (!v) break;
          v.deadAt = this.now + (ev.surrender ? Math.random() * 600 : 0);
          const e = v.e;
          v.deadPos = v.g.position.clone(); v.deadYaw = v.yaw;
          if (isAir(e.def) && e.y > 0.5) {
            // falls out of the sky; the crash is handled in the animation
          } else if (e.def.vehicle) {
            this.fx.explosion(v.g.position.clone(), 1.4, 'vehicle');
            this.fx.smokeColumn(() => (this.ents.has(e.id) ? v.g.position : null), 9);
            sounds && sounds.play('bigboom', v.g.position);
          } else if (e.def.cls === 'emplacement' || e.def.cls === 'hq') {
            for (let i = 0; i < 6; i++) this.fx.debris(v.g.position, e.def.cls === 'hq' ? 2 : 1, 0x6f6a5f);
            this.fx.smokeColumn(() => (this.ents.has(e.id) ? v.g.position : null), e.def.cls === 'hq' ? 20 : 7);
            if (e.def.cls === 'hq') this.fx.explosion(v.g.position.clone(), 2.5, 'hq');
          } else if (e.def.cls === 'fort' && !e.def.explodes) {
            for (let i = 0; i < 4; i++) this.fx.debris(v.g.position, 0.6, 0x7a7466);
            this.fx.puff(v.g.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 1.2, 0xbdb4a0, 0.6, 0.5, 1000);
          }
          if (e.def.cls === 'infantry' && !ev.wasDown) sounds && sounds.play('topple', v.g.position);
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  render(alpha, dtMs) {
    const now = this.now = performance.now();
    const dt = Math.min(0.1, dtMs / 1000);
    this.keyboardPan(dt);
    this.controls.update();
    if (this.sim) {
      this.updateSun();
      const deploy = this.sim.phase === 'deploy';
      this.zones.visible = deploy;
      this.batches.begin();
      for (const v of this.ents.values()) this.updateEnt(v, alpha, now, dt, deploy);
      this.emitMines();
      this.batches.end();
      this.fx.update(now);
    }
    // camera shake from explosions
    const sh = this.fx ? this.fx.shake : 0;
    const off = new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    this.camera.position.add(off);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.camera.position.sub(off);
    this.drawOverlay();
  }

  hidden(e, deploy) {
    return e.loaded || (deploy && e.team !== this.human && e.placedRound === this.sim.round);
  }

  updateEnt(v, alpha, now, dt, deploy) {
    const e = v.e, g = v.g, def = e.def;
    v.visible = !this.hidden(e, deploy);
    if (!v.visible) return;
    const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha;
    const y = e.py + (e.y - e.py) * alpha;
    g.position.set(this.wx(x), 0, this.wz(z));
    const air = isAir(def);
    let dyaw = 0;
    const turnTo = (cur, rate) => {
      let d = Math.atan2(-e.dirZ, e.dirX) - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      return d * (1 - Math.exp(-dt * rate));
    };
    const alive = !(e.dead && v.deadAt) && !(e.down && e.carrier === 0 && v.downAt);
    if (!def.static && alive) {
      const step = turnTo(v.yaw, def.cls === 'plane' ? 8 : def.vehicle ? 5 : 12);
      v.yaw += step; dyaw = dt > 0 ? step / dt : 0;
      g.rotation.y = v.yaw;
    } else if (v.turret && alive) {
      // the base stays put; only the gun and its crew traverse
      v.tyaw += turnTo(v.tyaw, 4);
      v.turret.rotation.y = v.tyaw - v.yaw;
    } else if (e.type === 'fieldgun' && alive) {
      // a towed gun is swung round by its crew, slowly
      v.yaw += turnTo(v.yaw, 1.5); g.rotation.y = v.yaw;
    }
    const moved = Math.hypot(x - v.lastX, z - v.lastZ);
    v.lastX = x; v.lastZ = z;
    let variant = 'normal';
    if (air && !e.dead) {
      g.position.y = def.cls === 'air' ? y + Math.sin(now * 0.002 + e.id) * 0.12 : y;
      if (def.cls === 'plane') {
        // bank into turns, nose up while climbing
        v.roll += (Math.max(-0.9, Math.min(0.9, -dyaw * 0.45)) - v.roll) * Math.min(1, dt * 4);
        v.pivot.rotation.set(v.roll, 0, y < def.alt - 0.3 && e.moving ? 0.12 : 0);
      } else {
        v.rotor.rotation.y += dt * 28; v.tail.rotation.z += dt * 40;
        v.pivot.rotation.z = e.moving ? -0.12 : 0;
      }
    } else if (def.cls === 'infantry' && !e.dead && !e.down) {
      if (e.falling) g.position.y = y;
      // plastic soldiers "hop" along as if a kid is moving them
      else g.position.y = e.moving && this.sim.phase === 'battle' ? Math.abs(Math.sin(now * 0.016 + e.id)) * 0.14 : 0;
    }
    if (def.vehicle && !air && !e.dead && moved > 0) {
      v.trackAcc += moved;
      if (v.trackAcc > 0.22) {
        v.trackAcc = 0;
        this.fx.track(g.position.x, g.position.z, Math.cos(v.yaw), -Math.sin(v.yaw), e.type === 'tank' ? 0.62 : 0.5, e.type === 'tank');
      }
    }
    // toy-style animation
    if (def.cls === 'infantry' && !e.dead && !e.down && !e.falling) {
      const pose = poseFor(v, now, this.sim.phase === 'battle');
      const name = (this.living ? 'living:' : '') + pose;
      if (pose !== v.pose || name !== v.key) { v.pose = pose; v.poseAt = now; v.key = name; v.m = model(name); }
      if (this.living) {
        // walking legs: the stride follows the distance actually covered, so feet don't slide
        const walking = e.moving && this.sim.phase === 'battle' && v.m.legs;
        if (walking) { v.walk += moved * 7.5; v.swing = Math.sin(v.walk) * 0.6; }
        else v.swing *= Math.exp(-dt * 10);
        g.position.y = walking ? Math.abs(Math.sin(v.walk)) * 0.035 : 0;
      } else {
        const hk = (now - v.poseAt) / 180;
        if (hk < 1) g.position.y += Math.sin(hk * Math.PI) * 0.15;
      }
      if (v.celebrate) g.position.y = Math.abs(Math.sin(now * 0.011 + e.id * 1.7)) * 0.45;
    }
    if (!e.dead && !e.down) {
      const fwdX = Math.cos(v.yaw), fwdZ = -Math.sin(v.yaw);
      const rk = (now - v.fireAt) / (def.vehicle || def.static ? 260 : 120);
      if (rk < 1) {
        const kick = (1 - rk) * (e.type === 'tank' || e.type === 'fieldgun' ? 0.18 : def.vehicle || def.static ? 0.06 : 0.07);
        if (!def.static || e.type === 'fieldgun') { g.position.x -= fwdX * kick; g.position.z -= fwdZ * kick; }
        if (e.type === 'tank') v.pivot.rotation.z = kick * 0.6;
      } else if (e.type === 'tank') v.pivot.rotation.z = 0;
      const wk = (now - v.wobbleAt) / 380;
      if (def.cls === 'infantry' && wk < 1) v.pivot.rotation.x = Math.sin(wk * 22) * 0.22 * (1 - wk);
      else if (def.cls === 'infantry') v.pivot.rotation.x = 0;
    }
    if (!e.dead && v.flashUntil > now) variant = 'flash';
    // wounded soldiers lie on the ground (and get dragged along)
    if (e.down && !e.dead) {
      const k = Math.min(1, (now - v.downAt) / 450), ease = 1 - (1 - k) ** 3;
      v.pivot.rotation.set(0, 0, ease * Math.PI / 2 * v.fallSide * 0.98);
      v.pivot.position.y = Math.sin(ease * Math.PI) * 0.12;
      if (e.carrier) { v.pivot.rotation.set(0, 0, -Math.PI / 2 * 0.98); g.rotation.y = v.yaw = Math.atan2(-e.dirZ, e.dirX); }
    }
    // death animations
    if (e.dead && v.deadAt && now >= v.deadAt) {
      const k = Math.min(1, (now - v.deadAt) / 500), ease = 1 - (1 - k) ** 3;
      if (def.cls === 'infantry') {
        if (!v.downAt) { v.pivot.rotation.z = ease * Math.PI / 2 * v.fallSide * 0.98; v.pivot.position.y = Math.sin(ease * Math.PI) * 0.15; }
        g.position.y = 0;
        variant = 'dead';
      } else if (air && v.deadPos && v.deadPos.y > 0.5) {
        // shot down: spin and fall, then burn on the ground
        const kk = Math.min(1, (now - v.deadAt) / (def.cls === 'plane' ? 1300 : 900));
        const fwd = def.cls === 'plane' ? 5 * kk : 0;
        g.position.set(v.deadPos.x + Math.cos(v.deadYaw) * fwd, Math.max(0.15, v.deadPos.y * (1 - kk * kk)), v.deadPos.z - Math.sin(v.deadYaw) * fwd);
        g.rotation.y = v.deadYaw;
        if (def.cls === 'plane') v.pivot.rotation.set(kk * 5, 0, -kk * 0.6); else { v.pivot.rotation.y += dt * 6 * (1 - kk); v.pivot.rotation.z = kk * 0.5; }
        if (kk >= 1 && !v.crashed) {
          v.crashed = true;
          this.fx.explosion(g.position.clone().setY(0), 1.6, 'crash');
          this.fx.smokeColumn(() => (this.ents.has(e.id) ? g.position : null), 8);
        }
        if (kk < 1 && Math.random() < 0.5) this.fx.puff(g.position.clone(), 0.5, 0x3d3a36, 0.6, 0.3, 900);
        variant = 'burnt';
      } else if (def.vehicle || air) {
        v.pivot.rotation.x = ease * 0.12 * v.fallSide;
        g.position.y = 0;
        variant = 'burnt';
      } else {
        v.pivot.scale.y = 1 - ease * (def.cls === 'fort' && def.wire ? 0.85 : 0.6);
        variant = def.cls === 'fort' ? 'dead' : 'burnt';
      }
    }
    // paratrooper canopy: open while falling, then collapses after landing
    if (v.chute) {
      if (e.falling) { v.chuteT = 1; v.chute.scale.setScalar(1); }
      else if (v.chuteT > 0) { v.chuteT -= dt * 2; v.chute.scale.set(Math.max(0.01, v.chuteT), Math.max(0.01, v.chuteT * v.chuteT), Math.max(0.01, v.chuteT)); }
    }
    this.emit(v, variant);
  }

  // our own mines, half dug in (the enemy's stay hidden until they go off)
  emitMines() {
    for (const mn of this.sim.mines) {
      if (this.human != null && this.human >= 0 && mn.team !== this.human) continue;
      const m = model('mine_' + mn.kind), p = this.palettes[mn.team];
      this.tmpM.makeRotationY(mn.id * 1.7).setPosition(this.wx(mn.x), -0.02, this.wz(mn.z));
      this.batches.push(this.batches.get('mine_' + mn.kind + ':m', m.main, this.plasticMat), this.tmpM, p.main, 0);
      this.batches.push(this.batches.get('mine_' + mn.kind + ':d', m.dark, this.plasticMat), this.tmpM, p.dark, 0);
    }
  }
  // the engineers' two sappers: riding in the back of the truck, or kneeling in front of it at work
  emitCrew(v, pm, color) {
    const e = v.e, work = e.working && !e.dead;
    const f = model(work ? 'pose-kneel' : 'rifleman');
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      if (work) {
        // they take turns walking out to the line and back
        const t = ((this.now * 0.0009 + i * 0.5) % 1), reach = 1.0 + Math.sin(t * Math.PI) * 0.9;
        this.legM.makeRotationY(s * 0.4).scale(CREW_SCALE).setPosition(reach, 0, s * (0.5 + i * 0.2));
      } else this.legM.makeRotationY(0).scale(CREW_SCALE).setPosition(-0.45 - i * 0.28, 0.56, s * 0.2);
      this.tmpM.multiplyMatrices(pm, this.legM);
      this.batches.push(this.batches.get((work ? 'pose-kneel' : 'rifleman') + ':m', f.main, this.plasticMat), this.tmpM, color, e.id);
    }
  }

  // push this entity's parts into the instanced batches
  emit(v, variant) {
    const p = v.pal, m = v.m;
    v.g.updateMatrixWorld(true);
    const pm = v.pivot.matrixWorld;
    const mainC = variant === 'flash' ? p.flash : variant === 'dead' ? p.deadMain : variant === 'burnt' ? p.burntMain : p.main;
    const darkC = variant === 'flash' ? p.flash : variant === 'dead' ? p.deadDark : variant === 'burnt' ? p.burntDark : p.dark;
    const accC = variant === 'dead' ? p.deadAccent : variant === 'burnt' ? p.burntAccent : WHITE;
    const id = v.e.id;
    // distant (or low-quality) figures use their light version
    const far = m.far && (this.quality === 'low' || this.camera.position.distanceToSquared(v.g.position) > 30 * 30);
    this.batches.push(far ? this.batches.get(v.key + ':fm', m.far.main, this.plasticMat) : this.batches.get(v.key + ':m', m.main, this.plasticMat), pm, mainC, id);
    if (m.dark) this.batches.push(far && m.far.dark ? this.batches.get(v.key + ':fd', m.far.dark, this.plasticMat) : this.batches.get(v.key + ':d', m.dark, this.plasticMat), pm, darkC, id);
    if (m.accent) this.batches.push(this.batches.get(v.key + ':a', m.accent, this.accentMat), pm, accC, id);
    if (m.legs) {
      for (let i = 0; i < m.legs.length; i++) {
        const L = m.legs[i];
        this.legM.makeRotationZ(i ? -v.swing : v.swing).setPosition(L.hip[0], L.hip[1], L.hip[2]);
        this.tmpM.multiplyMatrices(pm, this.legM);
        this.batches.push(this.batches.get(v.key + ':L' + i, L.geo, this.plasticMat), this.tmpM, mainC, id);
      }
    }
    if (v.turret) {
      const tm = v.turret.matrixWorld;
      this.batches.push(this.batches.get(v.key + ':tm', m.turret.main, this.plasticMat), tm, mainC, id);
      if (m.turret.dark) this.batches.push(this.batches.get(v.key + ':td', m.turret.dark, this.plasticMat), tm, darkC, id);
    }
    if (v.e.def.engineer && !v.e.dead) this.emitCrew(v, pm, mainC);
    if (v.rotor && !v.e.dead) {
      this.batches.push(this.batches.get(v.key + ':r', m.rotor, this.plasticMat), v.rotor.matrixWorld, darkC, id);
      this.batches.push(this.batches.get(v.key + ':t', m.tailRotor, this.plasticMat), v.tail.matrixWorld, darkC, id);
    }
    if (v.chute && v.chuteT > 0) {
      const c = model('chute');
      this.batches.push(this.batches.get('chute:m', c.main, this.plasticMat), v.chute.matrixWorld, WHITE, id);
      this.batches.push(this.batches.get('chute:d', c.dark, this.plasticMat), v.chute.matrixWorld, darkC, id);
    }
  }

  drawOverlay() {
    const c = this.octx, w = this.stage.clientWidth, h = this.stage.clientHeight;
    c.clearRect(0, 0, w, h);
    if (!this.sim) return;
    const p = new THREE.Vector3();
    for (const v of this.ents.values()) {
      const e = v.e;
      if (e.dead || !v.visible) continue;
      const hq = e.def.cls === 'hq';
      if (e.down) {
        // wounded marker: red cross with a bleeding-out ring (green once safe)
        p.set(v.g.position.x, 0.8, v.g.position.z).project(this.camera);
        if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) continue;
        const medic = e.medicBy ? this.sim.byId.get(e.medicBy) : null;
        const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h, safe = e.stable || e.carrier || (medic && medic.healing);
        c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(sx, sy, 7, 0, 7); c.fill();
        c.fillStyle = safe ? '#3a9a4a' : '#d63a2f'; c.fillRect(sx - 4.5, sy - 1.5, 9, 3); c.fillRect(sx - 1.5, sy - 4.5, 3, 9);
        if (!safe) { c.strokeStyle = '#d63a2f'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, e.bleed) / 18); c.stroke(); }
        continue;
      }
      if (!hq && e.hp >= e.maxHp) continue;
      p.set(v.g.position.x, v.g.position.y + (HEIGHT[e.type] || 1.25) + 0.25, v.g.position.z).project(this.camera);
      if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) continue;
      const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h;
      const bw = hq ? 60 : e.def.vehicle || e.def.static || e.def.aircraft ? 30 : 18, bh = hq ? 6 : 4;
      const f = Math.max(0, e.hp / e.maxHp);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(sx - bw / 2 - 1, sy - 1, bw + 2, bh + 2);
      c.fillStyle = f > 0.5 ? '#8fe05a' : f > 0.25 ? '#f0c13a' : '#f05a3a';
      c.fillRect(sx - bw / 2, sy, bw * f, bh);
      if (hq) {
        const t = this.sim.teams[e.team];
        c.font = '600 12px Rubik, system-ui, sans-serif'; c.textAlign = 'center';
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(t.name, sx + 1, sy - 5);
        c.fillStyle = '#fff'; c.fillText(t.name, sx, sy - 6);
      }
    }
  }

  // ---------------------------------------------------------------- minimap
  buildMinimapBase() {
    const map = this.map, S = 4, c = document.createElement('canvas');
    c.width = map.W * S; c.height = map.H * S;
    const g = c.getContext('2d');
    g.fillStyle = FLOOR[map.theme].base; g.fillRect(0, 0, c.width, c.height);
    if (this.groundPicture) g.drawImage(this.groundPicture, 0, 0, c.width, c.height);
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      const t = map.grid[y * map.W + x];
      if (!t) continue;
      g.fillStyle = t === 4 ? 'rgba(0,0,0,.55)' : t === 2 ? '#4f8fc0' : t === 1 ? 'rgba(60,45,30,.75)' : t === 5 ? 'rgba(150,95,55,.6)' : 'rgba(60,45,30,.45)';
      g.fillRect(x * S, y * S, S, S);
    }
    this.miniBase = c;
  }
  drawMinimap(ctx, w, h) {
    if (!this.sim || !this.miniBase) return;
    // keep the map's proportions (a round table stays round), centred in the panel
    const map = this.map, sc = Math.min(w / map.W, h / map.H), sx = sc, sz = sc;
    const ox = (w - map.W * sc) / 2, oy = (h - map.H * sc) / 2;
    this.miniFit = { sc, ox, oy };
    ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.translate(ox, oy);
    ctx.drawImage(this.miniBase, 0, 0, map.W * sc, map.H * sc);
    if (this.sim.phase === 'deploy') for (const t of this.sim.teams) {
      ctx.strokeStyle = TEAM_COLORS[t.color].main; ctx.lineWidth = 1;
      ctx.strokeRect(t.zone.x * sx + 0.5, t.zone.y * sz + 0.5, t.zone.w * sx - 1, t.zone.h * sz - 1);
    }
    for (const v of this.ents.values()) {
      const e = v.e;
      if (!v.visible || e.dead) continue;
      ctx.fillStyle = e.down ? '#ffffff' : TEAM_COLORS[this.sim.teams[e.team].color].main;
      if (e.def.static) ctx.fillRect(e.cx * sx, e.cy * sz, Math.max(2, e.w * sx), Math.max(2, e.h * sz));
      else {
        const r = e.def.aircraft ? 3 : e.def.vehicle ? 2.2 : 1.5;
        ctx.beginPath(); ctx.arc(e.x * sx, e.z * sz, r, 0, 7); ctx.fill();
        if (e.def.aircraft) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
      }
    }
    // camera footprint
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([nx, ny]) => {
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
      return [(p.x + map.W / 2) * sx, (p.z + map.H / 2) * sz];
    });
    if (pts.every(Boolean)) {
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }

  keyboardPan(dt) {
    const k = this.keys; if (!k.size) return;
    const c = this.controls, cam = this.camera;
    const fwd = new THREE.Vector3().subVectors(c.target, cam.position); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const speed = cam.position.distanceTo(c.target) * 0.9 * dt;
    const mv = new THREE.Vector3();
    if (k.has('w') || k.has('arrowup')) mv.add(fwd);
    if (k.has('s') || k.has('arrowdown')) mv.sub(fwd);
    if (k.has('d') || k.has('arrowright')) mv.add(right);
    if (k.has('a') || k.has('arrowleft')) mv.sub(right);
    if (mv.lengthSq()) { mv.normalize().multiplyScalar(speed); c.target.add(mv); cam.position.add(mv); }
    const rot = (k.has('q') ? 1 : 0) - (k.has('e') ? 1 : 0);
    if (rot) {
      const off = cam.position.clone().sub(c.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * dt * 1.5);
      cam.position.copy(c.target).add(off);
    }
  }

  // ---------------------------------------------------------------- picking & placement preview
  ndc(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }
  groundAt(clientX, clientY) {
    const ray = new THREE.Raycaster(); ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    return { x: p.x + this.map.W / 2, z: p.z + this.map.H / 2 };
  }
  entityAt(clientX, clientY, filter) {
    const ray = new THREE.Raycaster(); ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const meshes = [];
    for (const b of this.batches.list.values()) if (b.n) { b.mesh.computeBoundingSphere(); meshes.push(b.mesh); }
    for (const hit of ray.intersectObjects(meshes, false)) {
      const id = hit.object.userData.batch.ids[hit.instanceId];
      const e = this.sim.byId.get(id);
      if (e && (!filter || filter(e))) return id;
    }
    return 0;
  }
  setGhost(type, teamId, cx, cy, rot, valid) {
    if (!type) { if (this.ghost) this.ghost.g.visible = false; return; }
    if (!this.ghost || this.ghost.type !== type) {
      if (this.ghost) this.world.remove(this.ghost.g);
      const m = model(type, 1), g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x9fe06a, transparent: true, opacity: 0.55, depthWrite: false });
      g.add(new THREE.Mesh(m.main, mat)); if (m.dark) g.add(new THREE.Mesh(m.dark, mat)); if (m.accent) g.add(new THREE.Mesh(m.accent, mat));
      if (m.turret) { g.add(new THREE.Mesh(m.turret.main, mat)); if (m.turret.dark) g.add(new THREE.Mesh(m.turret.dark, mat)); }
      g.traverse(o => { o.userData.shared = true; });
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x9fe06a, transparent: true, opacity: 0.35, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03;
      this.world.add(g); this.world.add(pad);
      if (this.ghost) this.world.remove(this.ghost.pad);
      this.ghost = { type, g, pad, mat };
    }
    const def = CATALOG[type];
    const [w, h] = rot & 1 ? [def.size[1], def.size[0]] : def.size;
    const gh = this.ghost;
    gh.g.visible = gh.pad.visible = true;
    const col = valid ? 0x9fe06a : 0xf0503a;
    gh.mat.color.setHex(col); gh.pad.material.color.setHex(col);
    gh.g.position.set(this.wx(cx + w / 2), def.cls === 'air' ? def.alt : 0, this.wz(cy + h / 2));
    gh.pad.position.set(gh.g.position.x, 0.03, gh.g.position.z); gh.pad.scale.set(w, h, 1);
    if (def.static && def.cls === 'fort') gh.g.rotation.y = rot & 1 ? Math.PI / 2 : 0;
    else {
      const z = this.sim.teams[teamId].zone;
      gh.g.rotation.y = Math.atan2(-(this.map.H / 2 - (z.y + z.h / 2)), this.map.W / 2 - (z.x + z.w / 2));
    }
  }
  hideGhost() { if (this.ghost) { this.ghost.g.visible = false; this.ghost.pad.visible = false; } }
}

// Small renders of each catalogue item for the build palette.
export function renderThumbnails(types, color) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(160, 120); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.6;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x886f4f, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-3, 5, 4); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 160 / 120, 0.1, 100);
  const out = {};
  const col = TEAM_COLORS.find(c => c.id === color) || TEAM_COLORS[0];
  for (const type of types) {
    const m = model(type, 1), g = new THREE.Group();
    g.add(new THREE.Mesh(m.main, plastic(col.main)));
    if (m.dark) g.add(new THREE.Mesh(m.dark, plastic(col.dark, 'dark')));
    if (m.accent) g.add(new THREE.Mesh(m.accent, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 })));
    if (m.turret) { g.add(new THREE.Mesh(m.turret.main, plastic(col.main))); if (m.turret.dark) g.add(new THREE.Mesh(m.turret.dark, plastic(col.dark, 'dark'))); }
    if (m.rotor) { const ro = new THREE.Mesh(m.rotor, plastic(col.dark, 'dark')); ro.position.set(0.3, 0.7, 0); g.add(ro); }
    g.rotation.y = -0.6;
    scene.add(g);
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
    cam.position.set(c.x + s * 0.55, c.y + s * 0.6, c.z + s * 0.95); cam.lookAt(c);
    r.render(scene, cam);
    out[type] = r.domElement.toDataURL('image/png');
    scene.remove(g);
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
