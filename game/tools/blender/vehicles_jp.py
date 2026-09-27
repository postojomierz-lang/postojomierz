# The Imperial Japanese Army's vehicles, aircraft and headquarters, built with the tools in
# vehicles.py: Kurogane Type 95, Isuzu Type 94 (ambulance and engineers), Type 1 Ho-Ha half-track,
# Type 2 Ka-Mi amphibious tank, Type 95 Ha-Go, Type 97 Chi-Ha, Type 4 Chi-To, an Isuzu with 20 cm
# rocket rails, the Kayaba Ka-1 autogyro, A6M Zero, D3A 'Val', G4M 'Betty', the Ki-57 transport and
# a field headquarters house.
# Written to .cache/figures/vehicles/jp; tools/figures.mjs packs them into public/nation-jp.js.
#
#   python tools/blender/vehicles_jp.py [name ...]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehicles
from vehicles import (Model, clear, GLASS, LIGHT, WHITE, RED, seat, steering, bogie, roadwheel, sprocket, arc_pts,
                      nacelle, fuselage, canopy)

vehicles.OUT = os.path.join(vehicles.OUT, 'jp')

def isuzu_front(m, x0=0.1):
    """Isuzu Type 94: a narrow rounded bonnet, a flat radiator, curved mudguards and a boxy cab."""
    m.loft('main', [(x0 + 0.35, 0.5, 0.84, 0.27, 5), (x0 + 0.86, 0.5, 0.8, 0.25, 4)], seg=32, bevel=0.01)
    m.box('main', (x0 + 0.88, 0.64, 0), (0.04, 0.34, 0.48), bevel=0.02)
    for k in range(9): m.box('dark', (x0 + 0.9, 0.64, -0.18 + k * 0.045), (0.012, 0.28, 0.016), bevel=0.0)
    for s in (1, -1):
        m.arc('main', (x0 + 0.58, 0.27, s * 0.41), 0.3, 0.33, 0.2, -0.2, math.pi - 0.15)
        m.headlamp((x0 + 0.8, 0.64, s * 0.34), 0.05)
        m.box('main', (x0 + 0.05, 0.43, s * 0.48), (0.5, 0.025, 0.1), bevel=0.005)
    m.box('dark', (x0 + 0.96, 0.34, 0), (0.06, 0.08, 1.0), bevel=0.012)
    m.loft('main', [(x0 - 0.12, 0.46, 1.16, 0.48, 9), (x0 + 0.36, 0.46, 1.1, 0.46, 9)], seg=36, bevel=0.01)
    for z in (-0.2, 0.2): m.box(GLASS, (x0 + 0.365, 0.96, z), (0.012, 0.2, 0.36), bevel=0.0)
    for z in (-0.485, 0.485): m.box(GLASS, (x0 + 0.15, 0.96, z), (0.24, 0.18, 0.012), bevel=0.0)

def track_side(m, z, wheels, sp, idl, top, width, return_rollers=()):
    """a track run: road wheels [(x, r)], sprocket and idler (x, y, r), the top run's height."""
    for x, r in wheels: roadwheel(m, (x, r + 0.01, z), r, 0.08, dual=False)
    for x in return_rollers: m.lathe('main', [(0.0, -0.04), (0.045, -0.04), (0.045, 0.04), (0.0, 0.04)], (x, top - 0.06, z), (0, 0, 1), seg=12)
    sprocket(m, (sp[0], sp[1], z), sp[2], width * 0.6, 11)
    m.lathe('main', [(0.0, -0.05), (idl[2] * 0.9, -0.05), (idl[2], 0.0), (idl[2] * 0.9, 0.05), (0.0, 0.05)], (idl[0], idl[1], z), (0, 0, 1), seg=20)
    front, back = (sp, idl) if sp[0] > idl[0] else (idl, sp)
    path = [(back[0] + 0.1, 0.03), (front[0] - 0.15, 0.03)] + arc_pts(front[0], front[1], front[2] + 0.03, -1.9, 1.5, 7) + \
           [(front[0] - 0.3, top), (back[0] + 0.3, top)] + arc_pts(back[0], back[1], back[2] + 0.03, 1.5, 4.5, 7)
    m.track_loop(path, z, width)

