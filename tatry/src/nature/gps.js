// Discoveries on the real trail: during GPS navigation in the planner, the catalogue's plants and animals
// (the same spots as in the 3D view, public/nature/spots.json) and the peaks, passes and huts the hiker
// comes close to are added to the same discoveries as in the 3D view, with a notice on the screen.
import { BY_ID, GROUPS, RARITY } from './catalog.js';
import { loadFound, saveFound, placePoints } from './discover.js';
import { settleChallenges } from './challenges.js';

const R = { flora: 15, fauna: 40, bird: 70, peak: 60, pass: 50, hut: 60 };
const MZ = 110574;

export async function buildGpsDiscovery({ poi = [] }) {
  let spots = [];
  try { spots = await (await fetch('nature/spots.json')).json(); } catch (e) { /* offline without it: places only */ }
  const places = poi.filter((p) => p.k === 'peak' || p.k === 'pass' || p.k === 'hut');
  const note = document.createElement('div');
  note.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2000;background:rgba(20,28,24,.9);color:#fff;'
    + 'padding:10px 14px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;max-width:88vw;text-align:center;display:none;box-shadow:0 4px 16px rgba(0,0,0,.35)';
  document.body.appendChild(note);
  let hideT = null;
  const show = (html) => {
    note.innerHTML = html; note.style.display = 'block';
    clearTimeout(hideT); hideT = setTimeout(() => { note.style.display = 'none'; }, 6000);
  };
  const near = (lat0, lon0, lat, lon, r) => {
    const mx = 111320 * Math.cos(lat0 * Math.PI / 180);
    const dx = (lon - lon0) * mx, dz = (lat - lat0) * MZ;
    return dx * dx + dz * dz < r * r;
  };
  function onPosition({ lat, lon, acc }) {
    if (acc && acc > 60) return;                     // a poor fix is not proof of being there
    const found = loadFound();                       // the 3D view may have added some meanwhile
    let changed = false;
    for (const [id, slon, slat] of spots) {
      if (found[id]) continue;
      const s = BY_ID[id];
      if (!s) continue;
      const r = s.far || (s.group === 'bird' ? R.bird : R[s.kind]);
      if (!near(lat, lon, slat, slon, r)) continue;
      found[id] = { date: new Date().toISOString().slice(0, 10), gps: true };
      changed = true;
      const rr = RARITY[s.rarity];
      show(`${GROUPS[s.group].icon} Odkryto: <b>${s.name}</b> <i>${s.latin}</i><br>${rr.name} · +${rr.points} pkt`);
    }
    for (const p of places) {
      const id = `${p.k}:${p.n}`;
      if (found[id] || !near(lat, lon, p.p[1], p.p[0], R[p.k])) continue;
      const pts = placePoints(p.k, p.e);
      found[id] = { date: new Date().toISOString().slice(0, 10), pts, gps: true };
      changed = true;
      show(`✓ Odkryto: <b>${p.n}</b> · +${pts} pkt`);
    }
    if (changed) {
      saveFound(found);
      const got = settleChallenges(found, loadJournalSafe(), saveFound);
      if (got.length) setTimeout(() => show(`🏅 Wyzwanie wykonane: <b>${got[0].text}</b><br>+${got[0].bonus} pkt`), 6200);
    }
  }
  function loadJournalSafe() { try { return JSON.parse(localStorage.getItem('rysy-journal') || '{}') || {}; } catch (e) { return {}; } }
  return { onPosition };
}
