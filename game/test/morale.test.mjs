// Morale: badly hurt soldiers may break and run home; officers and military police keep them in the
// fight, and an MP turns back those already running.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { RULES } from '../src/data/catalog.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };

function setup(seed) {
  const map = makeMap({ teams: 2, theme: 'wood', seed });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  for (const t of sim.teams) t.money = 50000;
  sim.startBattle();
  const mid = (x, z) => sim.spawn(0, 'rifleman', x, z, 0);
  return { sim, mid };
}
const enemy = { id: 999999, team: 1 };
const hurt = (sim, e) => sim.damage(e, Math.floor(e.maxHp * (1 - RULES.morale.breakAt)) + 1, enemy);

// alone in the middle of the map: about `chance` of them break
{
  const { sim, mid } = setup(3);
  let broke = 0, n = 0;
  for (let i = 0; i < 40; i++) { const e = mid(20 + (i % 10), 20 + ((i / 10) | 0) * 2); hurt(sim, e); n++; if (e.flee > 0) broke++; }
  const rate = broke / n;
  console.log('alone: broke', broke, 'of', n);
  check(rate > 0.1 && rate < 0.65, 'break rate ' + rate);
}
// next to an officer, or an MP: nobody breaks
for (const type of ['officer', 'mp']) {
  const { sim, mid } = setup(3);
  sim.spawn(0, type, 25, 25, 0);
  let broke = 0;
  for (let i = 0; i < 20; i++) { const e = mid(23 + (i % 5), 23 + ((i / 5) | 0)); hurt(sim, e); if (e.flee > 0) broke++; }
  console.log(type, 'close by: broke', broke);
  check(broke === 0, type + ' did not steady them');
}
// running: moves towards home, and an MP turns him round
{
  const { sim, mid } = setup(3);
  const f = sim.fields.get('0:home:foot'), z = sim.teams[0].zone;
  let spot = null;                                                  // open ground well out of the base that has a way home
  for (let x = z.x + z.w + 10; x < sim.W - 2 && !spot; x++) for (let y = 4; y < sim.H - 4 && !spot; y++) if (f[y * sim.W + x] < 1e6 && !sim.occ[y * sim.W + x]) spot = [x, y];
  const e = mid(spot[0], spot[1]); e.flee = 100;
  const d0 = f[sim.cellOf(e.x, e.z)];
  for (let i = 0; i < 20; i++) sim.step();
  check(f[sim.cellOf(e.x, e.z)] < d0, 'a runner did not head home');
  check(e.flee > 0, 'stopped running too soon');
  const m = sim.spawn(0, 'mp', Math.floor(e.x) - 5, Math.floor(e.z), 0);   // not close enough to steady, close enough to rally
  let rallied = false;
  for (let i = 0; i < 3; i++) { sim.step(); if (sim.events.some(v => v.t === 'rally' && v.id === e.id)) rallied = true; sim.events.length = 0; }
  check(rallied && e.flee === 0, 'the MP did not turn him round');
}
// AI battles with MPs: breaks and rallies happen, deterministically
function battle(seed) {
  const map = makeMap({ teams: 2, theme: 'normandy', seed });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  const place = (team, type) => {
    const z = sim.teams[team].zone;
    for (let y = z.y + 1; y < z.y + z.h - 2; y++) for (let x = z.x + 1; x < z.x + z.w - 2; x++) if (!sim.canPlace(team, type, x, y, 0)) return sim.place(team, type, x, y, 0).ent;
  };
  for (const t of sim.teams) t.money = 3000;
  for (let i = 0; i < 20; i++) { place(0, 'rifleman'); place(1, 'rifleman'); }
  place(0, 'mp'); place(0, 'mp'); place(1, 'mg'); place(0, 'mg');
  const ev = {};
  for (let r = 0; r < 2 && sim.phase !== 'over'; r++) {
    sim.startBattle();
    while (sim.phase === 'battle') { sim.step(); for (const v of sim.events) ev[v.t] = (ev[v.t] || 0) + 1; sim.events.length = 0; }
  }
  return { ev, hash: sim.stateHash() };
}
const a = battle(7), b = battle(7);
console.log('battle: break', a.ev.break || 0, 'rally', a.ev.rally || 0, 'deterministic', a.hash === b.hash);
check(a.hash === b.hash, 'not deterministic');
check(a.ev.break > 0, 'nobody ever broke');
check(a.ev.rally > 0, 'the MPs never turned anybody back');
if (fail) process.exitCode = 1;