def jeep():
    """Kurogane Type 95: a small open two-seater with a rounded nose, big mudguards, the spare
    wheel at the back and a Type 99 light machine gun on a pintle."""
    m = Model('jeep')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.7, 0.07, 0.07), bevel=0.01)
    m.loft('main', [(-0.92, 0.38, 0.64, 0.38, 5), (-0.8, 0.34, 0.68, 0.42, 7), (0.2, 0.34, 0.68, 0.42, 8), (0.3, 0.36, 0.68, 0.42, 8)], bevel=0.01)
    m.box('dark', (-0.3, 0.683, 0), (0.95, 0.01, 0.76), bevel=0.0)
    m.loft('main', [(0.28, 0.46, 0.76, 0.3, 4), (0.8, 0.46, 0.72, 0.27, 3), (0.95, 0.46, 0.64, 0.22, 2.6)], seg=32, bevel=0.01)
    m.box('main', (0.95, 0.56, 0), (0.03, 0.2, 0.3), bevel=0.01)
    for k in range(6): m.box('dark', (0.965, 0.56, -0.12 + k * 0.048), (0.012, 0.16, 0.016), bevel=0.0)
    for s in (1, -1):
        for x in (0.55, -0.55): m.arc('main', (x, 0.25, s * 0.44), 0.28, 0.3, 0.18, 0.05, math.pi - 0.05)
        m.headlamp((0.82, 0.68, s * 0.34), 0.045)
    m.box('dark', (0.99, 0.3, 0), (0.06, 0.08, 0.96), bevel=0.012)
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.12)
    fr((0.3, 0.72, 0), (0.04, 0.04, 0.84)); fr((0.28, 1.0, 0), (0.035, 0.035, 0.84))
    for z in (-0.41, 0.41): fr((0.29, 0.86, z), (0.03, 0.28, 0.03))
    m.box(GLASS, (0.29, 0.86, 0), (0.012, 0.26, 0.78), bevel=0.0, pitch=-0.12)
    seat(m, -0.02, 0.72, -0.2); seat(m, -0.02, 0.72, 0.2); seat(m, -0.55, 0.72, 0, w=0.76)
    steering(m, 0.14, 0.88, -0.2)
    m.lathe('dark', [(0.12, -0.07), (0.2, -0.07), (0.22, 0.0), (0.2, 0.07), (0.12, 0.07)], (-1.0, 0.55, 0), (1, 0, 0), seg=28, closed=True)
    m.cyl('dark', (-0.85, 0.78, -0.42), (-0.85, 0.78, 0.42), 0.07, seg=14)
    m.cyl('main', (-0.36, 0.68, 0.0), (-0.36, 1.0, 0.0), 0.028)
    m.mg((-0.34, 1.05, 0), 0.6)
    for x in (0.55, -0.55):
        for z in (-0.44, 0.44): m.tyre((x, 0.25, z), 0.25, 0.15)
    m.finish()

def ambulance():
    m = Model('ambulance')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.8, 0.08, 0.08), bevel=0.01)
    isuzu_front(m, 0.05)
    m.loft('main', [(-1.0, 0.5, 1.34, 0.5, 10), (-0.08, 0.5, 1.34, 0.5, 10)], seg=40, bevel=0.01)
    for z in (-0.506, 0.506):
        m.box(WHITE, (-0.52, 0.95, z), (0.46, 0.46, 0.012), bevel=0.0)
        m.box(RED, (-0.52, 0.95, z * 1.004), (0.3, 0.09, 0.012), bevel=0.0); m.box(RED, (-0.52, 0.95, z * 1.004), (0.09, 0.3, 0.012), bevel=0.0)
    m.box(WHITE, (-0.52, 1.342, 0), (0.46, 0.012, 0.46), bevel=0.0)
    m.box(RED, (-0.52, 1.35, 0), (0.3, 0.012, 0.09), bevel=0.0); m.box(RED, (-0.52, 1.35, 0), (0.09, 0.012, 0.3), bevel=0.0)
    for x in (0.63, -0.6):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def engtruck():
    m = Model('engtruck')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    isuzu_front(m, 0.12)
    m.box('main', (-0.5, 0.52, 0), (0.96, 0.08, 0.98), bevel=0.02)
    for z in (-0.47, 0.47): m.box('main', (-0.5, 0.68, z), (0.96, 0.26, 0.04), bevel=0.01)
    m.box('main', (-0.97, 0.68, 0), (0.04, 0.26, 0.98), bevel=0.01)
    for x, z in [(-0.8, -0.26), (-0.8, 0.02), (-0.58, -0.26)]:
        m.box('dark', (x, 0.66, z), (0.22, 0.18, 0.22), bevel=0.015)
        m.box('#e8d44a', (x, 0.66, z - 0.111), (0.12, 0.05, 0.01), bevel=0.0)
    for k in range(3): m.box('dark', (-0.4, 0.6 + k * 0.05, 0.3), (0.8, 0.04, 0.05), bevel=0.004)
    m.cyl('main', (-0.3, 0.64, -0.2), (-0.3, 0.64, -0.02), 0.13, seg=20, bevel=0.01)
    for x in (0.7, -0.55):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def apc():
    """Type 1 Ho-Ha half-track: wheels at the front, tracks at the back, an open-topped armoured
    body of angled plates and machine guns on pintles."""
    m = Model('apc')
    for s in (1, -1):
        track_side(m, s * 0.46, [(-0.85, 0.1), (-0.62, 0.1), (-0.39, 0.1), (-0.16, 0.1)], (0.08, 0.26, 0.13), (-1.02, 0.22, 0.12), 0.38, 0.18)
    m.tyre((0.68, 0.25, -0.44), 0.25, 0.16); m.tyre((0.68, 0.25, 0.44), 0.25, 0.16)
    sec = lambda x, top, w: (x, [(0.34, -w + 0.06), (top, -w), (top, w), (0.34, w - 0.06)])
    m.loft_poly('main', [sec(-1.05, 0.9, 0.46), sec(0.2, 0.92, 0.46), sec(0.55, 0.8, 0.4), (1.02, [(0.36, -0.3), (0.62, -0.3), (0.62, 0.3), (0.36, 0.3)])], bevel=0.012)
    m.box('dark', (-0.45, 0.905, 0), (1.1, 0.012, 0.8), bevel=0.0)                   # the open top
    for s in (1, -1):
        m.arc('main', (0.68, 0.25, s * 0.44), 0.27, 0.29, 0.17, 0.1, math.pi - 0.2)
        m.headlamp((0.95, 0.62, s * 0.26), 0.04)
    m.box('dark', (0.52, 0.86, -0.18), (0.02, 0.03, 0.16), bevel=0.0, pitch=0.6)
    m.cyl('main', (-0.3, 0.9, 0), (-0.3, 1.08, 0), 0.02)
    m.mg((-0.28, 1.12, 0), 0.55)
    m.finish()

