// Engineers drive out, lay tank traps and mines in front of their base, and the mines go off
// under enemy vehicles (anti-tank) and soldiers (anti-personnel), never under their own side.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { aiDeploy, aiOrders } from '../src/sim/ai.js';

let fail = 0;
const tot = { lay: 0, traps: 0, at: 0, ap: 0, boomAt: 0, boomAp: 0, ownHit: 0, trapsKilled: 0, maxOut: 0 };
for (const [seed, teams, theme] of [[3, 2, 'normandy'], [11, 4, 'desert'], [5, 2, 'town']]) {
  const map = makeMap({ teams, theme, seed });
  const sim = new Sim(map, Array.from({ length: teams }, (_, i) => ({ name: 'T' + i, color: i })), seed);
  while (sim.phase !== 'over') {
    for (const t of sim.teams) if (t.alive) {
      const z = map.zones[t.id];
      // every army gets a tank and two kinds of engineers (in turn) so the behaviour is exercised
      for (const type of ['tank', 'eng_at', sim.round % 2 ? 'eng_traps' : 'eng_ap']) for (let k = 0; k < 80; k++) { const r = sim.place(t.id, type, z.x + (k * 3 + 1) % (z.w - 2), z.y + (k * 5 + 2) % (z.h - 2), 0); if (!r.error) break; }
      aiDeploy(sim, t.id, seed); aiOrders(sim, t.id, seed);
    }
    sim.events.length = 0;
    sim.startBattle();
    while (sim.phase === 'battle') {
      const before = new Map(sim.ents.map(e => [e.id, e.hp]));
      sim.step();
      for (const ev of sim.events) {
        if (ev.t === 'lay') {
          tot.lay++; tot[ev.kind === 'tanktrap' ? 'traps' : ev.kind]++;
          const e = sim.byId.get(ev.id), zn = sim.teams[e.team].zone;
          const out = Math.max(zn.x - ev.x, 0, ev.x - (zn.x + zn.w), zn.y - ev.z, 0, ev.z - (zn.y + zn.h));
          tot.maxOut = Math.max(tot.maxOut, out);
        }
        if (ev.t === 'mine') {
          tot[ev.kind === 'at' ? 'boomAt' : 'boomAp']++;
          // the one who set it off must be an enemy of the mine's army
          const near = sim.ents.filter(o => !o.def.static && o.y < 0.5 && Math.hypot(o.x - ev.x, o.z - ev.z) < 1 && before.get(o.id) > o.hp);
          if (near.length && near.every(o => o.team === ev.team)) tot.ownHit++;
        }
        if (ev.t === 'death') { const e = sim.byId.get(ev.id); if (e && e.type === 'tanktrap') tot.trapsKilled++; }
      }
      sim.events.length = 0;
    }
  }
}
console.log(JSON.stringify(tot));
if (!tot.traps) { console.log('FAIL: no tank traps were set up'); fail = 1; }
if (!tot.at || !tot.ap) { console.log('FAIL: no mines were laid'); fail = 1; }
if (!tot.boomAt && !tot.boomAp) { console.log('FAIL: no mine ever went off'); fail = 1; }
if (tot.ownHit) { console.log('FAIL: a mine went off under its own side'); fail = 1; }
if (tot.maxOut > 24) { console.log('FAIL: engineers wandered too far from home', tot.maxOut); fail = 1; }

// determinism with mines on the field
const run = () => {
  const map = makeMap({ teams: 2, theme: 'normandy', seed: 9 });
  const sim = new Sim(map, [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], 9);
  for (let r = 0; r < 3; r++) {
    for (const t of sim.teams) { const z = map.zones[t.id]; for (const type of ['eng_at', 'eng_ap']) for (let k = 0; k < 80; k++) if (!sim.place(t.id, type, z.x + (k * 3 + 1) % (z.w - 2), z.y + (k * 5 + 2) % (z.h - 2), 0).error) break; aiDeploy(sim, t.id, 9); aiOrders(sim, t.id, 9); }
    sim.startBattle(); while (sim.phase === 'battle') { sim.step(); sim.events.length = 0; }
    if (sim.phase === 'over') break;
  }
  return sim.stateHash() + ':' + sim.mines.length;
};
const a = run(), b = run();
console.log('deterministic', a === b, a);
if (a !== b) { console.log('FAIL: not deterministic'); fail = 1; }
process.exit(fail);
