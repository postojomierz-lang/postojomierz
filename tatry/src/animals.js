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
  fox: { file: 'fox', walk: 1.0, run: 7.5, flee: 35, clipRate: 1.1, sound: null },
  boar: { file: 'boar', walk: 0.9, run: 6.5, flee: 40, clipRate: 1.1, sound: null },
  hare: { file: 'hare', walk: 0.7, run: 10, flee: 25, clipRate: 1.5, sound: null },
  // bear cubs: the bear model, small, keeping close to the mother
  cub: { file: 'bear', size: 0.42, walk: 0.9, run: 2.6, flee: 50, clipRate: 1.3, sound: null, slowFlee: true, follows: 'bear' },
};
// coats set here over the models' (linear colours by material name): the chamois in its light summer coat
// with the dark back stripe and the pale face, easier to see on grey scree
const COAT = {
  chamois: { Main: [0.2, 0.12, 0.055], Main_Dark: [0.035, 0.024, 0.016], Main_Light: [0.52, 0.45, 0.35] },
  marmot: { Main: [0.24, 0.16, 0.085], Main_Light: [0.5, 0.4, 0.27] },
};
// lying down to rest: the legs folded under the body (bone turns on top of the Idle clip, so the head and
// ears keep moving) and the body lowered by `drop` metres; deer lie down mostly around midday, chamois
// rest on the rocks at any hour
const REST = { stag: 0.85, hind: 0.55, roe: 0.45, chamois: 0.42 };
const FOLD = [['FrontUpperLeg', 1.0], ['FrontLowerLeg', -2.2], ['BackUpperLeg', -0.9], ['BackLowerLeg', 2.0]];
const AX = new THREE.Vector3(1, 0, 0);
// in winter the chamois turns almost black (with the pale face), the hare greyer
const WINTER_COAT = {
  chamois: { Main: [0.03, 0.022, 0.016], Main_Dark: [0.012, 0.01, 0.008], Main_Light: [0.5, 0.45, 0.36] },
  hare: { Main: [0.26, 0.22, 0.17], Main_Light: [0.66, 0.62, 0.55] },
};
// the catalogue's animals as groups of these models
const FROM_CATALOGUE = {
  kozica: [['chamois', 'chamois', 'chamois'], ['chamois', 'chamois', 'chamois', 'chamois', 'chamois']],
  swistak: [['marmot', 'marmot'], ['marmot', 'marmot', 'marmot']],
  wilk: [['wolf', 'wolf']],
  niedzwiedz: [['bear', 'cub', 'cub'], ['bear'], ['bear', 'cub']],
  jelen: [['stag', 'hind', 'hind', 'hind']],
  sarna: [['roe'], ['roe', 'roe']],
  dzik: [['boar', 'boar', 'boar'], ['boar', 'boar', 'boar', 'boar', 'boar']],
  lis: [['fox']],
  zajac: [['hare'], ['hare', 'hare']],
};

