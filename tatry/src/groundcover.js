// Ground cover near the camera: grass clumps, ferns, flowers and sorrel (impostors baked from
// Poly Haven models). Placed on a fixed jittered grid (the same clump always stands at the same spot),
// chosen by what the orthophoto and the land-cover map say about the ground, rebuilt when the camera
// has moved. A second, sparser ring of bigger clumps carries the cover further out.
import { impostorMesh, setImpostors } from './impostor.js';

const hash = (i, j, k) => {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function buildGroundCover({ scene, terrain, kinds, photo, land, bounds, masks, blocked = () => false, nearHut = () => false, quality, groundClass = () => null }) {
  const t = (low, mid, high, ultra) => ({ low, mid, high, ultra })[quality] ?? high;
  const R = t(26, 34, 42, 60), CELL = t(0.95, 0.8, 0.7, 0.6);
  const R2 = t(70, 80, 95, 160), CELL2 = t(2.6, 2.3, 2.0, 1.8);   // outer ring
  // herb atlas rows: 0 small shrub (unused, reads as dry twigs), 1-4 sorrel (Rumex, round the huts), 5-8 yellow flowers
  const SORREL = [1, 2, 3, 4], FLOWERS = [5, 6, 7, 8];
  const GRASS_ROWS = [0, 1, 6, 7, 9, 10]; // clumps; the other baked variants are single blades or flower heads
  const LOW_GRASS = [9, 10];            // short dense clumps: forest floor and moss-and-lichen zone
  const cap = Math.ceil(Math.PI * R * R / (CELL * CELL)), cap2 = Math.ceil(Math.PI * R2 * R2 / (CELL2 * CELL2));
  const meshes = {
    grass: impostorMesh(kinds.grass, [], cap + cap2),
    fern: impostorMesh(kinds.fern, [], Math.ceil((cap + cap2) / 5)),
    herb: impostorMesh(kinds.herb, [], Math.ceil((cap + cap2) / 3)),
  };
  for (const m of Object.values(meshes)) { m.castShadow = false; scene.add(m); }

  const [x0, z0, x1, z1] = bounds;
  const px = (img, x, z) => {
    const u = Math.floor((x - x0) / (x1 - x0) * img.w), v = Math.floor((z - z0) / (z1 - z0) * img.h);
    if (u < 0 || v < 0 || u >= img.w || v >= img.h) return null;
    return (v * img.w + u) * 4;
  };
  const place = (kind, row, x, y, z, size, i, j, ny = 1) => {
    const v = kind.meta.variants[row];
    const s = size / Math.max(v.width, v.height);
    // the card's bottom edge is level: on a slope sink it so the uphill half is not hanging in the air
    const sink = 0.5 * v.width * s * Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 0.3);
    return { x, y: y - v.base * s - 0.04 - sink * 0.6, z, w: v.width * s, h: v.height * s, row, rot: hash(i, j, 7) * 6.283, tint: hash(i, j, 8), wind: 1 };
  };

  let last = { x: Infinity, z: Infinity };
  function update(cx, cz) {
    if (Math.hypot(cx - last.x, cz - last.z) < R * 0.3) return;
    last = { x: cx, z: cz };
    const out = { grass: [], fern: [], herb: [] };
    // inner disc: every cell; outer ring: coarser cells, only the bigger plants, a little larger
    for (const [cell, r0, r1, ring] of [[CELL, 0, R, 0], [CELL2, R - 4, R2, 1]]) {
      const i0 = Math.floor((cx - r1) / cell), i1 = Math.ceil((cx + r1) / cell);
      const j0 = Math.floor((cz - r1) / cell), j1 = Math.ceil((cz + r1) / cell);
      const hk = ring * 20;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = (i + hash(i, j, 1 + hk)) * cell, z = (j + hash(i, j, 2 + hk)) * cell;
        const d = Math.hypot(x - cx, z - cz);
        if (d > r1 || d < r0) continue;
        if (terrain.maskAt(masks.path, x, z) > 0.02 || terrain.maskAt(masks.lake, x, z) > 0.02 || blocked(x, z)) continue;
        const o = px(photo, x, z);
        if (o === null) continue;
        const r = photo.d[o], g = photo.d[o + 1], b = photo.d[o + 2];
        const lo = px(land, x, z);
        const lc = lo === null ? 0 : land.d[lo];
        const y = terrain.height(x, z);
        let forest = lc === 10 && y < 1600;
        // ESA WorldCover: 20 shrubs, 30 grassland, 90 wetland, 100 moss and lichen; the photo decides
        // between grass and bare rock inside those (olive and yellowish grass counts as green too)
        const vegetated = lc === 20 || lc === 30 || lc === 90 || (lc === 100 && hash(i, j, 5) < 0.5);
        let green = (g > r - 6 && g > b + 4 && g > 45) || (vegetated && g > b && g > 40);
        // the 1 m ground map where there is one (tools/prepare_classes.py) decides instead of the colours
        const gc = groundClass(x, z);
        if (gc) {
          if (gc.c === 1 || gc.c === 2 || gc.c === 7) continue;          // water, rock faces, snow: bare
          forest = gc.c === 5 || gc.c === 6;                           // under the pines and trees: ferns, low grass
          green = gc.c === 4 || (gc.c === 8 && hash(i, j, 11) < 0.25);  // meadows; a little on gravel
        }
        const n = terrain.normal(x, z, 1.5);
        if (n.y < 0.62) continue;                    // walls and steep slabs stay bare
        // shrink into the distance instead of popping (inner disc at its edge, the ring at both)
        const fade = ring ? Math.min(1, (d - r0) / 6, (r1 - d) / 10) : Math.min(1, (R - d) / 8);
        if (fade <= 0.05) continue;
        const p = hash(i, j, 3 + hk), q = hash(i, j, 4 + hk);
        const big = ring ? 1.35 : 1;
        const G = (rows, lo, hi) => place(kinds.grass, rows[Math.floor(q * rows.length)], x, y, z, (lo + q * hi) * fade * big, i, j, n.y);
        const H = (row, lo, hi) => place(kinds.herb, row, x, y, z, (lo + q * hi) * fade * big, i, j, n.y);
        if (forest) {
          if (p < 0.2) out.fern.push(place(kinds.fern, Math.floor(q * kinds.fern.meta.rows), x, y, z, (0.45 + q * 0.45) * fade * big, i, j, n.y));
          else if (p < (ring ? 0.35 : 0.65)) out.grass.push(G(LOW_GRASS, 0.35, 0.35));
        } else if (green) {
          if (!ring && nearHut(x, z) && p > 0.9) out.herb.push(H(SORREL[Math.floor(q * 4)], 0.6, 0.5));
          else if (!ring && y < 2050 && p > 0.68 && p < 0.74) out.herb.push(H(FLOWERS[Math.floor(q * 4)], 0.22, 0.2));
          else if (p < (ring ? 0.35 : 0.62) * Math.min(1, (n.y - 0.62) * 4)) out.grass.push(G(GRASS_ROWS, 0.55, 0.6));
        } else if (!ring && p < 0.07) {
          // a tuft here and there between the stones
          out.grass.push(G(GRASS_ROWS, 0.35, 0.35));
        }
      }
    }
    for (const k of Object.keys(meshes)) setImpostors(meshes[k], out[k]);
  }
  return { update, meshes };
}
