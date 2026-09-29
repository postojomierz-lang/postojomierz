#!/usr/bin/env python3
"""Export the Rysy 3D data (tatry/public/data) for Unreal Engine 5.

Writes ue5/export/:
  heightmap.png            16-bit grayscale, 4033 x 4033 (a standard UE landscape size), 1.3 m per sample
  landscape.json           exact Landscape import numbers, coordinate frame, file list
  ortho.jpg                8192 x 8192 colour photo of the whole landscape (0.64 m per pixel)
  masks_[abc].png          2048 x 2048 RGB layer masks sampled by the landscape material
                           a = rock, scree, grass; b = forest floor, dwarf pine, path; c = snow, lake
  weights/w_<layer>.png    8-bit weight maps at the heightmap resolution (optional paint-layer import)
  trail.csv, lakes.json, buildings.json, signposts.json
  foliage_spruce.csv, foliage_dwarfpine.csv, rocks.csv
  textures/                CC0 Poly Haven ground textures used as default layer textures

Coordinates: our local metres (x = east, z = south, height up) -> UE centimetres
  UE X = x * 100 (east), UE Y = z * 100 (south), UE Z = height * 100 (real altitude above sea level).
UE is left-handed Z-up; X east + Y south + Z up is left-handed as well, so nothing is mirrored.
North is -Y in the editor.

Run from the repository root:  python3 ue5/tools/export_ue5.py
Needs numpy, scipy, Pillow.
"""
import csv
import json
import math
import os
import shutil
import zlib

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'tatry', 'public', 'data')
TEX_SRC = os.path.join(ROOT, 'tatry', 'public', 'textures')
OUT = os.path.join(ROOT, 'ue5', 'export')

N = 4033                 # landscape samples per side (63 quads/section, 2x2 sections, 32x32 components)
QUADS = N - 1
STEP = 1.3               # metres per sample -> UE scale X/Y = 130
EXT = QUADS * STEP       # 5241.6 m
X0 = Z0 = -EXT / 2       # landscape corner in our frame (centred on the Rysy area origin)
ORTHO_PX = 8192
MASK_PX = 2048

meta = json.load(open(os.path.join(DATA, 'meta.json')))
IB = meta['inner']['bounds']


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ data readers
def unpack_heights(path, w, h):
    raw = zlib.decompress(open(path, 'rb').read())
    d = np.frombuffer(raw, dtype='<u2', count=w * h).reshape(h, w).astype(np.int32)
    d[:, 1:] = np.where(d[:, 1:] > 32767, d[:, 1:] - 65536, d[:, 1:])
    v = np.cumsum(d, axis=1) / 10.0
    mask = None
    if len(raw) >= w * h * 3:
        mask = np.frombuffer(raw, dtype=np.uint8, offset=w * h * 2, count=w * h).reshape(h, w)
    return v, mask


def sample(grid, bounds, xs, zs, order=1):
    """Grid with samples on the bounds' corners (as terrain.js Grid)."""
    h, w = grid.shape
    x0, z0, x1, z1 = bounds
    fx = (xs - x0) / (x1 - x0) * (w - 1)
    fz = (zs - z0) / (z1 - z0) * (h - 1)
    return map_coordinates(grid, [fz, fx], order=order, mode='nearest')


gx = X0 + np.arange(N) * STEP
gz = Z0 + np.arange(N) * STEP
GX, GZ = np.meshgrid(gx, gz)      # row = z (south), column = x (east)

# ------------------------------------------------------------------ heights
print('heights: base grid, outer DEM, 1 m tiles')
bn = meta['base']['n']
base, dtm = unpack_heights(os.path.join(DATA, 'inner4.bin'), bn[0], bn[1])
on = meta['outer']['n']
outer = np.fromfile(os.path.join(DATA, 'outer.u16'), dtype='<u2').reshape(on[1], on[0]).astype(np.float64) / 10
h_in = sample(base, meta['base']['bounds'], GX, GZ, 1)
h_out = sample(outer, meta['outer']['bounds'], GX, GZ, 3)
edge = np.minimum.reduce([GX - IB[0], IB[2] - GX, GZ - IB[1], IB[3] - GZ])
t = smoothstep(0, 60, edge)
H = h_out + (h_in - h_out) * t

T = meta['tiles']
tile_h = np.zeros_like(H)
cover = np.zeros(H.shape, bool)
for i, j in T['list']:
    tx0 = T['origin'][0] + i * T['size']
    tz0 = T['origin'][1] + j * T['size']
    th, _ = unpack_heights(os.path.join(DATA, 'tiles', f'h_{i}_{j}.bin'), T['samples'], T['samples'])
    c0 = max(0, int(math.ceil((tx0 - X0) / STEP)))
    c1 = min(N - 1, int(math.floor((tx0 + T['size'] - X0) / STEP)))
    r0 = max(0, int(math.ceil((tz0 - Z0) / STEP)))
    r1 = min(N - 1, int(math.floor((tz0 + T['size'] - Z0) / STEP)))
    if c1 < c0 or r1 < r0:
        continue
    sub = (slice(r0, r1 + 1), slice(c0, c1 + 1))
    tile_h[sub] = sample(th, [tx0, tz0, tx0 + T['size'], tz0 + T['size']], GX[sub], GZ[sub], 1)
    cover[sub] = True
# feather the 1 m tiles into the 4 m grid over 10 m (no steps at the tile borders)
wt = smoothstep(0, 10, distance_transform_edt(cover) * STEP)
H = H * (1 - wt) + tile_h * wt
H_raw = H.copy()


# ------------------------------------------------------------------ helpers on the grid
def to_px(pts):
    """our (x, z) -> heightmap pixel coords (col, row) as floats."""
    return [((x - X0) / STEP, (z - Z0) / STEP) for x, z in pts]