export async function buildAnimals({ scene, terrain, groundAt, trail, land, bounds, masks, sound, natureSpots = [], groundClass = null, rut = false, winter = false, hour = () => 12, onEvent = () => {} }) {
  const loader = new GLTFLoader();
  const proto = {};
  const files = {};
  await Promise.all(Object.entries(SPECIES).map(async ([k, s]) => {
    const g = await (files[s.file] || (files[s.file] = loader.loadAsync(`models/animals/${s.file}.glb`)));
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const coat = winter && WINTER_COAT[k] ? WINTER_COAT[k] : COAT[k];
        const col = (coat && coat[o.material.name]) ? new THREE.Color(...coat[o.material.name]) : o.material.color;
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
  if (!placed.has('niedzwiedz')) addGroup(r() < 0.5 ? ['bear', 'cub', 'cub'] : ['bear'], spot(woods, 110, 300, 0.15, 0.55), woods);
  // the common ones of the lower valleys, where the catalogue has none on this route
  if (!placed.has('zajac')) addGroup(['hare'], spot(meadow, 40, 220, 0, 0.7), meadow);
  if (!placed.has('lis')) addGroup(['fox'], spot(edge, 50, 250, 0, 0.7), edge);
  if (!placed.has('dzik')) addGroup(['boar', 'boar', 'boar'], spot(woods, 70, 260, 0, 0.45), woods);
  // the rut (mid September to mid October): a second stag with every herd of red deer, roaring and sparring
  if (rut) for (const g of groups) if (g.kinds.includes('stag')) { g.kinds.push('stag'); g.rut = true; }
  // winter: marmots and bears asleep in their dens
  if (winter) for (const g of groups) g.kinds = g.kinds.filter((k) => k !== 'marmot' && k !== 'bear' && k !== 'cub');
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
  if (!placed.has('swistak') && high > 1600 && !winter) addGroup(['marmot', 'marmot', 'marmot'], nearTrail(open(1550, 2200), 20, 55), dry);
  // on a high route one catalogue herd is soon passed: a second small herd and colony elsewhere along it
  if (placed.has('kozica') && high > 1800) addGroup(['chamois', 'chamois'], nearTrail(open(1650, 2500), 30, 70), dry);
  if (placed.has('swistak') && high > 1800 && !winter) addGroup(['marmot', 'marmot'], nearTrail(open(1550, 2200), 20, 55), dry);
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
  const spawn = (g) => { for (const kind of g.kinds) spawnOne(g, kind); };
  for (const g of groups) spawn(g);
  function spawnOne(g, kind) {
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
    if (REST[kind]) an.legs = FOLD.map(([n, a]) => [['L', 'R'].map((sd) => obj.getObjectByName(n + sd)).filter(Boolean), a]);
    an.lie = 0;
    obj.visible = false;
    scene.add(obj);
    play(an, 'Eating');
    animals.push(an);
    return an;
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
      if (special(an, dt, dist)) { place(an, dist, dt); continue; }
      // chamois: close but not too close: walk off a little, heads up, then graze again
      if (sp.panic && dist < sp.flee && dist >= sp.panic && an.state !== 'flee' && an.calmT <= 0) {
        const away = Math.atan2(an.x - cx, an.z - cz) + (r() - 0.5) * 1.2;
        an.state = 'walk'; an.timer = 20; an.calmT = 8;
        an.target = { x: an.x + Math.sin(away) * (12 + r() * 10), z: an.z + Math.cos(away) * (12 + r() * 10) };
        play(an, 'Walk', 0.3);
      }
      an.calmT -= dt;
      // the hiker comes close: flee (not for a while after it was cornered at a lake or a wall)
      an.cornered = Math.max(0, (an.cornered || 0) - dt);
      if (dist < (sp.panic || sp.flee) && an.state !== 'flee' && !an.cornered) {
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
        } else if (!an.target) {
          // ran as far as it meant to (or met a lake or a wall) with the hiker still close: on, away from
          // them, instead of galloping on the spot
          const away = Math.atan2(an.x - cx, an.z - cz) + (r() - 0.5) * 1.6, d = sp.slowFlee ? 40 : 80;
          an.target = { x: an.x + Math.sin(away) * d, z: an.z + Math.cos(away) * d };
          an.fleeing = Math.max(an.fleeing, 2);
        }
      } else if (an.timer <= 0 && an.state !== 'watch' && an.state !== 'home') {
        const roll = r();
        const noon = Math.max(0, 1 - Math.abs(hour() - 13) / 2.5);            // 10:30-15:30, most at 13
        const restP = REST[an.kind] ? (an.kind === 'chamois' ? 0.2 + 0.2 * noon : 0.08 + 0.5 * noon) : 0;
        if (an.group.rut && an.kind === 'stag') { /* no rest in the rut */ }
        else if (r() < restP && dist > (sp.panic || sp.flee) * 1.5) { an.state = 'rest'; an.timer = 25 + r() * 50; play(an, 'Idle', 0.8); }
        else if (roll < 0.45) { an.state = 'graze'; an.timer = 6 + r() * 12; play(an, 'Eating'); }
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
          // round lakes and walls; no way on: a grazer picks another place, one fleeing stops and looks
          const v = (an.state === 'flee' ? sp.run : sp.walk) * an.scale;
          if (!stepTo(an, Math.atan2(dx, dz), v, dt, an.state === 'flee' ? 4 : 1.5, 0.6) && an.stuck > 0.5) {
            if (an.state === 'walk') an.target = pickTarget(an);
            else { an.group.home = { x: an.x, z: an.z }; an.state = 'idle'; an.timer = 3 + r() * 3; an.target = null; an.cornered = 6; play(an, 'Idle', 0.3); an.heard = false; }
            an.stuck = 0;
          }
        }
      }
      place(an, dist, dt);
    }
    eco(dt, cam);
  }

  function place(an, dist, dt) {
    {
      // place on the ground, body tilted with the slope along the heading
      const y = groundAt(an.x, an.z);
      const fwd = 0.8 * an.scale;
      const pitch = Math.atan2(groundAt(an.x + Math.sin(an.yaw) * fwd, an.z + Math.cos(an.yaw) * fwd) -
        groundAt(an.x - Math.sin(an.yaw) * fwd, an.z - Math.cos(an.yaw) * fwd), 2 * fwd);
      an.obj.position.set(an.x, y - 0.05, an.z);
      an.obj.rotation.set(0, 0, 0);
      an.obj.rotateOnWorldAxis(up, an.yaw - proto[an.kind].face);
      an.obj.rotateX(-pitch * 0.7);
      if (an.lift) an.obj.rotateX(-an.lift);                    // a roaring stag raises its chest and head
      if (an.state === 'dead' && !an.acts.Death) { an.obj.rotateZ(1.45); an.obj.position.y += 0.25 * an.scale; }   // lying on its side
      // a marmot on watch: up on its hind legs (the body pivots about the hips)
      an.up += (an.upWant - an.up) * Math.min(1, dt * 5);
      if (an.up > 0.01) {
        const L = 0.22 * an.scale;
        an.obj.rotateX(-1.15 * an.up);
        an.obj.position.y += Math.sin(1.15 * an.up) * L;
      }
      if (an.state !== 'dead' || an.deadT < 3) an.mixer.update(dt * (dist < 250 ? 1 : 0.5));
      if (an.jump) an.obj.position.y += an.jump;
      if (an.lie > 0 && an.legs) {
        const k = an.lie * an.lie * (3 - 2 * an.lie);
        for (const [bones, a] of an.legs) for (const b of bones) b.rotateOnAxis(AX, a * k);
        an.obj.position.y -= REST[an.kind] * an.scale * k;
      }
    }
  }

  // ------------------------------------------------------------------ behaviour beyond grazing
  // a lake or a wall ahead blocks the way: the first free heading either side of the wanted one (looked at
  // 2 m ahead), so the animal runs round it; none free: it stops (an.stuck counts the seconds), instead of
  // turning back and forth and running on the spot
  const free = (x, z, wall = 0.55) => terrain.maskAt(masks.lake, x, z) <= 0 && terrain.normal(x, z, 2).y >= wall;
  function stepTo(an, want, v, dt, turn, wall = 0.55) {
    let dy = want - an.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const ahead = (y) => free(an.x + Math.sin(y) * (2 + v * dt), an.z + Math.cos(y) * (2 + v * dt), wall);
    let head = want;
    if (!ahead(want)) {
      head = null;
      for (const o of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) if (ahead(want + o)) { head = want + o; break; }
      if (head === null) { an.stuck = (an.stuck || 0) + dt; return false; }
      dy = Math.atan2(Math.sin(head - an.yaw), Math.cos(head - an.yaw));
      turn = Math.max(turn, 5);
    }
    an.yaw += dy * Math.min(1, dt * turn);
    const sp = v * (Math.abs(dy) > 1.2 ? 0.4 : 1), nx = an.x + Math.sin(an.yaw) * sp * dt, nz = an.z + Math.cos(an.yaw) * sp * dt;
    if (!free(nx, nz, wall)) { an.stuck = (an.stuck || 0) + dt; return false; }
    an.x = nx; an.z = nz; an.stuck = 0;
    return true;
  }
  const move = (an, tx, tz, speed, dt, turn = 3) => {
    const dx = tx - an.x, dz = tz - an.z, dd = Math.hypot(dx, dz);
    if (dd < 0.05) return dd;
    stepTo(an, Math.atan2(dx, dz), speed, dt, turn);
    return dd;
  };
  // returns true when the animal is driven by one of these states this frame
  function special(an, dt, dist = 1e9) {
    const sp = an.sp;
    // resting: lie down, stay a while, get up; up and away when the hiker comes too close
    if (an.state === 'rest') {
      if (dist < (sp.panic || sp.flee) * 1.3) { an.state = 'graze'; an.lieFast = true; return false; }
      an.timer -= dt;
      an.lie = Math.min(1, an.lie + dt / 1.8);
      play(an, an.lie > 0.9 && r() < dt * 0.05 ? 'HeadLow' : 'Idle', 0.6);
      if (an.timer <= 0) { an.state = 'getup'; }
      return true;
    }
    if (an.state === 'getup') {
      an.lie = Math.max(0, an.lie - dt / 1.2);
      if (an.lie <= 0) { an.state = 'graze'; an.timer = 6 + r() * 8; play(an, 'Eating'); }
      return true;
    }
    if (an.lie > 0) an.lie = Math.max(0, an.lie - dt / (an.lieFast ? 0.35 : 1.2));
    if (an.lie <= 0) an.lieFast = false;
    // cubs keep close to the mother (and run after her when she runs)
    if (sp.follows && an.state !== 'flee') {
      const mum = animals.find((m) => m.group === an.group && m.kind === sp.follows && m.state !== 'dead');
      if (mum) {
        an.off = an.off || { a: r() * 6.28, d: 1.5 + r() * 1.5 };
        const tx = mum.x + Math.sin(mum.yaw + an.off.a) * an.off.d, tz = mum.z + Math.cos(mum.yaw + an.off.a) * an.off.d;
        const dd = Math.hypot(tx - an.x, tz - an.z);
        if (dd > 1.2 && !(an.stuck > 0.3)) { play(an, dd > 8 || mum.state === 'flee' || mum.state === 'chase' ? 'Gallop' : 'Walk', 0.3); move(an, tx, tz, dd > 8 ? sp.run : sp.walk * 1.3, dt); }
        else if (dd > 1.2) { play(an, 'Idle'); an.stuck = Math.max(0, an.stuck - dt * 0.2); }
        else { play(an, mum.state === 'graze' ? 'Eating' : 'Idle'); an.yaw += (mum.yaw - an.yaw) * Math.min(1, dt); }
        return true;
      }
    }
    if (an.state === 'dead') { an.deadT = (an.deadT || 0) + dt; return true; }
    if (an.gone) { an.obj.visible = false; return true; }
    if (an.state === 'chase') {                                 // a predator after its prey
      const prey = an.prey;
      if (!prey || prey.state === 'dead' || an.timer <= 0) { endChase(an); return true; }
      an.timer -= dt;
      play(an, 'Gallop', 0.2);
      const dd = move(an, prey.x, prey.z, sp.run * 1.05, dt, 5);
      if (dd < 1.6 && an.canCatch) { kill(prey, an); }
      else if (an.stuck > 1.5) { an.stuck = 0; endChase(an); }   // the prey got across water or up a wall
      return true;
    }
    if (an.state === 'hunted') {                                // prey running from the nearest hunter
      const h = an.hunters.filter((p) => p.state === 'chase');
      if (!h.length) { an.state = 'idle'; an.timer = 4; play(an, 'Idle'); an.group.home = { x: an.x, z: an.z }; return true; }
      let hx = 0, hz = 0; for (const p of h) { hx += p.x; hz += p.z; } hx /= h.length; hz /= h.length;
      const away = Math.atan2(an.x - hx, an.z - hz) + Math.sin(performance.now() / 900 + an.scale * 9) * 0.5;
      play(an, 'Gallop', 0.2);
      move(an, an.x + Math.sin(away) * 20, an.z + Math.cos(away) * 20, sp.run * (an.tired ? 0.85 : 1), dt, 4);
      if (an.stuck > 1.5) { an.stuck = 0; an.state = 'idle'; an.timer = 4; play(an, 'Idle'); an.group.home = { x: an.x, z: an.z }; }   // cornered
      return true;
    }
    if (an.state === 'eat') {                                   // predators at the kill
      an.timer -= dt;
      if (an.attackT > 0) { an.attackT -= dt; return true; }
      play(an, 'Eating');
      if (an.timer <= 0) { an.state = 'idle'; an.timer = 5; play(an, 'Idle'); an.group.home = { x: an.x, z: an.z }; }
      return true;
    }
    if (an.state === 'pounce') {                                // a fox mousing: it listens, leaps high and dives in
      an.timer += dt;
      const t = an.timer;
      if (t < 2.2) { play(an, 'Idle', 0.3); an.jump = 0; }
      else if (t < 3.1) {
        const f = (t - 2.2) / 0.9;
        an.jump = Math.sin(f * Math.PI) * 0.9 * an.scale;
        play(an, 'Gallop', 0.1);
        an.x += Math.sin(an.yaw) * 1.8 * dt / 0.9; an.z += Math.cos(an.yaw) * 1.8 * dt / 0.9;
      } else if (t < 9) { an.jump = 0; play(an, 'Eating', 0.2); }
      else { an.jump = 0; an.state = 'graze'; an.timer = 6; }
      return true;
    }
    if (an.kind === 'boar' && an.state === 'graze' && root) {   // rooting: patches of turned-over earth
      an.rootT = (an.rootT || r() * 5) - dt;
      if (an.rootT <= 0) { an.rootT = 5 + r() * 6; root(an.x + Math.sin(an.yaw) * 0.8 * an.scale, an.z + Math.cos(an.yaw) * 0.8 * an.scale); }
    }
    if (an.state === 'roar') {                                  // a stag roaring in the rut
      an.timer -= dt;
      an.lift = Math.min(0.35, (an.lift || 0) + dt * 0.8);
      play(an, 'Idle', 0.3);
      if (an.timer <= 0) { an.state = 'graze'; an.timer = 8 + r() * 10; play(an, 'Eating'); }
      return true;
    }
    an.lift = Math.max(0, (an.lift || 0) - dt * 0.8);
    if (an.state === 'spar') {                                  // two stags pushing, antlers locked
      const o = an.rival;
      an.timer -= dt;
      if (!o || o.state !== 'spar' || an.timer <= 0) { an.state = 'graze'; an.timer = 6; play(an, 'Eating'); an.rival = null; return true; }
      const mx = (an.x + o.x) / 2, mz = (an.z + o.z) / 2, a = Math.atan2(an.x - mx, an.z - mz);
      const push = Math.sin(performance.now() / 700 + (an === o.first ? 0 : Math.PI)) * 0.35;
      const dist = 1.2 + push;
      move(an, mx + Math.sin(a) * dist, mz + Math.cos(a) * dist, 1.5, dt, 0);
      an.yaw = Math.atan2(o.x - an.x, o.z - an.z);
      play(an, 'Walk', 0.3);
      return true;
    }
    return false;
  }
  // turned-over earth where the boars have been rooting (at most 60 patches, the oldest reused)
  const soilMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
  const soil = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 9), soilMat, 60);
  soil.count = 0; soil.receiveShadow = true; soil.frustumCulled = false; scene.add(soil);
  let soilN = 0;
  const soilM = new THREE.Matrix4(), soilQ = new THREE.Quaternion(), soilS = new THREE.Vector3(), soilP = new THREE.Vector3(), soilUp = new THREE.Vector3(0, 1, 0);
  function root(x, z) {
    const y = groundAt(x, z);
    if (y == null) return;
    const n = terrain.normal(x, z, 1);
    soilQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    soilQ.premultiply(new THREE.Quaternion().setFromAxisAngle(n, r() * 6.28));
    const k = 0.6 + r() * 0.8;
    soilM.compose(soilP.set(x, y + 0.03, z), soilQ, soilS.set(k * 1.3, k, 1));
    soil.setMatrixAt(soilN % 60, soilM); soilN++; soil.count = Math.min(60, soilN);
    soil.instanceMatrix.needsUpdate = true;
    void soilUp;
  }
  function endChase(p) { p.state = 'idle'; p.timer = 3 + r() * 3; play(p, 'Idle'); p.prey = null; p.group.home = { x: p.x, z: p.z }; }
  function kill(prey, by) {
    prey.state = 'dead'; prey.hunters = []; prey.deadT = 0;
    const death = prey.acts.Death;
    if (death) { death.setLoop(THREE.LoopOnce, 1); death.clampWhenFinished = true; play(prey, 'Death', 0.15); }
    if (by.acts.Attack || by.acts.Attack_Headbutt) play(by, by.acts.Attack ? 'Attack' : 'Attack_Headbutt', 0.1);
    for (const p of animals) if (p.state === 'chase' && p.prey === prey) { p.state = 'eat'; p.timer = 40 + r() * 30; p.prey = null; p.attackT = 1.2; }
    onEvent(by.kind === 'bear' ? 'Niedźwiedź dopadł zwierzynę.' : 'Wilki dopadły zdobycz.', { objs: [prey.obj, by.obj], size: 2, dur: 6 });
    setTimeout(() => { prey.obj.visible = false; prey.gone = true; }, 120000);
  }

  // ------------------------------------------------------------------ the director: now and then, near the
  // hiker, a scene of wild life: wolves or a bear after the deer, a stag roaring in the rut, two stags
  // sparring. Predators that are not on this route come in from out of sight for the scene.
  let ecoT = 25 + r() * 20, birds = null;
  const near = (an, cam, d) => !an.gone && an.state !== 'dead' && Math.hypot(an.x - cam.position.x, an.z - cam.position.z) < d;
  // close enough and not behind a ridge: a scene is only announced when it can be watched
  const inView = (an, cam, d) => {
    if (!near(an, cam, d)) return false;
    const c = cam.position, ty = terrain.height(an.x, an.z) + 0.8;
    const seg = Math.hypot(an.x - c.x, an.z - c.z) / 16;
    let woodsM = 0;                                  // metres of the sightline through the forest
    for (let k = 1; k < 16; k++) {
      const f = k / 16, px = c.x + (an.x - c.x) * f, pz = c.z + (an.z - c.z) * f;
      if (terrain.height(px, pz) > c.y + (ty - c.y) * f - 0.25) return false;
      if (cover(px, pz) === 10 && (woodsM += seg) > 35) return false;
    }
    return true;
  };
  function hiddenSpot(from, cam, dMin, dMax) {
    // a place dMin..dMax from `from`, on the far side from the hiker, walkable
    const away = Math.atan2(from.x - cam.position.x, from.z - cam.position.z);
    for (let k = 0; k < 40; k++) {
      const a = away + (r() - 0.5) * 1.6, d = dMin + r() * (dMax - dMin);
      const x = from.x + Math.sin(a) * d, z = from.z + Math.cos(a) * d;
      if (x < x0 + 60 || z < z0 + 60 || x > x1 - 60 || z > z1 - 60) continue;
      if (terrain.maskAt(masks.lake, x, z) > 0 || terrain.normal(x, z, 3).y < 0.7) continue;
      return { x, z };
    }
    return null;
  }
  function eco(dt, cam) {
    ecoT -= dt;
    // rut: roaring now and then, answered by the other stag
    for (const an of animals) {
      if (an.kind !== 'stag' || !an.group.rut || an.state !== 'graze' || !near(an, cam, 700)) continue;
      if (r() < dt / 25) {
        an.state = 'roar'; an.timer = 3 + r() * 2;
        if (sound && sound.roar) sound.roar([an.x, terrain.height(an.x, an.z) + 1.5, an.z], Math.hypot(an.x - cam.position.x, an.z - cam.position.z));
        if (!an.group.roared && inView(an, cam, 500)) { an.group.roared = true; onEvent('🦌 Rykowisko: jeleń ryczy, słychać go daleko.', { objs: [an.obj], size: 2.4, dur: 6 }); }
      }
    }
    if (ecoT > 0) return;
    ecoT = 70 + r() * 80;
    const deer = animals.filter((a) => (a.kind === 'hind' || a.kind === 'roe' || a.kind === 'stag') && inView(a, cam, 320) && a.state !== 'hunted' && a.state !== 'flee');
    const roll = r();
    // two stags sparring in the rut
    const stags = animals.filter((a) => a.kind === 'stag' && a.group.rut && inView(a, cam, 400) && a.state === 'graze');
    if (stags.length >= 2 && roll < 0.35) {
      const [a, b] = stags;
      a.state = b.state = 'spar'; a.rival = b; b.rival = a; a.first = b.first = a; a.timer = b.timer = 9 + r() * 6;
      onEvent('🦌 Dwa byki walczą na poroża: rykowisko.', { objs: [a.obj, b.obj], size: 3, dur: 10 });
      return;
    }
    // a fox mousing, or after a hare
    const fox = animals.find((a) => a.kind === 'fox' && inView(a, cam, 300) && a.state === 'graze');
    if (fox && roll < 0.55) {
      const hare = animals.find((a) => a.kind === 'hare' && !a.gone && Math.hypot(a.x - fox.x, a.z - fox.z) < 250 && a.state !== 'dead');
      if (hare && r() < 0.4) {
        fox.state = 'chase'; fox.prey = hare; fox.timer = 14; fox.canCatch = r() < 0.2;
        hare.state = 'hunted'; hare.hunters = [fox]; hare.tired = false;
        onEvent('🦊 Lis goni zająca!', { objs: [fox.obj, hare.obj], size: 1.6, dur: 10 });
      } else {
        fox.state = 'pounce'; fox.timer = 0;
        onEvent('🦊 Lis poluje na nornika: nasłuchuje i skacze wysoko w trawę.', { objs: [fox.obj], size: 1.3, dur: 8 });
      }
      return;
    }
    const boars = animals.filter((a) => a.kind === 'boar' && inView(a, cam, 250));
    if (boars.length && !boars[0].group.told) { boars[0].group.told = true; onEvent('🐗 Dziki buchtują: ryją ziemię w poszukiwaniu korzonków i larw.', { objs: boars.map((b) => b.obj), size: 2.2, dur: 8 }); return; }
    if (!deer.length || roll > 0.75) {
      if (birds && birds.hunt) {
        const hares = animals.filter((a) => a.kind === 'hare' && inView(a, cam, 450) && a.state !== 'dead' && a.state !== 'hidden');
        if (hares.length && r() < 0.6) birds.hunt(cam, hares, hareAlarm, 'zająca');
        else birds.hunt(cam, marmotsNear(cam), marmotAlarm, 'świstaki');
      }
      return;
    }
    // predators on the route close enough, or new ones from out of sight
    const target = deer[Math.floor(r() * deer.length)];
    let hunters = animals.filter((a) => (a.kind === 'wolf' || a.kind === 'bear') && near(a, cam, 900) && a.state !== 'eat' && Math.hypot(a.x - target.x, a.z - target.z) < 400);
    if (!hunters.length) {
      const at = hiddenSpot(target, cam, 90, 160);
      if (!at) return;
      const pack = roll < 0.7 ? ['wolf', 'wolf', 'wolf'] : ['bear'];
      const g = { kinds: pack, home: at, habitat: dry };
      groups.push(g);
      hunters = pack.map((k) => { const an = spawnOne(g, k); an.x = at.x + (r() - 0.5) * 6; an.z = at.z + (r() - 0.5) * 6; return an; });
    }
    const herd = animals.filter((a) => a.group === target.group && !a.gone && a.state !== 'dead');
    const wolves = hunters[0].kind === 'wolf';
    for (const p of hunters) {
      p.state = 'chase'; p.prey = target; p.timer = wolves ? 30 : 12; p.canCatch = r() < (wolves ? 0.35 : 0.15);
    }
    for (const d of herd) { d.state = 'hunted'; d.hunters = hunters; d.tired = d === target; }
    if (sound) sound.animal(target.sp.sound, [target.x, terrain.height(target.x, target.z) + 1, target.z]);
    onEvent(wolves ? '🐺 Wilki gonią ' + (target.kind === 'roe' ? 'sarny' : 'jelenie') + '!' : '🐻 Niedźwiedź rzuca się na ' + (target.kind === 'roe' ? 'sarny' : 'jelenie') + '!',
      { objs: [target.obj, ...hunters.map((h) => h.obj)], size: 3, dur: 12 });
  }
  function marmotsNear(cam) { return animals.filter((a) => a.kind === 'marmot' && a.state !== 'hidden' && inView(a, cam, 450)); }
  // the eagle over a hare: it runs zigzagging; if caught, it is gone
  function hareAlarm(list, caught) {
    for (const h of list) if (h !== caught && h.state !== 'hidden') {
      const a = r() * 6.28; h.state = 'flee'; h.fleeing = 6; h.target = { x: h.x + Math.sin(a) * 120, z: h.z + Math.cos(a) * 120 }; play(h, 'Gallop', 0.15);
    }
    if (caught) { caught.state = 'hidden'; caught.gone = true; caught.obj.visible = false; }
  }
  // the eagle's dive: the colony runs into the burrow; one may not make it
  function marmotAlarm(list, caught) {
    for (const m of list) if (m.state !== 'hidden') { m.state = 'home'; m.target = m.group.burrow || m.group.home; m.upWant = 0; play(m, 'Gallop', 0.15); }
    if (sound && list[0]) sound.animal('marmot', [list[0].x, terrain.height(list[0].x, list[0].z) + 0.5, list[0].z]);
    if (caught) { caught.state = 'hidden'; caught.timer = 400; caught.obj.visible = false; }
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
  // trigger(): the director's next scene now (tests)
  return { update, animals, setBirds: (b) => { birds = b; }, marmotAlarm, trigger: () => { ecoT = 0; } };
}
