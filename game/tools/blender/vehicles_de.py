# The German army's vehicles, aircraft and headquarters, built with the tools in vehicles.py:
# Kuebelwagen, Opel Blitz (ambulance and engineers), Sd.Kfz. 222, Schwimmwagen, Panzer II, Panzer IV,
# Tiger I, Panzerwerfer 42, Flettner Fl 282, Bf 109, Ju 87 Stuka, He 111, Ju 52 and a command bunker.
# Same keys as the American set, written to .cache/figures/vehicles/de; tools/figures.mjs packs them
# into public/nation-de.js.
#
#   python tools/blender/vehicles_de.py [name ...]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehicles
from vehicles import (Model, clear, GLASS, LIGHT, WHITE, RED, seat, steering, bogie, roadwheel, sprocket, arc_pts,
                      nacelle, fuselage, canopy)

vehicles.OUT = os.path.join(vehicles.OUT, 'de')

# =========================================================================================
def blitz_front(m, x0=0.1, closed=True):
    """Opel Blitz: bonnet with the tall grille, separate curved mudguards, headlamps on them,
    and the cab (closed with windows, or armoured and angular for the Maultier)."""
    m.loft('main', [(x0 + 0.35, 0.5, 0.86, 0.3, 5), (x0 + 0.85, 0.5, 0.82, 0.27, 4)], seg=32, bevel=0.01)
    m.loft('main', [(x0 + 0.84, 0.44, 0.84, 0.26, 4), (x0 + 0.9, 0.46, 0.8, 0.24, 3)], seg=28)   # grille shell
    for k in range(9): m.box('dark', (x0 + 0.905, 0.64, -0.16 + k * 0.04), (0.012, 0.3, 0.012), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (x0 + 0.55, 0.27, s * 0.41), 0.3, 0.33, 0.2, -0.3, math.pi - 0.15)
        m.headlamp((x0 + 0.78, 0.62, s * 0.36), 0.055)
        m.box('main', (x0 + 0.05, 0.43, s * 0.48), (0.5, 0.025, 0.1), bevel=0.005)
    m.box('dark', (x0 + 0.95, 0.34, 0), (0.06, 0.08, 1.0), bevel=0.012)
    if closed:
        m.loft('main', [(x0 - 0.12, 0.46, 1.2, 0.48, 7), (x0 + 0.37, 0.46, 1.12, 0.46, 5)], seg=36, bevel=0.01)
        for z in (-0.2, 0.2): m.box(GLASS, (x0 + 0.375, 0.98, z), (0.012, 0.2, 0.36), bevel=0.0)
        for z in (-0.485, 0.485): m.box(GLASS, (x0 + 0.17, 0.98, z), (0.26, 0.18, 0.012), bevel=0.0)
    else:
        m.loft_poly('main', [(x0 - 0.15, [(0.45, -0.46), (1.1, -0.44), (1.18, -0.3), (1.18, 0.3), (1.1, 0.44), (0.45, 0.46)]),
                             (x0 + 0.38, [(0.45, -0.46), (1.02, -0.42), (1.1, -0.28), (1.1, 0.28), (1.02, 0.42), (0.45, 0.46)])], bevel=0.01)
        for z in (-0.18, 0.18): m.box('dark', (x0 + 0.385, 0.95, z), (0.012, 0.04, 0.26), bevel=0.0)   # vision slits

def jeep():
    """Kuebelwagen: slab-sided body with pressed ribs, the sloping front with the spare wheel,
    flat windscreen, four seats and an MG 34 on a pintle."""
    m = Model('jeep')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.28, z), (1.7, 0.06, 0.06), bevel=0.01)
    m.loft('main', [(-0.97, 0.36, 0.52, 0.36, 6), (-0.75, 0.3, 0.68, 0.42, 10), (0.32, 0.3, 0.68, 0.42, 10), (0.72, 0.32, 0.6, 0.4, 8), (0.98, 0.38, 0.46, 0.35, 6)], seg=40, bevel=0.01)
    m.box('dark', (-0.22, 0.683, 0), (1.0, 0.01, 0.76), bevel=0.0)
    for s in (1, -1):
        for y in (0.45, 0.55): m.box('main', (-0.2, y, s * 0.422), (1.4, 0.02, 0.01), bevel=0.0)   # pressed ribs
        for x in (0.55, -0.55): m.arc('main', (x, 0.23, s * 0.43), 0.27, 0.29, 0.14, 0.05, math.pi - 0.05)
        m.headlamp((0.78, 0.66, s * 0.3), 0.045)
        for x in (-0.1, -0.5): m.box('dark', (x, 0.5, s * 0.423), (0.012, 0.3, 0.01), bevel=0.0)   # door seams
    m.lathe('dark', [(0.12, -0.07), (0.2, -0.07), (0.22, 0.0), (0.2, 0.07), (0.12, 0.07)], (0.72, 0.64, 0), (0.45, 1, 0), seg=28, closed=True)   # spare wheel
    m.lathe('main', [(0.12, 0.03), (0.05, 0.07), (0.0, 0.08)], (0.72, 0.64, 0), (0.45, 1, 0), seg=18)
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.08)
    fr((0.34, 0.72, 0), (0.04, 0.04, 0.84)); fr((0.33, 1.0, 0), (0.035, 0.035, 0.84))
    for z in (-0.41, 0.41): fr((0.335, 0.86, z), (0.03, 0.28, 0.03))
    m.box(GLASS, (0.335, 0.86, 0), (0.012, 0.26, 0.78), bevel=0.0, pitch=-0.08)
    seat(m, -0.02, 0.72, -0.2); seat(m, -0.02, 0.72, 0.2); seat(m, -0.6, 0.72, 0, w=0.76)
    steering(m, 0.14, 0.88, -0.2)
    m.cyl('main', (-0.38, 0.68, 0.0), (-0.38, 1.0, 0.0), 0.028)
    m.mg((-0.36, 1.05, 0), 0.62)
    for x in (0.55, -0.55):
        for z in (-0.44, 0.44): m.tyre((x, 0.23, z), 0.23, 0.15)
    m.finish()

