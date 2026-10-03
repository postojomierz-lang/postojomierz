// Falling weather around the camera: rain as thin streaks, snow as drifting flakes, both in a box that
// travels with the camera (the drops wrap around inside it, all on the GPU), leaning with the wind;
// and, in a thunderstorm, lightning: a jagged bolt somewhere in the distance, the sky flashing, and the
// thunder following as late as the distance makes it (the sound is played by sound.js).
import * as THREE from 'three';

const COUNT = { low: [1200, 1000], mid: [3000, 2200], high: [6000, 4000], ultra: [9000, 6000] };

function field(n, box, height, points) {
  const g = new THREE.BufferGeometry();
  const k = points ? 1 : 2;
  const seed = new Float32Array(n * k * 4), end = new Float32Array(n * k), pos = new Float32Array(n * k * 3);
  for (let i = 0; i < n; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    for (let j = 0; j < k; j++) { seed.set(s, (i * k + j) * 4); end[i * k + j] = j; }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));      // unused (the shader places them)
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('end', new THREE.BufferAttribute(end, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);         // never culled
  return g;
}

const VERT = /* glsl */`
  uniform float time; uniform vec3 cam; uniform vec3 boxS; uniform vec3 vel; uniform float amount; uniform float len; uniform float size;
  attribute vec4 seed; attribute float end;
  varying float vEnd; varying float vFade;
  void main() {
    if (seed.w > amount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    vec3 v = vel;
    #ifdef SNOW
      v.xz += vec2(sin(time * 0.7 + seed.x * 40.0), cos(time * 0.6 + seed.z * 40.0)) * 0.45;
    #endif
    vec3 origin = cam - boxS * vec3(0.5, 0.45, 0.5);
    vec3 p = mod(seed.xyz * boxS + vel * time - origin, boxS) + origin;
    #ifdef SNOW
      p.xz += vec2(sin(time * 0.7 + seed.x * 40.0), cos(time * 0.6 + seed.z * 40.0)) * 0.6;
    #endif
    p -= normalize(v) * len * end;                    // the streak's tail
    vEnd = end;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vFade = clamp((-mv.z - 0.4) / 1.5, 0.0, 1.0) * clamp(1.0 - length(p.xz - cam.xz) / (boxS.x * 0.5), 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * 240.0 / max(-mv.z, 0.5);
  }`;
