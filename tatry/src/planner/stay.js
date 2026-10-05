// 🗓 A stay in the mountains: who comes (adults with their fitness, children with their age), how many days
// and where they sleep; the plan suggests a route a day from a catalogue of classic Tatra walks, each one
// measured on the trail graph (time by the PTTK norms, climb, the top, chains and exposed stretches from
// OpenStreetMap). The weakest member of the group sets the limits; children walk slower. The days go from an
// easy start, the hardest in the middle, a rest day every fourth day and an easy last day. With a start date
// within the 16-day forecast the plan follows the weather: the valley walks (and the rest days) go to the
// rainy and stormy days, the summits to the good ones.

import { ICON, WMO, fetchTimeout } from './daylight.js';

const KEY = 'szlakownik-stay';

// classic walks: [name, start [lon, lat], goal [lon, lat], kind, via?, end?] — there and back the same way, or
// with via (points after the goal) a loop back to the start, or with end a traverse to another trailhead
// kinds: 'dolina' (valley, fine in bad weather), 'hala' (huts and passes), 'szczyt' (summits)
const KUZ = [19.9806, 49.2700], PAL = [20.1046, 49.2547], KIRY = [19.8691, 49.2717], SIWA = [19.8086, 49.2798];
const STRAZ = [19.9420, 49.2780], HREB = [20.2250, 49.1588];
const STRB = [20.0632, 49.1176], LOMN = [20.2704, 49.1665], POLI = [20.1742, 49.1396];
const WALKS = [
  ['Dolina Kościeliska i Hala Ornak', KIRY, [19.8587, 49.2292], 'dolina'],
  ['Dolina Chochołowska, Polana Chochołowska', SIWA, [19.7878, 49.2363], 'dolina'],
  ['Morskie Oko', PAL, [20.0713, 49.2014], 'dolina'],
  ['Dolina Strążyska (Polana Strążyska)', STRAZ, [19.9297, 49.2630], 'dolina'],
  ['Dolina Białego', [19.9575, 49.2828], [19.9642, 49.2627], 'dolina'],
  ['Rusinowa Polana i Gęsia Szyja', [20.0956, 49.2709], [20.0765, 49.2590], 'hala'],
  ['Hala Gąsienicowa (Murowaniec)', KUZ, [20.0072, 49.2434], 'hala'],
  ['Czarny Staw Gąsienicowy', KUZ, [20.0147, 49.2326], 'hala'],
  ['Dolina Pięciu Stawów Polskich', PAL, [20.0487, 49.2136], 'hala'],
  ['Nosal', KUZ, [19.9895, 49.2764], 'szczyt'],
  ['Sarnia Skała', STRAZ, [19.9410, 49.2649], 'szczyt'],
  ['Kasprowy Wierch (pieszo)', KUZ, [19.9816, 49.2318], 'szczyt'],
  ['Giewont', KUZ, [19.9341, 49.2510], 'szczyt'],
  ['Czerwone Wierchy (Ciemniak)', KIRY, [19.9034, 49.2310], 'szczyt'],
  ['Starorobociański Wierch', SIWA, [19.8199, 49.1995], 'szczyt'],
  ['Wołowiec', SIWA, [19.7631, 49.2076], 'szczyt'],
  ['Świnica', KUZ, [20.0093, 49.2194], 'szczyt'],
  ['Zawrat', KUZ, [20.0164, 49.2191], 'szczyt'],
  ['Rysy (od polskiej strony)', PAL, [20.0885, 49.1793], 'szczyt'],
  ['Popradské pleso', [20.0632, 49.1176], [20.0794, 49.1549], 'hala'],
  ['Vodopády Studeného potoka (od Hrebienka)', HREB, [20.2222, 49.1649], 'dolina'],
  ['Rainerova chata', HREB, [20.2186, 49.1669], 'dolina'],
  ['Zamkovského chata', HREB, [20.2197, 49.1740], 'hala'],
  ['Chata pod Soliskom', [20.0632, 49.1176], [20.0410, 49.1441], 'hala'],
  ['Sliezsky dom (Velické pleso)', [20.1742, 49.1396], [20.1572, 49.1561], 'hala'],
  ['Skalnaté pleso', LOMN, [20.2335, 49.1884], 'hala'],
  ['Téryho chata', HREB, [20.1990, 49.1902], 'hala'],
  ['Zbojnícka chata', HREB, [20.1676, 49.1766], 'hala'],
  // loops and traverses
  ['Kasprowy Wierch, zejście przez Halę Gąsienicową (pętla)', KUZ, [19.9816, 49.2318], 'szczyt', [[20.0072, 49.2434]]],
  ['Dolina Pięciu Stawów i Morskie Oko przez Świstówkę (pętla)', PAL, [20.0487, 49.2136], 'hala', [[20.0713, 49.2014]]],
  ['Rusinowa Polana: z Wierchu Porońca do Palenicy (przejście)', [20.0956, 49.2709], [20.0765, 49.2590], 'hala', [], PAL],
  ['Sarnia Skała: ze Strążyskiej do Doliny Białego (przejście)', STRAZ, [19.9410, 49.2649], 'szczyt', [], [19.9575, 49.2828]],
  // the Slovak side
  ['Magistrala: Hrebienok, Zamkovského chata, Skalnaté pleso, zejście do Tatranskej Lomnicy (przejście)', HREB, [20.2197, 49.1740], 'hala', [[20.2335, 49.1884]], LOMN],
  ['Magistrala: ze Štrbského Plesa przez Popradské pleso i Ostrvę do Sliezskiego domu (przejście)', STRB, [20.0794, 49.1549], 'hala', [[20.0914, 49.1502], [20.1323, 49.1515], [20.1572, 49.1561]], POLI],
  ['Hrebienok, Sliezsky dom, zejście do Tatranskej Polianki (przejście)', HREB, [20.1572, 49.1561], 'hala', [], POLI],
  ['Chata pod Soliskom, powrót Doliną Furkotną (pętla)', STRB, [20.0410, 49.1441], 'hala', [[20.0370, 49.1325]]],
  ['Téryho chata, Priečne sedlo, Zbojnícka chata (pętla)', HREB, [20.1990, 49.1902], 'szczyt', [[20.1676, 49.1766]]],
  ['Rysy od słowackiej strony (Chata pod Rysmi)', STRB, [20.0881, 49.1795], 'szczyt'],
];

