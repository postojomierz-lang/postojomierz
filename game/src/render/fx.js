// Visual effects: tracers, muzzle flashes, projectiles, explosions, smoke, debris,
// plus a decal layer on the floor for scorch marks and tank tracks.
import * as THREE from 'three';

function radialTexture(inner, outer, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smokeTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.35, y = S / 2 + (Math.random() - 0.5) * S * 0.35, r = S * (0.18 + Math.random() * 0.18);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Fx {
  constructor(scene, map, world) {
    this.scene = scene; this.world = world; this.map = map;
    this.group = new THREE.Group(); scene.add(this.group);
    this.items = [];
    this.flashTex = radialTexture('rgba(255,250,210,1)', 'rgba(255,170,40,0)');
    this.fireTex = radialTexture('rgba(255,230,150,1)', 'rgba(255,90,10,0)');
    this.smokeTex = smokeTexture();
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb050, 0, 9, 1.5); scene.add(l); this.lights.push({ l, until: 0, peak: 0 }); }
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95 });
    this.flakMat = new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0.9 });
    this.debrisGeo = new THREE.BoxGeometry(0.12, 0.08, 0.16);
    this.rocketGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8).rotateZ(Math.PI / 2);
    this.shellGeo = new THREE.SphereGeometry(0.09, 8, 6);
    this.grenadeGeo = new THREE.SphereGeometry(0.1, 8, 6);
    this.dark = new THREE.MeshStandardMaterial({ color: 0x3a3d2e, roughness: 0.6 });
    this.shake = 0;
    this.setupDecals();
  }

  // ---- floor decals (scorch marks, craters, tracks) ----
  setupDecals() {
    const m = this.map, px = 24; // pixels per cell
    this.decalScale = px;
    const c = document.createElement('canvas'); c.width = m.W * px; c.height = m.H * px;
    this.decalCanvas = c; this.decalCtx = c.getContext('2d');
    this.decalTex = new THREE.CanvasTexture(c); this.decalTex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(m.W, m.H), new THREE.MeshStandardMaterial({ map: this.decalTex, transparent: true, depthWrite: false, roughness: 1 }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = 0.006; plane.receiveShadow = true; plane.renderOrder = 1;
    this.group.add(plane);
    this.decalDirty = false; this.decalLast = 0;
  }
  scorch(x, z, r) {
    const g = this.decalCtx, s = this.decalScale, cx = (x + this.map.W / 2) * s, cy = (z + this.map.H / 2) * s;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * s * 1.4);
    gr.addColorStop(0, 'rgba(25,20,15,0.5)'); gr.addColorStop(0.55, 'rgba(40,32,24,0.22)'); gr.addColorStop(1, 'rgba(40,32,24,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r * s * 1.4, 0, 7); g.fill();
    g.fillStyle = 'rgba(15,12,10,0.4)';
    for (let i = 0; i < 4; i++) { const a = Math.random() * 7, d = r * s * (0.3 + Math.random()); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + Math.random() * 3, 0, 7); g.fill(); }
    this.decalDirty = true;
  }
  track(x, z, dirX, dirZ, width, tracked) {
    const g = this.decalCtx, s = this.decalScale, cx = (x + this.map.W / 2) * s, cy = (z + this.map.H / 2) * s;
    const nx = -dirZ, nz = dirX;
    g.fillStyle = tracked ? 'rgba(40,30,20,0.16)' : 'rgba(40,30,20,0.11)';
    for (const side of [-1, 1]) {
      const tx = cx + nx * side * width * s, ty = cy + nz * side * width * s;
      g.save(); g.translate(tx, ty); g.rotate(Math.atan2(dirZ, dirX));
      if (tracked) for (let i = -2; i <= 2; i++) g.fillRect(i * 2.4 - 1, -3.5, 1.6, 7);
      else g.fillRect(-4, -1.8, 8, 3.6);
      g.restore();
    }
    this.decalDirty = true;
  }
  // older marks fade a little every round so the floor never turns black
  fadeDecals(amount) {
    const g = this.decalCtx; g.save(); g.globalCompositeOperation = 'destination-out';
    g.fillStyle = `rgba(0,0,0,${amount})`; g.fillRect(0, 0, this.decalCanvas.width, this.decalCanvas.height);
    g.restore(); this.decalDirty = true;
  }
  clearDecals() { this.decalCtx.clearRect(0, 0, this.decalCanvas.width, this.decalCanvas.height); this.decalDirty = true; }

  // ---- generic particles ----
  sprite(tex, color, blending = THREE.NormalBlending) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending });
    const s = new THREE.Sprite(m); this.group.add(s); return s;
  }
  add(item) { item.t0 = item.t0 ?? this.now; this.items.push(item); return item; }
  light(pos, peak, ms) {
    const L = this.lights.reduce((a, b) => (a.until < b.until ? a : b));
    L.l.position.copy(pos); L.peak = peak; L.start = this.now; L.until = this.now + ms;
  }

  muzzle(pos, big = false) {
    const s = this.sprite(this.flashTex, 0xffffff, THREE.AdditiveBlending);
    s.position.copy(pos); const size = big ? 1.1 : 0.45; s.scale.setScalar(size);
    this.add({ dur: big ? 90 : 55, obj: s, step: k => { s.material.opacity = 1 - k; s.scale.setScalar(size * (1 + k * 0.5)); } });
    if (big) this.light(pos, 25, 110);
  }
  tracer(a, b, flak = false) {
    const m = new THREE.Mesh(this.tracerGeo, flak ? this.flakMat : this.tracerMat);
    const dir = b.clone().sub(a), len = dir.length();
    m.scale.set(0.035, 0.035, Math.min(1.2, len * 0.35));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    this.group.add(m);
    const dur = Math.max(60, len * 14);
    this.add({ dur, obj: m, step: k => m.position.lerpVectors(a, b, k) });
    if (flak) this.add({ t0: this.now + dur, dur: 350, obj: null, init: () => this.puff(b, 0.5, 0x444444, 0.9) });
  }
  puff(pos, size, color = 0xb8b0a0, opacity = 0.6, rise = 0.6, dur = 900) {
    const s = this.sprite(this.smokeTex, color);
    s.position.copy(pos); s.scale.setScalar(size * 0.4); s.material.rotation = Math.random() * 6;
    const drift = new THREE.Vector3((Math.random() - 0.5) * 0.4, rise, (Math.random() - 0.5) * 0.4);
    this.add({ dur, obj: s, step: k => {
      s.scale.setScalar(size * (0.4 + k));
      s.material.opacity = opacity * (1 - k) * Math.min(1, k * 6);
      s.position.set(pos.x + drift.x * k, pos.y + drift.y * k, pos.z + drift.z * k);
    } });
  }
  dust(pos) { this.puff(pos, 0.45, 0xcdbfa6, 0.5, 0.25, 500); }

  projectile(p, from, to) {
    const arc = p.arc, kind = p.kind;
    const geo = kind === 'grenade' ? this.grenadeGeo : kind === 'shell' ? this.shellGeo : this.rocketGeo;
    const m = new THREE.Mesh(geo, kind === 'shell' ? this.tracerMat : this.dark);
    m.castShadow = true; this.group.add(m);
    const height = arc ? Math.max(2, from.distanceTo(to) * (kind === 'grenade' ? 0.35 : 0.28)) : 0;
    let lastPuff = 0;
    const prev = from.clone();
    this.add({ dur: p.dur * 1000, obj: m, step: (k, t) => {
      m.position.lerpVectors(from, to, k); m.position.y += Math.sin(k * Math.PI) * height;
      const dir = m.position.clone().sub(prev);
      if (dir.lengthSq() > 1e-6 && kind !== 'grenade') m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
      prev.copy(m.position);
      if ((kind === 'rocket' || kind === 'arty' || kind === 'missile') && t - lastPuff > 35) { lastPuff = t; this.puff(m.position.clone(), 0.35, 0xdedad0, 0.55, 0.15, 700); }
    } });
  }

  explosion(pos, r, kind) {
    const big = r >= 1.5 || kind === 'barrel';
    this.shake = Math.max(this.shake, big ? 0.22 : 0.08);
    this.light(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), big ? 60 : 25, big ? 260 : 150);
    const f = this.sprite(this.fireTex, 0xffffff, THREE.AdditiveBlending);
    f.position.copy(pos).add(new THREE.Vector3(0, r * 0.5, 0));
    this.add({ dur: 320, obj: f, step: k => { f.scale.setScalar(r * 2.4 * (0.4 + k * 0.8)); f.material.opacity = 1 - k * k; } });
    for (let i = 0; i < (big ? 7 : 4); i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * r, 0.3 + Math.random() * r * 0.5, (Math.random() - 0.5) * r));
      this.add({ t0: this.now + i * 40, dur: 1, obj: null, init: () => this.puff(p, r * (1.2 + Math.random() * 0.8), i % 2 ? 0x5a554c : 0x8a8272, 0.75, 1.2 + Math.random(), 1600 + Math.random() * 800) });
    }
    if (pos.y > 0.5) return; // air burst: no crater
    for (let i = 0; i < (big ? 10 : 5); i++) this.debris(pos, r);
    this.scorch(pos.x, pos.z, r * 0.8);
  }
  debris(pos, r, color = 0x6a6152) {
    const m = new THREE.Mesh(this.debrisGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    m.castShadow = true; this.group.add(m);
    const v = new THREE.Vector3((Math.random() - 0.5) * 5 * r, 3 + Math.random() * 4, (Math.random() - 0.5) * 5 * r);
    const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    const p0 = pos.clone().add(new THREE.Vector3(0, 0.2, 0));
    this.add({ dur: 900, obj: m, disposeMat: true, step: k => {
      const t = k * 0.9;
      m.position.set(p0.x + v.x * t, Math.max(0.04, p0.y + v.y * t - 9.8 * t * t), p0.z + v.z * t);
      m.rotation.set(spin.x * t, spin.y * t, spin.z * t);
    } });
  }
  smokeColumn(getPos, seconds) {
    const end = this.now + seconds * 1000;
    let last = 0;
    this.add({ dur: seconds * 1000, obj: null, step: (k, t) => {
      if (t - last < 160) return; last = t;
      const p = getPos(); if (!p) return;
      this.puff(p.clone().add(new THREE.Vector3(0, 0.6, 0)), 0.9 + Math.random() * 0.5, 0x3d3a36, 0.55 * Math.min(1, (end - t) / 2000), 2.4, 2600);
    } });
  }

  update(now) {
    this.now = now;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (now < it.t0) continue;
      if (it.init) { it.init(); it.init = null; }
      const k = Math.min(1, (now - it.t0) / it.dur);
      if (it.step) it.step(k, now);
      if (k >= 1) {
        if (it.obj) { this.group.remove(it.obj); if (it.obj.isSprite || it.disposeMat) it.obj.material.dispose(); }
        this.items.splice(i, 1);
      }
    }
    for (const L of this.lights) {
      if (now >= L.until) { L.l.intensity = 0; continue; }
      L.l.intensity = L.peak * (1 - (now - L.start) / (L.until - L.start));
    }
    if (this.decalDirty && now - this.decalLast > 250) { this.decalTex.needsUpdate = true; this.decalDirty = false; this.decalLast = now; }
    this.shake *= 0.86;
  }

  clear() {
    for (const it of this.items) if (it.obj) { this.group.remove(it.obj); if (it.obj.isSprite || it.disposeMat) it.obj.material.dispose(); }
    this.items = [];
  }
}
