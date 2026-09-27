# The French Army's vehicles, aircraft and headquarters, built with the tools in vehicles.py:
# Laffly V15T, Renault trucks with the engine ahead of the radiator (ambulance and engineers),
# Panhard 178 armoured car, Renault R35, Somua S35, Char B1 bis, the LeO C.30 autogyro (the
# licence-built Cierva, so the British model is reused), Dewoitine D.520, Breguet 693, LeO 451 and
# a stone farmhouse. (No amphibian, rocket lorry or transport of their own: the American models
# are used.) Written to .cache/figures/vehicles/fr; tools/figures.mjs packs them into
# public/nation-fr.js.
#
#   python tools/blender/vehicles_fr.py [name ...]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehicles
from vehicles import (Model, clear, GLASS, LIGHT, WHITE, RED, seat, steering, bogie, roadwheel, sprocket, arc_pts,
                      nacelle, fuselage, canopy)

BASE = vehicles.OUT
import vehicles_gb                      # for the C.30 (it points vehicles.OUT at gb; set it back)
vehicles.OUT = os.path.join(BASE, 'fr')

def renault_front(m, x0=0.1):
    """a Renault lorry: the sloping 'coal scuttle' bonnet with the radiator behind the engine,
    louvres at the back of the bonnet sides, and a rounded cab."""
    m.loft('main', [(x0 + 0.34, 0.48, 0.92, 0.33, 5), (x0 + 0.62, 0.48, 0.82, 0.29, 4), (x0 + 0.9, 0.48, 0.64, 0.2, 3)], seg=32, bevel=0.01)
    for s in (1, -1):
        for k in range(6): m.box('dark', (x0 + 0.38 + k * 0.035, 0.72, s * 0.32), (0.016, 0.2, 0.02), bevel=0.0)   # radiator louvres
        m.arc('main', (x0 + 0.58, 0.27, s * 0.41), 0.3, 0.33, 0.2, -0.2, math.pi - 0.15)
        m.headlamp((x0 + 0.72, 0.8, s * 0.3), 0.05)
        m.box('main', (x0 + 0.05, 0.43, s * 0.48), (0.5, 0.025, 0.1), bevel=0.005)
    m.box('dark', (x0 + 0.95, 0.34, 0), (0.06, 0.08, 1.0), bevel=0.012)
    m.loft('main', [(x0 - 0.12, 0.46, 1.18, 0.48, 7), (x0 + 0.34, 0.46, 1.12, 0.46, 7)], seg=36, bevel=0.01)
    for z in (-0.2, 0.2): m.box(GLASS, (x0 + 0.345, 0.98, z), (0.012, 0.2, 0.34), bevel=0.0)
    for z in (-0.485, 0.485): m.box(GLASS, (x0 + 0.15, 0.97, z), (0.24, 0.18, 0.012), bevel=0.0)

