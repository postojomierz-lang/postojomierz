# Each army's own gun emplacements, lookout tower, fortifications and parachute, in the style of
# structures.py: the field gun, the anti-aircraft gun, the machine-gun nest, the watchtower and
# the mines of the Americans, the Germans, the Red Army, the British, the Japanese, the French and
# the Italians; and the walls, wire, sandbags, tank traps, fuel stores and parachutes of all but
# the Americans (whose brick wall, concertina, sandbags, Czech hedgehog and oil drum are in
# structures.py, their T-5 parachute in vehicles.py). The American ones are written to .cache/figures/vehicles (the default models,
# packed into src/data/vehicles.js), the others to .cache/figures/vehicles/<nation> (packed into
# public/nation-<nation>.js).
#
#   python tools/blender/structures_nations.py [nation ...] [--only=fieldgun,aa,mgnest,tower,wall0,wall1,wire,...]
#
# All kept to one layout, so the game's crews and muzzle flashes fit: the MG sits
# about 0.6 up with its gunner behind it at the origin, the AA gun turns about the origin
# (turret parts), the tower's lookout stands on a platform 2.6 up.
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import vehicles
from mathutils import Quaternion
from vehicles import Model, clear, LIGHT, GLASS, WHITE, RED
from structures import mulberry, sandbag, sandbag_row, sandbag_ring

BASE = vehicles.OUT
H = 2.55                                   # tower platform height

# ---- shared parts ------------------------------------------------------------------------
def along(a, ang):
    """the unit direction at elevation ang in the x-y plane."""
    return (math.cos(ang), math.sin(ang), 0.0)

def barrel(m, part, start, ang, length, r0, r1=None, brake=None, jacket=None):
    """a gun tube from start at elevation ang: a tapering tube, an optional jacket at the breech
    end [(from, to, r)] and a muzzle brake ('baffle', 'slots', 'cone', 'hider' or None)."""
    d = along(start, ang); r1 = r1 or r0 * 0.85
    m.lathe(part, [(r0, 0.0), (r1, length), (0.0, length)], start, d, seg=18)
    for a, b, r in (jacket or ()):
        m.lathe(part, [(0.0, a), (r, a), (r, b), (0.0, b)], start, d, seg=18)
    tip = lambda k: tuple(start[i] + d[i] * (length + k) for i in range(3))
    if brake == 'baffle':                                                    # double-baffle brake
        m.lathe(part, [(0.0, length - 0.1), (r1 * 1.9, length - 0.1), (r1 * 1.9, length - 0.05), (r1 * 1.3, length - 0.04),
                       (r1 * 1.9, length - 0.03), (r1 * 1.9, length + 0.03), (0.0, length + 0.03)], start, d, seg=18)
    elif brake == 'slots':                                                   # the ZiS-3's slotted brake
        m.lathe(part, [(0.0, length - 0.12), (r1 * 1.6, length - 0.12), (r1 * 1.6, length + 0.02), (0.0, length + 0.02)], start, d, seg=16)
    elif brake == 'cone':
        m.lathe(part, [(0.0, length - 0.02), (r1, length - 0.02), (r1 * 2.2, length + 0.14), (0.0, length + 0.14)], start, d, seg=18)
    elif brake == 'hider':
        m.lathe(part, [(0.0, length - 0.08), (r1 * 1.5, length - 0.08), (r1 * 1.5, length + 0.02), (0.0, length + 0.02)], start, d, seg=14)
    return tip(0.03)

def spoked_wheel(m, c, r, n=12, w=0.06, part='main', rim='dark'):
    """a wooden artillery wheel: iron tyre, felloe, spokes and a hub."""
    x, y, z = c
    m.torus(rim, c, (0, 0, 1), r, w * 0.7, seg=36)
    m.torus(part, c, (0, 0, 1), r * 0.9, w * 0.5, seg=36)
    m.cyl(part, (x, y, z - w * 1.4), (x, y, z + w * 1.4), r * 0.18, seg=16, bevel=0.01)
    for k in range(n):
        a = k / n * 2 * math.pi
        m.cyl(part, c, (x + math.cos(a) * r * 0.88, y + math.sin(a) * r * 0.88, z), 0.018, seg=6)

def disc_wheel(m, c, r, w=0.13, holes=0):
    """a pressed-steel wheel on a rubber tyre (the modern towed guns)."""
    m.tyre(c, r, w, tread=False, nuts=6)
    x, y, z = c; s = 1 if z >= 0 else -1
    for k in range(holes):
        a = k / holes * 2 * math.pi
        m.cyl('dark', (x + math.cos(a) * r * 0.45, y + math.sin(a) * r * 0.45, z + s * w * 0.4), (x + math.cos(a) * r * 0.45, y + math.sin(a) * r * 0.45, z + s * w * 0.46), r * 0.08, seg=10)

def split_trail(m, y0, length, spread, r=0.055, spade=True):
    for s in (1, -1):
        m.cyl('main', (-0.05, y0, s * 0.1), (-length, 0.07, s * spread), r, seg=12)
        if spade: m.box('main', (-length - 0.03, 0.06, s * spread), (0.2, 0.12, 0.24), bevel=0.02, pitch=0.4)
        m.torus('main', (-length * 0.7, 0.07 + (y0 - 0.07) * 0.3 + 0.06, s * spread * 0.72), (0, 1, 0), 0.05, 0.01, seg=12)

def shell_box(m, x, z):
    m.box('main', (x, 0.1, z), (0.3, 0.18, 0.2), bevel=0.02)
    for k in range(3): m.cyl('dark', (x - 0.1 + k * 0.1, 0.2, z), (x - 0.1 + k * 0.1, 0.24, z), 0.03, seg=10)

def pit(m, R=1.0):
    m.cyl('dark', (0, 0, 0), (0, 0.04, 0), R, seg=40, bevel=0.01)          # the dug-in floor

def log_ring(m, R, a0, a1, layers, n):
    """a parapet of logs laid round the pit (the Soviet and Japanese nests)."""
    for l in range(layers):
        for i in range(n):
            a, b = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
            y = 0.1 + l * 0.15
            m.cyl('main', (math.cos(a) * R, y, math.sin(a) * R), (math.cos(b) * R, y, math.sin(b) * R), 0.075, seg=10)
            m.cyl('dark', (math.cos(a) * R, y, math.sin(a) * R), (math.cos(a) * R * 1.001, y, math.sin(a) * R * 1.001), 0.06, seg=10)

def tripod(m, part, top, legs, r=0.02):
    for p in legs: m.cyl(part, top, p, r, seg=8)

def ammo_tins(m):
    m.box('main', (-0.55, 0.12, 0.35), (0.22, 0.16, 0.16), bevel=0.02)
    m.box('main', (-0.6, 0.12, 0.1), (0.22, 0.16, 0.16), bevel=0.02)

def tower_legs(m, H, r=0.06, brace=True, spread=0.7, round_=False, lean=0.0):
    for x in (-spread, spread):
        for z in (-spread, spread):
            if round_: m.cyl('main', (x * (1 + lean), 0.0, z * (1 + lean)), (x, H, z), r, seg=10)
            else: m.box('main', (x, H / 2, z), (r * 2, H, r * 2), bevel=0.015)
    if brace:
        for y0, y1 in ((0.2, H * 0.5), (H * 0.5, H - 0.15)):
            for s in (1, -1):
                for zz in (-spread, spread): m.cyl('main', (-spread, y0 if s > 0 else y1, zz), (spread, y1 if s > 0 else y0, zz), 0.03, seg=8)
                for xx in (-spread, spread): m.cyl('main', (xx, y0 if s > 0 else y1, -spread), (xx, y1 if s > 0 else y0, spread), 0.03, seg=8)

def ladder(m, x, H, z=0.0):
    for zz in (-0.14, 0.14): m.box('main', (x, H / 2 + 0.1, z + zz), (0.04, H + 0.2, 0.04), bevel=0.0)
    for k in range(int(H / 0.24)): m.box('main', (x, 0.2 + k * 0.24, z), (0.03, 0.03, 0.3), bevel=0.0)

def hip_roof(m, y, hw, hd, rise, part='main'):
    m.loft_poly(part, [(-hw, [(y, -hd), (y + 0.01, 0.0), (y, hd)]), (-hw * 0.2, [(y, -hd), (y + rise, 0.0), (y, hd)]),
                       (hw * 0.2, [(y, -hd), (y + rise, 0.0), (y, hd)]), (hw, [(y, -hd), (y + 0.01, 0.0), (y, hd)])], bevel=0.01)

# =========================================================================================
# United States
def us_fieldgun():
    """the 105 mm M2A1 howitzer: the shield with its angled top, the barrel over the long
    recuperator, the breech block, pneumatic tyres and the long split trail with its spades."""
    m = Model('fieldgun')
    m.box('main', (0.3, 0.64, 0), (0.04, 0.56, 1.08), bevel=0.01, pitch=-0.12)
    for s in (1, -1): m.box('main', (0.27, 0.96, s * 0.34), (0.04, 0.12, 0.4), bevel=0.01, pitch=-0.12, roll=s * 0.2)
    m.box('dark', (0.32, 0.74, 0.24), (0.02, 0.1, 0.14), bevel=0.0, pitch=-0.12)             # sight port
    m.box('main', (0.0, 0.6, 0), (0.6, 0.16, 0.28), bevel=0.03)
    m.box('main', (-0.18, 0.84, 0), (0.3, 0.22, 0.26), bevel=0.03)                           # the breech block
    m.cyl('main', (-0.1, 0.76, 0), (1.0, 0.92, 0), 0.075, seg=16)                            # recuperator
    tip = barrel(m, 'main', (-0.05, 0.9, 0), 0.15, 1.45, 0.075, 0.065)
    m.lathe('main', [(0.0, 1.38), (0.08, 1.38), (0.08, 1.45), (0.0, 1.45)], (-0.05, 0.9, 0), along(0, 0.15), seg=18)   # the muzzle collar
    m.box('dark', (0.0, 1.04, 0.2), (0.14, 0.08, 0.06), bevel=0.01)
    m.torus('dark', (-0.1, 0.62, 0.2), (0, 0, 1), 0.08, 0.012, seg=16)
    for s in (1, -1): disc_wheel(m, (0.05, 0.38, s * 0.6), 0.38, 0.15)
    m.cyl('main', (0.05, 0.38, -0.6), (0.05, 0.38, 0.6), 0.035, seg=10)
    split_trail(m, 0.48, 1.4, 0.64)
    shell_box(m, -0.6, 0.0)
    m.finish()
    return tip

def us_aa():
    """the M45 Quadmount: four .50 cal Brownings in two pairs either side of the gunner's armoured
    seat, the big ammunition chests beside them and the reflex sight, in a sandbagged pit."""
    m = Model('aa'); rnd = mulberry(20)
    m.cyl('main', (0, 0, 0), (0, 0.16, 0), 0.85, seg=8, bevel=0.03)                          # octagonal platform
    for k in range(8):
        a = k / 8 * 2 * math.pi + math.pi / 8
        m.box('dark', (math.cos(a) * 0.8, 0.16, math.sin(a) * 0.8), (0.08, 0.02, 0.08), bevel=0.0)
    sandbag_ring(m, 'main', 1.02, 0, 2 * math.pi, 1, 16, rnd, y0=0.0)
    t = 'turret_main'
    m.cyl(t, (0, 0.16, 0), (0, 0.38, 0), 0.4, seg=28, bevel=0.02)
    m.box(t, (-0.15, 0.62, 0), (0.3, 0.4, 0.34), bevel=0.03)                                # the gunner's armoured box
    for s in (1, -1): m.box(t, (0.02, 0.84, s * 0.2), (0.03, 0.34, 0.2), bevel=0.01, yaw=s * 0.4)   # its shield wings
    m.box('turret_dark', (-0.32, 0.56, 0), (0.16, 0.05, 0.22), bevel=0.02)                   # seat
    tip = None
    for s in (1, -1):
        m.box(t, (0.1, 0.72, s * 0.34), (0.3, 0.3, 0.14), bevel=0.02)                         # the gun cradle
        m.box(t, (-0.02, 0.62, s * 0.5), (0.3, 0.3, 0.14), bevel=0.02)                        # ammunition chest
        for k in (-1, 1):
            tip = barrel(m, t, (0.18, 0.76 + k * 0.08, s * 0.34), 0.72, 1.1, 0.026, 0.022, jacket=[(0.0, 0.4, 0.04)])
    m.torus(t, (0.15, 1.02, 0), (1, 1, 0), 0.07, 0.008, seg=16)                              # reflex sight
    m.finish()
    return tip

def us_mgnest():
    """a water-cooled Browning M1917A1 on its tripod - the jacket, the condenser hose down to the
    can, the pistol grip and the belt from the ammunition box - in a sandbagged pit."""
    m = Model('mgnest'); rnd = mulberry(11)
    pit(m)
    sandbag_ring(m, 'main', 0.82, -math.pi * 0.66, math.pi * 0.66, 3, 10, rnd)
    ammo_tins(m)
    m.cyl('main', (0.3, 0.04, 0.42), (0.3, 0.22, 0.42), 0.07, seg=14)                           # condenser can
    t = 'turret_main'
    tripod(m, t, (0.3, 0.46, 0), [(0.7, 0.04, 0), (0.0, 0.04, 0.3), (0.0, 0.04, -0.3)], r=0.024)
    m.box(t, (0.3, 0.6, 0), (0.26, 0.12, 0.1), bevel=0.02)
    m.cyl(t, (0.42, 0.61, 0), (0.88, 0.61, 0), 0.05, seg=18)                                   # water jacket
    m.cyl(t, (0.88, 0.61, 0), (0.96, 0.61, 0), 0.022, seg=10)
    m.cyl(t, (0.84, 0.57, 0.03), (0.6, 0.3, 0.3), 0.012, seg=6)                                 # condenser hose
    m.cyl(t, (0.6, 0.3, 0.3), (0.32, 0.22, 0.42), 0.012, seg=6)
    m.box(t, (0.15, 0.54, 0), (0.05, 0.1, 0.04), bevel=0.01, pitch=0.3)                          # pistol grip
    m.box(t, (0.3, 0.52, -0.14), (0.14, 0.12, 0.08), bevel=0.01)                                 # ammo box
    for k in range(4): m.box('turret_dark', (0.3, 0.6 - k * 0.02, -0.07 - k * 0.02), (0.03, 0.02, 0.02), bevel=0.0)
    m.finish()

def us_tower():
    """an American guard tower: timber legs and bracing, a ladder, the platform behind sandbags
    with a .30 cal on the parapet, a pyramid roof, the searchlight and a white star on a board."""
    m = Model('tower'); rnd = mulberry(3)
    tower_legs(m, H)
    ladder(m, 0.85, H)
    m.box('main', (0, H + 0.03, 0), (1.8, 0.08, 1.8), bevel=0.02)
    for k in range(9): m.box('dark', (-0.8 + k * 0.2, H + 0.072, 0), (0.012, 0.01, 1.76), bevel=0.0)
    for side in range(4):
        a = side * math.pi / 2; c, s = math.cos(a), math.sin(a)
        if side == 1: continue
        for l in range(2):
            for i in range(4):
                u = -0.72 + (i + 0.5 + (l % 2) * 0.25) * 0.36
                if u > 0.75: continue
                sandbag(m, 'main', (c * 0.8 - s * u, H + 0.15 + l * 0.14, s * 0.8 + c * u), -a + math.pi / 2, L=0.38, W=0.2, rnd=rnd)
    for x in (-0.8, 0.8):
        for z in (-0.8, 0.8): m.box('main', (x, H + 0.55, z), (0.06, 1.0, 0.06), bevel=0.0)
    m.cyl('main', (0, H + 1.05, 0), (0, H + 1.45, 0), 1.3, seg=4, r2=0.05)
    m.cyl('main', (0.6, H + 0.2, -0.6), (0.6, H + 0.4, -0.6), 0.04, seg=8)                     # searchlight
    m.cyl('main', (0.6, H + 0.5, -0.6), (0.75, H + 0.52, -0.6), 0.1, seg=20, bevel=0.01)
    m.cyl(LIGHT, (0.76, H + 0.52, -0.6), (0.77, H + 0.52, -0.6), 0.08, seg=20)
    m.cyl('main', (0.72, H + 0.43, 0.45), (0.72, H + 0.5, 0.45), 0.02, seg=8)                  # the .30 cal on its pintle
    m.mg((0.74, H + 0.54, 0.45), 0.5)
    m.box('main', (0.0, 1.5, 0.74), (0.5, 0.5, 0.03), bevel=0.01)                              # the star board
    m.star((0.0, 1.5, 0.76), 0.2, normal=(0, 0, 1), up=(0, 1, 0), colour=WHITE)
    m.finish()

