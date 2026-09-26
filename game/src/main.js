import './style.css';
import { CATALOG, GROUPS, TEAM_COLORS, RULES } from './data/catalog.js';
import { makeMap } from './sim/map.js';
import { designBattlefield, explainError } from './claude.js';
import { LIBRARY } from './data/maps.js';
import { exportLayout, downloadLayout, readLayoutFile } from './mapfile.js';
import { recognizeDrawing, blankSheet } from './drawn.js';
import { Editor } from './editor.js';
import { Sim } from './sim/sim.js';
import { aiDeploy, aiOrders } from './sim/ai.js';
import { View, renderThumbnails } from './render/view.js';
import { modelsReady, loadLiving } from './render/models.js';
import { Sounds } from './audio.js';
import { Host, Client, cleanCode } from './net.js';

const $ = id => document.getElementById(id);
const DT = 1 / RULES.tickRate;

// ---------------------------------------------------------------- settings (per-browser convenience)
const settings = { quality: 'medium', sound: true, teams: 2, color: 'green', theme: '', diff: 'normal', source: 'random', library: LIBRARY[0].id,
  useClaude: false, claudeMode: 'text', living: 'toy', apiKey: '', model: 'claude-opus-5', prompt: '' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('plasticfront3d') || '{}')); } catch {}
const save = () => { try { localStorage.setItem('plasticfront3d', JSON.stringify(settings)); } catch {} };

let view;
try {
  view = new View($('stage'), $('overlay'));
} catch (e) {
  $('fail').hidden = false;
  $('fail').textContent = 'Your browser could not start 3D graphics (WebGL). Try another browser or enable hardware acceleration.';
  throw e;
}
const sounds = new Sounds();
const game = { sim: null, human: 0, seed: 0, diff: 'normal', tool: null, rot: 0, speed: 1, acc: 0, undo: [], thumbs: null, group: 'infantry', mode: 'play', net: null };

// ---------------------------------------------------------------- new game
const busy = (lines) => {
  let i = 0; $('loadingText').textContent = lines[0]; $('loading').hidden = false;
  const timer = setInterval(() => { $('loadingText').textContent = lines[++i % lines.length]; }, 2500);
  return () => { clearInterval(timer); $('loading').hidden = true; };
};

// Works out the battlefield from the setup screen. files: { photo, mapFile, drawing }.
// Returns everything every player needs to build the very same map: { n, seed, layout, theme }.
async function prepareMap(files = {}, layout = null, n = +settings.teams) {
  const seed = (Math.random() * 2 ** 31) >>> 0;
  const blank = makeMap({ teams: n, seed });
  if (!layout && settings.useClaude) {
    if (!settings.apiKey) toast('Add an Anthropic API key to let Claude design the battlefield — using a random one.', false, true);
    else if (settings.claudeMode === 'photo' && !files.photo) toast('Pick a photo for Claude first — using a random battlefield.', false, true);
    else {
      const done = busy(['Claude is surveying the battlefield…', 'Measuring the coffee mugs…', 'Counting LEGO studs…', 'Checking where the juice spilled…']);
      try {
        layout = await designBattlefield({ apiKey: settings.apiKey, model: settings.model, map: blank, prompt: settings.prompt, photo: settings.claudeMode === 'photo' ? files.photo : null });
      } catch (e) {
        toast('Claude could not design the map (' + await explainError(e) + ') — using a random one.', false, true);
      } finally { done(); }
    }
  } else if (!layout && settings.source === 'library') {
    layout = LIBRARY.find(m => m.id === settings.library) || LIBRARY[0];
  } else if (!layout && settings.source === 'file') {
    if (!files.mapFile) toast('Choose a map file first — using a random battlefield.', false, true);
    else try { layout = await readLayoutFile(files.mapFile); } catch (e) { toast('Could not open the map (' + e.message + ') — using a random one.', false, true); }
  } else if (!layout && settings.source === 'drawing') {
    if (!files.drawing) toast('Choose a photo of your drawing first — using a random battlefield.', false, true);
    else {
      const done = busy(['Reading your drawing…']);
      try { layout = await recognizeDrawing(files.drawing, blank.W, blank.H); layout.theme = settings.theme || 'carpet'; }
      catch (e) { toast('Could not read the drawing (' + e.message + ') — using a random one.', false, true); }
      finally { done(); }
    }
  }
  const theme = settings.source === 'random' && !layout ? settings.theme || null : null;
  return { n, seed, layout, theme };
}

