"""What the ground is, metre by metre, where we have the 1 m lidar and the 0.5 m orthophoto (the tiles
along the trails): the 3D view builds the world from it (rocks in the scree, dwarf pine where the photo
shows it, meadows with grass and flowers, granite on the walls, the matching ground textures).

For every 1 m cell it combines the photo (colour, greenness, texture: bushes are rough in the photo,
meadows smooth) with the lidar (slope; roughness of the ground: scree and boulder fields are rough,
meadows smooth), the elevation and the 10 m land cover map (ESA WorldCover), then decides by rules:

  0 unknown   1 water   2 rock face   3 scree / boulders   4 meadow   5 dwarf pine   6 forest
  7 snow      8 bare soil / gravel

Output next to the tiles: c_i_j.png (256 x 256, one byte per metre, the class) and r_i_j.png (the
ground roughness, 0..255, for the density of the rocks), and k_i_j.png, the one the 3D view loads: both in
a byte (low 4 bits the class, high 4 the roughness in steps of 7, kept in the scree only, the one place it is
read; 5.5 kB instead of 42 kB and one request instead of two per tile).
With DEBUG=1 also a picture per tile for checking.
PACK=1 only packs k_ from the c_ and r_ already there.
Run: python3 tools/prepare_classes.py            (the Morskie Oko -> Rysy data, public/data)
     AREA=region python3 tools/prepare_classes.py   (the region, ../../region)
"""
import json
import math
import os
import sys
import zlib

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates, uniform_filter, binary_dilation

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '..', 'region') if os.environ.get('AREA') == 'region' else os.path.join(HERE, '..', 'public', 'data')
DEBUG = os.environ.get('DEBUG') == '1'
PACK = os.environ.get('PACK') == '1'
ONLY = os.environ.get('ONLY')          # "i,j;i,j": just these tiles (for checking)

meta = json.load(open(os.path.join(DATA, 'meta.json')))
T = meta['tiles']
S, N = T['size'], T['samples']          # 256 m, 257 samples (1 m)
ox, oz = T['origin']
LB = meta['inner']['bounds']
land = np.asarray(Image.open(os.path.join(DATA, 'landcover.png')).convert('L'))

COLORS = np.array([[0, 0, 0], [60, 120, 220], [120, 120, 125], [185, 175, 160], [140, 200, 90],
                   [40, 110, 40], [10, 70, 30], [245, 245, 250], [170, 130, 90]], np.uint8)


def unpack(path, n):
    raw = zlib.decompress(open(path, 'rb').read())
    d = np.frombuffer(raw, dtype='<u2', count=n * n).reshape(n, n).astype(np.int32)
    d[:, 1:] = np.where(d[:, 1:] > 32767, d[:, 1:] - 65536, d[:, 1:])
    return np.cumsum(d, axis=1) / 10.0


# lakes as polygons in the local frame
lakes = [np.array(l['ring']) for l in meta.get('lakes', [])]


def lake_mask(x0, z0):
    im = Image.new('L', (S, S), 0)
    dr = ImageDraw.Draw(im)
    for r in lakes:
        if r[:, 0].max() < x0 or r[:, 0].min() > x0 + S or r[:, 1].max() < z0 or r[:, 1].min() > z0 + S:
            continue
        dr.polygon([(x - x0, z - z0) for x, z in r], fill=255)
    return np.asarray(im) > 0


