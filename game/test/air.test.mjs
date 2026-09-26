// Aircraft, MANPADS, paratroopers and bombs in a hand-built scenario.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { RULES } from '../src/data/catalog.js';

function run(seed) {
  const map = makeMap({ teams: 2, theme: 'wood', seed });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  for (const t of sim.teams) t.money = 5000;
  const place = (team, type) => {
    const z = sim.teams[team].zone;
    for (let y = z.y + 1; y < z.y + z.h - 2; y++) for (let x = z.x + 1; x < z.x + z.w - 2; x++) if (!sim.canPlace(team, type, x, y, 0)) return sim.place(team, type, x, y, 0).ent;
    throw new Error('no room for ' + type);
  };
  place(0, 'fighter'); place(0, 'bomber');
  place(1, 'transport'); place(1, 'attacker');
  for (let i = 0; i < 4; i++) place(0, 'manpads');
  place(0, 'aa'); place(1, 'tank'); place(1, 'jeep');
  for (let i = 0; i < 6; i++) { place(0, 'rifleman'); place(1, 'rifleman'); }
  place(0, 'ambulance');
  sim.startBattle();
  const ev = {};
  while (sim.phase === 'battle') { sim.step(); for (const e of sim.events) ev[e.t] = (ev[e.t] || 0) + 1; sim.events.length = 0; }
  return { ev, hash: sim.stateHash(), round: sim.round, saved: sim.teams.map(t => t.saved) };
}
const a = run(5), b = run(5);
console.log(JSON.stringify(a.ev));
console.log('saved', a.saved, 'deterministic', a.hash === b.hash);
for (const k of ['drop', 'crash', 'landed']) if (!a.ev[k]) { console.log('MISSING event', k); process.exitCode = 1; }
