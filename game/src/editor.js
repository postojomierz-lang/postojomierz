// Map editor: place household obstacles by dragging on the floor, then save to a file or play.
import { makeMap, STYLES, ROOM_THEMES } from './sim/map.js';
import { Sim } from './sim/sim.js';
import { TEAM_COLORS } from './data/catalog.js';
import { exportLayout, downloadLayout, readLayoutFile } from './mapfile.js';

const $ = id => document.getElementById(id);

const NAMES = {
  books: 'Books', shoebox: 'Shoebox', toybox: 'Toy chest', cereal: 'Cereal box', box: 'Cardboard box', mug: 'Mug', pot: 'Cooking pot',
  bucket: 'Bucket', bottle: 'Bottle', flowerpot: 'Flowerpot', lego: 'LEGO brick', blocks: 'Letter blocks', castle: 'Sandcastle',
  snowman: 'Snowman', rock: 'Rock', pencils: 'Pencils', crayons: 'Crayons', remote: 'TV remote', spoons: 'Spoon', shells: 'Shells',
  twigs: 'Twigs', shoe: 'Slipper', cable: 'Cable', juice: 'Juice spill', cola: 'Cola spill', ink: 'Ink spill', milk: 'Spilled milk',
  moat: 'Moat', puddle: 'Puddle', ice: 'Ice', palm: 'Toy palm', pine: 'Toy pine', bush: 'Bush', erase: 'Eraser',
};
const DEFAULT_SIZE = {
  books: [5, 4], shoebox: [5, 3], toybox: [6, 4], cereal: [5, 3], box: [4, 4], mug: [3, 3], pot: [4, 4], bucket: [3, 3], bottle: [2, 2],
  flowerpot: [3, 3], lego: [3, 2], blocks: [3, 3], castle: [4, 4], snowman: [3, 3], rock: [3, 3],
};
const TABS = [
  { id: 'tall', name: 'Obstacles', items: STYLES.tall },
  { id: 'low', name: 'Low cover', items: STYLES.low },
  { id: 'water', name: 'Spills', items: STYLES.water },
  { id: 'decor', name: 'Decoration', items: ['palm', 'pine', 'bush'] },
  { id: 'erase', name: 'Erase', items: ['erase'] },
];

