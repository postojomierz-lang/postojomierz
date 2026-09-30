"""Where the catalogue's plants and animals are found, for the whole trail network of the region: the same
spots for the 3D view and for GPS navigation in the planner (the same gentian at the same bend of the trail).

For every species of src/nature/catalog.js (read through node, so the rules live in one place) it walks
the planner's trails (public/data/region/trails.json), tries points beside them and keeps those whose
ground matches the habitat: elevation, the 1 m class map of the region tiles (tools/prepare_classes.py),
beside a stream, at a lake or the named lake, limestone, near the highest summits. Seeded per species.
Density along the network by rarity: common every ~3 km of suitable trail, uncommon ~6 km, rare ~12 km,
unique at most two in the region.
Output: public/nature/spots.json  [[id, lon, lat, ele], ...]
Run: python3 tools/prepare_spots.py
"""
import json
import math
import os
import random
import subprocess
import zlib

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
REGION = os.path.join(ROOT, '..', 'region')
LON0, LAT0 = 20.076, 49.191
MX, MZ = 111320 * math.cos(math.radians(LAT0)), 110574

cat = json.loads(subprocess.check_output(['node', '-e', "import('./src/nature/catalog.js').then(m=>console.log(JSON.stringify(m.CATALOG)))"], cwd=ROOT))
trails = json.load(open(os.path.join(ROOT, 'public', 'data', 'region', 'trails.json')))
meta = json.load(open(os.path.join(REGION, 'meta.json')))
T = meta['tiles']; S = T['size']; ox, oz = T['origin']; tiles = {tuple(t) for t in T['list']}
N = T['samples']

local = lambda lon, lat: ((lon - LON0) * MX, -(lat - LAT0) * MZ)
lonlat = lambda x, z: (LON0 + x / MX, LAT0 - z / MZ)
is_lime = lambda x, z: (lambda ll: ll[1] > 49.235 and ll[0] < 20.06)(lonlat(x, z))

_cls, _hgt = {}, {}


def tile(i, j):
    if (i, j) not in _cls:
        c = h = None
        if (i, j) in tiles:
            cp = os.path.join(REGION, 'tiles', f'c_{i}_{j}.png')
            if os.path.exists(cp):
                c = np.asarray(Image.open(cp))
                raw = zlib.decompress(open(os.path.join(REGION, 'tiles', f'h_{i}_{j}.bin'), 'rb').read())
                d = np.frombuffer(raw, dtype='<u2', count=N * N).reshape(N, N).astype(np.int32)
                d[:, 1:] = np.where(d[:, 1:] > 32767, d[:, 1:] - 65536, d[:, 1:])
                h = np.cumsum(d, axis=1) / 10.0
        _cls[(i, j)], _hgt[(i, j)] = c, h
    return _cls[(i, j)], _hgt[(i, j)]


def ground(x, z):
    i, j = int((x - ox) // S), int((z - oz) // S)
    c, h = tile(i, j)
    if c is None:
        return None, None
    u, v = int(x - ox - i * S), int(z - oz - j * S)
    return int(c[v, u]), float(h[v, u])


def seg_dist(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    l = dx * dx + dz * dz
    t = max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l)) if l else 0
    return math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t)


