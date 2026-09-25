import { makeMap } from '../src/sim/map.js';
import { Sim } from '../src/sim/sim.js';
import { aiDeploy } from '../src/sim/ai.js';
import { RULES } from '../src/data/catalog.js';

function play(seed, teams) {
  const map = makeMap({ teams, theme: null, seed });
  const sim = new Sim(map, Array.from({ length: teams }, (_, i) => ({ name: 'T' + i, color: i })), seed);
  const log = [];
  let ticks = 0;
  const t0 = Date.now();
  while (sim.phase !== 'over' && sim.round <= RULES.maxRounds + 1) {
    for (const t of sim.teams) aiDeploy(sim, t.id, seed);
    const placed = sim.ents.filter(e => !e.dead).length;
    sim.startBattle();
    while (sim.phase === 'battle') { sim.step(); ticks++; sim.events.length = 0; }
    log.push(`r${sim.round - (sim.phase === 'over' ? 0 : 1)} ents=${placed} alive=[${sim.teams.map(t => t.alive ? 1 : 0)}] hq=[${sim.teams.map(t => { const h = sim.byId.get(t.hq); return h ? Math.round(h.hp) : 0; })}] kills=[${sim.teams.map(t => t.kills)}]`);
  }
  return { hash: sim.stateHash(), winner: sim.winner, rounds: sim.round, ms: Date.now() - t0, ticks, log, theme: map.theme };
}

for (const [seed, teams] of (process.argv[2] ? JSON.parse(process.argv[2]) : [[1, 2], [42, 2], [7, 4], [99, 3]])) {
  const a = play(seed, teams), b = play(seed, teams);
  console.log(`seed ${seed} teams ${teams} theme ${a.theme}: winner ${a.winner} after ${a.rounds} rounds, ${a.ticks} ticks in ${a.ms}ms (${(a.ms / a.ticks).toFixed(2)} ms/tick) deterministic=${a.hash === b.hash}`);
  console.log('  ' + a.log.join('\n  '));
}
