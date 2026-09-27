// Battlefield layout: floor theme, household obstacles and one deployment zone per army.
import { mulberry } from './rng.js';

export const T_OPEN = 0, T_SOLID = 1, T_WATER = 2, T_LOW = 3; // LOW = solid but short: blocks movement, not line of sight
export const T_EDGE = 4; // off the edge of the round table: nobody walks there, but you can see and shoot across
export const T_RUIN = 5; // a ruined building: soldiers on foot can get in and fight from it (good cover), vehicles can't

// diorama battlefields ('normandy': see normandy(), 'town': see town(), 'beach': see beach()); the rest are the classic toy-room floors
export const DIORAMAS = ['normandy', 'town', 'beach', 'winter', 'desert', 'jungle', 'mountain'];
export const ROOM_THEMES = ['wood', 'carpet', 'kitchen', 'sand', 'grass', 'snow'];
export const THEMES = [...DIORAMAS, ...ROOM_THEMES];

const OBSTACLES = {
  wood:    { tall: ['books', 'shoebox', 'mug', 'lego'], low: ['pencils', 'remote'], water: ['juice', 'cola'] },
  carpet:  { tall: ['books', 'lego', 'toybox', 'blocks'], low: ['pencils', 'crayons'], water: ['juice', 'ink'] },
  kitchen: { tall: ['cereal', 'mug', 'pot', 'blocks'], low: ['spoons'], water: ['milk', 'juice'] },
  sand:    { tall: ['castle', 'bucket', 'rock'], low: ['shells'], water: ['moat'] },
  grass:   { tall: ['flowerpot', 'rock', 'bucket', 'lego'], low: ['twigs'], water: ['puddle'] },
  snow:    { tall: ['snowman', 'rock', 'bucket'], low: ['twigs'], water: ['ice'] },
};

// Two armies face each other across a rectangle. Three or more sit at the corners of a regular
// polygon on a round table, so every army is exactly as far from its neighbours and from the middle.
// (No Math.sin/cos: the map must come out identical on every machine.)
export const MAX_ARMIES = 6;                                 // 2-6 armies per battle
const ZONE = { 3: 18, 4: 17, 5: 16, 6: 15 };   // zone edge (cells)
const NEIGHBOUR = 52;                                        // distance between neighbouring HQ zones
export function mapSize(n) {
  if (n <= 2) return { W: 64, H: 40, zw: 16, zh: 40, round: false };
  n = Math.min(MAX_ARMIES, n);
  const z = ZONE[n], d = NEIGHBOUR / (2 * sinT(PI / n));
  const S = 2 * Math.ceil(d + z * 0.70715 + 2);
  return { W: S, H: S, zw: z, zh: z, round: true };
}
const PI = 3.141592653589793;
function sinT(a) {   // Taylor series after range reduction: plain + and *, so bit-identical everywhere
  a = a % (2 * PI); if (a > PI) a -= 2 * PI; if (a < -PI) a += 2 * PI;
  if (a > PI / 2) a = PI - a; else if (a < -PI / 2) a = -PI - a;
  const a2 = a * a;
  return a * (1 - a2 / 6 * (1 - a2 / 20 * (1 - a2 / 42 * (1 - a2 / 72 * (1 - a2 / 110 * (1 - a2 / 156))))));
}
const cosT = a => sinT(a + PI / 2);
export const tableRadius = (W, H) => Math.min(W, H) / 2 - 1;

// Deployment zones: the first army (you) sits at the bottom, the rest go round the table.
function zoneRects(n, W, H, zw, zh, round) {
  if (!round) return [[0, 0, zw, H], [W - zw, 0, zw, H]];
  const R = tableRadius(W, H), d = R - zw / 2 * 1.4143 - 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = PI / 2 + i * 2 * PI / n;
    const cx = W / 2 + d * cosT(a), cy = H / 2 + d * sinT(a);
    out.push([Math.round(cx - zw / 2), Math.round(cy - zh / 2), zw, zh]);
  }
  return out;
}

// Every visual style a household obstacle can have, by grid kind (used by Claude-made layouts too).
export const STYLES = {
  tall: ['books', 'shoebox', 'toybox', 'cereal', 'box', 'mug', 'pot', 'bucket', 'bottle', 'flowerpot', 'lego', 'blocks', 'castle', 'snowman', 'rock'],
  low: ['pencils', 'crayons', 'remote', 'spoons', 'shells', 'twigs', 'shoe', 'cable'],
  water: ['juice', 'cola', 'ink', 'milk', 'moat', 'puddle', 'ice'],
};

