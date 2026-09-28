// Computer army: spends its budget on a sensible base and counters what it has seen.
import { CATALOG, RULES } from '../data/catalog.js';
import { mulberry } from './rng.js';

export function aiDeploy(sim, teamId, seed) {
  const rng = mulberry(seed + teamId * 7919 + sim.round * 104729);
  const t = sim.teams[teamId];
  if (!t.alive) return;
  const z = t.zone;
  const zc = { x: z.x + z.w / 2, y: z.y + z.h / 2 };
  let fx = sim.W / 2 - zc.x, fy = sim.H / 2 - zc.y;
  const fl = Math.sqrt(fx * fx + fy * fy) || 1; fx /= fl; fy /= fl;
  const reach = Math.abs(fx) * z.w / 2 + Math.abs(fy) * z.h / 2;
  // depth: +1 at the front edge of the zone (towards the enemy), -1 at the back
  const depth = (x, y) => ((x + 0.5 - zc.x) * fx + (y + 0.5 - zc.y) * fy) / reach;

  // what did the enemies field so far?
  let enemyArmor = 0, enemyAir = 0, enemyInf = 0;
  for (const e of sim.ents) {
    if (e.team === teamId || e.dead || e.placedRound === sim.round) continue;
    if (e.def.aircraft) enemyAir += e.def.cost;
    else if (e.def.armor) enemyArmor += e.def.cost;
    else if (e.def.cls === 'infantry') enemyInf += e.def.cost;
  }

  const cells = [];
  for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) cells.push({ x, y, d: depth(x, y) + (rng() - 0.5) * 0.12 });

  const tryPlace = (type, lo, hi, rot = 0) => {
    const cand = cells.filter(c => c.d >= lo && c.d <= hi);
    for (let n = 0; n < 60 && cand.length; n++) {
      const c = cand[Math.floor(rng() * cand.length)];
      const r = rot === 'auto' ? (Math.abs(fx) > Math.abs(fy) ? 1 : 0) : rot;
      if (!sim.canPlace(teamId, type, c.x, c.y, r)) { sim.place(teamId, type, c.x, c.y, r); return true; }
    }
    return false;
  };

  const budget = () => t.money;
  const start = t.money;

  // --- fortifications (mostly in round 1) ---
  if (sim.round === 1) {
    const forts = start * 0.14;
    let spent = 0;
    while (spent < forts) {
      const r = rng();
      const type = r < 0.55 ? 'sandbags' : r < 0.8 ? 'wire' : r < 0.93 ? 'wall' : 'barrel';
      if (CATALOG[type].cost > budget() || !tryPlace(type, type === 'wire' ? 0.75 : 0.45, type === 'wire' ? 1 : 0.8, 'auto')) break;
      spent += CATALOG[type].cost;
    }
    if (budget() > 300) tryPlace('mgnest', 0.3, 0.75);
    if (start > 1000 && budget() > 300) tryPlace('tower', 0, 0.6);
  } else if (rng() < 0.5 && budget() > 250) {
    tryPlace(rng() < 0.6 ? 'mgnest' : 'tower', 0.2, 0.8);
  }
  if (enemyAir > 0 && budget() > 200) { tryPlace('aa', -0.4, 0.4); if (enemyAir > 300) tryPlace('aa', -0.4, 0.4); }
  if (sim.round >= 2 && rng() < 0.4 && budget() > 400) tryPlace('fieldgun', -1, -0.2);

  // --- vehicles ---
  const vehiclePlan = [];
  const m = budget();
  if (m > 1100 && (enemyArmor > 300 || rng() < 0.35)) vehiclePlan.push('tank_heavy');
  else if (m > 700) vehiclePlan.push('tank');
  if (m > 450 && rng() < (enemyInf > 200 ? 0.45 : 0.25)) vehiclePlan.push('tank_light');
  if (m > 500 && (enemyInf > 200 || rng() < 0.4)) vehiclePlan.push(rng() < 0.5 ? 'apc' : 'jeep');
  if (sim.round >= 2 && m > 800 && rng() < 0.4) vehiclePlan.push('rockets');
  if (m > 450 && rng() < 0.35) vehiclePlan.push(rng() < 0.5 ? 'amphib' : 'jeep');
  let myInf = 0, myMedic = 0;
  for (const e of sim.ents) if (e.team === teamId && !e.dead) { if (e.def.cls === 'infantry') myInf++; if (e.def.medic && e.def.vehicle) myMedic++; }
  if (!myMedic && (sim.round >= 2 || m > 900) && rng() < 0.6) vehiclePlan.push('ambulance');
  // a field hospital at the back once there are wounded to look after
  if (!sim.beds(teamId) && sim.round >= 2 && (myMedic || t.ward.length) && m > 400 && rng() < 0.6) tryPlace('hospital', -1, -0.3);
  // engineers: mines and tank traps in front of the base, more often when the enemy has armour
  if (m > 400 && rng() < (t.stance === 'defend' ? 0.6 : 0.3)) vehiclePlan.push(enemyArmor > 150 && rng() < 0.7 ? (rng() < 0.5 ? 'eng_at' : 'eng_traps') : 'eng_ap');
  for (const v of vehiclePlan.slice(0, RULES.vehiclesPerRound)) {
    if (CATALOG[v].cost > budget() * 0.5) continue;
    const back = v === 'rockets';
    tryPlace(v, back ? -1 : -0.2, back ? -0.3 : 0.7);
  }

  // --- aircraft (from round 2, or when the enemy has them) ---
  const airPlan = [];
  if (enemyAir > 0 && budget() > 600) airPlan.push('fighter');
  if (sim.round >= 2 && budget() > 700 && rng() < 0.45) airPlan.push(enemyArmor > 250 ? 'attacker' : rng() < 0.5 ? 'heli' : 'attacker');
  if (sim.round >= 3 && budget() > 900 && rng() < 0.35) airPlan.push(rng() < 0.5 ? 'bomber' : 'transport');
  for (const a of airPlan.slice(0, RULES.aircraftPerRound)) {
    if (CATALOG[a].cost > budget() * 0.45) continue;
    tryPlace(a, -1, 0.1);
  }

  // --- infantry with whatever is left ---
  const weights = {
    rifleman: 40, mg: 14, grenadier: 13, sniper: 7, medic: 7, bearers: sim.round >= 2 ? 4 : 0, mp: sim.round >= 2 ? 3 : 0, manpads: enemyAir > 0 ? 10 + Math.min(20, enemyAir / 25) : 0,
    bazooka: 10 + Math.min(30, enemyArmor / 20),
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let infantry = 0, fails = 0;
  while (budget() >= CATALOG.rifleman.cost && fails < 20) {
    let type = 'rifleman';
    if (infantry > 0 && infantry % 10 === 0) type = 'officer';
    else {
      let r = rng() * total;
      for (const [k, wt] of Object.entries(weights)) { if ((r -= wt) <= 0) { type = k; break; } }
    }
    if (CATALOG[type].cost > budget()) type = 'rifleman';
    const lo = type === 'sniper' ? -0.3 : 0.0, hi = type === 'sniper' ? 0.5 : 0.95;
    if (tryPlace(type, lo, hi)) { infantry++; fails = 0; } else fails++;
  }
}

