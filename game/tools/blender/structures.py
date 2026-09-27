# The American headquarters and everyone's fortifications (sandbags, walls, wire, barrels, tank
# traps, mines) for Plastic Front, modelled in Blender in the same moulded-plastic toy style as the
# vehicles (see vehicles.py for the helpers and conventions). The gun emplacements and towers of
# every army, the Americans included, are in structures_nations.py.
#
#   python tools/blender/structures.py [name ...]
#
# Parts: main, dark and painted parts.
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from vehicles import Model, G, clear, LIGHT, GLASS, WHITE, RED

def mulberry(seed):
    s = [seed & 0xffffffff]
    def rnd():
        s[0] = (s[0] + 0x6D2B79F5) & 0xffffffff
        t = s[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return rnd

def sandbag(m, part, c, yaw=0.0, L=0.4, W=0.24, H=0.16, rnd=None):
    """a filled sack: soft pillow body, tied ears at both ends and a seam."""
    j = (lambda: (rnd() - 0.5)) if rnd else (lambda: 0)
    x, y, z = c; yaw += j() * 0.25
    o = m.sphere(part, (x, y, z), 0.5, scale=(L * (1 + j() * 0.08), H, W), seg=20)
    o.rotation_euler = (0, 0, yaw)
    cx, sz = math.cos(yaw), math.sin(yaw)
    for s in (1, -1):
        e = m.sphere(part, (x + cx * s * L * 0.5, y, z - sz * s * L * 0.5), 0.05, scale=(1.4, 0.8, 1.0), seg=10)
        e.rotation_euler = (0, 0, yaw)
    seam = m.box(part, (x, y + H * 0.46, z), (L * 0.8, 0.012, 0.012), bevel=0.0, yaw=yaw)

def sandbag_row(m, part, a, b, y, n, rnd, W=0.24):
    a, b = Vector(a), Vector(b); d = b - a
    yaw = -math.atan2(d.y, d.x)          # a, b given as (x, z)
    for i in range(n):
        p = a + d * ((i + 0.5) / n)
        sandbag(m, part, (p.x, y, p.y), yaw, L=d.length / n * 1.05, W=W, rnd=rnd)

def sandbag_ring(m, part, R, a0, a1, layers, n, rnd, y0=0.0):
    for l in range(layers):
        k = n - (l % 2)
        for i in range(k):
            a = a0 + (a1 - a0) * (i + 0.5 + (l % 2) * 0.5) / n
            L = R * (a1 - a0) / n * 1.05
            sandbag(m, part, (math.cos(a) * R, y0 + 0.08 + l * 0.15, math.sin(a) * R), -a + math.pi / 2, L=L, rnd=rnd)

# =========================================================================================
def hq():
    m = Model('hq'); rnd = mulberry(7)
    # ground floor: walls with quoins, plinth, windows with frames/sills/shutters, door with steps
    m.box('main', (0, 0.06, 0), (3.75, 0.12, 3.55), bevel=0.03)                          # plinth
    m.box('main', (0, 0.8, 0), (3.6, 1.4, 3.4), bevel=0.03)
    for x in (-1.8, 1.8):
        for z in (-1.7, 1.7):
            for k in range(5): m.box('main', (x, 0.2 + k * 0.28, z), (0.2 if k % 2 else 0.14, 0.24, 0.14 if k % 2 else 0.2), bevel=0.012)
    def window(x, y, z, face, w=0.55, h=0.55):
        n = {'+x': (1, 0), '-x': (-1, 0), '+z': (0, 1), '-z': (0, -1)}[face]
        fx, fz = n
        sx, sz = (0.02, w) if fx else (w, 0.02)
        m.box('dark', (x, y, z), (sx + (0.02 if fx else 0), h, sz + (0.02 if fz else 0)), bevel=0.0)
        m.box('main', (x + fx * 0.03, y - h / 2 - 0.03, z + fz * 0.03), (sx + (0.08 if fx else 0.1), 0.05, sz + (0.1 if fx else 0.08)), bevel=0.01)   # sill
        m.box('main', (x + fx * 0.02, y + h / 2 + 0.03, z + fz * 0.02), (sx + (0.04 if fx else 0.08), 0.05, sz + (0.08 if fx else 0.04)), bevel=0.008)  # lintel
        m.box('main', (x + fx * 0.02, y, z + fz * 0.02), (0.02 if fx else 0.03, h, 0.03 if fx else 0.02), bevel=0.0)   # mullion
        for s in (1, -1):                                                                  # shutters
            if fx: m.box('main', (x + fx * 0.03, y, z + s * (w / 2 + 0.14)), (0.03, h * 0.95, 0.24), bevel=0.008)
            else: m.box('main', (x + s * (w / 2 + 0.14), y, z + fz * 0.03), (0.24, h * 0.95, 0.03), bevel=0.008)
    for z in (-1.1, 1.1): window(1.8, 0.85, z, '+x')
    for x in (-1.2, 0.0, 1.2):
        window(x, 0.85, 1.7, '+z'); window(x, 0.85, -1.7, '-z')
    for z in (-0.9, 0.9): window(-1.8, 0.85, z, '-x')
    m.box('dark', (1.8, 0.48, 0), (0.04, 0.9, 0.7), bevel=0.0)                              # door
    m.box('main', (1.83, 0.48, 0), (0.03, 0.8, 0.02), bevel=0.0)
    for z in (-0.39, 0.39): m.box('main', (1.84, 0.5, z), (0.08, 1.0, 0.08), bevel=0.01)     # door frame
    m.box('main', (1.84, 1.02, 0), (0.08, 0.08, 0.86), bevel=0.01)
    for k in range(3): m.box('main', (1.95 + k * 0.1, 0.1 - k * 0.035, 0), (0.12, 0.07, 1.0 - k * 0.1), bevel=0.01)   # steps
    m.box('main', (1.86, 1.3, 0), (0.06, 0.3, 1.3), bevel=0.015)                            # sign board
    m.box('dark', (1.89, 1.3, 0), (0.02, 0.2, 1.15), bevel=0.0)
    for k in range(8): m.box('main', (1.905, 1.3, -0.45 + k * 0.13), (0.02, 0.12, 0.06), bevel=0.004)   # raised letters
    m.box('main', (0, 1.52, 0), (3.7, 0.12, 3.5), bevel=0.03)                              # floor slab
    # roof terrace railing and sandbags over the front
    for z in (-1.68, 1.68): m.box('main', (0.95, 1.72, z), (1.6, 0.06, 0.06), bevel=0.01)
    m.box('main', (1.78, 1.72, 0), (0.06, 0.06, 3.36), bevel=0.01)
    for x in (0.2, 0.6, 1.0, 1.4, 1.78):
        for z in (-1.68, 1.68): m.box('main', (x, 1.63, z), (0.05, 0.2, 0.05), bevel=0.0)
    for z in (-1.2, -0.6, 0, 0.6, 1.2): m.box('main', (1.78, 1.63, z), (0.05, 0.2, 0.05), bevel=0.0)
    sandbag_row(m, 'main', (1.5, -1.0), (1.5, 1.0), 1.66, 5, rnd)
    # upper floor with windows, balcony door, roof parapet, roof hatch, searchlight, water tank, antenna, flag
    m.box('main', (-0.75, 2.2, 0), (2.0, 1.25, 3.2), bevel=0.03)
    for z in (-1.1, 1.1): window(0.25, 2.2, z * 0.9, '+x', 0.5, 0.5)
    for x in (-1.4, -0.4):
        window(x, 2.2, 1.6, '+z', 0.5, 0.45); window(x, 2.2, -1.6, '-z', 0.5, 0.45)
    m.box('dark', (0.25, 2.05, 0), (0.03, 0.8, 0.5), bevel=0.0)
    m.box('main', (-0.75, 2.86, 0), (2.1, 0.1, 3.3), bevel=0.02)
    for x, sx, sz, zz in ((-0.75, 2.1, 0.08, 1.61), (-0.75, 2.1, 0.08, -1.61)): m.box('main', (x, 2.97, zz), (sx, 0.16, sz), bevel=0.01)
    for xx in (0.26, -1.76): m.box('main', (xx, 2.97, 0), (0.08, 0.16, 3.3), bevel=0.01)
    m.box('main', (-1.2, 2.95, 0.8), (0.4, 0.06, 0.4), bevel=0.01)                          # roof hatch
    m.cyl('main', (-0.3, 2.91, -0.9), (-0.3, 3.05, -0.9), 0.12, seg=20)                     # searchlight
    m.cyl('main', (-0.3, 3.15, -0.9), (-0.1, 3.2, -0.9), 0.12, seg=24, bevel=0.01)
    m.cyl(LIGHT, (-0.09, 3.2, -0.9), (-0.08, 3.2, -0.9), 0.1, seg=24)
    m.cyl('main', (-1.3, 2.91, -0.6), (-1.3, 3.3, -0.6), 0.25, seg=28, bevel=0.02)          # water tank
    for k in (0.1, 0.3): m.torus('main', (-1.3, 2.95 + k, -0.6), (0, 1, 0), 0.25, 0.015)
    m.cyl('dark', (-1.6, 2.9, 1.3), (-1.6, 4.4, 1.3), 0.012, seg=8)                          # radio mast
    for k in (3.4, 3.9): m.cyl('dark', (-1.75, k, 1.3), (-1.45, k, 1.3), 0.008, seg=6)
    m.cyl('main', (-1.4, 2.9, -1.2), (-1.4, 4.5, -1.2), 0.03, seg=12)                       # flag pole
    m.sphere('main', (-1.4, 4.52, -1.2), 0.05, seg=12)
    fl = m.fin('main', [(-1.37, 4.45), (-0.7, 4.4), (-0.72, 4.12), (-1.37, 4.02)], -1.2, 0.02)
    m.cyl('main', (-1.4, 2.91, -1.2), (-1.4, 3.0, -1.2), 0.12, seg=16)
    # outside: ladder, crates, oil drums, a stack of sandbags by the door
    for z in (1.95, 2.15): m.box('main', (-1.3, 1.2, z), (0.05, 2.4, 0.05), bevel=0.0)
    for k in range(10): m.box('main', (-1.3, 0.2 + k * 0.24, 2.05), (0.04, 0.03, 0.22), bevel=0.0)
    for x, z in ((1.3, -2.0), (1.0, -2.1)): m.box('main', (x, 0.18, z), (0.34, 0.34, 0.3), bevel=0.02)
    m.box('main', (1.15, 0.52, -2.05), (0.3, 0.3, 0.28), bevel=0.02)
    for x, z in ((-1.9, -1.9), (-1.6, -2.05)):
        m.cyl('main', (x, 0, z), (x, 0.5, z), 0.15, seg=24)
        for k in (0.12, 0.38): m.torus('main', (x, k, z), (0, 1, 0), 0.15, 0.012, seg=20)
    sandbag_row(m, 'main', (2.25, 0.7), (2.25, 1.6), 0.08, 3, rnd); sandbag_row(m, 'main', (2.25, 0.8), (2.25, 1.5), 0.22, 2, rnd)
    m.finish()

def sandbags(variant):
    m = Model(f'sandbags{variant}'); rnd = mulberry(100 + variant)
    for l in range(3):
        n = 5 - (1 if l == 2 else 0)
        off = (l % 2) * 0.2
        for i in range(n):
            x = -0.8 + off + i * 0.4
            if x > 0.85: continue
            sandbag(m, 'main', (x, 0.09 + l * 0.15, (rnd() - 0.5) * 0.04), 0.0, L=0.42, W=0.3, H=0.17, rnd=rnd)
    if variant == 1:
        sandbag(m, 'main', (0.95, 0.09, 0.28), 0.9, L=0.4, W=0.26, rnd=rnd)                   # one that fell off
    m.finish()

def wall(variant):
    m = Model(f'wall{variant}'); rnd = mulberry(200 + variant)
    L, H, T = 2.9, 1.5, 0.36
    m.box('main', (0, 0.05, 0), (L + 0.2, 0.1, T + 0.2), bevel=0.03)                           # footing
    cols = 12
    tops = [H * (0.72 + rnd() * 0.3) * (1.05 if i in (0, cols - 1) else 1) for i in range(cols)]
    for i in range(cols):
        if rnd() < 0.3: tops[i] *= 0.8
    bw, bh = L / cols, 0.1
    rows = int(H / bh)
    win = (3, 6, 0.45, 1.1) if variant == 0 else (7, 9, 0.5, 1.05)                               # window hole: cols, heights
    for r in range(rows):
        y = 0.1 + r * bh + bh / 2
        shift = (r % 2) * bw / 2
        for i in range(cols + 1):
            x0 = -L / 2 + i * bw - shift
            x1 = min(L / 2, x0 + bw); x0 = max(-L / 2, x0)
            if x1 - x0 < 0.03: continue
            ci = min(cols - 1, max(0, int((x0 + x1) / 2 / bw + cols / 2)))
            if y > tops[ci]: continue
            if win[0] <= ci < win[1] and win[2] < y < win[3]: continue
            j = (rnd() - 0.5) * 0.01
            m.box('main', ((x0 + x1) / 2, y + j, (rnd() - 0.5) * 0.015), (x1 - x0 - 0.012, bh - 0.012, T), bevel=0.01)
    xw0, xw1 = -L / 2 + win[0] * bw, -L / 2 + win[1] * bw
    m.box('main', ((xw0 + xw1) / 2, win[3] + 0.04, 0), (xw1 - xw0 + 0.1, 0.08, T + 0.04), bevel=0.01)   # lintel
    m.box('main', ((xw0 + xw1) / 2, win[2] - 0.03, 0), (xw1 - xw0 + 0.1, 0.05, T + 0.08), bevel=0.01)   # sill
    for k in range(9):                                                                             # rubble
        s = 0.08 + rnd() * 0.08
        m.box('main', (-L / 2 + rnd() * L, 0.12 + s / 3, (1 if rnd() < 0.5 else -1) * (0.3 + rnd() * 0.25)), (s * 2, s, s * 1.2), bevel=0.012, yaw=rnd() * 3, pitch=(rnd() - 0.5) * 0.6)
    m.finish()

def wire():
    m = Model('wire')
    for x in (-0.8, 0, 0.8):                                                                      # X-shaped pickets
        for s in (1, -1):
            m.box('main', (x, 0.36, 0), (0.05, 0.8, 0.05), bevel=0.008, roll=0.6 * s)
        m.box('main', (x, 0.2, 0), (0.04, 0.04, 0.5), bevel=0.0)
    # concertina coil: a helix of thin wire, plus two straight strands with barbs
    pts = []
    N = 260
    for i in range(N + 1):
        t = i / N
        a = t * 2 * math.pi * 14
        pts.append((-0.95 + t * 1.9, 0.3 + math.sin(a) * 0.24, math.cos(a) * 0.24))
    for a, b in zip(pts, pts[1:]): m.cyl('dark', a, b, 0.01, seg=5)
    for y in (0.52, 0.12):
        m.cyl('dark', (-0.95, y, 0), (0.95, y, 0), 0.01, seg=6)
        for k in range(20):
            x = -0.9 + k * 0.095
            for s in (1, -1): m.cyl('dark', (x, y, 0), (x + 0.025, y + 0.03 * s, 0.03 * s), 0.006, seg=4)
    m.finish()

def barrel():
    m = Model('barrel')
    m.cyl('main', (0, 0.02, 0), (0, 0.88, 0), 0.33, seg=36)
    for y in (0.02, 0.88): m.torus('main', (0, y, 0), (0, 1, 0), 0.325, 0.025, seg=36)       # rolled rims
    for y in (0.3, 0.6): m.torus('main', (0, y, 0), (0, 1, 0), 0.335, 0.018, seg=36)         # rolling hoops
    m.cyl('dark', (0, 0.88, 0), (0, 0.885, 0), 0.3, seg=36)                                   # lid
    m.cyl('main', (0.16, 0.885, 0.08), (0.16, 0.92, 0.08), 0.05, seg=16)                       # bung caps
    m.cyl('main', (-0.15, 0.885, -0.1), (-0.15, 0.91, -0.1), 0.03, seg=12)
    m.cyl(RED, (0, 0.42, 0), (0, 0.5, 0), 0.333, seg=36)                                       # hazard band
    m.box(WHITE, (0.33, 0.46, 0), (0.012, 0.06, 0.12), bevel=0.0)
    m.finish()

def tanktrap():
    """a Czech hedgehog: three steel angle beams welded crosswise, on a small concrete pad."""
    m = Model('tanktrap')
    m.box('dark', (0, 0.015, 0), (0.8, 0.03, 0.8), bevel=0.01)
    c = 0.36
    dirs = [(1, 1, 0), (1, -1, 0), (0, 1, 1), (0, -1, 1), (1, 0, 1), (-1, 0, 1)]
    for a, b in [((-c, 0.02, -c), (c, 0.74, c)), ((c, 0.02, -c), (-c, 0.74, c)), ((0, 0.02, c * 1.2), (0, 0.74, -c * 1.2))]:
        # an L-section beam: two thin plates along the line
        ax, ay, az = a; bx, by, bz = b
        m.cyl('main', a, b, 0.045, seg=4)
        m.cyl('main', (ax + 0.03, ay, az), (bx + 0.03, by, bz), 0.02, seg=4)
        for t in (0.25, 0.75):
            p = (ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)
            m.sphere('dark', p, 0.035, seg=8)                                                    # rivets
    m.box('dark', (0, 0.38, 0), (0.14, 0.14, 0.14), bevel=0.02)                               # welded gusset
    m.finish()

def mine_at():
    """a Teller-type anti-tank mine, half dug in: a flat steel drum with a pressure cap."""
    m = Model('mine_at')
    m.cyl('dark', (0, 0.0, 0), (0, 0.06, 0), 0.2, seg=24, bevel=0.01)
    m.torus('dark', (0, 0.055, 0), (0, 1, 0), 0.19, 0.012, seg=24)
    m.cyl('main', (0, 0.06, 0), (0, 0.085, 0), 0.08, seg=16, bevel=0.005)
    m.box('main', (0.21, 0.035, 0), (0.04, 0.02, 0.07), bevel=0.0)                           # carrying handle
    m.finish()

def mine_ap():
    """an anti-personnel "S" mine: a small can with its three-pronged fuse sticking out."""
    m = Model('mine_ap')
    m.cyl('dark', (0, 0.0, 0), (0, 0.06, 0), 0.08, seg=16, bevel=0.006)
    m.cyl('main', (0, 0.06, 0), (0, 0.11, 0), 0.015, seg=8)
    for a in (0, 2.1, 4.2): m.cyl('main', (0, 0.1, 0), (math.cos(a) * 0.035, 0.13, math.sin(a) * 0.035), 0.006, seg=5)
    m.finish()

MODELS = {'hq': hq,
          'sandbags0': lambda: sandbags(0), 'sandbags1': lambda: sandbags(1), 'wall0': lambda: wall(0), 'wall1': lambda: wall(1),
          'wire': wire, 'barrel': barrel, 'tanktrap': tanktrap, 'mine_at': mine_at, 'mine_ap': mine_ap}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