def ambulance():
    """Opel Blitz ambulance: the Blitz cab and a box body with red crosses."""
    m = Model('ambulance')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.8, 0.08, 0.08), bevel=0.01)
    blitz_front(m, 0.05)
    m.loft('main', [(-1.0, 0.5, 1.38, 0.5, 10), (-0.08, 0.5, 1.38, 0.5, 10)], seg=40, bevel=0.01)
    for z in (-0.506, 0.506):
        m.box(WHITE, (-0.52, 0.96, z), (0.46, 0.46, 0.012), bevel=0.0)
        m.box(RED, (-0.52, 0.96, z * 1.004), (0.3, 0.09, 0.012), bevel=0.0); m.box(RED, (-0.52, 0.96, z * 1.004), (0.09, 0.3, 0.012), bevel=0.0)
        m.box(GLASS, (-0.18, 1.18, z), (0.12, 0.1, 0.012), bevel=0.0)
        for x in (-0.85, -0.2): m.box('main', (x, 0.94, z), (0.02, 0.8, 0.012), bevel=0.0)
    m.box(WHITE, (-0.52, 1.382, 0), (0.46, 0.012, 0.46), bevel=0.0)
    m.box(RED, (-0.52, 1.39, 0), (0.3, 0.012, 0.09), bevel=0.0); m.box(RED, (-0.52, 1.39, 0), (0.09, 0.012, 0.3), bevel=0.0)
    m.box('dark', (-1.005, 0.94, 0), (0.012, 0.76, 0.01), bevel=0.0)
    m.box('main', (-1.04, 0.44, 0), (0.1, 0.03, 0.7), bevel=0.008)
    for x in (0.6, -0.6):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def engtruck():
    """Opel Blitz with an open bed full of the sappers' kit."""
    m = Model('engtruck')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    blitz_front(m, 0.12)
    m.box('main', (-0.5, 0.52, 0), (0.96, 0.08, 0.98), bevel=0.02)
    for z in (-0.47, 0.47): m.box('main', (-0.5, 0.68, z), (0.96, 0.26, 0.04), bevel=0.01)
    m.box('main', (-0.97, 0.68, 0), (0.04, 0.26, 0.98), bevel=0.01)
    for x in (-0.9, -0.62, -0.34, -0.08):
        for z in (-0.48, 0.48): m.box('dark', (x, 0.68, z * 1.01), (0.03, 0.28, 0.02), bevel=0.0)
    for x, z in [(-0.8, -0.26), (-0.8, 0.02), (-0.58, -0.26)]:
        m.box('dark', (x, 0.66, z), (0.22, 0.18, 0.22), bevel=0.015)
        m.box('#e8d44a', (x, 0.66, z - 0.111), (0.12, 0.05, 0.01), bevel=0.0)
    for k in range(3): m.box('dark', (-0.4, 0.6 + k * 0.05, 0.3), (0.8, 0.04, 0.05), bevel=0.004)
    m.cyl('main', (-0.3, 0.64, -0.2), (-0.3, 0.64, -0.02), 0.13, seg=20, bevel=0.01)
    for x in (0.67, -0.55):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def apc():
    """Sd.Kfz. 222 armoured car: faceted armoured hull on four wheels, an open ten-sided turret
    with the 20 mm cannon and an MG 34, and its hinged wire-mesh grenade screens."""
    m = Model('apc')
    sec = lambda x, k: (x, [(0.34, -0.32 * k), (0.62, -0.5 * k), (0.88, -0.36 * k), (0.88, 0.36 * k), (0.62, 0.5 * k), (0.34, 0.32 * k)])
    m.loft_poly('main', [(-1.0, [(0.4, -0.26), (0.6, -0.4), (0.74, -0.3), (0.74, 0.3), (0.6, 0.4), (0.4, 0.26)]),
                         sec(-0.72, 1.0), sec(0.55, 1.0),
                         (1.0, [(0.42, -0.28), (0.6, -0.42), (0.7, -0.32), (0.7, 0.32), (0.6, 0.42), (0.42, 0.28)])], bevel=0.012)
    for s in (1, -1):
        for x in (0.55, -0.55): m.arc('main', (x, 0.26, s * 0.5), 0.28, 0.3, 0.18, 0.1, math.pi - 0.1)
        m.headlamp((0.95, 0.66, s * 0.32), 0.04)
        m.box('main', (-0.1, 0.62, s * 0.5), (0.5, 0.12, 0.05), bevel=0.01)             # stowage
    for z in (-0.16, 0.16): m.box('dark', (0.82, 0.82, z), (0.02, 0.03, 0.16), bevel=0.0, pitch=0.6)
    m.lathe('main', [(0.34, 0.0), (0.36, 0.0), (0.32, 0.3), (0.29, 0.3), (0.32, 0.02)], (-0.1, 0.88, 0), (0, 1, 0), seg=10, closed=True)
    m.cyl('dark', (-0.1, 0.88, 0), (-0.1, 0.9, 0), 0.32, seg=20)
    m.box('main', (0.2, 1.02, 0), (0.12, 0.16, 0.3), bevel=0.02)
    m.lathe('main', [(0.04, 0.0), (0.035, 0.2), (0.025, 0.25), (0.025, 0.72), (0.035, 0.75), (0.0, 0.75)], (0.24, 1.04, 0.06), (1, 0, 0), seg=14)
    m.cyl('dark', (0.24, 1.04, -0.08), (0.52, 1.04, -0.08), 0.014, seg=8)
    for s in (1, -1):                                                              # grenade screens, folded open
        m.box('dark', (-0.1, 1.28, s * 0.3), (0.62, 0.012, 0.3), bevel=0.0, roll=s * 0.9)
        for k in range(5): m.box('dark', (-0.36 + k * 0.13, 1.28, s * 0.3), (0.012, 0.018, 0.3), bevel=0.0, roll=s * 0.9)
    m.cyl('dark', (-0.8, 0.86, -0.3), (-0.8, 1.6, -0.3), 0.006, seg=6)
    for x in (0.55, -0.55):
        for z in (-0.5, 0.5): m.tyre((x, 0.26, z), 0.26, 0.17)
    m.finish()