def jeep():
    """Laffly V15T: a short, square-nosed four-wheel-drive car with the little extra wheels under
    the nose and between the axles for crossing trenches, and a Hotchkiss gun."""
    m = Model('jeep')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.7, 0.07, 0.07), bevel=0.01)
    m.loft('main', [(-0.92, 0.36, 0.66, 0.4, 7), (0.25, 0.36, 0.7, 0.42, 8)], bevel=0.01)
    m.box('dark', (-0.35, 0.7, 0), (0.95, 0.01, 0.78), bevel=0.0)
    m.loft('main', [(0.24, 0.42, 0.8, 0.34, 7), (0.9, 0.42, 0.78, 0.32, 7)], seg=32, bevel=0.01)
    m.box('main', (0.92, 0.6, 0), (0.03, 0.34, 0.6), bevel=0.01)
    for k in range(9): m.box('dark', (0.935, 0.6, -0.24 + k * 0.06), (0.012, 0.28, 0.02), bevel=0.0)
    for s in (1, -1):
        for x in (0.55, -0.55): m.arc('main', (x, 0.25, s * 0.44), 0.28, 0.3, 0.18, 0.05, math.pi - 0.05)
        m.headlamp((0.8, 0.84, s * 0.3), 0.045)
        m.lathe('dark', [(0.0, -0.03), (0.08, -0.03), (0.09, 0.0), (0.08, 0.03), (0.0, 0.03)], (0.0, 0.12, s * 0.3), (0, 0, 1), seg=16)   # the belly wheels
        m.lathe('dark', [(0.0, -0.03), (0.08, -0.03), (0.09, 0.0), (0.08, 0.03), (0.0, 0.03)], (1.02, 0.2, s * 0.25), (0, 0, 1), seg=16)  # and the nose wheels
    m.box('dark', (0.99, 0.3, 0), (0.06, 0.08, 0.8), bevel=0.012)
    fr = lambda c, sz: m.box('main', c, sz, bevel=0.006, pitch=-0.1)
    fr((0.26, 0.82, 0), (0.035, 0.035, 0.84)); fr((0.25, 1.06, 0), (0.035, 0.035, 0.84))
    for z in (-0.41, 0.41): fr((0.255, 0.94, z), (0.03, 0.24, 0.03))
    m.box(GLASS, (0.255, 0.94, 0), (0.012, 0.22, 0.78), bevel=0.0, pitch=-0.1)
    seat(m, -0.05, 0.74, -0.2); seat(m, -0.05, 0.74, 0.2); seat(m, -0.58, 0.74, 0, w=0.76)
    steering(m, 0.1, 0.9, -0.2)
    m.lathe('dark', [(0.12, -0.07), (0.2, -0.07), (0.22, 0.0), (0.2, 0.07), (0.12, 0.07)], (-0.4, 0.5, 0.49), (0, 0, 1), seg=28, closed=True)   # spare on the side
    m.cyl('main', (-0.36, 0.7, 0.0), (-0.36, 1.0, 0.0), 0.028)
    m.mg((-0.34, 1.05, 0), 0.6)
    for x in (0.55, -0.55):
        for z in (-0.44, 0.44): m.tyre((x, 0.25, z), 0.25, 0.15)
    m.finish()

def ambulance():
    m = Model('ambulance')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.8, 0.08, 0.08), bevel=0.01)
    renault_front(m, 0.05)
    m.loft('main', [(-1.0, 0.5, 1.36, 0.5, 8), (-0.08, 0.5, 1.36, 0.5, 8)], seg=40, bevel=0.01)
    for z in (-0.506, 0.506):
        m.box(WHITE, (-0.52, 0.95, z), (0.46, 0.46, 0.012), bevel=0.0)
        m.box(RED, (-0.52, 0.95, z * 1.004), (0.3, 0.09, 0.012), bevel=0.0); m.box(RED, (-0.52, 0.95, z * 1.004), (0.09, 0.3, 0.012), bevel=0.0)
    m.box(WHITE, (-0.52, 1.362, 0), (0.46, 0.012, 0.46), bevel=0.0)
    m.box(RED, (-0.52, 1.37, 0), (0.3, 0.012, 0.09), bevel=0.0); m.box(RED, (-0.52, 1.37, 0), (0.09, 0.012, 0.3), bevel=0.0)
    for x in (0.63, -0.6):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def engtruck():
    m = Model('engtruck')
    for z in (-0.3, 0.3): m.box('dark', (0, 0.3, z), (1.9, 0.08, 0.08), bevel=0.01)
    renault_front(m, 0.12)
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
    for x in (0.7, -0.55):
        for z in (-0.46, 0.46): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

