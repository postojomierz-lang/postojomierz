// Bakes public/models/spruce_{albedo,normal}.webp from the 3D spruce: node tools/bake_spruce/bake.mjs
// (needs the repo root served at http://localhost:8765: python3 -m http.server 8765), then packs them with
// tools/pack_impostors.py. Rows = the 3D tree's variants 0..2 (the same seeds), 8 views around each.
import { createRequire } from 'module'; import { execFileSync } from 'child_process';
import fs from 'fs'; import path from 'path'; import os from 'os';
const require = createRequire(execFileSync('npm', ['root', '-g']).toString().trim() + '/');
const { chromium } = require('playwright');
const HERE = path.dirname(new URL(import.meta.url).pathname), OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'spruce-'));
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('page error', e.message));
await p.goto('http://localhost:8765/tatry/tools/bake_spruce/index.html');
await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
const CROWN = 0.45;                        // crown width / height as the 3D trees (vegetation.js: cw = 0.9 w, w = 0.5 h)
const variants = [];
for (let v = 0; v < 3; v++) {
  const r = await p.evaluate(([v, c]) => window.bake(v, 101 + v * 17, c), [v, CROWN]);
  for (const kind of ['albedo', 'normal']) {
    r[kind].forEach((d, k) => fs.writeFileSync(path.join(OUT, `v${v}_${k}_${kind}.png`), Buffer.from(d.split(',')[1], 'base64')));
  }
  variants.push({ width: 10, height: 20, base: 0, trunkH: 19.4 });
}
await b.close();
// one row per variant: the 8 views side by side, each at half size (256 x 512)
execFileSync('python3', ['-c', `
import sys
from PIL import Image
out = sys.argv[1]
for v in range(3):
    for kind in ('albedo', 'normal'):
        row = Image.new('RGBA', (8 * 256, 512))
        for k in range(8):
            im = Image.open(f'{out}/v{v}_{k}_{kind}.png').convert('RGBA').resize((256, 512), Image.LANCZOS)
            row.paste(im, (k * 256, 0))
        row.save(f'{out}/spruce_{v}_{kind}.png')
`, OUT]);
fs.writeFileSync(path.join(OUT, 'spruce.json'), JSON.stringify({ views: 8, variants }));
execFileSync('python3', [path.join(HERE, '..', 'pack_impostors.py'), OUT, path.join(HERE, '..', '..', 'public', 'models'), 'spruce'], { stdio: 'inherit' });
console.log('baked into public/models (from', OUT + ')');
