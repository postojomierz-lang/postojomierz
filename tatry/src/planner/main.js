// Route planner for the Polish High Tatras: a 2D map (Leaflet, OpenTopoMap) with the marked trails in
// their colours; click start, destination and stops, the quickest way along the trails is found
// (graph.js), with distance, ascent, PTTK-style time, the elevation profile and the trail sections.
// GPX import (matched onto the trails) and export; the phone's GPS can set the start.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TrailGraph, fmtTime } from './graph.js';
import { loadJournal, saveJournal, routeKey, toggleFav, totals, fmtClock } from '../journal.js';

const $ = (id) => document.getElementById(id);
const COLOUR_PL = { red: 'czerwony', blue: 'niebieski', green: 'zielony', yellow: 'żółty', black: 'czarny', none: 'bez znaków' };

const data = await (await fetch('data/region/trails.json')).json();
const G = new TrailGraph(data);
const C = data.colours;

// ---------------------------------------------------------------- map
const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([49.215, 20.03], 13);
const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17, subdomains: 'abc', attribution: '© OpenStreetMap, SRTM · styl © OpenTopoMap (CC-BY-SA)' }).addTo(map);
const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
L.control.layers({ 'Mapa topograficzna': topo, 'OpenStreetMap': osm }, {}, { position: 'topright' }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);
const [w, s, e, n] = data.region;
map.setMaxBounds([[s - 0.05, w - 0.08], [n + 0.05, e + 0.08]]);

// the trails in their colours; a way with two trails gets the second as a dashed line on top
const trails = L.layerGroup().addTo(map);
const ll = (i) => [data.v[i][1], data.v[i][0]];
for (const ed of data.e) {
  const pts = ed.v.map(ll);
  const c0 = C[ed.c[0]] || '#777';
  L.polyline(pts, { color: '#fff', weight: 6, opacity: 0.7, interactive: false }).addTo(trails);
  L.polyline(pts, { color: c0, weight: 3.5, opacity: 0.95, interactive: false }).addTo(trails);
  if (ed.c[1]) L.polyline(pts, { color: C[ed.c[1]], weight: 3.5, dashArray: '8 8', interactive: false }).addTo(trails);
}
// huts, peaks and passes, more of them as you zoom in: huts and the high peaks first, all peaks at 14,
// passes at 15
const layersAt = { 12: L.layerGroup(), 14: L.layerGroup(), 15: L.layerGroup() };
for (const p of data.poi) {
  if (p.k === 'sign') continue;
  const icon = p.k === 'hut' ? '⌂' : p.k === 'peak' ? '▲' : '⌒';
  const label = `${icon} ${p.n}${p.e ? ' ' + p.e + ' m' : ''}`;
  const z = p.k === 'hut' || (p.k === 'peak' && p.e >= 2150) ? 12 : p.k === 'peak' ? 14 : 15;
  L.marker([p.p[1], p.p[0]], { interactive: false, icon: L.divIcon({ className: 'poi' + (p.k === 'hut' ? ' hut' : ''), html: label, iconSize: null, iconAnchor: [4, 8] }) })
    .addTo(layersAt[z]);
}
const togglePois = () => {
  const zoom = map.getZoom();
  for (const [z, l] of Object.entries(layersAt)) { if (zoom >= +z && !map.hasLayer(l)) l.addTo(map); if (zoom < +z && map.hasLayer(l)) l.remove(); }
};
map.on('zoomend', togglePois); togglePois();

// ---------------------------------------------------------------- route state
let stops = [];              // vertex indices
let path = null, summary = null;
const history = [];
const routeLayer = L.layerGroup().addTo(map);
const markers = L.layerGroup().addTo(map);
const hoverMark = L.circleMarker([0, 0], { radius: 6, color: '#000', weight: 2, fillColor: '#fff', fillOpacity: 1 });

function msg(t) { $('msg').textContent = t || ''; }
function save() { history.push(stops.slice()); if (history.length > 50) history.shift(); }
function setStops(s, remember = true) { if (remember) save(); stops = s; update(); }

map.on('click', (ev) => {
  const v = G.snap(ev.latlng.lng, ev.latlng.lat, 400);
  if (v < 0) { msg('Tu nie ma znakowanego szlaku (w promieniu 400 m). Kliknij bliżej szlaku.'); return; }
  msg('');
  setStops([...stops, v]);
});