// armies: [{ name, color (index), human }]; me: which of them this browser plays
async function beginGame({ n, seed, layout, theme, armies, me, diff }) {
  await modelsReady;
  const map = makeMap({ teams: n, theme, seed, layout });
  game.mode = 'play'; game.seed = seed;
  game.sim = new Sim(map, armies, seed);
  game.human = me; game.diff = diff; game.acc = 0; game.undo = []; game.speed = 1;
  view.setQuality(settings.quality);
  let living = settings.living === 'living';
  if (living) {
    const done = busy(['Unpacking the living soldiers…']);
    living = await loadLiving(); done();
    if (!living) toast('Could not load Living soldiers (they need the online version) — using toy style.', false, true);
  }
  view.setLiving(living);
  view.load(game.sim, me);
  sounds.enabled = settings.sound;
  game.thumbs = renderThumbnails(Object.keys(CATALOG).filter(k => k !== 'hq' && CATALOG[k].group !== 'hidden'), TEAM_COLORS[armies[me].color].id);
  deployAI();
  markDeploy();
  buildPalette();
  setTool(null);
  refresh();
  if (map.title) { toast(map.title, true); if (map.briefing) toast(map.briefing, false, true); }
  else toast(`Round 1 — build your base`, true);
}

// a single-player game against the computer
async function newGame(files = {}, layout = null) {
  leaveOnline();
  const setup = await prepareMap(files, layout);
  const humanColor = TEAM_COLORS.findIndex(c => c.id === settings.color);
  const colors = [humanColor, ...TEAM_COLORS.map((_, i) => i).filter(i => i !== humanColor)].slice(0, setup.n);
  const armies = colors.map((c, i) => ({ name: i === 0 ? 'You' : TEAM_COLORS[c].name + ' army', color: c, human: i === 0 }));
  await beginGame({ ...setup, armies, me: 0, diff: settings.diff });
}

function deployAI() {
  const sim = game.sim;
  for (const t of sim.teams) {
    if (t.human || !t.alive) continue;
    const bonus = { easy: -0.2, normal: 0, hard: 0.3 }[game.diff] || 0;
    t.money = Math.max(0, Math.round(t.money * (1 + bonus)));
    aiDeploy(sim, t.id, game.seed);
  }
  for (let pass = 0; pass < 2; pass++) for (const t of sim.teams) if (!t.human && t.alive) aiOrders(sim, t.id, game.seed);
  flushEvents();
}

function flushEvents() {
  const sim = game.sim;
  if (!sim.events.length) return;
  const evs = sim.events.splice(0);
  view.handle(evs, sounds);
  for (const ev of evs) onEvent(ev);
}

