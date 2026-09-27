# The Italian Army's vehicles, aircraft and headquarters, built with the tools in vehicles.py:
# Fiat 508 CM, Fiat 626 cab-over lorries (ambulance and engineers), AB 41 armoured car, the
# amphibious L3 prototype, L6/40, M13/40, P26/40, the D'Ascanio D'AT3 helicopter, Macchi C.202,
# Breda Ba.65, the three-engined SM.79 Sparviero and SM.82 Marsupiale and a farmhouse with its
# dovecote tower. Italy fielded no rocket lorry, so that one (a Fiat 626 with launch rails) is in
# the style of the time. Written to .cache/figures/vehicles/it; tools/figures.mjs packs them into
# public/nation-it.js.
#
#   python tools/blender/vehicles_it.py [name ...]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehicles
from vehicles import (Model, clear, GLASS, LIGHT, WHITE, RED, seat, steering, bogie, roadwheel, sprocket, arc_pts,
                      nacelle, fuselage, canopy)

BASE = vehicles.OUT
from vehicles_jp import track_side      # (importing it points vehicles.OUT at jp; set it back)
vehicles.OUT = os.path.join(BASE, 'it')

def fiat626_front(m, x0=0.5):
    """Fiat 626: a cab-over lorry - the rounded cab sits on top of the engine, with the grille low
    in its face, the big windscreen above and the mudguards curving round the front wheels."""
    m.loft('main', [(x0 - 0.5, 0.42, 1.28, 0.5, 6), (x0 + 0.18, 0.42, 1.28, 0.5, 6), (x0 + 0.4, 0.42, 1.2, 0.48, 5), (x0 + 0.46, 0.44, 1.02, 0.44, 4)], seg=36, bevel=0.01)
    m.box('main', (x0 + 0.47, 0.62, 0), (0.03, 0.3, 0.44), bevel=0.02)
    for k in range(8): m.box('dark', (x0 + 0.485, 0.62, -0.17 + k * 0.048), (0.012, 0.26, 0.018), bevel=0.0)
    m.box(GLASS, (x0 + 0.405, 1.0, 0), (0.012, 0.22, 0.78), bevel=0.0, pitch=-0.25)
    for z in (-0.505, 0.505): m.box(GLASS, (x0 + 0.1, 1.0, z), (0.3, 0.2, 0.012), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (x0 + 0.1, 0.27, s * 0.43), 0.3, 0.33, 0.18, 0.1, math.pi - 0.3)
        m.headlamp((x0 + 0.48, 0.5, s * 0.38), 0.045)
        m.box('dark', (x0 - 0.2, 0.36, s * 0.5), (0.04, 0.14, 0.04), bevel=0.0)             # step
    m.box('dark', (x0 + 0.52, 0.34, 0), (0.06, 0.08, 1.0), bevel=0.012)

def jeep():
    """Fiat 508 CM 'Coloniale': a small open car with a long rounded bonnet, the curved grille,
    flowing mudguards, the spare wheel behind and a Breda gun on a pintle."""
    m = Model('jeep')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.7, 0.07, 0.07), bevel=0.01)
    m.loft('main', [(-0.9, 0.36, 0.62, 0.38, 5), (-0.75, 0.33, 0.68, 0.42, 7), (0.18, 0.33, 0.68, 0.42, 7), (0.26, 0.35, 0.7, 0.4, 7)], bevel=0.01)
    m.box('dark', (-0.3, 0.683, 0), (0.9, 0.01, 0.76), bevel=0.0)
    m.loft('main', [(0.24, 0.44, 0.78, 0.3, 4), (0.78, 0.44, 0.74, 0.26, 3), (0.94, 0.44, 0.66, 0.2, 2.6)], seg=32, bevel=0.01)
    m.lathe('main', [(0.0, 0.0), (0.16, 0.0), (0.17, 0.01), (0.0, 0.02)], (0.93, 0.56, 0), (1, 0, 0), seg=24).scale = (1, 1, 1)   # the round grille surround
    for k in range(7): m.box('dark', (0.955, 0.56, -0.12 + k * 0.04), (0.012, 0.22, 0.014), bevel=0.0)
    for s in (1, -1):
        for x in (0.55, -0.55): m.arc('main', (x, 0.25, s * 0.44), 0.28, 0.3, 0.18, 0.05, math.pi - 0.05)
        m.loft('main', [(0.2, 0.42, 0.46, 0.1, 2, s * 0.44), (-0.28, 0.42, 0.46, 0.1, 2, s * 0.44)], seg=12)   # running board
        m.headlamp((0.86, 0.7, s * 0.3), 0.045)
    m.box('dark', (0.99, 0.3, 0), (0.06, 0.08, 0.96), bevel=0.012)
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.2)
    fr((0.28, 0.72, 0), (0.035, 0.035, 0.8)); fr((0.24, 0.98, 0), (0.035, 0.035, 0.8))
    for z in (-0.39, 0.39): fr((0.26, 0.85, z), (0.03, 0.26, 0.03))
    m.box(GLASS, (0.26, 0.85, 0), (0.012, 0.24, 0.74), bevel=0.0, pitch=-0.2)
    seat(m, -0.05, 0.72, -0.2); seat(m, -0.05, 0.72, 0.2); seat(m, -0.55, 0.72, 0, w=0.76)
    steering(m, 0.1, 0.88, -0.2)
    m.lathe('dark', [(0.12, -0.07), (0.2, -0.07), (0.22, 0.0), (0.2, 0.07), (0.12, 0.07)], (-0.98, 0.52, 0), (1, 0, 0), seg=28, closed=True)
    m.cyl('main', (-0.36, 0.68, 0.0), (-0.36, 1.0, 0.0), 0.028)
    m.mg((-0.34, 1.05, 0), 0.6)
    for x in (0.55, -0.55):
        for z in (-0.44, 0.44): m.tyre((x, 0.25, z), 0.25, 0.15)
    m.finish()