def amphib():
    """Type 2 Ka-Mi: a light tank with a boat-shaped pontoon on the bow and another on the stern,
    the turret with its 37 mm gun, and the rudders."""
    m = Model('amphib')
    for s in (1, -1):
        track_side(m, s * 0.46, [(-0.5, 0.11), (-0.26, 0.11), (0.1, 0.11), (0.34, 0.11)], (0.6, 0.3, 0.12), (-0.72, 0.26, 0.11), 0.46, 0.2, (-0.3, 0.2))
    m.loft_poly('main', [(-0.62, [(0.22, -0.46), (0.74, -0.52), (0.74, 0.52), (0.22, 0.46)]), (0.5, [(0.22, -0.46), (0.76, -0.52), (0.76, 0.52), (0.22, 0.46)])], bevel=0.012)
    m.loft('main', [(0.5, 0.28, 0.78, 0.52, 5), (0.8, 0.34, 0.78, 0.48, 4), (1.02, 0.52, 0.78, 0.3, 3), (1.1, 0.72, 0.78, 0.05, 2)], seg=32, bevel=0.01)   # bow pontoon
    m.loft('main', [(-1.08, 0.5, 0.78, 0.3, 3), (-0.9, 0.36, 0.78, 0.48, 4), (-0.62, 0.3, 0.78, 0.52, 5)], seg=32, bevel=0.01)                 # stern pontoon
    for z in (-0.2, 0.2): m.box('dark', (-1.12, 0.46, z), (0.05, 0.2, 0.02), bevel=0.004)   # rudders
    m.loft('main', [(-0.3, 0.74, 1.02, 0.3, 3), (0.2, 0.74, 1.02, 0.32, 3), (0.3, 0.74, 0.96, 0.24, 2.6)], seg=32)
    m.lathe('main', [(0.035, 0.0), (0.03, 0.2), (0.024, 0.24), (0.024, 0.6), (0.03, 0.62), (0.0, 0.62)], (0.3, 0.9, 0), (1, 0, 0), seg=14)
    m.cyl('main', (-0.1, 1.02, 0.1), (-0.1, 1.05, 0.1), 0.1, seg=18)
    m.finish()

def tank_light():
    """Type 95 Ha-Go: bell-crank bogies with two pairs of road wheels a side, two return rollers,
    the high front sprocket, a stepped superstructure and the small turret offset to the left
    with its 37 mm gun and the rear machine gun."""
    m = Model('tank_light')
    for s in (1, -1):
        track_side(m, s * 0.5, [(-0.58, 0.12), (-0.3, 0.12), (0.12, 0.12), (0.4, 0.12)], (0.8, 0.38, 0.13), (-0.84, 0.26, 0.12), 0.5, 0.2, (-0.3, 0.3))
        for bx in (-0.44, 0.26): m.box('main', (bx, 0.22, s * 0.41), (0.36, 0.06, 0.04), bevel=0.01)   # bell cranks
    m.loft('main', [(-0.9, 0.2, 0.55, 0.36, 10), (0.9, 0.2, 0.55, 0.36, 10)], bevel=0.01)
    m.loft_poly('main', [(-0.95, [(0.52, -0.56), (0.76, -0.56), (0.76, 0.56), (0.52, 0.56)]), (0.3, [(0.52, -0.56), (0.8, -0.56), (0.8, 0.56), (0.52, 0.56)]),
                         (0.55, [(0.52, -0.5), (0.8, -0.44), (0.8, 0.44), (0.52, 0.5)]), (0.95, [(0.4, -0.44), (0.56, -0.4), (0.56, 0.4), (0.4, 0.44)])], bevel=0.012)
    m.box('main', (0.42, 0.9, -0.2), (0.28, 0.18, 0.3), bevel=0.02)                  # driver's cab step
    m.rivets('main', (-0.8, 0.78, 0.565), (0.3, 0.78, 0.565), 10, normal=(0, 0, 1))
    m.rivets('main', (-0.8, 0.78, -0.565), (0.3, 0.78, -0.565), 10, normal=(0, 0, -1))
    m.loft('main', [(-0.3, 0.78, 1.04, 0.26, 3, 0.15), (0.12, 0.78, 1.04, 0.28, 3, 0.15), (0.22, 0.78, 0.98, 0.22, 2.6, 0.15)], seg=28)
    m.lathe('main', [(0.035, 0.0), (0.03, 0.2), (0.024, 0.24), (0.024, 0.6), (0.03, 0.62), (0.0, 0.62)], (0.22, 0.92, 0.15), (1, 0, 0), seg=14)
    m.cyl('dark', (-0.3, 0.92, 0.15), (-0.45, 0.92, 0.15), 0.014, seg=8)             # rear MG
    m.cyl('main', (-0.05, 1.04, 0.15), (-0.05, 1.08, 0.15), 0.1, seg=18)
    for k in range(5): m.box('dark', (-0.75 + k * 0.05, 0.765, -0.2), (0.02, 0.012, 0.4), bevel=0.0)
    m.finish()

