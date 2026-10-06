// Mountain streams and waterfalls (OpenStreetMap, tools/prepare_water.py).
// Each stream is a ribbon laid into its bed: the water level is the lowest ground across the bed,
// never rising downstream. Flow speed and white water grow with the gradient; near waterfalls the
// water is all foam and spray drifts from the foot of the fall.
import * as THREE from 'three';
import { light, HEIGHTS } from './materials.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const NOISE = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm2(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=0.5; } return s; }
`;

export function buildStreams({ scene, terrain, meta, lakeMask, shade, skyCol, quality, onPath = () => false }) {
  const pos = [], uv = [], foamA = [], idx = [];
  const falls = meta.waterfalls || [];
  const nearFall = (x, z) => {
    let d = Infinity;
    for (const f of falls) d = Math.min(d, Math.hypot(f.x - x, f.z - z));
    return d;
  };
  const sprays = [];
  const samples = [];   // x, y, z, foam, width: for the sound of running water
  for (const s of meta.streams || []) {
    const P = s.pts, n = P.length;
    // split where the stream runs through a lake
    let seg = [];
    const flush = () => { if (seg.length > 3) ribbon(seg, s); seg = []; };
    for (let i = 0; i < n; i++) {
      if (terrain.maskAt(lakeMask, P[i][0], P[i][1]) > 0.35) flush();
      else seg.push(P[i]);
    }
    flush();
  }

  function ribbon(pts, s) {
    // drawn against the flow in OpenStreetMap now and then: the water level would stay at the bottom end's
    if (terrain.height(pts[0][0], pts[0][1]) < terrain.height(pts[pts.length - 1][0], pts[pts.length - 1][1]) - 3) pts = pts.slice().reverse();
    const n = pts.length, w0 = s.width;
    const tx = new Float32Array(n), tz = new Float32Array(n), level = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l;
      const [x, z] = pts[i], nx = -tz[i], nz = tx[i], hw = Math.max(1.5, w0);
      // lowest ground across the bed
      level[i] = Math.min(terrain.height(x, z), terrain.height(x + nx * hw, z + nz * hw), terrain.height(x - nx * hw, z - nz * hw),
        terrain.height(x + nx * hw * 0.5, z + nz * hw * 0.5), terrain.height(x - nx * hw * 0.5, z - nz * hw * 0.5));
    }
    // water never flows uphill; then smooth (an average of a falling line still falls)
    for (let i = 1; i < n; i++) level[i] = Math.min(level[i], level[i - 1]);
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let a = 0, c = 0;
      for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < n) { a += level[j]; c++; } }
      sm[i] = Math.min(a / c, level[i]);         // the average must not lift it out of its bed at a step
    }
    let dist = 0;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      if (i) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const drop = (sm[Math.max(0, i - 2)] - sm[Math.min(n - 1, i + 2)]) / 12;   // gradient over ±6 m
      const df = nearFall(pts[i][0], pts[i][1]);
      let foam = smooth(0.18, 0.7, drop);
      if (df < 35) foam = Math.max(foam, 1 - df / 45);
      const w = w0 * (1 + 0.8 * foam) * (0.85 + 0.3 * Math.sin(dist * 0.13 + w0));
      const [x, z] = pts[i], nx = -tz[i], nz = tx[i];
      // never above the ground at its own edges (a bed on a slope, a bank cut away); where it crosses a
      // footpath it runs in a culvert under it
      let y = Math.min(sm[i], terrain.height(x + nx * w / 2, z + nz * w / 2), terrain.height(x - nx * w / 2, z - nz * w / 2)) + 0.12;
      if (onPath(x, z)) y -= 0.6;
      pos.push(x + nx * w / 2, y, z + nz * w / 2, x - nx * w / 2, y, z - nz * w / 2);
      uv.push(-1, dist, 1, dist);
      foamA.push(foam, foam);
      samples.push(x, y, z, foam, w0);
      if (i) { const a = base + (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    // spray at the foot of the waterfalls this stream passes
    for (const f of falls) {
      let best = Infinity, bi = -1;
      for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i][0] - f.x, pts[i][1] - f.z); if (d < best) { best = d; bi = i; } }
      if (best > 25 || f.used) continue;
      // foot: where the foam run below the fall ends
      let k = bi;
      while (k < n - 1 && (sm[Math.max(0, k - 2)] - sm[Math.min(n - 1, k + 2)]) / 12 > 0.3 && k - bi < 40) k++;
      sprays.push({ x: pts[k][0], y: sm[k], z: pts[k][1], dx: tx[k], dz: tz[k], big: s.width > 1 || !s.intermittent });
      f.used = true;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(foamA, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      ${HEIGHTS}
      attribute vec2 aUv; attribute float aFoam;
      varying vec2 vUv; varying float vFoam; varying vec3 vWorld; varying float vSh;
      void main(){
        vUv = aUv; vFoam = aFoam;
        vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
        vSh = terrainShadow(wp.xyz + vec3(0.0, 0.5, 0.0));
        // far away the terrain is drawn with a coarse mesh that bridges the narrow stream beds of the
        // 1 m lidar: pull the water a little towards the viewer so it shows in its bed
        vec3 toCam = cameraPosition - wp.xyz; float dc = length(toCam);
        wp.xyz += toCam / dc * clamp(dc * 0.012, 0.2, 5.0);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 sunCol; uniform vec3 ambCol; uniform vec3 skyCol;
      uniform vec3 sunDir; uniform float time;
      varying vec2 vUv; varying float vFoam; varying vec3 vWorld; varying float vSh;
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        float across = vUv.x, along = vUv.y;
        float speed = mix(0.9, 3.5, vFoam);
        vec2 p = vec2(across * 1.6, along * 0.45 - time * speed);
        float streak = fbm2(p * vec2(1.0, 0.6));
        float fine = vnoise(vec2(across * 7.0, along * 2.2 - time * speed * 3.0));
        // ripples: surface normal from the flowing noise
        float e = 0.15;
        float h0 = fbm2(vec2(across * 2.0, along * 0.9 - time * speed * 1.2));
        float h1 = fbm2(vec2(across * 2.0 + e, along * 0.9 - time * speed * 1.2));
        float h2 = fbm2(vec2(across * 2.0, along * 0.9 + e - time * speed * 1.2));
        vec3 N = normalize(vec3((h0 - h1) * 1.5, 1.0, (h0 - h2) * 1.5));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 lit = ambCol + sunCol * vSh * max(sunDir.y, 0.0);
        vec3 bed = vec3(0.05, 0.06, 0.05) * lit;                 // clear shallow water over dark stones
        vec3 water = mix(bed, skyCol * 0.9, fres);
        float spec = pow(max(dot(reflect(-V, N), sunDir), 0.0), 120.0) * 3.0 * vSh;
        // white water: foam grows with the gradient, torn by the flow; a bit of it along the banks
        float bank = smoothstep(0.55, 1.0, abs(across));
        float foam = clamp(vFoam * (0.25 + 1.1 * streak) + (fine - 0.6) * 1.4 * max(vFoam, 0.25) + bank * 0.25 * streak, 0.0, 1.0);
        foam = smoothstep(0.15, 0.85, foam);   // tear the white water into sheets with dark water between
        vec3 foamCol = vec3(0.92, 0.94, 0.95) * (ambCol * 1.2 + sunCol * vSh * max(sunDir.y, 0.15));
        vec3 col = mix(water + sunCol * spec, foamCol, foam);
        float alpha = (1.0 - smoothstep(0.62, 1.0, abs(across))) * mix(0.78, 1.0, foam);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, shade, { sunCol: light.sunCol, ambCol: light.ambCol, sunDir: light.sunDir, time: light.time, skyCol });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  scene.add(mesh);

  // spray: soft particles drifting up and downstream from the foot of each waterfall
  const PER = { low: 200, mid: 300, high: 500, ultra: 800 }[quality] ?? 500;
  const sp = [], seed = [];
  for (const s of sprays) for (let k = 0; k < PER * (s.big ? 1 : 0.4); k++) {
    sp.push(s.x, s.y, s.z); seed.push(Math.random(), Math.random(), Math.random(), s.dx * 0 + Math.atan2(s.dx, s.dz));
  }
  let spray = null;
  if (sp.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { time: light.time, sunCol: light.sunCol, ambCol: light.ambCol, px: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec4 aSeed; uniform float time; uniform float px; varying float vA;
        void main(){
          float t = fract(time * (0.22 + 0.2 * aSeed.x) + aSeed.y);
          float ang = aSeed.w + (aSeed.z - 0.5) * 2.4;
          vec3 dir = vec3(sin(ang), 0.0, cos(ang));
          vec3 p = position + dir * (1.0 + 7.0 * t * (0.4 + aSeed.x)) + vec3(0.0, 0.3 + 3.5 * t * (0.3 + aSeed.z), 0.0);
          vA = sin(t * 3.14159) * 0.10;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(px * (3.0 + 9.0 * t) * 60.0 / -mv.z, 256.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 sunCol; uniform vec3 ambCol; varying float vA;
        void main(){
          #include <logdepthbuf_fragment>
          vec2 d = gl_PointCoord - 0.5; float r = dot(d, d);
          if (r > 0.25) discard;
          gl_FragColor = vec4(vec3(0.95) * (ambCol * 1.3 + sunCol * 0.6), vA * exp(-r * 14.0));
        }`,
    });
    spray = new THREE.Points(g, m);
    spray.frustumCulled = false;
    spray.renderOrder = 2;
    scene.add(spray);
  }
  return {
    mesh, spray, sprays, samples: Float32Array.from(samples),
    setPixelRatio(pr, h) { if (spray) spray.material.uniforms.px.value = pr * h / 900; },
  };
}
