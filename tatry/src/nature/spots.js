// Where the catalogue's plants and animals are found along a route: for every species, points near the
// trail whose ground matches its habitat (elevation, the 1 m class map, beside a stream, at a lake,
// limestone, near the highest summits). Seeded by the species, so a plant always grows in the same place.
// Common species get several spots along a route, the rarest one at most.
import { CATALOG } from './catalog.js';
import { rng } from '../noise.js';

// the local frame (tools/prepare.py): x east, z south, metres from the Rysy area's centre
const LON0 = 20.076, LAT0 = 49.191, MX = 111320 * Math.cos(LAT0 * Math.PI / 180), MZ = 110574;
const lonlat = (x, z) => [LON0 + x / MX, LAT0 - z / MZ];
// limestone: the northern belt of the Tatras (reglowe hills, Giewont, Kasprowy's northern slopes);
// the High Tatras are granite
const isLime = (x, z) => { const [lon, lat] = lonlat(x, z); return lat > 49.235 && lon < 20.06; };

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function buildSpots({ trail, terrain, groundClass, meta }) {
  const N = trail.X.length, step = trail.step;
  // the lakes and streams near the route, as bounding-boxed shapes
  const [bx0, bz0, bx1, bz1] = [Math.min(...trail.X) - 300, Math.min(...trail.Z) - 300, Math.max(...trail.X) + 300, Math.max(...trail.Z) + 300];
  const near = (xs, zs) => xs.some((x, i) => x > bx0 && x < bx1 && zs[i] > bz0 && zs[i] < bz1);
  const lakes = (meta.lakes || []).filter((l) => near(l.ring.map((p) => p[0]), l.ring.map((p) => p[1])));
  const streams = (meta.streams || []).filter((s) => near(s.pts.map((p) => p[0]), s.pts.map((p) => p[1])));
  const peaks = (meta.labels || []).filter((l) => l.kind === 'peak' && l.ele > 2300);
  const byStream = (x, z, r) => streams.some((s) => s.pts.some((p, i) => i && segDist(x, z, s.pts[i - 1][0], s.pts[i - 1][1], p[0], p[1]) < r));
  const lakeAt = (x, z, r, name) => lakes.some((l) => (!name || l.name === name) && (inRing(x, z, l.ring)
    || l.ring.some((p, i) => i && segDist(x, z, l.ring[i - 1][0], l.ring[i - 1][1], p[0], p[1]) < r)));

  const spots = [];
  const want = [0, 3, 2, 1, 1];
  const every = Math.max(1, Math.round(12 / step));
  for (const sp of CATALOG) {
    const r = rng([...sp.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
    const fauna = sp.kind === 'fauna', bird = sp.group === 'bird', aquatic = sp.on.length === 1 && sp.on[0] === 1;
    const [d0, d1] = aquatic ? [2, 60] : bird ? [20, 150] : fauna ? [12, 90] : [3, 28];
    const cand = [];
    for (let i = Math.floor(r() * every); i < N && cand.length < 60; i += every) {
      for (let k = 0; k < 2; k++) {
        const d = d0 + r() * (d1 - d0), a = r() * 6.2832;
        const x = trail.X[i] + Math.cos(a) * d, z = trail.Z[i] + Math.sin(a) * d;
        const h = terrain.height(x, z);
        if (h < sp.ele[0] || h > sp.ele[1]) continue;
        const gc = groundClass(x, z);
        if (!gc || !sp.on.includes(gc.c)) continue;
        if (sp.lime && !isLime(x, z)) continue;
        if (sp.stream && !sp.lake && !byStream(x, z, aquatic ? 6 : 25)) continue;
        if (sp.lake && !sp.stream && !lakeAt(x, z, 25, typeof sp.lake === 'string' ? sp.lake : null)) continue;
        if (sp.lake && sp.stream && !(byStream(x, z, 8) || lakeAt(x, z, 8))) continue;
        if (sp.peak && !peaks.some((p) => Math.hypot(p.x - x, p.z - z) < 250)) continue;
        cand.push({ id: sp.id, x, z, y: h, s: i * step });
        break;
      }
    }
    // spread along the route: the picked spots at least 400 m of trail apart
    const n = want[sp.rarity];
    const picked = [];
    for (let t = 0; t < cand.length * 3 && picked.length < n; t++) {
      const c = cand[Math.floor(r() * cand.length)];
      if (picked.every((p) => Math.abs(p.s - c.s) > 400)) picked.push(c);
    }
    spots.push(...picked);
  }
  return spots;
}
