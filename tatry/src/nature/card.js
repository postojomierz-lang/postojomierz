// The card shown when a label is tapped: for a plant or animal a real photo (Wikimedia Commons, with its
// author and licence), the names, group, rarity and a short description; until it is discovered only its
// group and a hint. For a place its name, elevation and whether it has been reached, with the lead of its
// Polish Wikipedia article and its picture (with author and licence) when there is one: which article is
// known in advance (tools/fetch_place_wiki.py), the text is fetched when the card opens and kept on the
// phone for use without signal. Both kinds of card link to more reading.
import { GROUPS, RARITY } from './catalog.js';
import { placeId } from '../labels.js';
import { placePoints } from './discover.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND = { peak: 'Szczyt', pass: 'Przełęcz', lake: 'Staw', hut: 'Schronisko', fall: 'Wodospad', trail: 'Szlak', spring: 'Źródło' };

export async function buildCards({ base = 'nature/', found, distanceTo }) {
  let photos = {};
  try { photos = await (await fetch(base + 'photos.json')).json(); } catch (e) { /* no photos yet */ }
  let wiki = {};
  fetch('data/places_wiki.json').then((r) => r.json()).then((j) => { wiki = j; }).catch(() => { /* none yet */ });
  let showing = null;
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
          + `<p>${esc(s.desc)}</p>${more(wikiSpecies(s))}<div class="when">Odkryto: ${f.date}</div>`
          + (p ? `<div class="credit">${credit(p)}</div>` : '');
      } else {
        const d = Math.round(distanceTo(it.pos));
        h = `<div class="unk">${g.icon}</div><h3>? ${g.name.toLowerCase()}</h3>`
          + `<div class="tags"><span class="r${s.rarity}">${r.name}</span><span>+${r.points} pkt</span></div>`
          + `<p>Jeszcze nieodkryte. Podejdź bliżej, żeby zobaczyć, co to jest (${d} m stąd).</p>`;
      }
    } else {
      const f = found[placeId(it)], title = wiki[it.name];
      h = `<div class="wk-img"></div><h3>${esc(it.name)}</h3><div class="lat">${KIND[it.kind] || ''}${it.ele ? ` · ${it.ele} m n.p.m.` : ''}</div>`
        + (title ? `<p class="wk-text"><i>Wczytuję opis z Wikipedii…</i></p>${more(wikiPage(title))}` : '')
        + (it.noFind ? `<p>${it.note === 'woda pitna' ? 'Woda pitna według OpenStreetMap.' : 'Źródło. Jakość wody niesprawdzona: przed piciem przegotuj lub przefiltruj.'}</p>`
          : `<p class="when">${f ? `Odwiedzone: ${f.date} (+${f.pts} pkt)` : `Jeszcze nieodwiedzone, +${placePoints(it.kind, it.ele)} pkt za dotarcie.`}</p>`)
        + (title ? '<div class="credit wk-credit"></div>' : '');
      if (title) placeWiki(title).then((w) => {
        if (showing !== it) return;
        const t = el.querySelector('.wk-text');
        if (!w) { if (t) t.remove(); return; }
        if (t) t.textContent = w.x;
        if (w.i) el.querySelector('.wk-img').innerHTML = `<img src="${esc(w.i)}" alt="${esc(it.name)}" onerror="this.remove()">`;
        el.querySelector('.wk-credit').innerHTML = (w.i ? `Fot. ${esc(w.a)}, ${esc(w.l)} · <a href="${esc(w.f)}" target="_blank" rel="noopener">Wikimedia Commons</a> · ` : '')
          + 'Tekst: Wikipedia, CC BY-SA 4.0';
      });
    }
    showing = it;
    el.innerHTML = `<button class="x" aria-label="Zamknij">✕</button>${h}`;
    el.querySelector('.x').onclick = close;
    el.classList.add('show');
  }
  return { show, close };
}

// a place's article: its lead (the first sentences) and picture, fetched once and kept on the phone; the picture
// only with its author and a free licence (Wikimedia Commons), as the licences require; null if not to be had
const wikiPage = (title) => `https://pl.m.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const FREE = /^(cc0|public domain|pd|cc[ -]by(-sa)?[ -]?[0-9.]*)/i;
const wikiMem = new Map();
function placeWiki(title) {
  if (wikiMem.has(title)) return wikiMem.get(title);
  const key = 'wiki:' + title;
  const p = (async () => {
    try { const kept = JSON.parse(localStorage.getItem(key)); if (kept) return kept; } catch (e) { /* private mode */ }
    const s = await (await fetch(`https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)).json();
    if (!s.extract) return null;
    const w = { x: lead(s.extract) };
    const file = s.originalimage && decodeURIComponent(s.originalimage.source.split('/').pop());
    if (s.thumbnail && file) {
      try {
        const q = new URLSearchParams({ action: 'query', titles: 'File:' + file, prop: 'imageinfo', iiprop: 'extmetadata|url', format: 'json', origin: '*' });
        const r = await (await fetch('https://commons.wikimedia.org/w/api.php?' + q)).json();
        const ii = Object.values(r.query.pages)[0].imageinfo[0], m = ii.extmetadata;
        const lic = (m.LicenseShortName && m.LicenseShortName.value) || '';
        const tmp = document.createElement('div'); tmp.innerHTML = (m.Artist && m.Artist.value) || '';
        if (FREE.test(lic)) Object.assign(w, { i: s.thumbnail.source, a: (tmp.textContent.trim() || 'autor nieznany').slice(0, 80), l: lic, f: ii.descriptionurl });
      } catch (e) { /* no credit: no picture */ }
    }
    try { localStorage.setItem(key, JSON.stringify(w)); } catch (e) { /* full or private */ }
    return w;
  })().catch(() => null);
  p.then((w) => { if (!w) wikiMem.delete(title); });           // offline: try again next time
  wikiMem.set(title, p);
  return p;
}
// the first sentences, up to ~420 characters
function lead(text, n = 420) {
  let out = '';
  for (const sent of text.trim().split(/(?<=[.!?])\s+(?=[A-ZŁŚŻŹĆ])/)) {
    if (out && out.length + sent.length > n) break;
    out = (out + ' ' + sent).trim();
  }
  return out.slice(0, n);
}

// "read more": the article in the Polish Wikipedia (a species by its Latin name, which redirects there)
export const wikiSpecies = (s) => `https://pl.m.wikipedia.org/wiki/${encodeURIComponent(s.latin.replace(/ /g, '_'))}`;
const more = (url) => `<a class="more" href="${esc(url)}" target="_blank" rel="noopener">📖 Dowiedz się więcej ↗</a>`;

// the line under the picture: an illustration (made with AI, no photo of the species exists), or the
// photographer, licence and where the photo comes from
function credit(p) {
  if (p.ai) return `Ilustracja (AI, Google Flow) · ${esc(p.license)} · brak wolnych zdjęć tego gatunku`;
  const src = /inaturalist/.test(p.url) ? 'iNaturalist' : /gbif/.test(p.url) ? 'GBIF' : 'Wikimedia Commons';
  return `Fot. ${esc(p.author || 'autor nieznany')}, ${esc(p.license)} · <a href="${p.url}" target="_blank" rel="noopener">${src}</a>`;
}
