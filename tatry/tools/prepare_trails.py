"""Marked hiking trails of the Polish High Tatras for the route planner -> public/data/region/trails.json

- OpenStreetMap hiking route relations (via Overpass): the ways of every marked trail with its colour
  (osmc:symbol) and name; plus huts, guideposts, peaks and passes as points of interest.
- Heights along the trails: GUGiK NMT 1 m (WCS, cached in tools/.cache/dtm like prepare_gugik.py),
  Copernicus DEM 30 m where GUGiK has no data (the Slovak side).
The network is resampled every ~10 m; every sample is a vertex of the routing graph (the browser
snaps clicks to the nearest vertex). Output edges run between junctions.

Run: python3 tools/prepare_trails.py
"""
import json, math, os, re, sys, time, urllib.request, urllib.parse
import numpy as np
from pyproj import Transformer

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, '..', 'public', 'data', 'region')
REGION = (19.682, 49.08, 20.31, 49.29)      # lon0, lat0, lon1, lat1: from Dolina Chochołowska to the Slovak High Tatras
STEP = 10.0                                   # m between vertices
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.osm.jp/api/interpreter']
WCS = ('https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF'
       '?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=DTM_PL-KRON86-NH_TIFF&FORMAT=image/tiff')
SAC = {'hiking': 1, 'mountain_hiking': 2, 'demanding_mountain_hiking': 3, 'alpine_hiking': 4,
       'demanding_alpine_hiking': 5, 'difficult_alpine_hiking': 6}
COLOURS = {'red': '#d8261d', 'blue': '#1f5fd1', 'green': '#1f9a3a', 'yellow': '#e8c21a', 'black': '#222222'}
LAT0 = (REGION[1] + REGION[3]) / 2
MX, MZ = 111320 * math.cos(math.radians(LAT0)), 110540

def fetch(url, path, data=None, tries=4):
    path = os.path.join(CACHE, path)
    if os.path.exists(path): return open(path, 'rb').read()
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': 'rysy3d-prototype/0.1'})
            b = urllib.request.urlopen(req, timeout=240).read()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'wb').write(b)
            return b
        except Exception as e:
            print('retry', k, e); time.sleep(4 * (k + 1))
    raise RuntimeError(url)

def overpass(q, name):
    last = None
    for url in OVERPASS:
        try:
            b = fetch(url, f'osm/{name}.json', urllib.parse.urlencode({'data': q}).encode(), tries=2)
            d = json.loads(b)
            if 'elements' in d: return d
        except Exception as e:
            last = e
            p = os.path.join(CACHE, f'osm/{name}.json')
            if os.path.exists(p): os.remove(p)
    raise RuntimeError(last)

def colour_of(tags):
    s = (tags.get('osmc:symbol') or '').split(':')
    c = (s[0] if s and s[0] in COLOURS else tags.get('colour', '')).lower()
    return c if c in COLOURS else None