// how to get to the trailheads: [point, note]; the nearest within 600 m
const STARTS = [
  [KUZ, 'Kuźnice: busy z Zakopanego (rondo Kuźnickie), parking tylko w mieście'],
  [PAL, 'Palenica Białczańska: busy z Zakopanego (dworzec), parking płatny z rezerwacją internetową TPN'],
  [KIRY, 'Kiry: busy z Zakopanego, parking płatny'],
  [SIWA, 'Siwa Polana: busy z Zakopanego, parking płatny'],
  [STRAZ, 'Strążyska: z centrum Zakopanego pieszo ok. 30 min lub busem'],
  [[19.9575, 49.2828], 'Dolina Białego: z centrum Zakopanego pieszo ok. 20 min'],
  [[20.0956, 49.2709], 'Wierch Poroniec: busy z Zakopanego w stronę Morskiego Oka'],
  [HREB, 'Hrebienok: kolejka ze Starého Smokovca lub pieszo ok. 45 min'],
  [[20.0632, 49.1176], 'Štrbské Pleso: elektriczka TEŽ, autobusy, parking płatny'],
  [[20.1742, 49.1396], 'Tatranská Polianka: elektriczka TEŽ'],
  [LOMN, 'Tatranská Lomnica: elektriczka TEŽ, kolejka gondolowa do Skalnatého plesa'],
];

// where one sleeps: [name, lon, lat, Slovak side]
const BASES = [
  ['Zakopane', 19.9496, 49.2992, false], ['Kościelisko', 19.8900, 49.2900, false], ['Bukowina Tatrzańska', 20.1090, 49.3437, false],
  ['Murzasichle', 20.0500, 49.3100, false], ['Štrbské Pleso', 20.0608, 49.1194, true], ['Starý Smokovec', 20.2205, 49.1393, true],
  ['Tatranská Lomnica', 20.2795, 49.1650, true], ['Ždiar', 20.2620, 49.2710, true],
];
const slovak = (p) => p[1] < 49.19;            // the trailheads: all the Slovak ones lie south of the main ridge

