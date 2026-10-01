// Weather on the planner's map: the forecast (Open-Meteo, one request for all places) over the main peaks
// and huts, as small badges (weather icon, temperature, wind arrow and speed), with an hour slider over
// the three days of the forecast. A thunderstorm or a gale shows the badge in red. Tapping a badge gives
// the details. Kept in the browser for 3 hours and, without signal, the last one is shown.
import { WMO, ICON, fetchTimeout } from './daylight.js';

const PEAKS = ['Rysy', 'Gerlach', 'Łomnica', 'Krywań', 'Lodowy Szczyt', 'Świnica', 'Kasprowy Wierch', 'Kozi Wierch', 'Kopa Kondracka',
  'Kościelec', 'Szpiglasowy Wierch', 'Sławkowski Szczyt', 'Jagnięcy Szczyt'];
const HUTS = ['Schronisko PTTK Morskie Oko', 'Schronisko PTTK w Dolinie Pięciu Stawów Polskich', 'Murowaniec', 'Schronisko PTTK Hala Kondratowa',
  'Schronisko PTTK w Dolinie Roztoki', 'Schronisko PTTK na Hali Ornak', 'Schronisko Téryego', 'Schronisko Zbójnickie', 'Schronisko nad Popradzkim Stawem'];
const KEY = 'tatry-forecast-map';
const pad = (n) => String(n).padStart(2, '0');
const short = (n) => n.replace(/^Schronisko (PTTK )?(w |na |nad |pod )?/, '').replace(/^Dolinie /, 'Dolina ');

