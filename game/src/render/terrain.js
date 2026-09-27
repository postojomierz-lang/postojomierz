// Floors, household obstacles, puddles and decorations.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry } from '../sim/rng.js';
import { T_WATER, T_LOW } from '../sim/map.js';

const PAL = ['#d94b3d', '#e9a23b', '#e7cf3f', '#4f9a4a', '#3f7cc8', '#8a5cc2', '#e0679b', '#2aa5a0', '#f2efe6'];

export const FLOOR = {
  wood:    { base: '#b98a55', a: '#c89a62', b: '#a47645', bg: '#3b2a1a', sun: [-0.62, 0.42, 0.38], sunColor: '#ffe2b8', sky: '#fff1dc', ground: '#6b5033' },
  carpet:  { base: '#6f8cb5', a: '#809dc5', b: '#5f7ca3', bg: '#263245', sun: [-0.55, 0.48, 0.42], sunColor: '#ffe9cc', sky: '#f2f0ff', ground: '#3a4a66' },
  kitchen: { base: '#e6e1d4', a: '#f4f0e6', b: '#c9c2b1', bg: '#4c463c', sun: [-0.5, 0.5, 0.5], sunColor: '#fff4e0', sky: '#ffffff', ground: '#8a8170' },
  sand:    { base: '#e2c78c', a: '#efd8a4', b: '#cdb074', bg: '#a8d4ea', sun: [-0.6, 0.4, 0.45], sunColor: '#ffe6b0', sky: '#dff2ff', ground: '#b08f54' },
  grass:   { base: '#6d9c45', a: '#84b456', b: '#57843a', bg: '#9ec7e8', sun: [-0.58, 0.45, 0.4], sunColor: '#fff0c8', sky: '#e6f4ff', ground: '#3f5f2a' },
  // the Normandy diorama: a board on a table in a dim room, lit by a warm summer "sun"
  normandy: { base: '#6c8c42', a: '#7b9a4a', b: '#5d7c38', bg: '#2b2723', sun: [-0.55, 0.55, 0.36], sunColor: '#fff0d4', sky: '#e4edf5', ground: '#4f5a36' },
  snow:    { base: '#e9eef3', a: '#ffffff', b: '#cfd8e1', bg: '#b9c8d6', sun: [-0.62, 0.36, 0.42], sunColor: '#fff1dd', sky: '#e8f0ff', ground: '#9fb0c2' },
};

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

export function floorTexture(theme, seed, tint = null) {
  let st = FLOOR[theme]; const rng = mulberry(seed);
  if (tint) {
    // recolour the pattern towards the floor colour Claude saw in the photo
    const mix = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color(tint), k).getHexString();
    st = { ...st, base: mix(st.base, 0.75), a: mix(st.a, 0.65), b: mix(st.b, 0.65) };
  }
  return canvasTexture(1024, (c, S) => {
    c.fillStyle = st.base; c.fillRect(0, 0, S, S);
    if (theme === 'wood') {
      const ph = S / 8;
      for (let i = 0; i < 8; i++) {
        const y = i * ph;
        c.fillStyle = i % 2 ? st.a : st.base; c.fillRect(0, y, S, ph);
        const tint = rng() * 0.12; c.fillStyle = `rgba(80,40,10,${tint})`; c.fillRect(0, y, S, ph);
        c.strokeStyle = 'rgba(90,50,20,.18)'; c.lineWidth = 1.5;
        for (let k = 0; k < 6; k++) { c.beginPath(); const yy = y + 6 + rng() * (ph - 12); c.moveTo(0, yy); c.bezierCurveTo(S / 3, yy + rng() * 10 - 5, 2 * S / 3, yy + rng() * 10 - 5, S, yy); c.stroke(); }
        c.fillStyle = 'rgba(40,20,5,.55)'; c.fillRect(0, y, S, 3);
        let x = rng() * S * 0.5; while (x < S) { c.fillRect(x, y, 3, ph); x += S * (0.35 + rng() * 0.5); }
      }
    } else if (theme === 'kitchen') {
      const n = 4, ts = S / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { c.fillStyle = (x + y) % 2 ? st.a : st.b; c.fillRect(x * ts, y * ts, ts, ts); }
      c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 4;
      for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * ts, 0); c.lineTo(i * ts, S); c.stroke(); c.beginPath(); c.moveTo(0, i * ts); c.lineTo(S, i * ts); c.stroke(); }
    } else {
      const n = theme === 'grass' ? 26000 : 60000;
      for (let i = 0; i < n; i++) {
        const x = rng() * S, y = rng() * S;
        c.fillStyle = rng() < 0.5 ? st.a : st.b;
        if (theme === 'grass') { c.strokeStyle = c.fillStyle; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + rng() * 6 - 3, y - 5 - rng() * 7); c.stroke(); }
        else if (theme === 'carpet') c.fillRect(x, y, 2, 2);
        else { c.beginPath(); c.arc(x, y, 0.8 + rng() * 1.4, 0, 7); c.fill(); }
      }
      if (theme === 'sand' || theme === 'snow') {
        c.strokeStyle = theme === 'sand' ? 'rgba(150,110,50,.12)' : 'rgba(120,140,170,.12)'; c.lineWidth = 6;
        for (let k = 0; k < 18; k++) { c.beginPath(); const y = rng() * S; c.moveTo(0, y); c.bezierCurveTo(S / 3, y + rng() * 60 - 30, 2 * S / 3, y + rng() * 60 - 30, S, y + rng() * 40 - 20); c.stroke(); }
      }
    }
  });
}

