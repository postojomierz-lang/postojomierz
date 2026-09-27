# The Red Army's vehicles, aircraft and headquarters, built with the tools in vehicles.py:
# GAZ-67, GAZ-55 ambulance, ZiS-5 engineers, BA-64, T-38 (amphibious), T-70, T-34, IS-2, the BM-13
# "Katyusha" on a ZiS-6, the Kamov A-7 autogyro, Yak-3, Il-2, Pe-2, Li-2 and a log dugout command post.
# Same keys as the American set, written to .cache/figures/vehicles/su; tools/figures.mjs packs them
# into public/nation-su.js.
#
#   python tools/blender/vehicles_su.py [name ...]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehicles
from vehicles import (Model, clear, GLASS, LIGHT, WHITE, RED, seat, steering, bogie, roadwheel, sprocket, arc_pts,
                      nacelle, fuselage, canopy)

vehicles.OUT = os.path.join(vehicles.OUT, 'su')

# =========================================================================================
def zis_front(m, x0=0.1, closed=True):
    """ZiS-5: a long narrow bonnet with flat sides, the tall radiator in its frame, flat-topped
    mudguards with the headlamps on stalks beside the bonnet, and a boxy wooden cab."""
    m.loft('main', [(x0 + 0.35, 0.52, 0.86, 0.26, 7), (x0 + 0.88, 0.52, 0.84, 0.25, 7)], seg=32, bevel=0.01)
    m.box('main', (x0 + 0.9, 0.66, 0), (0.05, 0.4, 0.54), bevel=0.02)                   # radiator frame
    for k in range(10): m.box('dark', (x0 + 0.925, 0.66, -0.2 + k * 0.045), (0.012, 0.32, 0.018), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (x0 + 0.6, 0.27, s * 0.41), 0.3, 0.32, 0.2, 0.1, math.pi - 0.3)
        m.box('main', (x0 + 0.6, 0.58, s * 0.41), (0.36, 0.02, 0.2), bevel=0.005)       # flat mudguard top
        m.cyl('dark', (x0 + 0.82, 0.58, s * 0.3), (x0 + 0.82, 0.7, s * 0.3), 0.012, seg=6)
        m.headlamp((x0 + 0.84, 0.74, s * 0.3), 0.05)
        m.box('main', (x0 + 0.1, 0.43, s * 0.48), (0.5, 0.025, 0.1), bevel=0.005)
    m.box('dark', (x0 + 0.98, 0.34, 0), (0.06, 0.08, 1.0), bevel=0.012)
    if closed:
        m.loft('main', [(x0 - 0.1, 0.46, 1.18, 0.48, 12), (x0 + 0.36, 0.46, 1.14, 0.46, 12)], seg=36, bevel=0.01)
        for z in (-0.2, 0.2): m.box(GLASS, (x0 + 0.365, 0.98, z), (0.012, 0.2, 0.36), bevel=0.0)
        for z in (-0.485, 0.485): m.box(GLASS, (x0 + 0.16, 0.98, z), (0.24, 0.18, 0.012), bevel=0.0)

def katyusha(m, tilt=0.38, px=-0.45, py=0.98):
    """the BM-13 launcher: eight rails on a tilted frame, a rocket on top of each and one below."""
    ct, st = math.cos(tilt), math.sin(tilt)
    at = lambda x, y: (px + x * ct - y * st, py + x * st + y * ct)
    for c in range(8):
        z = -0.42 + c * 0.12
        for off in (0.1, 0.14):
            m.box('dark', (at(0, off)[0], at(0, off)[1], z), (1.6, 0.012, 0.05), pitch=tilt, bevel=0.0)
        m.box('dark', (at(0, 0.12)[0], at(0, 0.12)[1], z), (1.6, 0.04, 0.01), pitch=tilt, bevel=0.0)
        for off in (0.2, 0.04):
            a = at(-0.72, off)
            m.lathe('main', [(0.0, 0.0), (0.035, 0.02), (0.038, 0.1), (0.038, 1.05), (0.05, 1.12), (0.052, 1.25), (0.03, 1.33), (0.0, 1.36)],
                    (a[0], a[1], z), (ct, st, 0), seg=14)
    for k in (-0.6, 0.1, 0.6):
        xa, ya = at(k, 0.06)
        m.box('main', (xa, ya, 0), (0.06, 0.06, 1.0), bevel=0.01, pitch=tilt)
    m.box('main', (px - 0.05, py - 0.22, 0), (0.18, 0.38, 0.5), bevel=0.02)
    m.cyl('dark', (px - 0.35, py - 0.4, 0), (px + 0.17, py, 0), 0.03)

