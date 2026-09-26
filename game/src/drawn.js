// Turn a photo of a hand-drawn map into a battlefield layout, entirely in the browser.
// Legend: black/dark = tall obstacles, red = LEGO bricks, blue = spills, green = low cover.
// Paper colour is estimated per region, so shadows and uneven light are tolerated.
const EMPTY = 0, DARK = 1, RED = 2, BLUE = 3, GREEN = 4;

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export async function recognizeDrawing(file, W, H) {
  const bmp = await createImageBitmap(file);
  const P = 4;                           // pixels sampled per cell edge
  const cw = W * P, ch = H * P;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  // photographed portrait? turn it so the long side runs across the battlefield
  if (bmp.height > bmp.width) { g.translate(cw, 0); g.rotate(Math.PI / 2); g.drawImage(bmp, 0, 0, ch, cw); }
  else g.drawImage(bmp, 0, 0, cw, ch);
  const px = g.getImageData(0, 0, cw, ch).data;

  // paper brightness per region (75th percentile), to survive shadows
  const RX = 8, RY = 5, paper = new Float32Array(RX * RY);
  for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
    const vals = [];
    for (let y = Math.floor(ry * ch / RY); y < Math.floor((ry + 1) * ch / RY); y += 2) for (let x = Math.floor(rx * cw / RX); x < Math.floor((rx + 1) * cw / RX); x += 2) {
      const i = (y * cw + x) * 4; vals.push((px[i] + px[i + 1] + px[i + 2]) / 765);
    }
    vals.sort((a, b) => a - b);
    paper[ry * RX + rx] = vals[Math.floor(vals.length * 0.75)] || 1;
  }

  // classify every cell by the majority of its inked pixels
  const cls = new Uint8Array(W * H);
  let inked = 0;
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const votes = [0, 0, 0, 0, 0];
    for (let y = cy * P; y < cy * P + P; y++) for (let x = cx * P; x < cx * P + P; x++) {
      const i = (y * cw + x) * 4, r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
      const lum = (r + gg + b) / 3, pl = paper[Math.min(RY - 1, Math.floor(y * RY / ch)) * RX + Math.min(RX - 1, Math.floor(x * RX / cw))];
      const [h, s, v] = hsv(r, gg, b);
      if (s > 0.32 && v > 0.2) {
        if (h >= 185 && h <= 265) votes[BLUE]++;
        else if (h >= 70 && h <= 175) votes[GREEN]++;
        else if (h <= 25 || h >= 320) votes[RED]++;
      } else if (lum < pl - 0.22) votes[DARK]++;
    }
    let best = EMPTY, n = 5;       // at least 5 of 16 pixels must be ink
    for (let k = 1; k < 5; k++) if (votes[k] >= n) { n = votes[k]; best = k; }
    cls[cy * W + cx] = best;
    if (best) inked++;
  }
  if (inked < 4) throw new Error('no drawing found — use a dark marker on white paper and fill the photo with the sheet');
  if (inked > W * H * 0.6) throw new Error('the photo looks mostly dark — photograph just the white sheet in good light');

  const objects = [];
  const seen = new Uint8Array(W * H);
  // cover a class with rectangles (greedy: widest run, then as tall as possible), max size 6
  const rects = (k, maxW, maxH) => {
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cls[i] !== k || seen[i]) continue;
      let w = 1; while (x + w < W && w < maxW && cls[i + w] === k && !seen[i + w]) w++;
      let h = 1;
      grow: while (y + h < H && h < maxH) { for (let xx = x; xx < x + w; xx++) { const j = (y + h) * W + xx; if (cls[j] !== k || seen[j]) break grow; } h++; }
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) seen[yy * W + xx] = 1;
      out.push({ x, y, w, h });
    }
    return out;
  };
  const tallStyle = r => r.w >= 4 || r.h >= 4 ? (r.w * r.h > 16 ? 'box' : 'books') : r.w >= 3 || r.h >= 3 ? 'shoebox' : ['mug', 'bucket', 'rock'][(r.x + r.y) % 3];
  for (const r of rects(DARK, 6, 6)) if (r.w * r.h >= 2) objects.push({ kind: 'tall', style: tallStyle(r), ...r });
  for (const r of rects(RED, 4, 4)) if (r.w * r.h >= 2) objects.push({ kind: 'tall', style: 'lego', ...r });
  // low cover: thin lines, horizontal runs first, then vertical
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let i = y * W + x; if (cls[i] !== GREEN || seen[i]) continue;
    let w = 0; while (x + w < W && w < 8 && cls[i + w] === GREEN && !seen[i + w]) w++;
    if (w >= 2) { for (let k = 0; k < w; k++) seen[i + k] = 1; objects.push({ kind: 'low', style: w >= 5 ? 'pencils' : 'crayons', x, y, w, h: 1 }); continue; }
    let h = 0; while (y + h < H && h < 8 && cls[(y + h) * W + x] === GREEN && !seen[(y + h) * W + x]) h++;
    for (let k = 0; k < h; k++) seen[(y + k) * W + x] = 1;
    if (h >= 2) objects.push({ kind: 'low', style: h >= 5 ? 'pencils' : 'crayons', x, y, w: 1, h });
  }
  // spills: one ellipse per connected blob
  for (let s = 0; s < W * H; s++) {
    if (cls[s] !== BLUE || seen[s]) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0; const q = [s]; seen[s] = 1;
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i / W) | 0; n++;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && !seen[j] && cls[j] === BLUE && Math.abs((j % W) - x) <= 1) { seen[j] = 1; q.push(j); }
    }
    if (n >= 3) objects.push({ kind: 'water', style: 'puddle', x: x0, y: y0, w: Math.max(2, x1 - x0 + 1), h: Math.max(2, y1 - y0 + 1) });
  }
  return { W, H, title: 'Hand-drawn battlefield', briefing: 'Drawn by a real commander. Every line on the paper is a wall on the floor.', objects, decor: [] };
}

// A printable blank sheet with the army zones marked (very light, so it is not read as ink).
export function blankSheet(map) {
  const S = 25, c = document.createElement('canvas');
  c.width = map.W * S; c.height = map.H * S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#e4e4e4'; g.lineWidth = 1;
  for (let x = 0; x <= map.W; x += 4) { g.beginPath(); g.moveTo(x * S, 0); g.lineTo(x * S, c.height); g.stroke(); }
  for (let y = 0; y <= map.H; y += 4) { g.beginPath(); g.moveTo(0, y * S); g.lineTo(c.width, y * S); g.stroke(); }
  g.fillStyle = '#f1f1f1';
  for (const z of map.zones) g.fillRect(z.x * S, z.y * S, z.w * S, z.h * S);
  g.fillStyle = '#d8d8d8'; g.font = `${S * 1.2}px sans-serif`; g.textAlign = 'center';
  map.zones.forEach((z, i) => g.fillText(`army ${i + 1}`, (z.x + z.w / 2) * S, (z.y + z.h / 2) * S));
  g.font = `${S * 0.9}px sans-serif`;
  g.fillText('black = walls / books · red = LEGO · blue = spills · green = low cover — keep the zones empty', c.width / 2, c.height - S * 0.8);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = 'plastic-front-blank-map.png';
  document.body.appendChild(a); a.click(); a.remove();
}