def tank():
    """Type 97 Chi-Ha (Shinhoto): six road wheels, three return rollers, a stepped hull, and the
    turret offset to the right with its 47 mm gun and the curved handrail aerial round it."""
    m = Model('tank')
    for s in (1, -1):
        track_side(m, s * 0.64, [(-0.9, 0.15), (-0.55, 0.15), (-0.2, 0.15), (0.15, 0.15), (0.5, 0.15), (0.82, 0.15)],
                   (1.1, 0.42, 0.16), (-1.18, 0.34, 0.15), 0.56, 0.28, (-0.6, 0.0, 0.6))
    m.loft('main', [(-1.2, 0.22, 0.6, 0.46, 10), (1.1, 0.22, 0.6, 0.46, 10)], bevel=0.01)
    m.loft_poly('main', [(-1.25, [(0.58, -0.72), (0.9, -0.72), (0.9, 0.72), (0.58, 0.72)]), (0.5, [(0.58, -0.72), (0.94, -0.72), (0.94, 0.72), (0.58, 0.72)]),
                         (0.75, [(0.58, -0.66), (0.94, -0.6), (0.94, 0.6), (0.58, 0.66)]), (1.25, [(0.42, -0.56), (0.66, -0.5), (0.66, 0.5), (0.42, 0.56)])], bevel=0.012)
    m.box('main', (0.62, 0.98, 0.3), (0.3, 0.1, 0.3), bevel=0.02)
    m.lathe('main', [(0.0, -0.03), (0.06, -0.02), (0.07, 0.03), (0.0, 0.06)], (0.95, 0.82, 0.3), (0.9, 0.3, 0), seg=16)
    m.cyl('dark', (1.0, 0.84, 0.3), (1.14, 0.8, 0.3), 0.014, seg=8)
    m.rivets('main', (-1.0, 0.9, 0.725), (0.4, 0.9, 0.725), 14, normal=(0, 0, 1))
    m.rivets('main', (-1.0, 0.9, -0.725), (0.4, 0.9, -0.725), 14, normal=(0, 0, -1))
    for k in range(8): m.box('dark', (-1.05 + k * 0.05, 0.945, 0), (0.02, 0.012, 0.8), bevel=0.0)
    m.loft('main', [(-0.6, 0.92, 1.2, 0.38, 3, -0.1), (0.2, 0.92, 1.22, 0.42, 3.2, -0.1), (0.35, 0.92, 1.16, 0.34, 2.8, -0.1)], seg=36)
    m.lathe('main', [(0.045, 0.0), (0.04, 0.25), (0.032, 0.3), (0.032, 0.95), (0.04, 0.97), (0.0, 0.97)], (0.35, 1.06, -0.1), (1, 0, 0), seg=16)
    m.lathe('main', [(0.13, 0.0), (0.13, 0.07), (0.09, 0.09), (0.0, 0.1)], (-0.15, 1.21, -0.1), (0, 1, 0), seg=20)
    pts = [(-0.1 + math.cos(a) * 0.5, 1.34, -0.1 + math.sin(a) * 0.5) for a in [0.4 + k * 0.35 for k in range(15)]]   # the handrail aerial
    for p0, p1 in zip(pts, pts[1:]): m.cyl('dark', p0, p1, 0.01, seg=5)
    for p in pts[::4]: m.cyl('dark', p, (p[0], 1.18, p[2]), 0.008, seg=5)
    m.finish()