def jeep():
    """GAZ-67B: narrow bonnet and radiator, cycle mudguards, an open body with low cut-outs, canvas
    top folded at the back, and a DT machine gun on a pintle."""
    m = Model('jeep')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.75, 0.07, 0.07), bevel=0.01)
    m.loft('main', [(-0.95, 0.36, 0.66, 0.4, 9), (0.25, 0.36, 0.68, 0.42, 10)], bevel=0.01)
    m.box('dark', (-0.35, 0.683, 0), (1.05, 0.01, 0.76), bevel=0.0)
    for z in (-0.422, 0.422): m.box('dark', (-0.1, 0.6, z), (0.4, 0.14, 0.01), bevel=0.0)
    m.loft('main', [(0.22, 0.48, 0.76, 0.24, 7), (0.9, 0.48, 0.74, 0.24, 7)], bevel=0.01)
    m.box('main', (0.92, 0.6, 0), (0.04, 0.3, 0.5), bevel=0.012)
    for k in range(8): m.box('dark', (0.945, 0.6, -0.16 + k * 0.045), (0.012, 0.24, 0.018), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (0.55, 0.24, s * 0.44), 0.27, 0.29, 0.17, 0.2, math.pi - 0.2)       # cycle mudguards
        m.arc('main', (-0.55, 0.24, s * 0.44), 0.27, 0.29, 0.17, 0.1, math.pi - 0.1)
        m.headlamp((0.85, 0.72, s * 0.3), 0.045)
    m.box('dark', (0.98, 0.3, 0), (0.06, 0.08, 0.96), bevel=0.012)
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.1)
    fr((0.28, 0.72, 0), (0.04, 0.04, 0.84)); fr((0.26, 1.02, 0), (0.035, 0.035, 0.84))
    for z in (-0.41, 0.41): fr((0.27, 0.87, z), (0.03, 0.3, 0.03))
    m.box(GLASS, (0.27, 0.87, 0), (0.012, 0.27, 0.78), bevel=0.0, pitch=-0.1)
    seat(m, -0.05, 0.72, -0.2); seat(m, -0.05, 0.72, 0.2); seat(m, -0.62, 0.72, 0, w=0.76)
    steering(m, 0.1, 0.88, -0.2)
    m.cyl('dark', (-0.9, 0.78, -0.42), (-0.9, 0.78, 0.42), 0.07, seg=14)                  # folded top
    m.cyl('main', (-0.38, 0.68, 0.0), (-0.38, 1.0, 0.0), 0.028)
    m.mg((-0.36, 1.05, 0), 0.6)
    for x in (0.55, -0.55):
        for z in (-0.44, 0.44): m.tyre((x, 0.24, z), 0.24, 0.16)
    m.finish()

def ambulance():
    """GAZ-55: the GAZ-AA bonnet and radiator in front of a tall wooden bus body that takes in the
    cab, a row of frosted windows along each side, two mushroom vents on the roof, double doors
    and a step at the back, red crosses on the sides and the roof."""
    m = Model('ambulance')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.8, 0.08, 0.08), bevel=0.01)
    zis_front(m, 0.0, closed=False)
    m.loft('main', [(-1.02, 0.46, 1.3, 0.5, 12), (0.3, 0.46, 1.3, 0.5, 12), (0.38, 0.5, 1.26, 0.49, 10)], seg=40, bevel=0.01)
    m.box('main', (0.4, 1.3, 0), (0.12, 0.03, 0.96), bevel=0.01)                                 # peak over the windscreen
    for z in (-0.21, 0.21): m.box(GLASS, (0.382, 0.98, z), (0.012, 0.22, 0.36), bevel=0.0)       # split windscreen
    for z in (-0.495, 0.495):
        m.box(GLASS, (0.16, 0.98, z), (0.26, 0.2, 0.012), bevel=0.0)                               # cab door window
        m.box('dark', (0.02, 0.8, z * 1.01), (0.012, 0.6, 0.012), bevel=0.0)                     # door shut line
        for x in (-0.84, -0.56, -0.28): m.box(WHITE, (x, 1.12, z), (0.2, 0.12, 0.012), bevel=0.0)    # frosted windows
        m.box(WHITE, (-0.5, 0.78, z), (0.36, 0.36, 0.012), bevel=0.0)
        m.box(RED, (-0.5, 0.78, z * 1.004), (0.26, 0.08, 0.012), bevel=0.0); m.box(RED, (-0.5, 0.78, z * 1.004), (0.08, 0.26, 0.012), bevel=0.0)
        m.box('main', (-0.35, 0.47, z * 1.04), (1.3, 0.03, 0.04), bevel=0.005)                   # rubbing strake
    m.box(WHITE, (-0.4, 1.305, 0), (0.46, 0.012, 0.46), bevel=0.0)
    m.box(RED, (-0.4, 1.313, 0), (0.32, 0.012, 0.1), bevel=0.0); m.box(RED, (-0.4, 1.313, 0), (0.1, 0.012, 0.32), bevel=0.0)
    for x in (-0.85, 0.05):                                                                       # roof vents
        m.cyl('dark', (x, 1.3, 0), (x, 1.38, 0), 0.03, seg=10)
        m.cyl('dark', (x, 1.38, 0), (x, 1.42, 0), 0.08, seg=14, r2=0.03)
    m.box('dark', (-1.026, 0.88, 0), (0.012, 0.76, 0.012), bevel=0.0)                              # rear doors
    for z in (-0.22, 0.22): m.box(WHITE, (-1.026, 1.1, z), (0.012, 0.14, 0.18), bevel=0.0)
    for z in (-0.4, 0.4): m.box('dark', (-1.035, 0.88, z), (0.02, 0.05, 0.03), bevel=0.0)
    m.box('dark', (-1.12, 0.4, 0), (0.16, 0.03, 0.5), bevel=0.005)                                 # step
    for x in (0.6, -0.62):
        for z in (-0.44, 0.44): m.tyre((x, 0.26, z), 0.26, 0.16)
    m.finish()

