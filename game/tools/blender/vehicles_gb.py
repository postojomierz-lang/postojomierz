# The British Army's vehicles, aircraft and headquarters, built with the tools in vehicles.py:
# Universal (Bren) Carrier, Austin K2 ambulance, Bedford truck, Daimler armoured car, Terrapin,
# Tetrarch, Cromwell, Churchill, a Bedford with the Land Mattress rocket launcher, the Cierva C.30
# autogyro, Spitfire, Typhoon, Lancaster, the Bristol Bombay transport and a sandbagged Nissen hut.
# Written to .cache/figures/vehicles/gb; tools/figures.mjs packs them into public/nation-gb.js.
#
#   python tools/blender/vehicles_gb.py [name ...]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehicles
from vehicles import (Model, clear, GLASS, LIGHT, WHITE, RED, seat, steering, bogie, roadwheel, sprocket, arc_pts,
                      nacelle, fuselage, canopy)

vehicles.OUT = os.path.join(vehicles.OUT, 'gb')

def bedford_front(m, x0=0.1):
    """Bedford: a bonnet with the tall slatted grille, curved mudguards and a boxy cab."""
    m.loft('main', [(x0 + 0.35, 0.5, 0.86, 0.3, 6), (x0 + 0.86, 0.5, 0.84, 0.28, 6)], seg=32, bevel=0.01)
    m.box('main', (x0 + 0.88, 0.66, 0), (0.04, 0.38, 0.54), bevel=0.02)
    for k in range(12): m.box('dark', (x0 + 0.9, 0.66, -0.22 + k * 0.04), (0.012, 0.32, 0.016), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (x0 + 0.55, 0.27, s * 0.41), 0.3, 0.33, 0.2, -0.2, math.pi - 0.15)
        m.headlamp((x0 + 0.8, 0.62, s * 0.36), 0.05)
        m.box('main', (x0 + 0.05, 0.43, s * 0.48), (0.5, 0.025, 0.1), bevel=0.005)
    m.box('dark', (x0 + 0.96, 0.34, 0), (0.06, 0.08, 1.0), bevel=0.012)
    m.loft('main', [(x0 - 0.12, 0.46, 1.2, 0.48, 10), (x0 + 0.36, 0.46, 1.14, 0.46, 10)], seg=36, bevel=0.01)
    for z in (-0.2, 0.2): m.box(GLASS, (x0 + 0.365, 0.98, z), (0.012, 0.2, 0.36), bevel=0.0)
    for z in (-0.485, 0.485): m.box(GLASS, (x0 + 0.15, 0.98, z), (0.24, 0.18, 0.012), bevel=0.0)

def jeep():
    """Universal Carrier: a low open armoured box on little tracks, the raised driver's and
    gunner's plates at the front with a Bren gun, the engine cover in the middle."""
    m = Model('jeep')
    for s in (1, -1):
        z = s * 0.52
        for x in (-0.5, -0.12): roadwheel(m, (x, 0.13, z), 0.12, 0.08, dual=False)
        roadwheel(m, (0.32, 0.13, z), 0.12, 0.08, dual=False)
        sprocket(m, (-0.8, 0.28, z), 0.13, 0.12, 10)
        m.lathe('main', [(0.0, -0.04), (0.11, -0.04), (0.12, 0.0), (0.11, 0.04), (0.0, 0.04)], (0.8, 0.26, z), (0, 0, 1), seg=18)
        path = [(-0.6, 0.03), (0.55, 0.03)] + arc_pts(0.8, 0.26, 0.15, -1.9, 1.5, 7) + [(0.3, 0.42), (-0.5, 0.43)] + arc_pts(-0.8, 0.28, 0.16, 1.5, 4.4, 7)
        m.track_loop(path, z, 0.18)
        m.box('main', (0.0, 0.46, z), (1.8, 0.02, 0.22), bevel=0.005)
    m.loft_poly('main', [(-0.95, [(0.18, -0.42), (0.6, -0.42), (0.6, 0.42), (0.18, 0.42)]), (0.62, [(0.18, -0.42), (0.62, -0.42), (0.62, 0.42), (0.18, 0.42)]),
                         (0.95, [(0.2, -0.4), (0.44, -0.4), (0.44, 0.4), (0.2, 0.4)])], bevel=0.012)
    m.box('dark', (-0.2, 0.605, 0), (1.3, 0.01, 0.78), bevel=0.0)
    m.box('main', (-0.25, 0.68, 0), (0.7, 0.14, 0.26), bevel=0.02)                   # engine cover
    for z in (-0.22, 0.22):
        m.box('main', (0.62, 0.72, z), (0.08, 0.26, 0.34), bevel=0.01, pitch=-0.3)   # the raised front plates
        m.box('dark', (0.66, 0.78, z), (0.02, 0.03, 0.18), bevel=0.0, pitch=-0.3)
    m.mg((0.58, 0.82, -0.22), 0.5)
    m.headlamp((0.9, 0.45, 0.3), 0.035)
    m.box('main', (-0.7, 0.66, 0.3), (0.3, 0.1, 0.2), bevel=0.01)                     # stowage
    m.finish()

