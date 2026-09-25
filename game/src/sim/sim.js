// Deterministic battle simulation. No DOM, no three.js, no Math.random, no trig:
// given the same map, seed and placement orders, every machine produces the same battle.
import { CATALOG, RULES } from '../data/catalog.js';
import { mulberry } from './rng.js';
import { T_OPEN, T_SOLID, T_WATER, T_LOW } from './map.js';

const DT = 1 / RULES.tickRate;
const INF = 1e9;
const HELI_ALT = 3.2;
const SPEED = 1.35;   // global pace of movement
const MOVE_CLASSES = ['foot', 'wheel', 'amphib'];

export class Sim {
  constructor(map, teamSpecs, seed) {
    this.map = map;
    this.W = map.W; this.H = map.H;
    this.rng = mulberry(seed ^ 0x5bd1e995);
    this.tick = 0;
    this.round = 1;
    this.phase = 'deploy';          // deploy | battle | over
    this.battleTick = 0;
    this.ents = [];
    this.byId = new Map();
    this.nextId = 1;
    this.projectiles = [];
    this.events = [];
    this.winner = -1;
    this.occ = new Int32Array(this.W * this.H);   // static entity id per cell (0 = none)
    this.orders = [];                             // every placement, in order (for replays / online)
    this.teams = teamSpecs.map((t, i) => ({
      id: i, name: t.name, color: t.color, human: !!t.human, zone: map.zones[i],
      money: RULES.startBudget, bounty: 0, vehicles: 0, alive: true, hq: 0,
      kills: 0, losses: 0, spent: 0,
    }));
    this.fields = new Map();
    for (const t of this.teams) {
      const z = t.zone;
      // HQ at the back of the zone (the side facing the map edge)
      const [w, h] = CATALOG.hq.size;
      let x = z.x + ((z.w - w) >> 1), y = z.y + ((z.h - h) >> 1);
      const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
      const ex = cx < this.W / 3 ? -1 : cx > this.W * 2 / 3 ? 1 : 0, ey = cy < this.H / 3 ? -1 : cy > this.H * 2 / 3 ? 1 : 0;
      x += ex * ((z.w - w) >> 1) - ex; y += ey * ((z.h - h) >> 1) - ey;
      if (this.map.grid[y * this.W + x] !== T_OPEN) { x = z.x + 1; y = z.y + 1; }
      const e = this.spawn(t.id, 'hq', x, y, 0);
      t.hq = e.id;
    }
  }