def ambulance():
    m = Model('ambulance')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    fiat626_front(m, 0.5)
    m.loft('main', [(-1.0, 0.5, 1.34, 0.5, 8), (-0.02, 0.5, 1.34, 0.5, 8)], seg=40, bevel=0.01)
    for z in (-0.506, 0.506):
        m.box(WHITE, (-0.5, 0.95, z), (0.46, 0.46, 0.012), bevel=0.0)
        m.box(RED, (-0.5, 0.95, z * 1.004), (0.3, 0.09, 0.012), bevel=0.0); m.box(RED, (-0.5, 0.95, z * 1.004), (0.09, 0.3, 0.012), bevel=0.0)
    m.box(WHITE, (-0.5, 1.342, 0), (0.46, 0.012, 0.46), bevel=0.0)
    m.box(RED, (-0.5, 1.35, 0), (0.3, 0.012, 0.09), bevel=0.0); m.box(RED, (-0.5, 1.35, 0), (0.09, 0.012, 0.3), bevel=0.0)
    for x in (0.6, -0.62):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def engtruck():
    m = Model('engtruck')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    fiat626_front(m, 0.5)
    m.box('main', (-0.45, 0.52, 0), (1.05, 0.08, 0.98), bevel=0.02)
    for z in (-0.47, 0.47): m.box('main', (-0.45, 0.68, z), (1.05, 0.26, 0.04), bevel=0.01)
    m.box('main', (-0.97, 0.68, 0), (0.04, 0.26, 0.98), bevel=0.01)
    for x in (-0.9, -0.62, -0.34, -0.06):
        for z in (-0.48, 0.48): m.box('dark', (x, 0.68, z * 1.01), (0.03, 0.28, 0.02), bevel=0.0)
    for x, z in [(-0.8, -0.26), (-0.8, 0.02), (-0.58, -0.26)]:
        m.box('dark', (x, 0.66, z), (0.22, 0.18, 0.22), bevel=0.015)
        m.box('#e8d44a', (x, 0.66, z - 0.111), (0.12, 0.05, 0.01), bevel=0.0)
    for k in range(3): m.box('dark', (-0.4, 0.6 + k * 0.05, 0.3), (0.8, 0.04, 0.05), bevel=0.004)
    m.cyl('main', (-0.3, 0.64, -0.2), (-0.3, 0.64, -0.02), 0.13, seg=20, bevel=0.01)
    for x in (0.6, -0.62):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def apc():
    """AB 41: a hull of sloped plates on four big wheels, the spare wheels hung on its sides
    between the axles, and the eight-sided turret with the 20 mm Breda cannon."""
    m = Model('apc')
    m.loft_poly('main', [(-1.0, [(0.36, -0.3), (0.64, -0.36), (0.64, 0.36), (0.36, 0.3)]), (-0.75, [(0.3, -0.42), (0.8, -0.42), (0.8, 0.42), (0.3, 0.42)]),
                         (0.5, [(0.3, -0.42), (0.8, -0.42), (0.8, 0.42), (0.3, 0.42)]), (1.0, [(0.36, -0.3), (0.58, -0.34), (0.58, 0.34), (0.36, 0.3)])], bevel=0.012)
    for s in (1, -1):
        for x in (0.6, -0.6): m.arc('main', (x, 0.27, s * 0.5), 0.29, 0.31, 0.16, 0.1, math.pi - 0.1)
        m.tyre((0.0, 0.34, s * 0.48), 0.22, 0.12)                                         # the free-turning spare
        m.headlamp((0.92, 0.6, s * 0.28), 0.035, guard=True)
    m.box('dark', (0.72, 0.74, -0.18), (0.02, 0.03, 0.16), bevel=0.0, pitch=0.5)
    m.loft_poly('main', [(-0.34, [(0.8, -0.24), (1.1, -0.18), (1.1, 0.18), (0.8, 0.24)]), (-0.2, [(0.8, -0.34), (1.12, -0.28), (1.12, 0.28), (0.8, 0.34)]),
                         (0.2, [(0.8, -0.34), (1.12, -0.28), (1.12, 0.28), (0.8, 0.34)]), (0.34, [(0.8, -0.24), (1.1, -0.18), (1.1, 0.18), (0.8, 0.24)])], bevel=0.01)
    m.box('main', (0.36, 0.96, 0), (0.06, 0.16, 0.24), bevel=0.02)
    m.lathe('main', [(0.03, 0.0), (0.026, 0.12), (0.02, 0.15), (0.02, 0.62), (0.03, 0.64), (0.0, 0.64)], (0.38, 0.97, -0.05), (1, 0, 0), seg=14)
    m.cyl('dark', (0.38, 0.97, 0.08), (0.52, 0.97, 0.08), 0.012, seg=8)
    m.cyl('main', (-0.1, 1.12, 0), (-0.1, 1.17, 0), 0.09, seg=16)
    m.cyl('dark', (-0.6, 0.8, 0.3), (-0.6, 1.5, 0.3), 0.006, seg=6)
    for x in (0.6, -0.6):
        for z in (-0.5, 0.5): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def fiat_bogies(m, z, x0, pairs, r, gap):
    """the Fiat-Ansaldo suspension: pairs of small road wheels on bogies, two bogies to each
    leaf-spring unit (drawn as a pack of plates above them)."""
    for i in range(pairs):
        x = x0 + i * gap
        for k in (-0.5, 0.5): roadwheel(m, (x + k * r * 2.2, r + 0.01, z), r, 0.08, dual=False)
        m.box('main', (x, r * 1.3, z + math.copysign(0.07, z)), (r * 3.2, 0.05, 0.02), bevel=0.005)
    for i in range(0, pairs, 2):
        x = x0 + (i + 0.5) * gap
        for k in range(3): m.box('main', (x, r * 2.2 + 0.03 + k * 0.025, z + math.copysign(0.08, z)), (gap * (1.0 - k * 0.2), 0.02, 0.03), bevel=0.003)