def classify(i, j):
    x0, z0 = ox + i * S, oz + j * S
    h = unpack(os.path.join(DATA, 'tiles', f'h_{i}_{j}.bin'), N)
    photo = np.asarray(Image.open(os.path.join(DATA, 'tiles', f'o_{i}_{j}.jpg')).convert('RGB'), np.float32) / 255
    # the photo at 1 m: mean colour and texture (luminance variation inside and around each metre)
    P = photo.reshape(S, 2, S, 2, 3).mean((1, 3))
    lum_hi = photo @ np.array([0.3, 0.59, 0.11], np.float32)
    tex = np.sqrt(np.maximum(0, uniform_filter(lum_hi ** 2, 5) - uniform_filter(lum_hi, 5) ** 2))
    tex = tex.reshape(S, 2, S, 2).mean((1, 3))
    R, G, B = P[..., 0], P[..., 1], P[..., 2]
    lum = 0.3 * R + 0.59 * G + 0.11 * B
    mx, mn = P.max(-1), P.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    exg = (2 * G - R - B) / np.maximum(R + G + B, 1e-3)          # greenness
    # the lidar: heights at the cell centres, slope, ground roughness
    hc = (h[:-1, :-1] + h[1:, :-1] + h[:-1, 1:] + h[1:, 1:]) / 4
    gz, gx = np.gradient(hc)
    slope = np.degrees(np.arctan(np.hypot(gx, gz)))
    rough = gaussian_filter(np.abs(hc - gaussian_filter(hc, 2.0)), 1.0)
    # the 10 m land cover (ESA WorldCover: 10 trees, 20 shrubs, 30 grass, 60 bare, 70 snow, 80 water, 100 moss)
    cx = x0 + np.arange(S) + 0.5
    cz = z0 + np.arange(S) + 0.5
    CX, CZ = np.meshgrid(cx, cz)
    lu = (CX - LB[0]) / (LB[2] - LB[0]) * land.shape[1] - 0.5
    lv = (CZ - LB[1]) / (LB[3] - LB[1]) * land.shape[0] - 0.5
    lc = map_coordinates(land, [lv, lu], order=0, mode='nearest')

    c = np.zeros((S, S), np.uint8)
    # vegetation is green AND darker than rock (granite with lichen and the photo's colour cast is greenish
    # too, but bright): rocky tiles have greenness ~0.05 at brightness ~0.7, vegetation ~0.2 at ~0.2
    green = ((exg > 0.10) & (lum < 0.55)) | ((exg > 0.06) & (lum < 0.33) & (rough < 0.25))
    # woody (forest, dwarf pine): dark or rough in the photo; light smooth green is a meadow or clearing.
    # Which woody: below 1480 m forest, 1480-1580 m as the land cover map says (it counts dense dwarf
    # pine as trees, so not higher), above dwarf pine
    woody = green & ((lum < 0.24) | (tex > 0.035))
    forest = woody & ((hc < 1480) | ((hc < 1580) & (lc == 10)))
    pine = woody & ~forest & (hc < 2150) & (slope < 55)
    meadow = green & ~forest & ~pine
    c[meadow] = 4
    c[pine] = 5
    c[forest] = 6
    # not green: snow (summer photos: only bright, neutral and smooth), rock walls, scree, gravel
    bare = c == 0
    snow = bare & (lum > 0.93) & (sat < 0.07) & (rough < 0.2) & (slope < 40)
    wall = bare & ~snow & (slope > 50)
    scree = bare & ~snow & ~wall & ((rough > 0.12) | (slope > 28))
    soil = bare & ~snow & ~wall & ~scree
    c[scree] = 3
    c[soil] = 8
    c[wall] = 2
    c[snow] = 7
    c[lake_mask(x0, z0)] = 1
    # tidy: lone cells take the class of their neighbourhood
    from scipy.ndimage import median_filter
    c = median_filter(c, size=3, mode='nearest')
    r8 = np.clip(rough * 400, 0, 255).astype(np.uint8)
    return c, r8, P, dict(slope=slope, rough=rough, exg=exg, tex=tex, lum=lum)


def packed(c, r8):
    q = np.minimum(15, np.round(r8 / 7.0)).astype(np.uint8)    # (the rocks' density saturates at ~105)
    return c | np.where(c == 3, q << 4, 0).astype(np.uint8)


def main():
    tiles = T['list']
    if ONLY:
        want = {tuple(map(int, t.split(','))) for t in ONLY.split(';')}
        tiles = [t for t in tiles if tuple(t) in want]
    if PACK:
        for k, (i, j) in enumerate(tiles):
            p = os.path.join(DATA, 'tiles', f'%s_{i}_{j}.png')
            c, r8 = np.asarray(Image.open(p % 'c').convert('L')), np.asarray(Image.open(p % 'r').convert('L'))
            Image.fromarray(packed(c, r8), 'L').save(p % 'k', optimize=True)
            if k % 1000 == 0:
                print(k, '/', len(tiles), flush=True)
        return
    counts = np.zeros(9, np.int64)
    for k, (i, j) in enumerate(tiles):
        c, r8, P, f = classify(i, j)
        Image.fromarray(c, 'L').save(os.path.join(DATA, 'tiles', f'c_{i}_{j}.png'), optimize=True)
        Image.fromarray(r8, 'L').save(os.path.join(DATA, 'tiles', f'r_{i}_{j}.png'), optimize=True)
        Image.fromarray(packed(c, r8), 'L').save(os.path.join(DATA, 'tiles', f'k_{i}_{j}.png'), optimize=True)
        counts += np.bincount(c.ravel(), minlength=9)
        if DEBUG:
            out = os.environ.get('DEBUG_DIR', '/tmp')
            vis = np.concatenate([(P * 255).astype(np.uint8), COLORS[c]], 1)
            Image.fromarray(vis).save(os.path.join(out, f'cls_{i}_{j}.jpg'), quality=85)
        if k % 200 == 0:
            print(k, '/', len(tiles), flush=True)
    names = ['?', 'woda', 'ściana', 'piarg', 'łąka', 'kosodrzewina', 'las', 'śnieg', 'gleba']
    tot = counts.sum()
    print('classes:', ', '.join(f'{n} {100 * v / tot:.1f}%' for n, v in zip(names, counts)))


if __name__ == '__main__':
    main()
