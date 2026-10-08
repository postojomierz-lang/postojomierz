// Map labels as little flags over peaks, passes, lakes, huts and waterfalls (HTML overlay).
// Each flag stands on a thin pole from the point; hidden behind terrain (ray-marched against the height
// field a few labels per frame), faded with distance, and decluttered on screen: the most important
// labels win, the rest are skipped while they would overlap. Toggled with the 🏷 button or the L key.
// Also the plants and animals to discover (src/nature): '?' and the group until found, then the name.
// Categories (peaks and passes, water, huts, flora, fauna) are switched on and off one by one.
import * as THREE from 'three';
import { BY_ID, GROUPS } from './nature/catalog.js';

const ICON = { peak: '▲', pass: '⌒', lake: '≈', hut: '⌂', hotel: '🏨', fall: '⇣', trail: '◆', spring: '💧' };
export const CATS = { peaks: 'Szczyty i przełęcze', water: 'Stawy, wodospady, źródła', huts: 'Schroniska i hotele', flora: 'Rośliny', fauna: 'Zwierzęta' };
const catOf = (kind) => ({ peak: 'peaks', pass: 'peaks', trail: 'peaks', lake: 'water', fall: 'water', spring: 'water', hut: 'huts', hotel: 'huts', flora: 'flora', fauna: 'fauna' })[kind] || 'peaks';
export const placeId = (l) => `${l.kind}:${l.name}`;

// blockers: [{ x, y, z, tx, tz, nx, nz }] signposts (foot of the pole, trail direction and normal); while near, their boards keep the labels off them
// nature: { spots: [{ id, x, z, y }], found: { id: date } } (the catalogue's spots and what has been discovered)
const PANELS = ['hud', 'controls', 'bottom', 'minimap', 'fps', 'place', 'label-menu'];
// the mountain huts among the buildings OSM names (villas, churches, holiday cottages): seen from afar, like the peaks
const MAIN_HUT = /^schronisko pttk|murowaniec|kalatówki|^(téryho|zbojnícka|zamkovského|rainerova|bilíkova|skalnatá|žiarska|ťatliakova|krivánska|majláthova|šašinková|gazdíková) chata|^chata (pod|pri) (rysmi|soliskom|zelenom plese)|sliezsky dom$/i;

// hotels, guest houses and resorts among them (the planner's search finds the same ones, planner/hotels.js)
const HOTEL = /hotel|^patria$|resort|grand|penzi[oó]n|pensjonat|ubytov|residence/i;