def amphib():
    """Schwimmwagen: a little bathtub hull on four wheels, windscreen, paddles, the swing-down
    propeller at the stern and an MG 34."""
    m = Model('amphib')
    m.loft('main', [(-1.02, 0.5, 0.78, 0.3, 3), (-0.85, 0.32, 0.84, 0.44, 4), (0.4, 0.3, 0.84, 0.46, 5), (0.8, 0.36, 0.8, 0.38, 4),
                    (1.02, 0.55, 0.78, 0.16, 3), (1.08, 0.72, 0.78, 0.04, 2)], seg=36, bevel=0.01)
    m.box('dark', (-0.25, 0.842, 0), (0.95, 0.01, 0.8), bevel=0.0)
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.12)
    fr((0.36, 1.12, 0), (0.035, 0.035, 0.8))
    for z in (-0.39, 0.39): fr((0.37, 0.98, z), (0.03, 0.28, 0.03))
    m.box(GLASS, (0.37, 0.98, 0), (0.012, 0.26, 0.74), bevel=0.0, pitch=-0.12)
    seat(m, 0.1, 0.86, -0.2); seat(m, 0.1, 0.86, 0.2); seat(m, -0.5, 0.86, 0, w=0.7)
    steering(m, 0.28, 1.0, -0.2)
    for s in (1, -1):
        m.headlamp((0.82, 0.8, s * 0.28), 0.04)
        m.box('dark', (-0.2, 0.86, s * 0.47), (0.7, 0.02, 0.05), bevel=0.004)        # paddle on the side
        m.box('dark', (0.17, 0.86, s * 0.47), (0.14, 0.02, 0.08), bevel=0.004)
    m.cyl('dark', (-1.0, 0.72, 0), (-1.15, 0.45, 0), 0.03, seg=10)                    # propeller swing arm
    for a in (0.3, 2.4, 4.5): m.box('dark', (-1.17, 0.42 + math.sin(a) * 0.06, math.cos(a) * 0.06), (0.03, 0.1, 0.05), bevel=0.004, roll=a)
    m.cyl('main', (-0.3, 0.84, 0), (-0.3, 1.1, 0), 0.025)
    m.mg((-0.28, 1.15, 0), 0.56)
    for x in (0.55, -0.55):
        for z in (-0.46, 0.46): m.tyre((x, 0.21, z), 0.21, 0.15)
    m.finish()

def tank_light():
    """Panzer II: box hull and fenders, five big road wheels on leaf springs, return rollers,
    front sprocket, the turret offset to the left with its 20 mm gun, cupola and stowage."""
    m = Model('tank_light')
    for s in (1, -1):
        z = s * 0.5
        for k in range(5):
            roadwheel(m, (-0.62 + k * 0.31, 0.15, z), 0.14, 0.11, dual=False)
            m.box('main', (-0.62 + k * 0.31 + 0.1, 0.26, z - s * 0.1), (0.2, 0.04, 0.04), pitch=0.3, bevel=0.005)
        for k in range(4): m.lathe('main', [(0.0, -0.04), (0.045, -0.04), (0.045, 0.04), (0.0, 0.04)], (-0.5 + k * 0.33, 0.44, z), (0, 0, 1), seg=12)
        sprocket(m, (0.8, 0.36, z), 0.13, 0.12, 11)
        m.lathe('main', [(0.0, -0.05), (0.11, -0.05), (0.12, 0.0), (0.11, 0.05), (0.0, 0.05)], (-0.84, 0.34, z), (0, 0, 1), seg=20)
        path = [(-0.7, 0.03), (0.55, 0.03)] + arc_pts(0.8, 0.36, 0.16, -1.9, 1.5, 8) + [(0.3, 0.5), (-0.5, 0.5)] + arc_pts(-0.84, 0.34, 0.155, 1.4, 4.2, 7)
        m.track_loop(path, z, 0.22)
        m.box('main', (0.0, 0.56, z), (1.9, 0.022, 0.26), bevel=0.006)                  # fender
    m.loft('main', [(-0.92, 0.2, 0.56, 0.36, 10), (0.9, 0.2, 0.56, 0.36, 10)], bevel=0.01)
    m.loft_poly('main', [(-0.95, [(0.55, -0.55), (0.82, -0.55), (0.82, 0.55), (0.55, 0.55)]), (0.62, [(0.55, -0.55), (0.84, -0.55), (0.84, 0.55), (0.55, 0.55)]),
                         (0.75, [(0.55, -0.4), (0.84, -0.4), (0.84, 0.4), (0.55, 0.4)]), (0.95, [(0.4, -0.38), (0.66, -0.38), (0.66, 0.38), (0.4, 0.38)])], bevel=0.012)
    m.box('main', (0.72, 0.84, -0.2), (0.12, 0.1, 0.26), bevel=0.01)                    # driver's visor
    m.box('dark', (0.785, 0.84, -0.2), (0.012, 0.02, 0.16), bevel=0.0)
    for k in range(5): m.box('dark', (-0.75 + k * 0.05, 0.845, 0), (0.02, 0.01, 0.7), bevel=0.0)
    m.headlamp((0.9, 0.68, 0.3), 0.035)
    m.box('main', (-0.3, 0.86, 0.48), (0.5, 0.03, 0.03), bevel=0.004)
    m.loft('main', [(-0.34, 0.84, 1.08, 0.3, 6, 0.08), (-0.24, 0.84, 1.12, 0.34, 7, 0.08), (0.18, 0.84, 1.12, 0.34, 7, 0.08), (0.26, 0.84, 1.08, 0.3, 6, 0.08)], seg=32, bevel=0.01)
    m.box('main', (0.3, 0.98, 0.08), (0.08, 0.14, 0.2), bevel=0.02)
    m.lathe('main', [(0.03, 0.0), (0.025, 0.2), (0.02, 0.24), (0.02, 0.62), (0.026, 0.64), (0.0, 0.64)], (0.34, 0.99, 0.02), (1, 0, 0), seg=12)
    m.cyl('dark', (0.33, 0.99, 0.15), (0.5, 0.99, 0.15), 0.012, seg=8)
    m.lathe('main', [(0.13, 0.0), (0.13, 0.08), (0.1, 0.1), (0.0, 0.11)], (-0.1, 1.12, 0.12), (0, 1, 0), seg=20)   # cupola
    m.box('main', (-0.42, 1.0, 0.08), (0.12, 0.14, 0.5), bevel=0.02)                     # stowage bin
    m.cyl('dark', (-0.6, 0.86, -0.35), (-0.6, 1.5, -0.35), 0.006, seg=6)
    m.finish()

