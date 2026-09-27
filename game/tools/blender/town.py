# The ruined town (stage 2 diorama), modelled in Blender: town houses with plaster fronts, shop
# fronts and slate or tile roofs, the same houses in ruins (jagged walls with real window holes,
# rubble and charred beams inside), a church, a monument, rubble heaps, barricades, anti-tank
# hedgehogs, a stone bridge, river quay walls and street lamps.
#
#   python tools/blender/town.py [name ...]
#
# Written next to the Normandy scenery (.cache/figures/scenery); tools/figures.mjs packs them all.
# The plaster colour (PLASTER_T) is tinted per house by the game, so one model makes a whole street.
# Axes as in vehicles.py (x along the street front, y up, z towards the street: the front is +z).
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from vehicles import clear
from scenery import Scene, mulberry, STONE, STONE2, SLATE, TILE, WINDOW, WOOD, BEAM, EARTH

PLASTER_T = '#ece6da'        # tinted per instance
BRICK, CHAR, IRON, CANVAS, BRONZE, DUST = '#9e5f40', '#2d2825', '#2f3431', '#8e3b2d', '#5d6b50', '#8f877a'
GLASS = '#3a4650'
FLOOR_H = 0.95

# ---------------------------------------------------------------------------------------------
def wall(m, part, a0, a1, c, y0, y1, thick, axis='x', holes=(), top=None, slice_w=0.1):
    """a wall from a0 to a1 along `axis` (x: runs along x at z = c; z: runs along z at x = c),
    y0..y1 high, with rectangular holes [(centre, bottom, top, width)] cut right through and an
    optional jagged top (top(a) -> height) for ruins. Built from vertical slices, merged where equal."""
    def spans(a):
        hi = min(y1, top(a)) if top else y1
        cuts = sorted((b, t) for (hc, b, t, w) in holes if abs(a - hc) < w / 2)
        out, y = [], y0
        for b, t in cuts:
            if b > y: out.append((y, min(b, hi)))
            y = max(y, t)
        if y < hi: out.append((y, hi))
        return [s for s in out if s[1] - s[0] > 0.02]
    n = max(1, round((a1 - a0) / slice_w)); w = (a1 - a0) / n
    run, start = None, a0
    def flush(end):
        if not run: return
        mid = (start + end) / 2
        for b, t in run:
            if axis == 'x': m.box(part, (mid, (b + t) / 2, c), (end - start, t - b, thick), bevel=0.0)
            else: m.box(part, (c, (b + t) / 2, mid), (thick, t - b, end - start), bevel=0.0)
    for i in range(n):
        a = a0 + (i + 0.5) * w
        sp = [(round(b, 3), round(t, 3)) for b, t in spans(a)]
        if sp != run:
            flush(a0 + i * w); run, start = sp, a0 + i * w
    flush(a1)

def window(m, x, y, z, face, w=0.26, h=0.42, shutters=None, pane=True, axis='x'):
    """frame, sill, lintel and a recessed pane in a hole; face = +1/-1 (outward side)."""
    P = lambda a, yy, d: (a, yy, z + face * d) if axis == 'x' else (z + face * d, yy, a)
    S = lambda sa, sy, sd: (sa, sy, sd) if axis == 'x' else (sd, sy, sa)
    if pane:
        m.box(GLASS, P(x, y, -0.03), S(w, h, 0.02), bevel=0.0)
        m.box(PLASTER_T, P(x, y, -0.02), S(0.025, h, 0.02), bevel=0.0)        # glazing bars
        m.box(PLASTER_T, P(x, y + h * 0.18, -0.02), S(w, 0.025, 0.02), bevel=0.0)
    m.box(STONE, P(x, y - h / 2 - 0.025, 0.03), S(w + 0.1, 0.05, 0.08), bevel=0.008)   # sill
    m.box(STONE, P(x, y + h / 2 + 0.03, 0.015), S(w + 0.08, 0.06, 0.04), bevel=0.006)   # lintel
    if shutters:
        for s in (1, -1): m.box(shutters, P(x + s * (w / 2 + 0.08), y, 0.02), S(0.15, h, 0.02), bevel=0.004)

