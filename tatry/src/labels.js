// Map labels as little flags over peaks, passes, lakes, huts and waterfalls (HTML overlay).
// Each flag stands on a thin pole from the point; hidden behind terrain (ray-marched against the height
// field a few labels per frame), faded with distance, and decluttered on screen: the most important
// labels win, the rest are skipped while they would overlap. Toggled with the 🏷 button or the L key.
import * as THREE from 'three';

const ICON = { peak: '▲', pass: '⌒', lake: '≈', hut: '⌂', fall: '⇣', trail: '◆' };

// blockers: [{ x, y, z }] signposts; while near, their boards keep the labels off them
export function buildLabels({ meta, terrain, camera, container, extra = [], blockers = [] }) {
  const layer = document.createElement('div');
  layer.id = 'labels';
  container.appendChild(layer);
  const items = [...(meta.labels || []), ...extra].map((l) => {
    const el = document.createElement('div');
    el.className = `flag flag-${l.kind}`;
    const ele = l.ele ? `<span class="ele">${l.ele} m n.p.m.</span>` : '';
    el.innerHTML = `<div class="flag-box"><span class="ico">${ICON[l.kind] || '•'}</span><span class="nm">${l.name}</span>${ele}</div><div class="pole"></div>`;
    layer.appendChild(el);
    const y = terrain.height(l.x, l.z) + (l.kind === 'lake' ? 1 : 0);
    return { ...l, el, pos: new THREE.Vector3(l.x, y, l.z), visible: false, occl: 1, w: 0, h: 0 };
  });
  let enabled = true;
  try { enabled = localStorage.getItem('rysy-labels') !== '0'; } catch (e) { /* private mode */ }
  layer.style.display = enabled ? '' : 'none';

  const v = new THREE.Vector3();
  let cursor = 0, lastCam = null;
  // is the line from the camera to the point blocked by terrain?
  const blocked = (p) => {
    const c = camera.position, d = c.distanceTo(p);
    const n = Math.min(48, Math.max(12, Math.round(d / 250)));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const x = c.x + (p.x - c.x) * t, z = c.z + (p.z - c.z) * t, y = c.y + (p.y + 15 - c.y) * t;
      if (terrain.height(x, z) > y + 2) return true;
    }
    return false;
  };

  function update(dt) {
    if (!enabled) return;
    const W = innerWidth, H = innerHeight;
    // occlusion: all labels at the start or after a jump, then a slice per frame
    const moved = !lastCam || camera.position.distanceTo(lastCam) > 150;
    lastCam = camera.position.clone();
    const per = moved ? items.length : Math.max(8, Math.ceil(items.length / 20));
    for (let k = 0; k < per; k++) { const it = items[cursor++ % items.length]; it.hidden = blocked(it.pos); }
    const cand = [];
    for (const it of items) {
      const d = camera.position.distanceTo(it.pos);
      const maxD = it.kind === 'peak' ? 16000 : it.kind === 'pass' ? 4500 : it.kind === 'lake' ? 5000 : 3500;
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
      for (const [dx, dy, dz] of [[-0.9, 1.8, -0.9], [0.9, 1.8, 0.9], [-0.9, 2.6, 0.9], [0.9, 2.6, -0.9], [-0.9, 1.8, 0.9], [0.9, 2.6, 0.9], [-0.9, 2.6, -0.9], [0.9, 1.8, -0.9]]) {
        v.set(b.x + dx, b.y + dy, b.z + dz).project(camera);
        if (v.z >= 1) continue;
        front = true;
        const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      if (front) placed.push({ x0, x1, y0, y1 });
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
  return { update, setEnabled, get enabled() { return enabled; }, count: items.length };
}
