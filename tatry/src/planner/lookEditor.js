// The look editor (the Account tab): who the hiker is and what they wear and carry, with a live preview
// of the figure. Saved in the profile (PR.look); the face can be the avatar too (instead of an emoji or a
// photo). The 3D view builds the hiker's figure from the same look (avatar/figure3d.js).
import { OPTIONS, GEAR, SKIN, HAIR_COLORS, CLOTH, DEFAULT_LOOK, SHOP, cleanLook, randomLook, shopItem, spent } from '../avatar/look.js';
import { loadFound, score } from '../nature/discover.js';
import { figureSvg, faceSvg, faceDataUrl } from '../avatar/svg.js';

const CSS = `
#look-ed{position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
#look-ed[hidden]{display:none}
#look-ed .box{background:var(--panel,#fff);color:inherit;width:min(760px,100vw);height:min(640px,100dvh);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35)}
#look-ed header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#ddd)}
#look-ed header b{flex:1;font-size:16px}
#look-ed .main{flex:1;display:flex;min-height:0}
#look-ed .prev{width:38%;min-width:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:var(--bg,#f2f2f2);padding:8px}
#look-ed .prev .fig svg{height:min(46dvh,400px);width:auto;display:block}
#look-ed .prev .face svg{width:56px;height:56px;display:block}
#look-ed .prev small{color:var(--muted,#777);font-size:11px;text-align:center}
#look-ed .side{flex:1;display:flex;flex-direction:column;min-width:0}
#look-ed nav{display:flex;gap:4px;padding:8px 10px 0;flex-wrap:wrap}
#look-ed nav button{padding:5px 9px;font-size:13px;border-radius:14px}
#look-ed nav button.on{background:var(--accent,#e8573a);color:#fff;border-color:transparent}
#look-ed .opts{flex:1;overflow-y:auto;padding:6px 12px 12px}
#look-ed .grp{margin:10px 0 0}
#look-ed .grp>small{display:block;color:var(--muted,#777);margin-bottom:4px;font-size:12px}
#look-ed .chips{display:flex;flex-wrap:wrap;gap:5px}
#look-ed .chips button{padding:5px 9px;font-size:13px;border-radius:14px}
#look-ed .chips button.on{outline:2px solid var(--accent,#e8573a);outline-offset:1px;font-weight:600}
#look-ed .sw{width:28px;height:28px;border-radius:50%;padding:0;border:2px solid rgba(0,0,0,.15)}
#look-ed .sw.on{outline:3px solid var(--accent,#e8573a);outline-offset:2px}
#look-ed .lock{opacity:.75}
#look-ed .bal{background:var(--bg,#f2f2f2);border-radius:10px;padding:8px 10px;margin:8px 0;font-size:13px}
#look-ed .bal b{font-size:18px}
#look-ed .shop{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
#look-ed .item{border:1px solid var(--line,#ddd);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:3px;font-size:12px}
#look-ed .item .i{font-size:24px}#look-ed .item b{font-size:13px}#look-ed .item small{color:var(--muted,#777)}
#look-ed .item button{margin-top:auto}
#look-ed footer{background:var(--panel,#fff);display:flex;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid var(--line,#ddd);flex-wrap:wrap}
#look-ed footer label{flex:1;font-size:13px;display:flex;gap:6px;align-items:center;min-width:180px}
@media (max-width:560px){#look-ed .box{border-radius:0;height:100dvh}#look-ed .main{flex-direction:column}#look-ed .prev{width:auto;flex-direction:row;padding:6px}
  #look-ed .prev .fig svg{height:150px}}
`;

const TABS = [
  ['Postać', [['sex', 'Płeć'], ['age', 'Wiek'], ['skin', 'Kolor skóry'], ['head', 'Kształt głowy']]],
  ['Włosy', [['hair', 'Fryzura'], ['hairColor', 'Kolor włosów'], ['beard', 'Zarost']]],
  ['Dodatki', [['glasses', 'Okulary'], ['hat', 'Na głowie']]],
  ['Ubiór', [['jacket', 'Góra'], ['jacketColor', 'Kolor'], ['pants', 'Spodnie'], ['pantsColor', 'Kolor'], ['boots', 'Buty'], ['bootsColor', 'Kolor']]],
  ['Wyposażenie', [['pack', 'Plecak'], ['packColor', 'Kolor plecaka (i czapki)'], ['gear', 'Sprzęt'], ['helmetColor', 'Kolor kasku']]],
  ['🛒 Sklepik', [['shop', '']]],
];

