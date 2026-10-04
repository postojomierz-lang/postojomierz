"""Prepares the terrain data for the Rysy prototype.

Sources (all open, read straight from AWS):
- Copernicus DEM GLO-30 (elevation, ~30 m)
- Sentinel-2 L2A true colour, 2025-07-02 (imagery, 10 m)
- ESA WorldCover 2021 (land cover, 10 m): trees and dwarf pine
- Overture Maps (OpenStreetMap): the trail and the lakes

Writes everything the app needs into ../src/data/.
Run: python3 tools/prepare.py  (needs rasterio numpy scipy pillow pyarrow shapely)
"""
import json, math, os
import numpy as np, rasterio, shapely
from rasterio.merge import merge
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from rasterio.features import rasterize
from PIL import Image, ImageFilter
from shapely.geometry import shape, Point, LineString
from shapely.ops import unary_union
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc

# AREA=rysy (default): the Morskie Oko -> Rysy prototype, data in ../public/data.
# AREA=region: the whole Polish High Tatras for routes from the planner, data in ../../region
# (served next to the app, not copied into the build). Same local frame for both.
AREA = os.environ.get('AREA', 'rysy')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
# Outer area: panorama of the High Tatras. Inner area: detailed corridor around the trail.
OUTER = (19.86, 49.07, 20.34, 49.33)          # lon0, lat0, lon1, lat1
INNER = (20.040, 49.168, 20.112, 49.214)
OUTER_N = (640, 512)                           # DEM grid (w, h), ~58 m
INNER_N = (176, 176)                           # ~30 m, native resolution
SHELTER = (20.0717, 49.2012)                   # Schronisko PTTK nad Morskim Okiem
SUMMIT = (20.08813, 49.17952)                  # Rysy, Polish summit 2499 m
LAT0 = (INNER[1] + INNER[3]) / 2
LON0 = (INNER[0] + INNER[2]) / 2
INNER_IMG = (1024, 1024)
OUTER_IMG = (2048, 2048)
MX = 111320 * math.cos(math.radians(LAT0))
MZ = 110574
if AREA == 'region':
    # Polish Tatras from Dolina Chochołowska to Kasprowy and the Slovak High Tatras (Štrbské Pleso to
    # Lomnica). The west edge lies exactly 12 blocks (12 x 1024 m, see prepare_gugik.py) west of 19.85°E,
    # where the region began until October 2026, so the older blocks kept their content (~19.681°E).
    INNER = (19.85 - 12 * 1024 / MX, 49.08, 20.31, 49.29)
    INNER_N = (1532, 780)                      # ~30 m
    INNER_IMG = (4514, 2300)                   # ~10 m
    OUTER = (19.55, 49.07, 20.34, 49.33)       # panorama reaches the Western Tatras and Orava
    OUTER_N = (1056, 512)
    OUTER_IMG = (3392, 2048)
    OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'region')

def cached(url):
    """Local copy of a remote raster (downloaded once into tools/.cache/remote): reading big remote COGs
    breaks now and then on long runs."""
    import urllib.request, shutil, time
    d = os.path.join(os.path.dirname(__file__), '.cache', 'remote')
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, url.split('//', 1)[1].replace('/', '_')[-150:])
    if os.path.exists(path): return path
    for k in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'rysy3d-prototype/0.1'}), timeout=300) as r, open(path + '.part', 'wb') as f:
                shutil.copyfileobj(r, f, 1 << 20)
            os.replace(path + '.part', path)
            return path
        except Exception as e:
            print('download retry', k, e); time.sleep(5 * (k + 1))
    raise RuntimeError(url)

def local(lon, lat):
    return (lon - LON0) * MX, -(lat - LAT0) * MZ

def warp(srcs, bounds, w, h, bands=1, resampling=Resampling.bilinear, dtype='float32'):
    dst = np.zeros((bands, h, w), dtype=dtype)
    t = from_bounds(*bounds, w, h)
    for s in srcs:
        with rasterio.open(s) as src:
            for b in range(bands):
                tmp = np.zeros((h, w), dtype=dtype)
                reproject(rasterio.band(src, b + 1), tmp, dst_transform=t, dst_crs='EPSG:4326', resampling=resampling)
                dst[b] = np.where(tmp != 0, tmp, dst[b])
    return dst, t

# ---------- vectors from Overture ----------
def overture():
    fs = pfs.S3FileSystem(anonymous=True, region='us-west-2')
    root = 'overturemaps-us-west-2/release/2026-09-23.1'
    f = ((pc.field('bbox', 'xmin') > OUTER[0]) & (pc.field('bbox', 'xmax') < OUTER[2]) &
         (pc.field('bbox', 'ymin') > OUTER[1]) & (pc.field('bbox', 'ymax') < OUTER[3]))
    def q(p):
        return ds.dataset(f'{root}/{p}', filesystem=fs, format='parquet').to_table(
            filter=f, columns=['subtype', 'class', 'names', 'geometry']).to_pylist()
    return q('theme=transportation/type=segment'), q('theme=base/type=water')

def route(segs):
    import heapq
    ok = {'path', 'footway', 'steps', 'track', 'pedestrian'}
    adj = {}
    for s in segs:
        if s['class'] not in ok: continue
        cs = list(shapely.from_wkb(s['geometry']).coords)
        for a, b in zip(cs, cs[1:]):
            a = (round(a[0], 7), round(a[1], 7)); b = (round(b[0], 7), round(b[1], 7))
            d = math.hypot((a[0] - b[0]) * MX, (a[1] - b[1]) * MZ)
            adj.setdefault(a, []).append((b, d)); adj.setdefault(b, []).append((a, d))
    near = lambda p: min(adj, key=lambda n: math.hypot((n[0] - p[0]) * MX, (n[1] - p[1]) * MZ))
    s, t = near(SHELTER), near(SUMMIT)
    dist, prev, pq = {s: 0}, {}, [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > dist[u]: continue
        for v, w in adj[u]:
            if d + w < dist.get(v, 1e18):
                dist[v] = d + w; prev[v] = u; heapq.heappush(pq, (d + w, v))
    path = [t]
    while path[-1] != s: path.append(prev[path[-1]])
    return path[::-1], dist[t]

def region_trails():
    # every marked trail of the region (tools/prepare_trails.py), as lines in lon/lat
    d = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'region', 'trails.json')))
    return [[d['v'][i][:2] for i in e['v']] for e in d['e'] if len(e['v']) > 1]

