// Route planner for the Polish High Tatras: a 2D map (Leaflet, OpenTopoMap) with the marked trails in
// their colours; click start, destination and stops, the quickest way along the trails is found
// (graph.js), with distance, ascent, PTTK-style time, the elevation profile and the trail sections.
// GPX import (matched onto the trails) and export; the phone's GPS can set the start.
// On the phone it installs as an app (manifest, service worker), works without signal (our own offline
// map, tools/prepare_offline_map.py) and navigates along the route with the GPS (nav.js).
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TrailGraph, fmtTime } from './graph.js';
import { loadJournal, saveJournal, routeKey, toggleFav, totals, fmtClock, addWalk, addPeak } from '../journal.js';
import { setupNav, trackGpx } from './nav.js';
import { sunTimes, forecast, walkWeather, hhmm, hm } from './daylight.js';
import { loadProfile, saveProfile, AVATARS, BADGES, rank, photoAvatar } from './profile.js';
import { setupLookEditor } from './lookEditor.js';
import { setupSearch } from './search.js';
import { setupRouteDrag } from './routedrag.js';
import { loadFound, saveFound } from '../nature/discover.js';
import { challenges, settleChallenges } from '../nature/challenges.js';
import { buildGpsDiscovery } from '../nature/gps.js';
import { setupOnline } from './online.js';
import { setupTabs } from './tabs.js';
import { setupWeatherMap } from './weathermap.js';
import { setupNavWeather } from './navweather.js';
import { setupSos } from './sos.js';
import { setupIntro } from './intro.js';
import { clearLocalData } from './localdata.js';
import { packList } from './packlist.js';
import { setupStay } from './stay.js';
import { captureConsole, setupReport, deviceContext } from '../report.js';
captureConsole();

const $ = (id) => document.getElementById(id);
const TABS = setupTabs();
const COLOUR_PL = { red: 'czerwony', blue: 'niebieski', green: 'zielony', yellow: 'żółty', black: 'czarny', none: 'bez znaków' };

const data = await (await fetch('data/region/trails.json')).json();
// discoveries on the real trail (plants, animals, peaks, passes, huts): the same as in the 3D view
const GPSD = await buildGpsDiscovery({ poi: data.poi });
const G = new TrailGraph(data);
const C = data.colours;

// ---------------------------------------------------------------- map
const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([49.215, 20.03], 13);
const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17, subdomains: 'abc', attribution: '© OpenStreetMap, SRTM · styl © OpenTopoMap (CC-BY-SA)' }).addTo(map);
const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
// our own offline map of the whole region (photo, relief, contours), cached for use without signal
const offIdx = await fetch('offline/index.json').then((r) => r.json()).catch(() => null);
const ob = offIdx && offIdx.bounds;
const offMap = L.tileLayer('offline/{z}/{x}/{y}.webp', { minZoom: 11, maxNativeZoom: 15, maxZoom: 17,
  ...(ob ? { bounds: [[ob[1], ob[0]], [ob[3], ob[2]]] } : {}),
  attribution: 'Ortofotomapa i rzeźba: GUGiK, ÚGKK SR, GKÚ · mapa offline Tatry' });