def ambulance():
    """Austin K2 'Katy': a short snub bonnet and a wide, round-cornered box body with red crosses."""
    m = Model('ambulance')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.8, 0.08, 0.08), bevel=0.01)
    m.loft('main', [(0.45, 0.48, 0.84, 0.3, 4), (0.95, 0.48, 0.78, 0.27, 3)], seg=32, bevel=0.01)
    m.box('main', (0.96, 0.62, 0), (0.03, 0.26, 0.4), bevel=0.01)
    for k in range(8): m.box('dark', (0.975, 0.62, -0.16 + k * 0.045), (0.012, 0.22, 0.016), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (0.66, 0.27, s * 0.41), 0.3, 0.33, 0.2, -0.2, math.pi - 0.15)
        m.headlamp((0.88, 0.66, s * 0.36), 0.05)
    m.box('dark', (1.02, 0.34, 0), (0.06, 0.08, 1.0), bevel=0.012)
    m.loft('main', [(-1.0, 0.5, 1.4, 0.52, 5), (0.46, 0.5, 1.4, 0.52, 5)], seg=44, bevel=0.01)
    for z in (-0.2, 0.2): m.box(GLASS, (0.47, 1.08, z), (0.012, 0.2, 0.34), bevel=0.0, pitch=0.12)
    for z in (-0.515, 0.515):
        m.box(WHITE, (-0.45, 0.98, z), (0.46, 0.46, 0.012), bevel=0.0)
        m.box(RED, (-0.45, 0.98, z * 1.004), (0.3, 0.09, 0.012), bevel=0.0); m.box(RED, (-0.45, 0.98, z * 1.004), (0.09, 0.3, 0.012), bevel=0.0)
        m.box(GLASS, (0.25, 1.1, z), (0.2, 0.16, 0.012), bevel=0.0)
    m.box(WHITE, (-0.45, 1.402, 0), (0.46, 0.012, 0.46), bevel=0.0)
    m.box(RED, (-0.45, 1.41, 0), (0.3, 0.012, 0.09), bevel=0.0); m.box(RED, (-0.45, 1.41, 0), (0.09, 0.012, 0.3), bevel=0.0)
    for x in (0.66, -0.58):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def engtruck():
    m = Model('engtruck')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    bedford_front(m, 0.12)
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
    """Daimler armoured car: a low hull sloped at both ends on four big wheels, and the small
    turret with the 2-pounder and its smoke dischargers."""
    m = Model('apc')
    m.loft_poly('main', [(-1.0, [(0.34, -0.3), (0.62, -0.4), (0.62, 0.4), (0.34, 0.3)]), (-0.8, [(0.3, -0.42), (0.78, -0.46), (0.78, 0.46), (0.3, 0.42)]),
                         (0.55, [(0.3, -0.42), (0.78, -0.46), (0.78, 0.46), (0.3, 0.42)]), (0.98, [(0.34, -0.3), (0.56, -0.4), (0.56, 0.4), (0.34, 0.3)])], bevel=0.012)
    for s in (1, -1):
        for x in (0.55, -0.55): m.arc('main', (x, 0.27, s * 0.52), 0.29, 0.31, 0.18, 0.1, math.pi - 0.1)
        m.box('main', (0.0, 0.58, s * 0.52), (0.5, 0.12, 0.08), bevel=0.01)             # stowage bin between the wheels
        m.headlamp((0.92, 0.6, s * 0.32), 0.04, guard=True)
    m.box('dark', (0.7, 0.72, -0.18), (0.02, 0.03, 0.16), bevel=0.0, pitch=0.5)
    m.loft_poly('main', [(-0.4, [(0.78, -0.32), (1.02, -0.26), (1.02, 0.26), (0.78, 0.32)]), (0.2, [(0.78, -0.32), (1.04, -0.26), (1.04, 0.26), (0.78, 0.32)]),
                         (0.3, [(0.78, -0.24), (1.0, -0.2), (1.0, 0.2), (0.78, 0.24)])], bevel=0.01)
    m.lathe('main', [(0.035, 0.0), (0.03, 0.2), (0.024, 0.24), (0.024, 0.68), (0.03, 0.7), (0.0, 0.7)], (0.3, 0.92, 0), (1, 0, 0), seg=14)
    for s in (1, -1):
        for k in range(2): m.cyl('dark', (0.15, 0.95 + k * 0.05, s * 0.3), (0.25, 1.0 + k * 0.05, s * 0.32), 0.02, seg=8)
    m.cyl('dark', (-0.6, 0.78, 0.3), (-0.6, 1.5, 0.3), 0.006, seg=6)
    for x in (0.55, -0.55):
        for z in (-0.52, 0.52): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def amphib():
    """Terrapin: a slab-sided amphibious hull on eight wheels, a well at each end and the driver's
    cab in the middle."""
    m = Model('amphib')
    m.loft('main', [(-1.05, 0.4, 0.84, 0.44, 8), (-0.9, 0.3, 0.88, 0.5, 10), (0.7, 0.3, 0.88, 0.5, 10), (1.02, 0.42, 0.86, 0.44, 7), (1.1, 0.6, 0.85, 0.3, 5)], seg=36, bevel=0.012)
    for x in (-0.55, 0.45): m.box('dark', (x, 0.885, 0), (0.6, 0.01, 0.84), bevel=0.0)       # the two wells
    m.box('main', (-0.05, 1.0, 0), (0.3, 0.26, 0.86), bevel=0.02)                          # cab
    m.box(GLASS, (0.105, 1.05, 0), (0.012, 0.1, 0.6), bevel=0.0)
    for s in (1, -1): m.torus(WHITE, (-0.3, 0.7, s * 0.515), (0, 0, 1), 0.1, 0.03, seg=18)
    m.cyl('dark', (-1.05, 0.4, 0), (-1.18, 0.4, 0), 0.025)
    for x in (0.72, 0.24, -0.24, -0.72):
        for z in (-0.5, 0.5): m.tyre((x, 0.2, z), 0.2, 0.14)
    m.cyl('main', (0.4, 0.88, 0), (0.4, 1.12, 0), 0.025)
    m.mg((0.42, 1.16, 0), 0.5)
    m.finish()