// layout (optional): { theme, objects: [{ kind: 'tall'|'low'|'water', style, x, y, w, h }], decor: [{ kind, x, y }] }
// options (diorama battlefields): { river: true | false } (default: decided by the seed)
export function makeMap({ teams, theme, seed, layout = null, options = {} }) {
  teams = Math.max(2, Math.min(MAX_ARMIES, teams));
  const rng = mulberry(seed);
  const { W, H, zw, zh, round } = mapSize(teams);
  if (layout && ROOM_THEMES.includes(layout.theme)) theme = layout.theme;
  theme = THEMES.includes(theme) && !(layout && DIORAMAS.includes(theme)) ? theme : ROOM_THEMES[Math.floor(rng() * ROOM_THEMES.length)];
  const grid = new Uint8Array(W * H);
  const R = round ? tableRadius(W, H) : 0;
  if (round) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - W / 2, dy = y + 0.5 - H / 2;
    if (dx * dx + dy * dy > R * R) grid[y * W + x] = T_EDGE;
  }
  const zones = zoneRects(teams, W, H, zw, zh, round).map(([x, y, w, h]) => ({ x, y, w, h }));
  const inZone = (x, y) => zones.some(z => x >= z.x - 1 && x < z.x + z.w + 1 && y >= z.y - 1 && y < z.y + z.h + 1);
  const objects = [];
  const pal = OBSTACLES[theme];
  const pick = a => a[Math.floor(rng() * a.length)];

  const tryPlace = (kind, style, w, h) => {
    for (let n = 0; n < 40; n++) {
      const x = 2 + Math.floor(rng() * (W - w - 4)), y = 2 + Math.floor(rng() * (H - h - 4));
      let ok = true;
      for (let yy = y - 1; yy < y + h + 1 && ok; yy++) for (let xx = x - 1; xx < x + w + 1 && ok; xx++) {
        if (inZone(xx, yy) || grid[yy * W + xx] !== T_OPEN) ok = false;
      }
      if (!ok) continue;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy * W + xx] = kind;
      objects.push({ kind, style, x, y, w, h, seed: Math.floor(rng() * 1e9) });
      return true;
    }
    return false;
  };

  const free = (x, y, w, h) => {
    if (x < 1 || y < 1 || x + w > W - 1 || y + h > H - 1) return false;
    for (let yy = y - 1; yy < y + h + 1; yy++) for (let xx = x - 1; xx < x + w + 1; xx++) if (inZone(xx, yy) || grid[yy * W + xx] !== T_OPEN) return false;
    return true;
  };
  const putWater = (style, x, y, w, h) => {
    const cells = [];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const dx = (xx + 0.5 - x - w / 2) / (w / 2), dy = (yy + 0.5 - y - h / 2) / (h / 2);
      if (dx * dx + dy * dy <= 1.05 + (rng() - 0.5) * 0.3) { grid[yy * W + xx] = T_WATER; cells.push(yy * W + xx); }
    }
    if (cells.length) objects.push({ kind: T_WATER, style, x, y, w, h, cells, seed: Math.floor(rng() * 1e9) });
  };
  const area = W * H / 2000;
  const decor = [];

  const n = zones.length, turns = [];
  for (let k = 0; k < n; k++) {
    const a = k * 2 * PI / n;
    turns.push({ c: cosT(a), s: sinT(a), swap: Math.round(a / (PI / 2)) % 2 === 1 });
  }
  const copies = (x, y, w, h) => turns.map(({ c, s, swap }) => {
    const px = x + w / 2 - W / 2, py = y + h / 2 - H / 2;
    const ww = swap ? h : w, hh = swap ? w : h;
    return { x: Math.round(px * c - py * s + W / 2 - ww / 2), y: Math.round(px * s + py * c + H / 2 - hh / 2), w: ww, h: hh };
  });
  const fits = rects => {
    const taken = new Set();
    for (const r of rects) {
      if (r.x < 2 || r.y < 2 || r.x + r.w > W - 2 || r.y + r.h > H - 2) return false;
      for (let yy = r.y - 1; yy < r.y + r.h + 1; yy++) for (let xx = r.x - 1; xx < r.x + r.w + 1; xx++) {
        if (inZone(xx, yy) || grid[yy * W + xx] !== T_OPEN || taken.has(yy * W + xx)) return false;
      }
      for (let yy = r.y - 1; yy < r.y + r.h + 1; yy++) for (let xx = r.x - 1; xx < r.x + r.w + 1; xx++) taken.add(yy * W + xx);
    }
    return true;
  };
  // group: [[dx, dy, w, h, style], ...] placed together (a farmhouse and its barn); a single rect otherwise
  const placeSym = (kind, style, w, h, group = null, where = null) => {
    group = group || [[0, 0, w, h, style]];
    for (let t = 0; t < (kind === T_SOLID && group.length > 1 ? 150 : 40); t++) {
      const x0 = where ? where[0] : 2 + Math.floor(rng() * (W - w - 4)), y0 = where ? where[1] : 2 + Math.floor(rng() * (H - h - 4));
      const perTurn = group.map(([dx, dy, gw, gh]) => copies(x0 + dx, y0 + dy, gw, gh));
      const rects = perTurn.flat();
      if (!fits(rects)) continue;
      const seed0 = Math.floor(rng() * 1e9);
      perTurn.forEach((rs, gi) => rs.forEach((r, k) => {
        const st = group[gi][4] || style;
        if (kind === T_WATER) putWater(st, r.x, r.y, r.w, r.h);
        else {
          for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) grid[yy * W + xx] = kind;
          objects.push({ kind, style: st, ...r, turn: k, seed: seed0 + gi });
        }
      }));
      return [x0, y0];
    }
    return false;
  };
  const fields = [], roads = [];
  let extra = {};

  if (layout) {
    // Claude's layout: keep each object where it was asked for, nudging it out of army zones if needed
    const kinds = { tall: T_SOLID, low: T_LOW, water: T_WATER };
    const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v || 0)));
    // a map saved for another number of armies is stretched to this grid
    const sx = layout.W > 0 ? W / layout.W : 1, sy = layout.H > 0 ? H / layout.H : 1;
    for (let o of (layout.objects || []).slice(0, 200)) {
      const kind = kinds[o.kind]; if (kind === undefined) continue;
      const list = STYLES[o.kind];
      const style = list.includes(o.style) ? o.style : list[0];
      const lim = kind === T_WATER ? 14 : 8;
      const thin = kind === T_LOW;
      let w = clampI((+o.w || 1) * (thin && +o.w <= 1 ? 1 : sx), 1, lim), h = clampI((+o.h || 1) * (thin && +o.h <= 1 ? 1 : sy), 1, lim);
      o = { ...o, x: (+o.x || 0) * sx, y: (+o.y || 0) * sy };
      if (kind === T_LOW && w > 1 && h > 1) { if (w >= h) h = 1; else w = 1; }
      let x = clampI(o.x, 1, W - w - 1), y = clampI(o.y, 1, H - h - 1);
      let ok = false;
      for (let r = 0; r <= 12 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(x + dx, y + dy, w, h)) { x += dx; y += dy; ok = true; }
      }
      if (!ok) continue;
      if (kind === T_WATER) putWater(style, x, y, w, h);
      else {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy * W + xx] = kind;
        objects.push({ kind, style, x, y, w, h, seed: Math.floor(rng() * 1e9) });
      }
    }
    for (const d of (layout.decor || []).slice(0, 80)) {
      const x = Math.max(1, Math.min(W - 2, Math.floor((+d.x || 0) * sx))) + 0.5, y = Math.max(1, Math.min(H - 2, Math.floor((+d.y || 0) * sy))) + 0.5;
      if (grid[Math.floor(y) * W + Math.floor(x)] !== T_OPEN || inZone(Math.floor(x), Math.floor(y))) continue;
      decor.push({ x, y, kind: ['palm', 'pine', 'bush'].includes(d.kind) ? d.kind : 'bush', seed: Math.floor(rng() * 1e9) });
    }
  } else if (theme === 'mountain') {
    extra = mountain({ W, H, grid, zones, objects, decor, rng, turns, roads, fields, round, R, opts: options });
  } else if (theme === 'jungle') {
    extra = jungle({ W, H, grid, zones, objects, decor, rng, turns, roads, fields, round, R, opts: options });
  } else if (theme === 'desert') {
    extra = desert({ W, H, grid, zones, objects, decor, rng, turns, roads, round, R });
  } else if (theme === 'winter') {
    extra = winter({ W, H, grid, zones, objects, decor, rng, turns, roads, fields, round, R });
  } else if (theme === 'beach') {
    extra = beach({ W, H, grid, zones, objects, decor, rng, turns, round, R, opts: options });
  } else if (theme === 'town') {
    extra = town({ W, H, grid, zones, objects, decor, rng, turns, roads, round, R, opts: options });
  } else if (theme === 'normandy') {
    extra = normandy({ W, H, grid, zones, objects, decor, rng, inZone, turns, copies, placeSym, putWater, fields, roads, round, R, opts: options });
  } else {
  let open = 0;
  for (let c = 0; c < W * H; c++) if (grid[c] === T_OPEN) open++;
  const per = open / 2000 / n;
  for (let i = 0; i < Math.round(7 * per); i++) {
    const style = pick(pal.tall);
    const big = style === 'books' || style === 'shoebox' || style === 'toybox' || style === 'cereal' || style === 'castle';
    const w = big ? 3 + Math.floor(rng() * 3) : 2, h = big ? 2 + Math.floor(rng() * 2) : 2;
    placeSym(T_SOLID, style, rng() < 0.5 ? w : h, rng() < 0.5 ? h : w);
  }
  for (let i = 0; i < Math.round(4 * per); i++) {
    const long = 4 + Math.floor(rng() * 4);
    const horiz = rng() < 0.5;
    placeSym(T_LOW, pick(pal.low), horiz ? long : 1, horiz ? 1 : long);
  }
  for (let i = 0; i < Math.max(1, Math.round(2 * per)); i++) placeSym(T_WATER, pick(pal.water), 4 + Math.floor(rng() * 4), 3 + Math.floor(rng() * 3));
  // a few harmless palm trees / decorations, also one per army
  for (let i = 0; i < Math.round(6 * per); i++) {
    const x0 = 1 + rng() * (W - 2), y0 = 1 + rng() * (H - 2), seed0 = Math.floor(rng() * 1e9);
    for (const { c, s } of turns) {
      const px = x0 - W / 2, py = y0 - H / 2, x = px * c - py * s + W / 2, y = px * s + py * c + H / 2;
      if (x < 1 || y < 1 || x > W - 1 || y > H - 1) continue;
      const cell = Math.floor(y) * W + Math.floor(x);
      if (grid[cell] !== T_OPEN || inZone(Math.floor(x), Math.floor(y))) continue;
      decor.push({ x, y, kind: theme === 'snow' ? 'pine' : theme === 'grass' ? 'bush' : 'palm', seed: seed0 });
    }
  }
  }

  // a fortress in the middle (mountains have one unless told otherwise; a scenario can add one anywhere)
  if (!layout && DIORAMAS.includes(theme) && (options.fortress || (theme === 'mountain' && options.fortress !== false)))
    extra.fortress = fortress({ W, H, grid, zones, objects, decor, turns, round, R });

  // Make sure every zone can reach every other zone on foot; carve through obstacles if not.
  const reach = (from) => {
    const seen = new Uint8Array(W * H), q = [from]; seen[from] = 1;
    while (q.length) {
      const c = q.pop(), x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (seen[n] || grid[n] !== T_OPEN) continue;
        seen[n] = 1; q.push(n);
      }
    }
    return seen;
  };
  const centre = z => ((z.y + (z.h >> 1)) * W + z.x + (z.w >> 1));
  for (let i = 1; i < zones.length; i++) {
    const seen = reach(centre(zones[0]));
    if (seen[centre(zones[i])]) continue;
    // straight carve between centres
    const a = zones[0], b = zones[i];
    let x = a.x + (a.w >> 1), y = a.y + (a.h >> 1);
    const tx = b.x + (b.w >> 1), ty = b.y + (b.h >> 1);
    while (x !== tx || y !== ty) {
      if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y);
      for (const o of objects) if (o.cells ? o.cells.includes(y * W + x) : x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) o.removed = true;
    }
    for (const o of objects.filter(o => o.removed)) {
      if (o.cells) for (const c of o.cells) grid[c] = T_OPEN;
      else for (let yy = o.y; yy < o.y + o.h; yy++) for (let xx = o.x; xx < o.x + o.w; xx++) grid[yy * W + xx] = T_OPEN;
    }
    for (let k = objects.length - 1; k >= 0; k--) if (objects[k].removed) objects.splice(k, 1);
  }

  return { W, H, theme, grid, zones, objects, decor, fields, roads, ...extra, seed, round, R, title: layout && layout.title || '', briefing: layout && layout.briefing || '', tint: layout && /^#[0-9a-f]{6}$/i.test(layout.floorColor || '') ? layout.floorColor : null };
}