def tank():
    """Panzer IV Ausf. H: eight small road wheels in four bogies, return rollers, side skirts
    (Schuerzen) on the hull and round the turret, and the long 75 mm gun with its muzzle brake."""
    m = Model('tank')
    for s in (1, -1):
        z = s * 0.62
        for k in range(4):
            bx = -0.86 + k * 0.5
            for d in (-0.12, 0.12): roadwheel(m, (bx + d, 0.13, z), 0.11, 0.08)
            m.box('main', (bx, 0.24, z - s * 0.08), (0.34, 0.08, 0.06), bevel=0.01)
        for k in range(4): m.lathe('main', [(0.0, -0.05), (0.045, -0.05), (0.045, 0.05), (0.0, 0.05)], (-0.75 + k * 0.5, 0.5, z), (0, 0, 1), seg=12)
        sprocket(m, (1.12, 0.44, z), 0.16, 0.14, 13)
        m.lathe('main', [(0.0, -0.06), (0.13, -0.06), (0.14, 0.0), (0.13, 0.06), (0.0, 0.06)], (-1.18, 0.4, z), (0, 0, 1), seg=22)
        path = [(-1.0, 0.03), (0.9, 0.03)] + arc_pts(1.12, 0.44, 0.19, -1.8, 1.55, 8) + [(0.6, 0.57), (-0.6, 0.57)] + arc_pts(-1.18, 0.4, 0.17, 1.4, 4.4, 7)
        m.track_loop(path, z, 0.3)
        m.box('main', (0.0, 0.62, z), (2.5, 0.022, 0.34), bevel=0.006)                   # fender
        for k in range(5):                                                              # skirt plates on their rail
            m.box('main', (-1.0 + k * 0.45, 0.46, s * 0.84), (0.43, 0.36, 0.02), bevel=0.006)
        m.box('main', (0.0, 0.66, s * 0.8), (2.3, 0.02, 0.05), bevel=0.004)
    m.loft('main', [(-1.25, 0.2, 0.62, 0.45, 10), (1.05, 0.2, 0.62, 0.45, 10)], bevel=0.01)
    m.loft_poly('main', [(-1.25, [(0.6, -0.62), (0.92, -0.62), (0.92, 0.62), (0.6, 0.62)]), (0.8, [(0.6, -0.62), (0.94, -0.62), (0.94, 0.62), (0.6, 0.62)]),
                         (0.85, [(0.58, -0.6), (0.94, -0.6), (0.94, 0.6), (0.58, 0.6)]), (1.25, [(0.44, -0.5), (0.66, -0.5), (0.66, 0.5), (0.44, 0.5)])], bevel=0.012)
    m.box('main', (0.82, 0.86, -0.25), (0.08, 0.12, 0.28), bevel=0.01)                   # driver's visor
    m.lathe('main', [(0.0, -0.03), (0.06, -0.02), (0.07, 0.03), (0.0, 0.06)], (0.85, 0.84, 0.25), (1, 0, 0), seg=16)
    m.cyl('dark', (0.88, 0.84, 0.25), (1.02, 0.84, 0.25), 0.012, seg=8)
    for k in range(8): m.box('dark', (-1.05 + k * 0.05, 0.945, 0), (0.02, 0.012, 0.9), bevel=0.0)
    m.cyl('dark', (-1.3, 0.72, -0.3), (-1.38, 0.72, -0.3), 0.05, seg=12)
    for z in (-0.3, 0.3): m.cyl('main', (-1.2, 0.98, z), (-0.9, 0.98, z), 0.04, seg=10)   # spare wheels / jerrycans rack
    m.headlamp((1.0, 0.98, -0.45), 0.04)
    m.loft('main', [(-0.78, 0.92, 1.22, 0.44, 8), (-0.7, 0.92, 1.28, 0.5, 8), (0.2, 0.92, 1.28, 0.44, 8), (0.34, 0.92, 1.2, 0.36, 6)], seg=36, bevel=0.01)
    m.box('main', (0.36, 1.06, 0), (0.1, 0.2, 0.3), bevel=0.02)
    m.lathe('main', [(0.05, 0.0), (0.045, 0.25), (0.036, 0.3), (0.036, 1.55), (0.06, 1.57), (0.06, 1.63), (0.045, 1.64), (0.045, 1.67), (0.06, 1.68), (0.06, 1.74), (0.0, 1.74)], (0.38, 1.08, 0), (1, 0, 0), seg=16)
    m.lathe('main', [(0.14, 0.0), (0.14, 0.1), (0.1, 0.12), (0.0, 0.13)], (-0.55, 1.28, 0.0), (0, 1, 0), seg=22)   # cupola at the rear
    for s in (1, -1):                                                                  # turret skirts
        m.box('main', (-0.25, 1.1, s * 0.58), (0.9, 0.3, 0.02), bevel=0.006)
        m.box('main', (-0.25, 1.1, s * 0.52), (0.04, 0.03, 0.08), bevel=0.0)
    m.loft('main', [(-0.95, 0.96, 1.24, 0.5, 8), (-0.85, 0.96, 1.24, 0.56, 8)], seg=28)
    m.cyl('dark', (-0.9, 1.25, -0.35), (-0.9, 2.0, -0.35), 0.006, seg=6)
    m.finish()

