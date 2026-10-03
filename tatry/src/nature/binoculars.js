// A scene from the life of the animals seen through binoculars: after the notice the hiker raises the
// binoculars to the eyes (the binoculars come up from below and fill the view), the view zooms in on the
// scene and follows it while it lasts (a chase, the eagle's dive, the boars rooting, a trout jumping),
// with a slight shake of the hands; a tap, Esc or the end of the scene lowers them again.
import * as THREE from 'three';

const CSS = `
#bn{position:fixed;inset:0;z-index:8990;pointer-events:none;visibility:hidden}
#bn.on{pointer-events:auto;visibility:visible}
#bn.on.manual{pointer-events:none}#bn.manual .cap{pointer-events:auto}
#bn svg.mask{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .25s}
#bn.view svg.mask{opacity:1}
#bn .body{position:absolute;left:50%;bottom:0;width:min(92vw,560px);transform:translate(-50%,105%) scale(1);transform-origin:50% 35%;
  transition:transform .75s cubic-bezier(.4,0,.3,1),opacity .25s;opacity:1}
#bn.up .body{transform:translate(-50%,calc(-50vh + 45%)) scale(3.2)}
#bn.view .body{opacity:0}
#bn .cap{position:absolute;left:50%;bottom:max(18px,4vh);transform:translateX(-50%);max-width:88vw;padding:8px 14px;border-radius:10px;
  background:rgba(0,0,0,.55);color:#fff;font:600 15px/1.35 system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .4s}
#bn.view .cap{opacity:1}
#bn .cap small{display:block;font-weight:400;opacity:.75;font-size:12px;margin-top:2px}
body.binoc #labels,body.binoc #toast,body.binoc #place,body.binoc #hud,body.binoc #controls,body.binoc #bottom,body.binoc #fps,
body.binoc #label-menu,body.binoc #card{opacity:0!important;visibility:hidden!important;pointer-events:none}
`;
// the binoculars seen from behind, held in two hands: two barrels with the eyepieces, the hinge between
const BODY = `<svg class="body" viewBox="0 0 400 230" aria-hidden="true">
  <defs><linearGradient id="bnb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3a3f44"/><stop offset="1" stop-color="#16191c"/></linearGradient>
  <radialGradient id="bne" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#2b3a4a"/><stop offset=".7" stop-color="#0b1015"/><stop offset="1" stop-color="#000"/></radialGradient></defs>
  <path d="M18 230 C10 170 30 120 70 112 L120 110 L130 230Z" fill="#c99a7a"/><path d="M382 230 C390 170 370 120 330 112 L280 110 L270 230Z" fill="#c99a7a"/>
  <rect x="40" y="40" width="140" height="170" rx="48" fill="url(#bnb)"/><rect x="220" y="40" width="140" height="170" rx="48" fill="url(#bnb)"/>
  <rect x="170" y="70" width="60" height="44" rx="14" fill="#25292d"/><circle cx="200" cy="92" r="11" fill="#3d4349"/>
  <circle cx="110" cy="84" r="44" fill="#0d0f11"/><circle cx="110" cy="84" r="34" fill="url(#bne)"/>
  <circle cx="290" cy="84" r="44" fill="#0d0f11"/><circle cx="290" cy="84" r="34" fill="url(#bne)"/>
  <path d="M60 150 C90 135 130 135 160 150" stroke="#000" stroke-opacity=".35" stroke-width="5" fill="none"/>
  <path d="M240 150 C270 135 310 135 340 150" stroke="#000" stroke-opacity=".35" stroke-width="5" fill="none"/>
</svg>`;