// ---- Normandy bocage: small fields boxed in by hedgerows on earth banks, farms, lanes, orchards.
// Fields are a Voronoi diagram of points copied once per army around the middle (so it is fair);
// every field border is a hedgerow unless it was left open, and each hedgerow has a gate.
// options.steppe: open steppe and big fields with only a few hedgerows (the Eastern Front, Poland)
function normandy({ W, H, grid, zones, objects, decor, rng, inZone, turns, placeSym, putWater, fields, roads, round, R, opts = {} }) {
  const n = turns.length, cx = W / 2, cy = H / 2, M = 14;                 // M: scenery beyond the play area
  const rot = (x, y, k) => { const { c, s } = turns[k], px = x - cx, py = y - cy; return [px * c - py * s + cx, px * s + py * c + cy]; };
  const inside = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && grid[(y | 0) * W + (x | 0)] !== T_EDGE;
  const near = (x, y, m) => zones.some(z => x >= z.x - m && x < z.x + z.w + m && y >= z.y - m && y < z.y + z.h + m);

  const road = lanes({ W, H, M, n, rng, rot, zones, roads });

  // field sites, copied round the table
  const { sites, cells } = voronoiSym({ W, H, M, n, rng, rot, per: Math.max(3, Math.round((W + 2 * M) * (H + 2 * M) / 120 / n)) });
  sites.forEach((s, i) => fields.push({ x: s.x, y: s.y, kind: s.b, k: s.k, poly: cells[i].map(([x, y]) => [x, y]) }));

  // farms first (the hedges stop where a barn stands): a stone farmhouse, and a timber barn next to it
  for (let c = 0; c < W * H; c++) if (road[c] && grid[c] === T_OPEN) grid[c] = 9;
  let open = 0;
  for (let c = 0; c < W * H; c++) if (grid[c] === T_OPEN) open++;
  const k = open / 2000 / n;
  const farms = [];
  for (let i = 0; i < Math.max(2, Math.round(2.2 * k)); i++) {
    const v = Math.floor(rng() * 4);
    const group = [[[0, 0, 4, 2, 'house'], [0, 4, 4, 3, 'barn']], [[0, 0, 2, 4, 'house'], [4, 0, 3, 4, 'barn']], [[0, 0, 4, 2, 'house'], [6, -1, 3, 4, 'barn']], [[0, 0, 4, 2, 'house']]][v];
    const at = placeSym(T_SOLID, 'house', 8, 7, group);
    if (at) farms.push(at);
  }
  for (let c = 0; c < W * H; c++) if (grid[c] === 9) grid[c] = T_OPEN;

  // hedgerows along field borders; the same choices for every army's copy of a border
  const hash = (a, b, c) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
  const cellSet = new Uint8Array(W * H), borders = [];
  cells.forEach((poly, i) => poly.forEach((p, a) => {
    const j = p[2]; if (j < i) return;                                     // each border once (and not the board edge)
    const A = sites[i], B = sites[j], d = ((B.k - A.k) % n + n) % n, d2 = ((A.k - B.k) % n + n) % n;
    let key = [A.b, B.b, d], flip = false;
    if (B.b < A.b || (B.b === A.b && d2 < d)) { key = [B.b, A.b, d2]; flip = true; }
    if (hash(key[0], key[1], key[2]) < (opts.steppe ? 0.82 : 0.25)) return;   // an open border
    let g = 0.2 + 0.6 * hash(key[1], key[0], key[2] + 7); if (flip) g = 1 - g;
    const q = poly[(a + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1.5) return;
    const gw = Math.min(0.45, 2.4 / L);
    borders.push({ ax: p[0], ay: p[1], bx: q[0], by: q[1], g, gw });
    const hedge = { kind: T_SOLID, style: 'hedge', cells: [], x: 0, y: 0, w: 0, h: 0, ax: p[0], ay: p[1], bx: q[0], by: q[1], seed: Math.floor(hash(key[0], key[2], key[1]) * 1e9) };
    // 4-connected walk along the border, so nobody slips through diagonally
    const steps = Math.ceil(L * 4);
    let last = -1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (Math.abs(t - g) < gw / 2) { last = -1; continue; }
      const x = Math.floor(p[0] + (q[0] - p[0]) * t), y = Math.floor(p[1] + (q[1] - p[1]) * t);
      const put = (xx, yy) => {
        if (!inside(xx, yy) || xx < 2 || yy < 2 || xx >= W - 2 || yy >= H - 2) return;
        const c = yy * W + xx;
        if (road[c] || near(xx, yy, 2) || grid[c] !== T_OPEN || cellSet[c]) return;
        cellSet[c] = 1; grid[c] = T_SOLID; hedge.cells.push(c);
      };
      if (last >= 0) { const lx = last % W, ly = (last / W) | 0; if (lx !== x && ly !== y) put(x, ly); }
      put(x, y); last = y * W + x;
    }
    if (hedge.cells.length < 2) { for (const c of hedge.cells) { grid[c] = T_OPEN; cellSet[c] = 0; } return; }
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const c of hedge.cells) { const x = c % W, y = (c / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    Object.assign(hedge, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    objects.push(hedge);
  }));

  // everything else keeps off the lanes
  for (let c = 0; c < W * H; c++) if (road[c] && grid[c] === T_OPEN) grid[c] = 9;
  // dry-stone walls, hay bales and farm ponds
  for (let i = 0; i < Math.round(3 * k); i++) { const L = 3 + Math.floor(rng() * 4), hz = rng() < 0.5; placeSym(T_LOW, 'stonewall', hz ? L : 1, hz ? 1 : L); }
  for (let i = 0; i < Math.round(3 * k); i++) { const hz = rng() < 0.5; placeSym(T_LOW, 'hay', hz ? 2 : 1, hz ? 1 : 2); }
  for (let i = 0; i < Math.max(1, Math.round(1.2 * k)); i++) placeSym(T_WATER, 'pond', 4 + Math.floor(rng() * 3), 3 + Math.floor(rng() * 3));
  for (let c = 0; c < W * H; c++) if (grid[c] === 9) grid[c] = T_OPEN;

  // decoration (nothing in the game stops at these): orchards by the farms, lone oaks, shell craters
  const addDecor = (kind, x0, y0, spread = 0) => {
    const seed0 = Math.floor(rng() * 1e9);
    for (let t = 0; t < n; t++) {
      const [x, y] = rot(x0, y0, t);
      if (x < -M + 1 || y < -M + 1 || x > W + M - 1 || y > H + M - 1) continue;
      const onMap = x >= 0 && y >= 0 && x < W && y < H;
      if (onMap) {
        const c = Math.floor(y) * W + Math.floor(x);
        if (grid[c] !== T_OPEN || road[c] || near(Math.floor(x), Math.floor(y), spread)) continue;
      }
      decor.push({ x, y, kind, seed: seed0 + t });
    }
  };
  for (const [fx, fy] of farms) {
    const ox = fx + (rng() < 0.5 ? -6 : 10), oy = fy + (rng() < 0.5 ? -5 : 8);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (rng() < 0.8) addDecor('apple', ox + a * 2.2 + rng() * 0.4, oy + b * 2.2 + rng() * 0.4, 1);
  }
  for (let i = 0; i < Math.round(5 * k); i++) addDecor('oak', rng() * W, rng() * H, 1);
  for (let i = 0; i < Math.round(6 * k); i++) addDecor('crater', rng() * W, rng() * H, 1);
  // beyond the table edge: the countryside goes on (trees and hedges only for the eye)
  for (let i = 0; i < Math.round(24 * k + 12); i++) {
    const x = -M + rng() * (W + 2 * M), y = -M + rng() * (H + 2 * M);
    if (x >= 0 && y >= 0 && x < W && y < H && (!round || grid[Math.floor(y) * W + Math.floor(x)] !== T_EDGE)) continue;
    if (round) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy < (R + 1.5) * (R + 1.5)) continue; }
    decor.push({ x, y, kind: rng() < 0.75 ? 'oak' : 'apple', seed: Math.floor(rng() * 1e9) });
  }
  return { margin: M, borders, road, steppe: !!opts.steppe };
}

// Voronoi diagram of random points copied once per army round the middle (so it is fair):
// every cell is the board rectangle clipped by the bisector of each nearby site; each polygon
// corner carries the site on the other side of the edge that starts there (-1: the board edge).
function voronoiSym({ W, H, M, n, rng, rot, per }) {
  const base = [];
  for (let i = 0; i < per; i++) base.push([-M + rng() * (W + 2 * M), -M + rng() * (H + 2 * M)]);
  const sites = [];
  for (let k = 0; k < n; k++) base.forEach(([x, y], b) => { const [sx, sy] = rot(x, y, k); sites.push({ x: sx, y: sy, b, k }); });
  const X0 = -M, Y0 = -M, X1 = W + M, Y1 = H + M;
  const cells = sites.map((s, i) => {
    let poly = [[X0, Y0, -1], [X1, Y0, -1], [X1, Y1, -1], [X0, Y1, -1]];
    for (let j = 0; j < sites.length && poly.length; j++) {
      if (j === i) continue;
      const o = sites[j], nx = o.x - s.x, ny = o.y - s.y;
      if (nx * nx + ny * ny > 60 * 60) continue;
      const mx = (o.x + s.x) / 2, my = (o.y + s.y) / 2, f = p => (p[0] - mx) * nx + (p[1] - my) * ny;
      const out = [];
      for (let a = 0; a < poly.length; a++) {
        const p = poly[a], q = poly[(a + 1) % poly.length], fp = f(p), fq = f(q);
        if (fp <= 0) out.push(p);
        if ((fp <= 0) !== (fq <= 0)) {
          const t = fp / (fp - fq);
          out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, fp <= 0 ? j : p[2]]);
        }
      }
      poly = out;
    }
    return poly;
  });
  return { sites, cells };
}

