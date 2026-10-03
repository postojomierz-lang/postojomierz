// Trout jumping for insects on the lakes near the trail: a series of three or four jumps close to each
// other, each an arc out of the water with a splash and rings spreading on the surface.
import * as THREE from 'three';

function fishGeometry() {
  // a slim body (a lathe along the length), a forked tail fin
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.055 * (1 - 0.35 * t), t * 0.42 - 0.2)); }
  const body = new THREE.LatheGeometry(pts, 10);
  body.rotateX(Math.PI / 2);
  body.scale(0.75, 1, 1);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.2, 0, 0.07, 0.3, 0, -0.07, 0.3], 3));
  tail.computeVertexNormals();
  return { body, tail };
}

export function buildFish({ scene, lakes, groundAt }) {
  const { body, tail } = fishGeometry();
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a8670, emissive: 0x15140f, side: THREE.DoubleSide });
  const fish = new THREE.Group();
  fish.add(new THREE.Mesh(body, mat), new THREE.Mesh(tail, mat));
  fish.visible = false; scene.add(fish);
  // the place of the scene: what the binoculars follow
  const spot = new THREE.Object3D(); scene.add(spot);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.6, depthWrite: false });
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), ringMat.clone());
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); rings.push({ m, t: 9 });
  }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(30 * 3), 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xeef4f8, size: 0.05, transparent: true, opacity: 0.9, depthWrite: false }));
  drops.visible = false; drops.frustumCulled = false; scene.add(drops);
  const dropV = new Float32Array(30 * 3);

  let ringN = 0, show = null;
  function ring(x, y, z) { const r = rings[ringN++ % rings.length]; r.m.position.set(x, y + 0.02, z); r.t = 0; r.m.visible = true; }
  function splash(x, y, z) {
    ring(x, y, z);
    const p = dropGeo.attributes.position.array;
    for (let i = 0; i < 30; i++) {
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      const a = Math.random() * 6.283, v = 0.6 + Math.random() * 1.2;
      dropV[i * 3] = Math.cos(a) * v; dropV[i * 3 + 1] = 1.5 + Math.random() * 2; dropV[i * 3 + 2] = Math.sin(a) * v;
    }
    dropGeo.attributes.position.needsUpdate = true; drops.visible = true; show.dropT = 0;
  }
  const inside = (ring, x, z) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  // a place on a lake 25-160 m from the camera, at least 6 m from the shore, where the camera can see
  // the water; null if there is none
  function place(cam) {
    const c = cam.position;
    for (const l of lakes) {
      for (let k = 0; k < 60; k++) {
        const a = Math.random() * 6.283, d = 25 + Math.random() * 135, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (!inside(l.ring, x, z)) continue;
        let shore = true;
        for (let q = 0; q < 6 && shore; q++) { const b = q * 1.047; if (!inside(l.ring, x + Math.cos(b) * 6, z + Math.sin(b) * 6)) shore = false; }
        if (!shore) continue;
        // the water there in sight: the ground every ~2.5 m of the way, the bank right by the water included
        // (a coarser check let a bank fill the binoculars with a brown wall)
        let seen = true;
        const steps = Math.max(12, Math.ceil(d / 2.5));
        for (let s = 1; s < steps && seen; s++) {
          const f = s / steps, px = c.x + (x - c.x) * f, pz = c.z + (z - c.z) * f, g = groundAt(px, pz);
          if (g != null && g > c.y + (l.level + 0.6 - c.y) * f + 0.4) seen = false;
        }
        if (seen) return { x, z, y: l.level };
      }
    }
    return null;
  }
  // starts a series of jumps near the camera; returns the focus for the binoculars, or null
  function start(cam) {
    if (show) return null;
    const at = place(cam);
    if (!at) return null;
    spot.position.set(at.x, at.y + 0.3, at.z);
    show = { at, jumps: 3 + Math.floor(Math.random() * 2), next: 1.4, j: null, dropT: 9 };
    return { objs: [spot], size: 2.2, dur: 9 };
  }
  function update(dt) {
    for (const r of rings) {
      if (r.t > 3) continue;
      r.t += dt; const k = r.t / 3;
      r.m.scale.setScalar(0.15 + k * 1.6); r.m.material.opacity = 0.6 * (1 - k);
      if (r.t > 3) r.m.visible = false;
    }
    if (!show) return;
    if (drops.visible) {
      show.dropT += dt;
      const p = dropGeo.attributes.position.array;
      for (let i = 0; i < 30; i++) { dropV[i * 3 + 1] -= 9.8 * dt; p[i * 3] += dropV[i * 3] * dt; p[i * 3 + 1] += dropV[i * 3 + 1] * dt; p[i * 3 + 2] += dropV[i * 3 + 2] * dt; }
      dropGeo.attributes.position.needsUpdate = true;
      if (show.dropT > 0.8) drops.visible = false;
    }
    const S = show;
    if (!S.j) {
      S.next -= dt;
      if (S.next > 0) return;
      if (S.jumps-- <= 0) { show = null; return; }
      const a = Math.random() * 6.283, x = S.at.x + (Math.random() - 0.5) * 5, z = S.at.z + (Math.random() - 0.5) * 5;
      const len = 0.9 + Math.random() * 0.8;
      S.j = { t: 0, dur: 0.55 + Math.random() * 0.2, x0: x, z0: z, dx: Math.cos(a) * len, dz: Math.sin(a) * len, h: 0.35 + Math.random() * 0.45, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) };   // the nose (-z) along the jump
      splash(x, S.at.y, z);
      fish.visible = true;
    }
    const J = S.j;
    J.t += dt;
    const f = Math.min(1, J.t / J.dur);
    fish.position.set(J.x0 + J.dx * f, S.at.y + 4 * J.h * f * (1 - f), J.z0 + J.dz * f);
    // nose up out of the water, nose down into it
    fish.rotation.set(0, 0, 0);
    fish.rotateY(J.yaw); fish.rotateX((1 - 2 * f) * 1.0);
    if (f >= 1) {
      fish.visible = false; splash(J.x0 + J.dx, S.at.y, J.z0 + J.dz);
      S.j = null; S.next = 1.2 + Math.random() * 1.6;
    }
  }
  return { start, update, get active() { return !!show; } };
}