function drawMarkers() {
  markers.clearLayers();
  stops.forEach((v, k) => {
    const cls = k === 0 ? 'start' : k === stops.length - 1 ? 'end' : '';
    const m = L.marker(ll(v), { draggable: true, icon: L.divIcon({ className: `wp ${cls}`, html: k === 0 ? 'S' : k === stops.length - 1 && k ? 'M' : String(k), iconSize: null }) });
    m.on('dragend', () => {
      const p = m.getLatLng(), nv = G.snap(p.lng, p.lat, 600);
      if (nv >= 0) { const s = stops.slice(); s[k] = nv; setStops(s); } else drawMarkers();
    });
    m.on('click', () => { const s = stops.slice(); s.splice(k, 1); setStops(s); });
    m.addTo(markers);
  });
}

function update() {
  drawMarkers();
  routeLayer.clearLayers();
  path = null; summary = null;
  $('summary').hidden = true;
  if (stops.length >= 2) {
    path = G.routeVia(stops);
    if (!path) msg('Nie da się połączyć tych punktów szlakami.');
    else {
      summary = G.summary(path);
      for (const sec of summary.sections) {
        const pts = path.slice(sec.start, sec.end + 1).map(ll);
        L.polyline(pts, { color: '#000', weight: 9, opacity: 0.35, interactive: false }).addTo(routeLayer);
        L.polyline(pts, { color: C[sec.colour] || '#777', weight: 5, opacity: 1, interactive: false }).addTo(routeLayer);
      }
      showSummary();
    }
  }
  location.replace('#' + (stops.length ? 'r=' + stops.map((v) => data.v[v][1].toFixed(5) + ',' + data.v[v][0].toFixed(5)).join(';') : ''));
  updateGo();
}

function showSummary() {
  const S = summary;
  $('summary').hidden = false;
  $('s-dist').textContent = (S.dist / 1000).toFixed(1) + ' km';
  $('s-time').textContent = fmtTime(S.time);
  $('s-up').textContent = '↗ ' + Math.round(S.up) + ' m';
  $('s-down').textContent = '↘ ' + Math.round(S.down) + ' m';
  const ul = $('sections'); ul.innerHTML = '';
  // one entry per stretch of the same colour: "from – to" out of the first and last section names
  const merged = [];
  for (const sec of S.sections) {
    if (sec.to - sec.from < 100) continue;          // junction crossings
    const last = merged[merged.length - 1];
    if (last && last.colour === sec.colour) { last.to = sec.to; last.names.push(sec.name); }
    else merged.push({ ...sec, names: [sec.name] });
  }
  for (const sec of merged) {
    const parts = sec.names.filter(Boolean).map((n) => n.split(/\s+[-–]\s+/));
    if (parts.length) sec.name = parts.length === 1 || parts[0].length < 2 ? sec.names.filter(Boolean)[0]
      : `${parts[0][0]} – ${parts[parts.length - 1][parts[parts.length - 1].length - 1]}`;
    const li = document.createElement('li');
    li.innerHTML = `<span class="blaze" style="--c:${C[sec.colour] || '#999'}"></span><span>${COLOUR_PL[sec.colour] || sec.colour}${sec.name ? ' · ' + sec.name : ''}</span><span class="km">${(sec.from / 1000).toFixed(1)}–${(sec.to / 1000).toFixed(1)} km</span>`;
    ul.appendChild(li);
  }
  drawProfile();
}