def apc():
    """Panhard 178: a long faceted hull pointed at both ends (it could be driven from the back as
    well), four big wheels, and the tall six-sided turret with its 25 mm gun and coaxial MG."""
    m = Model('apc')
    m.loft_poly('main', [(-1.02, [(0.36, -0.26), (0.6, -0.32), (0.6, 0.32), (0.36, 0.26)]), (-0.72, [(0.3, -0.42), (0.8, -0.44), (0.8, 0.44), (0.3, 0.42)]),
                         (0.5, [(0.3, -0.42), (0.8, -0.44), (0.8, 0.44), (0.3, 0.42)]), (1.02, [(0.36, -0.24), (0.58, -0.3), (0.58, 0.3), (0.36, 0.24)])], bevel=0.012)
    for s in (1, -1):
        for x in (0.55, -0.55): m.arc('main', (x, 0.27, s * 0.5), 0.29, 0.31, 0.16, 0.1, math.pi - 0.1)
        m.box('main', (0.0, 0.62, s * 0.46), (0.5, 0.2, 0.04), bevel=0.01)             # side door
        m.headlamp((0.92, 0.56, s * 0.26), 0.035, guard=True)
    m.box('dark', (0.72, 0.74, -0.18), (0.02, 0.03, 0.16), bevel=0.0, pitch=0.5)
    m.box('dark', (-0.72, 0.74, 0.18), (0.02, 0.03, 0.16), bevel=0.0, pitch=-0.5)      # the rear driver's visor
    m.loft_poly('main', [(-0.3, [(0.8, -0.27), (1.14, -0.2), (1.14, 0.2), (0.8, 0.27)]), (-0.14, [(0.8, -0.34), (1.14, -0.26), (1.14, 0.26), (0.8, 0.34)]),
                         (0.14, [(0.8, -0.34), (1.14, -0.26), (1.14, 0.26), (0.8, 0.34)]), (0.3, [(0.8, -0.27), (1.14, -0.2), (1.14, 0.2), (0.8, 0.27)])], bevel=0.01)
    m.lathe('main', [(0.035, 0.0), (0.03, 0.12), (0.022, 0.16), (0.022, 0.6), (0.03, 0.62), (0.0, 0.62)], (0.28, 0.98, -0.04), (1, 0, 0), seg=14)
    m.cyl('dark', (0.28, 0.98, 0.08), (0.46, 0.98, 0.08), 0.014, seg=8)
    m.cyl('main', (-0.1, 1.14, 0), (-0.1, 1.2, 0), 0.08, seg=16)
    m.cyl('dark', (-0.6, 0.8, 0.3), (-0.6, 1.5, 0.3), 0.006, seg=6)
    for x in (0.55, -0.55):
        for z in (-0.5, 0.5): m.tyre((x, 0.27, z), 0.27, 0.18)
    m.finish()

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

def apx_turret(m, x, y, r, h, gun_r, gun_len, cupola=True):
    """the cast APX turrets: a rounded, slightly tapering drum with a sloped front, the gun in a
    small round mantlet and the observation cupola on top."""
    m.lathe('main', [(0.0, 0.0), (r, 0.0), (r * 1.02, h * 0.15), (r * 0.94, h * 0.8), (r * 0.8, h), (0.0, h)], (x, y, 0), (0, 1, 0), seg=32)
    m.lathe('main', [(0.0, -0.02), (gun_r * 2.4, 0.0), (gun_r * 2.2, 0.06), (0.0, 0.08)], (x + r * 0.95, y + h * 0.45, 0), (1, 0, 0), seg=18)
    m.lathe('main', [(gun_r, 0.0), (gun_r * 0.85, gun_len * 0.2), (gun_r * 0.75, gun_len * 0.25), (gun_r * 0.75, gun_len), (0.0, gun_len)], (x + r * 0.95, y + h * 0.45, 0), (1, 0, 0), seg=14)
    m.cyl('dark', (x + r * 0.95, y + h * 0.45, 0.07), (x + r * 1.1, y + h * 0.45, 0.07), 0.012, seg=8)
    if cupola:
        m.lathe('main', [(0.0, 0.0), (r * 0.42, 0.0), (r * 0.42, h * 0.3), (r * 0.36, h * 0.42), (0.0, h * 0.45)], (x - r * 0.25, y + h, 0), (0, 1, 0), seg=20)
        for k in range(6):
            a = k / 6 * 2 * math.pi
            m.box('dark', (x - r * 0.25 + math.cos(a) * r * 0.42, y + h * 1.18, math.sin(a) * r * 0.42), (0.02, 0.02, 0.04), yaw=-a, bevel=0.0)   # vision slits

