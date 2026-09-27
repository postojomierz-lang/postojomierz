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
  // the beach: land at the play level, sloping under the sea beyond the shore
  const beachy = map.theme === 'beach';
  const coast = (x, y) => round ? R + 1.5 - Math.hypot(x - W / 2, y - H / 2) : Math.min(x + 1, W + 1 - x);   // < 0: in the sea
  // the jungle river (it also runs on beyond the play area)
  const rs = map.riverShape, bridgeAt = (x, y) => (map.bridges || []).some(b => Math.abs((x - b.x) * b.dy - (y - b.y) * b.dx) < 1.3 && Math.abs((x - b.x) * b.dx + (y - b.y) * b.dy) < 2.6);
  const inRiver = (x, y, w = 1.6) => !!rs && (rs.ring ? Math.abs(Math.hypot(x - W / 2, y - H / 2) - rs.ring) < w : Math.abs(x - (W / 2 + rs.A * Math.sin((y - H / 2) / H * 2 * Math.PI * rs.f))) < w);
  const height = (x, y) => {
    if (town) return townHeight(x, y);
    if (rs && inRiver(x, y, 1.1)) return -0.7;
    if (beachy) {
      const cd = coast(x, y);
      if (cd < 0) return Math.max(-1.1, cd * 0.4);
      if (!round && (y < 0 || y > H)) return noise(x / 6, y / 6) * 0.9 * ss(0, 5, Math.max(-y, y - H)) * ss(0.5, 4, edgeDist(x, y)) * ss(0, 3, cd);   // dunes inland
      return 0;
    }
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
  else if (beachy) paintBeach({ map, c, b, X, Y, px, rng, W, H, M, BW, BH, coast });
  else if (map.theme === 'winter') paintWinter({ map, c, b, X, Y, px, rng, W, H, M, BW, BH });
  else if (map.theme === 'desert') paintDesert({ map, c, b, X, Y, px, rng, W, H, M, BW, BH });
  else if (map.theme === 'jungle') paintJungle({ map, c, b, X, Y, px, rng, W, H, M, BW, BH, inRiver });
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
  const put = (key, x, y, yaw, sx = 1, sy = sx, sz = sx, tint = 1, hue = 0, paint = null, dy = 0) => {
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key).push({ x, y, yaw, sx, sy, sz, tint, hue, paint, dy });
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
  else if (beachy) placeBeach({ map, put, onBoard, W, H, M, BW, BH, g, wx, wz, coast, RB, round });
  else if (map.theme === 'winter') placeWinter({ map, put, onBoard, W, H, M, quality, outDist });
  else if (map.theme === 'desert') placeDesert({ map, put, onBoard, W, H, M, BW, BH, g, wx, wz, outDist });
  else if (map.theme === 'jungle') placeJungle({ map, put, onBoard, W, H, M, BW, BH, g, wx, wz, outDist, quality, inRiver });
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
      const geo = sceneryGeometry(key, part, far);
      if (!geo) continue;                                       // not downloaded (opened from disk)
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.userData.shared = true;   // the geometry is cached: keep it when the battlefield is rebuilt
      list.forEach((it, i) => {
        p.set(wx(it.x), (town ? 0 : height(it.x, it.y)) - 0.02 + (it.dy || 0), wz(it.y)); q.setFromEuler(e.set(0, it.yaw, 0)); s3.set(it.sx, it.sy, it.sz);
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

  // how far inland from the front of the landing beaches (the armies' zones)
  const zoneBand = map.frame ? (round ? R + 1.5 - map.frame.Tc : map.frame.T0 + 1) : 0;
  const inland = (x, y) => coast(x, y) - zoneBand;
  // ---------------------------------------------------------------- grass tufts
  const per = quality === 'low' || map.theme === 'winter' ? 0 : quality === 'high' ? 1.6 : 0.7;
  if (per) {
    const tuft = tuftGeometry(), pts = [], r = mulberry(map.seed ^ 0x7a11);
    const count = Math.round(BW * BH * per);
    for (let i = 0; i < count && pts.length < 60000; i++) {
      const x = -M + r() * BW, y = -M + r() * BH;
      if (!onBoard(x, y, 0.5)) continue;
      if (x >= 0 && y >= 0 && x < W && y < H && map.grid[Math.floor(y) * W + Math.floor(x)] !== 0 && map.grid[Math.floor(y) * W + Math.floor(x)] !== 4) continue;
      if (town) { const v = bcell(x, y); if ((v !== 0 && v !== 6) || r() < 0.5 || x < 0 || y < 0 || x >= W || y >= H) continue; }
      else if (beachy) { if (inland(x, y) < 6 + r() * 3) continue; }
      else if (map.theme === 'winter') continue;
      else if (map.theme === 'jungle') { const gx = Math.floor(x), gy = Math.floor(y); if (inRiver(x, y) || (gx >= 0 && gy >= 0 && gx < W && gy < H && map.grid[gy * W + gx] !== 0)) continue; }
      else if (map.theme === 'desert') { const dd = Math.hypot(x - W / 2, y - H / 2); if (dd > Math.min(11, Math.max(W, H) * 0.14) || r() < 0.3) continue; }
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
function pondMesh(map, o, wx, wz, color = '#46604c') {
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
  const m = new THREE.MeshStandardMaterial({ color, alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.92, roughness: 0.05, metalness: 0.2, depthWrite: false });
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

// ---------------------------------------------------------------------------------------------
// The beach: painted ground
function paintBeach({ map, c, b, X, Y, px, rng, W, H, M, BW, BH, coast }) {
  const { round, R } = map, zoneBand = round ? R + 1.5 - map.frame.Tc : map.frame.T0 + 1;
  // colour by distance from the sea: sea bed, wet sand, foam, dry sand, sandy grass further inland
  const step = Math.max(2, Math.floor(px / 4)), img = c.createImageData(BW * px, BH * px), d = img.data;
  const mix = (a, b2, t) => a.map((v, i) => v + (b2[i] - v) * Math.max(0, Math.min(1, t)));
  const SEA = [92, 110, 96], WET = [176, 155, 112], DRY = [219, 199, 150], GRASS = [150, 152, 92];
  for (let py = 0; py < BH * px; py += step) for (let pxx = 0; pxx < BW * px; pxx += step) {
    const x = pxx / px - M, y = py / px - M, cd = coast(x, y), grain = (Math.sin(x * 12.9 + y * 78.2) * 43758.5 % 1 + 1) % 1;
    let col;
    if (cd < -1.2) col = mix(SEA, WET, (cd + 3) / 1.8);
    else if (cd < 0.6) col = mix(WET, DRY, (cd + 1.2) / 1.8);
    else col = mix(DRY, GRASS, (cd - zoneBand - 7) / 6 + (grain - 0.5) * 0.6);
    const j = (grain - 0.5) * 14;
    for (let yy = py; yy < Math.min(py + step, BH * px); yy++) for (let xx = pxx; xx < Math.min(pxx + step, BW * px); xx++) {
      const o = (yy * BW * px + xx) * 4; d[o] = col[0] + j; d[o + 1] = col[1] + j; d[o + 2] = col[2] + j * 0.8; d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  // foam lines along the water's edge, ripples in the wet sand
  for (const [off, a, w] of [[-0.7, 0.75, 0.22], [-1.3, 0.45, 0.14], [-2.1, 0.3, 0.1]]) {
    c.strokeStyle = `rgba(250,248,240,${a})`; c.lineWidth = px * w; c.beginPath();
    if (round) { c.arc(X(W / 2), Y(H / 2), (R + 1.5 - off) * px, 0, 7); }
    else for (const side of [-1, 1]) {
      const x0 = side < 0 ? -1 + off : W + 1 - off;
      c.moveTo(X(x0), Y(-M)); for (let y = -M; y <= H + M; y += 0.5) c.lineTo(X(x0 + Math.sin(y * 0.9 + side) * 0.18), Y(y));
    }
    c.stroke();
  }
  // tank tracks and footprints churned into the sand, from the sea inland
  for (let i = 0; i < (round ? 18 : 8); i++) {
    const a = rng() * Math.PI * 2, len = 6 + rng() * 10;
    let x0, y0, dx, dy;
    if (round) { const r0 = R + 1; x0 = W / 2 + Math.cos(a) * r0; y0 = H / 2 + Math.sin(a) * r0; dx = -Math.cos(a); dy = -Math.sin(a); }
    else { const side = i % 2 ? 1 : -1; x0 = side < 0 ? -1 : W + 1; y0 = rng() * H; dx = -side; dy = (rng() - 0.5) * 0.6; }
    for (const o of [-0.35, 0.35]) {
      c.strokeStyle = 'rgba(120,100,70,.35)'; c.lineWidth = px * 0.22; c.beginPath();
      c.moveTo(X(x0 - dy * o), Y(y0 + dx * o)); c.quadraticCurveTo(X(x0 + dx * len / 2 + (rng() - 0.5) * 3), Y(y0 + dy * len / 2 + (rng() - 0.5) * 3), X(x0 + dx * len - dy * o), Y(y0 + dy * len + dx * o)); c.stroke();
    }
  }
  // dark churned earth under trenches and round the bunkers
  for (const o of map.objects) {
    if (o.style === 'trench' || o.style === 'tobruk') { c.fillStyle = 'rgba(95,78,55,.85)'; c.fillRect(X(o.x - 0.2), Y(o.y - 0.2), (o.w + 0.4) * px, (o.h + 0.4) * px); }
    else if (o.style === 'casemate' || o.style === 'pillbox') {
      const gr = c.createRadialGradient(X(o.x + o.w / 2), Y(o.y + o.h / 2), 0, X(o.x + o.w / 2), Y(o.y + o.h / 2), px * (o.w / 2 + 1.5));
      gr.addColorStop(0, 'rgba(110,95,70,.8)'); gr.addColorStop(1, 'rgba(110,95,70,0)');
      c.fillStyle = gr; c.fillRect(X(o.x - 2), Y(o.y - 2), (o.w + 4) * px, (o.h + 4) * px);
    }
  }
  // wind ripples in the dry sand (bump)
  b.strokeStyle = 'rgba(100,100,100,.5)'; b.lineWidth = 1;
  for (let i = 0; i < BW * BH / 3; i++) { const x = rng() * BW * px, y = rng() * BH * px; b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(x + px * 0.3, y - px * 0.1, x + px * 0.6, y); b.stroke(); }
}

// The beach: fortifications, obstacles, dunes, the lighthouse, landing craft and the sea
function placeBeach({ map, put, onBoard, W, H, M, BW, BH, g, wx, wz, coast, RB, round }) {
  const face = o => Math.atan2(o.fx || 0, o.fy || 1);
  for (const o of map.objects) {
    const r = mulberry(o.seed + (o.turn || 0) * 977), cx = o.x + o.w / 2, cy = o.y + o.h / 2, along = o.w >= o.h;
    switch (o.style) {
      case 'casemate': case 'pillbox': case 'tobruk': case 'lighthouse': put(o.style, cx, cy, face(o), 1, 1, 1, 0.92 + r() * 0.1); break;
      case 'rocks': put('rocks', cx, cy, r() * 6, 0.9 + r() * 0.3, 0.8 + r() * 0.4); break;
      case 'house2': case 'ruin2': put(o.style === 'house2' ? (r() < 0.5 ? 'house2a' : 'house2b') : 'ruin2', cx, cy, face(o), 1, 1, 1, o.style === 'ruin2' ? 0.82 : 1, 0, ['#f0ece2', '#e9dcc0', '#dfe4e6', '#efe4d2'][Math.floor(r() * 4)]); break;
      case 'trench': put('trench', cx, cy, face(o) + Math.PI / 2); break;
      case 'hedgehog': put('hedgehog', cx, cy, r() * 6, 0.9 + r() * 0.2); break;
      case 'stakes': put('stakes', cx, cy, face(o) + Math.PI + (r() - 0.5) * 0.4, 0.9 + r() * 0.2); break;
      case 'gate': put('gate', cx, cy, (along ? 0 : Math.PI / 2) + (r() - 0.5) * 0.15, 1, 0.9 + r() * 0.2, 1, 0.9 + r() * 0.15); break;
      case 'wire': case 'dune':
        for (let k = 0; k < Math.max(o.w, o.h); k++) {
          const x = along ? o.x + k + 0.5 : cx, y = along ? cy : o.y + k + 0.5;
          put(o.style, x, y, (along ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0) + (r() - 0.5) * 0.15, 1.05, 0.85 + r() * 0.35, 1 + r() * 0.2, 0.9 + r() * 0.15);
        }
        break;
    }
  }
  for (const d of map.decor) {
    if (!onBoard(d.x, d.y, 1.2)) continue;
    const r = mulberry(d.seed);
    if (d.kind === 'crater') put('crater', d.x, d.y, r() * 6, 0.8 + r() * 0.4, 0.7 + r() * 0.3, 0.8 + r() * 0.4, 1.1);
    else if (d.kind === 'mines') put('mines', d.x, d.y, r() * 6, 1);
  }
  // landing craft run up on every army's beach, and a few more further along
  const r = mulberry(map.seed ^ 0x1c1f);
  for (const z of map.zones) {
    const zx = z.x + z.w / 2, zy = z.y + z.h / 2;
    let dx, dy, x0, y0;
    if (round) { const l = Math.hypot(zx - W / 2, zy - H / 2); dx = (zx - W / 2) / l; dy = (zy - H / 2) / l; x0 = W / 2 + dx * (map.R + 2.6); y0 = H / 2 + dy * (map.R + 2.6); }
    else { dx = zx < W / 2 ? -1 : 1; dy = 0; x0 = zx < W / 2 ? -2.2 : W + 2.2; y0 = zy; }
    for (let k = -2; k <= 2; k++) {
      if (r() < 0.3) continue;
      const lat = k * 3.4 + (r() - 0.5) * 1.2, x = x0 - dy * lat + dx * (r() - 0.5) * 1.2, y = y0 + dx * lat + dy * (r() - 0.5) * 1.2;
      if (!onBoard(x, y, 2)) continue;
      put('lcvp', x, y, Math.atan2(dy, -dx) + (r() - 0.5) * 0.35, 1, 1, 1, 0.9 + r() * 0.15, 0, null, 0.12);
    }
  }
  // rocks along the shore beyond the play area
  for (let i = 0; i < BW * BH / 250; i++) {
    const x = -M + r() * BW, y = -M + r() * BH, cd = coast(x, y);
    if (cd > 0.5 || cd < -3 || !onBoard(x, y, 1.5)) continue;
    put('rocks', x, y, r() * 6, 0.6 + r() * 0.5, 0.4 + r() * 0.4, 0.6 + r() * 0.5);
  }
  // the sea: one sheet over the whole board (the land hides it)
  const sea = new THREE.Mesh(round ? new THREE.CircleGeometry(RB, 96) : new THREE.PlaneGeometry(BW, BH),
    new THREE.MeshStandardMaterial({ color: '#3e6f78', transparent: true, opacity: 0.82, roughness: 0.18, metalness: 0, envMapIntensity: 0.4, depthWrite: false }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(wx(W / 2), -0.24, wz(H / 2)); sea.receiveShadow = true; sea.renderOrder = 2;
  g.add(sea);
}

// ---------------------------------------------------------------------------------------------
// Winter: painted snow
function paintWinter({ map, c, b, X, Y, px, rng, W, H, M, BW, BH }) {
  c.fillStyle = '#edf1f6'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  for (let i = 0; i < BW * BH * 0.5; i++) {                            // soft blue shadows in the drifts
    const gr = c.createRadialGradient(0, 0, 0, 0, 0, 1), x = rng() * c.canvas.width, y = rng() * c.canvas.height, r = px * (0.8 + rng() * 2.5);
    c.fillStyle = `rgba(${170 + rng() * 30},${190 + rng() * 20},${220},${0.08 + rng() * 0.08})`;
    c.beginPath(); c.ellipse(x, y, r * 1.6, r, rng() * 3, 0, 7); c.fill();
  }
  // under the trees: trodden, darker snow with needles
  for (const f of map.fields) {
    if (!f.forest || f.poly.length < 3) continue;
    c.beginPath(); f.poly.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.closePath();
    c.fillStyle = '#d3dae2'; c.fill();
    c.save(); c.clip();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of f.poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (let i = 0; i < (x1 - x0) * (y1 - y0) * px * 0.4; i++) {
      c.fillStyle = ['#8d8474', '#6e7a66', '#b8c1cb', '#a59a86'][Math.floor(rng() * 4)];
      c.fillRect(X(x0 + rng() * (x1 - x0)), Y(y0 + rng() * (y1 - y0)), 1 + rng() * 1.5, 1 + rng() * 1.5);
    }
    c.restore();
  }
  // lanes: churned slush with two dark ruts
  for (const r of map.roads) {
    const L = Math.hypot(r.x1 - r.x0, r.y1 - r.y0), steps = Math.max(8, Math.ceil(L * 2)), pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u * u * r.x0 + 2 * u * t * r.qx + t * t * r.x1, y = u * u * r.y0 + 2 * u * t * r.qy + t * t * r.y1;
      const dx = 2 * u * (r.qx - r.x0) + 2 * t * (r.x1 - r.qx), dy = 2 * u * (r.qy - r.y0) + 2 * t * (r.y1 - r.qy), l = Math.hypot(dx, dy) || 1;
      pts.push([x, y, -dy / l, dx / l]);
    }
    const line = (ctx, off, width, style) => {
      ctx.beginPath(); pts.forEach(([x, y, nx, ny], i) => (i ? ctx.lineTo(X(x + nx * off), Y(y + ny * off)) : ctx.moveTo(X(x + nx * off), Y(y + ny * off))));
      ctx.strokeStyle = style; ctx.lineWidth = width * px; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    };
    line(c, 0, 1.9, 'rgba(160,165,170,.5)'); line(c, 0, 1.5, '#b9b6ad');
    for (const o of [-0.38, 0.38]) { line(c, o, 0.3, '#7f786b'); line(b, o, 0.3, '#404040'); }
  }
  // frozen ponds
  for (const d of map.decor) if (d.kind === 'ice') {
    const gr = c.createRadialGradient(X(d.x), Y(d.y), 0, X(d.x), Y(d.y), px * d.r);
    gr.addColorStop(0, '#a9c8dc'); gr.addColorStop(0.85, '#c3d9e7'); gr.addColorStop(1, 'rgba(230,238,245,0)');
    c.fillStyle = gr; c.beginPath(); c.ellipse(X(d.x), Y(d.y), px * d.r * 1.3, px * d.r, (d.seed % 7) * 0.4, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1;
    const r = mulberry(d.seed);
    for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(X(d.x + (r() - 0.5) * d.r), Y(d.y + (r() - 0.5) * d.r)); c.lineTo(X(d.x + (r() - 0.5) * d.r * 1.6), Y(d.y + (r() - 0.5) * d.r * 1.2)); c.stroke(); }
  }
  // dark earth thrown up round foxholes, drifts in the bump map
  for (const o of map.objects) if (o.style === 'foxhole') { c.fillStyle = 'rgba(110,95,75,.45)'; c.beginPath(); c.arc(X(o.x + 0.5), Y(o.y + 0.5), px * 0.9, 0, 7); c.fill(); }
  b.strokeStyle = 'rgba(150,150,150,.35)'; b.lineWidth = px * 0.3;
  for (let i = 0; i < BW * BH / 12; i++) { const x = rng() * b.canvas.width, y = rng() * b.canvas.height; b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(x + px, y - px * 0.4, x + px * 2, y); b.stroke(); }
}

// Winter: spruces in the forests (inside and beyond the play area), the village, foxholes, logs
function placeWinter({ map, put, onBoard, W, H, M, quality, outDist }) {
  const r = mulberry(map.seed ^ 0x51ee), dense = quality === 'low' ? 1 : 1.4;
  const tree = (x, y) => put(r() < 0.55 ? 'pine0' : 'pine1', x, y, r() * 6, 0.7 + r() * 0.35, 0.65 + r() * 0.45, 0.7 + r() * 0.35, 0.85 + r() * 0.25, (r() - 0.5) * 0.03);
  const isWood = new Uint8Array(W * H);
  for (const o of map.objects) if (o.style === 'forest') for (const c of o.cells) isWood[c] = 1;
  for (let c = 0; c < W * H; c++) if (isWood[c] && map.grid[c] === 5) {
    const x = c % W, y = Math.floor(c / W);
    const edge = !isWood[c - 1] || !isWood[c + 1] || !isWood[c - W] || !isWood[c + W];
    const k = edge ? 1 : dense;
    for (let i = 0; i < k; i++) if (i < 1 || r() < k - 1) tree(x + 0.15 + r() * 0.7, y + 0.15 + r() * 0.7);
  }
  // the forest carries on beyond the play area
  const sites = map.fields;
  const forestAt = (x, y) => { let best = null, bd = Infinity; for (const f of sites) { const d = (f.x - x) ** 2 + (f.y - y) ** 2; if (d < bd) { bd = d; best = f; } } return best && best.forest; };
  for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) {
    if (outDist(x + 0.5, y + 0.5) < 1.2 || !onBoard(x + 0.5, y + 0.5, 1) || !forestAt(x + 0.5, y + 0.5)) continue;
    if (r() < 0.8) tree(x + r(), y + r());
  }
  for (const o of map.objects) {
    const q = mulberry(o.seed + (o.turn || 0) * 977), cx = o.x + o.w / 2, cy = o.y + o.h / 2, along = o.w >= o.h;
    const yaw = (along ? 0 : Math.PI / 2) + (q() < 0.5 ? Math.PI : 0);
    if (o.style === 'chalet' || o.style === 'shed' || o.style === 'logs') put(o.style, cx, cy, yaw + (o.style === 'logs' ? (q() - 0.5) * 0.3 : 0), 1, 0.95 + q() * 0.1, 1, 0.95 + q() * 0.08);
    else if (o.style === 'fallen') put('fallen', cx, cy, yaw + (q() - 0.5) * 0.3, 1, 1, 1, 0.9 + q() * 0.1);
    else if (o.style === 'foxhole') put('foxhole', cx, cy, q() * 6);
  }
  for (const d of map.decor) if (d.kind === 'crater' && onBoard(d.x, d.y, 1.2)) { const q = mulberry(d.seed); put('crater', d.x, d.y, q() * 6, 0.8 + q() * 0.4, 0.7 + q() * 0.3); }
}

// ---------------------------------------------------------------------------------------------
// The desert: painted sand and gravel
function paintDesert({ map, c, b, X, Y, px, rng, W, H, M, BW, BH }) {
  c.fillStyle = '#d6b680'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  for (let i = 0; i < BW * BH * 0.35; i++) {                           // gravel plains and paler sand
    const x = rng() * c.canvas.width, y = rng() * c.canvas.height, r = px * (1 + rng() * 3.5);
    c.fillStyle = rng() < 0.5 ? `rgba(170,140,100,${0.08 + rng() * 0.1})` : `rgba(235,210,160,${0.1 + rng() * 0.1})`;
    c.beginPath(); c.ellipse(x, y, r * 1.8, r, rng() * 0.6 - 0.3, 0, 7); c.fill();
  }
  for (let i = 0; i < BW * BH * px * 0.35; i++) {                      // pebbles
    c.fillStyle = ['#b89a70', '#9c805c', '#e2c898', '#8d7658'][Math.floor(rng() * 4)];
    c.fillRect(rng() * c.canvas.width, rng() * c.canvas.height, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
  // wind ripples in the sand (bump) and pale streaks (colour)
  b.strokeStyle = 'rgba(90,90,90,.45)'; b.lineWidth = Math.max(1, px * 0.08);
  c.strokeStyle = 'rgba(245,225,185,.25)'; c.lineWidth = Math.max(1, px * 0.1);
  for (let i = 0; i < BW * BH / 2.5; i++) {
    const x = rng() * c.canvas.width, y = rng() * c.canvas.height, l = px * (0.6 + rng());
    b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(x + l / 2, y - px * 0.12, x + l, y + px * 0.05); b.stroke();
    if (i % 3 === 0) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - px * 0.12, x + l, y + px * 0.05); c.stroke(); }
  }
  // the desert track: two faint wheel ruts
  for (const r of map.roads) {
    const L = Math.hypot(r.x1 - r.x0, r.y1 - r.y0), steps = Math.max(8, Math.ceil(L * 2)), pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u * u * r.x0 + 2 * u * t * r.qx + t * t * r.x1, y = u * u * r.y0 + 2 * u * t * r.qy + t * t * r.y1;
      const dx = 2 * u * (r.qx - r.x0) + 2 * t * (r.x1 - r.qx), dy = 2 * u * (r.qy - r.y0) + 2 * t * (r.y1 - r.qy), l = Math.hypot(dx, dy) || 1;
      pts.push([x, y, -dy / l, dx / l]);
    }
    for (const o of [-0.4, 0.4]) {
      c.beginPath(); pts.forEach(([x, y, nx, ny], i) => (i ? c.lineTo(X(x + nx * o), Y(y + ny * o)) : c.moveTo(X(x + nx * o), Y(y + ny * o))));
      c.strokeStyle = 'rgba(150,120,85,.55)'; c.lineWidth = px * 0.3; c.lineCap = 'round'; c.stroke();
    }
  }
  // the oasis: green round the pool
  const gr = c.createRadialGradient(X(W / 2), Y(H / 2), 0, X(W / 2), Y(H / 2), px * Math.min(11, Math.max(W, H) * 0.14));
  gr.addColorStop(0, 'rgba(120,140,70,.9)'); gr.addColorStop(0.5, 'rgba(150,150,85,.6)'); gr.addColorStop(1, 'rgba(180,160,100,0)');
  c.fillStyle = gr; c.beginPath(); c.arc(X(W / 2), Y(H / 2), px * Math.min(11, Math.max(W, H) * 0.14), 0, 7); c.fill();
  // scorched sand round the wrecks
  for (const o of map.objects) if (o.style === 'wreck') {
    const g2 = c.createRadialGradient(X(o.x + o.w / 2), Y(o.y + o.h / 2), 0, X(o.x + o.w / 2), Y(o.y + o.h / 2), px * 2);
    g2.addColorStop(0, 'rgba(40,32,26,.6)'); g2.addColorStop(1, 'rgba(40,32,26,0)');
    c.fillStyle = g2; c.fillRect(X(o.x - 2), Y(o.y - 2), (o.w + 4) * px, (o.h + 4) * px);
  }
}

// The desert: rocks, ridges, the oasis with its houses and palms, sangars, wrecks, drums
function placeDesert({ map, put, onBoard, W, H, M, BW, BH, g, wx, wz, outDist }) {
  for (const o of map.objects) {
    const r = mulberry(o.seed + (o.turn || 0) * 977), cx = o.x + o.w / 2, cy = o.y + o.h / 2, along = o.w >= o.h;
    const yaw = (along ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0);
    switch (o.style) {
      case 'adobe': case 'adobe_ruin': put(o.style, cx, cy, Math.floor(r() * 4) * Math.PI / 2, 1, 0.9 + r() * 0.2, 1, 0.9 + r() * 0.15); break;
      case 'outcrop': case 'mesa': put(o.style, cx, cy, o.style === 'mesa' ? yaw : r() * 6, 0.95 + r() * 0.15, 0.8 + r() * 0.5, 0.95 + r() * 0.15, 0.9 + r() * 0.15); break;
      case 'sangar': put('sangar', cx, cy, r() * 6); break;
      case 'wreck': put('wreck', cx, cy, yaw + (r() - 0.5) * 0.4); break;
      case 'drums': put('drums', cx, cy, r() * 6); break;
      case 'ridge': case 'sanddune': case 'wire':
        for (let k = 0; k < Math.max(o.w, o.h); k++) {
          const x = along ? o.x + k + 0.5 : cx, y = along ? cy : o.y + k + 0.5;
          put(o.style, x, y, (along ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0) + (r() - 0.5) * 0.2, 1.05, 0.8 + r() * 0.4, 1 + r() * 0.2, 0.9 + r() * 0.15);
        }
        break;
      case 'pool': g.add(pondMesh(map, o, wx, wz, '#3f8c86')); break;
    }
  }
  for (const d of map.decor) {
    if (!onBoard(d.x, d.y, 1.2)) continue;
    const r = mulberry(d.seed);
    if (d.kind === 'palm') put(r() < 0.5 ? 'palm0' : 'palm1', d.x, d.y, r() * 6, 0.85 + r() * 0.3, 0.8 + r() * 0.4, 0.85 + r() * 0.3, 0.9 + r() * 0.15, (r() - 0.5) * 0.04);
    else if (d.kind === 'scrub') put('scrub', d.x, d.y, r() * 6, 0.7 + r() * 0.6);
    else if (d.kind === 'crater') put('crater', d.x, d.y, r() * 6, 0.8 + r() * 0.4, 0.7 + r() * 0.3);
    else if (d.kind === 'mines') put('mines', d.x, d.y, r() * 6);
  }
  // beyond the play area: dunes (the ground rises) with scrub and rocks
  const r = mulberry(map.seed ^ 0xde5e);
  for (let i = 0; i < BW * BH / 40; i++) {
    const x = -M + r() * BW, y = -M + r() * BH;
    if (outDist(x, y) < 1.5 || !onBoard(x, y, 1)) continue;
    if (r() < 0.75) put('scrub', x, y, r() * 6, 0.6 + r() * 0.6);
    else put('outcrop', x, y, r() * 6, 0.4 + r() * 0.5, 0.3 + r() * 0.5, 0.4 + r() * 0.5);
  }
}

// ---------------------------------------------------------------------------------------------
// The jungle: painted floor
function paintJungle({ map, c, b, X, Y, px, rng, W, H, M, BW, BH, inRiver }) {
  c.fillStyle = '#6f7f3f'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);          // clearings: tall kunai grass
  for (let i = 0; i < BW * BH * px * 0.4; i++) {
    c.fillStyle = ['#7f9147', '#63733a', '#8d9c52', '#5b6a35'][Math.floor(rng() * 4)];
    c.fillRect(rng() * c.canvas.width, rng() * c.canvas.height, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (const f of map.fields) {                                                     // under the trees: dark leaf litter
    if (!f.forest || f.poly.length < 3) continue;
    c.beginPath(); f.poly.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.closePath();
    c.fillStyle = '#3f4a2a'; c.fill();
    c.save(); c.clip();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of f.poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (let i = 0; i < (x1 - x0) * (y1 - y0) * px * 0.5; i++) {
      c.fillStyle = ['#5b4a30', '#4a5a2e', '#6b5836', '#2f3a22'][Math.floor(rng() * 4)];
      c.fillRect(X(x0 + rng() * (x1 - x0)), Y(y0 + rng() * (y1 - y0)), 1 + rng() * 2, 1 + rng() * 2);
    }
    c.restore();
  }
  // muddy trails
  for (const r of map.roads) {
    const L = Math.hypot(r.x1 - r.x0, r.y1 - r.y0), steps = Math.max(8, Math.ceil(L * 2));
    c.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t, x = u * u * r.x0 + 2 * u * t * r.qx + t * t * r.x1, y = u * u * r.y0 + 2 * u * t * r.qy + t * t * r.y1;
      i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y));
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = 'rgba(90,70,45,.6)'; c.lineWidth = px * 2.1; c.stroke();
    c.strokeStyle = '#7d5c3b'; c.lineWidth = px * 1.5; c.stroke();
  }
  // the river: muddy banks and a dark bed
  if (map.riverShape) for (let y = -M; y < H + M; y += 0.25) for (let x = -M; x < W + M; x += 0.25) {
    if (inRiver(x, y, 2.2)) { c.fillStyle = inRiver(x, y, 1.3) ? '#3a3a26' : '#6e5a3a'; c.fillRect(X(x), Y(y), px / 4 + 1, px / 4 + 1); }
  }
}

// The jungle: trees, ferns, bamboo, the village, bunkers, banyans, the wreck, bridges, the river
function placeJungle({ map, put, onBoard, W, H, M, BW, BH, g, wx, wz, outDist, quality, inRiver }) {
  const r = mulberry(map.seed ^ 0x7a9e), dense = quality === 'low' ? 0.5 : 0.8;
  const tree = (x, y) => put(r() < 0.5 ? 'jtree0' : 'jtree1', x, y, r() * 6, 0.7 + r() * 0.45, 0.7 + r() * 0.5, 0.7 + r() * 0.45, 0.85 + r() * 0.25, (r() - 0.5) * 0.05);
  const under = (x, y) => put('fern', x, y, r() * 6, 0.8 + r() * 0.8, 0.7 + r() * 0.8, 0.8 + r() * 0.8, 0.85 + r() * 0.3, (r() - 0.5) * 0.06);
  for (const o of map.objects) if (o.style === 'forest') for (const c of o.cells) {
    if (map.grid[c] !== 5) continue;
    const x = c % W, y = Math.floor(c / W);
    if (r() < dense) tree(x + 0.2 + r() * 0.6, y + 0.2 + r() * 0.6);
    under(x + r(), y + r());
    if (r() < 0.3) put('palm' + (r() < 0.5 ? 0 : 1), x + r(), y + r(), r() * 6, 0.8 + r() * 0.3);
  }
  // beyond the play area the jungle carries on
  const forestAt = (x, y) => { let best = null, bd = Infinity; for (const f of map.fields) { const d = (f.x - x) ** 2 + (f.y - y) ** 2; if (d < bd) { bd = d; best = f; } } return best && best.forest; };
  for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) {
    if (outDist(x + 0.5, y + 0.5) < 1.2 || !onBoard(x + 0.5, y + 0.5, 1) || inRiver(x + 0.5, y + 0.5, 2) || !forestAt(x + 0.5, y + 0.5)) continue;
    if (r() < 0.6) tree(x + r(), y + r());
    if (r() < 0.5) under(x + r(), y + r());
  }
  for (const o of map.objects) {
    const q = mulberry(o.seed + (o.turn || 0) * 977), cx = o.x + o.w / 2, cy = o.y + o.h / 2, along = o.w >= o.h;
    const yaw = (along ? 0 : Math.PI / 2) + (q() < 0.5 ? Math.PI : 0);
    switch (o.style) {
      case 'hut': case 'logbunker': put(o.style, cx, cy, Math.floor(q() * 4) * Math.PI / 2, 1, 0.9 + q() * 0.2, 1, 0.9 + q() * 0.15); break;
      case 'banyan': put('banyan', cx, cy, q() * 6, 0.9 + q() * 0.25, 0.9 + q() * 0.3, 0.9 + q() * 0.25); break;
      case 'bamboo': put('bamboo', cx, cy, q() * 6, 0.8 + q() * 0.3, 0.8 + q() * 0.4); break;
      case 'planewreck': put('planewreck', cx, cy, yaw + (q() - 0.5) * 0.5); break;
    }
  }
  for (const d of map.decor) if (d.kind === 'crater' && onBoard(d.x, d.y, 1.2)) { const q = mulberry(d.seed); put('crater', d.x, d.y, q() * 6, 0.8 + q() * 0.4, 0.7 + q() * 0.3); }
  for (const b of map.bridges || []) put('woodbridge', b.x, b.y, -Math.atan2(b.dy, b.dx), 1, 1, 0.9, 1, 0, null, 0.02);
  // the river water over the whole board, cut out by a mask
  if (map.riverShape) {
    const s = 8, cv = document.createElement('canvas'); cv.width = BW * s; cv.height = BH * s;
    const c2 = cv.getContext('2d'); c2.fillStyle = '#000'; c2.fillRect(0, 0, cv.width, cv.height); c2.fillStyle = '#fff';
    for (let y = 0; y < BH * s; y++) for (let x = 0; x < BW * s; x++) if (inRiver(x / s - M, y / s - M, 1.5)) c2.fillRect(x, y, 1, 1);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH),
      new THREE.MeshStandardMaterial({ color: '#4d5a3a', alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.9, roughness: 0.25, metalness: 0, envMapIntensity: 0.3, depthWrite: false }));
    water.rotation.x = -Math.PI / 2; water.position.set(wx(W / 2), -0.2, wz(H / 2)); water.receiveShadow = true; water.renderOrder = 2;
    g.add(water);
  }
}