function onEvent(ev) {
  const sim = game.sim;
  if (ev.t === 'eliminated') {
    const t = sim.teams[ev.team];
    const mine = t.id === game.human;
    toast(mine ? 'Your headquarters has fallen!' : `${t.name} is out!`, true);
    if (mine && sim.phase !== 'over') toast('You can keep watching — the remaining armies fight on', false, true);
  } else if (ev.t === 'deploy') {
    game.undo = [];
    deployAI();
    markDeploy();
    toast(`Round ${sim.round} — reinforcements arrived`, true);
    setTool(null);
    refresh();
    // spectating after defeat: nobody presses Start, so the next round begins by itself
    if (!sim.teams[game.human].alive) setTimeout(() => { if (game.sim === sim && game.mode === 'play') startBattle(); }, 1500);
  } else if (ev.t === 'returned' && ev.team === game.human) {
    toast(`${ev.n} rescued soldier${ev.n > 1 ? 's are' : ' is'} back in the fight`);
  } else if (ev.t === 'drop') {
    const e = sim.byId.get(ev.id);
    if (e && e.team !== game.human) toast('Enemy paratroopers incoming!');
  } else if (ev.t === 'over') {
    setTimeout(showEnd, 1800);
    refresh();
  }
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), hudT = 0, miniT = 0;
const miniCanvas = $('minimap'), miniCtx = miniCanvas.getContext('2d');
function miniJump(e) {
  if (!game.sim) return;
  const r = miniCanvas.getBoundingClientRect(), map = game.sim.map;
  const f = view.miniFit || { sc: miniCanvas.width / map.W, ox: 0, oy: 0 };
  const cx = (e.clientX - r.left) * miniCanvas.width / r.width, cy = (e.clientY - r.top) * miniCanvas.height / r.height;
  view.lookAt((cx - f.ox) / f.sc, (cy - f.oy) / f.sc);
}
miniCanvas.addEventListener('pointerdown', e => { miniJump(e); miniCanvas.setPointerCapture(e.pointerId); });
miniCanvas.addEventListener('pointermove', e => { if (e.buttons & 1) miniJump(e); });
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(250, t - last); last = t;
  const sim = game.mode === 'play' ? game.sim : null;
  let alpha = 1;
  if (sim && sim.phase === 'battle' && game.speed > 0) {
    game.acc += dt / 1000 * game.speed;
    let n = 0;
    while (game.acc >= DT && n < 10) {
      sim.step(); flushEvents(); game.acc -= DT; n++;
      if (sim.phase !== 'battle') { game.acc = 0; break; }
    }
    if (n >= 10) game.acc = 0;
    alpha = Math.min(1, game.acc / DT);
  }
  sounds.listener = view.controls.target;
  view.render(alpha, dt);
  if (t - hudT > 200) { hudT = t; refresh(); }
  if (t - miniT > 100) { miniT = t; view.drawMinimap(miniCtx, miniCanvas.width, miniCanvas.height); }
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- HUD
function refresh() {
  const sim = game.sim; if (!sim || game.mode !== 'play') return;
  $('armies').hidden = false;
  const me = sim.teams[game.human];
  $('round').textContent = `${sim.round}/${RULES.maxRounds}`;
  $('phase').textContent = sim.phase === 'deploy' ? 'Deploy' : sim.phase === 'battle' ? 'Battle' : 'Over';
  const left = Math.max(0, RULES.battleSeconds - sim.battleTick / RULES.tickRate);
  $('timer').textContent = sim.phase === 'battle' ? `0:${String(Math.ceil(left)).padStart(2, '0')}` : `0:${RULES.battleSeconds}`;
  $('money').textContent = '$' + me.money;
  $('vehicles').textContent = `${me.vehicles}/${RULES.vehiclesPerRound}`;
  $('aircraft').textContent = `${me.aircraft}/${RULES.aircraftPerRound}`;
  $('build').hidden = sim.phase !== 'deploy' || !me.alive;
  $('speed').hidden = sim.phase !== 'battle';
  $('btnUndo').disabled = !game.undo.length || !editable();
  const waiting = !!game.net && game.net.sentRound === sim.round && sim.phase === 'deploy';
  $('btnStart').disabled = waiting;
  $('btnStart').textContent = game.net ? (waiting ? 'Waiting for the others…' : 'Ready ✓') : 'Start battle ▶';
  for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.speed === game.speed);
  // army list
  const pickable = sim.phase === 'deploy' && me.alive;
  const rows = sim.teams.map(t => {
    const hq = sim.byId.get(t.hq), f = hq && !hq.dead ? hq.hp / hq.maxHp : 0;
    const units = sim.ents.filter(e => !e.dead && !e.down && e.team === t.id && !e.def.static).length;
    const foc = sim.focusOf(t.id);
    const order = !t.alive ? '' : t.stance === 'defend' ? '🛡 defending' : foc === game.human && t.id !== game.human ? '⚔ attacking <b>you</b>' : `⚔ → ${foc >= 0 ? sim.teams[foc].name : 'nearest'}`;
    const cls = [t.alive ? '' : 'out', pickable && t.alive && t.id !== game.human ? 'pick' : '', me.focus === t.id ? 'focus' : ''].join(' ');
    return `<div class="army ${cls}" data-team="${t.id}" ${pickable && t.id !== game.human && t.alive ? 'title="Make this army your main target"' : ''}><span class="sw" style="background:${TEAM_COLORS[t.color].main}"></span>
      <span class="nm">${t.id === game.human ? 'You' : t.name}</span><span class="v">${t.alive ? units + ' units' : 'defeated'}</span>
      <span class="bar"><i style="width:${Math.round(f * 100)}%"></i></span>${order ? `<span class="tg ${foc === game.human && t.id !== game.human && t.stance !== 'defend' ? 'me' : ''}">${order}</span>` : ''}</div>`;
  }).join('');
  if ($('armies').dataset.last !== rows) { $('armies').innerHTML = rows; $('armies').dataset.last = rows; }
  refreshOrders();
  // palette affordability
  for (const c of $('cards').children) {
    const def = CATALOG[c.dataset.type];
    c.classList.toggle('off', def.cost > me.money || (def.vehicle && me.vehicles >= RULES.vehiclesPerRound) || (def.aircraft && me.aircraft >= RULES.aircraftPerRound));
  }
}

// ---------------------------------------------------------------- round orders
function refreshOrders() {
  const sim = game.sim, me = sim.teams[game.human];
  const opts = '<option value="-1">Nearest enemy</option>' + sim.teams.filter(t => t.alive && t.id !== game.human).map(t => `<option value="${t.id}">Target: ${t.name}</option>`).join('');
  const sel = $('optFocus');
  if (sel.dataset.last !== opts) { sel.innerHTML = opts; sel.dataset.last = opts; }
  sel.value = String(sim.focusOf(game.human));
  sel.disabled = me.stance === 'defend';
  for (const b of $('stance').children) b.classList.toggle('on', b.dataset.stance === me.stance);
  // arrow on the floor: from our HQ towards the army we march on
  let arrow = null;
  const hq = sim.byId.get(me.hq);
  if (me.alive && hq && sim.phase !== 'over' && me.stance === 'attack') {
    let f = sim.focusOf(game.human), bd = Infinity;
    if (f < 0) for (const t of sim.teams) {
      if (!t.alive || t.id === game.human) continue;
      const h = sim.byId.get(t.hq); if (!h) continue;
      const d = (h.x - hq.x) ** 2 + (h.z - hq.z) ** 2;
      if (d < bd) { bd = d; f = t.id; }
    }
    const th = f >= 0 ? sim.byId.get(sim.teams[f].hq) : null;
    if (th) arrow = { x1: hq.x + (th.x - hq.x) * 0.18, z1: hq.z + (th.z - hq.z) * 0.18, x2: hq.x + (th.x - hq.x) * 0.8, z2: hq.z + (th.z - hq.z) * 0.8,
      color: '#e2462f', faint: sim.focusOf(game.human) < 0 };
  }
  view.setArrow(arrow);
}
// can this player still change their deployment? (online: not after pressing Ready)
function editable() {
  const sim = game.sim;
  return !!sim && game.mode === 'play' && sim.phase === 'deploy' && !(game.net && game.net.sentRound === sim.round);
}
function setOrders(o) {
  const sim = game.sim;
  if (!editable()) return;
  sim.setOrders(game.human, o); flushEvents(); sounds.play('place'); refresh();
}
$('stance').onclick = e => { const st = e.target.closest('[data-stance]'); if (st) setOrders({ stance: st.dataset.stance }); };
$('optFocus').onchange = () => setOrders({ focus: +$('optFocus').value });
$('armies').onclick = e => {
  const row = e.target.closest('.army.pick'); if (!row) return;
  const id = +row.dataset.team, sim = game.sim;
  setOrders({ focus: sim.teams[game.human].focus === id ? -1 : id, stance: 'attack' });
};

