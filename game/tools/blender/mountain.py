# Mountains and the fortress (stage 7 diorama), modelled in Blender: firs, a scree pile, and the
# fortress: a battlemented curtain wall piece, a round tower, a gatehouse with an arch the road runs
# through and a square keep with a flag. The massifs themselves are raised ground, not models.
#
#   python tools/blender/mountain.py [name ...]
#
# Written next to the other scenery (.cache/figures/scenery); tools/figures.mjs packs them all.
# Axes as in vehicles.py: x along, y up, z to the front (for the wall: +z faces outwards).
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from vehicles import clear
from scenery import Scene, mulberry, WOOD, TRUNK
from town import wall
from winter import spruce

FSTONE, FSTONE2, FROOF, FLAG, FDARK, SCREE, SCREE2 = '#a49c8c', '#8a8274', '#5b4f46', '#9c2a24', '#2a2826', '#9a958a', '#7d786e'

def fir(name, h, seed):
    """a green fir: the spruce from winter.py without its snow."""
    import winter
    old = winter.SNOW, winter.SNOW2
    winter.SNOW, winter.SNOW2 = '#3a5a40', '#6d7f4a'
    try: spruce(name, h, seed)
    finally: winter.SNOW, winter.SNOW2 = old

def scree():
    m = Scene('scree'); rnd = mulberry(801)
    m.foliage(SCREE2, [(-0.45 + i * 0.3, -0.05, (rnd() - 0.5) * 0.2, 0.26 + rnd() * 0.1) for i in range(4)], res=0.05, bump=0.06, tris=400, seed=8010)
    for i in range(18): m.box(SCREE if i % 2 else SCREE2, ((rnd() - 0.5) * 1.0, 0.08 + rnd() * 0.15, (rnd() - 0.5) * 0.5), (0.1 + rnd() * 0.08, 0.07, 0.09), bevel=0.02, yaw=rnd() * 3, roll=rnd())
    m.finish()

def fwall():
    """one cell of curtain wall with battlements and a walkway behind (0.95 high: shoot over it)."""
    m = Scene('fwall'); rnd = mulberry(811)
    m.box(FSTONE, (0, 0.38, 0), (1.04, 0.76, 0.5), bevel=0.01)
    m.box(FSTONE2, (0, 0.06, 0.02), (1.06, 0.12, 0.56), bevel=0.02)                         # plinth
    for k in range(3):                                                                     # merlons
        m.box(FSTONE, (-0.35 + k * 0.35, 0.86, 0.17), (0.22, 0.2, 0.16), bevel=0.01)
    m.box(FSTONE2, (0, 0.77, -0.08), (1.04, 0.03, 0.36), bevel=0.0)                           # walkway
    for i in range(10):                                                                    # stone courses
        m.box(FSTONE2, ((rnd() - 0.5) * 0.9, 0.15 + rnd() * 0.55, 0.252), (0.2 + rnd() * 0.15, 0.1, 0.01), bevel=0.0)
    m.finish()

def ftower():
    """a round tower (2 x 2 cells): battered base, arrow slits, crenellated top, conical roof."""
    m = Scene('ftower'); rnd = mulberry(821)
    m.cyl(FSTONE2, (0, 0, 0), (0, 0.5, 0), 0.95, seg=24, r2=0.85)
    m.cyl(FSTONE, (0, 0.5, 0), (0, 2.3, 0), 0.85, seg=24)
    m.cyl(FSTONE2, (0, 2.3, 0), (0, 2.42, 0), 0.95, seg=24)
    for i in range(12):
        a = i / 12 * 2 * math.pi
        m.box(FSTONE, (math.cos(a) * 0.87, 2.56, math.sin(a) * 0.87), (0.2, 0.26, 0.18), bevel=0.01, yaw=-a)
    for k in range(3):
        for i in range(4):
            a = i / 4 * 2 * math.pi + k * 0.8
            m.box(FDARK, (math.cos(a) * 0.86, 1.0 + k * 0.5, math.sin(a) * 0.86), (0.04, 0.28, 0.06), bevel=0.0, yaw=-a)
    m.cyl(FROOF, (0, 2.42, 0), (0, 3.5, 0), 0.8, seg=16, r2=0.02)
    m.cyl(FDARK, (0, 3.5, 0), (0, 3.9, 0), 0.015, seg=5)
    m.fin(FLAG, [(0.0, 3.88), (0.35, 3.82), (0.33, 3.68), (0.0, 3.7)], 0, 0.01)
    m.finish()