# =========================================================================================
# Germany
def de_fieldgun():
    """7.5 cm Pak 40: low and wide, the spaced double shield with its wavy top, the long barrel
    with the double-baffle brake, pressed-steel wheels and the long split trail."""
    m = Model('fieldgun')
    for s in (1, -1):
        m.box('main', (0.28, 0.55, s * 0.36), (0.04, 0.5, 0.5), bevel=0.01, pitch=-0.3, yaw=-s * 0.25)
        m.box('main', (0.34, 0.56, s * 0.36), (0.02, 0.44, 0.46), bevel=0.008, pitch=-0.3, yaw=-s * 0.25)   # the spaced plate
        m.box('main', (0.25, 0.82, s * 0.36), (0.04, 0.06, 0.44), bevel=0.01, pitch=-0.3, yaw=-s * 0.25)
    m.box('main', (0.22, 0.68, 0), (0.04, 0.3, 0.2), bevel=0.01, pitch=-0.3)
    m.box('main', (0.0, 0.58, 0), (0.6, 0.14, 0.26), bevel=0.03)                             # carriage
    m.box('main', (-0.05, 0.72, 0), (0.34, 0.14, 0.2), bevel=0.03)                          # breech
    for z in (-0.06, 0.06): m.cyl('main', (0.05, 0.64, z), (0.75, 0.68, z), 0.035, seg=10)   # recoil cylinders
    tip = barrel(m, 'main', (0.1, 0.7, 0), 0.05, 1.8, 0.06, 0.045, brake='baffle')
    m.box('dark', (0.1, 0.84, 0.16), (0.12, 0.07, 0.05), bevel=0.01)
    for s in (1, -1): disc_wheel(m, (0.02, 0.32, s * 0.55), 0.32, 0.13, holes=6)
    m.cyl('main', (0.02, 0.32, -0.55), (0.02, 0.32, 0.55), 0.035, seg=10)
    split_trail(m, 0.45, 1.3, 0.62)
    shell_box(m, -0.6, 0.0)
    m.finish()
    return tip

def de_aa():
    """2 cm Flak 38: the triangular platform on its levelling jacks, the gun with the small shield,
    the long barrel with its flash hider, the curved magazine and the layer's seat."""
    m = Model('aa'); rnd = mulberry(21)
    for k in range(3):
        a = k / 3 * 2 * math.pi + math.pi / 6
        m.box('main', (math.cos(a) * 0.45, 0.1, math.sin(a) * 0.45), (0.9, 0.08, 0.14), bevel=0.02, yaw=-a)
        m.cyl('main', (math.cos(a) * 0.88, 0.0, math.sin(a) * 0.88), (math.cos(a) * 0.88, 0.14, math.sin(a) * 0.88), 0.06, seg=12)   # jack
    sandbag_ring(m, 'main', 1.05, 0, 2 * math.pi, 1, 16, rnd, y0=0.0)
    t = 'turret_main'
    m.cyl(t, (0, 0.12, 0), (0, 0.32, 0), 0.34, seg=28, bevel=0.02)
    m.box(t, (0.0, 0.52, 0), (0.3, 0.32, 0.36), bevel=0.03)                                   # cradle
    m.box(t, (0.3, 0.72, 0), (0.03, 0.4, 0.62), bevel=0.01, pitch=-0.2)                      # the small shield
    tip = barrel(m, t, (0.1, 0.72, 0), 0.72, 1.35, 0.035, 0.03, brake='hider', jacket=[(0.0, 0.35, 0.07)])
    for k in range(5):                                                                          # the curved magazine
        m.box(t, (0.05 + k * 0.02, 0.8 - k * 0.05, 0.14), (0.08, 0.06, 0.05), bevel=0.01, roll=0.1 * k)
    m.torus(t, (0.45, 1.0, -0.14), (1, 1, 0), 0.08, 0.008, seg=16)                            # ring sight
    m.box('turret_dark', (-0.3, 0.5, -0.12), (0.18, 0.05, 0.2), bevel=0.02)                  # seat
    m.cyl(t, (-0.2, 0.3, -0.1), (-0.3, 0.48, -0.12), 0.02, seg=8)
    for z in (-0.2, 0.2): m.torus('turret_dark', (-0.05, 0.5, z), (0, 0, 1), 0.06, 0.01, seg=14)
    m.finish()
    return tip

def mg42_gun(m, part, base, length=0.66):
    """an MG 42 lying along +x from base: stock, receiver, perforated jacket, brake, belt."""
    x, y, z = base
    m.box(part, (x - 0.1, y - 0.01, z), (0.16, 0.07, 0.05), bevel=0.01)
    m.box(part, (x + 0.08, y, z), (0.22, 0.08, 0.07), bevel=0.01)
    m.cyl(part, (x + 0.18, y, z), (x + length, y, z), 0.034, seg=12)
    for k in range(5): m.box('turret_dark', (x + 0.24 + k * 0.06, y + 0.035, z), (0.03, 0.01, 0.03), bevel=0.0)
    m.cyl(part, (x + length, y, z), (x + length + 0.05, y, z), 0.028, seg=10)
    for k in range(4): m.box(part, (x + 0.06, y - 0.02 - k * 0.04, z + 0.06 + k * 0.01), (0.04, 0.02, 0.03), bevel=0.0)   # belt

def de_mgnest():
    """an MG 42 on its Lafette 34 tripod, the padded front leg and the sight, in a pit ringed with
    sandbags."""
    m = Model('mgnest'); rnd = mulberry(22)
    pit(m)
    sandbag_ring(m, 'main', 0.82, -math.pi * 0.66, math.pi * 0.66, 3, 10, rnd)
    ammo_tins(m)
    t = 'turret_main'
    tripod(m, t, (0.3, 0.46, 0), [(0.75, 0.04, 0), (-0.05, 0.04, 0.3), (-0.05, 0.04, -0.3)])
    m.cyl(t, (0.66, 0.16, 0), (0.72, 0.1, 0), 0.04, seg=10)                                       # the padded front leg
    m.box(t, (0.3, 0.5, 0), (0.28, 0.08, 0.1), bevel=0.02)                                         # the cradle
    m.box(t, (0.22, 0.62, 0.06), (0.1, 0.08, 0.04), bevel=0.01)                                    # periscope sight
    mg42_gun(m, t, (0.36, 0.6, 0))
    m.finish()

def de_tower():
    """a German watchtower: timber legs and bracing under a closed cabin with windows all round,
    a pitched roof and a searchlight."""
    m = Model('tower')
    tower_legs(m, H)
    ladder(m, 0.85, H)
    m.box('main', (0, H + 0.03, 0), (1.8, 0.08, 1.8), bevel=0.02)
    for s in (1, -1):                                                                      # cabin walls with windows
        m.box('main', (s * 0.8, H + 0.25, 0), (0.06, 0.4, 1.66), bevel=0.01)
        m.box('main', (0, H + 0.25, s * 0.8), (1.66, 0.4, 0.06), bevel=0.01)
    for x in (-0.8, 0.8):
        for z in (-0.8, 0.8): m.box('main', (x, H + 0.6, z), (0.07, 1.1, 0.07), bevel=0.0)
    m.loft_poly('main', [(-1.0, [(H + 1.1, -1.0), (H + 1.5, 0.0), (H + 1.1, 1.0)]), (1.0, [(H + 1.1, -1.0), (H + 1.5, 0.0), (H + 1.1, 1.0)])], bevel=0.01)
    m.cyl('main', (0.6, H + 0.45, -0.6), (0.75, H + 0.5, -0.6), 0.1, seg=20, bevel=0.01)
    m.cyl(LIGHT, (0.76, H + 0.5, -0.6), (0.77, H + 0.5, -0.6), 0.08, seg=20)
    m.finish()

# =========================================================================================
# Soviet Union
def su_fieldgun():
    """76 mm ZiS-3: the shield with its cranked top edge, the long thin barrel with the slotted
    muzzle brake, the tubular split trail and the wheels on rubber tyres."""
    m = Model('fieldgun')
    m.box('main', (0.3, 0.62, 0), (0.04, 0.56, 1.1), bevel=0.01, pitch=-0.2)
    for s in (1, -1): m.box('main', (0.26, 0.95, s * 0.36), (0.04, 0.16, 0.38), bevel=0.01, pitch=-0.2)   # the raised outer panels
    m.box('main', (0.33, 0.36, 0), (0.04, 0.12, 0.9), bevel=0.01, pitch=0.3)                # the lower apron
    m.box('main', (0.0, 0.62, 0), (0.56, 0.16, 0.26), bevel=0.03)
    m.box('main', (-0.1, 0.78, 0), (0.3, 0.16, 0.22), bevel=0.03)
    m.cyl('main', (0.05, 0.7, 0), (0.95, 0.78, 0), 0.045, seg=12)                              # recuperator
    tip = barrel(m, 'main', (0.05, 0.84, 0), 0.08, 1.75, 0.055, 0.042, brake='slots')
    m.box('dark', (0.1, 0.96, 0.18), (0.12, 0.08, 0.06), bevel=0.01)
    for s in (1, -1): disc_wheel(m, (0.05, 0.34, s * 0.58), 0.34, 0.14)
    split_trail(m, 0.5, 1.25, 0.58, r=0.045)
    shell_box(m, -0.6, 0.0)
    m.finish()
    return tip

def su_aa():
    """37 mm 61-K: the gun on its four-legged platform with the outriggers spread, a long barrel
    with a conical flash hider, the clip standing up out of the breech and the two layers' seats."""
    m = Model('aa'); rnd = mulberry(23)
    m.box('main', (0, 0.14, 0), (0.9, 0.12, 0.6), bevel=0.03)
    for a in (0.6, 2.54, 3.74, 5.68):
        m.box('main', (math.cos(a) * 0.55, 0.1, math.sin(a) * 0.55), (0.6, 0.07, 0.1), bevel=0.01, yaw=-a)
        m.cyl('main', (math.cos(a) * 0.85, 0.0, math.sin(a) * 0.85), (math.cos(a) * 0.85, 0.12, math.sin(a) * 0.85), 0.07, seg=12)
    sandbag_ring(m, 'main', 1.08, 0, 2 * math.pi, 1, 16, rnd, y0=0.0)
    t = 'turret_main'
    m.cyl(t, (0, 0.2, 0), (0, 0.36, 0), 0.36, seg=28, bevel=0.02)
    m.box(t, (0.0, 0.6, 0), (0.44, 0.4, 0.4), bevel=0.04)
    tip = barrel(m, t, (0.12, 0.75, 0), 0.78, 1.3, 0.042, 0.036, brake='cone', jacket=[(0.0, 0.3, 0.08)])
    m.box(t, (0.02, 0.98, 0), (0.18, 0.3, 0.08), bevel=0.01, pitch=0.78)                      # the clip
    for z in (-0.3, 0.3):
        m.box('turret_dark', (-0.25, 0.46, z), (0.18, 0.05, 0.16), bevel=0.02)
        m.torus('turret_dark', (0.0, 0.58, z * 0.85), (0, 0, 1), 0.07, 0.012, seg=16)
    m.torus(t, (0.5, 1.2, 0.2), (1, 1, 0), 0.12, 0.009, seg=18)
    m.finish()
    return tip

def su_mgnest():
    """a Maxim on its Sokolov mount - the fluted water jacket, the small shield, the little wheels
    and the U-shaped trail - in a pit lined with logs."""
    m = Model('mgnest')
    pit(m)
    log_ring(m, 0.85, -math.pi * 0.66, math.pi * 0.66, 3, 9)
    ammo_tins(m)
    t = 'turret_main'
    for s in (1, -1):
        m.lathe('turret_dark', [(0.03, -0.02), (0.1, -0.02), (0.11, 0.0), (0.1, 0.02), (0.03, 0.02)], (0.35, 0.12, s * 0.22), (0, 0, 1), seg=16, closed=True)
        m.cyl(t, (0.35, 0.12, s * 0.22), (-0.15, 0.06, s * 0.16), 0.02, seg=8)                   # the U trail
    m.cyl(t, (-0.15, 0.06, -0.16), (-0.15, 0.06, 0.16), 0.02, seg=8)
    m.cyl(t, (0.35, 0.12, -0.22), (0.35, 0.12, 0.22), 0.02, seg=8)
    m.cyl(t, (0.35, 0.12, 0), (0.35, 0.5, 0), 0.03, seg=10)
    m.box(t, (0.55, 0.52, 0), (0.03, 0.36, 0.4), bevel=0.01)                                     # shield
    m.box(t, (0.3, 0.6, 0), (0.24, 0.12, 0.12), bevel=0.02)                                      # receiver
    m.cyl(t, (0.4, 0.61, 0), (0.85, 0.61, 0), 0.06, seg=18)                                      # water jacket
    for k in range(8): m.torus(t, (0.45 + k * 0.05, 0.61, 0), (1, 0, 0), 0.062, 0.006, seg=16)   # its flutes
    m.cyl(t, (0.85, 0.61, 0), (0.95, 0.61, 0), 0.02, seg=10)
    m.cyl(t, (0.52, 0.68, 0), (0.52, 0.72, 0), 0.03, seg=10)                                     # filler cap
    for k in range(4): m.box('turret_dark', (0.3, 0.58 - k * 0.04, 0.1 + k * 0.01), (0.03, 0.03, 0.02), bevel=0.0)
    m.finish()

def su_tower():
    """a Red Army lookout: a tower of round logs with an open platform behind a log parapet, a
    lean-to roof and the red star on a board."""
    m = Model('tower')
    tower_legs(m, H, r=0.07, round_=True, lean=0.15)
    for y in (0.6, 1.3, 2.0):
        for s in (1, -1):
            m.cyl('main', (-0.75, y, s * 0.72), (0.75, y, s * 0.72), 0.035, seg=8)
            m.cyl('main', (s * 0.72, y + 0.05, -0.75), (s * 0.72, y + 0.05, 0.75), 0.035, seg=8)
    ladder(m, 0.88, H)
    m.box('main', (0, H + 0.03, 0), (1.8, 0.08, 1.8), bevel=0.02)
    for s in (1, -1):                                                                          # log parapet
        for l in range(3):
            y = H + 0.12 + l * 0.11
            m.cyl('main', (-0.85, y, s * 0.85), (0.85, y, s * 0.85), 0.055, seg=10)
            if s < 0 or l < 3: m.cyl('main', (-0.85, y + 0.05, -0.85), (-0.85, y + 0.05, 0.85), 0.055, seg=10)
    for x in (-0.8, 0.8):
        for z in (-0.8, 0.8): m.cyl('main', (x, H, z), (x, H + (1.1 if x < 0 else 0.9), z), 0.04, seg=8)
    m.box('main', (0, H + 1.03, 0), (1.9, 0.05, 1.9), bevel=0.01, roll=0.0, pitch=-0.1)       # lean-to roof
    m.box('main', (0.86, H + 0.45, 0.0), (0.03, 0.3, 0.3), bevel=0.01)
    m.star((0.88, H + 0.45, 0.0), 0.12, normal=(1, 0, 0), up=(0, 1, 0), colour=RED)
    m.finish()

# =========================================================================================
# Britain
def gb_fieldgun():
    """the 25-pounder: the short barrel with its muzzle brake, the box trail, the flat shield with
    the bent-back sides, big wheels and the round firing platform under them."""
    m = Model('fieldgun')
    m.cyl('main', (0.0, 0.0, 0), (0.0, 0.04, 0), 0.75, seg=32, bevel=0.01)                    # firing platform
    for k in range(8):
        a = k / 8 * 2 * math.pi
        m.box('dark', (math.cos(a) * 0.5, 0.04, math.sin(a) * 0.5), (0.4, 0.012, 0.03), bevel=0.0, yaw=-a)
    m.box('main', (0.3, 0.66, 0), (0.04, 0.6, 1.0), bevel=0.01, pitch=-0.12)
    for s in (1, -1): m.box('main', (0.2, 0.66, s * 0.54), (0.24, 0.56, 0.04), bevel=0.01, yaw=s * 0.5)   # the bent-back sides
    m.box('main', (0.0, 0.62, 0), (0.6, 0.18, 0.28), bevel=0.03)
    m.box('main', (-0.12, 0.8, 0), (0.34, 0.2, 0.26), bevel=0.03)                              # breech
    m.cyl('main', (0.0, 0.7, 0), (0.7, 0.82, 0), 0.05, seg=12)
    tip = barrel(m, 'main', (0.05, 0.86, 0), 0.2, 1.25, 0.065, 0.055, brake='baffle')
    m.box('dark', (0.05, 0.98, 0.2), (0.14, 0.08, 0.06), bevel=0.01)
    for s in (1, -1): disc_wheel(m, (0.05, 0.4, s * 0.58), 0.4, 0.15)
    m.cyl('main', (0.05, 0.4, -0.58), (0.05, 0.4, 0.58), 0.035, seg=10)
    m.loft_poly('main', [(-0.05, [(0.44, -0.14), (0.58, -0.14), (0.58, 0.14), (0.44, 0.14)]), (-1.25, [(0.06, -0.12), (0.18, -0.12), (0.18, 0.12), (0.06, 0.12)])], bevel=0.01)   # box trail
    m.box('main', (-1.3, 0.1, 0), (0.12, 0.2, 0.36), bevel=0.02, pitch=0.3)
    m.torus('main', (-1.1, 0.24, 0), (0, 1, 0), 0.08, 0.012, seg=14)
    shell_box(m, -0.6, 0.45)
    m.finish()
    return tip

