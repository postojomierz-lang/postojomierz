// "Skąd? Dokąd?": type a place (a hut, a peak, a pass, a signpost, a usual trailhead or lake), pick it from the
// suggestions, and the route is planned between them on the marked trails. Polish letters are optional
// ("lysa polana" finds Łysa Polana). The fields follow the route: points set on the map get the name of
// the nearest place.

// trailheads and lakes the trail data has no name for (lat, lon)
const EXTRA = [
  ['Palenica Białczańska (parking)', 49.2547, 20.1046, 'start'], ['Łysa Polana', 49.2667, 20.1172, 'start'],
  ['Wodogrzmoty Mickiewicza', 49.2363, 20.0928, 'start'], ['Morskie Oko (staw)', 49.1972, 20.0716, 'lake'],
  ['Czarny Staw pod Rysami', 49.1887, 20.0753, 'lake'], ['Zakopane, Kuźnice', 49.2700, 19.9806, 'start'],
  ['Brzeziny', 49.2784, 20.0247, 'start'], ['Kiry (Dolina Kościeliska)', 49.2717, 19.8691, 'start'],
  ['Siwa Polana (Dolina Chochołowska)', 49.2798, 19.8086, 'start'], ['Wierch Poroniec', 49.2709, 20.0956, 'start'],
  ['Dolina Strążyska (wejście)', 49.2780, 19.9420, 'start'], ['Dolina Białego (wejście)', 49.2828, 19.9575, 'start'],
  ['Wielki Staw Polski', 49.2105, 20.0390, 'lake'], ['Smreczyński Staw', 49.2140, 19.8500, 'lake'],
];
const ICON = { hut: '⌂', peak: '▲', pass: '⌒', sign: '⊕', start: '🅿', lake: '💧' };
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export function setupSearch({ $, data, G, getStops, setStops, ll, onPicked = () => {} }) {
  // the places: named POIs (one per name, the hut or peak before a signpost of the same name) and the extras
  const seen = new Set(), places = [];
  const order = { hut: 0, peak: 1, pass: 2, sign: 3 };
  for (const p of [...data.poi].sort((a, b) => order[a.k] - order[b.k])) {
    if (!p.n || seen.has(p.n)) continue;
    seen.add(p.n);
    places.push({ n: p.n, k: p.k, e: p.e, lat: p.p[1], lon: p.p[0] });
  }
  for (const [n, lat, lon, k] of EXTRA) places.push({ n, k, lat, lon });
  for (const p of places) p.f = fold(p.n);

  function find(q) {
    const f = fold(q.trim());
    if (f.length < 2) return [];
    const words = f.split(/\s+/);
    const out = [];
    for (const p of places) {
      if (!words.every((w) => p.f.includes(w))) continue;
      const score = (p.f.startsWith(f) ? 0 : p.f.split(/[\s,(-]+/).some((w) => w.startsWith(words[0])) ? 1 : 2)
        + ({ start: -0.4, hut: -0.3, lake: -0.2, peak: 0, pass: 0.3, sign: 0.5 }[p.k] || 0);
      out.push([score, p]);
    }
    // only places a marked trail comes to
    const res = [];
    for (const [, p] of out.sort((a, b) => a[0] - b[0] || a[1].n.length - b[1].n.length)) {
      if (p.v === undefined) p.v = G.snap(p.lon, p.lat, 800);
      if (p.v >= 0) res.push(p);
      if (res.length >= 8) break;
    }
    return res;
  }

  const list = $('q-list');
  let active = null, items = [], sel = -1;
  function show(input) {
    active = input;
    items = find(input.value);
    sel = -1;
    list.innerHTML = items.map((p, i) => `<li data-i="${i}"><span class="k">${ICON[p.k] || '·'}</span>${p.n}${p.e ? ` <small>${p.e} m</small>` : ''}</li>`).join('')
      || (input.value.trim().length >= 2 ? '<li class="none">Nie znam takiego miejsca. Spróbuj inaczej albo kliknij na mapie.</li>' : '');
    list.hidden = !list.innerHTML;
    // under the field
    list.style.top = (input.offsetTop + input.offsetHeight + 2) + 'px';
    fit();
  }
  // on a phone the keyboard covers the lower half: the list ends above it (it scrolls) and the field stays in view
  function fit() {
    const vv = window.visualViewport;
    if (list.hidden || !vv) return;
    list.style.maxHeight = '';
    const bottom = vv.offsetTop + vv.height, r = list.getBoundingClientRect();
    if (r.bottom > bottom - 4) list.style.maxHeight = Math.max(88, bottom - r.top - 6) + 'px';
  }
  if (window.visualViewport) visualViewport.addEventListener('resize', fit);
  function pick(p) {
    list.hidden = true;
    if (!p) return;
    let v = p.v !== undefined ? p.v : G.snap(p.lon, p.lat, 800);
    // a place with several trails close by (a summit reached from two sides): the point of the trail that
    // gives the quickest route from the other end, plus a minute per 6 m off the place itself (the summit, not a point below it)
    const s0 = getStops(), other = active.id === 'q-from' ? (s0.length >= 2 ? s0[s0.length - 1] : -1) : (s0.length ? s0[0] : +$('q-from').dataset.v);
    if (v >= 0 && other >= 0 && !Number.isNaN(other)) {
      const cand = G.near(p.lon, p.lat, 150);
      if (cand.length > 1) {
        const T = G.times(other);
        let best = Infinity;
        for (const [c, d] of cand) { const t = T[c] + d / 6; if (t < best) { best = t; v = c; } }
      }
    }
    if (v < 0) { active.value = ''; active.placeholder = 'Tam nie dochodzi znakowany szlak'; return; }
    active.value = p.n; active.dataset.v = v;
    const s = getStops().slice();
    if (active.id === 'q-from') { if (s.length) s[0] = v; else s.push(v); }
    else if (s.length >= 2) s[s.length - 1] = v;
    else if (s.length === 1) s.push(v);
    else { const from = +$('q-from').dataset.v; s.push(...(from >= 0 && $('q-from').value ? [from, v] : [v])); }
    setStops(s); onPicked();
    if (active.id === 'q-from' && !$('q-to').value) $('q-to').focus();
  }
  for (const id of ['q-from', 'q-to']) {
    const input = $(id);
    input.addEventListener('input', () => show(input));
    input.addEventListener('focus', () => { input.select(); if (input.value) show(input); });
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; [...list.children].forEach((li, i) => li.classList.toggle('on', i === sel)); e.preventDefault(); }
      if (e.key === 'Enter') { pick(items[Math.max(0, sel)]); e.preventDefault(); }
      if (e.key === 'Escape') list.hidden = true;
    });
    input.addEventListener('blur', () => setTimeout(() => { if (active === input && document.activeElement !== input) list.hidden = true; }, 200));
  }
  list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(items[+li.dataset.i]); } });
  $('q-swap').onclick = () => { const s = getStops(); if (s.length >= 2) setStops(s.slice().reverse()); };

  // the fields follow the route: the name of the place nearest to the first and the last point
  function nameAt(v) {
    const [lat, lon] = ll(v);
    let best = null, bd = 0.0035 ** 2;
    for (const p of places) { const d = (p.lat - lat) ** 2 + ((p.lon - lon) * 0.65) ** 2; if (d < bd) { bd = d; best = p; } }
    return best ? best.n : 'punkt na szlaku';
  }
  function sync() {
    const s = getStops();
    for (const [id, v] of [['q-from', s[0]], ['q-to', s.length > 1 ? s[s.length - 1] : undefined]]) {
      const input = $(id);
      if (document.activeElement === input) continue;
      if (v === undefined) { input.value = ''; delete input.dataset.v; continue; }
      if (+input.dataset.v !== v) { input.value = nameAt(v); input.dataset.v = v; }
    }
  }
  return { sync };
}