// the limits of one person: hours of walking (at their own pace, the PTTK time times the pace factor), metres of climb, the top,
// chains and exposure allowed, and the pace (children walk slower than the norms)
function limits(p) {
  if (p.kid) {
    const a = p.age;
    if (a < 6) return { h: 2.5, up: 350, top: 1400, chains: false, alpine: 0, pace: 1.5 };
    if (a < 10) return { h: 4.5, up: 700, top: 1700, chains: false, alpine: 0, pace: 1.3 };
    if (a < 14) return { h: 6, up: 1000, top: 2000, chains: true, alpine: 0, pace: 1.15 };
    return { h: 7, up: 1200, top: 2300, chains: true, alpine: 4, pace: 1.05 };
  }
  return [{ h: 4.5, up: 700, top: 1900, chains: false, alpine: 0, pace: 1.15 },
    { h: 7, up: 1200, top: 2300, chains: true, alpine: 4, pace: 1 },
    { h: 9.5, up: 1800, top: 2500, chains: true, alpine: 5, pace: 0.95 }][p.fit];
}
function groupLimits(people, noChains) {
  const L = people.map(limits);
  const g = { h: Math.min(...L.map((l) => l.h)), up: Math.min(...L.map((l) => l.up)), top: Math.min(...L.map((l) => l.top)),
    chains: L.every((l) => l.chains) && !noChains, alpine: Math.min(...L.map((l) => l.alpine)), pace: Math.max(...L.map((l) => l.pace)) };
  if (noChains) g.alpine = Math.min(g.alpine, 0);
  return g;
}

const km = (a, b) => Math.hypot((a[0] - b[0]) * 72.7, (a[1] - b[1]) * 111.2);
const howTo = (p) => { const s = STARTS.find(([q]) => km(p, q) < 0.6); return s ? s[1] : ''; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// the daily forecast for the mountains (Hala Gąsienicowa, 1500 m; Open-Meteo gives 16 days): {date: day}
async function dailyForecast() {
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: '49.2434', longitude: '20.0072', elevation: '1500', timezone: 'Europe/Warsaw', forecast_days: '16',
    daily: 'weather_code,temperature_2m_max,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max',
  });
  try {
    const d = (await (await fetchTimeout(url)).json()).daily, out = {};
    d.time.forEach((t, i) => {
      const code = d.weather_code[i], rainP = d.precipitation_probability_max[i] ?? 0, rain = d.precipitation_sum[i] ?? 0;
      const gust = d.wind_gusts_10m_max[i] ?? 0;
      // bad for the summits: a storm, real rain or a gale on the ridges
      const why = code >= 95 ? 'burze' : rainP >= 60 && rain >= 3 ? `deszcz ${Math.round(rain)} mm` : gust >= 70 ? `wiatr do ${Math.round(gust)} km/h` : '';
      out[t] = { code, t: d.temperature_2m_max[i], rainP, bad: !!why, why };
    });
    return out;
  } catch (e) { return null; }
}

