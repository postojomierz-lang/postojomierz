// Forest: spruces, young spruces and dwarf pine as impostors baked from Poly Haven models (see impostor.js).
import { rng } from './noise.js';
import { impostorMesh } from './impostor.js';

// ---------------------------------------------------------------- forest with distance LOD
export function buildForest({ scene, env, spruce, pine, quality, kinds, ground }) {
  const r = rng(21);

  // spruces (and young spruces near the upper tree line): baked impostors of the Poly Haven models
  const n = spruce.length / 4; // x, y, z, 1 if the ground height includes the canopy
  const trees = [], young = [];
  const sv = kinds.spruce.meta.variants, yv = kinds.sapling.meta.variants;
  for (let k = 0; k < n; k++) {
    const x = spruce[k * 4], y = spruce[k * 4 + 1], z = spruce[k * 4 + 2], canopy = spruce[k * 4 + 3];
    // towards the tree line (≈1550 m) the forest thins into smaller, younger trees
    const high = Math.min(1, Math.max(0, (y - 1430) / 120));
    const isYoung = r() < 0.12 + 0.6 * high;
    const list = isYoung ? young : trees, vars = isYoung ? yv : sv;
    const row = Math.floor(r() * vars.length), v = vars[row];
    const target = isYoung ? 4 + r() * 5 : (1 - 0.35 * high) * (17 + r() * 13);
    const s = target / v.height;
    list.push({ x, y: y - (canopy ? target * 0.4 : 0.3) - v.base * s, z, w: v.width * s * (0.9 + r() * 0.2), h: v.height * s,
      row, rot: r() * 6.283, tint: r(), wind: isYoung ? 1.2 : 0.8 });
  }
  const treeMesh = impostorMesh(kinds.spruce, trees);
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
    const m = 1 + Math.floor(r() * (quality === 'low' ? 2 : quality === 'ultra' ? 3.6 : 3) * (1 - 0.5 * high));
    for (let c = 0; c < m; c++) {
      const x = x0 + (r() - 0.5) * 7, z = z0 + (r() - 0.5) * 7;
      const y = ground(x, z);
      if (y === null) continue;
      const row = Math.floor(r() * mv.length), v = mv[row];
      const target = (1.3 + r() * 1.2) * (1 - 0.35 * high);
      const sc = target / v.height;
      mugo.push({ x, y: y - v.base * sc - 0.15, z, w: v.width * sc * (0.85 + r() * 0.3), h: v.height * sc, row, rot: r() * 6.283, tint: r(), wind: 0.5 });
    }
  }
  const mugoMesh = impostorMesh(kinds.mugo, mugo);
  scene.add(mugoMesh);

  function update() {}
  return { update, counts: { spruce: trees.length, young: young.length, mugo: mugo.length }, mugoMesh };
}
