// Wounded soldiers are dragged only to nearby cover, medics heal them on the spot,
// and ambulances keep out of the line of fire.
import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { aiDeploy, aiOrders } from '../src/sim/ai.js';

let fail = 0;
const tot = { down: 0, healed: 0, stabilized: 0, pickup: 0, load: 0, rescued: 0, ambLost: 0, ambBuilt: 0, maxDrag: 0 };
for (const [seed, teams] of [[3, 2], [11, 4], [21, 4]]) {
  const map = makeMap({ teams, theme: 'wood', seed });
  const sim = new Sim(map, Array.from({ length: teams }, (_, i) => ({ name: 'T' + i, color: i })), seed);
  const picked = new Map();
  while (sim.phase !== 'over') {
    for (const t of sim.teams) if (t.alive) {
      aiDeploy(sim, t.id, seed); aiOrders(sim, t.id, seed);
      // every army gets a medic squad and an ambulance so the behaviour is exercised
      for (let i = 0; i < 3; i++) { const z = map.zones[t.id]; for (let k = 0; k < 40; k++) { const r = sim.place(t.id, 'medic', z.x + ((k * 7 + i * 3) % z.w), z.y + ((k * 5 + i) % z.h), 0); if (!r.error) break; } }
      const z = map.zones[t.id];
      for (let k = 0; k < 60; k++) { const r = sim.place(t.id, 'ambulance', z.x + (k * 3) % (z.w - 2), z.y + (k * 5) % (z.h - 2), 0); if (!r.error) break; }
    }
    sim.events.length = 0;
    tot.ambBuilt += sim.ents.filter(e => e.type === 'ambulance' && !e.dead).length;
    sim.startBattle();
    while (sim.phase === 'battle') {
      sim.step();
      for (const ev of sim.events) {
        if (ev.t in tot) tot[ev.t]++;
        if (ev.t === 'pickup') { const d = sim.byId.get(ev.wounded); if (d) picked.set(ev.wounded, [d.x, d.z]); }
        if (ev.t === 'stabilized' && picked.has(ev.id)) { const d = sim.byId.get(ev.id), [x, z] = picked.get(ev.id); if (d) tot.maxDrag = Math.max(tot.maxDrag, Math.hypot(d.x - x, d.z - z)); }
        // that drag is over (or he was never dragged this time): forget where he was picked up
        if (['stabilized', 'healed', 'down', 'load'].includes(ev.t)) picked.delete(ev.t === 'load' ? ev.wounded : ev.id);
        if (ev.t === 'death') { const e = sim.byId.get(ev.id); if (e && e.type === 'ambulance') tot.ambLost++; }
      }
      sim.events.length = 0;
    }
  }
}
console.log(JSON.stringify(tot));
if (!tot.healed) { console.log('FAIL: medics never healed anyone'); fail = 1; }
if (!tot.stabilized) { console.log('FAIL: nobody was dragged into cover'); fail = 1; }
if (tot.maxDrag > 9) { console.log('FAIL: wounded dragged too far', tot.maxDrag); fail = 1; }
if (!tot.load) { console.log('FAIL: ambulances never loaded anyone'); fail = 1; }
process.exitCode = fail;