def raster(draw_fn):
    im = Image.new('L', (N, N), 0)
    draw_fn(ImageDraw.Draw(im))
    return np.asarray(im) > 0


# lakes inside the landscape: lower the bed so a water plane at the lake level reads
lakes_in = []
for lk in meta['lakes']:
    r = np.array(lk['ring'])
    if r[:, 0].max() < X0 or r[:, 0].min() > -X0 or r[:, 1].max() < Z0 or r[:, 1].min() > -Z0:
        continue
    lakes_in.append(lk)
lake_mask = np.zeros(H.shape, bool)
for lk in lakes_in:
    inside = raster(lambda g: g.polygon(to_px(lk['ring']), fill=255, outline=255))
    lake_mask |= inside
    d_in = distance_transform_edt(inside) * STEP
    d_out = distance_transform_edt(~inside) * STEP
    lvl = lk['level']
    bed = lvl - (0.4 + np.minimum(10, d_in * 0.12))
    H = np.where(inside, np.minimum(H, bed), H)
    # the shore line is drawn by the terrain, not by the water squares: a 1 m strip just under the
    # water, then the ground rises above the level for the next 3 m (the squares reach 1.5-3.5 m out
    # and their stepped edge stays hidden under it)
    # a smooth ramp on a smoothed signed distance (no 1.3 m raster steps in the shore line): under the
    # water up to ~3 m out, then above it; the water squares reach 5 m out and stay hidden
    sd = gaussian_filter(d_out - d_in, 1.5)
    ramp = lvl - 0.25 + 0.085 * sd
    band = (sd > -1) & (sd < 6)
    H = np.where(band & (ramp < lvl), np.minimum(H, ramp), H)
    H = np.where(band & (ramp >= lvl), np.maximum(H, ramp), H)
print('lakes in the landscape:', [lk['name'] for lk in lakes_in])

# terraces under the buildings (same rule as tatry/src/buildings.js: 70th percentile of the footprint)
bld_out = []
for b in meta['buildings']:
    rot = b['a'] - math.pi / 2
    c, s = math.cos(rot), math.sin(rot)
    pts = []
    for ii in np.arange(-1, 1.01, 0.5):
        for jj in np.arange(-1, 1.01, 0.5):
            pts.append((b['x'] + ii * b['w'] / 2 * c + jj * b['d'] / 2 * s, b['z'] - ii * b['w'] / 2 * s + jj * b['d'] / 2 * c))
    pts = np.array(pts)
    hs = np.sort(map_coordinates(H, [(pts[:, 1] - Z0) / STEP, (pts[:, 0] - X0) / STEP], order=1))
    level = float(hs[int(len(hs) * 0.7)])
    gmin = float(hs[0])
    W, D, bl = b['w'] + 1, b['d'] + 1, 3.0
    r = max(W, D) / 2 + bl + 2
    c0, c1 = int((b['x'] - r - X0) / STEP), int((b['x'] + r - X0) / STEP) + 1
    r0, r1 = int((b['z'] - r - Z0) / STEP), int((b['z'] + r - Z0) / STEP) + 1
    sub = (slice(max(0, r0), min(N, r1)), slice(max(0, c0), min(N, c1)))
    dx, dz = GX[sub] - b['x'], GZ[sub] - b['z']
    u = np.abs(dx * c - dz * s) - W / 2
    v = np.abs(dx * s + dz * c) - D / 2
    o = np.maximum(u, v)
    k = np.where(o <= 0, 1.0, np.clip(1 - o / bl, 0, 1))
    k = k * k * (3 - 2 * k)
    H[sub] = H[sub] + (level - H[sub]) * k
    bld_out.append((b, level, gmin, rot))


def height_at(x, z):
    x, z = np.asarray(x, float), np.asarray(z, float)
    r = map_coordinates(H, [np.atleast_1d(z - Z0) / STEP, np.atleast_1d(x - X0) / STEP], order=1, mode='nearest')
    return r.reshape(x.shape)


# ------------------------------------------------------------------ heightmap + import numbers
hmin, hmax = float(H.min()), float(H.max())
lo = math.floor(hmin / 10) * 10 - 10
hi = math.ceil(hmax / 10) * 10 + 10
zscale = math.ceil((hi - lo) / 512 * 100 * 10) / 10          # UE Z scale: 100 = 512 m of range
mid = round((lo + hi) / 2, 2)
v16 = np.clip(np.round(32768 + (H - mid) * 12800 / zscale), 0, 65535).astype(np.uint16)
os.makedirs(OUT, exist_ok=True)
Image.fromarray(v16).save(os.path.join(OUT, 'heightmap.png'), optimize=True)
back = np.asarray(Image.open(os.path.join(OUT, 'heightmap.png'))).astype(np.float64)
recon = mid + (back - 32768) / 128 * zscale / 100
print('heightmap', H.shape, 'height', round(hmin, 1), '-', round(hmax, 1), 'm; Z scale', zscale,
      '; max round-trip error', round(float(np.abs(recon - H).max()) * 100, 2), 'cm')

loc_corner = [X0 * 100, Z0 * 100, mid * 100]

# ------------------------------------------------------------------ orthophoto 8192
print('orthophoto')
S = EXT / ORTHO_PX


def affine_img(img, bounds, size, px0=0, pz0=0):
    """Resample img (covering bounds, edge-aligned pixels) to output pixels of size S starting at
    output pixel (px0, pz0); returns uint8 array."""
    x0, z0, x1, z1 = bounds
    ax = (x1 - x0) / img.width
    az = (z1 - z0) / img.height
    data = (S / ax, 0, (X0 + px0 * S - x0) / ax, 0, S / az, (Z0 + pz0 * S - z0) / az)
    return np.asarray(img.transform(size, Image.AFFINE, data, resample=Image.BICUBIC))