def engtruck():
    m = Model('engtruck')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    zis_front(m, 0.12)
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
    for x in (0.72, -0.55):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def apc():
    """BA-64: a little armoured car of sloped plates on four wheels with an open-topped
    eight-sided turret and a DT machine gun."""
    m = Model('apc')
    sec = lambda x, k, top: (x, [(0.36, -0.36 * k), (0.62, -0.46 * k), (top, -0.3 * k), (top, 0.3 * k), (0.62, 0.46 * k), (0.36, 0.36 * k)])
    m.loft_poly('main', [(-0.95, [(0.42, -0.3), (0.6, -0.38), (0.76, -0.22), (0.76, 0.22), (0.6, 0.38), (0.42, 0.3)]),
                         sec(-0.7, 1.0, 0.9), sec(0.35, 1.0, 0.9),
                         (0.98, [(0.44, -0.32), (0.58, -0.38), (0.66, -0.2), (0.66, 0.2), (0.58, 0.38), (0.44, 0.32)])], bevel=0.012)
    for s in (1, -1):
        for x in (0.55, -0.55): m.arc('main', (x, 0.26, s * 0.48), 0.28, 0.3, 0.18, 0.15, math.pi - 0.15)
        m.headlamp((0.9, 0.66, s * 0.28), 0.04, guard=True)
    m.box('dark', (0.7, 0.8, -0.14), (0.02, 0.03, 0.16), bevel=0.0, pitch=0.9)
    m.lathe('main', [(0.28, 0.0), (0.3, 0.0), (0.26, 0.26), (0.23, 0.26), (0.26, 0.02)], (-0.15, 0.9, 0), (0, 1, 0), seg=8, closed=True)
    m.cyl('dark', (-0.15, 0.9, 0), (-0.15, 0.92, 0), 0.26, seg=16)
    m.box('main', (0.12, 1.04, 0), (0.08, 0.1, 0.14), bevel=0.01)
    m.cyl('dark', (0.12, 1.05, 0), (0.55, 1.05, 0), 0.016, seg=8)
    m.cyl('dark', (0.1, 1.05, 0), (0.1, 1.1, 0), 0.06, seg=12)                          # DT's pan magazine
    for x in (0.55, -0.55):
        for z in (-0.48, 0.48): m.tyre((x, 0.26, z), 0.26, 0.17)
    m.finish()

def amphib():
    """T-38 amphibious light tank: a boat-shaped hull on small tracks, the turret offset to the
    left with its DT, and the propeller at the stern."""
    m = Model('amphib')
    for s in (1, -1):
        z = s * 0.46
        for k in range(2):
            bx = -0.4 + k * 0.62
            for d in (-0.1, 0.1): roadwheel(m, (bx + d, 0.12, z), 0.1, 0.07, dual=False)
            m.box('main', (bx, 0.2, z - s * 0.06), (0.26, 0.07, 0.05), bevel=0.01)
        sprocket(m, (0.72, 0.3, z), 0.12, 0.1, 10)
        m.lathe('main', [(0.0, -0.04), (0.1, -0.04), (0.11, 0.0), (0.1, 0.04), (0.0, 0.04)], (-0.8, 0.25, z), (0, 0, 1), seg=18)
        path = [(-0.62, 0.03), (0.5, 0.03)] + arc_pts(0.72, 0.3, 0.15, -1.9, 1.5, 7) + [(0.3, 0.45), (-0.5, 0.44)] + arc_pts(-0.8, 0.25, 0.14, 1.4, 4.4, 6)
        m.track_loop(path, z, 0.2)
    m.loft('main', [(-1.0, 0.36, 0.76, 0.42, 6), (-0.85, 0.26, 0.8, 0.56, 6), (0.55, 0.26, 0.8, 0.56, 6), (0.9, 0.36, 0.78, 0.44, 5),
                    (1.05, 0.55, 0.78, 0.26, 4)], seg=36, bevel=0.012)
    m.box('main', (0.62, 0.84, -0.18), (0.16, 0.1, 0.2), bevel=0.01)
    m.loft_poly('main', [(-0.3, [(0.8, -0.05), (1.02, -0.02), (1.02, 0.32), (0.8, 0.35)]), (0.15, [(0.8, -0.05), (1.02, -0.02), (1.02, 0.32), (0.8, 0.35)])], bevel=0.01)
    m.cyl('dark', (0.15, 0.93, 0.15), (0.45, 0.93, 0.15), 0.014, seg=8)
    m.cyl('dark', (-1.0, 0.36, 0), (-1.12, 0.36, 0), 0.025)
    for a in (0.3, 2.4, 4.5): m.box('dark', (-1.13, 0.36 + math.sin(a) * 0.06, math.cos(a) * 0.06), (0.03, 0.1, 0.05), bevel=0.004, roll=a)
    m.finish()

def tank_light():
    """T-70: a low angular hull, five road wheels a side, return rollers, the small faceted turret
    offset to the left with its 45 mm gun."""
    m = Model('tank_light')
    for s in (1, -1):
        z = s * 0.5
        for k in range(5):
            roadwheel(m, (-0.64 + k * 0.32, 0.14, z), 0.13, 0.1, dual=False)
            m.box('main', (-0.64 + k * 0.32 + 0.1, 0.24, z - s * 0.1), (0.2, 0.04, 0.04), pitch=0.3, bevel=0.005)
        for k in range(3): m.lathe('main', [(0.0, -0.04), (0.045, -0.04), (0.045, 0.04), (0.0, 0.04)], (-0.45 + k * 0.45, 0.44, z), (0, 0, 1), seg=12)
        sprocket(m, (0.82, 0.34, z), 0.13, 0.12, 11)
        m.lathe('main', [(0.0, -0.05), (0.11, -0.05), (0.12, 0.0), (0.11, 0.05), (0.0, 0.05)], (-0.86, 0.3, z), (0, 0, 1), seg=20)
        path = [(-0.72, 0.03), (0.6, 0.03)] + arc_pts(0.82, 0.34, 0.16, -1.9, 1.5, 8) + [(0.3, 0.5), (-0.5, 0.5)] + arc_pts(-0.86, 0.3, 0.155, 1.4, 4.4, 7)
        m.track_loop(path, z, 0.22)
        m.box('main', (0.0, 0.55, z), (1.9, 0.02, 0.24), bevel=0.006)
    m.loft('main', [(-0.9, 0.2, 0.56, 0.36, 10), (0.9, 0.2, 0.56, 0.36, 10)], bevel=0.01)
    m.loft_poly('main', [(-0.95, [(0.54, -0.6), (0.76, -0.55), (0.76, 0.55), (0.54, 0.6)]), (0.4, [(0.54, -0.6), (0.8, -0.55), (0.8, 0.55), (0.54, 0.6)]),
                         (0.98, [(0.44, -0.5), (0.52, -0.45), (0.52, 0.45), (0.44, 0.5)])], bevel=0.012)
    m.box('main', (0.62, 0.72, -0.25), (0.14, 0.1, 0.22), bevel=0.01, pitch=0.5)
    m.loft_poly('main', [(-0.4, [(0.8, -0.2), (1.02, -0.14), (1.02, 0.4), (0.8, 0.46)]), (0.1, [(0.8, -0.22), (1.06, -0.14), (1.06, 0.42), (0.8, 0.48)]),
                         (0.3, [(0.8, -0.1), (1.0, -0.05), (1.0, 0.33), (0.8, 0.38)])], bevel=0.01)
    m.lathe('main', [(0.04, 0.0), (0.035, 0.2), (0.028, 0.25), (0.028, 0.72), (0.034, 0.74), (0.0, 0.74)], (0.3, 0.94, 0.12), (1, 0, 0), seg=14)
    m.cyl('main', (-0.12, 1.03, 0.14), (-0.12, 1.06, 0.14), 0.1, seg=18)
    for k in range(5): m.box('dark', (-0.75 + k * 0.05, 0.765, 0), (0.02, 0.012, 0.6), bevel=0.0)
    m.finish()