def tank_light():
    """Renault R35: a short cast hull, five road wheels in scissor bogies with the rubber-spring
    tubes above them, the tail skid, and the APX-R turret with the short 37 mm gun."""
    m = Model('tank_light')
    for s in (1, -1):
        z = s * 0.46
        track_side(m, z, [(-0.62 + k * 0.27, 0.12) for k in range(5)], (0.8, 0.36, 0.15), (-0.86, 0.3, 0.14), 0.5, 0.22, (-0.3, 0.2))
        m.cyl('main', (-0.7, 0.34, s * 0.52), (0.5, 0.34, s * 0.52), 0.035, seg=10)        # the horizontal spring tube
        for k in range(3): m.box('main', (-0.5 + k * 0.5, 0.25, s * 0.52), (0.32, 0.14, 0.02), bevel=0.01)   # scissor plates
    m.loft('main', [(-0.95, 0.24, 0.72, 0.36, 3.5), (-0.6, 0.2, 0.8, 0.4, 4), (0.5, 0.2, 0.82, 0.4, 4), (0.88, 0.24, 0.62, 0.36, 3.5), (1.0, 0.3, 0.48, 0.3, 3)], seg=32, bevel=0.01)
    m.box('main', (0.7, 0.78, -0.1), (0.2, 0.12, 0.24), bevel=0.03, pitch=0.4)           # driver's hood
    m.box('dark', (0.8, 0.79, -0.1), (0.02, 0.02, 0.14), bevel=0.0, pitch=0.4)
    for k in range(6): m.box('dark', (-0.8 + k * 0.05, 0.81, 0.12), (0.02, 0.012, 0.3), bevel=0.0)
    for z in (-0.18, 0.18): m.cyl('main', (-0.95, 0.4, z), (-1.25, 0.1, z), 0.025, seg=8)   # the tail skid
    m.cyl('main', (-1.25, 0.1, -0.2), (-1.25, 0.1, 0.2), 0.03, seg=8)
    apx_turret(m, 0.05, 0.8, 0.3, 0.32, 0.035, 0.5)
    m.finish()

def tank():
    """Somua S35: the rounded cast hull, armoured skirts over the suspension with their mud slots,
    nine road wheels, and the APX-1 turret with the 47 mm gun and its cupola."""
    m = Model('tank')
    for s in (1, -1):
        z = s * 0.66
        track_side(m, z, [(-0.95 + k * 0.23, 0.12) for k in range(9)], (1.12, 0.44, 0.17), (-1.2, 0.38, 0.16), 0.6, 0.28)
        m.loft('main', [(-1.28, 0.26, 0.66, 0.08, 4, s * 0.72), (-1.1, 0.24, 0.7, 0.08, 4, s * 0.72), (0.95, 0.24, 0.7, 0.08, 4, s * 0.72), (1.2, 0.36, 0.66, 0.08, 4, s * 0.72)], bevel=0.01)   # skirt
        for k in range(4): m.box('dark', (-0.8 + k * 0.5, 0.3, s * 0.8), (0.18, 0.06, 0.012), bevel=0.0)   # mud slots
    m.loft('main', [(-1.3, 0.3, 0.86, 0.56, 4), (-0.9, 0.28, 0.96, 0.62, 4), (0.8, 0.28, 0.96, 0.62, 4), (1.2, 0.3, 0.74, 0.55, 3.5), (1.3, 0.34, 0.56, 0.45, 3)], seg=36, bevel=0.01)
    m.box('main', (0.85, 0.94, -0.2), (0.24, 0.1, 0.26), bevel=0.03, pitch=0.35)
    m.box('dark', (0.97, 0.95, -0.2), (0.02, 0.02, 0.16), bevel=0.0, pitch=0.35)
    for k in range(8): m.box('dark', (-1.1 + k * 0.05, 0.965, 0), (0.02, 0.012, 0.7), bevel=0.0)
    for s in (1, -1): m.headlamp((1.22, 0.72, s * 0.35), 0.04)
    apx_turret(m, 0.1, 0.96, 0.4, 0.4, 0.04, 0.95)
    m.cyl('dark', (-0.5, 1.2, -0.3), (-0.5, 1.9, -0.3), 0.006, seg=6)
    m.finish()