def tank_light():
    """L6/40: a small riveted hull, two bogies of paired wheels a side, and the turret offset to
    the left with its 20 mm Breda."""
    m = Model('tank_light')
    for s in (1, -1):
        z = s * 0.46
        fiat_bogies(m, z, -0.4, 2, 0.1, 0.62)
        track_side(m, z, [], (0.82, 0.3, 0.14), (-0.84, 0.28, 0.13), 0.44, 0.22, (-0.25, 0.25))
    m.loft_poly('main', [(-0.95, [(0.24, -0.4), (0.7, -0.4), (0.7, 0.4), (0.24, 0.4)]), (0.55, [(0.24, -0.4), (0.74, -0.4), (0.74, 0.4), (0.24, 0.4)]),
                         (0.95, [(0.3, -0.36), (0.54, -0.36), (0.54, 0.36), (0.3, 0.36)])], bevel=0.012)
    m.rivets('main', (-0.8, 0.66, 0.405), (0.5, 0.66, 0.405), 12, normal=(0, 0, 1))
    m.rivets('main', (-0.8, 0.66, -0.405), (0.5, 0.66, -0.405), 12, normal=(0, 0, -1))
    m.box('main', (0.62, 0.78, 0.2), (0.14, 0.1, 0.22), bevel=0.02)
    for k in range(6): m.box('dark', (-0.8 + k * 0.05, 0.745, -0.1), (0.02, 0.012, 0.4), bevel=0.0)
    m.loft_poly('main', [(-0.3, [(0.74, -0.28), (1.0, -0.24), (1.0, 0.1), (0.74, 0.14)]), (0.22, [(0.74, -0.3), (1.02, -0.26), (1.02, 0.12), (0.74, 0.16)]),
                         (0.32, [(0.74, -0.24), (0.98, -0.2), (0.98, 0.08), (0.74, 0.12)])], bevel=0.01)
    m.lathe('main', [(0.03, 0.0), (0.026, 0.12), (0.02, 0.15), (0.02, 0.62), (0.03, 0.64), (0.0, 0.64)], (0.32, 0.88, -0.07), (1, 0, 0), seg=14)
    m.cyl('main', (-0.1, 1.0, -0.07), (-0.1, 1.04, -0.07), 0.09, seg=16)
    m.finish()

def tank():
    """M13/40: the riveted box hull, eight road wheels in paired bogies under leaf springs, three
    return rollers, the twin hull machine guns and the riveted turret with the 47/32 gun."""
    m = Model('tank')
    for s in (1, -1):
        z = s * 0.6
        fiat_bogies(m, z, -0.75, 4, 0.11, 0.42)
        track_side(m, z, [], (1.08, 0.4, 0.16), (-1.12, 0.34, 0.15), 0.56, 0.26, (-0.5, 0.0, 0.5))
        m.box('main', (0.0, 0.64, s * 0.66), (2.3, 0.02, 0.2), bevel=0.005)
    m.loft_poly('main', [(-1.15, [(0.3, -0.5), (0.92, -0.5), (0.92, 0.5), (0.3, 0.5)]), (0.62, [(0.3, -0.5), (0.96, -0.5), (0.96, 0.5), (0.3, 0.5)]),
                         (0.82, [(0.3, -0.48), (0.96, -0.46), (0.96, 0.46), (0.3, 0.48)]), (1.18, [(0.36, -0.46), (0.66, -0.44), (0.66, 0.44), (0.36, 0.46)])], bevel=0.012)
    for y in (0.5, 0.86):
        m.rivets('main', (-1.0, y, 0.505), (0.6, y, 0.505), 16, normal=(0, 0, 1))
        m.rivets('main', (-1.0, y, -0.505), (0.6, y, -0.505), 16, normal=(0, 0, -1))
    m.box('main', (0.78, 0.9, -0.22), (0.1, 0.14, 0.3), bevel=0.02)                      # the driver's visor housing
    m.box('dark', (0.84, 0.92, -0.22), (0.02, 0.025, 0.18), bevel=0.0)
    m.box('main', (0.8, 0.82, 0.2), (0.14, 0.14, 0.26), bevel=0.02)                      # the twin MG mount
    for z in (0.14, 0.26): m.cyl('dark', (0.86, 0.82, z), (1.02, 0.8, z), 0.013, seg=8)
    for k in range(8): m.box('dark', (-1.0 + k * 0.05, 0.965, 0), (0.02, 0.012, 0.7), bevel=0.0)
    for s in (1, -1): m.headlamp((1.08, 0.72, s * 0.4), 0.04)
    m.loft_poly('main', [(-0.46, [(0.96, -0.36), (1.28, -0.3), (1.28, 0.3), (0.96, 0.36)]), (0.24, [(0.96, -0.4), (1.3, -0.33), (1.3, 0.33), (0.96, 0.4)]),
                         (0.36, [(0.96, -0.32), (1.26, -0.26), (1.26, 0.26), (0.96, 0.32)])], bevel=0.012)
    m.rivets('main', (-0.35, 1.14, 0.385), (0.2, 1.14, 0.385), 7, normal=(0, 0, 1))
    m.rivets('main', (-0.35, 1.14, -0.385), (0.2, 1.14, -0.385), 7, normal=(0, 0, -1))
    m.box('main', (0.37, 1.1, 0), (0.06, 0.18, 0.26), bevel=0.02)
    m.lathe('main', [(0.045, 0.0), (0.04, 0.2), (0.032, 0.25), (0.032, 0.78), (0.04, 0.8), (0.0, 0.8)], (0.39, 1.1, 0), (1, 0, 0), seg=16)
    m.cyl('dark', (0.39, 1.1, 0.1), (0.55, 1.1, 0.1), 0.012, seg=8)
    m.box('main', (-0.2, 1.32, 0.15), (0.26, 0.04, 0.22), bevel=0.01)                    # hatch
    m.cyl('dark', (-0.4, 1.3, -0.25), (-0.4, 2.0, -0.25), 0.006, seg=6)
    m.finish()