def tank():
    """T-34/76 (1943): sloped glacis and sponsons, five big Christie road wheels and the drive
    sprocket at the back, the hexagonal turret with its 76 mm gun and two round hatches, grab
    rails, external fuel tanks and spare track links."""
    m = Model('tank')
    for s in (1, -1):
        z = s * 0.66
        for k in range(5):
            roadwheel(m, (-0.9 + k * 0.44, 0.22, z), 0.21, 0.1, spokes=8)
        sprocket(m, (-1.2, 0.36, z), 0.19, 0.16, 12)                                    # drive at the rear
        m.lathe('main', [(0.0, -0.07), (0.17, -0.07), (0.18, 0.0), (0.17, 0.07), (0.0, 0.07)], (1.16, 0.36, z), (0, 0, 1), seg=22)
        path = [(-1.0, 0.03), (0.95, 0.03)] + arc_pts(1.16, 0.36, 0.21, -1.8, 1.6, 8) + [(0.7, 0.46), (-0.1, 0.46), (-0.8, 0.46)] + arc_pts(-1.2, 0.36, 0.22, 1.6, 4.4, 8)
        m.track_loop(path, z, 0.34)
    m.loft('main', [(-1.22, 0.24, 0.6, 0.48, 10), (1.1, 0.24, 0.6, 0.48, 10)], bevel=0.01)
    # hull with sloped sides over the tracks and the long sloped glacis
    h = lambda x, top, w: (x, [(0.56, -0.83), (top, -w), (top, w), (0.56, 0.83)])
    m.loft_poly('main', [h(-1.3, 0.8, 0.62), h(-1.18, 0.88, 0.66), h(0.35, 0.9, 0.66), (1.32, [(0.42, -0.8), (0.52, -0.66), (0.52, 0.66), (0.42, 0.8)])], bevel=0.012)
    m.box('main', (0.82, 0.74, -0.24), (0.22, 0.05, 0.22), bevel=0.02, pitch=0.42)       # driver's hatch
    m.lathe('main', [(0.0, -0.03), (0.06, -0.02), (0.07, 0.03), (0.0, 0.06)], (0.9, 0.71, 0.3), (0.9, 0.42, 0), seg=16)
    m.cyl('dark', (0.94, 0.72, 0.3), (1.08, 0.66, 0.3), 0.014, seg=8)
    for k in range(3): m.box('dark', (0.6 + k * 0.14, 0.82 - k * 0.06, 0.05), (0.1, 0.02, 0.42), bevel=0.004, pitch=0.42)   # spare links
    m.headlamp((1.1, 0.64, -0.5), 0.04)
    for s in (1, -1):
        m.cyl('main', (-1.05, 0.8, s * 0.72), (-0.5, 0.8, s * 0.72), 0.1, seg=16, bevel=0.01)   # fuel tanks
        for x in (-0.3, 0.3): m.box('main', (x, 0.93, s * 0.55), (0.25, 0.02, 0.02), bevel=0.0)
    for k in range(8): m.box('dark', (-1.1 + k * 0.05, 0.905, 0), (0.02, 0.012, 0.9), bevel=0.0)
    m.cyl('dark', (-1.34, 0.66, -0.3), (-1.4, 0.66, -0.3), 0.05, seg=12); m.cyl('dark', (-1.34, 0.66, 0.3), (-1.4, 0.66, 0.3), 0.05, seg=12)
    hx = lambda x, w, top: (x, [(0.9, -w), (1.1, -w - 0.06), (top, -w + 0.1), (top, w - 0.1), (1.1, w + 0.06), (0.9, w)])
    m.loft_poly('main', [hx(-0.78, 0.4, 1.24), hx(-0.6, 0.48, 1.28), hx(0.15, 0.48, 1.28), hx(0.4, 0.34, 1.22)], bevel=0.012)
    m.loft('main', [(0.38, 0.96, 1.22, 0.24, 3), (0.52, 0.98, 1.2, 0.2, 3)], seg=24)      # mantlet
    m.lathe('main', [(0.05, 0.0), (0.042, 0.3), (0.036, 0.35), (0.036, 1.1), (0.044, 1.12), (0.0, 1.12)], (0.52, 1.09, 0), (1, 0, 0), seg=16)
    for z in (-0.2, 0.2): m.cyl('main', (-0.3, 1.28, z), (-0.3, 1.31, z), 0.12, seg=20, bevel=0.01)   # the two hatches
    for s in (1, -1): m.box('main', (-0.2, 1.1, s * 0.56), (0.5, 0.02, 0.02), bevel=0.0)   # grab rails
    m.cyl('dark', (-0.6, 1.28, 0.35), (-0.6, 2.0, 0.35), 0.006, seg=6)
    m.finish()

