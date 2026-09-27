# The beach landing (stage 3 diorama), modelled in Blender: Atlantic-wall gun casemate, open
# pillbox and Tobruk pit (infantry fight from inside them), trench and barbed-wire pieces, beach
# obstacles (Belgian gate, log stakes with mines), a dune with marram grass, a lighthouse, rocks,
# a landing craft (LCVP) run up on the sand and a minefield sign.
#
#   python tools/blender/beach.py [name ...]
#
# Written next to the other scenery (.cache/figures/scenery); tools/figures.mjs packs them all.
# Axes as in vehicles.py: x along, y up, z to the front (+z faces the army's own beach).
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from vehicles import clear
from scenery import Scene, mulberry, STONE2, WOOD, BEAM, EARTH

CONCRETE, CONCRETE2, CAMO1, CAMO2 = '#aba699', '#8f8b80', '#7c7a58', '#8c7a5a'
STEEL, RUST, SAND, SANDBAG, GRASSY = '#4f5352', '#7a4e33', '#d8c496', '#b9a57b', '#9aa15a'
WHITE, RED, GLASS, DARK, ROCK, ROCK2 = '#ece8de', '#b33a2f', '#9fc3d6', '#26282a', '#8a8479', '#6f6a61'
HULL = '#6f7b76'

def sandbags_along(m, x0, x1, z, y0, layers, rnd, w=0.22):
    """a sandbag parapet along x at z, `layers` courses from y0, bond offset each course."""
    L = 0.3
    for l in range(layers):
        x = x0 + (l % 2) * L / 2
        while x < x1 - 0.05:
            m.sphere(SANDBAG, (min(x + L / 2, x1 - 0.1), y0 + 0.07 + l * 0.12, z + (rnd() - 0.5) * 0.02), 0.5, scale=(L * 1.05, 0.13, w), seg=12)
            x += L

def casemate():
    """a gun casemate (3 x 3 cells): thick concrete with rounded edges, a wide embrasure with the gun
    barrel, wing walls, earth and grass heaped on the roof, camouflage paint and a shell-chipped corner."""
    m = Scene('casemate'); rnd = mulberry(301)
    m.box(CONCRETE, (0, 0.55, -0.2), (2.6, 1.1, 2.2), bevel=0.12, segs=3)                  # the block
    m.box(CONCRETE, (0, 1.16, -0.1), (2.8, 0.18, 2.5), bevel=0.08, segs=2)                  # roof slab, overhanging
    for s in (1, -1):                                                                       # wing walls, splayed
        m.box(CONCRETE, (s * 1.25, 0.4, 1.05), (0.28, 0.8, 0.9), bevel=0.06, yaw=s * 0.45)
    m.box(DARK, (0, 0.62, 0.92), (1.3, 0.42, 0.05), bevel=0.0)                              # the embrasure
    for s in (1, -1): m.box(CONCRETE2, (s * 0.72, 0.62, 0.95), (0.14, 0.5, 0.12), bevel=0.02, yaw=s * 0.6)   # stepped cheeks
    m.box(CONCRETE2, (0, 0.92, 0.97), (1.5, 0.12, 0.12), bevel=0.02)
    m.cyl(STEEL, (0, 0.62, 0.7), (0, 0.62, 1.75), 0.07, seg=14)                             # gun barrel
    m.cyl(STEEL, (0, 0.62, 1.55), (0, 0.62, 1.8), 0.1, seg=14)                             # muzzle brake
    m.box(STEEL, (0, 0.62, 0.86), (0.5, 0.36, 0.08), bevel=0.01)                            # gun shield
    m.box(DARK, (0, 0.45, -1.32), (0.5, 0.75, 0.04), bevel=0.0)                             # back door
    m.box(STEEL, (0.3, 0.45, -1.33), (0.04, 0.7, 0.02), bevel=0.0)
    # camouflage blotches on the walls
    for i in range(10):
        a = rnd() * 2 * math.pi; face = int(rnd() * 3)
        x = (rnd() - 0.5) * 2.2; y = 0.3 + rnd() * 0.65
        if face == 0: m.box(CAMO1 if i % 2 else CAMO2, (x, y, 0.905), (0.5 + rnd() * 0.4, 0.25 + rnd() * 0.2, 0.01), bevel=0.0, roll=rnd() * 0.5)
        else:
            sx = 1 if face == 1 else -1
            m.box(CAMO1 if i % 2 else CAMO2, (sx * 1.305, y, (rnd() - 0.5) * 1.8), (0.01, 0.25 + rnd() * 0.2, 0.5 + rnd() * 0.4), bevel=0.0)
    # a thin layer of earth over the roof, with tufts of grass
    m.foliage(EARTH, [((rnd() - 0.5) * 2.0, 1.12, -0.3 + (rnd() - 0.5) * 1.5, 0.22 + rnd() * 0.08) for _ in range(10)], res=0.05, bump=0.03, tris=900, seed=3010)
    for i in range(40):
        x, z = (rnd() - 0.5) * 2.1, -0.3 + (rnd() - 0.5) * 1.8
        m.cyl(GRASSY if i % 3 else '#b8b06a', (x, 1.26, z), (x + (rnd() - 0.5) * 0.12, 1.4 + rnd() * 0.14, z + (rnd() - 0.5) * 0.12), 0.012, seg=3, r2=0.002)
    # a chipped corner with bent reinforcing bars
    m.box(CONCRETE2, (1.25, 1.1, 0.95), (0.3, 0.2, 0.3), bevel=0.05, yaw=0.5, roll=0.4)
    for k in range(4): m.cyl(RUST, (1.15 + k * 0.05, 1.0, 0.85), (1.3 + k * 0.08, 1.35 + k * 0.05, 1.05), 0.012, seg=5)
    m.finish()

