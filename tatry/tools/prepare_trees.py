"""Real trees from the lidar: every spruce where it stands, as tall as it is.

GUGiK publishes, next to the bare-earth terrain (NMT), the surface model (NMPT, 0.5 m): the top of
whatever is there, the tree crowns included. Their difference is the canopy height (CHM). Tree tops are
its local maxima; each top becomes a tree with its height and crown radius.

The surface model comes from a different flight than the terrain, so the difference carries a small offset
(~3 m in the Tatras). It is measured per tile on open ground (meadow, scree, gravel from the class map,
see prepare_classes.py) and taken out.

The canopy height also corrects the class map where the photo cannot tell: 'forest' lower than 4 m is dwarf
pine (or a meadow when nothing stands there), a meadow or dwarf pine with trees over 6 m is forest.

Output next to the tiles: t_i_j.bin, u16 triples per tree: x, z (within the tile, scaled so that 65535 = 256 m), height in cm. Crown radius follows from the height in the 3D view (spruce: ~0.18 h).
Polish side only (the Slovak surface model is not served the same way); tiles without it get no file and
the view keeps its old placement there.
Run: python3 tools/prepare_trees.py                (the Morskie Oko -> Rysy data, public/data)
     AREA=region python3 tools/prepare_trees.py    (the region, ../../region)
"""
import concurrent.futures as cf
import json
import os
import re
import time
import urllib.request
import zlib

import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import gaussian_filter, map_coordinates, maximum_filter, label

import prepare as P

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = P.OUT
CACHE = os.path.join(HERE, '.cache', 'dsm')
ONLY = os.environ.get('ONLY')
DEBUG = os.environ.get('DEBUG') == '1'
WCS = ('https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel'
       '?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=DSM_PL-KRON86-NH&FORMAT=image/x-aaigrid')
MIN_H = 4.0            # lower than this is dwarf pine, bushes or noise, not a tree

meta = json.load(open(os.path.join(DATA, 'meta.json')))
T = meta['tiles']
S, N = T['size'], T['samples']
ox, oz = T['origin']
to2180 = Transformer.from_crs(4326, 2180, always_xy=True)


def unpack(path, n):
    raw = zlib.decompress(open(path, 'rb').read())
    d = np.frombuffer(raw, dtype='<u2', count=n * n).reshape(n, n).astype(np.int32)
    d[:, 1:] = np.where(d[:, 1:] > 32767, d[:, 1:] - 65536, d[:, 1:])
    return np.cumsum(d, axis=1) / 10.0


def parse_asc(b):
    """The WCS answers with a multipart message around an Arc/Info ASCII grid."""
    i = b.find(b'ncols')
    if i < 0:
        return None
    b = b[i:]
    head, rest = {}, b
    for _ in range(6):
        line, rest = rest.split(b'\n', 1)
        k, v = line.split()
        head[k.decode().lower()] = float(v)
        if not rest.lstrip()[:1].isalpha():
            break
    end = rest.find(b'--wcs')
    vals = np.array(rest[:end if end >= 0 else None].split(), np.float32)
    nc, nr = int(head['ncols']), int(head['nrows'])
    a = vals[:nc * nr].reshape(nr, nc)
    if 'nodata_value' in head:
        a[a == head['nodata_value']] = np.nan
    return a, head['xllcorner'], head['yllcorner'], head['cellsize']


def dsm(x0, y0, x1, y1):
    """The surface model over an EPSG:2180 box (0.5 m), cached as decimetres above its minimum (u16)."""
    path = os.path.join(CACHE, f'{x0}_{y0}_{x1}_{y1}.npz')
    if os.path.exists(path):
        z = np.load(path)
        return (np.where(z['a'] == 65535, np.nan, z['a'] / 10 + z['base']).astype(np.float32)) if z['a'].size else None, float(z['x0']), float(z['y0']), float(z['cs'])
    for k in range(5):
        try:
            b = urllib.request.urlopen(f'{WCS}&SUBSET=x({x0},{x1})&SUBSET=y({y0},{y1})', timeout=180).read()
            break
        except Exception as e:
            print('retry', k, e, flush=True)
            time.sleep(4 * (k + 1))
    else:
        raise RuntimeError('dsm')
    r = parse_asc(b)
    os.makedirs(CACHE, exist_ok=True)
    if r is None or np.isnan(r[0]).all() or np.nanmax(r[0]) < 100:
        np.savez(path, a=np.zeros(0, np.uint16), base=0, x0=0, y0=0, cs=0)
        return None, 0, 0, 0
    a, xl, yl, cs = r
    base = float(np.nanmin(a))
    q = np.where(np.isnan(a), 65535, np.clip(np.round((a - base) * 10), 0, 65534)).astype(np.uint16)
    np.savez_compressed(path, a=q, base=base, x0=xl, y0=yl, cs=cs)
    return a, xl, yl, cs


