# The jungle (stage 6 diorama), modelled in Blender: tall rainforest trees with buttress roots,
# ferns and undergrowth, a bamboo clump, a stilt hut with a thatched roof, a coconut-log bunker
# (infantry fight from it), a giant banyan, a crashed fighter plane and a wooden bridge.
#
#   python tools/blender/jungle.py [name ...]
#
# Written next to the other scenery (.cache/figures/scenery); tools/figures.mjs packs them all.
# Axes as in vehicles.py: x along, y up, z to the front.
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from vehicles import clear
from scenery import Scene, mulberry, EARTH

BARKJ, BARKJ2, LEAFJ, LEAFJ2, LEAFJ3, FERN, BAMBOO, THATCH = '#6d5b45', '#57493a', '#2f5a2c', '#3e6e33', '#4c7d36', '#4f8a3a', '#9aa24f', '#a88d58'
WOODJ, WOODJ2, LOGJ, SANDJ, DARKJ, PLANE, PLANE2, RED = '#7a5a3a', '#5e452d', '#8a6c4a', '#b8a070', '#232420', '#6f7c63', '#c9c3a8', '#b02a22'

def jtree(name, h, seed):
    """a rainforest giant: a straight grey-brown trunk on buttress roots, lianas, and a crown of
    clumped foliage in two or three layers."""
    m = Scene(name); rnd = mulberry(seed)
    m.cyl(BARKJ, (0, 0, 0), (0.04, h, 0.02), 0.13, seg=8, r2=0.08)
    for i in range(4):                                                                      # buttress roots
        a = i / 4 * 2 * math.pi + rnd() * 0.4
        m.fin(BARKJ2, [(0, 0.7), (0, 0), (0.5, 0)], 0, 0.04, bevel=0.0).rotation_euler[2] = a
    for i in range(3):                                                                      # lianas
        a = rnd() * 6.3
        m.cyl('#4a5a30', (math.cos(a) * 0.14, 0.2, math.sin(a) * 0.14), (math.cos(a) * 0.5, h * 0.8, math.sin(a) * 0.5), 0.012, seg=4)
    balls = []
    for layer, (y, r, k) in enumerate(((h * 0.62, 0.55, 4), (h * 0.85, 0.8, 7), (h * 1.02, 0.6, 5))):
        for i in range(k):
            a = i / k * 2 * math.pi + rnd() * 0.5
            balls.append((math.cos(a) * r, y + (rnd() - 0.5) * 0.25, math.sin(a) * r, 0.35 + rnd() * 0.2))
    m.foliage(LEAFJ if seed % 2 else LEAFJ2, balls, res=0.08, bump=0.12, tris=1800, seed=seed * 3)
    m.finish()

def fern():
    """undergrowth: a fern and a broad-leaved plant (the jungle floor, 1 cell)."""
    m = Scene('fern'); rnd = mulberry(701)
    for i in range(9):
        a = i / 9 * 2 * math.pi + rnd() * 0.3; L = 0.45 + rnd() * 0.2
        m.box(FERN if i % 2 else LEAFJ3, (math.cos(a) * L * 0.5, 0.18 + rnd() * 0.08, math.sin(a) * L * 0.5), (L, 0.012, 0.14), bevel=0.0, yaw=-a, pitch=0.35)
    for i in range(3):
        a = rnd() * 6.3
        m.box(LEAFJ2, (math.cos(a) * 0.25, 0.35, math.sin(a) * 0.25), (0.4, 0.012, 0.22), bevel=0.0, yaw=-a, pitch=-0.2)
    m.finish()