def gb_aa():
    """the Bofors 40 mm: the cruciform platform with its four levelling feet, the gun with the big
    flash cone, the clip in the guides on top and the two layers' seats."""
    m = Model('aa'); rnd = mulberry(24)
    for a in (0, math.pi / 2):
        m.box('main', (0, 0.12, 0), (1.8, 0.08, 0.14), bevel=0.02, yaw=a)
    for k in range(4):
        a = k * math.pi / 2
        m.cyl('main', (math.cos(a) * 0.9, 0.0, math.sin(a) * 0.9), (math.cos(a) * 0.9, 0.16, math.sin(a) * 0.9), 0.07, seg=12)
    sandbag_ring(m, 'main', 1.1, 0, 2 * math.pi, 1, 16, rnd, y0=0.0)
    t = 'turret_main'
    m.cyl(t, (0, 0.18, 0), (0, 0.36, 0), 0.4, seg=28, bevel=0.02)
    for z in (-0.2, 0.2): m.box(t, (0.0, 0.62, z), (0.36, 0.5, 0.05), bevel=0.02)             # the side plates
    tip = barrel(m, t, (0.1, 0.8, 0), 0.78, 1.25, 0.04, 0.036, brake='cone', jacket=[(0.0, 0.25, 0.09)])
    m.box(t, (-0.02, 1.0, 0), (0.22, 0.26, 0.1), bevel=0.01, pitch=0.78)                       # the clip in its guides
    for z in (-0.36, 0.36):
        m.box('turret_dark', (-0.3, 0.52, z), (0.18, 0.05, 0.16), bevel=0.02)
        m.torus('turret_dark', (-0.1, 0.62, z * 0.75), (0, 0, 1), 0.07, 0.012, seg=16)
    m.torus(t, (0.45, 1.15, 0.26), (1, 1, 0), 0.1, 0.008, seg=18)
    m.finish()
    return tip

def gb_mgnest():
    """a Vickers gun on its tripod: the water jacket with the condenser hose running down to the
    can, the fusee spring box and the belt - in a sandbagged pit."""
    m = Model('mgnest'); rnd = mulberry(25)
    pit(m)
    sandbag_ring(m, 'main', 0.82, -math.pi * 0.66, math.pi * 0.66, 3, 10, rnd)
    ammo_tins(m)
    m.cyl('main', (0.3, 0.04, 0.4), (0.3, 0.22, 0.4), 0.07, seg=14)                           # the condenser can
    t = 'turret_main'
    tripod(m, t, (0.3, 0.46, 0), [(0.7, 0.04, 0), (0.0, 0.04, 0.3), (0.0, 0.04, -0.3)], r=0.024)
    m.box(t, (0.3, 0.6, 0), (0.24, 0.12, 0.11), bevel=0.02)
    m.box(t, (0.26, 0.6, 0.075), (0.18, 0.05, 0.03), bevel=0.01)                               # fusee spring box
    m.cyl(t, (0.42, 0.61, 0), (0.86, 0.61, 0), 0.055, seg=18)                                  # water jacket
    for k in (0.5, 0.78): m.torus(t, (k, 0.61, 0), (1, 0, 0), 0.057, 0.008, seg=16)
    m.cyl(t, (0.86, 0.61, 0), (0.94, 0.61, 0), 0.025, seg=10)
    m.cyl(t, (0.8, 0.56, 0.03), (0.6, 0.3, 0.3), 0.012, seg=6)                                  # condenser hose
    m.cyl(t, (0.6, 0.3, 0.3), (0.32, 0.22, 0.4), 0.012, seg=6)
    for k in range(5): m.box('turret_dark', (0.3, 0.57 - k * 0.04, -0.1 - k * 0.01), (0.03, 0.03, 0.02), bevel=0.0)
    m.finish()

def gb_tower():
    """a British observation post on scaffold tubes and clips, the platform ringed with sandbags
    under a roof of corrugated iron."""
    m = Model('tower'); rnd = mulberry(26)
    tower_legs(m, H, r=0.035, round_=True, brace=True)
    for y in (0.9, 1.8):
        for s in (1, -1):
            m.cyl('main', (-0.75, y, s * 0.7), (0.75, y, s * 0.7), 0.03, seg=8)
            m.cyl('main', (s * 0.7, y, -0.75), (s * 0.7, y, 0.75), 0.03, seg=8)
            for zz in (-0.7, 0.7): m.box('main', (s * 0.7, y, zz), (0.07, 0.07, 0.07), bevel=0.01)   # clips
    ladder(m, 0.85, H)
    m.box('main', (0, H + 0.03, 0), (1.8, 0.08, 1.8), bevel=0.02)
    for side in range(4):
        a = side * math.pi / 2; c, s = math.cos(a), math.sin(a)
        if side == 1: continue
        for l in range(2):
            for i in range(4):
                u = -0.72 + (i + 0.5 + (l % 2) * 0.25) * 0.36
                if u > 0.75: continue
                sandbag(m, 'main', (c * 0.8 - s * u, H + 0.15 + l * 0.14, s * 0.8 + c * u), -a + math.pi / 2, L=0.38, W=0.2, rnd=rnd)
    for x in (-0.8, 0.8):
        for z in (-0.8, 0.8): m.cyl('main', (x, H, z), (x, H + 1.0, z), 0.03, seg=8)
    m.box('main', (0, H + 1.02, 0), (1.9, 0.03, 1.9), bevel=0.0, pitch=0.08)
    for k in range(12): m.cyl('main', (-0.95, H + 1.04 + 0.08 * 0.95 * 0, -0.9 + k * 0.164), (0.95, H + 1.04, -0.9 + k * 0.164), 0.012, seg=6)   # corrugations
    m.finish()

# =========================================================================================
# Japan
def jp_fieldgun():
    """the Type 92 battalion gun: a stubby 70 mm barrel over a cranked axle, the curved shield,
    big spoked wheels and the split trail - light enough for the crew to drag."""
    m = Model('fieldgun')
    m.box('main', (0.32, 0.56, 0), (0.04, 0.5, 0.86), bevel=0.01, pitch=-0.1)
    for s in (1, -1): m.box('main', (0.26, 0.56, s * 0.46), (0.14, 0.48, 0.04), bevel=0.01, yaw=s * 0.35)   # the curved-back edges
    m.box('dark', (0.34, 0.66, 0.15), (0.02, 0.1, 0.14), bevel=0.0, pitch=-0.1)
    m.box('main', (0.0, 0.46, 0), (0.5, 0.16, 0.26), bevel=0.03)
    m.box('main', (-0.05, 0.62, 0), (0.3, 0.16, 0.22), bevel=0.03)
    tip = barrel(m, 'main', (0.02, 0.66, 0), 0.3, 0.75, 0.075, 0.07)
    for s in (1, -1):
        spoked_wheel(m, (0.05, 0.38, s * 0.52), 0.38, n=12)
        m.cyl('main', (0.05, 0.38, s * 0.52), (0.05, 0.3, s * 0.15), 0.035, seg=10)          # the cranked axle
    m.cyl('main', (0.05, 0.3, -0.15), (0.05, 0.3, 0.15), 0.035, seg=10)
    split_trail(m, 0.36, 1.1, 0.5, r=0.04)
    shell_box(m, -0.55, 0.0)
    m.finish()
    return tip

def jp_aa():
    """the Type 96 25 mm twin mount: two barrels with their flash hiders side by side, the
    magazines standing on top, the layers' seats, all on a round pedestal and base plate."""
    m = Model('aa'); rnd = mulberry(27)
    m.cyl('main', (0, 0.0, 0), (0, 0.12, 0), 0.8, seg=24, bevel=0.02)
    for k in range(6):
        a = k / 6 * 2 * math.pi
        m.box('dark', (math.cos(a) * 0.72, 0.12, math.sin(a) * 0.72), (0.06, 0.02, 0.06), bevel=0.0)
    sandbag_ring(m, 'main', 1.0, 0, 2 * math.pi, 1, 16, rnd, y0=0.0)
    t = 'turret_main'
    m.cyl(t, (0, 0.12, 0), (0, 0.5, 0), 0.18, seg=20, bevel=0.02)                            # pedestal
    m.box(t, (0.0, 0.66, 0), (0.4, 0.3, 0.5), bevel=0.04)
    tip = None
    for z in (-0.13, 0.13):
        tip = barrel(m, t, (0.1, 0.78, z), 0.78, 1.25, 0.034, 0.03, brake='hider', jacket=[(0.0, 0.25, 0.07)])
        m.box(t, (0.02, 0.98, z), (0.2, 0.22, 0.06), bevel=0.01, pitch=0.78)                  # the magazines on top
    for z in (-0.38, 0.38):
        m.box('turret_dark', (-0.25, 0.5, z), (0.18, 0.05, 0.16), bevel=0.02)
        m.cyl(t, (-0.12, 0.3, z * 0.4), (-0.25, 0.48, z), 0.02, seg=8)
    m.torus(t, (0.45, 1.15, 0), (1, 1, 0), 0.13, 0.009, seg=18)
    m.finish()
    return tip

def jp_mgnest():
    """the Type 92 heavy machine gun ('woodpecker'): the finned barrel, the tripod with its
    carrying poles sticking out, the feed strips from the left - in a pit lined with logs."""
    m = Model('mgnest')
    pit(m)
    log_ring(m, 0.85, -math.pi * 0.66, math.pi * 0.66, 2, 9)
    for a in (-1.2, 0.0, 1.2):                                                                  # earth heaped on the logs
        m.sphere('main', (math.cos(a) * 0.95, 0.3, math.sin(a) * 0.95), 0.2, scale=(1.4, 0.5, 1.4), seg=14)
    ammo_tins(m)
    t = 'turret_main'
    tripod(m, t, (0.3, 0.44, 0), [(0.68, 0.04, 0), (0.0, 0.04, 0.3), (0.0, 0.04, -0.3)], r=0.024)
    for s in (1, -1): m.cyl(t, (0.72, 0.1, s * 0.06), (-0.1, 0.1, s * 0.36), 0.014, seg=6)   # carrying poles
    m.box(t, (0.3, 0.58, 0), (0.24, 0.12, 0.11), bevel=0.02)
    m.cyl(t, (0.42, 0.59, 0), (0.62, 0.59, 0), 0.045, seg=16)
    for k in range(9): m.torus(t, (0.43 + k * 0.022, 0.59, 0), (1, 0, 0), 0.05, 0.008, seg=16)   # the cooling fins
    m.cyl(t, (0.62, 0.59, 0), (0.92, 0.59, 0), 0.02, seg=10)
    m.cyl(t, (0.92, 0.59, 0), (0.97, 0.59, 0), 0.03, seg=10)
    m.box(t, (0.3, 0.6, -0.14), (0.26, 0.012, 0.12), bevel=0.0)                                  # the feed strip
    m.cyl(t, (0.14, 0.58, 0.06), (0.1, 0.52, 0.12), 0.012, seg=6)                                # spade grips
    m.finish()

def jp_tower():
    """a lookout of lashed bamboo: poles tied at every joint, a woven screen round the platform
    and a steep thatched roof."""
    m = Model('tower')
    tower_legs(m, H, r=0.045, round_=True, lean=0.2)
    for y in (0.7, 1.4, 2.1):
        for s in (1, -1):
            m.cyl('main', (-0.8, y, s * 0.72), (0.8, y, s * 0.72), 0.03, seg=8)
            m.cyl('main', (s * 0.72, y, -0.8), (s * 0.72, y, 0.8), 0.03, seg=8)
            for zz in (-0.72, 0.72): m.torus('main', (s * 0.72, y, zz), (0, 1, 0), 0.05, 0.012, seg=10)   # lashings
    for x in (-0.72, 0.72):
        for k in range(8):
            y = 0.25 + k * 0.3
            m.torus('main', (x, y, 0.72), (0, 1, 0), 0.05, 0.01, seg=10)
    ladder(m, 0.85, H)
    m.box('main', (0, H + 0.03, 0), (1.8, 0.08, 1.8), bevel=0.02)
    for s in (1, -1):                                                                       # the woven screens
        m.box('main', (s * 0.85, H + 0.25, 0), (0.03, 0.4, 1.7), bevel=0.005)
        if s < 0: m.box('main', (0, H + 0.25, 0.85), (1.7, 0.4, 0.03), bevel=0.005)
        m.box('main', (0, H + 0.25, -0.85), (1.7, 0.4, 0.03), bevel=0.005)
        for k in range(6): m.box('dark', (s * 0.865, H + 0.1 + k * 0.06, 0), (0.01, 0.012, 1.66), bevel=0.0)
    for x in (-0.8, 0.8):
        for z in (-0.8, 0.8): m.cyl('main', (x, H, z), (x, H + 0.9, z), 0.03, seg=8)
    m.cyl('main', (0, H + 0.85, 0), (0, H + 1.65, 0), 1.35, seg=4, r2=0.05)                   # thatch
    for k in range(3): m.cyl('main', (0, H + 0.85 + k * 0.012, 0), (0, H + 0.87 + k * 0.012, 0), 1.35 - k * 0.03, seg=4)
    m.finish()

# =========================================================================================
# France
def fr_fieldgun():
    """the Canon de 75 mle 1897: the long slim barrel over its recuperator, the flat shield with
    the split top, big wooden wheels and the single pole trail."""
    m = Model('fieldgun')
    m.box('main', (0.28, 0.62, 0), (0.04, 0.62, 1.04), bevel=0.01, pitch=-0.08)
    m.box('main', (0.3, 0.33, 0), (0.04, 0.12, 0.9), bevel=0.01, pitch=0.35)                 # the folding apron
    for s in (1, -1): m.box('main', (0.27, 0.98, s * 0.3), (0.04, 0.12, 0.34), bevel=0.01)     # the split top
    m.box('main', (0.0, 0.66, 0), (0.56, 0.14, 0.24), bevel=0.03)
    m.box('main', (-0.12, 0.8, 0), (0.24, 0.16, 0.2), bevel=0.03)
    m.cyl('main', (-0.05, 0.74, 0), (1.05, 0.8, 0), 0.06, seg=14)                            # the recuperator
    tip = barrel(m, 'main', (-0.1, 0.88, 0), 0.06, 1.8, 0.052, 0.045)
    m.box('dark', (0.0, 0.98, 0.16), (0.12, 0.08, 0.06), bevel=0.01)
    for s in (1, -1): spoked_wheel(m, (0.05, 0.45, s * 0.6), 0.45, n=14)
    m.cyl('main', (0.05, 0.45, -0.6), (0.05, 0.45, 0.6), 0.035, seg=10)
    m.cyl('main', (-0.05, 0.55, 0), (-1.35, 0.08, 0), 0.07, seg=14)                             # single pole trail
    m.box('main', (-1.36, 0.06, 0), (0.18, 0.12, 0.36), bevel=0.02, pitch=0.4)
    m.box('main', (-0.7, 0.34, 0), (0.3, 0.05, 0.3), bevel=0.01)                                # the gunner's seat
    shell_box(m, -0.65, 0.45)
    m.finish()
    return tip

def fr_aa():
    """the Hotchkiss 25 mm: the gun on its three-legged mount with the small shield, the long
    barrel with the flash hider, the magazine on top and the seats either side."""
    m = Model('aa'); rnd = mulberry(28)
    for k in range(3):
        a = k / 3 * 2 * math.pi
        m.cyl('main', (0, 0.3, 0), (math.cos(a) * 0.8, 0.02, math.sin(a) * 0.8), 0.05, seg=10)
        m.cyl('main', (math.cos(a) * 0.8, 0.0, math.sin(a) * 0.8), (math.cos(a) * 0.8, 0.06, math.sin(a) * 0.8), 0.1, seg=14)
    sandbag_ring(m, 'main', 1.05, 0, 2 * math.pi, 1, 16, rnd, y0=0.0)
    t = 'turret_main'
    m.cyl(t, (0, 0.28, 0), (0, 0.42, 0), 0.26, seg=24, bevel=0.02)
    m.box(t, (0.0, 0.62, 0), (0.34, 0.34, 0.3), bevel=0.03)
    m.box(t, (0.3, 0.75, 0), (0.03, 0.36, 0.56), bevel=0.01, pitch=-0.25)
    tip = barrel(m, t, (0.1, 0.76, 0), 0.75, 1.3, 0.036, 0.032, brake='hider', jacket=[(0.0, 0.3, 0.075)])
    m.box(t, (0.02, 0.96, 0), (0.18, 0.22, 0.07), bevel=0.01, pitch=0.75)
    for z in (-0.3, 0.3):
        m.box('turret_dark', (-0.28, 0.5, z), (0.18, 0.05, 0.16), bevel=0.02)
        m.torus('turret_dark', (-0.05, 0.6, z * 0.8), (0, 0, 1), 0.06, 0.01, seg=14)
    m.finish()
    return tip