def tank_light():
    """Tetrarch: a small low hull with four big road wheels a side and no return rollers, and the
    turret with its 2-pounder."""
    m = Model('tank_light')
    for s in (1, -1):
        z = s * 0.52
        for k in range(4): roadwheel(m, (-0.66 + k * 0.44, 0.2, z), 0.19, 0.1, spokes=6, dual=False)
        path = [(-0.7, 0.03), (0.7, 0.03)] + arc_pts(0.66, 0.2, 0.22, -1.57, 1.57, 8) + [(0.3, 0.42), (-0.3, 0.42)] + arc_pts(-0.66, 0.2, 0.22, 1.57, 4.71, 8)
        m.track_loop(path, z, 0.22)
        m.box('main', (0.0, 0.46, z), (1.9, 0.02, 0.26), bevel=0.005)
    m.loft_poly('main', [(-0.95, [(0.2, -0.42), (0.7, -0.42), (0.7, 0.42), (0.2, 0.42)]), (0.6, [(0.2, -0.42), (0.74, -0.42), (0.74, 0.42), (0.2, 0.42)]),
                         (0.95, [(0.26, -0.38), (0.52, -0.38), (0.52, 0.38), (0.26, 0.38)])], bevel=0.012)
    m.box('main', (0.62, 0.74, 0), (0.16, 0.08, 0.3), bevel=0.01, pitch=0.4)
    m.loft_poly('main', [(-0.45, [(0.72, -0.32), (0.98, -0.26), (0.98, 0.26), (0.72, 0.32)]), (0.2, [(0.72, -0.34), (1.0, -0.28), (1.0, 0.28), (0.72, 0.34)]),
                         (0.32, [(0.72, -0.26), (0.96, -0.2), (0.96, 0.2), (0.72, 0.26)])], bevel=0.01)
    m.lathe('main', [(0.035, 0.0), (0.03, 0.2), (0.024, 0.24), (0.024, 0.7), (0.03, 0.72), (0.0, 0.72)], (0.32, 0.88, 0), (1, 0, 0), seg=14)
    m.cyl('main', (-0.15, 0.98, 0.1), (-0.15, 1.01, 0.1), 0.1, seg=18)
    m.finish()