def tank_heavy():
    """Char B1 bis: the tall hull with the track running right round it, armoured side plates with
    mud chutes, the 75 mm howitzer low in the right of the hull front, the raised driver's post
    and the small APX-4 turret with its 47 mm gun on top."""
    m = Model('tank_heavy')
    for s in (1, -1):
        z = s * 0.8
        for k in range(14): roadwheel(m, (-1.1 + k * 0.17, 0.1, z), 0.085, 0.07, spokes=4, dual=False)
        path = [(-1.2, 0.03), (1.2, 0.03)] + arc_pts(1.3, 0.62, 0.3, -1.3, 1.57, 8) + [(0.95, 1.02), (-0.95, 1.02)] + arc_pts(-1.34, 0.6, 0.3, 1.57, 4.6, 8)
        m.track_loop(path, z, 0.36)
        m.loft_poly('main', [(-1.18, [(0.2, s * 0.62), (0.95, s * 0.62), (0.95, s * 1.0), (0.2, s * 1.0)]), (1.14, [(0.2, s * 0.62), (0.95, s * 0.62), (0.95, s * 1.0), (0.2, s * 1.0)])], bevel=0.01)
        for k in range(6): m.box('dark', (-0.95 + k * 0.38, 0.3, s * 1.005), (0.16, 0.12, 0.012), bevel=0.0)   # mud chutes
        m.box('main', (-0.2, 0.65, s * 1.005), (0.3, 0.3, 0.02), bevel=0.01)          # side door
    m.loft_poly('main', [(-1.36, [(0.3, -0.62), (1.02, -0.62), (1.02, 0.62), (0.3, 0.62)]), (0.95, [(0.25, -0.62), (1.12, -0.62), (1.12, 0.62), (0.25, 0.62)]),
                         (1.36, [(0.35, -0.6), (0.95, -0.6), (0.95, 0.6), (0.35, 0.6)])], bevel=0.014)
    m.box('main', (1.1, 1.2, -0.3), (0.28, 0.2, 0.3), bevel=0.02)                      # the driver's raised post
    m.box('dark', (1.25, 1.24, -0.3), (0.02, 0.03, 0.18), bevel=0.0)
    m.box('main', (1.3, 0.6, 0.25), (0.12, 0.3, 0.3), bevel=0.02)                        # the howitzer's mounting
    m.lathe('main', [(0.075, 0.0), (0.065, 0.1), (0.055, 0.12), (0.055, 0.36), (0.0, 0.36)], (1.35, 0.6, 0.25), (1, 0, 0), seg=16)
    for k in range(10): m.box('dark', (-1.2 + k * 0.05, 1.13, 0.2), (0.02, 0.012, 0.6), bevel=0.0)   # engine louvres
    m.box('main', (-1.0, 1.15, -0.35), (0.3, 0.06, 0.2), bevel=0.02)
    apx_turret(m, 0.25, 1.12, 0.32, 0.36, 0.038, 0.72)
    m.cyl('dark', (-0.6, 1.14, 0.4), (-0.6, 1.85, 0.4), 0.006, seg=6)
    m.finish()

def heli():
    """the LeO C.30: the Cierva C.30 built under licence in France - the same autogyro as the
    British one."""
    vehicles_gb.heli()