def fr_mgnest():
    """the Hotchkiss mle 1914 on its tripod - the barrel with the five brass cooling rings and the
    feed strip - in a pit walled with wicker gabions."""
    m = Model('mgnest')
    pit(m)
    for i in range(7):                                                                         # the gabions
        a = -math.pi * 0.62 + i * math.pi * 1.24 / 6
        c = (math.cos(a) * 0.82, 0.0, math.sin(a) * 0.82)
        m.cyl('main', c, (c[0], 0.42, c[2]), 0.16, seg=16)
        for k in range(4): m.torus('main', (c[0], 0.08 + k * 0.1, c[2]), (0, 1, 0), 0.162, 0.01, seg=16)
    ammo_tins(m)
    t = 'turret_main'
    tripod(m, t, (0.3, 0.46, 0), [(0.72, 0.04, 0), (0.0, 0.04, 0.32), (0.0, 0.04, -0.32)], r=0.024)
    m.box(t, (0.3, 0.6, 0), (0.26, 0.11, 0.1), bevel=0.02)
    m.cyl(t, (0.42, 0.61, 0), (0.98, 0.61, 0), 0.026, seg=12)
    for k in range(5): m.lathe(t, [(0.026, -0.012), (0.06, -0.01), (0.06, 0.01), (0.026, 0.012)], (0.46 + k * 0.035, 0.61, 0), (1, 0, 0), seg=16)   # the cooling rings
    m.cyl(t, (0.4, 0.55, 0), (0.7, 0.56, 0), 0.02, seg=8)                                       # gas cylinder
    m.box(t, (0.3, 0.62, -0.14), (0.28, 0.012, 0.1), bevel=0.0)                                   # the feed strip
    m.cyl(t, (0.14, 0.6, 0), (0.08, 0.56, 0), 0.02, seg=8)
    m.finish()

def fr_tower():
    """a round concrete observation tower in the Maginot style: the drum with its vision slits,
    a platform with a railing on top, and the armoured cloche beside the lookout."""
    m = Model('tower')
    m.cyl('main', (0, 0, 0), (0, H, 0), 0.75, seg=32, r2=0.68, bevel=0.02)
    m.cyl('main', (0, 0, 0), (0, 0.25, 0), 0.85, seg=32, bevel=0.02)                           # footing
    for k in range(6):
        a = k / 6 * 2 * math.pi
        m.box('dark', (math.cos(a) * 0.7, 1.9, math.sin(a) * 0.7), (0.04, 0.06, 0.2), bevel=0.0, yaw=-a)   # vision slits
    m.box('dark', (0.76, 0.45, 0), (0.02, 0.8, 0.36), bevel=0.0)                                # door
    for k in range(9): m.box('main', (0.8 + k * 0.001, 0.12 + k * 0.28, -0.35), (0.04, 0.03, 0.26), bevel=0.0)   # rungs up the side
    m.cyl('main', (0, H, 0), (0, H + 0.07, 0), 0.92, seg=32, bevel=0.01)                        # platform
    for k in range(16):
        a = k / 16 * 2 * math.pi
        m.cyl('main', (math.cos(a) * 0.88, H + 0.07, math.sin(a) * 0.88), (math.cos(a) * 0.88, H + 0.45, math.sin(a) * 0.88), 0.015, seg=6)
    m.torus('main', (0, H + 0.45, 0), (0, 1, 0), 0.88, 0.02, seg=40)
    m.lathe('main', [(0.0, 0.0), (0.32, 0.0), (0.32, 0.12), (0.26, 0.28), (0.0, 0.34)], (0.4, H + 0.07, -0.4), (0, 1, 0), seg=24)   # the cloche
    for k in range(3):
        a = k * 0.9
        m.box('dark', (0.4 + math.cos(a) * 0.3, H + 0.2, -0.4 + math.sin(a) * 0.3), (0.03, 0.04, 0.1), bevel=0.0, yaw=-a)
    m.finish()

# =========================================================================================
# Italy
def it_fieldgun():
    """the Cannone da 47/32: a small, low gun with no shield - the long thin barrel, the little
    spoked wheels and the split trail."""
    m = Model('fieldgun')
    m.box('main', (0.0, 0.46, 0), (0.46, 0.14, 0.22), bevel=0.03)
    m.box('main', (-0.1, 0.58, 0), (0.24, 0.14, 0.18), bevel=0.03)
    m.cyl('main', (0.0, 0.54, 0), (0.6, 0.58, 0), 0.04, seg=12)
    tip = barrel(m, 'main', (-0.05, 0.62, 0), 0.08, 1.6, 0.045, 0.036)
    m.box('dark', (0.0, 0.72, 0.13), (0.1, 0.07, 0.05), bevel=0.01)
    m.torus('dark', (-0.08, 0.48, 0.16), (0, 0, 1), 0.06, 0.01, seg=14)
    for s in (1, -1): spoked_wheel(m, (0.05, 0.3, s * 0.42), 0.3, n=10, w=0.05)
    m.cyl('main', (0.05, 0.3, -0.42), (0.05, 0.3, 0.42), 0.03, seg=10)
    split_trail(m, 0.38, 1.1, 0.5, r=0.04)
    m.box('main', (0.2, 0.3, 0.0), (0.2, 0.3, 0.02), bevel=0.01)                               # the small splinter plate
    shell_box(m, -0.55, 0.0)
    m.finish()
    return tip

def it_aa():
    """the Breda 20/65: the gun on its three-legged mount with the shield, the long barrel with its
    flash hider, the feed tray with the strip on the left, and the seats."""
    m = Model('aa'); rnd = mulberry(29)
    for k in range(3):
        a = k / 3 * 2 * math.pi + 0.5
        m.box('main', (math.cos(a) * 0.42, 0.1, math.sin(a) * 0.42), (0.84, 0.08, 0.12), bevel=0.02, yaw=-a)
        m.lathe('dark', [(0.02, -0.03), (0.08, -0.03), (0.09, 0.0), (0.08, 0.03), (0.02, 0.03)], (math.cos(a) * 0.8, 0.09, math.sin(a) * 0.8), (0, 0, 1), seg=14, closed=True)
    sandbag_ring(m, 'main', 1.05, 0, 2 * math.pi, 1, 16, rnd, y0=0.0)
    t = 'turret_main'
    m.cyl(t, (0, 0.12, 0), (0, 0.32, 0), 0.32, seg=24, bevel=0.02)
    m.box(t, (0.0, 0.56, 0), (0.34, 0.34, 0.32), bevel=0.03)
    m.box(t, (0.3, 0.72, 0), (0.03, 0.42, 0.6), bevel=0.01, pitch=-0.25)
    tip = barrel(m, t, (0.1, 0.74, 0), 0.74, 1.35, 0.034, 0.03, brake='hider', jacket=[(0.0, 0.3, 0.07)])
    m.box(t, (0.1, 0.8, 0.16), (0.3, 0.012, 0.1), bevel=0.0, pitch=0.74)                        # the feed strip
    for z in (-0.3, 0.3):
        m.box('turret_dark', (-0.26, 0.48, z), (0.18, 0.05, 0.16), bevel=0.02)
        m.torus('turret_dark', (-0.05, 0.56, z * 0.8), (0, 0, 1), 0.06, 0.01, seg=14)
    m.torus(t, (0.45, 1.1, -0.2), (1, 1, 0), 0.1, 0.008, seg=18)
    m.finish()
    return tip

def it_mgnest():
    """the Breda 37 on its tripod - the heavy barrel with the carrying handle and the flat feed
    strip going in from the left - behind a dry-stone wall."""
    m = Model('mgnest'); rnd = mulberry(30)
    pit(m)
    for l in range(3):                                                                         # the dry-stone wall
        n = 11 - l
        for i in range(n):
            a = -math.pi * 0.64 + (i + 0.5 * (l % 2)) * math.pi * 1.28 / n
            r = 0.84 + (rnd() - 0.5) * 0.04
            m.box('main', (math.cos(a) * r, 0.08 + l * 0.13, math.sin(a) * r), (0.2 + rnd() * 0.08, 0.12, 0.22 + rnd() * 0.06), bevel=0.03, yaw=-a + rnd() * 0.2)
    ammo_tins(m)
    t = 'turret_main'
    tripod(m, t, (0.3, 0.46, 0), [(0.72, 0.04, 0), (0.0, 0.04, 0.3), (0.0, 0.04, -0.3)], r=0.024)
    m.box(t, (0.3, 0.6, 0), (0.28, 0.12, 0.1), bevel=0.02)
    m.cyl(t, (0.44, 0.61, 0), (0.95, 0.61, 0), 0.032, seg=12)
    m.cyl(t, (0.95, 0.61, 0), (1.0, 0.61, 0), 0.036, seg=12)
    m.box(t, (0.6, 0.69, 0), (0.14, 0.04, 0.02), bevel=0.01)                                     # carrying handle
    m.box(t, (0.3, 0.62, -0.15), (0.3, 0.012, 0.1), bevel=0.0)                                    # the feed strip
    m.cyl(t, (0.14, 0.6, 0), (0.08, 0.56, 0), 0.02, seg=8)
    m.finish()

def it_tower():
    """a stone lookout tower (a torretta): rough masonry, a doorway and slit windows, an open
    loggia at the top under a hipped roof of curved tiles."""
    m = Model('tower'); rnd = mulberry(31)
    m.box('main', (0, H / 2, 0), (1.4, H, 1.4), bevel=0.02)
    for k in range(14):                                                                         # quoins
        for x in (-0.7, 0.7):
            for z in (-0.7, 0.7): m.box('main', (x, 0.1 + k * 0.18, z), (0.18 if k % 2 else 0.12, 0.14, 0.12 if k % 2 else 0.18), bevel=0.012)
    for k in range(12):
        m.box('main', (0.705, 0.3 + rnd() * 2.0, -0.5 + rnd() * 1.0), (0.02, 0.07, 0.16), bevel=0.01)
    m.box('dark', (0.705, 0.45, 0.2), (0.02, 0.8, 0.36), bevel=0.0)
    m.cyl('dark', (0.7, 0.85, 0.2), (0.71, 0.85, 0.2), 0.18, seg=16)                            # arched door head
    for y in (1.3, 2.0): m.box('dark', (0.705, y, -0.3), (0.02, 0.26, 0.08), bevel=0.0)
    m.box('main', (0, H + 0.03, 0), (1.7, 0.08, 1.7), bevel=0.02)                              # the loggia floor
    for x in (-0.78, 0.78):
        for z in (-0.78, 0.78): m.box('main', (x, H + 0.5, z), (0.14, 1.0, 0.14), bevel=0.02)
    for s in (1, -1):
        m.box('main', (s * 0.8, H + 0.2, 0), (0.06, 0.3, 1.6), bevel=0.01)
        if s < 0: m.box('main', (0, H + 0.2, 0.8), (1.6, 0.3, 0.06), bevel=0.01)
        m.box('main', (0, H + 0.2, -0.8), (1.6, 0.3, 0.06), bevel=0.01)
    hip_roof(m, H + 1.0, 1.05, 1.05, 0.45)
    ladder(m, 0.9, H)
    m.finish()

# =========================================================================================
# Walls (two shapes each, picked by the placement seed) and wire obstacles: 2.9 long, up to 1.5
# high and about 0.4 thick for a wall, 1.9 long for the wire, all along x.
L, WH = 2.9, 1.5

def barbed(m, a, b, barbs=18, r=0.009):
    """a strand of barbed wire from a to b with its barbs."""
    m.cyl('dark', a, b, r, seg=5)
    for k in range(barbs):
        t = (k + 0.5) / barbs
        p = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
        for s in (1, -1): m.cyl('dark', p, (p[0] + 0.02, p[1] + 0.025 * s, p[2] + 0.025 * s), 0.005, seg=4)

def coil(m, x0, x1, y, z, r, turns, squash=1.0, part='dark'):
    pts = []
    N = int(turns * 18)
    for i in range(N + 1):
        t = i / N; a = t * 2 * math.pi * turns
        pts.append((x0 + (x1 - x0) * t, y + math.sin(a) * r * squash, z + math.cos(a) * r))
    for a_, b_ in zip(pts, pts[1:]): m.cyl(part, a_, b_, 0.009, seg=5)

def rubble(m, rnd, n=8, big=0.08):
    for k in range(n):
        s = big + rnd() * big
        m.box('main', (-L / 2 + rnd() * L, 0.06 + s / 3, (1 if rnd() < 0.5 else -1) * (0.3 + rnd() * 0.25)), (s * 2, s, s * 1.2), bevel=0.012, yaw=rnd() * 3, pitch=(rnd() - 0.5) * 0.6)

def de_wall(variant):
    """Atlantic Wall concrete: cast panels showing the lines of their board shuttering, a firing
    embrasure (or a shell-bitten top with the reinforcing bars sticking out) and a thick footing."""
    m = Model(f'wall{variant}'); rnd = mulberry(210 + variant)
    T = 0.42
    m.box('main', (0, 0.08, 0), (L + 0.2, 0.16, T + 0.24), bevel=0.03)
    panels = 4
    for i in range(panels):
        x = -L / 2 + (i + 0.5) * L / panels
        h = WH if variant == 0 or i in (0, 3) else WH * (0.62 if i == 1 else 0.8)
        if variant == 0 and i in (1, 2):
            m.box('main', (x, 0.16 + 0.3, 0), (L / panels - 0.02, 0.6, T), bevel=0.02)
            m.box('main', (x, h - 0.25, 0), (L / panels - 0.02, 0.5, T), bevel=0.02)
            m.box('main', (x + (0.18 if i == 1 else -0.18), 0.93, 0), (L / panels * 0.55, 0.28, T), bevel=0.02)
        else:
            m.box('main', (x, 0.16 + (h - 0.16) / 2, 0), (L / panels - 0.02, h - 0.16, T), bevel=0.02)
        for k in range(int(h / 0.16)):                                                    # shuttering lines
            for sz in (1, -1): m.box('dark', (x, 0.3 + k * 0.16, sz * (T / 2 + 0.002)), (L / panels - 0.06, 0.008, 0.004), bevel=0.0)
        if variant == 1 and i in (1, 2):
            for k in range(4): m.cyl('dark', (x - 0.2 + k * 0.13, h - 0.05, 0.1 * (k % 2) - 0.05), (x - 0.22 + k * 0.13 + rnd() * 0.05, h + 0.2 + rnd() * 0.1, 0.12 * (k % 2) - 0.06), 0.012, seg=5)
    if variant == 0:
        m.box('dark', (0, 0.92, 0), (0.3, 0.16, T + 0.01), bevel=0.0)                         # the embrasure's mouth
    rubble(m, rnd, 6 + 6 * variant)
    m.finish()

def de_wire():
    """a knife rest ('Spanish rider'): a timber beam on X-shaped legs at both ends and the middle,
    wound round with barbed wire."""
    m = Model('wire')
    m.cyl('main', (-0.95, 0.4, 0), (0.95, 0.4, 0), 0.04, seg=10)
    for x in (-0.85, 0.0, 0.85):
        for s in (1, -1): m.cyl('main', (x, 0.4, 0), (x, 0.02, s * 0.42), 0.03, seg=8)
        for s in (1, -1): m.cyl('main', (x, 0.4, 0), (x, 0.74, s * 0.34), 0.03, seg=8)
    for zz, y in ((0.36, 0.05), (-0.36, 0.05), (0.3, 0.7), (-0.3, 0.7), (0.0, 0.42)):
        barbed(m, (-0.95, y, zz), (0.95, y, zz))
    for x in (-0.6, -0.2, 0.2, 0.6):                                                            # the wire wound across
        barbed(m, (x, 0.05, 0.36), (x + 0.1, 0.7, -0.3), barbs=6)
        barbed(m, (x, 0.05, -0.36), (x + 0.1, 0.7, 0.3), barbs=6)
    m.finish()

def su_wall(variant):
    """a log palisade: a row of sharpened logs held by two rails (or a cribbed wall of logs laid
    lengthwise between posts, with the earth fill showing at the top)."""
    m = Model(f'wall{variant}'); rnd = mulberry(220 + variant)
    if variant == 0:
        n = 19
        for i in range(n):
            x = -L / 2 + (i + 0.5) * L / n; h = WH * (0.85 + rnd() * 0.15)
            m.cyl('main', (x, 0.0, 0), (x, h, 0), 0.075, seg=10)
            m.cyl('main', (x, h, 0), (x, h + 0.14, 0), 0.075, seg=10, r2=0.01)                 # the sharpened point
        for y in (0.4, 1.0):
            for sz in (1, -1): m.cyl('main', (-L / 2, y, sz * 0.1), (L / 2, y, sz * 0.1), 0.05, seg=10)
    else:
        for k in range(8):
            y = 0.09 + k * 0.155
            for sz in (1, -1): m.cyl('main', (-L / 2 + 0.05, y, sz * 0.16), (L / 2 - 0.05, y, sz * 0.16), 0.078, seg=12)
            for sz in (1, -1):
                for x in (-L / 2 + 0.05, L / 2 - 0.05): m.cyl('dark', (x, y, sz * 0.16), (x + (0.01 if x > 0 else -0.01), y, sz * 0.16), 0.07, seg=12)   # log ends
        m.box('dark', (0, 1.3, 0), (L - 0.2, 0.06, 0.26), bevel=0.02)                          # earth fill
        for x in (-1.1, 0.0, 1.1):
            for sz in (1, -1): m.cyl('main', (x, 0.0, sz * 0.26), (x, 1.4, sz * 0.26), 0.06, seg=10)
    rubble(m, rnd, 4, 0.06)
    m.finish()

