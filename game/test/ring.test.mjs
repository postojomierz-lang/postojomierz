// The computer (and the auto-deploy button) fences its HQ in: a closed ring of sandbags, walls and
// wire, front first, machine-gun nests inside it, vehicles kept outside, and holes patched next round.
import { makeMap, T_SOLID, T_LOW, T_EDGE } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { aiDeploy } from '../src/sim/ai.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };

// flood out from the HQ through anything that is not a wall of ours or solid ground:
// a closed ring keeps the flood inside the deployment zone
function enclosed(sim, team) {
  const t = sim.teams[team], z = t.zone, hq = sim.byId.get(t.hq), W = sim.W;
  const seen = new Uint8Array(W * sim.H), stack = [];
  const block = c => { const g = sim.map.grid[c]; if (g === T_SOLID || g === T_LOW || g === T_EDGE) return true;
    const o = sim.byId.get(sim.occ[c]); return !!(o && !o.dead && o.team === team && o.def.cls === 'fort'); };
  for (let y = hq.cy; y < hq.cy + hq.h; y++) for (let x = hq.cx; x < hq.cx + hq.w; x++) { seen[y * W + x] = 1; stack.push(y * W + x); }
  let inside = 0;
  while (stack.length) {
    const c = stack.pop(), x = c % W, y = (c / W) | 0;
    if (x < z.x || y < z.y || x >= z.x + z.w || y >= z.y + z.h) return { closed: false, inside };
    inside++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (!sim.inside(nx, ny)) continue;
      const n = ny * W + nx; if (seen[n] || block(n)) continue;
      seen[n] = 1; stack.push(n);
    }
  }
  return { closed: true, inside };
}

for (const n of [2, 3, 4, 5, 6]) for (const theme of ['normandy', 'town', 'desert']) {
  const map = makeMap({ teams: n, theme, seed: 11 });
  const sim = new Sim(map, Array.from({ length: n }, (_, i) => ({ name: 'T' + i, color: i })), 11);
  for (const t of sim.teams) aiDeploy(sim, t.id, 11);
  let closed = 0, nests = 0, trapped = 0;
  for (const t of sim.teams) {
    const r = enclosed(sim, t.id);
    if (r.closed) closed++;
    for (const e of sim.ents) if (e.team === t.id && e.type === 'mgnest') nests++;
    // no vehicle inside its own fence
    const hq = sim.byId.get(t.hq);
    for (const e of sim.ents) if (e.team === t.id && e.def.vehicle && Math.abs(e.x - hq.x) < hq.w / 2 + 3 && Math.abs(e.z - hq.z) < hq.h / 2 + 3) trapped++;
  }
  console.log(n, 'armies', theme, ': closed rings', closed + '/' + n, 'MG nests', nests, 'vehicles inside', trapped);
  check(closed === n, `${n} armies ${theme}: a base is not fenced in`);
  check(trapped === 0, `${n} armies ${theme}: a vehicle was set down inside the fence`);
}

// holes get patched next round, and the front goes up first when money is short
{
  const map = makeMap({ teams: 2, theme: 'normandy', seed: 5 });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], 5);
  sim.teams[0].money = 60;                                        // only enough for a bit of the ring
  aiDeploy(sim, 0, 5);
  const hq = sim.byId.get(sim.teams[0].hq);
  const forts = sim.ents.filter(e => e.team === 0 && e.def.cls === 'fort');
  check(forts.length > 0 && forts.every(e => e.x > hq.x), 'with little money the front was not built first');
  sim.teams[0].money = 1000; sim.round = 2;
  aiDeploy(sim, 0, 5);
  check(enclosed(sim, 0).closed, 'the ring was not finished in the next round');
  const piece = sim.ents.find(e => e.team === 0 && e.def.cls === 'fort' && e.x < hq.x);   // a piece of a flank (the front has wire out in front too)
  sim.remove(piece); for (const c of sim.cellsOf(piece.type, piece.cx, piece.cy, piece.rot)) sim.occ[c] = 0;
  check(!enclosed(sim, 0).closed, 'removing a piece did not open the ring');
  sim.teams[0].money = 1000; sim.round = 3;
  aiDeploy(sim, 0, 5);
  check(enclosed(sim, 0).closed, 'the hole was not patched');
  console.log('front first, finished and patched:', !fail);
}
if (fail) process.exitCode = 1;
