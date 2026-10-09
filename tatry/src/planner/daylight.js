// When the day ends and what the weather does on the route: sunrise, sunset and civil dusk from the
// sun's position (works offline), the forecast from Open-Meteo (free, no key) for the route's highest
// point at its own altitude, kept in the browser for use without signal.

// ---------------------------------------------------------------- sun (after the NOAA / SunCalc formulas)
const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
const toDays = (d) => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
const e = rad * 23.4397;
const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
const declination = (l) => Math.asin(Math.sin(e) * Math.sin(l));

// sunrise, sunset (the sun's upper edge at the horizon) and the end of civil dusk (sun 6° below) of the
// calendar day of `date` at lon/lat; Date objects, or null in polar day/night
export function sunTimes(date, lat, lon) {
  const lw = rad * -lon, phi = rad * lat;
  const d = toDays(date);
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L);
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const at = (h) => {
    const w = Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    if (!isFinite(w)) return [null, null];
    const Jset = J2000 + (0.0009 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
  };
  const [sunrise, sunset] = at(-0.833 * rad);
  const [dawn, dusk] = at(-6 * rad);
  return { sunrise, sunset, dawn, dusk };
}

export const hhmm = (d) => d ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : '–';
export const hm = (min) => { const m = Math.round(Math.abs(min)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`; };

// ---------------------------------------------------------------- forecast
const KEY = 'tatry-forecast';
export const WMO = {
  0: 'bezchmurnie', 1: 'prawie bezchmurnie', 2: 'częściowe zachmurzenie', 3: 'pochmurno', 45: 'mgła', 48: 'mgła szadziowa',
  51: 'mżawka', 53: 'mżawka', 55: 'silna mżawka', 56: 'marznąca mżawka', 57: 'marznąca mżawka', 61: 'słaby deszcz', 63: 'deszcz',
  65: 'ulewa', 66: 'marznący deszcz', 67: 'marznący deszcz', 71: 'słaby śnieg', 73: 'śnieg', 75: 'intensywny śnieg', 77: 'krupa',
  80: 'przelotny deszcz', 81: 'przelotne opady', 82: 'gwałtowne ulewy', 85: 'przelotny śnieg', 86: 'intensywny śnieg',
  95: 'burza', 96: 'burza z gradem', 99: 'burza z gradem',
};
export const ICON = (c) => c >= 95 ? '⛈' : c >= 71 && c <= 86 && c !== 80 && c !== 81 && c !== 82 ? '🌨' : c >= 51 ? '🌧' : c >= 45 ? '🌫' : c === 3 ? '☁️' : c === 2 ? '⛅' : '☀️';

// a fetch that gives up after `ms` (a blocked or very slow network must not leave "Pobieram prognozę…" forever)
export function fetchTimeout(url, ms = 12000) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ac && ac.abort(), ms);
  return fetch(url, ac ? { signal: ac.signal } : {}).finally(() => clearTimeout(t));
}

// hourly forecast at (lat, lon, ele); cached per place for 3 h (maxAge), the last one kept for offline use
export async function forecast(lat, lon, ele, maxAge = 3 * 3600e3) {
  const id = `${lat.toFixed(2)},${lon.toFixed(2)},${Math.round(ele / 50) * 50}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (err) { /* private mode */ }
  if (cached && cached.id === id && Date.now() - cached.at < maxAge) return cached;
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), elevation: Math.round(ele),
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,freezing_level_height',
    timezone: 'Europe/Warsaw', forecast_days: 3, wind_speed_unit: 'kmh',
  });
  try {
    const j = await (await fetchTimeout(url)).json();
    if (!j.hourly) throw new Error('no data');
    const out = { id, at: Date.now(), ele, hourly: j.hourly };
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (err) { /* full */ }
    return out;
  } catch (err) {
    return cached ? { ...cached, stale: true } : null;
  }
}

// summary of the forecast over the walk [t0, t1] (Date): worst of each, thunderstorm hours, a verdict
export function walkWeather(fc, t0, t1, startEle) {
  const H = fc.hourly, rows = [];
  for (let i = 0; i < H.time.length; i++) {
    const t = new Date(H.time[i]);          // local time strings (Europe/Warsaw); the browser reads them as local
    if (t >= new Date(t0.getTime() - 3600e3) && t <= t1) rows.push(i);
  }
  if (!rows.length) return null;
  const max = (k) => Math.max(...rows.map((i) => H[k][i] ?? -Infinity));
  const min = (k) => Math.min(...rows.map((i) => H[k][i] ?? Infinity));
  const storm = rows.filter((i) => H.weather_code[i] >= 95).map((i) => new Date(H.time[i]));
  const worst = rows.reduce((a, i) => (H.weather_code[i] > H.weather_code[a] ? i : a), rows[0]);
  const lapse = (fc.ele - startEle) * 0.0065;                 // °C warmer at the start than at the top
  // the start: the hour the walk begins (the warmest hour of the walk went with the start, even when it was the top)
  const atStart = rows.reduce((a, i) => (Math.abs(new Date(H.time[i]) - t0) < Math.abs(new Date(H.time[a]) - t0) ? i : a), rows[0]);
  const w = {
    code: H.weather_code[worst], text: WMO[H.weather_code[worst]] || '', icon: ICON(H.weather_code[worst]),
    tTop: min('temperature_2m'), feelsTop: min('apparent_temperature'), tStart: H.temperature_2m[atStart] + lapse,
    rainP: max('precipitation_probability'), rain: rows.reduce((s, i) => s + (H.precipitation[i] || 0), 0),
    wind: max('wind_speed_10m'), gust: max('wind_gusts_10m'), freeze: min('freezing_level_height'),
    storm, stale: !!fc.stale, at: new Date(fc.at),
  };
  const warn = [];
  if (storm.length) warn.push(`⛈ Burza w prognozie od ${hhmm(storm[0])}: zejdź z grani i szczytów wcześniej.`);
  if (w.gust >= 70) warn.push(`💨 Porywy wiatru do ${Math.round(w.gust)} km/h na grani: niebezpiecznie na odsłoniętych odcinkach.`);
  else if (w.gust >= 50) warn.push(`💨 Silny wiatr w porywach ${Math.round(w.gust)} km/h.`);
  if (w.freeze < fc.ele && w.rain > 0.2) warn.push(`🧊 Granica zamarzania ${Math.round(w.freeze)} m: opady mogą być śniegiem, skały oblodzone.`);
  else if (w.feelsTop <= 0) warn.push(`🥶 Odczuwalnie ${Math.round(w.feelsTop)}°C na górze: czapka i rękawiczki.`);
  if (w.rainP >= 60) warn.push(`🌧 Duża szansa opadów (${w.rainP}%): mokre skały są śliskie.`);
  w.warn = warn;
  return w;
}
