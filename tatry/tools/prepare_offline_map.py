"""Offline map for the planner on the phone: our own XYZ tiles (Web Mercator, zoom 11-15) of the whole
region, made from the region data (../../region): the 2 m orthophoto, lightly desaturated, under a
hillshade of the 4 m heights, with contour lines (20 m at zoom 15, 50 m at 14, 100 m below; every fifth
bolder) and the lakes. The trails, huts and peaks are drawn on top by the planner itself (vectors).
OpenTopoMap and OpenStreetMap do not allow bulk downloads, so the offline map has to be ours.

Output: ../public/offline/{z}/{x}/{y}.webp and ../public/offline/index.json (tile list for the
"download for offline" button). Run: python3 tools/prepare_offline_map.py
"""
import json
import math
import os
import zlib

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates, binary_dilation

HERE = os.path.dirname(os.path.abspath(__file__))
REGION = os.path.join(HERE, '..', '..', 'region')
OUT = os.path.join(HERE, '..', 'public', 'offline')
ZOOMS = range(11, 16)
QUALITY = 60

# the local frame of tools/prepare.py (x east, z south, metres)
LAT0 = (49.168 + 49.214) / 2
LON0 = (20.040 + 20.112) / 2
MX = 111320 * math.cos(math.radians(LAT0))
MZ = 110574

meta = json.load(open(os.path.join(REGION, 'meta.json')))
B = meta['base']['block']; STEP = meta['base']['step']; BM = B * STEP
rx0, rz0 = meta['base']['bounds'][:2]
blocks = meta['base']['blocks']
nbx = max(b[0] for b in blocks) + 1
nbz = max(b[1] for b in blocks) + 1
PB = 512                                    # photo pixels per block (2 m)
print('blocks', len(blocks), nbx, 'x', nbz)


def unpack(path, n):
    raw = zlib.decompress(open(path, 'rb').read())
    d = np.frombuffer(raw, dtype='<u2', count=n * n).reshape(n, n).astype(np.int32)
    d[:, 1:] = np.where(d[:, 1:] > 32767, d[:, 1:] - 65536, d[:, 1:])
    return np.cumsum(d, axis=1) / 10.0


H = np.full((nbz * B + 1, nbx * B + 1), np.nan, np.float32)
P = np.full((nbz * PB, nbx * PB, 3), 200, np.uint8)
have = np.zeros((nbz * PB, nbx * PB), bool)
for bi, bj in blocks:
    H[bj * B:bj * B + B + 1, bi * B:bi * B + B + 1] = unpack(os.path.join(REGION, 'base', f'h_{bi}_{bj}.bin'), B + 1)
    P[bj * PB:(bj + 1) * PB, bi * PB:(bi + 1) * PB] = np.asarray(Image.open(os.path.join(REGION, 'photo', f'o_{bi}_{bj}.jpg')).convert('RGB'))
    have[bj * PB:(bj + 1) * PB, bi * PB:(bi + 1) * PB] = True
valid = ~np.isnan(H)
Hf = np.where(valid, H, np.nanmean(H))
print('heights', np.nanmin(H), np.nanmax(H))

# hillshade (sun from the north-west, 45 degrees), on slightly smoothed heights
Hs = gaussian_filter(Hf, 1.0)
gy, gx = np.gradient(Hs, STEP)             # d/dz (south), d/dx (east)
az, alt = math.radians(315), math.radians(45)
# light direction in (east, north, up); the z axis points south so north = -gy
lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
nx, ny, nz = -gx, gy, np.ones_like(gx)
shade = np.clip((nx * lx + ny * ly + nz * lz) / np.sqrt(nx * nx + ny * ny + nz * nz), 0, 1).astype(np.float32)
del gx, gy, nx, ny, nz

# lakes as a mask at the photo resolution
lake_im = Image.new('L', (nbx * PB, nbz * PB), 0)
dr = ImageDraw.Draw(lake_im)
for lk in meta['lakes']:
    dr.polygon([((x - rx0) / 2, (z - rz0) / 2) for x, z in lk['ring']], fill=255)
lake = np.asarray(lake_im, np.float32) / 255
lake = gaussian_filter(lake, 0.7)


