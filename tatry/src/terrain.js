// Height field: 1 m tiles along the trail (GUGiK), a 4 m grid over the detailed area, blended into
// a coarse outer grid; procedural micro relief only where there is no laser-scanned terrain.
import * as THREE from 'three';
import { fbm } from './noise.js';

export class Grid {
  // data: Float32Array of metres, or Uint16Array of decimetres
  constructor(data, [w, h], [x0, z0, x1, z1]) {
    this.w = w; this.h = h;
    this.x0 = x0; this.z0 = z0; this.x1 = x1; this.z1 = z1;
    if (data instanceof Float32Array) this.data = data;
    else { this.data = new Float32Array(w * h); for (let i = 0; i < w * h; i++) this.data[i] = data[i] / 10; }
  }
  bilinear(x, z) {
    const fx = (x - this.x0) / (this.x1 - this.x0) * (this.w - 1);
    const fz = (z - this.z0) / (this.z1 - this.z0) * (this.h - 1);
    const i = Math.min(this.w - 2, Math.max(0, Math.floor(fx))), j = Math.min(this.h - 2, Math.max(0, Math.floor(fz)));
    const tx = fx - i, tz = fz - j, d = this.data, W = this.w;
    const a = d[j * W + i], b = d[j * W + i + 1], c = d[(j + 1) * W + i], e = d[(j + 1) * W + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (e - c) * tx) * tz;
  }
  inside(x, z, margin = 0) {
    return x > this.x0 + margin && x < this.x1 - margin && z > this.z0 + margin && z < this.z1 - margin;
  }
  at(i, j) {
    i = i < 0 ? 0 : i >= this.w ? this.w - 1 : i;
    j = j < 0 ? 0 : j >= this.h ? this.h - 1 : j;
    return this.data[j * this.w + i];
  }
  // Catmull-Rom bicubic sample
  sample(x, z) {
    const fx = (x - this.x0) / (this.x1 - this.x0) * (this.w - 1);
    const fz = (z - this.z0) / (this.z1 - this.z0) * (this.h - 1);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const row = (jj) => cr(this.at(i - 1, jj), this.at(i, jj), this.at(i + 1, jj), this.at(i + 2, jj), tx);
    return cr(row(j - 1), row(j), row(j + 1), row(j + 2), tz);
  }
}

