// The hiker's look: what the editor in the planner sets (planner/lookEditor.js), what the 3D figure
// (avatar/figure3d.js) and the drawn avatar (avatar/svg.js) are built from. Kept in the profile (PR.look)
// and, signed in, in profiles.look, so the group sees each other as they chose.

export const SKIN = ['#f6d7c3', '#eac0a0', '#d9a27c', '#b97b55', '#8d5a3b', '#5e3b26'];
export const HAIR_COLORS = [
  ['#1d1a18', 'czarne'], ['#3b2a20', 'ciemny brąz'], ['#6a4630', 'brąz'], ['#8e4b2a', 'kasztan'],
  ['#b5542b', 'rude'], ['#c9a063', 'blond'], ['#e2cf9a', 'jasny blond'], ['#b9b6b0', 'siwe'],
];
export const CLOTH = ['#d0281f', '#e8702a', '#e6b422', '#5c9e31', '#1f7a5a', '#2a6fb5', '#24407a', '#6a3d9a',
  '#c2306f', '#222428', '#6b6f75', '#d9d6cf', '#7a5a3a', '#55613a'];

// every choice: [value, label]
export const OPTIONS = {
  sex: [['m', 'mężczyzna'], ['f', 'kobieta']],
  age: [['young', 'młody (18–30)'], ['adult', 'dorosły (30–50)'], ['senior', 'senior (50+)']],
  head: [['round', 'okrągła'], ['oval', 'owalna'], ['square', 'kwadratowa'], ['long', 'pociągła']],
  hair: [['bald', 'łysy'], ['buzz', 'jeżyk'], ['short', 'krótkie'], ['medium', 'średnie'], ['long', 'długie'],
    ['ponytail', 'kucyk'], ['bun', 'kok'], ['braid', 'warkocz'], ['curly', 'loki']],
  beard: [['none', 'brak'], ['stubble', 'zarost'], ['mustache', 'wąsy'], ['goatee', 'kozia bródka'], ['full', 'pełna broda']],
  glasses: [['none', 'brak'], ['clear', 'korekcyjne'], ['sun', 'przeciwsłoneczne']],
  hat: [['none', 'brak'], ['cap', 'czapka z daszkiem'], ['beanie', 'czapka zimowa'], ['band', 'opaska'], ['brim', 'kapelusz']],
  jacket: [['tee', 'koszulka'], ['fleece', 'polar'], ['softshell', 'softshell'], ['down', 'kurtka puchowa'], ['shell', 'kurtka przeciwdeszczowa']],
  pants: [['long', 'długie'], ['shorts', 'krótkie'], ['tights', 'legginsy']],
  boots: [['trek', 'trekkingowe'], ['approach', 'podejściowe'], ['trail', 'biegowe']],
  pack: [['none', 'bez plecaka'], ['small', 'mały (20 l)'], ['big', 'duży (45 l)']],
};
// yes / no: the gear
export const GEAR = [['poles', 'kijki'], ['rope', 'lina'], ['helmet', 'kask'], ['lamp', 'czołówka']];

export const DEFAULT_LOOK = {
  v: 1, sex: 'm', age: 'adult', head: 'oval', skin: 1, hair: 'short', hairColor: 2, beard: 'none',
  glasses: 'none', hat: 'none', jacket: 'softshell', jacketColor: 0, pants: 'long', pantsColor: 9,
  boots: 'trek', bootsColor: 12, pack: 'small', packColor: 6, helmetColor: 2,
  poles: true, rope: false, helmet: false, lamp: false,
};

const pick = (k, v) => (OPTIONS[k].some(([x]) => x === v) ? v : DEFAULT_LOOK[k]);
const idx = (v, n, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
// anything read from storage or from another hiker's profile: only known values
export function cleanLook(l) {
  if (!l || typeof l !== 'object') return null;
  const o = { v: 1 };
  for (const k of Object.keys(OPTIONS)) o[k] = pick(k, l[k]);
  o.skin = idx(l.skin, SKIN.length, DEFAULT_LOOK.skin);
  o.hairColor = idx(l.hairColor, HAIR_COLORS.length, DEFAULT_LOOK.hairColor);
  for (const k of ['jacketColor', 'pantsColor', 'bootsColor', 'packColor', 'helmetColor']) o[k] = idx(l[k], CLOTH.length, DEFAULT_LOOK[k]);
  for (const [k] of GEAR) o[k] = !!l[k];
  return o;
}

const any = (a) => a[Math.floor(Math.random() * a.length)];
export function randomLook() {
  const sex = any(['m', 'f']);
  const l = { ...DEFAULT_LOOK, sex };
  for (const k of ['age', 'head', 'glasses', 'jacket', 'boots']) l[k] = any(OPTIONS[k])[0];
  l.hair = any(sex === 'f' ? ['medium', 'long', 'ponytail', 'bun', 'braid', 'curly', 'short'] : ['bald', 'buzz', 'short', 'short', 'medium', 'curly']);
  l.beard = sex === 'f' ? 'none' : any(['none', 'none', 'stubble', 'mustache', 'goatee', 'full']);
  l.hat = any(['none', 'none', 'cap', 'beanie', 'band', 'brim']);
  l.pants = any(['long', 'long', 'shorts', sex === 'f' ? 'tights' : 'long']);
  l.pack = any(['small', 'big', 'small']);
  l.skin = Math.floor(Math.random() * SKIN.length);
  l.hairColor = l.age === 'senior' ? 7 : Math.floor(Math.random() * 7);
  for (const k of ['jacketColor', 'pantsColor', 'bootsColor', 'packColor', 'helmetColor']) l[k] = Math.floor(Math.random() * CLOTH.length);
  l.poles = Math.random() < 0.7; l.rope = Math.random() < 0.15; l.helmet = Math.random() < 0.2; l.lamp = Math.random() < 0.2;
  return l;
}

// the look kept in this browser by the planner (the 3D view reads the same)
export function myLook() {
  try { return cleanLook(JSON.parse(localStorage.getItem('tatry-profile') || '{}').look) || null; } catch (e) { return null; }
}
