// Wildlife: red deer (a stag with hinds), roe deer and a brown bear (models: tools/blender/make_animals.py), chamois,
// marmots and wolves (tools/blender/make_tatra_animals.py). Where the nature catalogue has a spot for the species on this
// route (src/nature), the animals live there, so the '?' label has its animal nearby.
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
  // chamois are used to hikers: within `flee` they walk off a little, only within `panic` they gallop
  chamois: { file: 'chamois', walk: 1.0, run: 8, flee: 24, panic: 11, clipRate: 1.1, sound: null },
  // marmots: within `sentinel` one stands up on its hind legs and whistles, within `hide` they run
  // into the burrow and come out again after a while
  marmot: { file: 'marmot', size: 1.3, walk: 0.5, run: 3.2, flee: 0, sentinel: 40, hide: 10, clipRate: 1.4, sound: 'marmot' },
  wolf: { file: 'wolf', walk: 1.2, run: 8, flee: 60, clipRate: 1, sound: null },
};
// coats set here over the models' (linear colours by material name): the chamois in its light summer coat
// with the dark back stripe and the pale face, easier to see on grey scree
const COAT = {
  chamois: { Main: [0.2, 0.12, 0.055], Main_Dark: [0.035, 0.024, 0.016], Main_Light: [0.52, 0.45, 0.35] },
  marmot: { Main: [0.24, 0.16, 0.085], Main_Light: [0.5, 0.4, 0.27] },
};
// the catalogue's animals as groups of these models
const FROM_CATALOGUE = {
  kozica: [['chamois', 'chamois', 'chamois'], ['chamois', 'chamois', 'chamois', 'chamois', 'chamois']],
  swistak: [['marmot', 'marmot'], ['marmot', 'marmot', 'marmot']],
  wilk: [['wolf', 'wolf']],
  niedzwiedz: [['bear']],
  jelen: [['stag', 'hind', 'hind', 'hind']],
  sarna: [['roe'], ['roe', 'roe']],
};

