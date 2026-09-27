# Winter in the Ardennes (stage 4 diorama), modelled in Blender: snow-laden spruces (light: there
# are thousands of them), a stone farmhouse and a wooden shed under snow, a foxhole, a log pile and
# a fallen tree.
#
#   python tools/blender/winter.py [name ...]
#
# Written next to the other scenery (.cache/figures/scenery); tools/figures.mjs packs them all.
# Axes as in vehicles.py: x along, y up, z to the front.
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from vehicles import clear
from scenery import Scene, mulberry, WOOD, BEAM, EARTH, TRUNK
from town import wall, window, chimney

SNOW, SNOW2, NEEDLE, NEEDLE2 = '#f2f5f9', '#dfe6ef', '#2e4a37', '#3a5a40'
STONEW, STONEW2, SLATEW, SHUTTERW, GLASSW, DARKW, SANDBAGW = '#9a948a', '#7f7a72', '#4b5058', '#6b3f2c', '#3a4650', '#26282a', '#a89a78'

def spruce(name, h, seed, tiers=5):
    m = Scene(name); rnd = mulberry(seed)
    m.cyl(TRUNK, (0, 0, 0), (0, h * 0.35, 0), 0.08, seg=6)
    for k in range(tiers):
        f = k / tiers
        y0 = h * (0.18 + f * 0.72); r = (1 - f) * h * 0.3 + 0.12; th = h * 0.3
        yaw = rnd() * 3
        m.cyl(NEEDLE if k % 2 else NEEDLE2, (0, y0, 0), (0, y0 + th, 0), r, seg=8, r2=0.02).rotation_euler[2] += yaw
        m.cyl(SNOW, (0, y0 + th * 0.28, 0), (0, y0 + th * 0.92, 0), r * 0.82, seg=8, r2=0.03).rotation_euler[2] += yaw + 0.2   # snow on the boughs
    m.cyl(SNOW2, (0, -0.02, 0), (0, 0.05, 0), 0.5, seg=10, r2=0.25)                          # drift round the foot
    m.finish()

def chalet():
    """an Ardennes stone farmhouse (3 x 2 cells) under a thick blanket of snow."""
    m = Scene('chalet'); rnd = mulberry(501)
    L, D, Hw, rh = 2.9, 1.85, 1.25, 0.95
    for face in (1, -1):
        holes = [(-0.9, 0.35, 0.8, 0.3), (0.0, 0.1, 0.8, 0.34), (0.9, 0.35, 0.8, 0.3)] if face == 1 else [(-0.6, 0.35, 0.8, 0.3), (0.6, 0.35, 0.8, 0.3)]
        wall(m, STONEW, -L / 2, L / 2, face * (D / 2 - 0.05), 0.0, Hw, 0.1, holes=holes)
        for (hc, b, t, w) in holes:
            if b > 0.2: window(m, hc, (b + t) / 2, face * (D / 2 - 0.05), face, w, t - b, shutters=SHUTTERW)
    for face in (1, -1):
        wall(m, STONEW, -D / 2, D / 2, face * (L / 2 - 0.05), 0.0, Hw, 0.1, axis='z', holes=[(0, 0.4, 0.75, 0.24)])
    m.box(DARKW, (0, Hw / 2, 0), (L - 0.2, Hw, D - 0.2), bevel=0.0)
    m.box(WOOD, (0.0, 0.45, D / 2 - 0.07), (0.32, 0.72, 0.03), bevel=0.004)                  # door
    for x in (-L / 2, L / 2):
        for z in (-D / 2, D / 2):
            for k in range(4): m.box(STONEW2, (x, 0.15 + k * 0.3, z), (0.2 if k % 2 else 0.14, 0.26, 0.14 if k % 2 else 0.2), bevel=0.01)
    m.prism_x(STONEW, [(-D / 2 + 0.01, Hw), (D / 2 - 0.01, Hw), (0, Hw + rh - 0.03)], -L / 2 + 0.01, L / 2 - 0.01)
    ang = math.atan2(rh, D / 2); ln = math.hypot(rh, D / 2)
    for s in (1, -1):
        m.box(SLATEW, (0, Hw + rh / 2 + 0.03, s * D / 4), (L + 0.3, 0.05, ln + 0.22), bevel=0.01, roll=s * ang)
        m.box(SNOW, (0, Hw + rh / 2 + 0.1, s * D / 4), (L + 0.34, 0.1, ln + 0.18), bevel=0.04, roll=s * ang)   # snow blanket
        for k in range(9):                                                                    # icicles along the eaves
            x = -L / 2 + 0.1 + k * (L - 0.2) / 8
            m.cyl('#e8f2fb', (x, Hw + 0.02, s * (D / 2 + 0.2)), (x, Hw - 0.12 - rnd() * 0.1, s * (D / 2 + 0.2)), 0.018, seg=4, r2=0.002)
    m.cyl(SNOW, (-L / 2 - 0.15, Hw + rh + 0.1, 0), (L / 2 + 0.15, Hw + rh + 0.1, 0), 0.09, seg=8)
    chimney(m, L / 2 - 0.4, 0.2, Hw + rh * 0.5, h=0.7)
    m.box(SNOW, (L / 2 - 0.4, Hw + rh * 0.5 + 0.76, 0.2), (0.3, 0.06, 0.38), bevel=0.02)
    # snow drifts against the walls, a woodpile by the door
    m.foliage(SNOW2, [((rnd() - 0.5) * L, 0.0, s * (D / 2 + 0.15), 0.2 + rnd() * 0.12) for s in (1, -1) for _ in range(5)], res=0.05, bump=0.02, tris=700, seed=5010)
    for k in range(3):
        for j in range(4 - k): m.cyl(WOOD, (L / 2 + 0.05, 0.07 + k * 0.12, -0.4 + j * 0.13 + k * 0.06), (L / 2 + 0.4, 0.07 + k * 0.12, -0.4 + j * 0.13 + k * 0.06), 0.06, seg=8)
    m.box(SNOW, (L / 2 + 0.22, 0.44, -0.2), (0.4, 0.05, 0.5), bevel=0.02)
    m.finish()

