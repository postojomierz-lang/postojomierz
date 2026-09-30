// The card shown when a label is tapped: for a plant or animal a real photo (Wikimedia Commons, with its
// author and licence), the names, group, rarity and a short description; until it is discovered only its
// group and a hint. For a place its name, elevation and whether it has been reached.
import { GROUPS, RARITY } from './catalog.js';
import { placeId } from '../labels.js';
import { placePoints } from './discover.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND = { peak: 'Szczyt', pass: 'Przełęcz', lake: 'Staw', hut: 'Schronisko', fall: 'Wodospad', trail: 'Szlak' };

export async function buildCards({ base = 'nature/', found, distanceTo }) {
  let photos = {};
  try { photos = await (await fetch(base + 'photos.json')).json(); } catch (e) { /* no photos yet */ }
  const el = document.createElement('div');
  el.id = 'card';
  el.className = 'panel';
  document.body.appendChild(el);
  const close = () => el.classList.remove('show');
  function show(it) {
    let h;
    if (it.species) {
      const s = it.species, g = GROUPS[s.group], r = RARITY[s.rarity], f = found[it.id];
      if (f) {
        const p = photos[s.id];
        h = (p ? `<img src="${base}${s.id}.jpg" alt="${esc(s.name)}">` : '')
          + `<h3>${g.icon} ${esc(s.name)}</h3><div class="lat">${esc(s.latin)}</div>`
          + `<div class="tags"><span>${g.name}</span><span class="r${s.rarity}">${r.name}</span><span>+${r.points} pkt</span></div>`
          + `<p>${esc(s.desc)}</p><div class="when">Odkryto: ${f.date}</div>`
          + (p ? `<div class="credit">Fot. ${esc(p.author || 'autor nieznany')}, ${esc(p.license)} · <a href="${p.url}" target="_blank" rel="noopener">Wikimedia Commons</a></div>` : '');
      } else {
        const d = Math.round(distanceTo(it.pos));
        h = `<div class="unk">${g.icon}</div><h3>? ${g.name.toLowerCase()}</h3>`
          + `<div class="tags"><span class="r${s.rarity}">${r.name}</span><span>+${r.points} pkt</span></div>`
          + `<p>Jeszcze nieodkryte. Podejdź bliżej, żeby zobaczyć, co to jest (${d} m stąd).</p>`;
      }
    } else {
      const f = found[placeId(it)];
      h = `<h3>${esc(it.name)}</h3><div class="lat">${KIND[it.kind] || ''}${it.ele ? ` · ${it.ele} m n.p.m.` : ''}</div>`
        + `<p>${f ? `Odwiedzone: ${f.date} (+${f.pts} pkt)` : `Jeszcze nieodwiedzone, +${placePoints(it.kind, it.ele)} pkt za dotarcie.`}</p>`;
    }
    el.innerHTML = `<button class="x" aria-label="Zamknij">✕</button>${h}`;
    el.querySelector('.x').onclick = close;
    el.classList.add('show');
  }
  return { show, close };
}
