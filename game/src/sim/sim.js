// Deterministic battle simulation. No DOM, no three.js, no Math.random, no trig:
// given the same map, seed and placement orders, every machine produces the same battle.
import { CATALOG, RULES } from '../data/catalog.js';
import { mulberry } from './rng.js';
import { T_OPEN, T_SOLID, T_WATER, T_LOW, T_EDGE } from './map.js';

const DT = 1 / RULES.tickRate;
const INF = 1e9;
const SPEED = 1.35;   // global pace of ground movement
const RESCUERS = new Set(['rifleman', 'officer', 'grenadier', 'bazooka', 'manpads', 'para']);
const COVER_SEARCH = 7;   // how far (cells) comrades look for cover to drag a wounded soldier behind

export const isAir = e => e.def.cls === 'air' || e.def.cls === 'plane';

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
      money: RULES.startBudget, bounty: 0, vehicles: 0, aircraft: 0, alive: true, hq: 0,
      kills: 0, losses: 0, spent: 0, saved: 0, healed: 0, recovered: [],
      focus: -1, stance: 'attack', hurtBy: teamSpecs.map(() => 0),   // orders: main target (-1 = nearest) and attack/defend
    }));
    this.fields = new Map();
    this.fieldQueue = [];
    for (const t of this.teams) {
      const z = t.zone;
      // HQ at the back of the zone (the side facing the map edge)
      const [w, h] = CATALOG.hq.size;
      let x = z.x + ((z.w - w) >> 1), y = z.y + ((z.h - h) >> 1);
      const cx = z.x + z.w / 2 - this.W / 2, cy = z.y + z.h / 2 - this.H / 2, cl = Math.sqrt(cx * cx + cy * cy) || 1;
      const ex = cx / cl > 0.38 ? 1 : cx / cl < -0.38 ? -1 : 0, ey = cy / cl > 0.38 ? 1 : cy / cl < -0.38 ? -1 : 0;
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
  inZone(teamId, x, z) {
    const r = this.teams[teamId].zone;
    return x >= r.x && z >= r.y && x < r.x + r.w && z < r.y + r.h;
  }
  // The army this team marches on this round (-1 = whoever is nearest).
  focusOf(teamId) {
    const f = this.teams[teamId].focus;
    return f >= 0 && f !== teamId && this.teams[f] && this.teams[f].alive ? f : -1;
  }
  defending(teamId) { return this.teams[teamId].stance === 'defend'; }
  // Round orders for a whole army: main target and stance. Recorded with the placements for replays / online.
  setOrders(teamId, { focus, stance } = {}) {
    const t = this.teams[teamId];
    if (this.phase !== 'deploy' || !t || !t.alive) return false;
    if (focus !== undefined) t.focus = Number.isInteger(focus) && focus >= 0 && focus < this.teams.length && focus !== teamId ? focus : -1;
    if (stance !== undefined) t.stance = stance === 'defend' ? 'defend' : 'attack';
    const i = this.orders.findIndex(o => o.kind === 'orders' && o.round === this.round && o.team === teamId);
    const o = { kind: 'orders', round: this.round, team: teamId, focus: t.focus, stance: t.stance };
    if (i >= 0) this.orders[i] = o; else this.orders.push(o);
    this.events.push({ t: 'orders', team: teamId });
    return true;
  }
  // "active" = on the field and able to fight or be shot at
  active(o) { return !o.dead && !o.down && !o.falling && !o.loaded; }

  // ---------------------------------------------------------------- placement
  canPlace(teamId, type, cx, cy, rot = 0) {
    const def = CATALOG[type], t = this.teams[teamId];
    if (!def || this.phase !== 'deploy' || !t.alive || type === 'hq' || def.group === 'hidden') return 'Not available';
    if (def.cost > t.money) return 'Not enough money';
    if (def.vehicle && t.vehicles >= RULES.vehiclesPerRound) return `Only ${RULES.vehiclesPerRound} vehicles per round`;
    if (def.aircraft && t.aircraft >= RULES.aircraftPerRound) return `Only ${RULES.aircraftPerRound} aircraft per round`;
    const [w, h] = this.footprint(type, cx, cy, rot), z = t.zone;
    if (cx < z.x || cy < z.y || cx + w > z.x + z.w || cy + h > z.y + z.h) return 'Must be inside your deployment zone';
    for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
      const c = y * this.W + x;
      if (this.map.grid[c] !== T_OPEN || this.occ[c]) return 'Space is taken';
    }
    for (const e of this.ents) {
      if (e.dead || e.def.static || e.y > 0.5) continue;
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
    if (def.aircraft) t.aircraft++;
    this.orders.push({ round: this.round, team: teamId, type, cx, cy, rot });
    return { ent: this.spawn(teamId, type, cx, cy, rot) };
  }

  // Undo a placement made during the current deploy phase (full refund).
  sell(teamId, id) {
    const e = this.byId.get(id);
    if (!e || e.dead || e.team !== teamId || e.placedRound !== this.round || this.phase !== 'deploy' || e.def.cls === 'hq' || e.free) return false;
    const t = this.teams[teamId];
    t.money += e.def.cost; t.spent -= e.def.cost;
    if (e.def.vehicle) t.vehicles--;
    if (e.def.aircraft) t.aircraft--;
    const i = this.orders.findIndex(o => o.round === this.round && o.team === teamId && o.type === e.type && o.cx === e.cx && o.cy === e.cy);
    if (i >= 0) this.orders.splice(i, 1);
    this.remove(e);
    return true;
  }

  spawn(teamId, type, cx, cy, rot) {
    const def = CATALOG[type];
    const [w, h] = this.footprint(type, cx, cy, rot);
    // face towards the middle of the map
    const fx = this.W / 2 - (cx + w / 2), fz = this.H / 2 - (cy + h / 2);
    const fl = Math.sqrt(fx * fx + fz * fz) || 1;
    const e = {
      id: this.nextId++, type, def, team: teamId, cx, cy, rot, w, h,
      x: cx + w / 2, z: cy + h / 2, y: def.cls === 'air' ? def.alt : 0,
      px: 0, pz: 0, py: 0, hp: def.hp, maxHp: def.hp, dirX: fx / fl, dirZ: fz / fl,
      cd: 0, target: 0, retarget: 0, dead: false, deadTick: 0, placedRound: this.round,
      salvo: 0, salvoCd: 0, moving: false, aimX: 0, aimZ: 0,
      down: false, bleed: 0, stable: false, carrier: 0, carrying: 0, rescue: 0, rescuer: 0, loaded: false, cargo: [],
      heal: 0, healT: 0, healing: false, medicBy: 0, noCover: 0, goalX: 0, goalZ: 0, stuck: 0, retreat: false,
      falling: false, bombs: def.bombs || 0, bombCd: 0, done: false, wp: 0,
    };
    if (def.static) {
      if (def.cls === 'fort') { e.dirX = rot & 1 ? 0 : 1; e.dirZ = rot & 1 ? 1 : 0; }
      for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) this.occ[y * this.W + x] = e.id;
    }
    e.px = e.x; e.pz = e.z; e.py = e.y;
    this.ents.push(e); this.byId.set(e.id, e);
    this.events.push({ t: 'spawn', id: e.id });
    return e;
  }

  remove(e) {
    e.dead = true;
    this.freeCells(e);
    const i = this.ents.indexOf(e);
    if (i >= 0) this.ents.splice(i, 1);
    this.byId.delete(e.id);
    this.events.push({ t: 'remove', id: e.id });
  }
  freeCells(e) {
    if (!e.def.static) return;
    for (let y = e.cy; y < e.cy + e.h; y++) for (let x = e.cx; x < e.cx + e.w; x++) if (this.occ[y * this.W + x] === e.id) this.occ[y * this.W + x] = 0;
  }

  // Put returning (rescued) soldiers next to their HQ for free.
  returnRecovered(t) {
    if (!t.recovered.length) return;
    const hq = this.byId.get(t.hq), z = t.zone;
    const cand = [];
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) {
      const dx = x + 0.5 - hq.x, dz = y + 0.5 - hq.z;
      cand.push([dx * dx + dz * dz, x, y]);
    }
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    let n = 0;
    for (const type of t.recovered) {
      for (const c of cand) {
        if (c[0] < 0) continue;
        const cell = c[2] * this.W + c[1];
        if (this.map.grid[cell] !== T_OPEN || this.occ[cell]) { c[0] = -1; continue; }
        let taken = false;
        for (const e of this.ents) if (!e.dead && !e.def.static && e.y < 0.5 && Math.floor(e.x) === c[1] && Math.floor(e.z) === c[2]) { taken = true; break; }
        c[0] = -1;
        if (taken) continue;
        const e = this.spawn(t.id, type, c[1], c[2], 0);
        e.free = true; n++;
        break;
      }
    }
    t.recovered = [];
    if (n) this.events.push({ t: 'returned', team: t.id, n });
  }

  // ---------------------------------------------------------------- phases
  startBattle() {
    if (this.phase !== 'deploy') return;
    this.phase = 'battle';
    this.battleTick = 0;
    this.events.push({ t: 'battle', round: this.round });
    this.fields.clear();
    this.fieldQueue = [];
    for (const t of this.teams) {
      if (!t.alive) continue;
      for (const cls of this.neededClasses(t.id)) this.enemyField(t.id, cls);
      this.homeField(t.id, 'wheel');
      if (this.defending(t.id)) for (const cls of this.neededClasses(t.id)) if (cls !== 'wheel') this.homeField(t.id, cls);
    }
    for (const e of this.ents) {
      if (e.def.cls !== 'plane') continue;
      e.done = false; e.bombs = e.def.bombs || 0; e.wp = e.id % 4; e.sx = undefined;
    }
  }

  endBattle() {
    // wounded: saved if stabilised, loaded in an ambulance or already home; the rest do not make it
    for (const e of [...this.ents]) {
      if (!e.down || e.dead) continue;
      const t = this.teams[e.team];
      if (t.alive && (e.loaded || e.stable || this.inZone(e.team, e.x, e.z))) { t.recovered.push(e.type); t.saved++; this.remove(e); }
      else this.die(e, this.attackerOf(e));
    }
    for (const e of this.ents) {
      e.carrying = 0; e.rescue = 0; e.cargo = []; e.heal = 0; e.healT = 0; e.healing = false; e.medicBy = 0; e.retreat = false;
      if (e.def.cls === 'plane' && !e.dead) {
        if (e.def.sortie) { e.done = true; continue; }
        // planes land back where they were parked
        e.x = e.px = e.cx + e.w / 2; e.z = e.pz = e.cy + e.h / 2; e.y = e.py = 0;
        const fx = this.W / 2 - e.x, fz = this.H / 2 - e.z, fl = Math.sqrt(fx * fx + fz * fz) || 1;
        e.dirX = fx / fl; e.dirZ = fz / fl;
      }
    }
    for (const e of [...this.ents]) if (e.def.cls === 'plane' && e.def.sortie && !e.dead) this.remove(e);
    for (const t of this.teams) t.hurtBy = t.hurtBy.map(v => v * 0.5);

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
    // clear wrecks and fallen soldiers from the previous round
    for (const e of [...this.ents]) if (e.dead) this.remove(e);
    for (const t of this.teams) {
      if (!t.alive) { t.recovered = []; continue; }
      t.money += RULES.income + RULES.incomeGrowth * (this.round - 1) + Math.round(t.bounty);
      t.bounty = 0; t.vehicles = 0; t.aircraft = 0;
      this.returnRecovered(t);
    }
    this.events.push({ t: 'deploy', round: this.round });
  }

  step() {
    if (this.phase !== 'battle') return;
    this.tick++; this.battleTick++;
    for (const e of this.ents) { e.px = e.x; e.pz = e.z; e.py = e.y; }
    this.refreshNextField();
    this.buildBuckets();
    const list = this.ents.slice();
    for (const e of list) if (!e.dead) this.think(e);
    this.separate();
    this.stepProjectiles();
    const alive = this.teams.filter(t => t.alive).length;
    if (alive <= 1 || this.battleTick >= RULES.battleSeconds * RULES.tickRate) this.endBattle();
  }

  // ---------------------------------------------------------------- pathing
  moveClass(e) {
    const m = e.def.move;
    return m === 'air' || m === 'plane' ? 'air' : m === 'amphib' ? 'amphib' : e.def.vehicle ? 'wheel' : 'foot';
  }
  neededClasses(teamId) {
    const s = new Set(['foot']);
    for (const e of this.ents) if (!e.dead && e.team === teamId && !e.def.static) { const c = this.moveClass(e); if (c !== 'air') s.add(c); }
    return [...s];
  }

  // Cost of entering a cell for the flow field (INF = never). Enemy structures are
  // "passable at a cost" so armies will break through walls when there is no way around.
  cellCost(c, cls, team) {
    const g = this.map.grid[c];
    if (g === T_SOLID || g === T_LOW || g === T_EDGE) return INF;
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
    if (g === T_SOLID || g === T_LOW || g === T_EDGE) return false;
    if (g === T_WATER && cls !== 'amphib') return false;
    const s = this.occ[c];
    if (!s) return true;
    const o = this.byId.get(s);
    if (!o || o.dead) return true;
    if (o.def.wire) return cls !== 'foot' || o.team === e.team;
    if (o.type === 'sandbags' && o.team === e.team && cls === 'foot') return true;
    return false;
  }

  dijkstra(teamId, cls, goals) {
    const W = this.W, H = this.H, N = W * H;
    const cost = new Float64Array(N);
    for (let c = 0; c < N; c++) cost[c] = this.cellCost(c, cls, teamId);
    const dist = new Float64Array(N).fill(INF);
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
        const cn = cost[n];
        if (cn >= INF) continue;
        if (k >= 4 && (cost[y * W + nx] >= INF || cost[ny * W + x] >= INF)) continue;
        const nd = d + (k >= 4 ? 1.414 : 1) * cn;
        if (nd < dist[n]) { dist[n] = nd; heap.push(nd, n); }
      }
    }
    return dist;
  }
  // distance to the nearest enemy worth attacking (ground units, guns, HQs)
  // (only the army picked as the main target, if there is one)
  enemyField(teamId, cls) {
    // our own base is being overrun: forget the main target and deal with the intruders first
    const W = this.W, focus = this.homeThreat(teamId) ? -1 : this.focusOf(teamId);
    let goals = [];
    for (let pass = 0; pass < 2 && !goals.length; pass++) for (const o of this.ents) {
      if (o.team === teamId || !this.active(o) || isAir(o) || o.def.cls === 'fort') continue;
      if (pass === 0 && focus >= 0 && o.team !== focus) continue;
      if (o.def.static) { for (let y = o.cy; y < o.cy + o.h; y++) for (let x = o.cx; x < o.cx + o.w; x++) goals.push(y * W + x); }
      else goals.push(this.cellOf(o.x, o.z));
    }
    this.fields.set(teamId + ':' + cls, this.dijkstra(teamId, cls, goals));
  }
  // distance back to our own deployment zone (for carrying the wounded home)
  homeField(teamId, cls) {
    const z = this.teams[teamId].zone, goals = [];
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) goals.push(y * this.W + x);
    this.fields.set(teamId + ':home:' + cls, this.dijkstra(teamId, cls, goals));
  }
  // recompute one field every other tick, round-robin, so big maps never stall a frame
  refreshNextField() {
    if (this.battleTick % 2) return;
    if (!this.fieldQueue.length) {
      for (const t of this.teams) if (t.alive) for (const cls of this.neededClasses(t.id)) this.fieldQueue.push([t.id, cls]);
    }
    const job = this.fieldQueue.shift();
    if (job && this.teams[job[0]].alive) this.enemyField(job[0], job[1]);
  }

  buildBuckets() {
    this.buckets = new Map();
    for (const e of this.ents) {
      if (!this.active(e) || e.def.static || e.y > 0.5) continue;
      const k = this.cellOf(e.x, e.z);
      let b = this.buckets.get(k); if (!b) this.buckets.set(k, b = []);
      b.push(e);
    }
  }
  // any of our own ground units within r of (x, z)?
  friendsNear(teamId, x, z, r) {
    const r2 = r * r, cx = Math.floor(x), cz = Math.floor(z), n = Math.ceil(r);
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      const b = this.buckets.get((cz + dz) * this.W + cx + dx);
      if (!b) continue;
      for (const o of b) if (o.team === teamId) { const ddx = o.x - x, ddz = o.z - z; if (ddx * ddx + ddz * ddz < r2) return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------- combat helpers
  canHit(e, o) {
    const w = e.def.weapon;
    if (!w || !this.active(o) || o.team === e.team) return false;
    const air = isAir(o);
    if (w.airOnly) return air && o.y > 0.5;
    if (air) return !!w.air && (o.y > 0.5 || w.kind !== 'bullet' || true);
    return true;
  }
  isThreat(o) { return o.def.cls !== 'fort' && this.active(o); }

  los(e, o) {
    const w = e.def.weapon;
    if (w.kind === 'arty' || w.kind === 'grenade' || isAir(e) || isAir(o)) return true;
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
      const g = this.map.grid[c];
      if (g === T_SOLID || g === T_LOW) return 0.5;   // hiding behind a book, a mug, a pencil...
      const id = this.occ[c];
      if (id) { const b = this.byId.get(id); if (b && b.def.cover && b.team === o.team) return 0.5; }
    }
    return 1;
  }

  dmgMult(kind, o) {
    const d = o.def;
    if (kind === 'missile') return isAir(o) ? 1 : 0.3;
    if (d.wire) return 1; // soldiers cut wire quickly
    if (d.cls === 'fort') return kind === 'bullet' || kind === 'flak' ? 0.4 : 1;
    if (d.static) return kind === 'bullet' || kind === 'flak' ? 0.15 : 1;
    if (isAir(o)) return kind === 'flak' ? 1 : 0.45;
    if (d.armor) {
      if (kind === 'bullet') return 0.3 / d.armor;
      if (kind === 'rocket') return 1.5;
      if (kind === 'grenade') return 0.5;
    }
    return 1;
  }

  damage(o, amount, attacker) {
    if (o.dead || amount <= 0) return;
    if (o.down) { if (amount >= 2) this.die(o, attacker); return; }   // explosions finish off the wounded
    o.hp -= amount;
    if (attacker && attacker.team >= 0 && attacker.team !== o.team) this.teams[o.team].hurtBy[attacker.team] += amount * (o.def.cls === 'hq' ? 2 : 1);
    this.events.push({ t: 'hit', id: o.id, amount });
    if (o.hp <= 0) this.kill(o, attacker);
  }

  kill(o, attacker) {
    if (o.dead) return;
    if (o.def.cls === 'infantry' && !o.down && !o.falling && this.teams[o.team].alive && this.rng() < RULES.woundChance) this.wound(o, attacker);
    else this.die(o, attacker);
  }

  wound(o, attacker) {
    o.down = true; o.hp = 0; o.bleed = RULES.bleedSeconds; o.stable = false;
    o.downBy = attacker ? attacker.id : 0; o.downTeam = attacker ? attacker.team : -1;
    this.releaseDuties(o);
    this.events.push({ t: 'down', id: o.id });
  }
  attackerOf(o) { return o.downTeam >= 0 ? { id: o.downBy, team: o.downTeam } : null; }

  releaseDuties(o) {
    if (o.carrying) { const d = this.byId.get(o.carrying); if (d) d.carrier = 0; o.carrying = 0; }
    if (o.rescue) { const d = this.byId.get(o.rescue); if (d && d.rescuer === o.id) d.rescuer = 0; o.rescue = 0; }
    if (o.heal) { const d = this.byId.get(o.heal); if (d && d.medicBy === o.id) d.medicBy = 0; o.heal = 0; o.healing = false; }
  }

  die(o, attacker) {
    if (o.dead) return;
    const wasDown = o.down;
    o.dead = true; o.down = false; o.hp = 0; o.deadTick = this.tick;
    this.freeCells(o);
    this.releaseDuties(o);
    if (o.carrier) { const c = this.byId.get(o.carrier); if (c && c.carrying === o.id) c.carrying = 0; o.carrier = 0; }
    const t = this.teams[o.team];
    t.losses++;
    if (attacker && attacker.team !== o.team && attacker.team >= 0) {
      const at = this.teams[attacker.team];
      at.kills++; at.bounty += o.def.cost * RULES.killBounty;
    }
    this.events.push({ t: 'death', id: o.id, by: attacker ? attacker.id : 0, wasDown });
    if (o.def.explodes) this.explode(o.x, o.z, o.def.explodes.radius, o.def.explodes.dmg, null, 'barrel', 0);
    if (o.cargo.length) { for (const id of o.cargo) { const d = this.byId.get(id); if (d && !d.dead) { d.loaded = false; this.die(d, attacker); } } o.cargo = []; }
    if (isAir(o) && o.y > 0.5) this.events.push({ t: 'crash', id: o.id });
    if (o.def.cls === 'hq') {
      t.alive = false;
      this.events.push({ t: 'eliminated', team: o.team, by: attacker ? attacker.team : -1 });
      for (const e of this.ents) if (!e.dead && e.team === o.team) {
        e.dead = true; e.down = false; e.hp = 0; e.deadTick = this.tick; this.freeCells(e);
        this.events.push({ t: 'death', id: e.id, by: 0, surrender: true });
      }
    }
  }

  // Explosions hurt everyone nearby, friend or foe.
  explode(x, z, radius, dmg, attacker, kind, y = 0) {
    this.events.push({ t: 'boom', x, z, y, r: radius, kind });
    for (const o of this.ents) {
      if (o.dead || o.loaded) continue;
      if (y < 0.5 ? o.y > 0.5 : Math.abs(o.y - y) > radius + 1) continue;
      const dx = o.x - x, dz = o.z - z;
      const reach = radius + (o.def.static ? Math.max(o.w, o.h) / 2 : (o.def.radius || 0.3));
      const d2 = dx * dx + dz * dz;
      if (d2 > reach * reach) continue;
      const fall = 1 - 0.5 * Math.sqrt(d2) / reach;
      const cover = o.def.cls === 'infantry' && attacker ? (this.inCover(o, attacker) < 1 ? 0.7 : 1) : 1;
      this.damage(o, dmg * fall * cover * this.dmgMult(kind === 'barrel' || kind === 'bomb' ? 'shell' : kind, o), attacker);
    }
  }

  // ---------------------------------------------------------------- per-unit brain
  think(e) {
    if (e.down) return this.thinkDown(e);
    if (e.falling) return this.thinkFalling(e);
    if (e.loaded) return;
    const def = e.def, w = def.weapon;
    if (def.cls === 'plane') return this.thinkPlane(e);
    if (def.medic) return this.thinkAmbulance(e);
    if (e.cd > 0) e.cd -= DT;
    // salvos (rocket trucks)
    if (e.salvo > 0) {
      e.salvoCd -= DT;
      if (e.salvoCd <= 0) { e.salvo--; e.salvoCd = 0.16; this.launch(e, e.aimX, e.aimZ, true); }
    }
    if (!w && def.static) return;
    if (e.carrying) return this.carryToCover(e);
    if (def.healer && this.medicWork(e)) return;

    // pick a target a couple of times per second (staggered by id)
    let scan = false;
    if (--e.retarget <= 0) { e.retarget = 8 + (e.id % 5); e.target = this.chooseTarget(e); scan = true; }
    let tgt = e.target ? this.byId.get(e.target) : null;
    if (tgt && !this.canHit(e, tgt)) { tgt = null; e.target = 0; }

    let inRange = false;
    if (tgt && w) {
      const dx = tgt.x - e.x, dz = tgt.z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz) - (tgt.def.static ? Math.min(tgt.w, tgt.h) / 2 : 0);
      inRange = d <= w.range && d >= (w.minRange || 0) && this.los(e, tgt);
      if (inRange) {
        // buildings (HQ, watchtower) keep facing the way they were built; guns aim
        if (!def.static || (def.cls === 'emplacement' && !def.blocksLos)) { const l = Math.sqrt(dx * dx + dz * dz) || 1; e.dirX = dx / l; e.dirZ = dz / l; }
        if (e.cd <= 0 && e.salvo === 0) this.fire(e, tgt);
      }
    }
    e.moving = false;
    if (def.static || inRange) return;
    // no fight within reach: help a wounded friend nearby
    if (RESCUERS.has(e.type)) {
      if (!e.rescue && scan) this.findWounded(e);
      if (e.rescue) return this.goRescue(e);
    }
    this.move(e, tgt);
  }

  // ---- wounded soldiers -----------------------------------------------------------
  // A wounded soldier bleeds out unless a comrade drags him behind the nearest cover,
  // a medic patches him up, or an ambulance takes him away.
  thinkDown(e) {
    if (e.carrier || e.loaded || e.stable) return;
    if (e.medicBy) { const m = this.byId.get(e.medicBy); if (m && m.healing) return; }
    e.bleed -= DT;
    if (e.bleed <= 0) this.die(e, this.attackerOf(e));
  }
  findWounded(e) {
    let best = null, bd = 49;
    for (const d of this.ents) {
      if (!d.down || d.dead || d.team !== e.team || d.stable || d.carrier || d.loaded || d.rescuer || d.medicBy || d.noCover > this.tick) continue;
      const dx = d.x - e.x, dz = d.z - e.z, dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = d; }
    }
    if (best) { best.rescuer = e.id; e.rescue = best.id; }
  }
  goRescue(e) {
    const d = this.byId.get(e.rescue);
    if (!d || !d.down || d.carrier || d.loaded || d.medicBy || d.rescuer !== e.id) { e.rescue = 0; return; }
    const dx = d.x - e.x, dz = d.z - e.z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.7) {
      e.rescue = 0; d.rescuer = 0;
      const spot = this.coverSpot(e, d);
      if (!spot) { d.noCover = this.tick + 60; return; }          // nothing to hide behind: leave him to the medics
      if (spot.d < 0.6) { this.stabilize(d, e); return; }          // already in cover: bandage him where he lies
      e.carrying = d.id; d.carrier = e.id; e.goalX = spot.x; e.goalZ = spot.z; e.stuck = 0;
      this.events.push({ t: 'pickup', id: e.id, wounded: d.id });
      return;
    }
    const s = e.def.speed * SPEED * DT, k = Math.min(s, l) / l;
    this.tryMove(e, dx * k, dz * k);
    e.dirX = dx / l; e.dirZ = dz / l; e.moving = true;
  }
  isCoverCell(c, team) {
    const g = this.map.grid[c];
    if (g === T_SOLID || g === T_LOW) return true;
    const o = this.occ[c] ? this.byId.get(this.occ[c]) : null;
    return !!(o && !o.dead && o.team === team && (o.def.cover || o.def.blocksLos || o.def.cls === 'hq'));
  }
  // Nearest free cell right next to cover, preferring cover that faces the enemy.
  coverSpot(e, d) {
    let ex = 0, ez = 0, en = 26 * 26;
    for (const o of this.ents) {
      if (o.team === e.team || !this.active(o) || !o.def.weapon || o.def.static || isAir(o)) continue;
      const dx = o.x - d.x, dz = o.z - d.z, dd = dx * dx + dz * dz;
      if (dd < en) { en = dd; ex = dx; ez = dz; }
    }
    const el = Math.sqrt(ex * ex + ez * ez);
    const ux = el ? ex / el : 0, uz = el ? ez / el : 0;
    const cx = Math.floor(d.x), cz = Math.floor(d.z), R = COVER_SEARCH;
    let best = null, bs = INF;
    for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
      if (!this.inside(x, z)) continue;
      const c = z * this.W + x;
      if (!this.canEnter(e, c)) continue;
      let near = false;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.inside(x + ox, z + oz) && this.isCoverCell((z + oz) * this.W + x + ox, e.team)) { near = true; break; }
      if (!near) continue;
      const px = x + 0.5, pz = z + 0.5, dx = px - d.x, dz = pz - d.z, dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > R) continue;
      let score = dist;
      if (el) {
        const fx = Math.floor(px + ux * 0.9), fz = Math.floor(pz + uz * 0.9);
        if (this.inside(fx, fz) && this.isCoverCell(fz * this.W + fx, e.team)) score -= 3;   // cover between him and the enemy
        else score += 2;
        score -= (dx * -ux + dz * -uz) * 0.3;                                                  // and a little further from them
      }
      if (score < bs) { bs = score; best = { x: px, z: pz, d: dist }; }
    }
    return best;
  }
  stabilize(d, by) {
    d.stable = true; d.carrier = 0;
    this.events.push({ t: 'stabilized', id: d.id, by: by.id });
  }
  carryToCover(e) {
    const d = this.byId.get(e.carrying);
    if (!d || !d.down) { e.carrying = 0; return; }
    const dx = e.goalX - e.x, dz = e.goalZ - e.z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.3 || e.stuck > 30) {
      e.carrying = 0;
      if (l < 1.2) this.stabilize(d, e); else { d.carrier = 0; d.noCover = this.tick + 60; }
      return;
    }
    const s = e.def.speed * SPEED * DT * 0.6, k = Math.min(s, l) / l;
    if (this.tryMove(e, dx * k, dz * k)) { e.dirX = dx / l; e.dirZ = dz / l; e.stuck = 0; } else e.stuck++;
    e.moving = true;
    d.x = e.x - e.dirX * 0.55; d.z = e.z - e.dirZ * 0.55;
    d.dirX = e.dirX; d.dirZ = e.dirZ;
  }

  // ---- medics ----------------------------------------------------------------------
  // Returns true while the medic is busy with a patient (otherwise he fights like a rifleman).
  medicWork(e) {
    if (!e.heal && (this.tick + e.id) % 8 === 0) {
      let best = null, bd = 14 * 14;
      for (const d of this.ents) {
        if (!d.down || d.dead || d.team !== e.team || d.loaded || d.carrier || d.medicBy) continue;
        const dx = d.x - e.x, dz = d.z - e.z, dd = dx * dx + dz * dz;
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best) {
        if (best.rescuer) { const r = this.byId.get(best.rescuer); if (r && r.rescue === best.id) r.rescue = 0; best.rescuer = 0; }
        best.medicBy = e.id; e.heal = best.id; e.healT = 0; e.stuck = 0;
      }
    }
    if (!e.heal) return false;
    const d = this.byId.get(e.heal);
    if (!d || d.dead || !d.down || d.loaded || d.medicBy !== e.id) { e.heal = 0; e.healing = false; return false; }
    if (d.carrier) return false;
    const dx = d.x - e.x, dz = d.z - e.z, l = Math.sqrt(dx * dx + dz * dz);
    if (l > 0.75) {
      e.healing = false; e.healT = 0;
      const s = e.def.speed * SPEED * DT, k = Math.min(s, l) / l;
      if (this.tryMove(e, dx * k, dz * k)) e.stuck = 0; else if (++e.stuck > 30) { d.medicBy = 0; e.heal = 0; return false; }
      e.dirX = dx / l; e.dirZ = dz / l; e.moving = true;
      return true;
    }
    e.moving = false; e.dirX = dx / (l || 1); e.dirZ = dz / (l || 1);
    if (!e.healing) { e.healing = true; this.events.push({ t: 'treat', id: e.id, wounded: d.id }); }
    e.healT += DT;
    if (e.healT >= e.def.healTime) {
      d.down = false; d.stable = false; d.bleed = 0; d.medicBy = 0; d.rescuer = 0; d.noCover = 0;
      d.hp = Math.max(1, Math.round(d.maxHp * 0.6)); d.target = 0; d.retarget = 0;
      this.teams[d.team].healed++;
      this.events.push({ t: 'healed', id: d.id, by: e.id });
      e.heal = 0; e.healing = false; e.healT = 0;
    }
    return true;
  }

  // ---- field ambulance -------------------------------------------------------------
  // Is any armed enemy ground unit (or helicopter) within r cells?
  danger(team, x, z, r) {
    for (const o of this.ents) {
      if (o.team === team || !this.active(o) || !o.def.weapon || o.def.weapon.airOnly || o.def.cls === 'plane') continue;
      const rr = r + (o.def.static ? 2 : 0), dx = o.x - x, dz = o.z - z;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }
  pickWounded(e) {
    const cands = [];
    for (const d of this.ents) {
      if (!d.down || d.dead || d.team !== e.team || d.loaded || d.carrier || d.medicBy) continue;
      const dx = d.x - e.x, dz = d.z - e.z, dd = dx * dx + dz * dz;
      if (dd < 60 * 60) cands.push([Math.sqrt(dd) - (d.stable ? 6 : 0), d.id, d]);
    }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 0; i < cands.length && i < 5; i++) if (!this.danger(e.team, cands[i][2].x, cands[i][2].z, 6.5)) return cands[i][1];
    return 0;
  }
  thinkAmbulance(e) {
    const cap = e.def.capacity, home = this.fields.get(e.team + ':home:wheel');
    if (--e.retarget <= 0) {
      e.retarget = 10;
      e.retreat = e.hp < e.maxHp * 0.45 || this.danger(e.team, e.x, e.z, 6);
      e.target = !e.retreat && e.cargo.length < cap ? this.pickWounded(e) : 0;
    }
    e.moving = false;
    let goal = e.target ? this.byId.get(e.target) : null;
    if (goal && (!goal.down || goal.dead || goal.loaded || goal.carrier || goal.medicBy)) { goal = null; e.target = 0; }
    if (goal) {
      const dx = goal.x - e.x, dz = goal.z - e.z, l = Math.sqrt(dx * dx + dz * dz);
      if (l < 1.4) {
        goal.loaded = true; goal.rescuer = 0; e.cargo.push(goal.id); e.target = 0; e.retarget = 0;
        this.events.push({ t: 'load', id: e.id, wounded: goal.id });
      } else {
        const s = e.def.speed * SPEED * DT, k = Math.min(s, l) / l;
        if (!this.tryMove(e, dx * k, dz * k)) this.followField(e, home, 0.6);
        else { e.dirX = dx / l; e.dirZ = dz / l; e.moving = true; }
      }
    } else if (this.inZone(e.team, e.x, e.z)) {
      if (e.cargo.length) {
        const t = this.teams[e.team];
        for (const id of e.cargo) {
          const d = this.byId.get(id);
          if (d && !d.dead) { t.recovered.push(d.type); t.saved++; this.events.push({ t: 'rescued', id, team: e.team }); this.remove(d); }
        }
        e.cargo = [];
      }
    } else if (e.cargo.length || e.retreat) this.followField(e, home, 1);   // drive the wounded home, or get out of the line of fire
    for (const id of e.cargo) { const d = this.byId.get(id); if (d) { d.x = e.x; d.z = e.z; } }
  }

  // ---- paratroopers --------------------------------------------------------------
  thinkFalling(e) {
    e.y -= 1.8 * DT;
    if (e.y > 0) return;
    e.y = 0; e.falling = false;
    // landed on something solid? step to the nearest free cell
    if (!this.canEnter(e, this.cellOf(e.x, e.z))) {
      const cx = Math.floor(e.x), cz = Math.floor(e.z);
      for (let r = 1; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (!this.inside(cx + dx, cz + dz) || !this.canEnter(e, (cz + dz) * this.W + cx + dx)) continue;
        e.x = cx + dx + 0.5; e.z = cz + dz + 0.5; e.px = e.x; e.pz = e.z; return;
      }
    }
    this.events.push({ t: 'landed', id: e.id });
  }

  // ---- aircraft -------------------------------------------------------------------
  thinkPlane(e) {
    const def = e.def, w = def.weapon;
    if (e.cd > 0) e.cd -= DT;
    if (e.y < def.alt) e.y = Math.min(def.alt, e.y + 2.2 * DT);
    let gx, gz, tgt = null;
    if (def.sortie) {
      if (e.sx === undefined) this.planSortie(e);
      if (!e.done) { gx = e.sx; gz = e.sz; }
      else { gx = e.x + e.dirX * 50; gz = e.z + e.dirZ * 50; }
      const dx = e.sx - e.x, dz = e.sz - e.z, d2 = dx * dx + dz * dz;
      if (!e.done && def.sortie === 'bomb' && d2 < 64 && e.y >= def.alt - 0.5) {
        if ((e.bombCd -= DT) <= 0 && e.bombs > 0) {
          e.bombCd = 0.17; e.bombs--;
          this.dropBomb(e);
          if (!e.bombs) e.done = true;
        }
      }
      if (!e.done && def.sortie === 'drop' && d2 < 4) { this.dropParas(e); e.done = true; }
      // gone past the edge of the table: back to base (the plane is used up)
      if (e.done && (e.x < -8 || e.z < -8 || e.x > this.W + 8 || e.z > this.H + 8)) { this.remove(e); return; }
    } else {
      if (--e.retarget <= 0) { e.retarget = 10 + (e.id % 5); e.target = this.chooseTarget(e); }
      tgt = e.target ? this.byId.get(e.target) : null;
      if (tgt && !this.canHit(e, tgt)) { tgt = null; e.target = 0; }
      if (tgt && this.defending(e.team) && !this.nearHome(e.team, tgt, 14)) tgt = null;
      if (tgt) {
        gx = tgt.x; gz = tgt.z;
        const dx = tgt.x - e.x, dz = tgt.z - e.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
        const facing = (dx * e.dirX + dz * e.dirZ) / l;
        if (l <= w.range && facing > 0.9 && e.cd <= 0 && e.y >= def.alt - 1) this.fire(e, tgt);
      } else {
        // patrol over our own zone
        const z = this.teams[e.team].zone, corners = [[z.x + 2, z.y + 2], [z.x + z.w - 2, z.y + 2], [z.x + z.w - 2, z.y + z.h - 2], [z.x + 2, z.y + z.h - 2]];
        const c = corners[e.wp % 4];
        gx = c[0]; gz = c[1];
        const dx = gx - e.x, dz = gz - e.z;
        if (dx * dx + dz * dz < 9) e.wp++;
      }
      // never wander off the table
      if (e.x < 2 || e.z < 2 || e.x > this.W - 2 || e.z > this.H - 2) { gx = this.W / 2; gz = this.H / 2; }
    }
    this.steerPlane(e, gx, gz);
  }
  steerPlane(e, gx, gz) {
    const def = e.def;
    let dx = gx - e.x, dz = gz - e.z;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= l; dz /= l;
    const k = def.turn * DT;
    let nx = e.dirX + dx * k, nz = e.dirZ + dz * k;
    const nl = Math.sqrt(nx * nx + nz * nz) || 1;
    e.dirX = nx / nl; e.dirZ = nz / nl;
    const climb = e.y < def.alt - 0.5 ? 0.6 : 1;   // slower while taking off
    e.x += e.dirX * def.speed * climb * DT; e.z += e.dirZ * def.speed * climb * DT;
    e.moving = true;
  }
  planSortie(e) {
    // head for the main target's headquarters, or the nearest one
    let hq = null, bd = INF;
    const focus = this.focusOf(e.team);
    for (const t of this.teams) {
      if (t.id === e.team || !t.alive || (focus >= 0 && t.id !== focus)) continue;
      const h = this.byId.get(t.hq); if (!h) continue;
      const dx = h.x - e.x, dz = h.z - e.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; hq = h; }
    }
    if (!hq) { e.sx = this.W / 2; e.sz = this.H / 2; e.done = true; return; }
    if (e.def.sortie === 'bomb') { e.sx = hq.x; e.sz = hq.z; }
    else {
      // drop zone: most of the way to their HQ, a little to the side
      e.sx = e.x + (hq.x - e.x) * 0.72 + (this.rng() - 0.5) * 6;
      e.sz = e.z + (hq.z - e.z) * 0.72 + (this.rng() - 0.5) * 6;
      e.sx = Math.max(2, Math.min(this.W - 2, e.sx)); e.sz = Math.max(2, Math.min(this.H - 2, e.sz));
    }
  }
  dropBomb(e) {
    const b = e.def.bomb;
    const tx = e.x + e.dirX * 2.4 + (this.rng() - 0.5) * 1.2, tz = e.z + e.dirZ * 2.4 + (this.rng() - 0.5) * 1.2;
    const p = {
      id: this.nextId++, owner: e.id, team: e.team, kind: 'bomb', fx: e.x, fz: e.z, fy: e.y - 0.4,
      tx, tz, ty: 0, t: 0, dur: 0.9, arc: false, dmg: b.dmg, splash: b.splash, direct: 0,
    };
    this.projectiles.push(p);
    this.events.push({ t: 'launch', p: { ...p }, id: e.id });
  }
  dropParas(e) {
    for (let i = 0; i < e.def.paras; i++) {
      const o = (i - (e.def.paras - 1) / 2) * 0.9;
      const x = Math.max(0.5, Math.min(this.W - 0.5, e.x - e.dirX * o * 1.4 + (this.rng() - 0.5)));
      const z = Math.max(0.5, Math.min(this.H - 0.5, e.z - e.dirZ * o * 1.4 + (this.rng() - 0.5)));
      const p = this.spawn(e.team, 'para', Math.floor(x), Math.floor(z), 0);
      p.x = p.px = x; p.z = p.pz = z; p.y = p.py = e.y - 0.5; p.falling = true; p.free = true;
    }
    this.events.push({ t: 'drop', id: e.id });
  }

  chooseTarget(e) {
    const w = e.def.weapon;
    if (!w) return 0;
    const plane = e.def.cls === 'plane';
    const sight = plane ? 70 : w.range + 6;
    const splashy = (w.splash || 0) >= 0.9 || w.kind === 'grenade' || w.kind === 'arty';
    const focus = this.focusOf(e.team), defend = this.defending(e.team) && !e.def.static;
    const cands = [];
    for (const o of this.ents) {
      if (!this.isThreat(o) || !this.canHit(e, o)) continue;
      const dx = o.x - e.x, dz = o.z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > sight + (e.def.static || plane ? 0 : 20)) continue;
      if (w.minRange && d < w.minRange) continue;
      let s = d;
      if (w.prefer === 'armor' && (o.def.armor || o.def.static) && !isAir(o)) s -= 8;
      if (w.prefer === 'infantry' && o.def.cls === 'infantry') s -= 6;
      if (w.prefer === 'air' && isAir(o)) s -= 40;
      if (w.kind === 'arty' && o.def.static) s -= 4;
      if (o.def.cls === 'hq') s += 4;
      if (o.def.medic) s += 3; // shoot the soldiers first, but ambulances are fair game
      if (o.team === focus) s -= 5;
      if (defend && !plane && !this.inZone(e.team, o.x, o.z) && d > w.range) continue;   // defenders do not chase
      cands.push([s, o.id, o, d]);
    }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    // line of sight and friendly-fire checks only for the few best candidates
    for (let i = 0; i < cands.length && i < 6; i++) {
      const [, id, o, d] = cands[i];
      if (d <= w.range && !this.los(e, o) && i < cands.length - 1) continue;
      if (splashy && !isAir(o) && this.friendsNear(e.team, o.x, o.z, (w.splash || 1) + 0.8)) continue;
      return id;
    }
    return 0;
  }

  fire(e, o) {
    const w = e.def.weapon;
    let cd = w.cd;
    if (e.def.cls === 'infantry' && !e.def.aura) {
      for (const f of this.ents) {
        if (f.team !== e.team || !f.def.aura || !this.active(f)) continue;
        const dx = f.x - e.x, dz = f.z - e.z;
        if (dx * dx + dz * dz <= f.def.aura * f.def.aura) { cd *= 0.7; break; }
      }
    }
    e.cd = cd * (0.9 + this.rng() * 0.2);
    if (w.kind === 'bullet' || w.kind === 'flak') {
      const hit = this.rng() < w.acc * this.inCover(o, e) * (isAir(o) && w.kind === 'bullet' ? 0.7 : 1);
      let tx = o.x, tz = o.z;
      if (!hit) { tx += (this.rng() - 0.5) * 2.2; tz += (this.rng() - 0.5) * 2.2; }
      this.events.push({ t: 'shot', id: e.id, kind: w.kind, tx, tz, ty: isAir(o) ? o.y : (hit ? 0.5 : 0.05), target: o.id, hit });
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
    const homing = w.kind === 'missile';
    const spread = w.kind === 'arty' ? (hit ? 0.8 : 2.2) + dist * 0.04 : hit ? 0.15 : 1.6;
    if (!homing) { tx += (this.rng() - 0.5) * 2 * spread; tz += (this.rng() - 0.5) * 2 * spread; }
    const arc = w.kind === 'arty' || w.kind === 'grenade';
    const speed = w.projSpeed || (w.kind === 'grenade' ? 9 : 14);
    const flight = arc ? 0.6 + dist / speed : dist / speed;
    const p = {
      id: this.nextId++, owner: e.id, team: e.team, kind: w.kind, fx: e.x, fz: e.z, fy: e.y + 0.5,
      tx, tz, ty: o && isAir(o) ? o.y : 0.2, t: 0, dur: Math.max(0.15, flight), arc,
      dmg: w.dmg, splash: w.splash || 0.4, direct: hit && o && w.kind !== 'arty' ? o.id : 0, miss: homing && !hit,
      target: o ? o.id : 0,
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
      if (p.kind === 'missile') {
        // homing: explodes at the aircraft wherever it is now (or harmlessly if it dodged)
        const o = this.byId.get(p.target);
        if (o && !o.dead) {
          if (!p.miss) this.damage(o, p.dmg * this.dmgMult('missile', o), owner);
          this.events.push({ t: 'boom', x: o.x, z: o.z, y: o.y, r: 0.6, kind: 'missile' });
        }
        continue;
      }
      if (p.direct) {
        const o = this.byId.get(p.direct);
        if (o && this.active(o)) { this.damage(o, p.dmg * this.dmgMult(p.kind, o), owner); p.tx = o.x; p.tz = o.z; p.ty = o.y; }
      }
      if (p.ty > 0.5) this.events.push({ t: 'boom', x: p.tx, z: p.tz, y: p.ty, r: 0.6, kind: p.kind });
      else this.explode(p.tx, p.tz, p.splash, p.direct ? p.dmg * 0.35 : p.dmg, owner, p.kind, 0);
    }
  }

  // ---------------------------------------------------------------- movement
  // Walk downhill on a distance field. Returns false if there is nowhere better to go.
  followField(e, field, speedMul = 1) {
    if (!field) return false;
    const c = this.cellOf(e.x, e.z);
    const cx = c % this.W, cy = (c / this.W) | 0;
    let best = -1, bestD = field[c];
    for (let k = 0; k < 8; k++) {
      const nx = cx + NX[k], ny = cy + NY[k];
      if (!this.inside(nx, ny)) continue;
      const n = ny * this.W + nx;
      if (field[n] < bestD - 0.01 && this.canEnter(e, n)) { bestD = field[n]; best = n; }
    }
    if (best < 0) return false;
    const gx = (best % this.W) + 0.5, gz = ((best / this.W) | 0) + 0.5;
    const dx = gx - e.x, dz = gz - e.z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.02) return true;
    const s = e.def.speed * SPEED * DT * speedMul, k = Math.min(s, l) / l;
    this.tryMove(e, dx * k, dz * k);
    e.dirX = dx / l; e.dirZ = dz / l; e.moving = true;
    return true;
  }

  move(e, tgt) {
    const cls = this.moveClass(e);
    const spd = e.def.speed * SPEED * DT;
    let gx, gz;
    if (cls === 'air') {
      let o = tgt || this.nearestEnemy(e);
      if (o && this.defending(e.team) && !this.nearHome(e.team, o, 12)) o = null;
      if (!o) {
        // helicopters with nothing to do hover over home
        const z = this.teams[e.team].zone;
        gx = z.x + z.w / 2; gz = z.y + z.h / 2;
        if ((gx - e.x) * (gx - e.x) + (gz - e.z) * (gz - e.z) < 4) return;
      } else { gx = o.x; gz = o.z; }
    } else if (this.defending(e.team)) {
      // defensive stance: hold inside our zone, walk back if we are outside it
      if (!this.inZone(e.team, e.x, e.z)) { this.followField(e, this.fields.get(e.team + ':home:' + cls), 1); return; }
      if (!tgt) return;
      gx = tgt.x; gz = tgt.z;
      const dx = gx - e.x, dz = gz - e.z, l = Math.sqrt(dx * dx + dz * dz) || 1, k = Math.min(spd, l) / l;
      if (!this.inZone(e.team, e.x + dx * k, e.z + dz * k)) return;
    } else {
      const field = this.fields.get(e.team + ':' + cls);
      const c = this.cellOf(e.x, e.z);
      if (!field) { if (!tgt) return; gx = tgt.x; gz = tgt.z; }
      else {
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
            if (b && b.team !== e.team && e.def.weapon && !e.def.weapon.airOnly) {
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
      if (s && e.def.vehicle && !isAir(e)) { const o = this.byId.get(s); if (o && o.def.wire) { this.events.push({ t: 'crush', id: o.id }); this.die(o, o.team !== e.team ? e : null); } }
      return true;
    }
    if (this.canEnter(e, this.cellOf(nx, e.z))) { e.x = nx; return true; }
    if (this.canEnter(e, this.cellOf(e.x, nz))) { e.z = nz; return true; }
    return false;
  }

  nearestEnemy(e) {
    let best = null, bd = INF;
    const focus = this.focusOf(e.team);
    for (const o of this.ents) {
      if (o.team === e.team || !this.isThreat(o) || !this.canHit(e, o)) continue;
      const dx = o.x - e.x, dz = o.z - e.z, d = (dx * dx + dz * dz) * (o.team === focus ? 0.25 : 1);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  homeThreat(teamId) {
    for (const o of this.ents) if (o.team !== teamId && this.active(o) && !isAir(o) && !o.def.static && this.nearHome(teamId, o, 4)) return true;
    return false;
  }
  // is o within r cells of this team's zone?
  nearHome(teamId, o, r) {
    const z = this.teams[teamId].zone;
    const dx = Math.max(z.x - o.x, 0, o.x - (z.x + z.w)), dz = Math.max(z.y - o.z, 0, o.z - (z.y + z.h));
    return dx * dx + dz * dz <= r * r;
  }

  // push overlapping ground units apart
  separate() {
    for (const [, b] of this.buckets) for (const e of b) {
      const cx = Math.floor(e.x), cz = Math.floor(e.z);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const nb = this.buckets.get((cz + dz) * this.W + cx + dx);
        if (!nb) continue;
        for (const o of nb) {
          if (o.id <= e.id) continue;
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
    for (const e of this.ents) { mix(e.id); mix(e.x); mix(e.z); mix(e.y); mix(e.hp); mix(e.dead ? 1 : 0); mix(e.down ? 1 : 0); }
    for (const t of this.teams) { mix(t.money); mix(t.kills); mix(t.saved); mix(t.alive ? 1 : 0); }
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
