// Forest: spruces and young spruces as impostors baked from Poly Haven models (see impostor.js);
// dwarf pine as low mounds of branch cards with a painted needle texture.
import * as THREE from 'three';
import { rng } from './noise.js';
import { patchShading } from './materials.js';
import { impostorMesh } from './impostor.js';

// ---------------------------------------------------------------- texture atlas
// top 7/8: spruce branch (twig from the left edge to the right tip), bottom strip: bark
function branchTexture() {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(11);
  const needle = (x, y, a, len, shade) => {
    g.strokeStyle = `hsl(${105 + r() * 25}, ${35 + r() * 20}%, ${shade}%)`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  };
  const bh = H * 7 / 8;
  g.lineCap = 'round';
  // secondary twigs
  const twig = (x0, y0, ang, len, depth) => {
    const steps = Math.floor(len / 3);
    let x = x0, y = y0;
    g.lineWidth = depth ? 1.2 : 2.5;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const nx = x + Math.cos(ang) * 3, ny = y + Math.sin(ang) * 3;
      g.strokeStyle = '#3b2a1a'; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny;
      ang += (r() - 0.5) * 0.08;
      g.lineWidth = 1.3;
      const nl = (depth ? 9 : 13) * (1 - t * 0.5);
      for (let k = 0; k < 3; k++) {
        needle(x, y, ang - 1.1 - r() * 0.5, nl * (0.7 + r() * 0.4), 20 + r() * 16 + t * 12);
        needle(x, y, ang + 1.1 + r() * 0.5, nl * (0.7 + r() * 0.4), 20 + r() * 16 + t * 12);
      }
      g.lineWidth = depth ? 1.2 : 2.5;
      if (!depth && i > 4 && i % 7 === 0) {
        const side = i % 14 === 0 ? 1 : -1;
        twig(x, y, ang + side * (0.6 + r() * 0.3), (len - i * 3) * 0.45, 1);
      }
    }
  };
  twig(4, bh * 0.5, 0, W * 0.93, 0);
  // bark strip
  const bark = g.createLinearGradient(0, bh, 0, H);
  bark.addColorStop(0, '#4a3627'); bark.addColorStop(1, '#2e2219');
  g.fillStyle = bark; g.fillRect(0, bh + 2, W, H - bh - 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, barkV: 1 - (bh + (H - bh) / 2) / H, branchV0: 1 - bh / H };
}