def pillbox():
    """an open concrete emplacement (2 x 2 cells) with a firing step, an MG on a pintle and a
    roofed part at the back; the soldiers inside show above the walls."""
    m = Scene('pillbox'); rnd = mulberry(311)
    R, H = 0.85, 0.55
    for i in range(12):                                                                     # ring wall, 12 segments
        a0 = i / 12 * 2 * math.pi
        if i in (8, 9): continue                                                            # the way in, at the back
        a = a0 + math.pi / 12
        m.box(CONCRETE, (math.cos(a) * R, H / 2, math.sin(a) * R), (0.26, H, 2 * R * math.sin(math.pi / 12) + 0.06), bevel=0.03, yaw=-a)
        m.box(CONCRETE2, (math.cos(a) * (R - 0.02), H + 0.03, math.sin(a) * (R - 0.02)), (0.32, 0.06, 2 * R * math.sin(math.pi / 12) + 0.08), bevel=0.02, yaw=-a)
    m.cyl(CONCRETE2, (0, 0, 0), (0, 0.04, 0), R, seg=24)                                   # floor
    m.box(CONCRETE, (0, 0.72, -0.55), (1.3, 0.12, 0.6), bevel=0.04)                         # roof over the back
    for s in (1, -1): m.box(CONCRETE, (s * 0.55, 0.36, -0.7), (0.2, 0.7, 0.2), bevel=0.03)
    m.cyl(STEEL, (0, 0.04, 0.35), (0, 0.6, 0.35), 0.03, seg=8)                              # MG pintle
    m.box(STEEL, (0, 0.62, 0.45), (0.1, 0.08, 0.35), bevel=0.01)
    m.cyl(STEEL, (0, 0.63, 0.6), (0, 0.63, 1.0), 0.018, seg=8)
    for i in range(6): m.box(CAMO1 if i % 2 else CAMO2, (math.cos(i * 1.1) * (R + 0.14), 0.3, math.sin(i * 1.1) * (R + 0.14)), (0.02, 0.2, 0.35), bevel=0.0, yaw=-i * 1.1)
    sandbags_along(m, -0.7, 0.7, R + 0.3, 0.0, 2, rnd)
    m.finish()