export function buildLabels({ meta, terrain, camera, container, extra = [], blockers = [], nature = { spots: [], found: {} }, onClick = null }) {
  const layer = document.createElement('div');
  layer.id = 'labels';
  container.appendChild(layer);
  const found = nature.found;
  const natureItems = nature.spots.map((sp) => {
    const s = BY_ID[sp.id];
    return { kind: s.kind, id: sp.id, x: sp.x, z: sp.z, name: s.name, rank: 1 + s.rarity * 0.3, species: s };
  });
  const render = (it) => {
    if (it.species) {
      const g = GROUPS[it.species.group], known = !!found[it.id];
      it.el.classList.toggle('unknown', !known);
      it.el.firstChild.innerHTML = `<span class="ico">${g.icon}</span><span class="nm">${known ? it.name : '?'}</span>`
        + `<span class="ele">${known ? it.species.latin : g.name.toLowerCase()}</span>`;
      return;
    }
    const ele = it.ele ? `<span class="ele">${it.ele} m n.p.m.</span>` : it.note ? `<span class="ele">${it.note}</span>` : '';
    const done = found[placeId(it)] ? '<span class="ok">✓</span>' : '';
    it.el.firstChild.innerHTML = `<span class="ico">${ICON[it.kind] || '•'}</span><span class="nm">${it.name}</span>${ele}${done}`;
  };
  const items = [...(meta.labels || []), ...extra, ...natureItems].map((l) => {
    const el = document.createElement('div');
    el.className = `flag flag-${l.kind}`;
    el.innerHTML = '<div class="flag-box"></div><div class="pole"></div>';
    layer.appendChild(el);
    const y = terrain.height(l.x, l.z) + (l.kind === 'lake' ? 1 : 0);
    if (l.kind === 'hut' && MAIN_HUT.test(l.name) && !/^stare/i.test(l.name)) l = { ...l, main: true, rank: 2.4 };
    else if (l.kind === 'hut' && HOTEL.test(l.name)) l = { ...l, kind: 'hotel' };
    const it = { ...l, cat: catOf(l.kind), el, pos: new THREE.Vector3(l.x, y, l.z), visible: false, occl: 1, w: 0, h: 0 };
    render(it);
    if (onClick) el.firstChild.addEventListener('click', (e) => { e.stopPropagation(); onClick(it); });
    return it;
  });
  let cats = Object.fromEntries(Object.keys(CATS).map((c) => [c, true]));
  try { cats = { ...cats, ...JSON.parse(localStorage.getItem('rysy-label-cats') || '{}') }; } catch (e) { /* private mode */ }
  let enabled = true;
  try { enabled = localStorage.getItem('rysy-labels') !== '0'; } catch (e) { /* private mode */ }
  layer.style.display = enabled ? '' : 'none';

  const v = new THREE.Vector3();
  let cursor = 0, lastCam = null;
  // is the line from the camera to the point blocked by terrain?
  const blocked = (p) => {
    const c = camera.position, d = c.distanceTo(p);
    const n = Math.min(48, Math.max(12, Math.round(d / 250)));
    // a few samples close to the camera (rocks beside the path), then evenly along the line
    const ts = [3, 6, 12, 25, 50, 100].filter((m) => m < d * 0.5).map((m) => m / d);
    for (let k = 1; k < n; k++) ts.push(k / n);
    for (const t of ts) {
      const x = c.x + (p.x - c.x) * t, z = c.z + (p.z - c.z) * t, y = c.y + (p.y + 15 - c.y) * t;
      if (terrain.height(x, z) > y + 2) return true;
    }
    return false;
  };

  function update(dt) {
    if (!enabled) return;
    camera.updateMatrixWorld();   // the camera may have moved this frame, before the render updates it
    const W = innerWidth, H = innerHeight;
    // occlusion: all labels at the start or after a jump, then a slice per frame
    const moved = !lastCam || camera.position.distanceTo(lastCam) > 150;
    lastCam = camera.position.clone();
    const per = moved ? items.length : Math.max(8, Math.ceil(items.length / 20));
    for (let k = 0; k < per; k++) { const it = items[cursor++ % items.length]; it.hidden = blocked(it.pos); }
    const cand = [];
    for (const it of items) {
      const d = camera.position.distanceTo(it.pos);
      if (!cats[it.cat]) { if (it.visible) { it.el.classList.remove('on'); it.visible = false; } continue; }
      const maxD = it.kind === 'peak' ? 16000 : it.kind === 'pass' ? 4500 : it.kind === 'lake' ? 5000 : it.main ? 9000 : it.kind === 'spring' ? 500
        : it.species ? Math.max(it.kind === 'flora' ? 160 : 450, (it.species.far || 0) * 1.6) : 3500;
      let show = d < maxD && !it.hidden && d > 25;
      if (show) {
        v.copy(it.pos).project(camera);
        show = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.2;
        it.sx = (v.x * 0.5 + 0.5) * W; it.sy = (-v.y * 0.5 + 0.5) * H;
      }
      it.d = d;
      if (show) cand.push(it); else if (it.visible) { it.el.classList.remove('on'); it.visible = false; }
    }
    // importance: rank, nearness
    cand.sort((a, b) => (b.rank - Math.log10(b.d + 100) * 0.8) - (a.rank - Math.log10(a.d + 100) * 0.8));
    const placed = [];
    for (const b of blockers) {
      if (camera.position.distanceTo(v.set(b.x, b.y + 2.2, b.z)) > 80) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, front = false;
      // the boards reach ~0.8 m either way along the trail, 1.9–2.45 m above the ground
      for (const [u, h, w] of [[-0.8, 1.9, -0.06], [0.8, 1.9, -0.06], [-0.8, 2.45, -0.06], [0.8, 2.45, -0.06], [-0.8, 1.9, 0.06], [0.8, 1.9, 0.06], [-0.8, 2.45, 0.06], [0.8, 2.45, 0.06]]) {
        v.set(b.x + b.tx * u + b.nx * w, b.y + h, b.z + b.tz * u + b.nz * w).project(camera);
        if (v.z >= 1) continue;
        front = true;
        const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      if (front) placed.push({ x0, x1, y0, y1 });
    }
    // the panels and the name of the place: a label under them can be neither read nor clicked
    for (const id of PANELS) {
      const e = document.getElementById(id);
      if (!e || (id === 'place' && !e.classList.contains('show'))) continue;
      const r = e.getBoundingClientRect();
      if (r.width && r.height) placed.push({ x0: r.left, x1: r.right, y0: r.top, y1: r.bottom });
    }
    const nBlock = placed.length;
    for (const it of cand) {
      if (!it.w) { const r = it.el.firstChild.getBoundingClientRect(); it.w = r.width || 120; it.h = r.height || 28; }
      const pole = 26 + Math.min(40, 400000 / (it.d * it.d + 4000));
      const box = { x0: it.sx - 4, x1: it.sx + it.w + 4, y0: it.sy - pole - it.h - 2, y1: it.sy - pole + 2 };
      const clash = placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
      if (clash || placed.length - nBlock >= 26) { if (it.visible) { it.el.classList.remove('on'); it.visible = false; } continue; }
      placed.push(box);
      it.el.style.transform = `translate(${it.sx.toFixed(1)}px, ${(it.sy - pole - it.h).toFixed(1)}px)`;
      it.el.lastChild.style.height = `${pole.toFixed(0)}px`;
      it.el.style.setProperty('--o', String(Math.max(0.55, 1 - it.d / 20000)));
      if (!it.visible) { it.el.classList.add('on'); it.visible = true; }
    }
  }
  function setEnabled(on) {
    enabled = on; layer.style.display = on ? '' : 'none';
    try { localStorage.setItem('rysy-labels', on ? '1' : '0'); } catch (e) { /* private mode */ }
  }
  function setCat(c, on) {
    cats[c] = on;
    try { localStorage.setItem('rysy-label-cats', JSON.stringify(cats)); } catch (e) { /* private mode */ }
  }
  // after a discovery: the name instead of '?', or the tick on a place
  function refresh() { for (const it of items) { render(it); it.w = 0; } }
  return { update, setEnabled, setCat, refresh, get cats() { return { ...cats }; }, get enabled() { return enabled; }, count: items.length, items };
}