def tank():
    """Cromwell: a box hull with five big road wheels, mudguards and sand shields over the top of
    the track, the box turret with its 75 mm gun and stowage bins, the rear drive sprocket."""
    m = Model('tank')
    for s in (1, -1):
        z = s * 0.66
        for k in range(5): roadwheel(m, (-0.92 + k * 0.45, 0.22, z), 0.21, 0.1, spokes=8)
        sprocket(m, (-1.22, 0.4, z), 0.18, 0.16, 12)
        m.lathe('main', [(0.0, -0.07), (0.16, -0.07), (0.17, 0.0), (0.16, 0.07), (0.0, 0.07)], (1.18, 0.38, z), (0, 0, 1), seg=22)
        path = [(-1.0, 0.03), (0.95, 0.03)] + arc_pts(1.18, 0.38, 0.2, -1.8, 1.6, 8) + [(0.7, 0.48), (-0.8, 0.48)] + arc_pts(-1.22, 0.4, 0.21, 1.6, 4.4, 8)
        m.track_loop(path, z, 0.32)
        m.box('main', (0.0, 0.58, s * 0.8), (2.4, 0.24, 0.02), bevel=0.006)               # sand shields
        m.box('main', (0.0, 0.7, z), (2.5, 0.022, 0.34), bevel=0.006)
    m.loft_poly('main', [(-1.28, [(0.22, -0.5), (0.9, -0.5), (0.9, 0.5), (0.22, 0.5)]), (1.02, [(0.22, -0.5), (0.94, -0.5), (0.94, 0.5), (0.22, 0.5)]),
                         (1.3, [(0.3, -0.48), (0.72, -0.48), (0.72, 0.48), (0.3, 0.48)])], bevel=0.012)
    m.box('main', (1.0, 0.86, -0.25), (0.08, 0.12, 0.26), bevel=0.01)
    m.lathe('main', [(0.0, -0.03), (0.06, -0.02), (0.07, 0.03), (0.0, 0.06)], (1.02, 0.84, 0.25), (1, 0, 0), seg=16)
    m.cyl('dark', (1.05, 0.84, 0.25), (1.18, 0.84, 0.25), 0.014, seg=8)
    for k in range(8): m.box('dark', (-1.1 + k * 0.05, 0.945, 0), (0.02, 0.012, 0.8), bevel=0.0)
    for s in (1, -1): m.headlamp((1.22, 0.76, s * 0.4), 0.04)
    m.loft_poly('main', [(-0.7, [(0.94, -0.48), (1.22, -0.46), (1.22, 0.46), (0.94, 0.48)]), (0.3, [(0.94, -0.48), (1.24, -0.46), (1.24, 0.46), (0.94, 0.48)]),
                         (0.36, [(0.94, -0.4), (1.2, -0.38), (1.2, 0.38), (0.94, 0.4)])], bevel=0.014)
    for s in (1, -1): m.box('main', (-0.2, 1.06, s * 0.52), (0.6, 0.2, 0.06), bevel=0.015)   # stowage bins
    m.box('main', (0.38, 1.08, 0), (0.08, 0.18, 0.26), bevel=0.02)
    m.lathe('main', [(0.05, 0.0), (0.042, 0.3), (0.036, 0.35), (0.036, 1.2), (0.05, 1.22), (0.05, 1.3), (0.0, 1.3)], (0.4, 1.08, 0), (1, 0, 0), seg=16)
    m.lathe('main', [(0.14, 0.0), (0.14, 0.08), (0.1, 0.1), (0.0, 0.11)], (-0.4, 1.23, 0.22), (0, 1, 0), seg=20)
    m.cyl('dark', (-0.5, 1.22, -0.3), (-0.5, 1.9, -0.3), 0.006, seg=6)
    m.finish()

def tank_heavy():
    """Churchill: the long box hull with the track running right round each side over the top,
    panniers with escape doors, eleven little bogie wheels a side, air intakes and the square
    turret with its 75 mm gun."""
    m = Model('tank_heavy')
    for s in (1, -1):
        z = s * 0.82
        for k in range(11): roadwheel(m, (-1.1 + k * 0.22, 0.1, z), 0.09, 0.07, spokes=4, dual=False)
        path = [(-1.2, 0.03), (1.2, 0.03)] + arc_pts(1.32, 0.55, 0.26, -1.4, 1.57, 8) + [(0.9, 0.95), (-0.9, 0.95)] + arc_pts(-1.34, 0.55, 0.26, 1.57, 4.6, 8)
        m.track_loop(path, z, 0.34)
        m.loft_poly('main', [(-1.2, [(0.2, s * 0.64), (0.9, s * 0.64), (0.9, s * 0.98), (0.2, s * 0.98)]), (1.2, [(0.2, s * 0.64), (0.9, s * 0.64), (0.9, s * 0.98), (0.2, s * 0.98)])], bevel=0.01)   # track frame / pannier
        m.box('main', (0.1, 0.55, s * 0.99), (0.3, 0.26, 0.02), bevel=0.01)             # escape door
        for k in range(6): m.box('dark', (-0.8 + k * 0.05, 0.8, s * 0.99), (0.02, 0.14, 0.015), bevel=0.0)   # air intake louvres
    m.loft_poly('main', [(-1.34, [(0.25, -0.64), (1.08, -0.64), (1.08, 0.64), (0.25, 0.64)]), (1.2, [(0.25, -0.64), (1.1, -0.64), (1.1, 0.64), (0.25, 0.64)]),
                         (1.36, [(0.35, -0.6), (0.98, -0.6), (0.98, 0.6), (0.35, 0.6)])], bevel=0.014)
    m.box('main', (1.32, 0.86, -0.25), (0.08, 0.14, 0.26), bevel=0.01)
    m.lathe('main', [(0.0, -0.03), (0.06, -0.02), (0.07, 0.03), (0.0, 0.06)], (1.36, 0.8, 0.28), (1, 0, 0), seg=16)
    m.cyl('dark', (1.4, 0.8, 0.28), (1.52, 0.8, 0.28), 0.014, seg=8)
    for k in range(8): m.box('dark', (-1.15 + k * 0.05, 1.085, 0), (0.02, 0.012, 1.0), bevel=0.0)
    m.loft_poly('main', [(-0.62, [(1.08, -0.5), (1.44, -0.46), (1.44, 0.46), (1.08, 0.5)]), (0.34, [(1.08, -0.5), (1.46, -0.46), (1.46, 0.46), (1.08, 0.5)]),
                         (0.42, [(1.08, -0.42), (1.42, -0.38), (1.42, 0.38), (1.08, 0.42)])], bevel=0.02)
    m.box('main', (0.44, 1.26, 0), (0.08, 0.2, 0.3), bevel=0.02)
    m.lathe('main', [(0.05, 0.0), (0.042, 0.3), (0.036, 0.35), (0.036, 1.22), (0.05, 1.24), (0.05, 1.32), (0.0, 1.32)], (0.46, 1.26, 0), (1, 0, 0), seg=16)
    m.lathe('main', [(0.15, 0.0), (0.15, 0.08), (0.1, 0.11), (0.0, 0.12)], (-0.12, 1.45, 0.24), (0, 1, 0), seg=20)
    m.cyl('dark', (-0.4, 1.45, -0.3), (-0.4, 2.1, -0.3), 0.006, seg=6)
    m.finish()

