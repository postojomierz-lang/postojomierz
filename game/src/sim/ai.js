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

  // where may a piece go? (top-left cell, rotation) -> true
  const fits = (type, x, y, r, where) => {
    if (!where) return true;
    const [w, h] = sim.footprint(type, x, y, r);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!where(x + i, y + j)) return false;
    return true;
  };
  const tryPlace = (type, lo, hi, rot = 0, where = null) => {
    const cand = cells.filter(c => c.d >= lo && c.d <= hi);
    for (let n = 0; n < 60 && cand.length; n++) {
      const c = cand[Math.floor(rng() * cand.length)];
      const r = rot === 'auto' ? (Math.abs(fx) > Math.abs(fy) ? 1 : 0) : rot;
      if (!fits(type, c.x, c.y, r, where)) continue;
      if (!sim.canPlace(teamId, type, c.x, c.y, r)) { sim.place(teamId, type, c.x, c.y, r); return true; }
    }
    return false;
  };
  // the best of the cells that score highest, give or take a little
  const placeBest = (type, score, where) => {
    const cand = cells.filter(c => fits(type, c.x, c.y, 0, where)).map(c => ({ c, s: score(c.x, c.y) + rng() * 0.3 })).sort((a, b) => b.s - a.s);
    for (const { c } of cand.slice(0, 40)) if (!sim.canPlace(teamId, type, c.x, c.y, 0)) { sim.place(teamId, type, c.x, c.y, 0); return true; }
    return false;
  };

  // --- the ring round the base: a fence of sandbags, walls and wire round the HQ, built from the
  // front (towards the enemy) first, then the flanks, then the back, with a belt of wire out in
  // front. Every round it is finished off or patched up where it was shot away.
  const hq = sim.byId.get(t.hq);
  const G = 3;                                                    // room between the HQ and the fence
  const rx0 = Math.max(z.x, hq.cx - G), rx1 = Math.min(z.x + z.w - 1, hq.cx + hq.w - 1 + G);
  const ry0 = Math.max(z.y, hq.cy - G), ry1 = Math.min(z.y + z.h - 1, hq.cy + hq.h - 1 + G);
  const inRing = (x, y) => x > rx0 && x < rx1 && y > ry0 && y < ry1;       // inside the fence
  const nearRing = (x, y) => x >= rx0 - 1 && x <= rx1 + 1 && y >= ry0 - 1 && y <= ry1 + 1;
  const open = (x, y) => sim.inside(x, y) && sim.map.grid[y * sim.W + x] !== 1 && sim.map.grid[y * sim.W + x] !== 3 && sim.map.grid[y * sim.W + x] !== 4;
  const ringPieces = () => {
    const sides = [
      { nx: 0, ny: -1, rot: 0, at: i => [i, ry0], from: rx0, to: rx1 },
      { nx: 0, ny: 1, rot: 0, at: i => [i, ry1], from: rx0, to: rx1 },
      { nx: -1, ny: 0, rot: 1, at: i => [rx0, i], from: ry0 + 1, to: ry1 - 1 },
      { nx: 1, ny: 0, rot: 1, at: i => [rx1, i], from: ry0 + 1, to: ry1 - 1 },
    ];
    const pieces = [];
    for (const sd of sides) {
      const dot = sd.nx * fx + sd.ny * fy;
      const group = dot > 0.5 ? 0 : dot > -0.5 ? 1 : 2;             // front, flank, back
      // no fence along a side that backs onto the edge of the table: nobody comes from there
      let way = 0;
      for (let i = sd.from; i <= sd.to; i++) { const [x, y] = sd.at(i); if (open(x + sd.nx, y + sd.ny)) way++; }
      if (!way) continue;
      const kind = group === 0 ? 'sandbags' : group === 1 ? 'wall' : 'wire';
      const lay = (from, to, kind, at, layer) => {
        // tile the side with 2- and 3-cell pieces, so no single cell is left open
        let i = from;
        while (i <= to) {
          const left = to - i + 1;
          if (left < 2) break;
          const n = kind === 'wall' ? (left === 4 || left === 2 ? 2 : 3) : (left === 3 ? 3 : 2);
          const type = n === 3 ? 'wall' : kind === 'wall' ? 'sandbags' : kind;
          const [x, y] = at(i), [mx, my] = at(i + (n - 1) / 2);
          const d = depth(mx, my), mid = Math.abs(i + (n - 1) / 2 - (from + to) / 2);
          pieces.push({ type, x, y, rot: sd.rot, key: layer * 100 + group * 10 - d + mid * 0.01 });
          i += n;
        }
      };
      lay(sd.from, sd.to, kind, sd.at, 0);
      // a belt of barbed wire one cell out in front
      if (group === 0) lay(sd.from - (sd.rot ? 1 : 0), sd.to + (sd.rot ? 1 : 0), 'wire', i => { const [x, y] = sd.at(i); return [x + sd.nx, y + sd.ny]; }, 1);
    }
    return pieces.sort((a, b) => a.key - b.key);
  };
  const buildRing = (spend) => {
    let spent = 0;
    for (const p of ringPieces()) {
      const cost = CATALOG[p.type].cost;
      if (spent + cost > spend || cost > budget()) break;
      const [w, h] = sim.footprint(p.type, p.x, p.y, p.rot);
      if (p.x < z.x || p.y < z.y || p.x + w > z.x + z.w || p.y + h > z.y + z.h) continue;
      if (!sim.place(teamId, p.type, p.x, p.y, p.rot).error) spent += cost;
    }
  };
  // vehicles stay out of the ring (they cannot get past their own sandbags and walls)
  const outside = (x, y) => !nearRing(x, y);

  const budget = () => t.money;
  const start = t.money;

  // --- fortifications: the ring, machine-gun nests in its front corners, towers at the back ---
  const lateral = (x, y) => Math.abs((x + 0.5 - (rx0 + rx1 + 1) / 2) * fy - (y + 0.5 - (ry0 + ry1 + 1) / 2) * fx);
  if (sim.round === 1) {
    buildRing(start * 0.24);
    if (budget() > 300) placeBest('mgnest', (x, y) => depth(x, y) * 4 + lateral(x, y) * 0.3, inRing);
    if (start > 1000 && budget() > 300) placeBest('tower', (x, y) => -depth(x, y) + lateral(x, y) * 0.3, inRing);
  } else {
    buildRing(budget() * 0.3);                                   // finish it off and patch the holes
    if (rng() < 0.5 && budget() > 250) {
      if (rng() < 0.6) placeBest('mgnest', (x, y) => depth(x, y) * 4 + lateral(x, y) * 0.3, inRing);
      else placeBest('tower', (x, y) => -depth(x, y) + lateral(x, y) * 0.3, inRing);
    }
  }
  if (enemyAir > 0 && budget() > 200) { placeBest('aa', (x, y) => -Math.abs(depth(x, y)), inRing); if (enemyAir > 300) placeBest('aa', (x, y) => -Math.abs(depth(x, y)), inRing); }
  if (sim.round >= 2 && rng() < 0.4 && budget() > 400) placeBest('fieldgun', (x, y) => -depth(x, y), inRing) || tryPlace('fieldgun', -1, -0.2, 0, outside);

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
  if (!sim.beds(teamId) && sim.round >= 2 && (myMedic || t.ward.length) && m > 400 && rng() < 0.6) tryPlace('hospital', -1, -0.3, 0, outside) || tryPlace('hospital', -1, 0.3, 0, outside);
  // engineers: mines and tank traps in front of the base, more often when the enemy has armour
  if (m > 400 && rng() < (t.stance === 'defend' ? 0.6 : 0.3)) vehiclePlan.push(enemyArmor > 150 && rng() < 0.7 ? (rng() < 0.5 ? 'eng_at' : 'eng_traps') : 'eng_ap');
  for (const v of vehiclePlan.slice(0, RULES.vehiclesPerRound)) {
    if (CATALOG[v].cost > budget() * 0.5) continue;
    const back = v === 'rockets';
    tryPlace(v, back ? -1 : -0.2, back ? -0.3 : 0.7, 0, outside) || tryPlace(v, -1, 0.9, 0, outside);
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
    rifleman: 40, mg: 14, lmg: sim.round >= 2 ? 6 : 2, grenadier: 13, sniper: 7, medic: 7, bearers: sim.round >= 2 ? 4 : 0, mp: sim.round >= 2 ? 3 : 0, manpads: enemyAir > 0 ? 10 + Math.min(20, enemyAir / 25) : 0,
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
