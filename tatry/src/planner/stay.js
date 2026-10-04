// 🗓 A stay in the mountains: who comes (adults with their fitness, children with their age), how many days
// and where they sleep; the plan suggests a route a day from a catalogue of classic Tatra walks, each one
// measured on the trail graph (time by the PTTK norms, climb, the top, chains and exposed stretches from
// OpenStreetMap). The weakest member of the group sets the limits; children walk slower. The days go from an
// easy start, the hardest in the middle, a rest day every fourth day and an easy last day.

const KEY = 'szlakownik-stay';

// classic walks: [name, start [lon, lat], goal [lon, lat], kind] — there and back the same way
// kinds: 'dolina' (valley, fine in bad weather), 'hala' (huts and passes), 'szczyt' (summits)
const KUZ = [19.9806, 49.2700], PAL = [20.1046, 49.2547], KIRY = [19.8691, 49.2717], SIWA = [19.8086, 49.2798];
const STRAZ = [19.9420, 49.2780], HREB = [20.2250, 49.1588];
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
  ['Skalnaté pleso', [20.2885, 49.1612], [20.2335, 49.1884], 'hala'],
  ['Téryho chata', HREB, [20.1990, 49.1902], 'hala'],
  ['Zbojnícka chata', HREB, [20.1676, 49.1766], 'hala'],
];

// where one sleeps: [name, lon, lat]
const BASES = [
  ['Zakopane', 19.9496, 49.2992], ['Kościelisko', 19.8900, 49.2900], ['Bukowina Tatrzańska', 20.1090, 49.3437],
  ['Murzasichle', 20.0500, 49.3100], ['Štrbské Pleso', 20.0608, 49.1194], ['Starý Smokovec', 20.2205, 49.1393],
  ['Tatranská Lomnica', 20.2795, 49.1650], ['Ždiar', 20.2620, 49.2710],
];

// the limits of one person: hours of walking (PTTK time, before the pace factor), metres of climb, the top,
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

// G: the trail graph; along(path): chains and alpine stretches (main.js hardAlong); onOpen(stops): show a walk
export function setupStay({ G, along, onOpen, $ }) {
  let measured = null;                       // the catalogue measured on the graph (once)
  function measure() {
    if (measured) return measured;
    measured = [];
    for (const [name, a, b, kind] of WALKS) {
      const s = G.snap(a[0], a[1], 400), t = G.snap(b[0], b[1], 400);
      if (s < 0 || t < 0 || s === t) continue;
      const path = G.routeVia([s, t, s]);
      if (!path) continue;
      const sum = G.summary(path), o = along(path);
      measured.push({ name, kind, start: a, stops: [s, t, s], time: sum.time, up: sum.up, dist: sum.dist, top: sum.maxE,
        chains: o.chainM >= 20, alpine: o.alpineM >= 100 ? o.grade : 0 });   // a side path passing by does not count
    }
    return measured;
  }

  // the form: people, days, base, chains; kept on the device
  let st = { people: [{ kid: false, fit: 1 }], days: 5, base: 0, noChains: false };
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
  $('st-days').value = st.days; $('st-base').value = st.base; $('st-nochains').checked = st.noChains;
  $('st-days').onchange = () => { st.days = Math.max(1, Math.min(14, +$('st-days').value || 5)); $('st-days').value = st.days; save(); };
  $('st-base').onchange = () => { st.base = +$('st-base').value; save(); };
  $('st-nochains').onchange = () => { st.noChains = $('st-nochains').checked; save(); };
  renderPeople();

  $('st-go').onclick = () => {
    const lim = groupLimits(st.people, st.noChains), base = BASES[st.base];
    const all = measure();
    const fits = all.filter((w) => w.time / 60 <= lim.h && w.up <= lim.up && w.top <= lim.top && (lim.chains || !w.chains) && w.alpine <= lim.alpine);
    // the effort of a walk, and the journey from the base (straight line, by bus or car ~35 km/h)
    const effort = (w) => w.time / 60 + w.up / 400;
    const ride = (w) => Math.round(10 + km([base[1], base[2]], w.start) * 1.4 / 35 * 60);
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
    const picked = [];
    if (pool.length) {
      // take an even spread from easy to hard, as many as there are walking days (no repeats while there are enough)
      for (let k = 0; k < walkDays.length; k++) picked.push(pool[Math.min(pool.length - 1, Math.round(k * (pool.length - 1) / Math.max(1, walkDays.length - 1)))]);
    }
    const uniq = [...new Set(picked)];
    // easy first, the hardest in the middle, easy last
    const asc = uniq.sort((a, b) => a.score - b.score), rest = asc.slice(1);
    const order = [...asc.slice(0, 1), ...rest.filter((w, k) => k % 2 === 0), ...rest.filter((w, k) => k % 2 === 1).reverse()];
    walkDays.forEach((d, k) => { plan[d] = order[k] || null; });

    const kids = st.people.filter((p) => p.kid);
    const who = `${st.people.length - kids.length} ${st.people.length - kids.length === 1 ? 'dorosły' : 'dorosłych'}${kids.length ? ` i ${kids.length === 1 ? 'dziecko' : `${kids.length} dzieci`} (${kids.map((k) => `${k.age} l.`).join(', ')})` : ''}`;
    const hm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    let html = `<p class="st-sum">${n} ${n === 1 ? 'dzień' : 'dni'} · ${base[0]} · ${who}. Limity grupy: do ${hm(lim.h * 60)} h marszu, ${lim.up} m podejścia, `
      + `${lim.top} m n.p.m., ${lim.chains ? 'łańcuchy dozwolone' : 'bez łańcuchów'}${lim.pace > 1.02 ? `; czasy wydłużone ×${String(lim.pace).replace('.', ',')} (tempo dzieci)` : ''}.</p>`;
    if (!fits.length) html += '<p>Żadna trasa z katalogu nie mieści się w limitach. Spróbuj z lepszą kondycją albo bez ograniczeń.</p>';
    html += '<ol class="st-days">' + plan.map((w, d) => {
      if (restDays.has(d)) return `<li><b>Dzień ${d + 1}: odpoczynek</b><span>Krótki spacer, Gubałówka kolejką, termy. Nogi odpoczną przed dalszymi trasami.</span></li>`;
      if (!w) return `<li><b>Dzień ${d + 1}: wolny</b><span>Powtórz ulubioną trasę albo odpocznij.</span></li>`;
      const tags = [w.kind === 'dolina' ? '🌧 dobra na gorszą pogodę' : '', w.chains ? '⛓ łańcuchy' : '', w.alpine ? `⚠ teren T${w.alpine}` : ''].filter(Boolean).join(' · ');
      return `<li><b>Dzień ${d + 1}: ${w.name}</b><span>${(w.dist / 1000).toFixed(1).replace('.', ',')} km tam i z powrotem · ok. ${hm(w.time * lim.pace)} h marszu · ↗ ${Math.round(w.up)} m · do ${Math.round(w.top)} m n.p.m. · dojazd ok. ${ride(w)} min${tags ? ` · ${tags}` : ''}</span>`
        + `<button class="chip" data-w="${w.i}">Pokaż trasę</button></li>`;
    }).join('') + '</ol>'
      + '<p class="src">Plan z katalogu klasycznych tras; czasy wg norm PTTK, bez postojów. Przed każdym wyjściem sprawdź prognozę i komunikat TOPR / HZS; w złą pogodę zamień dzień w górach na trasę dolinną (🌧).</p>';
    $('st-plan').innerHTML = html;
    $('st-plan').querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => onOpen(all[+b.dataset.w].stops); });
  };
}