def su_wire():
    """a double-apron fence: a row of pickets with barbed strands along it and guy strands running
    down to anchor stakes on both sides."""
    m = Model('wire')
    for x in (-0.85, 0.0, 0.85):
        m.cyl('main', (x, 0.0, 0), (x, 0.75, 0), 0.03, seg=8)
        for s in (1, -1):
            m.cyl('main', (x, 0.0, s * 0.55), (x, 0.12, s * 0.55), 0.025, seg=8)
            barbed(m, (x, 0.72, 0), (x, 0.1, s * 0.55), barbs=8)
    for y in (0.2, 0.45, 0.7): barbed(m, (-0.95, y, 0), (0.95, y, 0))
    for s in (1, -1):
        for k in (0.35, 0.7): barbed(m, (-0.95, 0.72 - (0.62 * k), s * 0.55 * k), (0.95, 0.72 - (0.62 * k), s * 0.55 * k))
    m.finish()

def gb_wall(variant):
    """a revetment of corrugated iron held by angle-iron pickets and wire ties, a row of sandbags
    along the top (or a sheet bent over where a shell landed)."""
    m = Model(f'wall{variant}'); rnd = mulberry(230 + variant)
    sheets = 5
    for i in range(sheets):
        x = -L / 2 + (i + 0.5) * L / sheets
        h = 1.2 if not (variant == 1 and i == 2) else 0.75
        for k in range(10):                                                                     # the corrugations
            m.cyl('main', (x - L / sheets / 2 + 0.03 + k * (L / sheets - 0.06) / 9, 0.0, 0.15 + (0.012 if k % 2 else 0)),
                  (x - L / sheets / 2 + 0.03 + k * (L / sheets - 0.06) / 9, h, 0.15 + (0.012 if k % 2 else 0)), 0.03, seg=6)
        m.box('main', (x, h / 2, 0.14), (L / sheets - 0.02, h, 0.03), bevel=0.0)
        if variant == 1 and i == 2:
            m.box('main', (x, 0.95, 0.3), (L / sheets - 0.04, 0.5, 0.03), bevel=0.0, roll=0.9)   # the bent-over sheet
    for x in (-1.45, -0.87, -0.29, 0.29, 0.87, 1.45):
        m.box('dark', (x, 0.65, 0.19), (0.04, 1.3, 0.04), bevel=0.0)                             # pickets
    m.box('main', (0, 0.35, -0.08), (L - 0.1, 0.7, 0.4), bevel=0.05)                              # earth piled behind
    if variant == 0:
        for k in range(7): sandbag(m, 'main', (-1.25 + k * 0.42, 1.28, 0.05), 0.0, L=0.42, W=0.28, rnd=rnd)
    else:
        for k in (0, 1, 5, 6): sandbag(m, 'main', (-1.25 + k * 0.42, 1.28, 0.05), 0.0, L=0.42, W=0.28, rnd=rnd)
    rubble(m, rnd, 3, 0.06)
    m.finish()

def gb_wire():
    """triple Dannert concertina: two coils side by side on the ground and a third on top, held by
    screw pickets."""
    m = Model('wire')
    for z in (-0.24, 0.24): coil(m, -0.95, 0.95, 0.24, z, 0.23, 12)
    coil(m, -0.95, 0.95, 0.62, 0.0, 0.2, 11)
    for x in (-0.9, 0.0, 0.9):
        m.cyl('main', (x, 0.0, 0.5), (x, 0.8, 0.48), 0.018, seg=6)
        barbed(m, (x, 0.78, 0.48), (x, 0.84, 0.0), barbs=3)
    barbed(m, (-0.95, 0.8, 0.0), (0.95, 0.8, 0.0))
    m.finish()

def jp_wall(variant):
    """a bamboo palisade: bundles of canes lashed to rails between posts (or a panel of split bamboo
    woven between uprights)."""
    m = Model(f'wall{variant}'); rnd = mulberry(240 + variant)
    for x in (-1.4, -0.47, 0.47, 1.4): m.cyl('main', (x, 0.0, 0), (x, WH + 0.08, 0), 0.06, seg=10)
    for y in (0.3, 0.8, 1.25):
        for sz in (1, -1):
            m.cyl('main', (-L / 2, y, sz * 0.08), (L / 2, y, sz * 0.08), 0.035, seg=8)
    if variant == 0:
        n = 30
        for i in range(n):
            x = -L / 2 + (i + 0.5) * L / n; h = WH * (0.88 + rnd() * 0.12)
            m.cyl('main', (x, 0.0, 0), (x, h, 0), 0.042, seg=8)
            m.cyl('main', (x, h, 0), (x, h + 0.08, 0.02), 0.042, seg=8, r2=0.006)              # cut on the slant
            for y in (0.5, 1.0): m.torus('main', (x, y, 0), (0, 1, 0), 0.044, 0.008, seg=10)   # nodes
    else:
        for k in range(14):                                                                     # woven strips
            y = 0.1 + k * 0.095
            m.box('main', (0, y, 0.015 * (1 if k % 2 else -1)), (L - 0.1, 0.07, 0.02), bevel=0.0)
        for i in range(12): m.box('main', (-L / 2 + 0.12 + i * 0.24, 0.72, 0), (0.07, 1.4, 0.03), bevel=0.0)
    for x in (-1.4, -0.47, 0.47, 1.4):
        for y in (0.3, 0.8, 1.25): m.torus('dark', (x, y, 0), (0, 1, 0), 0.075, 0.014, seg=12)   # lashings
    m.finish()

def jp_wire():
    """sharpened bamboo stakes leaning out towards the enemy, with a strand of barbed wire through
    them."""
    m = Model('wire'); rnd = mulberry(241)
    for i in range(11):
        x = -0.9 + i * 0.18
        for s in (1, -1):
            lean = 0.35 + rnd() * 0.15
            top = (x + (rnd() - 0.5) * 0.05, 0.62 + rnd() * 0.12, s * lean)
            m.cyl('main', (x, 0.0, s * 0.05), top, 0.022, seg=6)
            m.cyl('main', top, (top[0], top[1] + 0.08, top[2] * 1.12), 0.022, seg=6, r2=0.003)
    for s in (1, -1): barbed(m, (-0.95, 0.3, s * 0.2), (0.95, 0.3, s * 0.2))
    barbed(m, (-0.95, 0.12, 0.0), (0.95, 0.12, 0.0))
    m.finish()

def fr_wall(variant):
    """a village wall of dressed stone under a rounded coping, with a loophole knocked through it
    (or half fallen, the stones lying at its foot)."""
    m = Model(f'wall{variant}'); rnd = mulberry(250 + variant)
    T = 0.4
    m.box('main', (0, 0.06, 0), (L + 0.1, 0.12, T + 0.12), bevel=0.03)
    rows = 9
    for r in range(rows):
        y = 0.12 + r * 0.15 + 0.075
        x = -L / 2
        while x < L / 2 - 0.02:
            w = min(0.28 + rnd() * 0.22, L / 2 - x)
            top = WH if variant == 0 else (WH if abs(x) > 0.9 else 0.7 + rnd() * 0.3)
            if y < top - 0.05 and not (variant == 0 and 0.72 < y < 1.0 and -0.1 < x + w / 2 < 0.16):
                m.box('main', (x + w / 2, y, (rnd() - 0.5) * 0.02), (w - 0.02, 0.135, T), bevel=0.02)
            x += w
    if variant == 0: m.cyl('main', (-L / 2, 1.5, 0), (L / 2, 1.5, 0), 0.22, seg=16)             # coping
    else:
        for x0, x1 in ((-L / 2, -0.9), (0.9, L / 2)): m.cyl('main', (x0, 1.5, 0), (x1, 1.5, 0), 0.22, seg=16)
    rubble(m, rnd, 4 + 10 * variant, 0.08)
    m.finish()

def fr_wire():
    """the réseau Brun: a flattened roll of barbed wire mesh strung between corkscrew iron pickets."""
    m = Model('wire')
    coil(m, -0.95, 0.95, 0.3, 0.0, 0.34, 9, squash=0.8)
    for x in (-0.9, 0.0, 0.9):
        m.cyl('main', (x, 0.1, 0.36), (x, 0.8, 0.36), 0.016, seg=6)
        pts = [(x + math.cos(a) * 0.03, 0.1 - a * 0.012, 0.36 + math.sin(a) * 0.03) for a in [k * 0.6 for k in range(12)]]
        for a_, b_ in zip(pts, pts[1:]): m.cyl('main', a_, b_, 0.012, seg=5)                   # the corkscrew foot
        m.torus('main', (x, 0.8, 0.36), (1, 0, 0), 0.03, 0.008, seg=10)
    for y in (0.2, 0.62): barbed(m, (-0.95, y, 0.36), (0.95, y, 0.36))
    m.finish()

def it_wall(variant):
    """a wall of big tufa blocks under a coping of curved tiles (or broken
    down to a few courses, the blocks tumbled in front)."""
    m = Model(f'wall{variant}'); rnd = mulberry(260 + variant)
    T = 0.44
    rows = 5 if variant == 0 else 3
    for r in range(rows):
        y = 0.13 + r * 0.26
        off = (r % 2) * 0.2
        x = -L / 2
        while x < L / 2 - 0.02:
            w = min((0.4 if x > -L / 2 else 0.2 + off) + rnd() * 0.08, L / 2 - x)
            m.box('main', (x + w / 2, y, 0), (w - 0.025, 0.24, T), bevel=0.025)
            x += w
    top = 0.13 + rows * 0.26 - 0.13
    if variant == 0:
        m.box('main', (0, top + 0.03, 0), (L + 0.06, 0.06, T + 0.1), bevel=0.01)
        for i in range(14): m.cyl('main', (-L / 2 + 0.1 + i * 0.2, top + 0.1, -T / 2 - 0.06), (-L / 2 + 0.1 + i * 0.2, top + 0.14, T / 2 + 0.06), 0.07, seg=10)   # curved tiles
    else:
        for k in range(6):
            s = 0.16 + rnd() * 0.06
            m.box('main', (-1.2 + rnd() * 2.4, s / 2 + 0.02, (1 if rnd() < 0.5 else -1) * (0.45 + rnd() * 0.2)), (s * 2.2, s, s * 1.8), bevel=0.02, yaw=rnd() * 3, pitch=(rnd() - 0.5) * 0.5)
    m.finish()

def it_wire():
    """a cavallo di Frisia: a squared beam with stakes driven through it crosswise, the points
    sticking out on all sides, and barbed wire wound from point to point."""
    m = Model('wire')
    m.box('main', (0, 0.36, 0), (1.9, 0.09, 0.09), bevel=0.01)
    ends = []
    for i in range(6):
        x = -0.8 + i * 0.32
        a = (math.pi / 4) if i % 2 else (-math.pi / 4)
        for b in (a, a + math.pi / 2):
            d = (0.0, math.sin(b) * 0.4, math.cos(b) * 0.4)
            p0 = (x, 0.36 - d[1], -d[2]); p1 = (x, 0.36 + d[1], d[2])
            m.cyl('main', p0, p1, 0.024, seg=6)
            for p, q in ((p1, d), (p0, tuple(-v for v in d))):
                m.cyl('main', p, (p[0], p[1] + q[1] * 0.15, p[2] + q[2] * 0.15), 0.024, seg=6, r2=0.003)
            ends += [p0, p1]
    for k in range(0, len(ends) - 4, 2): barbed(m, ends[k], ends[k + 4], barbs=5)
    m.finish()

# =========================================================================================
# Sandbag walls (two shapes, about 2 long and 0.5 high) and anti-tank obstacles (on a 0.8 pad,
# about 0.75 high).
def bag_row(m, rnd, y, n=5, x0=-0.8, step=0.4, skip=(), W=0.3, H=0.17, off=0.0):
    for i in range(n):
        x = x0 + off + i * step
        if x > 0.85 or i in skip: continue
        sandbag(m, 'main', (x, y, (rnd() - 0.5) * 0.04), 0.0, L=0.42, W=W, H=H, rnd=rnd)

def de_sandbags(variant):
    """sandbags behind a wattle revetment: stakes driven in with withies woven between them."""
    m = Model(f'sandbags{variant}'); rnd = mulberry(300 + variant)
    for x in (-0.9, -0.45, 0.0, 0.45, 0.9): m.cyl('main', (x, 0.0, 0.2), (x, 0.52, 0.2), 0.025, seg=8)
    for k in range(9):                                                                          # the woven withies
        y = 0.05 + k * 0.05
        pts = [(-0.95 + j * 0.075, y, 0.2 + (0.022 if (j + k) % 2 else -0.022)) for j in range(27)]
        for a, b in zip(pts, pts[1:]): m.cyl('main', a, b, 0.016, seg=5)
    for l in range(2): bag_row(m, rnd, 0.09 + l * 0.15, off=(l % 2) * 0.2, skip=(4,) if l else ())
    bag_row(m, rnd, 0.39, n=4, off=0.2, skip=(3,) if variant else ())
    m.finish()

def su_sandbags(variant):
    """sandbags with a log laid along the top and pegged down."""
    m = Model(f'sandbags{variant}'); rnd = mulberry(310 + variant)
    for l in range(2): bag_row(m, rnd, 0.09 + l * 0.15, off=(l % 2) * 0.2)
    x1 = 0.95 if variant == 0 else 0.4
    m.cyl('main', (-0.95, 0.38, 0), (x1, 0.4, 0), 0.08, seg=12)
    m.cyl('dark', (x1, 0.4, 0), (x1 + 0.005, 0.4, 0), 0.07, seg=12)
    for x in (-0.6, 0.2): m.cyl('main', (x, 0.0, 0.18), (x, 0.5, 0.15), 0.02, seg=6)
    if variant: m.cyl('main', (0.55, 0.08, 0.3), (1.0, 0.08, -0.1), 0.08, seg=12)             # the second log, rolled off
    m.finish()

def gb_sandbags(variant):
    """a neatly built breastwork: courses of headers and stretchers, four high, with a picket at
    the end."""
    m = Model(f'sandbags{variant}'); rnd = mulberry(320 + variant)
    for l in range(4 if variant == 0 else 3):
        y = 0.09 + l * 0.14
        if l % 2 == 0: bag_row(m, rnd, y, n=5, H=0.15)
        else:
            for i in range(8):
                x = -0.84 + i * 0.24
                sandbag(m, 'main', (x, y, (rnd() - 0.5) * 0.03), math.pi / 2, L=0.36, W=0.22, H=0.15, rnd=rnd)
    m.cyl('main', (0.98, 0.0, 0), (0.98, 0.6, 0), 0.02, seg=6)
    m.finish()

def jp_sandbags(variant):
    """rice-straw bales (tawara): fat round bales bound with rope, their woven ends showing,
    stacked end-on in a pyramid."""
    m = Model(f'sandbags{variant}'); rnd = mulberry(330 + variant)
    def bale(x, y, z, yaw=0.0):
        L_, r = 0.42, 0.14
        c, sn = math.cos(yaw), math.sin(yaw)
        a = (x - c * L_ / 2, y, z + sn * L_ / 2); b = (x + c * L_ / 2, y, z - sn * L_ / 2)
        m.cyl('main', a, b, r, seg=14, bevel=0.03)
        for t in (0.2, 0.5, 0.8):
            m.torus('dark', (a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t), (c, 0, -sn), r + 0.004, 0.012, seg=16)
        for p, k in ((a, -1), (b, 1)): m.cyl('main', p, (p[0] + k * c * 0.02, y, p[2] - k * sn * 0.02), r * 0.8, seg=14)   # the woven ends
    for l, (n, off) in enumerate(((6, 0.0), (5, 0.15), (4, 0.3))):                               # laid end-on, in a pyramid
        if variant and l == 2: continue
        for i in range(n): bale(-0.75 + off + i * 0.3, 0.14 + l * 0.25, (rnd() - 0.5) * 0.04, math.pi / 2)
    if variant: bale(1.0, 0.14, 0.3, 0.4)
    m.finish()

def fr_sandbags(variant):
    """fascines - bundles of brushwood bound with wire - stacked and staked, with a row of sandbags
    on top."""
    m = Model(f'sandbags{variant}'); rnd = mulberry(340 + variant)
    for l in range(2):
        for zz in (-0.1, 0.1):
            y = 0.1 + l * 0.18
            m.cyl('main', (-0.95, y, zz), (0.95, y, zz), 0.09, seg=10)
            for k in range(6): m.torus('dark', (-0.8 + k * 0.32, y, zz), (1, 0, 0), 0.094, 0.01, seg=12)
            for k in range(5):                                                                  # twig ends
                a = k * 1.25
                m.cyl('main', (-0.96, y + math.sin(a) * 0.05, zz + math.cos(a) * 0.05), (-1.02, y + math.sin(a) * 0.06, zz + math.cos(a) * 0.06), 0.012, seg=4)
    for x in (-0.7, 0.0, 0.7):
        for zz in (-0.22, 0.22): m.cyl('main', (x, 0.0, zz), (x, 0.42, zz), 0.022, seg=6)
    bag_row(m, rnd, 0.52, n=4 if variant else 5, off=0.2 if variant else 0.0)
    m.finish()