def fighter():
    """Dewoitine D.520: a slim pointed nose with the cannon firing through the spinner, the
    radiator under the fuselage, the long canopy, the tall rounded fin and a three-blade prop."""
    m = Model('fighter')
    fuselage(m, [(0.95, -0.07, 0.07, 0.07, 2.1), (0.7, -0.11, 0.11, 0.1, 2.3), (0.3, -0.13, 0.13, 0.11, 2.4), (-0.15, -0.12, 0.13, 0.1, 2.4),
                 (-0.55, -0.07, 0.11, 0.06, 2.2), (-0.9, -0.01, 0.09, 0.02, 2.0)])
    m.loft('main', [(0.1, -0.14, -0.1, 0.06, 2.4), (-0.05, -0.23, -0.1, 0.08, 3), (-0.3, -0.22, -0.1, 0.08, 3), (-0.45, -0.12, -0.08, 0.04, 2.4)], seg=24)   # radiator
    m.box('dark', (-0.02, -0.18, 0), (0.02, 0.08, 0.1), bevel=0.0)
    canopy(m, [(0.24, 0.1, 0.12, 0.06, 2.4), (0.14, 0.1, 0.23, 0.075, 2.6), (-0.2, 0.1, 0.22, 0.07, 2.6), (-0.34, 0.1, 0.13, 0.03, 2.2)],
           frames=[(0.08, 0.1, 0.23, 0.074), (-0.1, 0.1, 0.225, 0.072)])
    m.wing('main', [(-1.02, 0.08, 0.12, -0.02), (-0.95, 0.14, 0.24, -0.03), (-0.5, 0.26, 0.4, -0.06), (0.0, 0.3, 0.5, -0.1),
                    (0.5, 0.26, 0.4, -0.06), (0.95, 0.14, 0.24, -0.03), (1.02, 0.08, 0.12, -0.02)], thick=0.11)
    m.wing('main', [(-0.34, -0.66, 0.1, 0.03), (-0.3, -0.62, 0.16, 0.03), (0.0, -0.6, 0.22, 0.03), (0.3, -0.62, 0.16, 0.03), (0.34, -0.66, 0.1, 0.03)], thick=0.1)
    m.wing('main', [(0.05, -0.56, 0.36, 0), (0.18, -0.62, 0.3, 0), (0.3, -0.7, 0.2, 0), (0.36, -0.78, 0.09, 0)], thick=0.1, vertical=True)
    for s in (1, -1):
        for k in range(5): m.box('dark', (0.7 - k * 0.055, 0.05, s * 0.105), (0.035, 0.025, 0.02), bevel=0.004)   # exhausts
        m.cyl('dark', (0.3, -0.07, s * 0.55), (0.44, -0.07, s * 0.55), 0.012, seg=8)
    m.prop('dark', (0.96, 0, 0), 0.36, blades=3, spinner=0.07)
    m.cyl('dark', (1.0, 0, 0), (1.1, 0, 0), 0.015, seg=8)                                    # the moteur-canon
    m.finish()

def attacker():
    """Breguet 693: a small twin-engined attack aircraft - a slim fuselage with the pilot's canopy
    far forward and the gunner behind, radial engines under the wing and twin fins."""
    m = Model('attacker')
    fuselage(m, [(1.0, -0.06, 0.08, 0.07, 2.1), (0.8, -0.13, 0.14, 0.12, 2.3), (0.3, -0.14, 0.15, 0.13, 2.4), (-0.3, -0.11, 0.13, 0.1, 2.3),
                 (-0.8, -0.05, 0.1, 0.05, 2.2), (-1.0, -0.01, 0.08, 0.02, 2.0)])
    canopy(m, [(0.72, 0.1, 0.13, 0.07, 2.4), (0.62, 0.1, 0.24, 0.085, 2.6), (0.3, 0.1, 0.24, 0.085, 2.6), (0.18, 0.11, 0.2, 0.07, 2.4),
               (-0.1, 0.1, 0.2, 0.065, 2.4), (-0.22, 0.1, 0.13, 0.03, 2.2)], frames=[(0.5, 0.1, 0.24, 0.084), (0.2, 0.1, 0.22, 0.078)])
    m.cyl('dark', (-0.15, 0.2, 0), (-0.35, 0.22, 0), 0.01, seg=8)
    m.wing('main', [(-1.1, 0.12, 0.16, 0.0), (-1.0, 0.2, 0.3, -0.01), (-0.5, 0.32, 0.46, -0.04), (0.0, 0.36, 0.54, -0.06),
                    (0.5, 0.32, 0.46, -0.04), (1.0, 0.2, 0.3, -0.01), (1.1, 0.12, 0.16, 0.0)], thick=0.12)
    for z in (-0.45, 0.45): nacelle(m, 0.62, -0.06, z, 0.14, 0.8, 0.32)
    m.wing('main', [(-0.5, -0.78, 0.12, 0.06), (-0.45, -0.74, 0.18, 0.06), (0.0, -0.72, 0.22, 0.06), (0.45, -0.74, 0.18, 0.06), (0.5, -0.78, 0.12, 0.06)], thick=0.1)
    for z in (-0.5, 0.5):
        m.wing('main', [(-0.12, -0.74, 0.18, z), (0.0, -0.72, 0.24, z), (0.18, -0.75, 0.2, z), (0.26, -0.8, 0.1, z)], thick=0.1, vertical=True)
    for s in (1, -1): m.cyl('dark', (0.9, -0.04, s * 0.05), (1.08, -0.04, s * 0.05), 0.014, seg=8)   # the nose cannon
    m.finish()