export function buildBinoculars({ camera, onStart = () => {}, onEnd = () => {} }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement('div'); el.id = 'bn';
  el.innerHTML = `${BODY}<svg class="mask" aria-hidden="true"><defs><filter id="bnf" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur class="blur"/></filter>
    <mask id="bnm"><rect width="100%" height="100%" fill="#fff"/><g filter="url(#bnf)"><circle class="h1" fill="#000"/><circle class="h2" fill="#000"/></g></mask></defs>
    <rect width="100%" height="100%" fill="#000" mask="url(#bnm)"/></svg>
    <div class="cap"></div>`;
  document.body.appendChild(el);
  const cap = el.querySelector('.cap');
  function layout() {
    // two round fields overlapping, soft at the edge (one blurred mask: no darker seam where they meet)
    const w = innerWidth, h = innerHeight, r = Math.min(w * 0.34, h * 0.38), dx = r * 0.6;
    for (const [cls, x] of [['h1', w / 2 - dx], ['h2', w / 2 + dx]]) {
      const c = el.querySelector('.' + cls); c.setAttribute('cx', x); c.setAttribute('cy', h / 2); c.setAttribute('r', r * 0.94);
    }
    el.querySelector('.blur').setAttribute('stdDeviation', r * 0.06);
  }
  layout(); addEventListener('resize', layout);

  let cur = null, lastEnd = -1e9;
  const tmp = new THREE.Vector3(), aim = new THREE.Vector3(), m4 = new THREE.Matrix4(), qLook = new THREE.Quaternion();
  const ease = (x) => x * x * (3 - 2 * x);

  function centre(f, out) {
    out.set(0, 0, 0); let n = 0;
    const ps = [];
    for (const o of f.objs) { if (!o || !o.parent || !o.visible) continue; o.getWorldPosition(tmp); out.add(tmp); ps.push(tmp.clone()); n++; }
    if (!n) return false;
    out.multiplyScalar(1 / n);
    // the hunters and the hunted all in the view: as wide as they are spread
    let spread = 0; for (const p of ps) spread = Math.max(spread, p.distanceTo(out));
    f.span = Math.max(f.size, spread * 2.4);
    out.y += f.size * 0.35;
    return true;
  }
  // focus: { objs: [Object3D], size: metres, dur: seconds the scene lasts at most }
  function start(text, focus) {
    if (cur && cur.manual) return false;                // looking around oneself: only the notice
    if (cur) {                                           // the scene goes on (the catch after the chase): follow it
      if (cur.phase !== 'down') { cap.innerHTML = `${text}<small>stuknij, aby opuścić lornetkę</small>`; if (focus) { cur.f = focus; cur.t = Math.min(cur.t, 2); } }
      return true;
    }
    if (!focus || !centre(focus, aim)) return false;
    cur = { f: focus, phase: 'up', t: 0, fov0: camera.fov, near0: camera.near, look: aim.clone(), lost: 0, max: focus.dur || 9 };
    cap.innerHTML = `${text}<small>stuknij, aby opuścić lornetkę</small>`;
    el.classList.add('on'); document.body.classList.add('binoc');
    requestAnimationFrame(() => el.classList.add('up'));
    onStart();
    return true;
  }
  // the binoculars on demand (🔭, two fingers apart): the hiker looks around (dragging the view) at a
  // zoom of 2-12x, changed with two fingers or the mouse wheel; 🔭, Esc or ✕ lowers them
  const capManual = () => { cap.innerHTML = `🔭 Lornetka · ${Math.round(cur.zoom)}×<small>przeciągaj, by się rozglądać · dwa palce: przybliżenie · <b class="x" style="cursor:pointer;pointer-events:auto;display:inline-block;margin:4px 0 0 4px;padding:6px 12px;border-radius:14px;background:rgba(255,255,255,.18)">✕ opuść</b></small>`; };
  function startManual(zoom = 6) {
    if (cur) return;
    cur = { manual: true, zoom, phase: 'up', t: 0, fov0: camera.fov, near0: camera.near };
    el.classList.add('on', 'manual'); document.body.classList.add('binoc');
    capManual();
    requestAnimationFrame(() => el.classList.add('up'));
    onStart();
  }
  function setZoom(z) {
    if (!cur || !cur.manual) return;
    const nz = THREE.MathUtils.clamp(z, 2, 12);
    if (Math.round(nz) !== Math.round(cur.zoom)) { cur.zoom = nz; capManual(); } else cur.zoom = nz;
  }
  function stop() {
    if (!cur || cur.phase === 'down') return;
    cur.phase = 'down'; cur.t = 0; cur.fovFrom = camera.fov; cur.qFrom = camera.quaternion.clone();
    el.classList.remove('view', 'up');
  }
  function abort() {                                    // at once, e.g. a discovery's camera takes over
    if (!cur) return;
    camera.fov = cur.fov0; camera.near = cur.near0; camera.updateProjectionMatrix();
    el.classList.remove('on', 'view', 'up', 'manual'); document.body.classList.remove('binoc');
    cur = null; lastEnd = performance.now(); onEnd();
  }
  el.addEventListener('click', (e) => { e.stopPropagation(); if (!cur || !cur.manual || e.target.closest('.x')) stop(); });
  addEventListener('keydown', (e) => { if (cur && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) { e.stopPropagation(); stop(); } }, true);

  // every frame after the walk camera is set: turns it to the scene and zooms in
  function apply(dt) {
    if (!cur) return;
    const c = cur;
    c.t += dt;
    if (c.phase === 'down') {
      const k = ease(Math.min(1, c.t / 0.6));
      const walkQ = camera.quaternion.clone();
      camera.quaternion.slerpQuaternions(c.qFrom, walkQ, k);
      camera.fov = c.fovFrom + (c.fov0 - c.fovFrom) * k; camera.near = c.near0; camera.updateProjectionMatrix();
      if (k >= 1) abort();
      return;
    }
    if (c.manual) {
      // the view stays where the hiker turns it; only the zoom (and the near focus limit)
      const want = c.fov0 / c.zoom;
      camera.near = Math.max(c.near0, Math.min(6, c.zoom * 0.5));
      if (c.phase === 'up') {
        const k = ease(Math.min(1, c.t / 0.8));
        camera.fov = c.fov0 + (want - c.fov0) * k;
        if (c.t >= 0.75) el.classList.add('view');
        if (c.t >= 0.8) { c.phase = 'watch'; c.t = 0; }
      } else camera.fov += (want - camera.fov) * (1 - Math.exp(-dt * 6));
      camera.updateProjectionMatrix();
      return;
    }
    if (centre(c.f, aim)) c.lost = 0; else c.lost += dt;
    // follow the scene smoothly, as a hand does
    c.look.lerp(aim, 1 - Math.exp(-dt * 3.5));
    const d = Math.max(1, camera.position.distanceTo(c.look));
    const tt = performance.now() / 1000;
    const shake = 0.0016 * d;
    tmp.set(c.look.x + Math.sin(tt * 1.7) * shake, c.look.y + Math.sin(tt * 2.3 + 1) * shake * 0.7, c.look.z + Math.cos(tt * 1.3) * shake);
    m4.lookAt(camera.position, tmp, camera.up); qLook.setFromRotationMatrix(m4);
    // zoom: the scene a few of its sizes high in the view, like 8-12x binoculars
    const want = THREE.MathUtils.clamp(2 * Math.atan((c.f.span || c.f.size) * 3.2 / 2 / d) * 180 / Math.PI, c.fov0 / 14, c.fov0 / 3);
    // binoculars do not focus up close: the bushes right in front would only be green blobs
    camera.near = Math.max(c.near0, Math.min(6, d * 0.06));
    if (c.phase === 'up') {
      const k = ease(Math.min(1, c.t / 0.8));
      camera.quaternion.slerp(qLook, k);
      camera.fov = c.fov0 + (want - c.fov0) * k;
      if (c.t >= 0.75) el.classList.add('view');
      if (c.t >= 0.8) { c.phase = 'watch'; c.t = 0; }
    } else {
      camera.quaternion.copy(qLook);
      camera.fov += (want - camera.fov) * (1 - Math.exp(-dt * 2));
      if (c.t >= c.max || c.lost > 1) stop();
    }
    camera.updateProjectionMatrix();
  }
  const ready = () => !cur && performance.now() - lastEnd > 20000;
  return { start, startManual, setZoom, stop, abort, apply, ready, get active() { return !!cur; }, get manual() { return !!(cur && cur.manual); },
    get zoom() { return cur ? cur.fov0 / camera.fov : 1; }, get manualZoom() { return cur && cur.manual ? cur.zoom : 0; } };
}
