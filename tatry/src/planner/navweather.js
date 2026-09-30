// Weather warnings during GPS navigation: the forecast for the route's highest point is fetched again
// every 20 minutes (when there is signal) and checked for the time still to walk. A new danger (a
// thunderstorm, gale-force gusts, icing, heavy rain) is announced once: a notice in the navigation
// panel, a long vibration and, if allowed, a system notification; with a storm, how soon it comes and
// the nearest hut. Without signal the last forecast is used and nothing is repeated.
import { forecast, walkWeather, hhmm, hm } from './daylight.js';

const EVERY = 20 * 60e3;

export function setupNavWeather({ $, data, G, top, left }) {
  let timer = null, seen = new Set(), pos = null, active = false, busy = false;
  const huts = data.poi.filter((p) => p.k === 'hut');
  function nearestHut() {
    if (!pos) return null;
    let best = null, bd = Infinity;
    for (const h of huts) {
      const d = Math.hypot((h.p[0] - pos.lon) * G.mx, (h.p[1] - pos.lat) * G.mz);
      if (d < bd) { bd = d; best = h; }
    }
    return best && bd < 15000 ? { name: best.n, d: bd } : null;
  }
  function notify(text, danger) {
    $('nav-wx-t').innerHTML = text;
    $('nav-wx').classList.toggle('danger', danger);
    $('nav-wx').hidden = false;
    if (navigator.vibrate) navigator.vibrate(danger ? [600, 200, 600, 200, 600] : [400, 150, 400]);
    const plain = text.replace(/<[^>]+>/g, '');
    try {
      if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((r) => r.showNotification('Szlakownik: pogoda', { body: plain, tag: 'szlakownik-weather', renotify: true, icon: 'icons/icon-192.png' }))
          .catch(() => {});
      }
    } catch (e) { /* no notifications here */ }
  }
  async function check() {
    if (!active || busy) return;
    const t = top();
    if (!t) return;
    busy = true;
    try {
      const fc = await forecast(t.lat, t.lon, t.ele, EVERY - 60e3);
      if (!active || !fc) return;
      const now = new Date(), minutes = left() ?? 240;
      const end = new Date(now.getTime() + Math.max(60, minutes + 30) * 60000);
      const w = walkWeather(fc, now, end, pos && pos.alt != null ? pos.alt : t.startEle);
      if (!w) return;
      const found = [];
      if (w.storm.length) {
        const s = w.storm[0], inMin = Math.max(0, (s - now) / 60000), hut = nearestHut();
        found.push({ key: 'storm:' + s.getHours(), danger: true,
          text: `⛈ <b>Burza w prognozie od ${hhmm(s)}</b>${inMin > 5 ? ` (za ${hm(inMin)})` : ' (już teraz)'}. Zejdź z grani i szczytów, nie chowaj się pod pojedynczym drzewem ani przy łańcuchach.`
            + (hut ? (hut.d < 300 ? ` Schronisko obok: ${hut.name}.` : ` Najbliższe schronisko: ${hut.name} (${(hut.d / 1000).toFixed(1)} km w linii prostej).`) : '') });
      }
      if (w.gust >= 70) found.push({ key: 'gust70', danger: true, text: `💨 <b>Porywy wiatru do ${Math.round(w.gust)} km/h</b> na grani: niebezpiecznie na odsłoniętych odcinkach, rozważ zawrócenie.` });
      else if (w.gust >= 50) found.push({ key: 'gust50', danger: false, text: `💨 Silny wiatr w porywach ${Math.round(w.gust)} km/h wyżej na trasie.` });
      if (w.freeze < fc.ele && w.rain > 0.2) found.push({ key: 'ice', danger: true, text: `🧊 <b>Granica zamarzania ${Math.round(w.freeze)} m</b>: opady mogą być śniegiem, skały oblodzone.` });
      if (w.rainP >= 70 && w.rain >= 1) found.push({ key: 'rain', danger: false, text: `🌧 Deszcz w prognozie (${w.rainP}%, ${w.rain.toFixed(1)} mm): mokre skały są śliskie.` });
      const fresh = found.filter((f) => !seen.has(f.key));
      for (const f of found) seen.add(f.key);
      if (fresh.length) {
        const danger = fresh.some((f) => f.danger);
        notify(fresh.map((f) => f.text).join('<br>') + (fc.stale ? '<br><small>Prognoza sprzed utraty zasięgu.</small>' : ''), danger);
      }
    } finally { busy = false; }
  }
  $('nav-wx-x').onclick = () => { $('nav-wx').hidden = true; };
  addEventListener('online', () => { if (active) check(); });
  return {
    start() {
      active = true; seen = new Set(); $('nav-wx').hidden = true;
      // a system notification needs permission: asked here, when the hiker starts the navigation
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch (e) { /* old API */ }
      clearInterval(timer); timer = setInterval(check, EVERY);
      setTimeout(check, 3000);
    },
    onPosition(p) { const first = !pos; pos = p; if (first && active) check(); },
    stop() { active = false; clearInterval(timer); timer = null; pos = null; $('nav-wx').hidden = true; },
  };
}