def tank_heavy():
    """Type 4 Chi-To: a long hull with seven road wheels, the big turret and its long 75 mm gun."""
    m = Model('tank_heavy')
    for s in (1, -1):
        track_side(m, s * 0.8, [(-1.05 + k * 0.34, 0.16) for k in range(7)], (1.32, 0.42, 0.18), (-1.34, 0.38, 0.17), 0.62, 0.36, (-0.7, 0.0, 0.7))
        m.box('main', (0.0, 0.7, s * 0.8), (2.8, 0.022, 0.4), bevel=0.006)
    m.loft('main', [(-1.35, 0.22, 0.66, 0.58, 10), (1.25, 0.22, 0.66, 0.58, 10)], bevel=0.01)
    m.loft_poly('main', [(-1.42, [(0.64, -0.96), (0.98, -0.96), (0.98, 0.96), (0.64, 0.96)]), (0.8, [(0.64, -0.96), (1.0, -0.96), (1.0, 0.96), (0.64, 0.96)]),
                         (1.42, [(0.44, -0.6), (0.64, -0.6), (0.64, 0.6), (0.44, 0.6)])], bevel=0.014)
    m.box('main', (1.0, 0.92, -0.3), (0.1, 0.12, 0.3), bevel=0.01, pitch=0.3)
    for k in range(10): m.box('dark', (-1.25 + k * 0.05, 1.005, 0), (0.02, 0.012, 1.2), bevel=0.0)
    m.loft_poly('main', [(-1.0, [(0.98, -0.6), (1.38, -0.54), (1.38, 0.54), (0.98, 0.6)]), (0.4, [(0.98, -0.62), (1.4, -0.56), (1.4, 0.56), (0.98, 0.62)]),
                         (0.55, [(0.98, -0.5), (1.36, -0.44), (1.36, 0.44), (0.98, 0.5)])], bevel=0.02)
    m.box('main', (0.58, 1.18, 0), (0.1, 0.24, 0.34), bevel=0.02)
    m.lathe('main', [(0.06, 0.0), (0.052, 0.3), (0.042, 0.35), (0.042, 1.95), (0.05, 1.97), (0.0, 1.97)], (0.6, 1.2, 0), (1, 0, 0), seg=16)
    m.lathe('main', [(0.15, 0.0), (0.15, 0.08), (0.1, 0.11), (0.0, 0.12)], (-0.5, 1.4, 0.26), (0, 1, 0), seg=20)
    m.cyl('dark', (-0.8, 1.4, -0.4), (-0.8, 2.1, -0.4), 0.006, seg=6)
    m.finish()

def rockets():
    """an Isuzu lorry with a rack of 20 cm rocket rails."""
    m = Model('rockets')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.34, z), (2.5, 0.1, 0.08), bevel=0.01)
    isuzu_front(m, 0.42)
    m.box('main', (-0.55, 0.5, 0), (1.6, 0.1, 0.96), bevel=0.02)
    tilt = 0.42; ct, st = math.cos(tilt), math.sin(tilt)
    for c in range(6):
        z = -0.36 + c * 0.144
        m.lathe('dark', [(0.07, 0.0), (0.075, 0.0), (0.075, 1.3), (0.07, 1.3)], (-1.05, 0.9, z), (ct, st, 0), seg=12, closed=True)   # troughs
        m.lathe('main', [(0.0, 0.1), (0.06, 0.15), (0.06, 0.8), (0.1, 0.85), (0.1, 1.05), (0.05, 1.18), (0.0, 1.22)], (-1.05, 0.92, z), (ct, st, 0), seg=14)
    m.box('main', (-0.55, 0.76, 0), (0.3, 0.4, 0.8), bevel=0.02)
    for x in (0.95, -0.35, -0.85):
        for z in (-0.5, 0.5): m.tyre((x, 0.28, z), 0.28, 0.19)
    m.finish()

