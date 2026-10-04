// Forest: spruces, young spruces and dwarf pine as impostors baked from Poly Haven models (see impostor.js).
import { rng } from './noise.js';
import { impostorMesh } from './impostor.js';

// ---------------------------------------------------------------- forest with distance LOD
export function buildForest({ scene, env, spruce, pine, quality, kinds, ground }) {
  const r = rng(21);

  // spruces (and young spruces near the upper tree line): baked impostors of the Poly Haven models
  // x, y, z, 1 if the ground height includes the canopy (2: a tree planted for a trail mark, bare trunk below), the measured height (lidar) or 0, the species
  // (0 spruce, 1 dead spruce, 2 stone pine, 3 rowan)
  const n = spruce.length / 6;
  const trees = [], young = [], dead = [], limba = [], rowan = [];
  const sv = kinds.spruce.meta.variants, yv = kinds.sapling.meta.variants;
  for (let k = 0; k < n; k++) {
    const x = spruce[k * 6], y = spruce[k * 6 + 1], z = spruce[k * 6 + 2], canopy = spruce[k * 6 + 3], real = spruce[k * 6 + 4];
    const sp = kinds.deadspruce && kinds.limba && kinds.rowan ? spruce[k * 6 + 5] : 0;
    // towards the tree line (≈1550 m) the forest thins into smaller, younger trees
    const high = Math.min(1, Math.max(0, (y - 1430) / 120));
    if (sp) {
      // dead spruces, stone pines and rowans: impostors only (no 3D version near the camera yet)
      const kind = [null, kinds.deadspruce, kinds.limba, kinds.rowan][sp], vars = kind.meta.variants;
      const row = Math.floor(r() * vars.length), v = vars[row];
      // stone pines stay lower and broader than spruces of the same lidar height
      const target = Math.min(sp === 3 ? 9 : 40, real || [0, 14 + r() * 12, 8 + r() * 6, 4 + r() * 4][sp]);
      const s = target / v.height;
      [null, dead, limba, rowan][sp].push({ x, y: y - (canopy ? target * 0.4 : 0.3) - v.base * s, z, w: v.width * s * (0.9 + r() * 0.2),
        h: v.height * s, row, rot: r() * 6.283, tint: r(), wind: 0.6 });
      continue;
    }
    const isYoung = real ? real < 9 : r() < 0.12 + 0.6 * high;
    const list = isYoung ? young : trees, vars = isYoung ? yv : sv;
    const row = Math.floor(r() * vars.length), v = vars[row];
    const target = real || (isYoung ? 4 + r() * 5 : (1 - 0.35 * high) * (17 + r() * 13));
    const s = target / v.height;
    const w = v.width * s * (0.9 + r() * 0.2), ty = y - (canopy === 1 ? target * 0.4 : 0.3);
    // ty, th, cw: foot, height and crown width of the 3D tree that replaces it near the camera
    list.push({ x, y: ty - v.base * s, z, w, h: v.height * s, row, rot: r() * 6.283, tint: r(), wind: isYoung ? 1.2 : 0.8,
      ty, th: target, cw: w * 0.9, bare: canopy === 2 });     // canopy 2: a tree carrying a trail mark (trailmarks.js)
  }
  const treeMesh = impostorMesh(kinds.spruce, trees);
  if (dead.length) scene.add(impostorMesh(kinds.deadspruce, dead));
  if (limba.length) scene.add(impostorMesh(kinds.limba, limba));
  if (rowan.length) scene.add(impostorMesh(kinds.rowan, rowan));
  const youngMesh = impostorMesh(kinds.sapling, young);
  scene.add(treeMesh, youngMesh);

  // dwarf pine (kosodrzewina): impostors of clumps composed from pine saplings in Blender
  // (tools/blender/make_dwarfpine.py); two or three clumps per land-cover point so they close
  // into thickets, lower and sparser towards 1900 m
  const mugo = [], mv = kinds.mugo.meta.variants;
  const pn = pine.length / 3;
  for (let k = 0; k < pn; k++) {
    const x0 = pine[k * 3], y0 = pine[k * 3 + 1], z0 = pine[k * 3 + 2];
    const high = Math.min(1, Math.max(0, (y0 - 1650) / 250));
    const m = 1 + Math.floor(r() * ({ low: 2, mid: 2.5, high: 3, ultra: 3.6 }[quality] ?? 3) * (1 - 0.5 * high));
    for (let c = 0; c < m; c++) {
      const x = x0 + (r() - 0.5) * 7, z = z0 + (r() - 0.5) * 7;
      const y = ground(x, z);
      if (y === null) continue;
      const row = Math.floor(r() * mv.length), v = mv[row];
      const target = (1.3 + r() * 1.2) * (1 - 0.35 * high);
      const sc = target / v.height;
      const w = v.width * sc * (0.85 + r() * 0.3);
      // ty, th, cw: foot, height and width of the 3D clump that replaces it near the camera
      mugo.push({ x, y: y - v.base * sc - 0.15, z, w, h: v.height * sc, row, rot: r() * 6.283, tint: r(), wind: 0.5, ty: y - 0.15, th: target, cw: w });
    }
  }
  const mugoMesh = impostorMesh(kinds.mugo, mugo);
  scene.add(mugoMesh);

  function update() {}
  return { update, counts: { spruce: trees.length, young: young.length, dead: dead.length, limba: limba.length, rowan: rowan.length, mugo: mugo.length }, mugoMesh, trees, young, mugo, dead, limba, rowan };
}