function cr(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

const SHORE = 10;   // metres of the sill round a lake (setShores)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Terrain {
  // tiles: { size, origin: [x0, z0], grids: Map('i,j' -> Grid) }; dtmMask: Uint8Array on the inner grid
  constructor(inner, outer, trailMask, lakeMask, tiles = null, dtmMask = null) {
    this.inner = inner; this.outer = outer;
    this.tiles = tiles; this.dtmMask = dtmMask;
    this.trailMask = trailMask; // {data: Uint8Array, size}
    this.lakeMask = lakeMask;
  }
  maskAt(m, x, z) {
    const g = this.inner;
    const u = Math.floor((x - g.x0) / (g.x1 - g.x0) * m.size);
    const v = Math.floor((z - g.z0) / (g.z1 - g.z0) * m.size);
    if (u < 0 || v < 0 || u >= m.size || v >= m.size) return 0;
    return m.data[v * m.size + u] / 255;
  }
  base(x, z) {
    const g = this.inner;
    if (!g.inside(x, z)) return this.outer.sample(x, z);
    const edge = Math.min(x - g.x0, g.x1 - x, z - g.z0, g.z1 - z);
    if (edge >= 250) return g.sample(x, z);
    const o = this.outer.sample(x, z);
    return o + (g.sample(x, z) - o) * smooth(0, 250, edge);
  }
  tileAt(x, z) {
    if (!this.tiles) return null;
    const t = this.tiles;
    return t.grids.get(Math.floor((x - t.origin[0]) / t.size) + ',' + Math.floor((z - t.origin[1]) / t.size)) || null;
  }
  // 1 = laser-scanned terrain (GUGiK), 0 = satellite elevation model
  hasDTM(x, z) {
    if (!this.dtmMask) return 0;
    const g = this.inner;
    const i = Math.round((x - g.x0) / (g.x1 - g.x0) * (g.w - 1)), j = Math.round((z - g.z0) / (g.z1 - g.z0) * (g.h - 1));
    if (i < 0 || j < 0 || i >= g.w || j >= g.h) return 0;
    return this.dtmMask[j * g.w + i];
  }
  // Terraces levelled under buildings: [{x, z, c, s, w, d, level}] (see buildings.js)
  // kept in 64 m cells: the height is asked thousands of times a frame and there are hundreds of houses
  // (Zakopane, Kuźnice), so each call looks only at the few terraces around it
  setFlats(flats) {
    const C = 64, cells = new Map();
    for (const f of flats) {
      const b = f.blend || 6, r = Math.hypot(f.w / 2 + b, f.d / 2 + b);   // the corner of the blended rectangle
      for (let cx = Math.floor((f.x - r) / C); cx <= Math.floor((f.x + r) / C); cx++) {
        for (let cz = Math.floor((f.z - r) / C); cz <= Math.floor((f.z + r) / C); cz++) {
          const k = cx * 100003 + cz;
          let l = cells.get(k); if (!l) cells.set(k, l = []);
          l.push(f);
        }
      }
    }
    this.flats = flats.length ? { cells, C } : null;
  }
  // Lake shores: where the ground just outside a lake drops below its water (an outlet gully, the lip of a
  // waterfall, a polygon a little off the laser data) the flat water ended in the air as a straight edge;
  // a sill at the water level, fading out over SHORE m, holds it. Ring segments kept in 64 m cells.
  setShores(lakes) {
    const C = 64, cells = new Map(), B = SHORE;
    for (const l of lakes) {
      const r = l.ring;
      for (let i = 0; i + 1 < r.length; i++) {
        const [ax, az] = r[i], [bx, bz] = r[i + 1];
        for (let cx = Math.floor((Math.min(ax, bx) - B) / C); cx <= Math.floor((Math.max(ax, bx) + B) / C); cx++) {
          for (let cz = Math.floor((Math.min(az, bz) - B) / C); cz <= Math.floor((Math.max(az, bz) + B) / C); cz++) {
            const k = cx * 100003 + cz;
            let s = cells.get(k); if (!s) cells.set(k, s = []);
            s.push([l, i]);
          }
        }
      }
    }
    this.shores = lakes.length ? { cells, C } : null;
  }
  shoreAt(x, z, h) {
    const S = this.shores, l = S.cells.get(Math.floor(x / S.C) * 100003 + Math.floor(z / S.C));
    if (!l) return h;
    let best = SHORE, lake = null;
    for (const [L, i] of l) {
      if (h >= L.level + 0.25) continue;
      const [ax, az] = L.ring[i], [bx, bz] = L.ring[i + 1], dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; lake = L; }
    }
    if (!lake) return h;
    // inside the lake the bed stays under the water
    const r = lake.ring;
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
    }
    if (inside) return h;
    const k = 1 - smooth(SHORE * 0.3, SHORE, best);
    return h + (lake.level + 0.25 - h) * k;
  }
  flatten(x, z, h) {
    const F = this.flats, l = F.cells.get(Math.floor(x / F.C) * 100003 + Math.floor(z / F.C));
    if (!l) return h;
    for (const f of l) {
      const dx = x - f.x, dz = z - f.z;
      const u = Math.abs(dx * f.c - dz * f.s) - f.w / 2, v = Math.abs(dx * f.s + dz * f.c) - f.d / 2;
      const out = Math.max(u, v);
      const bl = f.blend || 6;
      if (out > bl) continue;
      const t = out <= 0 ? 1 : 1 - out / bl;
      h = h + (f.level - h) * t * t * (3 - 2 * t);
    }
    return h;
  }
  // The footpath as a bench cut into the slope: level across its width (not along it).
  // X, Z, H: centre line every metre with its smoothed height; half: half-width; str: 0..1 per point.
  setBench({ X, Z, H, half, str }) {
    const C = 4, cells = new Map();
    for (let i = 0; i < X.length - 1; i++) {
      if (str[i] <= 0 && str[i + 1] <= 0) continue;
      const r = half[i] + 1.5;
      for (let cx = Math.floor((Math.min(X[i], X[i + 1]) - r) / C); cx <= Math.floor((Math.max(X[i], X[i + 1]) + r) / C); cx++) {
        for (let cz = Math.floor((Math.min(Z[i], Z[i + 1]) - r) / C); cz <= Math.floor((Math.max(Z[i], Z[i + 1]) + r) / C); cz++) {
          const k = cx * 100003 + cz;
          let l = cells.get(k); if (!l) cells.set(k, l = []);
          l.push(i);
        }
      }
    }
    this.bench = { X, Z, H, half, str, cells, C };
  }
  benchAt(x, z, h) {
    const b = this.bench;
    const l = b.cells.get(Math.floor(x / b.C) * 100003 + Math.floor(z / b.C));
    if (!l) return h;
    let best = 1e9, bh = 0, bi = 0;
    for (const i of l) {
      const ax = b.X[i], az = b.Z[i], dx = b.X[i + 1] - ax, dz = b.Z[i + 1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; bh = b.H[i] + (b.H[i + 1] - b.H[i]) * t; bi = i; }
    }
    const k = (1 - smooth(b.half[bi], b.half[bi] + 1.3, best)) * b.str[bi];
    return k > 0 ? h + (bh - h) * k : h;
  }
  // Full height: 1 m tile if there is one, otherwise the grids plus micro relief.
  height(x, z) {
    let h = this.rawHeight(x, z);
    if (this.shores) h = this.shoreAt(x, z, h);
    if (this.flats) h = this.flatten(x, z, h);
    return this.bench ? this.benchAt(x, z, h) : h;
  }
  rawHeight(x, z) {
    const t = this.tileAt(x, z);
    if (t) {
      const h = t.bilinear(x, z);
      // lakes: the grids hold the lowered lake bed, tiles the water surface
      return this.maskAt(this.lakeMask, x, z) > 0.5 ? Math.min(h, this.base(x, z)) : h;
    }
    const b = this.base(x, z);
    if (!this.inner.inside(x, z)) return b;
    if (this.hasDTM(x, z)) return b;
    const e = 6;
    const sx = (this.base(x + e, z) - this.base(x - e, z)) / (2 * e);
    const sz = (this.base(x, z + e) - this.base(x, z - e)) / (2 * e);
    const slope = Math.hypot(sx, sz);
    const g = this.inner;
    const edge = Math.min(x - g.x0, g.x1 - x, z - g.z0, g.z1 - z);
    let amp = (0.8 + 5.5 * smooth(0.35, 1.3, slope)) * smooth(0, 250, edge);
    amp *= 1 - this.maskAt(this.trailMask, x, z);
    amp *= 1 - this.maskAt(this.lakeMask, x, z);
    if (amp <= 0.01) return b;
    // ridged-ish noise: rocky steps on steep ground
    const n = fbm(x / 46, z / 46, 4);
    return b + amp * n;
  }
  normal(x, z, e = 2) {
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    return new THREE.Vector3(-hx, 2 * e, -hz).normalize();
  }
}