def bomber():
    """Lioré et Olivier LeO 451: a long slim fuselage with the glazed nose, the ventral gondola,
    two Gnome-Rhône radials in long nacelles and twin oval fins on the tips of the tailplane,
    which is set up with dihedral."""
    m = Model('bomber')
    fuselage(m, [(1.4, -0.08, 0.1, 0.1, 2.0), (1.15, -0.2, 0.2, 0.2, 2.2), (0.4, -0.22, 0.23, 0.2, 2.4), (-0.6, -0.18, 0.2, 0.16, 2.4),
                 (-1.3, -0.07, 0.12, 0.07, 2.2), (-1.5, -0.02, 0.07, 0.03, 2.0)], seg=40)
    m.loft(GLASS, [(1.35, -0.1, 0.1, 0.1, 2.0), (1.5, -0.05, 0.05, 0.05, 2.0), (1.56, -0.01, 0.01, 0.01, 2.0)], seg=24)
    canopy(m, [(1.0, 0.16, 0.18, 0.12, 2.4), (0.9, 0.16, 0.3, 0.13, 2.4), (0.55, 0.16, 0.3, 0.13, 2.4), (0.45, 0.17, 0.24, 0.07, 2.2)], frames=[(0.72, 0.16, 0.3, 0.13)])
    m.lathe(GLASS, [(0.0, 0.1), (0.06, 0.08), (0.09, 0.0)], (-0.35, 0.2, 0), (0, 1, 0), seg=18)   # the dorsal gun position
    m.cyl('dark', (-0.35, 0.26, 0), (-0.55, 0.28, 0), 0.01, seg=6)
    m.loft('main', [(0.2, -0.22, -0.18, 0.08, 2.4), (0.0, -0.28, -0.18, 0.1, 2.6), (-0.4, -0.26, -0.16, 0.09, 2.6), (-0.55, -0.2, -0.16, 0.05, 2.2)], seg=20)   # the gondola
    m.wing('main', [(-1.9, 0.1, 0.24, 0.02), (-1.7, 0.22, 0.42, 0.0), (-0.8, 0.42, 0.74, -0.06), (0.0, 0.48, 0.84, -0.08),
                    (0.8, 0.42, 0.74, -0.06), (1.7, 0.22, 0.42, 0.0), (1.9, 0.1, 0.24, 0.02)], thick=0.14)
    for z in (-0.72, 0.72): nacelle(m, 0.85, -0.04, z, 0.17, 1.2, 0.42)
    m.wing('main', [(-0.75, -1.22, 0.2, 0.2), (-0.6, -1.18, 0.3, 0.17), (0.0, -1.14, 0.38, 0.06), (0.6, -1.18, 0.3, 0.17), (0.75, -1.22, 0.2, 0.2)], thick=0.1)
    for z in (-0.76, 0.76):                                                        # the twin oval fins
        m.wing('main', [(0.02, -1.2, 0.18, z), (0.12, -1.16, 0.3, z), (0.3, -1.16, 0.32, z), (0.46, -1.2, 0.22, z), (0.54, -1.25, 0.1, z)], thick=0.1, vertical=True)
    m.box('dark', (0.2, -0.225, 0), (0.6, 0.012, 0.18), bevel=0.0)
    m.finish()

