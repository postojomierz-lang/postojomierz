// The figure turning in 3D for the look editor (planner): built on its own (vite.figure.config.js) as
// ../rysy/figura.js, loaded only when the editor opens, so the planner does not carry three.js. It turns
// slowly by itself; dragged, it turns with the finger and then goes on by itself after a while.
import * as THREE from 'three';
import { buildFigure } from './figure3d.js';

export function mountFigure(container, look) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf2f5ff, 0x8a7a66, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(1.5, 3, 2.5);
  scene.add(sun);
  // a round patch of ground under the feet
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshLambertMaterial({ color: 0x9aa58a }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 1.1, 4.2);
  camera.lookAt(0, 0.92, 0);
  const turn = new THREE.Group();
  scene.add(turn);
  let fig = null, angle = 0.5, drag = null, idle = 0, raf = 0, last = performance.now();

  function set(l) {
    if (fig) turn.remove(fig.object);
    fig = buildFigure(l);
    turn.add(fig.object);
  }
  function size() {
    const w = container.clientWidth || 200, h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (!drag && (idle += dt) > 1.5) angle += dt * 0.5;
    turn.rotation.y = angle;
    renderer.render(scene, camera);
  }
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, a: angle }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => { if (drag) angle = drag.a + (e.clientX - drag.x) * 0.012; });
  const up = () => { drag = null; idle = 0; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  const ro = new ResizeObserver(size);
  ro.observe(container);

  set(look);
  size();
  raf = requestAnimationFrame(frame);
  return {
    update: set,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); canvas.remove(); },
  };
}
