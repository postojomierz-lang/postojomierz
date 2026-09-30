// Discoveries: the catalogue's plants and animals and the places (peaks, passes, lakes, huts, waterfalls)
// the hiker has come close to, with the date, kept in this browser (and later synced with the profile).
// Points by rarity: a common plant 10, an uncommon one 20, a rare one 40, a unique find 80; places 5-30.
import { BY_ID, RARITY, CATALOG } from './catalog.js';

const KEY = 'rysy-discoveries';
export function loadFound() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
}
export function saveFound(f) {
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch (e) { /* full or private */ }
}

// how close counts as found (m): plants are seen at arm's length, animals and birds from further away
const RADIUS = { flora: 15, fauna: 40, bird: 70, peak: 60, pass: 50, hut: 60, lake: 180, fall: 60 };
export function placePoints(kind, ele) {
  return kind === 'peak' ? (ele > 2000 ? 30 : 15) : kind === 'hut' ? 5 : 10;
}
export function score(found) {
  let pts = 0, species = 0, places = 0;
  for (const id of Object.keys(found)) {
    const s = BY_ID[id];
    if (s) { pts += RARITY[s.rarity].points; species++; } else { pts += found[id].pts || 5; if (!id.startsWith('event:')) places++; }
  }
  return { pts, species, places, total: CATALOG.length };
}

// items: the label items (places and nature spots, labels.js); check() with the hiker's position finds the
// ones within reach; onFind(item, entry) for each new find
export function buildDiscovery({ items, found, placeId, onFind }) {
  let t = 0;
  function check(p, dt) {
    if ((t += dt) < 0.4) return;
    t = 0;
    for (const it of items) {
      const id = it.species ? it.id : placeId(it);
      if (found[id]) continue;
      const r = it.species ? (it.species.far || (it.species.group === 'bird' ? RADIUS.bird : RADIUS[it.kind])) : RADIUS[it.kind] || 50;
      const dx = it.pos.x - p.x, dz = it.pos.z - p.z;
      if (dx * dx + dz * dz > r * r || Math.abs(it.pos.y - p.y) > Math.max(40, r)) continue;
      const entry = { date: new Date().toISOString().slice(0, 10) };
      if (!it.species) entry.pts = placePoints(it.kind, it.ele);
      found[id] = entry;
      saveFound(found);
      onFind(it, entry);
    }
  }
  return { check };
}