def it_sandbags(variant):
    """a low wall of rough stones with sandbags laid along the top."""
    m = Model(f'sandbags{variant}'); rnd = mulberry(350 + variant)
    for l in range(2):
        x = -0.95
        while x < 0.93:
            w = 0.18 + rnd() * 0.14
            m.box('main', (x + w / 2, 0.08 + l * 0.14, (rnd() - 0.5) * 0.04), (w - 0.02, 0.13, 0.36 + rnd() * 0.06), bevel=0.03, yaw=(rnd() - 0.5) * 0.2)
            x += w
    bag_row(m, rnd, 0.37, n=5, skip=(2,) if variant else ())
    if variant: m.box('main', (0.2, 0.08, 0.45), (0.2, 0.12, 0.18), bevel=0.03, yaw=0.6)      # a stone knocked out
    m.finish()

def de_tanktrap():
    """dragon's teeth: four concrete pyramids of the Siegfried Line on their shared footing."""
    m = Model('tanktrap')
    m.box('dark', (0, 0.03, 0), (0.85, 0.06, 0.85), bevel=0.01)
    for (x, z), h in (((-0.2, -0.2), 0.7), ((0.2, -0.2), 0.6), ((-0.2, 0.2), 0.6), ((0.2, 0.2), 0.5)):
        m.cyl('main', (x, 0.06, z), (x, 0.06 + h, z), 0.24, seg=4, r2=0.07).rotation_quaternion @= Quaternion((0, 0, 1), math.pi / 4)   # square, edges to the sides
    m.finish()

def su_tanktrap():
    """the Moscow hedgehog: three lengths of railway rail, cut and welded crosswise, with the
    bolted fishplates still on."""
    m = Model('tanktrap')
    c = 0.38
    for a, b in [((-c, 0.0, -c), (c, 0.8, c)), ((c, 0.0, -c), (-c, 0.8, c)), ((0, 0.0, c * 1.2), (0, 0.8, -c * 1.2))]:
        m.cyl('main', a, b, 0.03, seg=4)                                                        # the rail's web
        for dy in (0.04, -0.04):                                                                # head and foot
            m.cyl('main', (a[0], a[1] + dy, a[2]), (b[0], b[1] + dy, b[2]), 0.035, seg=4)
        p = tuple(a[i] + (b[i] - a[i]) * 0.2 for i in range(3))
        m.box('dark', p, (0.12, 0.06, 0.06), bevel=0.005)                                        # fishplate
    m.sphere('dark', (0, 0.4, 0), 0.08, seg=10)                                                  # the weld
    m.finish()

def gb_tanktrap():
    """a 1940 anti-tank cube: a big concrete block with a lip round its top, and the marks of its
    shuttering."""
    m = Model('tanktrap')
    m.box('main', (0, 0.32, 0), (0.64, 0.64, 0.64), bevel=0.03)
    m.box('main', (0, 0.66, 0), (0.7, 0.06, 0.7), bevel=0.02)
    for k in range(3):
        for s in (1, -1):
            m.box('dark', (0, 0.12 + k * 0.18, s * 0.321), (0.6, 0.008, 0.004), bevel=0.0)
            m.box('dark', (s * 0.321, 0.12 + k * 0.18, 0), (0.004, 0.008, 0.6), bevel=0.0)
    m.finish()

def jp_tanktrap():
    """a log obstacle: three logs lashed into a tripod with a sharpened log through it, pointing
    at the enemy."""
    m = Model('tanktrap')
    top = (0.0, 0.7, 0.0)
    for a in (0.0, 2.1, 4.2):
        m.cyl('main', (math.cos(a) * 0.4, 0.0, math.sin(a) * 0.4), (-math.cos(a) * 0.08, 0.8, -math.sin(a) * 0.08), 0.06, seg=10)
    m.torus('dark', top, (0, 1, 0), 0.1, 0.02, seg=14)                                          # the lashing
    m.cyl('main', (-0.45, 0.3, 0.0), (0.38, 0.72, 0.0), 0.07, seg=10)
    m.cyl('main', (0.38, 0.72, 0.0), (0.52, 0.79, 0.0), 0.07, seg=10, r2=0.008)                 # the point
    m.finish()

def fr_tanktrap():
    """Maginot rails: lengths of railway rail set upright and leaning in a concrete footing, cut off
    at different heights."""
    m = Model('tanktrap')
    m.box('dark', (0, 0.06, 0), (0.85, 0.12, 0.85), bevel=0.02)
    for (x, z), h, lean in (((-0.25, -0.25), 0.72, 0.15), ((0.1, -0.2), 0.6, 0.1), ((-0.15, 0.2), 0.66, 0.12), ((0.25, 0.15), 0.5, 0.18), ((0.0, 0.0), 0.78, 0.08)):
        a = (x, 0.1, z); b = (x + lean, 0.1 + h, z)
        m.cyl('main', a, b, 0.028, seg=4)
        for dz in (0.03, -0.03): m.cyl('main', (a[0], a[1], a[2] + dz), (b[0], b[1], b[2] + dz), 0.03, seg=4)
    m.finish()

def it_tanktrap():
    """a concrete tetrahedron (tetraedro) with the lifting eye cast into its top."""
    m = Model('tanktrap')
    h = 0.72
    pts = [(0.42 * math.cos(a), 0.0, 0.42 * math.sin(a)) for a in (0.0, 2.094, 4.189)] + [(0.0, h, 0.0)]
    def build(bm):
        vs = [bm.verts.new(vehicles.G(*p)) for p in pts]
        for f in ((0, 2, 1), (0, 1, 3), (1, 2, 3), (2, 0, 3)): bm.faces.new([vs[i] for i in f])
    m._mesh('main', build, 0.02)
    m.torus('dark', (0.0, h + 0.03, 0.0), (1, 0, 0), 0.05, 0.012, seg=12)
    m.finish()

# =========================================================================================
# Drums and mines. A fuel store about 0.7 across and 0.9 high; an anti-tank mine about 0.4 across
# and an anti-personnel one about 0.16, half dug in (both with main and dark parts).
def drum(m, c, r=0.3, h=0.86, lying=False):
    x, y, z = c
    if lying:
        a, b = (x, y, z - h / 2), (x, y, z + h / 2); ax = (0, 0, 1)
    else:
        a, b = (x, y, z), (x, y + h, z); ax = (0, 1, 0)
    m.cyl('main', a, b, r, seg=32)
    for t in (0.0, 1.0): m.torus('main', tuple(a[i] + (b[i] - a[i]) * t for i in range(3)), ax, r - 0.005, 0.022, seg=32)
    for t in (0.33, 0.66): m.torus('main', tuple(a[i] + (b[i] - a[i]) * t for i in range(3)), ax, r + 0.006, 0.016, seg=32)
    return a, b

def jerrycan(m, c, yaw=0.0, lean=0.0):
    x, y, z = c
    m.box('main', (x, y + 0.2, z), (0.34, 0.4, 0.14), bevel=0.02, yaw=yaw, roll=lean)
    m.box('dark', (x, y + 0.2, z), (0.3, 0.02, 0.146), bevel=0.0, yaw=yaw, roll=lean)       # the welded X seen as a rib
    m.box('main', (x - 0.1 * math.cos(yaw), y + 0.43, z + 0.1 * math.sin(yaw)), (0.14, 0.05, 0.1), bevel=0.01, yaw=yaw, roll=lean)   # the three handles

def de_barrel():
    """a Wehrmacht fuel drum with a pair of the pressed-steel cans that the Allies later called
    'jerrycans' leaning against it."""
    m = Model('barrel')
    drum(m, (-0.1, 0.0, 0.0), 0.28, 0.86)
    m.cyl('dark', (-0.1, 0.86, 0), (-0.1, 0.866, 0), 0.26, seg=32)
    m.cyl('main', (0.0, 0.86, 0.06), (0.0, 0.9, 0.06), 0.045, seg=14)
    jerrycan(m, (0.34, 0.0, 0.1), yaw=0.3); jerrycan(m, (0.3, 0.0, -0.18), yaw=-0.2, lean=0.15)
    m.finish()

def su_barrel():
    """a wooden barrel of staves held by iron hoops, with its bung."""
    m = Model('barrel')
    prof = [(0.26, 0.0), (0.31, 0.2), (0.33, 0.45), (0.31, 0.7), (0.26, 0.9)]
    m.lathe('main', [(0.0, 0.0)] + prof + [(0.0, 0.9)], (0, 0, 0), (0, 1, 0), seg=24)
    for k in range(24):                                                                          # the staves' joints
        a = k / 24 * 2 * math.pi
        m.cyl('dark', (math.cos(a) * 0.262, 0.02, math.sin(a) * 0.262), (math.cos(a) * 0.331, 0.45, math.sin(a) * 0.331), 0.004, seg=4)
        m.cyl('dark', (math.cos(a) * 0.331, 0.45, math.sin(a) * 0.331), (math.cos(a) * 0.262, 0.88, math.sin(a) * 0.262), 0.004, seg=4)
    for y, r in ((0.08, 0.28), (0.25, 0.315), (0.65, 0.315), (0.82, 0.28)): m.torus('dark', (0, y, 0), (0, 1, 0), r, 0.014, seg=32)
    m.cyl('main', (0.1, 0.9, 0.05), (0.1, 0.94, 0.05), 0.04, seg=12)
    m.finish()

def gb_barrel():
    """a dump of 'flimsies', the square four-gallon petrol tins, stacked two high in their crates."""
    m = Model('barrel'); rnd = mulberry(360)
    for l in range(2):
        for i in range(3 if l == 0 else 2):
            for j in range(2):
                x = -0.26 + i * 0.26 + l * 0.13; z = -0.13 + j * 0.26
                y = 0.02 + l * 0.38
                m.box('main', (x, y + 0.17, z), (0.24, 0.34, 0.24), bevel=0.012, yaw=(rnd() - 0.5) * 0.06)
                m.cyl('main', (x + 0.05, y + 0.34, z + 0.05), (x + 0.05, y + 0.38, z + 0.05), 0.03, seg=10)
                m.box('dark', (x, y + 0.17, z + 0.121), (0.2, 0.012, 0.004), bevel=0.0)
    m.box('main', (0, 0.01, 0), (0.86, 0.02, 0.6), bevel=0.0)                                  # the crate floor
    m.finish()

def jp_barrel():
    """two fuel drums: one standing, one lying on wooden chocks beside it."""
    m = Model('barrel')
    drum(m, (-0.2, 0.0, -0.1), 0.25, 0.8)
    m.cyl('dark', (-0.2, 0.8, -0.1), (-0.2, 0.806, -0.1), 0.23, seg=32)
    for z in (-0.25, 0.25): m.box('main', (0.26, 0.05, z), (0.38, 0.1, 0.08), bevel=0.01)
    drum(m, (0.26, 0.33, 0.0), 0.25, 0.8, lying=True)
    m.cyl('main', (0.26, 0.58, 0.1), (0.26, 0.61, 0.1), 0.04, seg=12)
    m.finish()

def fr_barrel():
    """a wine barrel on its side on a wooden trestle, with its tap."""
    m = Model('barrel')
    for x in (-0.25, 0.25):
        for s in (1, -1): m.cyl('main', (x, 0.0, s * 0.35), (x, 0.36, s * 0.05), 0.03, seg=8)
    for s in (1, -1): m.cyl('main', (-0.3, 0.3, s * 0.12), (0.3, 0.3, s * 0.12), 0.03, seg=8)
    prof = [(0.22, -0.4), (0.27, -0.2), (0.29, 0.0), (0.27, 0.2), (0.22, 0.4)]
    m.lathe('main', [(0.0, -0.4)] + prof + [(0.0, 0.4)], (0, 0.58, 0), (1, 0, 0), seg=24)
    for t, r in ((-0.33, 0.24), (-0.14, 0.28), (0.14, 0.28), (0.33, 0.24)): m.torus('dark', (t, 0.58, 0), (1, 0, 0), r, 0.012, seg=28)
    m.cyl('main', (0.4, 0.46, 0), (0.48, 0.46, 0), 0.02, seg=8)                                  # the tap
    m.cyl('main', (0.47, 0.46, 0), (0.47, 0.4, 0), 0.015, seg=8)
    m.finish()

def it_barrel():
    """a fuel drum with a rotary hand pump screwed into its bung, the hose hanging down, and a
    small square can beside it."""
    m = Model('barrel')
    drum(m, (-0.05, 0.0, 0.0), 0.28, 0.86)
    m.cyl('dark', (-0.05, 0.86, 0), (-0.05, 0.866, 0), 0.26, seg=32)
    m.cyl('main', (0.05, 0.86, 0.0), (0.05, 1.05, 0.0), 0.03, seg=10)                           # the pump
    m.cyl('main', (0.05, 1.05, -0.06), (0.05, 1.05, 0.06), 0.07, seg=18)
    m.cyl('main', (0.05, 1.05, 0.06), (0.05, 1.18, 0.16), 0.012, seg=6)                          # its crank
    m.cyl('dark', (0.09, 1.0, 0.0), (0.3, 0.9, 0.0), 0.02, seg=8)                                # the hose
    m.cyl('dark', (0.3, 0.9, 0.0), (0.36, 0.3, 0.05), 0.02, seg=8)
    m.box('main', (0.38, 0.14, -0.2), (0.22, 0.28, 0.22), bevel=0.015)
    m.finish()

# ---- mines
def plate_mine(m, r, h, cap_r, cap_h, ribs=0):
    m.cyl('dark', (0, 0.0, 0), (0, h, 0), r, seg=28, bevel=0.01)
    m.torus('dark', (0, h - 0.005, 0), (0, 1, 0), r - 0.01, 0.012, seg=28)
    for k in range(ribs):                                                                        # stiffening ribs on the top plate
        a = k / ribs * 2 * math.pi
        m.box('dark', (math.cos(a) * r * 0.6, h + 0.004, math.sin(a) * r * 0.6), (r * 0.5, 0.01, 0.02), bevel=0.0, yaw=-a)
    m.cyl('main', (0, h, 0), (0, h + cap_h, 0), cap_r, seg=18, bevel=0.005)

def us_mine_at():
    """the M1A1 anti-tank mine: a round steel case with the fuze standing up in the middle and the
    carrying handle folded down the side."""
    m = Model('mine_at')
    plate_mine(m, 0.19, 0.06, 0.05, 0.035)
    m.cyl('main', (0, 0.095, 0), (0, 0.11, 0), 0.03, seg=12)
    m.torus('main', (0.19, 0.03, 0), (1, 0, 0), 0.04, 0.01, seg=12)
    m.finish()

def us_mine_ap():
    """the M2 bounding mine: the projector tube with its fuze screwed in beside it, the three prongs
    sticking up."""
    m = Model('mine_ap')
    m.cyl('dark', (0, 0.0, 0), (0, 0.07, 0), 0.05, seg=16, bevel=0.005)
    m.cyl('dark', (0.06, 0.0, 0), (0.06, 0.05, 0), 0.02, seg=10)
    m.cyl('main', (0.06, 0.05, 0), (0.06, 0.1, 0), 0.012, seg=8)
    for a in (0, 2.1, 4.2): m.cyl('main', (0.06, 0.1, 0), (0.06 + math.cos(a) * 0.025, 0.125, math.sin(a) * 0.025), 0.005, seg=5)
    m.finish()

def de_mine_at():
    """the Tellermine 42: a flat drum with a ribbed top, the pressure plate in the middle and the
    carrying handle on the side."""
    m = Model('mine_at')
    plate_mine(m, 0.2, 0.06, 0.09, 0.02, ribs=8)
    m.cyl('main', (0, 0.08, 0), (0, 0.095, 0), 0.035, seg=12)
    m.box('main', (0.21, 0.035, 0), (0.04, 0.02, 0.07), bevel=0.0)
    m.finish()

def de_mine_ap():
    """the S-mine: a small can with its three-pronged fuze sticking out of the ground."""
    m = Model('mine_ap')
    m.cyl('dark', (0, 0.0, 0), (0, 0.06, 0), 0.08, seg=16, bevel=0.006)
    m.cyl('main', (0, 0.06, 0), (0, 0.11, 0), 0.015, seg=8)
    for a in (0, 2.1, 4.2): m.cyl('main', (0, 0.1, 0), (math.cos(a) * 0.035, 0.13, math.sin(a) * 0.035), 0.006, seg=5)
    m.finish()

def su_mine_at():
    """the TM-41: a tall round case with a stepped, domed top and the fuze in the middle."""
    m = Model('mine_at')
    m.cyl('dark', (0, 0.0, 0), (0, 0.08, 0), 0.16, seg=28, bevel=0.01)
    m.lathe('dark', [(0.16, 0.0), (0.12, 0.02), (0.08, 0.035), (0.0, 0.04)], (0, 0.08, 0), (0, 1, 0), seg=28)
    m.cyl('main', (0, 0.11, 0), (0, 0.14, 0), 0.03, seg=12)
    m.finish()

