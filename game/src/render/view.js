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
import { model, plastic } from './models.js';
import { buildTerrain, floorTexture, FLOOR, buildTape } from './terrain.js';
import { Fx } from './fx.js';
import { CATALOG, TEAM_COLORS } from '../data/catalog.js';

// where each piece's gun is, in its own space (forward = +x)
const MUZZLE = {
  rifleman: [0.55, 0.78], officer: [0.4, 0.9], grenadier: [-0.2, 1.1], bazooka: [0.5, 0.78], sniper: [0.8, 0.27], mg: [0.62, 0.3],
  jeep: [0.3, 1.1], apc: [0.78, 1.08], amphib: [0.12, 1.6], tank: [2.05, 1.05], rockets: [0.2, 1.8], heli: [0.8, -0.25],
  mgnest: [1.0, 0.62], fieldgun: [1.85, 1.1], aa: [0.95, 1.75], tower: [0.6, 2.95], hq: [1.9, 1.75],
};
const HEIGHT = { mg: 0.45, sniper: 0.45, tank: 1.5, jeep: 1.3, apc: 1.3, amphib: 1.7, rockets: 1.9, heli: 1.0, mgnest: 1.1, fieldgun: 1.3, aa: 1.9, tower: 3.3, hq: 4.4, wall: 1.7, sandbags: 0.7, wire: 0.7, barrel: 1.0 };