// ---- A town in ruins: old-town blocks between cobbled streets (a Voronoi diagram again, so it is
// fair), a wide avenue from every army's base to the square in the middle, stone town houses (some
// still standing, many in ruins that infantry can fight from), churches, rubble, barricades and
// anti-tank obstacles. Optionally a river with stone bridges: straight through the middle with two
// armies, a ring round the old town with more.
function town({ W, H, grid, zones, objects, decor, rng, turns, roads, round, R, opts }) {
  const n = turns.length, cx = W / 2, cy = H / 2, M = 14, BW = W + 2 * M, BH = H + 2 * M;
  const rot = (x, y, k) => { const { c, s } = turns[k], px = x - cx, py = y - cy; return [px * c - py * s + cx, px * s + py * c + cy]; };
  const near = (x, y, m) => zones.some(z => x >= z.x - m && x < z.x + z.w + m && y >= z.y - m && y < z.y + z.h + m);
  const inPlay = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] !== T_EDGE;
  // what each cell of the whole board is (the play area and the scenery round it): 0 lot, 1 street,
  // 2 avenue, 3 square, 4 river, 5 bridge, 6 park (army zones)
  const B = new Uint8Array(BW * BH), bi = (x, y) => (y + M) * BW + x + M;
  const mark = (x, y, v, over = false) => { if (x < -M || y < -M || x >= W + M || y >= H + M) return; const i = bi(x, y); if (over || B[i] === 0 || B[i] === 1) B[i] = v; };
  const segment = (ax, ay, bx, by, half, v, over) => {   // cells whose centre is within half of the segment
    const x0 = Math.floor(Math.min(ax, bx) - half - 1), x1 = Math.ceil(Math.max(ax, bx) + half + 1), y0 = Math.floor(Math.min(ay, by) - half - 1), y1 = Math.ceil(Math.max(ay, by) + half + 1);
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, t = Math.max(0, Math.min(1, (px * dx + py * dy) / L2));
      const ex = px - t * dx, ey = py - t * dy;
      if (ex * ex + ey * ey <= half * half) mark(x, y, v, over);
    }
  };
  const streets = [], river = { cells: [], bridges: [] };
  const hasRiver = opts.river !== undefined ? !!opts.river : rng() < 0.6;
  const zc = zones.map(z => [z.x + z.w / 2, z.y + z.h / 2]);

  // streets: the borders of the old-town blocks
  const { sites, cells } = voronoiSym({ W, H, M, n, rng, rot, per: Math.max(3, Math.round(BW * BH / 70 / n)) });
  cells.forEach((poly, i) => poly.forEach((p, a) => {
    const j = p[2]; if (j < i) return;
    const q = poly[(a + 1) % poly.length];
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5) return;
    streets.push({ ax: p[0], ay: p[1], bx: q[0], by: q[1], w: 2 });
    segment(p[0], p[1], q[0], q[1], 1.05, 1);
  }));
  // avenues from every base to the square, and on out behind it off the board
  const far = Math.max(W, H) / 2 + M;
  for (const [ax, ay] of zc) {
    const l = Math.hypot(ax - cx, ay - cy) || 1, ox = ax + (ax - cx) / l * (far - l + 4), oy = ay + (ay - cy) / l * (far - l + 4);
    streets.push({ ax: ox, ay: oy, bx: cx, by: cy, w: 3.2, avenue: true });
    segment(ox, oy, cx, cy, 1.6, 2, true);
  }
  // the square (with two armies and a river, the river runs through the middle instead)
  const SQ = round ? 6.5 : hasRiver ? 0 : 5.5;
  for (let y = Math.floor(cy - SQ - 1); y <= cy + SQ + 1; y++) for (let x = Math.floor(cx - SQ - 1); x <= cx + SQ + 1; x++)
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= SQ * SQ) mark(x, y, 3, true);
  // parks round the army zones
  for (const z of zones) for (let y = z.y - 2; y < z.y + z.h + 2; y++) for (let x = z.x - 2; x < z.x + z.w + 2; x++) mark(x, y, 6, true);

  // the river and its bridges
  if (hasRiver) {
    const wet = [];
    if (!round) {
      const A = 2.2 + rng() * 1.5, f = 1 + Math.floor(rng() * 2);
      const mid = y => cx + A * sinT((y - cy) / H * 2 * PI * f);          // odd round the middle: the same after a half turn
      for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) if (Math.abs(x + 0.5 - mid(y + 0.5)) < 1.9) wet.push([x, y]);
      for (const by of [cy, cy - H * 0.3, cy + H * 0.3]) river.bridges.push({ x: mid(by), y: by, dx: 1, dy: 0 });
    } else {
      const Rr = R * 0.45;
      for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (Math.abs(d - Rr) < 1.9) wet.push([x, y]); }
      for (let k = 0; k < 2 * n; k++) {
        const [ax, ay] = k < n ? rot(zc[0][0], zc[0][1], k) : rot(...rot(zc[0][0], zc[0][1], k - n), 0);
        let dx = ax - cx, dy = ay - cy;
        if (k >= n) { const h = PI / n, c = cosT(h), s = sinT(h); [dx, dy] = [dx * c - dy * s, dx * s + dy * c]; }
        const l = Math.hypot(dx, dy); dx /= l; dy /= l;
        river.bridges.push({ x: cx + dx * Rr, y: cy + dy * Rr, dx, dy });
      }
    }
    for (const [x, y] of wet) mark(x, y, 4, true);
    for (const b of river.bridges) {
      // a bridge 3 cells wide across the water, and the street that leads onto it
      segment(b.x - b.dx * 3.2, b.y - b.dy * 3.2, b.x + b.dx * 3.2, b.y + b.dy * 3.2, 1.6, 5, true);
    }
    // side streets stop at the quay; bridges carry a street on both sides
    for (const b of river.bridges) segment(b.x - b.dx * 5, b.y - b.dy * 5, b.x + b.dx * 5, b.y + b.dy * 5, 1.2, 1);
  }

  // copy what the play area needs into the grid
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y * W + x; if (grid[c] === T_EDGE) continue;
    const v = B[bi(x, y)];
    if (v === 4) { grid[c] = T_WATER; river.cells.push(c); }
  }
  if (river.cells.length) objects.push({ kind: T_WATER, style: 'river', cells: river.cells, x: 0, y: 0, w: W, h: H, seed: 1 });

  // buildings on the lots, the same for every army; ruins can be entered on foot
  const free = (x, y) => inPlay(x, y) && grid[y * W + x] === T_OPEN && B[bi(x, y)] === 0 && !near(x, y, 2);
  const lotCopies = (x, y, w, h) => turns.map(({ c, s, swap }) => {
    const px = x + w / 2 - cx, py = y + h / 2 - cy, ww = swap ? h : w, hh = swap ? w : h;
    return { x: Math.round(px * c - py * s + cx - ww / 2), y: Math.round(px * s + py * c + cy - hh / 2), w: ww, h: hh };
  });
  const placeLot = (w, h, style, kind, x, y) => {
    const rects = lotCopies(x, y, w, h), used = new Set();
    for (const r of rects) for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      if (!free(xx, yy) || used.has(yy * W + xx)) return false;
      used.add(yy * W + xx);
    }
    const seed = Math.floor(rng() * 1e9);
    rects.forEach((r, k) => {
      for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) grid[yy * W + xx] = kind;
      objects.push({ kind, style, ...r, turn: k, seed, ...facing(r) });
    });
    return true;
  };
  // which side of a lot is on the street (the front door goes there)
  const facing = r => {
    const score = (x0, y0, dx, dy, len) => { let s2 = 0; for (let i = 0; i < len; i++) { const x = x0 + dx * i, y = y0 + dy * i; const v = x < -M || y < -M || x >= W + M || y >= H + M ? 0 : B[bi(x, y)]; if (v && v !== 4) s2++; } return s2; };
    const sides = [[0, 1, score(r.x, r.y + r.h, 1, 0, r.w)], [0, -1, score(r.x, r.y - 1, 1, 0, r.w)], [1, 0, score(r.x + r.w, r.y, 0, 1, r.h)], [-1, 0, score(r.x - 1, r.y, 0, 1, r.h)]];
    const long = r.w === r.h ? null : r.w > r.h ? 'y' : 'x';                   // long buildings face a long side
    let best = null;
    for (const sd of sides) { if (long === 'y' && sd[0]) continue; if (long === 'x' && sd[1]) continue; if (!best || sd[2] > best[2]) best = sd; }
    return { fx: best[0], fy: best[1] };
  };
  const tries = (count, fn) => { for (let i = 0; i < count; i++) fn(Math.floor(rng() * W), Math.floor(rng() * H)); };
  let lots = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (free(x, y)) lots++;
  const per = lots / n;
  tries(Math.round(per / 25) + 40, (x, y) => { if (objects.filter(o => o.style === 'church').length < n * Math.max(1, Math.round(per / 900))) placeLot(5, 3, 'church', T_SOLID, x, y); });
  tries(Math.round(per * 30), (x, y) => {
    const r = rng(), ruin = rng() < 0.45;
    if (r < 0.45) placeLot(2, 2, ruin ? 'ruin2' : 'house2', ruin ? T_RUIN : T_SOLID, x, y);
    else { const hz = rng() < 0.5; placeLot(hz ? 3 : 2, hz ? 2 : 3, ruin ? 'ruin3' : 'house3', ruin ? T_RUIN : T_SOLID, x, y); }
  });
  // gaps between houses: narrow houses, sheds, heaps of rubble; some yards stay open
  tries(Math.round(per * 10), (x, y) => {
    const r = rng();
    if (r < 0.35) { const hz = rng() < 0.5, ruin = rng() < 0.5; placeLot(hz ? 2 : 1, hz ? 1 : 2, ruin ? 'ruin1' : 'house1', ruin ? T_RUIN : T_SOLID, x, y); }
    else if (r < 0.37) placeLot(1, 1, 'rubble', T_LOW, x, y);
  });
  // the monument in the middle of the square
  const mx = Math.round(cx - 1), my = Math.round(cy - 1);
  let okM = SQ > 0; for (let y = my; y < my + 2; y++) for (let x = mx; x < mx + 2; x++) if (grid[y * W + x] !== T_OPEN) okM = false;
  if (okM) { for (let y = my; y < my + 2; y++) for (let x = mx; x < mx + 2; x++) grid[y * W + x] = T_SOLID; objects.push({ kind: T_SOLID, style: 'monument', x: mx, y: my, w: 2, h: 2, seed: 7, fx: 0, fy: 1 }); }
  // barricades and anti-tank hedgehogs across the side streets (never closing one completely)
  const onStreet = (x, y) => inPlay(x, y) && grid[y * W + x] === T_OPEN && B[bi(x, y)] === 1 && !near(x, y, 3);
  let bar = 0;
  tries(Math.round(per / 8), (x, y) => {
    if (bar >= Math.max(2, Math.round(per / 250)) * n) return;
    const hz = rng() < 0.5, style = rng() < 0.5 ? 'barricade' : 'hedgehog', w = style === 'barricade' ? (hz ? 2 : 1) : 1, h = style === 'barricade' ? (hz ? 1 : 2) : 1;
    const rects = lotCopies(x, y, w, h);
    for (const r of rects) for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) if (!onStreet(xx, yy)) return;
    const seed = Math.floor(rng() * 1e9);
    rects.forEach((r, k) => { for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) grid[yy * W + xx] = T_LOW; objects.push({ kind: T_LOW, style, ...r, turn: k, seed }); });
    bar += n;
  });
  // shell craters in the streets and the square (only for the eye)
  for (let i = 0; i < Math.round(per / 60) + 2; i++) {
    const x0 = rng() * W, y0 = rng() * H, seed = Math.floor(rng() * 1e9);
    for (let k = 0; k < n; k++) {
      const [x, y] = rot(x0, y0, k), xi = Math.floor(x), yi = Math.floor(y);
      if (!inPlay(xi, yi) || grid[yi * W + xi] !== T_OPEN || near(xi, yi, 1) || !B[bi(xi, yi)] || B[bi(xi, yi)] >= 4) continue;
      decor.push({ x, y, kind: 'crater', seed: seed + k });
    }
  }
  // the town carries on beyond the play area (scenery only)
  const outer = [];
  const taken = new Uint8Array(BW * BH);
  for (let i = 0; i < BW * BH / 3; i++) {
    const x = -M + Math.floor(rng() * BW), y = -M + Math.floor(rng() * BH), r = rng(), hz = rng() < 0.5;
    const [w, h] = r < 0.45 ? [2, 2] : hz ? [3, 2] : [2, 3];
    let ok = true;
    for (let yy = y; yy < y + h && ok; yy++) for (let xx = x; xx < x + w && ok; xx++) {
      if (xx < -M || yy < -M || xx >= W + M || yy >= H + M || B[bi(xx, yy)] || taken[bi(xx, yy)]) ok = false;
      else if (xx >= -1 && yy >= -1 && xx <= W && yy <= H && (!round || Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) < R + 1.5)) ok = false;
    }
    if (!ok) continue;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) taken[bi(xx, yy)] = 1;
    const ruin = rng() < 0.35, rr = { x, y, w, h };
    outer.push({ style: (ruin ? 'ruin' : 'house') + (w === h ? 2 : 3), ...rr, seed: Math.floor(rng() * 1e9), ...facing(rr) });
  }
  return { margin: M, streets, board: B, outer, river: hasRiver ? river : null, square: SQ };
}

