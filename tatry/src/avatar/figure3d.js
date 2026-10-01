// The hiker as a 3D figure, built from the look (avatar/look.js): a simple, low-poly person with what they
// chose to wear and carry, about 1.7-1.8 m tall, standing on the origin and facing +z. animate(dt, speed)
// swings the legs, arms and poles in step with the walking speed (m/s); at 0 the figure stands.
import * as THREE from 'three';
import { SKIN, HAIR_COLORS, CLOTH, cleanLook, DEFAULT_LOOK } from './look.js';

const mats = new Map();
const mat = (hex, opts = {}) => {
  const k = hex + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: hex, ...opts }));
  return mats.get(k);
};
const darker = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const capsule = (r, len, m) => { const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.translate(0, -len / 2 - r, 0); return new THREE.Mesh(g, m); };
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

export function buildFigure(look) {
  const L = cleanLook(look) || DEFAULT_LOOK;
  const f = L.sex === 'f', h = f ? 0.96 : 1;                      // overall height factor
  const skin = mat(SKIN[L.skin]), hair = mat(HAIR_COLORS[L.hairColor][0]);
  const jc = CLOTH[L.jacketColor], jacket = mat(jc), pants = mat(CLOTH[L.pantsColor]), boots = mat(CLOTH[L.bootsColor]);
  const packM = mat(CLOTH[L.packColor]), dark = mat('#222326');
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const hipY = 0.92 * h, shY = 1.42 * h, sw = f ? 0.17 : 0.2, hw = f ? 0.12 : 0.1;
  const bulk = L.jacket === 'down' ? 1.18 : L.jacket === 'tee' ? 0.95 : 1;

  // legs: a thigh and a shin on pivots (the hip, the knee)
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * hw, hipY, 0); body.add(hip);
    const thighLen = 0.42 * h, shinLen = 0.4 * h;
    const r = L.pants === 'tights' ? 0.058 : 0.068;
    hip.add(capsule(r, thighLen - r, pants));
    const knee = new THREE.Group(); knee.position.y = -thighLen; hip.add(knee);
    knee.add(capsule(r * 0.9, shinLen - r - 0.08, L.pants === 'shorts' ? skin : pants));
    const bootH = { trek: 0.17, approach: 0.12, trail: 0.1 }[L.boots];
    const boot = mesh(new THREE.BoxGeometry(0.11, bootH, 0.26), boots, 0, -shinLen + bootH / 2 - 0.02, 0.04);
    const sole = mesh(new THREE.BoxGeometry(0.115, 0.03, 0.27), dark, 0, -shinLen - 0.02, 0.04);
    knee.add(boot, sole);
    legs.push({ hip, knee, s });
  }
  // hips and torso
  body.add(mesh(new THREE.BoxGeometry(hw * 2 + 0.14, 0.16, 0.2), pants, 0, hipY + 0.02, 0));
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(sw * bulk, (f ? 0.15 : 0.16) * bulk, shY - hipY - 0.02, 10), jacket);
  torso.scale.z = 0.62; torso.position.y = (shY + hipY) / 2 + 0.02; body.add(torso);
  const shoulders = mesh(new THREE.SphereGeometry(1, 12, 8), jacket, 0, shY - 0.02, 0);
  shoulders.scale.set(sw * bulk + 0.02, 0.08, 0.13 * bulk); body.add(shoulders);
  if (L.jacket === 'shell') { const hood = mesh(new THREE.TorusGeometry(0.09, 0.035, 6, 12), mat(darker(jc, 0.85)), 0, shY + 0.02, -0.05); hood.rotation.x = Math.PI / 2; body.add(hood); }
  // arms on shoulder pivots, forearm on the elbow
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * (sw * bulk + 0.03), shY - 0.03, 0); body.add(sh);
    sh.add(capsule(0.05 * bulk, 0.26 * h, jacket));
    const el = new THREE.Group(); el.position.y = -0.31 * h; sh.add(el);
    el.add(capsule(0.044, 0.22 * h, L.jacket === 'tee' ? skin : jacket));
    const hand = mesh(new THREE.SphereGeometry(0.05, 8, 6), skin, 0, -0.29 * h, 0); el.add(hand);
    let pole = null;
    if (L.poles) {
      pole = new THREE.Group(); pole.position.y = -0.29 * h; el.add(pole);
      const shaft = mesh(new THREE.CylinderGeometry(0.009, 0.007, 1.15, 5), mat('#8b9096'), 0, -0.5, 0.02);
      const grip = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), dark, 0, 0.02, 0);
      pole.add(shaft, grip);
    }
    arms.push({ sh, el, s, pole });
  }
  sh0(arms);
  // head
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), skin, 0, shY + 0.06, 0); body.add(neck);
  const head = new THREE.Group(); head.position.y = shY + 0.2 * h; body.add(head);
  const HS = { round: [0.115, 0.125, 0.12], oval: [0.105, 0.135, 0.115], square: [0.112, 0.13, 0.118], long: [0.098, 0.145, 0.112] }[L.head];
  const skull = mesh(L.head === 'square' ? new THREE.BoxGeometry(2, 2, 2, 2, 2, 2) : new THREE.SphereGeometry(1, 14, 10), skin);
  if (L.head === 'square') { const p = skull.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.lerp(v.clone().normalize().multiplyScalar(1.3), 0.45); p.setXYZ(i, v.x, v.y, v.z); } skull.geometry.computeVertexNormals(); skull.scale.set(HS[0] * 0.8, HS[1] * 0.8, HS[2] * 0.8); } else skull.scale.set(...HS);
  head.add(skull);
  const eyeM = mat('#1e1a17');
  for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.014, 6, 4), eyeM, s * 0.04, 0.015, HS[2] * 0.93));
  head.add(mesh(new THREE.ConeGeometry(0.018, 0.04, 6), skin, 0, -0.012, HS[2] + 0.005).rotateX(Math.PI / 2));
  // hair
  const top = HS[1];
  const hairCap = (k = 1.06, cut = 0.55) => { const m = mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * cut), hair); m.scale.set(HS[0] * k, HS[1] * k, HS[2] * k); m.rotation.x = -0.25; return m; };
  if (L.hair === 'buzz') head.add(hairCap(1.02, 0.45));
  if (['short', 'medium', 'long', 'ponytail', 'bun', 'braid'].includes(L.hair)) head.add(hairCap(1.07, 0.52));
  if (L.hair === 'curly') { const c = hairCap(1.12, 0.6); c.geometry = new THREE.IcosahedronGeometry(1, 1); c.material = mat(HAIR_COLORS[L.hairColor][0], { flatShading: true }); c.position.y = 0.02; head.add(c); }
  if (L.hair === 'medium' || L.hair === 'long') { const len = L.hair === 'long' ? 0.32 : 0.16; head.add(mesh(new THREE.BoxGeometry(HS[0] * 2.05, len, 0.07), hair, 0, -len / 2 + 0.03, -HS[2] * 0.72)); }
  if (L.hair === 'ponytail') { const t = mesh(new THREE.CylinderGeometry(0.03, 0.015, 0.2, 6), hair, 0, -0.04, -HS[2] - 0.06); t.rotation.x = 0.4; head.add(t); }
  if (L.hair === 'bun') head.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), hair, 0, top * 0.75, -HS[2] * 0.6));
  if (L.hair === 'braid') for (let i = 0; i < 5; i++) head.add(mesh(new THREE.SphereGeometry(0.026, 6, 4), hair, 0, -0.04 - i * 0.045, -HS[2] - 0.02));
  // beard
  if (L.beard !== 'none') {
    const bm = L.beard === 'stubble' ? mat(HAIR_COLORS[L.hairColor][0], { transparent: true, opacity: 0.45 }) : hair;
    if (L.beard === 'full' || L.beard === 'stubble') { const b = mesh(new THREE.SphereGeometry(1, 12, 6, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.5, Math.PI * 0.45), bm); b.scale.set(HS[0] * 1.04, HS[1] * (L.beard === 'full' ? 1.15 : 1.02), HS[2] * 1.05); b.rotation.y = Math.PI; head.add(b); }
    if (L.beard === 'goatee') head.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), hair, 0, -HS[1] * 0.85, HS[2] * 0.8));
    if (L.beard !== 'stubble') head.add(mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), hair, 0, -0.045, HS[2] * 0.95));
  }
  if (L.glasses !== 'none') {
    const gm = mat(L.glasses === 'sun' ? '#0e1318' : '#2a2a2a');
    for (const s of [-1, 1]) { const g = mesh(L.glasses === 'sun' ? new THREE.CircleGeometry(0.026, 10) : new THREE.TorusGeometry(0.024, 0.004, 4, 12), gm, s * 0.04, 0.015, HS[2] + 0.012); head.add(g); }
    head.add(mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), gm, 0, 0.018, HS[2] + 0.012));
  }
  // on the head
  if (L.helmet) { const hm = mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(CLOTH[L.helmetColor])); hm.scale.set(HS[0] * 1.22, HS[1] * 1.12, HS[2] * 1.22); hm.position.y = 0.01; head.add(hm); }
  else if (L.hat === 'cap') { const c = hairCap(1.1, 0.5); c.material = jacket; head.add(c); const v = mesh(new THREE.BoxGeometry(0.13, 0.01, 0.09), mat(darker(jc, 0.75)), 0, top * 0.45, HS[2] + 0.03); v.rotation.x = 0.15; head.add(v); }
  else if (L.hat === 'beanie') { const c = hairCap(1.12, 0.5); c.material = packM; c.scale.y *= 1.12; head.add(c); head.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), mat(darker(CLOTH[L.packColor], 1.25)), 0, top * 1.12, 0)); }
  else if (L.hat === 'band') { const b = mesh(new THREE.TorusGeometry(HS[0] * 1.04, 0.012, 4, 16), packM, 0, top * 0.45, 0); b.rotation.x = Math.PI / 2; head.add(b); }
  else if (L.hat === 'brim') { head.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 16), mat('#7a5f3c'), 0, top * 0.55, 0)); head.add(mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.09, 12), mat('#8e7048'), 0, top * 0.55 + 0.045, 0)); }
  if (L.lamp) {
    const b = mesh(new THREE.TorusGeometry(HS[0] * 1.08, 0.008, 4, 16), dark, 0, top * 0.4, 0); b.rotation.x = Math.PI / 2; head.add(b);
    head.add(mesh(new THREE.BoxGeometry(0.04, 0.03, 0.025), mat('#dddddd'), 0, top * 0.4, HS[2] * 1.12));
    head.add(mesh(new THREE.CircleGeometry(0.009, 8), new THREE.MeshBasicMaterial({ color: 0xfff4c0 }), 0, top * 0.4, HS[2] * 1.12 + 0.013));
  }
  // backpack and rope
  if (L.pack !== 'none') {
    const big = L.pack === 'big', ph = big ? 0.62 : 0.4;
    const pk = mesh(new THREE.BoxGeometry(big ? 0.36 : 0.3, ph, big ? 0.24 : 0.16), packM, 0, shY - ph / 2 + (big ? 0.12 : -0.02), -0.13 * bulk - (big ? 0.12 : 0.08));
    body.add(pk);
    body.add(mesh(new THREE.BoxGeometry(big ? 0.3 : 0.24, 0.12, 0.05), mat(darker(CLOTH[L.packColor], 0.8)), 0, shY - ph + 0.18, pk.position.z - (big ? 0.14 : 0.1)));
    for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.045, 0.42, 0.02), mat(darker(CLOTH[L.packColor], 0.7)), s * 0.09, shY - 0.2, 0.13 * bulk * 0.62 + 0.012));
    if (L.rope) { const r = mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 14), mat('#c8a24a'), 0, shY + (big ? 0.16 : 0.02), pk.position.z); r.rotation.x = Math.PI / 2; r.scale.set(1, 0.8, 1); body.add(r); }
  } else if (L.rope) {
    const r = mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), mat('#c8a24a'), 0, shY - 0.18, 0); r.rotation.set(0.1, 0, 0.9); r.scale.set(1, 1.3, 0.5); body.add(r);
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  // walking: one stride cycle per ~1.3 m
  let phase = 0;
  function animate(dt, speed = 0) {
    const v = Math.min(Math.abs(speed), 6);
    const k = Math.min(1, v / 1.2);                               // how much of a stride
    phase += dt * (v / 1.3) * Math.PI * 2;
    for (const g of legs) {
      const p = Math.sin(phase + (g.s > 0 ? Math.PI : 0));
      g.hip.rotation.x = -p * 0.5 * k;
      g.knee.rotation.x = Math.max(0, Math.cos(phase + (g.s > 0 ? Math.PI : 0))) * 0.8 * k;
    }
    for (const a of arms) {
      const p = Math.sin(phase + (a.s > 0 ? 0 : Math.PI));
      a.sh.rotation.x = -p * (L.poles ? 0.45 : 0.35) * k;
      a.el.rotation.x = -0.25 - (L.poles ? 0.35 + p * 0.2 : 0.1) * Math.max(k, 0.3);
      if (a.pole) a.pole.rotation.x = 0.6 + p * 0.25 * k;
    }
    body.position.y = Math.abs(Math.cos(phase)) * 0.03 * k;
    body.rotation.x = 0.06 * k;                                   // leaning a little into the walk
  }
  animate(0, 0);
  return { object: root, animate, look: L };
}
function sh0(arms) { for (const a of arms) a.sh.rotation.z = a.s * 0.08; }
