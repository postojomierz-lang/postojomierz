// "Skąd? Dokąd?": type a place (a hut, a peak, a pass, a signpost, a usual trailhead, a lake, a waterfall, a viewpoint or a spring), pick it from the
// suggestions, and the route is planned between them on the marked trails. Polish letters are optional
// ("lysa polana" finds Łysa Polana). The fields follow the route: points set on the map get the name of
// the nearest place.

import { NORMS } from './graph.js';
import { HOTELS } from './hotels.js';

// usual trailheads the trail data has no name for (the huts, peaks, passes, signposts, lakes, waterfalls, viewpoints and springs come from it) (lat, lon)
const EXTRA = [
  ['Palenica Białczańska (parking)', 49.2547, 20.1046, 'start'], ['Łysa Polana', 49.2667, 20.1172, 'start'],
  ['Wodogrzmoty Mickiewicza', 49.2363, 20.0928, 'start'], ['Zakopane, Kuźnice', 49.2700, 19.9806, 'start'],
  ['Brzeziny', 49.2784, 20.0247, 'start'], ['Kiry (Dolina Kościeliska)', 49.2717, 19.8691, 'start'],
  ['Siwa Polana (Dolina Chochołowska)', 49.2798, 19.8086, 'start'], ['Wierch Poroniec', 49.2709, 20.0956, 'start'],
  ['Dolina Strążyska (wejście)', 49.2780, 19.9420, 'start'], ['Dolina Białego (wejście)', 49.2828, 19.9575, 'start'],
];
const ICON = { hotel: '🏨', hut: '⌂', peak: '▲', pass: '⌒', sign: '⊕', start: '🅿', lake: '💧', fall: '🌊', view: '👁', spring: '🚰' };
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export function setupSearch({ $, data, G, getStops, setStops, ll, onPicked = () => {} }) {
  // the places: named POIs (one per name, the hut or peak before a signpost of the same name) and the extras
  const seen = new Set(), places = [];
  const order = { hut: 0, peak: 1, lake: 2, fall: 2, view: 2, spring: 3, pass: 3, sign: 4 };
  // (two summits of one name, as Świnica's 2291 m and 2302 m: the higher one, the main summit)
  for (const p of [...data.poi].sort((a, b) => order[a.k] - order[b.k] || (b.e || 0) - (a.e || 0))) {
    if (!p.n || seen.has(p.n)) continue;
    seen.add(p.n);
    places.push({ n: p.n, k: p.k, e: p.e, lat: p.p[1], lon: p.p[0] });
  }
  for (const [n, lat, lon, k] of EXTRA) places.push({ n, k, lat, lon });
  for (const [n, lat, lon] of HOTELS) if (!seen.has(n)) places.push({ n, k: 'hotel', lat, lon });
  // ("hotel patria" finds Patria too)
  const named = [...data.poi.filter((p) => p.n).map((p) => ({ n: p.n, k: p.k, lat: p.p[1], lon: p.p[0] })), ...places.filter((p) => p.k !== 'hotel' && !data.poi.some((q) => q.n === p.n))];
  for (const p of places) p.f = fold(p.n) + (p.k === 'hotel' && !/hotel/i.test(p.n) ? ' hotel' : '');

  function find(q) {
    const f = fold(q.trim());
    if (f.length < 2) return [];
    const words = f.split(/\s+/);
    const out = [];
    for (const p of places) {
      if (!words.every((w) => p.f.includes(w))) continue;
      if (p.v === undefined) reach(p);
      if (p.v < 0) continue;
      // the very name first ("Zawrat", not Zawratowa Turnia), places a trail does not reach last
      const score = (p.f === f ? -1 : p.f.startsWith(f) ? 0 : p.f.split(/[\s,(-]+/).some((w) => w.startsWith(words[0])) ? 1 : 2)
        + ({ start: -0.4, hut: -0.3, hotel: -0.2, peak: -0.1, lake: 0, fall: -0.2, view: -0.1, spring: 0.1, pass: 0.3, sign: 0.5 }[p.k] || 0)
        + (p.below ? 1.5 : 0);
      out.push([score, p]);
    }
    // only places a marked trail comes to (a summit or a pass with no trail: the nearest trail point, said so)
    const res = [];
    for (const [, p] of out.sort((a, b) => a[0] - b[0] || a[1].n.length - b[1].n.length)) {
      res.push(p);
      if (res.length >= 8) break;
    }
    return res;
  }
  // a summit or a pass counts as reached by a trail within 120 m and 40 m of height of it (the trail to
  // Gerlach's foot ended 780 m away and 684 m lower, still named "Gerlach"); other places within 800 m
  function reach(p) {
    p.v = G.snap(p.lon, p.lat, 800);
    p.below = null;
    if (p.v < 0 || (p.k !== 'peak' && p.k !== 'pass')) return;
    const ok = G.near(p.lon, p.lat, 120).filter(([v]) => p.e == null || Math.abs(p.e - G.H[v]) <= 40);
    // the trail's point nearest the summit's height, not merely the nearest (on a side path below it)
    if (ok.length) { if (p.e != null) p.v = ok.reduce((a, b) => (Math.abs(p.e - G.H[b[0]]) + b[1] / 10 < Math.abs(p.e - G.H[a[0]]) + a[1] / 10 ? b : a))[0]; return; }
    const [lat, lon] = ll(p.v), d = Math.hypot((lon - p.lon) * G.mx, (lat - p.lat) * G.mz);
    p.below = { d: Math.round(d / 10) * 10, h: p.e != null ? Math.round((p.e - G.H[p.v]) / 10) * 10 : null };
  }
  const nearest = (b) => `najbliżej ${b.d} m${b.h > 0 ? `, ${b.h} m niżej` : ''}`;
  const belowText = (p) => `${p.k === 'pass' ? 'na przełęcz' : 'na szczyt'} nie prowadzi szlak · ${nearest(p.below)}`;

  const list = $('q-list');
  let active = null, items = [], sel = -1;
  function show(input) {
    active = input;
    items = find(input.value);
    sel = -1;
    list.innerHTML = items.map((p, i) => `<li data-i="${i}"><span class="k">${ICON[p.k] || '·'}</span><span class="n">${p.n}</span>${p.e ? ` <small>${p.e} m</small>` : ''}${p.below ? `<small class="nb">${belowText(p)}</small>` : ''}</li>`).join('')
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
    if (p.v === undefined) reach(p);
    let v = p.v;
    // a place with several trails close by (a summit reached from two sides): the point of the trail that
    // gives the quickest route from the other end, plus a minute per 6 m off the place itself (the summit, not a point below it)
    const s0 = getStops(), other = active.id === 'q-from' ? (s0.length >= 2 ? s0[s0.length - 1] : -1) : (s0.length ? s0[0] : +$('q-from').dataset.v);
    if (v >= 0 && !p.below && other >= 0 && !Number.isNaN(other)) {
      // only the points close to the summit's height when the trail has some (the last stretch of Orla Perć,
      // slowed by its correction, let the route stop 40 m below Kozi Wierch)
      const all = G.near(p.lon, p.lat, 150), top = p.e != null ? all.filter(([c]) => p.e - G.H[c] <= 25) : [];
      const cand = top.length ? top : all;
      if (cand.length && (cand.length > 1 || cand[0][0] !== v)) {
        const T = G.times(other);
        let best = Infinity;
        // the rest of the way to the place itself counts as walked, climb included (a flat minute per 6 m let
        // the route stop 30 m and 33 m of height below Wielki Giewont, as that last bit is steeper)
        const up = (c) => (p.e ? Math.max(0, p.e - G.H[c]) / 100 * NORMS.upSteep : 0);
        for (const [c, d] of cand) { const t = T[c] + d / 6 + up(c); if (t < best) { best = t; v = c; } }
      }
    }
    if (v < 0) { active.value = ''; active.placeholder = 'Tam nie dochodzi znakowany szlak'; return; }
    // no trail to the top: the field says where the route really ends
    active.value = p.below ? `pod: ${p.n} (${nearest(p.below)})` : p.n; active.dataset.v = v;
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
    // a hotel only where no hut, summit or other place of the trails is near (by Bilíkova chata a guesthouse
    // at Hrebienok named both ends of the route)
    // (every named point counts here, the signposts too: the list above keeps one place per name, so the
    // Hrebienok signpost gave way to the summit of that name 230 m off)
    for (const hotels of [false, true]) {
      let best = null, bd = 0.0035 ** 2;
      for (const p of hotels ? places : named) {
        if ((p.k === 'hotel') !== hotels) continue;
        const d = (p.lat - lat) ** 2 + ((p.lon - lon) * 0.65) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (best) return best.n;
    }
    return 'punkt na szlaku';
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
