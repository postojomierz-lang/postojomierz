# The desert (stage 5 diorama), modelled in Blender: date palms, mud-brick houses (one in ruins),
# sandstone outcrops and a small mesa, a rocky escarpment ridge, a sand dune, a stone sangar
# (infantry fight from it), a burnt-out tank, oil drums and camel-thorn scrub.
#
#   python tools/blender/desert.py [name ...]
#
# Written next to the other scenery (.cache/figures/scenery); tools/figures.mjs packs them all.
# Axes as in vehicles.py: x along, y up, z to the front.
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from vehicles import clear
from scenery import Scene, mulberry, WOOD, BEAM
from town import wall

ADOBE, ADOBE2, SANDD, ROCKD, ROCKD2, PALM, FROND, FROND2 = '#c9a67a', '#b38f63', '#dcc08c', '#b68a5c', '#9c7550', '#7a6246', '#5f7a3a', '#76903f'
DATES, RUSTD, BURNT, DRUM, DRUM2, SCRUB, DARKD, CLOTH = '#8a4b22', '#7a4a2e', '#3b3531', '#5d6b52', '#a63b2c', '#8a8a54', '#2a2522', '#d8c9a5'

def palm(name, h, lean, seed):
    m = Scene(name); rnd = mulberry(seed)
    segs = 9
    for k in range(segs):                                                                  # ringed trunk, curving
        f0, f1 = k / segs, (k + 1) / segs
        p0 = (lean * f0 * f0, f0 * h, 0); p1 = (lean * f1 * f1, f1 * h, 0)
        m.cyl(PALM, p0, p1, 0.1 - f0 * 0.035, seg=8, r2=0.1 - f1 * 0.035 + 0.012)
    top = (lean, h, 0)
    for i in range(11):                                                                    # fronds arching down
        a = i / 11 * 2 * math.pi + rnd() * 0.3; L = 0.9 + rnd() * 0.3
        pts = [(top[0] + math.cos(a) * L * t, h + 0.25 * math.sin(t * math.pi) - t * t * 0.55, math.sin(a) * L * t) for t in (0, 0.35, 0.7, 1.0)]
        for j in range(3):
            w = 0.2 * (1 - j * 0.3)
            p, q = pts[j], pts[j + 1]
            hl = math.hypot(q[0] - p[0], q[2] - p[2]); drop = math.atan2(q[1] - p[1], hl)
            mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2)
            m.box(FROND if i % 2 else FROND2, mid, (math.hypot(hl, q[1] - p[1]) * 1.08, 0.012, w), bevel=0.0, yaw=-a, pitch=drop, roll=(rnd() - 0.5) * 0.5)
            for k in range(4):                                                             # leaflets
                t = (k + 0.5) / 4; lp = (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t)
                for side in (1, -1):
                    m.box(FROND2 if i % 2 else FROND, (lp[0] - math.sin(a) * side * w * 0.9, lp[1] - 0.04, lp[2] + math.cos(a) * side * w * 0.9), (0.05, 0.01, w * 1.1), bevel=0.0, yaw=-a + side * 0.6, roll=side * 0.5)
    for i in range(5): m.sphere(DATES, (top[0] + (rnd() - 0.5) * 0.2, h - 0.12, (rnd() - 0.5) * 0.2), 0.05, seg=6)
    m.finish()