inner_img = Image.open(os.path.join(DATA, 'inner.jpg')).convert('RGB')
outer_img = Image.open(os.path.join(DATA, 'outer.jpg')).convert('RGB')
photo = affine_img(inner_img, IB, (ORTHO_PX, ORTHO_PX)).copy()
ocent = X0 + (np.arange(ORTHO_PX) + 0.5) * S
out_x = (ocent < IB[0]) | (ocent > IB[2])
out_z = (ocent < IB[1]) | (ocent > IB[3])
if out_x.any() or out_z.any():
    op = affine_img(outer_img, meta['outer']['bounds'], (ORTHO_PX, ORTHO_PX))
    m = out_z[:, None] | out_x[None, :]
    photo[m] = op[m]
    del op

# 0.5 m tiles: composed at full resolution, feathered in over 12 m
tiles_img = np.zeros_like(photo)
tcov = np.zeros((MASK_PX, MASK_PX), bool)
for i, j in T['list']:
    tx0 = T['origin'][0] + i * T['size']
    tz0 = T['origin'][1] + j * T['size']
    u0 = max(0, int(math.ceil((tx0 - X0) / S - 0.5)))
    u1 = min(ORTHO_PX, int(math.floor((tx0 + T['size'] - X0) / S - 0.5)) + 1)
    v0 = max(0, int(math.ceil((tz0 - Z0) / S - 0.5)))
    v1 = min(ORTHO_PX, int(math.floor((tz0 + T['size'] - Z0) / S - 0.5)) + 1)
    if u1 <= u0 or v1 <= v0:
        continue
    im = Image.open(os.path.join(DATA, 'tiles', f'o_{i}_{j}.jpg')).convert('RGB')
    tiles_img[v0:v1, u0:u1] = affine_img(im, [tx0, tz0, tx0 + T['size'], tz0 + T['size']], (u1 - u0, v1 - v0), u0, v0)
    f = ORTHO_PX // MASK_PX
    tcov[int(math.ceil(v0 / f)):v1 // f, int(math.ceil(u0 / f)):u1 // f] = True
tw = smoothstep(0, 12, distance_transform_edt(tcov) * (EXT / MASK_PX)).astype(np.float32)
tw = np.asarray(Image.fromarray(tw).resize((ORTHO_PX, ORTHO_PX), Image.BILINEAR))
for r0 in range(0, ORTHO_PX, 1024):
    w_ = tw[r0:r0 + 1024, :, None]
    photo[r0:r0 + 1024] = np.clip(photo[r0:r0 + 1024] * (1 - w_) + tiles_img[r0:r0 + 1024] * w_ + 0.5, 0, 255).astype(np.uint8)
del tiles_img, tw
photo_img = Image.fromarray(photo)
photo_img.save(os.path.join(OUT, 'ortho.jpg'), quality=87, optimize=True)
# photo at the vertex positions, for the layer rules and for foliage
small = np.asarray(photo_img.resize((4096, 4096), Image.BOX)).astype(np.int32)
del photo, photo_img


def photo_at(x, z):
    u = np.clip(((np.asarray(x) - X0) / EXT * 4096).astype(int), 0, 4095)
    v = np.clip(((np.asarray(z) - Z0) / EXT * 4096).astype(int), 0, 4095)
    return small[v, u]


# ------------------------------------------------------------------ layer weights
print('layer weights')
Hs = gaussian_filter(H, 1.5)
dz_, dx_ = np.gradient(Hs, STEP)            # ground normal for foliage
# slope for the layers over ~4 m: the lidar's stones and the canopy of the surface model are not cliffs
sz3, sx3 = np.gradient(gaussian_filter(H, 3.0), STEP)
slope = np.degrees(np.arctan(np.hypot(sx3, sz3)))
lc_img = np.asarray(Image.open(os.path.join(DATA, 'landcover.png')))
LW = lc_img.shape[1]; LH = lc_img.shape[0]
li = np.clip(((GX - IB[0]) / (IB[2] - IB[0]) * LW).astype(int), 0, LW - 1)
lj = np.clip(((GZ - IB[1]) / (IB[3] - IB[1]) * LH).astype(int), 0, LH - 1)
lc = lc_img[lj, li]
lc = np.where(edge < 0, 0, lc)            # no land cover outside the inner area
P = photo_at(GX, GZ)
R_, G_, B_ = P[..., 0], P[..., 1], P[..., 2]
green = (G_ > R_ + 4) & (G_ > B_ + 6) & (R_ + G_ + B_ < 260)
lum = (R_ + G_ + B_) / 3
grey = ((np.max(P, -1) - np.min(P, -1)) < 22) & (lum > 105)

forest = ((lc == 10) & (H < 1600)).astype(np.float64)
pine = ((lc == 20) | ((lc == 10) & (H >= 1600)) | (green & (H > 1450) & (H < 1950) & (slope < 38))).astype(np.float64)
grass = (((lc == 30) | ((lc == 100) & (H < 2150))) & ~green).astype(np.float64) * 0.9
scree = ((lc == 60) | ((lc == 100) & (H >= 2150)) | (lc == 80)).astype(np.float64) + grey * 0.8 + 0.02
scree[lake_mask] = 3
raw = [gaussian_filter(a, 3) for a in (scree, grass, forest, pine)]
veg = np.clip(raw[2] + raw[3], 0, 1)
rock = smoothstep(33, 46, slope) * (1 - 0.7 * veg)
tot = np.maximum(sum(raw), 1e-6)
d_trail = distance_transform_edt(~raster(lambda g: g.line(to_px(meta['trail']), fill=255, width=1))) * STEP
path = 1 - smoothstep(0.9, 2.0, d_trail)
rest = (1 - rock) * (1 - path)
layers = {'rock': rock * (1 - path), 'scree': raw[0] / tot * rest, 'grass': raw[1] / tot * rest,
          'forest': raw[2] / tot * rest, 'dwarfpine': raw[3] / tot * rest, 'path': path}
names = list(layers)
stack = np.stack([layers[k] for k in names]) * 255
q = np.floor(stack).astype(np.int32)
rem = 255 - q.sum(0)                       # exact 255 per sample: the remainder to the biggest layer
big = np.argmax(stack, axis=0)
np.put_along_axis(q, big[None], np.take_along_axis(q, big[None], 0) + rem[None], 0)
snow = smoothstep(1950, 2150, H) * (1 - smoothstep(25, 40, slope))
lake_soft = gaussian_filter(lake_mask.astype(np.float64), 1)
os.makedirs(os.path.join(OUT, 'weights'), exist_ok=True)
for k, arr in zip(names, q):
    Image.fromarray(arr.astype(np.uint8)).save(os.path.join(OUT, 'weights', f'w_{k}.png'), optimize=True)
Image.fromarray(np.round(snow * 255).astype(np.uint8)).save(os.path.join(OUT, 'weights', 'w_snow.png'), optimize=True)
Image.fromarray(np.round(lake_soft * 255).astype(np.uint8)).save(os.path.join(OUT, 'weights', 'w_lake.png'), optimize=True)

# packed masks for the material: texel centres at (k + 0.5) / 2048 of the landscape
kc = (np.arange(MASK_PX) + 0.5) * (EXT / MASK_PX) / STEP
MR, MC = np.meshgrid(kc, kc, indexing='ij')


def to_mask(a):
    return np.clip(np.round(map_coordinates(a.astype(np.float32), [MR, MC], order=1, mode='nearest')), 0, 255).astype(np.uint8)


qa = dict(zip(names, q))
# RGB only: UE fills the colour of fully transparent PNG pixels on import, so no alpha channel
zero = np.zeros((MASK_PX, MASK_PX), np.uint8)
Image.fromarray(np.stack([to_mask(qa['rock']), to_mask(qa['scree']), to_mask(qa['grass'])], -1), 'RGB') \
    .save(os.path.join(OUT, 'masks_a.png'), optimize=True)
Image.fromarray(np.stack([to_mask(qa['forest']), to_mask(qa['dwarfpine']), to_mask(qa['path'])], -1), 'RGB') \
    .save(os.path.join(OUT, 'masks_b.png'), optimize=True)
Image.fromarray(np.stack([to_mask(snow * 255), to_mask(lake_soft * 255), zero], -1), 'RGB') \
    .save(os.path.join(OUT, 'masks_c.png'), optimize=True)


# ------------------------------------------------------------------ vector data in UE coordinates
def ue(x, z, h):
    return round(float(x) * 100, 1), round(float(z) * 100, 1), round(float(h) * 100, 1)


# trail
tr = np.array(meta['trail'])
th = height_at(tr[:, 0], tr[:, 1])
dist = np.concatenate([[0], np.cumsum(np.hypot(np.diff(tr[:, 0]), np.diff(tr[:, 1])))])
with open(os.path.join(OUT, 'trail.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['x', 'y', 'z', 'dist_m'])
    for (x, z), h, d in zip(tr, th, dist):
        w.writerow([*ue(x, z, h + 0.05), round(float(d), 1)])
print('trail', len(tr), 'points,', round(float(dist[-1])), 'm, from', round(float(th[0])), 'to', round(float(th[-1])), 'm')


# lakes: water planes as a quadtree of squares covering the ring grown by 3.2-5 m
def lake_cells(ring):
    from shapely.geometry import Polygon, box
    from shapely.prepared import prep
    poly = Polygon(ring).buffer(0)
    full, touch = prep(poly.buffer(5.0)), prep(poly.buffer(3.2))
    minx, minz, maxx, maxz = poly.bounds
    size = 64.0
    cells, todo = [], []
    x = math.floor(minx / size) * size
    while x < maxx + 2:
        z = math.floor(minz / size) * size
        while z < maxz + 2:
            todo.append((x, z, size))
            z += size
        x += size
    while todo:
        x, z, s = todo.pop()
        b = box(x, z, x + s, z + s)
        if full.contains(b):
            cells.append((x + s / 2, z + s / 2, s))
        elif s > 2.0 and touch.intersects(b):
            h2 = s / 2
            todo += [(x, z, h2), (x + h2, z, h2), (x, z + h2, h2), (x + h2, z + h2, h2)]
        elif s <= 2.0 and touch.intersects(b):
            cells.append((x + s / 2, z + s / 2, s))
    return cells


lakes_json = []
for lk in lakes_in:
    cells = lake_cells(lk['ring'])
    lakes_json.append({'name': lk['name'], 'level_cm': round(lk['level'] * 100, 1),
                       'ring': [[round(x * 100, 1), round(z * 100, 1)] for x, z in lk['ring']],
                       'cells': [[round(x * 100, 1), round(z * 100, 1), round(s * 100, 1)] for x, z, s in cells]})
json.dump({'note': 'UE cm; cells = [centre X, centre Y, side] squares of a water plane at level_cm',
           'lakes': lakes_json}, open(os.path.join(OUT, 'lakes.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

# buildings (floor height and plinth as in tatry/src/buildings.js, roughly)
FLOOR_H = {'hut': 3.0, 'old_hut': 2.8, 'stone_hut': 2.8, 'house': 2.8, 'szalas': 2.3}
bj = []
for b, level, gmin, rot in bld_out:
    wall = FLOOR_H.get(b['style'], 2.8) * (b.get('floors') or 1) * (0.8 if b['style'] == 'old_hut' else 1)
    bj.append({'name': b['name'], 'style': b['style'], 'floors': b.get('floors') or 1,
               'x': round(b['x'] * 100, 1), 'y': round(b['z'] * 100, 1),
               'z_ground': round(level * 100, 1), 'z_base': round((gmin - 0.5) * 100, 1),
               'width': round(b['w'] * 100, 1), 'depth': round(b['d'] * 100, 1),
               'wall_height': round((level - gmin + 0.5 + 0.4 + wall) * 100, 1),
               'yaw': round(-math.degrees(rot), 2)})
json.dump({'note': 'UE cm / degrees. Box from z_base up by wall_height, width along the local X (ridge), '
                   'depth along local Y, rotated by yaw about Z.', 'buildings': bj},
          open(os.path.join(OUT, 'buildings.json'), 'w'), ensure_ascii=False, indent=1)


def in_house(x, z, margin):
    x = np.asarray(x); z = np.asarray(z)
    out = np.zeros(x.shape, bool)
    for b, _, _, rot in bld_out:
        c, s = math.cos(rot), math.sin(rot)
        dx, dz = x - b['x'], z - b['z']
        out |= (np.abs(dx * c - dz * s) < b['w'] / 2 + margin) & (np.abs(dx * s + dz * c) < b['d'] / 2 + margin)
    return out


# signposts
def nearest(px, pz, i0=0):
    d = np.hypot(tr[i0:, 0] - px, tr[i0:, 1] - pz)
    return i0 + int(np.argmin(d))


def yaw_at(i):
    """UE yaw of the direction the hiker comes from (the text faces an approaching walker)."""
    a, b = max(0, i - 3), min(len(tr) - 1, i + 3)
    dx, dz = tr[a, 0] - tr[b, 0], tr[a, 1] - tr[b, 1]
    return round(math.degrees(math.atan2(dz, dx)), 1)


cs = next(lk for lk in meta['lakes'] if lk['name'] == 'Czarny Staw pod Rysami')
cr = np.array(cs['ring'])
i_cs = int(np.argmin([np.min(np.hypot(cr[:, 0] - x, cr[:, 1] - z)) for x, z in tr]))
above = np.arange(len(tr)) > i_cs
i_bula = int(np.argmin(np.where(above, np.abs(th - 2054), 1e9)))
posts = [('Morskie Oko', 'Schronisko PTTK - 1405 m n.p.m.', 0),
         ('Czarny Staw pod Rysami', '1583 m n.p.m.', i_cs),
         ('Bula pod Rysami', '2054 m n.p.m.', i_bula),
         ('Rysy', '2499 m n.p.m.', len(tr) - 1)]
sp = []
for name, sub, i in posts:
    x, z = tr[i]
    # a couple of metres beside the path, on its right
    a, b = max(0, i - 3), min(len(tr) - 1, i + 3)
    dx, dz = tr[b, 0] - tr[a, 0], tr[b, 1] - tr[a, 1]
    L = math.hypot(dx, dz) or 1
    ox, oz = x - dz / L * 4.0, z + dx / L * 4.0
    sp.append({'name': name, 'subtitle': sub, 'trail_index': i, 'x': round(ox * 100, 1), 'y': round(oz * 100, 1),
               'z': round(float(height_at(ox, oz)) * 100, 1), 'yaw': yaw_at(i),
               'trail_distance_m': round(float(dist[i])), 'terrain_m': round(float(th[i]))})
json.dump({'note': 'UE cm; yaw = direction the sign text faces (towards the approaching hiker)', 'signposts': sp},
          open(os.path.join(OUT, 'signposts.json'), 'w'), ensure_ascii=False, indent=1)
print('signposts', [(s['name'], s['terrain_m']) for s in sp])

# ------------------------------------------------------------------ foliage (mirrors tatry/src/main.js)
print('foliage')
rng = np.random.default_rng(7)
nrm_z = 1 / np.sqrt(1 + dx_ ** 2 + dz_ ** 2)       # up component of the ground normal (smoothed)


def grid_at(a, x, z):
    x, z = np.asarray(x, float), np.asarray(z, float)
    r = map_coordinates(a, [np.atleast_1d(z - Z0) / STEP, np.atleast_1d(x - X0) / STEP], order=1, mode='nearest')
    return r.reshape(x.shape)


def keep_clear(x, z, trail_m, house_m):
    ok = (grid_at(d_trail, x, z) > trail_m) & (grid_at(lake_mask.astype(np.float32), x, z) < 0.02)
    ok &= (x > X0 + 2) & (x < -X0 - 2) & (z > Z0 + 2) & (z < -Z0 - 2)
    return ok & ~in_house(x, z, house_m)


px_, pz_ = (IB[2] - IB[0]) / LW, (IB[3] - IB[1]) / LH
jj, ii = np.nonzero(np.isin(lc_img, [10, 20, 30]))
cls = lc_img[jj, ii]
tries = np.where(cls == 20, 2, 1)
jj, ii, cls = np.repeat(jj, tries), np.repeat(ii, tries), np.repeat(cls, tries)
keep = rng.random(len(cls)) < np.where(cls == 30, 0.27, 0.9)
jj, ii, cls = jj[keep], ii[keep], cls[keep]
fx = IB[0] + (ii + rng.random(len(ii))) * px_
fz = IB[1] + (jj + rng.random(len(jj))) * pz_
ok = keep_clear(fx, fz, 8, np.where(cls == 10, 6, 2))
ok &= ~((cls == 10) & (grid_at(d_trail, fx, fz) < 11))
fx, fz, cls = fx[ok], fz[ok], cls[ok]
fh = height_at(fx, fz)
ny = grid_at(nrm_z, fx, fz)
is_spruce = (cls == 10) & (fh < 1560)
is_pine = ~is_spruce & ~((cls == 30) & ((fh < 1530) | (fh > 1820))) & (fh < 1950) & (ny > 0.8)
# the Copernicus surface model (where there is no lidar) includes the canopy: sink those trees
bi = np.clip(np.round((fx - IB[0]) / (IB[2] - IB[0]) * (bn[0] - 1)).astype(int), 0, bn[0] - 1)
bj_ = np.clip(np.round((fz - IB[1]) / (IB[3] - IB[1]) * (bn[1] - 1)).astype(int), 0, bn[1] - 1)
canopy = dtm[bj_, bi] == 0 if dtm is not None else np.zeros(len(fx), bool)

sx, sz_, sh, scan = fx[is_spruce], fz[is_spruce], fh[is_spruce], canopy[is_spruce]
high = np.clip((sh - 1430) / 120, 0, 1)
young = rng.random(len(sx)) < 0.12 + 0.6 * high
tgt = np.where(young, 4 + rng.random(len(sx)) * 5, (1 - 0.35 * high) * (17 + rng.random(len(sx)) * 13))
sz_ground = sh - np.where(scan, tgt * 0.4, 0.3)
with open(os.path.join(OUT, 'foliage_spruce.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['x', 'y', 'z', 'yaw', 'height_m'])
    for x, z, h, y_, t_ in zip(sx, sz_, sz_ground, rng.random(len(sx)) * 360, tgt):
        w.writerow([*ue(x, z, h), round(float(y_), 1), round(float(t_), 2)])
print('spruce', len(sx))

# dwarf pine: land cover points (1-3 clumps each) plus dark saturated green on the photo near the trail
px0, pz0 = fx[is_pine], fz[is_pine]
G5 = 5.0
cand_x, cand_z = np.meshgrid(np.arange(X0, -X0, G5), np.arange(Z0, -Z0, G5))
cand_x = cand_x.ravel() + (rng.random(cand_x.size) - 0.5) * G5
cand_z = cand_z.ravel() + (rng.random(cand_z.size) - 0.5) * G5
dt = grid_at(d_trail, cand_x, cand_z)
sel = (dt < 420) & (rng.random(cand_x.size) < np.clip(1.15 - dt / 420, 0.25, 1))
cand_x, cand_z = cand_x[sel], cand_z[sel]
pc = photo_at(cand_x, cand_z)
g_ok = (pc[:, 1] > pc[:, 0] + 4) & (pc[:, 1] > pc[:, 2] + 6) & (pc.sum(1) < 260)
ch = height_at(cand_x, cand_z)
g_ok &= (ch > 1500) & (ch < 1950) & (grid_at(nrm_z, cand_x, cand_z) > 0.75) & keep_clear(cand_x, cand_z, 4, 2)
px0 = np.concatenate([px0, cand_x[g_ok]])
pz0 = np.concatenate([pz0, cand_z[g_ok]])
ph0 = height_at(px0, pz0)
hi_ = np.clip((ph0 - 1650) / 250, 0, 1)
m = 1 + np.floor(rng.random(len(px0)) * 3 * (1 - 0.5 * hi_)).astype(int)
qx = np.repeat(px0, m) + (rng.random(m.sum()) - 0.5) * 7
qz = np.repeat(pz0, m) + (rng.random(m.sum()) - 0.5) * 7
qh_hi = np.repeat(hi_, m)
okp = keep_clear(qx, qz, 2.5, 1.5)
qx, qz, qh_hi = qx[okp], qz[okp], qh_hi[okp]
qh = height_at(qx, qz)
ph = (1.3 + rng.random(len(qx)) * 1.4) * (1 - 0.4 * qh_hi)
with open(os.path.join(OUT, 'foliage_dwarfpine.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['x', 'y', 'z', 'yaw', 'height_m'])
    for x, z, h, y_, t_ in zip(qx, qz, qh - 0.15, rng.random(len(qx)) * 360, ph):
        w.writerow([*ue(x, z, h), round(float(y_), 1), round(float(t_), 2)])
print('dwarf pine', len(qx))

# boulders and scree near the trail
cnt = 16000
ti = rng.integers(0, len(tr) - 1, cnt * 6)
tt = rng.random(cnt * 6)
bx = tr[ti, 0] + (tr[ti + 1, 0] - tr[ti, 0]) * tt
bz = tr[ti, 1] + (tr[ti + 1, 1] - tr[ti, 1]) * tt
d = 2.5 + rng.random(cnt * 6) ** 2.6 * 220
a = rng.random(cnt * 6) * 2 * math.pi
bx, bz, d = bx + np.cos(a) * d, bz + np.sin(a) * d, d
pc = photo_at(bx, bz)
okr = ~((pc[:, 1] > pc[:, 0] + 6) & (pc[:, 1] > pc[:, 2])) & ~((pc > 200).all(1))
okr &= keep_clear(bx, bz, 1.8, 1.5)
nz_ = grid_at(nrm_z, bx, bz)
okr &= nz_ > 0.55
bx, bz, d, nz_ = bx[okr][:cnt], bz[okr][:cnt], d[okr][:cnt], nz_[okr][:cnt]
size = (0.3 + rng.random(len(bx)) ** 3 * np.where(d < 8, 0.8, 2.8)) * np.minimum(1, (nz_ - 0.45) * 2.5)
nx_ = -grid_at(dx_, bx, bz) * nz_
ny_ = -grid_at(dz_, bx, bz) * nz_
bh = height_at(bx, bz)
with open(os.path.join(OUT, 'rocks.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['x', 'y', 'z', 'yaw', 'size_m', 'nx', 'ny', 'nz'])
    for x, z, h, y_, s_, a_, b_, c_ in zip(bx, bz, bh, rng.random(len(bx)) * 360, size, nx_, ny_, nz_):
        w.writerow([*ue(x, z, h), round(float(y_), 1), round(float(s_), 2), round(float(a_), 3), round(float(b_), 3), round(float(c_), 3)])
print('rocks', len(bx))

# ------------------------------------------------------------------ default layer textures (Poly Haven, CC0)
os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)
for nm in ['rock_04', 'rocky_terrain_02', 'forrest_ground_01', 'rocky_trail']:
    for kind in ('diff', 'nor'):
        shutil.copyfile(os.path.join(TEX_SRC, f'{nm}_{kind}.jpg'), os.path.join(OUT, 'textures', f'{nm}_{kind}.jpg'))

# ------------------------------------------------------------------ far terrain around the landscape
# The 55 m DEM of the whole panorama (35 x 29 km, the browser's outer terrain) as a mesh with its
# photo, so the mountains go on past the 5.2 km landscape. Inside the landscape square the vertices
# sink 150 m (hidden under it); grid lines run exactly along the square's border, where the heights
# equal the landscape's own edge (both come from the same DEM there), so there is no gap or step.
print('far terrain')
OB = meta['outer']['bounds']
FAR_STEP = 60.0
X1, Z1 = X0 + EXT, Z0 + EXT
BAND = 240.0                       # blend from the landscape's edge to the 55 m DEM over this width
dense = lambda a: np.arange(a - BAND, a + BAND + 0.1, 6.0)
fxs = np.unique(np.round(np.concatenate([np.arange(OB[0], OB[2], FAR_STEP), [OB[2], X0, X1], dense(X0), dense(X1)]), 2))
fzs = np.unique(np.round(np.concatenate([np.arange(OB[1], OB[3], FAR_STEP), [OB[3], Z0, Z1], dense(Z0), dense(Z1)]), 2))
fxs = fxs[(fxs >= OB[0]) & (fxs <= OB[2])]; fzs = fzs[(fzs >= OB[1]) & (fzs <= OB[3])]
FX, FZ = np.meshgrid(fxs, fzs)
FH = sample(outer, OB, FX, FZ, 3)
# outside the square, near it: from the landscape's own edge height (lidar) to the DEM
cx_, cz_ = np.clip(FX, X0, X1), np.clip(FZ, Z0, Z1)
dout = np.hypot(FX - cx_, FZ - cz_)
wb = smoothstep(0, BAND, dout)
FH = np.where(dout > 0, height_at(cx_, cz_) * (1 - wb) + FH * wb, FH)
on_edge = (np.isclose(FX, X0) | np.isclose(FX, X1)) & (FZ >= Z0 - 1e-6) & (FZ <= Z1 + 1e-6) | \
          (np.isclose(FZ, Z0) | np.isclose(FZ, Z1)) & (FX >= X0 - 1e-6) & (FX <= X1 + 1e-6)
inner_sq = (FX > X0 + 1e-6) & (FX < X1 - 1e-6) & (FZ > Z0 + 1e-6) & (FZ < Z1 - 1e-6)
# on the border use the landscape's own height, inside sink
FH = np.where(on_edge, height_at(np.clip(FX, X0, X1), np.clip(FZ, Z0, Z1)), FH)
FH = np.where(inner_sq, FH - 150, FH)
nzf, nxf = FX.shape
with open(os.path.join(OUT, 'far_terrain.obj'), 'w') as f:
    f.write('# far terrain around the Rysy landscape: UE centimetres (X east, Y south, Z altitude)\n')
    f.write('mtllib far_terrain.mtl\nusemtl far\n')
    for j in range(nzf):
        for i in range(nxf):
            f.write('v %.1f %.1f %.1f\n' % (FX[j, i] * 100, FZ[j, i] * 100, FH[j, i] * 100))
    for j in range(nzf):
        for i in range(nxf):
            f.write('vt %.6f %.6f\n' % ((FX[j, i] - OB[0]) / (OB[2] - OB[0]), 1 - (FZ[j, i] - OB[1]) / (OB[3] - OB[1])))
    for j in range(nzf - 1):
        for i in range(nxf - 1):
            if inner_sq[j:j + 2, i:i + 2].all():
                continue                  # wholly under the landscape: no need for it
            a = j * nxf + i + 1; b = a + 1; c = a + nxf; d = c + 1
            # winding so the faces point up with Z up and Y south (a left-handed frame, like UE's)
            f.write('f %d/%d %d/%d %d/%d\n' % (a, a, b, b, c, c))
            f.write('f %d/%d %d/%d %d/%d\n' % (b, b, d, d, c, c))
    # horizon ring: from the mesh's outline out to ~150 km at lowland height, coloured by the edge
    # (fades into the haze; no more empty band under the sky)
    edge_idx = [(0, i) for i in range(nxf)] + [(j, nxf - 1) for j in range(1, nzf)] + \
               [(nzf - 1, i) for i in range(nxf - 2, -1, -1)] + [(j, 0) for j in range(nzf - 2, 0, -1)]
    base_n = nzf * nxf
    cxm, czm = (OB[0] + OB[2]) / 2, (OB[1] + OB[3]) / 2
    ring = []
    for j, i in edge_idx:
        dx, dz = FX[j, i] - cxm, FZ[j, i] - czm
        # a different reach on each side keeps the outline asymmetric (the UE script tells the axes apart by it)
        if abs(dx) >= abs(dz): k = (150000.0 if dx >= 0 else 120000.0) / max(abs(dx), 1)
        else: k = (140000.0 if dz >= 0 else 110000.0) / max(abs(dz), 1)
        ring.append((cxm + dx * k, czm + dz * k))
        f.write('v %.1f %.1f %.1f\n' % (ring[-1][0] * 100, ring[-1][1] * 100, 45000.0))
    for j, i in edge_idx:
        f.write('vt %.6f %.6f\n' % ((FX[j, i] - OB[0]) / (OB[2] - OB[0]), 1 - (FZ[j, i] - OB[1]) / (OB[3] - OB[1])))
    m = len(edge_idx)
    for e in range(m):
        (j0, i0), (j1, i1) = edge_idx[e], edge_idx[(e + 1) % m]
        a, b = j0 * nxf + i0 + 1, j1 * nxf + i1 + 1
        vt_a, vt_b = a, b
        oa, ob = base_n + e + 1, base_n + (e + 1) % m + 1
        ta, tb = base_n + e + 1, base_n + (e + 1) % m + 1
        f.write('f %d/%d %d/%d %d/%d\n' % (a, vt_a, oa, ta, b, vt_b))
        f.write('f %d/%d %d/%d %d/%d\n' % (b, vt_b, oa, ta, ob, tb))
open(os.path.join(OUT, 'far_terrain.mtl'), 'w').write('newmtl far\nKd 1 1 1\nmap_Kd far_terrain.jpg\n')
# texture: the region's 2 m orthophoto (the same processing as the landscape's) where it reaches,
# the old 17 m panorama photo elsewhere; 8192 px across the 35 km (4.3 m/px)
FW = 8192; FHt = int(round(FW * (OB[3] - OB[1]) / (OB[2] - OB[0])))
far_img = np.asarray(Image.open(os.path.join(DATA, 'outer.jpg')).convert('RGB').resize((FW, FHt), Image.BICUBIC)).copy()
RG = os.path.join(ROOT, 'region')
if os.path.isfile(os.path.join(RG, 'meta.json')):
    rm = json.load(open(os.path.join(RG, 'meta.json')))
    rb = rm['base']; bm_ = rb['block'] * rb['step']
    mpp = (OB[2] - OB[0]) / FW
    for bi, bj in rb['blocks']:
        bx0, bz0 = rb['bounds'][0] + bi * bm_, rb['bounds'][1] + bj * bm_
        c0, r0 = int(round((bx0 - OB[0]) / mpp)), int(round((bz0 - OB[1]) / mpp))
        sz = int(round(bm_ / mpp))
        if c0 < 0 or r0 < 0 or c0 + sz > FW or r0 + sz > FHt:
            continue
        blk = Image.open(os.path.join(RG, 'photo', f'o_{bi}_{bj}.jpg')).convert('RGB').resize((sz, sz), Image.LANCZOS)
        far_img[r0:r0 + sz, c0:c0 + sz] = np.asarray(blk)
Image.fromarray(far_img).save(os.path.join(OUT, 'far_terrain.jpg'), quality=85, optimize=True)
far_info = {'file': 'far_terrain.obj', 'texture': 'far_terrain.jpg', 'asset': 'SM_RysyFar_v3', 'texture_asset': 'T_RysyFar_v3',
            'bounds_cm': {'x': [round(min(r[0] for r in ring) * 100, 1), round(max(r[0] for r in ring) * 100, 1)],
                          'y': [round(min(r[1] for r in ring) * 100, 1), round(max(r[1] for r in ring) * 100, 1)],
                          'z': [45000.0, round(float(FH.max()) * 100, 1)]},
            'note': 'vertices already in UE cm; the script fits the imported mesh to these bounds (axis order and signs)'}
i_ps = int(np.searchsorted(dist, 15.0))

# ------------------------------------------------------------------ landscape.json
settings = {
    'heightmap': 'heightmap.png',
    'resolution': [N, N],
    'section_size_quads': 63, 'sections_per_component': '2x2', 'components': [32, 32],
    'scale': {'x': STEP * 100, 'y': STEP * 100, 'z': zscale},
    'location_ui_centre_cm': {'x': 0.0, 'y': 0.0, 'z': round(mid * 100, 1)},
    'actor_location_corner_cm': {'x': round(loc_corner[0], 1), 'y': round(loc_corner[1], 1), 'z': round(loc_corner[2], 1)},
    'height_formula': 'height_m = mid_m + (value - 32768) / 128 * z_scale / 100',
    'mid_m': mid, 'height_min_m': round(hmin, 2), 'height_max_m': round(hmax, 2),
    'extent_m': EXT, 'metres_per_sample': STEP,
    'ortho': {'file': 'ortho.jpg', 'px': ORTHO_PX, 'metres_per_px': round(S, 4)},
    'masks': {'a': 'masks_a.png (R rock, G scree, B grass)', 'b': 'masks_b.png (R forest floor, G dwarf pine, B path)',
              'c': 'masks_c.png (R snow potential, G lake, B unused)', 'px': MASK_PX},
    'weights': {k: f'weights/w_{k}.png' for k in names + ['snow', 'lake']},
    'weight_note': 'w_rock..w_path sum to 255 at every sample (weight-blended layers); w_snow and w_lake are separate masks',
    'frame': {
        'ue_x': 'east, cm', 'ue_y': 'south, cm (north is -Y)', 'ue_z': 'altitude above sea level, cm',
        'origin_lonlat': [(20.040 + 20.112) / 2, (49.168 + 49.214) / 2],
        'metres_per_degree': {'lon': round(111320 * math.cos(math.radians((49.168 + 49.214) / 2)), 3), 'lat': 110574},
        'our_local': 'x = east, z = south (tatry/tools/prepare.py local()); UE X = x*100, UE Y = z*100',
    },
    'counts': {'spruce': int(len(sx)), 'dwarfpine': int(len(qx)), 'rocks': int(len(bx)),
               'trail_points': int(len(tr)), 'lakes': len(lakes_json), 'buildings': len(bj)},
    # ~15 m up the trail, clear of the signpost at the start
    'player_start_cm': {'x': round(tr[i_ps, 0] * 100, 1), 'y': round(tr[i_ps, 1] * 100, 1), 'z': round((th[i_ps] + 1.2) * 100, 1),
                        'yaw': round(math.degrees(math.atan2(tr[i_ps + 3, 1] - tr[i_ps, 1], tr[i_ps + 3, 0] - tr[i_ps, 0])), 1)},
    'far_terrain': far_info,
    'sources': meta.get('sources', ''),
}
json.dump(settings, open(os.path.join(OUT, 'landscape.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: settings[k] for k in ('scale', 'location_ui_centre_cm', 'actor_location_corner_cm', 'mid_m')}, indent=1))
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
print('export size', round(tot / 1e6, 1), 'MB')