// G: the trail graph; along(path): chains and alpine stretches (main.js hardAlong); onOpen(stops): show a walk
export function setupStay({ G, along, onOpen, $ }) {
  let fc = null;                             // the daily forecast, fetched with the first plan
  let measured = null;                       // the catalogue measured on the graph (once)
  function measure() {
    if (measured) return measured;
    measured = [];
    for (const [name, a, b, kind, via = [], end = null] of WALKS) {
      const snap = (p) => G.snap(p[0], p[1], 400);
      const stops = [a, b, ...via, end || a].map(snap);
      if (stops.some((k) => k < 0) || stops[0] === stops[1]) continue;
      const path = G.routeVia(stops);
      if (!path) continue;
      const sum = G.summary(path), o = along(path);
      const shape = end ? 'przejście' : via.length ? 'pętla' : 'tam i z powrotem';
      measured.push({ name, kind, start: a, goal: b, keys: [b, ...via], end: end || a, shape, stops, time: sum.time, up: sum.up, dist: sum.dist, top: sum.maxE,
        chains: o.chainM >= 20, alpine: o.alpineM >= 100 ? o.grade : 0 });   // a side path passing by does not count
    }
    return measured;
  }

  // the form: people, days, base, chains; kept on the device
  let st = { people: [{ kid: false, fit: 1 }], days: 5, base: 0, noChains: false, from: '' };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* full */ } };
  $('st-base').innerHTML = BASES.map(([n], i) => `<option value="${i}">${n}</option>`).join('');

  function renderPeople() {
    $('st-people').innerHTML = st.people.map((p, i) => `<li data-i="${i}">
      <select data-k="kind"><option value="a" ${p.kid ? '' : 'selected'}>dorosły</option><option value="k" ${p.kid ? 'selected' : ''}>dziecko</option></select>
      ${p.kid ? `<label>wiek <input data-k="age" type="number" min="1" max="17" value="${p.age || 8}"></label>`
        : `<select data-k="fit"><option value="0" ${p.fit === 0 ? 'selected' : ''}>słaba kondycja</option><option value="1" ${p.fit === 1 ? 'selected' : ''}>średnia</option><option value="2" ${p.fit === 2 ? 'selected' : ''}>dobra, chodzę po górach</option></select>`}
      ${st.people.length > 1 ? '<button data-k="del" title="Usuń">✕</button>' : ''}</li>`).join('');
    $('st-people').querySelectorAll('li').forEach((li) => {
      const p = st.people[+li.dataset.i];
      li.querySelectorAll('[data-k]').forEach((el) => {
        const k = el.dataset.k;
        if (k === 'del') el.onclick = () => { st.people.splice(+li.dataset.i, 1); save(); renderPeople(); };
        else el.onchange = () => {
          if (k === 'kind') { p.kid = el.value === 'k'; if (p.kid && !p.age) p.age = 8; if (!p.kid && p.fit == null) p.fit = 1; renderPeople(); }
          if (k === 'age') p.age = Math.max(1, Math.min(17, +el.value || 8));
          if (k === 'fit') p.fit = +el.value;
          save();
        };
      });
    });
  }
  $('st-add').onclick = () => { st.people.push({ kid: true, age: 8 }); save(); renderPeople(); };
  const tomorrow = ymd(new Date(Date.now() + 864e5));
  if (!st.from || st.from < ymd(new Date())) st.from = tomorrow;   // a stay in the past: from tomorrow
  $('st-from').value = st.from; $('st-from').min = ymd(new Date());
  $('st-from').onchange = () => { st.from = $('st-from').value || tomorrow; save(); };
  $('st-days').value = st.days; $('st-base').value = st.base; $('st-nochains').checked = st.noChains;
  $('st-days').onchange = () => { st.days = Math.max(1, Math.min(14, +$('st-days').value || 5)); $('st-days').value = st.days; save(); };
  $('st-base').onchange = () => { st.base = +$('st-base').value; save(); };
  $('st-nochains').onchange = () => { st.noChains = $('st-nochains').checked; save(); };
  renderPeople();

  $('st-go').onclick = async () => {
    $('st-go').disabled = true;
    if (!fc) fc = await dailyForecast();
    $('st-go').disabled = false;
    const day0 = new Date(st.from + 'T12:00'), dateOf = (d) => new Date(day0.getTime() + d * 864e5);
    const wx = (d) => fc && fc[ymd(dateOf(d))];
    const lim = groupLimits(st.people, st.noChains), base = BASES[st.base];
    const all = measure();
    const fits = all.filter((w) => w.time * lim.pace / 60 <= lim.h && w.up <= lim.up && w.top <= lim.top && (lim.chains || !w.chains) && w.alpine <= lim.alpine);
    // the effort of a walk, and the journey from the base (straight line, by bus or car ~35 km/h; across the
    // border the road goes round through Łysa Polana)
    const effort = (w) => w.time / 60 + w.up / 400;
    const ride = (w) => Math.round(10 + km([base[1], base[2]], w.start) * 1.4 / 35 * 60 + (slovak(w.start) !== base[3] ? 40 : 0));
    // the order of the days: rest every fourth day (from 4 days on), the easy ones first and last, the hard in the middle
    const n = st.days, plan = new Array(n).fill(null);
    const restDays = new Set();
    if (n >= 4) for (let d = 3; d < n - 1; d += 4) restDays.add(d);
    const walkDays = [...Array(n).keys()].filter((d) => !restDays.has(d));
    // the walks, the farther ones counted a little harder; the most effort fitting, spread out
    let pool = fits.map((w) => ({ ...w, i: all.indexOf(w), score: effort(w) + ride(w) / 90 })).sort((a, b) => a.score - b.score);
    // a fit group skips the shortest strolls when there are enough walks that use its days well
    const cap = lim.h + lim.up / 400, worth = pool.filter((w) => effort(w) >= cap * 0.3);
    if (worth.length >= Math.min(pool.length, walkDays.length)) pool = worth;
    // the walks near the base (up to 75 min away), with the nearest farther ones only when there are too few
    const byRide = [...pool].sort((a, b) => ride(a) - ride(b));
    const near = pool.filter((w) => ride(w) <= 75).length;
    pool = byRide.slice(0, Math.max(near, walkDays.length)).sort((a, b) => a.score - b.score);
    const picked = [];
    if (pool.length) {
      // take an even spread from easy to hard, as many as there are walking days (no repeats while there are enough)
      for (let k = 0; k < walkDays.length; k++) picked.push(pool[Math.min(pool.length - 1, Math.round(k * (pool.length - 1) / Math.max(1, walkDays.length - 1)))]);
    }
    // no two walks to the same place (the goal or a point on the way: Morskie Oko and the loop through it);
    // of a there-and-back and a loop or traverse, the loop
    const same = (q, w) => q.keys.some((a) => w.keys.some((b) => km(a, b) < 0.3));
    const uniq = [];
    for (const w of new Set(picked)) {
      const clash = uniq.filter((q) => same(q, w));
      if (!clash.length) uniq.push(w);
      else if (w.shape !== 'tam i z powrotem' && clash.every((q) => q.shape === 'tam i z powrotem')) {
        uniq[uniq.indexOf(clash[0])] = w;                   // a loop through two goals replaces both
        clash.slice(1).forEach((q) => uniq.splice(uniq.indexOf(q), 1));
      }
    }
    // and the days left free filled with other walks that fit, the near ones first, then the nearest farther
    for (const w of [...pool, ...byRide]) if (uniq.length < walkDays.length && !uniq.some((q) => same(q, w))) uniq.push(w);
    // easy first, the hardest in the middle, easy last
    const asc = uniq.sort((a, b) => a.score - b.score), rest = asc.slice(1);
    const order = [...asc.slice(0, 1), ...rest.filter((w, k) => k % 2 === 0), ...rest.filter((w, k) => k % 2 === 1).reverse()];
    walkDays.forEach((d, k) => { plan[d] = order[k] || null; });

    // the weather: a summit on a stormy, rainy or windy day swaps with a valley walk on a fair day, else with a
    // fair rest day, else gives way to a valley walk not in the plan yet (days past the forecast count as fair)
    const bad = (d) => !!(wx(d) && wx(d).bad), fair = (d) => !bad(d), days = [...Array(n).keys()];
    const moved = new Set();
    for (const d of days) {
      const w = plan[d];
      if (!bad(d) || restDays.has(d) || !w || w.kind === 'dolina') continue;
      let e = days.find((k) => fair(k) && !restDays.has(k) && plan[k] && plan[k].kind === 'dolina');
      if (e != null) { [plan[d], plan[e]] = [plan[e], plan[d]]; moved.add(d).add(e); continue; }
      e = [...restDays].find(fair);
      if (e != null) { restDays.delete(e); restDays.add(d); plan[e] = w; plan[d] = null; moved.add(d).add(e); continue; }
      const v = fits.find((x) => x.kind === 'dolina' && !plan.some((q) => q && q.name === x.name));
      if (v) { plan[d] = { ...v, i: all.indexOf(v) }; moved.add(d); }
    }

    const kids = st.people.filter((p) => p.kid);
    const who = `${st.people.length - kids.length} ${st.people.length - kids.length === 1 ? 'dorosły' : 'dorosłych'}${kids.length ? ` i ${kids.length === 1 ? 'dziecko' : `${kids.length} dzieci`} (${kids.map((k) => `${k.age} l.`).join(', ')})` : ''}`;
    const hm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    let html = `<p class="st-sum">${n} ${n === 1 ? 'dzień' : 'dni'} · ${base[0]} · ${who}. Limity grupy: do ${hm(lim.h * 60)} h marszu, ${lim.up} m podejścia, `
      + `${lim.top} m n.p.m., ${lim.chains ? 'łańcuchy dozwolone' : 'bez łańcuchów'}${lim.pace > 1.02 ? `; czasy wydłużone ×${String(lim.pace).replace('.', ',')} (${st.people.some((p) => p.kid) ? 'tempo dzieci' : 'tempo grupy'})` : ''}.</p>`;
    const known = days.filter((d) => wx(d)).length;
    if (fc && known) html += `<p class="src">Prognoza dla gór (1500 m) na ${known === n ? 'wszystkie dni' : `${known} z ${n} dni (dalej jeszcze jej nie ma)`}`
      + `${moved.size ? '; trasy przestawione tak, by w złą pogodę iść doliną albo odpoczywać' : ''}.</p>`;
    else if (!fc) html += '<p class="src">Prognoza niedostępna (brak sieci?): plan bez pogody.</p>';
    else html += '<p class="src">Prognoza sięga 16 dni naprzód: przy tym terminie plan jest jeszcze bez pogody.</p>';
    if (!fits.length) html += '<p>Żadna trasa z katalogu nie mieści się w limitach. Spróbuj z lepszą kondycją albo bez ograniczeń.</p>';
    const DOW = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
    const head = (d, t) => {
      const dt = dateOf(d), f = wx(d);
      const chip = f ? `<span class="wx${f.bad ? ' bad' : ''}" title="${WMO[f.code] || ''}">${ICON(f.code)} ${Math.round(f.t)}° · ${f.rainP}%${f.bad ? ` · ${f.why}` : ''}</span>` : '';
      return `${chip}<b>${DOW[dt.getDay()]} ${dt.getDate()}.${dt.getMonth() + 1}: ${t}</b>`;
    };
    html += '<ol class="st-days">' + plan.map((w, d) => {
      if (restDays.has(d)) return `<li>${head(d, 'odpoczynek')}<span>${base[3] ? 'Krótki spacer, kolejką na Hrebienok albo Skalnaté pleso, termy (np. AquaCity w Popradzie)' : 'Krótki spacer, Gubałówka kolejką, termy'}. Nogi odpoczną przed dalszymi trasami.</span></li>`;
      if (!w) return `<li>${head(d, 'wolny')}<span>Powtórz ulubioną trasę albo odpocznij.</span></li>`;
      const tags = [w.kind === 'dolina' ? '🌧 dobra na gorszą pogodę' : '', w.chains ? '⛓ łańcuchy' : '', w.alpine ? `⚠ teren T${w.alpine}` : ''].filter(Boolean).join(' · ');
      const there = howTo(w.start), back = w.shape === 'przejście' ? howTo(w.end) : '';
      return `<li>${head(d, w.name)}<span>${(w.dist / 1000).toFixed(1).replace('.', ',')} km, ${w.shape} · ok. ${hm(w.time * lim.pace)} h marszu${Math.abs(lim.pace - 1) > 0.02 ? ' w tempie grupy' : ''} · ↗ ${Math.round(w.up)} m · do ${Math.round(w.top)} m n.p.m.${tags ? ` · ${tags}` : ''}</span>`
        + `<span class="ride">🚌 dojazd ok. ${ride(w)} min${there ? `. ${there}` : ''}${back ? `. Powrót: ${back}` : ''}</span>`
        + `<button class="chip" data-w="${w.i}">Pokaż trasę</button></li>`;
    }).join('') + '</ol>'
      + '<p class="src">Plan z katalogu klasycznych tras; czasy wg norm PTTK, bez postojów. Rozkłady busów i elektriczki: e-podroznik.pl, cp.sk. '
      + 'Przed każdym wyjściem sprawdź prognozę godzinową na trasie i komunikat TOPR / HZS.</p>';
    $('st-plan').innerHTML = html;
    $('st-plan').querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => onOpen(all[+b.dataset.w].stops); });
  };
}
