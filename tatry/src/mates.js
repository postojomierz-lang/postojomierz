// The group on the trail: the members of the group chosen in the planner who share their position (GPS
// navigation in the planner, live_positions) walk in the 3D view as the figures they chose (avatar/look.js),
// with a label over each: the face or photo, the name, how far and how long ago. Far away only the round
// face is left. The 3D view uses the planner's sign-in (same site, localStorage 'tatry-auth') through the
// REST API, every 15 s; ?grupa=demo shows three made-up hikers instead (for trying it out).
import * as THREE from 'three';
import { buildFigure } from './avatar/figure3d.js';
import { cleanLook, randomLook } from './avatar/look.js';
import { faceDataUrl } from './avatar/svg.js';

const URL_ = __SUPABASE_URL__, KEY = __SUPABASE_KEY__;
const AUTH = 'tatry-auth', GROUP = 'tatry-group';
const LAT0 = 49.191, LON0 = 20.076, MX = 111320 * Math.cos(LAT0 * Math.PI / 180), MZ = 110574;
const COLORS = ['#e8573a', '#2a8fd6', '#3fae49', '#c84fd8', '#e0a91f', '#16a39a', '#d6336c', '#7a5cff'];

const CSS = `
#mates{position:fixed;inset:0;pointer-events:none;z-index:1}
.mate{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;transform:translate(-50%,-100%);display:flex;align-items:center;gap:6px;padding:3px 9px 3px 3px;
  border-radius:20px;background:rgba(20,24,28,.78);color:#fff;font:12px/1.2 system-ui,sans-serif;white-space:nowrap;will-change:transform}
.mate::after{content:'';position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-top-color:rgba(20,24,28,.78);border-bottom:0}
.mate .av{width:30px;height:30px;border-radius:50%;border:2px solid var(--c);background:#ddd center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:17px;flex:none}
.mate b{display:block;font-size:13px}.mate small{opacity:.8}
.mate.far{padding:2px;background:none}.mate.far::after,.mate.far div{display:none}.mate.far .av{width:24px;height:24px;box-shadow:0 1px 4px rgba(0,0,0,.6)}
body.revealing #mates,body.binoc #mates{display:none}
#mate-menu{position:fixed;z-index:20;background:rgba(20,24,28,.92);color:#fff;border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:4px;
  font:13px system-ui,sans-serif;transform:translate(-50%,8px);box-shadow:0 6px 20px rgba(0,0,0,.4)}
#mate-menu[hidden]{display:none}
#mate-menu b{padding:2px 6px}
#mate-menu button{background:rgba(255,255,255,.1);color:#fff;border:0;border-radius:8px;padding:7px 10px;text-align:left;font:inherit;cursor:pointer}
#mate-menu button:hover{background:rgba(255,255,255,.2)}
`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colorOf = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'teraz' : m < 60 ? `${m} min temu` : `${Math.floor(m / 60)} h temu`; };
const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

