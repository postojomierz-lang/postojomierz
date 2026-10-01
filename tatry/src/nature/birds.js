// Birds of the nature catalogue at their spots: ravens, the golden eagle and the peregrine circle high over
// their spot, gliding with a few wing beats now and then; the small birds sit on the ground or a rock, hop
// about, and when the hiker comes within a dozen metres fly up, circle and land again a little further on.
// Low-poly bodies with two flapping wings, coloured by species.
import * as THREE from 'three';
import { rng } from '../noise.js';

// size (wingspan m), body colour, wing colour, [marking colour], soaring
const LOOK = {
  kruk: [1.2, 0x121214, 0x0c0c0e, null, true], orzel: [2.1, 0x3a2a1c, 0x2a1e14, 0xb08a4a, true],
  sokol: [1.0, 0x5a6068, 0x3e444c, 0xe8e4dc, true],
  pomurnik: [0.3, 0x8c9096, 0xc8283a, 0x1a1a1a], plochacz: [0.3, 0x7a6e62, 0x5a4e44, 0x9c3a2a],
  siwerniak: [0.27, 0x8a7e6a, 0x6a5e4c, 0xd8cfc0], pluszcz: [0.28, 0x3a2a22, 0x2e241e, 0xf2f0ea],
  pliszka: [0.26, 0x7c848a, 0x3a3e42, 0xf0d23a], drozd: [0.4, 0x1a1a1c, 0x222224, 0xf2f2ee],
  krzyzodziob: [0.29, 0xb03a2a, 0x5a3a2a, 0x7a2a1e], orzechowka: [0.55, 0x4a3426, 0x2a1e18, 0xeee6dc],
  dzieciol: [0.35, 0x222222, 0x1a1a1a, 0xf2f2f2], cietrzew: [0.8, 0x14141c, 0x1a1a22, 0xf2f2f2],
  gluszec: [1.0, 0x22222a, 0x3a2e24, 0x3a6a3a], jarzabek: [0.55, 0x7a6a5a, 0x6a5a4a, 0xf2f0ea],
  soweczka: [0.35, 0x6a5440, 0x5a4636, 0xe8e0d0], wlochatka: [0.55, 0x6a5440, 0x5a4636, 0xe8e0d0],
  puchacz: [1.6, 0x7a5a3a, 0x5a4230, 0xe8c080],
  'dzieciol-czarny': [0.7, 0x141414, 0x101010, 0xc8201c], krogulec: [0.7, 0x6a7078, 0x55606a, 0xd8a070, true],
  paszkot: [0.45, 0x8a7a60, 0x6a5e4a, 0xe8dcc0], czyz: [0.21, 0x9ab43a, 0x3a4a2a, 0xf2e04a],
  kapturka: [0.23, 0x8a8a80, 0x6a6a62, 0x1a1a1a], strzyzyk: [0.15, 0x7a5a3a, 0x6a4a2e, 0xb08a60],
};