// ---------------------------------------------------------------- geometry builder
class Builder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  // quad from p0 (twig base) along dir by len, with half-width vector w
  card(p0, dir, w, len, center, shadeBase, uv) {
    const n = this.pos.length / 3;
    const [u0, v0, u1, v1] = uv;
    const pts = [
      [p0[0] - w[0], p0[1] - w[1], p0[2] - w[2], u0, v0],
      [p0[0] + w[0], p0[1] + w[1], p0[2] + w[2], u0, v1],
      [p0[0] + dir[0] * len + w[0], p0[1] + dir[1] * len + w[1], p0[2] + dir[2] * len + w[2], u1, v1],
      [p0[0] + dir[0] * len - w[0], p0[1] + dir[1] * len - w[1], p0[2] + dir[2] * len - w[2], u1, v0],
    ];
    pts.forEach(([x, y, z, u, v], i) => {
      this.pos.push(x, y, z); this.uv.push(u, v);
      // rounded "canopy" normal: from the crown axis outward, tilted up
      const nx = x - center[0], ny = (y - center[1]) * 0.6 + 0.35, nz = z - center[2];
      const l = Math.hypot(nx, ny, nz) || 1;
      this.nor.push(nx / l, ny / l, nz / l);
      const s = shadeBase * (i < 2 ? 0.65 : 1);
      this.col.push(s, s, s);
    });
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  cylinder(r0, r1, h, seg, v, shade) {
    const n = this.pos.length / 3;
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, rr = j ? r1 : r0;
      this.pos.push(Math.cos(a) * rr, j * h, Math.sin(a) * rr);
      this.nor.push(Math.cos(a), 0, Math.sin(a));
      this.uv.push(i / seg, v); this.col.push(shade, shade, shade);
    }
    for (let i = 0; i < seg; i++) {
      const a = n + i, b = n + i + 1, c = n + seg + 1 + i, d = c + 1;
      this.idx.push(a, c, b, b, c, d);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Dwarf mountain pine: low mound of branches radiating from the centre, unit radius
function pineGeometry(atlas) {
  const b = new Builder(), r = rng(5);
  const uvB = [0, atlas.branchV0, 1, 1];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + r() * 0.3;
    const lift = 0.15 + r() * 0.5;
    const dir = norm([Math.cos(a), lift, Math.sin(a)]);
    const side = norm(cross(dir, [0, 1, 0]));
    const up = norm(cross(side, dir));
    const L = 0.8 + r() * 0.35;
    const p0 = [Math.cos(a) * 0.1, 0.05 + r() * 0.1, Math.sin(a) * 0.1];
    b.card(p0, dir, side.map((v) => v * 0.28), L, [0, -0.2, 0], 0.75 + r() * 0.25, uvB);
    b.card(p0, dir, up.map((v) => v * 0.2), L * 0.9, [0, -0.2, 0], 0.7 + r() * 0.2, uvB);
  }
  return b.geometry();
}

function foliageMaterial(atlas, env, wind) {
  const m = new THREE.MeshLambertMaterial({
    map: atlas.tex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide,
  });
  patchShading(m, env, { wind, perVertexShadow: true });
  return m;
}

// ---------------------------------------------------------------- forest with distance LOD
export function buildForest({ scene, env, spruce, pine, quality, kinds }) {
  const atlas = branchTexture();
  const r = rng(21);
  const shrub = foliageMaterial(atlas, env, 0.4);
  const dummy = new THREE.Object3D(), col = new THREE.Color();

  // spruces (and young spruces near the upper tree line): baked impostors of the Poly Haven models
  const n = spruce.length / 4; // x, y, z, 1 if the ground height includes the canopy
  const trees = [], young = [];
  const sv = kinds.spruce.meta.variants, yv = kinds.sapling.meta.variants;
  for (let k = 0; k < n; k++) {
    const x = spruce[k * 4], y = spruce[k * 4 + 1], z = spruce[k * 4 + 2], canopy = spruce[k * 4 + 3];
    // towards the tree line (≈1550 m) the forest thins into smaller, younger trees
    const high = Math.min(1, Math.max(0, (y - 1430) / 120));
    const isYoung = r() < 0.12 + 0.6 * high;
    const list = isYoung ? young : trees, vars = isYoung ? yv : sv;
    const row = Math.floor(r() * vars.length), v = vars[row];
    const target = isYoung ? 4 + r() * 5 : (1 - 0.35 * high) * (17 + r() * 13);
    const s = target / v.height;
    list.push({ x, y: y - (canopy ? target * 0.4 : 0.3) - v.base * s, z, w: v.width * s * (0.9 + r() * 0.2), h: v.height * s,
      row, rot: r() * 6.283, tint: r(), wind: isYoung ? 1.2 : 0.8 });
  }
  const treeMesh = impostorMesh(kinds.spruce, trees);
  const youngMesh = impostorMesh(kinds.sapling, young);
  scene.add(treeMesh, youngMesh);

  // dwarf pine: always the card model (cheap)
  const pn = pine.length / 3;
  const pineMesh = new THREE.InstancedMesh(pineGeometry(atlas), shrub, pn);
  for (let k = 0; k < pn; k++) {
    const s = 1.6 + r() * 2.6;
    dummy.position.set(pine[k * 3], pine[k * 3 + 1] - 0.25, pine[k * 3 + 2]);
    dummy.rotation.set(0, r() * 6.28, 0);
    dummy.scale.set(s * (0.8 + r() * 0.5), s * (0.55 + r() * 0.3), s * (0.8 + r() * 0.5));
    dummy.updateMatrix(); pineMesh.setMatrixAt(k, dummy.matrix);
    pineMesh.setColorAt(k, col.setHSL(0.24 + r() * 0.06, 0.3, 0.75 + r() * 0.2));
  }
  pineMesh.castShadow = pineMesh.receiveShadow = true;
  scene.add(pineMesh);

  function update() {}
  return { update, counts: { spruce: trees.length, young: young.length, pine: pn } };
}
