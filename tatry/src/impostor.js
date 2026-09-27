// Impostors: vegetation baked in Blender (Poly Haven models, CC0) into atlases of side views
// (rows = variants, columns = views around the plant; albedo + camera-space normal, alpha).
// Each instance is one quad that turns around its vertical axis towards the camera, picks the two
// nearest baked views and blends them. Lit by the scene lights (receives the shadow map), casts
// shadows (the depth material faces the sun), sways in the wind, darkened by terrain shadow.
import * as THREE from 'three';
import { HEIGHTS } from './materials.js';

// per-instance attribute aImp: x = variant row, y = rotation (radians), z = tint (0..1), w = wind
const VERT_BB = /* glsl */`
  attribute vec4 aImp;
  uniform float impViews, impRows, impTime, impWind;
  varying vec2 vUvA; varying vec2 vUvB; varying float vViewMix;
  varying vec3 vBR; varying vec3 vBT; varying float vTint;
`;

function billboard() {
  return /* glsl */`
    vec3 ipos = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    float bw = length(instanceMatrix[0].xyz), bh = length(instanceMatrix[1].xyz);
    vec3 toC = cameraPosition - ipos; toC.y = 0.0;
    toC = length(toC) > 1e-4 ? normalize(toC) : vec3(0.0, 0.0, 1.0);
    vec3 bR = vec3(toC.z, 0.0, -toC.x);
    // wind: sway grows with height
    float ph = impTime * 1.3 + ipos.x * 0.07 + ipos.z * 0.05;
    float sway = impWind * aImp.w * position.y * position.y;
    vec3 bbWorld = ipos + bR * position.x * bw + vec3(0.0, position.y * bh, 0.0)
      + vec3(sin(ph), 0.0, cos(ph * 0.8)) * sway * bh * 0.03;
    // which baked views: camera azimuth relative to the plant
    float az = atan(toC.x, toC.z) - aImp.y;
    float f = fract(az / 6.28318530718) * impViews;
    float k0 = floor(f), k1 = mod(k0 + 1.0, impViews);
    vViewMix = f - k0;
    vec2 cell = vec2(1.0 / impViews, 1.0 / impRows);
    vec2 inCell = vec2(position.x + 0.5, 1.0 - position.y);
    vUvA = (vec2(k0, aImp.x) + inCell) * cell;
    vUvB = (vec2(k1, aImp.x) + inCell) * cell;
    vBR = bR; vBT = toC; vTint = aImp.z;
  `;
}

const FRAG_SAMPLE = /* glsl */`
  vec4 impA = mix(texture2D(impAlbedo, vUvA), texture2D(impAlbedo, vUvB), vViewMix);
  if (impA.a < 0.5) discard;
`;

export function impostorMaterial({ albedo, normal, views, rows, shade, wind = 1, tintAmount = 0.25, brightness = 1, upNormal = 0.2 }) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const u = {
    impAlbedo: { value: albedo }, impNormal: { value: normal },
    impViews: { value: views }, impRows: { value: rows }, impTime: shade.time, impWind: { value: wind },
    impBright: { value: brightness },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shade, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HEIGHTS + VERT_BB + '\nvarying float vTerrSh;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + billboard() + '\n vTerrSh = terrainShadow(ipos + vec3(0.0, bh * 0.6, 0.0));')
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(bbWorld, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D impAlbedo; uniform sampler2D impNormal; uniform float impBright;
        varying vec2 vUvA; varying vec2 vUvB; varying float vViewMix;
        varying vec3 vBR; varying vec3 vBT; varying float vTint; varying float vTerrSh;`)
      .replace('#include <map_fragment>', FRAG_SAMPLE + `
        diffuseColor.rgb = impA.rgb * impBright * (1.0 + (vTint - 0.5) * ${(tintAmount * 2).toFixed(3)});`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 nb = mix(texture2D(impNormal, vUvA).xyz, texture2D(impNormal, vUvB).xyz, vViewMix) * 2.0 - 1.0;
          vec3 nw = normalize(vBR * nb.x + vec3(0.0, 1.0, 0.0) * nb.y + vBT * nb.z);
          // thin leaves and blades let light through: bend their normals towards the sky
          nw = normalize(mix(nw, vec3(0.0, 1.0, 0.0), ${upNormal.toFixed(2)}));
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        }`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directDiffuse *= vTerrSh;');
  };
  m.customProgramCacheKey = () => 'impostor' + upNormal;
  return m;
}

// shadow caster: the same quad turned towards the light, alpha-tested
export function impostorDepthMaterial({ albedo, views, rows, shade, wind = 1 }) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const u = { impAlbedo: { value: albedo }, impViews: { value: views }, impRows: { value: rows }, impTime: shade.time, impWind: { value: wind } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_BB)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + billboard())
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);\ngl_Position = projectionMatrix * mvPosition;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D impAlbedo; varying vec2 vUvA; varying vec2 vUvB; varying float vViewMix;`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_SAMPLE);
  };
  m.customProgramCacheKey = () => 'impostor-depth';
  return m;
}

// unit quad: x in [-0.5, 0.5], y in [0, 1]
export function impostorQuad() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

// InstancedMesh of impostors; items: [{x, y, z, w, h, row, rot, tint, wind}]
export function impostorMesh(kind, items, capacity = items.length) {
  const mesh = new THREE.InstancedMesh(impostorQuad(), kind.material, Math.max(1, capacity));
  mesh.customDepthMaterial = kind.depth;
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 4), 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aImp', attr);
  mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  setImpostors(mesh, items);
  return mesh;
}

const _m = new THREE.Matrix4();
export function setImpostors(mesh, items) {
  const a = mesh.geometry.getAttribute('aImp');
  const n = Math.min(items.length, a.count);
  for (let i = 0; i < n; i++) {
    const t = items[i];
    _m.makeScale(t.w, t.h, 1).setPosition(t.x, t.y, t.z);
    mesh.setMatrixAt(i, _m);
    a.setXYZW(i, t.row, t.rot, t.tint, t.wind);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  a.needsUpdate = true;
}

// loads models/impostors.json and the atlases of the listed kinds
export async function loadImpostorKinds(base, names, shade, options = {}) {
  const index = await (await fetch(base + 'impostors.json')).json();
  const tex = async (url, srgb) => {
    const b = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const t = new THREE.Texture(bmp);
    t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const kinds = {};
  await Promise.all(names.map(async (name) => {
    const meta = index[name];
    const [albedo, normal] = await Promise.all([tex(`${base}${name}_albedo.webp`, true), tex(`${base}${name}_normal.webp`, false)]);
    const o = { albedo, normal, views: meta.views, rows: meta.rows, shade, ...(options[name] || {}) };
    kinds[name] = { meta, material: impostorMaterial(o), depth: impostorDepthMaterial(o) };
  }));
  return kinds;
}