def tank_heavy():
    """IS-2: a long hull with a stepped nose, six road wheels and three return rollers, the drive
    sprocket at the back, the big cast turret with the 122 mm gun and its muzzle brake, the DShK
    on the cupola and fuel tanks on the rear."""
    m = Model('tank_heavy')
    for s in (1, -1):
        z = s * 0.8
        for k in range(6): roadwheel(m, (-1.02 + k * 0.4, 0.17, z), 0.16, 0.12, spokes=6)
        for k in range(3): m.lathe('main', [(0.0, -0.05), (0.05, -0.05), (0.05, 0.05), (0.0, 0.05)], (-0.7 + k * 0.7, 0.6, z), (0, 0, 1), seg=12)
        sprocket(m, (-1.36, 0.42, z), 0.19, 0.2, 14)
        m.lathe('main', [(0.0, -0.08), (0.16, -0.08), (0.17, 0.0), (0.16, 0.08), (0.0, 0.08)], (1.3, 0.4, z), (0, 0, 1), seg=24)
        path = [(-1.15, 0.03), (1.08, 0.03)] + arc_pts(1.3, 0.4, 0.2, -1.8, 1.6, 8) + [(0.8, 0.66), (0.0, 0.66), (-0.8, 0.66)] + arc_pts(-1.36, 0.42, 0.22, 1.5, 4.4, 8)
        m.track_loop(path, z, 0.38)
        m.box('main', (0.0, 0.72, z), (2.8, 0.022, 0.42), bevel=0.006)
        m.cyl('main', (-1.35, 0.85, s * 0.6), (-1.35, 0.85, s * 0.9), 0.12, seg=16)     # rear fuel tanks
    m.loft('main', [(-1.35, 0.22, 0.66, 0.58, 10), (1.2, 0.22, 0.66, 0.58, 10)], bevel=0.01)
    m.loft_poly('main', [(-1.42, [(0.64, -0.96), (0.94, -0.9), (0.94, 0.9), (0.64, 0.96)]), (0.7, [(0.64, -0.96), (0.98, -0.9), (0.98, 0.9), (0.64, 0.96)]),
                         (1.1, [(0.6, -0.9), (0.84, -0.84), (0.84, 0.84), (0.6, 0.9)]), (1.42, [(0.44, -0.62), (0.62, -0.6), (0.62, 0.6), (0.44, 0.62)])], bevel=0.014)
    m.box('main', (0.95, 0.9, -0.3), (0.1, 0.1, 0.3), bevel=0.01, pitch=0.3)
    for s in (1, -1): m.headlamp((1.3, 0.72, s * 0.6), 0.045, guard=True)
    for k in range(10): m.box('dark', (-1.25 + k * 0.05, 0.945, 0), (0.02, 0.012, 1.2), bevel=0.0)
    m.loft('main', [(-1.1, 0.96, 1.3, 0.46, 2.6), (-0.95, 0.94, 1.42, 0.62, 2.8), (0.25, 0.94, 1.44, 0.66, 2.9), (0.55, 0.96, 1.34, 0.5, 2.6)], seg=44)
    m.loft('main', [(0.5, 1.0, 1.36, 0.36, 3), (0.72, 1.02, 1.32, 0.3, 3)], seg=28)
    m.lathe('main', [(0.07, 0.0), (0.06, 0.3), (0.05, 0.35), (0.05, 1.9), (0.08, 1.92), (0.08, 1.99), (0.058, 2.0), (0.058, 2.04), (0.08, 2.05), (0.08, 2.14), (0.0, 2.14)], (0.72, 1.17, 0), (1, 0, 0), seg=18)
    m.lathe('main', [(0.17, 0.0), (0.17, 0.1), (0.12, 0.13), (0.0, 0.14)], (-0.55, 1.42, 0.3), (0, 1, 0), seg=24)
    m.cyl('main', (-0.55, 1.55, 0.3), (-0.55, 1.68, 0.3), 0.02, seg=8)
    m.mg((-0.53, 1.72, 0.3), 0.7)                                                       # DShK
    m.cyl('main', (-0.3, 1.44, -0.3), (-0.3, 1.47, -0.3), 0.13, seg=20)
    m.cyl('dark', (-0.9, 1.4, -0.45), (-0.9, 2.2, -0.45), 0.007, seg=6)
    m.finish()

def rockets():
    """the BM-13 'Katyusha' on the ZiS-6: the ZiS cab and bonnet, six wheels, eight rails and
    sixteen rockets, stabiliser jacks."""
    m = Model('rockets')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.34, z), (2.5, 0.1, 0.08), bevel=0.01)
    zis_front(m, 0.42)
    m.box('main', (-0.55, 0.5, 0), (1.6, 0.1, 0.96), bevel=0.02)
    katyusha(m)
    for z in (-0.5, 0.5):
        m.cyl('main', (-1.2, 0.5, z), (-1.3, 0.08, z * 1.12), 0.035)
        m.cyl('main', (-1.3, 0.06, z * 1.12), (-1.3, 0.02, z * 1.12), 0.08)
    for x in (1.0, -0.35, -0.85):
        for z in (-0.5, 0.5): m.tyre((x, 0.28, z), 0.28, 0.19)
    m.finish()