def tobruk():
    """a Tobruk pit (1 cell): a small round concrete ring at ground level with an MG on a rail."""
    m = Scene('tobruk'); rnd = mulberry(321)
    m.torus(CONCRETE, (0, 0.1, 0), (0, 1, 0), 0.34, 0.1, seg=24)
    m.cyl(CONCRETE, (0, 0, 0), (0, 0.1, 0), 0.48, seg=24)
    m.cyl(DARK, (0, 0.1, 0), (0, 0.11, 0), 0.26, seg=20)
    m.torus(STEEL, (0, 0.24, 0), (0, 1, 0), 0.3, 0.012, seg=24)
    m.box(STEEL, (0.05, 0.3, 0.2), (0.08, 0.07, 0.3), bevel=0.01)
    m.cyl(STEEL, (0.05, 0.31, 0.3), (0.05, 0.31, 0.6), 0.015, seg=8)
    m.foliage(SAND, [(math.cos(a) * 0.52, -0.02, math.sin(a) * 0.52, 0.14) for a in [i * 0.8 for i in range(8)]], res=0.04, bump=0.02, tris=400, seed=3210)
    m.finish()

def trench():
    """one cell of trench running along x: sandbag parapets on both sides, plank revetment,
    duckboards on the floor (the soldiers stand in it)."""
    m = Scene('trench'); rnd = mulberry(331)
    m.box(DARK, (0, 0.012, 0), (1.04, 0.02, 0.62), bevel=0.0)                                # the dark floor
    for k in range(5): m.box(WOOD, (-0.4 + k * 0.2, 0.03, 0), (0.12, 0.02, 0.3), bevel=0.005)   # duckboards
    m.box(BEAM, (0, 0.04, 0.1), (1.0, 0.02, 0.03), bevel=0.0)
    m.box(BEAM, (0, 0.04, -0.1), (1.0, 0.02, 0.03), bevel=0.0)
    for s in (1, -1):
        m.box(WOOD, (0, 0.14, s * 0.32), (1.04, 0.26, 0.03), bevel=0.004)                    # revetment planks
        for x in (-0.4, 0.1): m.box(BEAM, (x, 0.16, s * 0.34), (0.05, 0.32, 0.05), bevel=0.0)
        sandbags_along(m, -0.52, 0.52, s * 0.47, 0.0, 2, rnd, w=0.2)
        m.foliage(EARTH, [(-0.4 + i * 0.4, 0.0, s * 0.62, 0.13) for i in range(3)], res=0.04, bump=0.02, tris=200, seed=3310 + (s > 0))
    m.finish()

def wire():
    """one cell of barbed-wire entanglement: crossed stakes with coils and strands."""
    m = Scene('wire'); rnd = mulberry(341)
    for x in (-0.35, 0.35):
        for s in (1, -1): m.cyl(WOOD, (x, 0, s * 0.2), (x, 0.6, -s * 0.05), 0.02, seg=6)
    for y in (0.15, 0.32, 0.5):
        for z in (-0.1, 0.1): m.cyl(STEEL, (-0.52, y, z), (0.52, y + (rnd() - 0.5) * 0.04, z), 0.005, seg=4)
    for i in range(9):                                                                     # a loose coil
        x = -0.48 + i * 0.12
        m.torus(STEEL, (x, 0.22, 0), (1, 0, 0.1), 0.2, 0.006, seg=14)
    m.finish()

def gate():
    """a Belgian gate (2 cells along x): a steel lattice fence on small rollers, rusting."""
    m = Scene('gate'); rnd = mulberry(351)
    L, H = 1.8, 0.95
    for y in (0.05, H):
        m.box(RUST, (0, y, 0), (L, 0.05, 0.05), bevel=0.0)
    for k in range(7):
        x = -L / 2 + k * L / 6
        m.box(STEEL if k % 2 else RUST, (x, H / 2, 0), (0.05, H, 0.05), bevel=0.0)
        if k < 6: m.box(RUST, (x + L / 12, H / 2, 0), (0.035, math.hypot(L / 6, H) * 0.98, 0.03), bevel=0.0, pitch=0, roll=0, yaw=0).rotation_euler[1] = math.atan2(L / 6, H) * (1 if k % 2 else -1)
    for s in (1, -1):                                                                       # braces to the back
        m.box(RUST, (s * L * 0.45, H * 0.4, -0.3), (0.04, 1.0, 0.04), bevel=0.0, roll=0.65)
        m.cyl(DARK, (s * L * 0.45, 0.07, -0.02), (s * L * 0.45, 0.07, 0.06), 0.07, seg=10)
    m.finish()

