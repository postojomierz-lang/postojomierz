// Temporal anti-aliasing: each frame the picture is shifted by a different fraction of a pixel (a Halton
// sequence) and blended with the frames before it, brought to where they are now by the camera's move
// (reprojection from the depth buffer). Thin things the multisampling cannot hold still (far needles,
// grass, wires of light on the ridges, the noise of the ambient occlusion) settle to their true coverage
// instead of sparkling. Against ghosting: the old colour is clipped to the spread of the new one around
// the pixel (variance clipping in YCoCg), the history is read with a sharp Catmull-Rom filter, and it
// weighs less the faster the view moves; a jump of the camera starts it afresh.
// Three passes in the composer: jitter (before the scene), tap (after it: the jitter off again and the
// depth noted) and resolve (the blend, into its own history, then copied on).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const JITTER = Array.from({ length: 8 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const RESOLVE = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tColor, tHistory, tDepth;
  uniform float logFar, reset;
  uniform vec2 tanFov, jit, texel;
  uniform mat4 camWorld, prevVP;
  float viewW(vec2 uv) { return exp2(texture2D(tDepth, uv).x * logFar) - 1.0; }
  float maxc(vec3 c) { return max(c.r, max(c.g, c.b)); }
  // blending in a compressed range: a bright glint does not outweigh its neighbours (Karis)
  vec3 tm(vec3 c) { return c / (1.0 + maxc(c)); }
  vec3 itm(vec3 c) { return c / max(1e-4, 1.0 - maxc(c)); }
  vec3 ycc(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
  vec3 rgb(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
  vec3 cur(vec2 uv) { return ycc(tm(max(texture2D(tColor, uv).rgb, 0.0))); }
  // the history at a point between texels, sharp (Catmull-Rom from five bilinear reads)
  vec3 history(vec2 uv) {
    vec2 sp = uv / texel, tp = floor(sp - 0.5) + 0.5, f = sp - tp;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2, t0 = (tp - 1.0) * texel, t3 = (tp + 2.0) * texel, t12 = (tp + w2 / w12) * texel;
    vec3 r = texture2D(tHistory, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y) + texture2D(tHistory, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
      + texture2D(tHistory, t12).rgb * (w12.x * w12.y) + texture2D(tHistory, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
      + texture2D(tHistory, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
    float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
    return max(r / ws, 0.0);
  }
  vec3 clipBox(vec3 mn, vec3 mx, vec3 q) {
    vec3 c = 0.5 * (mx + mn), e = 0.5 * (mx - mn) + 1e-4, v = q - c, a = abs(v / e);
    float m = max(a.x, max(a.y, a.z));
    return m > 1.0 ? c + v / m : q;
  }
  void main() {
    // the 3x3 around the pixel: its spread (mean and deviation) and the nearest depth (edges move with the front)
    vec3 m1 = vec3(0.0), m2 = vec3(0.0), mn = vec3(1e9), mx = vec3(-1e9), c0 = vec3(0.0);
    float w = 1e9; vec2 wuv = vUv;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * texel;
      vec3 c = cur(uv);
      if (x == 0 && y == 0) c0 = c;
      m1 += c; m2 += c * c; mn = min(mn, c); mx = max(mx, c);
      float d = viewW(uv);
      if (d < w) { w = d; wuv = uv; }
    }
    m1 /= 9.0; m2 /= 9.0;
    vec3 sd = sqrt(abs(m2 - m1 * m1));
    vec3 lo = max(mn, m1 - 1.1 * sd), hi = min(mx, m1 + 1.1 * sd);
    // where this point was in the last frame (the camera's move; the jitter taken out)
    vec2 u0 = vUv - jit;
    vec4 wp = camWorld * vec4((u0 * 2.0 - 1.0) * tanFov * w, -w, 1.0);
    vec4 pc = prevVP * wp;
    vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
    bool off = reset > 0.5 || pc.w <= 0.0 || any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)));
    vec3 res = c0;
    if (!off) {
      vec3 h = clipBox(lo, hi, ycc(tm(history(puv))));
      float px = length((puv - vUv) / texel);
      float a = mix(0.08, 0.3, clamp(px / 12.0, 0.0, 1.0));
      res = mix(h, c0, a);
    }
    gl_FragColor = vec4(itm(max(rgb(res), 0.0)), 1.0);
  }
`;

export function buildTAA(camera) {
  const S = { depth: null, frame: 0, jit: new THREE.Vector2(), saved: new THREE.Matrix4(), savedInv: new THREE.Matrix4(), jittered: false,
    prevVP: new THREE.Matrix4(), prevPos: new THREE.Vector3(), reset: true, w: 0, h: 0 };
  const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  let histA = new THREE.WebGLRenderTarget(1, 1, opts), histB = new THREE.WebGLRenderTarget(1, 1, opts);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tHistory: { value: null }, tDepth: { value: null }, logFar: { value: 1 }, reset: { value: 1 },
      tanFov: { value: new THREE.Vector2(1, 1) }, jit: { value: new THREE.Vector2() }, texel: { value: new THREE.Vector2() },
      camWorld: { value: new THREE.Matrix4() }, prevVP: { value: new THREE.Matrix4() } },
    vertexShader: VERT, fragmentShader: RESOLVE, depthTest: false, depthWrite: false,
  });
  const copy = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: VERT,
    fragmentShader: 'varying vec2 vUv; uniform sampler2D t; void main(){ gl_FragColor = texture2D(t, vUv); }', depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(mat), copyQuad = new FullScreenQuad(copy);

  function unjitter() {
    if (!S.jittered) return;
    camera.projectionMatrix.copy(S.saved); camera.projectionMatrixInverse.copy(S.savedInv); S.jittered = false;
  }
  class Jitter extends Pass {
    constructor() { super(); this.needsSwap = false; }
    render(renderer, writeBuffer, readBuffer) {
      unjitter();
      camera.updateMatrixWorld();
      // the camera jumped (a new place, the drone, a photo): no history to blend with
      if (camera.position.distanceTo(S.prevPos) > 30) S.reset = true;
      const [jx, jy] = JITTER[S.frame++ % JITTER.length], W = readBuffer.width, H = readBuffer.height;
      S.saved.copy(camera.projectionMatrix); S.savedInv.copy(camera.projectionMatrixInverse);
      camera.projectionMatrix.elements[8] += (2 * jx) / W; camera.projectionMatrix.elements[9] += (2 * jy) / H;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      S.jittered = true;
      S.jit.set(-jx / W, -jy / H);                       // how far the picture moved, in uv
    }
  }
  class Tap extends Pass {
    constructor() { super(); this.needsSwap = false; }
    render(renderer, writeBuffer, readBuffer) { unjitter(); S.depth = readBuffer.depthTexture; }
  }
  class Resolve extends Pass {
    setSize(w, h) {
      if (w === S.w && h === S.h) return;
      S.w = w; S.h = h; histA.setSize(w, h); histB.setSize(w, h); S.reset = true;
    }
    render(renderer, writeBuffer, readBuffer) {
      unjitter();
      const u = mat.uniforms, ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      u.tColor.value = readBuffer.texture; u.tHistory.value = histA.texture; u.tDepth.value = S.depth;
      u.logFar.value = Math.log2(camera.far + 1); u.tanFov.value.set(ty * camera.aspect, ty);
      u.jit.value.copy(S.jit); u.texel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
      u.camWorld.value.copy(camera.matrixWorld); u.prevVP.value.copy(S.prevVP);
      u.reset.value = S.reset || !S.depth ? 1 : 0;
      renderer.setRenderTarget(histB); quad.render(renderer);
      copy.uniforms.t.value = histB.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); copyQuad.render(renderer);
      [histA, histB] = [histB, histA];
      S.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      S.prevPos.copy(camera.position);
      S.reset = false;
    }
  }
  return { jitter: new Jitter(), tap: new Tap(), resolve: new Resolve(), reset: () => { S.reset = true; }, get frame() { return S.frame; } };
}