def tank_heavy():
    """P26/40: a longer, lower hull with sloped plates, eight wheels in paired bogies, and the
    well-sloped turret with the long 75/34 gun."""
    m = Model('tank_heavy')
    for s in (1, -1):
        z = s * 0.72
        fiat_bogies(m, z, -0.9, 4, 0.12, 0.5)
        track_side(m, z, [], (1.3, 0.42, 0.17), (-1.32, 0.36, 0.16), 0.6, 0.3, (-0.6, 0.0, 0.6))
        m.box('main', (0.0, 0.7, s * 0.78), (2.7, 0.022, 0.26), bevel=0.006)
    m.loft_poly('main', [(-1.36, [(0.32, -0.62), (0.92, -0.56), (0.92, 0.56), (0.32, 0.62)]), (0.7, [(0.32, -0.62), (1.0, -0.56), (1.0, 0.56), (0.32, 0.62)]),
                         (1.4, [(0.4, -0.58), (0.68, -0.54), (0.68, 0.54), (0.4, 0.58)])], bevel=0.014)
    m.box('main', (0.9, 0.96, -0.28), (0.12, 0.1, 0.28), bevel=0.02, pitch=0.5)
    m.box('dark', (0.95, 0.98, -0.28), (0.02, 0.025, 0.18), bevel=0.0, pitch=0.5)
    for k in range(10): m.box('dark', (-1.25 + k * 0.05, 0.93, 0), (0.02, 0.012, 0.9), bevel=0.0)
    for s in (1, -1): m.headlamp((1.28, 0.72, s * 0.45), 0.04)
    m.loft_poly('main', [(-0.62, [(1.0, -0.44), (1.36, -0.32), (1.36, 0.32), (1.0, 0.44)]), (0.3, [(1.0, -0.5), (1.4, -0.34), (1.4, 0.34), (1.0, 0.5)]),
                         (0.5, [(1.0, -0.38), (1.34, -0.26), (1.34, 0.26), (1.0, 0.38)])], bevel=0.016)
    m.box('main', (0.52, 1.17, 0), (0.08, 0.2, 0.3), bevel=0.02)
    m.lathe('main', [(0.055, 0.0), (0.048, 0.25), (0.04, 0.3), (0.04, 1.34), (0.048, 1.36), (0.048, 1.42), (0.0, 1.42)], (0.54, 1.18, 0), (1, 0, 0), seg=16)
    m.lathe('main', [(0.13, 0.0), (0.13, 0.07), (0.09, 0.09), (0.0, 0.1)], (-0.3, 1.38, 0.18), (0, 1, 0), seg=20)
    m.cyl('dark', (-0.5, 1.38, -0.3), (-0.5, 2.05, -0.3), 0.006, seg=6)
    m.finish()

def fighter():
    """Macchi C.202 Folgore: the slim inline nose with the chin intake, the belly radiator, the
    small framed canopy faired into the spine, the rounded fin and a three-blade prop."""
    m = Model('fighter')
    fuselage(m, [(0.95, -0.08, 0.08, 0.08, 2.1), (0.7, -0.12, 0.12, 0.1, 2.3), (0.3, -0.13, 0.14, 0.11, 2.4), (-0.15, -0.12, 0.14, 0.1, 2.4),
                 (-0.55, -0.07, 0.11, 0.06, 2.2), (-0.9, -0.01, 0.09, 0.02, 2.0)])
    m.loft('main', [(0.85, -0.12, -0.08, 0.05, 2.4), (0.7, -0.16, -0.08, 0.06, 2.6), (0.55, -0.12, -0.08, 0.05, 2.4)], seg=20)   # chin intake
    m.loft('main', [(0.05, -0.14, -0.1, 0.07, 2.4), (-0.1, -0.24, -0.1, 0.09, 3), (-0.3, -0.23, -0.1, 0.09, 3), (-0.45, -0.12, -0.08, 0.04, 2.4)], seg=24)
    canopy(m, [(0.22, 0.11, 0.12, 0.06, 2.4), (0.14, 0.11, 0.22, 0.07, 2.6), (-0.06, 0.11, 0.22, 0.07, 2.6), (-0.14, 0.12, 0.17, 0.05, 2.4)],
           frames=[(0.08, 0.11, 0.22, 0.07), (-0.02, 0.11, 0.22, 0.07)])
    m.loft('main', [(-0.14, 0.1, 0.17, 0.05, 2.4), (-0.5, 0.08, 0.13, 0.035, 2.2), (-0.75, 0.06, 0.09, 0.02, 2.0)], seg=16)   # the spine fairing
    m.wing('main', [(-1.02, 0.06, 0.12, -0.02), (-0.95, 0.14, 0.24, -0.03), (-0.5, 0.26, 0.4, -0.06), (0.0, 0.3, 0.5, -0.1),
                    (0.5, 0.26, 0.4, -0.06), (0.95, 0.14, 0.24, -0.03), (1.02, 0.06, 0.12, -0.02)], thick=0.11)
    m.wing('main', [(-0.34, -0.66, 0.1, 0.03), (-0.3, -0.62, 0.16, 0.03), (0.0, -0.6, 0.22, 0.03), (0.3, -0.62, 0.16, 0.03), (0.34, -0.66, 0.1, 0.03)], thick=0.1)
    m.wing('main', [(0.05, -0.56, 0.34, 0), (0.18, -0.62, 0.28, 0), (0.28, -0.7, 0.18, 0), (0.32, -0.76, 0.08, 0)], thick=0.1, vertical=True)
    for s in (1, -1):
        for k in range(6): m.box('dark', (0.72 - k * 0.05, 0.05, s * 0.1), (0.035, 0.025, 0.02), bevel=0.004)
        m.cyl('dark', (0.6, 0.1, s * 0.05), (0.8, 0.1, s * 0.05), 0.012, seg=8)             # the cowl guns
    m.prop('dark', (0.96, 0, 0), 0.36, blades=3, spinner=0.08)
    m.finish()

