// Limestone or granite: the Tatras' crystalline core (granite and gneiss: the High Tatras, Kasprowy, the
// Suche Czuby, the Tomanowy ridge) is wrapped on the north by sedimentary rock, pale limestone and dolomite
// (Giewont, the Czerwone Wierchy tops, the reglowe hills, Myślenickie Turnie, Gęsia Szyja, Murań and the
// Belianske Tatry). The border, simplified from the geological map: everything north of it is limestone,
// blended over ~300 m. Used for the colour of the rock (terrain shader, boulders) and the plants that grow
// only on limestone (nature/spots.js).
import * as THREE from 'three';

// the local frame (region.js): x east, z south, metres
const LAT0 = (49.168 + 49.214) / 2, LON0 = (20.040 + 20.112) / 2;
const MX = 111320 * Math.cos(LAT0 * Math.PI / 180), MZ = 110574;

// [lon, lat] west to east
const BORDER = [
  [19.70, 49.222], [19.86, 49.221], [19.89, 49.224], [19.905, 49.226], [19.93, 49.231], [19.945, 49.236],
  [19.965, 49.240], [19.985, 49.245], [20.005, 49.247], [20.04, 49.252], [20.08, 49.250], [20.12, 49.248],
  [20.15, 49.245], [20.17, 49.240], [20.20, 49.233], [20.21, 49.229], [20.23, 49.222], [20.27, 49.215], [20.45, 49.21],
];
const borderLat = (lon) => {
  if (lon <= BORDER[0][0]) return BORDER[0][1];
  for (let i = 1; i < BORDER.length; i++) {
    const [a, la] = BORDER[i - 1], [b, lb] = BORDER[i];
    if (lon <= b) return la + (lb - la) * (lon - a) / (b - a);
  }
  return BORDER[BORDER.length - 1][1];
};

// 0 granite .. 1 limestone, at a point of the local frame
export function limeAt(x, z) {
  const lon = LON0 + x / MX, lat = LAT0 - z / MZ;
  const d = (lat - borderLat(lon)) * MZ;                  // metres north of the border
  const t = Math.min(1, Math.max(0, (d + 150) / 300));
  return t * t * (3 - 2 * t);
}

// the same as a texture over the rectangle [x0, z0, x1, z1] (for the shaders)
export function limeTexture([x0, z0, x1, z1], n = 256) {
  const d = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    d[j * n + i] = Math.round(255 * limeAt(x0 + (i + 0.5) / n * (x1 - x0), z0 + (j + 0.5) / n * (z1 - z0)));
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