def tank_heavy():
    """Tiger I: the big box hull overhanging the tracks, interleaved road wheels, the horseshoe
    turret with its mantlet and the 88 mm gun, cupola, stowage bin and smoke dischargers."""
    m = Model('tank_heavy')
    for s in (1, -1):
        z = s * 0.8
        for k in range(8):
            roadwheel(m, (-1.05 + k * 0.3, 0.2, z * (1.0 if k % 2 else 0.92)), 0.2, 0.07, dual=False)
        sprocket(m, (1.3, 0.48, z), 0.2, 0.2, 15)
        m.lathe('main', [(0.0, -0.08), (0.17, -0.08), (0.18, 0.0), (0.17, 0.08), (0.0, 0.08)], (-1.32, 0.44, z), (0, 0, 1), seg=24)
        path = [(-1.1, 0.03), (1.08, 0.03)] + arc_pts(1.3, 0.48, 0.23, -1.9, 1.6, 8) + [(0.8, 0.44), (0.0, 0.43), (-0.8, 0.44)] + arc_pts(-1.32, 0.44, 0.21, 1.5, 4.4, 8)
        m.track_loop(path, z, 0.38)
        m.cyl('dark', (-0.9, 0.85, s * 0.97), (0.6, 0.85, s * 0.97), 0.02, seg=8)         # tow cable
    m.loft('main', [(-1.3, 0.22, 0.62, 0.55, 10), (1.25, 0.22, 0.62, 0.55, 10)], bevel=0.01)
    m.loft_poly('main', [(-1.38, [(0.58, -0.96), (1.0, -0.96), (1.0, 0.96), (0.58, 0.96)]), (1.1, [(0.58, -0.96), (1.02, -0.96), (1.02, 0.96), (0.58, 0.96)]),
                         (1.16, [(0.58, -0.8), (1.02, -0.8), (1.02, 0.8), (0.58, 0.8)]), (1.4, [(0.46, -0.62), (0.7, -0.62), (0.7, 0.62), (0.46, 0.62)])], bevel=0.014)
    m.box('main', (1.14, 0.9, -0.35), (0.06, 0.12, 0.3), bevel=0.01)                   # driver's visor
    m.lathe('main', [(0.0, -0.03), (0.07, -0.02), (0.08, 0.03), (0.0, 0.06)], (1.15, 0.88, 0.35), (1, 0, 0), seg=16)
    m.cyl('dark', (1.18, 0.88, 0.35), (1.32, 0.88, 0.35), 0.014, seg=8)
    for s in (1, -1): m.headlamp((1.16, 1.06, s * 0.6), 0.045)
    for k in range(12): m.box('dark', (-1.25 + k * 0.05, 1.025, 0), (0.02, 0.012, 1.1), bevel=0.0)
    for z in (-0.4, 0.4): m.cyl('main', (-1.42, 0.9, z), (-1.42, 1.1, z), 0.09, seg=14)   # air filters
    m.box('main', (-0.7, 1.05, 0.85), (0.9, 0.04, 0.05), bevel=0.005)
    m.loft('main', [(-1.05, 1.02, 1.36, 0.5, 3), (-0.95, 1.0, 1.44, 0.66, 3.4), (0.3, 1.0, 1.44, 0.68, 3.6), (0.5, 1.02, 1.4, 0.62, 3.6)], seg=44)
    m.loft('main', [(0.46, 1.04, 1.42, 0.42, 6), (0.62, 1.06, 1.4, 0.4, 6)], seg=32, bevel=0.01)   # mantlet
    m.lathe('main', [(0.075, 0.0), (0.065, 0.3), (0.052, 0.35), (0.052, 1.9), (0.08, 1.92), (0.08, 1.99), (0.06, 2.0), (0.06, 2.04), (0.08, 2.05), (0.08, 2.13), (0.0, 2.13)], (0.62, 1.22, -0.02), (1, 0, 0), seg=18)
    m.lathe('main', [(0.17, 0.0), (0.17, 0.12), (0.12, 0.14), (0.0, 0.15)], (-0.5, 1.44, 0.34), (0, 1, 0), seg=24)   # cupola
    m.cyl('main', (-0.3, 1.45, -0.3), (-0.3, 1.47, -0.3), 0.13, seg=20)
    m.box('main', (-1.12, 1.2, 0), (0.18, 0.24, 0.9), bevel=0.04)                        # stowage bin
    for s in (1, -1):
        for k in range(3): m.cyl('dark', (0.25, 1.3, s * (0.62 + k * 0.03)), (0.36, 1.36, s * (0.64 + k * 0.03)), 0.022, seg=8)   # smoke dischargers
    m.cyl('dark', (-0.8, 1.44, -0.45), (-0.8, 2.2, -0.45), 0.007, seg=6)
    m.finish()

def rockets():
    """Panzerwerfer 42 on the Maultier: an armoured Opel front, a half-track unit, and the
    ten-barrel launcher on its turntable."""
    m = Model('rockets')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.34, z), (2.5, 0.1, 0.08), bevel=0.01)
    blitz_front(m, 0.42, closed=False)
    m.loft_poly('main', [(-1.25, [(0.45, -0.5), (1.05, -0.46), (1.12, -0.3), (1.12, 0.3), (1.05, 0.46), (0.45, 0.5)]),
                         (0.28, [(0.45, -0.5), (1.05, -0.46), (1.12, -0.3), (1.12, 0.3), (1.05, 0.46), (0.45, 0.5)])], bevel=0.012)
    for s in (1, -1):                                                                   # the half-track unit
        z = s * 0.5
        for k in range(4): roadwheel(m, (-1.0 + k * 0.24, 0.13, z), 0.11, 0.07, dual=False)
        sprocket(m, (-0.18, 0.28, z), 0.14, 0.12, 10)
        path = [(-1.1, 0.03), (-0.3, 0.03)] + arc_pts(-0.18, 0.28, 0.17, -1.8, 1.6, 6) + [(-0.6, 0.4), (-1.05, 0.36)] + arc_pts(-1.15, 0.2, 0.17, 1.5, 4.4, 6)
        m.track_loop(path, z, 0.2)
    m.tyre((0.97, 0.28, -0.47), 0.28, 0.18); m.tyre((0.97, 0.28, 0.47), 0.28, 0.18)
    m.cyl('main', (-0.5, 1.12, 0), (-0.5, 1.2, 0), 0.34, seg=28)                          # turntable
    tilt = 0.45; ct, st = math.cos(tilt), math.sin(tilt)
    for r in range(2):
        for c in range(5):
            z = -0.3 + c * 0.15; y = 1.34 + r * 0.16
            m.lathe('main', [(0.07, 0.0), (0.075, 0.02), (0.075, 1.0), (0.08, 1.02), (0.0, 1.02)], (-0.95, y, z), (ct, st, 0), seg=14)
            m.cyl('dark', (-0.95, y, z), (-0.94, y + 0.005, z), 0.06, seg=12)
    m.box('main', (-0.5, 1.28, 0), (0.5, 0.12, 0.8), bevel=0.02, pitch=tilt)
    m.finish()

