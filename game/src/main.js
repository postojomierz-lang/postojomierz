import './style.css';
import { CATALOG, GROUPS, TEAM_COLORS, RULES } from './data/catalog.js';
import { makeMap } from './sim/map.js';
import { designBattlefield, explainError } from './claude.js';
import { LIBRARY } from './data/maps.js';
import { exportLayout, downloadLayout, readLayoutFile } from './mapfile.js';
import { recognizeDrawing, blankSheet } from './drawn.js';
import { Editor } from './editor.js';
import { Sim } from './sim/sim.js';
import { aiDeploy } from './sim/ai.js';
import { View, renderThumbnails } from './render/view.js';
import { Sounds } from './audio.js';

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
const game = { sim: null, human: 0, seed: 0, diff: 'normal', tool: null, rot: 0, speed: 1, acc: 0, undo: [], thumbs: null, group: 'infantry', mode: 'play' };

// ---------------------------------------------------------------- new game
// files: { photo, mapFile, drawing } picked in the setup screen; layout: a map to play directly
async function newGame(files = {}, layout = null) {
  const n = +settings.teams;
  const seed = game.seed = (Math.random() * 2 ** 31) >>> 0;
  const blank = makeMap({ teams: n, seed });
  const busy = (lines) => {
    let i = 0; $('loadingText').textContent = lines[0]; $('loading').hidden = false;
    const timer = setInterval(() => { $('loadingText').textContent = lines[++i % lines.length]; }, 2500);
    return () => { clearInterval(timer); $('loading').hidden = true; };
  };
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
  const map = makeMap({ teams: n, theme: settings.source === 'random' && !layout ? settings.theme || null : null, seed, layout });
  game.mode = 'play';
  const humanColor = TEAM_COLORS.findIndex(c => c.id === settings.color);
  const colors = [humanColor, ...TEAM_COLORS.map((_, i) => i).filter(i => i !== humanColor)].slice(0, n);
  const specs = colors.map((c, i) => ({ name: i === 0 ? 'You' : TEAM_COLORS[c].name + ' army', color: c, human: i === 0 }));
  game.sim = new Sim(map, specs, seed);
  game.human = 0; game.diff = settings.diff; game.acc = 0; game.undo = []; game.speed = 1;
  view.setQuality(settings.quality);
  view.setLiving(settings.living === 'living');
  view.load(game.sim, 0);
  sounds.enabled = settings.sound;
  game.thumbs = renderThumbnails(Object.keys(CATALOG).filter(k => k !== 'hq' && CATALOG[k].group !== 'hidden'), TEAM_COLORS[humanColor].id);
  deployAI();
  buildPalette();
  setTool(null);
  refresh();
  if (map.title) { toast(map.title, true); if (map.briefing) toast(map.briefing, false, true); }
  else toast(`Round 1 — build your base`, true);
}

function deployAI() {
  const sim = game.sim;
  for (const t of sim.teams) {
    if (t.human || !t.alive) continue;
    const bonus = { easy: -0.2, normal: 0, hard: 0.3 }[game.diff] || 0;
    t.money = Math.max(0, Math.round(t.money * (1 + bonus)));
    aiDeploy(sim, t.id, game.seed);
  }
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
    toast(t.human ? 'Your headquarters has fallen!' : `${t.name} is out!`, true);
    if (t.human && sim.phase !== 'over') toast('You can keep watching — the remaining armies fight on', false, true);
  } else if (ev.t === 'deploy') {
    game.undo = [];
    deployAI();
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
  view.lookAt((e.clientX - r.left) / r.width * map.W, (e.clientY - r.top) / r.height * map.H);
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
  $('btnUndo').disabled = !game.undo.length;
  for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.speed === game.speed);
  // army list
  const rows = sim.teams.map(t => {
    const hq = sim.byId.get(t.hq), f = hq && !hq.dead ? hq.hp / hq.maxHp : 0;
    const units = sim.ents.filter(e => !e.dead && !e.down && e.team === t.id && !e.def.static).length;
    return `<div class="army ${t.alive ? '' : 'out'}"><span class="sw" style="background:${TEAM_COLORS[t.color].main}"></span>
      <span class="nm">${t.name}</span><span class="v">${t.alive ? units + ' units' : 'defeated'}</span>
      <span class="bar"><i style="width:${Math.round(f * 100)}%"></i></span></div>`;
  }).join('');
  if ($('armies').dataset.last !== rows) { $('armies').innerHTML = rows; $('armies').dataset.last = rows; }
  // palette affordability
  for (const c of $('cards').children) {
    const def = CATALOG[c.dataset.type];
    c.classList.toggle('off', def.cost > me.money || (def.vehicle && me.vehicles >= RULES.vehiclesPerRound) || (def.aircraft && me.aircraft >= RULES.aircraftPerRound));
  }
}

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
  if (e.button === 0 && game.tool && sim && sim.phase === 'deploy') {
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
  if (!sim || sim.phase !== 'deploy' || !game.tool) return;
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
  if (sim && sim.phase === 'deploy') {
    const id = view.entityAt(e.clientX, e.clientY, x => x.team === game.human && x.placedRound === sim.round && x.def.cls !== 'hq');
    if (id && sim.sell(game.human, id)) { game.undo = game.undo.filter(u => u !== id); flushEvents(); refresh(); }
  }
});

function undo() {
  const sim = game.sim;
  while (game.undo.length) {
    const id = game.undo.pop();
    if (sim.sell(game.human, id)) { flushEvents(); break; }
  }
  refresh();
}
$('btnUndo').onclick = undo;
// let the computer spend the rest of our supply on a sensible army
$('btnAuto').onclick = () => {
  const sim = game.sim; if (!sim || sim.phase !== 'deploy') return;
  const before = new Set(sim.ents.map(e => e.id));
  aiDeploy(sim, game.human, (Math.random() * 1e9) | 0);
  for (const e of sim.ents) if (!before.has(e.id)) game.undo.push(e.id);
  flushEvents(); sounds.play('place'); refresh();
};

function startBattle() {
  const sim = game.sim;
  if (!sim || sim.phase !== 'deploy') return;
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

// a first battlefield behind the setup screen
openSetup();

window.__game = game; window.__flush = flushEvents;
window.__onEv = onEvent;
window.__view = view;
