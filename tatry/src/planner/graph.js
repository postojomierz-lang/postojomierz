// Routing over the marked trails (tools/prepare_trails.py): every vertex (~10 m apart) is a node,
// neighbours along the trail are linked. The cost of a step is its walking time by PTTK-style norms,
// so the planner picks the quickest way, not the shortest, and uphill differs from downhill.

// minutes for a step of `dist` metres climbing `dh` metres (same norms as the signposts in 3D);
// the norms (tools/calibrate_times.mjs fits them to the signpost times in tools/reference_times.json):
// flat pace (km/h), minutes per 100 m of ascent / descent, steeper rates beyond the steep gradients
export const NORMS = { flat: 5.5, up: 10, upSteep: 16.7, down: 4.5, downSteep: 11, steepUp: 0.35, steepDown: 0.3 };
export function setNorms(n) { Object.assign(NORMS, n); }
export function stepMinutes(dist, dh) {
  const N = NORMS;
  let t = dist / (N.flat * 1000) * 60;
  const g = dh / Math.max(dist, 1);
  if (dh > 0) t += dh / 100 * (g > N.steepUp ? N.upSteep : N.up);
  else t += -dh / 100 * (g < -N.steepDown ? N.downSteep : N.down);
  return t;
}

import { CORRECTIONS, LINKS } from './corrections.js';

const ROADS = new Set(['primary', 'secondary', 'tertiary']);
const CLOSE_OK = 200;   // m of a closed trail allowed next to a stop (route)
const COLOUR_NAME = { red: 'czerwony', blue: 'niebieski', green: 'zielony', yellow: 'żółty', black: 'czarny' };