// ---- The beach landing: every army comes ashore on its own beach with the sea behind it (two
// armies: the sea is beyond both short edges; more: the board is an island). In front of each
// beach: obstacles (Czech hedgehogs, Belgian gates, stakes with mines), barbed wire and dunes;
// in the middle a belt of fortifications round a lighthouse on the rocks: gun casemates (solid),
// pillboxes, Tobruk pits and trenches (infantry can get into those and fight from them).
// Everything is laid out for army 0 and copied round the table, so it is fair.
// options: sand: 'black' (volcanic sand), tropic (palms along the dunes)
function beach({ W, H, grid, zones, objects, decor, rng, turns, round, R, opts = {} }) {
  const n = turns.length, cx = W / 2, cy = H / 2, M = 14, z0 = zones[0];
  // army 0's frame: t = inland from the front edge of its zone, a = sideways from its middle line
  const T0 = round ? z0.y : z0.x + z0.w;                                    // the zone's front edge
  const Tc = round ? T0 - cy : cx - T0;                                     // from there to the middle
  const frect = (t0, a0, dt, da) => round ? { x: Math.round(cx + a0), y: Math.round(T0 - t0 - dt), w: da, h: dt } : { x: Math.round(T0 + t0), y: Math.round(cy + a0), w: dt, h: da };
  const near = (x, y, m) => zones.some(z => x >= z.x - m && x < z.x + z.w + m && y >= z.y - m && y < z.y + z.h + m);
  const inPlay = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] !== T_EDGE;
  const copiesOf = r => turns.map(({ c, s, swap }) => {
    const px = r.x + r.w / 2 - cx, py = r.y + r.h / 2 - cy, ww = swap ? r.h : r.w, hh = swap ? r.w : r.h;
    return { x: Math.round(px * c - py * s + cx - ww / 2), y: Math.round(px * s + py * c + cy - hh / 2), w: ww, h: hh };
  });
  // the direction each army's beach lies in (things face it: gun slits, the fronts of pillboxes)
  const ux = round ? 0 : -1, uy = round ? 1 : 0;
  const place = (r, kind, style, margin = 0) => {
    const rects = copiesOf(r), used = new Set();
    for (const q of rects) for (let yy = q.y - margin; yy < q.y + q.h + margin; yy++) for (let xx = q.x - margin; xx < q.x + q.w + margin; xx++) {
      const inside = yy >= q.y && yy < q.y + q.h && xx >= q.x && xx < q.x + q.w;
      if (!inPlay(xx, yy)) { if (inside) return false; continue; }
      if (grid[yy * W + xx] !== T_OPEN || near(xx, yy, 1) || (inside && used.has(yy * W + xx))) return false;
      if (inside) used.add(yy * W + xx);
    }
    const seed = Math.floor(rng() * 1e9);
    rects.forEach((q, k) => {
      for (let yy = q.y; yy < q.y + q.h; yy++) for (let xx = q.x; xx < q.x + q.w; xx++) grid[yy * W + xx] = kind;
      const { c, s } = turns[k];
      objects.push({ kind, style, ...q, turn: k, seed, fx: Math.round(ux * c - uy * s), fy: Math.round(ux * s + uy * c) });
    });
    return true;
  };
  const A = round ? Math.max(Math.floor(z0.w / 2) + 3, Math.floor(Tc * sinT(PI / n) * 0.95)) : Math.floor(z0.h / 2);   // how wide each army's beach is
  const lateral = (i, count) => -A + (i + 0.5) * 2 * A / count;

  // the lighthouse on its rocks in the middle
  const lh = { x: Math.round(cx - 1), y: Math.round(cy - 1), w: 2, h: 2 };
  let lok = true; for (let y = lh.y - 1; y < lh.y + 3; y++) for (let x = lh.x - 1; x < lh.x + 3; x++) if (!inPlay(x, y) || grid[y * W + x] !== T_OPEN) lok = false;
  if (lok) {
    for (let y = lh.y; y < lh.y + 2; y++) for (let x = lh.x; x < lh.x + 2; x++) grid[y * W + x] = T_SOLID;
    objects.push({ kind: T_SOLID, style: 'lighthouse', ...lh, seed: 3, fx: 0, fy: 1 });
  }
  // the fortified belt round it
  const belt = round ? Math.max(6, Math.min(10, Tc * 0.3)) : 1;           // its inner edge, from the middle
  const bt = Tc - belt - 4;                                                // ...in army 0's frame
  const L = round ? Math.max(4, Math.round((belt + 4) * sinT(PI / n) / cosT(PI / n))) : A;
  // trenches along the front of the belt (a zigzag, with gaps to walk through)
  for (let a = -L; a < L; a++) {
    if (((a + L) % 7) >= 5) continue;
    const t = bt - 1 - (Math.floor((a + L) / 2) % 2);
    place(frect(t, a, 1, 1), T_RUIN, 'trench');
  }
  // casemates with a gun, pillboxes, Tobruk pits
  const guns = round ? 1 : 2, boxes = round ? 2 : 3;
  for (let i = 0; i < guns; i++) for (let k = 0; k < 20; k++) if (place(frect(bt + 1 + Math.floor(rng() * 2), Math.round(lateral(i, guns) + (rng() - 0.5) * 4) - 1, 3, 3), T_SOLID, 'casemate', 1)) break;
  for (let i = 0; i < boxes; i++) for (let k = 0; k < 20; k++) if (place(frect(bt + Math.floor(rng() * 3), Math.round(lateral(i, boxes) + (rng() - 0.5) * 5), 2, 2), T_RUIN, 'pillbox', 1)) break;
  for (let i = 0; i < boxes + 1; i++) for (let k = 0; k < 20; k++) if (place(frect(bt - 3 + Math.floor(rng() * 5), Math.round(lateral(i, boxes + 1) + (rng() - 0.5) * 4), 1, 1), T_RUIN, 'tobruk', 1)) break;
  // barbed wire in front of the belt
  for (let a = -L - 1; a < L + 1;) {
    const len = 3 + Math.floor(rng() * 3);
    place(frect(bt - 4, a, 1, len), T_LOW, 'wire');
    a += len + 2 + Math.floor(rng() * 2);
  }
  // dunes above each beach, with gaps
  for (let a = -A; a < A;) {
    const len = 2 + Math.floor(rng() * 3);
    place(frect(7 + Math.floor(rng() * 2), a, 1, len), T_LOW, 'dune');
    a += len + 2 + Math.floor(rng() * 3);
  }
  // beach obstacles
  for (let i = 0; i < A * 1.6; i++) {
    const r = rng(), t = 1 + Math.floor(rng() * 5), a = Math.round((rng() - 0.5) * 2 * A);
    if (r < 0.45) place(frect(t, a, 1, 1), T_LOW, 'hedgehog', 1);
    else if (r < 0.7) place(frect(t, a, 1, 2), T_LOW, 'gate', 1);
    else place(frect(t, a, 1, 1), T_LOW, 'stakes', 1);
  }
  // rocks here and there, seaside villas between the dunes and the belt (when there is room)
  for (let i = 0; i < 2 + A / 8; i++) place(frect(9 + Math.floor(rng() * Math.max(1, bt - 12)), Math.round((rng() - 0.5) * 2 * A), 2, 2), T_SOLID, 'rocks', 1);
  if (bt - 10 >= 4) for (let i = 0; i < 2 + A / 6; i++) {
    const ruin = rng() < 0.5;
    place(frect(10 + Math.floor(rng() * (bt - 13)), Math.round((rng() - 0.5) * 2 * A), 2, 2), ruin ? T_RUIN : T_SOLID, ruin ? 'ruin2' : 'house2', 1);
  }
  // shell craters and mine warning signs (for the eye)
  for (let i = 0; i < 6 + A / 3; i++) {
    const t = 1 + rng() * (bt - 2), a = (rng() - 0.5) * 2 * A, r = frect(t, a, 0, 0), seed = Math.floor(rng() * 1e9), kind = i % 3 ? 'crater' : 'mines';
    for (let k = 0; k < n; k++) {
      const { c, s } = turns[k], px = r.x - cx, py = r.y - cy, x = px * c - py * s + cx, y = px * s + py * c + cy;
      const gx = Math.floor(x), gy = Math.floor(y);
      if (!inPlay(gx, gy) || grid[gy * W + gx] !== T_OPEN || near(gx, gy, 1)) continue;
      decor.push({ x, y, kind, seed: seed + k });
    }
  }
  // palms on a tropical island
  if (opts.tropic) for (let i = 0; i < A * 1.5; i++) {
    const r = frect(5 + rng() * (bt - 6), (rng() - 0.5) * 2 * A, 0, 0), seed = Math.floor(rng() * 1e9);
    for (let k = 0; k < n; k++) {
      const { c, s } = turns[k], px = r.x - cx, py = r.y - cy, x = px * c - py * s + cx, y = px * s + py * c + cy, gx = Math.floor(x), gy = Math.floor(y);
      if (!inPlay(gx, gy) || grid[gy * W + gx] !== T_OPEN || near(gx, gy, 1)) continue;
      decor.push({ x, y, kind: 'palm', seed: seed + k });
    }
  }
  // how far each point of the board is from the sea (negative: in the sea) - for the painter
  const shore = round ? { round: true, r: R + 1.5 } : { round: false };
  return { margin: M, shore, frame: { T0, Tc, round }, sand: opts.sand || 'gold', tropic: !!opts.tropic };
}

// Lanes: one from every army's base to the middle, and one out to the edge between each pair of
// armies (bends copied round the table too). Returns the cells they cover; the curves go to roads.
function lanes({ W, H, M, n, rng, rot, zones, roads, side = true }) {
  const cx = W / 2, cy = H / 2;
  const road = new Uint8Array(W * H);
  const bez = (x0, y0, qx, qy, x1, y1) => {
    roads.push({ x0, y0, qx, qy, x1, y1 });
    const L = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(L * 3);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * qx + t * t * x1, y = u * u * y0 + 2 * u * t * qy + t * t * y1;
      for (let yy = Math.floor(y - 1.2); yy <= y + 1.2; yy++) for (let xx = Math.floor(x - 1.2); xx <= x + 1.2; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const dx = xx + 0.5 - x, dy = yy + 0.5 - y;
        if (dx * dx + dy * dy <= 1.3) road[yy * W + xx] = 1;
      }
    }
  };
  const z0 = zones[0], zx = z0.x + z0.w / 2, zy = z0.y + z0.h / 2;
  const bend = (rng() - 0.5) * 0.5, bend2 = (rng() - 0.5) * 0.6;
  // the side lane leaves the middle between army 0 and the next one (or straight up/down with two armies)
  const far = Math.max(W, H) / 2 + M;
  const [ex, ey] = n === 2 ? [cx, cy - far] : (() => { const [ax, ay] = rot(zx, zy, 1), mx = (zx + ax) / 2 - cx, my = (zy + ay) / 2 - cy, l = Math.hypot(mx, my) || 1; return [cx + mx / l * far, cy + my / l * far]; })();
  for (let k = 0; k < n; k++) {
    const [ax, ay] = rot(zx, zy, k), [bx, by] = rot(ex, ey, k);
    const mx = (ax + cx) / 2, my = (ay + cy) / 2, px = -(cy - ay), py = cx - ax;
    bez(ax, ay, mx + px * bend, my + py * bend, cx, cy);
    const nx = (bx + cx) / 2, ny = (by + cy) / 2, qx = -(by - cy), qy = bx - cx;
    if (side) bez(cx, cy, nx + qx * bend2 * 0.5, ny + qy * bend2 * 0.5, bx, by);
    // the base lane also runs back out behind the army, off the table
    const bxx = ax + (ax - cx) / Math.hypot(ax - cx, ay - cy) * (far - Math.hypot(ax - cx, ay - cy) + 4), byy = ay + (ay - cy) / Math.hypot(ax - cx, ay - cy) * (far - Math.hypot(ax - cx, ay - cy) + 4);
    bez(ax, ay, (ax + bxx) / 2, (ay + byy) / 2, bxx, byy);
  }

  return road;
}