def attacker():
    """Breda Ba.65: a stubby single-engined attack aircraft - the big radial cowling, the low
    wing with its guns, the gunner's turret behind the pilot and the bombs underneath."""
    m = Model('attacker')
    m.lathe('main', [(0.1, 0.0), (0.17, 0.02), (0.18, 0.08), (0.17, 0.18)], (0.86, 0.0, 0), (-1, 0, 0), seg=32)
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (0.86, 0.0, 0), (-1, 0, 0), seg=24)
    fuselage(m, [(0.7, -0.16, 0.16, 0.16, 2.2), (0.3, -0.16, 0.16, 0.14, 2.4), (-0.3, -0.13, 0.14, 0.11, 2.3), (-0.7, -0.06, 0.1, 0.05, 2.2), (-0.95, -0.01, 0.08, 0.018, 2.0)])
    canopy(m, [(0.3, 0.13, 0.14, 0.07, 2.4), (0.2, 0.13, 0.26, 0.085, 2.6), (-0.05, 0.13, 0.26, 0.085, 2.6), (-0.15, 0.14, 0.18, 0.06, 2.4)], frames=[(0.08, 0.13, 0.26, 0.084)])
    m.lathe(GLASS, [(0.0, 0.12), (0.07, 0.1), (0.09, 0.02), (0.1, 0.0)], (-0.3, 0.12, 0), (0, 1, 0), seg=18)   # the gunner's turret
    m.cyl('dark', (-0.3, 0.2, 0), (-0.5, 0.22, 0), 0.01, seg=8)
    m.wing('main', [(-1.05, 0.08, 0.14, -0.04), (-0.95, 0.16, 0.28, -0.05), (-0.5, 0.28, 0.44, -0.08), (0.0, 0.32, 0.54, -0.12),
                    (0.5, 0.28, 0.44, -0.08), (0.95, 0.16, 0.28, -0.05), (1.05, 0.08, 0.14, -0.04)], thick=0.13)
    for s in (1, -1):
        for k in range(2): m.cyl('dark', (0.3, -0.1, s * (0.45 + k * 0.08)), (0.46, -0.1, s * (0.45 + k * 0.08)), 0.014, seg=8)
        m.lathe('dark', [(0.0, 0.0), (0.04, 0.05), (0.05, 0.18), (0.035, 0.26), (0.0, 0.28)], (-0.18, -0.22, s * 0.28), (1, 0, 0), seg=14)
        m.box('main', (-0.05, -0.17, s * 0.28), (0.12, 0.06, 0.012), bevel=0.0)
    m.wing('main', [(-0.38, -0.72, 0.12, 0.05), (-0.32, -0.68, 0.2, 0.05), (0.0, -0.65, 0.26, 0.05), (0.32, -0.68, 0.2, 0.05), (0.38, -0.72, 0.12, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -0.64, 0.32, 0), (0.22, -0.72, 0.24, 0), (0.32, -0.8, 0.12, 0)], thick=0.1, vertical=True)
    m.prop('dark', (0.87, 0, 0), 0.4, blades=3, spinner=0.07)
    m.finish()

def bomber():
    """Savoia-Marchetti SM.79 Sparviero: three radial engines (one in the nose), the hump behind
    the cockpit with its guns, the ventral gondola and a single fin."""
    m = Model('bomber')
    m.lathe('main', [(0.1, 0.0), (0.17, 0.02), (0.18, 0.08), (0.17, 0.16)], (1.42, 0.0, 0), (-1, 0, 0), seg=32)
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (1.42, 0.0, 0), (-1, 0, 0), seg=24)
    m.prop('dark', (1.43, 0, 0), 0.4, blades=3, spinner=0.06)
    fuselage(m, [(1.26, -0.17, 0.17, 0.17, 2.2), (0.9, -0.22, 0.22, 0.2, 2.4), (0.3, -0.24, 0.22, 0.2, 2.5), (-0.5, -0.2, 0.18, 0.16, 2.4),
                 (-1.2, -0.08, 0.12, 0.07, 2.2), (-1.5, -0.02, 0.07, 0.03, 2.0)], seg=40)
    canopy(m, [(1.02, 0.14, 0.16, 0.12, 2.4), (0.92, 0.14, 0.3, 0.14, 2.6), (0.72, 0.14, 0.32, 0.14, 2.6)], frames=[(0.82, 0.14, 0.31, 0.14)])
    m.loft('main', [(0.72, 0.14, 0.32, 0.14, 2.6), (0.5, 0.14, 0.4, 0.13, 2.6), (0.2, 0.14, 0.38, 0.11, 2.4), (-0.1, 0.14, 0.24, 0.06, 2.2)], seg=28)   # the hump
    m.cyl('dark', (0.52, 0.36, 0), (0.7, 0.38, 0), 0.012, seg=8)
    m.cyl('dark', (-0.08, 0.3, 0), (-0.3, 0.32, 0), 0.012, seg=8)
    m.loft('main', [(0.4, -0.26, -0.2, 0.08, 2.4), (0.2, -0.32, -0.2, 0.1, 2.6), (-0.2, -0.3, -0.18, 0.09, 2.6), (-0.35, -0.24, -0.18, 0.05, 2.2)], seg=20)   # gondola
    m.wing('main', [(-1.9, 0.1, 0.24, 0.02), (-1.7, 0.22, 0.42, 0.0), (-0.8, 0.44, 0.74, -0.06), (0.0, 0.5, 0.84, -0.08),
                    (0.8, 0.44, 0.74, -0.06), (1.7, 0.22, 0.42, 0.0), (1.9, 0.1, 0.24, 0.02)], thick=0.14)
    for z in (-0.72, 0.72): nacelle(m, 0.8, -0.06, z, 0.16, 0.9, 0.4)
    m.wing('main', [(-0.7, -1.2, 0.2, 0.05), (-0.55, -1.16, 0.3, 0.05), (0.0, -1.12, 0.38, 0.05), (0.55, -1.16, 0.3, 0.05), (0.7, -1.2, 0.2, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -1.1, 0.42, 0), (0.28, -1.18, 0.34, 0), (0.44, -1.26, 0.22, 0), (0.5, -1.32, 0.1, 0)], thick=0.1, vertical=True)
    m.box('dark', (0.0, -0.3, 0), (0.3, 0.012, 0.16), bevel=0.0)
    m.finish()