def rockets():
    """a Bedford lorry with the 'Land Mattress' launcher: 32 tubes in a box frame on the bed."""
    m = Model('rockets')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.34, z), (2.5, 0.1, 0.08), bevel=0.01)
    bedford_front(m, 0.42)
    m.box('main', (-0.55, 0.5, 0), (1.6, 0.1, 0.96), bevel=0.02)
    tilt = 0.5; ct, st = math.cos(tilt), math.sin(tilt)
    for r in range(4):
        for c in range(8):
            z = -0.36 + c * 0.1; y = 0.95 + r * 0.1
            m.lathe('main', [(0.045, 0.0), (0.045, 1.0), (0.0, 1.0)], (-1.05, y, z), (ct, st, 0), seg=10)
            m.cyl('dark', (-1.05, y, z), (-1.04, y + 0.005, z), 0.035, seg=10)
    m.box('main', (-0.55, 0.78, 0), (0.3, 0.4, 0.6), bevel=0.02)
    for x in (0.97, -0.35, -0.85):
        for z in (-0.5, 0.5): m.tyre((x, 0.28, z), 0.28, 0.19)
    m.finish()

def heli():
    """Cierva C.30 autogyro (the RAF's Avro Rota): a slim fuselage with two open cockpits, a radial
    engine and propeller in the nose, the rotor on its tripod, a tailplane with upturned tips and
    fixed wheels. Armed for the game with MG pods."""
    m = Model('heli')
    m.lathe('main', [(0.1, 0.0), (0.19, 0.02), (0.2, 0.1), (0.19, 0.16)], (0.95, 0.0, 0), (-1, 0, 0), seg=28)
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (0.95, 0.0, 0), (-1, 0, 0), seg=20)
    m.prop('dark', (0.96, 0, 0), 0.36, blades=2, spinner=0.05)
    m.loft('main', [(0.8, -0.18, 0.19, 0.19, 2.3), (0.3, -0.22, 0.2, 0.2, 2.4), (-0.4, -0.14, 0.17, 0.15, 2.3), (-1.3, 0.05, 0.18, 0.05, 2.1), (-1.55, 0.1, 0.18, 0.02, 2.0)], seg=32)
    for x in (0.35, -0.1): m.box('dark', (x, 0.2, 0), (0.28, 0.012, 0.28), bevel=0.0)
    for x in (0.5, 0.05): m.box(GLASS, (x, 0.27, 0), (0.02, 0.1, 0.26), bevel=0.0, pitch=-0.5)
    m.wing('main', [(-0.45, -1.3, 0.2, 0.1), (0.0, -1.25, 0.26, 0.1), (0.45, -1.3, 0.2, 0.1)], thick=0.1)
    for z in (-0.45, 0.45): m.wing('main', [(0.1, -1.3, 0.18, z), (0.24, -1.34, 0.12, z)], thick=0.1, vertical=True)
    m.wing('main', [(0.15, -1.25, 0.28, 0), (0.45, -1.36, 0.18, 0)], thick=0.1, vertical=True)
    for z in (-0.12, 0.12): m.cyl('main', (0.25, 0.15, z), (0.1, 0.82, 0), 0.02, seg=8)
    m.cyl('main', (-0.1, 0.15, 0), (0.1, 0.82, 0), 0.02, seg=8)
    for z in (-0.35, 0.35):
        m.cyl('main', (0.3, -0.2, z * 0.5), (0.3, -0.52, z), 0.02, seg=8)
        m.lathe('dark', [(0.04, -0.03), (0.08, -0.03), (0.09, 0.0), (0.08, 0.03), (0.04, 0.03)], (0.3, -0.55, z), (0, 0, 1), seg=18, closed=True)
        m.cyl('dark', (0.0, -0.08, z * 1.5), (0.45, -0.08, z * 1.5), 0.045, seg=14)
        m.box('main', (0.2, -0.05, z * 1.1), (0.2, 0.03, 0.3), bevel=0.01)
    m.cyl('rotor', (0, -0.04, 0), (0, 0.06, 0), 0.08, seg=18, bevel=0.01)
    for i in range(3):
        a = i / 3 * 2 * math.pi
        m.box('rotor', (math.cos(a) * 0.7, 0.02, math.sin(a) * 0.7), (1.26, 0.02, 0.1), bevel=0.008, yaw=-a, roll=0.06)
    m.finish()

