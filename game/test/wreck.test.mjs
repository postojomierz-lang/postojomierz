// Wrecks: a destroyed vehicle stays where it died for two rounds, burning through the first; it
// blocks vehicles (which drive round it, or a heavy tank shoves it aside), not soldiers, who take
// cover behind it; its smoke gets in the way of direct fire.
import { makeMap, T_OPEN } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { RULES } from '../src/data/catalog.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };

function setup(seed) {
  const map = makeMap({ teams: 2, theme: 'wood', seed, layout: { objects: [], decor: [] } });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  sim.startBattle();
  return sim;
}
const cx = 39, cz = 24;

// the wreck blocks vehicles, not soldiers, and is cover
{
  const sim = setup(3);
  const tank = sim.spawn(1, 'tank_heavy', cx, cz, 0);
  sim.die(tank, null);
  const cells = tank.wreckCells;
  check(tank.wreck && cells.length >= 2, 'no wreck cells (' + cells.length + ')');
  const jeep = sim.spawn(0, 'jeep', 30, 10, 0), man = sim.spawn(0, 'rifleman', 30, 12, 0);
  check(cells.every(c => !sim.canEnter(jeep, c)), 'a jeep can drive into the wreck');
  check(cells.every(c => sim.canEnter(man, c)), 'a soldier cannot get past the wreck');
  // a soldier right next to it, with the enemy on the far side, is in cover
  man.x = tank.x - 1.2; man.z = tank.z;
  check(sim.inCover(man, { x: tank.x + 8, z: tank.z }) < 1, 'no cover behind the wreck');
  // burning: smoke across the line of fire of a soldier shooting through the whole wreck
  const a = sim.spawn(0, 'rifleman', cx - 4, cz, 0), b = sim.spawn(1, 'rifleman', cx + 5, cz, 0);
  a.x = tank.x - 4; a.z = tank.z; b.x = tank.x + 4; b.z = tank.z;
  const burningLos = sim.los(a, b);
  sim.round++;                                       // next round: it only smoulders
  const coldLos = sim.los(a, b);
  sim.round--;
  console.log('wreck cells', cells.length, 'line of fire while burning', burningLos, 'after', coldLos);
  check(!burningLos && coldLos, 'smoke from the burning wreck should block the line of fire, only while burning');
}
// a jeep sent past the wreck drives round it
{
  const sim = setup(4);
  const tank = sim.spawn(1, 'tank_heavy', cx, cz, 0); sim.die(tank, null);
  const jeep = sim.spawn(0, 'jeep', cx - 6, cz, 0);
  let t = 0, inside = 0;
  while (t++ < 400 && !sim.goTo(jeep, tank.x + 5, tank.z, 1, 0.5)) if (tank.wreckCells.includes(sim.cellOf(jeep.x, jeep.z))) inside++;
  check(t < 400 && inside === 0, 'the jeep did not drive round the wreck (' + t + ' ticks, ' + inside + ' inside)');
}
// a heavy tank blocked by a wreck on its way shoves it aside
{
  const sim = setup(5);
  const wreck = sim.spawn(1, 'jeep', cx, cz, 0); sim.die(wreck, null);
  const tank = sim.spawn(0, 'tank_heavy', cx - 3, cz, 0);
  const cell = wreck.wreckCells[0];
  // make the flow field lead straight through the wreck: the tank's next cell is a wreck cell
  let shoved = false;
  for (let i = 0; i < RULES.shoveTicks + 5 && !shoved; i++) {
    const field = new Float32Array(sim.W * sim.H).fill(1e9);
    for (let c = 0; c < field.length; c++) field[c] = Math.abs((c % sim.W) - (cx + 20)) + Math.abs(((c / sim.W) | 0) - cz);
    sim.fields.set('0:wheel', field);
    tank.x = cell % sim.W - 0.5; tank.z = ((cell / sim.W) | 0) + 0.5; tank.target = 0;
    sim.move(tank, null);
    shoved = sim.events.some(e => e.t === 'shove');
  }
  check(shoved && wreck.dead && !sim.byId.has(wreck.id) && sim.occ[cell] === 0, 'the heavy tank did not shove the wreck away');
}
// wrecks last two rounds
{
  const sim = setup(6);
  const t = sim.spawn(1, 'tank', cx, cz, 0); sim.die(t, null);
  sim.endBattle();
  check(sim.byId.has(t.id) && sim.occ[t.wreckCells[0]] === t.id, 'wreck gone after one round');
  sim.startBattle(); sim.endBattle();
  check(!sim.byId.has(t.id), 'wreck still there after two rounds');
}
// AI battles with wrecks: deterministic
function battle(seed) {
  const sim = new Sim(makeMap({ teams: 2, theme: 'normandy', seed }), [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  const place = (team, type) => { const z = sim.teams[team].zone;
    for (let y = z.y + 1; y < z.y + z.h - 2; y++) for (let x = z.x + 1; x < z.x + z.w - 2; x++) if (!sim.canPlace(team, type, x, y, 0)) return sim.place(team, type, x, y, 0).ent; };
  let wrecks = 0;
  for (let r = 0; r < 3 && sim.phase !== 'over'; r++) {
    for (const t of sim.teams) t.money = 3000;
    for (const team of [0, 1]) { place(team, 'tank'); place(team, 'jeep'); place(team, 'bazooka'); place(team, 'bazooka'); for (let i = 0; i < 6; i++) place(team, 'rifleman'); }
    sim.startBattle(); while (sim.phase === 'battle') { sim.step(); sim.events.length = 0; }
    wrecks = Math.max(wrecks, sim.ents.filter(e => e.wreck).length);
  }
  return { hash: sim.stateHash(), wrecks };
}
const x = battle(7), y = battle(7);
console.log('battles: most wrecks on the field', x.wrecks, 'deterministic', x.hash === y.hash);
check(x.hash === y.hash, 'not deterministic');
check(x.wrecks > 0, 'no wreck ever stayed on the field');
if (fail) process.exitCode = 1;
