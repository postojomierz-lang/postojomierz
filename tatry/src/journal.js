// The hiker's journal, kept in this browser (localStorage): finished walks, the best time of every
// route with its trace (for the ghost), the peaks reached and the favourite routes. Shared by the 3D
// view and the route planner.
const KEY = 'rysy-journal';

function empty() { return { walks: [], best: {}, peaks: {}, favs: [] }; }

export function loadJournal() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    return j && j.walks ? { ...empty(), ...j } : empty();
  } catch (e) { return empty(); }
}
export function saveJournal(j) {
  try { localStorage.setItem(KEY, JSON.stringify(j)); return true; } catch (e) { return false; }
}

// a route's identity: its stops rounded to ~10 m (the same route planned twice gives the same key)
export function routeKey(hash) {
  const m = (hash || '').match(/r=([^&]+)/);
  if (!m) return 'rysy';
  return m[1].split(';').map((p) => p.split(',').map((v) => (+v).toFixed(4)).join(',')).join(';');
}

export const fmtClock = (sec) => {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

export function addWalk(j, walk) {
  j.walks.unshift(walk);
  if (j.walks.length > 200) j.walks.length = 200;
  let record = false;
  if (walk.fair) {
    const b = j.best[walk.key];
    if (!b || walk.time < b.time) { j.best[walk.key] = { time: walk.time, date: walk.date, trace: walk.trace }; record = true; }
  }
  delete walk.trace;               // traces are kept for the best run only
  return record;
}

export function addPeak(j, name, ele) {
  if (j.peaks[name]) return false;
  j.peaks[name] = { ele: ele || null, date: new Date().toISOString().slice(0, 10) };
  return true;
}

export function toggleFav(j, key, title, hash) {
  const i = j.favs.findIndex((f) => f.key === key);
  if (i >= 0) { j.favs.splice(i, 1); return false; }
  j.favs.unshift({ key, title, hash });
  return true;
}

// position of the ghost (best run) after t seconds: metres along the route
export function ghostAt(best, t) {
  const tr = best && best.trace;
  if (!tr || !tr.length) return null;
  if (t >= tr[tr.length - 1][0]) return tr[tr.length - 1][1];
  let k = 0;
  while (k < tr.length - 1 && tr[k + 1][0] < t) k++;
  const [t0, s0] = tr[k], [t1, s1] = tr[k + 1] || tr[k];
  return t1 > t0 ? s0 + (s1 - s0) * (t - t0) / (t1 - t0) : s0;
}

export function totals(j) {
  let km = 0, up = 0;
  for (const w of j.walks) { km += w.dist / 1000; up += w.up || 0; }
  return { walks: j.walks.length, km, up, peaks: Object.keys(j.peaks).length };
}
