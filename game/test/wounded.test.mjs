// Vehicles do not run over the wounded: a jeep and a tank driving straight at a soldier lying in
// their way steer round him, of either side; ambulances still get close enough to load him.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };

function run(type, woundedTeam) {
  const map = makeMap({ teams: 2, theme: 'wood', seed: 3, layout: { objects: [], decor: [] } });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], 3);
  sim.startBattle();
  const v = sim.spawn(0, type, 26, 24, 0);
  const d = sim.spawn(woundedTeam, 'rifleman', 33, 24, 0); sim.wound(d, null); d.stable = true; d.bleed = 1e9;
  d.x = 33.5; d.z = v.z;
  let closest = 99, t = 0;
  for (; t < 600; t++) {
    sim.buildBuckets();
    if (sim.goTo(v, 40.5, v.z < 30 ? 24.5 : 24.5, 1, 0.5)) break;
    closest = Math.min(closest, Math.hypot(v.x - d.x, v.z - d.z));
  }
  return { closest, t, arrived: t < 600 };
}
for (const [type, team] of [['jeep', 0], ['jeep', 1], ['tank', 1]]) {
  const r = run(type, team);
  console.log(type, 'past a wounded soldier of team', team, ': closest', r.closest.toFixed(2), 'arrived', r.arrived, 'after', r.t);
  check(r.arrived, type + ' never got past the wounded man');
  check(r.closest > 0.6, type + ' ran over the wounded man');
}
// an ambulance still loads him
{
  const map = makeMap({ teams: 2, theme: 'wood', seed: 3, layout: { objects: [], decor: [] } });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], 3);
  sim.teams[0].stance = sim.teams[1].stance = 'defend';
  sim.startBattle();
  const a = sim.spawn(0, 'ambulance', 20, 24, 0);
  const d = sim.spawn(0, 'rifleman', 30, 24, 0); sim.wound(d, null); d.stable = true; d.bleed = 1e9;
  let loaded = false;
  for (let t = 0; t < 800 && !loaded; t++) { sim.step(); loaded = d.loaded; sim.events.length = 0; }
  check(loaded, 'the ambulance could not get close enough to load the wounded man');
}
if (fail) process.exitCode = 1;