// ---- Winter in the Ardennes: snowy pine forests (soldiers on foot can move and hide among the
// trees, vehicles keep to the lanes and clearings; you cannot see through more than a little
// forest), clearings, lanes, a small village, foxholes, log piles, fallen trees, frozen ponds.
function winter({ W, H, grid, zones, objects, decor, rng, turns, roads, fields, round, R }) {
  const n = turns.length, cx = W / 2, cy = H / 2, M = 14;
  const rot = (x, y, k) => { const { c, s } = turns[k], px = x - cx, py = y - cy; return [px * c - py * s + cx, px * s + py * c + cy]; };
  const near = (x, y, m) => zones.some(z => x >= z.x - m && x < z.x + z.w + m && y >= z.y - m && y < z.y + z.h + m);
  const inPlay = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] !== T_EDGE;
  const road = lanes({ W, H, M, n, rng, rot, zones, roads });
  // forests: a Voronoi diagram again; a field is forest or a clearing, the same for every army
  const { sites, cells } = voronoiSym({ W, H, M, n, rng, rot, per: Math.max(3, Math.round((W + 2 * M) * (H + 2 * M) / 90 / n)) });
  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 0x5bd1e995); h ^= h >>> 15; return ((Math.imul(h, 0x27d4eb2d) ^ (h >>> 13)) >>> 0) / 4294967296; };
  const forestB = new Set();
  for (let b = 0; b < sites.length / n; b++) if (hash(b, 11) < 0.5) forestB.add(b);
  sites.forEach((st, i) => fields.push({ x: st.x, y: st.y, kind: st.b, k: st.k, forest: forestB.has(st.b), poly: cells[i].map(([x, y]) => [x, y]) }));
  const nearest = (x, y) => { let best = 0, bd = Infinity; for (let i = 0; i < sites.length; i++) { const d = (sites[i].x - x) ** 2 + (sites[i].y - y) ** 2; if (d < bd) { bd = d; best = i; } } return sites[best]; };
  const wood = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y * W + x;
    if (grid[c] !== T_OPEN || road[c] || near(x, y, 2)) continue;
    if (forestB.has(nearest(x + 0.5, y + 0.5).b)) { grid[c] = T_RUIN; wood.push(c); }
  }
  if (wood.length) objects.push({ kind: T_RUIN, style: 'forest', cells: wood, x: 0, y: 0, w: W, h: H, seed: 5 });
  // the rest is laid out for army 0 and copied round the table
  const place = (x0, y0, w, h, kind, style, need = T_OPEN, margin = 1) => {
    const rects = turns.map(({ c, s, swap }) => {
      const px = x0 + w / 2 - cx, py = y0 + h / 2 - cy, ww = swap ? h : w, hh = swap ? w : h;
      return { x: Math.round(px * c - py * s + cx - ww / 2), y: Math.round(px * s + py * c + cy - hh / 2), w: ww, h: hh };
    });
    const used = new Set();
    for (const q of rects) for (let yy = q.y - margin; yy < q.y + q.h + margin; yy++) for (let xx = q.x - margin; xx < q.x + q.w + margin; xx++) {
      const inside = yy >= q.y && yy < q.y + q.h && xx >= q.x && xx < q.x + q.w;
      if (!inPlay(xx, yy)) return false;
      const g = grid[yy * W + xx];
      if (road[yy * W + xx] || near(xx, yy, 1) || (inside ? g !== need || used.has(yy * W + xx) : g !== T_OPEN && g !== T_RUIN)) return false;
      if (inside) used.add(yy * W + xx);
    }
    const seed = Math.floor(rng() * 1e9);
    rects.forEach((q, k) => {
      for (let yy = q.y; yy < q.y + q.h; yy++) for (let xx = q.x; xx < q.x + q.w; xx++) {
        const c = yy * W + xx;
        if (grid[c] === T_RUIN) { const f = objects.find(o => o.style === 'forest'); if (f) f.cells.splice(f.cells.indexOf(c), 1); }
        grid[c] = kind;
      }
      objects.push({ kind, style, ...q, turn: k, seed });
    });
    return true;
  };
  let open = 0; for (let c = 0; c < W * H; c++) if (grid[c] === T_OPEN) open++;
  const per = open / n;
  const tries = (count, fn) => { for (let i = 0; i < count; i++) fn(Math.floor(rng() * W), Math.floor(rng() * H)); };
  // a village near the middle: stone farmhouses with snow on the roofs, sheds
  let houses = 0;
  tries(400, (x, y) => {
    if (houses >= Math.max(2, Math.round(per / 500))) return;
    if (Math.hypot(x - cx, y - cy) > Math.max(W, H) * 0.3) return;
    const hz = rng() < 0.5;
    if (place(x, y, hz ? 3 : 2, hz ? 2 : 3, T_SOLID, 'chalet')) houses++;
  });
  tries(Math.round(per / 60), (x, y) => { const hz = rng() < 0.5; place(x, y, hz ? 2 : 1, hz ? 1 : 2, T_SOLID, 'shed'); });
  // foxholes dug in at the forest edges, log piles, fallen trees across the clearings
  tries(Math.round(per / 25), (x, y) => place(x, y, 1, 1, T_RUIN, 'foxhole', T_OPEN, 0));
  tries(Math.round(per / 60), (x, y) => { const hz = rng() < 0.5; place(x, y, hz ? 2 : 1, hz ? 1 : 2, T_LOW, 'logs'); });
  tries(Math.round(per / 45), (x, y) => { const hz = rng() < 0.5; place(x, y, hz ? 3 : 1, hz ? 1 : 3, T_LOW, 'fallen', T_RUIN, 0); });
  // frozen ponds (you can walk on the ice) and shell craters in the snow: for the eye
  for (let i = 0; i < 2 + per / 700; i++) {
    const x0 = rng() * W, y0 = rng() * H, r = 1.5 + rng() * 2, seed = Math.floor(rng() * 1e9);
    for (let k = 0; k < n; k++) {
      const [x, y] = rot(x0, y0, k), gx = Math.floor(x), gy = Math.floor(y);
      if (!inPlay(gx, gy) || grid[gy * W + gx] !== T_OPEN || near(gx, gy, 3)) continue;
      decor.push({ x, y, kind: 'ice', r, seed: seed + k });
    }
  }
  for (let i = 0; i < 4 + per / 250; i++) {
    const x0 = rng() * W, y0 = rng() * H, seed = Math.floor(rng() * 1e9);
    for (let k = 0; k < n; k++) {
      const [x, y] = rot(x0, y0, k), gx = Math.floor(x), gy = Math.floor(y);
      if (!inPlay(gx, gy) || grid[gy * W + gx] !== T_OPEN || near(gx, gy, 1)) continue;
      decor.push({ x, y, kind: 'crater', seed: seed + k });
    }
  }
  return { margin: M, road, forest: [...forestB] };
}

// A helper for the scattered battlefields: place a w x h rectangle (given for army 0) once per army,
// turned round the middle; all its cells must be `need`, with `margin` free cells round it.
function symPlacer({ W, H, grid, zones, objects, rng, turns, block = null }) {
  const cx = W / 2, cy = H / 2;
  const near = (x, y, m) => zones.some(z => x >= z.x - m && x < z.x + z.w + m && y >= z.y - m && y < z.y + z.h + m);
  const inPlay = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] !== T_EDGE;
  return (x0, y0, w, h, kind, style, { need = T_OPEN, margin = 1, zoneGap = 1, extra = null } = {}) => {
    const rects = turns.map(({ c, s, swap }) => {
      const px = x0 + w / 2 - cx, py = y0 + h / 2 - cy, ww = swap ? h : w, hh = swap ? w : h;
      return { x: Math.round(px * c - py * s + cx - ww / 2), y: Math.round(px * s + py * c + cy - hh / 2), w: ww, h: hh };
    });
    const used = new Set();
    for (const q of rects) for (let yy = q.y - margin; yy < q.y + q.h + margin; yy++) for (let xx = q.x - margin; xx < q.x + q.w + margin; xx++) {
      const inside = yy >= q.y && yy < q.y + q.h && xx >= q.x && xx < q.x + q.w;
      if (!inPlay(xx, yy)) { if (inside) return false; continue; }
      const c = yy * W + xx, g = grid[c];
      if ((block && block[c]) || near(xx, yy, zoneGap) || (inside ? g !== need || used.has(c) : g !== T_OPEN)) return false;
      if (inside) used.add(c);
    }
    const seed = Math.floor(rng() * 1e9);
    rects.forEach((q, k) => {
      for (let yy = q.y; yy < q.y + q.h; yy++) for (let xx = q.x; xx < q.x + q.w; xx++) grid[yy * W + xx] = kind;
      objects.push({ kind, style, ...q, turn: k, seed, ...(extra || {}) });
    });
    return true;
  };
}

