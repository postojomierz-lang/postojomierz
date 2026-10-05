// The library of discoveries in the journal: the plants and animals of the catalogue by group, the found ones
// with their photo, name and the day they were found, the others as small "?" squares coloured by rarity, and
// the places reached (peaks, passes, huts, lakes, waterfalls) by kind. A filter picks plants, animals or
// places; tapping a found species opens its card (photo, description, rarity, more reading).
import { CATALOG, GROUPS, RARITY } from '../nature/catalog.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND = { peak: ['▲', 'Szczyty'], pass: ['⌒', 'Przełęcze'], hut: ['⌂', 'Schroniska'], lake: ['💧', 'Stawy'], fall: ['🌊', 'Wodospady'], spring: ['🚰', 'Źródła'], trail: ['◆', 'Szlaki'] };
const FILTERS = [['all', 'Wszystko'], ['flora', 'Rośliny'], ['fauna', 'Zwierzęta'], ['places', 'Miejsca']];
const credit = (p) => {
  if (p.ai) return `Ilustracja (AI) · ${esc(p.license)}`;
  const src = /inaturalist/.test(p.url) ? 'iNaturalist' : /gbif/.test(p.url) ? 'GBIF' : 'Wikimedia Commons';
  return `Fot. ${esc(p.author || 'autor nieznany')}, ${esc(p.license)} · <a href="${esc(p.url)}" target="_blank" rel="noopener">${src}</a>`;
};

export function setupLibrary({ box, count, base = 'nature/' }) {
  let filter = 'all', D = {}, photos = null;
  fetch(base + 'photos.json').then((r) => r.json()).then((j) => { photos = j; }).catch(() => { photos = {}; });
  const dlg = document.createElement('dialog');
  dlg.className = 'lib-card';
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('.x')) dlg.close(); });

  function open(s) {
    const g = GROUPS[s.group], r = RARITY[s.rarity], f = D[s.id], p = photos && photos[s.id];
    dlg.innerHTML = `<button class="x" aria-label="Zamknij">✕</button>${p ? `<img src="${base}${s.id}.jpg" alt="${esc(s.name)}">` : ''}`
      + `<h3>${g.icon} ${esc(s.name)}</h3><div class="lat">${esc(s.latin)}</div>`
      + `<div class="tags"><span>${g.name}</span><span class="r${s.rarity}">${r.name}</span><span>+${r.points} pkt</span></div>`
      + `<p>${esc(s.desc)}</p><p><a href="https://pl.m.wikipedia.org/wiki/${encodeURIComponent(s.latin.replace(/ /g, '_'))}" target="_blank" rel="noopener">Dowiedz się więcej (Wikipedia)</a></p>`
      + `<div class="when">Odkryto: ${esc(f.date || '')}${f.gps ? ' · na szlaku (GPS)' : ''}</div>${p ? `<div class="credit">${credit(p)}</div>` : ''}`;
    dlg.showModal();
  }

  function render(found) {
    D = found || {};
    const sp = CATALOG.filter((s) => D[s.id]);
    const places = Object.entries(D).filter(([id]) => !id.startsWith('event:') && KIND[id.split(':')[0]]);
    count.textContent = `${sp.length} / ${CATALOG.length} gatunków · ${places.length} miejsc`;
    let h = `<div class="lib-f">${FILTERS.map(([k, t]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    if (filter !== 'places') {
      h += `<p class="lib-leg">Nieodkryte: ${[1, 2, 3, 4].map((k) => `<i class="r${k}">?</i> ${RARITY[k].name}`).join(' ')}</p>`;
      for (const [gk, g] of Object.entries(GROUPS)) {
        if (filter !== 'all' && g.kind !== filter) continue;
        const all = CATALOG.filter((s) => s.group === gk);
        const got = all.filter((s) => D[s.id]);
        // the found first (newest on top), then the rest by rarity: the common ones are the next to find
        const rest = all.filter((s) => !D[s.id]).sort((a, b) => a.rarity - b.rarity);
        got.sort((a, b) => String(D[b.id].date).localeCompare(String(D[a.id].date)));
        h += `<h4>${g.icon} ${g.name} <small>${got.length} / ${all.length}</small></h4><div class="lib-grid">`
          + got.map((s) => `<button class="lib-t" data-id="${s.id}"><span class="ph" style="background-image:url('${base}${s.id}.jpg')"></span>`
            + `<b>${esc(s.name)}</b><small>${esc(D[s.id].date || '')}</small></button>`).join('')
          + '</div>'
          + (rest.length ? `<div class="lib-unk" title="nieodkryte">${rest.map((s) => `<i class="r${s.rarity}" title="${RARITY[s.rarity].name}">?</i>`).join('')}</div>` : '');
      }
    }
    if (filter === 'all' || filter === 'places') {
      if (!places.length) h += '<h4>📍 Miejsca</h4><p class="hint">Dojdź na szczyt, przełęcz, do schroniska lub nad staw (w widoku 3D albo z GPS), a pojawi się tutaj.</p>';
      for (const [k, [ico, name]] of Object.entries(KIND)) {
        const list = places.filter(([id]) => id.startsWith(k + ':')).sort((a, b) => String(b[1].date).localeCompare(String(a[1].date)));
        if (!list.length) continue;
        h += `<h4>${ico} ${name} <small>${list.length}</small></h4><ul class="lib-pl">`
          + list.map(([id, e]) => `<li>${esc(id.slice(k.length + 1))}<small>${esc(e.date || '')}${e.pts ? ` · +${e.pts} pkt` : ''}</small></li>`).join('') + '</ul>';
      }
    }
    box.innerHTML = h;
  }
  box.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; render(D); return; }
    const t = e.target.closest('.lib-t[data-id]');
    if (t) { const s = CATALOG.find((x) => x.id === t.dataset.id); if (s) open(s); }
  });
  return { render };
}
