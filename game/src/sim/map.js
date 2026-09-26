// Battlefield layout: floor theme, household obstacles and one deployment zone per army.
import { mulberry } from './rng.js';

export const T_OPEN = 0, T_SOLID = 1, T_WATER = 2, T_LOW = 3; // LOW = solid but short: blocks movement, not line of sight
export const T_EDGE = 4; // off the edge of the round table: nobody walks there, but you can see and shoot across

export const THEMES = ['wood', 'carpet', 'kitchen', 'sand', 'grass', 'snow'];

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
const ZONE = { 3: 18, 4: 17, 5: 16, 6: 15, 7: 14, 8: 13 };   // zone edge (cells)
const NEIGHBOUR = 52;                                        // distance between neighbouring HQ zones
export function mapSize(n) {
  if (n <= 2) return { W: 64, H: 40, zw: 16, zh: 40, round: false };
  n = Math.min(8, n);
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
  const rng = mulberry(seed);
  const { W, H, zw, zh, round } = mapSize(teams);
  if (layout && THEMES.includes(layout.theme)) theme = layout.theme;
  theme = THEMES.includes(theme) ? theme : THEMES[Math.floor(rng() * THEMES.length)];
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
  } else {
  // Random battlefield, rotationally symmetric: every obstacle is copied once per army,
  // turned around the middle of the table, so nobody gets better cover than the others.
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
  const placeSym = (kind, style, w, h) => {
    for (let t = 0; t < 40; t++) {
      const rects = copies(2 + Math.floor(rng() * (W - w - 4)), 2 + Math.floor(rng() * (H - h - 4)), w, h);
      if (!fits(rects)) continue;
      const seed0 = Math.floor(rng() * 1e9);
      for (const r of rects) {
        if (kind === T_WATER) putWater(style, r.x, r.y, r.w, r.h);
        else {
          for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) grid[yy * W + xx] = kind;
          objects.push({ kind, style, ...r, seed: seed0 });
        }
      }
      return true;
    }
    return false;
  };
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
      for (const o of objects) if (x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) o.removed = true;
    }
    for (const o of objects.filter(o => o.removed)) {
      for (let yy = o.y; yy < o.y + o.h; yy++) for (let xx = o.x; xx < o.x + o.w; xx++) grid[yy * W + xx] = T_OPEN;
    }
    for (let k = objects.length - 1; k >= 0; k--) if (objects[k].removed) objects.splice(k, 1);
  }

  return { W, H, theme, grid, zones, objects, decor, seed, round, R, title: layout && layout.title || '', briefing: layout && layout.briefing || '', tint: layout && /^#[0-9a-f]{6}$/i.test(layout.floorColor || '') ? layout.floorColor : null };
}
