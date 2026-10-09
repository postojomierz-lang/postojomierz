// Any route of the Polish High Tatras in 3D: the route comes from the planner (stops in the address,
// #r=lat,lon;lat,lon...), is found again along the trails (planner/graph.js), and only the data
// around it is loaded from the region (tools/prepare_*.py with AREA=region, sent to Cloudflare R2 by
// tools/upload_r2.py and read from REGION_BASE; VITE_REGION_BASE=../region/ at build time reads the local copy):
// height and photo blocks of 1024 m, the 1 m / 0.5 m tiles near the path, and the lakes, streams,
// buildings and labels of that area. The result has the same shape as the Rysy data, so the rest of
// the engine does not care where it came from.
import { TrailGraph, stepMinutes } from './planner/graph.js';

export const REGION_BASE = import.meta.env.VITE_REGION_BASE || 'https://pub-5185677c9bfa4bd98f6768e62de07255.r2.dev/region2/';
const TRAILS = 'data/region/trails.json';
// the local frame of all the data (tools/prepare.py): centre of the Rysy area
const LAT0 = (49.168 + 49.214) / 2, LON0 = (20.040 + 20.112) / 2;
const MX = 111320 * Math.cos(LAT0 * Math.PI / 180), MZ = 110574;
export const toLocal = (lon, lat) => [(lon - LON0) * MX, -(lat - LAT0) * MZ];
export const toLonLat = (x, z) => [LON0 + x / MX, LAT0 - z / MZ];
// the trail network of the planner (loaded once, when first needed)
let graph = null;
export const trailGraph = () => graph || (graph = fetch(TRAILS).then((r) => r.json()).then((d) => new TrailGraph(d)));

export function routeFromHash(hash = location.hash) {
  const m = hash.match(/r=([^&]+)/);
  if (!m) return null;
  return m[1].split(';').map((p) => p.split(',').map(Number)).filter((p) => p.length === 2 && p.every(isFinite));
}

export const MAX_KM = 25;
// path along the trails through the stops, with what the engine needs per vertex
export async function routePath(stops) {
  const G = await trailGraph(), data = G.data;
  // the same way as the planner: around the trails closed on the day of the walk (?start=, else today)
  const st = new Date(new URLSearchParams(location.search).get('start') || Date.now());
  G.setDate(isNaN(st) ? new Date() : st);
  const vs = stops.map(([lat, lon]) => G.snap(lon, lat, 300)).filter((v) => v >= 0);
  if (vs.length < 2) throw new Error('Trasa poza siecią szlaków');
  let path = G.routeVia(vs);
  if (!path) throw new Error('Nie da się połączyć punktów trasy szlakami');
  // a very long route (a whole crossing of the range) would never finish loading: the 3D walk takes its
  // first MAX_KM, the planner keeps the whole of it
  let cut = null, d = 0;
  for (let k = 1; k < path.length; k++) {
    d += G.dist(path[k - 1], path[k]);
    if (d > MAX_KM * 1000) { cut = { total: G.summary(path).dist / 1000 }; path = path.slice(0, k); break; }
  }
  const summary = G.summary(path);
  if (cut) summary.cut = cut;
  // per vertex: local position, the edge it runs on (colour, surface, difficulty, names)
  const pts = [], info = [];
  for (let k = 0; k < path.length; k++) {
    const v = path[k];
    pts.push(toLocal(data.v[v][0], data.v[v][1]));
    let ei = G.edgeOf[v];
    if (k + 1 < path.length) { const a = G.adj[v].find((x) => x[0] === path[k + 1]); if (a) ei = a[2]; }
    const e = data.e[ei];
    info.push({ colour: e.c[0] || 'red', surface: e.s || '', sac: e.d || 0, highway: e.h || '', name: e.n[0] || '', junction: G.adj[v].length > 2 });
  }
  // walking time to every vertex, both ways, with the planner's hand corrections (planner/corrections.js):
  // cumF along the route, cumR against it (a one-way stretch walked backwards gets the plain norms)
  const cumD = new Float64Array(path.length), cumF = new Float64Array(path.length), cumR = new Float64Array(path.length);
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], d = G.dist(a, b), dh = G.H[b] - G.H[a];
    const w = (x, y, dd, h) => { const e = G.adj[x].find((q) => q[0] === y); return e && isFinite(e[1]) ? e[1] : stepMinutes(dd, h); };
    cumD[k] = cumD[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    cumF[k] = cumF[k - 1] + w(a, b, d, dh);
    cumR[k] = cumR[k - 1] + w(b, a, d, -dh);
  }
  const pois = data.poi.map((p) => ({ ...p, xz: toLocal(p.p[0], p.p[1]) }));
  return { pts, info, summary, pois, colours: data.colours, times: { cumD, cumF, cumR } };
}