def su_mine_ap():
    """the PMD-6: a small wooden box mine with its hinged lid resting on the fuze."""
    m = Model('mine_ap')
    m.box('dark', (0, 0.035, 0), (0.18, 0.07, 0.1), bevel=0.005)
    m.box('main', (0.0, 0.08, 0), (0.19, 0.012, 0.11), bevel=0.0, roll=0.08)                     # the lid, propped open
    m.cyl('main', (0.07, 0.07, 0), (0.07, 0.085, 0), 0.008, seg=6)
    m.finish()

def gb_mine_at():
    """the Mk V anti-tank mine: a round case under a big domed pressure plate."""
    m = Model('mine_at')
    m.cyl('dark', (0, 0.0, 0), (0, 0.06, 0), 0.19, seg=28, bevel=0.01)
    m.lathe('main', [(0.15, 0.0), (0.12, 0.03), (0.06, 0.05), (0.0, 0.055)], (0, 0.06, 0), (0, 1, 0), seg=28)
    m.box('main', (0.2, 0.03, 0), (0.03, 0.02, 0.06), bevel=0.0)
    m.finish()

def gb_mine_ap():
    """the shrapnel mine: a canister with its fuze and the tripwire's catch."""
    m = Model('mine_ap')
    m.cyl('dark', (0, 0.0, 0), (0, 0.08, 0), 0.06, seg=16, bevel=0.005)
    m.cyl('main', (0, 0.08, 0), (0, 0.12, 0), 0.014, seg=8)
    m.torus('main', (0, 0.125, 0), (1, 0, 0), 0.015, 0.004, seg=10)
    m.cyl('dark', (0, 0.12, 0), (0.25, 0.01, 0.0), 0.003, seg=4)                                   # the tripwire
    m.finish()

def jp_mine_at():
    """the Type 99 magnetic mine: a canvas-covered charge ringed by four magnets."""
    m = Model('mine_at')
    m.cyl('dark', (0, 0.0, 0), (0, 0.07, 0), 0.14, seg=24, bevel=0.012)
    for k in range(4):
        a = k * math.pi / 2
        m.box('main', (math.cos(a) * 0.16, 0.03, math.sin(a) * 0.16), (0.06, 0.05, 0.08), bevel=0.008, yaw=-a)
    m.cyl('main', (0, 0.07, 0), (0, 0.1, 0), 0.025, seg=12)
    m.finish()

def jp_mine_ap():
    """the Type 93 'tape measure' mine: a small flat disc with the fuze on top."""
    m = Model('mine_ap')
    m.cyl('dark', (0, 0.0, 0), (0, 0.04, 0), 0.08, seg=18, bevel=0.006)
    m.cyl('main', (0, 0.04, 0), (0, 0.065, 0), 0.018, seg=10)
    m.finish()

def fr_mine_at():
    """the mle 1936 anti-tank mine: a long steel box with the pressure bar along its top."""
    m = Model('mine_at')
    m.box('dark', (0, 0.04, 0), (0.44, 0.08, 0.2), bevel=0.01)
    m.box('main', (0, 0.09, 0), (0.4, 0.02, 0.05), bevel=0.005)
    for x in (-0.15, 0.15): m.cyl('main', (x, 0.08, 0), (x, 0.095, 0), 0.02, seg=10)
    m.finish()

def fr_mine_ap():
    """a stake mine: a ribbed charge on a wooden stake with the pull fuze on top."""
    m = Model('mine_ap')
    m.cyl('main', (0, 0.0, 0), (0, 0.1, 0), 0.012, seg=6)
    m.cyl('dark', (0, 0.1, 0), (0, 0.17, 0), 0.035, seg=12, bevel=0.004)
    for y in (0.115, 0.135, 0.155): m.torus('dark', (0, y, 0), (0, 1, 0), 0.036, 0.004, seg=12)
    m.cyl('main', (0, 0.17, 0), (0, 0.2, 0), 0.008, seg=6)
    m.cyl('dark', (0, 0.19, 0), (0.25, 0.01, 0.0), 0.003, seg=4)
    m.finish()

def it_mine_at():
    """the B2 anti-tank mine: a long sheet-steel box with a ridge running down its lid."""
    m = Model('mine_at')
    m.box('dark', (0, 0.04, 0), (0.4, 0.08, 0.22), bevel=0.01)
    m.loft_poly('main', [(-0.19, [(0.08, -0.1), (0.12, 0.0), (0.08, 0.1)]), (0.19, [(0.08, -0.1), (0.12, 0.0), (0.08, 0.1)])], bevel=0.004)
    m.finish()

def it_mine_ap():
    """the B4: a length of pipe lying in the ground with the fuze on top."""
    m = Model('mine_ap')
    m.cyl('dark', (-0.09, 0.035, 0), (0.09, 0.035, 0), 0.035, seg=14, bevel=0.004)
    m.cyl('main', (0, 0.06, 0), (0, 0.1, 0), 0.012, seg=8)
    m.finish()

# =========================================================================================
# Paratroopers' canopies (the American T-5 is in vehicles.py): about 1.5 across, the skirt some
# 1.2 up and the lines gathering at the harness 0.78 up, as the game hangs the figure under it.
def canopy(m, n=20, R=0.75, top=1.62, depth=0.62, vent=0.18, bulge=1.05, apex=0.0, scallop=0.0,
           panel=lambda i: 'main', harness=((0.0, 0.78, 0.0),), tapes=False):
    """a round canopy of n gores bulging between their seams. apex pulls the crown down (as in the
    Italian Salvator), scallop lifts the skirt between the lines, panel(i) picks each gore's part
    and the rigging lines run from the seams to the harness point(s)."""
    rows = 7
    def point(k, a, mid):
        t = k / (rows - 1)
        phi = vent + t * (math.pi / 2 - 0.35)
        r = R * math.sin(phi) * (bulge if mid else 1.0)
        y = top - R * depth * (1 - math.cos(phi)) * 1.6 - apex * (1 - t) ** 2 + (0.015 if mid else 0.0)
        if mid and k == rows - 1: y += scallop
        return (math.cos(a) * r, y, math.sin(a) * r)
    skirt = []
    for i in range(n):
        a0, a1 = i / n * 2 * math.pi, (i + 1) / n * 2 * math.pi; am = (a0 + a1) / 2
        verts, faces = [], []
        for k in range(rows):
            for a, mid in ((a0, False), (am, True), (a1, False)): verts.append(vehicles.G(*point(k, a, mid)))
        for k in range(rows - 1):
            for j in range(2):
                v00, v01, v10, v11 = k * 3 + j, k * 3 + j + 1, (k + 1) * 3 + j, (k + 1) * 3 + j + 1
                faces += [(v00, v10, v11), (v00, v11, v01)]
        me = bpy.data.meshes.new('gore'); me.from_pydata(verts, [], faces)
        o = bpy.data.objects.new('gore', me); bpy.context.scene.collection.objects.link(o)
        sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.012
        m.parts.setdefault(panel(i), []).append(o)
        edge = point(rows - 1, a0, False); skirt.append(edge)
        m.cyl('dark' if tapes else 'main', point(0, a0, False), edge, 0.008 if not tapes else 0.011, seg=6)   # seam tape
        h = min(harness, key=lambda q: (q[2] - edge[2]) ** 2 + (q[0] - edge[0]) ** 2)
        m.cyl('dark', edge, h, 0.004, seg=5)                                                    # rigging line
    y0 = point(0, 0.0, False)[1]
    m.torus('main', (0, y0, 0), (0, 1, 0), R * math.sin(vent), 0.012, seg=24)                  # vent band
    m.torus('main', (0, skirt[0][1], 0), (0, 1, 0), R * math.sin(vent + math.pi / 2 - 0.35), 0.012, seg=48)   # skirt band
    return skirt

def risers(m, z=0.06):
    for s in (1, -1): m.cyl('dark', (0, 0.78, s * z), (0, 0.62, s * z * 1.6), 0.01, seg=6)
    m.box('dark', (0, 0.78, 0), (0.05, 0.03, 0.14), bevel=0.005)

def de_chute():
    """the RZ 20: a flatter, wider canopy of 28 gores whose lines all gather at a single point
    behind the jumper's back - the Fallschirmjäger hung from it face down, with no risers to hold."""
    m = Model('chute')
    canopy(m, n=28, R=0.82, top=1.55, depth=0.5, harness=((-0.12, 0.8, 0.0),))
    m.cyl('dark', (-0.12, 0.8, 0.0), (-0.05, 0.62, 0.0), 0.012, seg=6)                           # the single strop
    m.finish()

def su_chute():
    """the PD-6: a deep canopy with a wide vent and the reinforcing tapes running over it, and the
    two risers down to the harness."""
    m = Model('chute')
    canopy(m, n=16, R=0.72, top=1.7, depth=0.72, vent=0.3, tapes=True, harness=((0.0, 0.78, -0.06), (0.0, 0.78, 0.06)))
    risers(m)
    m.finish()

def gb_chute():
    """the X-type: a hemispherical canopy of 28 gores, the rigging lines in four groups to the
    lift webs of the harness."""
    m = Model('chute')
    canopy(m, n=28, R=0.76, top=1.66, depth=0.66, vent=0.12, bulge=1.03,
           harness=((0.03, 0.8, -0.07), (0.03, 0.8, 0.07), (-0.03, 0.8, -0.07), (-0.03, 0.8, 0.07)))
    for x in (0.03, -0.03):
        for z in (-0.07, 0.07): m.cyl('dark', (x, 0.8, z), (0.0, 0.62, z * 1.4), 0.008, seg=6)    # the four lift webs
    m.finish()

def jp_chute():
    """the Type 1: a light silk canopy with its skirt scalloped up between the lines."""
    m = Model('chute')
    canopy(m, n=18, R=0.76, top=1.6, depth=0.6, scallop=0.07, bulge=1.07, harness=((0.0, 0.78, -0.06), (0.0, 0.78, 0.06)))
    risers(m)
    m.finish()

def fr_chute():
    """a French canopy sewn from alternate light and dark panels."""
    m = Model('chute')
    canopy(m, n=16, R=0.75, top=1.62, depth=0.62, panel=lambda i: 'dark' if i % 2 else 'main', harness=((0.0, 0.78, -0.06), (0.0, 0.78, 0.06)))
    risers(m)
    m.finish()

def it_chute():
    """the Salvator D.39: its crown pulled down by a central line into a deep ring-shaped canopy."""
    m = Model('chute')
    canopy(m, n=20, R=0.78, top=1.66, depth=0.6, vent=0.22, apex=0.28, harness=((0.0, 0.78, -0.06), (0.0, 0.78, 0.06)))
    m.cyl('dark', (0.0, 1.38, 0.0), (0.0, 0.78, 0.0), 0.005, seg=5)                             # the centre line
    risers(m)
    m.finish()

# =========================================================================================
# Field hospitals (the American ward tent is in structures.py). Every one keeps to the 3x3 cells
# about the origin and shows the red cross from above and from the sides.
def rc_panel(m, c, face, size=0.4):
    """a white panel with a red cross on a vertical face ('+x', '-x', '+z', '-z')."""
    x, y, z = c; t = 0.012
    fx, fz = {'+x': (1, 0), '-x': (-1, 0), '+z': (0, 1), '-z': (0, -1)}[face]
    dims = lambda a, b: (t, b, a) if fx else (a, b, t)
    m.box(WHITE, (x, y, z), dims(size, size), bevel=0.0)
    o = (x + fx * 0.008, y, z + fz * 0.008)
    m.box(RED, o, dims(size * 0.76, size * 0.22), bevel=0.0); m.box(RED, o, dims(size * 0.22, size * 0.76), bevel=0.0)

def rc_flat(m, c, size=0.5, white=True):
    """a red cross lying flat (on a roof top or spread on the ground for the airmen)."""
    x, y, z = c
    if white: m.box(WHITE, (x, y, z), (size, 0.012, size), bevel=0.0)
    m.box(RED, (x, y + 0.008, z), (size * 0.76, 0.012, size * 0.22), bevel=0.0)
    m.box(RED, (x, y + 0.008, z), (size * 0.22, 0.012, size * 0.76), bevel=0.0)

def rc_slope(m, s, W, y0, y1, z, size=0.46):
    """a red cross on the roof slope that falls from the ridge (x=0, y1) to the eaves (x=s*W, y0)."""
    slope = math.atan2(y1 - y0, W)
    cx, cy = s * W / 2 + s * 0.012 * math.sin(slope), (y0 + y1) / 2 + 0.018 * math.cos(slope)
    m.box(WHITE, (cx, cy, z), (size, 0.012, size), bevel=0.0, pitch=-s * slope)
    o = (cx + s * 0.004 * math.sin(slope), cy + 0.004, z)
    m.box(RED, o, (size * 0.76, 0.012, size * 0.22), bevel=0.0, pitch=-s * slope)
    m.box(RED, o, (size * 0.22, 0.012, size * 0.76), bevel=0.0, pitch=-s * slope)

def rc_flag(m, x, z, h=2.1, part='dark'):
    m.cyl(part, (x, 0, z), (x, h, z), 0.022, seg=10)
    m.sphere(part, (x, h + 0.02, z), 0.035, seg=10)
    m.box(WHITE, (x + 0.3, h - 0.25, z), (0.56, 0.38, 0.012), bevel=0.0)
    for dz in (0.009, -0.009):
        m.box(RED, (x + 0.3, h - 0.25, z + dz), (0.36, 0.09, 0.008), bevel=0.0)
        m.box(RED, (x + 0.3, h - 0.25, z + dz), (0.09, 0.3, 0.008), bevel=0.0)

def stretcher(m, x, z, y=0.14, legs=True, along_x=False):
    """a canvas stretcher on its poles, along z (or x)."""
    P = (lambda a, b: (x + a, y, z + b)) if not along_x else (lambda a, b: (x + b, y, z + a))
    for d in (-0.11, 0.11): m.cyl('dark', P(d, -0.55), P(d, 0.55), 0.015, seg=6)
    m.box('main', (x, y + 0.01, z), (0.2, 0.02, 0.9) if not along_x else (0.9, 0.02, 0.2), bevel=0.004)
    if legs:
        for b in (-0.42, 0.42):
            for d in (-0.09, 0.09):
                px, _, pz = P(d, b); m.cyl('dark', (px, 0.0, pz), (px, y, pz), 0.012, seg=5)

def med_chest(m, x, z, yaw=0.0):
    m.box('main', (x, 0.13, z), (0.36, 0.26, 0.24), bevel=0.015, yaw=yaw)
    rc_flat(m, (x, 0.265, z), 0.16)

def guys(m, pts):
    for a, b in pts:
        m.cyl('dark', a, b, 0.006, seg=5)
        m.cyl('dark', (b[0], 0.0, b[2]), (b[0] * 1.02, 0.09, b[2] * 1.02), 0.014, seg=6)

def de_hospital():
    """a Wehrmacht Sanitätszelt: a box tent with a hipped roof of buttoned Zeltbahn panels, crosses
    on the walls, a Red Cross sheet pegged out on the grass for the airmen."""
    m = Model('hospital')
    hw, hd, wh = 1.05, 0.72, 0.55
    m.box('dark', (0, 0.012, -0.1), (2 * hw + 0.2, 0.024, 2 * hd + 0.2), bevel=0.01)
    m.box('main', (0, wh / 2, -0.1), (2 * hw, wh, 2 * hd), bevel=0.015)
    m.loft_poly('main', [(-hw - 0.06, [(wh, -0.1 - hd - 0.06), (wh + 0.01, -0.1), (wh, -0.1 + hd + 0.06)]), (-hw * 0.2, [(wh, -0.1 - hd - 0.06), (wh + 0.75, -0.1), (wh, -0.1 + hd + 0.06)]),
                          (hw * 0.2, [(wh, -0.1 - hd - 0.06), (wh + 0.75, -0.1), (wh, -0.1 + hd + 0.06)]), (hw + 0.06, [(wh, -0.1 - hd - 0.06), (wh + 0.01, -0.1), (wh, -0.1 + hd + 0.06)])], bevel=0.01)
    for x in (-0.7, -0.35, 0.0, 0.35, 0.7):                                                 # Zeltbahn button seams on the walls
        for s in (1, -1): m.box('dark', (x, wh / 2, -0.1 + s * (hd + 0.006)), (0.012, wh - 0.06, 0.012), bevel=0.0)
    for x in (-0.6, 0.6): m.cyl('dark', (x, wh + 0.5, -0.1), (x, wh + 0.83, -0.1), 0.022, seg=8)   # poles through the roof
    m.box('dark', (hw + 0.006, 0.36, -0.1), (0.012, 0.66, 0.44), bevel=0.0)                        # doorway
    for s in (1, -1): m.box('main', (hw + 0.03, 0.4, -0.1 + s * 0.28), (0.05, 0.74, 0.1), bevel=0.02, yaw=s * 0.4)
    rc_panel(m, (-0.35, 0.3, -0.1 + hd + 0.006), '+z', 0.36); rc_panel(m, (0.35, 0.3, -0.1 - hd - 0.006), '-z', 0.36)
    rc_panel(m, (-hw - 0.006, 0.3, -0.1), '-x', 0.36)
    guys(m, [((s * hw, wh, -0.1 + t * hd), (s * (hw + 0.3), 0.0, -0.1 + t * (hd + 0.3))) for s in (1, -1) for t in (1, -1)])
    rc_flat(m, (0.5, 0.013, 1.05), 0.62)                                                    # the air-recognition sheet
    for x in (0.2, 0.8):
        for z in (0.75, 1.35): m.cyl('dark', (x, 0.0, z), (x, 0.05, z), 0.012, seg=5)
    stretcher(m, -0.6, 1.1, along_x=True)
    med_chest(m, 1.3, 0.5)
    rc_flag(m, -1.3, -1.2)
    m.finish()

