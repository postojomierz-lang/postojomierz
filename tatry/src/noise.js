// 2D simplex noise (deterministic), and fractal sum of it.
const perm = new Uint8Array(512);
{
  let s = 1337;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;

export function simplex(x, y) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  const c = (gx, gy, g) => {
    let q = 0.5 - gx * gx - gy * gy;
    if (q < 0) return 0;
    q *= q;
    const gr = G[g & 7];
    return q * q * (gr[0] * gx + gr[1] * gy);
  };
  n += c(x0, y0, perm[ii + perm[jj]]);
  n += c(x1, y1, perm[ii + i1 + perm[jj + j1]]);
  n += c(x2, y2, perm[ii + 1 + perm[jj + 1]]);
  return 70 * n;
}

export function fbm(x, y, oct = 4) {
  let a = 0.5, f = 1, sum = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * simplex(x * f, y * f);
    f *= 2.1; a *= 0.5;
  }
  return sum;
}

// seeded PRNG
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
