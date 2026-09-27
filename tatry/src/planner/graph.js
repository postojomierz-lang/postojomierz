// Routing over the marked trails (tools/prepare_trails.py): every vertex (~10 m apart) is a node,
// neighbours along the trail are linked. The cost of a step is its walking time by PTTK-style norms,
// so the planner picks the quickest way, not the shortest, and uphill differs from downhill.

// minutes for a step of `dist` metres climbing `dh` metres (same norms as the signposts in 3D):
// 5 km/h on the level, +1 min per 10 m up (per 6 m on steep rock above 35 %), +1 min per 25 m down
// (per 10 m below -30 %); checked against the PTTK sign times (Kuźnice–Murowaniec, Zawrat, Rysy...)
export function stepMinutes(dist, dh) {
  let t = dist / 5000 * 60;
  const g = dh / Math.max(dist, 1);
  if (dh > 0) t += dh / (g > 0.35 ? 6 : 10);
  else t += -dh / (g < -0.3 ? 10 : 25);
  return t;
}

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
    this.mainPart();
    // grid index for snapping
    this.cell = 0.003;
    this.grid = new Map();
    for (let i = 0; i < n; i++) {
      const key = this.key(V[i][0], V[i][1]);
      let l = this.grid.get(key); if (!l) this.grid.set(key, l = []);
      l.push(i);
    }
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
  // quickest path from vertex s to t: list of vertices, or null
  route(s, t) {
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
      for (const [v, w] of this.adj[u]) {
        const nd = d + w;
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
    const sections = [];
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      const d = this.dist(a, b), dh = H[b] - H[a];
      dist += d; time += stepMinutes(d, dh);
      if (dh > 0) up += dh; else down -= dh;
      profile.push([dist, H[b]]);
      // which edge carries this step: the one listed on the adjacency
      const ei = (this.adj[a].find((x) => x[0] === b) || [0, 0, this.edgeOf[b]])[2];
      const e = this.data.e[ei];
      const colour = e.c[0] || 'none', name = e.n[0] || '';
      const last = sections[sections.length - 1];
      if (last && last.colour === colour && (last.name === name || !name || !last.name)) { last.to = dist; last.end = k; if (!last.name) last.name = name; }
      else sections.push({ colour, colours: e.c, name, from: dist - d, to: dist, start: k - 1, end: k });
    }
    for (const k of path) { maxE = Math.max(maxE, H[k]); minE = Math.min(minE, H[k]); }
    return { dist, up, down, time, maxE, minE, profile, sections };
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
