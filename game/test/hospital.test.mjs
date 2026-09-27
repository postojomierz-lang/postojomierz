// Field hospital: rescued wounded wait in the ward, beds halve the wait, veterans come back as themselves.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { RULES, CATALOG } from '../src/data/catalog.js';

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

// the ward, direct
{
  const { sim, place } = setup(3);
  place(0, 'hospital');
  const [A, B] = sim.teams;
  const vet = place(0, 'officer'); vet.xp = 100; vet.rank = 2;
  sim.admit(vet);
  const other = place(1, 'rifleman'); sim.admit(other);
  check(A.ward.length === 1 && B.ward.length === 1 && !sim.byId.has(vet.id), 'admitted');
  sim.returnRecovered(A); sim.returnRecovered(B);
  const back = sim.ents.find(e => e.team === 0 && e.type === 'officer' && e.free);
  check(back && back.rank === 2 && back.xp === 100 && back.maxHp === Math.round(back.def.hp * (1 + RULES.veteran.hp[1])), 'veteran back next round with rank');
  check(A.ward.length === 0, 'hospital ward empty');
  check(B.ward.length === 1, 'no hospital: still recovering after one round');
  sim.returnRecovered(B);
  check(B.ward.length === 0 && sim.ents.some(e => e.team === 1 && e.type === 'rifleman' && e.free), 'no hospital: back after two rounds');
  // more wounded than beds: the rest wait
  for (let i = 0; i < 8; i++) sim.admit(sim.spawn(0, 'rifleman', A.zone.x + 1 + i, A.zone.y + A.zone.h - 2, 0));
  sim.returnRecovered(A);
  check(A.ward.length === 8 - CATALOG.hospital.beds, `beds: ${A.ward.length} waiting`);
  console.log('ward ok');
}

// battles with ambulances and hospitals: wounded rescued, handed over at the tent, deterministic
function battle(seed) {
  const { sim, place } = setup(seed);
  for (const team of [0, 1]) {
    place(team, 'hospital'); place(team, 'ambulance');
    for (let i = 0; i < 12; i++) place(team, 'rifleman');
    place(team, 'mg'); place(team, 'grenadier');
  }
  const ev = {}; let near = 0, far = 0, maxWard = 0;
  for (let r = 0; r < 3 && sim.phase !== 'over'; r++) {
    sim.startBattle();
    while (sim.phase === 'battle') {
      const owner = new Map();
      for (const a of sim.ents) if (a.def.medic) for (const id of a.cargo) owner.set(id, a);
      sim.step();
      for (const e of sim.events) {
        ev[e.t] = (ev[e.t] || 0) + 1;
        if (e.t === 'rescued') {
          const amb = owner.get(e.id), h = amb && sim.hospitalFor(amb);
          if (h) { if (Math.hypot(h.x - amb.x, h.z - amb.z) < 3) near++; else far++; }
        }
      }
      sim.events.length = 0;
    }
    for (const t of sim.teams) maxWard = Math.max(maxWard, t.ward.length);
  }
  return { ev, near, far, maxWard, hash: sim.stateHash() };
}
const a = battle(11), b = battle(11);
console.log(JSON.stringify(a.ev));
console.log('handed over at the tent', a.near, 'elsewhere', a.far, 'max ward', a.maxWard, 'deterministic', a.hash === b.hash);
check(a.hash === b.hash, 'not deterministic');
check(a.ev.rescued > 0, 'nobody rescued');
check(a.near >= a.far, 'ambulances do not reach the hospital');
if (fail) process.exitCode = 1;
