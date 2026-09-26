// Round orders: an army marches on the army picked as its main target; in "defend" it stays home.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';

let fail = 0;
function run(orders) {
  const map = makeMap({ teams: 3, theme: 'wood', seed: 5, layout: { objects: [], decor: [] } });
  const sim = new Sim(map, [0, 1, 2].map(i => ({ name: 'T' + i, color: i })), 5);
  for (const t of sim.teams) {
    const z = t.zone; let n = 0;
    for (let k = 0; k < 400 && n < 10; k++) if (!sim.place(t.id, 'rifleman', z.x + (k * 7) % z.w, z.y + (k * 3) % z.h, 0).error) n++;
  }
  sim.setOrders(0, orders);
  sim.startBattle();
  for (let i = 0; i < 12 * 20 && sim.phase === 'battle'; i++) sim.step();
  const mine = sim.ents.filter(e => e.team === 0 && e.type === 'rifleman' && !e.dead);
  const hq = id => sim.byId.get(sim.teams[id].hq);
  const dist = id => mine.reduce((a, e) => a + Math.hypot(e.x - hq(id).x, e.z - hq(id).z), 0) / Math.max(1, mine.length);
  return { d1: dist(1), d2: dist(2), home: mine.filter(e => sim.inZone(0, e.x, e.z)).length / Math.max(1, mine.length), n: mine.length };
}
const a = run({ focus: 1 }), b = run({ focus: 2 }), c = run({ stance: 'defend' });
console.log('focus 1', a, '\nfocus 2', b, '\ndefend', c);
if (!(a.d1 < b.d1 && b.d2 < a.d2)) { console.log('FAIL: main target does not steer the army'); fail = 1; }
if (c.home < 0.9) { console.log('FAIL: defenders left their zone'); fail = 1; }
process.exitCode = fail;
