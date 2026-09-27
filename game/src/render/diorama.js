// Diorama battlefields, model-railway style, on a board sitting on a wooden table:
// - Normandy: a painted board of fields, lanes and craters, bocage hedgerows, trees and farm
//   buildings, the countryside carrying on beyond the play area into low hills;
// - the town: cobbled streets and a paved square, town houses (plaster colour varies per house),
//   ruins, a church, barricades, a river in stone quays with arched bridges.
// All scenery comes from Blender (tools/blender/scenery.py, town.py) and is drawn instanced.
import * as THREE from 'three';
import { mulberry } from '../sim/rng.js';
import { T_WATER, T_LOW } from '../sim/map.js';
import { sceneryGeometry, hasTint } from './models.js';
import { floorTexture } from './terrain.js';

const BOARD_DEPTH = 2.4;   // how thick the board is (its sides show from low camera angles)
const hash = (a, b = 0) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// field kinds: pasture, wheat, ploughed earth, hay meadow
const FIELDS = [
  { base: '#6c8c42', dots: ['#7b9a4a', '#5d7c38', '#86a452'], rows: null, w: 0.42 },
  { base: '#c4ab5e', dots: ['#d2ba6c', '#b39a4f', '#c9b36a'], rows: ['rgba(120,90,40,.28)', 0.34], w: 0.2 },
  { base: '#7a5f43', dots: ['#6b5239', '#86694b', '#5f4a34'], rows: ['rgba(50,35,20,.45)', 0.4], w: 0.14 },
  { base: '#8c9f4d', dots: ['#9aad58', '#7e9244', '#a4b45f'], rows: ['rgba(230,230,150,.16)', 1.6], w: 0.24 },
];
function fieldKind(b) {
  let r = hash(b, 17), i = 0;
  while (i < FIELDS.length - 1 && r > FIELDS[i].w) { r -= FIELDS[i].w; i++; }
  return i;
}