// ---- The desert (North Africa): open sand and gravel with rocky outcrops, escarpment ridges and
// dunes, a desert track, an oasis in the middle (palms, a well, mud-brick houses, some in ruins),
// stone sangars (infantry fight from them), burnt-out tanks, oil drums, minefields behind wire.
function desert({ W, H, grid, zones, objects, decor, rng, turns, roads, round, R }) {
  const n = turns.length, cx = W / 2, cy = H / 2, M = 14;
  const rot = (x, y, k) => { const { c, s } = turns[k], px = x - cx, py = y - cy; return [px * c - py * s + cx, px * s + py * c + cy]; };
  const road = lanes({ W, H, M, n, rng, rot, zones, roads });
  const place = symPlacer({ W, H, grid, zones, objects, rng, turns, block: road });
  let open = 0; for (let c = 0; c < W * H; c++) if (grid[c] === T_OPEN) open++;
  const per = open / n;
  const tries = (count, fn) => { for (let i = 0; i < count; i++) fn(Math.floor(rng() * W), Math.floor(rng() * H)); };
  const dist = (x, y) => Math.hypot(x - cx, y - cy);
  // the oasis: a pool and palms in the middle, mud-brick houses round it
  const pool = { x: Math.round(cx - 1.5), y: Math.round(cy - 1.5), w: 3, h: 3 };
  let ok = true; for (let y = pool.y; y < pool.y + 3; y++) for (let x = pool.x; x < pool.x + 3; x++) if (grid[y * W + x] !== T_OPEN) ok = false;
  const oasisR = Math.min(9, Math.max(W, H) * 0.12);
  if (ok) {
    const cells = [];
    for (let y = pool.y; y < pool.y + 3; y++) for (let x = pool.x; x < pool.x + 3; x++) { grid[y * W + x] = T_WATER; cells.push(y * W + x); }
    objects.push({ kind: T_WATER, style: 'pool', ...pool, cells, seed: 9 });
  }
  let houses = 0;
  for (let i = 0; i < 300 && houses < Math.max(2, Math.round(per / 400)); i++) {
    const a = rng() * 6.283, r = 3 + rng() * (oasisR + 2), ruin = rng() < 0.4;
    if (place(Math.round(cx + Math.cos(a) * r - 1), Math.round(cy + Math.sin(a) * r - 1), 2, 2, ruin ? T_RUIN : T_SOLID, ruin ? 'adobe_ruin' : 'adobe')) houses++;
  }
  for (let i = 0; i < 6 + per / 250; i++) {                               // palms round the oasis (for the eye)
    const a = rng() * 6.283, r = 2.2 + rng() * oasisR, x0 = cx + Math.cos(a) * r, y0 = cy + Math.sin(a) * r, seed = Math.floor(rng() * 1e9);
    for (let k = 0; k < n; k++) {
      const [x, y] = rot(x0, y0, k), gx = Math.floor(x), gy = Math.floor(y);
      if (gx < 0 || gy < 0 || gx >= W || gy >= H || grid[gy * W + gx] !== T_OPEN) continue;
      decor.push({ x, y, kind: 'palm', seed: seed + k });
    }
  }
  // rocky outcrops and escarpment ridges (you can shoot over a ridge, not over an outcrop)
  tries(Math.round(per / 25), (x, y) => { if (dist(x, y) < oasisR + 2) return; const big = rng() < 0.4; place(x, y, big ? 3 : 2, 2, T_SOLID, big ? 'mesa' : 'outcrop'); });
  tries(Math.round(per / 30), (x, y) => { const len = 3 + Math.floor(rng() * 4), hz = rng() < 0.5; place(x, y, hz ? len : 1, hz ? 1 : len, T_LOW, 'ridge'); });
  tries(Math.round(per / 30), (x, y) => { const len = 2 + Math.floor(rng() * 3), hz = rng() < 0.5; place(x, y, hz ? len : 1, hz ? 1 : len, T_LOW, 'sanddune'); });
  // stone sangars, burnt-out tanks, oil drums, minefields behind wire
  tries(Math.round(per / 70), (x, y) => place(x, y, 1, 1, T_RUIN, 'sangar'));
  tries(Math.round(per / 70), (x, y) => { const hz = rng() < 0.5; place(x, y, hz ? 2 : 1, hz ? 1 : 2, T_SOLID, 'wreck'); });
  tries(Math.round(per / 60), (x, y) => place(x, y, 1, 1, T_LOW, 'drums'));
  tries(Math.round(per / 25), (x, y) => { const len = 3 + Math.floor(rng() * 3), hz = rng() < 0.5; place(x, y, hz ? len : 1, hz ? 1 : len, T_LOW, 'wire', { margin: 0 }); });
  // scrub, craters, mine signs and telegraph poles along the track (for the eye)
  const scatter = (count, kind, gap = 1) => {
    for (let i = 0; i < count; i++) {
      const x0 = rng() * W, y0 = rng() * H, seed = Math.floor(rng() * 1e9);
      for (let k = 0; k < n; k++) {
        const [x, y] = rot(x0, y0, k), gx = Math.floor(x), gy = Math.floor(y);
        if (gx < 0 || gy < 0 || gx >= W || gy >= H || grid[gy * W + gx] !== T_OPEN || zones.some(z => gx >= z.x - gap && gx < z.x + z.w + gap && gy >= z.y - gap && gy < z.y + z.h + gap)) continue;
        decor.push({ x, y, kind, seed: seed + k });
      }
    }
  };
  scatter(Math.round(per / 40), 'scrub', 0);
  scatter(Math.round(per / 150) + 3, 'crater');
  scatter(Math.round(per / 250) + 2, 'mines');
  return { margin: M, road };
}

// ---- The jungle (the Pacific): dense jungle that soldiers on foot can move and hide in (vehicles
// keep to the trails and clearings; you cannot see far into it), trails, a river with wooden
// bridges (only amphibians swim it), a village of stilt huts, log bunkers (infantry fight from
// them), giant banyan trees, bamboo, swampy pools and a crashed fighter plane.
function jungle({ W, H, grid, zones, objects, decor, rng, turns, roads, fields, round, R, opts }) {
  const n = turns.length, cx = W / 2, cy = H / 2, M = 14;
  const rot = (x, y, k) => { const { c, s } = turns[k], px = x - cx, py = y - cy; return [px * c - py * s + cx, px * s + py * c + cy]; };
  const near = (x, y, m) => zones.some(z => x >= z.x - m && x < z.x + z.w + m && y >= z.y - m && y < z.y + z.h + m);
  const hasRiver = opts.river !== undefined ? !!opts.river : true;
  const road = lanes({ W, H, M, n, rng, rot, zones, roads, side: n > 2 || !hasRiver });
  // the river: straight through the middle with two armies, a ring round the middle with more
  const wet = new Uint8Array(W * H), bridges = [];
  let riverA = 0, riverF = 1;
  if (hasRiver) {
    const A = 1.8 + rng() * 1.2, f = 1 + Math.floor(rng() * 2), Rr = R * 0.45;
    riverA = A; riverF = f;
    const mid = y => cx + A * sinT((y - cy) / H * 2 * PI * f);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const inRiver = round ? Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - Rr) < 1.6 : Math.abs(x + 0.5 - mid(y + 0.5)) < 1.6;
      if (inRiver && grid[y * W + x] === T_OPEN && !near(x, y, 1)) wet[y * W + x] = 1;
    }
    if (!round) for (const by of [cy, cy - H * 0.3, cy + H * 0.3]) {
      bridges.push({ x: mid(by), y: by, dx: 1, dy: 0 });
      for (let y = Math.floor(by - 1); y <= Math.floor(by); y++) for (let x = 0; x < W; x++) if (wet[y * W + x]) { wet[y * W + x] = 0; road[y * W + x] = 1; }
    } else {
      // a bridge wherever a trail crosses the ring
      for (const r of roads) {
        let inside = false, ex = 0, ey = 0;
        for (let i = 0; i <= 200; i++) {
          const t = i / 200, u = 1 - t, x = u * u * r.x0 + 2 * u * t * r.qx + t * t * r.x1, y = u * u * r.y0 + 2 * u * t * r.qy + t * t * r.y1;
          const w2 = Math.abs(Math.hypot(x - cx, y - cy) - Rr) < 1.6;
          if (w2 && !inside) { inside = true; ex = x; ey = y; }
          if (!w2 && inside) { inside = false; const dx = x - ex, dy = y - ey, l = Math.hypot(dx, dy) || 1; bridges.push({ x: (x + ex) / 2, y: (y + ey) / 2, dx: dx / l, dy: dy / l }); }
        }
      }
    }
    const cells = [];
    for (let c = 0; c < W * H; c++) if (wet[c] && !road[c]) { grid[c] = T_WATER; cells.push(c); }
    if (cells.length) objects.push({ kind: T_WATER, style: 'jriver', cells, x: 0, y: 0, w: W, h: H, seed: 2 });
  }
  // the jungle itself: a Voronoi diagram, most fields overgrown
  const { sites, cells } = voronoiSym({ W, H, M, n, rng, rot, per: Math.max(3, Math.round((W + 2 * M) * (H + 2 * M) / 80 / n)) });
  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 0x5bd1e995); h ^= h >>> 15; return ((Math.imul(h, 0x27d4eb2d) ^ (h >>> 13)) >>> 0) / 4294967296; };
  const jungleB = new Set();
  for (let b = 0; b < sites.length / n; b++) if (hash(b, 23) < 0.62) jungleB.add(b);
  sites.forEach((st, i) => fields.push({ x: st.x, y: st.y, kind: st.b, k: st.k, forest: jungleB.has(st.b), poly: cells[i].map(([x, y]) => [x, y]) }));
  const nearest = (x, y) => { let best = 0, bd = Infinity; for (let i = 0; i < sites.length; i++) { const d = (sites[i].x - x) ** 2 + (sites[i].y - y) ** 2; if (d < bd) { bd = d; best = i; } } return sites[best]; };
  const wood = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y * W + x;
    if (grid[c] !== T_OPEN || road[c] || near(x, y, 2)) continue;
    if (jungleB.has(nearest(x + 0.5, y + 0.5).b)) { grid[c] = T_RUIN; wood.push(c); }
  }
  if (wood.length) objects.push({ kind: T_RUIN, style: 'forest', cells: wood, x: 0, y: 0, w: W, h: H, seed: 6 });
  const place = symPlacer({ W, H, grid, zones, objects, rng, turns, block: road });
  let open = 0; for (let c = 0; c < W * H; c++) if (grid[c] === T_OPEN || grid[c] === T_RUIN) open++;
  const per = open / n;
  const tries = (count, fn) => { for (let i = 0; i < count; i++) fn(Math.floor(rng() * W), Math.floor(rng() * H)); };
  let huts = 0;
  for (let i = 0; i < 400 && huts < Math.max(2, Math.round(per / 450)); i++) {
    const a = rng() * 6.283, r = 3 + rng() * Math.min(10, Math.max(W, H) * 0.14);
    if (place(Math.round(cx + Math.cos(a) * r - 1), Math.round(cy + Math.sin(a) * r - 1), 2, 2, T_SOLID, 'hut')) huts++;
  }
  tries(Math.round(per / 90), (x, y) => place(x, y, 2, 2, T_RUIN, 'logbunker', { need: T_OPEN }));
  tries(Math.round(per / 90), (x, y) => place(x, y, 2, 2, T_RUIN, 'logbunker', { need: T_RUIN, margin: 0 }));
  tries(Math.round(per / 70), (x, y) => place(x, y, 2, 2, T_SOLID, 'banyan', { need: T_RUIN, margin: 0 }));
  tries(Math.round(per / 45), (x, y) => place(x, y, 1, 1, T_SOLID, 'bamboo', { need: T_RUIN, margin: 0 }));
  if (rng() < 0.8) tries(60, (x, y) => { if (objects.some(o => o.style === 'planewreck')) return; const hz = rng() < 0.5; place(x, y, hz ? 3 : 2, hz ? 2 : 3, T_SOLID, 'planewreck'); });
  for (let i = 0; i < 3 + per / 400; i++) {
    const x0 = rng() * W, y0 = rng() * H, seed = Math.floor(rng() * 1e9);
    for (let k = 0; k < n; k++) {
      const [x, y] = rot(x0, y0, k), gx = Math.floor(x), gy = Math.floor(y);
      if (gx < 0 || gy < 0 || gx >= W || gy >= H || grid[gy * W + gx] !== T_OPEN || near(gx, gy, 1)) continue;
      decor.push({ x, y, kind: 'crater', seed: seed + k });
    }
  }
  return { margin: M, road, bridges, river: hasRiver, riverShape: hasRiver ? (round ? { ring: R * 0.45 } : { A: riverA, f: riverF }) : null };
}