  // ---------------------------------------------------------------- helpers
  cellOf(x, z) { return (Math.floor(z) | 0) * this.W + (Math.floor(x) | 0); }
  inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.W && cy < this.H; }
  footprint(type, cx, cy, rot) {
    const [w, h] = CATALOG[type].size;
    return rot & 1 ? [h, w] : [w, h];
  }
  enemies(a, b) { return a !== b; }

  // ---------------------------------------------------------------- placement
  canPlace(teamId, type, cx, cy, rot = 0) {
    const def = CATALOG[type], t = this.teams[teamId];
    if (!def || this.phase !== 'deploy' || !t.alive || type === 'hq') return 'Not available';
    if (def.cost > t.money) return 'Not enough money';
    if (def.vehicle && t.vehicles >= RULES.vehiclesPerRound) return `Only ${RULES.vehiclesPerRound} vehicles per round`;
    const [w, h] = this.footprint(type, cx, cy, rot), z = t.zone;
    if (cx < z.x || cy < z.y || cx + w > z.x + z.w || cy + h > z.y + z.h) return 'Must be inside your deployment zone';
    for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
      const c = y * this.W + x;
      if (this.map.grid[c] !== T_OPEN || this.occ[c]) return 'Space is taken';
    }
    for (const e of this.ents) {
      if (e.dead || e.def.static || e.def.cls === 'air') continue;
      const r = e.def.radius;
      if (e.x + r > cx && e.x - r < cx + w && e.z + r > cy && e.z - r < cy + h) return 'Space is taken';
    }
    return null;
  }

  place(teamId, type, cx, cy, rot = 0) {
    const err = this.canPlace(teamId, type, cx, cy, rot);
    if (err) return { error: err };
    const t = this.teams[teamId], def = CATALOG[type];
    t.money -= def.cost; t.spent += def.cost;
    if (def.vehicle) t.vehicles++;
    this.orders.push({ round: this.round, team: teamId, type, cx, cy, rot });
    return { ent: this.spawn(teamId, type, cx, cy, rot) };
  }

  // Undo a placement made during the current deploy phase (full refund).
  sell(teamId, id) {
    const e = this.byId.get(id);
    if (!e || e.dead || e.team !== teamId || e.placedRound !== this.round || this.phase !== 'deploy' || e.def.cls === 'hq') return false;
    const t = this.teams[teamId];
    t.money += e.def.cost; t.spent -= e.def.cost;
    if (e.def.vehicle) t.vehicles--;
    const i = this.orders.findIndex(o => o.round === this.round && o.team === teamId && o.type === e.type && o.cx === e.cx && o.cy === e.cy);
    if (i >= 0) this.orders.splice(i, 1);
    this.remove(e);
    return true;
  }

  spawn(teamId, type, cx, cy, rot) {
    const def = CATALOG[type];
    const [w, h] = this.footprint(type, cx, cy, rot);
    const t = this.teams[teamId];
    // face towards the middle of the map
    let fx = this.W / 2 - (cx + w / 2), fz = this.H / 2 - (cy + h / 2);
    const fl = Math.sqrt(fx * fx + fz * fz) || 1;
    const e = {
      id: this.nextId++, type, def, team: teamId, cx, cy, rot, w, h,
      x: cx + w / 2, z: cy + h / 2, y: def.cls === 'air' ? HELI_ALT : 0,
      px: 0, pz: 0, hp: def.hp, maxHp: def.hp, dirX: fx / fl, dirZ: fz / fl,
      cd: 0, target: 0, retarget: 0, dead: false, deadTick: 0, placedRound: this.round,
      salvo: 0, salvoCd: 0, moving: false, aimX: 0, aimZ: 0, stuck: 0,
    };
    if (def.static) {
      if (def.cls === 'fort' || def.cls === 'hq') { e.dirX = rot & 1 ? 0 : 1; e.dirZ = rot & 1 ? 1 : 0; if (def.cls === 'hq') { e.dirX = fx / fl; e.dirZ = fz / fl; } }
      for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) this.occ[y * this.W + x] = e.id;
    }
    e.px = e.x; e.pz = e.z;
    this.ents.push(e); this.byId.set(e.id, e);
    this.events.push({ t: 'spawn', id: e.id });
    return e;
  }

  remove(e) {
    e.dead = true;
    this.freeCells(e);
    this.ents.splice(this.ents.indexOf(e), 1);
    this.byId.delete(e.id);
    this.events.push({ t: 'remove', id: e.id });
  }
  freeCells(e) {
    if (!e.def.static) return;
    for (let y = e.cy; y < e.cy + e.h; y++) for (let x = e.cx; x < e.cx + e.w; x++) if (this.occ[y * this.W + x] === e.id) this.occ[y * this.W + x] = 0;
  }

  // ---------------------------------------------------------------- phases
  startBattle() {
    if (this.phase !== 'deploy') return;
    this.phase = 'battle';
    this.battleTick = 0;
    this.events.push({ t: 'battle', round: this.round });
    this.fields.clear();
  }

  endBattle() {
    const alive = this.teams.filter(t => t.alive);
    if (alive.length <= 1 || this.round >= RULES.maxRounds) {
      this.phase = 'over';
      if (alive.length === 1) this.winner = alive[0].id;
      else if (alive.length > 1) {
        // round limit: strongest army wins
        let best = -1, bestScore = -1;
        for (const t of alive) {
          let s = 0;
          for (const e of this.ents) if (!e.dead && e.team === t.id) s += e.def.cls === 'hq' ? e.hp : e.def.cost * e.hp / e.maxHp;
          if (s > bestScore) { bestScore = s; best = t.id; }
        }
        this.winner = best;
      }
      this.events.push({ t: 'over', winner: this.winner });
      return;
    }
    this.round++;
    this.phase = 'deploy';
    for (const t of this.teams) {
      if (!t.alive) continue;
      t.money += RULES.income + RULES.incomeGrowth * (this.round - 1) + Math.round(t.bounty);
      t.bounty = 0; t.vehicles = 0;
    }
    // clear wrecks and fallen soldiers from the previous round
    for (const e of [...this.ents]) if (e.dead) this.remove(e);
    this.events.push({ t: 'deploy', round: this.round });
  }

  step() {
    if (this.phase !== 'battle') return;
    this.tick++; this.battleTick++;
    for (const e of this.ents) { e.px = e.x; e.pz = e.z; }
    if (this.battleTick % RULES.tickRate === 1) this.buildFields();
    this.buildBuckets();
    const list = this.ents.slice();
    for (const e of list) if (!e.dead) this.think(e);
    this.separate();
    this.stepProjectiles();
    const alive = this.teams.filter(t => t.alive).length;
    if (alive <= 1 || this.battleTick >= RULES.battleSeconds * RULES.tickRate) this.endBattle();
  }

  // ---------------------------------------------------------------- pathing
  moveClass(e) { return e.def.move === 'air' ? 'air' : e.def.move === 'amphib' ? 'amphib' : e.def.vehicle ? 'wheel' : 'foot'; }

  // Cost of entering a cell for the flow field (Infinity = never). Enemy structures are
  // "passable at a cost" so armies will break through walls when there is no way around.
  cellCost(c, cls, team) {
    const g = this.map.grid[c];
    if (g === T_SOLID || g === T_LOW) return INF;
    if (g === T_WATER) return cls === 'amphib' ? 1.4 : INF;
    const s = this.occ[c];
    if (!s) return 1;
    const o = this.byId.get(s);
    if (!o || o.dead) return 1;
    if (o.team === team) {
      if (cls === 'foot' && (o.def.wire || o.type === 'sandbags')) return 3;
      if (cls !== 'foot' && o.def.wire) return 1.5;
      return INF;
    }
    if (cls !== 'foot' && o.def.wire) return 1.5;
    return 5 + o.hp / 10;
  }
  // Can a unit physically stand in this cell right now?
  canEnter(e, c) {
    const cls = this.moveClass(e);
    if (cls === 'air') return true;
    const g = this.map.grid[c];
    if (g === T_SOLID || g === T_LOW) return false;
    if (g === T_WATER && cls !== 'amphib') return false;
    const s = this.occ[c];
    if (!s) return true;
    const o = this.byId.get(s);
    if (!o || o.dead) return true;
    if (o.def.wire) return cls !== 'foot' || o.team === e.team;
    if (o.type === 'sandbags' && o.team === e.team && cls === 'foot') return true;
    return false;
  }

  buildFields() {
    const W = this.W, H = this.H, N = W * H;
    for (const t of this.teams) {
      if (!t.alive) continue;
      // goals: every enemy thing worth attacking (units on the ground, guns, HQs)
      const goals = [];
      for (const o of this.ents) {
        if (o.dead || o.team === t.id || o.def.cls === 'air' || o.def.cls === 'fort') continue;
        if (o.def.static) { for (let y = o.cy; y < o.cy + o.h; y++) for (let x = o.cx; x < o.cx + o.w; x++) goals.push(y * W + x); }
        else goals.push(this.cellOf(o.x, o.z));
      }
      for (const cls of MOVE_CLASSES) {
        const dist = new Float32Array(N).fill(INF);
        const heap = new MinHeap();
        for (const g of goals) if (dist[g] > 0) { dist[g] = 0; heap.push(0, g); }
        while (heap.size) {
          const [d, c] = heap.pop();
          if (d > dist[c]) continue;
          const x = c % W, y = (c / W) | 0;
          for (let k = 0; k < 8; k++) {
            const nx = x + NX[k], ny = y + NY[k];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const n = ny * W + nx;
            if (k >= 4 && (this.cellCost(y * W + nx, cls, t.id) >= INF || this.cellCost(ny * W + x, cls, t.id) >= INF)) continue;
            const cost = this.cellCost(n, cls, t.id);
            if (cost >= INF) continue;
            // cost of moving *from* n into c: use the cost of c when stepping (goal cells are enemy structures)
            const nd = d + (k >= 4 ? 1.414 : 1) * cost;
            if (nd < dist[n]) { dist[n] = nd; heap.push(nd, n); }
          }
        }
        this.fields.set(t.id + ':' + cls, dist);
      }
    }
  }

  buildBuckets() {
    this.buckets = new Map();
    for (const e of this.ents) {
      if (e.dead || e.def.static) continue;
      const k = this.cellOf(e.x, e.z);
      let b = this.buckets.get(k); if (!b) this.buckets.set(k, b = []);
      b.push(e);
    }
  }

  // ---------------------------------------------------------------- combat helpers
  canHit(e, o) {
    const w = e.def.weapon;
    if (!w || o.dead || o.team === e.team) return false;
    const air = o.def.cls === 'air';
    if (w.airOnly) return air;
    if (air) return !!w.air;
    return true;
  }
  isThreat(o) { return o.def.cls !== 'fort'; }

  los(e, o) {
    const w = e.def.weapon;
    if (w.kind === 'arty' || w.kind === 'grenade' || e.def.cls === 'air' || o.def.cls === 'air') return true;
    const dx = o.x - e.x, dz = o.z - e.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const n = Math.ceil(d * 2);
    for (let i = 1; i < n; i++) {
      const x = e.x + dx * i / n, z = e.z + dz * i / n;
      const c = this.cellOf(x, z);
      if (this.map.grid[c] === T_SOLID) return false;
      const s = this.occ[c];
      if (s && s !== o.id && s !== e.id) {
        const b = this.byId.get(s);
        if (b && b.def.blocksLos) return false;
      }
    }
    return true;
  }

  // Is there cover (sandbags, wall, nest) right next to the target, between it and the shooter?
  inCover(o, from) {
    if (o.def.cls !== 'infantry') return o.def.cover ? 0.6 : 1;
    const dx = from.x - o.x, dz = from.z - o.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    for (const s of [0.8, 1.4]) {
      const c = this.cellOf(o.x + dx / d * s, o.z + dz / d * s);
      const id = this.occ[c];
      if (id) { const b = this.byId.get(id); if (b && b.def.cover && b.team === o.team) return 0.5; }
    }
    return 1;
  }

  dmgMult(kind, o) {
    const d = o.def;
    if (d.wire) return 1; // soldiers cut wire quickly
    if (d.cls === 'fort') return kind === 'bullet' || kind === 'flak' ? 0.4 : 1;
    if (d.static) return kind === 'bullet' || kind === 'flak' ? 0.15 : 1;
    if (d.cls === 'air') return kind === 'flak' ? 1 : 0.45;
    if (d.armor) {
      if (kind === 'bullet') return 0.3 / d.armor;
      if (kind === 'rocket') return 1.5;
      if (kind === 'grenade') return 0.5;
    }
    return 1;
  }

  damage(o, amount, attacker) {
    if (o.dead || amount <= 0) return;
    o.hp -= amount;
    this.events.push({ t: 'hit', id: o.id, amount });
    if (o.hp <= 0) this.kill(o, attacker);
  }

  kill(o, attacker) {
    if (o.dead) return;
    o.dead = true; o.hp = 0; o.deadTick = this.tick;
    this.freeCells(o);
    const t = this.teams[o.team];
    t.losses++;
    if (attacker && attacker.team !== o.team) {
      const at = this.teams[attacker.team];
      at.kills++; at.bounty += o.def.cost * RULES.killBounty;
    }
    this.events.push({ t: 'death', id: o.id, by: attacker ? attacker.id : 0 });
    if (o.def.explodes) this.explode(o.x, o.z, o.def.explodes.radius, o.def.explodes.dmg, null, 'barrel', -1);
    if (o.def.cls === 'hq') {
      t.alive = false;
      this.events.push({ t: 'eliminated', team: o.team, by: attacker ? attacker.team : -1 });
      for (const e of this.ents) if (!e.dead && e.team === o.team) { e.dead = true; e.hp = 0; e.deadTick = this.tick; this.freeCells(e); this.events.push({ t: 'death', id: e.id, by: 0, surrender: true }); }
    }
  }

  explode(x, z, radius, dmg, attacker, kind, team) {
    this.events.push({ t: 'boom', x, z, r: radius, kind });
    for (const o of this.ents) {
      if (o.dead || o.def.cls === 'air') continue;
      if (team >= 0 && o.team === team && !o.def.explodes) continue; // no friendly fire (except barrels)
      const dx = o.x - x, dz = o.z - z;
      const reach = radius + (o.def.static ? Math.max(o.w, o.h) / 2 : (o.def.radius || 0.3));
      const d2 = dx * dx + dz * dz;
      if (d2 > reach * reach) continue;
      const fall = 1 - 0.5 * Math.sqrt(d2) / reach;
      const cover = o.def.cls === 'infantry' && attacker ? (this.inCover(o, attacker) < 1 ? 0.7 : 1) : 1;
      this.damage(o, dmg * fall * cover * this.dmgMult(kind === 'barrel' ? 'shell' : kind, o), attacker);
    }
  }

  // ---------------------------------------------------------------- per-unit brain
  think(e) {
    const def = e.def, w = def.weapon;
    if (e.cd > 0) e.cd -= DT;
    // salvos (rocket trucks)
    if (e.salvo > 0) {
      e.salvoCd -= DT;
      if (e.salvoCd <= 0) { e.salvo--; e.salvoCd = 0.16; this.launch(e, e.aimX, e.aimZ, true); }
    }
    if (!w && def.static) return;

    // pick a target a couple of times per second (staggered by id)
    if (--e.retarget <= 0) { e.retarget = 8 + (e.id % 5); e.target = this.chooseTarget(e); }
    let tgt = e.target ? this.byId.get(e.target) : null;
    if (tgt && (tgt.dead || !this.canHit(e, tgt))) { tgt = null; e.target = 0; }

    let inRange = false;
    if (tgt && w) {
      const dx = tgt.x - e.x, dz = tgt.z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz) - (tgt.def.static ? Math.min(tgt.w, tgt.h) / 2 : 0);
      inRange = d <= w.range && d >= (w.minRange || 0) && this.los(e, tgt);
      if (inRange) {
        const l = Math.sqrt(dx * dx + dz * dz) || 1;
        if (!def.static || def.cls !== 'fort') { e.dirX = dx / l; e.dirZ = dz / l; }
        if (e.cd <= 0 && e.salvo === 0) this.fire(e, tgt);
      }
    }
    e.moving = false;
    if (def.static || inRange) return;
    this.move(e, tgt);
  }

  chooseTarget(e) {
    const w = e.def.weapon;
    if (!w) return 0;
    const sight = w.range + 6;
    let best = 0, bestScore = INF;
    for (const o of this.ents) {
      if (o.dead || !this.isThreat(o) || !this.canHit(e, o)) continue;
      const dx = o.x - e.x, dz = o.z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > sight + (e.def.static ? 0 : 20)) continue;
      if (w.minRange && d < w.minRange) continue;
      let s = d;
      if (w.prefer === 'armor' && o.def.armor) s -= 8;
      if (w.prefer === 'infantry' && o.def.cls === 'infantry') s -= 6;
      if (w.kind === 'arty' && o.def.static) s -= 4;
      if (o.def.cls === 'hq') s += 4;
      if (d <= w.range && !this.los(e, o)) s += 12;
      if (s < bestScore) { bestScore = s; best = o.id; }
    }
    return best;
  }

  fire(e, o) {
    const w = e.def.weapon;
    let cd = w.cd;
    if (e.def.cls === 'infantry' && !e.def.aura) {
      for (const f of this.ents) {
        if (f.dead || f.team !== e.team || !f.def.aura) continue;
        const dx = f.x - e.x, dz = f.z - e.z;
        if (dx * dx + dz * dz <= f.def.aura * f.def.aura) { cd *= 0.7; break; }
      }
    }
    e.cd = cd * (0.9 + this.rng() * 0.2);
    if (w.kind === 'bullet' || w.kind === 'flak') {
      const hit = this.rng() < w.acc * this.inCover(o, e) * (o.def.cls === 'air' && w.kind === 'bullet' ? 0.7 : 1);
      let tx = o.x, tz = o.z;
      if (!hit) { tx += (this.rng() - 0.5) * 2.2; tz += (this.rng() - 0.5) * 2.2; }
      this.events.push({ t: 'shot', id: e.id, kind: w.kind, tx, tz, ty: o.def.cls === 'air' ? HELI_ALT : (hit ? 0.5 : 0.05), target: o.id, hit });
      if (hit) this.damage(o, w.dmg * this.dmgMult(w.kind, o), e);
      return;
    }
    if (w.salvo) { e.salvo = w.salvo; e.salvoCd = 0; e.aimX = o.x; e.aimZ = o.z; return; }
    this.launch(e, o.x, o.z, this.rng() < w.acc, o);
  }

  launch(e, tx, tz, hit, o = null) {
    const w = e.def.weapon;
    const dx0 = tx - e.x, dz0 = tz - e.z;
    const dist = Math.sqrt(dx0 * dx0 + dz0 * dz0);
    const spread = w.kind === 'arty' ? (hit ? 0.8 : 2.2) + dist * 0.04 : hit ? 0.15 : 1.6;
    tx += (this.rng() - 0.5) * 2 * spread; tz += (this.rng() - 0.5) * 2 * spread;
    const arc = w.kind === 'arty' || w.kind === 'grenade';
    const speed = w.projSpeed || (w.kind === 'grenade' ? 9 : 14);
    const flight = arc ? 0.6 + dist / speed : dist / speed;
    const p = {
      id: this.nextId++, owner: e.id, team: e.team, kind: w.kind, fx: e.x, fz: e.z, fy: e.y + 0.5,
      tx, tz, ty: o && o.def.cls === 'air' ? HELI_ALT : 0.2, t: 0, dur: Math.max(0.15, flight), arc,
      dmg: w.dmg, splash: w.splash || 0.4, direct: hit && o && w.kind !== 'arty' ? o.id : 0,
    };
    this.projectiles.push(p);
    this.events.push({ t: 'launch', p: { ...p }, id: e.id });
  }

  stepProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += DT;
      if (p.t < p.dur) continue;
      this.projectiles.splice(i, 1);
      const owner = this.byId.get(p.owner) || { team: p.team, x: p.fx, z: p.fz, id: 0 };
      if (p.direct) {
        const o = this.byId.get(p.direct);
        if (o && !o.dead) { this.damage(o, p.dmg * this.dmgMult(p.kind, o), owner); p.tx = o.x; p.tz = o.z; }
      }
      this.explode(p.tx, p.tz, p.splash, p.direct ? p.dmg * 0.35 : p.dmg, owner, p.kind, p.team);
    }
  }

  // ---------------------------------------------------------------- movement
  move(e, tgt) {
    const cls = this.moveClass(e);
    const spd = e.def.speed * SPEED * DT;
    let gx, gz;
    if (cls === 'air') {
      const o = tgt || this.nearestEnemy(e);
      if (!o) return;
      gx = o.x; gz = o.z;
    } else {
      const field = this.fields.get(e.team + ':' + cls);
      const c = this.cellOf(e.x, e.z);
      if (!field) return;
      const cx = c % this.W, cy = (c / this.W) | 0;
      let best = -1, bestD = field[c];
      for (let k = 0; k < 8; k++) {
        const nx = cx + NX[k], ny = cy + NY[k];
        if (!this.inside(nx, ny)) continue;
        const n = ny * this.W + nx;
        if (field[n] < bestD - 0.01) { bestD = field[n]; best = n; }
      }
      if (best < 0) {
        // at a goal or stuck in a local minimum: head straight for the target if we have one
        if (!tgt) return;
        gx = tgt.x; gz = tgt.z;
      } else {
        // an enemy structure is in the way: attack it
        if (!this.canEnter(e, best)) {
          const b = this.byId.get(this.occ[best]);
          if (b && b.team !== e.team && e.def.weapon) {
            e.target = b.id; e.retarget = 30;
            const dx = b.x - e.x, dz = b.z - e.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
            e.dirX = dx / l; e.dirZ = dz / l;
            const w = e.def.weapon;
            if (e.cd <= 0 && (!w.minRange || l >= w.minRange)) this.fire(e, b);
            return;
          }
        }
        gx = (best % this.W) + 0.5; gz = ((best / this.W) | 0) + 0.5;
      }
    }
    const dx = gx - e.x, dz = gz - e.z;
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.02) return;
    if (cls === 'air' && tgt && l < e.def.weapon.range * 0.7) return;
    const k = Math.min(spd, l) / l;
    this.tryMove(e, dx * k, dz * k);
    e.dirX = dx / l; e.dirZ = dz / l;
    e.moving = true;
  }

  tryMove(e, mx, mz) {
    const nx = e.x + mx, nz = e.z + mz;
    if (nx < 0.3 || nz < 0.3 || nx > this.W - 0.3 || nz > this.H - 0.3) return false;
    const c = this.cellOf(nx, nz);
    if (this.canEnter(e, c)) {
      e.x = nx; e.z = nz;
      // vehicles flatten barbed wire
      const s = this.occ[c];
      if (s && e.def.vehicle && e.def.cls !== 'air') { const o = this.byId.get(s); if (o && o.def.wire) { this.events.push({ t: 'crush', id: o.id }); this.kill(o, o.team !== e.team ? e : null); } }
      return true;
    }
    if (this.canEnter(e, this.cellOf(nx, e.z))) { e.x = nx; return true; }
    if (this.canEnter(e, this.cellOf(e.x, nz))) { e.z = nz; return true; }
    return false;
  }

  nearestEnemy(e) {
    let best = null, bd = INF;
    for (const o of this.ents) {
      if (o.dead || o.team === e.team || !this.isThreat(o) || !this.canHit(e, o)) continue;
      const dx = o.x - e.x, dz = o.z - e.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // push overlapping units apart (ground units only; helicopters only avoid each other)
  separate() {
    for (const e of this.ents) {
      if (e.dead || e.def.static) continue;
      const air = e.def.cls === 'air';
      const cx = Math.floor(e.x), cz = Math.floor(e.z);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const b = this.buckets.get((cz + dz) * this.W + cx + dx);
        if (!b) continue;
        for (const o of b) {
          if (o.id <= e.id || o.dead || (o.def.cls === 'air') !== air) continue;
          const ddx = o.x - e.x, ddz = o.z - e.z;
          const min = e.def.radius + o.def.radius;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 >= min * min) continue;
          let d = Math.sqrt(d2), ux, uz;
          if (d < 1e-4) { ux = ((e.id * 7919) % 3) - 1 || 1; uz = 0.5; d = 0; const ul = Math.sqrt(ux * ux + uz * uz); ux /= ul; uz /= ul; }
          else { ux = ddx / d; uz = ddz / d; }
          const push = (min - d) * 0.5;
          // heavier things get pushed less
          const we = e.def.vehicle ? 0.25 : 1, wo = o.def.vehicle ? 0.25 : 1, s = we + wo;
          this.tryMove(e, -ux * push * we / s * 2, -uz * push * we / s * 2);
          this.tryMove(o, ux * push * wo / s * 2, uz * push * wo / s * 2);
        }
      }
    }
  }

  // ---------------------------------------------------------------- misc
  armyValue(teamId) {
    let v = 0;
    for (const e of this.ents) if (!e.dead && e.team === teamId && e.def.cls !== 'hq') v += e.def.cost;
    return v;
  }

  stateHash() {
    let h = 2166136261;
    const mix = v => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); };
    for (const e of this.ents) { mix(e.id); mix(e.x); mix(e.z); mix(e.hp); mix(e.dead ? 1 : 0); }
    for (const t of this.teams) { mix(t.money); mix(t.kills); mix(t.alive ? 1 : 0); }
    return (h >>> 0).toString(16);
  }
}

const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = k; V[i] = v;
  }
  pop() {
    const K = this.k, V = this.v, rk = K[0], rv = V[0], lk = K.pop(), lv = V.pop();
    if (K.length) {
      let i = 0; const n = K.length;
      while (true) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= lk) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = lk; V[i] = lv;
    }
    return [rk, rv];
  }
}