def hq():
    """the headquarters: a stuccoed farmhouse with a low hipped roof of curved tiles, the square
    dovecote tower rising from its middle, an arched loggia, the outside stair, sandbags, the
    radio mast and the flag."""
    m = Model('hq')
    m.box('main', (0, 0.8, 0), (2.8, 1.6, 2.0), bevel=0.02)                            # walls
    for k in range(3):                                                                 # the arched loggia
        z = -0.6 + k * 0.6
        m.box('dark', (1.405, 0.38, z), (0.02, 0.6, 0.4), bevel=0.0)
        m.cyl('dark', (1.395, 0.68, z), (1.415, 0.68, z), 0.2, seg=16)
    for x in (-0.8, 0.0, 0.8):
        for z in (-1.0, 1.0):
            m.box(GLASS, (x, 1.2, z * 1.002), (0.26, 0.36, 0.02), bevel=0.0)
            m.box('main', (x, 0.98, z * 1.01), (0.34, 0.04, 0.03), bevel=0.005)         # sill
    for k in range(6): m.box('main', (-0.6 + k * 0.16, 0.08 + k * 0.14, 1.12), (0.16, 0.16, 0.22), bevel=0.01)   # outside stair
    def hip(y0, y1, hw, hd, over=0.12):
        hw, hd = hw + over, hd + over; r = min(hw, hd) * 0.9
        flat = [(y0, -hd), (y0 + 0.01, 0.0), (y0, hd)]; ridge = [(y0, -hd), (y1, 0.0), (y0, hd)]
        m.loft_poly('main', [(-hw, flat), (-hw + r, ridge), (hw - r, ridge), (hw, flat)], bevel=0.01)
    hip(1.6, 2.05, 1.4, 1.0)
    for k in range(6):                                                                 # rows of curved tiles on the long slopes
        x = -0.5 + k * 0.2
        for s in (1, -1): m.cyl('main', (x, 1.61, s * 1.1), (x, 2.03, s * 0.05), 0.025, seg=8)
    m.box('main', (0.2, 2.1, 0), (0.7, 1.2, 0.7), bevel=0.02)                          # the dovecote tower
    for z in (-0.15, 0.15): m.box('dark', (0.555, 2.45, z), (0.02, 0.16, 0.1), bevel=0.0)
    m.box('main', (0.2, 2.25, 0), (0.78, 0.04, 0.78), bevel=0.01)                      # the ledge round it
    hip(2.7, 2.95, 0.35, 0.35, over=0.1)
    for k in range(6):
        for r in range(2): m.sphere('main', (1.65, 0.07 + r * 0.12, -0.9 + k * 0.2 + (r % 2) * 0.1), 0.09, scale=(0.9, 0.65, 1.4), seg=10)
    m.cyl('main', (1.8, 0.0, 1.2), (1.8, 2.8, 1.2), 0.02, seg=8)                         # flag
    m.fin('main', [(1.8, 2.78), (2.45, 2.75), (2.42, 2.35), (1.8, 2.4)], 1.2, 0.012)
    m.cyl('main', (-1.1, 1.9, -0.7), (-1.1, 3.4, -0.7), 0.02, seg=8)                     # radio mast
    for a in (0.5, 2.6, 4.7): m.cyl('dark', (-1.1, 3.2, -0.7), (-1.1 + math.cos(a) * 1.0, 0.05, -0.7 + math.sin(a) * 1.0), 0.004, seg=4)
    m.finish()