export function buildDiorama(map, quality = 'medium') {
  const { W, H, round, R } = map, M = map.margin;
  const g = new THREE.Group();
  const wx = x => x - W / 2, wz = y => y - H / 2;
  const RB = round ? R + M - 1 : 0;                                       // board radius (round tables)
  const insidePlay = (x, y) => round ? (x - W / 2) ** 2 + (y - H / 2) ** 2 < (R + 0.5) ** 2 : x >= 0 && y >= 0 && x <= W && y <= H;
  const onBoard = (x, y, pad = 0) => round ? Math.hypot(x - W / 2, y - H / 2) < RB - pad : x > -M + pad && y > -M + pad && x < W + M - pad && y < H + M - pad;
  // distance from the play area / from the board edge, in cells
  const outDist = (x, y) => round ? Math.hypot(x - W / 2, y - H / 2) - (R + 0.5) : Math.hypot(Math.max(0, -x, x - W), Math.max(0, -y, y - H));
  const edgeDist = (x, y) => round ? RB - Math.hypot(x - W / 2, y - H / 2) : Math.min(x + M, y + M, W + M - x, H + M - y);
  // low rolling hills outside the play area (the battle itself is fought on the flat)
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, s = map.seed;
    const v = (a, b) => hash(a * 7919 + b * 104729, s);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (v(xi, yi) * (1 - sx) + v(xi + 1, yi) * sx) * (1 - sy) + (v(xi, yi + 1) * (1 - sx) + v(xi + 1, yi + 1) * sx) * sy;
  };
  const ss = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
  const town = map.theme === 'town', BW = W + 2 * M, BH = H + 2 * M;
  const bcell = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); return xi < -M || yi < -M || xi >= W + M || yi >= H + M ? 0 : map.board[(yi + M) * BW + xi + M]; };
  const wet = (x, y) => { const v = bcell(x, y); return v === 4 || v === 5; };
  // the town is flat except for the river bed (a board corner sinks when all four cells round it are water)
  const townHeight = (x, y) => (Number.isInteger(x) && Number.isInteger(y) ? wet(x, y) && wet(x - 1, y) && wet(x, y - 1) && wet(x - 1, y - 1) : wet(x, y)) ? -0.8 : 0;
  const height = (x, y) => {
    if (town) return townHeight(x, y);
    const o = outDist(x, y); if (o <= 1) return 0;
    const hills = noise(x / 9, y / 9) * 1.6 + noise(x / 4, y / 4) * 0.4;
    return hills * ss(1, 6, o) * ss(0.5, 4, edgeDist(x, y));
  };

  // ---------------------------------------------------------------- the painted ground
  const PX = quality === 'low' ? 10 : quality === 'high' ? 24 : 16;
  const px = Math.min(PX, Math.floor(4096 / Math.max(BW, BH)));
  const cv = document.createElement('canvas'); cv.width = BW * px; cv.height = BH * px;
  const bump = document.createElement('canvas'); bump.width = cv.width; bump.height = cv.height;
  const c = cv.getContext('2d'), b = bump.getContext('2d'), rng = mulberry(map.seed ^ 0x51f1);
  const X = x => (x + M) * px, Y = y => (y + M) * px;
  b.fillStyle = '#808080'; b.fillRect(0, 0, bump.width, bump.height);
  const n = Math.max(1, map.zones.length);
  const lanePts = [];
  if (town) paintTown({ map, c, b, X, Y, px, rng, W, H, M, BW, BH, bcell });
  else {
  c.fillStyle = FIELDS[0].base; c.fillRect(0, 0, cv.width, cv.height);
  for (const f of map.fields) {
    if (f.poly.length < 3) continue;
    const kind = FIELDS[fieldKind(f.kind)];
    const path = ctx => { ctx.beginPath(); f.poly.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath(); };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of f.poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    c.save(); path(c); c.clip(); b.save(); path(b); b.clip();
    c.fillStyle = kind.base; c.fillRect(X(x0), Y(y0), (x1 - x0) * px, (y1 - y0) * px);
    // mottling: patches, then speckles
    const area = (x1 - x0) * (y1 - y0);
    for (let i = 0; i < area * 0.6; i++) {
      c.fillStyle = kind.dots[Math.floor(rng() * 3)]; c.globalAlpha = 0.25;
      c.beginPath(); c.arc(X(x0 + rng() * (x1 - x0)), Y(y0 + rng() * (y1 - y0)), px * (0.6 + rng() * 1.6), 0, 7); c.fill();
    }
    c.globalAlpha = 0.8;
    for (let i = 0; i < area * px * 0.7; i++) {
      c.fillStyle = kind.dots[Math.floor(rng() * 3)];
      c.fillRect(X(x0 + rng() * (x1 - x0)), Y(y0 + rng() * (y1 - y0)), 1 + rng() * 1.5, 1 + rng() * 1.5);
    }
    c.globalAlpha = 1;
    if (kind.rows) {                                                      // furrows / crop rows / mowing stripes
      const a = hash(f.kind, 3) * Math.PI + (f.k || 0) * 2 * Math.PI / n, ca = Math.cos(a), sa = Math.sin(a);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, r = Math.hypot(x1 - x0, y1 - y0) / 2 + 1, step = kind.rows[1];
      c.strokeStyle = kind.rows[0]; c.lineWidth = Math.max(1, px * step * 0.35);
      b.strokeStyle = '#5a5a5a'; b.lineWidth = Math.max(1, px * step * 0.35);
      for (let t = -r; t <= r; t += step) {
        const ax = mx + ca * t - sa * r, ay = my + sa * t + ca * r, bx = mx + ca * t + sa * r, by = my + sa * t - ca * r;
        c.beginPath(); c.moveTo(X(ax), Y(ay)); c.lineTo(X(bx), Y(by)); c.stroke();
        if (step < 1) { b.beginPath(); b.moveTo(X(ax), Y(ay)); b.lineTo(X(bx), Y(by)); b.stroke(); }
      }
    }
    c.restore(); b.restore();
    // a strip of rough grass along every field edge (the hedges stand on it)
    path(c); c.strokeStyle = 'rgba(70,95,45,.55)'; c.lineWidth = px * 0.9; c.stroke();
  }
  // lanes: packed earth with two wheel ruts and grass down the middle
  for (const r of map.roads) {
    const L = Math.hypot(r.x1 - r.x0, r.y1 - r.y0), steps = Math.max(8, Math.ceil(L * 2)), pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u * u * r.x0 + 2 * u * t * r.qx + t * t * r.x1, y = u * u * r.y0 + 2 * u * t * r.qy + t * t * r.y1;
      const dx = 2 * u * (r.qx - r.x0) + 2 * t * (r.x1 - r.qx), dy = 2 * u * (r.qy - r.y0) + 2 * t * (r.y1 - r.qy), l = Math.hypot(dx, dy) || 1;
      pts.push([x, y, -dy / l, dx / l]); lanePts.push([x, y]);
    }
    const line = (ctx, off, width, style) => {
      ctx.beginPath(); pts.forEach(([x, y, nx, ny], i) => (i ? ctx.lineTo(X(x + nx * off), Y(y + ny * off)) : ctx.moveTo(X(x + nx * off), Y(y + ny * off))));
      ctx.strokeStyle = style; ctx.lineWidth = width * px; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    };
    line(c, 0, 2.2, 'rgba(95,105,60,.5)');                                   // trampled verge
    line(c, 0, 1.75, '#a58a63'); line(c, 0, 1.5, '#b09470');
    for (const o of [-0.38, 0.38]) { line(c, o, 0.26, '#8a7152'); line(b, o, 0.26, '#4a4a4a'); }
    line(c, 0, 0.22, 'rgba(110,135,70,.8)');
  }
  // muddy pond shores and dark earth under the buildings
  for (const o of map.objects) {
    if (o.kind === T_WATER) {
      c.fillStyle = 'rgba(92,78,52,.8)';
      for (const cell of o.cells) { c.beginPath(); c.arc(X(cell % W + 0.5), Y(Math.floor(cell / W) + 0.5), px * 1.25, 0, 7); c.fill(); }
    } else if (o.style === 'house' || o.style === 'barn') {
      c.fillStyle = 'rgba(95,85,60,.7)'; c.fillRect(X(o.x - 0.4), Y(o.y - 0.4), (o.w + 0.8) * px, (o.h + 0.8) * px);
    }
  }
  }
  // shell craters: scorched earth (the thrown-up rim is a model)
  for (const d of map.decor) if (d.kind === 'crater') {
    const gr = c.createRadialGradient(X(d.x), Y(d.y), 0, X(d.x), Y(d.y), px * 1.5);
    gr.addColorStop(0, '#3a2e22'); gr.addColorStop(0.45, '#56442f'); gr.addColorStop(0.7, 'rgba(90,70,45,.6)'); gr.addColorStop(1, 'rgba(60,50,30,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(X(d.x), Y(d.y), px * 1.5, 0, 7); c.fill();
    const gb = b.createRadialGradient(X(d.x), Y(d.y), 0, X(d.x), Y(d.y), px * 0.8);
    gb.addColorStop(0, '#202020'); gb.addColorStop(1, 'rgba(128,128,128,0)');
    b.fillStyle = gb; b.beginPath(); b.arc(X(d.x), Y(d.y), px * 0.8, 0, 7); b.fill();
  }
  // the edge of the play area: everything outside is a little darker, with a thin white line
  c.save();
  c.beginPath(); c.rect(0, 0, cv.width, cv.height);
  if (round) c.arc(X(W / 2), Y(H / 2), (R + 0.5) * px, 0, Math.PI * 2, true); else c.rect(X(0), Y(H), W * px, -H * px);
  c.fillStyle = 'rgba(25,30,10,.2)'; c.fill('evenodd');
  c.beginPath();
  if (round) c.arc(X(W / 2), Y(H / 2), (R + 0.5) * px, 0, Math.PI * 2); else c.rect(X(0), Y(0), W * px, H * px);
  c.strokeStyle = 'rgba(245,238,210,.55)'; c.lineWidth = Math.max(1.5, px * 0.12); c.setLineDash([px * 0.8, px * 0.5]); c.stroke();
  c.restore();

  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const btex = new THREE.CanvasTexture(bump);
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: btex, bumpScale: 1.2, roughness: 0.95 });

  // ---------------------------------------------------------------- ground mesh (hills outside)
  {
    const nx = BW, ny = BH, pos = [], uv = [], idx = [], out = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      let x = -M + i, y = -M + j;
      if (round) {                                                         // pull the outside ring onto the circle
        const dx = x - W / 2, dy = y - H / 2, r = Math.hypot(dx, dy);
        out.push(r > RB);
        if (r > RB) { x = W / 2 + dx / r * RB; y = H / 2 + dy / r * RB; }
      } else out.push(false);
      pos.push(wx(x), height(x, y), wz(y)); uv.push((x + M) / BW, 1 - (y + M) / BH);
    }
    const v = (i, j) => j * (nx + 1) + i;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = v(i, j), b2 = v(i + 1, j), c2 = v(i, j + 1), d = v(i + 1, j + 1);
      if (!(out[a] && out[b2] && out[c2])) idx.push(a, c2, b2);
      if (!(out[b2] && out[c2] && out[d])) idx.push(b2, c2, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, groundMat); ground.receiveShadow = true;
    g.add(ground);
  }

  // ---------------------------------------------------------------- board sides, frame, table
  {
    const side = new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 0.9 });
    const wood = new THREE.MeshStandardMaterial({ color: '#5c3d25', roughness: 0.55 });
    const F = 0.45;                                                       // frame width
    if (round) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(RB, RB, BOARD_DEPTH, 160, 1, true), side);
      s.position.y = -BOARD_DEPTH / 2; g.add(s);
      const fr = new THREE.Mesh(new THREE.CylinderGeometry(RB + F, RB + F, BOARD_DEPTH + 0.35, 160, 1, true), wood);
      fr.position.y = -BOARD_DEPTH / 2 + 0.17; fr.castShadow = true; g.add(fr);
      const top = new THREE.Mesh(new THREE.RingGeometry(RB - 0.02, RB + F, 160), wood);
      top.rotation.x = -Math.PI / 2; top.position.y = 0.345; top.receiveShadow = true; g.add(top);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(RB, RB, 0.36, 160, 1, true), wood);
      inner.material = wood; inner.position.y = 0.17; g.add(inner);
    } else {
      const x0 = wx(-M), x1 = wx(W + M), z0 = wz(-M), z1 = wz(H + M), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const bw = x1 - x0, bd = z1 - z0;
      const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); };
      box(bw, BOARD_DEPTH - 1.2, bd, cx, -BOARD_DEPTH / 2 - 0.6, cz, side);   // its top stays below the river bed
      const h = BOARD_DEPTH + 0.35, y = -BOARD_DEPTH / 2 + 0.17;
      box(bw + 2 * F, h, F, cx, y, z0 - F / 2, wood); box(bw + 2 * F, h, F, cx, y, z1 + F / 2, wood);
      box(F, h, bd, x0 - F / 2, y, cz, wood); box(F, h, bd, x1 + F / 2, y, cz, wood);
    }
    const tt = floorTexture('wood', map.seed);
    const T = Math.max(BW, BH) * 5;
    tt.repeat.set(T / 10, T / 10);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(T, T), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.45 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -BOARD_DEPTH; table.receiveShadow = true; g.add(table);
  }

  // ---------------------------------------------------------------- scenery (instanced)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  const lists = new Map();
  // tint: brightness; hue: a small hue shift; paint: the plaster colour of a town house
  const put = (key, x, y, yaw, sx = 1, sy = sx, sz = sx, tint = 1, hue = 0, paint = null) => {
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key).push({ x, y, yaw, sx, sy, sz, tint, hue, paint });
  };
  const nearLane = (() => {
    const cell = new Set(lanePts.map(([x, y]) => Math.round(x) + ',' + Math.round(y)));
    return (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cell.has((Math.round(x) + dx) + ',' + (Math.round(y) + dy))) {
        for (const [lx, ly] of lanePts) if (Math.abs(lx - x) < 1.6 && Math.abs(ly - y) < 1.6 && (lx - x) ** 2 + (ly - y) ** 2 < 1.9) return true;
      }
      return false;
    };
  })();
  if (town) placeTown({ map, put, onBoard, W, H, M, BW, bcell, g, wx, wz, quality });
  else {
  const hedgePiece = (x, y, yaw, seed) => {
    const r = mulberry(seed);
    put(r() < 0.5 ? 'hedge0' : 'hedge1', x, y, yaw + (r() - 0.5) * 0.25, 1.05 + r() * 0.25, 0.85 + r() * 0.35, 0.9 + r() * 0.2, 0.85 + r() * 0.3, (r() - 0.5) * 0.04);
    if (r() < 0.07) put(r() < 0.5 ? 'oak0' : 'oak1', x + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.3, r() * 6, 0.85 + r() * 0.35, 0.85 + r() * 0.35, 0.85 + r() * 0.35, 0.85 + r() * 0.3, (r() - 0.5) * 0.05);
  };
  // hedgerows in the play area follow the cells that block (so what you see is what stops you)
  for (const o of map.objects) {
    if (o.style !== 'hedge') continue;
    const yaw = -Math.atan2(o.by - o.ay, o.bx - o.ax);
    for (const cell of o.cells) hedgePiece(cell % W + 0.5, Math.floor(cell / W) + 0.5, yaw, o.seed + cell);
  }
  // ...and carry on across the countryside outside it
  for (const bd of map.borders) {
    const L = Math.hypot(bd.bx - bd.ax, bd.by - bd.ay), steps = Math.ceil(L / 0.85), yaw = -Math.atan2(bd.by - bd.ay, bd.bx - bd.ax);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps; if (Math.abs(t - bd.g) < bd.gw / 2) continue;
      const x = bd.ax + (bd.bx - bd.ax) * t, y = bd.ay + (bd.by - bd.ay) * t;
      if (outDist(x, y) < 1.2 || !onBoard(x, y, 0.9) || nearLane(x, y)) continue;
      hedgePiece(x, y, yaw, Math.floor(x * 131 + y * 71) ^ map.seed);
    }
  }
  for (const d of map.decor) {
    if (!onBoard(d.x, d.y, 1.2)) continue;
    const r = mulberry(d.seed);
    if (d.kind === 'crater') put('crater', d.x, d.y, r() * 6, 0.8 + r() * 0.5, 0.8 + r() * 0.3);
    else if (d.kind === 'apple') put('apple', d.x, d.y, r() * 6, 0.85 + r() * 0.3, 0.85 + r() * 0.3, 0.85 + r() * 0.3, 0.9 + r() * 0.2, (r() - 0.5) * 0.04);
    else if (d.kind === 'oak' && !nearLane(d.x, d.y)) put(r() < 0.5 ? 'oak0' : 'oak1', d.x, d.y, r() * 6, 0.9 + r() * 0.4, 0.9 + r() * 0.4, 0.9 + r() * 0.4, 0.85 + r() * 0.3, (r() - 0.5) * 0.05);
  }
  for (const o of map.objects) {
    const r = mulberry(o.seed + (o.turn || 0) * 977), cx = o.x + o.w / 2, cy = o.y + o.h / 2, along = o.w >= o.h;
    if (o.style === 'house' || o.style === 'barn') put(o.style, cx, cy, (along ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0), 1, 0.95 + r() * 0.1, 1, 0.92 + r() * 0.12);
    else if (o.style === 'hay') put('hay', cx, cy, (along ? 0 : Math.PI / 2) + (r() - 0.5) * 0.3, 0.95 + r() * 0.1);
    else if (o.style === 'stonewall') {
      for (let k = 0; k < Math.max(o.w, o.h); k++) {
        const x = along ? o.x + k + 0.5 : cx, y = along ? cy : o.y + k + 0.5;
        put('stonewall', x, y, (along ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0) + (r() - 0.5) * 0.06, 1.02, 0.9 + r() * 0.25, 1, 0.9 + r() * 0.15);
      }
    } else if (o.kind === T_WATER) {
      g.add(pondMesh(map, o, wx, wz));
      const isW = (x, y) => x >= 0 && y >= 0 && x < W && y < H && map.grid[y * W + x] === T_WATER;
      for (const cell of o.cells) {
        const x = cell % W, y = Math.floor(cell / W);
        if (isW(x - 1, y) && isW(x + 1, y) && isW(x, y - 1) && isW(x, y + 1)) continue;
        if (r() < 0.55) put('reeds', x + 0.5 + (r() - 0.5) * 0.6, y + 0.5 + (r() - 0.5) * 0.6, r() * 6, 0.8 + r() * 0.5);
      }
    }
  }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const pc = new THREE.Color();
  for (const [lkey, list] of lists) {
    // "house2a|far": the light version (the town beyond the play area, low graphics quality)
    const [key, farTag] = lkey.split('|'), far = !!farTag || quality === 'low';
    // houses: the plaster is a separate mesh so every house gets its own colour
    for (const part of hasTint(key) ? ['rest', 'tint'] : ['all']) {
      const im = new THREE.InstancedMesh(sceneryGeometry(key, part, far), mat, list.length);
      im.userData.shared = true;   // the geometry is cached: keep it when the battlefield is rebuilt
      list.forEach((it, i) => {
        p.set(wx(it.x), (town ? 0 : height(it.x, it.y)) - 0.02, wz(it.y)); q.setFromEuler(e.set(0, it.yaw, 0)); s3.set(it.sx, it.sy, it.sz);
        im.setMatrixAt(i, m4.compose(p, q, s3));
        col.setRGB(it.tint, it.tint, it.tint); if (it.hue) col.offsetHSL(it.hue, 0, 0);
        if (part === 'tint' && it.paint) col.multiply(pc.set(it.paint));
        im.setColorAt(i, col);
      });
      im.castShadow = key !== 'crater' && key !== 'reeds' && key !== 'quay'; im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
  }

  // ---------------------------------------------------------------- grass tufts
  const per = quality === 'low' ? 0 : quality === 'high' ? 1.6 : 0.7;
  if (per) {
    const tuft = tuftGeometry(), pts = [], r = mulberry(map.seed ^ 0x7a11);
    const count = Math.round(BW * BH * per);
    for (let i = 0; i < count && pts.length < 60000; i++) {
      const x = -M + r() * BW, y = -M + r() * BH;
      if (!onBoard(x, y, 0.5)) continue;
      if (x >= 0 && y >= 0 && x < W && y < H && map.grid[Math.floor(y) * W + Math.floor(x)] !== 0 && map.grid[Math.floor(y) * W + Math.floor(x)] !== 4) continue;
      if (town) { const v = bcell(x, y); if ((v !== 0 && v !== 6) || r() < 0.5 || x < 0 || y < 0 || x >= W || y >= H) continue; }
      else if (nearLane(x, y) && r() < 0.85) continue;
      pts.push([x, y, r() * 6, 0.7 + r() * 0.8, 0.8 + r() * 0.35]);
    }
    const im = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), pts.length);
    pts.forEach(([x, y, yaw, s, t], i) => {
      p.set(wx(x), height(x, y), wz(y)); q.setFromEuler(e.set(0, yaw, 0)); s3.set(s, s * (0.8 + (t - 0.8)), s);
      im.setMatrixAt(i, m4.compose(p, q, s3)); im.setColorAt(i, col.setRGB(t, t, t * 0.95));
    });
    im.receiveShadow = true; im.computeBoundingSphere();
    g.add(im);
  }

  // the play area as a picture for the minimap
  const mini = document.createElement('canvas'); mini.width = W * 4; mini.height = H * 4;
  mini.getContext('2d').drawImage(cv, M * px, M * px, W * px, H * px, 0, 0, mini.width, mini.height);
  return { group: g, minimap: mini };
}