def stakes():
    """a log ramp driven into the sand, leaning seawards, with a Teller mine on its tip."""
    m = Scene('stakes'); rnd = mulberry(361)
    m.cyl(WOOD, (0, 0, -0.3), (0, 0.85, 0.35), 0.06, seg=10)
    m.cyl(WOOD, (0, 0, 0.1), (0, 0.45, -0.05), 0.05, seg=10)
    m.cyl(STEEL, (0, 0.86, 0.36), (0, 0.93, 0.4), 0.14, seg=16)                             # the mine
    m.cyl(STEEL, (0, 0.93, 0.4), (0, 0.96, 0.42), 0.04, seg=8)
    m.foliage(SAND, [(0, -0.03, -0.3, 0.12), (0, -0.03, 0.1, 0.1)], res=0.03, bump=0.01, tris=200, seed=3610)
    m.finish()

def dune():
    """one cell of dune ridge: a sand mound with marram grass."""
    m = Scene('dune'); rnd = mulberry(371)
    m.foliage(SAND, [(-0.5 + i * 0.25, 0.0, (rnd() - 0.5) * 0.2, 0.34 + rnd() * 0.12) for i in range(5)], res=0.05, bump=0.03, tris=600, seed=3710)
    for i in range(34):
        x, z = (rnd() - 0.5) * 1.0, (rnd() - 0.5) * 0.5
        y0 = 0.25 - abs(z) * 0.3
        h = 0.25 + rnd() * 0.25
        m.cyl(GRASSY if i % 3 else '#b8b06a', (x, y0, z), (x + (rnd() - 0.5) * 0.2, y0 + h, z + (rnd() - 0.5) * 0.2), 0.012, seg=3, r2=0.002)
    m.finish()

def lighthouse():
    """a lighthouse (2 x 2 cells) on a rocky knoll: white tower with red bands, gallery, lantern."""
    m = Scene('lighthouse'); rnd = mulberry(381)
    m.foliage(ROCK, [((rnd() - 0.5) * 1.6, 0.0, (rnd() - 0.5) * 1.6, 0.35 + rnd() * 0.2) for _ in range(9)], res=0.06, bump=0.08, tris=1000, seed=3810)
    H = 4.6
    for k in range(6):
        y0, y1 = 0.3 + k * (H - 0.3) / 6, 0.3 + (k + 1) * (H - 0.3) / 6
        r0, r1 = 0.62 - k * 0.05, 0.62 - (k + 1) * 0.05
        m.cyl(RED if k % 2 else WHITE, (0, y0, 0), (0, y1, 0), r0, seg=24, r2=r1)
    for k in range(3): m.box(DARK, (0, 1.2 + k * 1.1, 0.55 - k * 0.05), (0.14, 0.24, 0.04), bevel=0.0)      # windows
    m.box(DARK, (0, 0.6, 0.6), (0.3, 0.55, 0.05), bevel=0.0)
    m.cyl(DARK, (0, H, 0), (0, H + 0.08, 0), 0.5, seg=24)                                   # gallery floor
    for i in range(16):
        a = i / 16 * 2 * math.pi
        m.cyl(DARK, (math.cos(a) * 0.48, H + 0.08, math.sin(a) * 0.48), (math.cos(a) * 0.48, H + 0.3, math.sin(a) * 0.48), 0.01, seg=4)
    m.torus(DARK, (0, H + 0.3, 0), (0, 1, 0), 0.48, 0.012, seg=24)
    m.cyl(GLASS, (0, H + 0.08, 0), (0, H + 0.6, 0), 0.3, seg=16)                            # lantern
    for i in range(8):
        a = i / 8 * 2 * math.pi
        m.cyl(DARK, (math.cos(a) * 0.3, H + 0.08, math.sin(a) * 0.3), (math.cos(a) * 0.3, H + 0.6, math.sin(a) * 0.3), 0.012, seg=4)
    m.cyl(RED, (0, H + 0.6, 0), (0, H + 0.85, 0), 0.34, seg=16, r2=0.05)                   # dome
    m.cyl(DARK, (0, H + 0.85, 0), (0, H + 1.0, 0), 0.012, seg=4)
    m.finish()