const matCache = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o }));
  return matCache.get(k);
}
function mesh(geo, m, cast = true) { const x = new THREE.Mesh(geo, m); x.castShadow = cast; x.receiveShadow = true; return x; }
function at(o, x, y, z) { o.position.set(x, y, z); return o; }

const letterTex = new Map();
function letterMaterial(letter, color) {
  const k = letter + color;
  if (!letterTex.has(k)) {
    const t = canvasTexture(256, (c, S) => {
      c.fillStyle = '#ecd3a0'; c.fillRect(0, 0, S, S);
      c.strokeStyle = color; c.lineWidth = 18; c.strokeRect(16, 16, S - 32, S - 32);
      c.fillStyle = color; c.font = 'bold 170px "Black Ops One", Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(letter, S / 2, S / 2 + 10);
    });
    letterTex.set(k, new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  }
  return letterTex.get(k);
}

// world position of a map cell (the map is centred on the origin)
export function makeWorld(map) {
  return { wx: x => x - map.W / 2, wz: y => y - map.H / 2 };
}

export function buildTerrain(map) {
  const g = new THREE.Group();
  const { wx, wz } = makeWorld(map);
  for (const o of map.objects) {
    const rng = mulberry(o.seed);
    const cx = wx(o.x + o.w / 2), cz = wz(o.y + o.h / 2);
    const w = o.w, d = o.h, m = Math.min(w, d);
    const obj = new THREE.Group();
    obj.position.set(cx, 0, cz);
    if (o.kind === T_WATER) {
      // a smooth glossy spill: blurred blobs over the puddle's cells, thresholded into one shape
      const col = { juice: '#f08c1e', cola: '#4a2410', ink: '#1d2a6b', milk: '#f4f6f7', moat: '#3a8fc4', puddle: '#5f8fa8', ice: '#bfe3f2' }[o.style] || '#5f8fa8';
      const px = 32, pad = 1, cw = (o.w + pad * 2) * px, ch = (o.h + pad * 2) * px;
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const c2 = cv.getContext('2d');
      c2.filter = 'blur(10px)'; c2.fillStyle = '#fff';
      for (const c of o.cells) {
        const x = (c % map.W - o.x + pad + 0.5) * px, y = (Math.floor(c / map.W) - o.y + pad + 0.5) * px;
        c2.beginPath(); c2.arc(x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 10, px * (0.75 + rng() * 0.25), 0, 7); c2.fill();
      }
      c2.filter = 'none';
      const img = c2.getImageData(0, 0, cw, ch), d = img.data;
      for (let i = 3; i < d.length; i += 4) { const a = d[i] / 255; const v = Math.max(0, Math.min(1, (a - 0.45) * 6)); d[i - 3] = d[i - 2] = d[i - 1] = 255; d[i] = v * 255; }
      c2.putImageData(img, 0, 0);
      const alpha = new THREE.CanvasTexture(cv);
      const clear = o.style !== 'milk';
      const m2 = new THREE.MeshStandardMaterial({ color: col, alphaMap: alpha, transparent: true, opacity: clear ? 0.9 : 1, roughness: 0.04, metalness: 0.1, depthWrite: false });
      const water = mesh(new THREE.PlaneGeometry(o.w + pad * 2, o.h + pad * 2), m2, false);
      water.rotation.x = -Math.PI / 2; water.position.y = 0.015; water.renderOrder = 2;
      obj.add(water);
    } else if (o.kind === T_LOW) {
      const long = Math.max(w, d), along = w >= d ? 0 : Math.PI / 2;
      const inner = new THREE.Group(); inner.rotation.y = along; obj.add(inner);
      if (o.style === 'pencils' || o.style === 'crayons') {
        for (let i = 0; i < 2; i++) {
          const col = PAL[Math.floor(rng() * 8)], r = o.style === 'crayons' ? 0.3 : 0.26;
          const body = mesh(new THREE.CylinderGeometry(r, r, long - 0.9, o.style === 'pencils' ? 6 : 16), mat(col, { roughness: 0.5 }));
          body.rotation.z = Math.PI / 2; body.position.set(-0.3, r, (i - 0.5) * 0.62); inner.add(body);
          const tip = mesh(new THREE.ConeGeometry(r, 0.9, o.style === 'pencils' ? 6 : 16), mat(o.style === 'pencils' ? '#e8c89a' : col));
          tip.rotation.z = -Math.PI / 2; tip.position.set(long / 2 - 0.75, r, (i - 0.5) * 0.62); inner.add(tip);
          if (o.style === 'pencils') { const lead = mesh(new THREE.ConeGeometry(0.08, 0.25, 6), mat('#333')); lead.rotation.z = -Math.PI / 2; lead.position.set(long / 2 - 0.2, r, (i - 0.5) * 0.62); inner.add(lead); }
        }
      } else if (o.style === 'remote') {
        inner.add(at(mesh(new RoundedBoxGeometry(long - 0.2, 0.35, 0.95, 3, 0.12), mat('#26262b', { roughness: 0.5 })), 0, 0.18, 0));
        for (let i = 0; i < 6; i++) { const bt = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), mat(i === 0 ? '#d94b3d' : '#777')); bt.position.set(-long / 2 + 0.8 + i * 0.45, 0.37, (i % 2 - 0.5) * 0.3); inner.add(bt); }
      } else if (o.style === 'spoons') {
        const m2 = mat('#cfd3d8', { roughness: 0.2, metalness: 0.9 });
        const handle = mesh(new THREE.CapsuleGeometry(0.12, long - 1.6, 4, 10), m2); handle.rotation.z = Math.PI / 2; handle.position.set(-0.5, 0.12, 0); inner.add(handle);
        const bowl = mesh(new THREE.SphereGeometry(0.5, 16, 10), m2); bowl.scale.set(1.2, 0.28, 0.85); bowl.position.set(long / 2 - 0.7, 0.14, 0); inner.add(bowl);
      } else if (o.style === 'shoe') {
        const col = PAL[Math.floor(rng() * 8)];
        const sole = mesh(new RoundedBoxGeometry(long - 0.3, 0.25, 1.1, 3, 0.12), mat('#f2efe6', { roughness: 0.8 })); sole.position.y = 0.12; inner.add(sole);
        const upper = mesh(new THREE.SphereGeometry(0.5, 18, 12), mat(col, { roughness: 0.85 })); upper.scale.set((long - 0.6) / 1.0, 0.75, 1.0); upper.position.set(-0.15, 0.35, 0); inner.add(upper);
      } else if (o.style === 'cable') {
        const pts = [];
        for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(-long / 2 + long * i / 12, 0.12, Math.sin(i * 1.3 + rng() * 2) * 0.3));
        const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.11, 8), mat('#1f1f22', { roughness: 0.45 })); inner.add(tube);
        const plug = mesh(new RoundedBoxGeometry(0.6, 0.35, 0.45, 2, 0.08), mat('#e8e6df', { roughness: 0.5 })); plug.position.set(long / 2 - 0.2, 0.18, pts[12].z); inner.add(plug);
      } else { // shells, twigs, stones
        for (let i = 0; i < long * 2; i++) {
          const s = o.style === 'twigs'
            ? mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.2 + rng(), 6), mat('#6e4a2b', { roughness: 0.9 }))
            : mesh(new THREE.SphereGeometry(0.28 + rng() * 0.12, 10, 8), mat(o.style === 'shells' ? '#f0dcc8' : '#9a948a', { roughness: 0.8 }));
          if (o.style === 'twigs') { s.rotation.set(Math.PI / 2, rng() * 3, 0); s.position.set(-long / 2 + i * 0.5 + 0.3, 0.1, (rng() - 0.5) * 0.6); }
          else { s.scale.y = 0.5; s.position.set(-long / 2 + i * 0.5 + 0.3, 0.12, (rng() - 0.5) * 0.6); }
          inner.add(s);
        }
      }
    } else {
      switch (o.style) {
        case 'books': {
          let y = 0; const n = 3 + Math.floor(rng() * 3);
          for (let i = 0; i < n; i++) {
            const th = 0.32 + rng() * 0.22, col = PAL[Math.floor(rng() * 8)];
            const cover = mat(col, { roughness: 0.65 }), pages = mat('#f3ead2', { roughness: 0.9 });
            const bw = w * (0.86 + rng() * 0.14) - 0.1, bd = d * (0.84 + rng() * 0.16) - 0.1;
            const book = mesh(new THREE.BoxGeometry(bw, th, bd), [pages, cover, cover, cover, pages, pages]);
            book.position.y = y + th / 2; book.rotation.y = (rng() - 0.5) * 0.2; obj.add(book); y += th;
          }
          break;
        }
        case 'box': {
          const H = 1.9, box = mesh(new THREE.BoxGeometry(w - 0.15, H, d - 0.15), mat('#b98d5a', { roughness: 0.9 })); box.position.y = H / 2; obj.add(box);
          const tape = mesh(new THREE.BoxGeometry(w - 0.1, 0.02, 0.35), mat('#e3d4a0', { roughness: 0.4 })); tape.position.y = H + 0.01; obj.add(tape);
          break;
        }
        case 'bottle': {
          const r = Math.min(m / 2 - 0.15, 0.9), col = PAL[Math.floor(rng() * 8)];
          const glass = mat(col, { roughness: 0.1, transparent: true, opacity: 0.75 });
          const b1 = mesh(new THREE.CylinderGeometry(r, r, 2.8, 24), glass); b1.position.y = 1.4; obj.add(b1);
          const b2 = mesh(new THREE.CylinderGeometry(r * 0.35, r, 0.8, 24), glass); b2.position.y = 3.2; obj.add(b2);
          const cap = mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.38, 0.35, 16), mat('#f2efe6', { roughness: 0.5 })); cap.position.y = 3.75; obj.add(cap);
          const label = mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.9, 24, 1, true), mat('#f4f0e2', { roughness: 0.8 })); label.position.y = 1.3; obj.add(label);
          break;
        }
        case 'shoebox': case 'toybox': case 'cereal': {
          const H = o.style === 'cereal' ? 3.4 : o.style === 'toybox' ? 2.2 : 1.6;
          const col = o.style === 'cereal' ? '#d94b3d' : o.style === 'toybox' ? '#3f7cc8' : '#e9a23b';
          const box = mesh(new THREE.BoxGeometry(w - 0.15, H, d - 0.15), mat(col, { roughness: 0.8 })); box.position.y = H / 2; obj.add(box);
          const lid = mesh(new THREE.BoxGeometry(w - 0.02, 0.18, d - 0.02), mat(o.style === 'cereal' ? '#f2c230' : '#f2efe6', { roughness: 0.8 })); lid.position.y = o.style === 'cereal' ? H * 0.62 : H + 0.05; obj.add(lid);
          break;
        }
        case 'mug': case 'pot': case 'bucket': case 'flowerpot': {
          const r = m / 2 - 0.1, H = o.style === 'mug' ? 2.1 : o.style === 'pot' ? 1.6 : 1.8;
          const col = o.style === 'pot' ? '#b9bec4' : o.style === 'flowerpot' ? '#c0643a' : PAL[Math.floor(rng() * 8)];
          const m2 = mat(col, o.style === 'pot' ? { roughness: 0.25, metalness: 0.85 } : { roughness: o.style === 'flowerpot' ? 0.85 : 0.3 });
          const cyl = mesh(new THREE.CylinderGeometry(r, o.style === 'mug' ? r : r * 0.8, H, 32, 1, true), m2); cyl.position.y = H / 2; obj.add(cyl);
          const bottom = mesh(new THREE.CircleGeometry(r * 0.98, 32), mat(o.style === 'mug' ? '#4a2a14' : o.style === 'flowerpot' ? '#4b3322' : '#555', { roughness: 0.3 })); bottom.rotation.x = -Math.PI / 2; bottom.position.y = H * (o.style === 'mug' ? 0.8 : 0.85); obj.add(bottom);
          const rim = mesh(new THREE.TorusGeometry(r, 0.06, 8, 32), m2); rim.rotation.x = Math.PI / 2; rim.position.y = H; obj.add(rim);
          if (o.style === 'mug') { const h = mesh(new THREE.TorusGeometry(0.55, 0.14, 10, 20, Math.PI), m2); h.position.set(r + 0.02, H * 0.52, 0); h.rotation.z = -Math.PI / 2; obj.add(h); }
          if (o.style === 'flowerpot') for (let i = 0; i < 6; i++) { const l = mesh(new THREE.SphereGeometry(0.45, 12, 10), mat('#3f8a3a', { roughness: 0.8 })); l.position.set((rng() - .5) * r, H + 0.2 + rng() * 0.5, (rng() - .5) * r); obj.add(l); }
          if (o.style === 'bucket') { const h = mesh(new THREE.TorusGeometry(r, 0.04, 6, 24, Math.PI), m2); h.position.y = H; h.rotation.y = rng() * 3; obj.add(h); }
          if (o.style === 'pot') for (const s of [-1, 1]) { const h = mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 12, Math.PI), m2); h.position.set(s * (r + 0.05), H * 0.85, 0); h.rotation.set(Math.PI / 2, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2); obj.add(h); }
          break;
        }
        case 'lego': {
          const col = PAL[Math.floor(rng() * 8)], m2 = mat(col, { roughness: 0.28 }), H = 1.2;
          const b = mesh(new RoundedBoxGeometry(w - 0.1, H, d - 0.1, 2, 0.04), m2); b.position.y = H / 2; obj.add(b);
          for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) { const s = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 18), m2); s.position.set(-w / 2 + i + 0.5, H + 0.1, -d / 2 + j + 0.5); obj.add(s); }
          break;
        }
        case 'blocks': {
          const n = Math.max(1, Math.floor(m / 2)), size = m / n - 0.12;
          for (let i = 0; i < Math.floor(w / (size + 0.1)); i++) for (let j = 0; j < Math.floor(d / (size + 0.1)); j++) {
            const letter = 'ABCDEFGHKLMNPRSTWXYZ'[Math.floor(rng() * 20)], col = PAL[Math.floor(rng() * 8)];
            const b = mesh(new RoundedBoxGeometry(size, size, size, 2, 0.08), letterMaterial(letter, col));
            b.position.set(-w / 2 + (i + 0.5) * (size + 0.1) + 0.05, size / 2, -d / 2 + (j + 0.5) * (size + 0.1) + 0.05); b.rotation.y = (rng() - 0.5) * 0.4; obj.add(b);
          }
          break;
        }
        case 'castle': {
          const sand = mat('#dcc084', { roughness: 1 });
          const t = mesh(new THREE.CylinderGeometry(m / 2 - 0.3, m / 2, 2.2, 24), sand); t.position.y = 1.1; obj.add(t);
          for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c2 = mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), sand); c2.position.set(Math.cos(a) * (m / 2 - 0.45), 2.4, Math.sin(a) * (m / 2 - 0.45)); obj.add(c2); }
          if (w > d + 1 || d > w + 1) { const t2 = mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.6, 18), sand); t2.position.set(w > d ? w / 2 - 0.9 : 0, 0.8, d > w ? d / 2 - 0.9 : 0); obj.add(t2); }
          break;
        }
        case 'snowman': {
          [[m * 0.45, m * 0.4], [m * 0.32, m * 1.05], [m * 0.22, m * 1.5]].forEach(([r, y]) => { const s = mesh(new THREE.SphereGeometry(r, 20, 14), mat('#f7fafc', { roughness: 0.9 })); s.position.y = y; obj.add(s); });
          const nose = mesh(new THREE.ConeGeometry(0.1, 0.5, 8), mat('#f08a24')); nose.rotation.z = -Math.PI / 2; nose.position.set(m * 0.22 + 0.2, m * 1.5, 0); obj.add(nose);
          break;
        }
        default: { // rock
          const r = mesh(new THREE.DodecahedronGeometry(m / 2, 1), mat('#8e8a82', { roughness: 0.95, flatShading: true }));
          r.scale.set(w / m, 0.7, d / m); r.position.y = m * 0.28; r.rotation.y = rng() * 3; obj.add(r);
        }
      }
    }
    g.add(obj);
  }
  // decorations: toy palm trees / pines / bushes (purely visual)
  for (const dcr of map.decor) {
    const rng = mulberry(dcr.seed), t = new THREE.Group();
    t.position.set(wx(dcr.x), 0, wz(dcr.y)); t.rotation.y = rng() * 6;
    const plastic = mat(dcr.kind === 'pine' ? '#2f6b3a' : '#4fa33a', { roughness: 0.4 });
    t.add(at(mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.08, 16), mat('#d03a2a', { roughness: 0.4 })), 0, 0.04, 0));
    if (dcr.kind === 'palm') {
      const trunk = mat('#8a6a3a', { roughness: 0.6 });
      for (let i = 0; i < 6; i++) { const s = mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.34, 8), trunk); s.position.set(i * 0.03, 0.2 + i * 0.32, 0); s.rotation.z = -0.05; t.add(s); }
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, leaf = mesh(new THREE.SphereGeometry(0.5, 10, 6), plastic);
        leaf.scale.set(1.5, 0.08, 0.35); leaf.position.set(0.2 + Math.cos(a) * 0.6, 2.05 - 0.15, Math.sin(a) * 0.6); leaf.rotation.set(0, -a, -0.35); t.add(leaf);
      }
    } else if (dcr.kind === 'pine') {
      for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry(0.8 - i * 0.2, 1.0, 12), plastic); c.position.y = 0.7 + i * 0.55; t.add(c); }
    } else {
      for (let i = 0; i < 4; i++) { const s = mesh(new THREE.SphereGeometry(0.45 + rng() * 0.2, 12, 10), plastic); s.position.set((rng() - .5) * 0.6, 0.4, (rng() - .5) * 0.6); t.add(s); }
    }
    g.add(t);
  }
  return g;
}

// Masking-tape border around the battlefield and coloured deployment zones.
export function buildTape(map, color = '#efe2b4', inset = 0) {
  const g = new THREE.Group(), { wx, wz } = makeWorld(map);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const strip = (x, z, w, d) => { const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), m); s.position.set(x, 0.012, z); s.receiveShadow = true; g.add(s); };
  const t = 0.5;
  if (map.round) {
    // round table: a tape circle, and everything beyond it in shadow
    const ring = new THREE.Mesh(new THREE.RingGeometry(map.R, map.R + t, 128), m);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.receiveShadow = true; g.add(ring);
    const off = new THREE.Mesh(new THREE.RingGeometry(map.R + t, map.R + 400, 128, 1),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    off.rotation.x = -Math.PI / 2; off.position.y = 0.01; g.add(off);
    return g;
  }
  strip(0, wz(0) - t / 2 - inset, map.W + 2 * t, t); strip(0, wz(map.H) + t / 2 + inset, map.W + 2 * t, t);
  strip(wx(0) - t / 2 - inset, 0, t, map.H); strip(wx(map.W) + t / 2 + inset, 0, t, map.H);
  return g;
}