def heli():
    """Flettner Fl 282 Kolibri: a small open-cockpit fuselage, a tubular tail with fin and
    tailplane, tricycle wheels, and two intermeshing rotors on outward-leaning masts (the two
    rotors are the same part, drawn at both hubs). Armed for the game with MG pods."""
    m = Model('heli')
    m.loft('main', [(-0.45, -0.22, 0.28, 0.25, 2.4), (0.0, -0.35, 0.34, 0.34, 2.6), (0.55, -0.32, 0.25, 0.32, 2.4), (0.95, -0.15, 0.0, 0.15, 2.2), (1.05, -0.05, -0.05, 0.03, 2)], seg=36)
    m.box('dark', (0.55, 0.26, 0), (0.4, 0.02, 0.44), bevel=0.0)                          # open cockpit
    m.box(GLASS, (0.78, 0.36, 0), (0.02, 0.16, 0.4), bevel=0.0, pitch=-0.5)               # little windscreen
    m.loft('main', [(-0.45, -0.1, 0.25, 0.2, 2.2), (-1.8, 0.1, 0.3, 0.05, 2.0)], seg=24)    # tail
    m.wing('main', [(0.4, -1.55, 0.25, 0.25), (0.0, -1.5, 0.3, 0.25), (-0.4, -1.55, 0.25, 0.25)], thick=0.1)
    m.wing('main', [(0.2, -1.55, 0.32, 0), (0.55, -1.65, 0.24, 0), (0.7, -1.72, 0.14, 0)], thick=0.1, vertical=True)
    for z in (-0.12, 0.12): m.cyl('main', (0.25, 0.3, z * 0.5), (0.25, 0.7, z), 0.045, seg=10)   # the two masts
    m.loft('main', [(-0.05, 0.25, 0.46, 0.2, 3), (0.45, 0.25, 0.42, 0.2, 2.6)], seg=24)
    for z in (-0.4, 0.4):
        m.cyl('main', (0.1, -0.3, z * 0.6), (0.15, -0.55, z), 0.02, seg=8)
        m.lathe('dark', [(0.04, -0.03), (0.08, -0.03), (0.09, 0.0), (0.08, 0.03), (0.04, 0.03)], (0.15, -0.58, z), (0, 0, 1), seg=18, closed=True)
        m.cyl('dark', (-0.1, -0.1, z * 1.05), (0.45, -0.1, z * 1.05), 0.045, seg=14)       # MG pods
        m.box('main', (0.1, -0.05, z * 0.9), (0.2, 0.04, 0.18), bevel=0.01)
    m.cyl('main', (0.85, -0.1, 0), (0.9, -0.55, 0), 0.02, seg=8)
    m.lathe('dark', [(0.03, -0.02), (0.06, -0.02), (0.06, 0.02), (0.03, 0.02)], (0.9, -0.58, 0), (0, 0, 1), seg=14, closed=True)
    m.cyl('rotor', (0, -0.04, 0), (0, 0.06, 0), 0.07, seg=18, bevel=0.01)
    for a in (0, math.pi):
        m.box('rotor', (math.cos(a) * 0.62, 0.02, math.sin(a) * 0.62), (1.1, 0.02, 0.1), bevel=0.008, yaw=-a, roll=0.06)
    m.finish()

def fighter():
    """Messerschmitt Bf 109 G: slim fuselage with the long nose and gun bulges, framed canopy,
    squared wing tips with radiators underneath, braced tailplane, three-blade prop."""
    m = Model('fighter')
    fuselage(m, [(0.95, -0.1, 0.1, 0.1, 2.3), (0.7, -0.14, 0.14, 0.12, 2.4), (0.3, -0.15, 0.15, 0.12, 2.5), (-0.1, -0.14, 0.14, 0.11, 2.5),
                 (-0.5, -0.1, 0.12, 0.075, 2.3), (-0.85, -0.03, 0.1, 0.03, 2.1), (-0.95, 0.0, 0.1, 0.015, 2.0)])
    for s in (1, -1): m.loft('main', [(0.62, 0.1, 0.14, 0.03, 2, s * 0.06), (0.42, 0.1, 0.17, 0.045, 2, s * 0.06), (0.25, 0.1, 0.14, 0.03, 2, s * 0.06)], seg=14)   # gun bulges
    canopy(m, [(0.25, 0.12, 0.14, 0.08, 3), (0.18, 0.12, 0.25, 0.08, 3.5), (-0.12, 0.12, 0.25, 0.075, 3.5), (-0.22, 0.12, 0.16, 0.06, 3)],
           frames=[(0.15, 0.12, 0.24, 0.078), (0.02, 0.12, 0.25, 0.078), (-0.1, 0.12, 0.25, 0.074)])
    m.wing('main', [(-1.0, 0.12, 0.16, -0.05), (-0.95, 0.16, 0.24, -0.06), (-0.5, 0.26, 0.36, -0.08), (0.0, 0.32, 0.48, -0.1),
                    (0.5, 0.26, 0.36, -0.08), (0.95, 0.16, 0.24, -0.06), (1.0, 0.12, 0.16, -0.05)], thick=0.12)
    for s in (1, -1):
        m.box('main', (0.02, -0.15, s * 0.35), (0.24, 0.05, 0.14), bevel=0.01)              # radiator bath
        for k in range(6): m.box('dark', (0.62 - k * 0.05, 0.02, s * 0.115), (0.03, 0.025, 0.02), bevel=0.003)
        m.cyl('main', (-0.7, -0.05, s * 0.05), (-0.62, 0.04, s * 0.26), 0.008, seg=5)       # tailplane strut
    m.box('dark', (0.45, 0.0, -0.13), (0.1, 0.05, 0.03), bevel=0.005)                       # supercharger intake
    m.wing('main', [(-0.35, -0.7, 0.1, 0.05), (-0.3, -0.66, 0.16, 0.05), (0.0, -0.63, 0.22, 0.05), (0.3, -0.66, 0.16, 0.05), (0.35, -0.7, 0.1, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -0.62, 0.3, 0), (0.22, -0.7, 0.22, 0), (0.3, -0.76, 0.12, 0)], thick=0.1, vertical=True)
    m.prop('dark', (0.96, 0, 0), 0.36, blades=3, spinner=0.09)
    m.finish()