def heli():
    """Kamov A-7 autogyro: two open cockpits in a slim fuselage, a radial engine and propeller in
    the nose, stub wings, a tripod pylon for the three-blade rotor, and fixed wheels. Armed for
    the game with MG pods."""
    m = Model('heli')
    m.lathe('main', [(0.1, 0.0), (0.2, 0.02), (0.21, 0.1), (0.2, 0.18)], (1.0, 0.0, 0), (-1, 0, 0), seg=28)   # cowling
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (1.0, 0.0, 0), (-1, 0, 0), seg=20)
    m.prop('dark', (1.01, 0, 0), 0.38, blades=2, spinner=0.06)
    m.loft('main', [(0.85, -0.2, 0.2, 0.2, 2.3), (0.3, -0.24, 0.2, 0.22, 2.4), (-0.4, -0.16, 0.18, 0.16, 2.3), (-1.3, 0.05, 0.2, 0.06, 2.1), (-1.6, 0.1, 0.2, 0.03, 2.0)], seg=32)
    for x in (0.35, -0.1): m.box('dark', (x, 0.2, 0), (0.3, 0.012, 0.3), bevel=0.0)       # the two cockpits
    for x in (0.52, 0.07): m.box(GLASS, (x, 0.28, 0), (0.02, 0.12, 0.28), bevel=0.0, pitch=-0.5)
    m.wing('main', [(-0.7, 0.3, 0.2, -0.1), (0.0, 0.35, 0.3, -0.1), (0.7, 0.3, 0.2, -0.1)], thick=0.12)   # stub wings
    m.wing('main', [(-0.35, -1.35, 0.2, 0.1), (0.0, -1.3, 0.26, 0.1), (0.35, -1.35, 0.2, 0.1)], thick=0.1)
    m.wing('main', [(0.15, -1.3, 0.3, 0), (0.5, -1.42, 0.2, 0), (0.62, -1.5, 0.1, 0)], thick=0.1, vertical=True)
    for z in (-0.12, 0.12): m.cyl('main', (0.2, 0.15, z), (0.15, 0.78, 0), 0.02, seg=8)   # rotor pylon
    m.cyl('main', (-0.05, 0.15, 0), (0.15, 0.78, 0), 0.02, seg=8)
    for z in (-0.35, 0.35):
        m.cyl('main', (0.3, -0.2, z * 0.5), (0.3, -0.52, z), 0.02, seg=8)
        m.lathe('dark', [(0.04, -0.03), (0.08, -0.03), (0.09, 0.0), (0.08, 0.03), (0.04, 0.03)], (0.3, -0.55, z), (0, 0, 1), seg=18, closed=True)
        m.cyl('dark', (0.0, -0.08, z * 1.7), (0.45, -0.08, z * 1.7), 0.045, seg=14)       # MG pods
    m.cyl('main', (-1.4, 0.05, 0), (-1.45, -0.12, 0), 0.015, seg=6)
    m.cyl('rotor', (0, -0.04, 0), (0, 0.06, 0), 0.08, seg=18, bevel=0.01)
    for i in range(3):
        a = i / 3 * 2 * math.pi
        m.box('rotor', (math.cos(a) * 0.7, 0.02, math.sin(a) * 0.7), (1.26, 0.02, 0.1), bevel=0.008, yaw=-a, roll=0.06)
    m.finish()

def fighter():
    """Yakovlev Yak-3: slim fuselage, bubble canopy, the belly radiator under the wing, a short
    tapered wing and a three-blade prop."""
    m = Model('fighter')
    fuselage(m, [(0.92, -0.1, 0.1, 0.1, 2.2), (0.6, -0.13, 0.14, 0.12, 2.3), (0.2, -0.15, 0.15, 0.12, 2.3), (-0.2, -0.13, 0.14, 0.1, 2.3),
                 (-0.55, -0.08, 0.11, 0.065, 2.2), (-0.88, -0.02, 0.1, 0.02, 2.0)])
    m.loft('main', [(0.1, -0.15, -0.1, 0.07, 2.4), (-0.1, -0.24, -0.1, 0.08, 3), (-0.3, -0.22, -0.1, 0.07, 3), (-0.42, -0.12, -0.08, 0.03, 2.4)], seg=24)
    canopy(m, [(0.25, 0.12, 0.13, 0.07, 2), (0.15, 0.1, 0.25, 0.08, 2), (-0.05, 0.1, 0.25, 0.08, 2), (-0.2, 0.1, 0.16, 0.06, 2), (-0.3, 0.11, 0.12, 0.02, 2)],
           frames=[(0.16, 0.1, 0.24, 0.078)])
    m.wing('main', [(-0.95, 0.12, 0.14, -0.05), (-0.88, 0.17, 0.24, -0.06), (-0.45, 0.25, 0.36, -0.08), (0.0, 0.3, 0.46, -0.1),
                    (0.45, 0.25, 0.36, -0.08), (0.88, 0.17, 0.24, -0.06), (0.95, 0.12, 0.14, -0.05)], thick=0.12)
    m.wing('main', [(-0.36, -0.66, 0.1, 0.04), (-0.3, -0.62, 0.16, 0.04), (0.0, -0.6, 0.22, 0.04), (0.3, -0.62, 0.16, 0.04), (0.36, -0.66, 0.1, 0.04)], thick=0.1)
    m.wing('main', [(0.05, -0.58, 0.3, 0), (0.2, -0.66, 0.22, 0), (0.3, -0.74, 0.12, 0)], thick=0.1, vertical=True)
    for s in (1, -1):
        for k in range(5): m.box('dark', (0.62 - k * 0.05, 0.03, s * 0.115), (0.03, 0.025, 0.02), bevel=0.003)
    m.cyl('dark', (0.7, 0.1, 0.05), (0.95, 0.1, 0.05), 0.01, seg=8)
    m.prop('dark', (0.93, 0, 0), 0.35, blades=3, spinner=0.09)
    m.finish()

