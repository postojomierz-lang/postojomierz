// Setting a piece down where it cannot go says why: water, rubble, an obstacle, something built
// there, a wreck or a soldier standing on the spot.
import { makeMap, T_OPEN, T_SOLID, T_WATER, T_RUIN } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };
const map = makeMap({ teams: 2, theme: 'normandy', seed: 4 });
const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], 4);
const t = sim.teams[0], z = t.zone, W = sim.W;
t.money = 5000;
// a clean strip of our zone
const x0 = z.x + 9, y0 = z.y + 2;
for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 5; x++) { map.grid[y * W + x] = T_OPEN; sim.occ[y * W + x] = 0; }
for (const e of [...sim.ents]) if (e.x > x0 - 1 && e.x < x0 + 6 && e.z > y0 - 1 && e.z < y0 + 13) sim.remove(e);
const say = (type, x, y, rot = 0) => sim.canPlace(0, type, x, y, rot);

map.grid[y0 * W + x0] = T_WATER;  check(/water/.test(say('rifleman', x0, y0)), 'water: ' + say('rifleman', x0, y0));
map.grid[y0 * W + x0] = T_RUIN;   check(/rubble/.test(say('rifleman', x0, y0)), 'rubble: ' + say('rifleman', x0, y0));
map.grid[y0 * W + x0] = T_SOLID;  check(/obstacle/.test(say('sandbags', x0, y0)), 'obstacle: ' + say('sandbags', x0, y0));
map.grid[y0 * W + x0] = T_OPEN;
check(!say('rifleman', x0, y0), 'a free cell is refused: ' + say('rifleman', x0, y0));
sim.place(0, 'sandbags', x0, y0 + 2, 0);
check(say('wire', x0 + 1, y0 + 2) === 'Taken by your Sandbags', 'own sandbags: ' + say('wire', x0 + 1, y0 + 2));
sim.place(0, 'rifleman', x0 + 2, y0 + 5, 0);
check(say('jeep', x0 + 1, y0 + 4) === 'Too close to your Rifleman', 'soldier: ' + say('jeep', x0 + 1, y0 + 4));
const j = sim.spawn(1, 'jeep', x0 + 1, y0 + 8, 0); sim.makeWreck(j);
check(say('rifleman', x0 + 1, y0 + 8) === 'Blocked by a wreck', 'wreck: ' + say('rifleman', x0 + 1, y0 + 8));
check(say('rifleman', z.x + z.w + 2, y0) === 'Must be inside your deployment zone', 'zone');
console.log('placement messages:', fail ? 'FAIL' : 'ok');
if (fail) process.exitCode = 1;