// hard passages (OpenStreetMap, tools/prepare_hard.py): chains, staples, ladders and exposed alpine stretches
// (SAC T4-T6). Their lines, cut into ~8 m steps, go into a 30 m grid; a route vertex within ~25 m of one is on it (OSM draws the chain and the trail as separate lines)
const HARD = { grid: new Map(), ready: false };
const chainLayer = L.layerGroup();
const chainSync = () => { const show = map.getZoom() >= 14; if (show && !map.hasLayer(chainLayer)) chainLayer.addTo(map); if (!show && map.hasLayer(chainLayer)) chainLayer.remove(); };
map.on('zoomend', chainSync); chainSync();
fetch('data/region/hard.json').then((r) => r.json()).then((d) => {
  const KX = 72700, KZ = 111200;                    // metres a degree of longitude / latitude here
  const put = (kind, name, grade, pts) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * KX, (z1 - z0) * KZ) / 8));
      for (let j = 0; j <= n; j++) {
        const x = (x0 + (x1 - x0) * j / n) * KX, z = (z0 + (z1 - z0) * j / n) * KZ, key = `${Math.floor(x / 30)},${Math.floor(z / 30)}`;
        if (!HARD.grid.has(key)) HARD.grid.set(key, []);
        HARD.grid.get(key).push([x, z, kind, name, grade]);
      }
    }
  };
  for (const [name, pts] of d.c) {
    put('c', name, 0, pts);
    // on the map from zoom 14: the chain stretch as a dotted dark line and a ⛓ at its middle
    const ll = pts.map(([lon, lat]) => [lat, lon]);
    L.polyline(ll, { color: '#2b2b2b', weight: 5, opacity: 0.75, dashArray: '1 7', lineCap: 'round', interactive: false }).addTo(chainLayer);
    L.marker(ll[Math.floor(ll.length / 2)], { icon: L.divIcon({ className: 'chain-ico', html: '⛓', iconSize: [20, 20] }), bubblingMouseEvents: false })
      .bindPopup(`⛓ <b>${name ? name.replace(/[&<>"]/g, '') : 'Łańcuchy, klamry'}</b><br>ubezpieczony odcinek (OpenStreetMap): kask i rękawiczki`).addTo(chainLayer);
  }
  for (const [name, grade, pts] of d.a) put('a', name, grade, pts);
  HARD.ready = true; HARD.KX = KX; HARD.KZ = KZ;
  if (summary) updateDay();
}).catch(() => { /* none: the 🎒 list judges by the height */ });
// the chains and alpine stretches along a route: names (unnamed ones counted) and metres of each
function hardAlong(p) {
  const out = { chains: new Map(), alpine: new Map(), grade: 0, chainM: 0, alpineM: 0 };
  if (!HARD.ready) return out;
  let prev = null;
  for (const k of p) {
    const x = data.v[k][0] * HARD.KX, z = data.v[k][1] * HARD.KZ, cx = Math.floor(x / 30), cz = Math.floor(z / 30);
    const step = prev ? Math.hypot(x - prev[0], z - prev[1]) : 0;
    prev = [x, z];
    let c = null, a = null;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const h of HARD.grid.get(`${cx + i},${cz + j}`) || []) {
        if ((h[0] - x) ** 2 + (h[1] - z) ** 2 > 625) continue;
        if (h[2] === 'c') c = c || h; else if (!a || h[4] > a[4]) a = h;
      }
    }
    if (c) { out.chainM += step; out.chains.set(c[3], (out.chains.get(c[3]) || 0) + step); }
    if (a) { out.alpineM += step; out.alpine.set(a[3], (out.alpine.get(a[3]) || 0) + step); out.grade = Math.max(out.grade, a[4]); }
  }
  return out;
}
// water and places to rest along the trails (OpenStreetMap, tools/prepare_rest.py), from zoom 14 on
const restLayer = L.layerGroup();
fetch('data/region/rest.json').then((r) => r.json()).then((d) => {
  const REST = { bench: 'Ławka', table: 'Stół i ławki', shelter: 'Wiata' };
  const h = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dot = (lon, lat, o, text) => L.circleMarker([lat, lon], { radius: 5, weight: 1.5, fillOpacity: 0.9, bubblingMouseEvents: false, ...o })
    .bindPopup(text).addTo(restLayer);
  for (const [lon, lat, k] of d.r) dot(lon, lat, { color: '#5a3d22', fillColor: '#b98a5a', radius: 4 }, `🪵 ${REST[k]}`);
  for (const [lon, lat, k, name] of d.w) {
    dot(lon, lat, { color: '#0d4f8a', fillColor: k === 'pitna' ? '#2a8fe6' : '#9cc9ee' },
      k === 'pitna' ? `💧 <b>${h(name || 'Woda pitna')}</b><br>woda pitna (OpenStreetMap)` : `💧 <b>${h(name || 'Źródło')}</b><br>jakość wody niesprawdzona: przegotuj lub przefiltruj`);
  }
}).catch(() => { /* no data */ });
let restOn = true;
const restSync = () => { const show = restOn && map.getZoom() >= 14; if (show && !map.hasLayer(restLayer)) restLayer.addTo(map); if (!show && map.hasLayer(restLayer)) restLayer.remove(); };
map.on('zoomend', restSync);
const restToggle = L.layerGroup();          // what the layers control switches (the dots themselves only from zoom 14)
restToggle.on('add', () => { restOn = true; restSync(); }).on('remove', () => { restOn = false; restSync(); }).addTo(map);
L.control.layers({ 'Mapa topograficzna': topo, 'OpenStreetMap': osm, 'Mapa offline (zdjęcie, poziomice)': offMap },
  { '💧 Woda i 🪵 odpoczynek (od zbliżenia 14)': restToggle }, { position: 'topright' }).addTo(map);