// Pick this round's main target and stance: punish whoever hurt us most, prefer close and weak
// armies but do not pile on someone the others are already beating up, and dig in when the
// armies coming for us are much stronger than we are.
// Call it for every computer army, twice: the second pass sees everybody's first choice.
export function aiOrders(sim, teamId, seed) {
  const t = sim.teams[teamId];
  if (!t.alive) return;
  const rng = mulberry(seed * 31 + teamId * 977 + sim.round * 7);
  const value = new Array(sim.teams.length).fill(0);
  for (const e of sim.ents) if (!e.dead && e.def.cls !== 'hq') value[e.team] += e.def.cost * (e.hp > 0 ? e.hp / e.maxHp : 0.5);
  const hq = id => sim.byId.get(sim.teams[id].hq);
  const me = hq(teamId), diag = Math.sqrt(sim.W * sim.W + sim.H * sim.H);
  let best = -1, bs = Infinity, threat = 0;
  for (const o of sim.teams) {
    if (o.id === teamId || !o.alive) continue;
    const h = hq(o.id);
    const d = me && h ? Math.sqrt((h.x - me.x) ** 2 + (h.z - me.z) ** 2) / diag : 0.5;
    const weak = value[o.id] / (value[teamId] + 50);
    const grudge = Math.min(6, t.hurtBy[o.id] / 40);
    const hqHurt = h ? 1 - h.hp / h.maxHp : 0;      // finish off a crumbling HQ
    let piled = 0;
    for (const x of sim.teams) if (x.alive && x.id !== teamId && x.id !== o.id && sim.focusOf(x.id) === o.id && x.stance === 'attack') piled++;
    const s = d * 10 + weak * 3 - grudge - hqHurt * 4 + piled * (hqHurt > 0.6 ? 0 : 3) + rng() * 1.5;
    if (s < bs) { bs = s; best = o.id; }
    if (sim.focusOf(o.id) === teamId && o.stance === 'attack') threat += value[o.id];
  }
  const defend = value[teamId] < threat * 0.7;
  sim.setOrders(teamId, { focus: best, stance: defend ? 'defend' : 'attack' });
}
