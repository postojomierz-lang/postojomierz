// The LMG team: weak fire until the bipod is down, strong after; slower once the loader is lost.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { RULES } from '../src/data/catalog.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };
function setup(seed) {
  const map = makeMap({ teams: 2, theme: 'wood', seed });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  sim.startBattle();
  return sim;
}
// shots and hits over 10 s at a target in range: the first 1.5 s is hasty fire
function range(seed, crew) {
  const sim = setup(seed);
  const t = sim.spawn(0, 'lmg', 20, 20, 0); t.crew = crew;
  const shots = [0, 0], hits = [0, 0];
  for (let i = 0; i < 200; i++) {
    let dummy = sim.ents.find(o => o.team === 1 && o.type === 'rifleman' && !o.dead);
    if (!dummy) { dummy = sim.spawn(1, 'rifleman', 32, 20, 0); dummy.hp = dummy.maxHp = 1e6; }
    dummy.x = 32.5; dummy.z = 20.5; dummy.cd = 99;
    sim.step();
    for (const e of sim.events) if (e.t === 'shot' && e.id === t.id) { const k = sim.deployed(t) ? 1 : 0; shots[k]++; if (e.hit) hits[k]++; }
    sim.events.length = 0;
  }
  return { shots, hits, t };
}
const a = range(3, 2), b = range(3, 1);
const rate = x => x.shots[1] / (200 - RULES.lmg.setup * RULES.tickRate);
console.log('crew 2: hasty', a.shots[0], 'shots', a.hits[0], 'hits; set up', a.shots[1], 'shots', a.hits[1], 'hits');
console.log('crew 1: set up', b.shots[1], 'shots');
check(a.shots[1] > 0 && a.hits[1] / a.shots[1] > (a.hits[0] + 1) / (a.shots[0] + 1), 'set up is not more accurate');
check(rate(a) > rate(b) * 1.3, 'the loader does not speed up the gun');
// losing half its health takes the loader
{
  const sim = setup(4); const t = sim.spawn(0, 'lmg', 20, 20, 0);
  sim.damage(t, t.maxHp * 0.6, { id: 0, team: 1 });
  check(t.crew === 1 && sim.events.some(e => e.t === 'crew'), 'loader not lost at half health');
}
// AI battles with LMG teams stay deterministic
function battle(seed) {
  const sim = new Sim(makeMap({ teams: 2, theme: 'normandy', seed }), [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  const place = (team, type) => { const z = sim.teams[team].zone;
    for (let y = z.y + 1; y < z.y + z.h - 2; y++) for (let x = z.x + 1; x < z.x + z.w - 2; x++) if (!sim.canPlace(team, type, x, y, 0)) return sim.place(team, type, x, y, 0).ent; };
  for (const t of sim.teams) t.money = 3000;
  for (let i = 0; i < 12; i++) { place(0, 'rifleman'); place(1, 'rifleman'); }
  for (let i = 0; i < 3; i++) { place(0, 'lmg'); place(1, 'mg'); }
  sim.startBattle(); while (sim.phase === 'battle') { sim.step(); sim.events.length = 0; }
  return sim.stateHash();
}
check(battle(7) === battle(7), 'not deterministic');
if (fail) process.exitCode = 1;