export function buildMates({ scene, camera, ground, terrain, demo = false, trail = null, onFocus = () => {} }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const layer = document.createElement('div'); layer.id = 'mates'; document.body.appendChild(layer);
  const mates = new Map();              // user_id -> { fig, el, target, pos, name, avatar, t }
  // trail: { at(s), length } for the made-up hikers
  const v = new THREE.Vector3();
  // a tap on a label: show that hiker (the drone view around them) or open the group's chat in the planner
  const menu = document.createElement('div'); menu.id = 'mate-menu'; menu.hidden = true; document.body.appendChild(menu);
  let menuFor = null;
  layer.addEventListener('click', (e) => {
    const el = e.target.closest('.mate'); if (!el) return;
    e.stopPropagation();
    const id = el.dataset.id, m = mates.get(id); if (!m) return;
    menuFor = id;
    const r = el.getBoundingClientRect();
    menu.style.left = Math.max(90, Math.min(innerWidth - 90, r.left + r.width / 2)) + 'px'; menu.style.top = r.bottom + 'px';
    menu.innerHTML = `<b>${esc(m.name)}</b><button data-a="focus">🎯 Pokaż z drona</button><button data-a="trail">${m.trailOn ? '〰 Ukryj ślad' : '〰 Pokaż ślad przejścia'}</button><button data-a="chat">💬 Czat grupy (planer)</button>`;
    menu.hidden = false;
  });
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) menu.addEventListener(ev, (e) => e.stopPropagation());
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = e.target.closest('button') && e.target.closest('button').dataset.a; if (!a) return;
    const m = mates.get(menuFor);
    menu.hidden = true;
    if (!m) return;
    if (a === 'focus') onFocus(menuFor);
    if (a === 'trail') { m.trailOn = !m.trailOn; m.line.visible = m.trailOn; }
    if (a === 'chat') { try { localStorage.setItem('planner-tab', 'groups'); } catch (err) { /* private mode */ } window.open('planer.html', '_blank'); }
  });
  addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.mate')) menu.hidden = true; });

  // ------------------------------------------------ the sign-in shared with the planner
  let session = null;
  function loadSession() { try { session = JSON.parse(read(AUTH) || 'null'); } catch (e) { session = null; } return session; }
  async function token() {
    if (!loadSession() || !session.access_token) return null;
    if ((session.expires_at || 0) * 1000 > Date.now() + 60000) return session.access_token;
    // expired: refresh it and keep the new one where the planner looks for it
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!r.ok) return null;
    const s = await r.json();
    session = { ...session, ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) };
    try { localStorage.setItem(AUTH, JSON.stringify(session)); } catch (e) { /* private mode */ }
    return session.access_token;
  }
  const get = async (path, tk) => { const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${tk}` } }); if (!r.ok) throw new Error(r.status); return r.json(); };

  let lookCol = true;
  const profiles = new Map();
  async function poll() {
    const gid = read(GROUP);
    if (!URL_ || !KEY || !gid) return;
    let tk;
    try { tk = await token(); } catch (e) { return; }
    if (!tk) return;
    try {
      const me = session.user && session.user.id;
      const rows = (await get(`live_positions?group_id=eq.${gid}&select=user_id,lat,lon,updated_at`, tk)).filter((r) => r.user_id !== me);
      const need = rows.map((r) => r.user_id).filter((id) => !profiles.has(id));
      if (need.length) {
        let ps;
        try { ps = await get(`profiles?id=in.(${need.join(',')})&select=id,name,avatar${lookCol ? ',look' : ''}`, tk); }
        catch (e) { lookCol = false; ps = await get(`profiles?id=in.(${need.join(',')})&select=id,name,avatar`, tk); }   // no look column yet
        for (const p of ps) profiles.set(p.id, p);
      }
      const seen = new Set();
      for (const r of rows) { seen.add(r.user_id); const p = profiles.get(r.user_id) || { name: 'Turysta' }; place(r.user_id, (r.lon - LON0) * MX, (LAT0 - r.lat) * MZ, Date.parse(r.updated_at), p); }
      for (const id of [...mates.keys()]) if (!seen.has(id)) drop(id);
    } catch (e) { /* offline: try again later */ }
  }

  function place(id, x, z, t, p) {
    if (!terrain.outer.inside(x, z, 30)) { drop(id); return; }          // outside the area of this view
    let m = mates.get(id);
    if (!m) {
      const fig = buildFigure(cleanLook(p.look) || null);
      scene.add(fig.object);
      const el = document.createElement('div'); el.className = 'mate'; el.dataset.id = id;
      el.style.setProperty('--c', colorOf(id));
      layer.appendChild(el);
      // the way walked since this view was opened: a line a little above the ground in the hiker's colour
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: colorOf(id), transparent: true, opacity: 0.85, depthTest: false }));
      line.renderOrder = 4; line.frustumCulled = false; line.visible = true; scene.add(line);
      m = { fig, el, line, trailOn: true, path: [], pos: new THREE.Vector3(x, ground(x, z), z), target: new THREE.Vector3(x, 0, z), t, yaw: 0, html: '' };
      mates.set(id, m);
    }
    m.target.set(x, 0, z); m.t = t; m.name = p.name || 'Turysta';
    m.avatar = p.avatar && p.avatar !== '🥾' ? p.avatar : cleanLook(p.look) ? faceDataUrl(cleanLook(p.look)) : p.avatar || '🥾';
  }
  function drop(id) {
    const m = mates.get(id); if (!m) return;
    scene.remove(m.fig.object, m.line); m.line.geometry.dispose(); m.el.remove(); mates.delete(id);
  }

  // ------------------------------------------------ made-up hikers along the route, a little ahead (?grupa=demo)
  // close together, so that all three are in view at the start even where the trail bends
  const DEMO = [['Ania', 14], ['Marek', 30], ['Kasia', 48]];
  if (demo && trail) DEMO.forEach(([name], i) => profiles.set('demo' + i, { name, look: randomLook(), avatar: '🥾' }));
  function demoTick(hikerS) {
    DEMO.forEach(([, ahead], i) => {
      const p = trail.at(Math.min(trail.length, hikerS + ahead));
      place('demo' + i, p.x + 1.2 * (i - 1), p.z + 0.8 * (i - 1), Date.now() - (i * 2 + 1) * 60000, profiles.get('demo' + i));
    });
  }

  let pollT = 0;
  // every frame: the figures walk to their latest positions at a hiker's pace, the labels follow them
  function update(dt, from, hikerS = 0) {
    if (demo && trail) demoTick(hikerS);
    else if ((pollT -= dt) <= 0) { pollT = 15; poll(); }
    const w = innerWidth, h = innerHeight;
    // the labels stay between the top panel and the buttons at the bottom (on a phone they cover the lower half)
    let top = 0, low = h;
    for (const id of ['hud']) { const e = document.getElementById(id); if (e && e.offsetParent) top = Math.max(top, e.getBoundingClientRect().bottom); }
    for (const id of ['controls', 'bottom']) { const e = document.getElementById(id); if (e && e.offsetParent) { const r = e.getBoundingClientRect(); if (r.top > h * 0.4) low = Math.min(low, r.top); } }
    const shown = [];
    for (const m of mates.values()) {
      const dx = m.target.x - m.pos.x, dz = m.target.z - m.pos.z, d = Math.hypot(dx, dz);
      let speed = 0;
      if (d > 300) m.pos.set(m.target.x, 0, m.target.z);                // far off: jump there
      else if (d > 0.3) { speed = Math.min(d, Math.max(1.2, d / 8)); const k = Math.min(1, speed * dt / d); m.pos.x += dx * k; m.pos.z += dz * k; m.yaw = Math.atan2(dx, dz); }
      m.pos.y = ground(m.pos.x, m.pos.z);
      const o = m.fig.object;
      o.position.copy(m.pos);
      o.rotation.y += Math.atan2(Math.sin(m.yaw - o.rotation.y), Math.cos(m.yaw - o.rotation.y)) * Math.min(1, dt * 4);
      m.fig.animate(dt, speed);
      // a point of the trail every 4 m walked (up to 600)
      const last = m.path[m.path.length - 1];
      if (!last || Math.hypot(last.x - m.pos.x, last.z - m.pos.z) > 4) {
        m.path.push(new THREE.Vector3(m.pos.x, m.pos.y + 0.25, m.pos.z));
        if (m.path.length > 600) m.path.shift();
        if (m.path.length > 1) { m.line.geometry.dispose(); m.line.geometry = new THREE.BufferGeometry().setFromPoints([...m.path, new THREE.Vector3(m.pos.x, m.pos.y + 0.25, m.pos.z)]); }
      }
      // the label over the head
      const dist = from.distanceTo(m.pos);
      o.visible = dist < 1500;
      v.set(m.pos.x, m.pos.y + 2.1 + dist * 0.004, m.pos.z).project(camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) { m.el.style.display = 'none'; continue; }
      m.el.style.display = '';
      const far = dist > 1200;
      const av = m.avatar.startsWith('data:') ? `<i class="av" style="background-image:url(${m.avatar})"></i>` : `<i class="av">${esc(m.avatar)}</i>`;
      const html = far ? av : `${av}<div><b>${esc(m.name)}</b><small>${dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1) + ' km'} · ${ago(m.t)}</small></div>`;
      if (html !== m.html) { m.el.innerHTML = html; m.html = html; m.el.classList.toggle('far', far); }
      const half = far ? 14 : 70;                                     // kept on the screen at its edges
      shown.push({ m, dist, x: Math.max(half, Math.min(w - half, (v.x + 1) / 2 * w)), y: (1 - v.y) / 2 * h, lw: m.el.offsetWidth || 2 * half, lh: m.el.offsetHeight || 36 });
      m.el.title = m.name;
    }
    // the nearest first; a label that would cover one already placed goes up above it
    shown.sort((a, b) => a.dist - b.dist);
    const placed = [];
    for (const L of shown) {
      L.y = Math.max(top + L.lh + 4, Math.min(low - 8, L.y));
      for (let k = 0; k < 6; k++) {
        const o = placed.find((P) => Math.abs(P.x - L.x) < (P.lw + L.lw) / 2 + 2 && Math.abs(P.y - L.y) < (P.lh + L.lh) / 2 + 2);
        if (!o) break;
        L.y = o.y - o.lh - 6;
      }
      placed.push(L);
      L.m.el.style.transform = `translate(${L.x.toFixed(1)}px,${L.y.toFixed(1)}px) translate(-50%,-100%)`;
    }
  }
  return { update, pos: (id) => mates.get(id)?.pos || null, get count() { return mates.size; }, list: () => [...mates.entries()].map(([id, m]) => ({ id, name: m.name, x: m.pos.x, z: m.pos.z })) };
}
