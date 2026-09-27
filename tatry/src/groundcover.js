// Ground cover near the camera: grass clumps and ferns (impostors baked from Poly Haven models).
// Placed on a fixed jittered grid (the same clump always stands at the same spot), chosen by what the
// orthophoto and the land-cover map say about the ground, rebuilt when the camera has moved.
import { impostorMesh, setImpostors } from './impostor.js';

const hash = (i, j, k) => {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function buildGroundCover({ scene, terrain, kinds, photo, land, bounds, masks, blocked = () => false, quality }) {
  const R = quality === 'low' ? 26 : 42, CELL = quality === 'low' ? 0.95 : 0.7;
  const GRASS_ROWS = [0, 1, 6, 7, 9, 10]; // clumps; the other baked variants are single blades or flower heads
  const LOW_GRASS = [9, 10];            // short dense clumps: forest floor and moss-and-lichen zone
  const cap = Math.ceil(Math.PI * R * R / (CELL * CELL));
  const meshes = {
    grass: impostorMesh(kinds.grass, [], cap),
    fern: impostorMesh(kinds.fern, [], Math.ceil(cap / 6)),
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
    const out = { grass: [], fern: [] };
    const i0 = Math.floor((cx - R) / CELL), i1 = Math.ceil((cx + R) / CELL);
    const j0 = Math.floor((cz - R) / CELL), j1 = Math.ceil((cz + R) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + hash(i, j, 1)) * CELL, z = (j + hash(i, j, 2)) * CELL;
      const d = Math.hypot(x - cx, z - cz);
      if (d > R) continue;
      if (terrain.maskAt(masks.path, x, z) > 0.02 || terrain.maskAt(masks.lake, x, z) > 0.02 || blocked(x, z)) continue;
      const o = px(photo, x, z);
      if (o === null) continue;
      const r = photo.d[o], g = photo.d[o + 1], b = photo.d[o + 2];
      const lo = px(land, x, z);
      const lc = lo === null ? 0 : land.d[lo];
      const y = terrain.height(x, z);
      const forest = lc === 10 && y < 1600;
      // ESA WorldCover: 20 shrubs, 30 grassland, 90 wetland, 100 moss and lichen; the photo decides
      // between grass and bare rock inside those (olive and yellowish grass counts as green too)
      const vegetated = lc === 20 || lc === 30 || lc === 90 || (lc === 100 && hash(i, j, 5) < 0.5);
      const green = (g > r - 6 && g > b + 4 && g > 45) || (vegetated && g > b && g > 40);
      const n = terrain.normal(x, z, 1.5);
      if (n.y < 0.62) continue;                    // walls and steep slabs stay bare
      const fade = Math.min(1, (R - d) / 8);        // shrink into the distance instead of popping
      const p = hash(i, j, 3), q = hash(i, j, 4);
      if (forest) {
        if (p < 0.1) out.fern.push(place(kinds.fern, Math.floor(q * kinds.fern.meta.rows), x, y, z, (0.45 + q * 0.4) * fade, i, j, n.y));
        else if (p < 0.4) out.grass.push(place(kinds.grass, LOW_GRASS[Math.floor(q * LOW_GRASS.length)], x, y, z, (0.35 + q * 0.35) * fade, i, j, n.y));
      } else if (green) {
        if (p < 0.62 * Math.min(1, (n.y - 0.62) * 4)) out.grass.push(place(kinds.grass, GRASS_ROWS[Math.floor(q * GRASS_ROWS.length)], x, y, z, (0.55 + q * 0.6) * fade, i, j, n.y));
      } else if (p < 0.07) {
        // a tuft here and there between the stones
        out.grass.push(place(kinds.grass, GRASS_ROWS[Math.floor(q * GRASS_ROWS.length)], x, y, z, (0.35 + q * 0.35) * fade, i, j, n.y));
      }
    }
    for (const k of Object.keys(meshes)) setImpostors(meshes[k], out[k]);
  }
  return { update, meshes };
}
