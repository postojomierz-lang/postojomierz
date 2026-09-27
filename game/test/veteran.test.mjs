// Veterancy: damage dealt earns experience, ranks raise accuracy, rate of fire and toughness.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { RULES } from '../src/data/catalog.js';

const V = RULES.veteran;
let fail = 0;
const check = (ok, msg) => { if (!ok) { console.log('FAIL', msg); fail++; } };

function setup(seed) {
  const map = makeMap({ teams: 2, theme: 'wood', seed });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], seed);
  for (const t of sim.teams) t.money = 50000;
  const place = (team, type) => {
    const z = sim.teams[team].zone;
    for (let y = z.y + 1; y < z.y + z.h - 2; y++) for (let x = z.x + 1; x < z.x + z.w - 2; x++) if (!sim.canPlace(team, type, x, y, 0)) return sim.place(team, type, x, y, 0).ent;
    throw new Error('no room for ' + type);
  };
  return { sim, place };
}

// direct: a rifleman that wrecks a tank's worth of damage climbs ranks
{
  const { sim, place } = setup(3);
  const vet = place(0, 'rifleman');
  const hp0 = vet.maxHp, cost = vet.def.cost;
  const targets = [];
  for (let i = 0; i < 3; i++) targets.push(place(1, 'tank'));
  let promos = 0;
  for (const t of targets) {
    sim.damage(t, t.hp, vet);
    promos += sim.events.filter(e => e.t === 'promote').length; sim.events.length = 0;
  }
  const expect = V.at.filter(k => vet.xp >= k * cost).length;
  check(vet.rank === expect && vet.rank > 0, `rank ${vet.rank} expected ${expect} (xp ${vet.xp.toFixed(0)})`);
  check(promos === vet.rank, `promote events ${promos}`);
  check(vet.maxHp === Math.round(vet.def.hp * (1 + V.hp[vet.rank - 1])) && vet.maxHp > hp0, `maxHp ${hp0} -> ${vet.maxHp}`);
  // friendly fire earns nothing
  const mate = place(0, 'rifleman'), xp = vet.xp;
  sim.damage(mate, 5, vet);
  check(vet.xp === xp, 'friendly fire gave xp');
  console.log('direct: rank', vet.rank, V.names[vet.rank - 1], 'xp', vet.xp.toFixed(0), 'maxHp', hp0, '->', vet.maxHp);
}

// battle: promotions happen and the simulation stays deterministic
function battle(seed) {
  const { sim, place } = setup(seed);
  for (let i = 0; i < 10; i++) { place(0, 'rifleman'); place(1, 'rifleman'); }
  place(0, 'mg'); place(1, 'mg'); place(0, 'tank'); place(1, 'tank');
  let promos = 0;
  for (let r = 0; r < 3 && sim.phase !== 'over'; r++) {
    sim.startBattle();
    while (sim.phase === 'battle') { sim.step(); promos += sim.events.filter(e => e.t === 'promote').length; sim.events.length = 0; }
  }
  return { promos, hash: sim.stateHash() };
}
const a = battle(7), b = battle(7);
console.log('battle: promotions', a.promos, 'deterministic', a.hash === b.hash);
check(a.hash === b.hash, 'not deterministic');
check(a.promos > 0, 'no promotions in battle');
if (fail) process.exitCode = 1;