def hq():
    """the headquarters: a stone farmhouse with a tiled gable roof, shuttered windows, a chimney,
    sandbags at the door, the radio mast and the flag."""
    m = Model('hq')
    m.box('main', (0, 0.72, 0), (2.8, 1.44, 2.0), bevel=0.02)                         # walls
    rnd = [0.13, 0.71, 0.38, 0.92, 0.55, 0.27, 0.84, 0.46]
    for k in range(18):                                                                # quoins and a few stones standing out
        for s in (1, -1):
            m.box('main', (s * 1.39, 0.08 + k * 0.08, -1.0 + (k % 2) * 0.08), (0.03, 0.07, 0.16), bevel=0.01)
        x = -1.2 + rnd[k % 8] * 2.4; y = 0.2 + (k * 0.37 % 1.1)
        m.box('main', (x, y, 1.005), (0.18, 0.08, 0.02), bevel=0.01)
    for x in (-0.8, 0.8):                                                              # windows with open shutters
        for z in (-1.0, 1.0):
            m.box(GLASS, (x, 0.95, z * 1.002), (0.3, 0.4, 0.02), bevel=0.0)
            for s in (1, -1): m.box('main', (x + s * 0.24, 0.95, z * 1.02), (0.16, 0.42, 0.02), bevel=0.005)
    m.box('dark', (1.405, 0.5, 0.3), (0.02, 0.8, 0.4), bevel=0.0)                       # door on the gable end
    m.box(GLASS, (1.405, 1.05, -0.4), (0.02, 0.3, 0.3), bevel=0.0)
    m.loft_poly('main', [(-1.55, [(1.4, -1.15), (1.44, -1.15), (2.2, 0.0), (1.44, 1.15), (1.4, 1.15)]),
                         (1.55, [(1.4, -1.15), (1.44, -1.15), (2.2, 0.0), (1.44, 1.15), (1.4, 1.15)])], bevel=0.01)   # the roof
    for k in range(16):                                                                # rows of round tiles
        x = -1.5 + k * 0.2
        for s in (1, -1): m.cyl('main', (x, 1.46, s * 1.13), (x, 2.17, s * 0.04), 0.03, seg=8)
    m.cyl('main', (-1.55, 2.2, 0), (1.55, 2.2, 0), 0.05, seg=10)                         # ridge
    m.box('main', (-0.9, 2.3, 0.45), (0.24, 0.6, 0.24), bevel=0.02)                      # chimney
    for k in range(6):
        for r in range(2): m.sphere('main', (1.6, 0.07 + r * 0.12, -0.2 + k * 0.2 + (r % 2) * 0.1), 0.09, scale=(0.9, 0.65, 1.4), seg=10)
    m.cyl('main', (1.8, 0.0, -1.2), (1.8, 2.8, -1.2), 0.02, seg=8)                       # flag
    m.fin('main', [(1.8, 2.78), (2.45, 2.75), (2.42, 2.35), (1.8, 2.4)], -1.2, 0.012)
    m.cyl('main', (-1.2, 1.9, -0.8), (-1.2, 3.3, -0.8), 0.02, seg=8)                     # radio mast
    for a in (0.5, 2.6, 4.7): m.cyl('dark', (-1.2, 3.1, -0.8), (-1.2 + math.cos(a) * 1.0, 0.05, -0.8 + math.sin(a) * 1.0), 0.004, seg=4)
    m.finish()

MODELS = {'jeep': jeep, 'ambulance': ambulance, 'engtruck': engtruck, 'apc': apc, 'tank_light': tank_light, 'tank': tank,
          'tank_heavy': tank_heavy, 'heli': heli, 'fighter': fighter, 'attacker': attacker, 'bomber': bomber, 'hq': hq}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
