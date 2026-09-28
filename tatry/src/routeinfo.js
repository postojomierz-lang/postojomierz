// What a planned route carries along its length, read from the OpenStreetMap tags of its ways:
// path width and surface (paved stone, gravel road, bare rock), the colour of the trail marks and the
// difficulty (where chains go); plus the places it passes (huts, passes, peaks, lakes), signposts
// where OSM has guideposts (and at both ends) and a title "start → destination".

// surface of the path from the tags of a way: width (m), paved 0..1 (granite paving), wear 0..1
function surfaceOf(t, ele) {
  const s = t.surface, h = t.highway;
  if (['asphalt', 'paved', 'concrete'].includes(s) || h === 'service' || h === 'pedestrian') return { width: 3.4, paved: 0, wear: 1 };
  if (h === 'track' || ['gravel', 'compacted', 'fine_gravel'].includes(s)) return { width: 2.8, paved: 0, wear: 1 };
  if (['cobblestone', 'unhewn_cobblestone', 'sett', 'paving_stones'].includes(s) || h === 'steps') return { width: 2.0, paved: 1, wear: 1 };
  if (t.sac >= 3 || s === 'rock' || s === 'stone') return { width: 1.0, paved: 0, wear: 0.45 };
  // other paths: stone paving low down (most Tatra paths below the dwarf pine), trodden higher up
  return ele < 1700 ? { width: 1.7, paved: 0.75, wear: 0.95 } : { width: 1.3, paved: 0.35, wear: 0.8 };
}

// signpost-style short names: "Schronisko PTTK w Dolinie Pięciu Stawów Polskich" -> "Dolina Pięciu Stawów Polskich"
function shortName(n) {
  const m = n.match(/^(?:Stare\s+)?Schronisko(?:\s+PTTK)?\s+(?:(?:w|na|przy)\s+)?(.+)$/);
  if (!m || /^(pod|nad)\s/.test(m[1])) return n;       // 'pod Wagą': the case cannot be undone simply
  return m[1].replace(/^Dolinie\b/, 'Dolina').replace(/^Hali\b/, 'Hala').replace(/^Morskim Oku$/, 'Morskie Oko');
}

