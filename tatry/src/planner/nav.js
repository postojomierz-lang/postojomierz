// On the trail: GPS position on the map, how far and how long to the destination along the planned
// route (by the same walking-time norms, corrected by your own pace so far), a warning when you leave
// the route, and a record of the walk (saved in the journal, the best run becomes the 3D view's ghost,
// the track can be saved as GPX). The screen is kept on while navigating: in the background the
// browser pauses the GPS.
import L from 'leaflet';
import { fmtTime } from './graph.js';

export function setupNav({ map, G, data, route, $, onFinish, sunset = () => null, onPosition = () => {}, onStop = () => {} }) {
  const hm = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const V = data.v;
  const me = L.marker([0, 0], { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: 'me', iconSize: null }) });
  const accCircle = L.circle([0, 0], { radius: 1, color: '#1f6fd1', weight: 1, fillOpacity: 0.12, interactive: false });
  const trackLine = L.polyline([], { color: '#1f6fd1', weight: 4, opacity: 0.8, interactive: false });
  let nav = null;

  // the planned route as metres (local) with the walking time and distance to every vertex
  function tables() {
    const r = route();
    if (!r.path) return null;
    const P = r.path, n = P.length;
    const xs = new Float64Array(n), zs = new Float64Array(n), cumD = new Float64Array(n), cumT = new Float64Array(n);
    for (let k = 0; k < n; k++) { xs[k] = V[P[k]][0] * G.mx; zs[k] = V[P[k]][1] * G.mz; }
    for (let k = 1; k < n; k++) {
      const d = G.dist(P[k - 1], P[k]);
      const w = (G.adj[P[k - 1]].find((x) => x[0] === P[k]) || [0, 0])[1];
      cumD[k] = cumD[k - 1] + d;
      cumT[k] = cumT[k - 1] + (isFinite(w) && w > 0 ? w : d / 5500 * 60);
    }
    return { P, xs, zs, cumD, cumT, n };
  }

  // nearest point of the route: segment index, fraction, distance (m); near the last one if on track
  function project(T, x, z, lastK) {
    let best = { d: Infinity, k: 0, f: 0 };
    const scan = (k0, k1) => {
      for (let k = Math.max(0, k0); k < Math.min(T.n - 1, k1); k++) {
        const ax = T.xs[k], az = T.zs[k], bx = T.xs[k + 1] - ax, bz = T.zs[k + 1] - az;
        const L2 = bx * bx + bz * bz || 1;
        const f = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / L2));
        const d = Math.hypot(x - ax - bx * f, z - az - bz * f);
        if (d < best.d) best = { d, k, f };
      }
    };
    if (lastK >= 0) scan(lastK - 30, lastK + 300);
    if (best.d > 80) { const near = best; best = { d: Infinity, k: 0, f: 0 }; scan(0, T.n); if (near.d < best.d + 20) best = near; }
    return best;
  }

  function wake() {
    if (!nav || !('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then((l) => { nav.lock = l; }).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (nav && document.visibilityState === 'visible') wake(); });

  function start() {
    if (!navigator.geolocation) { alert('Ta przeglądarka nie udostępnia lokalizacji.'); return; }
    nav = { T: tables(), track: [], t0: Date.now(), dist: 0, up: 0, lastH: null, lastK: -1, off: false, follow: true, trace: [], maxS: 0 };
    nav.watch = navigator.geolocation.watchPosition(onFix, (e) => show(`GPS: ${e.message}`),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
    wake();
    trackLine.setLatLngs([]).addTo(map);
    $('nav').hidden = false;
    $('nav-follow').classList.add('on');
    show('Szukam sygnału GPS… Nie wygaszaj ekranu: w tle przeglądarka wstrzymuje GPS.');
  }

  function show(extra) {
    const big = $('nav-big'), row = $('nav-row');
    const el = (Date.now() - nav.t0) / 1000;
    const clock = `${Math.floor(el / 3600)}:${String(Math.floor(el / 60) % 60).padStart(2, '0')}`;
    if (nav.T && nav.left) {
      const L1 = nav.left;
      const eta = new Date(Date.now() + L1.tMin * 60000);
      big.innerHTML = `<div><b>${(L1.d / 1000).toFixed(1)} km</b> <span>do celu</span></div>`
        + `<div><b>${fmtTime(L1.tMin)}</b> <span>ETA ${hm(eta)}</span></div>`;
      const ss = sunset();
      if (ss) big.innerHTML += `<div><span>zachód ${hm(ss)}${eta > ss ? ' · <b style="color:#c8201c;font-size:14px">po zmroku!</b>' : ''}</span></div>`;
    } else {
      big.innerHTML = `<div><b>${(nav.dist / 1000).toFixed(2)} km</b> <span>przebyte</span></div><div><b>${clock}</b> <span>w drodze</span></div>`;
    }
    const alt = nav.alt != null ? `⛰ ${Math.round(nav.alt)} m` : '';
    const acc = nav.acc != null ? `± ${Math.round(nav.acc)} m` : '';
    row.textContent = [nav.T ? `${(nav.dist / 1000).toFixed(2)} km · ${clock} w drodze` : '', `↗ ${Math.round(nav.up)} m`, alt, acc, nav.pace ? `tempo ×${nav.pace.toFixed(2)}` : '', extra || '']
      .filter(Boolean).join(' · ');
  }

  function onFix(p) {
    const { latitude: lat, longitude: lon, accuracy: acc, altitude } = p.coords;
    const now = Date.now();
    nav.acc = acc;
    me.setLatLng([lat, lon]).addTo(map);
    accCircle.setLatLng([lat, lon]).setRadius(acc).addTo(map);
    if (nav.follow) map.setView([lat, lon], Math.max(map.getZoom(), 15), { animate: true });
    // height: the trail network's (lidar) where you are on a trail, else the GPS's
    const v = G.snap(lon, lat, 60);
    nav.alt = v >= 0 ? G.H[v] : altitude;
    if (acc > 60) { show('słaby sygnał GPS'); return; }
    onPosition({ lat, lon, alt: nav.alt, acc });
    const last = nav.track[nav.track.length - 1];
    const x = lon * G.mx, z = lat * G.mz;
    if (last) {
      const d = Math.hypot(x - last[2] * G.mx, z - last[1] * G.mz);
      if (d < Math.max(5, acc * 0.5)) { show(); return; }        // standing still: GPS jitter
      nav.dist += d;
    }
    nav.track.push([now, lat, lon, nav.alt ?? null]);
    trackLine.addLatLng([lat, lon]);
    if (nav.alt != null) {
      if (nav.lastH == null) nav.lastH = nav.alt;
      else if (nav.alt - nav.lastH > 3) { nav.up += nav.alt - nav.lastH; nav.lastH = nav.alt; }
      else if (nav.lastH - nav.alt > 3) nav.lastH = nav.alt;
    }
    let warn = '';
    if (nav.T) {
      const T = nav.T, q = project(T, x, z, nav.lastK);
      nav.lastK = q.k;
      const s = T.cumD[q.k] + (T.cumD[q.k + 1] - T.cumD[q.k]) * q.f;
      const tDone = T.cumT[q.k] + (T.cumT[q.k + 1] - T.cumT[q.k]) * q.f;
      const el = (now - nav.t0) / 60000;
      // your pace against the norms, once there is enough of the walk to tell (15 min, 1 km)
      nav.pace = el > 15 && s > 1000 && tDone > 5 ? Math.max(0.5, Math.min(2, el / tDone)) : null;
      nav.left = { d: T.cumD[T.n - 1] - s, tMin: (T.cumT[T.n - 1] - tDone) * (nav.pace || 1) };
      if (q.d < 60) { nav.maxS = Math.max(nav.maxS, s); nav.trace.push([Math.round((now - nav.t0) / 1000), Math.round(s)]); }
      const off = q.d > Math.max(45, acc * 1.5);
      if (off) warn = `Poza trasą: ${Math.round(q.d)} m od szlaku`;
      if (off && !nav.off && navigator.vibrate) navigator.vibrate([300, 150, 300]);
      nav.off = off;
      if (nav.left.d < 30) warn = '🏁 Jesteś u celu!';
    }
    $('nav-warn').hidden = !warn; $('nav-warn').textContent = warn;
    show();
  }

  function stop() {
    if (!nav) return;
    navigator.geolocation.clearWatch(nav.watch);
    if (nav.lock) nav.lock.release().catch(() => {});
    me.remove(); accCircle.remove();
    $('nav').hidden = true;
    onStop();
    const n = nav; nav = null;
    if (n.track.length > 3) onFinish({
      time: (Date.now() - n.t0) / 1000, dist: n.dist, up: Math.round(n.up), track: n.track, trace: n.trace,
      completed: !!n.T && n.T.cumD[n.T.n - 1] - n.maxS < 150,
    });
    else trackLine.remove();
  }

  map.on('dragstart', () => { if (nav) { nav.follow = false; $('nav-follow').classList.remove('on'); } });
  $('nav-follow').onclick = () => { if (!nav) return; nav.follow = !nav.follow; $('nav-follow').classList.toggle('on', nav.follow); };
  $('nav-stop').onclick = () => { if (confirm('Zakończyć nawigację i zapisać przejście w dzienniku?')) stop(); };
  return { start, stop, active: () => !!nav, clearTrack: () => trackLine.remove() };
}

// the recorded track as GPX
export function trackGpx(track, name) {
  const pts = track.map(([t, lat, lon, ele]) => `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${ele != null ? `<ele>${ele.toFixed(1)}</ele>` : ''}<time>${new Date(t).toISOString()}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Tatry planer" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${name}</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>\n`;
}