def roof(m, L, D, y0, rh, mat, over=0.12, courses=7):
    """pitched roof along x with courses of slates/tiles, a ridge and gable ends filled in."""
    ang = math.atan2(rh, D / 2)
    m.prism_x(PLASTER_T, [(-D / 2 + 0.01, y0), (D / 2 - 0.01, y0), (0, y0 + rh - 0.03)], -L / 2 + 0.01, L / 2 - 0.01)
    for s in (1, -1):
        m.box(mat, (0, y0 + rh / 2 + 0.03, s * D / 4), (L + over * 2, 0.05, math.hypot(rh, D / 2) + over), bevel=0.008, roll=s * ang)
        for k in range(courses):
            f = (k + 0.5) / courses
            m.box(mat, (0, y0 + f * rh + 0.06, s * (D / 2 + over * 0.8 - f * (D / 2 + over * 0.7))), (L + over * 2 - 0.02, 0.02, 0.1), bevel=0.004, roll=s * ang)
    m.cyl(mat, (-L / 2 - over, y0 + rh + 0.04, 0), (L / 2 + over, y0 + rh + 0.04, 0), 0.05, seg=8)

def chimney(m, x, z, y, h=0.5):
    m.box(BRICK, (x, y + h / 2, z), (0.22, h, 0.3), bevel=0.01)
    m.box(STONE, (x, y + h + 0.02, z), (0.26, 0.04, 0.34), bevel=0.006)
    m.cyl(TILE, (x, y + h, z), (x, y + h + 0.1, z), 0.05, seg=8)