function useOffline(on) {
  if (on && !map.hasLayer(offMap)) { topo.remove(); osm.remove(); offMap.addTo(map); }
  if (!on && map.hasLayer(offMap) && !map.hasLayer(topo)) { offMap.remove(); topo.addTo(map); }
}
if (!navigator.onLine) useOffline(true);
// weak signal: the online tiles keep failing, use ours
let tileErrors = 0;
topo.on('tileerror', () => { if (++tileErrors === 8 && offIdx) { useOffline(true); msg('Słaby zasięg: przełączono na mapę offline.'); } });
topo.on('tileload', () => { tileErrors = Math.max(0, tileErrors - 1); });
addEventListener('offline', () => { useOffline(true); msg('Brak zasięgu: przełączono na mapę offline.'); });
addEventListener('online', () => msg(''));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
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
// huts, peaks, passes, lakes and waterfalls, more of them as you zoom in: huts and the high peaks first,
// all peaks, lakes and waterfalls at 14, passes at 15
const layersAt = { 12: L.layerGroup(), 14: L.layerGroup(), 15: L.layerGroup() };
for (const p of data.poi) {
  if (p.k === 'sign') continue;
  const icon = { hut: '⌂', peak: '▲', lake: '💧', fall: '🌊' }[p.k] || '⌒';
  const label = `${icon} ${p.n}${p.e ? ' ' + p.e + ' m' : ''}`;
  const z = p.k === 'hut' || (p.k === 'peak' && p.e >= 2150) ? 12 : p.k === 'pass' ? 15 : 14;
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

let SEARCH = null, DRAG = null;      // the from / to fields, dragging the route line (set up below)
function msg(t) { $('msg').textContent = t || ''; }
function save() { history.push(stops.slice()); if (history.length > 50) history.shift(); }
const OFF_TRAIL = 'Tu nie ma znakowanego szlaku (w promieniu 400 m). Kliknij bliżej szlaku.';
// a new route (dragged, searched, clicked) makes the notice of a click off the trail out of date
function setStops(s, remember = true) { if (remember) save(); stops = s; if ($('msg').textContent === OFF_TRAIL) msg(''); update(); }

map.on('click', (ev) => {
  if (DRAG && DRAG.busy) return;                 // the end of dragging the route line
  const v = G.snap(ev.latlng.lng, ev.latlng.lat, 400);
  if (v < 0) { msg(OFF_TRAIL); return; }
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
  if (SEARCH) SEARCH.sync();
  location.replace('#' + (stops.length ? 'r=' + stops.map((v) => data.v[v][1].toFixed(5) + ',' + data.v[v][0].toFixed(5)).join(';') : ''));
  updateGo();
}

SEARCH = setupSearch({ $, data, G, getStops: () => stops, setStops, ll,
  // the whole route in view (on a phone, above the panel)
  onPicked: () => { const pts = path ? path.map(ll) : stops.map(ll); if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 }); } });
DRAG = setupRouteDrag({ map, G, ll, getPath: () => path, getStops: () => stops, setStops });
window.__planner = { map, ll, get path() { return path; }, get stops() { return stops; } };   // tests

function showSummary() {
  const S = summary;
  $('summary').hidden = false;
  TABS.show('route');
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
  updateDay();
}