function tuftGeometry() {
  const pos = [], colr = [], r = mulberry(99);
  const dark = new THREE.Color('#3f5a28'), light = new THREE.Color('#9db55d');
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.08, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.14 + r() * 0.16, lean = (r() - 0.5) * 0.12, w = 0.025;
    const ca = Math.cos(a + 1.3), sa = Math.sin(a + 1.3);
    pos.push(x - ca * w, 0, z - sa * w, x + ca * w, 0, z + sa * w, x + lean, h, z + lean * 0.7);
    colr.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, light.r, light.g, light.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();
  return g;
}

// a farm pond: murky green water with a soft outline over its cells
function pondMesh(map, o, wx, wz) {
  const rng = mulberry(o.seed), pxs = 32, pad = 1, cw = (o.w + pad * 2) * pxs, ch = (o.h + pad * 2) * pxs;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c2 = cv.getContext('2d');
  c2.filter = 'blur(10px)'; c2.fillStyle = '#fff';
  for (const c of o.cells) {
    const x = (c % map.W - o.x + pad + 0.5) * pxs, y = (Math.floor(c / map.W) - o.y + pad + 0.5) * pxs;
    c2.beginPath(); c2.arc(x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 10, pxs * (0.75 + rng() * 0.25), 0, 7); c2.fill();
  }
  c2.filter = 'none';
  const img = c2.getImageData(0, 0, cw, ch), d = img.data;
  for (let i = 3; i < d.length; i += 4) { const a = d[i] / 255; const v = Math.max(0, Math.min(1, (a - 0.45) * 6)); d[i - 3] = d[i - 2] = d[i - 1] = 255; d[i] = v * 255; }
  c2.putImageData(img, 0, 0);
  const m = new THREE.MeshStandardMaterial({ color: '#46604c', alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.92, roughness: 0.05, metalness: 0.2, depthWrite: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(o.w + pad * 2, o.h + pad * 2), m);
  water.rotation.x = -Math.PI / 2; water.position.set(wx(o.x + o.w / 2), 0.03, wz(o.y + o.h / 2)); water.renderOrder = 2; water.receiveShadow = true;
  return water;
}

// ---------------------------------------------------------------------------------------------
// The town: painted ground
const PLASTER = ['#efe6d2', '#ead2a4', '#e8c8b6', '#dcd8cc', '#cfd7d6', '#ecdcc0', '#dcc6a0', '#f1e2d4', '#d9c9b0', '#e3d0c8'];
function setts(px, colours, grout, n, rng) {                 // a cell-sized tile of stones for canvas patterns
  const t = document.createElement('canvas'); t.width = t.height = Math.max(8, px);
  const g = t.getContext('2d'), s = t.width / n;
  g.fillStyle = grout; g.fillRect(0, 0, t.width, t.height);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g.fillStyle = colours[Math.floor(rng() * colours.length)];
    const o = j % 2 ? s / 2 : 0;
    g.fillRect(i * s + o + 0.6, j * s + 0.6, s - 1.2, s - 1.2);
    if (o) g.fillRect(-s / 2 + 0.6, j * s + 0.6, s / 2 - 1.2, s - 1.2);
  }
  return t;
}
function paintTown({ map, c, b, X, Y, px, rng, W, H, M, BW, BH, bcell }) {
  // yards and gaps between houses: trodden earth, dust and weeds
  c.fillStyle = '#857b69'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  for (let i = 0; i < BW * BH * px * 0.25; i++) {
    c.fillStyle = ['#8f8573', '#7a705f', '#958b78', '#6f6a55'][Math.floor(rng() * 4)];
    c.fillRect(rng() * c.canvas.width, rng() * c.canvas.height, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) {
    const v = bcell(x, y);
    if (v === 0 && rng() < 0.12) { c.fillStyle = 'rgba(100,125,65,.5)'; c.beginPath(); c.arc(X(x + rng()), Y(y + rng()), px * (0.3 + rng() * 0.5), 0, 7); c.fill(); }
    else if (v === 4 || v === 5) { c.fillStyle = '#3f443a'; c.fillRect(X(x) - 0.5, Y(y) - 0.5, px + 1, px + 1); }
  }
  const pave = c.createPattern(setts(px, ['#b9b1a0', '#aea693', '#c2baa8'], '#8c8474', 2, rng), 'repeat');
  const cobble = c.createPattern(setts(px, ['#77706a', '#6b645c', '#827a70', '#5f5953'], '#4b4640', 5, rng), 'repeat');
  const cobbleB = b.createPattern(setts(px, ['#9a9a9a', '#8a8a8a', '#a4a4a4'], '#404040', 5, rng), 'repeat');
  const stroke = (ctx, st, w, style) => { ctx.beginPath(); ctx.moveTo(X(st.ax), Y(st.ay)); ctx.lineTo(X(st.bx), Y(st.by)); ctx.strokeStyle = style; ctx.lineWidth = w * px; ctx.lineCap = 'round'; ctx.stroke(); };
  const cx = W / 2, cy = H / 2, SQ = map.square;
  for (const st of map.streets) stroke(c, st, st.w + 0.35, '#6d675b');                          // kerb shadow
  for (const st of map.streets) stroke(c, st, st.w + 0.2, pave);                                // pavements
  if (SQ > 0) { c.beginPath(); c.arc(X(cx), Y(cy), (SQ + 0.2) * px, 0, 7); c.fillStyle = pave; c.fill(); }
  for (const st of map.streets) { stroke(c, st, st.w * 0.66, cobble); stroke(b, st, st.w * 0.66, cobbleB); }   // cobbled roadway
  // the square: rings of setts round the monument
  if (SQ > 0) { c.beginPath(); c.arc(X(cx), Y(cy), (SQ - 0.6) * px, 0, 7); c.fillStyle = cobble; c.fill(); }
  for (let r = 1.4; r < SQ - 0.6; r += 0.55) { c.beginPath(); c.arc(X(cx), Y(cy), r * px, 0, 7); c.strokeStyle = 'rgba(60,55,50,.55)'; c.lineWidth = Math.max(1, px * 0.06); c.stroke(); }
  // tram rails along the avenues
  for (const st of map.streets) if (st.avenue) {
    const dx = st.bx - st.ax, dy = st.by - st.ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    for (const o of [-0.62, -0.38, 0.38, 0.62]) {
      c.beginPath(); c.moveTo(X(st.ax + nx * o), Y(st.ay + ny * o)); c.lineTo(X(st.bx + nx * o), Y(st.by + ny * o));
      c.strokeStyle = 'rgba(55,55,58,.9)'; c.lineWidth = Math.max(1, px * 0.05); c.stroke();
    }
  }
  // parks where the armies gather (drawn over the streets, which stop at the park railings), with a gravel walk
  for (const z of map.zones) {
    const x0 = z.x - 2, y0 = z.y - 2, w = z.w + 4, h = z.h + 4;
    c.fillStyle = '#9b927f'; c.fillRect(X(x0), Y(y0), w * px, h * px);
    c.fillStyle = '#6c8844'; c.fillRect(X(x0 + 0.9), Y(y0 + 0.9), (w - 1.8) * px, (h - 1.8) * px);
    for (let i = 0; i < w * h * px * 0.3; i++) {
      c.fillStyle = ['#78944c', '#61803d', '#83a055'][Math.floor(rng() * 3)];
      c.fillRect(X(x0 + 0.9 + rng() * (w - 1.8)), Y(y0 + 0.9 + rng() * (h - 1.8)), 1 + rng() * 2, 1 + rng() * 2);
    }
    c.strokeStyle = 'rgba(60,55,45,.6)'; c.lineWidth = Math.max(1, px * 0.08); c.strokeRect(X(x0 + 0.05), Y(y0 + 0.05), (w - 0.1) * px, (h - 0.1) * px);
  }
  // dust and fallen plaster round the ruins, dark footings round every building, soot on the street
  const lots = [...map.objects.filter(o => /^(house|ruin|church)/.test(o.style)), ...(map.outer || [])];
  for (const o of lots) {
    if (o.style.startsWith('ruin')) {
      const gr = c.createRadialGradient(X(o.x + o.w / 2), Y(o.y + o.h / 2), 0, X(o.x + o.w / 2), Y(o.y + o.h / 2), px * (Math.max(o.w, o.h) / 2 + 1.2));
      gr.addColorStop(0, 'rgba(150,142,128,.8)'); gr.addColorStop(1, 'rgba(150,142,128,0)');
      c.fillStyle = gr; c.fillRect(X(o.x - 1.5), Y(o.y - 1.5), (o.w + 3) * px, (o.h + 3) * px);
    }
    c.fillStyle = 'rgba(40,36,30,.55)'; c.fillRect(X(o.x - 0.08), Y(o.y - 0.08), (o.w + 0.16) * px, (o.h + 0.16) * px);
  }
  for (let i = 0; i < BW * BH / 90; i++) {
    const x = -M + rng() * BW, y = -M + rng() * BH, v = bcell(x, y);
    if (v < 1 || v > 3) continue;
    const r = px * (0.5 + rng() * 1.2), gr = c.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r);
    gr.addColorStop(0, 'rgba(25,22,20,.5)'); gr.addColorStop(1, 'rgba(25,22,20,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(X(x), Y(y), r, 0, 7); c.fill();
  }
}

// The town: buildings, bridges, quay walls, lamps, rubble (instanced by the caller through put())
function placeTown({ map, put, onBoard, W, H, M, BW, bcell, g, wx, wz, quality }) {
  const MODEL = { house2: ['house2a', 'house2b'], house3: ['house3a', 'house3b'], house1: ['house1'], ruin2: ['ruin2'], ruin3: ['ruin3'], ruin1: ['ruin1'],
    church: ['church'], monument: ['monument'], rubble: ['rubble'], barricade: ['barricade'], hedgehog: ['hedgehog'] };
  const building = (o, outside) => {
    const list = MODEL[o.style]; if (!list) return;
    const r = mulberry(o.seed + (o.turn || 0) * 977), cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (outside && !onBoard(cx, cy, Math.max(o.w, o.h) / 2 + 0.3)) return;
    const key = list[Math.floor(r() * list.length)];
    let yaw = o.fx !== undefined ? Math.atan2(o.fx, o.fy) : (o.w >= o.h ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0);
    if (o.style === 'hedgehog' || o.style === 'rubble') yaw = r() * 6;
    const tall = /^house/.test(o.style) ? 0.94 + r() * 0.14 : 1;
    const paint = PLASTER[Math.floor(r() * PLASTER.length)];
    const dirty = o.style.startsWith('ruin') ? 0.82 : 0.95 + r() * 0.08;
    put(outside ? key + '|far' : key, cx, cy, yaw, 1, tall, 1, dirty, 0, paint);
    // a few bricks and plaster lumps spilled into the street by every ruin
    if (o.style.startsWith('ruin') && !outside) for (let k = 0; k < 3; k++) {
      const a = r() * 6.283, d = Math.max(o.w, o.h) / 2 + 0.4 + r() * 0.5, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const v = bcell(x, y), gx = Math.floor(x), gy = Math.floor(y);
      if (v >= 1 && v <= 3 && gx >= 0 && gy >= 0 && gx < W && gy < H && map.grid[gy * W + gx] === 0) put('rubble', x, y, r() * 6, 0.35 + r() * 0.2, 0.3 + r() * 0.2);
    }
  };
  for (const o of map.objects) building(o, false);
  for (const o of map.outer || []) building(o, true);
  for (const d of map.decor) if (d.kind === 'crater' && onBoard(d.x, d.y, 1.2)) { const r = mulberry(d.seed); put('crater', d.x, d.y, r() * 6, 0.75 + r() * 0.4, 0.7 + r() * 0.3); }
  // the river: bridges, stone quays along every bank, and the water
  if (map.river) {
    for (const b of map.river.bridges) if (onBoard(b.x, b.y, 2)) put('bridge', b.x, b.y, -Math.atan2(b.dy, b.dx));
    const isWet = (x, y) => { const v = bcell(x + 0.5, y + 0.5); return v === 4 || v === 5; };
    for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) {
      if (isWet(x, y) || !onBoard(x + 0.5, y + 0.5, 0.8)) continue;
      if (isWet(x + 1, y)) put('quay', x + 1, y + 0.5, Math.PI / 2);
      if (isWet(x - 1, y)) put('quay', x, y + 0.5, -Math.PI / 2);
      if (isWet(x, y + 1)) put('quay', x + 0.5, y + 1, 0);
      if (isWet(x, y - 1)) put('quay', x + 0.5, y, Math.PI);
    }
    // water: one sheet over the whole board, cut out to the river by an alpha mask
    const s = 8, cv = document.createElement('canvas'); cv.width = BW * s; cv.height = (H + 2 * M) * s;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#000'; c2.fillRect(0, 0, cv.width, cv.height); c2.fillStyle = '#fff';
    for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) if (isWet(x, y)) c2.fillRect((x + M) * s - 1, (y + M) * s - 1, s + 2, s + 2);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(BW, H + 2 * M),
      new THREE.MeshStandardMaterial({ color: '#3f5c58', alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.86, roughness: 0.22, metalness: 0, envMapIntensity: 0.25, depthWrite: false }));
    water.rotation.x = -Math.PI / 2; water.position.set(wx(W / 2), -0.14, wz(H / 2)); water.receiveShadow = true; water.renderOrder = 2;
    g.add(water);
  }
  // plane trees round the parks
  for (const z of map.zones) {
    const r = mulberry(z.x * 131 + z.y), ring = [];
    for (let t = 0; t < z.w + 3; t += 2.6) ring.push([z.x - 1.5 + t, z.y - 1.3], [z.x - 1.5 + t, z.y + z.h + 1.3]);
    for (let t = 0; t < z.h + 3; t += 2.6) ring.push([z.x - 1.3, z.y - 1.5 + t], [z.x + z.w + 1.3, z.y - 1.5 + t]);
    for (const [x, y] of ring) {
      const gx = Math.floor(x), gy = Math.floor(y);
      if (!onBoard(x, y, 1) || (gx >= 0 && gy >= 0 && gx < W && gy < H && (map.grid[gy * W + gx] !== 0 || map.grid[gy * W + gx] === 4))) continue;
      const v = bcell(x, y); if (v === 2 || v === 4 || v === 5) continue;
      put(r() < 0.5 ? 'oak0' : 'oak1', x, y, r() * 6, 0.75 + r() * 0.2, 0.8 + r() * 0.25, 0.75 + r() * 0.2, 0.9 + r() * 0.2, (r() - 0.5) * 0.04);
    }
  }
  // street lamps along the avenues
  for (const st of map.streets) if (st.avenue) {
    const dx = st.bx - st.ax, dy = st.by - st.ay, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
    for (let t = 2; t < l; t += 3.2) for (const side of [-1, 1]) {
      const x = st.ax + dx / l * t + nx * side * 1.5, y = st.ay + dy / l * t + ny * side * 1.5;
      const v = bcell(x, y), gx = Math.floor(x), gy = Math.floor(y);
      if (v !== 2 || !onBoard(x, y, 1)) continue;
      if (gx >= 0 && gy >= 0 && gx < W && gy < H && map.grid[gy * W + gx] !== 0) continue;
      put('lamp', x, y, Math.atan2(-nx * side, -ny * side) - Math.PI / 2);
    }
  }
}