export function routeInfo({ route, trail, TH, meta, pois }) {
  const N = trail.X.length, step = trail.step;
  // distance along the route of every planner vertex, then per-metre lookups
  const cum = [0];
  for (let k = 1; k < route.pts.length; k++) cum.push(cum[k - 1] + Math.hypot(route.pts[k][0] - route.pts[k - 1][0], route.pts[k][1] - route.pts[k - 1][1]));
  const L = (N - 1) * step, scale = L / cum[cum.length - 1];
  const vAt = new Int32Array(N);
  for (let i = 0, k = 0; i < N; i++) {
    const s = i * step / scale;
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    vAt[i] = k;
  }
  const W = new Float32Array(N), P = new Float32Array(N), E = new Float32Array(N), SAC = new Uint8Array(N);
  const colour = new Array(N);
  for (let i = 0; i < N; i++) {
    const t = route.info[vAt[i]];
    const sf = surfaceOf(t, TH[i]);
    W[i] = sf.width; P[i] = sf.paved; E[i] = sf.wear; SAC[i] = t.sac; colour[i] = t.colour;
  }
  // soften changes over ~20 m either way
  const soft = (a) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0, n = 0; for (let k = Math.max(0, i - 20); k <= Math.min(N - 1, i + 20); k += 2) { s += a[k]; n++; } o[i] = s / n; } return o; };
  const Ws = soft(W), Ps = soft(P), Es = soft(E);
  const idx = (s) => Math.max(0, Math.min(N - 1, Math.round(s / step)));
  const sectionAt = (s) => { const i = idx(s); return { width: Ws[i], paved: Ps[i], wear: Es[i] }; };

  // nearest point of the route to (x, z): { s, d }
  const nearest = (x, z) => {
    let best = Infinity, bi = 0;
    for (let i = 0; i < N; i += 2) { const d = Math.hypot(trail.X[i] - x, trail.Z[i] - z); if (d < best) { best = d; bi = i; } }
    return { s: bi * step, d: best };
  };
  // named places along the route
  const named = [];
  for (const p of pois) {
    if (p.k === 'sign' || !p.n) continue;
    const q = nearest(p.xz[0], p.xz[1]);
    if (q.d < (p.k === 'hut' ? 120 : 70)) named.push({ s: q.s, name: shortName(p.n), kind: p.k, ele: p.e });
  }
  for (const l of meta.lakes || []) {
    if (!l.name) continue;
    let best = { s: 0, d: Infinity };
    for (let k = 0; k < l.ring.length; k += 3) { const q = nearest(l.ring[k][0], l.ring[k][1]); if (q.d < best.d) best = q; }
    if (best.d < 90 && !named.some((n) => n.name === l.name)) named.push({ s: best.s, name: l.name, kind: 'lake' });
  }
  named.sort((a, b) => a.s - b.s);
  const dedup = [];
  for (const n of named) if (!dedup.some((m) => m.name === n.name)) dedup.push(n);
  const nameNear = (s, r = 350) => {
    let best = null;
    for (const n of dedup) if (Math.abs(n.s - s) < r && (!best || Math.abs(n.s - s) < Math.abs(best.s - s))) best = n;
    return best;
  };
  const ends = (k) => {
    const at = k ? L : 0;
    const closest = (list, r) => list.filter((m) => Math.abs(m.s - at) < r).sort((a, b) => Math.abs(a.s - at) - Math.abs(b.s - at))[0];
    // a summit right at the end, else a hut, else the signpost there, else the nearest named place
    const peak = closest(dedup.filter((m) => m.kind === 'peak'), 150);
    if (peak) return peak.name;
    const hut = closest(dedup.filter((m) => m.kind === 'hut'), 450);
    if (hut) return hut.name;
    const p0 = [trail.X[k ? N - 1 : 0], trail.Z[k ? N - 1 : 0]];
    let sign = null, sd = 300;
    for (const p of pois) if (p.k === 'sign' && p.n) { const d = Math.hypot(p.xz[0] - p0[0], p.xz[1] - p0[1]); if (d < sd) { sd = d; sign = shortName(p.n); } }
    if (sign) return sign;
    const n = closest(dedup, 800);
    if (n) return n.name;
    const nm = route.info[k ? route.info.length - 1 : 0].name;
    const parts = nm.split(/\s+[-–]\s+/);
    return parts.length > 1 ? (k ? parts[parts.length - 1] : parts[0]) : (k ? 'Cel' : 'Start');
  };
  const startName = ends(0), endName = ends(1);

  // signposts: at the OSM guideposts on the route, at the start and at the end
  const spots = [{ s: Math.min(12, L * 0.1), name: startName }];
  for (const p of pois) {
    if (p.k !== 'sign') continue;
    const q = nearest(p.xz[0], p.xz[1]);
    if (q.d < 25 && q.s > 150 && q.s < L - 150) spots.push({ s: q.s, name: p.n ? shortName(p.n) : (nameNear(q.s, 300) || {}).name || '' });
  }
  // and at the huts and lakes the route passes, where OSM has no guidepost close by
  for (const n of dedup) {
    if ((n.kind !== 'hut' && n.kind !== 'lake') || n.s < 300 || n.s > L - 300) continue;
    if (!spots.some((sp) => Math.abs(sp.s - n.s) < 300)) spots.push({ s: n.s + 15, name: n.name });
  }
  spots.push({ s: Math.max(L - 6, L * 0.9), name: endName, end: true });
  spots.sort((a, b) => a.s - b.s);
  const posts = [];
  for (const sp of spots) {
    // a signpost needs a name; guideposts close to the previous one are left out
    if (!sp.end && posts.length) {
      if (sp.s - posts[posts.length - 1].s < 400) continue;
      if (!sp.name) sp.name = (nameNear(sp.s, 500) || {}).name || '';
      if (!sp.name || sp.name === posts[posts.length - 1].title) continue;
    }
    if (sp.end && posts.length && sp.s - posts[posts.length - 1].s < 150) posts.pop();
    const ahead = dedup.find((n) => n.s > sp.s + 300 && n.s < L - 300);
    const behind = [...dedup].reverse().find((n) => n.s < sp.s - 300 && n.s > 300);
    const boards = [];
    if (!sp.end) {
      if (ahead) boards.push({ dest: ahead.name, toS: ahead.s });
      boards.push({ dest: endName, toS: L });
    }
    if (sp.s > 300) boards.push({ dest: behind ? behind.name : startName, toS: behind ? behind.s : 0 });
    const title = sp.name || (nameNear(sp.s, 250) || {}).name || '';
    const n = nameNear(sp.s, 120);
    posts.push({ s: sp.s, title, ele: n && n.ele ? n.ele : Math.round(TH[idx(sp.s)] / 5) * 5, side: 1, boards: boards.slice(0, 3) });
  }

  // HUD place names
  const places = [{ s: 0, name: startName }, ...dedup.filter((n) => n.s > 150 && n.s < L - 150).map((n) => ({ s: n.s, name: n.name })), { s: L, name: endName }];
  return {
    sectionAt, colourAt: (s) => colour[idx(s)], sacAt: (s) => SAC[idx(s)],
    chainAt: (i) => SAC[i] >= 3 && TH[i] > 1900,      // difficult (SAC 3+) rock high up: Zawrat, Rysy, Kozi...
    posts, places, startName, endName, named: dedup,
  };
}