def heli():
    """Kayaba Ka-1 autogyro: slim fuselage with two cockpits, the radial engine and propeller, the
    rotor pylon and the twin fins. Armed for the game with MG pods."""
    m = Model('heli')
    m.lathe('main', [(0.1, 0.0), (0.19, 0.02), (0.2, 0.1), (0.19, 0.16)], (0.95, 0.0, 0), (-1, 0, 0), seg=28)
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (0.95, 0.0, 0), (-1, 0, 0), seg=20)
    m.prop('dark', (0.96, 0, 0), 0.36, blades=2, spinner=0.05)
    m.loft('main', [(0.8, -0.18, 0.19, 0.19, 2.3), (0.3, -0.22, 0.2, 0.2, 2.4), (-0.4, -0.14, 0.17, 0.15, 2.3), (-1.3, 0.05, 0.18, 0.05, 2.1), (-1.55, 0.1, 0.18, 0.02, 2.0)], seg=32)
    for x in (0.35, -0.1): m.box('dark', (x, 0.2, 0), (0.28, 0.012, 0.28), bevel=0.0)
    for x in (0.5, 0.05): m.box(GLASS, (x, 0.27, 0), (0.02, 0.1, 0.26), bevel=0.0, pitch=-0.5)
    m.wing('main', [(-0.45, -1.3, 0.2, 0.1), (0.0, -1.25, 0.26, 0.1), (0.45, -1.3, 0.2, 0.1)], thick=0.1)
    for z in (-0.45, 0.45): m.wing('main', [(0.0, -1.28, 0.22, z), (0.28, -1.34, 0.14, z)], thick=0.1, vertical=True)
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
    """Mitsubishi A6M Zero: the round radial cowling, a slim fuselage, the long framed canopy,
    rounded wing tips and a three-blade prop."""
    m = Model('fighter')
    m.lathe('main', [(0.1, 0.0), (0.15, 0.02), (0.16, 0.08), (0.15, 0.18)], (0.88, 0.0, 0), (-1, 0, 0), seg=32)
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (0.88, 0.0, 0), (-1, 0, 0), seg=24)
    fuselage(m, [(0.72, -0.14, 0.14, 0.14, 2.2), (0.3, -0.14, 0.14, 0.12, 2.3), (-0.2, -0.12, 0.13, 0.1, 2.3),
                 (-0.6, -0.07, 0.1, 0.055, 2.2), (-0.92, -0.01, 0.08, 0.018, 2.0)])
    canopy(m, [(0.3, 0.12, 0.13, 0.07, 2.4), (0.2, 0.11, 0.25, 0.08, 2.6), (-0.3, 0.11, 0.24, 0.075, 2.6), (-0.42, 0.11, 0.14, 0.04, 2.2)],
           frames=[(0.12, 0.11, 0.25, 0.078), (-0.05, 0.11, 0.25, 0.078), (-0.2, 0.11, 0.245, 0.076)])
    m.wing('main', [(-1.08, 0.08, 0.1, -0.02), (-1.02, 0.14, 0.22, -0.03), (-0.6, 0.25, 0.38, -0.06), (0.0, 0.3, 0.48, -0.1),
                    (0.6, 0.25, 0.38, -0.06), (1.02, 0.14, 0.22, -0.03), (1.08, 0.08, 0.1, -0.02)], thick=0.12)
    m.wing('main', [(-0.36, -0.68, 0.1, 0.03), (-0.3, -0.64, 0.16, 0.03), (0.0, -0.62, 0.22, 0.03), (0.3, -0.64, 0.16, 0.03), (0.36, -0.68, 0.1, 0.03)], thick=0.1)
    m.wing('main', [(0.05, -0.6, 0.28, 0), (0.2, -0.68, 0.22, 0), (0.28, -0.74, 0.12, 0), (0.3, -0.78, 0.05, 0)], thick=0.1, vertical=True)
    for s in (1, -1): m.cyl('dark', (0.3, -0.06, s * 0.5), (0.48, -0.06, s * 0.5), 0.014, seg=8)
    m.prop('dark', (0.89, 0, 0), 0.36, blades=3, spinner=0.07)
    m.finish()

def attacker():
    """Aichi D3A 'Val': the elliptical wing, fixed undercarriage in spats, the long canopy with the
    rear gunner and the bomb under the belly."""
    m = Model('attacker')
    m.lathe('main', [(0.1, 0.0), (0.16, 0.02), (0.17, 0.08), (0.16, 0.18)], (0.9, 0.0, 0), (-1, 0, 0), seg=32)
    m.lathe('dark', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02)], (0.9, 0.0, 0), (-1, 0, 0), seg=24)
    fuselage(m, [(0.74, -0.15, 0.15, 0.15, 2.2), (0.3, -0.15, 0.15, 0.13, 2.4), (-0.3, -0.12, 0.13, 0.1, 2.3), (-0.7, -0.06, 0.1, 0.05, 2.2), (-0.98, -0.01, 0.08, 0.018, 2.0)])
    canopy(m, [(0.35, 0.13, 0.14, 0.08, 2.6), (0.25, 0.12, 0.26, 0.09, 2.8), (-0.35, 0.12, 0.25, 0.085, 2.8), (-0.45, 0.12, 0.15, 0.05, 2.4)],
           frames=[(0.1, 0.12, 0.26, 0.088), (-0.1, 0.12, 0.26, 0.088), (-0.28, 0.12, 0.25, 0.085)])
    m.cyl('dark', (-0.4, 0.22, 0), (-0.62, 0.25, 0), 0.012, seg=8)
    secs = []
    for k in range(-8, 9):
        z = k / 8 * 1.12; e = math.sqrt(max(0.02, 1 - (z / 1.14) ** 2))
        secs.append((z, 0.1 + 0.22 * e, 0.12 + 0.42 * e, -0.1 + abs(z) * 0.08))
    m.wing('main', secs, thick=0.12)
    for s in (1, -1):
        z = s * 0.4
        m.cyl('main', (0.14, -0.14, z), (0.16, -0.36, z), 0.03, seg=10)
        m.loft('main', [(0.32, -0.5, -0.3, 0.035, 2.2, z), (0.16, -0.55, -0.24, 0.07, 2.4, z), (-0.04, -0.5, -0.3, 0.04, 2.2, z)], seg=18)
    m.lathe('dark', [(0.0, 0.0), (0.06, 0.07), (0.07, 0.3), (0.045, 0.4), (0.0, 0.42)], (-0.12, -0.26, 0), (1, 0, 0), seg=16)
    m.wing('main', [(-0.38, -0.74, 0.12, 0.05), (-0.32, -0.7, 0.2, 0.05), (0.0, -0.66, 0.26, 0.05), (0.32, -0.7, 0.2, 0.05), (0.38, -0.74, 0.12, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -0.68, 0.32, 0), (0.24, -0.76, 0.24, 0), (0.32, -0.82, 0.12, 0)], thick=0.1, vertical=True)
    m.prop('dark', (0.91, 0, 0), 0.38, blades=3, spinner=0.07)
    m.finish()