# ---------------------------------------------------------------------------------------------
def house(name, L, D, floors, roofmat, shop=False, dormers=1, seed=1):
    m = Scene(name); rnd = mulberry(seed)
    Hw = floors * FLOOR_H + 0.08
    per = max(1, round(L / 0.7))                                   # window columns
    xs = [-L / 2 + (i + 0.5) * L / per for i in range(per)]
    for face in (1, -1):                                           # front and back
        holes = []
        for f in range(floors):
            yc = 0.08 + f * FLOOR_H + 0.52
            for i, x in enumerate(xs):
                if f == 0 and face == 1 and shop: continue
                if f == 0 and face == 1 and i == 0: holes.append((x, 0.08, 0.84, 0.3)); continue    # front door
                holes.append((x, yc - 0.21, yc + 0.21, 0.26))
        if shop and face == 1: holes.append((0.12, 0.2, 0.8, L * 0.62))
        wall(m, PLASTER_T, -L / 2, L / 2, face * (D / 2 - 0.04), 0.0, Hw, 0.08, holes=holes)
        for (hc, b, t, w) in holes:
            if t - b < 0.5 and not (shop and face == 1 and w > 1):
                window(m, hc, (b + t) / 2, face * (D / 2 - 0.04), face, w, t - b, shutters=['#6f8796', '#6d7a4e', '#7d5a3e', None][seed % 4] if f else None)
    for face in (1, -1):                                           # side walls (party walls: few windows)
        holes = [(0.0, 0.08 + f * FLOOR_H + 0.31, 0.08 + f * FLOOR_H + 0.73, 0.24) for f in range(1, floors)] if D > 1.2 else []
        wall(m, PLASTER_T, -D / 2, D / 2, face * (L / 2 - 0.04), 0.0, Hw, 0.08, axis='z', holes=holes)
        for (hc, b, t, w) in holes: window(m, hc, (b + t) / 2, face * (L / 2 - 0.04), face, w, t - b, axis='z')
    m.box(DUST, (0, Hw / 2, 0), (L - 0.2, Hw - 0.02, D - 0.2), bevel=0.0)       # dark inside behind the panes
    m.box(STONE2, (0, 0.26, 0), (L + 0.03, 0.52, D + 0.03), bevel=0.01)          # stone ground-floor plinth
    for f in range(1, floors + 1):                                               # string courses and cornice
        y = 0.08 + f * FLOOR_H - (0.02 if f < floors else -0.02)
        m.box(STONE, (0, y, 0), (L + 0.05 + (0.06 if f == floors else 0), 0.05 if f < floors else 0.1, D + 0.05 + (0.06 if f == floors else 0)), bevel=0.01)
    # front door
    x = xs[0] if not shop else L / 2 - 0.25
    if not shop:
        m.box(WOOD, (x, 0.46, D / 2 - 0.06), (0.28, 0.74, 0.03), bevel=0.004)
        m.box(STONE2, (x, 0.04, D / 2 + 0.08), (0.4, 0.08, 0.18), bevel=0.01)
    if shop:
        w = L * 0.62
        m.box(GLASS, (0.12, 0.5, D / 2 - 0.07), (w, 0.6, 0.02), bevel=0.0)
        for k in range(4): m.box(WOOD, (0.12 - w / 2 + k * w / 3, 0.5, D / 2 - 0.05), (0.04, 0.62, 0.04), bevel=0.0)
        m.box(WOOD, (0.12, 0.83, D / 2 - 0.03), (w + 0.1, 0.1, 0.05), bevel=0.005)
        m.box('#e9dcb0', (0.12, 0.83, D / 2 + 0.0), (w * 0.8, 0.07, 0.01), bevel=0.0)        # shop sign
        for k in range(6):                                                                  # striped awning
            m.box(CANVAS if k % 2 else '#e8e0cc', (0.12 - w / 2 + (k + 0.5) * w / 6, 0.98, D / 2 + 0.16), (w / 6, 0.02, 0.4), bevel=0.0, roll=-0.45)
    # balcony on the first floor
    if floors >= 3 and not shop:
        xb = xs[-1]
        m.box(STONE, (xb, 0.08 + FLOOR_H + 0.02, D / 2 + 0.12), (0.5, 0.05, 0.26), bevel=0.01)
        for k in range(7): m.cyl(IRON, (xb - 0.22 + k * 0.073, 0.08 + FLOOR_H + 0.04, D / 2 + 0.24), (xb - 0.22 + k * 0.073, 0.08 + FLOOR_H + 0.3, D / 2 + 0.24), 0.008, seg=5)
        m.box(IRON, (xb, 0.08 + FLOOR_H + 0.3, D / 2 + 0.24), (0.48, 0.02, 0.02), bevel=0.0)
    rh = min(0.9, D * 0.42)
    roof(m, L, D, Hw + 0.02, rh, roofmat)
    for k in range(dormers):
        xd = -L / 2 + (k + 0.5) * L / dormers
        zd = D / 4
        m.box(PLASTER_T, (xd, Hw + 0.28, zd), (0.34, 0.34, 0.4), bevel=0.005)
        m.prism(roofmat, [(xd - 0.24, Hw + 0.45), (xd + 0.24, Hw + 0.45), (xd, Hw + 0.66)], zd - 0.22, zd + 0.24, bevel=0.005)
        m.box(GLASS, (xd, Hw + 0.28, zd + 0.2), (0.18, 0.2, 0.02), bevel=0.0)
    chimney(m, L / 2 - 0.25, -D * 0.1, Hw + rh * 0.55)
    if L > 2.5: chimney(m, -L / 2 + 0.3, D * 0.12, Hw + rh * 0.5)
    m.finish()