def attacker():
    """Junkers Ju 87 Stuka: inverted gull wing, fixed spatted undercarriage (with the siren),
    big chin radiator, long canopy with the rear gunner, dive brakes and a bomb on its crutch."""
    m = Model('attacker')
    fuselage(m, [(0.95, -0.14, 0.12, 0.13, 2.6), (0.7, -0.2, 0.14, 0.14, 2.8), (0.3, -0.2, 0.15, 0.14, 2.8), (-0.2, -0.16, 0.14, 0.12, 2.6),
                 (-0.6, -0.1, 0.12, 0.07, 2.3), (-0.95, -0.02, 0.1, 0.02, 2.0)])
    m.loft('main', [(0.85, -0.3, -0.12, 0.1, 3), (0.6, -0.32, -0.14, 0.11, 3), (0.45, -0.22, -0.12, 0.08, 3)], seg=20)   # chin radiator
    canopy(m, [(0.4, 0.12, 0.14, 0.09, 3), (0.32, 0.12, 0.27, 0.095, 3.5), (-0.2, 0.12, 0.26, 0.09, 3.5), (-0.3, 0.12, 0.16, 0.07, 3)],
           frames=[(0.2, 0.12, 0.27, 0.093), (0.02, 0.12, 0.27, 0.093), (-0.15, 0.12, 0.26, 0.09)])
    m.cyl('dark', (-0.28, 0.22, 0), (-0.5, 0.26, 0), 0.012, seg=8)                            # rear gun
    # inverted gull wing: down from the root to the crank, then up to the tips
    m.wing('main', [(-1.25, 0.12, 0.2, 0.05), (-1.15, 0.18, 0.3, 0.03), (-0.45, 0.28, 0.46, -0.16), (0.0, 0.3, 0.5, -0.08),
                    (0.45, 0.28, 0.46, -0.16), (1.15, 0.18, 0.3, 0.03), (1.25, 0.12, 0.2, 0.05)], thick=0.13)
    for s in (1, -1):
        z = s * 0.45
        m.cyl('main', (0.12, -0.2, z), (0.14, -0.42, z), 0.03, seg=10)                          # gear leg
        m.loft('main', [(0.3, -0.5, -0.3, 0.035, 2.2, z), (0.14, -0.55, -0.24, 0.07, 2.4, z), (-0.05, -0.5, -0.3, 0.04, 2.2, z)], seg=18)   # spat
        m.cyl('dark', (0.2, -0.3, z + s * 0.05), (0.26, -0.3, z + s * 0.05), 0.025, seg=10)   # the siren
        m.box('dark', (0.05, -0.22, s * 0.85), (0.04, 0.08, 0.3), bevel=0.004)                 # dive brake
    m.lathe('dark', [(0.0, 0.0), (0.07, 0.08), (0.08, 0.35), (0.05, 0.45), (0.0, 0.48)], (-0.1, -0.33, 0), (1, 0, 0), seg=16)   # bomb
    for q in range(4):
        g = q * math.pi / 2 + 0.785
        m.box('dark', (-0.12, -0.33 + math.sin(g) * 0.07, math.cos(g) * 0.07), (0.1, 0.005, 0.07), roll=g, bevel=0.0)
    m.wing('main', [(-0.38, -0.75, 0.12, 0.06), (-0.33, -0.7, 0.2, 0.06), (0.0, -0.66, 0.26, 0.06), (0.33, -0.7, 0.2, 0.06), (0.38, -0.75, 0.12, 0.06)], thick=0.1)
    m.wing('main', [(0.05, -0.68, 0.32, 0), (0.25, -0.76, 0.24, 0), (0.34, -0.83, 0.12, 0)], thick=0.1, vertical=True)
    m.prop('dark', (0.97, 0, 0), 0.4, blades=3, spinner=0.08)
    m.finish()

def bomber():
    """Heinkel He 111 H: the fully glazed, asymmetric nose, two Jumo engines with annular
    radiators, elliptical wing and tail, ventral gondola and the dorsal gun position."""
    m = Model('bomber')
    fuselage(m, [(0.95, -0.24, 0.2, 0.2, 2.2), (0.5, -0.26, 0.24, 0.21, 2.4), (-0.5, -0.22, 0.22, 0.18, 2.4), (-1.1, -0.1, 0.16, 0.1, 2.3), (-1.45, -0.02, 0.1, 0.03, 2.0)], seg=40)
    m.loft(GLASS, [(1.3, -0.08, 0.06, 0.1, 2.0), (1.2, -0.18, 0.14, 0.17, 2.1), (0.95, -0.24, 0.2, 0.2, 2.2)], seg=32)
    for x in (1.05, 1.15, 1.25): m.lathe('main', [(1.0, -0.005), (1.0, 0.005)], (x, -0.03, 0), (1, 0, 0), seg=24, closed=True).scale = (1, 0.19 - (x - 1.05) * 0.4, 0.21 - (x - 1.05) * 0.5)
    m.cyl('dark', (1.3, -0.05, 0), (1.45, -0.05, 0), 0.012, seg=8)
    m.loft('main', [(0.4, -0.34, -0.2, 0.08, 3), (0.0, -0.36, -0.2, 0.09, 3), (-0.3, -0.28, -0.2, 0.06, 3)], seg=18)   # gondola
    m.lathe(GLASS, [(0.0, 0.1), (0.07, 0.08), (0.1, 0.0)], (-0.35, 0.2, 0), (0, 1, 0), seg=18)
    m.cyl('dark', (-0.35, 0.28, 0), (-0.6, 0.3, 0), 0.01, seg=6)
    m.wing('main', [(-1.9, 0.1, 0.22, 0.02), (-1.7, 0.22, 0.42, 0.0), (-0.8, 0.45, 0.8, -0.06), (0.0, 0.5, 0.9, -0.08),
                    (0.8, 0.45, 0.8, -0.06), (1.7, 0.22, 0.42, 0.0), (1.9, 0.1, 0.22, 0.02)], thick=0.14)
    for z in (-0.68, 0.68): nacelle(m, 0.82, -0.05, z, 0.16, 1.1, 0.42)
    m.wing('main', [(-0.75, -1.1, 0.22, 0.05), (-0.6, -1.05, 0.36, 0.05), (0.0, -1.0, 0.44, 0.05), (0.6, -1.05, 0.36, 0.05), (0.75, -1.1, 0.22, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -1.05, 0.46, 0), (0.3, -1.12, 0.4, 0), (0.48, -1.22, 0.26, 0), (0.54, -1.3, 0.12, 0)], thick=0.1, vertical=True)
    m.box('dark', (0.1, -0.235, 0), (0.6, 0.012, 0.2), bevel=0.0)
    m.finish()

