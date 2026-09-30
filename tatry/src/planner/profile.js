// The hiker's profile, kept in this browser and, once signed in, synced with the account (online.js): a name, an avatar (an emoji or a small photo), a rank by kilometres walked and badges
// earned from the journal (walks in the 3D view and with the GPS, peaks reached, records).
import { BY_ID } from '../nature/catalog.js';

const KEY = 'tatry-profile';

export function loadProfile() {
  try { return { name: '', avatar: '🥾', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { name: '', avatar: '🥾' }; }
}
// stamp: a change made here (the newer of this device and the account wins when they are synced)
export function saveProfile(p, stamp = true) {
  if (stamp) p.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* full or private */ }
}

export const AVATARS = ['🥾', '🏔', '⛰', '🧗', '🎒', '🦌', '🐐', '🦅', '🐻', '🌲', '⛺', '🧭'];

export function rank(km) {
  if (km >= 500) return 'Wytrawny taternik';
  if (km >= 200) return 'Taternik';
  if (km >= 50) return 'Turysta górski';
  if (km >= 10) return 'Turysta';
  return 'Nowicjusz';
}

// t: totals(journal); J: the journal; D: the nature discoveries (src/nature/discover.js)
const sp = (D) => Object.keys(D).map((id) => BY_ID[id]).filter(Boolean);
const inGroup = (D, g) => sp(D).filter((s) => s.group === g).length;
const places = (D, kind) => Object.keys(D).filter((id) => id.startsWith(kind + ':')).length;
const FIVE = ['kozica', 'swistak', 'niedzwiedz', 'orzel', 'pomurnik'];
export const BADGES = [
  { icon: '🥾', name: 'Pierwsze kroki', desc: 'pierwsze przejście trasy', ok: (t) => t.walks >= 1 },
  { icon: '🎒', name: 'Wytrwały', desc: '10 przejść', ok: (t) => t.walks >= 10 },
  { icon: '📍', name: 'Na prawdziwym szlaku', desc: 'przejście z nawigacją GPS', ok: (t, J) => J.walks.some((w) => w.gps) },
  { icon: '🛤', name: '50 km', desc: '50 km szlakami', ok: (t) => t.km >= 50 },
  { icon: '🗺', name: '200 km', desc: '200 km szlakami', ok: (t) => t.km >= 200 },
  { icon: '⛰', name: '5000 m w górę', desc: 'suma podejść 5000 m', ok: (t) => t.up >= 5000 },
  { icon: '🏔', name: '20 000 m w górę', desc: 'suma podejść 20 000 m', ok: (t) => t.up >= 20000 },
  { icon: '🔺', name: 'Dwutysięcznik', desc: 'szczyt powyżej 2000 m', ok: (t, J) => peaksOver(J, 2000) >= 1 },
  { icon: '👑', name: 'Pięć dwutysięczników', desc: '5 szczytów powyżej 2000 m', ok: (t, J) => peaksOver(J, 2000) >= 5 },
  { icon: '🇵🇱', name: 'Rysy', desc: 'najwyższy szczyt Polski', ok: (t, J) => !!J.peaks.Rysy },
  { icon: '🐐', name: 'Kozi Wierch', desc: 'najwyższy szczyt w całości w Polsce', ok: (t, J) => !!J.peaks['Kozi Wierch'] },
  { icon: '🏆', name: 'Rekordzista', desc: 'rekord przejścia trasy', ok: (t, J) => Object.keys(J.best || {}).length >= 1 },
  // nature: discovered along the trails (labels in the 3D view)
  { icon: '🔍', name: 'Pierwsze odkrycie', desc: 'pierwszy odkryty gatunek', ok: (t, J, D) => sp(D).length >= 1 },
  { icon: '🌱', name: 'Przyrodnik', desc: '10 odkrytych gatunków', ok: (t, J, D) => sp(D).length >= 10 },
  { icon: '📗', name: 'Znawca Tatr', desc: '25 odkrytych gatunków', ok: (t, J, D) => sp(D).length >= 25 },
  { icon: '📚', name: 'Encyklopedia', desc: '50 odkrytych gatunków', ok: (t, J, D) => sp(D).length >= 50 },
  { icon: '🌼', name: 'Botanik', desc: '20 gatunków roślin', ok: (t, J, D) => sp(D).filter((s) => s.kind === 'flora').length >= 20 },
  { icon: '🐦', name: 'Ornitolog', desc: '10 gatunków ptaków', ok: (t, J, D) => inGroup(D, 'bird') >= 10 },
  { icon: '🐾', name: 'Tropiciel', desc: '8 gatunków ssaków', ok: (t, J, D) => inGroup(D, 'mammal') >= 8 },
  { icon: '🦎', name: 'Herpetolog', desc: '4 gatunki płazów i gadów', ok: (t, J, D) => inGroup(D, 'herp') >= 4 },
  { icon: '💎', name: 'Łowca rzadkości', desc: '5 rzadkich gatunków', ok: (t, J, D) => sp(D).filter((s) => s.rarity >= 3).length >= 5 },
  { icon: '🦄', name: 'Unikat', desc: 'gatunek najrzadszej kategorii', ok: (t, J, D) => sp(D).some((s) => s.rarity === 4) },
  { icon: '🖐', name: 'Tatrzańska piątka', desc: 'kozica, świstak, niedźwiedź, orzeł przedni i pomurnik', ok: (t, J, D) => FIVE.every((id) => D[id]) },
  { icon: '💧', name: 'Stawy', desc: '5 odwiedzonych stawów', ok: (t, J, D) => places(D, 'lake') >= 5 },
  { icon: '🏠', name: 'Po schroniskach', desc: '3 schroniska', ok: (t, J, D) => places(D, 'hut') >= 3 },
];
const peaksOver = (J, m) => Object.values(J.peaks).filter((p) => (p.ele || 0) >= m).length;

// a photo as a small square data URL (kept in the browser, later in the profile online)
export async function photoAvatar(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
  c.width = c.height = 96;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 96, 96);
  return c.toDataURL('image/jpeg', 0.8);
}