function buildPalette() {
  $('tabs').innerHTML = GROUPS.map(g => `<button type="button" data-group="${g.id}" class="${g.id === game.group ? 'on' : ''}">${g.name}</button>`).join('');
  const cards = Object.entries(CATALOG).filter(([k, d]) => d.group === game.group);
  $('cards').innerHTML = cards.map(([k, d]) => `<div class="card ${game.tool === k ? 'on' : ''}" data-type="${k}" role="button" tabindex="0">
      <img src="${game.thumbs[k]}" alt=""><div class="n">${d.name}</div><div class="c">$${d.cost}</div></div>`).join('');
  refresh();
}
$('tabs').onclick = e => { const g = e.target.dataset.group; if (g) { game.group = g; buildPalette(); } };
$('cards').onclick = e => { const c = e.target.closest('.card'); if (c) setTool(game.tool === c.dataset.type ? null : c.dataset.type); };
$('cards').onkeydown = e => { if (e.key === 'Enter') { const c = e.target.closest('.card'); if (c) setTool(c.dataset.type); } };
$('cards').onmouseover = e => {
  const c = e.target.closest('.card'); const tip = $('tip');
  if (!c) { tip.style.display = 'none'; return; }
  const d = CATALOG[c.dataset.type], w = d.weapon;
  const stats = [['Cost', '$' + d.cost], ['Health', d.hp], d.armor ? ['Armour', d.armor] : null, w ? ['Range', w.range] : null,
    w ? ['Damage', w.salvo ? `${w.dmg} × ${w.salvo}` : w.dmg] : null, d.speed ? ['Speed', d.speed] : null, d.vehicle ? ['Limit', `${RULES.vehiclesPerRound} vehicles / round`] : null, d.aircraft ? ['Limit', `${RULES.aircraftPerRound} aircraft / round`] : null].filter(Boolean);
  tip.innerHTML = `<b>${d.name}</b><div class="s">${stats.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>${d.blurb}`;
  const r = c.getBoundingClientRect();
  tip.style.display = 'block';
  tip.style.left = Math.min(window.innerWidth - 250, r.left) + 'px';
  tip.style.top = (r.top - tip.offsetHeight - 8) + 'px';
};
$('cards').onmouseleave = () => { $('tip').style.display = 'none'; };

function setTool(type) {
  game.tool = type;
  for (const c of $('cards').children) c.classList.toggle('on', c.dataset.type === type);
  if (!type) view.hideGhost();
}

function toast(text, big = false, long = false) {
  const d = document.createElement('div'); d.textContent = text; d.className = (big ? 'big' : '') + (long ? ' long' : '');
  $('toast').appendChild(d); setTimeout(() => d.remove(), long ? 7200 : 3300);
}

// ---------------------------------------------------------------- placing pieces
const canvas = view.renderer.domElement;
let painting = false, lastCell = '', downAt = null;

function cellUnder(e) {
  const g = view.groundAt(e.clientX, e.clientY);
  if (!g || !game.tool) return null;
  const d = CATALOG[game.tool];
  const [w, h] = game.rot & 1 ? [d.size[1], d.size[0]] : d.size;
  return { cx: Math.round(g.x - w / 2), cy: Math.round(g.z - h / 2) };
}
function tryPlace(cell, quiet) {
  const sim = game.sim;
  const res = sim.place(game.human, game.tool, cell.cx, cell.cy, game.rot);
  if (res.error) { if (!quiet) { toast(res.error); sounds.play('error'); } return false; }
  game.undo.push(res.ent.id);
  flushEvents();
  sounds.play('place');
  refresh();
  return true;
}