const FRAG = /* glsl */`
  uniform vec3 col; uniform float alpha;
  varying float vEnd; varying float vFade;
  void main() {
    float a = alpha * vFade;
    #ifdef SNOW
      vec2 c = gl_PointCoord - 0.5;
      a *= smoothstep(0.5, 0.2, length(c));
    #else
      a *= 1.0 - vEnd * 0.8;
    #endif
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

export function buildWeather({ scene, quality = 'mid', groundAt, onThunder = () => {} }) {
  const [nRain, nSnow] = COUNT[quality] || COUNT.mid;
  const time = { value: 0 }, cam = { value: new THREE.Vector3() };
  const mat = (snow) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false,
    defines: snow ? { SNOW: 1 } : {},
    uniforms: {
      time, cam, amount: { value: 0 },
      boxS: { value: snow ? new THREE.Vector3(34, 20, 34) : new THREE.Vector3(44, 26, 44) },
      vel: { value: new THREE.Vector3(0, snow ? -1.3 : -9, 0) },
      len: { value: snow ? 0 : 1.1 }, size: { value: snow ? 0.06 : 1 },
      col: { value: snow ? new THREE.Color(0.95, 0.96, 1) : new THREE.Color(0.72, 0.76, 0.82) },
      alpha: { value: snow ? 0.9 : 0.55 },
    },
  });
  const rain = new THREE.LineSegments(field(nRain, 44, 26, false), mat(false));
  const snow = new THREE.Points(field(nSnow, 34, 20, true), mat(true));
  rain.frustumCulled = snow.frustumCulled = false;
  rain.renderOrder = snow.renderOrder = 5;
  rain.visible = snow.visible = false;
  scene.add(rain, snow);

  // lightning bolt: rebuilt for every strike
  const boltMat = new THREE.LineBasicMaterial({ color: 0xf2f4ff, transparent: true, opacity: 1, fog: false });
  const bolt = new THREE.LineSegments(new THREE.BufferGeometry(), boltMat);
  bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);

  const st = { rain: 0, snow: 0, storm: 0, wind: 1, windDir: new THREE.Vector2(0.8, 0.6).normalize(), next: 4, flash: 0, boltT: 0, flicker: [] };

  // in front of the viewer, so that it is seen, mostly 1-4.5 km away
  function strike(c, fwd) {
    const a0 = fwd ? Math.atan2(fwd.z, fwd.x) : Math.random() * Math.PI * 2;
    const a = a0 + (Math.random() - 0.5) * 1.2, d = 800 + Math.random() * 2400;
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    const g = groundAt(x, z);
    const y0 = (g ?? c.y) , y1 = Math.max(y0, c.y) + 1400;
    // a jagged main channel with a couple of branches
    const pts = [], w = Math.max(3, d * 0.0022);
    const channel = (px, py, pz, toY, jitter, depth) => {
      let X = px, Y = py, Z = pz;
      while (Y > toY) {
        const nY = Math.max(toY, Y - 40 - Math.random() * 90);
        const nX = X + (Math.random() - 0.5) * jitter, nZ = Z + (Math.random() - 0.5) * jitter;
        // five strands, spread with the distance: a single line is a hair at that distance on a phone
        for (const o of [0, w, -w, 2 * w, -2 * w]) pts.push(X + o, Y, Z - o, nX + o, nY, nZ - o);
        if (depth < 1 && Math.random() < 0.12) channel(nX, nY, nZ, nY - 200 - Math.random() * 300, jitter * 0.8, depth + 1);
        X = nX; Y = nY; Z = nZ;
      }
    };
    channel(x, y1, z, y0, 90, 0);
    bolt.geometry.dispose();
    bolt.geometry = new THREE.BufferGeometry();
    bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    st.boltT = 0.9;
    st.flicker = [0, 0.07, 0.16];                     // on, off, on again
    st.flashPeak = 0.8 + 0.8 * Math.max(0, 1 - d / 4500);
    onThunder(d);
  }

  const lastFwd = new THREE.Vector3(0, 0, -1);
  function update(dt, c, fwd) {
    if (fwd) lastFwd.copy(fwd);
    time.value += dt; cam.value.copy(c);
    const wv = st.windDir.clone().multiplyScalar(0.8 * st.wind);
    rain.material.uniforms.vel.value.set(wv.x * 2.2, -9, wv.y * 2.2);
    snow.material.uniforms.vel.value.set(wv.x * 1.3, -1.2, wv.y * 1.3);
    rain.material.uniforms.amount.value = st.rain;
    snow.material.uniforms.amount.value = st.snow;
    rain.visible = st.rain > 0.01; snow.visible = st.snow > 0.01;
    // lightning
    if (st.storm > 0) {
      st.next -= dt;
      if (st.next <= 0) { strike(c, fwd); st.next = (5 + Math.random() * 12) / st.storm; }
    }
    if (st.boltT > 0) {
      // on, off, on again: long enough phases to be seen at 10 frames a second too
      const age = 0.9 - st.boltT;
      const on = age < 0.1 || (age > 0.17 && age < 0.32) || (age > 0.4 && age < 0.58) || age > 0.68;
      bolt.visible = on; boltMat.opacity = Math.min(1, st.boltT / 0.2);
      st.flash = on ? st.flashPeak * Math.min(1, st.boltT / 0.25) : st.flash * 0.5;
      st.boltT -= dt;
      if (st.boltT <= 0) bolt.visible = false;
    } else st.flash *= Math.pow(0.02, dt);
  }

  // rain / snow: 0 .. 1; storm: 0 .. 1 (how often it strikes); wind: the same factor as the grass'
  function set({ rain: r = 0, snow: s = 0, storm = 0, wind = 1 } = {}) {
    st.rain = r; st.snow = s; st.wind = wind;
    if (storm > 0 && st.storm === 0) st.next = 3 + Math.random() * 5;
    st.storm = storm;
  }
  return { update, set, get flash() { return st.flash; }, strike: () => strike(cam.value, lastFwd) };
}
