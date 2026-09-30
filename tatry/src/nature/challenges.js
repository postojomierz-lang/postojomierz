// Challenges: one for the day, the week, the month and the year, the same for everybody (picked from the
// date), with bonus points. Progress comes from the discoveries (plants, animals, places, with their date)
// and the journal's walks. A completed challenge is kept among the discoveries as 'event:<period>:<key>'.
import { BY_ID } from './catalog.js';

const pad = (n) => String(n).padStart(2, '0');
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return [t.getUTCFullYear(), Math.ceil(((t - y0) / 86400000 + 1) / 7)];
}
// the periods of a date: key, first day (YYYY-MM-DD) and a Polish name
export function periods(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const dow = (d.getDay() + 6) % 7, mon = new Date(y, m, day - dow);
  const [wy, wn] = isoWeek(d);
  const f = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  return {
    day: { key: f(d), from: f(d), name: 'Dzisiaj', bonus: 30 },
    week: { key: `${wy}-W${pad(wn)}`, from: f(mon), name: 'W tym tygodniu', bonus: 100 },
    month: { key: `${y}-${pad(m + 1)}`, from: `${y}-${pad(m + 1)}-01`, name: 'W tym miesiącu', bonus: 250 },
    year: { key: `${y}`, from: `${y}-01-01`, name: 'W tym roku', bonus: 1000 },
  };
}

const FIVE = ['kozica', 'swistak', 'niedzwiedz', 'orzel', 'pomurnik'];
const T = {
  day: [
    { text: 'Odkryj 3 gatunki roślin', n: 3, count: (c) => c.species((s) => s.kind === 'flora') },
    { text: 'Wypatrz ptaka', n: 1, count: (c) => c.species((s) => s.group === 'bird') },
    { text: 'Dojdź nad staw', n: 1, count: (c) => c.places('lake') },
    { text: 'Przejdź 5 km szlakiem', n: 5, count: (c) => c.km() },
    { text: 'Odkryj 5 gatunków', n: 5, count: (c) => c.species() },
    { text: 'Spotkaj zwierzę', n: 1, count: (c) => c.species((s) => s.kind === 'fauna') },
  ],
  week: [
    { text: 'Odkryj 10 gatunków', n: 10, count: (c) => c.species() },
    { text: 'Znajdź rzadki gatunek', n: 1, count: (c) => c.species((s) => s.rarity >= 3) },
    { text: 'Przejdź 15 km szlakami', n: 15, count: (c) => c.km() },
    { text: 'Zdobądź 2 szczyty', n: 2, count: (c) => c.places('peak') },
    { text: 'Spotkaj 2 gatunki ssaków', n: 2, count: (c) => c.species((s) => s.group === 'mammal') },
  ],
  month: [
    { text: 'Wejdź na dwutysięcznik', n: 1, count: (c) => c.places('peak', 30) },
    { text: 'Odkryj 25 gatunków', n: 25, count: (c) => c.species() },
    { text: 'Odwiedź 5 stawów', n: 5, count: (c) => c.places('lake') },
    { text: 'Przejdź trasę z nawigacją GPS', n: 1, count: (c) => c.walks((w) => w.gps) },
    { text: 'Przejdź 50 km szlakami', n: 50, count: (c) => c.km() },
  ],
  year: [
    { text: 'Odkryj 50 gatunków', n: 50, count: (c) => c.species() },
    { text: 'Tatrzańska piątka: kozica, świstak, niedźwiedź, orzeł przedni, pomurnik', n: 5, count: (c) => c.ids(FIVE) },
    { text: 'Zdobądź 5 dwutysięczników', n: 5, count: (c) => c.places('peak', 30) },
    { text: 'Przejdź 200 km szlakami', n: 200, count: (c) => c.km() },
  ],
};
const pick = (list, key) => list[[...key].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % list.length];

// found: the discoveries; J: the journal (walks with a 'YYYY-MM-DD HH:MM' date)
export function challenges(found, J, now = new Date()) {
  const P = periods(now);
  return Object.entries(P).map(([period, p]) => {
    const since = (date) => (date || '').slice(0, 10) >= p.from;
    const ctx = {
      species: (f = () => true) => Object.entries(found).filter(([id, e]) => BY_ID[id] && since(e.date) && f(BY_ID[id])).length,
      places: (kind, minPts = 0) => Object.entries(found).filter(([id, e]) => id.startsWith(kind + ':') && since(e.date) && (e.pts || 0) >= minPts).length,
      ids: (list) => list.filter((id) => found[id]).length,
      walks: (f = () => true) => (J.walks || []).filter((w) => since(w.date) && f(w)).length,
      // walked for real: with the GPS, or in the 3D view without speeding up or jumping
      km: () => Math.floor((J.walks || []).filter((w) => since(w.date) && (w.fair || w.gps)).reduce((a, w) => a + (w.dist || 0), 0) / 1000),
    };
    const t = pick(T[period], p.key);
    const id = `event:${period}:${p.key}`;
    const have = Math.min(t.n, t.count(ctx));
    return { id, period, name: p.name, text: t.text, n: t.n, have, bonus: p.bonus, done: !!found[id] };
  });
}

// record the ones just completed; returns them (for a notice)
export function settleChallenges(found, J, save) {
  const now = new Date(), got = [];
  for (const c of challenges(found, J, now)) {
    if (c.done || c.have < c.n) continue;
    found[c.id] = { date: now.toISOString().slice(0, 10), pts: c.bonus };
    got.push(c);
  }
  if (got.length) save(found);
  return got;
}