canvas.addEventListener('pointerdown', e => {
  sounds.unlock();
  downAt = { x: e.clientX, y: e.clientY };
  const sim = game.sim;
  if (e.button === 0 && game.tool && editable()) {
    view.controls.enabled = false;
    painting = true;
    const c = cellUnder(e);
    if (c) { lastCell = c.cx + ',' + c.cy; tryPlace(c, false); }
  }
});
window.addEventListener('pointerup', () => {
  if (painting) { painting = false; view.controls.enabled = true; }
});
canvas.addEventListener('pointermove', e => {
  const sim = game.sim;
  if (!editable() || !game.tool) return;
  const c = cellUnder(e);
  if (!c) { view.hideGhost(); return; }
  const err = sim.canPlace(game.human, game.tool, c.cx, c.cy, game.rot);
  view.setGhost(game.tool, game.human, c.cx, c.cy, game.rot, !err);
  const k = c.cx + ',' + c.cy;
  if (painting && k !== lastCell) { lastCell = k; tryPlace(c, true); }
});
canvas.addEventListener('pointerleave', () => view.hideGhost());
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6;
  if (moved) return;
  const sim = game.sim;
  if (game.mode !== 'play') return;
  if (game.tool) { setTool(null); return; }
  if (editable()) {
    const id = view.entityAt(e.clientX, e.clientY, x => x.team === game.human && x.placedRound === sim.round && x.def.cls !== 'hq');
    if (id && sim.sell(game.human, id)) { game.undo = game.undo.filter(u => u !== id); flushEvents(); refresh(); }
  }
});

function undo() {
  const sim = game.sim;
  if (!editable()) return;
  while (game.undo.length) {
    const id = game.undo.pop();
    if (sim.sell(game.human, id)) { flushEvents(); break; }
  }
  refresh();
}
$('btnUndo').onclick = undo;
// let the computer spend the rest of our supply on a sensible army
$('btnAuto').onclick = () => {
  const sim = game.sim; if (!editable()) return;
  const before = new Set(sim.ents.map(e => e.id));
  aiDeploy(sim, game.human, (Math.random() * 1e9) | 0);
  for (const e of sim.ents) if (!before.has(e.id)) game.undo.push(e.id);
  flushEvents(); sounds.play('place'); refresh();
};

function startBattle() {
  const sim = game.sim;
  if (!sim || sim.phase !== 'deploy') return;
  if (game.net) { submitOrders(); return; }
  launchBattle();
}
function launchBattle() {
  const sim = game.sim;
  setTool(null);
  sim.startBattle(); flushEvents();
  game.acc = 0;
  sounds.play('start');
  toast(`Round ${sim.round} — fight!`, true);
  refresh();
}
$('btnStart').onclick = startBattle;
$('speed').onclick = e => { const s = e.target.dataset.speed; if (s !== undefined) { game.speed = +s; refresh(); } };

window.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const sim = game.sim; if (!sim || game.mode !== 'play') return;
  if (e.key === 'Escape') setTool(null);
  else if (e.key === 'r' || e.key === 'R') { game.rot ^= 1; }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if (e.key === ' ') { e.preventDefault(); if (sim.phase === 'deploy') startBattle(); else if (sim.phase === 'battle') game.speed = game.speed ? 0 : 1; refresh(); }
  else if (sim.phase === 'battle' && ['1', '2', '4'].includes(e.key)) { game.speed = +e.key; refresh(); }
});

// ---------------------------------------------------------------- dialogs
function showEnd() {
  const sim = game.sim, win = sim.winner === game.human;
  $('endTitle').textContent = win ? 'Victory!' : 'Defeat';
  $('endTitle').style.color = win ? '#8fe05a' : '#e2604c';
  const w = sim.teams[sim.winner];
  $('endText').textContent = win
    ? `Your plastic army holds the floor after ${sim.round} round${sim.round > 1 ? 's' : ''}.`
    : w ? `${w.name} wins. Your soldiers go back in the toy box… for now.` : 'Nobody is left standing.';
  $('endStats').innerHTML = '<span class="h">Army</span><span class="h">Kills</span><span class="h">Losses</span><span class="h">Rescued</span><span class="h">Spent</span>' +
    sim.teams.map(t => `<span style="color:${TEAM_COLORS[t.color].main}">${t.name}</span><span>${t.kills}</span><span>${t.losses}</span><span>${t.saved}</span><span>$${t.spent}</span>`).join('');
  $('dlgEnd').showModal();
}
$('dlgEnd').addEventListener('close', () => openSetup());