// ---------------------------------------------------------------- elevation profile
const cv = $('profile');
function drawProfile(hx = -1) {
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const P = summary.profile, D = summary.dist;
  const lo = Math.floor(summary.minE / 100) * 100, hi = Math.ceil(summary.maxE / 100) * 100 + 50;
  const X = (d) => 34 + (W - 42) * d / D, Y = (e) => H - 16 - (H - 26) * (e - lo) / (hi - lo);
  g.font = '10px system-ui'; g.fillStyle = '#6a7178'; g.strokeStyle = '#e2e0da';
  for (let e = lo; e <= hi; e += (hi - lo > 800 ? 200 : 100)) { g.beginPath(); g.moveTo(34, Y(e)); g.lineTo(W - 8, Y(e)); g.stroke(); g.fillText(e, 2, Y(e) + 3); }
  for (let km = 0; km <= D / 1000; km += D > 15000 ? 5 : D > 5000 ? 2 : 1) g.fillText(km + ' km', X(km * 1000) - 8, H - 3);
  // filled area coloured by the trail sections
  for (const sec of summary.sections) {
    g.beginPath(); g.moveTo(X(P[sec.start][0]), Y(lo));
    for (let k = sec.start; k <= sec.end; k++) g.lineTo(X(P[k][0]), Y(P[k][1]));
    g.lineTo(X(P[sec.end][0]), Y(lo)); g.closePath();
    g.fillStyle = (C[sec.colour] || '#999') + '55'; g.fill();
  }
  g.beginPath(); P.forEach(([d, e], k) => (k ? g.lineTo(X(d), Y(e)) : g.moveTo(X(d), Y(e))));
  g.strokeStyle = '#1d2327'; g.lineWidth = 1.5; g.stroke();
  if (hx >= 0) {
    g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(P[hx][0]), 4); g.lineTo(X(P[hx][0]), H - 16); g.stroke();
    g.fillStyle = '#000'; g.fillText(`${Math.round(P[hx][1])} m · ${(P[hx][0] / 1000).toFixed(2)} km`, Math.min(X(P[hx][0]) + 4, W - 100), 12);
  }
}
cv.addEventListener('mousemove', (ev) => {
  if (!summary) return;
  const r = cv.getBoundingClientRect(), W = r.width;
  const d = (ev.clientX - r.left - 34) / (W - 42) * summary.dist;
  let k = 0; while (k < summary.profile.length - 1 && summary.profile[k][0] < d) k++;
  drawProfile(k);
  hoverMark.setLatLng(ll(path[k])).addTo(map);
});
cv.addEventListener('mouseleave', () => { if (summary) drawProfile(); hoverMark.remove(); });
addEventListener('resize', () => summary && drawProfile());

