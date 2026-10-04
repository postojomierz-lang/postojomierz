// What to take on the route: a checklist worked out from what the planner knows about it — the walking
// time, the climb, the highest point, the difficult stretches (chains, ladders: corrections.js), the
// margin before dark, the forecast for the top and the season. Each item says why it is on the list;
// `must` marks the ones the route really needs (the rest are the usual good practice).

const LAYERS = 'koszulka termoaktywna (nie bawełna), polar, kurtka przeciwwiatrowa';

// r: { time (min), up, down, maxE, hard (names of difficult stretches), osm (chains and alpine stretches
// along the route, main.js hardAlong), margin (min before sunset, or
// null), early (start before sunrise), date, w (forecast for the walk, or null) }
export function packList(r) {
  const h = r.time / 60, out = [];
  const add = (id, t, why, must = false) => out.push({ id, t, why, must });
  const m = r.date.getMonth(), d = r.date.getDate();
  const winter = m === 11 || m <= 2 || (m === 10 && d >= 15) || m === 3 || (m === 4 && d <= 15)
    || (r.w && r.w.freeze != null && r.w.freeze < r.maxE);
  const high = r.maxE >= 1500, alpine = r.maxE >= 1900;
  const w = r.w;
  const warm = w && w.tTop >= 18, cold = (w && w.feelsTop <= 5) || winter;

  // feet and the pack
  add('buty', winter ? 'Buty zimowe za kostkę, z twardą podeszwą' : 'Buty trekkingowe za kostkę, z dobrą podeszwą (np. Vibram)',
    r.hard.length || alpine ? 'kamieniste i strome podejścia' : 'kamienie i korzenie na szlaku', true);
  add('plecak', `Plecak ${h > 6 || winter ? '30–40' : '20–30'} l`, h > 6 ? 'długa trasa: więcej wody, jedzenia i ubrań' : 'woda, jedzenie i warstwa na zmianę');
  if (r.up > 600 || r.down > 600) add('kijki', 'Kijki trekkingowe', `${Math.round(Math.max(r.up, r.down))} m ${r.down > r.up ? 'zejścia' : 'podejścia'}: odciążają kolana`);

  // food and water
  const litres = Math.max(1, Math.round((h * 0.35 + r.up / 1000 * 0.5 + (warm ? 0.5 : 0)) * 2) / 2);
  add('woda', `Woda: ok. ${String(litres).replace('.', ',')} l na osobę`, `${Math.floor(h)}:${String(Math.round(r.time % 60)).padStart(2, '0')} h marszu${warm ? ', ciepło' : ''}; źródeł na szlaku nie licz na pewno`, true);
  add('jedzenie', h > 3 ? 'Prowiant: kanapki i przekąski (orzechy, batony, owoce)' : 'Przekąski (batony, owoce)', h > 3 ? 'energia na cały dzień; schroniska bywają zatłoczone' : 'na postój');
  if (cold) add('termos', 'Termos z ciepłą herbatą', 'zimno na górze');

  // clothes
  add('warstwy', `Ubranie na warstwy: ${LAYERS}`, high ? `na ${Math.round(r.maxE)} m bywa o ${Math.round((r.maxE - r.minE) / 100 * 0.6)}°C zimniej niż na starcie` : 'pogoda w górach zmienia się szybko', true);
  if (high || (w && w.rainP >= 30)) add('kurtka', 'Kurtka przeciwdeszczowa (membrana)', w && w.rainP >= 30 ? `opady ${w.rainP}%` : 'na grani wieje i może padać', w && w.rainP >= 30);
  if (w && w.rainP >= 40) add('deszcz', 'Pokrowiec na plecak, spodnie przeciwdeszczowe', `opady ${w.rainP}%${w.rain >= 0.1 ? `, ${w.rain.toFixed(1)} mm` : ''}`);
  if (alpine || cold) add('czapka', 'Czapka i rękawiczki', w ? `na górze odczuwalnie ${Math.round(w.feelsTop)}°C` : `wysoko (${Math.round(r.maxE)} m)`, cold);
  if (high || warm) add('slonce', 'Okulary przeciwsłoneczne, krem z filtrem, czapka z daszkiem', high ? 'powyżej lasu nie ma cienia' : 'słońce i ciepło');
  add('zapas', 'Zapasowa koszulka i skarpety', 'przebierzesz się po przepoceniu (wychłodzenie)');

  // the route's hard parts: chains and exposed alpine stretches from OpenStreetMap (osm), the difficult
  // stretches of corrections.js (hard), else only a guess from the height
  const o = r.osm || { chainM: 0, alpineM: 0, chains: new Map(), alpine: new Map(), grade: 0 };
  const metres = (len) => `ok. ${Math.max(10, Math.round(len / 10) * 10)} m`;
  const named = (m) => [...m].filter(([n, len]) => n && len >= 5).map(([n]) => n).slice(0, 3);
  const list = (m, total) => metres(total) + (named(m).length ? ` (${named(m).join(', ')})` : '');
  const chains = o.chainM >= 20, alpineT = o.alpineM >= 100 ? o.grade : 0;   // not a side path passing by
  if (chains || alpineT || r.hard.length || r.maxE >= 2100) {
    const why = [chains && `łańcuchy/klamry ${list(o.chains, o.chainM)}`, alpineT && `teren eksponowany T${alpineT}, ${String(Math.round(o.alpineM / 100) / 10).replace('.', ',')} km${named(o.alpine).length ? ` (${named(o.alpine).join(', ')})` : ''}`,
      r.hard.length && `trudne odcinki: ${r.hard.join(', ')}`].filter(Boolean);
    add('kask', 'Kask', why.length ? why.join('; ') : 'wysoko: spadające kamienie', why.length > 0 || r.maxE >= 2300);
    if (chains || r.hard.length || r.maxE >= 2100) add('rekawice', 'Rękawiczki do łańcuchów', chains ? 'łańcuchy są zimne i ostre' : 'wysoko bywają łańcuchy', chains);
    if (alpineT >= 4 || r.hard.length) add('ekspozycja', 'Pewny krok i brak lęku wysokości (dzieci tylko z asekuracją)', 'przepaście tuż przy szlaku', true);
  }

  // the dark
  const late = r.margin != null && r.margin < 90;
  add('czolowka', 'Czołówka (latarka czołowa) z zapasowymi bateriami',
    r.early ? 'wyjście przed wschodem słońca' : late ? (r.margin < 0 ? 'nie zdążysz przed zmrokiem' : `zapas do zachodu tylko ${Math.round(r.margin)} min`) : 'na wszelki wypadek: TOPR radzi zawsze', r.early || late);

  // winter
  if (winter) {
    add('raki', alpine ? 'Raki i czekan (umiejętność hamowania)' : 'Raczki (nakładki z kolcami)', alpine ? 'oblodzone, strome stoki wysoko' : 'oblodzone ścieżki', true);
    add('stuptuty', 'Stuptuty (ochraniacze na buty)', 'śnieg');
    if (r.maxE >= 1500) add('lawina', 'Detektor lawinowy, sonda, łopata (i umiejętność ich użycia)', 'teren lawinowy: sprawdź komunikat lawinowy TOPR / HZS', true);
  }

  // safety and the rest
  add('telefon', h > 4 ? 'Naładowany telefon i powerbank' : 'Naładowany telefon', 'nawigacja i wezwanie pomocy; mapa offline zapisana wcześniej', true);
  add('apteczka', 'Apteczka: plastry na otarcia, bandaż elastyczny, leki przeciwbólowe, folia NRC', 'drobne urazy i wychłodzenie', true);
  add('numery', 'Numer TOPR 985 lub +48 601 100 300 (Słowacja HZS 18 300), aplikacja Ratunek', 'zapisz w telefonie przed wyjściem', true);
  add('dokument', 'Dowód osobisty, ubezpieczenie (na Słowacji ratownictwo jest płatne), gotówka', 'schroniska i opłaty TPN');
  if (h > 9) add('nocleg', 'Nocleg w schronisku (rezerwacja) zamiast jednego dnia', `${Math.floor(h)} h marszu to bardzo długi dzień; namiot się nie przyda — w TPN i TANAP biwak jest zabroniony`);
  return out;
}
