// A short guide shown at the first start (and again from the account tab): what the app does, in four
// screens, with dots and "Dalej / Pomiń".
const KEY = 'szlakownik-intro';
const SLIDES = [
  ['🏔', 'Witaj w Szlakowniku', 'Planer tras po znakowanych szlakach Tatr, spacer po trasie w 3D, nawigacja GPS z mapą offline i odkrywanie tatrzańskiej przyrody.'],
  ['🗺', 'Zaplanuj trasę', 'Kliknij na mapie start i cel (możesz dodać punkty pośrednie). Zobaczysz czas przejścia według norm PTTK, profil, zachód słońca i prognozę pogody na szczycie. Przycisk 🌦 pokazuje pogodę nad szczytami i schroniskami.'],
  ['🌿', 'Przejdź ją w 3D i odkrywaj', '„Idź w 3D” pokazuje trasę w trójwymiarze, z pogodą z prognozy na godzinę, o której tam będziesz. Podchodząc do roślin, zwierząt, szczytów i stawów, odkrywasz je: karty ze zdjęciem, punkty, odznaki i wyzwania.'],
  ['🧭', 'Na szlaku', 'Nawigacja GPS prowadzi do celu i ostrzega o burzy i silnym wietrze. Przed wyjściem pobierz mapę na offline. W razie wypadku czerwony przycisk SOS: TOPR 985 / 601 100 300, pozycja do wysłania SMS-em.'],
];

export function setupIntro() {
  const box = document.getElementById('intro');
  let k = 0;
  function render() {
    const [icon, title, body] = SLIDES[k];
    box.querySelector('.in-icon').textContent = icon;
    box.querySelector('.in-title').textContent = title;
    box.querySelector('.in-body').textContent = body;
    box.querySelector('.in-dots').innerHTML = SLIDES.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('');
    box.querySelector('.in-next').textContent = k === SLIDES.length - 1 ? 'Zaczynamy' : 'Dalej →';
    box.querySelector('.in-skip').style.visibility = k === SLIDES.length - 1 ? 'hidden' : 'visible';
  }
  function close() { box.hidden = true; try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ } }
  function open() { k = 0; render(); box.hidden = false; }
  box.querySelector('.in-next').onclick = () => { if (k < SLIDES.length - 1) { k++; render(); } else close(); };
  box.querySelector('.in-skip').onclick = close;
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }
  if (!seen && !location.hash.includes('join=')) open();
  return { open };
}
