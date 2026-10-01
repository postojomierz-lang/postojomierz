// The moment of a discovery: the camera leaves the hiker's eyes and glides up to the plant or animal,
// time slows almost to a stop ("bullet time") while the camera turns slowly around it, then the card
// comes up with the photo, the name and the rarity, the points count up and fly to the score, a badge pops
// for a challenge done; tap (or wait) and the camera glides back and the walk goes on.
// Animals are followed where they really are (the 3D model nearby), plants and the rest at their spot.
import * as THREE from 'three';
import { GROUPS, RARITY } from './catalog.js';

const CSS = `
#rv-bars{position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;transition:opacity .5s}
#rv-bars.on{opacity:1}
#rv-bars:before,#rv-bars:after{content:"";position:absolute;left:0;right:0;height:9vh;background:#000}
#rv-bars:before{top:0}#rv-bars:after{bottom:0}
#rv-vig{position:fixed;inset:0;pointer-events:none;z-index:39;opacity:0;transition:opacity .6s;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%)}
#rv-vig.on{opacity:1}
#rv-tag{position:fixed;left:50%;top:13vh;transform:translate(-50%,-10px);z-index:41;color:#fff;font:600 13px system-ui,sans-serif;letter-spacing:.25em;text-transform:uppercase;opacity:0;transition:all .5s;text-shadow:0 1px 6px #000}
#rv-tag.on{opacity:.9;transform:translate(-50%,0)}
#rv-card{position:fixed;left:50%;bottom:11vh;z-index:42;width:min(380px,calc(100% - 24px));transform:translate(-50%,40px) scale(.96);opacity:0;transition:all .45s cubic-bezier(.2,.9,.3,1.2);
  background:rgba(20,24,28,.92);color:#fff;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.5);font:14px/1.4 system-ui,sans-serif;pointer-events:auto;cursor:pointer}
#rv-card.on{opacity:1;transform:translate(-50%,0) scale(1)}
#rv-card img{width:100%;height:150px;object-fit:cover;display:block}
#rv-card .b{padding:10px 14px 12px}
#rv-card .g{font-size:12px;opacity:.75;letter-spacing:.05em}
#rv-card .n{font-size:20px;font-weight:700;margin:2px 0 0}
#rv-card .l{font-style:italic;opacity:.8}
#rv-card .row{display:flex;align-items:center;gap:10px;margin-top:8px}
#rv-card .stars{color:#ffcf3a;font-size:16px;letter-spacing:2px}
#rv-card .rar{font-size:12px;opacity:.85}
#rv-card .pts{margin-left:auto;font-size:26px;font-weight:800;color:#ffcf3a;text-shadow:0 0 12px rgba(255,200,40,.5)}
#rv-card .bonus{margin-top:8px;padding:6px 8px;border-radius:8px;background:rgba(255,207,58,.15);border:1px solid rgba(255,207,58,.4);font-size:13px;display:none;animation:rvpop .5s cubic-bezier(.2,.9,.3,1.4)}
#rv-card .hint{font-size:11px;opacity:.55;margin-top:6px;text-align:right}
@keyframes rvpop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
.rv-coin{position:fixed;z-index:43;font-size:22px;pointer-events:none;transition:transform .9s cubic-bezier(.5,-0.3,.6,1),opacity .9s;will-change:transform}
.rv-burst{position:fixed;z-index:43;pointer-events:none;font-size:18px;animation:rvburst 1s ease-out forwards}
body.revealing #labels,body.revealing #toast,body.revealing #place,body.revealing #hud,body.revealing #controls,body.revealing #bottom,body.revealing #fps{opacity:0!important;pointer-events:none;transition:opacity .3s}
@keyframes rvburst{0%{transform:translate(0,0) scale(.4);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1);opacity:0}}`;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function buildReveal({ camera, groundAt, findAnimal = () => null, scoreEl = null, onEnd = () => {} }) {
  if (!document.getElementById('rv-css')) { const st = document.createElement('style'); st.id = 'rv-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
  const bars = el('rv-bars'), vig = el('rv-vig'), tag = el('rv-tag'), card = el('rv-card');
  let photos = null;
  fetch('nature/photos.json').then((r) => r.json()).then((j) => { photos = j; }).catch(() => { photos = {}; });

  const queue = [];
  let cur = null;                                   // the running reveal
  const P0 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), tmp = new THREE.Vector3(), M = new THREE.Matrix4();
  const lookQ = (from, to) => { M.lookAt(from, to, THREE.Object3D.DEFAULT_UP); return new THREE.Quaternion().setFromRotationMatrix(M); };

  // species: the catalogue entry; pos: {x,y,z} of the spot; pts: the points it is worth
  function start(species, pos, pts) {
    queue.push({ species, pos: new THREE.Vector3(pos.x, pos.y, pos.z), pts });
    if (!cur) next();
  }
  function next() {
    const r = queue.shift();
    if (!r) { cur = null; return; }
    const s = r.species, fauna = s.kind === 'fauna', bird = s.group === 'bird';
    r.obj = fauna ? findAnimal(s.id, r.pos) : null;           // the live animal, if there is one near
    r.dist = bird ? 9 : fauna ? (r.obj ? 5.5 : 4) : 1.6;
    r.t = 0; r.phase = 'in'; r.bonus = []; r.coins = false;
    cur = r;
    bars.classList.add('on'); vig.classList.add('on'); document.body.classList.add('revealing');
    tag.textContent = '✦ Odkrycie ✦'; tag.classList.add('on');
  }
  function target(r) {
    if (r.obj) {
      r.obj.getWorldPosition(tmp);
      return tmp.clone().add(new THREE.Vector3(0, r.species.group === 'bird' ? 0.1 : 0.5, 0));
    }
    const g = groundAt(r.pos.x, r.pos.z);
    return new THREE.Vector3(r.pos.x, (g ?? r.pos.y) + (r.species.kind === 'flora' ? 0.15 : 0.4), r.pos.z);
  }
  function showCard(r) {
    const s = r.species, rar = RARITY[s.rarity], ph = photos && photos[s.id];
    card.innerHTML = (ph ? `<img src="nature/${s.id}.jpg" alt="">` : '')
      + `<div class="b"><div class="g">${GROUPS[s.group].icon} ${GROUPS[s.group].name}</div>`
      + `<div class="n">${s.name}</div><div class="l">${s.latin}</div>`
      + `<div class="row"><span class="stars">${'★'.repeat(s.rarity)}${'☆'.repeat(4 - s.rarity)}</span><span class="rar">${rar.name}</span><span class="pts">+0</span></div>`
      + `<div class="bonus"></div><div class="hint">stuknij, by iść dalej</div></div>`;
    card.classList.add('on');
    // the points count up, then fly to the score
    const ptsEl = card.querySelector('.pts');
    const t0 = performance.now(), dur = 900;
    const step = () => {
      const f = Math.min(1, (performance.now() - t0) / dur);
      ptsEl.textContent = `+${Math.round(r.pts * ease(f))}`;
      if (f < 1) requestAnimationFrame(step); else coins(ptsEl, r.species.rarity);
    };
    setTimeout(step, 350);
    for (const b of r.bonus) addBonusEl(b);
  }
  // a burst of stars from the points and a few coins flying to the score button
  function coins(from, rarity) {
    const a = from.getBoundingClientRect(), cx = a.left + a.width / 2, cy = a.top + a.height / 2;
    for (let k = 0; k < 6 + rarity * 3; k++) {
      const b = document.createElement('div'); b.className = 'rv-burst'; b.textContent = k % 3 ? '✦' : '⭐';
      const ang = Math.random() * 6.28, d = 40 + Math.random() * 70;
      b.style.left = `${cx}px`; b.style.top = `${cy}px`; b.style.setProperty('--dx', `${Math.cos(ang) * d}px`); b.style.setProperty('--dy', `${Math.sin(ang) * d}px`);
      b.style.color = '#ffcf3a'; document.body.appendChild(b); setTimeout(() => b.remove(), 1100);
    }
    const goal = scoreEl ? scoreEl.getBoundingClientRect() : { left: innerWidth - 60, top: 20, width: 30, height: 30 };
    for (let k = 0; k < 5; k++) {
      const c = document.createElement('div'); c.className = 'rv-coin'; c.textContent = '🪙';
      c.style.left = `${cx}px`; c.style.top = `${cy}px`; document.body.appendChild(c);
      setTimeout(() => {
        c.style.transform = `translate(${goal.left + goal.width / 2 - cx}px, ${goal.top + goal.height / 2 - cy}px) scale(.5)`; c.style.opacity = '0.2';
      }, 60 + k * 90);
      setTimeout(() => c.remove(), 1200 + k * 90);
    }
    if (scoreEl) { scoreEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 500, delay: 900 }); }
  }
  function addBonusEl(b) {
    const box = card.querySelector('.bonus');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML += `<div>🏅 ${b.text} <b style="color:#ffcf3a">+${b.pts}</b></div>`;
  }
  // a challenge done or a badge with this find: shown on the card
  function bonus(text, pts) {
    if (!cur) return false;
    cur.bonus.push({ text, pts });
    if (cur.phase === 'card') addBonusEl({ text, pts });
    return true;
  }
  function leave() {
    if (!cur || cur.phase === 'out') return;
    cur.phase = 'out'; cur.t = 0;
    card.classList.remove('on'); tag.classList.remove('on');
  }
  card.addEventListener('click', leave);
  addEventListener('keydown', (e) => { if (cur && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { e.stopPropagation(); leave(); } }, true);

  // called every frame after the walk camera is set: overrides it during a reveal; returns the time scale
  function apply(dt) {
    if (!cur) return 1;
    const r = cur;
    r.t += dt;
    const home = { p: camera.position.clone(), q: camera.quaternion.clone() };
    if (!r.started) { r.started = true; P0.copy(home.p); Q0.copy(home.q); }
    const T = target(r);
    // the viewpoint: towards the subject from where the hiker stands, at `dist`, a little above it,
    // turning slowly around it while time stands still
    const flat = new THREE.Vector3(P0.x - T.x, 0, P0.z - T.z).normalize();
    r.orbit = (r.orbit || 0) + dt * (r.phase === 'in' ? 0.05 : 0.18);
    const ang = Math.atan2(flat.x, flat.z) + r.orbit;
    const V = new THREE.Vector3(T.x + Math.sin(ang) * r.dist, 0, T.z + Math.cos(ang) * r.dist);
    const g = groundAt(V.x, V.z);
    V.y = Math.max((g ?? T.y) + 0.8, T.y + r.dist * 0.12);
    // the subject sits in the upper part of the frame: the card comes up below it
    const aim = T.clone(); aim.y -= r.dist * 0.32;
    const qV = lookQ(V, aim);
    let k, ts;
    if (r.phase === 'in') {
      k = ease(Math.min(1, r.t / 1.3));
      ts = 1 - 0.94 * k;
      if (r.t >= 1.3) { r.phase = 'hold'; r.t = 0; }
    } else if (r.phase === 'hold') {
      k = 1; ts = 0.06;
      if (r.t >= 1.4) { r.phase = 'card'; r.t = 0; showCard(r); }
    } else if (r.phase === 'card') {
      k = 1; ts = 0.12;
      if (r.t >= 7) leave();
    } else {
      k = 1 - ease(Math.min(1, r.t / 1.0));
      ts = 1 - 0.88 * k;
      if (r.t >= 1.0) {
        bars.classList.remove('on'); vig.classList.remove('on'); document.body.classList.remove('revealing');
        cur = null; onEnd(); next();
        return 1;
      }
    }
    const from = r.phase === 'out' ? home : { p: P0, q: Q0 };
    camera.position.lerpVectors(from.p, V, k);
    camera.quaternion.slerpQuaternions(from.q, qV, k);
    return ts;
  }
  return { start, apply, bonus, leave, get active() { return !!cur; } };
}