export function setupLookEditor({ PR, saveProfile, onSaved = () => {} }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement('div'); el.id = 'look-ed'; el.hidden = true;
  el.innerHTML = `<div class="box" role="dialog" aria-label="Wygląd postaci">
    <header><b>🧍 Wygląd postaci</b><button class="rnd" title="Losuj">🎲 Losuj</button><button class="x" aria-label="Zamknij">✕</button></header>
    <div class="main"><div class="prev"><div class="fig"></div><div><div class="face"></div><small>tak Cię widać<br>w grupie i na szlaku</small></div></div>
      <div class="side"><nav></nav><div class="opts"></div></div></div>
    <footer><label><input type="checkbox" class="useface"> twarz postaci jako mój awatar</label><button class="cancel">Anuluj</button><button class="primary save">Zapisz</button></footer></div>`;
  document.body.appendChild(el);
  const $e = (s) => el.querySelector(s);
  let L = null, tab = 0;

  function chips(key) {
    if (key === 'skin') return SKIN.map((c, i) => `<button class="sw${L.skin === i ? ' on' : ''}" data-k="skin" data-v="${i}" style="background:${c}" aria-label="odcień ${i + 1}"></button>`).join('');
    if (key === 'hairColor') return HAIR_COLORS.map(([c, n], i) => `<button class="sw${L.hairColor === i ? ' on' : ''}" data-k="hairColor" data-v="${i}" style="background:${c}" title="${n}" aria-label="${n}"></button>`).join('');
    if (key.endsWith('Color')) return CLOTH.map((c, i) => `<button class="sw${L[key] === i ? ' on' : ''}" data-k="${key}" data-v="${i}" style="background:${c}" aria-label="kolor ${i + 1}"></button>`).join('');
    const lock = (it) => (it && !L.owned.includes(it.id) ? it : null);
    if (key === 'gear') return GEAR.map(([k, n]) => { const it = lock(shopItem(k)); return it ? `<button class="lock" data-buy="${it.id}">🔒 ${n} · ${it.price} 🪙</button>` : `<button class="${L[k] ? 'on' : ''}" data-k="${k}" data-v="toggle">${L[k] ? '✓ ' : ''}${n}</button>`; }).join('');
    return OPTIONS[key].map(([v, n]) => { const it = lock(shopItem(key, v)); return it ? `<button class="lock" data-buy="${it.id}">🔒 ${n} · ${it.price} 🪙</button>` : `<button class="${L[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${n}</button>`; }).join('');
  }
  function render() {
    $e('nav').innerHTML = TABS.map(([n], i) => `<button class="${i === tab ? 'on' : ''}" data-t="${i}">${n}</button>`).join('');
    if (TABS[tab][1][0][0] === 'shop') { $e('.opts').innerHTML = shopHtml(); $e('.fig').innerHTML = figureSvg(L); $e('.face').innerHTML = faceSvg(L); return; }
    $e('.opts').innerHTML = TABS[tab][1]
      .filter(([k]) => !(k === 'helmetColor' && !L.helmet) && !(k === 'packColor' && L.pack === 'none' && L.hat !== 'beanie' && L.hat !== 'band'))
      .map(([k, n]) => `<div class="grp"><small>${n}</small><div class="chips">${chips(k)}</div></div>`).join('');
    $e('.fig').innerHTML = figureSvg(L);
    $e('.face').innerHTML = faceSvg(L);
  }
  // the coins: the points from the discoveries minus the extras bought
  const coins = () => score(loadFound()).pts - spent(L.owned);
  function shopHtml() {
    return `<div class="bal">Masz <b>${coins()} 🪙</b><br><small>Monety to punkty za odkrycia przyrody i wyzwania. Zakupy nie zmniejszają punktów w rankingu.</small></div>`
      + `<div class="shop">${SHOP.map((it) => `<div class="item"><span class="i">${it.icon}</span><b>${it.name}</b><small>${it.desc}</small>`
      + (L.owned.includes(it.id) ? `<button data-wear="${it.id}">✓ Masz · ${worn(it) ? 'zdejmij' : 'załóż'}</button>` : `<button class="primary" data-buy="${it.id}">Kup za ${it.price} 🪙</button>`) + '</div>').join('')}</div>`
      + '<p><small>Więcej dodatków wkrótce.</small></p>';
  }
  const worn = (it) => { const [k, v] = it.id.split(':'); return v ? L[k] === v : !!L[k]; };
  function wear(it, on = true) { const [k, v] = it.id.split(':'); if (v) L[k] = on ? v : DEFAULT_LOOK[k]; else L[k] = on; }
  function buy(id) {
    const it = SHOP.find((x) => x.id === id); if (!it) return;
    const c = coins();
    if (c < it.price) { alert(`${it.name} kosztuje ${it.price} 🪙, masz ${c} 🪙. Odkrywaj rośliny i zwierzęta na szlaku i rób wyzwania, żeby zebrać więcej.`); return; }
    if (!confirm(`Kupić: ${it.name} za ${it.price} 🪙? Zostanie ${c - it.price} 🪙.`)) return;
    L.owned = [...L.owned, id]; wear(it);
    // bought is bought, also when the editor is closed without saving
    PR.look = cleanLook({ ...(cleanLook(PR.look) || DEFAULT_LOOK), owned: L.owned }); saveProfile(PR); onSaved();
    render();
  }
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (b && b.dataset.buy) { buy(b.dataset.buy); return; }
    if (b && b.dataset.wear) { const it = SHOP.find((x) => x.id === b.dataset.wear); wear(it, !worn(it)); render(); return; }
    if (!b) { if (ev.target === el) close(); return; }
    if (b.dataset.t) { tab = +b.dataset.t; render(); return; }
    if (b.dataset.k) {
      const k = b.dataset.k, v = b.dataset.v;
      if (v === 'toggle') L[k] = !L[k];
      else L[k] = /Color$|^skin$/.test(k) ? +v : v;
      // switching to a woman clears the beard (it can be chosen again)
      if (k === 'sex' && v === 'f') L.beard = 'none';
      render(); return;
    }
    if (b.classList.contains('rnd')) { L = { ...randomLook(), owned: L.owned }; render(); return; }
    if (b.classList.contains('x') || b.classList.contains('cancel')) { close(); return; }
    if (b.classList.contains('save')) {
      PR.look = cleanLook(L);
      if ($e('.useface').checked) PR.avatar = faceDataUrl(PR.look);
      saveProfile(PR); close(); onSaved();
    }
  });
  addEventListener('keydown', (e) => { if (!el.hidden && e.code === 'Escape') close(); });
  function open() {
    L = { ...(cleanLook(PR.look) || DEFAULT_LOOK) }; L.owned = [...(L.owned || [])];
    tab = 0;
    // the face as the avatar: suggested unless a photo is already set
    $e('.useface').checked = !(PR.avatar && PR.avatar.startsWith('data:image/jpeg'));
    render(); el.hidden = false;
  }
  function close() { el.hidden = true; }
  return { open };
}