def attacker():
    """Ilyushin Il-2 Shturmovik: the armoured nose, the long two-seat canopy with the rear gunner's
    UBT, landing gear fairings under the wings, rockets on rails and the wing cannons."""
    m = Model('attacker')
    fuselage(m, [(0.95, -0.12, 0.08, 0.12, 2.6), (0.7, -0.2, 0.14, 0.15, 3), (0.2, -0.2, 0.16, 0.15, 3), (-0.3, -0.15, 0.15, 0.12, 2.6),
                 (-0.7, -0.08, 0.12, 0.06, 2.3), (-1.0, -0.02, 0.1, 0.02, 2.0)])
    m.lathe('main', [(0.08, 0.0), (0.12, 0.05), (0.12, 0.1)], (0.95, -0.02, 0), (-1, 0, 0), seg=20)
    canopy(m, [(0.4, 0.12, 0.14, 0.09, 3), (0.3, 0.12, 0.28, 0.1, 3.5), (-0.25, 0.12, 0.27, 0.09, 3.5), (-0.35, 0.12, 0.17, 0.07, 3)],
           frames=[(0.2, 0.12, 0.28, 0.098), (0.0, 0.12, 0.28, 0.098), (-0.18, 0.12, 0.27, 0.09)])
    m.cyl('dark', (-0.3, 0.25, 0), (-0.55, 0.28, 0), 0.012, seg=8)
    m.wing('main', [(-1.2, 0.08, 0.2, 0.0), (-1.1, 0.16, 0.32, -0.02), (-0.5, 0.3, 0.52, -0.1), (0.0, 0.34, 0.6, -0.12),
                    (0.5, 0.3, 0.52, -0.1), (1.1, 0.16, 0.32, -0.02), (1.2, 0.08, 0.2, 0.0)], thick=0.14)
    for s in (1, -1):
        m.loft('main', [(0.35, -0.2, -0.08, 0.04, 2.2, s * 0.42), (0.15, -0.26, -0.08, 0.07, 2.4, s * 0.42), (-0.25, -0.2, -0.08, 0.05, 2.2, s * 0.42)], seg=18)   # gear fairing
        for k in range(2):                                                           # RS-82 rockets
            z = s * (0.65 + k * 0.16)
            m.box('main', (0.05, -0.16, z), (0.24, 0.02, 0.012), bevel=0.0)
            m.lathe('dark', [(0.0, 0.0), (0.03, 0.04), (0.03, 0.2), (0.0, 0.26)], (-0.1, -0.2, z), (1, 0, 0), seg=10)
        m.cyl('dark', (0.28, -0.08, s * 0.5), (0.5, -0.08, s * 0.5), 0.016, seg=8)          # cannon
    m.wing('main', [(-0.42, -0.8, 0.12, 0.05), (-0.36, -0.75, 0.2, 0.05), (0.0, -0.72, 0.26, 0.05), (0.36, -0.75, 0.2, 0.05), (0.42, -0.8, 0.12, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -0.72, 0.32, 0), (0.24, -0.8, 0.24, 0), (0.34, -0.88, 0.12, 0)], thick=0.1, vertical=True)
    m.prop('dark', (0.97, -0.02, 0), 0.4, blades=3, spinner=0.08)
    m.finish()

def bomber():
    """Petlyakov Pe-2: a slim fuselage, the small glazed nose, two inline engines with pointed
    spinners, and twin fins at the ends of the dihedral tailplane."""
    m = Model('bomber')
    fuselage(m, [(1.2, -0.14, 0.12, 0.13, 2.2), (0.8, -0.2, 0.2, 0.17, 2.4), (-0.4, -0.18, 0.18, 0.15, 2.4), (-1.1, -0.08, 0.12, 0.07, 2.2), (-1.45, -0.02, 0.08, 0.02, 2.0)], seg=36)
    m.loft(GLASS, [(1.18, -0.14, 0.12, 0.13, 2.2), (1.35, -0.08, 0.06, 0.08, 2.1), (1.45, -0.02, 0.0, 0.02, 2.0)], seg=24)
    canopy(m, [(0.9, 0.14, 0.16, 0.12, 2.6), (0.75, 0.14, 0.3, 0.12, 2.8), (0.25, 0.14, 0.28, 0.1, 2.8), (0.1, 0.15, 0.2, 0.05, 2.4)], frames=[(0.55, 0.14, 0.3, 0.12)])
    m.wing('main', [(-1.6, 0.18, 0.26, 0.02), (-1.45, 0.3, 0.42, 0.0), (-0.6, 0.45, 0.7, -0.05), (0.0, 0.48, 0.76, -0.06),
                    (0.6, 0.45, 0.7, -0.05), (1.45, 0.3, 0.42, 0.0), (1.6, 0.18, 0.26, 0.02)], thick=0.13)
    for z in (-0.56, 0.56):
        m.loft('main', [(0.95, -0.02, 0.06, 0.05, 2.2, z), (0.78, -0.12, 0.13, 0.12, 2.4, z), (0.2, -0.13, 0.1, 0.11, 2.4, z), (-0.35, -0.04, 0.05, 0.04, 2.2, z)], seg=24)
        m.prop('dark', (0.95, 0.02, z), 0.38, blades=3, spinner=0.07)
    m.wing('main', [(-0.62, -1.1, 0.2, 0.14), (-0.5, -1.05, 0.3, 0.12), (0.0, -1.0, 0.36, 0.08), (0.5, -1.05, 0.3, 0.12), (0.62, -1.1, 0.2, 0.14)], thick=0.1)
    for z in (-0.62, 0.62):
        m.wing('main', [(0.02, -1.08, 0.3, z), (0.2, -1.1, 0.26, z), (0.32, -1.14, 0.16, z)], thick=0.1, vertical=True)
        m.wing('main', [(-0.02, -1.08, 0.3, z), (-0.14, -1.1, 0.22, z)], thick=0.1, vertical=True)
    m.box('dark', (0.2, -0.185, 0), (0.5, 0.012, 0.16), bevel=0.0)
    m.finish()

