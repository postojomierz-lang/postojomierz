// The side panel's tabs (route, journal, challenges, groups, account), the account chip in the header
// (the avatar and whether one is signed in, mirrored from the account tab) and, on phones, the panel's three
// heights: low (a big map for planning), half and tall. The grab handle is tapped or swiped up and down, and
// the ⤢ button on the map lowers the panel or brings it back.
const KEY = 'planner-tab';

export function setupTabs() {
  const side = document.getElementById('side');
  const tabs = [...document.querySelectorAll('#tabs [data-tab]')];
  let cur = null;
  function show(name) {
    if (!document.getElementById('tab-' + name)) name = 'route';
    cur = name;
    for (const b of tabs) b.classList.toggle('on', b.dataset.tab === name);
    for (const t of document.querySelectorAll('#side .tab')) t.classList.toggle('on', t.id === 'tab-' + name);
    side.scrollTop = 0;
    try { localStorage.setItem(KEY, name); } catch (e) { /* private mode */ }
  }
  document.getElementById('side').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    // on a phone, tapping the open tab again pulls the panel up or down
    if (b.dataset.tab === cur && b.closest('#tabs') && innerWidth <= 760) height(side.classList.contains('tall') ? 1 : 2);
    else if (side.classList.contains('low')) height(1);
    show(b.dataset.tab);
    // the e-mail field gets the cursor only on a computer, from the header's "Zaloguj": on a phone the keyboard
    // would cover half the screen
    if (b.id === 'b-account' && !matchMedia('(pointer: coarse)').matches && !document.getElementById('o-login').hidden) setTimeout(() => document.getElementById('o-mail').focus(), 50);
  });
  // 0 low, 1 half, 2 tall
  const level = () => side.classList.contains('low') ? 0 : side.classList.contains('tall') ? 2 : 1;
  function height(n) {
    side.classList.toggle('low', n === 0);
    side.classList.toggle('tall', n === 2);
    big.textContent = n === 0 ? '⤡' : '⤢';
    big.title = n === 0 ? 'Pokaż panel' : 'Większa mapa';
  }
  const big = document.createElement('button');
  big.id = 'b-bigmap';
  document.getElementById('mapwrap').appendChild(big);
  big.onclick = (e) => { e.stopPropagation(); height(level() === 0 ? 1 : 0); };
  height(1);
  const grab = document.getElementById('grab');
  let y0 = null;
  grab.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  grab.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    if (Math.abs(dy) < 25) return;                   // a tap: the click below
    e.preventDefault();                              // no click after a swipe
    height(Math.max(0, Math.min(2, level() + (dy < 0 ? 1 : -1))));
  });
  grab.onclick = () => height(level() === 1 ? 2 : 1);
  side.addEventListener('transitionend', (e) => { if (e.target === side) dispatchEvent(new Event('resize')); });   // the map fills the rest
  // picking a route from the journal or a group's list shows it on the route tab
  for (const id of ['j-favs', 'j-walks', 'g-routes']) {
    document.getElementById(id).addEventListener('click', (e) => { if (e.target.closest('li:not(.empty)')) setTimeout(() => show('route'), 0); });
  }
  let saved = 'route';
  try { saved = localStorage.getItem(KEY) || 'route'; } catch (e) { /* private mode */ }
  show(saved);

  // the header chip follows the account tab
  const chip = document.getElementById('b-account'), chipAv = document.getElementById('b-account-av'), chipT = document.getElementById('b-account-t');
  const av = document.getElementById('p-avatar');
  function chipUpdate() {
    const signedIn = !document.getElementById('o-account').hidden;
    const offline = !document.getElementById('o-none').hidden;
    chip.classList.toggle('in', signedIn);
    chipT.textContent = signedIn ? (document.getElementById('p-name').textContent || 'Konto') : offline ? 'Profil' : 'Zaloguj';
    chipAv.style.backgroundImage = av.style.backgroundImage;
    chipAv.textContent = av.style.backgroundImage ? '' : (av.textContent || '👤');
  }
  const mo = new MutationObserver(chipUpdate);
  for (const id of ['o-account', 'o-none', 'p-avatar', 'p-name']) {
    mo.observe(document.getElementById(id), { attributes: true, childList: true, characterData: true, subtree: true });
  }
  chipUpdate();
  return { show };
}