export class TrailGraph {
  constructor(data) {
    this.data = data;
    const V = data.v, n = V.length;
    const lat0 = (data.region[1] + data.region[3]) / 2;
    this.mx = 111320 * Math.cos(lat0 * Math.PI / 180); this.mz = 110540;
    // heights smoothed along each trail (~60 m): the 1 m lidar has every stone in it, which would
    // add up to far too much climbing; junctions keep their own height
    this.H = new Float32Array(n);
    for (let i = 0; i < n; i++) this.H[i] = V[i][2];
    for (const e of data.e) {
      const h = e.v.map((i) => V[i][2]);
      for (let k = 1; k < e.v.length - 1; k++) {
        let sum = 0, c = 0;
        for (let j = Math.max(0, k - 3); j <= Math.min(e.v.length - 1, k + 3); j++) { sum += h[j]; c++; }
        this.H[e.v[k]] = sum / c;
      }
    }
    this.adj = Array.from({ length: n }, () => []);
    this.edgeOf = new Int32Array(n).fill(-1);          // an edge each vertex belongs to (colours, names)
    data.e.forEach((e, ei) => {
      for (let k = 0; k < e.v.length; k++) {
        const a = e.v[k];
        if (this.edgeOf[a] < 0 || k > 0 && k < e.v.length - 1) this.edgeOf[a] = ei;
        if (k) this.link(e.v[k - 1], a, ei);
      }
    });
    // roads with traffic (a voivodeship road by Kiry on Szlak Maryjny): the route keeps to a trail beside
    // them when there is one; the time shown stays the walking time
    this.pen = Float32Array.from(data.e, (e) => (ROADS.has(e.h) ? 1.3 : 1));
    this.heal();
    this.mainPart();
    this.applyCorrections();
    // grid index for snapping
    this.cell = 0.003;
    this.grid = new Map();
    for (let i = 0; i < n; i++) {
      const key = this.key(V[i][0], V[i][1]);
      let l = this.grid.get(key); if (!l) this.grid.set(key, l = []);
      l.push(i);
    }
  }
  // gaps in the data: the dead end of a trail within 30 m of another trail's point is joined to it, and the
  // known larger gaps (corrections.js, LINKS) get a link
  heal() {
    const V = this.data.v, cell = 0.0006, grid = new Map();
    const key = (lon, lat) => Math.floor(lon / cell) * 1000003 + Math.floor(lat / cell);
    this.data.e.forEach((e, ei) => { for (const i of e.v) { const k = key(V[i][0], V[i][1]); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push([i, ei]); } });
    const nearest = (lon, lat, maxM, skipEdge = -1, skip = -1) => {
      let best = -1, bd = maxM;
      const ci = Math.floor(lon / cell), cj = Math.floor(lat / cell), r = Math.ceil(maxM / 40);
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        for (const [i, ei] of grid.get((ci + di) * 1000003 + cj + dj) || []) {
          if (ei === skipEdge || i === skip) continue;
          const d = Math.hypot((V[i][0] - lon) * this.mx, (V[i][1] - lat) * this.mz);
          if (d < bd) { bd = d; best = i; }
        }
      }
      return best;
    };
    this.healed = 0;
    this.data.e.forEach((e, ei) => {
      for (const a of [e.v[0], e.v[e.v.length - 1]]) {
        if (this.adj[a].length !== 1) continue;                  // not a dead end
        const b = nearest(V[a][0], V[a][1], 30, ei, a);
        if (b >= 0 && !this.adj[a].some((x) => x[0] === b)) { this.link(a, b, ei); this.healed++; }
      }
    });
    for (const L of LINKS) {
      const a = nearest(L.a[0], L.a[1], 60), b = nearest(L.b[0], L.b[1], 60);
      if (a >= 0 && b >= 0 && a !== b) this.link(a, b, this.edgeOf[a]);
    }
  }
  // difficult passages: slower by a factor, some walked one way only (corrections.js); the stretch is
  // the quickest way from a to b before any correction, restricted to its own trails (route with a
  // cap on length, so a bad point cannot mark half the network)
  applyCorrections() {
    this.corrected = [];
    for (const c of CORRECTIONS) {
      const s = this.snapAny(c.a[0], c.a[1], 80), t = this.snapAny(c.b[0], c.b[1], 80);
      if (s < 0 || t < 0) continue;
      const p = this.route(s, t);
      if (!p || p.length > 800) continue;
      for (let k = 1; k < p.length; k++) {
        const fw = this.adj[p[k - 1]].find((x) => x[0] === p[k]);
        const bw = this.adj[p[k]].find((x) => x[0] === p[k - 1]);
        if (fw) fw[1] *= c.factor;
        // one way: not on the first and last ~40 m nor within ~30 m of any junction on the way, where
        // other trails meet or cross it (Zawrat, Kozia Przełęcz, the huts)
        let inner = k > 4 && k < p.length - 4;
        for (let j = Math.max(0, k - 3); j <= Math.min(p.length - 1, k + 2) && inner; j++) if (this.adj[p[j]].length > 2) inner = false;
        if (bw) bw[1] = c.oneway && inner ? Infinity : bw[1] * c.factor;
      }
      this.corrected.push({ name: c.name, from: s, to: t, steps: p.length - 1 });
    }
  }
  // seasonal closures (prepare_trails.py: the edge's z = [from, to], month * 100 + day): on the day of the walk
  // the quickest way avoids them; true when the set of closed trails changed
  setDate(date) {
    const md = date ? (date.getMonth() + 1) * 100 + date.getDate() : 0;
    const shut = (z) => !!md && (z[0] <= z[1] ? md >= z[0] && md <= z[1] : md >= z[0] || md <= z[1]);
    const closed = this.data.e.map((e) => (e.z && shut(e.z) ? 1 : 0));
    const key = closed.join('');
    if (key === this.closedKey) return false;
    this.closedKey = key;
    this.closed = closed.some(Boolean) ? closed : null;
    return true;
  }
  snapAny(lon, lat, maxM) {
    const V = this.data.v; let best = -1, bd = maxM;
    for (let i = 0; i < V.length; i++) { const d = Math.hypot((V[i][0] - lon) * this.mx, (V[i][1] - lat) * this.mz); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  // the largest connected part of the network: clicks snap only to it (the rest are trail ends cut
  // off at the border of the area)
  mainPart() {
    const n = this.data.v.length, comp = new Int32Array(n).fill(-1);
    let best = -1, bestSize = 0, c = 0;
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0) continue;
      const st = [i]; comp[i] = c; let k = 0;
      while (st.length) { const u = st.pop(); k++; for (const [v] of this.adj[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } }
      if (k > bestSize) { bestSize = k; best = c; }
      c++;
    }
    this.inMain = (i) => comp[i] === best;
  }
  key(lon, lat) { return Math.floor(lon / this.cell) * 100000 + Math.floor(lat / this.cell); }
  dist(a, b) {
    const V = this.data.v;
    return Math.hypot((V[b][0] - V[a][0]) * this.mx, (V[b][1] - V[a][1]) * this.mz);
  }
  link(a, b, ei) {
    const d = this.dist(a, b), dh = this.H[b] - this.H[a];
    this.adj[a].push([b, stepMinutes(d, dh), ei]);
    this.adj[b].push([a, stepMinutes(d, -dh), ei]);
  }
  // nearest vertex to a point (within ~maxM metres), or -1
  snap(lon, lat, maxM = 400) {
    const V = this.data.v;
    let best = -1, bd = maxM;
    const ci = Math.floor(lon / this.cell), cj = Math.floor(lat / this.cell), r = Math.ceil(maxM / 200);
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      for (const i of this.grid.get((ci + di) * 100000 + cj + dj) || []) {
        if (!this.inMain(i)) continue;
        const d = Math.hypot((V[i][0] - lon) * this.mx, (V[i][1] - lat) * this.mz);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }
  // all vertices within maxM metres of a point, nearest first: [[vertex, metres], ...]
  near(lon, lat, maxM = 250) {
    const V = this.data.v, out = [];
    const ci = Math.floor(lon / this.cell), cj = Math.floor(lat / this.cell), r = Math.ceil(maxM / 200);
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      for (const i of this.grid.get((ci + di) * 100000 + cj + dj) || []) {
        if (!this.inMain(i)) continue;
        const d = Math.hypot((V[i][0] - lon) * this.mx, (V[i][1] - lat) * this.mz);
        if (d < maxM) out.push([i, d]);
      }
    }
    return out.sort((a, b) => a[1] - b[1]);
  }
  // walking minutes from vertex s to every vertex (Infinity where it cannot be reached)
  times(s) {
    const n = this.data.v.length, dist = new Float64Array(n).fill(Infinity), heap = [[0, s]];
    dist[s] = 0;
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
      return top;
    };
    while (heap.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      for (const [v, w, ei] of this.adj[u]) { if (this.closed && this.closed[ei]) continue; const nd = d + w * this.pen[ei]; if (nd < dist[v]) { dist[v] = nd; push([nd, v]); } }
    }
    return dist;
  }
  // quickest path from vertex s to t: list of vertices, or null
  // (around the trails closed on the day; through them only when there is no other way, summary.closed says so)
  // A stop may lie on a closed trail itself (a hut's point on the closed way to the next valley): the first
  // and last CLOSE_OK m around it stay open, the way to the nearest junction.
  route(s, t) {
    if (this.closed) {
      const ok = new Set([...this.around(s, CLOSE_OK), ...this.around(t, CLOSE_OK)]);
      const p = this.search(s, t, this.closed, ok);
      if (p) return p;
    }
    return this.search(s, t, null);
  }
  around(s, maxM) {
    const seen = new Map([[s, 0]]), st = [s];
    while (st.length) {
      const u = st.pop(), du = seen.get(u);
      for (const [v] of this.adj[u]) {
        const d = du + this.dist(u, v);
        if (d <= maxM && !(seen.get(v) <= d)) { seen.set(v, d); st.push(v); }
      }
    }
    return seen.keys();
  }
  search(s, t, closed, ok = null) {
    const n = this.data.v.length;
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const heap = [[0, s]];
    dist[s] = 0;
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
      }
      return top;
    };
    while (heap.length) {
      const [d, u] = pop();
      if (u === t) break;
      if (d > dist[u]) continue;
      for (const [v, w, ei] of this.adj[u]) {
        if (closed && closed[ei] && !(ok.has(u) && ok.has(v))) continue;
        const nd = d + w * this.pen[ei];
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); }
      }
    }
    if (!isFinite(dist[t])) return null;
    const path = [t];
    while (path[path.length - 1] !== s) path.push(prev[path[path.length - 1]]);
    return path.reverse();
  }
  // a route through several vertices in order
  routeVia(stops) {
    let all = [];
    for (let k = 1; k < stops.length; k++) {
      const p = this.route(stops[k - 1], stops[k]);
      if (!p) return null;
      all = all.length ? all.concat(p.slice(1)) : p;
    }
    return all;
  }
  // distance, ascent, descent, time and the trail sections (colour + names) along a path
  summary(path) {
    const V = this.data.v;
    let dist = 0, up = 0, down = 0, time = 0, maxE = -Infinity, minE = Infinity;
    const H = this.H;
    const profile = [[0, H[path[0]]]];
    const sections = [], closed = new Map();     // closed trail name -> metres on it
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      const d = this.dist(a, b), dh = H[b] - H[a];
      const w = (this.adj[a].find((x) => x[0] === b) || [0, stepMinutes(d, dh)])[1];
      dist += d; time += isFinite(w) ? w : stepMinutes(d, dh);
      if (dh > 0) up += dh; else down -= dh;
      profile.push([dist, H[b]]);
      // which edge carries this step: the one listed on the adjacency
      const ei = (this.adj[a].find((x) => x[0] === b) || [0, 0, this.edgeOf[b]])[2];
      const e = this.data.e[ei];
      if (this.closed && this.closed[ei]) { const nm = e.n[0] || 'szlak ' + (COLOUR_NAME[e.c[0]] || ''); closed.set(nm, (closed.get(nm) || 0) + d); }
      const colour = e.c[0] || 'none', name = e.n[0] || '';
      const last = sections[sections.length - 1];
      if (last && last.colour === colour && (last.name === name || !name || !last.name)) { last.to = dist; last.end = k; if (!last.name) last.name = name; }
      else sections.push({ colour, colours: e.c, name, from: dist - d, to: dist, start: k - 1, end: k });
    }
    for (const k of path) { maxE = Math.max(maxE, H[k]); minE = Math.min(minE, H[k]); }
    return { dist, up, down, time, maxE, minE, profile, sections, closed: [...closed].filter(([, m]) => m > CLOSE_OK).map(([n]) => n) };
  }
  // match a GPS track (GPX points) onto the network: snap points ~150 m apart and route between them
  matchTrack(points) {
    const stops = [];
    let last = null;
    for (const [lon, lat] of points) {
      if (last && Math.hypot((lon - last[0]) * this.mx, (lat - last[1]) * this.mz) < 150) continue;
      const v = this.snap(lon, lat, 120);
      if (v >= 0 && v !== stops[stops.length - 1]) { stops.push(v); last = [lon, lat]; }
    }
    const endV = this.snap(...points[points.length - 1], 120);
    if (endV >= 0 && endV !== stops[stops.length - 1]) stops.push(endV);
    return stops.length > 1 ? { stops, path: this.routeVia(stops) } : null;
  }
}

export const fmtTime = (min) => {
  const m = Math.max(5, Math.round(min / 5) * 5);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
};