export class Editor {
  constructor({ view, toast, onPlay, onExit, getTeams }) {
    Object.assign(this, { view, toast, onPlay, onExit, getTeams });
    this.tab = 'tall'; this.tool = 'books'; this.active = false; this.drag = null;
    $('edTabs').onclick = e => { const t = e.target.dataset.tab; if (t) { this.tab = t; this.tool = TABS.find(x => x.id === t).items[0]; this.paint(); } };
    $('edCards').onclick = e => { const c = e.target.closest('[data-tool]'); if (c) { this.tool = c.dataset.tool; this.paint(); } };
    $('edTheme').innerHTML = ROOM_THEMES.map(t => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('');
    $('edTheme').onchange = () => { this.layout.theme = $('edTheme').value; this.layout.floorColor = ''; this.rebuild(); };
    $('edColor').oninput = () => { this.layout.floorColor = $('edColor').value; this.rebuild(); };
    $('edTitle').oninput = () => { this.layout.title = $('edTitle').value.slice(0, 80); };
    $('edSave').onclick = () => { this.sync(); downloadLayout(this.layout); };
    $('edOpen').onclick = () => $('edOpenFile').click();
    $('edOpenFile').onchange = async () => {
      const f = $('edOpenFile').files[0]; $('edOpenFile').value = '';
      if (!f) return;
      try { this.load(await readLayoutFile(f)); this.toast('Map loaded'); } catch (e) { this.toast('Could not open the map: ' + e.message, false, true); }
    };
    $('edClear').onclick = () => { this.layout.objects = []; this.layout.decor = []; this.rebuild(); };
    $('edPlay').onclick = () => { this.sync(); this.close(); this.onPlay(this.layout); };
    $('edExit').onclick = () => { this.close(); this.onExit(); };

    const canvas = view.renderer.domElement;
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('contextmenu', e => { if (this.active) { e.preventDefault(); this.erase(this.cellAt(e)); } });
  }

  open(layout) {
    this.active = true;
    this.teams = this.getTeams();
    $('editor').hidden = false;
    this.load(layout || { theme: 'wood', title: 'My battlefield', objects: [], decor: [] }, true);
    this.paint();
  }
  close() { this.active = false; $('editor').hidden = true; this.view.setBox(null); }

  load(layout, resetCamera = false) {
    this.layout = { title: layout.title || 'My battlefield', briefing: layout.briefing || '', theme: THEMES.includes(layout.theme) ? layout.theme : 'wood', floorColor: layout.floorColor || '', W: layout.W, H: layout.H, objects: [...(layout.objects || [])], decor: [...(layout.decor || [])] };
    $('edTitle').value = this.layout.title;
    $('edTheme').value = this.layout.theme;
    this.rebuild(resetCamera);
  }

  // re-create the map from the layout (the generator nudges objects out of army zones)
  rebuild(resetCamera = false) {
    const n = this.teams;
    const before = this.layout.objects.length;
    this.map = makeMap({ teams: n, seed: 12345, layout: this.layout });
    const specs = Array.from({ length: n }, (_, i) => ({ name: `Army ${i + 1}`, color: i % TEAM_COLORS.length }));
    this.sim = new Sim(this.map, specs, 1);
    this.view.load(this.sim, 0, { keepCamera: !resetCamera });
    const saved = exportLayout(this.map);
    this.layout.W = saved.W; this.layout.H = saved.H;
    this.layout.objects = saved.objects; this.layout.decor = saved.decor;
    if (saved.objects.length < before) this.toast('No room there — keep the army zones (tinted areas) clear');
    $('edCount').textContent = `${this.layout.objects.length} objects`;
  }
  sync() { this.layout.title = $('edTitle').value.slice(0, 80) || 'My battlefield'; }

  paint() {
    $('edTabs').innerHTML = TABS.map(t => `<button type="button" data-tab="${t.id}" class="${t.id === this.tab ? 'on' : ''}">${t.name}</button>`).join('');
    const tab = TABS.find(t => t.id === this.tab);
    $('edCards').innerHTML = tab.items.map(k => `<button type="button" class="chip ${k === this.tool ? 'on' : ''}" data-tool="${k}">${NAMES[k] || k}</button>`).join('');
  }

  cellAt(e) {
    const g = this.view.groundAt(e.clientX, e.clientY);
    return g ? { x: Math.floor(g.x), y: Math.floor(g.z) } : null;
  }
  rectFrom(a, b) {
    const kind = this.tab;
    if (kind === 'low') {
      const len = Math.min(8, Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) + 1);
      if (len < 2) return { x: a.x - 3, y: a.y, w: 6, h: 1 };
      return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
        ? { x: Math.min(a.x, b.x), y: a.y, w: len, h: 1 } : { x: a.x, y: Math.min(a.y, b.y), w: 1, h: len };
    }
    const lim = kind === 'water' ? 14 : 8;
    let w = Math.min(lim, Math.abs(b.x - a.x) + 1), h = Math.min(lim, Math.abs(b.y - a.y) + 1);
    if (w === 1 && h === 1) {
      [w, h] = kind === 'water' ? [6, 4] : DEFAULT_SIZE[this.tool] || [3, 3];
      return { x: a.x - (w >> 1), y: a.y - (h >> 1), w, h };
    }
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h };
  }

  down(e) {
    if (!this.active || e.button !== 0) return;
    const c = this.cellAt(e); if (!c) return;
    if (this.tab === 'erase') { this.erase(c); return; }
    if (this.tab === 'decor') { this.layout.decor.push({ kind: this.tool, x: c.x, y: c.y }); this.rebuild(); return; }
    this.view.controls.enabled = false;
    this.drag = c;
    this.view.setBox(this.rectFrom(c, c));
  }
  move(e) {
    if (!this.active || !this.drag) return;
    const c = this.cellAt(e); if (!c) return;
    this.view.setBox(this.rectFrom(this.drag, c), this.tab === 'water' ? 0x5aaaff : 0x9fe06a);
  }
  up(e) {
    if (!this.active || !this.drag) return;
    const c = this.cellAt(e) || this.drag;
    const r = this.rectFrom(this.drag, c);
    this.drag = null; this.view.controls.enabled = true; this.view.setBox(null);
    this.layout.objects.push({ kind: this.tab, style: this.tool, ...r });
    this.rebuild();
  }
  erase(c) {
    if (!c) return;
    const i = this.layout.objects.findIndex(o => c.x >= o.x && c.x < o.x + o.w && c.y >= o.y && c.y < o.y + o.h);
    if (i >= 0) { this.layout.objects.splice(i, 1); this.rebuild(); return; }
    const j = this.layout.decor.findIndex(d => Math.abs(d.x - c.x) <= 1 && Math.abs(d.y - c.y) <= 1);
    if (j >= 0) { this.layout.decor.splice(j, 1); this.rebuild(); }
  }
}