def ruin(name, L, D, floors, seed):
    """the same town house after the shelling: the roof gone, walls broken off at ragged heights
    (lowest at the front, so the soldiers inside can be seen), rubble and charred beams inside."""
    m = Scene(name); rnd = mulberry(seed)
    Hw = floors * FLOOR_H + 0.08
    per = max(1, round(L / 0.7)); xs = [-L / 2 + (i + 0.5) * L / per for i in range(per)]
    def jag(base, amp, k):
        pts = [base + (rnd() - 0.5) * amp for _ in range(k + 1)]
        def top(a, lo=-L / 2, span=L):
            t = (a - lo) / span * k; i = min(k - 1, max(0, int(t))); f = t - i
            v = pts[i] * (1 - f) + pts[i + 1] * f
            return v - (0.08 if (int(a * 11) % 3 == 0) else 0)          # broken brick teeth
        return top
    tops = {('x', 1): jag(0.55, 0.7, 5), ('x', -1): jag(Hw * 0.85, Hw * 0.5, 6), ('z', 1): jag(Hw * 0.5, 1.0, 4), ('z', -1): jag(Hw * 0.7, 0.9, 4)}
    for face in (1, -1):
        holes = []
        for f in range(floors):
            yc = 0.08 + f * FLOOR_H + 0.52
            for i, x in enumerate(xs): holes.append((x, yc - 0.23, yc + 0.23, 0.28) if not (f == 0 and i == 0 and face == 1) else (x, 0.08, 0.84, 0.32))
        tp = tops[('x', face)]
        wall(m, PLASTER_T, -L / 2, L / 2, face * (D / 2 - 0.04), 0.0, Hw, 0.08, holes=holes, top=tp, slice_w=0.16)
        wall(m, BRICK, -L / 2 + 0.02, L / 2 - 0.02, face * (D / 2 - 0.1), 0.0, Hw, 0.05, holes=holes, top=lambda a, tp=tp: tp(a) - 0.03, slice_w=0.16)
        for (hc, b, t, w) in holes:
            if b > 0.1 and t < tp(hc) - 0.05: window(m, hc, (b + t) / 2, face * (D / 2 - 0.04), face, w, t - b, pane=False)
    for face in (1, -1):
        tp0 = tops[('z', face)]
        tp = lambda a, tp0=tp0: tp0(a, -D / 2, D)
        wall(m, PLASTER_T, -D / 2, D / 2, face * (L / 2 - 0.04), 0.0, Hw, 0.08, axis='z', top=tp, slice_w=0.16)
        wall(m, BRICK, -D / 2 + 0.02, D / 2 - 0.02, face * (L / 2 - 0.1), 0.0, Hw, 0.05, axis='z', top=lambda a, tp=tp: tp(a) - 0.03, slice_w=0.16)
    m.box(STONE2, (0, 0.1, 0), (L + 0.03, 0.2, D + 0.03), bevel=0.01)
    # a piece of the first floor still hanging from the back wall, charred joists
    m.box(WOOD, (-L * 0.15, 0.08 + FLOOR_H, -D * 0.28), (L * 0.55, 0.05, D * 0.4), bevel=0.004, roll=0.12, pitch=0.05)
    for k in range(4):
        x = -L / 2 + 0.3 + rnd() * (L - 0.6)
        m.box(CHAR, (x, 0.5 + rnd() * 0.4, (rnd() - 0.5) * D * 0.6), (0.08, 0.08, D * (0.5 + rnd() * 0.3)), bevel=0.01, yaw=(rnd() - 0.5) * 1.0, roll=(rnd() - 0.5) * 0.9)
    # rubble: a heap of plaster and brick lumps against the back and at the corners
    balls = []
    for i in range(int(8 + L * 5)):
        x = -L / 2 + 0.2 + rnd() * (L - 0.4); z = -D / 2 + 0.2 + rnd() * (D * 0.7)
        balls.append((x, 0.05, z, 0.14 + rnd() * 0.16))
    m.foliage(DUST, balls, res=0.05, bump=0.04, tris=1400, seed=900 + seed)
    for i in range(int(10 + L * 6)):
        x = -L / 2 + rnd() * L; z = -D / 2 + rnd() * D
        m.box(BRICK if rnd() < 0.6 else STONE, (x, 0.08 + rnd() * 0.18, z), (0.1, 0.05, 0.06), bevel=0.01, yaw=rnd() * 3, roll=rnd() * 0.8)
    # scorch on the floor
    m.box(CHAR, (0, 0.205, D * 0.1), (L * 0.6, 0.01, D * 0.4), bevel=0.0)
    m.finish()