def bomber():
    """Mitsubishi G4M 'Betty': the cigar-shaped fuselage, glazed nose, tail-gun cone, blisters,
    twin radial engines and a single fin."""
    m = Model('bomber')
    fuselage(m, [(1.35, -0.1, 0.1, 0.1, 2.0), (1.15, -0.22, 0.22, 0.22, 2.1), (0.5, -0.28, 0.28, 0.27, 2.2), (-0.6, -0.25, 0.26, 0.24, 2.2),
                 (-1.2, -0.12, 0.16, 0.12, 2.1), (-1.45, -0.04, 0.08, 0.05, 2.0)], seg=40)
    m.loft(GLASS, [(1.3, -0.12, 0.12, 0.12, 2.0), (1.45, -0.06, 0.06, 0.06, 2.0), (1.52, -0.01, 0.01, 0.01, 2.0)], seg=24)
    m.lathe(GLASS, [(0.0, 0.0), (0.05, 0.03), (0.07, 0.12), (0.07, 0.18)], (-1.55, 0.02, 0), (-1, 0, 0), seg=18)   # tail cone
    m.cyl('dark', (-1.55, 0.02, 0), (-1.72, 0.02, 0), 0.012, seg=6)
    canopy(m, [(1.05, 0.2, 0.22, 0.14, 2.4), (0.9, 0.2, 0.34, 0.14, 2.4), (0.6, 0.2, 0.34, 0.13, 2.4), (0.5, 0.21, 0.28, 0.08, 2.2)], frames=[(0.75, 0.2, 0.34, 0.14)])
    m.lathe(GLASS, [(0.0, 0.1), (0.07, 0.08), (0.1, 0.0)], (-0.3, 0.26, 0), (0, 1, 0), seg=18)
    for z in (-0.27, 0.27): m.sphere(GLASS, (-0.5, 0.05, z), 0.08, scale=(1.4, 1, 0.6), seg=16)
    m.wing('main', [(-1.95, 0.1, 0.24, 0.05), (-1.7, 0.25, 0.44, 0.02), (-0.8, 0.45, 0.78, -0.04), (0.0, 0.5, 0.88, -0.06),
                    (0.8, 0.45, 0.78, -0.04), (1.7, 0.25, 0.44, 0.02), (1.95, 0.1, 0.24, 0.05)], thick=0.14)
    for z in (-0.7, 0.7): nacelle(m, 0.82, -0.02, z, 0.18, 1.1, 0.42)
    m.wing('main', [(-0.7, -1.12, 0.22, 0.05), (-0.55, -1.08, 0.34, 0.05), (0.0, -1.04, 0.42, 0.05), (0.55, -1.08, 0.34, 0.05), (0.7, -1.12, 0.22, 0.05)], thick=0.1)
    m.wing('main', [(0.05, -1.05, 0.46, 0), (0.3, -1.14, 0.38, 0), (0.48, -1.24, 0.24, 0), (0.54, -1.3, 0.12, 0)], thick=0.1, vertical=True)
    m.box('dark', (0.1, -0.27, 0), (0.6, 0.012, 0.2), bevel=0.0)
    m.finish()

def hq():
    """the headquarters: a timber field house on low posts under a tiled hipped roof with upturned
    eaves, a veranda, sandbags and the flag on its pole."""
    m = Model('hq')
    for x in (-1.3, 0.0, 1.3):
        for z in (-1.1, 1.1): m.box('main', (x, 0.1, z), (0.14, 0.2, 0.14), bevel=0.02)   # posts
    m.box('main', (0, 0.26, 0), (2.9, 0.12, 2.5), bevel=0.02)                          # floor
    m.box('main', (0, 0.8, 0), (2.5, 1.0, 2.1), bevel=0.02)                            # walls
    for x in (-0.9, -0.3, 0.3, 0.9):
        for z in (-1.055, 1.055): m.box('main', (x, 0.8, z), (0.04, 1.0, 0.02), bevel=0.0)   # timber frame
    for z in (-0.6, 0.6): m.box(GLASS, (1.255, 0.85, z), (0.02, 0.4, 0.4), bevel=0.0)
    m.box('dark', (1.255, 0.66, 0), (0.02, 0.7, 0.4), bevel=0.0)                       # door
    for k in range(5): m.box('main', (1.5 + k * 0.001, 0.05 + k * 0.05, 0), (0.1 + (4 - k) * 0.06, 0.05, 0.6), bevel=0.01)
    # the hipped roof in tiers, eaves turned up at the corners
    for t, (y, hw, hd) in enumerate([(1.36, 1.7, 1.5), (1.62, 1.3, 1.1), (1.86, 0.8, 0.6)]):
        m.loft_poly('main', [(-hw, [(y - 0.08, -hd), (y + 0.02, -hd + 0.2), (y + 0.02, hd - 0.2), (y - 0.08, hd)]),
                             (hw, [(y - 0.08, -hd), (y + 0.02, -hd + 0.2), (y + 0.02, hd - 0.2), (y - 0.08, hd)])], bevel=0.01)
        for sx in (1, -1):
            for sz in (1, -1): m.box('main', (sx * hw, y + 0.02, sz * hd), (0.2, 0.06, 0.2), bevel=0.02, pitch=sx * 0.4, roll=-sz * 0.4)
    m.cyl('main', (0, 1.9, 0), (0, 2.1, 0), 0.06, seg=10)
    m.cyl('main', (1.7, 0.0, -1.3), (1.7, 2.8, -1.3), 0.02, seg=8)                    # flag
    m.fin('main', [(1.7, 2.78), (2.35, 2.75), (2.32, 2.35), (1.7, 2.4)], -1.3, 0.012)
    for k in range(6):
        for r in range(2): m.sphere('main', (1.7, 0.07 + r * 0.12, 0.5 + k * 0.2 + (r % 2) * 0.1), 0.09, scale=(0.9, 0.65, 1.4), seg=10)
    m.cyl('main', (-1.2, 1.3, 0.9), (-1.2, 3.0, 0.9), 0.02, seg=8)                    # radio mast
    for a in (0.5, 2.6, 4.7): m.cyl('dark', (-1.2, 2.8, 0.9), (-1.2 + math.cos(a) * 1.0, 0.05, 0.9 + math.sin(a) * 1.0), 0.004, seg=4)
    m.finish()

