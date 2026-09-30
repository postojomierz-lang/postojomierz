// The online part of the planner (Supabase, see supabase/): signing in with a link from an e-mail,
// the profile and the journal synced between the person's devices, hiking groups joined with an invite
// code, the group's chat and routes, and the members' positions on the map while they navigate (shared
// only on purpose, only with the chosen group, removed at the end of the walk, expiring in any case), and the
// nature discoveries with their points for the rankings (only for those who show their profile publicly).
// Everything works without an account too: the journal stays in the browser as before.
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
    const code = store.get(JOIN);
    if (code) { store.set(JOIN, null); await join(code); }
  }
  function signedOut() {
    stopSharing();
    closeGroup();
    groups = []; gid = null;
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
    if (serverT > (PR.updatedAt || 0)) {
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
    saveProfile(PR, false);
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
  async function loadRoutes() {
    if (!gid) return;
    let rows = [];
    try { rows = ok(await sb.from('group_routes').select('id,title,hash,created_by,created_at').eq('group_id', gid).order('created_at', { ascending: false }).limit(20)); } catch (e) { return; }
    const ul = $('g-routes');
    ul.innerHTML = rows.length ? '' : '<li><span class="empty">Brak tras. Wyznacz trasę i kliknij „Dodaj bieżącą trasę”.</span></li>';
    for (const r of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<span>🗺 ${esc(r.title)}<br><small>${esc(who(r.created_by).name)} · ${new Date(r.created_at).toLocaleDateString('pl-PL')}</small></span>`
        + (r.created_by === user.id ? '<span class="t x" title="Usuń z grupy">✕</span>' : '');
      li.onclick = async (ev) => {
        if (ev.target.classList.contains('x')) { await sb.from('group_routes').delete().eq('id', r.id); loadRoutes(); return; }
        openHash(r.hash);
      };
      ul.appendChild(li);
    }
  }
  $('g-add-route').onclick = async () => {
    if (!hasRoute()) { msg('Najpierw wyznacz trasę na mapie.'); return; }
    const { error } = await sb.from('group_routes').insert({ group_id: gid, title: routeTitle().slice(0, 200), hash: location.hash.slice(0, 2000), created_by: user.id });
    if (error) msg(error.message); else loadRoutes();
  };

  // the chat
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