def transport():
    """Junkers Ju 52 'Tante Ju': corrugated skin, three engines (one in the nose), fixed spatted
    undercarriage, square cabin windows and the double-wing flaps."""
    m = Model('transport')
    fuselage(m, [(1.3, -0.16, 0.14, 0.15, 2.4), (1.05, -0.28, 0.24, 0.24, 3.2), (0.5, -0.32, 0.3, 0.26, 3.6), (-0.7, -0.28, 0.28, 0.24, 3.4),
                 (-1.3, -0.08, 0.2, 0.12, 3.0), (-1.6, 0.04, 0.14, 0.03, 2.2)], seg=40)
    for k in range(8):                                                                    # corrugation
        for s in (1, -1):
            m.cyl('main', (0.5, -0.2 + k * 0.055, s * 0.262), (-0.7, -0.19 + k * 0.052, s * 0.242), 0.008, seg=5)
    m.lathe('main', [(0.1, 0.0), (0.17, 0.02), (0.18, 0.1), (0.17, 0.16)], (1.42, -0.02, 0), (-1, 0, 0), seg=28)   # nose engine
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (1.42, -0.02, 0), (-1, 0, 0), seg=20)
    m.prop('dark', (1.43, -0.02, 0), 0.42, blades=3, spinner=0.06)
    for z in (-0.12, 0.12): m.box(GLASS, (1.1, 0.2, z), (0.14, 0.08, 0.1), bevel=0.0, pitch=-0.5)
    for s in (1, -1):
        for k in range(6): m.box(GLASS, (0.65 - k * 0.22, 0.1, s * 0.27), (0.1, 0.09, 0.012), bevel=0.0)
    m.box('dark', (-0.7, 0.0, -0.265), (0.18, 0.34, 0.012), bevel=0.0)
    m.wing('main', [(-2.0, 0.15, 0.3, -0.06), (-1.2, 0.3, 0.6, -0.14), (-0.3, 0.5, 1.0, -0.22), (0.0, 0.52, 1.02, -0.24),
                    (0.3, 0.5, 1.0, -0.22), (1.2, 0.3, 0.6, -0.14), (2.0, 0.15, 0.3, -0.06)], thick=0.15)
    for s in (1, -1):
        m.box('main', (-0.55, -0.26, s * 1.0), (0.14, 0.02, 1.8), bevel=0.004)             # the Junkers double-wing flap
        for k in range(10): m.box('main', (0.0, -0.18, s * (0.35 + k * 0.16)), (0.9, 0.012, 0.012), bevel=0.0)   # wing corrugation
        nacelle(m, 0.88, -0.2, s * 0.8, 0.16, 0.8, 0.38)
        z = s * 0.55
        m.cyl('main', (0.3, -0.25, z), (0.3, -0.33, z), 0.03, seg=10)
        m.loft('main', [(0.48, -0.44, -0.28, 0.04, 2.2, z), (0.3, -0.5, -0.22, 0.08, 2.4, z), (0.1, -0.44, -0.28, 0.04, 2.2, z)], seg=18)
    m.wing('main', [(-0.85, -1.2, 0.24, 0.1), (-0.7, -1.15, 0.36, 0.1), (0.0, -1.1, 0.44, 0.1), (0.7, -1.15, 0.36, 0.1), (0.85, -1.2, 0.24, 0.1)], thick=0.1)
    m.wing('main', [(0.15, -1.12, 0.5, 0), (0.45, -1.22, 0.4, 0), (0.72, -1.34, 0.26, 0), (0.8, -1.4, 0.14, 0)], thick=0.1, vertical=True)
    m.finish()

def hq():
    """the headquarters: a concrete command bunker with a thick roof slab, a sunken entrance,
    firing slits, an armoured observation cupola, a radio mast and a flag."""
    m = Model('hq')
    m.loft('main', [(-1.35, 0.0, 1.15, 1.35, 14), (1.35, 0.0, 1.15, 1.35, 14)], bevel=0.02)
    m.box('main', (0, 1.28, 0), (2.95, 0.26, 2.95), bevel=0.06)
    m.box('main', (-1.55, 0.5, 0), (0.3, 1.0, 2.2), bevel=0.04, pitch=-0.35)             # earth-sheltered back
    for z in (-0.6, 0.0, 0.6): m.box('dark', (1.36, 0.72, z), (0.03, 0.08, 0.34), bevel=0.0)   # firing slits
    m.box('dark', (1.36, 0.36, 0.95), (0.03, 0.6, 0.34), bevel=0.0)                       # doorway
    for k in range(4): m.box('main', (1.5 + k * 0.1, 0.06 + (3 - k) * 0.06, 0.95), (0.1, 0.06 + (3 - k) * 0.12, 0.4), bevel=0.01)   # steps
    for z in (0.7, 1.2): m.box('main', (1.7, 0.3, z), (0.5, 0.6, 0.08), bevel=0.02)      # entrance walls
    m.lathe('main', [(0.34, 0.0), (0.34, 0.18), (0.3, 0.3), (0.18, 0.4), (0.0, 0.43)], (0.3, 1.41, -0.4), (0, 1, 0), seg=32)   # observation cupola
    for k in range(6):
        a = k / 6 * 2 * math.pi
        m.box('dark', (0.3 + math.cos(a) * 0.33, 1.62, -0.4 + math.sin(a) * 0.33), (0.1, 0.04, 0.02), bevel=0.0, yaw=-a)
    m.cyl('main', (-0.8, 1.4, 0.8), (-0.8, 3.4, 0.8), 0.025, seg=8)                         # radio mast
    for a in (0.4, 2.5, 4.6): m.cyl('dark', (-0.8, 3.2, 0.8), (-0.8 + math.cos(a) * 0.9, 1.42, 0.8 + math.sin(a) * 0.9), 0.004, seg=4)
    for k in range(4): m.cyl('dark', (-0.8, 3.0 - k * 0.3, 0.8), (-0.8, 3.0 - k * 0.3, 1.1), 0.006, seg=4)
    m.cyl('main', (0.9, 1.4, 0.9), (0.9, 3.0, 0.9), 0.02, seg=8)                            # flag pole
    m.fin('main', [(0.9, 2.98), (1.55, 2.95), (1.52, 2.55), (0.9, 2.6)], 0.9, 0.012)
    for s in (1, -1):                                                                     # sandbags beside the entrance
        for k in range(5): m.sphere('main', (1.55 + k * 0.001, 0.12 + (k % 2) * 0.13, 0.95 + s * (0.42 + (k // 2) * 0.12)), 0.1, scale=(1.6, 0.7, 1.0), seg=10)
    m.box('main', (-0.3, 1.43, 0.3), (0.6, 0.04, 0.5), bevel=0.01)                        # camouflage net frame
    m.finish()

MODELS = {'jeep': jeep, 'ambulance': ambulance, 'engtruck': engtruck, 'apc': apc, 'amphib': amphib, 'tank_light': tank_light, 'tank': tank,
          'tank_heavy': tank_heavy, 'rockets': rockets, 'heli': heli, 'fighter': fighter, 'attacker': attacker, 'bomber': bomber,
          'transport': transport, 'hq': hq}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
