// SOS: a red button on the map that opens the emergency panel: where you are (coordinates, accuracy,
// height, the nearest named place), one-tap calls to TOPR, HZS and 112, an SMS with the position to a
// person you choose (the number is kept in this browser), and sharing the position; plus what to say
// and how to wait for help.
const PHONE = 'szlakownik-sos-phone';

export function setupSos({ map, data, G, lastFix }) {
  const box = document.getElementById('sos');
  const $s = (s) => box.querySelector(s);
  let fix = null;

  const Btn = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'sos-btn');
      b.textContent = 'SOS'; b.title = 'Wezwij pomoc (TOPR, HZS, 112), wyślij swoją pozycję';
      L.DomEvent.disableClickPropagation(b);
      b.onclick = open;
      return b;
    },
  });
  new Btn({ position: 'bottomleft' }).addTo(map);

  const deg = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  function nearest(lat, lon) {
    let best = null, bd = Infinity;
    for (const p of data.poi) {
      if (p.k === 'sign') continue;
      const d = Math.hypot((p.p[0] - lon) * G.mx, (p.p[1] - lat) * G.mz);
      if (d < bd) { bd = d; best = p; }
    }
    return best && bd < 5000 ? { name: best.n, d: bd, k: best.k } : null;
  }
  function text() {
    if (!fix) return 'Potrzebuję pomocy w górach.';
    const n = nearest(fix.lat, fix.lon);
    return `Potrzebuję pomocy w górach. Moja pozycja: ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)} (±${Math.round(fix.acc)} m)`
      + `${fix.alt != null ? `, ${Math.round(fix.alt)} m n.p.m.` : ''}${n ? `, ok. ${Math.round(n.d)} m od: ${n.name}` : ''}.`
      + ` Godzina ${new Date(fix.t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}.`
      + ` Mapa: https://www.openstreetmap.org/?mlat=${fix.lat.toFixed(5)}&mlon=${fix.lon.toFixed(5)}#map=16/${fix.lat.toFixed(5)}/${fix.lon.toFixed(5)}`;
  }
  function render() {
    const el = $s('.sos-pos');
    if (!fix) return;
    const n = nearest(fix.lat, fix.lon);
    el.innerHTML = `<b>${deg(fix.lat, 'N', 'S')}, ${deg(fix.lon, 'E', 'W')}</b><br>`
      + `dokładność ± ${Math.round(fix.acc)} m${fix.alt != null ? ` · ${Math.round(fix.alt)} m n.p.m.` : ''}`
      + `${n ? `<br>ok. ${Math.round(n.d)} m od: <b>${n.name}</b>` : ''}`
      + `<br><small>ustalona o ${new Date(fix.t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</small>`;
    updateSms();
  }
  function locate() {
    const f = lastFix();
    if (f && Date.now() - (f.t || 0) < 60000) { fix = f; render(); }
    if (!navigator.geolocation) { if (!fix) $s('.sos-pos').textContent = 'Ta przeglądarka nie udostępnia lokalizacji.'; return; }
    if (!fix) $s('.sos-pos').textContent = 'Ustalam pozycję GPS…';
    navigator.geolocation.getCurrentPosition((p) => {
      const { latitude: lat, longitude: lon, accuracy: acc, altitude } = p.coords;
      const v = G.snap(lon, lat, 60);
      fix = { lat, lon, acc, alt: v >= 0 ? G.H[v] : altitude, t: Date.now() };
      render();
    }, (e) => { if (!fix) $s('.sos-pos').textContent = `Nie ustalono pozycji (${e.message}). Opisz ratownikom, gdzie jesteś: szlak, kolor, ostatni mijany punkt.`; },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  }
  function updateSms() {
    const num = $s('.sos-phone').value.replace(/[^\d+]/g, '');
    const a = $s('.sos-sms');
    a.href = num ? `sms:${num}?body=${encodeURIComponent(text())}` : '#';
    a.classList.toggle('off', !num);
  }
  function open() {
    try { $s('.sos-phone').value = localStorage.getItem(PHONE) || ''; } catch (e) { /* private mode */ }
    box.hidden = false;
    locate();
    updateSms();
  }
  $s('.sos-close').onclick = () => { box.hidden = true; };
  box.addEventListener('click', (e) => { if (e.target === box) box.hidden = true; });
  $s('.sos-phone').oninput = () => { try { localStorage.setItem(PHONE, $s('.sos-phone').value.trim()); } catch (e) { /* private mode */ } updateSms(); };
  $s('.sos-sms').onclick = (e) => { if ($s('.sos-sms').classList.contains('off')) { e.preventDefault(); $s('.sos-phone').focus(); } };
  $s('.sos-share').onclick = async () => {
    const t = text();
    try {
      if (navigator.share) await navigator.share({ title: 'Moja pozycja', text: t });
      else { await navigator.clipboard.writeText(t); $s('.sos-share').textContent = '✓ Skopiowano'; }
    } catch (e) { /* cancelled */ }
  };
  $s('.sos-refresh').onclick = () => { fix = null; locate(); };
  return { open };
}