export async function buildAnimals({ scene, terrain, groundAt, trail, land, bounds, masks, sound, natureSpots = [], groundClass = null }) {
  const loader = new GLTFLoader();
  const proto = {};
  await Promise.all(Object.entries(SPECIES).map(async ([k, s]) => {
    const g = await loader.loadAsync(`models/animals/${s.file}.glb`);
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const col = (COAT[k] && COAT[k][o.material.name]) ? new THREE.Color(...COAT[k][o.material.name]) : o.material.color;
        o.material = new THREE.MeshLambertMaterial({ color: col, flatShading: false });
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
  // at the catalogue's spots first: chamois on the crags and meadows up high, marmots in the scree, wolves,
  // the bear, deer and roe where the catalogue puts them
  // (the land-cover map is coarse; the catalogue's spot already matches the 1 m class map, so around it
  // the animals only keep off the water)
  const dry = (c) => c !== 80;
  const placed = new Set();
  // seen from the trail: the line from the nearest trail point at eye height to the animal clears the ground
  const nearestI = (x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < N; i += 4) { const d = (trail.X[i] - x) ** 2 + (trail.Z[i] - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const seen = (x, z, i = nearestI(x, z)) => {
    const ex = trail.X[i], ez = trail.Z[i], ey = terrain.height(ex, ez) + 1.7, ty = terrain.height(x, z) + 0.5;
    for (let k = 1; k < 16; k++) {
      const f = k / 16, px = ex + (x - ex) * f, pz = ez + (z - ez) * f;
      if (terrain.height(px, pz) > ey + (ty - ey) * f - 0.25) return false;
    }
    return true;
  };
  // chamois and marmots at a catalogue spot move to where they can be seen from the trail, if there is
  // such a place close by in the same kind of ground
  const openAt = (x, z) => {
    if (terrain.maskAt(masks.lake, x, z) > 0 || terrain.normal(x, z, 3).y < 0.7) return false;
    const c = groundClass ? groundClass(x, z)?.c : null;
    return c == null || c === 3 || c === 4;
  };
  const visibleNear = (p) => {
    { const i = nearestI(p.x, p.z), dt = Math.hypot(trail.X[i] - p.x, trail.Z[i] - p.z); if (dt > 15 && seen(p.x, p.z, i) && openAt(p.x, p.z)) return p; }
    for (let k = 0; k < 80; k++) {
      const a = r() * 6.283, d = 8 + r() * 70, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const i = nearestI(x, z), dt = Math.hypot(trail.X[i] - x, trail.Z[i] - z);
      if (dt > 15 && dt < 90 && openAt(x, z) && seen(x, z, i)) return { x, z };
    }
    return p;
  };
  for (const sp of natureSpots) {
    const kinds = FROM_CATALOGUE[sp.id];
    if (!kinds) continue;
    const k = Math.floor(r() * kinds.length);
    const at = sp.id === 'kozica' || sp.id === 'swistak' ? visibleNear({ x: sp.x, z: sp.z }) : { x: sp.x, z: sp.z };
    addGroup(kinds[k], at, dry);
    placed.add(sp.id);
  }
  // otherwise, as before: red deer herds on the meadows around the lakes, roe deer near the forest edge, one bear
  if (!placed.has('jelen')) {
    addGroup(['stag', 'hind', 'hind', 'hind'], spot(meadow, 90, 320, 0.05, 0.6), meadow);
    addGroup(['hind', 'hind'], spot(meadow, 120, 380, 0.3, 0.8), meadow);
  }
  if (!placed.has('sarna')) {
    addGroup(['roe'], spot(edge, 50, 200, 0, 0.35), edge);
    addGroup(['roe', 'roe'], spot(edge, 70, 260, 0.1, 0.5), edge);
  }
  if (!placed.has('niedzwiedz')) addGroup(['bear'], spot(woods, 110, 300, 0.15, 0.55), woods);
  // chamois and marmots are what one hopes to see up high: if the catalogue has none on this route, a
  // herd and a colony go on open scree or meadow above 1600 m, 20-80 m off the trail, where there is any
  const open = (lo, hi) => (x, z) => {
    const h = terrain.height(x, z);
    if (h < lo || h > hi || terrain.maskAt(masks.lake, x, z) > 0 || terrain.normal(x, z, 3).y < 0.72) return false;
    const c = groundClass ? groundClass(x, z)?.c : null;
    return c == null ? true : c === 3 || c === 4;
  };
  const nearTrail = (ok, dMin, dMax, sMin = 0, sMax = 1) => {
    for (let k = 0; k < 3000; k++) {
      const i = Math.floor((sMin + r() * (sMax - sMin)) * (N - 1));
      const a = r() * 6.283, d = dMin + r() * (dMax - dMin);
      const x = trail.X[i] + Math.cos(a) * d, z = trail.Z[i] + Math.sin(a) * d;
      if (x < x0 + 100 || z < z0 + 100 || x > x1 - 100 || z > z1 - 100) continue;
      if (ok(x, z) && seen(x, z, i)) return { x, z };
    }
    return null;
  };
  const high = (() => { let m = -1e9; for (let i = 0; i < N; i += 20) m = Math.max(m, terrain.height(trail.X[i], trail.Z[i])); return m; })();
  if (!placed.has('kozica') && high > 1650) {
    addGroup(['chamois', 'chamois', 'chamois', 'chamois'], nearTrail(open(1600, 2450), 35, 80), dry);
    addGroup(['chamois', 'chamois'], nearTrail(open(1700, 2500), 30, 70), dry);
  }
  if (!placed.has('swistak') && high > 1600) addGroup(['marmot', 'marmot', 'marmot'], nearTrail(open(1550, 2200), 20, 55), dry);
  // the marmots' burrows: a mound of dug-out earth with the dark hole
  const moundMat = new THREE.MeshLambertMaterial({ color: 0x6a5a48 }), holeMat = new THREE.MeshBasicMaterial({ color: 0x120e0a });
  for (const g of groups) {
    if (!g.kinds.includes('marmot')) continue;
    const y = groundAt(g.home.x, g.home.z);
    if (y == null) continue;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), moundMat);
    mound.scale.set(1.3, 0.28, 1); mound.position.set(g.home.x, y - 0.03, g.home.z); mound.receiveShadow = true;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), holeMat);
    hole.rotation.x = -Math.PI / 2 + 0.5; hole.position.set(g.home.x + 0.55, y + 0.1, g.home.z);
    scene.add(mound, hole);
    g.burrow = { x: g.home.x + 0.55, z: g.home.z };
  }

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
      state: 'graze', timer: r() * 8, target: null, cur: null, fleeing: 0, heard: false, up: 0, upWant: 0, calmT: 0,
      scale: (0.9 + r() * 0.2) * (sp.size || 1),
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
      if (an.kind === 'marmot' && marmot(an, dist, dt, cx, cz)) continue;
      // chamois: close but not too close: walk off a little, heads up, then graze again
      if (sp.panic && dist < sp.flee && dist >= sp.panic && an.state !== 'flee' && an.calmT <= 0) {
        const away = Math.atan2(an.x - cx, an.z - cz) + (r() - 0.5) * 1.2;
        an.state = 'walk'; an.timer = 20; an.calmT = 8;
        an.target = { x: an.x + Math.sin(away) * (12 + r() * 10), z: an.z + Math.cos(away) * (12 + r() * 10) };
        play(an, 'Walk', 0.3);
      }
      an.calmT -= dt;
      // the hiker comes close: flee
      if (dist < (sp.panic || sp.flee) && an.state !== 'flee') {
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
      } else if (an.timer <= 0 && an.state !== 'watch' && an.state !== 'home') {
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
      // a marmot on watch: up on its hind legs (the body pivots about the hips)
      an.up += (an.upWant - an.up) * Math.min(1, dt * 5);
      if (an.up > 0.01) {
        const L = 0.22 * an.scale;
        an.obj.rotateX(-1.15 * an.up);
        an.obj.position.y += Math.sin(1.15 * an.up) * L;
      }
      an.mixer.update(dt * (dist < 250 ? 1 : 0.5));
    }
  }

  // the marmots' own life: on watch, whistling, into the burrow and out again. Returns true when the
  // animal is handled for this frame (hidden underground)
  function marmot(an, dist, dt, cx, cz) {
    const sp = an.sp, g = an.group, burrow = g.burrow || g.home;
    if (an.state === 'hidden') {
      an.obj.visible = false; an.timer -= dt;
      if (an.timer <= 0 && dist > sp.hide * 1.6) {
        an.state = 'watch'; an.timer = 3 + r() * 4; an.x = burrow.x; an.z = burrow.z; an.upWant = 1; play(an, 'Idle');
      }
      return true;
    }
    if (dist < sp.hide && an.state !== 'home') {
      an.state = 'home'; an.target = { x: burrow.x, z: burrow.z }; an.upWant = 0; play(an, 'Gallop', 0.15);
      if (sound && !g.whistled) { g.whistled = true; sound.animal('marmot', [an.x, terrain.height(an.x, an.z) + 0.5, an.z]); setTimeout(() => { g.whistled = false; }, 15000); }
    } else if (an.state === 'home' && Math.hypot(burrow.x - an.x, burrow.z - an.z) < 0.9) {
      an.state = 'hidden'; an.timer = 20 + r() * 25; an.obj.visible = false; return true;
    } else if (dist < sp.sentinel && an.state !== 'home' && an.state !== 'watch' && !(an.watchedT > 0)) {
      // one of the colony goes up on watch and whistles
      an.state = 'watch'; an.timer = 4 + r() * 5; an.upWant = 1; an.target = null; play(an, 'Idle', 0.3);
      if (sound && !g.whistled) { g.whistled = true; sound.animal('marmot', [an.x, terrain.height(an.x, an.z) + 0.5, an.z]); setTimeout(() => { g.whistled = false; }, 15000); }
    }
    an.watchedT = (an.watchedT || 0) - dt;
    if (an.state === 'watch') {
      an.timer -= dt;
      const want = Math.atan2(cx - an.x, cz - an.z);                  // facing the hiker
      let dy = want - an.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); an.yaw += dy * Math.min(1, dt * 2);
      if (an.timer <= 0) { an.state = 'graze'; an.timer = 5 + r() * 8; an.upWant = 0; an.watchedT = 12; play(an, 'Eating'); }
    }
    if (an.state === 'home') {
      const dx = an.target.x - an.x, dz = an.target.z - an.z;
      an.yaw = Math.atan2(dx, dz);
      const v = sp.run * an.scale, dd = Math.hypot(dx, dz) || 1, step = Math.min(dd, v * dt);
      an.x += dx / dd * step; an.z += dz / dd * step;
    }
    return false;
  }
  return { update, animals };
}