def rocks():
    m = Scene('rocks'); rnd = mulberry(391)
    for k in range(4):
        x, z = (rnd() - 0.5) * 1.1, (rnd() - 0.5) * 1.1
        m.foliage(ROCK if k % 2 else ROCK2, [(x + (rnd() - 0.5) * 0.3, 0.1 + rnd() * 0.3, z + (rnd() - 0.5) * 0.3, 0.3 + rnd() * 0.25) for _ in range(3)], res=0.07, bump=0.12, tris=500, seed=3910 + k)
    m.finish()

def lcvp():
    """a Higgins boat run up on the sand, ramp down (about 3.2 x 1.3)."""
    m = Scene('lcvp'); rnd = mulberry(401)
    L, Wd = 3.0, 1.2
    m.prism_x(HULL, [(-Wd / 2, 0.15), (Wd / 2, 0.15), (Wd / 2 + 0.05, 0.75), (-Wd / 2 - 0.05, 0.75)], -L / 2, L / 2 - 0.3)
    m.prism_x(HULL, [(-Wd / 2 + 0.2, -0.05), (Wd / 2 - 0.2, -0.05), (Wd / 2, 0.15), (-Wd / 2, 0.15)], -L / 2 + 0.2, L / 2 - 0.3)
    m.box(DARK, (0.1, 0.72, 0), (L - 0.8, 0.04, Wd - 0.12), bevel=0.0)                     # the open well (dark)
    m.box(HULL, (L / 2 - 0.1, 0.07, 0), (0.9, 0.06, Wd - 0.1), bevel=0.01, pitch=0.35)      # the ramp, down on the sand
    for k in range(5): m.box(DARK, (L / 2 - 0.4 + k * 0.17, 0.12 + k * 0.05, 0), (0.03, 0.02, Wd - 0.2), bevel=0.0, pitch=0.35)
    m.box(HULL, (-L / 2 + 0.25, 1.0, 0), (0.5, 0.5, 0.7), bevel=0.03)                       # coxswain's station
    m.box(GLASS, (-L / 2 + 0.51, 1.1, 0), (0.02, 0.18, 0.5), bevel=0.0)
    for s in (1, -1):
        m.cyl(STEEL, (-L / 2 + 0.4, 0.75, s * 0.45), (-L / 2 + 0.4, 1.05, s * 0.45), 0.02, seg=6)   # MG mounts
        m.cyl(STEEL, (-L / 2 + 0.4, 1.06, s * 0.45), (-L / 2 + 0.85, 1.06, s * 0.45), 0.016, seg=6)
    m.box(WHITE, (0.2, 0.55, Wd / 2 + 0.051), (0.35, 0.14, 0.01), bevel=0.0)                 # hull number
    m.finish()

def mines():
    m = Scene('mines')
    m.cyl(WOOD, (0, 0, 0), (0, 0.75, 0), 0.025, seg=6)
    m.box('#e3dcc2', (0, 0.62, 0.03), (0.42, 0.26, 0.02), bevel=0.004, roll=0.08)
    m.box(DARK, (0, 0.66, 0.045), (0.3, 0.05, 0.005), bevel=0.0, roll=0.08)                  # "ACHTUNG MINEN"
    m.box(RED, (0, 0.57, 0.045), (0.34, 0.04, 0.005), bevel=0.0, roll=0.08)
    m.finish()

MODELS = {'casemate': casemate, 'pillbox': pillbox, 'tobruk': tobruk, 'trench': trench, 'wire': wire, 'gate': gate, 'stakes': stakes,
          'dune': dune, 'lighthouse': lighthouse, 'rocks': rocks, 'lcvp': lcvp, 'mines': mines}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
