// Wildlife: red deer (a stag with hinds), roe deer and a brown bear (models: tools/blender/make_animals.py).
// Groups live at fixed, seeded spots along the trail chosen from the land cover (deer on meadows and
// forest edges, roe deer at the forest edge low down, the bear in the forest and dwarf pine). They
// graze, look around and wander; when the hiker comes close deer bark and gallop away, the bear
// moves off slowly. Only animals within a few hundred metres are animated.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { rng } from './noise.js';

const SPECIES = {
  stag: { file: 'stag', walk: 1.1, run: 9, flee: 70, clipRate: 1, sound: 'deerBark' },
  hind: { file: 'hind', walk: 1.1, run: 9, flee: 60, clipRate: 1, sound: 'deerBark' },
  roe: { file: 'roe', walk: 0.9, run: 8, flee: 45, clipRate: 1.2, sound: 'roeBark' },
  bear: { file: 'bear', walk: 0.8, run: 2.2, flee: 50, clipRate: 0.8, sound: 'bear', slowFlee: true },
};

export async function buildAnimals({ scene, terrain, groundAt, trail, land, bounds, masks, sound }) {
  const loader = new GLTFLoader();
  const proto = {};
  await Promise.all(Object.entries(SPECIES).map(async ([k, s]) => {
    const g = await loader.loadAsync(`models/animals/${s.file}.glb`);
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.material = new THREE.MeshLambertMaterial({ color: o.material.color, flatShading: false });
      }
    });
    // which way the model faces: from the body bone towards the head bone
    g.scene.updateMatrixWorld(true);
    const bp = (n) => { const b = g.scene.getObjectByName(n); return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
    const head = bp('Head'), body = bp('Body') || bp('Torso');
    const face = head && body ? Math.atan2(head.x - body.x, head.z - body.z) : 0;
    proto[k] = { face, scene: g.scene, clips: Object.fromEntries(g.animations.map((a) => [a.name.replace(/^.*\|/, ''), a])) };
  }));

  const [x0, z0, x1, z1] = bounds;
  const cover = (x, z) => {
    const u = Math.floor((x - x0) / (x1 - x0) * land.w), v = Math.floor((z - z0) / (z1 - z0) * land.h);
    return u < 0 || v < 0 || u >= land.w || v >= land.h ? 0 : land.d[(v * land.w + u) * 4];
  };
  const r = rng(1234);
  const N = trail.X.length;
  // candidate spots: a trail point plus an offset, filtered by habitat
  const spot = (test, dMin, dMax, sMin = 0, sMax = 1) => {
    for (let k = 0; k < 4000; k++) {
      const i = Math.floor((sMin + r() * (sMax - sMin)) * (N - 1));
      const a = r() * 6.283, d = dMin + r() * (dMax - dMin);
      const x = trail.X[i] + Math.cos(a) * d, z = trail.Z[i] + Math.sin(a) * d;
      if (x < x0 + 100 || z < z0 + 100 || x > x1 - 100 || z > z1 - 100) continue;
      if (terrain.maskAt(masks.lake, x, z) > 0) continue;
      const h = terrain.height(x, z), n = terrain.normal(x, z, 3);
      if (n.y < 0.8) continue;
      if (test(cover(x, z), h)) return { x, z };
    }
    return null;
  };
  const meadow = (c, h) => (c === 30 || c === 20 || c === 90) && h < 1750;
  const edge = (c, h) => (c === 30 || c === 10 || c === 20) && h < 1550;
  const woods = (c, h) => (c === 10 || c === 20) && h < 1800;

  const groups = [];
  const addGroup = (kinds, at, habitat) => { if (at) groups.push({ kinds, home: at, habitat }); };
  // red deer herds on the meadows around the lakes, roe deer near the forest edge, one bear
  addGroup(['stag', 'hind', 'hind', 'hind'], spot(meadow, 90, 320, 0.05, 0.6), meadow);
  addGroup(['hind', 'hind'], spot(meadow, 120, 380, 0.3, 0.8), meadow);
  addGroup(['roe'], spot(edge, 50, 200, 0, 0.35), edge);
  addGroup(['roe', 'roe'], spot(edge, 70, 260, 0.1, 0.5), edge);
  addGroup(['bear'], spot(woods, 110, 300, 0.15, 0.55), woods);

  const animals = [];
  for (const g of groups) for (const kind of g.kinds) {
    const p = proto[kind], sp = SPECIES[kind];
    const obj = SkeletonUtils.clone(p.scene);
    const mixer = new THREE.AnimationMixer(obj);
    const acts = {};
    for (const [name, clip] of Object.entries(p.clips)) acts[name] = mixer.clipAction(clip);
    acts.HeadLow = acts.Idle_Headlow || acts.Idle_2_HeadLow;
    const a = r() * 6.283, d = 3 + r() * 12;
    const an = {
      kind, sp, obj, mixer, acts, group: g,
      x: g.home.x + Math.cos(a) * d, z: g.home.z + Math.sin(a) * d, yaw: r() * 6.283,
      state: 'graze', timer: r() * 8, target: null, cur: null, fleeing: 0, heard: false,
      scale: 0.9 + r() * 0.2,
    };
    obj.scale.setScalar(an.scale);
    obj.visible = false;
    scene.add(obj);
    play(an, 'Eating');
    animals.push(an);
  }

  function play(an, name, fade = 0.4) {
    const next = an.acts[name] || an.acts.Idle;
    if (an.cur === next) return;
    next.reset().setEffectiveTimeScale(an.sp.clipRate).fadeIn(fade).play();
    if (an.cur) an.cur.fadeOut(fade);
    an.cur = next;
  }

  function pickTarget(an, far = false) {
    const g = an.group;
    for (let k = 0; k < 20; k++) {
      const a = r() * 6.283, d = (far ? 40 : 8) + r() * (far ? 80 : 30);
      const x = g.home.x + Math.cos(a) * d, z = g.home.z + Math.sin(a) * d;
      if (terrain.maskAt(masks.lake, x, z) > 0 || terrain.normal(x, z, 3).y < 0.75) continue;
      if (!g.habitat(cover(x, z), terrain.height(x, z))) continue;
      return { x, z };
    }
    return { x: g.home.x, z: g.home.z };
  }

  const up = new THREE.Vector3(0, 1, 0);
  function update(dt, cam) {
    const cx = cam.position.x, cz = cam.position.z;
    for (const an of animals) {
      const dist = Math.hypot(an.x - cx, an.z - cz);
      const active = dist < 700;
      an.obj.visible = active;
      if (!active) continue;
      const sp = an.sp;
      // the hiker comes close: flee
      if (dist < sp.flee && an.state !== 'flee') {
        an.state = 'flee'; an.fleeing = sp.slowFlee ? 12 : 6;
        const away = Math.atan2(an.x - cx, an.z - cz) + (r() - 0.5) * 0.8;
        const d = sp.slowFlee ? 60 : 150;
        an.target = { x: an.x + Math.sin(away) * d, z: an.z + Math.cos(away) * d };
        play(an, sp.slowFlee ? 'Walk' : 'Gallop', 0.2);
        if (sound && !an.heard) { an.heard = true; sound.animal(sp.sound, [an.x, terrain.height(an.x, an.z) + 1, an.z]); }
      }
      an.timer -= dt;
      if (an.state === 'flee') {
        an.fleeing -= dt;
        if (an.fleeing <= 0 && dist > sp.flee * 1.5) {
          // settle where it ran to
          an.group.home = { x: an.x, z: an.z }; an.state = 'idle'; an.timer = 4 + r() * 4; play(an, 'Idle'); an.heard = false;
        }
      } else if (an.timer <= 0) {
        const roll = r();
        if (roll < 0.45) { an.state = 'graze'; an.timer = 6 + r() * 12; play(an, 'Eating'); }
        else if (roll < 0.65) { an.state = 'idle'; an.timer = 3 + r() * 5; play(an, r() < 0.5 ? 'Idle' : 'HeadLow'); }
        else { an.state = 'walk'; an.target = pickTarget(an); an.timer = 30; play(an, 'Walk'); }
      }
      // movement towards the target
      if ((an.state === 'walk' || an.state === 'flee') && an.target) {
        const dx = an.target.x - an.x, dz = an.target.z - an.z, dd = Math.hypot(dx, dz);
        if (dd < 1.5) {
          if (an.state === 'walk') { an.state = 'graze'; an.timer = 5 + r() * 10; play(an, 'Eating'); }
          else an.target = null;
        } else {
          const want = Math.atan2(dx, dz);
          let dy = want - an.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          an.yaw += dy * Math.min(1, dt * (an.state === 'flee' ? 4 : 1.5));
          const v = (an.state === 'flee' ? sp.run : sp.walk) * an.scale * (Math.abs(dy) > 1 ? 0.3 : 1);
          const nx = an.x + Math.sin(an.yaw) * v * dt, nz = an.z + Math.cos(an.yaw) * v * dt;
          // do not walk into lakes or up walls
          if (terrain.maskAt(masks.lake, nx, nz) > 0 || terrain.normal(nx, nz, 2).y < 0.6) { an.target = pickTarget(an); }
          else { an.x = nx; an.z = nz; }
        }
      }
      // place on the ground, body tilted with the slope along the heading
      const y = groundAt(an.x, an.z);
      const fwd = 0.8 * an.scale;
      const pitch = Math.atan2(groundAt(an.x + Math.sin(an.yaw) * fwd, an.z + Math.cos(an.yaw) * fwd) -
        groundAt(an.x - Math.sin(an.yaw) * fwd, an.z - Math.cos(an.yaw) * fwd), 2 * fwd);
      an.obj.position.set(an.x, y - 0.05, an.z);
      an.obj.rotation.set(0, 0, 0);
      an.obj.rotateOnWorldAxis(up, an.yaw - proto[an.kind].face);
      an.obj.rotateX(-pitch * 0.7);
      an.mixer.update(dt * (dist < 250 ? 1 : 0.5));
    }
  }
  return { update, animals };
}
