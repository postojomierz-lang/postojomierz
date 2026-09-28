// Stretcher bearers fetch wounded soldiers on foot, one at a time, and hand them in at the hospital;
// they come back next round as themselves.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };

function run(seed) {
  const map = makeMap({ teams: 2, theme: 'wood', seed });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  for (const t of sim.teams) t.money = 5000;
  const place = (team, type) => {
    const z = sim.teams[team].zone;
    for (let y = z.y + 1; y < z.y + z.h - 2; y++) for (let x = z.x + 1; x < z.x + z.w - 2; x++) if (!sim.canPlace(team, type, x, y, 0)) return sim.place(team, type, x, y, 0).ent;
    throw new Error('no room for ' + type);
  };
  place(0, 'hospital'); const b = place(0, 'bearers');
  sim.teams[0].stance = sim.teams[1].stance = 'defend';                     // keep the armies home: only the bearers go out
  sim.startBattle();
  // three wounded lying out in the open, well away from the base and from the enemy
  const z = sim.teams[0].zone, hurt = [];
  for (let i = 0; i < 3; i++) {
    const cx = Math.min(sim.W - 2, Math.max(1, Math.round(z.x + z.w / 2 + (sim.W / 2 - z.x - z.w / 2) * 0.25) + i));
    const cy = Math.round(z.y + z.h / 2) + i * 2;
    const e = sim.spawn(0, 'rifleman', cx, cy, 0); e.xp = 20 * (i + 1); sim.wound(e, null); e.stable = true; hurt.push(e.id);
  }
  const ev = {}; let carried = 0;
  while (sim.phase === 'battle') {
    sim.step();
    for (const e of sim.events) { ev[e.t] = (ev[e.t] || 0) + 1; if (e.t === 'load' && e.id === b.id) carried++; }
    check(b.cargo.length <= 1, 'bearers carry more than one');
    sim.events.length = 0;
  }
  return { ev, carried, back: sim.ents.filter(e => e.free && e.team === 0).map(e => e.xp), hash: sim.stateHash() };
}
const a = run(4), c = run(4);
console.log(JSON.stringify(a.ev), 'carried', a.carried, 'back with xp', a.back, 'deterministic', a.hash === c.hash);
check(a.carried >= 2, 'bearers fetched fewer than 2 wounded');
check(a.ev.rescued >= 1, 'nobody handed in at the hospital');
check(a.back.length === 3 && a.back.every(x => x > 0), 'the wounded did not come back as themselves');
check(a.hash === c.hash, 'not deterministic');
if (fail) process.exitCode = 1;