def transport():
    """Mitsubishi Ki-57 'Topsy': the army transport of the MC-20 airliner - a rounded fuselage with
    a row of cabin windows, a low wing, two radials in long nacelles and a single tall fin. (The
    paratroops who took Palembang jumped from these.)"""
    m = Model('transport')
    fuselage(m, [(1.5, -0.05, 0.06, 0.06, 2), (1.35, -0.18, 0.2, 0.17, 2.1), (1.05, -0.25, 0.27, 0.23, 2.2), (0.4, -0.27, 0.29, 0.24, 2.3),
                 (-0.7, -0.22, 0.26, 0.21, 2.3), (-1.3, -0.06, 0.2, 0.11, 2.2), (-1.6, 0.06, 0.15, 0.03, 2.0)], seg=40)
    for z in (-0.1, 0.1): m.box(GLASS, (1.26, 0.18, z * 1.2), (0.12, 0.07, 0.1), bevel=0.0, yaw=-z * 3, pitch=-0.45)
    for s in (1, -1):
        m.box(GLASS, (1.1, 0.16, s * 0.215), (0.12, 0.06, 0.012), bevel=0.0)
        for k in range(7): m.box(GLASS, (0.7 - k * 0.19, 0.1, s * 0.245), (0.06, 0.07, 0.012), bevel=0.0)
    m.box('dark', (-0.7, -0.02, -0.24), (0.2, 0.32, 0.012), bevel=0.0)                   # jump door
    m.wing('main', [(-1.95, 0.18, 0.26, -0.02), (-1.2, 0.34, 0.56, -0.1), (-0.3, 0.52, 0.9, -0.17), (0.0, 0.55, 0.94, -0.19),
                    (0.3, 0.52, 0.9, -0.17), (1.2, 0.34, 0.56, -0.1), (1.95, 0.18, 0.26, -0.02)], thick=0.15)
    for z in (-0.7, 0.7):
        nacelle(m, 0.92, -0.1, z, 0.18, 1.05, 0.42)
        m.cyl('main', (0.4, -0.2, z), (0.4, -0.34, z), 0.022, seg=8)
        m.lathe('dark', [(0.03, -0.04), (0.08, -0.04), (0.09, 0.0), (0.08, 0.04), (0.03, 0.04)], (0.4, -0.35, z), (0, 0, 1), seg=18, closed=True)
    m.wing('main', [(-0.8, -1.12, 0.22, 0.08), (-0.65, -1.08, 0.34, 0.08), (0.0, -1.04, 0.44, 0.08), (0.65, -1.08, 0.34, 0.08), (0.8, -1.12, 0.22, 0.08)], thick=0.1)
    m.wing('main', [(0.14, -1.0, 0.56, 0), (0.42, -1.12, 0.42, 0), (0.7, -1.26, 0.26, 0), (0.78, -1.32, 0.14, 0)], thick=0.1, vertical=True)
    m.lathe('dark', [(0.02, -0.02), (0.04, -0.02), (0.04, 0.02), (0.02, 0.02)], (-1.45, 0.0, 0), (0, 0, 1), seg=12, closed=True)
    m.finish()

MODELS = {'jeep': jeep, 'ambulance': ambulance, 'engtruck': engtruck, 'apc': apc, 'amphib': amphib, 'tank_light': tank_light, 'tank': tank,
          'tank_heavy': tank_heavy, 'rockets': rockets, 'heli': heli, 'fighter': fighter, 'attacker': attacker, 'bomber': bomber, 'transport': transport, 'hq': hq}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