def church():
    """a stone village church, 5 x 3 cells: nave with buttresses and tall arched windows, a square
    west tower with a slate spire; the east end of the roof has a shell hole."""
    m = Scene('church'); rnd = mulberry(131)
    L, D, Hw, rh = 3.4, 2.7, 2.1, 1.3
    x0 = 0.75                                                                        # the nave sits east of the tower
    m.box(STONE2, (x0, 0.08, 0), (L + 0.1, 0.16, D + 0.1), bevel=0.02)
    for face in (1, -1):
        holes = [(x0 - L / 2 + (i + 0.5) * L / 4, 0.55, 1.65, 0.34) for i in range(4)]
        wall(m, STONE, x0 - L / 2, x0 + L / 2, face * (D / 2 - 0.06), 0.0, Hw, 0.12, holes=holes)
        for (hc, b, t, w) in holes:
            m.box(GLASS, (hc, (b + t) / 2, face * (D / 2 - 0.1)), (w, t - b, 0.02), bevel=0.0)
            m.cyl(STONE2, (hc, t, face * (D / 2 - 0.02)), (hc, t, face * (D / 2 + 0.02)), w / 2 + 0.04, seg=16)  # round arch head
            for k in range(1, 3): m.box(IRON, (hc, b + k * (t - b) / 3, face * (D / 2 - 0.09)), (w, 0.015, 0.01), bevel=0.0)
        for i in range(5):                                                              # buttresses
            x = x0 - L / 2 + i * L / 4
            m.box(STONE2, (x, 0.75, face * (D / 2 + 0.1)), (0.18, 1.5, 0.22), bevel=0.015)
            m.box(STONE2, (x, 1.55, face * (D / 2 + 0.03)), (0.16, 0.2, 0.12), bevel=0.01, roll=face * 0.5)
    wall(m, STONE, -D / 2, D / 2, x0 + L / 2 - 0.06, 0.0, Hw, 0.12, axis='z', holes=[(0, 0.6, 1.8, 0.5)])
    m.box(GLASS, (x0 + L / 2 - 0.1, 1.2, 0), (0.02, 1.2, 0.5), bevel=0.0)
    m.cyl(STONE2, (x0 + L / 2 - 0.02, 1.2, 0), (x0 + L / 2 + 0.02, 1.2, 0), 0.24, seg=20)          # rose window
    m.box(DUST, (x0, Hw / 2, 0), (L - 0.3, Hw - 0.05, D - 0.3), bevel=0.0)
    m.prism_x(STONE, [(-D / 2 + 0.01, Hw), (D / 2 - 0.01, Hw), (0, Hw + rh - 0.03)], x0 - L / 2 + 0.01, x0 + L / 2 - 0.01)
    ang = math.atan2(rh, D / 2)
    for s in (1, -1):                                                                  # roof, with a hole in it
        for k in range(8):
            f = (k + 0.5) / 8
            for seg in range(4):
                if s == 1 and seg == 3 and 2 <= k <= 5: continue
                xs = x0 - L / 2 - 0.1 + (seg + 0.5) * (L + 0.2) / 4
                m.box(SLATE, (xs, Hw + f * rh + 0.06, s * (D / 2 + 0.1 - f * (D / 2 + 0.08))), ((L + 0.2) / 4 - 0.01, 0.03, 0.2), bevel=0.004, roll=s * ang)
    for k in range(3): m.box(CHAR, (x0 + L / 2 - 0.55 + k * 0.12, Hw + rh * 0.55, D * 0.2), (0.05, 0.05, 0.9), bevel=0.0, roll=ang)   # rafters in the hole
    m.cyl(SLATE, (x0 - L / 2 - 0.1, Hw + rh + 0.04, 0), (x0 + L / 2 + 0.1, Hw + rh + 0.04, 0), 0.05, seg=8)
    # tower with belfry openings, clock and spire
    T, xt, Ht = 1.3, x0 - L / 2 - 0.6, 3.9
    for face in (1, -1):
        wall(m, STONE2, xt - T / 2, xt + T / 2, face * (T / 2 - 0.06), 0.0, Ht, 0.12, holes=[(xt, 3.0, 3.6, 0.4)] + ([(xt, 0.1, 1.0, 0.45)] if face == 1 else []))
        wall(m, STONE2, -T / 2, T / 2, xt + face * (T / 2 - 0.06), 0.0, Ht, 0.12, axis='z', holes=[(0, 3.0, 3.6, 0.4)])
    m.box(DUST, (xt, Ht / 2, 0), (T - 0.25, Ht, T - 0.25), bevel=0.0)
    m.box(WOOD, (xt, 0.55, T / 2 - 0.08), (0.44, 0.9, 0.03), bevel=0.004)
    m.cyl('#e9e4d6', (xt, 2.45, T / 2 - 0.02), (xt, 2.45, T / 2 + 0.02), 0.2, seg=24)            # clock face
    m.box(IRON, (xt + 0.05, 2.5, T / 2 + 0.03), (0.1, 0.02, 0.01), bevel=0.0, yaw=0, roll=0.9)
    m.box(IRON, (xt, 2.45 + 0.07, T / 2 + 0.03), (0.02, 0.14, 0.01), bevel=0.0)
    m.box(STONE, (xt, Ht + 0.05, 0), (T + 0.12, 0.1, T + 0.12), bevel=0.01)
    m.cyl(SLATE, (xt, Ht + 0.1, 0), (xt, Ht + 2.0, 0), T * 0.62, seg=4, r2=0.02).rotation_euler[2] += math.pi / 4
    m.cyl(IRON, (xt, Ht + 1.95, 0), (xt, Ht + 2.35, 0), 0.015, seg=6)
    m.box(IRON, (xt, Ht + 2.22, 0), (0.18, 0.02, 0.02), bevel=0.0)
    m.finish()