def amphib():
    """the amphibious L3: the little two-man tankette with its twin machine guns, buoyancy floats
    along both sides, a propeller and a rudder at the back. (Built as prototypes in the 1930s.)"""
    m = Model('amphib')
    for s in (1, -1):
        z = s * 0.34
        fiat_bogies(m, z, -0.35, 2, 0.09, 0.5)
        track_side(m, z, [], (0.7, 0.28, 0.12), (-0.74, 0.26, 0.11), 0.4, 0.18, (0.0,))
        m.loft('main', [(-1.0, 0.44, 0.62, 0.02, 3, s * 0.6), (-0.8, 0.32, 0.64, 0.1, 3.5, s * 0.6), (0.6, 0.32, 0.64, 0.1, 3.5, s * 0.6),
                        (0.95, 0.42, 0.64, 0.06, 3, s * 0.6), (1.05, 0.56, 0.64, 0.02, 2.5, s * 0.6)], seg=24, bevel=0.01)   # the floats
        for x in (-0.6, 0.0, 0.5): m.box('main', (x, 0.6, s * 0.46), (0.06, 0.04, 0.24), bevel=0.005)   # their brackets
    m.loft_poly('main', [(-0.85, [(0.22, -0.34), (0.62, -0.34), (0.62, 0.34), (0.22, 0.34)]), (0.3, [(0.22, -0.34), (0.66, -0.34), (0.66, 0.34), (0.22, 0.34)]),
                         (0.85, [(0.3, -0.3), (0.54, -0.3), (0.54, 0.3), (0.3, 0.3)])], bevel=0.012)
    m.loft_poly('main', [(0.05, [(0.66, -0.3), (0.86, -0.28), (0.86, 0.28), (0.66, 0.3)]), (0.5, [(0.66, -0.3), (0.86, -0.28), (0.86, 0.28), (0.66, 0.3)]),
                         (0.68, [(0.62, -0.3), (0.76, -0.26), (0.76, 0.26), (0.62, 0.3)])], bevel=0.01)   # the superstructure
    m.rivets('main', (-0.7, 0.55, 0.345), (0.3, 0.55, 0.345), 9, normal=(0, 0, 1))
    m.rivets('main', (-0.7, 0.55, -0.345), (0.3, 0.55, -0.345), 9, normal=(0, 0, -1))
    for z in (-0.08, 0.08): m.cyl('dark', (0.66, 0.74, z), (0.92, 0.72, z), 0.014, seg=8)
    m.box('dark', (0.6, 0.8, 0.18), (0.02, 0.025, 0.12), bevel=0.0, pitch=0.5)
    m.box('main', (0.2, 0.87, 0.1), (0.2, 0.03, 0.22), bevel=0.01)                      # hatch
    for k in range(5): m.box('dark', (-0.6 + k * 0.05, 0.625, 0), (0.02, 0.012, 0.4), bevel=0.0)
    m.cyl('dark', (-0.85, 0.3, 0), (-1.0, 0.3, 0), 0.025)
    for a in (0.3, 2.4, 4.5): m.box('dark', (-1.01, 0.3 + math.sin(a) * 0.06, math.cos(a) * 0.06), (0.03, 0.1, 0.04), bevel=0.005, roll=a)
    m.box('dark', (-1.07, 0.34, 0), (0.05, 0.2, 0.02), bevel=0.005)
    m.finish()

def rockets():
    """a Fiat 626 carrying a frame of open launch rails with the rockets on them. (Italy fielded
    no rocket lorry; this one is in the style of the time.)"""
    m = Model('rockets')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.34, z), (2.5, 0.1, 0.08), bevel=0.01)
    fiat626_front(m, 0.85)
    m.box('main', (-0.5, 0.5, 0), (1.55, 0.1, 0.96), bevel=0.02)
    tilt = 0.42; ct, st = math.cos(tilt), math.sin(tilt)
    for c in range(8):
        z = -0.38 + c * 0.108
        m.box('dark', (-0.5, 1.08, z), (1.4, 0.02, 0.05), pitch=tilt, bevel=0.0)          # the rail
        m.lathe('main', [(0.0, 0.0), (0.035, 0.03), (0.038, 0.1), (0.038, 0.8), (0.05, 0.86), (0.05, 1.0), (0.03, 1.08), (0.0, 1.1)],
                (-1.0, 0.9, z), (ct, st, 0), seg=12)
    for x in (-0.95, -0.2): m.box('main', (x, 0.95 + (x + 0.5) * st / ct, 0), (0.05, 0.05, 0.9), bevel=0.01, pitch=tilt)
    m.box('main', (-0.55, 0.72, 0), (0.3, 0.36, 0.5), bevel=0.02)
    for z in (-0.5, 0.5):
        m.cyl('main', (-1.2, 0.5, z), (-1.3, 0.08, z * 1.12), 0.035)
        m.cyl('main', (-1.3, 0.06, z * 1.12), (-1.3, 0.02, z * 1.12), 0.08)
    for x in (0.95, -0.35, -0.85):
        for z in (-0.5, 0.5): m.tyre((x, 0.28, z), 0.28, 0.19)
    m.finish()

def heli():
    """D'Ascanio D'AT3: the Italian helicopter of 1930 - an open steel-tube frame with the pilot's
    seat, the engine below a tall mast carrying two coaxial two-blade rotors, a small tail and
    wheels. Armed for the game with MG pods."""
    m = Model('heli')
    tube = lambda a, b, r=0.018: m.cyl('main', a, b, r, seg=8)
    for z in (-0.18, 0.18):
        tube((0.55, -0.35, z * 0.6), (-0.3, -0.35, z)); tube((-0.3, -0.35, z), (-1.3, 0.0, z * 0.2))
        tube((0.55, -0.35, z * 0.6), (0.0, 0.2, z * 0.5)); tube((-0.3, -0.35, z), (0.0, 0.2, z * 0.5))
        tube((-0.3, 0.1, z * 0.6), (-1.3, 0.04, z * 0.2))
    for x in (-0.6, -0.9): tube((x, -0.35 + (-0.3 - x) * 0.35, 0), (x, 0.08, 0), 0.012)
    m.box('main', (-0.05, -0.1, 0), (0.42, 0.34, 0.34), bevel=0.04)                  # the engine
    for k in range(5): m.box('dark', (-0.2 + k * 0.07, -0.1, 0.175), (0.02, 0.26, 0.01), bevel=0.0)
    m.cyl('main', (0.0, 0.05, 0), (0.0, 1.0, 0), 0.035, seg=12)                       # the mast
    m.cyl('main', (0.0, 0.6, 0), (0.0, 0.66, 0), 0.07, seg=14)                        # its gearbox
    for z in (-0.12, 0.12): tube((-0.05, 0.1, z), (0.0, 0.62, 0), 0.012)
    seat(m, 0.35, -0.3, 0, w=0.26)
    m.cyl('dark', (0.55, -0.1, 0), (0.45, -0.28, 0), 0.01, seg=6)                     # control column
    m.wing('main', [(-0.35, -1.3, 0.2, 0.02), (0.0, -1.26, 0.26, 0.02), (0.35, -1.3, 0.2, 0.02)], thick=0.08)
    m.wing('main', [(0.02, -1.28, 0.22, 0), (0.24, -1.32, 0.14, 0)], thick=0.08, vertical=True)
    for z in (-0.35, 0.35):
        m.cyl('main', (0.2, -0.35, z * 0.4), (0.2, -0.55, z), 0.02, seg=8)
        m.cyl('main', (-0.3, -0.35, z * 0.5), (0.2, -0.55, z), 0.02, seg=8)
        m.lathe('dark', [(0.04, -0.03), (0.08, -0.03), (0.09, 0.0), (0.08, 0.03), (0.04, 0.03)], (0.2, -0.55, z), (0, 0, 1), seg=18, closed=True)
        m.cyl('dark', (-0.1, -0.2, z * 1.2), (0.4, -0.2, z * 1.2), 0.045, seg=14)
        m.cyl('main', (0.05, -0.3, z * 0.6), (0.1, -0.22, z * 1.15), 0.015, seg=6)
    m.lathe('dark', [(0.02, -0.02), (0.04, -0.02), (0.04, 0.02), (0.02, 0.02)], (-1.25, -0.04, 0), (0, 0, 1), seg=12, closed=True)
    m.cyl('rotor', (0, -0.03, 0), (0, 0.04, 0), 0.07, seg=18, bevel=0.01)             # one of the two rotors
    for i in range(2):
        a = i * math.pi
        m.box('rotor', (math.cos(a) * 0.65, 0.0, math.sin(a) * 0.65), (1.2, 0.02, 0.12), bevel=0.008, yaw=-a, roll=0.05)
    m.finish()