def adobe(ruin=False):
    """a mud-brick house (2 x 2 cells): flat roof with a parapet, small deep windows, a door with a
    cloth awning, poles sticking out under the roof, steps up to the roof. The ruin is broken open."""
    name = 'adobe_ruin' if ruin else 'adobe'
    m = Scene(name); rnd = mulberry(611 + ruin)
    L, D, Hw = 1.8, 1.7, 1.25
    jag = (lambda a, base: base + math.sin(a * 7.3 + 1) * 0.25 - (0.3 if a > 0.2 else 0)) if ruin else None
    for face in (1, -1):
        holes = [(-0.45, 0.45, 0.8, 0.22), (0.4, 0.0, 0.85, 0.34)] if face == 1 else [(0.3, 0.5, 0.8, 0.2)]
        top = (lambda a, f=face: Hw * (0.45 if f == 1 else 0.9) + math.sin(a * 6.1 + f) * 0.22) if ruin else None
        wall(m, ADOBE, -L / 2, L / 2, face * (D / 2 - 0.08), 0.0, Hw + 0.18, 0.16, holes=holes, top=top, slice_w=0.15)
        if not ruin: m.box(DARKD, (0, 0.6, face * (D / 2 - 0.12)), (L - 0.2, 1.1, 0.02), bevel=0.0)
    for face in (1, -1):
        top = (lambda a, f=face: Hw * 0.7 + math.sin(a * 5.3 + f * 2) * 0.3) if ruin else None
        wall(m, ADOBE, -D / 2, D / 2, face * (L / 2 - 0.08), 0.0, Hw + 0.18, 0.16, axis='z', holes=[(0.1, 0.5, 0.8, 0.2)], top=top, slice_w=0.15)
    if not ruin:
        m.box(ADOBE2, (0, Hw, 0), (L - 0.1, 0.08, D - 0.1), bevel=0.0)                        # roof
        for k in range(5): m.cyl(WOOD, (-L / 2 + 0.2 + k * 0.35, Hw - 0.08, D / 2 - 0.1), (-L / 2 + 0.2 + k * 0.35, Hw - 0.08, D / 2 + 0.12), 0.03, seg=6)
        m.box(CLOTH, (0.4, 0.95, D / 2 + 0.18), (0.55, 0.02, 0.4), bevel=0.0, roll=-0.4)       # awning over the door
        for k in range(4): m.box(ADOBE2, (L / 2 + 0.12, 0.15 + k * 0.28, -0.5 + k * 0.25), (0.26, 0.12, 0.3), bevel=0.02)   # outside stairs
        m.box(WOOD, (0.4, 0.42, D / 2 - 0.1), (0.3, 0.8, 0.03), bevel=0.004)
        for k in range(3): m.cyl(DRUM if k else '#b8a06c', (-0.7 + k * 0.1, 0.0, D / 2 + 0.3 + k * 0.05), (-0.7 + k * 0.1, 0.35, D / 2 + 0.3 + k * 0.05), 0.08, seg=10)   # water jars
    else:
        balls = [((rnd() - 0.5) * L, 0.02, (rnd() - 0.5) * D, 0.2 + rnd() * 0.15) for _ in range(12)]
        m.foliage(ADOBE2, balls, res=0.05, bump=0.04, tris=1000, seed=6120)
        for k in range(3): m.box(BURNT, ((rnd() - 0.5) * L, 0.3 + rnd() * 0.3, (rnd() - 0.5) * D), (0.06, 0.06, 1.2), bevel=0.01, yaw=rnd() * 3, roll=(rnd() - 0.5))
    m.finish()

def rockpile(name, size, seed, flat=False):
    m = Scene(name); rnd = mulberry(seed)
    sx, sz = size
    n = 6 if not flat else 9
    for k in range(n):
        x, z = (rnd() - 0.5) * sx * 0.7, (rnd() - 0.5) * sz * 0.7
        hgt = (0.6 + rnd() * 0.6) if not flat else 0.9
        m.foliage(ROCKD if k % 2 else ROCKD2, [(x, hgt * 0.3, z, 0.4 + rnd() * 0.25), (x + 0.2, hgt * 0.7, z, 0.3 + rnd() * 0.15)], res=0.07, bump=0.14, tris=450, seed=seed * 10 + k)
    if flat:                                                                               # a flat-topped mesa with a ledge
        m.box(ROCKD2, (0, 1.05, 0), (sx * 0.8, 0.25, sz * 0.75), bevel=0.08, segs=2)
        m.foliage(SANDD, [((rnd() - 0.5) * sx, 0.0, (rnd() - 0.5) * sz, 0.35) for _ in range(6)], res=0.06, bump=0.03, tris=500, seed=seed * 10 + 9)
    m.finish()

def ridge():
    """one cell of escarpment: a low ledge of broken rock you can shoot over."""
    m = Scene('ridge'); rnd = mulberry(631)
    m.foliage(ROCKD, [(-0.45 + i * 0.3, 0.1 + rnd() * 0.1, (rnd() - 0.5) * 0.15, 0.24 + rnd() * 0.1) for i in range(4)], res=0.05, bump=0.1, tris=600, seed=6310)
    for k in range(5): m.box(ROCKD2, ((rnd() - 0.5) * 1.0, 0.05, 0.3 + rnd() * 0.2), (0.12, 0.08, 0.1), bevel=0.02, yaw=rnd() * 3)
    m.finish()

