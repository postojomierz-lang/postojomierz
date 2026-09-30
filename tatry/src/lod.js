// Distance culling for instanced meshes: only the copies within maxD of the camera are drawn (small things
// such as chain links or dead logs are below a pixel further away), re-sorted when the camera has moved.
import * as THREE from 'three';

export function cullByDistance(mesh, matrices, maxD) {
  const pos = matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let at = null;
  return (cam) => {
    if (at && at.distanceToSquared(cam) < 16) return;
    at = cam.clone();
    let n = 0;
    const d2 = maxD * maxD;
    for (let j = 0; j < pos.length; j++) if (pos[j].distanceToSquared(cam) < d2) mesh.setMatrixAt(n++, matrices[j]);
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
}