def monument():
    m = Scene('monument')
    for k, (s, h) in enumerate(((1.8, 0.12), (1.5, 0.12), (1.2, 0.12))):
        m.box(STONE2, (0, 0.06 + k * 0.12, 0), (s, h, s), bevel=0.015)
    m.box(STONE, (0, 0.95, 0), (0.7, 1.1, 0.7), bevel=0.02)
    m.box('#d8d0bc', (0, 0.9, 0.36), (0.5, 0.3, 0.01), bevel=0.0)                     # plaque
    m.box(STONE2, (0, 1.53, 0), (0.82, 0.08, 0.82), bevel=0.015)
    # a bronze soldier with a flag
    m.foliage(BRONZE, [(0, 1.75, 0, 0.13), (0, 1.95, 0, 0.14), (0, 2.12, 0, 0.1), (0.05, 2.25, 0, 0.08), (0.12, 1.72, 0.06, 0.06), (-0.1, 1.72, -0.05, 0.06), (0.14, 2.05, 0, 0.05)], res=0.03, bump=0.01, tris=900, seed=990)
    m.cyl(BRONZE, (0.18, 1.6, 0), (0.18, 2.7, 0), 0.015, seg=6)
    m.fin(BRONZE, [(0.19, 2.66), (0.6, 2.55), (0.55, 2.4), (0.19, 2.35)], 0, 0.015)
    for k in range(12):                                                                 # railing round it
        a = k / 12 * 2 * math.pi
        m.cyl(IRON, (math.cos(a) * 0.95, 0, math.sin(a) * 0.95), (math.cos(a) * 0.95, 0.4, math.sin(a) * 0.95), 0.012, seg=5)
    m.torus(IRON, (0, 0.38, 0), (0, 1, 0), 0.95, 0.012, seg=32)
    m.finish()

