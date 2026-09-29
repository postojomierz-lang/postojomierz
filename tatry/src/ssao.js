// Screen-space ambient occlusion from the depth buffer: contact shade at the foot of rocks, trees and
// grass, in gullies and under overhangs. The scene uses a logarithmic depth buffer
// (depth = log2(1 + w) / log2(far + 1)), which the stock SSAO/GTAO passes of three.js cannot read, so
// the view distance is decoded here and the normals are rebuilt from the depth itself.
// Two steps: occlusion at half resolution (hemisphere samples around the normal), then a depth-aware
// blur that darkens the colour, fading out with distance (beyond ~250 m it means nothing).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const DECODE = /* glsl */`
  uniform sampler2D tDepth; uniform float logFar; uniform vec2 tanFov;
  float viewW(vec2 uv) { return exp2(texture2D(tDepth, uv).x * logFar) - 1.0; }
  vec3 viewPos(vec2 uv, float w) { return vec3((uv * 2.0 - 1.0) * tanFov * w, -w); }
`;

const AO_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform vec2 texel; uniform float samples, radius, frame;
  ${DECODE}
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    float w = viewW(vUv);
    if (w > 300.0) { gl_FragColor = vec4(1.0); return; }
    vec3 P = viewPos(vUv, w);
    // normal from the depth: the neighbour on the nearer side in each direction (no smearing over edges)
    vec3 pr = viewPos(vUv + vec2(texel.x, 0.0), viewW(vUv + vec2(texel.x, 0.0)));
    vec3 pl = viewPos(vUv - vec2(texel.x, 0.0), viewW(vUv - vec2(texel.x, 0.0)));
    vec3 pu = viewPos(vUv + vec2(0.0, texel.y), viewW(vUv + vec2(0.0, texel.y)));
    vec3 pd = viewPos(vUv - vec2(0.0, texel.y), viewW(vUv - vec2(0.0, texel.y)));
    vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
    vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
    vec3 N = normalize(cross(dx, dy));
    if (dot(N, P) > 0.0) N = -N;
    // world radius: small near the eye (grass, stones), larger further away (boulders, gullies)
    float R = radius * (1.0 + w * 0.035);
    float rnd = ign(gl_FragCoord.xy + frame * 7.0) * 6.2831853;
    vec3 t = normalize(abs(N.y) < 0.9 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(N, t);
    float occ = 0.0;
    for (float i = 0.0; i < 32.0; i++) {
      if (i >= samples) break;
      // spiral over the hemisphere, denser near the centre
      float f = (i + 0.5) / samples;
      float a = rnd + i * 2.39996323;
      float r = sqrt(f);
      vec3 dir = t * cos(a) * r + b * sin(a) * r + N * sqrt(max(0.0, 1.0 - f)) ;
      vec3 S = P + dir * R * mix(0.25, 1.0, f);
      vec2 suv = (S.xy / (-S.z) / tanFov) * 0.5 + 0.5;
      if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
      float sw = viewW(suv);
      // the surface there is in front of the sample point: occluded (unless it is far in front)
      float dz = (-S.z) - sw;
      occ += step(0.02 + w * 0.002, dz) * smoothstep(0.0, 1.0, R / max(abs(w - sw), 1e-3));
    }
    float ao = 1.0 - occ / samples;
    gl_FragColor = vec4(ao, w, 0.0, 1.0);
  }
`;

const COMBINE_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tDiffuse; uniform sampler2D tAO; uniform vec2 aoTexel; uniform float strength, show;
  ${DECODE}
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float w = viewW(vUv);
    if (w > 300.0) { gl_FragColor = show < -0.5 ? vec4(1.0, 0.0, 0.0, 1.0) : c; return; }
    // 4x4 blur over the half-resolution occlusion, weighted by how close the depths are
    float sum = 0.0, wsum = 0.0;
    for (float y = -1.5; y <= 1.5; y += 1.0) for (float x = -1.5; x <= 1.5; x += 1.0) {
      vec4 s = texture2D(tAO, vUv + vec2(x, y) * aoTexel);
      float k = exp(-abs(s.y - w) / (0.05 + w * 0.03));
      sum += s.x * k; wsum += k;
    }
    float ao = wsum > 1e-4 ? sum / wsum : 1.0;
    float fade = 1.0 - smoothstep(120.0, 280.0, w);
    ao = mix(1.0, ao, strength * fade);
    gl_FragColor = show > 0.5 ? vec4(vec3(ao), 1.0) : show < -0.5 ? vec4(vec3(fract(w / 10.0)), 1.0) : vec4(c.rgb * ao, c.a);
  }
`;

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class SSAOPass extends Pass {
  constructor(camera, { samples = 12, radius = 0.6, strength = 0.8 } = {}) {
    super();
    this.camera = camera;
    this.aoRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false });
    const common = { tDepth: { value: null }, logFar: { value: 1 }, tanFov: { value: new THREE.Vector2(1, 1) } };
    this.aoMat = new THREE.ShaderMaterial({
      uniforms: { ...common, texel: { value: new THREE.Vector2() }, samples: { value: samples }, radius: { value: radius }, frame: { value: 0 } },
      vertexShader: VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false,
    });
    this.combineMat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(common), tDiffuse: { value: null }, tAO: { value: this.aoRT.texture }, aoTexel: { value: new THREE.Vector2() }, strength: { value: strength }, show: { value: 0 } },
      vertexShader: VERT, fragmentShader: COMBINE_FRAG, depthTest: false, depthWrite: false,
    });
    this.aoQuad = new FullScreenQuad(this.aoMat);
    this.combineQuad = new FullScreenQuad(this.combineMat);
  }
  setSize(w, h) {
    this.aoRT.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    this.aoMat.uniforms.texel.value.set(2 / w, 2 / h);
    this.combineMat.uniforms.aoTexel.value.set(2 / w, 2 / h);
  }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera, ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    for (const m of [this.aoMat, this.combineMat]) {
      m.uniforms.tDepth.value = readBuffer.depthTexture;
      m.uniforms.logFar.value = Math.log2(cam.far + 1);
      m.uniforms.tanFov.value.set(ty * cam.aspect, ty);
    }
    renderer.setRenderTarget(this.aoRT);
    this.aoQuad.render(renderer);
    this.combineMat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.combineQuad.render(renderer);
  }
  dispose() { this.aoRT.dispose(); this.aoMat.dispose(); this.combineMat.dispose(); this.aoQuad.dispose(); this.combineQuad.dispose(); }
}
