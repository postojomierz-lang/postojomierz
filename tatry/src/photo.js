// A photo of the view (📷): the frame without the buttons and labels, rendered once at a high resolution
// (about 2400 px on the long side, even on a phone that walks at a low one) with the full finish (bloom,
// filmic grade, vignette); or a 180° panorama, put together from 18 narrow frames turned 10° apart
// (a cylindrical projection: the horizon stays straight). Then a preview to save or share.
import * as THREE from 'three';

const CSS = `
#ph-menu,#ph-view{position:fixed;inset:0;z-index:9100;display:flex;align-items:center;justify-content:center;background:rgba(10,12,14,.6)}
#ph-menu[hidden],#ph-view[hidden]{display:none}
#ph-menu .box,#ph-view .box{background:rgba(24,28,32,.96);color:#fff;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;
  font:14px system-ui,sans-serif;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px)}
#ph-menu button,#ph-view button,#ph-view a{background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:10px;padding:10px 14px;font:inherit;
  text-align:left;cursor:pointer;text-decoration:none}
#ph-menu small{opacity:.7}
#ph-view img{max-width:calc(100vw - 52px);max-height:calc(100vh - 150px);border-radius:8px;object-fit:contain;background:#000}
#ph-view .row{display:flex;gap:8px;flex-wrap:wrap}
#ph-busy{position:fixed;inset:0;z-index:9101;display:flex;align-items:center;justify-content:center;color:#fff;font:600 16px system-ui;background:rgba(0,0,0,.35)}
`;

// grade: the colour-grade pass, whose vignette is off for the panorama (each narrow frame would darken its edges: stripes)
export function setupPhoto({ button, renderer, composer, camera, grade = null, beforeRender = () => {}, restore = () => {}, name = 'Szlakownik' }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const menu = document.createElement('div'); menu.id = 'ph-menu'; menu.hidden = true;
  menu.innerHTML = `<div class="box"><b>📷 Zdjęcie widoku</b>
    <button data-k="photo">📷 Zdjęcie<br><small>ten kadr, bez przycisków, w wysokiej rozdzielczości</small></button>
    <button data-k="pano">🌄 Panorama 180°<br><small>szeroki widok wokół, sklejony z 18 ujęć</small></button>
    <button data-k="x">Anuluj</button></div>`;
  const view = document.createElement('div'); view.id = 'ph-view'; view.hidden = true;
  document.body.append(menu, view);
  button.addEventListener('click', () => { menu.hidden = false; });
  menu.addEventListener('click', (e) => {
    const k = e.target.closest('button') && e.target.closest('button').dataset.k;
    if (!k && e.target !== menu) return;
    menu.hidden = true;
    if (k === 'photo' || k === 'pano') shoot(k);
  });

  // render at w x h (device pixels), the camera turned by `turn` radians about the vertical
  function frame(w, h, fov, aspect) {
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    composer.setPixelRatio(1); composer.setSize(w, h);
    camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    beforeRender();
    composer.render();
  }
  async function shoot(kind) {
    const busy = document.createElement('div'); busy.id = 'ph-busy'; busy.textContent = kind === 'pano' ? 'Składam panoramę…' : 'Robię zdjęcie…';
    document.body.appendChild(busy);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    const saved = { pr: renderer.getPixelRatio(), fov: camera.fov, aspect: camera.aspect, q: camera.quaternion.clone(), vig: grade && grade.uniforms.vignette.value };
    if (grade && kind === 'pano') grade.uniforms.vignette.value = 0;
    const W = innerWidth, H = innerHeight;
    let canvas;
    try {
      if (kind === 'photo') {
        const k = 2400 / Math.max(W, H);
        const w = Math.round(W * k), h = Math.round(H * k);
        frame(w, h, saved.fov, saved.aspect);
        canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);      // read in the same task as the render
      } else {
        // 18 slices of 10° from -90° to +90° of the view, each as tall as the photo; the vertical angle as in
        // a landscape frame (60°), the horizon level
        const N = 18, slice = THREE.MathUtils.degToRad(10), vfov = 60, h = 1400;
        const aspect = Math.tan(slice / 2) / Math.tan(THREE.MathUtils.degToRad(vfov / 2));
        const sw = Math.round(h * aspect);
        canvas = document.createElement('canvas'); canvas.width = sw * N; canvas.height = h;
        const g = canvas.getContext('2d');
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(saved.q);
        const yaw0 = Math.atan2(-fwd.x, -fwd.z);
        for (let i = 0; i < N; i++) {
          camera.quaternion.setFromEuler(new THREE.Euler(0, yaw0 + (N / 2 - 0.5 - i) * slice, 0, 'YXZ'));
          frame(sw, h, vfov, aspect);
          g.drawImage(renderer.domElement, 0, 0, sw, h, i * sw, 0, sw, h);
        }
      }
    } finally {
      if (grade) grade.uniforms.vignette.value = saved.vig;
      camera.fov = saved.fov; camera.aspect = saved.aspect; camera.quaternion.copy(saved.q); camera.updateProjectionMatrix();
      renderer.setPixelRatio(saved.pr); composer.setPixelRatio(saved.pr);
      renderer.setSize(W, H); composer.setSize(W, H);
      restore();
      busy.remove();
    }
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    show(blob, kind);
  }
  function show(blob, kind) {
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const file = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}-${kind === 'pano' ? 'panorama-' : ''}${date}.jpg`;
    const canShare = navigator.canShare && navigator.canShare({ files: [new File([blob], file, { type: 'image/jpeg' })] });
    view.innerHTML = `<div class="box"><img src="${url}" alt="">
      <div class="row"><a download="${file}" href="${url}">💾 Zapisz</a>${canShare ? '<button data-k="share">↗ Udostępnij</button>' : ''}<button data-k="x">✕ Zamknij</button></div></div>`;
    view.hidden = false;
    view.onclick = async (e) => {
      const k = e.target.closest('button') && e.target.closest('button').dataset.k;
      if (k === 'share') { try { await navigator.share({ files: [new File([blob], file, { type: 'image/jpeg' })], title: name }); } catch (err) { /* cancelled */ } return; }
      if (k === 'x' || e.target === view) { view.hidden = true; URL.revokeObjectURL(url); }
    };
  }
}