def rubble():
    m = Scene('rubble'); rnd = mulberry(151)
    m.foliage(DUST, [((rnd() - 0.5) * 0.6, 0.02, (rnd() - 0.5) * 0.6, 0.18 + rnd() * 0.12) for _ in range(9)], res=0.04, bump=0.05, tris=900, seed=991)
    for i in range(24):
        m.box(BRICK if rnd() < 0.6 else STONE, ((rnd() - 0.5) * 0.9, 0.05 + rnd() * 0.25, (rnd() - 0.5) * 0.9), (0.1, 0.05, 0.06), bevel=0.008, yaw=rnd() * 3, roll=rnd())
    for i in range(3):
        m.box(CHAR if i else WOOD, ((rnd() - 0.5) * 0.4, 0.2, (rnd() - 0.5) * 0.4), (0.06, 0.06, 0.8), bevel=0.008, yaw=rnd() * 3, roll=(rnd() - 0.5) * 0.8)
    m.finish()

def barricade():
    """a street barricade, 2 x 1 cells: an overturned cart, a wardrobe, planks, sandbags, a door."""
    m = Scene('barricade'); rnd = mulberry(171)
    m.box(WOOD, (-0.45, 0.3, 0), (0.9, 0.5, 0.55), bevel=0.02, roll=1.35)             # cart on its side
    m.torus(WOOD, (-0.45, 0.42, 0.33), (0, 0, 1), 0.28, 0.03, seg=24)
    for k in range(6):
        a = k / 6 * math.pi
        m.cyl(WOOD, (-0.45 - math.cos(a) * 0.27, 0.42 - math.sin(a) * 0.27, 0.33), (-0.45 + math.cos(a) * 0.27, 0.42 + math.sin(a) * 0.27, 0.33), 0.012, seg=5)
    m.box('#6a4a33', (0.35, 0.28, 0.02), (0.45, 0.56, 0.3), bevel=0.01, roll=0.2)      # wardrobe
    m.box(WOOD, (0.35, 0.3, 0.18), (0.2, 0.5, 0.02), bevel=0.0, roll=0.2)
    for k in range(5):                                                                   # planks
        m.box(WOOD, ((rnd() - 0.5) * 1.4, 0.15 + rnd() * 0.35, (rnd() - 0.5) * 0.3), (0.9, 0.03, 0.1), bevel=0.004, yaw=(rnd() - 0.5) * 0.8, roll=(rnd() - 0.5) * 1.2)
    for k in range(5):                                                                   # sandbags at the foot
        m.sphere('#b8a57a', (-0.8 + k * 0.4, 0.07, -0.28), 0.5, scale=(0.36, 0.13, 0.2), seg=12)
    m.box(WOOD, (0.8, 0.35, -0.05), (0.05, 0.7, 0.4), bevel=0.005, roll=0.25)          # a door propped up
    m.finish()

def hedgehog():
    """a Czech hedgehog: three steel angle beams welded across each other."""
    m = Scene('hedgehog')
    for yaw, pitch in ((0, 0.62), (2.09, 0.62), (4.19, 0.62)):
        o = m.box(IRON, (0, 0.33, 0), (0.95, 0.07, 0.07), bevel=0.006, yaw=yaw, pitch=pitch)
        m.box(IRON, (0, 0.33, 0), (0.95, 0.02, 0.12), bevel=0.0, yaw=yaw, pitch=pitch)
    m.finish()