def su_hospital():
    """a Red Army medical dugout: the tent roof over a pit lined with logs, the spoil banked up
    round it, a stove pipe smoking through the canvas, a red cross on the roof and the flag."""
    m = Model('hospital')
    W, L, wh, R = 0.85, 1.05, 0.38, 1.05
    for s in (1, -1):                                                                        # earth bank
        m.prism('dark', [(s * (W + 0.02), 0.0), (s * (W + 0.35), 0.0), (s * (W + 0.02), wh + 0.02)], -L - 0.2, L + 0.2, bevel=0.03)
    m.prism('dark', [(-W - 0.2, 0.0), (W + 0.2, 0.0), (W + 0.02, wh + 0.02), (-W - 0.02, wh + 0.02)], -L - 0.35, -L - 0.02, bevel=0.03)
    for s in (1, -1):                                                                        # log walls
        for k in range(3): m.cyl('main', (s * W, 0.07 + k * 0.12, -L - 0.08), (s * W, 0.07 + k * 0.12, L + 0.08), 0.06, seg=10)
    for k in range(3): m.cyl('main', (-W - 0.08, 0.07 + k * 0.12, -L), (W + 0.08, 0.07 + k * 0.12, -L), 0.06, seg=10)
    m.prism('main', [(-W - 0.08, wh), (W + 0.08, wh), (0, R)], -L - 0.05, L + 0.05, bevel=0.015)
    for z in (-0.6, 0.0, 0.6):
        for s in (1, -1): m.box('main', (s * (W + 0.08) / 2, (wh + R) / 2 + 0.01, z), (math.hypot(W + 0.08, R - wh), 0.012, 0.03), bevel=0.0, pitch=-s * math.atan2(R - wh, W + 0.08))
    rc_slope(m, 1, W + 0.08, wh, R, 0.25, 0.4); rc_slope(m, -1, W + 0.08, wh, R, 0.25, 0.4)
    m.box('dark', (0, 0.3, L + 0.05), (0.5, 0.6, 0.012), bevel=0.0)                           # doorway and steps down
    for k in range(3): m.box('main', (0, 0.05 + k * 0.1, L + 0.3 - k * 0.1), (0.5, 0.05, 0.12), bevel=0.01)
    m.box('main', (0, 0.62, L + 0.08), (0.62, 0.05, 0.08), bevel=0.01)                        # lintel log
    m.cyl('dark', (-0.4, R - 0.3, -0.5), (-0.4, R + 0.25, -0.5), 0.05, seg=12)                # stove pipe
    m.cyl('dark', (-0.4, R + 0.25, -0.5), (-0.4, R + 0.29, -0.5), 0.09, seg=12)
    for k in range(4): m.cyl('main', (1.05 + k * 0.0, 0.06 + (k % 2) * 0.11, 0.3 + (k // 2) * 0.13), (1.05, 0.06 + (k % 2) * 0.11, -0.7 + (k // 2) * 0.13), 0.055, seg=8)   # log pile
    stretcher(m, -1.25, 0.5)
    med_chest(m, 0.75, L + 0.5)
    rc_flag(m, 1.3, -1.25)
    m.finish()

def gb_hospital():
    """an RAMC hospital marquee: walls under a hipped roof held up by two king poles with pennants,
    a scalloped valance round the eaves, the flaps looped up."""
    m = Model('hospital')
    hw, hd, wh = 1.15, 0.78, 0.6
    m.box('dark', (0, 0.012, 0), (2 * hw + 0.2, 0.024, 2 * hd + 0.2), bevel=0.01)
    m.box('main', (0, wh / 2, 0), (2 * hw, wh, 2 * hd), bevel=0.015)
    hip_roof(m, wh, hw + 0.05, hd + 0.05, 0.62)
    for x in (-0.55, 0.55):                                                                    # king poles, pennants
        m.cyl('dark', (x, wh + 0.4, 0), (x, wh + 1.0, 0), 0.025, seg=8)
        m.sphere('dark', (x, wh + 1.02, 0), 0.035, seg=8)
        m.fin(WHITE, [(x, wh + 0.95), (x + 0.28, wh + 0.9), (x, wh + 0.84)], 0.0, 0.01)
    for s in (1, -1):                                                                          # the valance
        for k in range(12): m.cyl('main', (-hw + 0.1 + k * (2 * hw - 0.2) / 11, wh - 0.02, s * (hd + 0.06)), (-hw + 0.1 + k * (2 * hw - 0.2) / 11, wh - 0.02, s * (hd + 0.065)), 0.095, seg=12)
        for k in range(8): m.cyl('main', (s * (hw + 0.06), wh - 0.02, -hd + 0.1 + k * (2 * hd - 0.2) / 7), (s * (hw + 0.065), wh - 0.02, -hd + 0.1 + k * (2 * hd - 0.2) / 7), 0.095, seg=12)
    for x in (-0.8, -0.4, 0.0, 0.4, 0.8):                                                      # wall poles
        for s in (1, -1): m.cyl('dark', (x, 0, s * (hd + 0.01)), (x, wh, s * (hd + 0.01)), 0.014, seg=6)
    m.box('dark', (0.2, 0.3, hd + 0.006), (0.5, 0.56, 0.012), bevel=0.0)                        # door flaps looped up
    for dx in (-0.3, 0.3): m.cyl('main', (0.2 + dx, 0.08, hd + 0.04), (0.2 + dx, wh - 0.05, hd + 0.04), 0.045, seg=10)
    rc_panel(m, (-0.55, 0.32, hd + 0.006), '+z', 0.36); rc_panel(m, (0.0, 0.32, -hd - 0.006), '-z', 0.36)
    rc_panel(m, (hw + 0.006, 0.32, 0), '+x', 0.36)
    guys(m, [((s * hw, wh, t * hd), (s * (hw + 0.28), 0.0, t * (hd + 0.28))) for s in (1, -1) for t in (1, -1)])
    stretcher(m, 0.9, 1.25, along_x=True)
    med_chest(m, -0.6, 1.25)
    rc_flag(m, -1.3, -1.25)
    m.finish()

def jp_hospital():
    """a Japanese field dressing station: a steep roof of matting on lashed bamboo, open at the
    sides, cots under it, a curtain with the red cross at the back."""
    m = Model('hospital')
    W, L, eave, R = 1.0, 1.05, 0.75, 1.6
    for z in (-L + 0.05, 0.0, L - 0.05):
        for s in (1, -1):
            m.cyl('main', (s * (W - 0.12), 0.0, z), (s * (W - 0.12), eave + 0.05, z), 0.035, seg=8)
            m.torus('main', (s * (W - 0.12), eave - 0.03, z), (0, 1, 0), 0.045, 0.012, seg=10)
        m.cyl('main', (0, 0.0, z), (0, R, z), 0.04, seg=8)
    for s in (1, -1): m.cyl('main', (s * (W - 0.12), eave, -L - 0.05), (s * (W - 0.12), eave, L + 0.05), 0.03, seg=8)
    m.cyl('main', (0, R, -L - 0.12), (0, R, L + 0.12), 0.035, seg=8)
    m.prism('main', [(-W, eave - 0.1), (-W + 0.04, eave - 0.14), (0, R - 0.04), (W - 0.04, eave - 0.14), (W, eave - 0.1), (0, R + 0.03)], -L - 0.1, L + 0.1, bevel=0.01)
    for k in range(6):                                                                          # matting courses
        y = eave - 0.08 + k * (R - eave) / 6; x = W * (1 - k / 6)
        for s in (1, -1): m.cyl('dark', (s * x, y, -L - 0.1), (s * x, y, L + 0.1), 0.008, seg=5)
    rc_slope(m, 1, W, eave - 0.1, R + 0.03, 0.2, 0.46); rc_slope(m, -1, W, eave - 0.1, R + 0.03, 0.2, 0.46)
    m.box(WHITE, (0, 0.5, -L + 0.02), (1.5, 0.9, 0.012), bevel=0.0)                              # curtain at the back
    m.box(RED, (0, 0.55, -L + 0.03), (0.34, 0.1, 0.012), bevel=0.0); m.box(RED, (0, 0.55, -L + 0.03), (0.1, 0.34, 0.012), bevel=0.0)
    for x in (-0.45, 0.45): stretcher(m, x, 0.1, y=0.3)                                          # cots
    med_chest(m, 0.0, 0.85)
    for k in range(3): m.cyl('dark', (1.2, 0.0, -0.3 + k * 0.2), (1.2, 0.3, -0.3 + k * 0.2), 0.05, seg=10)   # water buckets
    rc_flag(m, -1.3, 1.25)
    m.finish()

def fr_hospital():
    """a French ambulance tent: canvas over iron hoops, round-backed like a tortoise, a big red
    cross on its crown, the end wall buttoned back at the door."""
    m = Model('hospital')
    Rr, L = 0.92, 1.1
    m.cyl('main', (0, 0.0, -L), (0, 0.0, L), Rr, seg=40)
    for z in (-L + 0.02, -0.55, 0.0, 0.55, L - 0.02): m.torus('dark', (0, 0.0, z), (0, 0, 1), Rr + 0.005, 0.014, seg=28)
    for a in (0.5, 1.0):                                                                        # seams along
        for s in (1, -1): m.cyl('main', (s * Rr * math.cos(a), Rr * math.sin(a), -L), (s * Rr * math.cos(a), Rr * math.sin(a), L), 0.01, seg=5)
    rc_flat(m, (0, Rr + 0.004, 0.0), 0.5)
    m.box('dark', (0, 0.36, L + 0.006), (0.5, 0.7, 0.012), bevel=0.0)
    for s in (1, -1): m.box('main', (s * 0.32, 0.35, L + 0.07), (0.14, 0.66, 0.05), bevel=0.02, yaw=s * 0.5)
    rc_panel(m, (0, 0.5, -L - 0.006), '-z', 0.4)
    guys(m, [((s * Rr * 0.7, Rr * 0.7, z), (s * (Rr + 0.35), 0.0, z)) for s in (1, -1) for z in (-0.55, 0.55)])
    stretcher(m, -0.7, 1.3, along_x=True)
    med_chest(m, 0.8, 1.3)
    rc_flag(m, 1.3, -1.25)
    m.finish()

def it_hospital():
    """a Croce Rossa Italiana post: a big conical tent on a low wall, a banner with the red cross
    stretched between two poles in front, a sheet for the airmen on the grass."""
    m = Model('hospital')
    c = (-0.2, -0.2)
    m.cyl('main', (c[0], 0.0, c[1]), (c[0], 0.35, c[1]), 1.0, seg=32)
    m.cyl('main', (c[0], 0.35, c[1]), (c[0], 1.55, c[1]), 1.06, seg=32, r2=0.06)
    m.torus('main', (c[0], 0.36, c[1]), (0, 1, 0), 1.04, 0.025, seg=32)
    for k in range(8):                                                                          # panel seams
        a = k * math.pi / 4
        m.cyl('dark', (c[0] + 1.04 * math.cos(a), 0.37, c[1] + 1.04 * math.sin(a)), (c[0] + 0.1 * math.cos(a), 1.5, c[1] + 0.1 * math.sin(a)), 0.008, seg=5)
    m.cyl('dark', (c[0], 1.5, c[1]), (c[0], 1.78, c[1]), 0.022, seg=8); m.sphere('dark', (c[0], 1.8, c[1]), 0.04, seg=8)
    m.box('dark', (c[0] + 1.0, 0.3, c[1]), (0.012, 0.58, 0.42), bevel=0.0)                        # doorway, facing +x
    guys(m, [((c[0] + 1.02 * math.cos(a), 0.4, c[1] + 1.02 * math.sin(a)), (c[0] + 1.3 * math.cos(a), 0.0, c[1] + 1.3 * math.sin(a))) for a in (0.8, 2.4, 3.9, 5.5)])
    for z in (0.75, 1.35): m.cyl('dark', (1.25, 0.0, z), (1.25, 0.95, z), 0.02, seg=8)           # the banner
    m.box(WHITE, (1.25, 0.72, 1.05), (0.012, 0.36, 0.56), bevel=0.0)
    for dx in (0.008, -0.008):
        m.box(RED, (1.25 + dx, 0.72, 1.05), (0.008, 0.08, 0.28), bevel=0.0); m.box(RED, (1.25 + dx, 0.72, 1.05), (0.008, 0.28, 0.08), bevel=0.0)
    rc_flat(m, (0.35, 0.013, 1.2), 0.5)
    stretcher(m, 1.2, -0.7)
    med_chest(m, -1.2, 1.2)
    rc_flag(m, -1.3, -1.3)
    m.finish()

NATIONS = {
    'us': {'fieldgun': us_fieldgun, 'aa': us_aa, 'mgnest': us_mgnest, 'tower': us_tower, 'mine_at': us_mine_at, 'mine_ap': us_mine_ap},
    'de': {'fieldgun': de_fieldgun, 'aa': de_aa, 'mgnest': de_mgnest, 'tower': de_tower,
           'wall0': lambda: de_wall(0), 'wall1': lambda: de_wall(1), 'wire': de_wire,
           'sandbags0': lambda: de_sandbags(0), 'sandbags1': lambda: de_sandbags(1), 'tanktrap': de_tanktrap,
           'barrel': de_barrel, 'mine_at': de_mine_at, 'mine_ap': de_mine_ap, 'chute': de_chute,
           'hospital': de_hospital},
    'su': {'fieldgun': su_fieldgun, 'aa': su_aa, 'mgnest': su_mgnest, 'tower': su_tower,
           'wall0': lambda: su_wall(0), 'wall1': lambda: su_wall(1), 'wire': su_wire,
           'sandbags0': lambda: su_sandbags(0), 'sandbags1': lambda: su_sandbags(1), 'tanktrap': su_tanktrap,
           'barrel': su_barrel, 'mine_at': su_mine_at, 'mine_ap': su_mine_ap, 'chute': su_chute,
           'hospital': su_hospital},
    'gb': {'fieldgun': gb_fieldgun, 'aa': gb_aa, 'mgnest': gb_mgnest, 'tower': gb_tower,
           'wall0': lambda: gb_wall(0), 'wall1': lambda: gb_wall(1), 'wire': gb_wire,
           'sandbags0': lambda: gb_sandbags(0), 'sandbags1': lambda: gb_sandbags(1), 'tanktrap': gb_tanktrap,
           'barrel': gb_barrel, 'mine_at': gb_mine_at, 'mine_ap': gb_mine_ap, 'chute': gb_chute,
           'hospital': gb_hospital},
    'jp': {'fieldgun': jp_fieldgun, 'aa': jp_aa, 'mgnest': jp_mgnest, 'tower': jp_tower,
           'wall0': lambda: jp_wall(0), 'wall1': lambda: jp_wall(1), 'wire': jp_wire,
           'sandbags0': lambda: jp_sandbags(0), 'sandbags1': lambda: jp_sandbags(1), 'tanktrap': jp_tanktrap,
           'barrel': jp_barrel, 'mine_at': jp_mine_at, 'mine_ap': jp_mine_ap, 'chute': jp_chute,
           'hospital': jp_hospital},
    'fr': {'fieldgun': fr_fieldgun, 'aa': fr_aa, 'mgnest': fr_mgnest, 'tower': fr_tower,
           'wall0': lambda: fr_wall(0), 'wall1': lambda: fr_wall(1), 'wire': fr_wire,
           'sandbags0': lambda: fr_sandbags(0), 'sandbags1': lambda: fr_sandbags(1), 'tanktrap': fr_tanktrap,
           'barrel': fr_barrel, 'mine_at': fr_mine_at, 'mine_ap': fr_mine_ap, 'chute': fr_chute,
           'hospital': fr_hospital},
    'it': {'fieldgun': it_fieldgun, 'aa': it_aa, 'mgnest': it_mgnest, 'tower': it_tower,
           'wall0': lambda: it_wall(0), 'wall1': lambda: it_wall(1), 'wire': it_wire,
           'sandbags0': lambda: it_sandbags(0), 'sandbags1': lambda: it_sandbags(1), 'tanktrap': it_tanktrap,
           'barrel': it_barrel, 'mine_at': it_mine_at, 'mine_ap': it_mine_ap, 'chute': it_chute,
           'hospital': it_hospital},
}

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    only = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
    for nation in args or NATIONS:
        vehicles.OUT = BASE if nation == 'us' else os.path.join(BASE, nation)          # the American ones are the default models
        for name, build in NATIONS[nation].items():
            if only and name not in only: continue
            clear(); tip = build()
            if tip: print(f'{nation}:{name} muzzle {tip[0]:.2f}, {tip[1]:.2f}')