def tile_trees(i, j):
    x0, z0 = ox + i * S, oz + j * S
    # the tile's cells (1 m) and sub-cells (0.5 m) in EPSG:2180
    n = 2 * S
    u = x0 + (np.arange(n) + 0.5) / 2
    v = z0 + (np.arange(n) + 0.5) / 2
    U, V = np.meshgrid(u, v)
    lon, lat = P.LON0 + U / P.MX, P.LAT0 - V / P.MZ
    X, Y = to2180.transform(lon, lat)
    bx0, by0 = int(np.floor(X.min())) - 4, int(np.floor(Y.min())) - 4
    bx1, by1 = int(np.ceil(X.max())) + 4, int(np.ceil(Y.max())) + 4
    a, xl, yl, cs = dsm(bx0, by0, bx1, by1)
    if a is None:
        return None
    nr = a.shape[0]
    col = (X - xl) / cs - 0.5
    row = (yl + nr * cs - Y) / cs - 0.5
    top = map_coordinates(np.nan_to_num(a, nan=-1e4), [row, col], order=1, mode='nearest')
    if (top < 100).mean() > 0.5:
        return None                                 # mostly outside the Polish survey
    # the terrain (1 m samples at the cell corners) at the sub-cells
    h = unpack(os.path.join(DATA, 'tiles', f'h_{i}_{j}.bin'), N)
    gi, gj = np.meshgrid((np.arange(n) + 0.5) / 2, (np.arange(n) + 0.5) / 2)
    hs = map_coordinates(h, [gj, gi], order=1, mode='nearest')
    chm = top - hs
    chm[top < 100] = 0
    # the offset between the two flights, from open ground
    cp = os.path.join(DATA, 'tiles', f'c_{i}_{j}.png')
    off = None
    if os.path.exists(cp):
        c = np.asarray(Image.open(cp)).repeat(2, 0).repeat(2, 1)
        open_ground = np.isin(c, (3, 4, 8)) & (top > 100)
        if open_ground.sum() > 2000:
            off = float(np.percentile(chm[open_ground], 30))
    if off is None:
        off = float(np.percentile(chm[top > 100], 5))
    chm = chm - off
    if os.path.exists(cp):
        # the class map from the canopy height (1 m cells, the highest point within 1.5 m)
        cm = maximum_filter(np.where(top > 100, chm, np.nan).reshape(S, 2, S, 2).max((1, 3)), size=3)
        c = np.array(Image.open(cp))
        known = ~np.isnan(cm)
        cm = np.nan_to_num(cm, nan=0)
        was = c.copy()
        f, low = (c == 6) & known, cm < 0.8
        c[f & low] = 4
        c[f & ~low & (cm < 4)] = 5
        c[np.isin(was, (4, 5)) & known & (cm > 6)] = 6
        if (c != was).any():
            Image.fromarray(c, 'L').save(cp, optimize=True)
    # tree tops: maxima of the lightly smoothed canopy, the window growing with the tree
    cs_ = gaussian_filter(chm, 0.8)
    small = maximum_filter(cs_, size=5)             # 2.5 m
    big = maximum_filter(cs_, size=9)               # 4.5 m, for trees over 15 m
    peak = (cs_ >= MIN_H) & (cs_ == small) & ((cs_ < 15) | (cs_ == big))
    lab, k = label(peak)
    if k == 0:
        return np.zeros((0, 3), np.uint16), off, chm
    # flat tops span several cells: keep one of each
    flat = lab.ravel()
    order = np.argsort(flat, kind='stable')
    first = order[np.searchsorted(flat[order], np.arange(1, k + 1))]
    idx = np.stack(np.unravel_index(first, lab.shape), 1)
    r, q = idx[:, 0], idx[:, 1]
    hh = chm[r, q]
    ok = hh < 42                                    # taller is a cliff edge or a building, not a spruce
    r, q, hh = r[ok], q[ok], hh[ok]
    # the local frame within the tile (m)
    tx, tz = (q + 0.5) / 2, (r + 0.5) / 2
    out = np.stack([np.round(tx / S * 65535), np.round(tz / S * 65535), np.round(np.clip(hh, 0, 60) * 100)], 1)
    return out.astype(np.uint16), off, chm


def main():
    tiles = T['list']
    if ONLY:
        want = {tuple(map(int, t.split(','))) for t in ONLY.split(';')}
        tiles = [t for t in tiles if tuple(t) in want]
    total, done, skipped = 0, 0, 0

    def work(t):
        return t, tile_trees(*t)

    with cf.ThreadPoolExecutor(4) as ex:
        for k, ((i, j), res) in enumerate(ex.map(work, tiles)):
            path = os.path.join(DATA, 'tiles', f't_{i}_{j}.bin')
            if res is None:
                skipped += 1
                if os.path.exists(path):
                    os.remove(path)
            else:
                trees, off, chm = res
                open(path, 'wb').write(trees.astype('<u2').tobytes())
                total += len(trees)
                done += 1
                if DEBUG:
                    out = os.environ.get('DEBUG_DIR', '/tmp')
                    im = Image.fromarray(np.clip(chm * 8, 0, 255).astype(np.uint8)).convert('RGB')
                    px = im.load()
                    for x, z, hc in trees:
                        a, b = int(x / 65535 * 2 * S), int(z / 65535 * 2 * S)
                        for d in (-1, 0, 1):
                            for e in (-1, 0, 1):
                                if 0 <= a + d < 2 * S and 0 <= b + e < 2 * S:
                                    px[a + d, b + e] = (255, 40, 40)
                    im.save(os.path.join(out, f'chm_{i}_{j}.png'))
                    print(i, j, 'offset', round(off, 2), 'trees', len(trees), flush=True)
            if k % 100 == 0:
                print(k, '/', len(tiles), flush=True)
    print('tiles with trees data', done, 'without', skipped, 'trees', total)


if __name__ == '__main__':
    main()