def bridge():
    """a stone arch bridge along x (6.4 long, 3.2 wide), deck at street level, three arches over the water."""
    m = Scene('bridge')
    Lb, Wb = 6.4, 3.2
    m.box(STONE2, (0, -0.06, 0), (Lb, 0.16, Wb), bevel=0.015)                                    # deck
    m.box('#7f7a70', (0, 0.025, 0), (Lb - 0.1, 0.02, Wb - 0.5), bevel=0.0)                       # cobbled road
    for s in (1, -1):
        m.box(STONE, (0, 0.2, s * (Wb / 2 - 0.1)), (Lb, 0.4, 0.2), bevel=0.02)                   # parapets
        m.box(STONE2, (0, 0.42, s * (Wb / 2 - 0.1)), (Lb + 0.06, 0.05, 0.26), bevel=0.01)
        for x in (-Lb / 2 + 0.1, Lb / 2 - 0.1): m.box(STONE2, (x, 0.3, s * (Wb / 2 - 0.1)), (0.3, 0.6, 0.3), bevel=0.02)
        for x in (-1.25, 1.25): m.box(STONE2, (x, 0.2, s * (Wb / 2 + 0.05)), (0.3, 0.4, 0.2), bevel=0.02)   # cutwater caps
    # the spandrel walls with three arches, down into the water
    for s in (1, -1):
        wall(m, STONE, -Lb / 2 + 0.3, Lb / 2 - 0.3, s * (Wb / 2 - 0.12), -1.1, -0.1, 0.24, holes=[(-2.1, -1.2, -0.45, 1.1), (0, -1.2, -0.35, 1.4), (2.1, -1.2, -0.45, 1.1)])
    for x, w, t in ((-2.1, 1.1, -0.45), (0, 1.4, -0.35), (2.1, 1.1, -0.45)):
        a = m.cyl(STONE2, (x, t, -Wb / 2), (x, t, Wb / 2), w / 2, seg=24)                        # barrel vaults
    for x in (-1.25, 1.25):
        m.box(STONE2, (x, -0.6, 0), (0.45, 1.0, Wb + 0.1), bevel=0.02)                           # piers
    m.box(IRON, (Lb / 2 - 0.3, 0.9, Wb / 2 - 0.1), (0.04, 0.9, 0.04), bevel=0.0)                # a lamp on the parapet
    m.sphere('#f0e4b0', (Lb / 2 - 0.3, 1.38, Wb / 2 - 0.1), 0.07, seg=10)
    m.finish()

def quay():
    """one cell of river embankment: a stone wall from the water to just above street level."""
    m = Scene('quay'); rnd = mulberry(181)
    m.stones(STONE2, -0.52, 0.52, -0.8, 0.02, 0.0, 0.14, rnd, size=0.14)
    m.box(STONE, (0, 0.06, 0.03), (1.04, 0.08, 0.26), bevel=0.012)
    m.box('#3d4a3e', (0, -0.55, -0.05), (1.02, 0.4, 0.03), bevel=0.0)                            # wet stain line
    m.finish()

def lamp():
    m = Scene('lamp')
    m.cyl(IRON, (0, 0, 0), (0, 0.12, 0), 0.07, seg=10)
    m.cyl(IRON, (0, 0.12, 0), (0, 1.5, 0), 0.025, seg=8)
    m.cyl(IRON, (0, 1.45, 0), (0.2, 1.52, 0), 0.015, seg=6)
    m.cyl(IRON, (0.2, 1.52, 0), (0.2, 1.42, 0), 0.05, seg=8, r2=0.02)
    m.sphere('#efe2ae', (0.2, 1.4, 0), 0.035, seg=8)
    m.finish()

MODELS = {
    'house2a': lambda: house('house2a', 1.92, 1.9, 3, SLATE, dormers=1, seed=1),
    'house2b': lambda: house('house2b', 1.92, 1.9, 3, TILE, dormers=1, seed=2),
    'house3a': lambda: house('house3a', 2.92, 1.9, 2, TILE, shop=True, dormers=2, seed=3),
    'house3b': lambda: house('house3b', 2.92, 1.9, 2, SLATE, dormers=2, seed=6),
    'house1': lambda: house('house1', 1.92, 0.94, 2, TILE, dormers=0, seed=4),
    'ruin2': lambda: ruin('ruin2', 1.92, 1.9, 3, 11),
    'ruin3': lambda: ruin('ruin3', 2.92, 1.9, 2, 12),
    'ruin1': lambda: ruin('ruin1', 1.92, 0.94, 2, 13),
    'church': church, 'monument': monument, 'rubble': rubble, 'barricade': barricade, 'hedgehog': hedgehog,
    'bridge': bridge, 'quay': quay, 'lamp': lamp,
}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