async function heights(url, w, h) {
  const res = await fetch(url);
  const raw = new Uint8Array(await new Response(res.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const d = new Uint16Array(raw.buffer, 0, w * h);
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    let acc = 0;
    for (let i = 0; i < w; i++) {
      const v = d[j * w + i];
      acc = i === 0 ? v : acc + (v > 32767 ? v - 65536 : v);
      out[j * w + i] = acc / 10;
    }
  }
  return { h: out, mask: raw.length >= w * h * 3 ? raw.slice(w * h * 2, w * h * 3) : null };
}
async function bitmap(url) {
  const b = await (await fetch(url)).blob();
  return createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
}

// the region's index (5 MB packed): asked for while the route is still being worked out, not after it
let metaP = null;
export const regionMeta = () => metaP || (metaP = fetch(REGION_BASE + 'meta.json').then((r) => r.json()));

// loads the region data around the route; returns the same pieces main.js reads from the Rysy data
export async function loadRegionArea(route, { status = () => {}, quality = 'high', onTiles = null, onBlocks = null } = {}) {
  const R = REGION_BASE;
  status('Pobieranie mapy regionu…');
  const meta = await regionMeta();
  const B = meta.base.block, step = meta.base.step, BM = B * step;       // samples and metres per block
  const [rx0, rz0] = meta.base.bounds;
  // area: the route's bounding box plus a margin, snapped to whole blocks
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of route.pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  const margin = 1300;
  const have = new Set(meta.base.blocks.map(([i, j]) => i + ',' + j));
  const bi0 = Math.max(0, Math.floor((x0 - margin - rx0) / BM)), bj0 = Math.max(0, Math.floor((z0 - margin - rz0) / BM));
  const maxI = Math.max(...meta.base.blocks.map((b) => b[0])), maxJ = Math.max(...meta.base.blocks.map((b) => b[1]));
  const bi1 = Math.min(maxI, Math.floor((x1 + margin - rx0) / BM)), bj1 = Math.min(maxJ, Math.floor((z1 + margin - rz0) / BM));
  const nbx = bi1 - bi0 + 1, nbz = bj1 - bj0 + 1;
  const W = nbx * B + 1, H = nbz * B + 1;
  const IB = [rx0 + bi0 * BM, rz0 + bj0 * BM, rx0 + (bi1 + 1) * BM, rz0 + (bj1 + 1) * BM];
  // 1 m tiles close to the route
  const TS = meta.tiles.size, TO = meta.tiles.origin;
  const near = (tx, tz) => {
    const cx = tx + TS / 2, cz = tz + TS / 2;
    for (let k = 0; k < route.pts.length; k += 5) if (Math.abs(route.pts[k][0] - cx) < 450 && Math.abs(route.pts[k][1] - cz) < 450) return true;
    return false;
  };
  const tiles = meta.tiles.list.filter(([i, j]) => near(TO[0] + i * TS, TO[1] + j * TS));
  if (onTiles) onTiles(tiles, meta.tiles, R + 'tiles/');   // (the caller fetches them alongside the blocks)
  const landP = bitmap(R + 'landcover.png');
  landP.catch(() => {});
  // heights and photo of every block of the area
  const hgt = new Float32Array(W * H), mask = new Uint8Array(W * H);
  const PB = 512, photoScale = (quality === 'low' || quality === 'mid') && nbx * nbz > 16 ? 0.5 : 1;
  const canvas = new OffscreenCanvas(Math.round(nbx * PB * photoScale), Math.round(nbz * PB * photoScale));
  const g = canvas.getContext('2d');
  g.fillStyle = '#56644c'; g.fillRect(0, 0, canvas.width, canvas.height);
  let done = 0;
  const jobs = [];
  for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) {
    if (!have.has(bi + ',' + bj)) continue;
    jobs.push((async () => {
      const [hb, img] = await Promise.all([heights(`${R}base/h_${bi}_${bj}.bin`, B + 1, B + 1), bitmap(`${R}photo/o_${bi}_${bj}.jpg`)]);
      const c0 = (bi - bi0) * B, r0 = (bj - bj0) * B;
      for (let r = 0; r <= B; r++) {
        hgt.set(hb.h.subarray(r * (B + 1), (r + 1) * (B + 1)), (r0 + r) * W + c0);
        if (hb.mask) mask.set(hb.mask.subarray(r * (B + 1), (r + 1) * (B + 1)), (r0 + r) * W + c0);
      }
      g.drawImage(img, (bi - bi0) * PB * photoScale, (bj - bj0) * PB * photoScale, PB * photoScale, PB * photoScale);
      ++done; if (onBlocks) onBlocks(done, jobs.length); else status(`Pobieranie terenu… ${done}/${jobs.length}`);
    })());
  }
  if (onBlocks) onBlocks(0, jobs.length);
  await Promise.all(jobs);
  const innerBmp = await createImageBitmap(canvas);
  // land cover of the area, cut out of the region's map
  const land = await landP;
  const [ax0, az0, ax1, az1] = meta.inner.bounds;
  const lc = new OffscreenCanvas(Math.round((IB[2] - IB[0]) / 10), Math.round((IB[3] - IB[1]) / 10));
  const lg = lc.getContext('2d'); lg.imageSmoothingEnabled = false;
  const sx = land.width / (ax1 - ax0), sz = land.height / (az1 - az0);
  lg.drawImage(land, (IB[0] - ax0) * sx, (IB[1] - az0) * sz, (IB[2] - IB[0]) * sx, (IB[3] - IB[1]) * sz, 0, 0, lc.width, lc.height);
  const landBmp = await createImageBitmap(lc);
  // vectors inside the area
  const inside = (x, z, m = 0) => x > IB[0] - m && x < IB[2] + m && z > IB[1] - m && z < IB[3] + m;
  const cen = (ring) => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
  const view = {
    ...meta,
    inner: { bounds: IB },
    base: { bounds: IB, n: [W, H], step },
    tiles: { ...meta.tiles, list: tiles },
    trail: route.pts,
    lakes: (meta.lakes || []).filter((l) => inside(...cen(l.ring), 200)),
    // streams: only the parts inside the area (a stream may run through several areas)
    streams: (meta.streams || []).map((st) => ({ ...st, pts: st.pts.filter((p) => inside(p[0], p[1], -30)) })).filter((st) => st.pts.length > 3),
    waterfalls: (meta.waterfalls || []).filter((w) => inside(w.x, w.z)),
    buildings: (meta.buildings || []).filter((b) => inside(b.x, b.z, -20)),
  };
  return { meta: view, base: { h: hgt, mask }, innerBmp, landBmp, tilesBase: R + 'tiles/' };
}
