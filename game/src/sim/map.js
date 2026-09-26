// Battlefield layout: floor theme, household obstacles and one deployment zone per army.
import { mulberry } from './rng.js';

export const T_OPEN = 0, T_SOLID = 1, T_WATER = 2, T_LOW = 3; // LOW = solid but short: blocks movement, not line of sight

export const THEMES = ['wood', 'carpet', 'kitchen', 'sand', 'grass', 'snow'];

const OBSTACLES = {
  wood:    { tall: ['books', 'shoebox', 'mug', 'lego'], low: ['pencils', 'remote'], water: ['juice', 'cola'] },
  carpet:  { tall: ['books', 'lego', 'toybox', 'blocks'], low: ['pencils', 'crayons'], water: ['juice', 'ink'] },
  kitchen: { tall: ['cereal', 'mug', 'pot', 'blocks'], low: ['spoons'], water: ['milk', 'juice'] },
  sand:    { tall: ['castle', 'bucket', 'rock'], low: ['shells'], water: ['moat'] },
  grass:   { tall: ['flowerpot', 'rock', 'bucket', 'lego'], low: ['twigs'], water: ['puddle'] },
  snow:    { tall: ['snowman', 'rock', 'bucket'], low: ['twigs'], water: ['ice'] },
};

// Map size grows with the number of armies so 8 armies still have room to build.
export function mapSize(n) {
  if (n <= 2) return { W: 64, H: 40, zw: 16, zh: 40 };
  if (n <= 4) return { W: 96, H: 64, zw: 22, zh: 17 };
  return { W: 140, H: 96, zw: 24, zh: 18 };
}

// Deployment zones for 2..8 armies.
function zoneRects(n, W, H, zw, zh) {
  if (n === 2) return [[0, 0, zw, H], [W - zw, 0, zw, H]];
  const spots = [
    [0, H - zh], [W - zw, 0], [W - zw, H - zh], [0, 0],                     // corners
    [Math.floor(W / 2 - zw / 2), 0], [Math.floor(W / 2 - zw / 2), H - zh],  // top / bottom middle
    [0, Math.floor(H / 2 - zh / 2)], [W - zw, Math.floor(H / 2 - zh / 2)],  // left / right middle
  ];
  return spots.slice(0, n).map(([x, y]) => [x, y, zw, zh]);
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
  const { W, H, zw, zh } = mapSize(teams);
  if (layout && THEMES.includes(layout.theme)) theme = layout.theme;
  theme = THEMES.includes(theme) ? theme : THEMES[Math.floor(rng() * THEMES.length)];
  const grid = new Uint8Array(W * H);
  const zones = zoneRects(teams, W, H, zw, zh).map(([x, y, w, h]) => ({ x, y, w, h }));
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
  for (let i = 0; i < Math.round(7 * area); i++) {
    const style = pick(pal.tall);
    const big = style === 'books' || style === 'shoebox' || style === 'toybox' || style === 'cereal' || style === 'castle';
    const w = big ? 3 + Math.floor(rng() * 3) : 2, h = big ? 2 + Math.floor(rng() * 2) : 2;
    tryPlace(T_SOLID, style, rng() < 0.5 ? w : h, rng() < 0.5 ? h : w);
  }
  for (let i = 0; i < Math.round(4 * area); i++) {
    const long = 4 + Math.floor(rng() * 4);
    const horiz = rng() < 0.5;
    tryPlace(T_LOW, pick(pal.low), horiz ? long : 1, horiz ? 1 : long);
  }
  for (let i = 0; i < Math.round(2 * area); i++) {
    const w = 4 + Math.floor(rng() * 5), h = 3 + Math.floor(rng() * 4);
    // rasterise an ellipse-ish puddle into the grid
    for (let n = 0; n < 40; n++) {
      const x = 3 + Math.floor(rng() * (W - w - 6)), y = 3 + Math.floor(rng() * (H - h - 6));
      let ok = true;
      for (let yy = y - 1; yy < y + h + 1 && ok; yy++) for (let xx = x - 1; xx < x + w + 1 && ok; xx++) if (inZone(xx, yy) || grid[yy * W + xx] !== T_OPEN) ok = false;
      if (!ok) continue;
      const cells = [];
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const dx = (xx + 0.5 - x - w / 2) / (w / 2), dy = (yy + 0.5 - y - h / 2) / (h / 2);
        if (dx * dx + dy * dy <= 1.05 + (rng() - 0.5) * 0.3) { grid[yy * W + xx] = T_WATER; cells.push(yy * W + xx); }
      }
      objects.push({ kind: T_WATER, style: pick(pal.water), x, y, w, h, cells, seed: Math.floor(rng() * 1e9) });
      break;
    }
  }
  // a few harmless palm trees / decorations
  for (let i = 0; i < Math.round(6 * area); i++) {
    const x = 1 + rng() * (W - 2), y = 1 + rng() * (H - 2);
    const c = Math.floor(y) * W + Math.floor(x);
    if (grid[c] !== T_OPEN || inZone(Math.floor(x), Math.floor(y))) continue;
    decor.push({ x, y, kind: theme === 'snow' ? 'pine' : theme === 'grass' ? 'bush' : 'palm', seed: Math.floor(rng() * 1e9) });
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

  return { W, H, theme, grid, zones, objects, decor, seed, title: layout && layout.title || '', briefing: layout && layout.briefing || '', tint: layout && /^#[0-9a-f]{6}$/i.test(layout.floorColor || '') ? layout.floorColor : null };
}