export function setupWeatherMap({ map, data, G, startDate, hasRoute, esc }) {
  // the places: the chosen peaks and huts that are in the data, at their own height
  const places = [];
  for (const [list, k] of [[PEAKS, 'peak'], [HUTS, 'hut']]) {
    for (const name of list) {
      const p = data.poi.find((q) => q.k === k && q.n === name);
      if (!p) continue;
      let e = p.e;
      if (!e) { const v = G.snapAny(p.p[0], p.p[1], 800); e = v >= 0 ? G.H[v] : null; }
      places.push({ name, k, lon: p.p[0], lat: p.p[1], e });
    }
  }
  const layer = L.layerGroup();
  let fc = null, on = false, day = 0, hour = 12;

  // the control: a button under the layer switch
  const Btn = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'wx-btn leaflet-bar');
      b.innerHTML = '🌦'; b.title = 'Pogoda na mapie (prognoza)';
      L.DomEvent.disableClickPropagation(b);
      b.onclick = () => toggle();
      this.b = b;
      return b;
    },
  });
  const btn = new Btn({ position: 'topright' }).addTo(map);
  // the bar with the day and the hour
  const bar = L.DomUtil.create('div', 'wx-bar', map.getContainer());
  bar.hidden = true;
  bar.innerHTML = `<div class="wx-row"><div class="wx-days"></div><b class="wx-when"></b><button class="wx-x" title="Zamknij">✕</button></div>
    <input type="range" class="wx-hour" min="0" max="23" step="1">
    <div class="wx-note"></div>`;
  L.DomEvent.disableClickPropagation(bar); L.DomEvent.disableScrollPropagation(bar);
  const $b = (s) => bar.querySelector(s);
  $b('.wx-x').onclick = () => toggle(false);
  $b('.wx-hour').oninput = (e) => { hour = +e.target.value; render(); };

  async function load() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* private mode */ }
    if (cached && cached.n === places.length && Date.now() - cached.at < 3 * 3600e3) return cached;
    const q = new URLSearchParams({
      latitude: places.map((p) => p.lat.toFixed(4)).join(','), longitude: places.map((p) => p.lon.toFixed(4)).join(','),
      elevation: places.map((p) => (p.e ? Math.round(p.e) : 'nan')).join(','),
      hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
      timezone: 'Europe/Warsaw', forecast_days: 3, wind_speed_unit: 'kmh',
    });
    try {
      let j = await (await fetchTimeout('https://api.open-meteo.com/v1/forecast?' + q)).json();
      if (!Array.isArray(j)) j = [j];
      if (!j[0] || !j[0].hourly) throw new Error('no data');
      const out = { at: Date.now(), n: places.length, hourly: j.map((r) => r.hourly) };
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* full */ }
      return out;
    } catch (e) {
      return cached ? { ...cached, stale: true } : null;
    }
  }

  function dayDate(d) { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + d); return t; }
  function renderDays() {
    const box = $b('.wx-days'); box.innerHTML = '';
    ['Dziś', 'Jutro', dayDate(2).toLocaleDateString('pl-PL', { weekday: 'short' })].forEach((t, d) => {
      const b = document.createElement('button'); b.textContent = t; b.className = d === day ? 'on' : '';
      b.onclick = () => { day = d; renderDays(); render(); };
      box.appendChild(b);
    });
  }

  function render() {
    layer.clearLayers();
    const t = dayDate(day); t.setHours(hour);
    $b('.wx-when').textContent = `${t.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' })}, ${pad(hour)}:00`;
    $b('.wx-hour').value = hour;
    if (!fc) return;
    const key = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(hour)}:00`;
    let storms = 0, gales = 0;
    places.forEach((p, n) => {
      const H = fc.hourly[n], i = H ? H.time.indexOf(key) : -1;
      if (i < 0) return;
      const code = H.weather_code[i], temp = H.temperature_2m[i], wind = H.wind_speed_10m[i], gust = H.wind_gusts_10m[i];
      const dir = H.wind_direction_10m[i], rain = H.precipitation[i], rainP = H.precipitation_probability[i];
      const bad = code >= 95 || gust >= 70;
      if (code >= 95) storms++; if (gust >= 70) gales++;
      const html = `<div class="wxm${bad ? ' bad' : ''}${p.k === 'hut' ? ' hut' : ''}"><b>${ICON(code)} ${Math.round(temp)}°</b>`
        + `<small><i style="transform:rotate(${Math.round(dir + 180)}deg)">↑</i>${Math.round(wind)}</small></div>`;
      const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'wx-icon', html, iconSize: null, iconAnchor: [22, 34] }), zIndexOffset: 500 });
      m.bindPopup(`<b>${esc(p.k === 'hut' ? short(p.name) : p.name)}</b>${p.e ? ` · ${Math.round(p.e)} m` : ''}<br>${ICON(code)} ${WMO[code] || ''}, ${Math.round(temp)}°C`
        + `<br>opady ${rainP ?? '–'}%${rain >= 0.1 ? ` (${rain.toFixed(1)} mm)` : ''}<br>wiatr ${Math.round(wind)} km/h, porywy ${Math.round(gust)} km/h`
        + (code >= 95 ? '<br><b style="color:#c8201c">⛈ burza: zejdź z grani i szczytów</b>' : gust >= 70 ? '<br><b style="color:#c8201c">💨 bardzo silny wiatr na grani</b>' : ''));
      layer.addLayer(m);
    });
    const warn = [storms ? `⛈ burza nad ${storms} ${storms === 1 ? 'miejscem' : 'miejscami'}` : '', gales ? `💨 porywy ≥ 70 km/h w ${gales} ${gales === 1 ? 'miejscu' : 'miejscach'}` : ''].filter(Boolean);
    $b('.wx-note').innerHTML = (warn.length ? `<b class="wx-warn">${warn.join(' · ')}</b><br>` : '')
      + `Prognoza Open-Meteo dla szczytów i schronisk${fc.stale ? `, zapisana ${new Date(fc.at).toLocaleString('pl-PL')} (brak zasięgu)` : ''}. Sprawdź też komunikat TOPR / HZS.`;
  }

  async function toggle(want = !on) {
    on = want;
    btn.b.classList.toggle('on', on);
    bar.hidden = !on;
    if (!on) { layer.remove(); return; }
    // the hour to start with: the planned start (a route), else now
    const now = new Date();
    const s = hasRoute() ? startDate() : now;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    day = Math.max(0, Math.min(2, Math.round((new Date(s).setHours(0, 0, 0, 0) - today) / 864e5)));
    hour = s.getHours();
    layer.addTo(map);
    renderDays(); render();
    if (!fc || Date.now() - fc.at > 3 * 3600e3) {
      $b('.wx-note').textContent = 'Pobieram prognozę…';
      fc = await load();
      if (!fc) { $b('.wx-note').textContent = 'Prognoza niedostępna: brak połączenia z serwisem pogody (Open-Meteo). Spróbuj później.'; return; }
      render();
    }
  }
  return { toggle, get on() { return on; } };
}
