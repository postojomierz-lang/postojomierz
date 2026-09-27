// Battlefield layout: floor theme, household obstacles and one deployment zone per army.
import { mulberry } from './rng.js';

export const T_OPEN = 0, T_SOLID = 1, T_WATER = 2, T_LOW = 3; // LOW = solid but short: blocks movement, not line of sight
export const T_EDGE = 4; // off the edge of the round table: nobody walks there, but you can see and shoot across

// 'normandy' is a diorama battlefield (see normandy() below); the rest are the classic toy-room floors
export const ROOM_THEMES = ['wood', 'carpet', 'kitchen', 'sand', 'grass', 'snow'];
export const THEMES = ['normandy', ...ROOM_THEMES];

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
export function makeMap({ teams, theme, seed, layout = null }) {
  teams = Math.max(2, Math.min(MAX_ARMIES, teams));
  const rng = mulberry(seed);
  const { W, H, zw, zh, round } = mapSize(teams);
  if (layout && ROOM_THEMES.includes(layout.theme)) theme = layout.theme;
  theme = THEMES.includes(theme) && !(layout && theme === 'normandy') ? theme : ROOM_THEMES[Math.floor(rng() * ROOM_THEMES.length)];
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
  } else if (theme === 'normandy') {
    extra = normandy({ W, H, grid, zones, objects, decor, rng, inZone, turns, copies, placeSym, putWater, fields, roads, round, R });
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
function normandy({ W, H, grid, zones, objects, decor, rng, inZone, turns, placeSym, putWater, fields, roads, round, R }) {
  const n = turns.length, cx = W / 2, cy = H / 2, M = 14;                 // M: scenery beyond the play area
  const rot = (x, y, k) => { const { c, s } = turns[k], px = x - cx, py = y - cy; return [px * c - py * s + cx, px * s + py * c + cy]; };
  const inside = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && grid[(y | 0) * W + (x | 0)] !== T_EDGE;
  const near = (x, y, m) => zones.some(z => x >= z.x - m && x < z.x + z.w + m && y >= z.y - m && y < z.y + z.h + m);

  // lanes: one from every army's base to the middle, and one out to the edge between each pair of armies
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
    bez(cx, cy, nx + qx * bend2 * 0.5, ny + qy * bend2 * 0.5, bx, by);
    // the base lane also runs back out behind the army, off the table
    const bxx = ax + (ax - cx) / Math.hypot(ax - cx, ay - cy) * (far - Math.hypot(ax - cx, ay - cy) + 4), byy = ay + (ay - cy) / Math.hypot(ax - cx, ay - cy) * (far - Math.hypot(ax - cx, ay - cy) + 4);
    bez(ax, ay, (ax + bxx) / 2, (ay + byy) / 2, bxx, byy);
  }

  // field sites, copied round the table
  const base = [], per = Math.max(3, Math.round((W + 2 * M) * (H + 2 * M) / 120 / n));
  for (let i = 0; i < per; i++) base.push([-M + rng() * (W + 2 * M), -M + rng() * (H + 2 * M)]);
  const sites = [];
  for (let k = 0; k < n; k++) base.forEach(([x, y], b) => { const [sx, sy] = rot(x, y, k); sites.push({ x: sx, y: sy, b, k }); });
  // Voronoi cells by clipping the board rectangle with the bisector of every other site
  const X0 = -M, Y0 = -M, X1 = W + M, Y1 = H + M;
  const cells = sites.map((s, i) => {
    let poly = [[X0, Y0, -1], [X1, Y0, -1], [X1, Y1, -1], [X0, Y1, -1]];   // [x, y, label of the edge that starts here]
    for (let j = 0; j < sites.length && poly.length; j++) {
      if (j === i) continue;
      const o = sites[j], nx = o.x - s.x, ny = o.y - s.y;
      if (nx * nx + ny * ny > 60 * 60) continue;                           // too far to matter
      const mx = (o.x + s.x) / 2, my = (o.y + s.y) / 2, f = p => (p[0] - mx) * nx + (p[1] - my) * ny;   // > 0: on the other side
      const out = [];
      for (let a = 0; a < poly.length; a++) {
        const p = poly[a], q = poly[(a + 1) % poly.length], fp = f(p), fq = f(q);
        if (fp <= 0) out.push(p);
        if ((fp <= 0) !== (fq <= 0)) {
          const t = fp / (fp - fq), x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
          out.push([x, y, fp <= 0 ? j : p[2]]);
        }
      }
      poly = out;
    }
    return poly;
  });
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
    if (hash(key[0], key[1], key[2]) < 0.25) return;                        // an open border
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
  return { margin: M, borders, road };
}