def tile_bounds_xy(z):
    lon0, lon1 = LON0 + rx0 / MX, LON0 + (rx0 + nbx * BM) / MX
    lat1, lat0 = LAT0 - rz0 / MZ, LAT0 - (rz0 + nbz * BM) / MZ
    n = 2 ** z
    tx = lambda lon: int((lon + 180) / 360 * n)
    ty = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return tx(lon0), tx(lon1), ty(lat1), ty(lat0)


def contour_lines(h, interval, width_major):
    band = np.floor(h / interval)
    edge = np.zeros(h.shape, bool)
    edge[:, :-1] |= band[:, :-1] != band[:, 1:]
    edge[:-1, :] |= band[:-1, :] != band[1:, :]
    major = np.zeros(h.shape, bool)
    b5 = np.floor(h / (interval * 5))
    major[:, :-1] |= b5[:, :-1] != b5[:, 1:]
    major[:-1, :] |= b5[:-1, :] != b5[1:, :]
    if width_major > 1:
        major = binary_dilation(major)
    return edge & ~major, major


index = {'zooms': list(ZOOMS), 'tiles': [], 'format': 'webp'}
total = 0
for z in ZOOMS:
    x0, x1, y0, y1 = tile_bounds_xy(z)
    n = 2 ** z
    interval = 20 if z >= 15 else 50 if z == 14 else 100
    cnt = 0
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            px = (np.arange(256) + 0.5) / 256
            lon = (tx + px) / n * 360 - 180
            lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (ty + px) / n))))
            LON, LAT = np.meshgrid(lon, lat)
            X = (LON - LON0) * MX
            Z = -(LAT - LAT0) * MZ
            # photo (2 m) and height (4 m) grid coordinates
            pc, pr = (X - rx0) / 2 - 0.5, (Z - rz0) / 2 - 0.5
            hc, hr = (X - rx0) / STEP, (Z - rz0) / STEP
            inside = map_coordinates(have.astype(np.float32), [pr, pc], order=0, mode='constant', cval=0) > 0.5
            if not inside.any():
                continue
            col = np.stack([map_coordinates(P[..., c], [pr, pc], order=1, mode='nearest') for c in range(3)], -1).astype(np.float32) / 255
            h = map_coordinates(Hf, [hr, hc], order=1, mode='nearest')
            sh = map_coordinates(shade, [hr, hc], order=1, mode='nearest')
            lk = map_coordinates(lake, [pr, pc], order=1, mode='constant', cval=0)
            # a light, slightly desaturated photo under the relief shading
            g = col @ np.array([0.3, 0.59, 0.11], np.float32)
            col = col * 0.72 + g[..., None] * 0.28
            col = np.clip(col * 1.12 + 0.06, 0, 1)
            col = col * (0.5 + 0.62 * sh[..., None])
            col = col * (1 - lk[..., None] * 0.75) + np.array([0.45, 0.66, 0.85], np.float32) * lk[..., None] * 0.75
            minor, major = contour_lines(h, interval, 2 if z >= 14 else 1)
            ink = np.array([0.42, 0.26, 0.12], np.float32)
            a = np.where(major, 0.75, np.where(minor, 0.4, 0.0))[..., None] * (1 - lk[..., None])
            col = col * (1 - a) + ink * a
            rgba = np.concatenate([np.clip(col, 0, 1) * 255, inside[..., None] * 255.0], -1).astype(np.uint8)
            os.makedirs(os.path.join(OUT, str(z), str(tx)), exist_ok=True)
            fn = os.path.join(OUT, str(z), str(tx), f'{ty}.webp')
            Image.fromarray(rgba, 'RGBA').save(fn, quality=QUALITY, method=4)
            total += os.path.getsize(fn)
            index['tiles'].append([z, tx, ty])
            cnt += 1
    print('zoom', z, cnt, 'tiles', round(total / 1e6, 1), 'MB so far', flush=True)

lon0, lon1 = LON0 + rx0 / MX, LON0 + (rx0 + nbx * BM) / MX
lat1, lat0 = LAT0 - rz0 / MZ, LAT0 - (rz0 + nbz * BM) / MZ
index['bounds'] = [round(lon0, 5), round(lat0, 5), round(lon1, 5), round(lat1, 5)]
index['bytes'] = total
json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
print('offline map', len(index['tiles']), 'tiles', round(total / 1e6, 1), 'MB')