def bamboo():
    m = Scene('bamboo'); rnd = mulberry(711)
    for i in range(11):
        x, z = (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6
        h = 1.8 + rnd() * 1.2; lean = (rnd() - 0.5) * 0.4
        m.cyl(BAMBOO, (x, 0, z), (x + lean, h, z + lean * 0.5), 0.035, seg=6)
        for k in range(1, 5): m.torus('#7f8640', (x + lean * k / 5 * 1.0, h * k / 5, z + lean * 0.5 * k / 5), (lean * 0.3, 1, 0), 0.037, 0.008, seg=8)
        for k in range(3):
            a = rnd() * 6.3
            m.box(LEAFJ3, (x + lean + math.cos(a) * 0.15, h - 0.1 - k * 0.2, z + lean * 0.5 + math.sin(a) * 0.15), (0.35, 0.01, 0.06), bevel=0.0, yaw=-a, pitch=-0.4)
    m.finish()

def hut():
    """a stilt hut (2 x 2 cells): bamboo walls, a steep thatched roof, a ladder and a porch."""
    m = Scene('hut'); rnd = mulberry(721)
    L, D, y0 = 1.6, 1.4, 0.55
    for x in (-L / 2, 0, L / 2):
        for z in (-D / 2, D / 2): m.cyl(WOODJ2, (x, 0, z), (x, y0, z), 0.05, seg=6)          # stilts
    m.box(WOODJ, (0, y0, 0.1), (L + 0.1, 0.06, D + 0.5), bevel=0.01)                          # floor and porch
    for face in (1, -1):
        for k in range(14):
            x = -L / 2 + 0.06 + k * (L - 0.12) / 13
            if face == 1 and abs(x) < 0.2: continue                                            # the doorway
            m.cyl(BAMBOO, (x, y0, face * (D / 2 - 0.02)), (x, y0 + 0.75, face * (D / 2 - 0.02)), 0.03, seg=5)
    for face in (1, -1):
        m.box(THATCH, (face * (L / 2 - 0.02), y0 + 0.37, 0), (0.04, 0.74, D), bevel=0.0)
    for s in (1, -1):                                                                          # thatch roof
        m.box(THATCH, (0, y0 + 1.05, s * D * 0.3), (L + 0.5, 0.1, D * 0.85), bevel=0.04, roll=s * 0.75)
    m.cyl(THATCH, (-L / 2 - 0.25, y0 + 1.35, 0), (L / 2 + 0.25, y0 + 1.35, 0), 0.08, seg=6)
    for k in range(5): m.box(WOODJ2, (0.0, 0.1 + k * 0.11, D / 2 + 0.6 - k * 0.05), (0.3, 0.02, 0.05), bevel=0.0)   # ladder rungs
    for s in (1, -1): m.cyl(WOODJ2, (s * 0.15, 0, D / 2 + 0.65), (s * 0.15, y0 + 0.05, D / 2 + 0.38), 0.02, seg=5)
    m.finish()

def logbunker():
    """a coconut-log bunker (2 x 2 cells): log walls with a firing slit, logs over the top buried
    in earth and sand with palm fronds for camouflage; open at the back so soldiers can get in."""
    m = Scene('logbunker'); rnd = mulberry(731)
    for k in range(3):                                                                         # front wall of logs
        m.cyl(LOGJ, (-0.85, 0.12 + k * 0.2, 0.7), (0.85, 0.12 + k * 0.2, 0.7), 0.1, seg=8)
    m.box(DARKJ, (0, 0.55, 0.75), (1.2, 0.1, 0.05), bevel=0.0)                                   # firing slit
    for s in (1, -1):
        for k in range(3): m.cyl(LOGJ, (s * 0.8, 0.12 + k * 0.2, 0.75), (s * 0.8, 0.12 + k * 0.2, -0.7), 0.1, seg=8)
    for k in range(7): m.cyl(LOGJ, (-0.9 + k * 0.3, 0.72, 0.85), (-0.9 + k * 0.3, 0.72, 0.2), 0.08, seg=8)   # roof logs over the front
    m.foliage(SANDJ, [((rnd() - 0.5) * 1.6, 0.8, 0.5 + (rnd() - 0.5) * 0.4, 0.22 + rnd() * 0.1) for _ in range(6)], res=0.05, bump=0.03, tris=600, seed=7310)
    m.foliage(EARTH, [(s * 1.0, 0.1, (rnd() - 0.5) * 1.4, 0.3) for s in (1, -1) for _ in range(3)], res=0.05, bump=0.03, tris=500, seed=7311)
    for i in range(6):
        a = rnd() * 6.3
        m.box(FERN, (math.cos(a) * 0.4, 0.95, 0.5 + math.sin(a) * 0.2), (0.7, 0.012, 0.15), bevel=0.0, yaw=-a, pitch=-0.25)
    m.finish()

def banyan():
    """a giant banyan (2 x 2 cells): a braided trunk, aerial roots hanging to the ground, a huge crown."""
    m = Scene('banyan'); rnd = mulberry(741)
    for i in range(5):
        a = i / 5 * 2 * math.pi
        m.cyl(BARKJ, (math.cos(a) * 0.35, 0, math.sin(a) * 0.35), (math.cos(a + 0.8) * 0.15, 1.6, math.sin(a + 0.8) * 0.15), 0.12, seg=6)
    for i in range(14):                                                                         # aerial roots
        a = rnd() * 6.3; r = 0.7 + rnd() * 0.7
        m.cyl(BARKJ2, (math.cos(a) * r, 0, math.sin(a) * r), (math.cos(a) * r * 0.9, 1.9, math.sin(a) * r * 0.9), 0.025, seg=4)
    balls = [((rnd() - 0.5) * 2.4, 2.0 + rnd() * 0.8, (rnd() - 0.5) * 2.4, 0.55 + rnd() * 0.25) for _ in range(12)]
    m.foliage(LEAFJ2, balls, res=0.1, bump=0.14, tris=2000, seed=7410)
    m.finish()

def planewreck():
    """a crashed fighter (3 x 2 cells): fuselage broken behind the cockpit, one wing torn off,
    the propeller bent, roundel markings."""
    m = Scene('planewreck'); rnd = mulberry(751)
    m.cyl(PLANE, (-0.6, 0.3, 0), (0.9, 0.35, 0), 0.22, seg=12, r2=0.16)
    m.cyl(PLANE, (-1.4, 0.25, 0.1), (-0.65, 0.3, 0.02), 0.12, seg=10, r2=0.2).rotation_euler[2] += 0.15   # broken tail section
    m.fin(PLANE, [(-1.4, 0.25), (-1.3, 0.62), (-1.15, 0.62), (-1.1, 0.3)], 0.1, 0.03)
    m.plate(PLANE, [(-0.2, 0.2), (0.35, 0.2), (0.25, 1.35), (0.0, 1.35)], 0.22, 0.04)          # the wing still on
    m.plate(PLANE, [(-0.5, -0.9), (0.0, -0.95), (-0.15, -1.9), (-0.45, -1.85)], 0.04, 0.04).rotation_euler[2] = 0.2   # the torn wing on the ground
    m.cyl(DARKJ, (0.9, 0.35, 0), (0.95, 0.35, 0), 0.14, seg=10)
    for k in range(3):
        a = k / 3 * 2 * math.pi
        m.box(DARKJ, (0.97, 0.35 + math.sin(a) * 0.2, math.cos(a) * 0.2), (0.03, 0.05, 0.4), bevel=0.0, yaw=0, roll=a, pitch=0.3 * (k - 1))
    m.box('#9ac0d0', (0.25, 0.55, 0), (0.35, 0.12, 0.2), bevel=0.03)                           # canopy
    m.cyl(RED, (0.1, 0.225, 0.8), (0.1, 0.245, 0.8), 0.14, seg=16)                            # roundel
    m.cyl(PLANE2, (0.1, 0.24, 0.8), (0.1, 0.26, 0.8), 0.08, seg=16)
    m.foliage(EARTH, [((rnd() - 0.5) * 2.4, -0.05, (rnd() - 0.5) * 1.6, 0.25) for _ in range(7)], res=0.05, bump=0.03, tris=500, seed=7510)
    m.finish()

def woodbridge():
    """a wooden bridge along x (5 long, 2.4 wide) on log piles, with rope rails."""
    m = Scene('woodbridge'); rnd = mulberry(761)
    L, Wd = 5.2, 2.4
    for k in range(int(L / 0.2)):
        x = -L / 2 + 0.1 + k * 0.2
        m.box(WOODJ if k % 3 else WOODJ2, (x, 0.02 + (rnd() - 0.5) * 0.01, 0), (0.18, 0.05, Wd), bevel=0.005, yaw=(rnd() - 0.5) * 0.03)
    for s in (1, -1):
        m.cyl(WOODJ2, (-L / 2, -0.03, s * (Wd / 2 - 0.1)), (L / 2, -0.03, s * (Wd / 2 - 0.1)), 0.07, seg=8)   # stringers
        for x in (-2.2, -1.1, 0, 1.1, 2.2):
            m.cyl(WOODJ2, (x, -0.9, s * (Wd / 2 - 0.1)), (x, 0.55, s * (Wd / 2 - 0.1)), 0.06, seg=8)      # piles and posts
        m.cyl('#b09a6a', (-L / 2, 0.5, s * (Wd / 2 - 0.1)), (L / 2, 0.5, s * (Wd / 2 - 0.1)), 0.02, seg=5)  # rope
    m.finish()

MODELS = {'jtree0': lambda: jtree('jtree0', 3.2, 771), 'jtree1': lambda: jtree('jtree1', 3.9, 772), 'fern': fern, 'bamboo': bamboo, 'hut': hut,
          'logbunker': logbunker, 'banyan': banyan, 'planewreck': planewreck, 'woodbridge': woodbridge}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