export class View {
  constructor(stage, overlay) {
    this.stage = stage; this.overlay = overlay; this.octx = overlay.getContext('2d');
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    stage.prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1.6, 0.5, 400);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.09;
    c.minPolarAngle = 0.15; c.maxPolarAngle = 1.2; c.minDistance = 8; c.maxDistance = 140;
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
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.ents = new Map();
    this.quality = 'medium';
    this.ghost = null;
    this.now = performance.now();
    this.keys = new Set();
    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
    window.addEventListener('keydown', e => { if (!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

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
  wx(x) { return x - this.map.W / 2; }
  wz(z) { return z - this.map.H / 2; }

  load(sim, human) {
    this.sim = sim; this.map = sim.map; this.human = human;
    if (this.ghost) { this.world.remove(this.ghost.g); this.world.remove(this.ghost.pad); this.ghost = null; }
    for (const v of this.ents.values()) this.world.remove(v.g);
    this.ents.clear();
    this.world.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    this.world.clear();
    if (this.fx) { this.fx.clear(); this.scene.remove(this.fx.group); this.fx.decalTex.dispose(); }
    const map = this.map, st = FLOOR[map.theme];
    this.scene.background = new THREE.Color(st.bg);
    this.scene.fog = new THREE.Fog(st.bg, 90, 220);
    this.hemi.color.set(st.sky); this.hemi.groundColor.set(st.ground);
    this.sun.color.set(st.sunColor);
    const span = Math.max(map.W, map.H);
    const dir = new THREE.Vector3(...st.sun).normalize();
    this.sun.position.copy(dir.multiplyScalar(span * 1.2)); this.sun.target.position.set(0, 0, 0);
    const sc = this.sun.shadow.camera;
    sc.left = -span * 0.75; sc.right = span * 0.75; sc.top = span * 0.75; sc.bottom = -span * 0.75; sc.near = 1; sc.far = span * 3;
    sc.updateProjectionMatrix();

    const tex = floorTexture(map.theme, map.seed);
    const FS = map.W + 160, FD = map.H + 160;
    tex.repeat.set(FS / 8, FD / 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FS, FD), new THREE.MeshStandardMaterial({ map: tex, roughness: map.theme === 'kitchen' ? 0.35 : 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.world.add(floor);
    this.world.add(buildTerrain(map));
    this.world.add(buildTape(map));
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
    this.focusZone(human);
  }

  focusZone(teamId) {
    const z = this.sim.teams[teamId].zone, map = this.map;
    const zx = this.wx(z.x + z.w / 2), zz = this.wz(z.y + z.h / 2);
    // frame our own zone plus the middle of the map, looking from behind our lines
    const tx = zx * 0.55, tz = zz * 0.55;
    let dx = -zx, dz = -zz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const dist = Math.max(map.W, map.H) * 1.1;
    this.controls.target.set(tx, 0, tz);
    this.camera.position.set(tx - dx * dist * 0.62 + dz * dist * 0.18, dist * 0.8, tz - dz * dist * 0.62 - dx * dist * 0.18);
    this.controls.update();
  }

  // ---------------------------------------------------------------- entities
  addEnt(e) {
    if (this.ents.has(e.id)) return;
    const team = this.sim.teams[e.team], col = TEAM_COLORS[team.color];
    const m = model(e.type, e.id);
    const g = new THREE.Group(), pivot = new THREE.Group(); g.add(pivot);
    const main = new THREE.Mesh(m.main, plastic(col.main)); main.castShadow = true; main.receiveShadow = true; main.userData = { id: e.id, shared: true };
    pivot.add(main);
    let dark = null;
    if (m.dark) { dark = new THREE.Mesh(m.dark, plastic(col.dark, 'dark')); dark.castShadow = true; dark.receiveShadow = true; dark.userData = { id: e.id, shared: true }; pivot.add(dark); }
    let rotor = null, tail = null;
    if (m.rotor) {
      rotor = new THREE.Mesh(m.rotor, plastic(col.dark, 'dark')); rotor.position.set(0.3, 0.7, 0); rotor.castShadow = true; rotor.userData.shared = true; pivot.add(rotor);
      tail = new THREE.Mesh(m.tailRotor, plastic(col.dark, 'dark')); tail.position.set(-1.85, 0.45, 0.06); tail.userData.shared = true; pivot.add(tail);
    }
    const yaw = Math.atan2(-e.dirZ, e.dirX);
    const v = { e, g, pivot, main, dark, rotor, tail, yaw, col, deadAt: 0, flashUntil: 0, trackAcc: 0, lastX: e.x, lastZ: e.z, fallSide: e.id % 2 ? 1 : -1, burnt: false };
    if (e.def.static && e.def.cls === 'fort') g.rotation.y = e.rot & 1 ? Math.PI / 2 : 0;
    else g.rotation.y = yaw;
    g.position.set(this.wx(e.x), e.y, this.wz(e.z));
    this.world.add(g);
    this.ents.set(e.id, v);
    if (e.dead) { v.deadAt = this.now - 5000; this.applyDeadLook(v); }
    return v;
  }
  removeEnt(id) {
    const v = this.ents.get(id);
    if (!v) return;
    this.world.remove(v.g);
    this.ents.delete(id);
  }
  setMat(v, variant) {
    if (v.variant === variant) return;
    v.variant = variant;
    v.main.material = plastic(v.col.main, variant === 'normal' ? 'main' : variant);
    if (v.dark) v.dark.material = plastic(v.col.dark, variant === 'normal' ? 'dark' : variant);
  }
  applyDeadLook(v) {
    const vehicle = v.e.def.vehicle || v.e.def.cls === 'hq' || v.e.def.cls === 'emplacement';
    this.setMat(v, vehicle ? 'burnt' : 'dead');
  }

  muzzleOf(v) {
    const [f, h] = MUZZLE[v.e.type] || [0.4, 0.7];
    const y = v.g.rotation.y;
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
          this.fx.tracer(from, to, ev.kind === 'flak');
          this.fx.muzzle(from, false);
          if (!ev.hit && ev.ty < 1) this.fx.dust(to);
          sounds && sounds.play(ev.kind === 'flak' ? 'flak' : v.e.type === 'mg' || v.e.type === 'mgnest' || v.e.def.vehicle ? 'mg' : 'shot', from);
          break;
        }
        case 'launch': {
          const v = this.ents.get(ev.id); const p = ev.p;
          const from = v ? this.muzzleOf(v) : new THREE.Vector3(this.wx(p.fx), 0.8, this.wz(p.fz));
          const to = new THREE.Vector3(this.wx(p.tx), p.ty, this.wz(p.tz));
          this.fx.projectile(p, from, to);
          this.fx.muzzle(from, p.kind !== 'grenade');
          if (p.kind !== 'grenade') this.fx.puff(from, 0.8, 0xd8d2c4, 0.6, 0.4, 900);
          sounds && sounds.play(p.kind === 'grenade' ? 'throw' : p.kind === 'shell' ? 'cannon' : 'rocket', from);
          break;
        }
        case 'boom': {
          const p = new THREE.Vector3(this.wx(ev.x), 0, this.wz(ev.z));
          this.fx.explosion(p, ev.r, ev.kind);
          sounds && sounds.play(ev.r >= 1.5 || ev.kind === 'barrel' ? 'bigboom' : 'boom', p);
          break;
        }
        case 'deploy': this.fx.fadeDecals(0.45); break;
        case 'hit': { const v = this.ents.get(ev.id); if (v) v.flashUntil = this.now + 70; break; }
        case 'death': {
          const v = this.ents.get(ev.id); if (!v) break;
          v.deadAt = this.now + (ev.surrender ? Math.random() * 600 : 0);
          const e = v.e;
          if (e.def.vehicle && e.def.cls !== 'air') {
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
          if (e.def.cls === 'infantry') sounds && sounds.play('topple', v.g.position);
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
      const deploy = this.sim.phase === 'deploy';
      this.zones.visible = deploy;
      for (const v of this.ents.values()) this.updateEnt(v, alpha, now, dt, deploy);
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

  updateEnt(v, alpha, now, dt, deploy) {
    const e = v.e, g = v.g;
    g.visible = !(deploy && e.team !== this.human && e.placedRound === this.sim.round);
    if (!g.visible) return;
    const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha;
    g.position.x = this.wx(x); g.position.z = this.wz(z);
    const def = e.def;
    if (!def.static || def.cls !== 'fort') {
      if (!e.dead || !v.deadAt) {
        const target = Math.atan2(-e.dirZ, e.dirX);
        let d = target - v.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += d * (1 - Math.exp(-dt * (def.vehicle ? 5 : 12)));
        g.rotation.y = v.yaw;
      }
    }
    const moved = Math.hypot(x - v.lastX, z - v.lastZ);
    v.lastX = x; v.lastZ = z;
    if (def.cls === 'air') {
      if (!e.dead) {
        g.position.y = e.y + Math.sin(now * 0.002 + e.id) * 0.12;
        v.rotor.rotation.y += dt * 28; v.tail.rotation.z += dt * 40;
        v.pivot.rotation.z = e.moving ? -0.12 : 0;
      }
    } else if (def.cls === 'infantry' && !e.dead) {
      // plastic soldiers "hop" along as if a kid is moving them
      g.position.y = e.moving && this.sim.phase === 'battle' ? Math.abs(Math.sin(now * 0.016 + e.id)) * 0.14 : 0;
    }
    if (def.vehicle && def.cls !== 'air' && !e.dead && moved > 0) {
      v.trackAcc += moved;
      if (v.trackAcc > 0.22) {
        v.trackAcc = 0;
        this.fx.track(g.position.x, g.position.z, Math.cos(v.yaw), -Math.sin(v.yaw), e.type === 'tank' ? 0.62 : 0.5, e.type === 'tank');
      }
    }
    // hit flash
    if (!e.dead) this.setMat(v, v.flashUntil > now ? 'flash' : 'normal');
    // death animations
    if (e.dead && v.deadAt && now >= v.deadAt) {
      const k = Math.min(1, (now - v.deadAt) / 500), ease = 1 - (1 - k) ** 3;
      if (def.cls === 'infantry') {
        v.pivot.rotation.z = ease * Math.PI / 2 * v.fallSide * 0.98;
        v.pivot.position.y = Math.sin(ease * Math.PI) * 0.15;
        this.setMat(v, 'dead');
      } else if (def.cls === 'air') {
        const kk = Math.min(1, (now - v.deadAt) / 900);
        g.position.y = e.y * (1 - kk * kk);
        v.pivot.rotation.y += dt * 6 * (1 - kk);
        v.pivot.rotation.z = kk * 0.5;
        if (kk >= 1 && !v.crashed) { v.crashed = true; this.fx.explosion(g.position.clone(), 1.5, 'heli'); this.fx.smokeColumn(() => (this.ents.has(e.id) ? g.position : null), 8); }
        this.setMat(v, 'burnt');
      } else if (def.vehicle) {
        v.pivot.rotation.x = ease * 0.12 * v.fallSide;
        this.setMat(v, 'burnt');
      } else {
        v.pivot.scale.y = 1 - ease * (def.cls === 'fort' && def.wire ? 0.85 : 0.6);
        this.setMat(v, def.cls === 'fort' ? 'dead' : 'burnt');
      }
    }
  }

  drawOverlay() {
    const c = this.octx, w = this.stage.clientWidth, h = this.stage.clientHeight;
    c.clearRect(0, 0, w, h);
    if (!this.sim) return;
    const p = new THREE.Vector3();
    for (const v of this.ents.values()) {
      const e = v.e;
      if (e.dead || !v.g.visible) continue;
      const hq = e.def.cls === 'hq';
      if (!hq && e.hp >= e.maxHp) continue;
      p.set(v.g.position.x, v.g.position.y + (HEIGHT[e.type] || 1.25) + 0.25, v.g.position.z).project(this.camera);
      if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) continue;
      const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h;
      const bw = hq ? 60 : e.def.vehicle || e.def.static ? 30 : 18, bh = hq ? 6 : 4;
      const f = Math.max(0, e.hp / e.maxHp);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(sx - bw / 2 - 1, sy - 1, bw + 2, bh + 2);
      c.fillStyle = f > 0.5 ? '#8fe05a' : f > 0.25 ? '#f0c13a' : '#f05a3a';
      c.fillRect(sx - bw / 2, sy, bw * f, bh);
      if (hq) {
        const t = this.sim.teams[e.team];
        c.font = '600 12px Rubik, system-ui, sans-serif'; c.textAlign = 'center';
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(t.name, sx + 1, sy - 5);
        c.fillStyle = TEAM_COLORS[t.color].main; c.fillStyle = '#fff'; c.fillText(t.name, sx, sy - 6);
      }
    }
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
    for (const v of this.ents.values()) if (v.g.visible && (!filter || filter(v.e))) meshes.push(v.main);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.id : 0;
  }
  setGhost(type, teamId, cx, cy, rot, valid) {
    if (!type) { if (this.ghost) this.ghost.g.visible = false; return; }
    if (!this.ghost || this.ghost.type !== type) {
      if (this.ghost) this.world.remove(this.ghost.g);
      const m = model(type, 1), g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x9fe06a, transparent: true, opacity: 0.55, depthWrite: false });
      g.add(new THREE.Mesh(m.main, mat)); if (m.dark) g.add(new THREE.Mesh(m.dark, mat));
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
    gh.g.position.set(this.wx(cx + w / 2), def.cls === 'air' ? 3.2 : 0, this.wz(cy + h / 2));
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