// Regular grid mesh; heights from fn. Optional skirt hides cracks at the border.
// the index of a grid (and its skirt) depends only on its size: made once and shared (the 1 m patch around the
// camera is rebuilt every 90 m; building ~2 million indices each time stalled a fast walk)
const INDEX = new Map();
export function gridGeometry(x0, z0, x1, z1, nx, nz, fn, skirt = 0) {
  const verts = (nx + 1) * (nz + 1);
  const extra = skirt ? 2 * (nx + nz) * 2 : 0;
  const pos = new Float32Array((verts + extra) * 3);
  const heights = new Float32Array(verts);
  let k = 0;
  for (let j = 0; j <= nz; j++) {
    const z = z0 + (z1 - z0) * j / nz;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx;
      const y = fn(x, z);
      heights[j * (nx + 1) + i] = y;
      pos[k++] = x; pos[k++] = y; pos[k++] = z;
    }
  }
  const key = `${nx},${nz},${skirt ? 1 : 0}`, cached = INDEX.get(key), idx = cached ? null : [];
  if (!cached) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  if (skirt) {
    // walk the border, duplicate each vertex lowered by `skirt`
    const border = [];
    for (let i = 0; i <= nx; i++) border.push(i);
    for (let j = 1; j <= nz; j++) border.push(j * (nx + 1) + nx);
    for (let i = nx - 1; i >= 0; i--) border.push(nz * (nx + 1) + i);
    for (let j = nz - 1; j >= 0; j--) border.push(j * (nx + 1));
    let v = verts;
    const first = v;
    for (let n = 0; n < border.length; n++) {
      const s = border[n];
      pos[v * 3] = pos[s * 3]; pos[v * 3 + 1] = pos[s * 3 + 1] - skirt; pos[v * 3 + 2] = pos[s * 3 + 2];
      if (n > 0 && idx) { const a = border[n - 1], b = s, c = v - 1, d = v; idx.push(a, b, c, b, d, c); }
      v++;
    }
    void first;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  let index = cached;
  if (!index) { index = new THREE.BufferAttribute(verts + extra > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1); INDEX.set(key, index); }
  g.setIndex(index);
  // normals from the height differences of the grid (central differences): the same as averaging the faces,
  // a fraction of the work; the skirt takes the normal of the edge vertex it hangs from
  const nor = new Float32Array(pos.length), W = nx + 1, sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const a = j * W + i;
    const hx = (heights[j * W + Math.min(nx, i + 1)] - heights[j * W + Math.max(0, i - 1)]) / (sx * (Math.min(nx, i + 1) - Math.max(0, i - 1)));
    const hz = (heights[Math.min(nz, j + 1) * W + i] - heights[Math.max(0, j - 1) * W + i]) / (sz * (Math.min(nz, j + 1) - Math.max(0, j - 1)));
    const l = Math.hypot(hx, 1, hz);
    nor[a * 3] = -hx / l; nor[a * 3 + 1] = 1 / l; nor[a * 3 + 2] = -hz / l;
  }
  if (skirt) {
    let v = verts;
    const edge = (s) => { nor[v * 3] = nor[s * 3]; nor[v * 3 + 1] = nor[s * 3 + 1]; nor[v * 3 + 2] = nor[s * 3 + 2]; v++; };
    for (let i = 0; i <= nx; i++) edge(i);
    for (let j = 1; j <= nz; j++) edge(j * W + nx);
    for (let i = nx - 1; i >= 0; i--) edge(nz * W + i);
    for (let j = nz - 1; j >= 0; j--) edge(j * W);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.userData = { heights, nx, nz, x0, z0, x1, z1 };
  return g;
}

// Height of the rendered (triangulated) surface, so the camera never dips into it.
export function meshHeight(g, x, z) {
  const { heights, nx, nz, x0, z0, x1, z1 } = g.userData;
  const fx = (x - x0) / (x1 - x0) * nx, fz = (z - z0) / (z1 - z0) * nz;
  const i = Math.min(nx - 1, Math.max(0, Math.floor(fx))), j = Math.min(nz - 1, Math.max(0, Math.floor(fz)));
  const tx = fx - i, tz = fz - j, W = nx + 1;
  const a = heights[j * W + i], b = heights[j * W + i + 1], c = heights[(j + 1) * W + i], d = heights[(j + 1) * W + i + 1];
  // triangles (a,c,b) and (b,c,d)
  return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}