def fighter():
    """Supermarine Spitfire Mk IX: the elliptical wing with its radiators underneath, the long nose,
    the raised canopy, the pointed fin and a four-blade prop."""
    m = Model('fighter')
    fuselage(m, [(0.95, -0.09, 0.09, 0.09, 2.2), (0.65, -0.12, 0.12, 0.1, 2.3), (0.25, -0.13, 0.14, 0.11, 2.4), (-0.15, -0.12, 0.13, 0.1, 2.4),
                 (-0.55, -0.08, 0.11, 0.06, 2.2), (-0.9, -0.02, 0.1, 0.02, 2.0)])
    canopy(m, [(0.22, 0.11, 0.12, 0.07, 2), (0.14, 0.1, 0.23, 0.075, 2), (-0.08, 0.1, 0.23, 0.075, 2), (-0.2, 0.1, 0.15, 0.06, 2), (-0.28, 0.11, 0.12, 0.02, 2)],
           frames=[(0.13, 0.1, 0.22, 0.073)])
    secs = []
    for k in range(-8, 9):                                                     # elliptical plan form
        z = k / 8 * 1.08; e = math.sqrt(max(0.02, 1 - (z / 1.1) ** 2))
        secs.append((z, 0.12 + 0.22 * e, 0.12 + 0.4 * e, -0.08 + abs(z) * 0.05))
    m.wing('main', secs, thick=0.11)
    for s in (1, -1):
        m.box('main', (-0.02, -0.14, s * 0.32), (0.28, 0.06, 0.12), bevel=0.01)          # radiators
        for k in range(6): m.box('dark', (0.6 - k * 0.05, 0.03, s * 0.1), (0.03, 0.025, 0.02), bevel=0.003)
        m.cyl('dark', (0.28, -0.07, s * 0.36), (0.45, -0.07, s * 0.36), 0.014, seg=8)
    m.wing('main', [(-0.36, -0.66, 0.1, 0.03), (-0.3, -0.62, 0.16, 0.03), (0.0, -0.6, 0.22, 0.03), (0.3, -0.62, 0.16, 0.03), (0.36, -0.66, 0.1, 0.03)], thick=0.1)
    m.wing('main', [(0.05, -0.6, 0.3, 0), (0.18, -0.64, 0.24, 0), (0.28, -0.7, 0.14, 0), (0.32, -0.76, 0.06, 0)], thick=0.1, vertical=True)
    m.prop('dark', (0.96, 0, 0), 0.36, blades=4, spinner=0.08)
    m.finish()

def attacker():
    """Hawker Typhoon: the big chin radiator, the thick wing with its four cannons and eight
    rockets, the bubble canopy and a four-blade prop."""
    m = Model('attacker')
    fuselage(m, [(0.95, -0.12, 0.1, 0.12, 2.3), (0.7, -0.16, 0.15, 0.14, 2.5), (0.25, -0.18, 0.17, 0.14, 2.6), (-0.2, -0.15, 0.15, 0.12, 2.5),
                 (-0.6, -0.08, 0.12, 0.07, 2.3), (-0.95, -0.02, 0.1, 0.02, 2.0)])
    m.loft('main', [(0.95, -0.24, -0.08, 0.1, 2.6), (0.75, -0.3, -0.1, 0.12, 2.8), (0.5, -0.24, -0.1, 0.1, 2.6)], seg=24)   # chin radiator
    m.box('dark', (0.955, -0.16, 0), (0.012, 0.12, 0.16), bevel=0.0)
    canopy(m, [(0.28, 0.13, 0.15, 0.08, 2), (0.18, 0.12, 0.27, 0.09, 2), (-0.05, 0.12, 0.27, 0.09, 2), (-0.2, 0.12, 0.17, 0.06, 2), (-0.28, 0.13, 0.14, 0.02, 2)],
           frames=[(0.17, 0.12, 0.26, 0.088)])
    m.wing('main', [(-1.1, 0.1, 0.2, -0.02), (-1.0, 0.18, 0.32, -0.04), (-0.5, 0.28, 0.5, -0.1), (0.0, 0.32, 0.56, -0.13),
                    (0.5, 0.28, 0.5, -0.1), (1.0, 0.18, 0.32, -0.04), (1.1, 0.1, 0.2, -0.02)], thick=0.15)
    for s in (1, -1):
        for k in range(2): m.cyl('dark', (0.26, -0.1, s * (0.45 + k * 0.08)), (0.5, -0.1, s * (0.45 + k * 0.08)), 0.018, seg=8)
        for k in range(4):
            z = s * (0.55 + k * 0.12)
            m.box('main', (0.02, -0.17, z), (0.24, 0.02, 0.012), bevel=0.0)
            m.lathe('dark', [(0.0, 0.0), (0.025, 0.03), (0.025, 0.22), (0.04, 0.26), (0.0, 0.32)], (-0.12, -0.2, z), (1, 0, 0), seg=10)
    m.wing('main', [(-0.4, -0.72, 0.12, 0.05), (-0.34, -0.68, 0.2, 0.05), (0.0, -0.65, 0.26, 0.05), (0.34, -0.68, 0.2, 0.05), (0.4, -0.72, 0.12, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -0.64, 0.34, 0), (0.24, -0.72, 0.26, 0), (0.34, -0.8, 0.14, 0)], thick=0.1, vertical=True)
    m.prop('dark', (0.97, 0, 0), 0.4, blades=4, spinner=0.08)
    m.finish()

