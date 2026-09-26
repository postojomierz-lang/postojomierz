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

export function makeMap({ teams, theme, seed }) {
  const rng = mulberry(seed);
  const { W, H, zw, zh } = mapSize(teams);
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

  const area = W * H / 2000;
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
  const decor = [];
  for (let i = 0; i < Math.round(6 * area); i++) {
    const x = 1 + rng() * (W - 2), y = 1 + rng() * (H - 2);
    const c = Math.floor(y) * W + Math.floor(x);
    if (grid[c] !== T_OPEN || inZone(Math.floor(x), Math.floor(y))) continue;
    decor.push({ x, y, kind: theme === 'snow' ? 'pine' : theme === 'grass' ? 'bush' : 'palm', seed: Math.floor(rng() * 1e9) });
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

  return { W, H, theme, grid, zones, objects, decor, seed };
}