// ---------------------------------------------------------------- the day: darkness and weather
// default start: now (rounded up to 15 min) if it is still morning, else tomorrow at 7:00
{
  const now = new Date();
  if (now.getHours() < 10) { const m = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15; $('d-time').value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  else $('d-day').value = '1';
}
function startDate() {
  const [h, m] = $('d-time').value.split(':').map(Number);
  const d = new Date(); d.setDate(d.getDate() + +$('d-day').value); d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
function sunNow() {
  if (!path) return null;
  const mid = data.v[path[Math.floor(path.length / 2)]];
  return sunTimes(startDate(), mid[1], mid[0]);
}
let dayReq = 0;
async function updateDay() {
  if (!summary) return;
  const t0 = startDate(), t1 = new Date(t0.getTime() + summary.time * 60000);
  const sun = sunNow();
  let html = `Koniec około <b>${hhmm(t1)}</b> (czas marszu bez postojów) · zachód słońca <b>${hhmm(sun.sunset)}</b>`;
  const margin = (sun.sunset - t1) / 60000;
  const latest = new Date(sun.sunset.getTime() - summary.time * 60000);
  if (margin < 0) html = `<span class="late">Nie zdążysz przed zmrokiem: dotrzesz ok. ${hhmm(t1)}, zachód ${hhmm(sun.sunset)} (zmierzch ${hhmm(sun.dusk)}).`
    + ` Wyjdź najpóźniej o ${hhmm(latest)} albo weź czołówkę.</span>`;
  else if (margin < 90) html += ` · <span class="tight">zapas tylko ${hm(margin)}</span>`;
  else html += ` · <span class="ok">zapas ${hm(margin)}</span>`;
  if (sun.sunrise && t0 < sun.sunrise) html += `<br>Wyjście przed wschodem słońca (${hhmm(sun.sunrise)}): czołówka.`;
  $('d-sun').innerHTML = html;
  const pack = { time: summary.time, up: summary.up, down: summary.down, maxE: summary.maxE, minE: summary.minE, margin, early: !!(sun.sunrise && t0 < sun.sunrise), date: t0, w: null, hard: hardOn(path), osm: hardAlong(path) };
  renderPack(pack);
  // the forecast for the highest point of the route
  const req = ++dayReq;
  let top = path[0];
  for (const v of path) if (G.H[v] > G.H[top]) top = v;
  $('d-weather').textContent = 'Pobieram prognozę…';
  const fc = await forecast(data.v[top][1], data.v[top][0], G.H[top]);
  if (req !== dayReq) return;
  const w = fc && walkWeather(fc, t0, t1, G.H[path[0]]);
  if (!w) { winterCard(t0, G.H[top], null); $('d-weather').textContent = fc ? 'Prognoza sięga 3 dni naprzód.' : 'Prognoza niedostępna: brak połączenia z serwisem pogody (Open-Meteo).'; return; }
  winterCard(t0, G.H[top], w.freeze);
  renderPack({ ...pack, w });
  const top_n = Math.round(G.H[top]);
  $('d-weather').innerHTML = `${w.icon} ${w.text} · na górze (${top_n} m) ${Math.round(w.tTop)}°C, odczuwalnie ${Math.round(w.feelsTop)}°C · na starcie ok. ${Math.round(w.tStart)}°C`
    + `<br>opady ${w.rainP}%${w.rain >= 0.1 ? ` (${w.rain.toFixed(1)} mm)` : ''} · wiatr ${Math.round(w.wind)} km/h, porywy ${Math.round(w.gust)} km/h`
    + (w.warn.length ? `<ul>${w.warn.map((x) => `<li>${x}</li>`).join('')}</ul>` : '')
    + `<div class="src">Prognoza Open-Meteo dla ${top_n} m n.p.m${w.stale ? `, zapisana ${w.at.toLocaleString('pl-PL')} (brak zasięgu)` : ''}. Sprawdź też komunikat TOPR / HZS.</div>`;
}
// 🗓 the stay planner (stay.js): a walk of the plan opens as the route
setupStay({ G, along: hardAlong, $, onOpen: (s) => { setStops(s); document.querySelector('#tabs [data-tab="route"]').click(); } });
// 🎒 what to take (packlist.js): ticks are kept on this device, for any route (the same gear)
const PACK_KEY = 'szlakownik-pack';
let packTicks = {};
try { packTicks = JSON.parse(localStorage.getItem(PACK_KEY) || '{}'); } catch (e) { /* private mode */ }
const savePack = () => { try { localStorage.setItem(PACK_KEY, JSON.stringify(packTicks)); } catch (e) { /* full */ } };
// the difficult stretches (chains, ladders) the route goes along
function hardOn(p) { const on = new Set(p); return (G.corrected || []).filter((c) => on.has(c.from) && on.has(c.to)).map((c) => c.name.replace(/\s*\(.*\)$/, '')); }
function renderPack(r) {
  const items = packList(r);
  const done = () => items.filter((it) => packTicks[it.id]).length;
  $('pack-list').innerHTML = items.map((it) => `<li class="${it.must ? 'must' : ''}${packTicks[it.id] ? ' done' : ''}"><input type="checkbox" id="pk-${it.id}" data-id="${it.id}" ${packTicks[it.id] ? 'checked' : ''}>`
    + `<label for="pk-${it.id}"><b>${it.t}</b><span class="why">${it.why}</span></label></li>`).join('');
  const count = () => { $('pack-n').innerHTML = `· ${done()}/${items.length} spakowane · <span style="color:#c2410c">●</span> potrzebne na tę trasę`; };
  $('pack-list').querySelectorAll('input').forEach((el) => {
    el.onchange = () => { packTicks[el.dataset.id] = el.checked; if (!el.checked) delete packTicks[el.dataset.id]; savePack(); el.closest('li').classList.toggle('done', el.checked); count(); };
  });
  count();
  $('pack').hidden = false;
}
$('pack-clear').onclick = (e) => { e.preventDefault(); packTicks = {}; savePack(); $('pack-list').querySelectorAll('input').forEach((el) => { el.checked = false; el.closest('li').classList.remove('done'); }); $('pack-n').innerHTML = $('pack-n').innerHTML.replace(/· \d+\//, '· 0/'); };
// winter on the route (mid November to April, or a forecast freezing level below the top): the avalanche
// bulletin. TOPR's terms forbid republishing its data without consent, so the card links to the bulletin
// (and the Slovak one, HZS) and explains the five-degree European scale instead of showing the degree.
function winterCard(t0, topEle, freeze) {
  const m = t0.getMonth(), d = t0.getDate();
  const season = m === 11 || m <= 2 || (m === 10 && d >= 15) || (m === 3 && d <= 30) || (m === 4 && d <= 15);
  const cold = freeze != null && freeze < topEle;
  const box = $('winter-card');
  if (!season && !cold) { box.hidden = true; return; }
  const sk = path && path.some((v) => data.v[v][0] > 20.1 && data.v[v][1] < 49.2);
  box.innerHTML = `<b class="h">❄ ${season ? 'Warunki zimowe' : 'Możliwy śnieg i lód na górze'}</b>`
    + `Przed wyjściem sprawdź <b>komunikat lawinowy</b>: stopień zagrożenia (1–5) ogłasza TOPR każdego dnia sezonu.`
    + `<div class="scale"><span style="background:#ccff66">1 niski</span><span style="background:#ffff00">2 umiark.</span><span style="background:#ff9900">3 znaczny</span><span style="background:#ff0000;color:#fff">4 duży</span><span style="background:#000;color:#fff">5 b. duży</span></div>`
    + `<a class="btn" href="https://lawiny.topr.pl/" target="_blank" rel="noopener">Komunikat TOPR</a>`
    + (sk ? `<a class="btn sk" href="https://www.laviny.sk/" target="_blank" rel="noopener">Laviny HZS (Słowacja)</a>` : '')
    + `<ul><li>Od stopnia 3 tylko z doświadczeniem i sprzętem lawinowym (detektor, sonda, łopata); przy 4–5 nie wychodź w teren lawiniasty.</li>`
    + `<li>Zimą potrzebne raki i czekan powyżej schronisk, część szlaków jest zamknięta: sprawdź komunikaty TPN.</li>`
    + `<li>Czas przejścia w śniegu bywa dwa razy dłuższy niż według norm, a dzień jest krótki.</li></ul>`;
  box.hidden = false;
}
$('d-day').onchange = updateDay;
$('d-time').onchange = updateDay;

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
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Szlakownik" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>Trasa Tatry</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = 'trasa-tatry.gpx'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ---------------------------------------------------------------- offline download
const OFF_KEY = 'tatry-offline-map';
function offlineState() {
  const d = (() => { try { return localStorage.getItem(OFF_KEY); } catch (e) { return null; } })();
  $('offline-state').textContent = d ? `Mapa offline pobrana (${d}). Szlaki i planowanie działają bez zasięgu.`
    : offIdx ? `Mapa offline: ${Math.round(offIdx.bytes / 1e6)} MB, pobierz przed wyjściem w góry (najlepiej przez Wi-Fi).` : '';
}
$('b-offline').onclick = async () => {
  if (!offIdx || !('caches' in window)) { msg('Ta przeglądarka nie obsługuje zapisu offline.'); return; }
  const btn = $('b-offline'); btn.disabled = true;
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const cache = await caches.open('tatry-offline-map-v1');
    const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const base = new URL('offline/', location.href);
    const todo = offIdx.tiles.map(([z, x, y]) => new URL(`${z}/${x}/${y}.webp`, base)).filter((u) => !have.has(u.pathname));
    let done = offIdx.tiles.length - todo.length, fail = 0;
    const next = async () => {
      for (let u = todo.shift(); u; u = todo.shift()) {
        try { const r = await fetch(u); if (r.ok) await cache.put(u, r); else fail++; } catch (e) { fail++; }
        done++;
        if (done % 20 === 0) btn.textContent = `⤓ Pobieranie… ${Math.round(done / offIdx.tiles.length * 100)}%`;
      }
    };
    await Promise.all(Array.from({ length: 6 }, next));
    // the app and the trail network too (the service worker keeps them, this makes sure)
    const app = await caches.open('tatry-app-v1');
    await app.addAll(['planer.html', 'data/region/trails.json', 'offline/index.json', 'manifest.webmanifest']).catch(() => {});
    if (fail) msg(`Nie pobrano ${fail} kafelków (słaby internet?). Kliknij jeszcze raz, żeby dokończyć.`);
    else { try { localStorage.setItem(OFF_KEY, new Date().toLocaleDateString('pl-PL')); } catch (e) { /* private mode */ } msg('Gotowe: mapa i szlaki działają teraz bez zasięgu.'); }
  } finally { btn.disabled = false; btn.textContent = '⤓ Pobierz na offline'; offlineState(); }
};
offlineState();

// ---------------------------------------------------------------- GPS navigation along the route
// weather warnings on the way: the forecast for the route's highest point (or where you are, without a
// route) over the time still to walk
let lastFix = null;
const NAVWX = setupNavWeather({ $, data, G, left: () => NAV.left(), top: () => {
  if (path) {
    let t = path[0];
    for (const v of path) if (G.H[v] > G.H[t]) t = v;
    return { lat: data.v[t][1], lon: data.v[t][0], ele: G.H[t], startEle: G.H[path[0]] };
  }
  return lastFix && lastFix.alt != null ? { lat: lastFix.lat, lon: lastFix.lon, ele: lastFix.alt, startEle: lastFix.alt } : null;
} });
const NAV = setupNav({ map, G, data, $, route: () => ({ path, summary }),
  onPosition: (p) => { lastFix = { ...p, t: Date.now() }; ONLINE.onPosition(p); GPSD.onPosition(p); NAVWX.onPosition(p); },
  onStart: () => NAVWX.start(), onStop: () => { NAVWX.stop(); ONLINE.onNavStop(); }, sunset: () => { const n = new Date(); const v = data.v[path ? path[0] : 0]; return sunTimes(n, v[1], v[0]).sunset; }, onFinish: (w) => {
  const title = routeTitle() || 'Przejście GPS';
  const walk = { key: path ? routeKey(location.hash) : 'gps', title, date: new Date().toISOString().slice(0, 10), dist: Math.round(w.dist),
    up: w.up, time: Math.round(w.time), fair: w.completed, gps: true, hash: path ? location.hash : '', trace: w.trace };
  const record = addWalk(J, walk);
  // a summit at the end of the walk
  const [, la, lo] = w.track[w.track.length - 1];
  for (const p of data.poi) if (p.k === 'peak' && Math.hypot((p.p[0] - lo) * G.mx, (p.p[1] - la) * G.mz) < 60) addPeak(J, p.n, p.e);
  saveJournal(J); renderJournal(); ONLINE.sync();
  $('msg').innerHTML = `Zapisano w dzienniku: ${(w.dist / 1000).toFixed(1)} km, ${fmtClock(w.time)}${record ? ' · nowy rekord 🏆' : ''}. <a href="#" id="save-track">⤒ Zapisz ślad GPX</a>`;
  $('save-track').onclick = (ev) => {
    ev.preventDefault();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([trackGpx(w.track, title)], { type: 'application/gpx+xml' }));
    a.download = `slad-${walk.date}.gpx`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
} });
$('b-nav').onclick = () => { if (!NAV.active()) NAV.start(); };

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
  if (!J.walks.length) walks.appendChild(li('<span class="empty">Tu pojawią się trasy przebyte w widoku 3D i z nawigacją GPS.</span>'));
  for (const w of J.walks.slice(0, 12)) {
    const rec = J.best[w.key] && w.fair && J.best[w.key].time === w.time;
    walks.appendChild(li(`<span>${esc(w.title)}<br><small>${w.date} · ${(w.dist / 1000).toFixed(1)} km · ↗ ${w.up} m</small></span>`
      + `<span class="t">${w.gps ? '📍 ' : ''}${w.fair || w.gps ? fmtClock(w.time) : 'podgląd'}${rec ? ' 🏆' : ''}</span>`, w.hash ? () => openHash(w.hash) : null));
  }
  const pk = Object.entries(J.peaks).sort((a, b) => (b[1].ele || 0) - (a[1].ele || 0));
  $('j-peaks').innerHTML = pk.length ? pk.map(([n, p]) => `<span>▲ ${esc(n)}${p.ele ? ' ' + p.ele : ''}</span>`).join('') : '<span class="empty">Jeszcze żadnego – ruszaj!</span>';
  renderProfile(t);
  renderRanking();
  // favourite button for the current route
  const key = routeKey(location.hash);
  $('b-fav').hidden = !path;
  $('b-fav').textContent = J.favs.some((f) => f.key === key) ? '★ W ulubionych (kliknij, żeby usunąć)' : '☆ Dodaj do ulubionych';
}
// ---------------------------------------------------------------- profile and badges
const PR = loadProfile();
function renderProfile(t) {
  const av = $('p-avatar');
  if (PR.avatar && PR.avatar.startsWith('data:')) { av.textContent = ''; av.style.backgroundImage = `url(${PR.avatar})`; }
  else { av.textContent = PR.avatar || '🥾'; av.style.backgroundImage = ''; }
  $('p-name').textContent = PR.name || 'Turysta (kliknij ✎)';
  $('p-rank').textContent = `${rank(t.km)} · ${t.km.toFixed(0)} km · ↗ ${Math.round(t.up)} m`;
  const D = loadFound();
  // challenges of the day, week, month and year (the same for everybody), bonus points when done
  settleChallenges(D, J, saveFound);
  $('ch-list').innerHTML = challenges(D, J).map((c) => `<div class="ch${c.done ? ' done' : ''}"><small>${c.name} · +${c.bonus} pkt</small><br>`
    + `${esc(c.text)} ${c.done ? '✓' : `<small>(${c.have}/${c.n})</small>`}<div class="bar"><i style="width:${Math.round(100 * c.have / c.n)}%"></i></div></div>`).join('');
  const got = BADGES.filter((b) => b.ok(t, J, D)).length;
  $('b-count').textContent = `${got} / ${BADGES.length}`;
  $('badges').innerHTML = BADGES.map((b) => `<div class="badge${b.ok(t, J, D) ? '' : ' off'}" title="${esc(b.desc)}"><span class="i">${b.icon}</span><b>${esc(b.name)}</b>${esc(b.desc)}</div>`).join('');
}
$('p-edit').onclick = () => {
  const n = prompt('Twoje imię lub pseudonim (widoczne w Twoich grupach):', PR.name || '');
  if (n === null) return;
  PR.name = n.trim().slice(0, 40); saveProfile(PR); renderJournal(); ONLINE.sync();
};
// the look of the figure (on the trail in 3D, in the group); its face can be the avatar
const LOOK_ED = setupLookEditor({ PR, saveProfile, onSaved: () => { renderJournal(); ONLINE.sync(); } });
$('p-look').onclick = () => LOOK_ED.open();
$('p-avatar').onclick = () => {
  const box = $('p-pick');
  box.hidden = !box.hidden;
  box.innerHTML = '<button data-a="look" title="Postać z edytora wyglądu">🧍</button><button data-a="photo" title="Zdjęcie z telefonu">📷</button>'
    + AVATARS.map((a) => `<button data-a="${a}">${a}</button>`).join('');
};
$('p-pick').onclick = (ev) => {
  const a = ev.target.closest('button') && ev.target.closest('button').dataset.a;
  if (!a) return;
  if (a === 'photo') { $('p-photo').click(); return; }
  if (a === 'look') { $('p-pick').hidden = true; LOOK_ED.open(); return; }
  PR.avatar = a; saveProfile(PR); $('p-pick').hidden = true; renderJournal(); ONLINE.sync();
};
$('p-photo').onchange = async (ev) => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try { PR.avatar = await photoAvatar(f); saveProfile(PR); ONLINE.sync(); } catch (e) { msg('Nie udało się wczytać zdjęcia.'); }
  $('p-pick').hidden = true; renderJournal();
};

// ---------------------------------------------------------------- online: account, sync, groups, chat, positions
// safety: the SOS button on the map; the first-start guide; wiping this device's data
setupSos({ map, data, G, lastFix: () => lastFix });
const INTRO = setupIntro();
$('b-intro').onclick = () => INTRO.open();
$('b-clear-local').onclick = () => {
  if (!confirm('Usunąć z tego urządzenia dziennik, odkrycia, profil, grupy, sesję logowania i zapisane prognozy? Dane na koncie (jeśli je masz) zostają.')) return;
  clearLocalData(); location.reload();
};
// test reports (🐞 on the map): a screenshot of the page and the state of the planner
{
  const Bug = L.Control.extend({ onAdd() {
    const b = L.DomUtil.create('button', 'wx-btn leaflet-bar'); b.innerHTML = '🐞'; b.title = 'Zgłoś problem (zrzut ekranu + opis)';
    L.DomEvent.disableClickPropagation(b); this.b = b; return b;
  } });
  const bug = new Bug({ position: 'topright' }).addTo(map);
  setupReport({ app: 'planer', button: bug.b,
    screenshot: async () => {
      const { default: html2canvas } = await import('html2canvas');
      const c = await html2canvas(document.body, { useCORS: true, logging: false, scale: Math.min(2, devicePixelRatio), backgroundColor: '#f6f5f1' });
      return c.toDataURL('image/jpeg', 0.85);
    },
    context: () => {
      const c = map.getCenter();
      const tab = (document.querySelector('#tabs .on') || {}).dataset;
      return {
        where: `planer · ${routeTitle() || 'bez trasy'} · mapa ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}, zoom ${map.getZoom()}`,
        route: routeTitle() || null, hash: location.hash, center: [+c.lat.toFixed(5), +c.lng.toFixed(5)], zoom: map.getZoom(),
        tab: tab && tab.tab, summary: summary ? { dist: Math.round(summary.dist), time: Math.round(summary.time) } : null,
        nav: NAV.active(), fix: lastFix, signedIn: !!(ONLINE && ONLINE.user), ...deviceContext(),
      };
    } });
}
// weather on the map: forecast badges over the main peaks and huts, with an hour slider
setupWeatherMap({ map, data, G, startDate, hasRoute: () => !!path, esc });
const ONLINE = setupOnline({ $, map, J, PR, loadJournal, saveJournal, saveProfile, totals, render: () => renderJournal(), msg, esc,
  routeTitle, hasRoute: () => !!path, openHash });
// the ranking (signed-in people who show their profile publicly): by period and by mode
async function renderRanking() {
  try { void ONLINE; } catch (e) { return; }            // the journal is drawn once before the online part exists
  const box = $('lb-list');
  $('lb-public').checked = !!ONLINE.isPublic;
  $('lb-public').disabled = !ONLINE.user;
  if (!ONLINE.user) { box.innerHTML = '<li class="empty">Zaloguj się w zakładce <button class="link" data-tab="account">Konto</button>, żeby zobaczyć ranking i w nim wystartować.</li>'; return; }
  try {
    const rows = await ONLINE.leaderboard($('lb-period').value, $('lb-mode').value);
    box.innerHTML = rows && rows.length ? rows.map((r) => `<li class="${r.me ? 'me' : ''}">`
      + `${r.avatar && r.avatar.startsWith('data:') ? `<i class="av" style="background-image:url(${r.avatar})"></i>` : `<i class="av">${esc(r.avatar || '🥾')}</i>`} `
      + `${esc(r.name)} · <b>${r.points}</b> pkt · ${r.species} gat.</li>`).join('') : '<li class="empty">Jeszcze nikogo w tym okresie.</li>';
  } catch (e) { box.innerHTML = `<li class="empty">Ranking niedostępny (${esc(e.message || e)}).</li>`; }
}
$('lb-period').onchange = renderRanking; $('lb-mode').onchange = renderRanking;
$('lb-public').onchange = async (e) => { await ONLINE.setPublic(e.target.checked); renderRanking(); };

$('b-fav').onclick = () => { toggleFav(J, routeKey(location.hash), routeTitle(), location.hash); saveJournal(J); renderJournal(); };

function updateGo() {
  renderJournal();
  const note = $('go-note');
  $('go').disabled = !path;
  note.hidden = !path;
  if (path) note.textContent = summary.dist > 14000 ? 'Długa trasa: wczytanie widoku 3D potrwa dłużej (duży obszar terenu).' : 'Widok 3D wczytuje teren wokół trasy (kilkanaście MB).';
}
$('go').onclick = () => {
  // the start time goes along: the 3D view shows the forecast's weather for the hour one is at each place
  const d = startDate(), p2 = (n) => String(n).padStart(2, '0');
  const start = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  location.href = `./index.html?trasa&start=${start}&v=` + Date.now().toString(36) + location.hash;
};   // always the newest 3D view   // the 3D view picks its quality for the device

// restore a route from the address (#r=lat,lon;lat,lon...)
const h = location.hash.match(/r=([^&]+)/);
if (h) {
  const s0 = h[1].split(';').map((p) => { const [la, lo] = p.split(',').map(Number); return G.snap(lo, la, 100); }).filter((v) => v >= 0);
  if (s0.length) { stops = s0; update(); if (path) map.fitBounds(L.latLngBounds(path.map(ll)), { padding: [30, 30] }); }
}
renderJournal();
document.querySelector('footer').append(` Wersja ${__BUILD__}.`);
$('loading').remove();