def bomber():
    """Avro Lancaster: a long slim fuselage with nose, dorsal and tail turrets, four Merlins on the
    wing and the twin oval fins."""
    m = Model('bomber')
    fuselage(m, [(1.45, -0.12, 0.12, 0.13, 2.2), (1.15, -0.22, 0.22, 0.19, 2.6), (0.4, -0.24, 0.24, 0.19, 2.8), (-0.8, -0.2, 0.22, 0.16, 2.6),
                 (-1.3, -0.08, 0.16, 0.08, 2.3), (-1.55, -0.02, 0.1, 0.03, 2.0)], seg=40)
    m.lathe(GLASS, [(0.0, 0.14), (0.1, 0.1), (0.13, 0.0), (0.12, -0.06)], (1.5, -0.02, 0), (1, 0, 0), seg=20)   # bomb-aimer's blister and nose turret
    for z in (-0.04, 0.04): m.cyl('dark', (1.55, 0.06, z), (1.75, 0.06, z), 0.01, seg=6)
    canopy(m, [(1.05, 0.2, 0.22, 0.14, 2.6), (0.95, 0.2, 0.34, 0.14, 2.6), (0.7, 0.2, 0.34, 0.14, 2.6), (0.6, 0.21, 0.28, 0.08, 2.4)], frames=[(0.82, 0.2, 0.34, 0.14)])
    m.lathe(GLASS, [(0.0, 0.12), (0.08, 0.1), (0.11, 0.03), (0.12, 0.0)], (-0.1, 0.22, 0), (0, 1, 0), seg=20)   # mid-upper turret
    m.lathe(GLASS, [(0.0, 0.0), (0.07, 0.04), (0.09, 0.12), (0.08, 0.18)], (-1.56, 0.03, 0), (-1, 0, 0), seg=18)   # rear turret
    for z in (-0.03, 0.03): m.cyl('dark', (-1.7, 0.05, z), (-1.9, 0.05, z), 0.008, seg=6)
    m.wing('main', [(-2.0, 0.15, 0.3, 0.12), (-1.8, 0.3, 0.46, 0.1), (-0.9, 0.5, 0.78, 0.04), (0.0, 0.55, 0.9, 0.0),
                    (0.9, 0.5, 0.78, 0.04), (1.8, 0.3, 0.46, 0.1), (2.0, 0.15, 0.3, 0.12)], thick=0.14)
    for z in (-1.15, -0.55, 0.55, 1.15):
        m.loft('main', [(0.9, -0.02, 0.1, 0.06, 2.2, z), (0.72, -0.1, 0.14, 0.11, 2.4, z), (0.1, -0.1, 0.1, 0.1, 2.4, z), (-0.35, -0.02, 0.04, 0.04, 2.2, z)], seg=24)
        m.prop('dark', (0.91, 0.02, z), 0.36, blades=3, spinner=0.07)
    m.wing('main', [(-0.95, -1.28, 0.24, 0.1), (-0.8, -1.24, 0.34, 0.1), (0.0, -1.2, 0.42, 0.1), (0.8, -1.24, 0.34, 0.1), (0.95, -1.28, 0.24, 0.1)], thick=0.1)
    for z in (-0.95, 0.95):                                                          # the twin oval fins
        m.wing('main', [(-0.18, -1.24, 0.2, z), (-0.05, -1.2, 0.32, z), (0.15, -1.2, 0.36, z), (0.35, -1.23, 0.28, z), (0.45, -1.27, 0.12, z)], thick=0.1, vertical=True)
    m.box('dark', (0.2, -0.235, 0), (1.1, 0.012, 0.22), bevel=0.0)
    m.finish()

def hq():
    """the headquarters: a Nissen hut of corrugated iron with its end wall, door and windows,
    blast walls of sandbags, a radio mast and the flag."""
    m = Model('hq')
    m.loft('main', [(-1.5, -1.05, 1.05, 1.05, 2), (1.5, -1.05, 1.05, 1.05, 2)], seg=48)
    for k in range(17):                                                             # corrugation hoops
        m.torus('main', (-1.45 + k * 0.18, 0.0, 0), (1, 0, 0), 1.055, 0.012, seg=32)
    m.box('main', (1.52, 0.5, 0), (0.05, 1.0, 1.9), bevel=0.01)                      # end wall
    m.box('dark', (1.55, 0.36, 0.0), (0.02, 0.7, 0.36), bevel=0.0)                    # door
    for z in (-0.6, 0.6): m.box(GLASS, (1.55, 0.55, z), (0.02, 0.24, 0.3), bevel=0.0)
    m.box('main', (1.6, 0.8, 0.0), (0.12, 0.04, 0.5), bevel=0.01)                     # porch roof
    for z in (-1.25, 1.25):                                                         # sandbag blast walls
        for k in range(12):
            for r in range(3):
                m.sphere('main', (-1.35 + k * 0.24 + (r % 2) * 0.12, 0.07 + r * 0.12, z), 0.1, scale=(1.4, 0.65, 0.9), seg=10)
    for k in range(4):
        for r in range(3): m.sphere('main', (1.85, 0.07 + r * 0.12, -0.55 + k * 0.24 + (r % 2) * 0.12), 0.1, scale=(0.9, 0.65, 1.4), seg=10)
    m.cyl('main', (-1.2, 0.9, 0.0), (-1.2, 3.1, 0.0), 0.025, seg=8)
    for a in (0.5, 2.6, 4.7): m.cyl('dark', (-1.2, 2.9, 0.0), (-1.2 + math.cos(a) * 1.1, 0.05, math.sin(a) * 1.1), 0.004, seg=4)
    m.cyl('main', (1.8, 0.0, 1.0), (1.8, 2.6, 1.0), 0.02, seg=8)
    m.fin('main', [(1.8, 2.58), (2.45, 2.55), (2.42, 2.15), (1.8, 2.2)], 1.0, 0.012)
    m.finish()