def transport():
    """Savoia-Marchetti SM.82 Marsupiale: the deep 'pouched' fuselage, three radials (one in the
    nose), the long wing, a single fin and the undercarriage under the wing engines."""
    m = Model('transport')
    m.lathe('main', [(0.1, 0.0), (0.18, 0.02), (0.19, 0.08), (0.18, 0.16)], (1.62, 0.02, 0), (-1, 0, 0), seg=32)
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (1.62, 0.02, 0), (-1, 0, 0), seg=24)
    m.prop('dark', (1.63, 0.02, 0), 0.42, blades=3, spinner=0.06)
    fuselage(m, [(1.46, -0.16, 0.2, 0.18, 2.2), (1.1, -0.34, 0.3, 0.26, 2.6), (0.3, -0.4, 0.32, 0.28, 3.0), (-0.6, -0.34, 0.28, 0.24, 2.8),
                 (-1.25, -0.1, 0.2, 0.1, 2.3), (-1.65, 0.04, 0.14, 0.03, 2.0)], seg=40)
    canopy(m, [(1.2, 0.26, 0.28, 0.16, 2.6), (1.08, 0.26, 0.4, 0.17, 2.8), (0.84, 0.26, 0.41, 0.17, 2.8), (0.74, 0.27, 0.34, 0.12, 2.4)], frames=[(0.96, 0.26, 0.4, 0.17)])
    m.lathe(GLASS, [(0.0, 0.1), (0.07, 0.08), (0.1, 0.0)], (0.1, 0.3, 0), (0, 1, 0), seg=18)   # the dorsal turret
    for s in (1, -1):
        for k in range(6): m.box(GLASS, (0.55 - k * 0.2, 0.05, s * 0.28), (0.08, 0.08, 0.012), bevel=0.0)
    m.box('dark', (-0.7, -0.08, -0.25), (0.22, 0.34, 0.012), bevel=0.0)                   # the side door
    m.wing('main', [(-2.2, 0.12, 0.26, 0.04), (-1.9, 0.26, 0.48, 0.02), (-0.9, 0.5, 0.84, -0.04), (0.0, 0.56, 0.96, -0.06),
                    (0.9, 0.5, 0.84, -0.04), (1.9, 0.26, 0.48, 0.02), (2.2, 0.12, 0.26, 0.04)], thick=0.15)
    for z in (-0.8, 0.8):
        nacelle(m, 0.9, -0.06, z, 0.17, 1.0, 0.42)
        for dx in (-0.05, 0.05): m.cyl('main', (0.3 + dx, -0.2, z), (0.3 + dx, -0.36, z), 0.02, seg=8)
        m.lathe('dark', [(0.03, -0.045), (0.09, -0.045), (0.1, 0.0), (0.09, 0.045), (0.03, 0.045)], (0.3, -0.37, z), (0, 0, 1), seg=18, closed=True)
    m.wing('main', [(-0.8, -1.4, 0.22, 0.08), (-0.65, -1.36, 0.34, 0.08), (0.0, -1.32, 0.44, 0.08), (0.65, -1.36, 0.34, 0.08), (0.8, -1.4, 0.22, 0.08)], thick=0.1)
    m.wing('main', [(0.08, -1.28, 0.5, 0), (0.34, -1.38, 0.4, 0), (0.54, -1.48, 0.26, 0), (0.62, -1.54, 0.12, 0)], thick=0.1, vertical=True)
    m.lathe('dark', [(0.02, -0.02), (0.04, -0.02), (0.04, 0.02), (0.02, 0.02)], (-1.5, -0.02, 0), (0, 0, 1), seg=12, closed=True)
    m.finish()

MODELS = {'jeep': jeep, 'ambulance': ambulance, 'engtruck': engtruck, 'apc': apc, 'amphib': amphib, 'tank_light': tank_light, 'tank': tank,
          'tank_heavy': tank_heavy, 'fighter': fighter, 'attacker': attacker, 'bomber': bomber, 'transport': transport, 'rockets': rockets, 'heli': heli, 'hq': hq}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