def shed():
    m = Scene('shed'); rnd = mulberry(511)
    L, D, Hw = 1.8, 0.85, 0.9
    m.box(WOOD, (0, Hw / 2, 0), (L, Hw, D), bevel=0.01)
    for k in range(10): m.box(BEAM, (-L / 2 + 0.09 + k * (L - 0.18) / 9, Hw / 2, D / 2 + 0.005), (0.015, Hw - 0.05, 0.01), bevel=0.0)   # plank joints
    m.box(DARKW, (0.3, 0.38, D / 2 + 0.01), (0.45, 0.7, 0.01), bevel=0.0)
    m.box(SLATEW, (0, Hw + 0.08, 0), (L + 0.2, 0.05, D + 0.3), bevel=0.01, roll=0.25)
    m.box(SNOW, (0, Hw + 0.15, 0), (L + 0.24, 0.1, D + 0.28), bevel=0.04, roll=0.25)
    m.foliage(SNOW2, [((rnd() - 0.5) * L, 0.0, -D / 2 - 0.1, 0.18) for _ in range(4)], res=0.05, bump=0.02, tris=300, seed=5110)
    m.finish()

def foxhole():
    """a foxhole (1 cell): a dug hole with the spoil heaped round it under snow, a log and sandbags."""
    m = Scene('foxhole'); rnd = mulberry(521)
    m.cyl(DARKW, (0, 0.0, 0), (0, 0.02, 0), 0.32, seg=14)
    m.foliage(EARTH, [(math.cos(a) * 0.42, -0.02, math.sin(a) * 0.42, 0.14) for a in [i * 0.7 for i in range(9)]], res=0.04, bump=0.02, tris=400, seed=5210)
    m.foliage(SNOW, [(math.cos(a) * 0.44, 0.04, math.sin(a) * 0.44, 0.11) for a in [i * 0.9 + 0.3 for i in range(7)]], res=0.04, bump=0.02, tris=400, seed=5211)
    m.cyl(TRUNK, (-0.45, 0.14, 0.3), (0.45, 0.16, 0.36), 0.07, seg=8)                         # log over the front
    for k in range(3): m.sphere(SANDBAGW, (-0.25 + k * 0.25, 0.14, 0.44), 0.5, scale=(0.26, 0.12, 0.16), seg=10)
    m.finish()

def logs():
    m = Scene('logs'); rnd = mulberry(531)
    for k in range(3):
        for j in range(4 - k):
            z = -0.28 + j * 0.19 + k * 0.095
            m.cyl(TRUNK, (-0.85, 0.09 + k * 0.16, z), (0.85, 0.09 + k * 0.16, z), 0.09, seg=10)
            for s in (-1, 1): m.cyl('#c9a878', (s * 0.851, 0.09 + k * 0.16, z), (s * 0.86, 0.09 + k * 0.16, z), 0.08, seg=10)   # cut ends
    m.box(SNOW, (0, 0.52, 0), (1.6, 0.08, 0.36), bevel=0.03)
    m.finish()

def fallen():
    """a fallen spruce (3 cells): trunk, root plate, broken boughs, snow along the top."""
    m = Scene('fallen'); rnd = mulberry(541)
    m.cyl(TRUNK, (-1.35, 0.14, 0), (1.3, 0.1, 0.05), 0.13, seg=10, r2=0.06)
    m.cyl(SNOW, (-1.3, 0.25, 0), (1.25, 0.18, 0.05), 0.07, seg=8, r2=0.03)
    m.cyl(EARTH, (-1.42, 0.3, 0), (-1.5, 0.3, 0), 0.4, seg=12)                              # root plate
    for i in range(7):
        x = -0.9 + i * 0.35
        for s in (1, -1): m.cyl(NEEDLE, (x, 0.15, 0), (x + 0.2, 0.15 + rnd() * 0.25, s * (0.35 + rnd() * 0.2)), 0.02, seg=4)
    m.finish()

MODELS = {'pine0': lambda: spruce('pine0', 2.6, 551), 'pine1': lambda: spruce('pine1', 3.2, 552, 6), 'chalet': chalet, 'shed': shed,
          'foxhole': foxhole, 'logs': logs, 'fallen': fallen}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
