// The online part of the planner (Supabase, see supabase/): signing in with a link from an e-mail,
// the profile and the journal synced between the person's devices, hiking groups joined with an invite
// code, the group's chat and routes, and the members' positions on the map while they navigate (shared
// only on purpose, only with the chosen group, removed at the end of the walk, expiring in any case), and the
// nature discoveries with their points for the rankings (only for those who show their profile publicly).
// Everything works without an account too: the journal stays in the browser as before.
import { cleanLook } from '../avatar/look.js';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';
import { loadFound, saveFound, score } from '../nature/discover.js';
import { BY_ID, RARITY } from '../nature/catalog.js';
import { clearLocalData } from './localdata.js';

const SB_URL = __SUPABASE_URL__, SB_KEY = __SUPABASE_KEY__;
const sb = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'tatry-auth',
    // every e-mail gets its own PKCE verifier (its id comes back in the link): sending again does not spoil the first link
    experimental: { appendPkceFlowIdToRedirects: true } },
}) : null;

const LOGIN_HASH = 'tatry-login-hash', JOIN = 'tatry-join', GROUP = 'tatry-group';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// runs at import, before the planner reads the address: the e-mail link comes back as ?code=... (the
// route in #r=... is lost on the way, it was kept here), an invite as ?dolacz=CODE
const q = new URLSearchParams(location.search);
const authError = q.get('error_description');
if (q.has('dolacz')) store.set(JOIN, q.get('dolacz').trim().toLowerCase());
if ((q.has('code') || authError) && !location.hash && store.get(LOGIN_HASH)) history.replaceState(null, '', location.pathname + location.search + store.get(LOGIN_HASH));
if (q.has('dolacz') || authError || q.has('error')) cleanUrl(['dolacz', 'error', 'error_code', 'error_description']);
function cleanUrl(keys) {
  const u = new URL(location.href);
  for (const k of keys) u.searchParams.delete(k);
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

const avatarHtml = (a, esc) => a && a.startsWith('data:') ? `<i class="av" style="background-image:url(${a})"></i>` : `<i class="av">${esc(a || '🥾')}</i>`;
const ago = (t) => {
  const m = Math.round((Date.now() - Date.parse(t)) / 60000);
  return m < 1 ? 'teraz' : m < 60 ? `${m} min temu` : `${Math.floor(m / 60)} h ${m % 60} min temu`;
};

export function setupOnline({ $, map, J, PR, loadJournal, saveJournal, saveProfile, totals, render, msg, esc, routeTitle, hasRoute, openHash }) {
  const noop = { onPosition() {}, onNavStop() {}, sync() {}, leaderboard: async () => null, setPublic() {}, get user() { return null; } };
  if (!sb) { $('o-login').hidden = true; $('o-none').hidden = false; return noop; }

  let user = null, syncing = false, again = false, groups = [], gid = store.get(GROUP), members = new Map(), channel = null;
  let sharing = false, lastSent = null;
  const mates = L.layerGroup().addTo(map), mateMarkers = new Map();

  // ------------------------------------------------------------ signing in
  function showAccount() {
    $('o-login').hidden = !!user;
    $('o-account').hidden = !user;
    $('groups').hidden = !user;
    if (user) $('o-email').textContent = user.email;
    navShareButton();
  }
  if (authError) msg(`Logowanie nie powiodło się: ${authError}. Wyślij link jeszcze raz.`);
  $('o-send').onclick = async () => {
    const email = $('o-mail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { $('o-mail').focus(); return; }
    store.set(LOGIN_HASH, location.hash || null);
    $('o-send').disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: {
      emailRedirectTo: location.origin + location.pathname, data: { name: (PR.name || 'Turysta').slice(0, 40) } } });
    $('o-send').disabled = false;
    if (error) {
      $('o-note').textContent = error.code === 'over_email_send_rate_limit' ? 'Serwer wysłał już limit e-maili na tę godzinę. Spróbuj za jakiś czas.'
        : error.status === 429 ? 'Link był wysłany przed chwilą: sprawdź skrzynkę (także spam) albo spróbuj za minutę.' : `Nie wysłano: ${error.message}`;
      return;
    }
    $('o-note').textContent = `Wysłano link na ${email}. Otwórz go na tym urządzeniu (albo wpisz kod z e-maila poniżej).`;
    $('o-code-row').hidden = false;
  };
  $('o-mail').onkeydown = (e) => { if (e.key === 'Enter') $('o-send').click(); };
  $('o-verify').onclick = async () => {
    const token = $('o-code').value.replace(/\s/g, '');
    if (!token) return;
    const { error } = await sb.auth.verifyOtp({ email: $('o-mail').value.trim(), token, type: 'email' });
    if (error) $('o-note').textContent = `Kod nie pasuje: ${error.message}`;
  };
  $('o-delete').onclick = async () => {
    if (!confirm('Usunąć konto i wszystkie dane na serwerze: profil, dziennik, odkrycia, miejsce w rankingu, grupy, które założyłeś (z czatem i trasami), wiadomości? Tego nie da się cofnąć.')) return;
    const t = prompt('Żeby potwierdzić, wpisz: USUŃ');
    if ((t || '').trim().toUpperCase() !== 'USUŃ') return;
    const { error } = await sb.rpc('delete_my_account');
    if (error) { alert(`Nie udało się usunąć konta: ${error.message}`); return; }
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    if (confirm('Konto i dane na serwerze zostały usunięte. Usunąć też dziennik i odkrycia zapisane w tym urządzeniu?')) clearLocalData();
    location.reload();
  };
  $('o-logout').onclick = async () => {
    if (!confirm('Wylogować? Dziennik zostaje w tej przeglądarce.')) return;
    await sb.auth.signOut({ scope: 'local' });
  };

  sb.auth.onAuthStateChange((event, session) => {
    const was = user && user.id;
    user = session ? session.user : null;
    // supabase calls must not run inside this callback
    if ((user && user.id) !== was) setTimeout(() => (user ? signedIn() : signedOut()), 0);
  });
  // the e-mail link's ?code=... has been exchanged for a session by now
  sb.auth.initialize().then(({ error }) => {
    if (!q.has('code')) return;
    cleanUrl(['code', 'sb_flow_id']); store.set(LOGIN_HASH, null);
    if (error) msg('Ten link logowania już nie działa (wygasł, był użyty albo otwarto go w innej przeglądarce). Wyślij nowy.');
  });

  async function signedIn() {
    showAccount();
    $('o-note').textContent = ''; $('o-code-row').hidden = true;
    await sync();
    await loadGroups();
    checkTrips();
    const code = store.get(JOIN);
    if (code) { store.set(JOIN, null); await join(code); }
  }
  function signedOut() {
    stopSharing();
    closeGroup();
    groups = []; gid = null;
    $('trip-remind').hidden = true;
    showAccount();
  }
  if (store.get(JOIN)) msg('Zaproszenie do grupy zapamiętane: zaloguj się (niżej, przy profilu), a dołączysz automatycznie.');
  showAccount();

  // ------------------------------------------------------------ the profile and the journal
  const status = (t) => { $('o-sync').textContent = t; };
  async function sync() {
    if (!user) return;
    if (syncing) { again = true; return; }
    syncing = true; again = false; status('synchronizuję…');
    try {
      Object.assign(J, loadJournal());          // the 3D view may have added walks meanwhile
      await syncProfile();
      await syncJournal();
      await syncDiscoveries();
      saveJournal(J);
      render();
      status(`zsynchronizowano ${new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      status(navigator.onLine ? `błąd synchronizacji (${e.message || e})` : 'bez zasięgu: zsynchronizuję później');
    } finally { syncing = false; if (again) sync(); }
  }
  const ok = ({ data, error }) => { if (error) throw error; return data; };

  async function syncProfile() {
    const s = ok(await sb.from('profiles').select('name,avatar,km,ascent,peaks,updated_at').eq('id', user.id).maybeSingle());
    if (!s) return;
    const serverT = Date.parse(s.updated_at) || 0;
    const newer = serverT > (PR.updatedAt || 0);
    if (newer) {
      // changed on another device; a new account's default name does not replace the one set here
      if (s.name !== 'Turysta' || !PR.name) PR.name = s.name;
      if (s.avatar) PR.avatar = s.avatar;
      PR.updatedAt = serverT;
    }
    const t = totals(J);
    const row = { name: (PR.name || 'Turysta').slice(0, 40), avatar: PR.avatar || null,
      km: Math.round(t.km * 10) / 10, ascent: Math.round(t.up), peaks: t.peaks };
    if (Object.keys(row).some((k) => row[k] !== s[k])) {
      row.updated_at = new Date().toISOString();
      ok(await sb.from('profiles').update(row).eq('id', user.id));
      PR.updatedAt = Date.parse(row.updated_at);
    }
    await syncLook(newer);
    saveProfile(PR, false);
  }
  // the figure's look (profiles.look, added later in schema.sql: without that column the rest still syncs)
  async function syncLook(serverNewer) {
    try {
      const s = ok(await sb.from('profiles').select('look').eq('id', user.id).maybeSingle());
      if (!s) return;
      const server = cleanLook(s.look);
      if (serverNewer && server) { PR.look = server; return; }
      const mine = cleanLook(PR.look);
      if (mine && JSON.stringify(mine) !== JSON.stringify(server)) {
        const at = new Date().toISOString();                      // newer: the other devices take it
        ok(await sb.from('profiles').update({ look: mine, updated_at: at }).eq('id', user.id));
        PR.updatedAt = Date.parse(at);
      }
    } catch (e) { /* no look column yet */ }
  }

  async function syncJournal() {
    for (const w of J.walks) if (!w.id) w.id = crypto.randomUUID();
    const remote = ok(await sb.from('walks').select('id,route_key,title,walked_on,dist_m,ascent_m,time_s,gps,completed,hash')
      .order('walked_on', { ascending: false }).limit(500));
    const there = new Set(remote.map((r) => r.id)), here = new Set(J.walks.map((w) => w.id));
    const up = J.walks.filter((w) => !there.has(w.id)).map((w) => ({
      id: w.id, route_key: (w.key || '').slice(0, 2000), title: (w.title || '').slice(0, 200), walked_on: (w.date || '').slice(0, 10) || undefined,
      dist_m: Math.round(w.dist || 0), ascent_m: Math.round(w.up || 0), time_s: Math.round(w.time || 0),
      gps: !!w.gps, completed: !!w.fair, hash: (w.hash || '').slice(0, 2000) }));
    if (up.length) ok(await sb.from('walks').upsert(up, { onConflict: 'id', ignoreDuplicates: true }));
    for (const r of remote) {
      if (here.has(r.id)) continue;
      const w = { id: r.id, key: r.route_key || 'gps', title: r.title || 'Przejście', date: r.walked_on, dist: r.dist_m, up: r.ascent_m,
        time: r.time_s, fair: r.completed, gps: r.gps, hash: r.hash || '' };
      J.walks.push(w);
      const b = J.best[w.key];
      if (w.fair && (!b || w.time < b.time)) J.best[w.key] = { time: w.time, date: w.date };   // the trace stays on the device that walked it
    }
    J.walks.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (J.walks.length > 200) J.walks.length = 200;

    const peaks = ok(await sb.from('peaks').select('name,ele,reached_on'));
    const onServer = new Set(peaks.map((p) => p.name));
    const newPeaks = Object.entries(J.peaks).filter(([n]) => !onServer.has(n))
      .map(([name, p]) => ({ name: name.slice(0, 100), ele: p.ele || null, reached_on: p.date || undefined }));
    if (newPeaks.length) ok(await sb.from('peaks').upsert(newPeaks, { onConflict: 'user_id,name', ignoreDuplicates: true }));
    for (const p of peaks) if (!J.peaks[p.name]) J.peaks[p.name] = { ele: p.ele, date: p.reached_on };
  }
  // the discoveries (plants, animals, places, challenges): both ways; the points and the species count on the profile
  let isPublic = false;
  async function syncDiscoveries() {
    const found = loadFound();
    const remote = ok(await sb.from('discoveries').select('item_id,found_on,gps,points'));
    const there = new Set(remote.map((r) => r.item_id));
    const pts = (id, e) => (BY_ID[id] ? RARITY[BY_ID[id].rarity].points : Math.min(1000, e.pts || 5));
    const up = Object.entries(found).filter(([id]) => !there.has(id))
      .map(([id, e]) => ({ item_id: id.slice(0, 160), found_on: e.date || undefined, gps: !!e.gps, points: pts(id, e) }));
    if (up.length) ok(await sb.from('discoveries').upsert(up, { onConflict: 'user_id,item_id', ignoreDuplicates: true }));
    let changed = false;
    for (const r of remote) if (!found[r.item_id]) { found[r.item_id] = { date: r.found_on, gps: r.gps, ...(BY_ID[r.item_id] ? {} : { pts: r.points }) }; changed = true; }
    if (changed) saveFound(found);
    const sc = score(found);
    const prof = ok(await sb.from('profiles').select('points,species,public').eq('id', user.id).maybeSingle());
    isPublic = !!(prof && prof.public);
    if (prof && (prof.points !== sc.pts || prof.species !== sc.species)) ok(await sb.from('profiles').update({ points: sc.pts, species: sc.species }).eq('id', user.id));
  }
  async function setPublic(on) {
    if (!user) return;
    ok(await sb.from('profiles').update({ public: !!on }).eq('id', user.id));
    isPublic = !!on;
  }
  async function leaderboard(period = 'week', mode = 'all') {
    if (!user) return null;
    return ok(await sb.rpc('leaderboard', { period, mode }));
  }
  addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user) { sync(); if (gid) refreshPositions(); } });

  // ------------------------------------------------------------ groups
  async function loadGroups() {
    try { groups = ok(await sb.from('groups').select('id,name,owner,invite_code,created_at').order('created_at')); } catch (e) { groups = []; }
    if (!groups.some((g) => g.id === gid)) gid = groups.length ? groups[0].id : null;
    renderGroups();
    if (gid) openGroup(gid);
  }
  function renderGroups() {
    const sel = $('g-sel');
    sel.innerHTML = groups.map((g) => `<option value="${g.id}"${g.id === gid ? ' selected' : ''}>${esc(g.name)}</option>`).join('');
    sel.hidden = !groups.length;
    $('g-empty').hidden = !!groups.length;
    $('g-box').hidden = !gid;
    navShareButton();
  }
  $('g-sel').onchange = () => openGroup($('g-sel').value);
  $('g-new').onclick = async () => {
    const name = (prompt('Nazwa grupy (np. „Rysy w sierpniu”):') || '').trim().slice(0, 60);
    if (!name) return;
    try {
      const g = ok(await sb.from('groups').insert({ name, owner: user.id }).select('id').single());
      gid = g.id; await loadGroups();
      msg('Grupa założona. Wyślij znajomym link zaproszenia.');
    } catch (e) { msg(`Nie udało się założyć grupy: ${e.message}`); }
  };
  $('g-join').onclick = () => {
    const code = (prompt('Kod zaproszenia (12 znaków):') || '').trim().toLowerCase();
    if (code) join(code);
  };
  async function join(code) {
    const { data, error } = await sb.rpc('join_group', { code });
    if (error) { msg(/no such group/.test(error.message) ? 'Nie ma grupy z takim kodem zaproszenia.' : `Nie udało się dołączyć: ${error.message}`); return; }
    gid = data; await loadGroups();
    const g = groups.find((x) => x.id === gid);
    msg(`Dołączono do grupy „${g ? g.name : ''}”.`);
  }
  $('g-invite').onclick = async () => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    const link = `${location.origin}${location.pathname}?dolacz=${g.invite_code}`;
    const text = `Dołącz do grupy „${g.name}” w Szlakowniku: ${link} (kod: ${g.invite_code})`;
    if (navigator.share) { navigator.share({ title: 'Zaproszenie do grupy', text }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(link); msg('Link zaproszenia skopiowany.'); } catch (e) { prompt('Link zaproszenia:', link); }
  };
  $('g-leave').onclick = async () => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    const mine = g.owner === user.id;
    if (!confirm(mine ? `Usunąć grupę „${g.name}” razem z czatem i trasami? Tego nie da się cofnąć.` : `Opuścić grupę „${g.name}”?`)) return;
    stopSharing();
    const r = mine ? await sb.from('groups').delete().eq('id', g.id) : await sb.from('group_members').delete().eq('group_id', g.id).eq('user_id', user.id);
    if (r.error) { msg(r.error.message); return; }
    closeGroup(); gid = null; loadGroups();
  };

  function closeGroup() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    mates.clearLayers(); mateMarkers.clear(); members.clear();
    $('chat-log').innerHTML = ''; $('g-box').hidden = true;
  }
  async function openGroup(id) {
    if (sharing && id !== gid) stopSharing();
    closeGroup();
    gid = id; store.set(GROUP, id);
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    $('g-box').hidden = false;
    $('g-code').textContent = g.invite_code;
    $('g-leave').textContent = g.owner === user.id ? '🗑 Usuń grupę' : '⎋ Opuść grupę';
    navShareButton();
    await loadMembers();
    loadRoutes(); loadChat(); refreshPositions();
    // live: the tables in the supabase_realtime publication (schema.sql) only, another one fails the whole channel
    channel = sb.channel(`group-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${id}` }, (p) => addMessage(p.new, true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_positions', filter: `group_id=eq.${id}` }, (p) => {
        if (p.eventType === 'DELETE') dropMate(p.old.user_id); else showMate(p.new);
      })
      .subscribe();
  }

  async function loadMembers() {
    try {
      const rows = ok(await sb.from('group_members').select('user_id,role').eq('group_id', gid));
      const profs = ok(await sb.from('profiles').select('id,name,avatar').in('id', rows.map((r) => r.user_id)));
      members = new Map(rows.map((r) => [r.user_id, { role: r.role, ...(profs.find((p) => p.id === r.user_id) || { name: 'Turysta' }) }]));
    } catch (e) { /* offline: names come later */ }
    $('g-members').innerHTML = [...members.entries()].map(([id, m]) =>
      `<span class="mem">${avatarHtml(m.avatar, esc)}${esc(m.name)}${m.role === 'owner' ? ' ★' : ''}${id === user.id ? ' (Ty)' : ''}</span>`).join('');
  }
  const who = (id) => members.get(id) || { name: 'Turysta', avatar: '🥾' };

  // routes planned together
  // the group's trips: a route with (optionally) a date and a meeting place; each member answers whether they
  // come (route_rsvp; without that table, or the place column, the list works as before)
  let rsvpOk = true, routesTimer = null, editing = null;
  const fmtWhen = (t) => new Date(t).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  async function loadRoutes() {
    if (!gid) return;
    if (!routesTimer) routesTimer = setInterval(() => { if (gid && !document.hidden) loadRoutes(); }, 60000);
    let rows = [];
    const q = (cols) => sb.from('group_routes').select(cols).eq('group_id', gid).order('created_at', { ascending: false }).limit(30);
    try { rows = ok(await q('id,title,hash,created_by,created_at,starts_at,place')); }
    catch (e) { try { rows = ok(await q('id,title,hash,created_by,created_at,starts_at')); } catch (e2) { return; } }
    let rs = [];
    if (rows.length) { try { rs = ok(await sb.from('route_rsvp').select('route_id,user_id,status').in('route_id', rows.map((r) => r.id))); rsvpOk = true; } catch (e) { rsvpOk = false; } }
    // the coming trips first (soonest on top), then those without a date, the past ones at the end
    const now = Date.now(), T = (r) => (r.starts_at ? Date.parse(r.starts_at) : null);
    const rank = (r) => (T(r) === null ? 1 : T(r) > now - 6 * 3600e3 ? 0 : 2);
    rows.sort((x, y) => rank(x) - rank(y) || (rank(x) === 0 ? T(x) - T(y) : rank(x) === 2 ? T(y) - T(x) : Date.parse(y.created_at) - Date.parse(x.created_at)));
    const ul = $('g-routes');
    ul.innerHTML = rows.length ? '' : '<li><span class="empty">Brak wyjść. Wyznacz trasę i kliknij „Zaproponuj wyjście”.</span></li>';
    for (const r of rows) {
      const ans = rs.filter((x) => x.route_id === r.id), mineA = (ans.find((x) => x.user_id === user.id) || {}).status;
      const faces = (st) => ans.filter((x) => x.status === st).map((x) => `<span title="${esc(who(x.user_id).name)}">${avatarHtml(who(x.user_id).avatar, esc)}</span>`).join('');
      const nYes = ans.filter((x) => x.status === 'yes').length, nMaybe = ans.filter((x) => x.status === 'maybe').length;
      const li = document.createElement('li');
      li.className = 'trip' + (rank(r) === 2 ? ' past' : '');
      li.innerHTML = `<div class="trip-h"><span class="trip-t" data-open>🗺 ${esc(r.title)}</span>${r.created_by === user.id ? '<span class="t x" title="Usuń z grupy">✕</span>' : ''}</div>`
        + `<small>${r.starts_at ? '📅 ' + fmtWhen(r.starts_at) : 'bez terminu'}${r.place ? ' · 📍 ' + esc(r.place) : ''} · ${esc(who(r.created_by).name)}</small>`
        + (rsvpOk ? `<div class="trip-who">${nYes ? `<span>Będą (${nYes}):</span>${faces('yes')}` : '<span>Nikt jeszcze się nie zapisał</span>'}${nMaybe ? `<span>· Może (${nMaybe}):</span>${faces('maybe')}` : ''}</div>`
          + `<div class="trip-act"><button data-s="yes" class="${mineA === 'yes' ? 'on' : ''}">✓ Będę</button><button data-s="maybe" class="${mineA === 'maybe' ? 'on' : ''}">? Może</button><button data-s="no" class="${mineA === 'no' ? 'on' : ''}">✗ Nie</button>`
          + `${r.created_by === user.id ? '<button data-e>📅 Termin</button>' : ''}</div>` : '');
      li.onclick = async (ev) => {
        const b = ev.target.closest('button');
        if (ev.target.classList.contains('x')) { if (confirm('Usunąć to wyjście z grupy?')) { await sb.from('group_routes').delete().eq('id', r.id); loadRoutes(); } return; }
        if (b && b.dataset.s) {
          if (b.dataset.s !== 'no') askNotify();
          const { error } = await sb.from('route_rsvp').upsert({ route_id: r.id, user_id: user.id, status: b.dataset.s, updated_at: new Date().toISOString() }, { onConflict: 'route_id,user_id' });
          if (error) msg(error.message); else { loadRoutes(); checkTrips(); }
          return;
        }
        if (b && 'e' in b.dataset) { tripForm(r); return; }
        if (ev.target.closest('[data-open]') || !b) openHash(r.hash);
      };
      ul.appendChild(li);
    }
  }
  // the form: a new trip with the route on the map, or the date and place of one's own trip
  function tripForm(r = null) {
    editing = r;
    $('g-trip-title').textContent = r ? r.title : routeTitle();
    const pad = (n) => String(n).padStart(2, '0'), d = r && r.starts_at ? new Date(r.starts_at) : null;
    $('g-trip-when').value = d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
    $('g-trip-place').value = r ? r.place || '' : '';
    $('g-trip-ok').textContent = r ? '💾 Zapisz termin' : '📌 Dodaj wyjście';
    $('g-trip-form').hidden = false;
  }
  $('g-add-route').onclick = () => {
    if (!hasRoute()) { msg('Najpierw wyznacz trasę na mapie.'); return; }
    tripForm(null);
  };
  $('g-trip-cancel').onclick = () => { $('g-trip-form').hidden = true; };
  $('g-trip-ok').onclick = async () => {
    const when = $('g-trip-when').value ? new Date($('g-trip-when').value).toISOString() : null;
    const place = $('g-trip-place').value.trim().slice(0, 200) || null;
    const extra = { starts_at: when, ...(place ? { place } : {}) };
    if (editing) {
      let { error } = await sb.from('group_routes').update({ ...extra, place }).eq('id', editing.id);
      if (error) ({ error } = await sb.from('group_routes').update({ starts_at: when }).eq('id', editing.id));   // no place column yet
      if (error) { msg(error.message); return; }
    } else {
      const row = { group_id: gid, title: routeTitle().slice(0, 200), hash: location.hash.slice(0, 2000), created_by: user.id };
      let { data, error } = await sb.from('group_routes').insert({ ...row, ...extra }).select('id').single();
      if (error) ({ data, error } = await sb.from('group_routes').insert({ ...row, starts_at: when }).select('id').single());
      if (error) { msg(error.message); return; }
      // the one who proposes it comes, and the group hears of it in the chat
      sb.from('route_rsvp').insert({ route_id: data.id, user_id: user.id, status: 'yes' }).then(() => loadRoutes(), () => {});
      const txt = `📌 Proponuję wyjście: ${row.title}${when ? ', ' + fmtWhen(when) : ''}${place ? ', zbiórka: ' + place : ''}. Kto będzie? (Grupy → Wyjścia)`;
      sb.from('messages').insert({ group_id: gid, user_id: user.id, body: txt.slice(0, 2000) }).then(() => {}, () => {});
    }
    $('g-trip-form').hidden = true; loadRoutes(); checkTrips();
  };

  // the chat
  // ------------------------------------------------------------ the reminder of a group trip (the day before)
  // while the planner is open: a trip of one's groups today or tomorrow, not declined, shows a bar over the map
  // (until closed, again if its date changes) and, if allowed, one system notification; no server needed
  const SEEN = 'tatry-trip-seen', TOLD = 'tatry-trip-told';
  const marks = (k) => { try { return JSON.parse(store.get(k)) || {}; } catch (e) { return {}; } };
  const mark = (k, r) => { const m = marks(k); m[r.id] = r.starts_at; for (const id in m) if (Date.parse(m[id]) < Date.now() - 2 * 864e5) delete m[id]; store.set(k, JSON.stringify(m)); };
  const marked = (k, r) => marks(k)[r.id] === r.starts_at;
  function whenWord(t) {
    const d = new Date(t), n = new Date();
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
    const hm = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    return `${days <= 0 ? (d < n ? 'Trwa' : 'Dziś') : 'Jutro'} o ${hm}`;
  }
  async function checkTrips() {
    const bar = $('trip-remind');
    if (!user || !groups.length) { bar.hidden = true; return; }
    const now = new Date(), end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);   // the end of tomorrow
    let rows, mine;
    try {
      rows = ok(await sb.from('group_routes').select('id,group_id,title,hash,starts_at,place').in('group_id', groups.map((g) => g.id))
        .gt('starts_at', new Date(now - 2 * 3600e3).toISOString()).lt('starts_at', end.toISOString()).order('starts_at').limit(10));
      mine = rows.length ? ok(await sb.from('route_rsvp').select('route_id,status').eq('user_id', user.id).in('route_id', rows.map((r) => r.id))) : [];
    } catch (e) { return; }
    const ans = (r) => (mine.find((x) => x.route_id === r.id) || {}).status;
    const trips = rows.filter((r) => ans(r) !== 'no');
    for (const r of trips) {
      if (marked(TOLD, r)) continue;
      mark(TOLD, r);
      try {
        if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
          navigator.serviceWorker.ready.then((w) => w.showNotification(`Szlakownik: ${whenWord(r.starts_at).toLowerCase()} wyjście`,
            { body: r.title + (r.place ? ` · zbiórka: ${r.place}` : ''), tag: 'trip-' + r.id, icon: 'icons/icon-192.png', data: { hash: r.hash } })).catch(() => {});
        }
      } catch (e) { /* no notifications here */ }
    }
    const r = trips.find((x) => !marked(SEEN, x));
    if (!r) { bar.hidden = true; return; }
    const g = groups.find((x) => x.id === r.group_id), a = ans(r);
    bar.innerHTML = `<div class="tr-h"><b>⏰ ${whenWord(r.starts_at)}: ${esc(r.title)}</b><button class="tr-x" title="Zamknij">✕</button></div>`
      + `<small>${r.place ? '📍 ' + esc(r.place) + ' · ' : ''}grupa „${esc(g ? g.name : '')}”${a === 'yes' ? ' · idziesz ✓' : a === 'maybe' ? ' · może idziesz' : ''}</small>`
      + `<div class="tr-act">${a ? '' : '<button data-s="yes">✓ Będę</button><button data-s="maybe">? Może</button><button data-s="no">✗ Nie</button>'}<button data-open>🗺 Pokaż trasę</button></div>`;
    bar.hidden = false;
    bar.onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.classList.contains('tr-x')) { mark(SEEN, r); checkTrips(); return; }
      if ('open' in b.dataset) { openHash(r.hash); return; }
      if (b.dataset.s) {
        askNotify();
        const { error } = await sb.from('route_rsvp').upsert({ route_id: r.id, user_id: user.id, status: b.dataset.s, updated_at: new Date().toISOString() }, { onConflict: 'route_id,user_id' });
        if (error) { msg(error.message); return; }
        if (b.dataset.s === 'no') mark(SEEN, r);
        checkTrips(); if (r.group_id === gid) loadRoutes();
      }
    };
  }
  // asked when one answers "I come" / "maybe" (a tap, as browsers want), so the day before can be told
  function askNotify() {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch (e) { /* old API */ }
  }
  setInterval(() => { if (user && !document.hidden) checkTrips(); }, 15 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user) checkTrips(); });

  async function loadChat() {
    let rows = [];
    try { rows = ok(await sb.from('messages').select('id,user_id,body,created_at').eq('group_id', gid).order('created_at', { ascending: false }).limit(60)); } catch (e) { return; }
    $('chat-log').innerHTML = rows.length ? '' : '<p class="empty">Napisz pierwszą wiadomość.</p>';
    for (const m of rows.reverse()) addMessage(m, false);
    $('chat-log').scrollTop = 1e9;
  }
  async function addMessage(m, live) {
    const log = $('chat-log');
    if (log.querySelector(`[data-id="${m.id}"]`)) return;
    if (!members.has(m.user_id)) await loadMembers();      // someone who has just joined
    const u = who(m.user_id), el = document.createElement('div');
    el.className = 'chat-m' + (m.user_id === user.id ? ' mine' : '');
    el.dataset.id = m.id;
    const t = new Date(m.created_at);
    const when = t.toDateString() === new Date().toDateString() ? t.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : t.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
    el.innerHTML = `${avatarHtml(u.avatar, esc)}<div><small><b>${esc(u.name)}</b> ${when}</small><p>${esc(m.body)}</p></div>`;
    const empty = log.querySelector('.empty'); if (empty) empty.remove();
    const atEnd = log.scrollTop + log.clientHeight > log.scrollHeight - 30;
    log.appendChild(el);
    if (!live || atEnd || m.user_id === user.id) log.scrollTop = 1e9;
  }
  $('chat-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const body = $('chat-in').value.trim().slice(0, 2000);
    if (!body || !gid) return;
    $('chat-in').value = '';
    const { data, error } = await sb.from('messages').insert({ group_id: gid, body, user_id: user.id }).select('id,user_id,body,created_at').single();
    if (error) { $('chat-in').value = body; msg(navigator.onLine ? `Nie wysłano: ${error.message}` : 'Brak zasięgu: wiadomość nie poszła.'); return; }
    addMessage(data, true);
  };

  // ------------------------------------------------------------ positions on the map
  function mateIcon(m, stale) {
    const u = who(m.user_id);
    return L.divIcon({ className: 'mate' + (stale ? ' stale' : ''), iconSize: null, iconAnchor: [15, 15],
      html: `${avatarHtml(u.avatar, esc)}<span>${esc(u.name)}</span>` });
  }
  function showMate(m) {
    if (!user || m.user_id === user.id) return;          // me: the navigation's own marker
    if (Date.parse(m.expires_at) < Date.now()) { dropMate(m.user_id); return; }
    const stale = Date.now() - Date.parse(m.updated_at) > 15 * 60000;
    let mk = mateMarkers.get(m.user_id);
    if (!mk) {
      mk = L.marker([m.lat, m.lon], { zIndexOffset: 900 }).addTo(mates);
      mk.bindTooltip(() => `${esc(who(mk.data.user_id).name)} · ${ago(mk.data.updated_at)}${mk.data.alt != null ? ` · ${Math.round(mk.data.alt)} m n.p.m.` : ''}`);
      mateMarkers.set(m.user_id, mk);
    }
    mk.data = m;
    mk.setLatLng([m.lat, m.lon]).setIcon(mateIcon(m, stale));
    $('g-live').textContent = mateMarkers.size ? `Na mapie: ${mateMarkers.size} ${mateMarkers.size === 1 ? 'osoba' : 'osób'} z grupy.` : '';
  }
  function dropMate(id) {
    const mk = mateMarkers.get(id);
    if (mk) { mk.remove(); mateMarkers.delete(id); }
    $('g-live').textContent = mateMarkers.size ? `Na mapie: ${mateMarkers.size} ${mateMarkers.size === 1 ? 'osoba' : 'osób'} z grupy.` : '';
  }
  async function refreshPositions() {
    if (!gid) return;
    let rows;
    try { rows = ok(await sb.from('live_positions').select('user_id,lat,lon,alt,accuracy,updated_at,expires_at').eq('group_id', gid)); } catch (e) { return; }
    const live = new Set(rows.map((r) => r.user_id));
    for (const id of [...mateMarkers.keys()]) if (!live.has(id)) dropMate(id);
    for (const r of rows) showMate(r);
  }
  setInterval(() => { if (user && gid && document.visibilityState === 'visible') refreshPositions(); }, 60000);
  $('g-show').onclick = () => {
    if (!mateMarkers.size) { msg('Nikt z grupy nie udostępnia teraz pozycji.'); return; }
    map.fitBounds(L.latLngBounds([...mateMarkers.values()].map((m) => m.getLatLng())), { padding: [40, 40], maxZoom: 15 });
  };

  // sharing my position during navigation: on purpose, with the open group only
  function navShareButton() {
    const b = $('nav-share'), g = groups.find((x) => x.id === gid);
    b.hidden = !user || !g;
    b.classList.toggle('on', sharing);
    b.textContent = sharing ? `👥 Widzi Cię: ${g ? g.name : ''}` : '👥 Udostępnij pozycję';
  }
  $('nav-share').onclick = () => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    if (sharing) { stopSharing(); return; }
    if (!confirm(`Twoja pozycja będzie widoczna dla grupy „${g.name}” do końca nawigacji (i znika najpóźniej po 12 h). Udostępnić?`)) return;
    sharing = true; lastSent = null; navShareButton();
  };
  function stopSharing() {
    if (!sharing) return;
    sharing = false; navShareButton();
    if (user && gid) sb.from('live_positions').delete().eq('user_id', user.id).then(() => {}, () => {});
  }
  async function onPosition({ lat, lon, alt, acc }) {
    if (!sharing || !user || !gid) return;
    if (lat < 48.5 || lat > 50 || lon < 19 || lon > 21) return;       // outside the Tatras (the database refuses it)
    const now = Date.now();
    if (lastSent) {
      const moved = Math.hypot((lat - lastSent.lat) * 111000, (lon - lastSent.lon) * 73000);
      if (now - lastSent.t < 15000 || (moved < 20 && now - lastSent.t < 60000)) return;
    }
    lastSent = { lat, lon, t: now };
    const row = { user_id: user.id, group_id: gid, lat, lon, alt: alt ?? null, accuracy: acc ?? null,
      updated_at: new Date(now).toISOString(), expires_at: new Date(now + 12 * 3600000).toISOString() };
    const { error } = await sb.from('live_positions').upsert(row, { onConflict: 'user_id,group_id' });
    if (error) lastSent = null;                                       // no signal: try with the next fix
  }

  return { onPosition, onNavStop: stopSharing, sync, leaderboard, setPublic, get isPublic() { return isPublic; }, get user() { return user; } };
}
