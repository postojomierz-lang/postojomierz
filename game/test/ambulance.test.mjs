// Ambulances must be attackable: an ambulance parked in front of enemy riflemen gets destroyed.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
const map = makeMap({ teams: 2, theme: 'wood', seed: 9, layout: { objects: [], decor: [] } });
const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], 9);
const put = (team, type, x, y) => { const r = sim.place(team, type, x, y, 0); if (r.error) throw new Error(type + ': ' + r.error); return r.ent; };
const amb = put(0, 'ambulance', 13, 18);
for (let i = 0; i < 6; i++) put(1, 'rifleman', 48, 14 + i * 2);
sim.startBattle();
let hitAmb = 0;
while (sim.phase === 'battle') { sim.step(); for (const e of sim.events) if (e.t === 'hit' && e.id === amb.id) hitAmb++; sim.events.length = 0; }
console.log('ambulance hits', hitAmb, 'destroyed', amb.dead);
if (!hitAmb) { console.log('FAIL: nobody shot at the ambulance'); process.exitCode = 1; }