const colorSel = $('optColor');
colorSel.innerHTML = TEAM_COLORS.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
function openSetup() {
  $('optTeams').value = settings.teams; colorSel.value = settings.color; $('optTheme').value = settings.theme;
  $('optDiff').value = settings.diff; $('optQuality').value = settings.quality; $('optSound').checked = settings.sound;
  $('optSource').value = settings.source; $('optLibrary').value = settings.library; $('optLiving').value = settings.living;
  $('optUseClaude').checked = settings.useClaude; $('optClaudeMode').value = settings.claudeMode;
  $('optKey').value = settings.apiKey; $('optModel').value = settings.model; $('optPrompt').value = settings.prompt;
  if (settings.useClaude) $('advanced').open = true;
  syncSetup();
  $('dlgSetup').showModal();
}
function readSetup() {
  settings.teams = +$('optTeams').value; settings.color = colorSel.value; settings.theme = $('optTheme').value;
  settings.diff = $('optDiff').value; settings.quality = $('optQuality').value; settings.sound = $('optSound').checked;
  settings.source = $('optSource').value; settings.library = $('optLibrary').value; settings.living = $('optLiving').value;
  settings.useClaude = $('optUseClaude').checked; settings.claudeMode = $('optClaudeMode').value;
  settings.apiKey = $('optKey').value.trim(); settings.model = $('optModel').value; settings.prompt = $('optPrompt').value.trim().slice(0, 600);
  save();
}
$('dlgSetup').addEventListener('close', () => {
  readSetup();
  sounds.unlock();
  if ($('dlgSetup').returnValue === 'editor') { openEditor(); return; }
  if ($('dlgSetup').returnValue === 'online') { if (!game.net) openOnline(); return; }
  newGame({ photo: $('optPhoto').files[0] || null, mapFile: $('optMapFile').files[0] || null, drawing: $('optDrawing').files[0] || null });
});
$('dlgSetup').addEventListener('cancel', e => { if (!game.sim) e.preventDefault(); });
$('optLibrary').innerHTML = LIBRARY.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
function syncSetup() {
  const src = $('optSource').value, claude = $('optUseClaude').checked;
  $('rowTheme').hidden = claude || !(src === 'random' || src === 'drawing');
  $('rowLibrary').hidden = claude || src !== 'library';
  $('rowFile').hidden = claude || src !== 'file';
  $('rowDrawing').hidden = claude || src !== 'drawing';
  $('drawingHelp').hidden = claude || src !== 'drawing';
  $('optSource').disabled = claude;
  $('photoRow').hidden = $('optClaudeMode').value !== 'photo';
  $('promptHint').hidden = $('optClaudeMode').value !== 'photo';
}
for (const id of ['optSource', 'optUseClaude', 'optClaudeMode']) $(id).addEventListener('change', syncSetup);
$('btnBlank').onclick = () => blankSheet(makeMap({ teams: +$('optTeams').value, seed: 1 }));
$('btnSaveMap').onclick = () => {
  const sim = game.mode === 'play' ? game.sim : null;
  if (!sim) return;
  downloadLayout(exportLayout(sim.map));
  toast('Map saved — share the file or load it from the setup screen');
};

// ---------------------------------------------------------------- map editor
const editor = new Editor({
  view, toast,
  getTeams: () => +settings.teams,
  onPlay: layout => { $('build').hidden = false; newGame({}, layout); },
  onExit: () => { game.mode = 'play'; if (game.sim) { view.load(game.sim, game.human); refresh(); } openSetup(); },
});
function openEditor() {
  game.mode = 'editor'; setTool(null);
  for (const id of ['build', 'speed', 'armies']) $(id).hidden = true;
  $('phase').textContent = 'Editor';
  const cur = game.sim && game.sim.map;
  editor.open(cur && cur.objects.length ? exportLayout(cur) : null);
  toast('Map editor — draw household obstacles on the floor', true);
}
$('btnMenu').onclick = openSetup;
$('btnHelp').onclick = () => $('dlgHelp').showModal();

// ---------------------------------------------------------------- online play
// The battle simulation is deterministic, so players only exchange their deployment orders.
// Each round everyone places pieces on their own copy of the game (the others cannot see them yet),
// presses Ready and sends the list to the host. When all orders are in, the host sends everyone the
// full set; each browser takes back its own draft pieces and places everybody's pieces in the same
// order, so all copies stay identical, and the battle plays out the same way everywhere.
const online = { host: null, client: null, players: [], myName: '', beat: 0 };   // lobby state
// heartbeat: players say "still here" every few seconds; the host drops anyone silent for a minute
// (browsers slow down timers in background tabs, so be patient; quicker in local test mode)
const BEAT_MS = 4000, SILENT_MS = new URLSearchParams(location.search).has('localnet') ? 30000 : 60000;

function markDeploy() {
  const net = game.net, sim = game.sim;
  if (!net || !sim) return;
  net.deploy = { round: sim.round, nextId: sim.nextId, hash: sim.stateHash() };
}

function submitOrders() {
  const net = game.net, sim = game.sim, me = game.human;
  if (net.sentRound === sim.round) return;
  net.sentRound = sim.round;
  const t = sim.teams[me];
  const placements = sim.orders.filter(o => !o.kind && o.round === sim.round && o.team === me).map(o => [o.type, o.cx, o.cy, o.rot]);
  const msg = { t: 'orders', round: sim.round, team: me, hash: net.deploy.hash, placements, focus: t.focus, stance: t.stance };
  setTool(null); refresh();
  if (t.alive) toast('Ready — waiting for the other players…');
  if (net.role === 'host') hostOrders(msg); else online.client.send(msg);
}