def main():
    os.makedirs(OUT, exist_ok=True)
    segs, water = overture()
    if AREA == 'region':
        trail = []
    else:
        trail, length = route(segs)
        print('trail', len(trail), 'points', round(length), 'm')

    lakes = []
    for wv in water:
        g = shapely.from_wkb(wv['geometry'])
        if g.geom_type not in ('Polygon', 'MultiPolygon') or wv['class'] in ('river', 'stream'): continue
        if g.area < 4e-7: continue
        lakes.append((g, (wv['names'] or {}).get('primary')))
    print('lakes', len(lakes))

    # ---------- elevation ----------
    dem_srcs = [cached(u) for u in [f'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N49_00_E0{e}_00_DEM/Copernicus_DSM_COG_10_N49_00_E0{e}_00_DEM.tif' for e in (19, 20)]]
    from scipy.ndimage import gaussian_filter
    def dem(bounds, n, sharpen):
        h, t = warp(dem_srcs, bounds, *n, resampling=Resampling.cubic)
        h = h[0]
        # 30 m data rounds off ridges and summits; restore some of the lost relief
        h = h + sharpen[0] * (h - gaussian_filter(h, sharpen[1]))
        # flatten lakes to their shoreline level
        for g, name in lakes:
            m = rasterize([g.buffer(0.00008)], out_shape=h.shape, transform=t).astype(bool)
            if not m.any(): continue
            ring = rasterize([g.buffer(0.0004)], out_shape=h.shape, transform=t).astype(bool) & ~m
            lvl = np.percentile(h[ring], 8) if ring.any() else h[m].min()
            h[m] = np.minimum(h[m], lvl - 3)
        return h, t
    outer_h, outer_t = dem(OUTER, OUTER_N, (0.35, 1.0))
    inner_h, inner_t = dem(INNER, INNER_N, (0.7, 1.6))

    def lake_level(g):
        c = g.representative_point()
        h, t = (inner_h, inner_t) if INNER[0] < c.x < INNER[2] and INNER[1] < c.y < INNER[3] else (outer_h, outer_t)
        ring = rasterize([g.buffer(0.0004)], out_shape=h.shape, transform=t).astype(bool) & \
               ~rasterize([g.buffer(0.00008)], out_shape=h.shape, transform=t).astype(bool)
        return float(np.percentile(h[ring], 8)) if ring.any() else None

    def to_u16(h):  # decimetres
        return np.clip(np.round(h * 10), 0, 65535).astype('<u2')
    to_u16(outer_h).tofile(os.path.join(OUT, 'outer.u16'))
    to_u16(inner_h).tofile(os.path.join(OUT, 'inner.u16'))

    # ---------- imagery ----------
    tci = [cached(f'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/34/U/{t}/2025/7/S2C_34U{t}_20250702_0_L2A/TCI.tif')
           for t in (('DV', 'CV') if OUTER[0] < 19.64 else ('DV',))]   # CV: west of ~19.63°E
    def img(bounds, w, h, name, q):
        a, _ = warp(tci, bounds, w, h, bands=3, resampling=Resampling.lanczos, dtype='uint8')
        im = Image.fromarray(np.moveaxis(a, 0, -1))
        im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        im.save(os.path.join(OUT, name), quality=q, optimize=True, progressive=True)
    img(OUTER, *OUTER_IMG, 'outer.jpg', 82)
    img(INNER, *INNER_IMG, 'inner.sentinel.jpg', 88)  # fallback for Slovakia; prepare_gugik.py writes inner.jpg

    # ---------- land cover (inner only) ----------
    wc = [cached('https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N48E018_Map.tif')]
    lc, _ = warp(wc, INNER, *((512, 512) if AREA != 'region' else INNER_IMG), resampling=Resampling.nearest, dtype='uint8')
    Image.fromarray(lc[0]).save(os.path.join(OUT, 'landcover.png'))

    # ---------- vectors in local metres ----------
    meta = {
        'outer': {'bounds': [*local(OUTER[0], OUTER[3]), *local(OUTER[2], OUTER[1])], 'n': OUTER_N},
        'inner': {'bounds': [*local(INNER[0], INNER[3]), *local(INNER[2], INNER[1])], 'n': INNER_N},
        'trail': [[round(v, 1) for v in local(*p)] for p in trail],
        **({'trails': [[[round(v, 1) for v in local(*p)] for p in l] for l in region_trails()]} if AREA == 'region' else {}),
        'lakes': [],
        'sources': 'Copernicus DEM GLO-30 © DLR/Airbus, ESA; Sentinel-2 © ESA/Copernicus 2025; ESA WorldCover 2021; OpenStreetMap contributors via Overture Maps',
    }
    for g, name in lakes:
        polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
        lvl = lake_level(g)
        if lvl is None: continue
        for p in polys:
            p = p.simplify(0.00002)
            meta['lakes'].append({'name': name, 'level': round(lvl - 1.5, 1),
                                  'ring': [[round(v, 1) for v in local(*c)] for c in p.exterior.coords]})
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    print('done')

if __name__ == '__main__':
    main()