def fgate():
    """a gatehouse over the road (3 cells wide along x): two towers joined by an arch the troops
    march through, a raised portcullis and battlements."""
    m = Scene('fgate'); rnd = mulberry(831)
    for s in (1, -1):
        m.box(FSTONE, (s * 1.25, 1.1, 0), (0.7, 2.2, 1.0), bevel=0.03)
        for k in range(2): m.box(FSTONE, (s * 1.25 + (k - 0.5) * 0.35, 2.34, 0.4), (0.2, 0.26, 0.18), bevel=0.01)
        m.box(FDARK, (s * 1.25, 1.4, 0.505), (0.06, 0.3, 0.02), bevel=0.0)
    wall(m, FSTONE, -0.95, 0.95, 0.0, 0.0, 2.0, 0.8, holes=[(0.0, 0.0, 1.45, 1.6)])
    for k in range(5): m.box(FSTONE, (-0.8 + k * 0.4, 2.12, 0.3), (0.22, 0.24, 0.16), bevel=0.01)
    for k in range(7): m.box(FDARK, (-0.72 + k * 0.24, 1.75, 0.42), (0.03, 0.5, 0.03), bevel=0.0)   # portcullis, raised
    m.box(FDARK, (0, 1.52, 0.42), (1.5, 0.03, 0.03), bevel=0.0)
    m.finish()

def keep():
    """a square keep (3 x 3 cells): thick walls, windows, corner turrets, a flag on the roof."""
    m = Scene('keep'); rnd = mulberry(841)
    Hk = 3.6
    m.box(FSTONE2, (0, 0.2, 0), (2.8, 0.4, 2.8), bevel=0.04)
    m.box(FSTONE, (0, Hk / 2, 0), (2.5, Hk, 2.5), bevel=0.03)
    for face in range(4):
        a = face * math.pi / 2
        for k in range(2):
            for j in range(2):
                x = (-0.5 + k) * 1.0
                p = (math.cos(a) * x - math.sin(a) * 1.26, 1.4 + j * 1.2, math.sin(a) * x + math.cos(a) * 1.26)
                m.box(FDARK, p, (0.18, 0.4, 0.04), bevel=0.0, yaw=-a)
    m.box(FDARK, (0, 0.55, 1.26), (0.5, 0.8, 0.04), bevel=0.0)                                 # door
    for i in range(16):                                                                    # battlements
        t = i / 16 * 4; side = int(t); f = t - side
        x = -1.25 + f * 2.5
        p = [(x, 1.2), (1.2, x), (-x, -1.2), (-1.2, -x)][side]
        m.box(FSTONE, (p[0], Hk + 0.13, p[1]), (0.24, 0.26, 0.24), bevel=0.01)
    for sx in (1, -1):
        for sz in (1, -1):
            m.cyl(FSTONE, (sx * 1.22, Hk - 0.6, sz * 1.22), (sx * 1.22, Hk + 0.45, sz * 1.22), 0.3, seg=12)
            m.cyl(FROOF, (sx * 1.22, Hk + 0.45, sz * 1.22), (sx * 1.22, Hk + 1.0, sz * 1.22), 0.34, seg=12, r2=0.02)
    m.cyl(FDARK, (0, Hk, 0), (0, Hk + 1.6, 0), 0.02, seg=6)
    m.fin(FLAG, [(0.02, Hk + 1.58), (0.75, Hk + 1.45), (0.72, Hk + 1.2), (0.02, Hk + 1.28)], 0, 0.012)
    m.finish()

MODELS = {'fir0': lambda: fir('fir0', 2.6, 851), 'fir1': lambda: fir('fir1', 3.2, 852), 'scree': scree, 'fwall': fwall, 'ftower': ftower, 'fgate': fgate, 'keep': keep}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