// host: collect orders; when every connected player has sent theirs, start the round for everybody
function hostOrders(msg) {
  const net = game.net;
  net.pending.set(msg.round + ':' + msg.team, msg);
  tryGo();
}
function tryGo() {
  const net = game.net, sim = game.sim;
  if (!net || net.role !== 'host' || sim.phase !== 'deploy' || net.sentRound !== sim.round) return;
  const round = sim.round, orders = [], missing = [];
  for (const t of sim.teams) {
    if (!t.human) continue;
    const m = net.pending.get(round + ':' + t.id);
    if (m) orders.push({ team: t.id, placements: m.placements, focus: m.focus, stance: m.stance });
    else if (net.dropped.has(t.id)) orders.push({ team: t.id, ai: true });            // left the game: the computer takes over
    else missing.push(t.name);
  }
  if (missing.length) { online.host.broadcast({ t: 'status', text: 'Waiting for ' + missing.join(', ') }); return; }
  const hashes = new Set([...net.pending.entries()].filter(([k]) => k.startsWith(round + ':')).map(([, m]) => m.hash));
  const go = { t: 'go', round, orders, desync: hashes.size > 1 };
  for (const k of [...net.pending.keys()]) if (k.startsWith(round + ':')) net.pending.delete(k);
  online.host.broadcast(go);
  applyGo(go);
}

// everybody: replace our draft with the full set of orders and start the battle
function applyGo(go) {
  const net = game.net, sim = game.sim;
  if (!net || sim.round !== go.round || sim.phase !== 'deploy') return;
  if (go.desync) toast('Warning: the games got out of step — results may differ between players.', false, true);
  for (const e of [...sim.ents]) {
    if (e.team === game.human && e.placedRound === sim.round && !e.free && !e.dead && e.def.cls !== 'hq') sim.sell(game.human, e.id);
  }
  sim.nextId = net.deploy.nextId;
  game.undo = [];
  for (const o of go.orders) {
    const t = sim.teams[o.team];
    if (o.ai) {
      t.human = false; t.name = t.name.replace(/ \(computer\)$/, '') + ' (computer)';
      aiDeploy(sim, o.team, game.seed); aiOrders(sim, o.team, game.seed);
      continue;
    }
    for (const [type, cx, cy, rot] of o.placements) {
      const r = sim.place(o.team, type, cx, cy, rot);
      if (r.error) console.warn('online: could not place', type, 'for', t.name, r.error);
    }
    sim.setOrders(o.team, { focus: o.focus, stance: o.stance });
  }
  flushEvents();
  launchBattle();
}

function leaveOnline() {
  clearInterval(online.beat);
  if (online.host) online.host.close();
  if (online.client) online.client.close();
  online.host = online.client = null; online.players = [];
  game.net = null;
}

