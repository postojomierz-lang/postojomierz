// Saving and loading battlefields as small JSON files ("*.pfmap.json").
import { T_SOLID, T_LOW, T_WATER, THEMES } from './sim/map.js';

export const MAP_FORMAT = 'plastic-front-map';

// The layout that recreates this map (the same shape makeMap({ layout }) accepts).
export function exportLayout(map) {
  const kinds = { [T_SOLID]: 'tall', [T_LOW]: 'low', [T_WATER]: 'water' };
  return {
    format: MAP_FORMAT, version: 1,
    W: map.W, H: map.H,
    title: map.title || '', briefing: map.briefing || '',
    theme: map.theme, floorColor: map.tint || '',
    objects: map.objects.map(o => ({ kind: kinds[o.kind], style: o.style, x: o.x, y: o.y, w: o.w, h: o.h })),
    decor: map.decor.map(d => ({ kind: d.kind, x: Math.floor(d.x), y: Math.floor(d.y) })),
  };
}

// Validates a parsed file; throws a readable error if it is not a map.
export function checkLayout(data) {
  if (!data || typeof data !== 'object') throw new Error('this file is not a Plastic Front map');
  if (data.format && data.format !== MAP_FORMAT) throw new Error('this file is not a Plastic Front map');
  if (!Array.isArray(data.objects)) throw new Error('the map has no objects list');
  return {
    W: +data.W || 0, H: +data.H || 0,
    title: String(data.title || '').slice(0, 80), briefing: String(data.briefing || '').slice(0, 300),
    theme: THEMES.includes(data.theme) ? data.theme : 'wood',
    floorColor: /^#[0-9a-f]{6}$/i.test(data.floorColor || '') ? data.floorColor : '',
    objects: data.objects.slice(0, 200), decor: Array.isArray(data.decor) ? data.decor.slice(0, 80) : [],
  };
}

export function downloadLayout(layout, name) {
  const blob = new Blob([JSON.stringify(layout, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (name || layout.title || 'battlefield').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.pfmap.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function readLayoutFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('the file could not be read as a map'); }
  return checkLayout(data);
}