def sanddune():
    m = Scene('sanddune'); rnd = mulberry(641)
    m.foliage(SANDD, [(-0.5 + i * 0.25, -0.05, (rnd() - 0.5) * 0.2, 0.36 + rnd() * 0.1) for i in range(5)], res=0.06, bump=0.02, tris=500, seed=6410)
    m.finish()

def sangar():
    """a sangar (1 cell): a ring of piled stones, open at the back."""
    m = Scene('sangar'); rnd = mulberry(651)
    for i in range(22):
        a = i / 22 * 2 * math.pi
        if 3.6 < a < 4.6: continue
        for l in range(2 + (i % 2)):
            r = 0.42 + (rnd() - 0.5) * 0.05
            m.box(ROCKD if (i + l) % 2 else ROCKD2, (math.cos(a) * r, 0.07 + l * 0.12, math.sin(a) * r), (0.16, 0.12, 0.12), bevel=0.03, yaw=-a + (rnd() - 0.5) * 0.3)
    m.finish()

def wreck():
    """a burnt-out tank (2 x 1 cells): hull, the turret knocked askew, tracks off, scorched."""
    m = Scene('wreck'); rnd = mulberry(661)
    m.box(BURNT, (0, 0.35, 0), (1.7, 0.4, 0.8), bevel=0.04)
    m.prism(BURNT, [(-0.85, 0.55), (0.85, 0.55), (0.95, 0.35), (0.85, 0.15), (-0.85, 0.15)], -0.42, 0.42, bevel=0.02)
    for s in (1, -1):
        m.box(RUSTD, (0, 0.2, s * 0.46), (1.8, 0.3, 0.14), bevel=0.03)                         # tracks
        for k in range(5): m.cyl(DARKD, (-0.7 + k * 0.35, 0.2, s * 0.53), (-0.7 + k * 0.35, 0.2, s * 0.56), 0.12, seg=12)
    m.box(RUSTD, (0.9, 0.05, 0.75), (1.2, 0.04, 0.18), bevel=0.0, yaw=0.3)                    # a thrown track lying in the sand
    m.cyl(BURNT, (-0.05, 0.62, 0.05), (-0.05, 0.9, 0.05), 0.42, seg=16).rotation_euler[0] += 0.25     # turret, askew
    m.cyl(RUSTD, (0.2, 0.8, 0.1), (1.2, 0.62, 0.3), 0.04, seg=8)                               # gun, drooping
    m.foliage('#b89a6a', [((rnd() - 0.5) * 1.8, -0.05, (rnd() - 0.5) * 1.0, 0.25) for _ in range(6)], res=0.05, bump=0.02, tris=400, seed=6610)   # sand drifted up
    m.finish()

def drums():
    m = Scene('drums'); rnd = mulberry(671)
    for i, (x, z, up) in enumerate(((-0.2, -0.1, True), (0.2, 0.05, True), (0.05, 0.35, False))):
        col = DRUM if i % 2 else DRUM2
        if up:
            m.cyl(col, (x, 0, z), (x, 0.55, z), 0.17, seg=16)
            for y in (0.18, 0.37): m.torus(col, (x, y, z), (0, 1, 0), 0.172, 0.012, seg=16)
        else:
            m.cyl(col, (x - 0.27, 0.17, z), (x + 0.27, 0.17, z), 0.17, seg=16)
    m.finish()

def scrub():
    m = Scene('scrub'); rnd = mulberry(681)
    m.foliage(SCRUB, [((rnd() - 0.5) * 0.4, 0.1 + rnd() * 0.1, (rnd() - 0.5) * 0.4, 0.14 + rnd() * 0.06) for _ in range(6)], res=0.04, bump=0.05, tris=300, seed=6810)
    for i in range(8):
        a = rnd() * 6.3
        m.cyl('#6b5a40', (0, 0, 0), (math.cos(a) * 0.3, 0.2 + rnd() * 0.15, math.sin(a) * 0.3), 0.01, seg=4)
    m.finish()

MODELS = {'palm0': lambda: palm('palm0', 2.4, 0.35, 601), 'palm1': lambda: palm('palm1', 2.9, -0.25, 602), 'adobe': lambda: adobe(False), 'adobe_ruin': lambda: adobe(True),
          'outcrop': lambda: rockpile('outcrop', (1.8, 1.8), 621), 'mesa': lambda: rockpile('mesa', (2.8, 1.8), 622, True), 'ridge': ridge, 'sanddune': sanddune,
          'sangar': sangar, 'wreck': wreck, 'drums': drums, 'scrub': scrub}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