function birdMesh(size, body, wing, mark) {
  const g = new THREE.Group();
  const s = size;
  const mb = new THREE.MeshLambertMaterial({ color: body }), mw = new THREE.MeshLambertMaterial({ color: wing, side: THREE.DoubleSide });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(s * 0.12, 8, 6), mb);
  torso.scale.set(0.8, 0.75, 1.8); g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.075, 8, 6), mb);
  head.position.set(0, s * 0.06, s * 0.22); g.add(head);
  if (mark) {
    const bib = new THREE.Mesh(new THREE.SphereGeometry(s * 0.07, 8, 6), new THREE.MeshLambertMaterial({ color: mark }));
    bib.position.set(0, -s * 0.02, s * 0.17); bib.scale.set(0.9, 0.8, 0.6); g.add(bib);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(s * 0.07, s * 0.25, 4), mw);
  tail.rotation.x = -Math.PI / 2; tail.position.z = -s * 0.28; tail.scale.set(1.6, 1, 0.3); g.add(tail);
  // wings: a flat quad each, pivoting at the shoulder
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, s * 0.1, s * 0.5, 0, 0, s * 0.45, 0, -s * 0.12, 0, 0, -s * 0.1], 3));
  wg.setIndex([0, 1, 2, 0, 2, 3]); wg.computeVertexNormals();
  const L = new THREE.Mesh(wg, mw), R = new THREE.Mesh(wg, mw);
  R.scale.x = -1;
  L.position.y = R.position.y = s * 0.04;
  g.add(L, R);
  g.userData.wings = [L, R];
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function buildBirds({ scene, spots, groundAt, onEvent = () => {} }) {
  const birds = [];
  const r = rng(99);
  for (const sp of spots) {
    const look = LOOK[sp.id];
    if (!look) continue;
    const [size, body, wing, mark, soar] = look;
    const n = soar ? 1 : 1 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const obj = birdMesh(size, body, wing, mark);
      const y0 = groundAt(sp.x, sp.z);
      if (y0 === null) continue;
      const b = { id: sp.id, obj, soar, home: new THREE.Vector3(sp.x, y0, sp.z), phase: r() * 6.28, radius: soar ? 40 + r() * 60 : 0,
        alt: soar ? 30 + r() * 50 : 0, state: 'sit', t: r() * 4, pos: new THREE.Vector3(sp.x + (r() - 0.5) * 4, y0, sp.z + (r() - 0.5) * 4),
        vel: new THREE.Vector3(), flap: 0, target: null, size };
      scene.add(obj);
      birds.push(b);
    }
  }
  const tmp = new THREE.Vector3();
  function update(dt, cam) {
    for (const b of birds) {
      const far = b.home.distanceTo(cam) > 900;
      b.obj.visible = !far;
      if (far) continue;
      const [L, R] = b.obj.userData.wings;
      if (b.hunt) { huntStep(b, dt, L, R); continue; }
      if (b.soar) {
        // circling: a slow orbit, beating the wings for a second every few seconds
        b.phase += dt * 12 / b.radius;
        const x = b.home.x + Math.cos(b.phase) * b.radius, z = b.home.z + Math.sin(b.phase) * b.radius;
        const y = b.home.y + b.alt + Math.sin(b.phase * 2.3) * 4;
        b.obj.position.set(x, y, z);
        b.obj.rotation.set(0, -b.phase, 0.35);
        const beat = (Math.sin(b.phase * 3) > 0.85) ? Math.sin(performance.now() / 90) * 0.7 : 0.05;
        L.rotation.z = beat; R.rotation.z = -beat;
        continue;
      }
      const dist = b.pos.distanceTo(cam);
      if (b.state === 'sit') {
        b.t -= dt;
        L.rotation.z = 1.35; R.rotation.z = -1.35;                    // folded
        if (b.t < 0) {                                              // a hop, a turn
          b.t = 1 + Math.random() * 4;
          const g = groundAt(b.pos.x + (Math.random() - 0.5) * 0.6, b.pos.z + (Math.random() - 0.5) * 0.6);
          if (g !== null) { b.pos.x += (Math.random() - 0.5) * 0.6; b.pos.z += (Math.random() - 0.5) * 0.6; b.pos.y = g; }
          b.obj.rotation.y = Math.random() * 6.28;
        }
        if (dist < 12) {                                            // startled: up and away
          b.state = 'fly';
          const a = Math.atan2(b.pos.x - cam.x, b.pos.z - cam.z) + (Math.random() - 0.5);
          const d = 25 + Math.random() * 30;
          b.target = new THREE.Vector3(b.home.x + Math.sin(a) * d, 0, b.home.z + Math.cos(a) * d);
          const g = groundAt(b.target.x, b.target.z);
          if (g === null) b.target.set(b.home.x, b.home.y, b.home.z); else b.target.y = g;
          b.flight = 0; b.from = b.pos.clone();
        }
        b.obj.position.copy(b.pos).y += b.size * 0.1;
      } else {
        // an arc to the landing place
        b.flight += dt / (0.4 + b.from.distanceTo(b.target) / 9);
        const f = Math.min(1, b.flight);
        tmp.lerpVectors(b.from, b.target, f);
        tmp.y += Math.sin(f * Math.PI) * 6;
        b.obj.position.copy(tmp);
        b.obj.rotation.y = Math.atan2(b.target.x - b.from.x, b.target.z - b.from.z);
        const beat = Math.sin(performance.now() / 45) * 0.9;
        L.rotation.z = beat; R.rotation.z = -beat;
        if (f >= 1) { b.state = 'sit'; b.pos.copy(b.target); b.t = 2 + Math.random() * 3; }
      }
    }
  }
  // the golden eagle hunting marmots: it leaves its circle, dives at the colony with its wings folded, and
  // climbs away, now and then with a marmot in its talons; then it circles over the place
  function huntStep(b, dt, L, R) {
    const h = b.hunt;
    h.t += dt;
    if (h.phase === 'dive') {
      const f = Math.min(1, h.t / h.dur);
      tmp.lerpVectors(h.from, h.to, f * f * (3 - 2 * f));
      tmp.y += Math.sin(f * Math.PI) * 10;
      b.obj.position.copy(tmp);
      b.obj.rotation.set(-0.5 * f, Math.atan2(h.to.x - h.from.x, h.to.z - h.from.z), 0);
      L.rotation.z = 1.0; R.rotation.z = -1.0;                    // wings half folded, stooping
      if (f > 0.7 && !h.alarmed) { h.alarmed = true; h.alarm(h.list, null); }
      if (f >= 1) {
        h.phase = 'climb'; h.t = 0; h.from = b.obj.position.clone();
        h.up = new THREE.Vector3(h.to.x + (Math.random() - 0.5) * 80, h.to.y + 60, h.to.z + (Math.random() - 0.5) * 80);
        if (h.caught) {
          h.alarm([], h.caught);
          const prey = new THREE.Mesh(new THREE.SphereGeometry(b.size * 0.09, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6a5238 }));
          prey.scale.set(0.8, 0.7, 1.6); prey.position.set(0, -b.size * 0.12, 0); b.obj.add(prey); h.carry = prey;
          onEvent(h.what === 'zająca' ? '🦅 Orzeł upolował zająca!' : '🦅 Orzeł upolował świstaka!');
        }
      }
    } else {
      const f = Math.min(1, h.t / 8);
      tmp.lerpVectors(h.from, h.up, f);
      b.obj.position.copy(tmp);
      b.obj.rotation.set(0.25 * (1 - f), Math.atan2(h.up.x - h.from.x, h.up.z - h.from.z), 0);
      const beat = Math.sin(performance.now() / 110) * 0.8;
      L.rotation.z = beat; R.rotation.z = -beat;
      if (f >= 1) {
        if (h.carry) { b.obj.remove(h.carry); h.carry.geometry.dispose(); }
        b.home.set(h.up.x, h.to.y, h.up.z); b.alt = 50 + Math.random() * 30; b.hunt = null;
      }
    }
  }
  // cam: the camera; marmots: the colony's animals near the hiker; alarm(list, caught): tell the wildlife
  function hunt(cam, marmots, alarm, what = 'świstaki') {
    if (!marmots || !marmots.length) return false;
    const m = marmots[Math.floor(Math.random() * marmots.length)];
    const y0 = groundAt(m.x, m.z);
    if (y0 === null) return false;
    let e = birds.find((b) => b.id === 'orzel' && !b.hunt && b.home.distanceTo(cam.position) < 2500);
    if (!e) {                                                      // an eagle from over the ridge for the scene
      const [size, body, wing, mark] = LOOK.orzel;
      const obj = birdMesh(size, body, wing, mark);
      scene.add(obj);
      e = { id: 'orzel', obj, soar: true, home: new THREE.Vector3(m.x, y0, m.z), phase: 0, radius: 70, alt: 70, state: 'sit', t: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), flap: 0, target: null, size };
      obj.position.set(m.x + 150, y0 + 120, m.z + 60);
      birds.push(e);
    }
    const from = e.obj.position.clone();
    const to = new THREE.Vector3(m.x, y0 + 0.4, m.z);
    const caught = Math.random() < 0.3 ? m : null;
    e.hunt = { phase: 'dive', t: 0, dur: Math.max(3, from.distanceTo(to) / 30), from, to, list: marmots, caught, alarm, alarmed: false, what };
    onEvent(`🦅 Orzeł przedni poluje na ${what}!`);
    return true;
  }
  // the bird of species `id` nearest to pos (for the discovery's camera)
  function find(id, pos) {
    let best = null, bd = 250;
    for (const b of birds) { if (b.id !== id) continue; const d = b.obj.position.distanceTo(pos); if (d < bd) { bd = d; best = b.obj; } }
    return best;
  }
  return { update, hunt, find, get count() { return birds.length; } };
}