def transport():
    """Lisunov Li-2: the licence-built DC-3 with its own windows, the dorsal gun turret and the
    extra crew door."""
    m = Model('transport')
    fuselage(m, [(1.55, -0.05, 0.05, 0.06, 2), (1.45, -0.17, 0.2, 0.18, 2.1), (1.2, -0.26, 0.29, 0.26, 2.2), (0.6, -0.28, 0.31, 0.27, 2.3),
                 (-0.7, -0.25, 0.29, 0.25, 2.3), (-1.3, -0.08, 0.22, 0.13, 2.2), (-1.6, 0.06, 0.16, 0.04, 2.0)], seg=40)
    for z in (-0.1, 0.1): m.box(GLASS, (1.33, 0.18, z * 1.2), (0.12, 0.07, 0.1), bevel=0.0, yaw=-z * 3, pitch=-0.4)
    for s in (1, -1):
        for k in range(5): m.box(GLASS, (0.7 - k * 0.24, 0.1, s * 0.275), (0.08, 0.1, 0.012), bevel=0.0)
    m.lathe(GLASS, [(0.0, 0.14), (0.09, 0.11), (0.13, 0.04), (0.14, 0.0)], (0.15, 0.3, 0), (0, 1, 0), seg=24)   # MV-3 turret
    m.cyl('dark', (0.15, 0.4, 0), (-0.2, 0.42, 0), 0.012, seg=8)
    m.box('dark', (-0.65, -0.02, -0.265), (0.2, 0.34, 0.012), bevel=0.0)
    m.wing('main', [(-2.0, 0.2, 0.3, -0.02), (-1.2, 0.35, 0.6, -0.1), (-0.3, 0.55, 0.98, -0.18), (0.0, 0.58, 1.0, -0.2),
                    (0.3, 0.55, 0.98, -0.18), (1.2, 0.35, 0.6, -0.1), (2.0, 0.2, 0.3, -0.02)], thick=0.15)
    for z in (-0.72, 0.72): nacelle(m, 0.95, -0.1, z, 0.2, 1.0, 0.45)
    m.wing('main', [(-0.85, -1.1, 0.25, 0.08), (-0.7, -1.05, 0.38, 0.08), (0.0, -1.0, 0.48, 0.08), (0.7, -1.05, 0.38, 0.08), (0.85, -1.1, 0.25, 0.08)], thick=0.1)
    m.wing('main', [(0.15, -0.95, 0.62, 0), (0.45, -1.1, 0.46, 0), (0.8, -1.3, 0.28, 0), (0.88, -1.35, 0.18, 0)], thick=0.1, vertical=True)
    m.finish()

def hq():
    """the headquarters: a log-built dugout command post under an earth mound, with a log
    doorway, firing slit, periscope, radio mast, flag and stacked ammunition boxes."""
    m = Model('hq')
    m.loft('main', [(-1.6, 0.0, 0.3, 1.2, 2.5), (-1.2, 0.0, 1.0, 1.6, 2.6), (0.9, 0.0, 1.1, 1.65, 2.6), (1.35, 0.0, 0.7, 1.4, 2.5), (1.55, 0.0, 0.2, 1.0, 2.4)], seg=40)   # the mound
    for k in range(6):                                                              # the log front wall
        y = 0.08 + k * 0.13
        m.cyl('dark', (1.36, y, -0.75), (1.36, y, 0.75), 0.065, seg=10)
        for s in (-0.78, 0.78): m.cyl('dark', (1.33, y, s), (1.39, y, s), 0.07, seg=10)
    m.box('main', (1.42, 0.35, 0.2), (0.03, 0.62, 0.32), bevel=0.0)                  # doorway
    m.box('main', (1.42, 0.62, -0.35), (0.03, 0.08, 0.36), bevel=0.0)               # firing slit
    for k in range(3): m.cyl('dark', (1.3, 0.9, -0.9 + k * 0.1), (1.6, 0.9, -0.9 + k * 0.1), 0.05, seg=8)   # roof logs over the entrance
    m.cyl('main', (0.3, 1.0, 0.4), (0.3, 1.5, 0.4), 0.04, seg=10)                     # periscope
    m.box('main', (0.35, 1.52, 0.4), (0.12, 0.08, 0.06), bevel=0.01)
    m.cyl('main', (-0.6, 1.0, -0.6), (-0.6, 3.2, -0.6), 0.025, seg=8)                   # radio mast
    for a in (0.5, 2.6, 4.7): m.cyl('dark', (-0.6, 3.0, -0.6), (-0.6 + math.cos(a) * 1.0, 0.9, -0.6 + math.sin(a) * 1.0), 0.004, seg=4)
    m.cyl('main', (0.8, 1.0, -0.9), (0.8, 2.9, -0.9), 0.02, seg=8)                     # flag
    m.fin('main', [(0.8, 2.88), (1.45, 2.85), (1.42, 2.45), (0.8, 2.5)], -0.9, 0.012)
    for k in range(6): m.box('main', (1.6 + (k % 2) * 0.28, 0.08 + (k // 2) * 0.16, 1.2), (0.26, 0.15, 0.4), bevel=0.01)   # ammunition boxes
    m.finish()

MODELS = {'jeep': jeep, 'ambulance': ambulance, 'engtruck': engtruck, 'apc': apc, 'amphib': amphib, 'tank_light': tank_light, 'tank': tank,
          'tank_heavy': tank_heavy, 'rockets': rockets, 'heli': heli, 'fighter': fighter, 'attacker': attacker, 'bomber': bomber,
          'transport': transport, 'hq': hq}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
