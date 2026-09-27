// Dead wood on the forest floor: fallen logs and stumps (Poly Haven scans, CC0, simplified in Blender
// with tools/blender/decimate_rocks.py) scattered through the spruce forest within reach of the trail.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { patchShading } from './materials.js';
import { rng } from './noise.js';

export async function buildDeadwood({ scene, terrain, trail, shade, isForest, free, quality }) {
  const gltf = await new GLTFLoader().loadAsync('models/deadwood.glb');
  const variants = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const mat = new THREE.MeshLambertMaterial({ map: o.material.map, color: new THREE.Color(1.1, 1.08, 1.05) });
    patchShading(mat, shade);
    o.geometry.computeBoundingBox();
    const size = new THREE.Vector3(); o.geometry.boundingBox.getSize(size);
    variants.push({ geo: o.geometry, mat, long: size.x > 2 * size.z, items: [] });
  });
  const r = rng(77), N = trail.X.length;
  const count = quality === 'low' ? 260 : 600;
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  let k = 0, guard = 0;
  while (k < count && guard++ < count * 40) {
    const i = Math.floor(r() * N);
    const d = 4 + Math.pow(r(), 1.8) * 160, a = r() * 6.283;
    const x = trail.X[i] + Math.cos(a) * d, z = trail.Z[i] + Math.sin(a) * d;
    if (!isForest(x, z) || !free(x, z)) continue;
    const n = terrain.normal(x, z, 2);
    if (n.y < 0.75) continue;
    const vi = Math.floor(r() * variants.length), v = variants[vi];
    // logs lie across or down the slope, following it; stumps stand upright
    qy.setFromAxisAngle(up, r() * 6.283);
    if (v.long) q.setFromUnitVectors(up, n).multiply(qy); else q.copy(qy);
    const s = 0.75 + r() * 0.5;
    m4.compose(new THREE.Vector3(x, terrain.height(x, z) - 0.08 * s, z), q, new THREE.Vector3(s, s, s));
    v.items.push(m4.clone());
    k++;
  }
  for (const v of variants) {
    if (!v.items.length) continue;
    const mesh = new THREE.InstancedMesh(v.geo, v.mat, v.items.length);
    v.items.forEach((m, j) => mesh.setMatrixAt(j, m));
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { count: k };
}