// ---- lobby screen
function lobbyRender() {
  $('lobby').hidden = !(online.host || online.client);
  $('netPlayers').innerHTML = online.players.map((p, i) => `<div class="army"><span class="sw" style="background:${TEAM_COLORS[p.color].main}"></span>
    <span class="nm">${escapeHtml(p.name)}${i === 0 ? ' (host)' : ''}${p.me ? ' — you' : ''}</span><span class="v">army ${i + 1}</span></div>`).join('');
  $('btnNetStart').hidden = !online.host;
  $('btnNetStart').disabled = online.players.length < 2;
  const n = Math.max(+settings.teams, online.players.length);
  $('netInfo').textContent = online.host
    ? `${online.players.length} player${online.players.length > 1 ? 's' : ''} · ${n} armies (${Math.max(0, n - online.players.length)} played by the computer) · map and rules from your setup screen`
    : 'The host picks the map and starts the game.';
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function myName() { const n = $('netName').value.trim().slice(0, 16) || 'Player'; settings.netName = n; save(); return n; }
function preferredColor() { return Math.max(0, TEAM_COLORS.findIndex(c => c.id === settings.color)); }

async function hostGame() {
  leaveOnline();
  $('netStatus').textContent = 'Opening a room…';
  const host = new Host({
    onHello: (id, msg) => {
      if (game.net || online.players.length >= 8) { host.send(id, { t: 'full' }); host.kick(id); return; }
      online.players.push({ id, name: String(msg.name || 'Player').slice(0, 16), color: +msg.color || 0, seen: Date.now() });
      lobbySync();
    },
    onMessage: (id, msg) => {
      const p = online.players.find(p => p.id === id); if (!p) return;
      p.seen = Date.now();
      if (msg.t === 'orders' && game.net && p.team === msg.team) hostOrders(msg);
    },
    onLeave: id => playerLeft(id),
  });
  const playerLeft = id => {
    const p = online.players.find(p => p.id === id); if (!p) return;
    if (!game.net) { online.players = online.players.filter(q => q !== p); lobbySync(); return; }
    if (game.net.dropped.has(p.team)) return;
    p.gone = true;
    game.net.dropped.add(p.team);
    toast(`${p.name} left the game — the computer takes over their army`, false, true);
    host.broadcast({ t: 'left', name: p.name });
    tryGo();
  };
  online.beat = setInterval(() => {
    for (const p of [...online.players]) if (p.id && !p.gone && Date.now() - p.seen > SILENT_MS) { p.gone = true; host.kick(p.id); playerLeft(p.id); }
  }, BEAT_MS);
  try {
    const code = await host.open();
    online.host = host;
    online.players = [{ id: null, name: myName(), color: preferredColor(), me: true }];
    $('netRoom').textContent = code;
    $('netStatus').textContent = 'Share the code or the invite link with your friends.';
    lobbyRender();
  } catch (e) { $('netStatus').textContent = 'Could not open a room: ' + (e.message || e.type || e); host.close(); }
}
function lobbySync() {
  online.players.forEach((p, i) => { if (p.id) online.host.send(p.id, { t: 'lobby', players: online.players.map(q => ({ name: q.name, color: q.color })), you: i }); });
  lobbyRender();
}

async function joinGame(code) {
  leaveOnline();
  code = cleanCode(code);
  if (code.length !== 5) { $('netStatus').textContent = 'The room code has 5 letters.'; return; }
  $('netStatus').textContent = 'Connecting…';
  const client = new Client({
    onMessage: msg => clientMessage(msg),
    onClose: () => {
      if (online.client !== client) return;
      online.client = null;
      if (game.net) {
        // play on alone: every other player's army is taken over by the computer
        for (const t of game.sim.teams) if (t.id !== game.human) t.human = false;
        game.net = null; refresh();
        toast('Lost the connection to the host — the computer plays the other armies now.', false, true);
      } else { $('netStatus').textContent = 'The host closed the room.'; online.players = []; lobbyRender(); }
    },
  });
  try {
    await client.join(code, { name: myName(), color: preferredColor() });
    online.client = client;
    online.beat = setInterval(() => client.send({ t: 'ping' }), BEAT_MS);
    $('netRoom').textContent = code;
    $('netStatus').textContent = 'Connected — waiting for the host to start.';
    lobbyRender();
  } catch (e) { $('netStatus').textContent = 'Could not join: ' + (e.message || e.type || e); client.close(); }
}

async function clientMessage(msg) {
  if (msg.t === 'lobby') {
    online.players = msg.players.map((p, i) => ({ ...p, me: i === msg.you }));
    lobbyRender();
  } else if (msg.t === 'full') {
    $('netStatus').textContent = 'That game has already started or is full.';
  } else if (msg.t === 'start') {
    game.net = { role: 'client', sentRound: 0, deploy: null };
    $('dlgOnline').close(); if ($('dlgSetup').open) $('dlgSetup').close('online');
    await beginGame({ ...msg.setup, me: msg.you });
    toast('Online game — you are ' + msg.setup.armies[msg.you].name, false, true);
  } else if (msg.t === 'go') applyGo(msg);
  else if (msg.t === 'status') { if (game.net && game.net.sentRound === game.sim.round) toast(msg.text); }
  else if (msg.t === 'left') toast(`${msg.name} left the game — the computer takes over their army`, false, true);
}

async function startOnline() {
  const host = online.host; if (!host || online.players.length < 2) return;
  readSetup();
  const n = Math.min(8, Math.max(+settings.teams, online.players.length));
  const setup = await prepareMap({ photo: $('optPhoto').files[0] || null, mapFile: $('optMapFile').files[0] || null, drawing: $('optDrawing').files[0] || null }, null, n);
  // colours: everyone keeps their favourite unless somebody earlier already took it
  const used = new Set(), pick = c => { if (used.has(c)) c = TEAM_COLORS.findIndex((_, i) => !used.has(i)); used.add(c); return c; };
  const armies = online.players.map((p, i) => { p.team = i; return { name: p.name, color: pick(p.color), human: true }; });
  while (armies.length < n) { const c = pick(0); armies.push({ name: TEAM_COLORS[c].name + ' army (computer)', color: c, human: false }); }
  const full = { ...setup, armies, diff: settings.diff };
  online.players.forEach((p, i) => { if (p.id) host.send(p.id, { t: 'start', setup: full, you: i }); });
  game.net = { role: 'host', sentRound: 0, deploy: null, pending: new Map(), dropped: new Set() };
  $('dlgOnline').close(); if ($('dlgSetup').open) $('dlgSetup').close('online');
  await beginGame({ ...full, me: 0 });
  toast('Online game started — press Ready when your army is set', false, true);
}

function openOnline(code = '') {
  $('netName').value = settings.netName || '';
  if (code) $('netCode').value = code;
  lobbyRender();
  if (!$('dlgOnline').open) $('dlgOnline').showModal();
}
window.addEventListener('pagehide', () => leaveOnline());   // tell the others right away when the tab closes
$('btnHost').onclick = () => hostGame();
$('btnJoin').onclick = () => joinGame($('netCode').value);
$('btnNetStart').onclick = () => startOnline();
$('btnCopyLink').onclick = async () => {
  const url = location.href.split(/[?#]/)[0] + '?join=' + $('netRoom').textContent;
  try { await navigator.clipboard.writeText(url); $('netStatus').textContent = 'Invite link copied: ' + url; }
  catch { $('netStatus').textContent = 'Invite link: ' + url; }
};
$('btnNetBack').onclick = () => { if (!game.net) leaveOnline(); $('dlgOnline').close(); if (!game.net) openSetup(); };

// a first battlefield behind the setup screen
openSetup();
{ const code = new URLSearchParams(location.search).get('join'); if (code) { $('dlgSetup').close('online'); openOnline(cleanCode(code)); } }

window.__game = game; window.__flush = flushEvents;
window.__onEv = onEvent;
window.__view = view;