// ---------------------------------------------------------------- tools
$('b-clear').onclick = () => setStops([]);
$('b-rev').onclick = () => setStops(stops.slice().reverse());
$('b-undo').onclick = () => { if (history.length) setStops(history.pop(), false); };
$('b-loc').onclick = () => {
  if (!navigator.geolocation) { msg('Ta przeglądarka nie udostępnia lokalizacji.'); return; }
  msg('Szukam lokalizacji…');
  navigator.geolocation.getCurrentPosition((p) => {
    const v = G.snap(p.coords.longitude, p.coords.latitude, 1500);
    if (v < 0) { msg('Jesteś poza obszarem planera (polskie Tatry Wysokie) albo daleko od szlaku.'); return; }
    msg(''); setStops([v, ...stops.slice(stops.length && stops[0] === v ? 1 : 0)]);
    map.setView(ll(v), 15);
  }, (e) => msg('Nie udało się ustalić lokalizacji: ' + e.message), { enableHighAccuracy: true, timeout: 15000 });
};
$('f-gpx').onchange = async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  const xml = new DOMParser().parseFromString(await f.text(), 'application/xml');
  const pts = [...xml.querySelectorAll('trkpt, rtept, wpt')].map((p) => [+p.getAttribute('lon'), +p.getAttribute('lat')]).filter((p) => isFinite(p[0]));
  ev.target.value = '';
  if (pts.length < 2) { msg('W pliku GPX nie ma śladu.'); return; }
  const m = G.matchTrack(pts);
  if (!m || !m.path) { msg('Ślad z pliku nie pokrywa się ze szlakami tego obszaru.'); return; }
  // keep a handful of the matched points as editable stops
  const keep = [m.stops[0]];
  const every = Math.max(1, Math.floor(m.stops.length / 8));
  for (let k = every; k < m.stops.length - 1; k += every) keep.push(m.stops[k]);
  keep.push(m.stops[m.stops.length - 1]);
  msg(`Wczytano ślad (${pts.length} punktów) i dopasowano do szlaków.`);
  setStops(keep);
  map.fitBounds(L.latLngBounds(keep.map(ll)), { padding: [30, 30] });
};
$('b-gpx').onclick = () => {
  if (!path) { msg('Najpierw wyznacz trasę.'); return; }
  const pts = path.map((v) => `<trkpt lat="${data.v[v][1]}" lon="${data.v[v][0]}"><ele>${data.v[v][2]}</ele></trkpt>`).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Rysy 3D planer" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>Trasa Tatry</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = 'trasa-tatry.gpx'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// "walk in 3D": the 3D view loads the region's data around the route (?trasa#r=...)
// ---------------------------------------------------------------- journal
const J = loadJournal();
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function openHash(h) { location.hash = h; location.reload(); }
function routeTitle() {
  if (!path) return '';
  const near = (v) => { let best = null, bd = 400; for (const p of data.poi) { if (p.k === 'sign') continue; const d = Math.hypot((p.p[0] - data.v[v][0]) * G.mx, (p.p[1] - data.v[v][1]) * G.mz); if (d < bd) { bd = d; best = p.n; } } return best; };
  return `${near(path[0]) || 'Start'} → ${near(path[path.length - 1]) || 'Cel'}`;
}
function renderJournal() {
  const t = totals(J);
  $('j-stats').innerHTML = `<div class="stat"><b>${t.walks}</b><span>przejść</span></div><div class="stat"><b>${t.km.toFixed(1)} km</b><span>razem</span></div>`
    + `<div class="stat"><b>↗ ${Math.round(t.up)} m</b><span>podejść</span></div><div class="stat"><b>${t.peaks}</b><span>szczytów</span></div>`;
  const li = (html, onClick) => { const e = document.createElement('li'); e.innerHTML = html; if (onClick) e.onclick = onClick; return e; };
  const favs = $('j-favs'); favs.innerHTML = '';
  if (!J.favs.length) favs.appendChild(li('<span class="empty">Wyznacz trasę i kliknij ☆, żeby ją zapisać.</span>'));
  for (const f of J.favs) {
    const b = J.best[f.key];
    favs.appendChild(li(`<span>★ ${esc(f.title)}</span><span class="t">${b ? 'rekord ' + fmtClock(b.time) : ''}</span>`, () => openHash(f.hash)));
  }
  const walks = $('j-walks'); walks.innerHTML = '';
  if (!J.walks.length) walks.appendChild(li('<span class="empty">Tu pojawią się trasy przebyte w widoku 3D.</span>'));
  for (const w of J.walks.slice(0, 12)) {
    const rec = J.best[w.key] && w.fair && J.best[w.key].time === w.time;
    walks.appendChild(li(`<span>${esc(w.title)}<br><small>${w.date} · ${(w.dist / 1000).toFixed(1)} km · ↗ ${w.up} m</small></span>`
      + `<span class="t">${w.fair ? fmtClock(w.time) : 'podgląd'}${rec ? ' 🏆' : ''}</span>`, w.hash ? () => openHash(w.hash) : null));
  }
  const pk = Object.entries(J.peaks).sort((a, b) => (b[1].ele || 0) - (a[1].ele || 0));
  $('j-peaks').innerHTML = pk.length ? pk.map(([n, p]) => `<span>▲ ${esc(n)}${p.ele ? ' ' + p.ele : ''}</span>`).join('') : '<span class="empty">Jeszcze żadnego – ruszaj!</span>';
  // favourite button for the current route
  const key = routeKey(location.hash);
  $('b-fav').hidden = !path;
  $('b-fav').textContent = J.favs.some((f) => f.key === key) ? '★ W ulubionych (kliknij, żeby usunąć)' : '☆ Dodaj do ulubionych';
}
$('b-fav').onclick = () => { toggleFav(J, routeKey(location.hash), routeTitle(), location.hash); saveJournal(J); renderJournal(); };

function updateGo() {
  renderJournal();
  const note = $('go-note');
  $('go').disabled = !path;
  note.hidden = !path;
  if (path) note.textContent = summary.dist > 14000 ? 'Długa trasa: wczytanie widoku 3D potrwa dłużej (duży obszar terenu).' : 'Widok 3D wczytuje teren wokół trasy (kilkanaście MB).';
}
$('go').onclick = () => { location.href = './index.html?trasa' + (matchMedia('(max-width: 760px)').matches ? '&q=low' : '') + location.hash; };

// restore a route from the address (#r=lat,lon;lat,lon...)
const h = location.hash.match(/r=([^&]+)/);
if (h) {
  const s0 = h[1].split(';').map((p) => { const [la, lo] = p.split(',').map(Number); return G.snap(lo, la, 100); }).filter((v) => v >= 0);
  if (s0.length) { stops = s0; update(); if (path) map.fitBounds(L.latLngBounds(path.map(ll)), { padding: [30, 30] }); }
}
renderJournal();
$('loading').remove();
