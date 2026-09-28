// Getting round obstacles: a unit sent to a point behind a wall walks round it instead of pressing
// against it, stretcher bearers fetch a wounded man from behind a hedge, long units keep their ends
// out of walls, and it all stays deterministic.
import { makeMap, T_OPEN, T_SOLID } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };

function setup(seed) {
  const map = makeMap({ teams: 2, theme: 'wood', seed });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  // a clean patch of ground in the middle with a wall across it, open only at its far end
  const W = sim.W;
  for (let y = 8; y < 32; y++) for (let x = 20; x < 44; x++) { map.grid[y * W + x] = T_OPEN; sim.occ[y * W + x] = 0; }
  for (let y = 10; y < 30; y++) map.grid[y * W + 32] = T_SOLID;
  for (const e of sim.ents) if (e.x > 19 && e.x < 45 && e.z > 7 && e.z < 33) sim.remove(e);
  sim.startBattle();
  return sim;
}

// A* finds its way round the wall
{
  const sim = setup(3);
  const e = sim.spawn(0, 'rifleman', 28, 20, 0);
  const path = sim.findPath(e, 20 * sim.W + 36);
  check(path && path.length > 12, 'no path round the wall (' + (path && path.length) + ')');
  check(path && path.every(c => sim.map.grid[c] === T_OPEN), 'path goes through the wall');
}
// goTo: gets there, never inside the wall
function walk(seed, type) {
  const sim = setup(seed);
  const e = sim.spawn(0, type, 28, 20, 0);
  let ticks = 0, inWall = 0;
  while (ticks < 20 * 40 && !sim.goTo(e, 36.5, 20.5, 1, 0.4)) {
    ticks++;
    if (sim.map.grid[sim.cellOf(e.x, e.z)] !== T_OPEN) inWall++;
    if (e.def.len) for (const s of [1, -1]) if (sim.map.grid[sim.cellOf(e.x + e.dirX * e.def.len * s, e.z + e.dirZ * e.def.len * s)] !== T_OPEN) inWall++;
  }
  return { ticks, inWall, x: e.x, z: e.z };
}
for (const type of ['rifleman', 'jeep', 'bearers', 'lmg']) {
  const r = walk(3, type);
  console.log(type, 'reached in', r.ticks, 'ticks, end in wall', r.inWall);
  check(r.ticks < 20 * 40, type + ' never got round the wall');
  check(r.inWall === 0, type + ' went into the wall');
}
// bearers fetch a wounded man lying behind the wall
{
  const sim = setup(5);
  const b = sim.spawn(0, 'bearers', 26, 20, 0);
  const d = sim.spawn(0, 'rifleman', 36, 20, 0); sim.wound(d, null); d.stable = true;
  let loaded = -1;
  for (let t = 0; t < 20 * 40 && loaded < 0; t++) { sim.step(); if (d.loaded) loaded = t; sim.events.length = 0; }
  console.log('bearers loaded the wounded man after', loaded, 'ticks');
  check(loaded >= 0, 'bearers never reached the wounded man behind the wall');
}
// deterministic
const a = walk(7, 'bearers'), b = walk(7, 'bearers');
check(a.x === b.x && a.z === b.z && a.ticks === b.ticks, 'not deterministic');
if (fail) process.exitCode = 1;
