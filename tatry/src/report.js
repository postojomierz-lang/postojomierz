// Test reports: a 🐞 button that takes a screenshot, asks what is wrong and sends both, together with
// where it happened (route, position on it, coordinates, camera, mode), the device (screen, quality,
// frame rate, browser), the weather and time of day and the last console errors, to the project's
// database (table bug_reports, insert-only for the app; tools/bug_reports.py reads them). No e-mail or
// account id is attached. Without signal the report waits in the browser and goes out later.
const URL_ = __SUPABASE_URL__, KEY = __SUPABASE_KEY__;
const QUEUE = 'szlakownik-reports';
const LOG = [];

// the last console errors and warnings (and uncaught errors), for the report
export function captureConsole() {
  const push = (type, args) => {
    const msg = args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack || ''}` : typeof a === 'object' ? safe(a) : String(a))).join(' ').slice(0, 800);
    LOG.push({ t: new Date().toISOString().slice(11, 19), type, msg });
    if (LOG.length > 40) LOG.shift();
  };
  const safe = (o) => { try { return JSON.stringify(o).slice(0, 400); } catch (e) { return String(o); } };
  for (const type of ['error', 'warn']) {
    const orig = console[type].bind(console);
    console[type] = (...a) => { push(type, a); orig(...a); };
  }
  addEventListener('error', (e) => push('uncaught', [e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno]));
  addEventListener('unhandledrejection', (e) => push('promise', [e.reason]));
}

const CSS = `
.rp-modal[hidden]{display:none!important}
.rp-modal{position:fixed;inset:0;z-index:5000;background:rgba(20,24,28,.6);display:flex;align-items:center;justify-content:center;padding:10px;font:14px/1.4 system-ui,sans-serif}
.rp-sheet{background:#fff;color:#1d2327;border-radius:14px;width:min(480px,100%);max-height:calc(100% - 10px);overflow:auto;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
.rp-sheet h3{margin:0 0 8px;font-size:17px;display:flex;align-items:center}.rp-sheet h3 button{margin-left:auto;border:0;background:none;font-size:18px;cursor:pointer}
.rp-shot{width:100%;border-radius:8px;border:1px solid #ddd;display:block;background:#eee;min-height:60px}
.rp-sheet textarea{width:100%;box-sizing:border-box;min-height:96px;margin:8px 0 4px;font:inherit;padding:8px;border:1px solid #ccc;border-radius:8px}
.rp-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rp-row small{color:#6a7178;flex:1;min-width:160px}
.rp-btn{font:inherit;padding:8px 14px;border-radius:9px;border:1px solid #ccc!important;background:#f6f5f1!important;color:#1d2327!important;cursor:pointer;opacity:1!important}
.rp-send{background:#c8201c!important;border-color:#c8201c!important;color:#fff!important;font-weight:600}.rp-send:disabled{opacity:.6}
.rp-note{font-size:12px;color:#6a7178;margin-top:6px}.rp-ok{color:#1f7a33;font-weight:600}.rp-err{color:#c8201c}
.rp-where{font-size:12px;color:#3a4046;background:#f6f5f1;border-radius:8px;padding:6px 8px;margin-top:6px}`;

// shrink a screenshot to at most 1280 px wide, JPEG (a few hundred kB at most)
function shrink(src, maxW = 1280, q = 0.72) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxW / img.width), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => res(null);
    img.src = src;
  });
}

async function post(row) {
  const r = await fetch(`${URL_}/rest/v1/bug_reports?select=id`, {
    method: 'POST', body: JSON.stringify(row),
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j[0] && j[0].id;
}
function queued() { try { return JSON.parse(localStorage.getItem(QUEUE) || '[]'); } catch (e) { return []; } }
function setQueue(q) { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-5))); } catch (e) { /* full: drop */ } }
async function flush() {
  const q = queued();
  if (!q.length || !URL_) return;
  const left = [];
  for (const row of q) { try { await post(row); } catch (e) { left.push(row); } }
  setQueue(left);
}

// app: '3d' | 'planer'; screenshot(): a data URL (or null); context(): what to attach
export function setupReport({ app, button, screenshot, context }) {
  if (!document.getElementById('rp-css')) { const s = document.createElement('style'); s.id = 'rp-css'; s.textContent = CSS; document.head.appendChild(s); }
  const box = document.createElement('div');
  box.className = 'rp-modal'; box.hidden = true;
  box.innerHTML = `<div class="rp-sheet">
    <h3>🐞 Zgłoś problem<button class="rp-x" title="Zamknij">✕</button></h3>
    <img class="rp-shot" alt="zrzut ekranu">
    <div class="rp-row" style="margin-top:6px"><small>Zrzut zrobiony automatycznie. Możesz dodać własny zrzut z telefonu.</small>
      <label class="rp-btn">📎 Własny zrzut<input type="file" accept="image/*" hidden class="rp-file"></label></div>
    <textarea class="rp-desc" maxlength="4000" placeholder="Co jest nie tak? Np. „łańcuchy wiszą w powietrzu nad ścieżką”, „drzewa na piargu”, „brak kozic”, „tnie się przy zejściu”…"></textarea>
    <div class="rp-where"></div>
    <div class="rp-row" style="margin-top:8px"><button class="rp-btn rp-cancel">Anuluj</button><span style="flex:1"></span><button class="rp-btn rp-send">Wyślij zgłoszenie</button></div>
    <div class="rp-note">Wysyłamy: zrzut, opis, miejsce (trasa, pozycja, współrzędne), dane urządzenia i ostatnie błędy aplikacji. Bez e-maila i danych konta.</div>
    <div class="rp-msg"></div></div>`;
  document.body.appendChild(box);
  const $r = (s) => box.querySelector(s);
  let shot = null, ctx = null;
  const close = () => { box.hidden = true; };
  $r('.rp-x').onclick = close; $r('.rp-cancel').onclick = close;
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  box.addEventListener('keydown', (e) => e.stopPropagation());   // typing must not steer the 3D view
  $r('.rp-file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const url = URL.createObjectURL(f); shot = await shrink(url, 1400, 0.75); URL.revokeObjectURL(url);
    $r('.rp-shot').src = shot || '';
  };
  async function open() {
    ctx = null; shot = null;
    try { ctx = context(); } catch (e) { ctx = { contextError: String(e) }; }
    try { const s = await screenshot(); shot = s ? await shrink(s) : null; } catch (e) { shot = null; }
    $r('.rp-shot').src = shot || ''; $r('.rp-shot').style.display = shot ? 'block' : 'none';
    $r('.rp-where').textContent = ctx && ctx.where ? `📍 ${ctx.where}` : '';
    $r('.rp-desc').value = ''; $r('.rp-msg').textContent = ''; $r('.rp-send').disabled = false;
    box.hidden = false;
    setTimeout(() => $r('.rp-desc').focus(), 50);
  }
  $r('.rp-send').onclick = async () => {
    const description = $r('.rp-desc').value.trim();
    if (!description) { $r('.rp-desc').focus(); $r('.rp-msg').innerHTML = '<span class="rp-err">Napisz krótko, co jest nie tak.</span>'; return; }
    const row = { app, description, context: { ...ctx, log: LOG.slice(-25) }, screenshot: shot };
    $r('.rp-send').disabled = true; $r('.rp-msg').textContent = 'Wysyłam…';
    if (!URL_) { $r('.rp-msg').innerHTML = '<span class="rp-err">Ta wersja nie ma połączenia z bazą (brak konfiguracji).</span>'; return; }
    try {
      const id = await post(row);
      $r('.rp-msg').innerHTML = `<span class="rp-ok">✓ Wysłano zgłoszenie nr ${id}. Dziękuję!</span>`;
      setTimeout(close, 6000);                                        // time to note the number
    } catch (e) {
      setQueue([...queued(), row]);
      $r('.rp-msg').innerHTML = `<span class="rp-err">Nie wysłano (${String(e.message || e).slice(0, 120)}). Zapisane w telefonie, pójdzie samo, gdy wróci zasięg.</span>`;
      $r('.rp-send').disabled = false;
    }
  };
  if (button) button.onclick = open;
  addEventListener('online', flush);
  setTimeout(flush, 5000);
  return { open };
}

// the common part of the context: device, screen, version
export function deviceContext() {
  return {
    build: typeof __BUILD__ !== 'undefined' ? __BUILD__ : '', url: location.pathname + location.search + location.hash,
    ua: navigator.userAgent, screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}`, lang: navigator.language,
    online: navigator.onLine, time: new Date().toString(),
  };
}
