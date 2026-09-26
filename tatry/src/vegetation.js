// Trees without external assets: branch cards with a painted needle texture, rounded normals
// and baked darkening near the trunk. Far trees are camera-independent impostors (three crossed
// quads) rendered once from the detailed model at start-up.
import * as THREE from 'three';
import { rng } from './noise.js';
import { patchShading } from './materials.js';

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

// Norway spruce, unit height, base at y = 0
function spruceGeometry(atlas, levels = 13, perLevel = 6) {
  const b = new Builder(), r = rng(3);
  const uvB = [0, atlas.branchV0, 1, 1];
  b.cylinder(0.022, 0.006, 0.97, 6, atlas.barkV, 0.8);
  let ang = 0;
  for (let k = 0; k < levels; k++) {
    const t = k / (levels - 1);
    const y = 0.1 + 0.86 * Math.pow(t, 0.9);
    const L = 0.34 * Math.pow(1 - y, 0.85) + 0.035;
    const droop = 0.18 + 0.45 * (1 - t);
    const shade = 0.55 + 0.45 * t;
    const n = perLevel - (t > 0.8 ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const a = ang + i / n * Math.PI * 2 + (r() - 0.5) * 0.5;
      const dir = norm([Math.cos(a), -Math.sin(droop) * (0.8 + r() * 0.4), Math.sin(a)]);
      const side = norm(cross(dir, [0, 1, 0]));
      const up = norm(cross(side, dir));
      const w = L * 0.3;
      const p0 = [0, y, 0], center = [0, y + 0.05, 0];
      b.card(p0, dir, side.map((v) => v * w), L, center, shade, uvB);            // flat, seen from above
      b.card(p0, dir, up.map((v) => v * w * 0.8), L * 0.95, center, shade * 0.95, uvB); // upright
    }
    ang += 2.4;
  }
  // leader shoot
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI;
    b.card([0, 0.93, 0], [0, 1, 0], [Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025], 0.08, [0, 0.9, 0], 1, uvB);
  }
  return b.geometry();
}

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

// ---------------------------------------------------------------- impostor
function bakeImpostor(renderer, geo, atlas) {
  const rt = new THREE.WebGLRenderTarget(256, 320, { samples: 4 });
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const scene = new THREE.Scene();
  const mat = new THREE.MeshBasicMaterial({ map: atlas.tex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-0.4, 0.4, 0.5, -0.5, 0.1, 10);
  cam.position.set(0, 0.5, 3); cam.lookAt(0, 0.5, 0);
  const prevTarget = renderer.getRenderTarget(), prevColor = new THREE.Color(), prevAlpha = renderer.getClearAlpha();
  renderer.getClearColor(prevColor);
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x1a2a16, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  return rt.texture;
}

function impostorGeometry() {
  const b = new Builder();
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI;
    const w = [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4];
    const n = b.pos.length / 3;
    const P = [[-1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    for (const [s, y, u, v] of P) {
      const x = w[0] * s, z = w[2] * s;
      b.pos.push(x, y, z); b.uv.push(u, v);
      const nl = Math.hypot(x, 0.4, z);
      b.nor.push(x / nl, 0.4 / nl, z / nl);
      b.col.push(1, 1, 1);
    }
    b.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  return b.geometry();
}

// ---------------------------------------------------------------- forest with distance LOD
export function buildForest({ renderer, scene, env, spruce, pine, quality }) {
  const atlas = branchTexture();
  const r = rng(21);
  const spruceGeo = spruceGeometry(atlas, quality === 'low' ? 9 : 13, quality === 'low' ? 5 : 6);
  const leaf = foliageMaterial(atlas, env, 1);
  const shrub = foliageMaterial(atlas, env, 0.4);

  const impTex = bakeImpostor(renderer, spruceGeo, atlas);
  const impMat = new THREE.MeshLambertMaterial({ map: impTex, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true });
  patchShading(impMat, env, { wind: 0.5, perVertexShadow: true });

  // per-tree transform, computed once
  const n = spruce.length / 3;
  const mats = new Float32Array(n * 16), cols = new Float32Array(n * 3);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const s = 15 + r() * 16;
    // the elevation model already contains the forest canopy, so sink trees into it
    dummy.position.set(spruce[k * 3], spruce[k * 3 + 1] - s * 0.4, spruce[k * 3 + 2]);
    dummy.rotation.set((r() - 0.5) * 0.05, r() * 6.28, (r() - 0.5) * 0.05);
    const wdt = s * (0.8 + r() * 0.35);
    dummy.scale.set(wdt, s, wdt);
    dummy.updateMatrix(); dummy.matrix.toArray(mats, k * 16);
    col.setHSL(0.27 + r() * 0.06, 0.25 + r() * 0.2, 0.62 + r() * 0.2); col.toArray(cols, k * 3);
  }
  const MAXNEAR = quality === 'low' ? 700 : 2500;
  const near = new THREE.InstancedMesh(spruceGeo, leaf, MAXNEAR);
  const far = new THREE.InstancedMesh(impostorGeometry(), impMat, n);
  near.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXNEAR * 3), 3);
  far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  near.castShadow = near.receiveShadow = true;
  far.castShadow = true; far.receiveShadow = true;
  near.frustumCulled = far.frustumCulled = false;
  scene.add(near, far);

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

  const R_NEAR = quality === 'low' ? 140 : 260;
  let lastX = Infinity, lastZ = Infinity;
  function update(cam) {
    const cx = cam.position.x, cz = cam.position.z;
    if (Math.hypot(cx - lastX, cz - lastZ) < 25) return;
    lastX = cx; lastZ = cz;
    const R2 = R_NEAR * R_NEAR;
    let a = 0, b = 0;
    const nm = near.instanceMatrix.array, nc = near.instanceColor.array;
    const fm = far.instanceMatrix.array, fc = far.instanceColor.array;
    for (let k = 0; k < n; k++) {
      const dx = mats[k * 16 + 12] - cx, dz = mats[k * 16 + 14] - cz;
      if (dx * dx + dz * dz < R2 && a < MAXNEAR) {
        nm.set(mats.subarray(k * 16, k * 16 + 16), a * 16); nc.set(cols.subarray(k * 3, k * 3 + 3), a * 3); a++;
      } else {
        fm.set(mats.subarray(k * 16, k * 16 + 16), b * 16); fc.set(cols.subarray(k * 3, k * 3 + 3), b * 3); b++;
      }
    }
    near.count = a; far.count = b;
    near.instanceMatrix.needsUpdate = far.instanceMatrix.needsUpdate = true;
    near.instanceColor.needsUpdate = far.instanceColor.needsUpdate = true;
  }
  return { update, counts: { spruce: n, pine: pn } };
}