def transport():
    """Bristol Bombay: the RAF's own troop transport - a slab-sided fuselage under a high wing,
    two Pegasus radials, fixed wheels in spats, twin fins and gun turrets in the nose and tail.
    (It dropped the first British paratroops in North Africa.)"""
    m = Model('transport')
    fuselage(m, [(1.45, -0.1, 0.12, 0.1, 2.2), (1.25, -0.24, 0.24, 0.2, 3.0), (0.8, -0.28, 0.28, 0.22, 4.0), (-0.6, -0.26, 0.27, 0.21, 4.0),
                 (-1.25, -0.08, 0.2, 0.1, 3.0), (-1.55, 0.02, 0.14, 0.04, 2.2)], seg=40)
    m.lathe(GLASS, [(0.0, 0.12), (0.08, 0.09), (0.1, 0.0), (0.09, -0.05)], (1.48, 0.0, 0), (1, 0, 0), seg=18)    # nose turret
    m.cyl('dark', (1.56, 0.02, 0), (1.72, 0.02, 0), 0.01, seg=6)
    m.lathe(GLASS, [(0.0, 0.0), (0.06, 0.04), (0.08, 0.12), (0.07, 0.16)], (-1.55, 0.06, 0), (-1, 0, 0), seg=16)  # tail turret
    canopy(m, [(1.2, 0.22, 0.24, 0.12, 2.6), (1.1, 0.22, 0.36, 0.14, 2.8), (0.85, 0.22, 0.36, 0.14, 2.8), (0.75, 0.24, 0.3, 0.08, 2.4)], frames=[(0.98, 0.22, 0.35, 0.14)])
    for s in (1, -1):
        for k in range(7): m.box(GLASS, (0.55 - k * 0.2, 0.08, s * 0.223), (0.08, 0.08, 0.012), bevel=0.0)
    m.box('dark', (-0.7, -0.02, -0.215), (0.2, 0.32, 0.012), bevel=0.0)                   # jump door
    m.wing('main', [(-2.0, 0.26, 0.26, 0.34), (-1.3, 0.4, 0.5, 0.32), (-0.3, 0.5, 0.7, 0.3), (0.0, 0.52, 0.72, 0.3),
                    (0.3, 0.5, 0.7, 0.3), (1.3, 0.4, 0.5, 0.32), (2.0, 0.26, 0.26, 0.34)], thick=0.13)
    for z in (-0.7, 0.7):
        nacelle(m, 0.82, 0.2, z, 0.17, 0.75, 0.42)
        for dz in (-0.07, 0.07): m.cyl('main', (0.34, 0.2, z + dz), (0.34, -0.3, z + dz * 0.4), 0.02, seg=8)
        m.loft('main', [(0.5, -0.4, -0.22, 0.03, 2.2, z), (0.34, -0.46, -0.2, 0.07, 2.4, z), (0.16, -0.42, -0.24, 0.035, 2.2, z)], seg=18)   # spat
        m.lathe('dark', [(0.03, -0.035), (0.08, -0.035), (0.09, 0.0), (0.08, 0.035), (0.03, 0.035)], (0.34, -0.36, z), (0, 0, 1), seg=18, closed=True)
    m.wing('main', [(-0.6, -1.3, 0.2, 0.08), (-0.45, -1.26, 0.3, 0.08), (0.0, -1.22, 0.36, 0.08), (0.45, -1.26, 0.3, 0.08), (0.6, -1.3, 0.2, 0.08)], thick=0.1)
    for z in (-0.6, 0.6):
        m.wing('main', [(-0.1, -1.3, 0.2, z), (0.06, -1.26, 0.28, z), (0.24, -1.28, 0.24, z), (0.32, -1.33, 0.12, z)], thick=0.1, vertical=True)
    m.lathe('dark', [(0.02, -0.02), (0.04, -0.02), (0.04, 0.02), (0.02, 0.02)], (-1.35, -0.1, 0), (0, 0, 1), seg=12, closed=True)
    m.finish()

MODELS = {'jeep': jeep, 'ambulance': ambulance, 'engtruck': engtruck, 'apc': apc, 'amphib': amphib, 'tank_light': tank_light, 'tank': tank,
          'tank_heavy': tank_heavy, 'rockets': rockets, 'heli': heli, 'fighter': fighter, 'attacker': attacker, 'bomber': bomber, 'transport': transport, 'hq': hq}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