// ---- Mountains: rock massifs with passes between them (the lanes always get through), alpine
// meadows with firs and small groves, boulders and scree, a few stone houses. options.snow: the
// mountains in winter (Narvik). The massifs are really high on the board; the battle is fought
// in the valleys and passes.
function mountain({ W, H, grid, zones, objects, decor, rng, turns, roads, fields, round, R, opts }) {
  const n = turns.length, cx = W / 2, cy = H / 2, M = 14, BW = W + 2 * M, BH = H + 2 * M;
  const rot = (x, y, k) => { const { c, s } = turns[k], px = x - cx, py = y - cy; return [px * c - py * s + cx, px * s + py * c + cy]; };
  const near = (x, y, m) => zones.some(z => x >= z.x - m && x < z.x + z.w + m && y >= z.y - m && y < z.y + z.h + m);
  const road = lanes({ W, H, M, n, rng, rot, zones, roads });
  const { sites, cells } = voronoiSym({ W, H, M, n, rng, rot, per: Math.max(3, Math.round(BW * BH / 70 / n)) });
  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 0x5bd1e995); h ^= h >>> 15; return ((Math.imul(h, 0x27d4eb2d) ^ (h >>> 13)) >>> 0) / 4294967296; };
  const kindOf = b => { const h = hash(b, 31); return h < 0.42 ? 'rock' : h < 0.56 ? 'wood' : 'meadow'; };
  sites.forEach((st, i) => fields.push({ x: st.x, y: st.y, kind: st.b, k: st.k, rock: kindOf(st.b) === 'rock', forest: kindOf(st.b) === 'wood', poly: cells[i].map(([x, y]) => [x, y]) }));
  const nearestI = (x, y) => { let best = 0, bd = Infinity; for (let i = 0; i < sites.length; i++) { const d = (sites[i].x - x) ** 2 + (sites[i].y - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; };
  const keep = opts.fortress !== false ? (round ? 10 : 9) : 0;                 // room for the fortress in the middle
  // which board cells are mountain (the play area and the scenery round it)
  const rockB = new Uint8Array(BW * BH), pass = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (road[y * W + x] || near(x, y, 3) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < keep);
  const massif = new Map();
  for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) {
    const i = nearestI(x + 0.5, y + 0.5);
    if (kindOf(sites[i].b) !== 'rock' || pass(x, y)) continue;
    // lanes also cut through beyond the table edge, so the mountains don't wall them in
    rockB[(y + M) * BW + x + M] = 1;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const c = y * W + x;
    if (grid[c] !== T_OPEN) continue;
    grid[c] = T_SOLID;
    if (!massif.has(i)) massif.set(i, []);
    massif.get(i).push(c);
  }
  for (const r of roads) for (let t = 0; t <= 1; t += 0.004) {                 // lanes outside the play area stay open too
    const u = 1 - t, x = u * u * r.x0 + 2 * u * t * r.qx + t * t * r.x1, y = u * u * r.y0 + 2 * u * t * r.qy + t * t * r.y1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy; if (xx >= -M && yy >= -M && xx < W + M && yy < H + M) rockB[(yy + M) * BW + xx + M] = 0; }
  }
  for (const [i, list] of massif) objects.push({ kind: T_SOLID, style: 'massif', cells: list, x: 0, y: 0, w: W, h: H, seed: i });
  // how far into the rock each board cell is (the painter raises the mountains by it)
  const depth = new Uint8Array(BW * BH), q = [];
  for (let i = 0; i < BW * BH; i++) if (rockB[i]) { const x = i % BW, y = (i / BW) | 0; if (x === 0 || y === 0 || x === BW - 1 || y === BH - 1 || !rockB[i - 1] || !rockB[i + 1] || !rockB[i - BW] || !rockB[i + BW]) { depth[i] = 1; q.push(i); } }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % BW, y = (i / BW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= BW || yy >= BH) continue;
      const j = yy * BW + xx; if (rockB[j] && !depth[j]) { depth[j] = depth[i] + 1; q.push(j); }
    }
  }
  // fir groves (infantry can get in), boulders, scree, stone houses, craters
  const wood = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y * W + x;
    if (grid[c] !== T_OPEN || pass(x, y)) continue;
    if (kindOf(sites[nearestI(x + 0.5, y + 0.5)].b) === 'wood') { grid[c] = T_RUIN; wood.push(c); }
  }
  if (wood.length) objects.push({ kind: T_RUIN, style: 'forest', cells: wood, x: 0, y: 0, w: W, h: H, seed: 8 });
  const place = symPlacer({ W, H, grid, zones, objects, rng, turns, block: road });
  let open = 0; for (let c = 0; c < W * H; c++) if (grid[c] === T_OPEN) open++;
  const per = open / n;
  const tries = (count, fn) => { for (let i = 0; i < count; i++) { const x = Math.floor(rng() * W), y = Math.floor(rng() * H); if (Math.hypot(x - cx, y - cy) > keep + 1) fn(x, y); } };
  tries(Math.round(per / 45), (x, y) => { const big = rng() < 0.3; place(x, y, big ? 2 : 1, big ? 2 : 1, T_SOLID, 'boulder'); });
  tries(Math.round(per / 45), (x, y) => { const len = 2 + Math.floor(rng() * 3), hz = rng() < 0.5; place(x, y, hz ? len : 1, hz ? 1 : len, T_LOW, 'scree'); });
  tries(Math.round(per / 200) + 20, (x, y) => { if (objects.filter(o => o.style === 'mhouse').length >= n * Math.max(1, Math.round(per / 700))) return; const hz = rng() < 0.5; place(x, y, hz ? 4 : 2, hz ? 2 : 4, T_SOLID, 'mhouse'); });
  for (let i = 0; i < 3 + per / 300; i++) {
    const x0 = rng() * W, y0 = rng() * H, seed = Math.floor(rng() * 1e9);
    for (let k = 0; k < n; k++) {
      const [x, y] = rot(x0, y0, k), gx = Math.floor(x), gy = Math.floor(y);
      if (gx < 0 || gy < 0 || gx >= W || gy >= H || grid[gy * W + gx] !== T_OPEN || near(gx, gy, 1)) continue;
      decor.push({ x, y, kind: 'crater', seed: seed + k });
    }
  }
  return { margin: M, road, rockBoard: rockB, rockDepth: depth, snow: !!opts.snow };
}

// ---- A fortress in the middle of the board: a ring of battlemented walls (you can shoot over them,
// not walk through), a gate facing every army, round towers between the gates and a keep in the
// middle. Whatever was there before is cleared away. Fair: every army faces a gate.
function fortress({ W, H, grid, zones, objects, decor, turns, round, R }) {
  const n = turns.length, cx = W / 2, cy = H / 2, R0 = round ? 7 : 6;
  // clear the ground
  const inside = (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < R0 + 2.5;
  for (let y = Math.floor(cy - R0 - 3); y <= cy + R0 + 3; y++) for (let x = Math.floor(cx - R0 - 3); x <= cx + R0 + 3; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H || !inside(x, y) || grid[y * W + x] === T_EDGE) continue;
    grid[y * W + x] = T_OPEN;
  }
  for (let k = objects.length - 1; k >= 0; k--) {
    const o = objects[k];
    if (o.cells) { o.cells = o.cells.filter(c => !inside(c % W, (c / W) | 0)); if (!o.cells.length) objects.splice(k, 1); continue; }
    let hit = false;
    for (let y = o.y; y < o.y + o.h && !hit; y++) for (let x = o.x; x < o.x + o.w && !hit; x++) if (inside(x, y)) hit = true;
    if (hit) objects.splice(k, 1);
  }
  for (let k = decor.length - 1; k >= 0; k--) if (inside(Math.floor(decor[k].x), Math.floor(decor[k].y))) decor.splice(k, 1);
  // gates towards every army, towers half-way between them
  const gates = zones.map(z => { const dx = z.x + z.w / 2 - cx, dy = z.y + z.h / 2 - cy, l = Math.hypot(dx, dy) || 1; return { dx: dx / l, dy: dy / l }; });
  const gateAt = (x, y) => gates.some(g => { const px = x + 0.5 - cx, py = y + 0.5 - cy; return px * g.dx + py * g.dy > 0 && Math.abs(px * g.dy - py * g.dx) < 1.6; });
  const wall = [];
  for (let y = Math.floor(cy - R0 - 1); y <= cy + R0 + 1; y++) for (let x = Math.floor(cx - R0 - 1); x <= cx + R0 + 1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < R0 - 0.5 || d >= R0 + 0.5 || gateAt(x, y)) continue;
    grid[y * W + x] = T_LOW; wall.push(y * W + x);
  }
  objects.push({ kind: T_LOW, style: 'fwall', cells: wall, x: 0, y: 0, w: W, h: H, seed: 4 });
  const towers = [];
  for (let k = 0; k < n; k++) {
    const g = gates[k], a = Math.atan2(g.dy, g.dx) + PI / n;
    const tx = cx + cosT(a) * R0, ty = cy + sinT(a) * R0, r = { x: Math.round(tx - 1), y: Math.round(ty - 1), w: 2, h: 2 };
    for (let y = r.y; y < r.y + 2; y++) for (let x = r.x; x < r.x + 2; x++) grid[y * W + x] = T_SOLID;
    objects.push({ kind: T_SOLID, style: 'ftower', ...r, seed: 10 + k });
    towers.push({ x: tx, y: ty });
  }
  const kr = { x: Math.round(cx - 1.5), y: Math.round(cy - 1.5), w: 3, h: 3 };
  for (let y = kr.y; y < kr.y + 3; y++) for (let x = kr.x; x < kr.x + 3; x++) grid[y * W + x] = T_SOLID;
  objects.push({ kind: T_SOLID, style: 'keep', ...kr, seed: 3, fx: 0, fy: 1 });
  return { r: R0, gates: gates.map(g => ({ x: cx + g.dx * R0, y: cy + g.dy * R0, a: Math.atan2(g.dy, g.dx) })), towers };
}