def in_ring(x, z, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        (xi, zi), (xj, zj) = ring[i], ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


# lakes, streams and the high summits on a coarse grid for quick lookups
CELL = 200
def grid_add(g, x, z, item):
    g.setdefault((int(x // CELL), int(z // CELL)), []).append(item)


lake_g, stream_g = {}, {}
for l in meta['lakes']:
    xs = [p[0] for p in l['ring']]; zs = [p[1] for p in l['ring']]
    for gx in range(int(min(xs) // CELL) - 1, int(max(xs) // CELL) + 2):
        for gz in range(int(min(zs) // CELL) - 1, int(max(zs) // CELL) + 2):
            lake_g.setdefault((gx, gz), []).append(l)
for s in meta['streams']:
    for a, b in zip(s['pts'], s['pts'][1:]):
        grid_add(stream_g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a, b))
peaks = [(l['x'], l['z']) for l in meta['labels'] if l['kind'] == 'peak' and (l.get('ele') or 0) > 2300]


def near_items(g, x, z):
    gx, gz = int(x // CELL), int(z // CELL)
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            yield from g.get((gx + dx, gz + dz), [])


def by_stream(x, z, r):
    return any(seg_dist(x, z, a, b) < r for a, b in near_items(stream_g, x, z))


def lake_at(x, z, r, name=None):
    for l in near_items(lake_g, x, z):
        if name and name not in (l['name'] or ''):
            continue
        ring = l['ring']
        if in_ring(x, z, ring) or any(seg_dist(x, z, a, b) < r for a, b in zip(ring, ring[1:])):
            return True
    return False


# trail points every ~12 m, with their distance along the network (for spacing the spots)
V = trails['v']
pts = []
walked = 0.0
for e in trails['e']:
    if e.get('h') in ('service', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary'):
        continue                                                   # roads to the trailheads
    prev = None
    for vi in e['v']:
        x, z = local(V[vi][0], V[vi][1])
        if prev is not None:
            walked += math.hypot(x - prev[0], z - prev[1])
        prev = (x, z)
        pts.append((x, z, walked))
print('trail points', len(pts), 'network km', round(walked / 1000))

SPACING = [0, 3000, 6000, 12000, 0]
out = []
for sp in cat:
    rnd = random.Random(sp['id'])
    fauna, bird = sp['kind'] == 'fauna', sp['group'] == 'bird'
    aquatic = sp['on'] == [1]
    lake = sp.get('lake')
    # a species of one named lake: the lake may lie a little away from the path, still in sight
    d0, d1 = (2, 200) if isinstance(lake, str) else (2, 60) if aquatic else (20, 150) if bird else (12, 90) if fauna else (3, 28)
    cand = []
    if sp.get('far') and isinstance(lake, str):
        # seen from the trail: in the middle of the named lake
        for l in meta['lakes']:
            if lake in (l['name'] or ''):
                r = np.array(l['ring']); cx, cz = r.mean(0)
                out.append([sp['id'], *[round(v, 6) for v in lonlat(cx, cz)], round(l['level'])])
                break
        print(f"{sp['id']:24s} at the lake", flush=True)
        continue
    for (tx, tz, s) in pts[rnd.randrange(3)::3]:                   # every ~30 m
        d = d0 + rnd.random() * (d1 - d0); a = rnd.random() * 6.2832
        x, z = tx + math.cos(a) * d, tz + math.sin(a) * d
        c, h = ground(x, z)
        if c is None or c not in sp['on'] or not (sp['ele'][0] <= h <= sp['ele'][1]):
            continue
        if sp.get('lime') and not is_lime(x, z):
            continue
        if sp.get('stream') and not lake and not by_stream(x, z, 6 if aquatic else 25):
            continue
        if lake and not sp.get('stream') and not lake_at(x, z, 25, lake if isinstance(lake, str) else None):
            continue
        if lake and sp.get('stream') and not (by_stream(x, z, 8) or lake_at(x, z, 8)):
            continue
        if sp.get('peak') and not any(math.hypot(px - x, pz - z) < 250 for px, pz in peaks):
            continue
        cand.append((s, x, z, h))
    rnd.shuffle(cand)
    picked = []
    if sp['rarity'] == 4:
        for c in cand:
            if len(picked) >= 2:
                break
            if all(math.hypot(c[1] - p[1], c[2] - p[2]) > 3000 for p in picked):
                picked.append(c)
    else:
        gap = SPACING[sp['rarity']]
        for c in cand:
            if all(abs(c[0] - p[0]) > gap and math.hypot(c[1] - p[1], c[2] - p[2]) > gap / 4 for p in picked):
                picked.append(c)
    for s, x, z, h in picked:
        lon, lat = lonlat(x, z)
        out.append([sp['id'], round(lon, 6), round(lat, 6), round(h)])
    print(f"{sp['id']:24s} candidates {len(cand):5d} spots {len(picked)}", flush=True)
os.makedirs(os.path.join(ROOT, 'public', 'nature'), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, 'public', 'nature', 'spots.json'), 'w'), separators=(',', ':'))
print('spots', len(out))