# ---------------------------------------------------------------- heights
to2180 = Transformer.from_crs(4326, 2180, always_xy=True)
_chunks = {}
def gugik(lon, lat):
    from rasterio.io import MemoryFile
    if lat < 49.165: return None          # south of Poland's southernmost point (Rysy): no GUGiK data
    x, y = to2180.transform(lon, lat)
    cx, cy = int(x // 1000 * 1000), int(y // 1000 * 1000)
    k = (cx, cy)
    if k not in _chunks:
        try:
            b = fetch(f'{WCS}&SUBSET=x({cx},{cx + 1000})&SUBSET=y({cy},{cy + 1000})', f'dtm/{cx}_{cy}.tif')
            with MemoryFile(b) as m, m.open() as r:
                _chunks[k] = (r.read(1), r.transform)
        except Exception as e:
            print('no dtm chunk', k, e); _chunks[k] = None
    c = _chunks[k]
    if c is None: return None
    a, t = c
    col, row = ~t * (x, y)
    i, j = int(row), int(col)
    if 0 <= i < a.shape[0] and 0 <= j < a.shape[1] and a[i, j] > 100: return float(a[i, j])
    return None

# Slovak DMR 5.0 tiles (ÚGKK SR, S-JTSK [JTSK03]) from tatry/zbgis and ZBGIS_EXTRA (colon-separated dirs)
_zb = None
def zbgis(lon, lat):
    global _zb
    import glob, rasterio
    if _zb is None:
        dirs = [os.path.join(HERE, '..', 'zbgis')] + [d for d in os.environ.get('ZBGIS_EXTRA', '').split(':') if d]
        tr = Transformer.from_crs(4326, 'EPSG:8353', always_xy=True)
        _zb = {'tr': tr, 'files': []}
        for d in dirs:
            for f in sorted(glob.glob(os.path.join(d, '*.tif'))):
                r = rasterio.open(f); _zb['files'].append((r.bounds, r))
    x, y = _zb['tr'].transform(lon, lat)
    for b, r in _zb['files']:
        if b.left <= x < b.right and b.bottom < y <= b.top:
            v = float(next(r.sample([(x, y)]))[0])
            if 100 < v < 3000: return v
    return None

_cop = None
def copernicus(lon, lat):
    global _cop
    import rasterio
    if _cop is None:
        _cop = []
        for e in (19, 20):     # downloaded once into the cache (reading the remote file breaks on long runs)
            name = f'Copernicus_DSM_COG_10_N49_00_E0{e}_00_DEM'
            fetch(f'https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif', f'cop/{name}.tif')
            _cop.append(rasterio.open(os.path.join(CACHE, 'cop', f'{name}.tif')))
    # right at 20°E the tile on one side gives 0 (it gave the Kriváň trail 0 m heights): then the other one
    a, b = (_cop[0], _cop[1]) if lon < 20 else (_cop[1], _cop[0])
    h = float(next(a.sample([(lon, lat)]))[0])
    return h if h > 100 else float(next(b.sample([(lon, lat)]))[0])

def poi_list(pois):
    """The points of interest: huts, guideposts, peaks, passes, waterfalls and lakes."""
    P = []
    for el in pois['elements']:
        t = el.get('tags', {})
        if 'lon' in el: lon, lat = el['lon'], el['lat']
        elif 'center' in el: lon, lat = el['center']['lon'], el['center']['lat']
        else: continue
        if not (REGION[0] <= lon <= REGION[2] and REGION[1] <= lat <= REGION[3]): continue
        kind = 'hut' if t.get('tourism') in ('alpine_hut', 'wilderness_hut') else 'sign' if t.get('information') == 'guidepost' else \
               'fall' if t.get('waterway') == 'waterfall' else 'lake' if t.get('natural') == 'water' else \
               'peak' if t.get('natural') == 'peak' else 'pass'
        if kind == 'lake' and t.get('water') not in (None, 'lake', 'pond'): continue
        name = t.get('name:pl') or t.get('name') or ''
        if kind != 'sign' and not name: continue
        if kind == 'fall':
            # ice falls (climbing in winter) and a river name are not places to walk to
            if re.search(r'(?i)ľad|\blad\b', name) or name == 'Poprad': continue
            name = {'Siklawa': 'Wielka Siklawa'}.get(name, name)    # the usual Polish name
        ele = t.get('ele')
        try: ele = round(float(str(ele).replace(',', '.').split()[0])) if ele else None
        except ValueError: ele = None
        P.append({'k': kind, 'n': name, 'p': [round(lon, 6), round(lat, 6)], 'e': ele})
    return P

def main():
    os.makedirs(OUT, exist_ok=True)
    s, w, n, e = REGION[1], REGION[0], REGION[3], REGION[2]
    routes = overpass(f'[out:json][timeout:180];relation["route"="hiking"]({s},{w},{n},{e});out body;way(r);out body qt;node(w);out skel qt;', 'routes_v2')
    pois = overpass(f'[out:json][timeout:180];(node["tourism"~"alpine_hut|wilderness_hut"]({s},{w},{n},{e});'
                    f'way["tourism"="alpine_hut"]({s},{w},{n},{e});node["information"="guidepost"]({s},{w},{n},{e});'
                    f'node["natural"~"peak|saddle"]["name"]({s},{w},{n},{e}););out center tags;', 'pois_v2')
    # waterfalls and named lakes (Wielka Siklawa, the stawy and plesá), for the planner's search
    water = overpass(f'[out:json][timeout:180];(node["waterway"="waterfall"]["name"]({s},{w},{n},{e});'
                     f'nwr["natural"="water"]["name"]({s},{w},{n},{e}););out center tags;', 'pois_water_v1')
    pois = {'elements': pois['elements'] + water['elements']}
    if os.environ.get('POI_ONLY'):    # only the points of interest, into the existing trails.json
        path = os.path.join(OUT, 'trails.json')
        out = json.load(open(path))
        out['poi'] = poi_list(pois)
        json.dump(out, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)
        from collections import Counter
        print('pois', Counter(p['k'] for p in out['poi']))
        return
    nodes = {el['id']: (el['lon'], el['lat']) for el in routes['elements'] if el['type'] == 'node'}
    ways = {el['id']: el['nodes'] for el in routes['elements'] if el['type'] == 'way'}
    wtags = {el['id']: el.get('tags', {}) for el in routes['elements'] if el['type'] == 'way'}
    # colours and names per way (a way may carry several trails)
    wcol, wname = {}, {}
    for r in (el for el in routes['elements'] if el['type'] == 'relation'):
        c = colour_of(r.get('tags', {}))
        nm = r.get('tags', {}).get('name', '')
        for m in r['members']:
            if m['type'] != 'way' or m['ref'] not in ways: continue
            if c: wcol.setdefault(m['ref'], set()).add(c)
            if nm: wname.setdefault(m['ref'], set()).add(nm)
    inside = lambda p: REGION[0] <= p[0] <= REGION[2] and REGION[1] <= p[1] <= REGION[3]
    # junctions: nodes shared by several ways, and way ends
    use = {}
    for wid, ns in ways.items():
        if wid not in wcol: continue
        for k, nid in enumerate(ns):
            use[nid] = use.get(nid, 0) + (2 if k in (0, len(ns) - 1) else 1)
    junction = {nid for nid, u in use.items() if u >= 2}
    # split ways at junctions (and where they leave the region) into edges of node ids
    raw = []
    for wid, ns in ways.items():
        if wid not in wcol: continue
        cur = []
        for nid in ns:
            p = nodes.get(nid)
            if p is None or not inside(p):
                if len(cur) > 1: raw.append((wid, cur))
                cur = []; continue
            cur.append(nid)
            if nid in junction and len(cur) > 1:
                raw.append((wid, cur)); cur = [nid]
        if len(cur) > 1: raw.append((wid, cur))
    print('ways with trails', len(wcol), 'edges', len(raw))
    # resample every edge at ~STEP m, heights for every vertex
    V, vid = [], {}          # vertices [lon, lat, ele]; junction node id -> vertex index
    def vertex(lon, lat, key=None):
        if key is not None and key in vid: return vid[key]
        V.append([lon, lat, None]); i = len(V) - 1
        if key is not None: vid[key] = i
        return i
    edges = []
    for wid, ns in raw:
        pts = [nodes[i] for i in ns]
        # cumulative metres
        d = [0.0]
        for a, b in zip(pts, pts[1:]): d.append(d[-1] + math.hypot((b[0] - a[0]) * MX, (b[1] - a[1]) * MZ))
        L = d[-1]
        if L < 0.5: continue
        m = max(1, round(L / STEP))
        seq = [vertex(*pts[0], key=ns[0])]
        k = 0
        for q in range(1, m):
            t = L * q / m
            while d[k + 1] < t: k += 1
            f = (t - d[k]) / max(1e-9, d[k + 1] - d[k])
            seq.append(vertex(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f))
        seq.append(vertex(*pts[-1], key=ns[-1]))
        t = wtags.get(wid, {})
        # surface and difficulty for the 3D path: s = surface, d = SAC scale 1..6, h = highway class
        edges.append({'v': seq, 'c': sorted(wcol.get(wid, [])), 'n': sorted(wname.get(wid, []))[:2],
                      's': t.get('surface', ''), 'd': SAC.get(t.get('sac_scale', ''), 0), 'h': t.get('highway', '')})
    print('vertices', len(V))
    # fetch the 1 km DTM chunks under the trails in parallel first
    import concurrent.futures as cf
    keys = sorted({(int(x // 1000 * 1000), int(y // 1000 * 1000)) for x, y in (to2180.transform(v[0], v[1]) for v in V[::3] if v[1] >= 49.165)})
    print('dtm chunks', len(keys))
    def pre(k):
        try: fetch(f'{WCS}&SUBSET=x({k[0]},{k[0] + 1000})&SUBSET=y({k[1]},{k[1] + 1000})', f'dtm/{k[0]}_{k[1]}.tif')
        except Exception as e: print('chunk failed', k, e)
    with cf.ThreadPoolExecutor(4) as ex: list(ex.map(pre, keys))
    miss = 0
    for k, v in enumerate(V):
        h = gugik(v[0], v[1])
        if h is None: h = zbgis(v[0], v[1])
        if h is None: h = copernicus(v[0], v[1]); miss += 1
        v[2] = round(h, 1)
        if k % 5000 == 0: print('heights', k, '/', len(V), flush=True)
    print('copernicus fallback for', miss, 'vertices')
    P = poi_list(pois)
    out = {'region': REGION, 'step': STEP, 'colours': COLOURS,
           'v': [[round(v[0], 6), round(v[1], 6), v[2]] for v in V], 'e': edges, 'poi': P,
           'source': 'OpenStreetMap contributors (ODbL); GUGiK NMT; ÚGKK SR DMR 5.0; Copernicus DEM GLO-30'}
    json.dump(out, open(os.path.join(OUT, 'trails.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    from collections import Counter
    print('edges', len(edges), 'pois', Counter(p['k'] for p in P), 'size', os.path.getsize(os.path.join(OUT, 'trails.json')))

if __name__ == '__main__':
    main()
