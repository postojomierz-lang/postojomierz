# Diorama scenery for the Normandy battlefield, modelled in Blender: bocage hedgerows on earth banks,
# oaks and apple trees, a stone farmhouse with a slate roof, a timber-framed barn, dry-stone walls,
# round hay bales, reeds and a shell crater. Model-railway style: foliage is lumpy "clump foam",
# buildings have stonework, shutters, beams and roof tiles.
#
#   python tools/blender/scenery.py [name ...]
#
# Every part is painted (named by colour, #rrggbb); the game tints whole instances a little so
# that no two trees or hedges look alike. Writes .cache/figures/scenery/<name>__<rrggbb>.stl.
# Game axes as in vehicles.py: x forward (along a hedge/wall/building), y up, z to the right.
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import vehicles
from vehicles import Model, G, clear

vehicles.OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cache', 'figures', 'scenery')

LEAF, LEAF2, LEAF3 = '#4f6b35', '#6a8a42', '#3f5a2e'
TRUNK, BARK = '#5b4633', '#4a3a2b'
STONE, STONE2, SLATE, TILE = '#b8ab93', '#8f8574', '#4f565f', '#9a5a3e'
PLASTER, BEAM, WOOD, SHUTTER, WINDOW = '#ddd2b8', '#4b3a2b', '#7a5b3d', '#6f8796', '#23282d'
EARTH, MOSS, HAY, REED, APPLE = '#6e5b41', '#5c6d38', '#cfae5e', '#7f8c4c', '#b3392b'

def mulberry(seed):
    s = [seed & 0xffffffff]
    def rnd():
        s[0] = (s[0] + 0x6D2B79F5) & 0xffffffff
        t = s[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return rnd

class Scene(Model):
    def foliage(self, part, balls, res=0.06, bump=0.06, tris=2500, seed=1):
        """lumpy clump foliage: metaballs [(x, y, z, r), ...] melted together, then roughened."""
        mb = bpy.data.metaballs.new(f'f{seed}')
        mb.resolution = res; mb.render_resolution = res; mb.threshold = 0.6
        ob = bpy.data.objects.new(f'f{seed}', mb); bpy.context.scene.collection.objects.link(ob)
        for x, y, z, r in balls:
            e = mb.elements.new(); e.type = 'BALL'; e.co = G(x, y, z); e.radius = r * 1.6; e.stiffness = 2.0
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        o = bpy.data.objects.new(f'fm{seed}', me); bpy.context.scene.collection.objects.link(o)
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        # two layers of noise: big lumps, then the crumbly surface of clump foam
        for k, (scale, strength) in enumerate(((0.28, bump * 1.6), (0.07, bump))):
            tex = bpy.data.textures.new(f't{seed}_{k}', 'CLOUDS'); tex.noise_scale = scale; tex.noise_depth = 2
            d = o.modifiers.new(f'd{k}', 'DISPLACE'); d.texture = tex; d.strength = strength; d.mid_level = 0.5
            d.texture_coords = 'GLOBAL' if k else 'LOCAL'
            bpy.ops.object.modifier_apply(modifier=d.name)
        n = len(o.data.polygons)
        if n > tris:
            dm = o.modifiers.new('dec', 'DECIMATE'); dm.ratio = tris / n
            bpy.ops.object.modifier_apply(modifier=dm.name)
        return self._put(part, o)

    def prism_x(self, part, profile, x0, x1, bevel=0.0):
        """end profile [(z, y), ...] extruded along x0..x1 (gables, roofs, banks)."""
        import bmesh
        me = bpy.data.meshes.new('px'); bm = bmesh.new()
        f0 = [bm.verts.new(G(x0, y, z)) for z, y in profile]
        f1 = [bm.verts.new(G(x1, y, z)) for z, y in profile]
        bm.faces.new(f0); bm.faces.new(list(reversed(f1)))
        k = len(profile)
        for i in range(k): bm.faces.new([f0[i], f0[(i + 1) % k], f1[(i + 1) % k], f1[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new('px', me); bpy.context.scene.collection.objects.link(o)
        return self._put(part, o, bevel)

    def stones(self, part, x0, x1, y0, y1, zc, depth, rnd, size=0.16):
        """rough stonework: courses of slightly uneven blocks between x0..x1 and y0..y1 (a wall face)."""
        y = y0
        while y < y1 - 0.02:
            h = size * (0.7 + rnd() * 0.5)
            x = x0 - rnd() * size
            while x < x1:
                w = size * (1.2 + rnd() * 1.2)
                a, b = max(x, x0), min(x + w, x1)
                if b - a > 0.03:
                    self.box(part, ((a + b) / 2, y + h / 2, zc + (rnd() - 0.5) * 0.02), (b - a - 0.012, h - 0.012, depth * (0.9 + rnd() * 0.2)), bevel=0.012, segs=1,
                             yaw=(rnd() - 0.5) * 0.04)
                x += w
            y += h

# ---------------------------------------------------------------------------------------------
def hedge(v):
    """one cell of bocage: an earth bank with a thick hedge on it (the game lines cells up along
    a field border; neighbouring pieces overlap so the hedge looks continuous)."""
    m = Scene(f'hedge{v}'); rnd = mulberry(11 + v * 7)
    m.prism_x(EARTH, [(-0.46, 0.0), (0.46, 0.0), (0.3, 0.22), (-0.3, 0.22)], -0.56, 0.56)
    # the bank: a rounded mound along x, grassy on top
    m.foliage(MOSS, [(-0.55 + i * 0.22, 0.12, (rnd() - 0.5) * 0.08, 0.36) for i in range(6)], res=0.07, bump=0.04, tris=500, seed=100 + v)
    balls = []
    for i in range(9):
        x = -0.55 + i * 0.14 + (rnd() - 0.5) * 0.06
        balls.append((x, 0.55 + rnd() * 0.35, (rnd() - 0.5) * 0.18, 0.26 + rnd() * 0.12))
    for i in range(6):
        x = -0.5 + i * 0.2 + (rnd() - 0.5) * 0.1
        balls.append((x, 1.0 + rnd() * 0.4, (rnd() - 0.5) * 0.14, 0.2 + rnd() * 0.12))
    m.foliage([LEAF, LEAF3][v % 2], balls, res=0.055, bump=0.07, tris=2200, seed=200 + v)
    # a few stems showing at the bottom
    for i in range(3):
        x = -0.35 + i * 0.35 + (rnd() - 0.5) * 0.1
        m.cyl(BARK, (x, 0.2, (rnd() - 0.5) * 0.2), (x + (rnd() - 0.5) * 0.1, 0.55, (rnd() - 0.5) * 0.2), 0.03, seg=6)
    m.finish()

def oak(v):
    m = Scene(f'oak{v}'); rnd = mulberry(31 + v * 5)
    h = 1.5 + v * 0.25
    m.cyl(TRUNK, (0, -0.05, 0), (0.05, h, 0.02), 0.13, seg=10, r2=0.08)
    m.cyl(TRUNK, (0, -0.05, 0), (0, 0.18, 0), 0.2, seg=10, r2=0.12)                   # root flare
    branches = []
    for i in range(5):
        a = i / 5 * 2 * math.pi + rnd() * 0.6
        tip = (math.cos(a) * 0.7, h + 0.45 + rnd() * 0.35, math.sin(a) * 0.7)
        m.cyl(TRUNK, (0.03, h - 0.25, 0.01), tip, 0.06, seg=6, r2=0.03)
        branches.append(tip)
    balls = [(0, h + 0.9, 0, 0.75)]
    for x, y, z in branches:
        balls.append((x * 1.1, y + 0.2, z * 1.1, 0.5 + rnd() * 0.2))
    for i in range(10):
        a = rnd() * 2 * math.pi; r = 0.5 + rnd() * 0.5
        balls.append((math.cos(a) * r, h + 0.5 + rnd() * 1.0, math.sin(a) * r, 0.35 + rnd() * 0.2))
    m.foliage([LEAF, LEAF3][v % 2], balls, res=0.08, bump=0.12, tris=2600, seed=300 + v)
    m.finish()

def apple():
    m = Scene('apple'); rnd = mulberry(47)
    m.cyl(TRUNK, (0, -0.05, 0), (0.06, 0.7, 0), 0.08, seg=8, r2=0.055)
    for i in range(4):
        a = i / 4 * 2 * math.pi + 0.4
        m.cyl(TRUNK, (0.05, 0.62, 0), (math.cos(a) * 0.38, 0.95, math.sin(a) * 0.38), 0.035, seg=6, r2=0.02)
    balls = [(0, 1.15, 0, 0.5)]
    for i in range(9):
        a = rnd() * 2 * math.pi; r = 0.25 + rnd() * 0.3
        balls.append((math.cos(a) * r, 1.0 + rnd() * 0.45, math.sin(a) * r, 0.25 + rnd() * 0.12))
    m.foliage(LEAF2, balls, res=0.06, bump=0.07, tris=1600, seed=400)
    for i in range(14):
        a = rnd() * 2 * math.pi; r = 0.55 + rnd() * 0.15; y = 0.85 + rnd() * 0.55
        m.sphere(APPLE, (math.cos(a) * r, y, math.sin(a) * r), 0.045, seg=8)
    m.finish()

def house():
    """a Normandy farmhouse, 4 x 2 cells: rubble-stone walls, steep slate roof, two chimneys,
    dormers, blue-grey shutters; the front faces +z."""
    m = Scene('house'); rnd = mulberry(53)
    L, D, Hw = 3.7, 1.75, 1.35
    m.box(STONE2, (0, 0.06, 0), (L + 0.1, 0.12, D + 0.1), bevel=0.02)                   # plinth
    m.box(STONE, (0, Hw / 2, 0), (L - 0.04, Hw, D - 0.04), bevel=0.01)                  # wall core
    for zc, s in ((D / 2, 1), (-D / 2, -1)):                                            # stonework, both long faces
        m.stones(STONE, -L / 2, L / 2, 0.12, Hw, zc, 0.06, rnd)
    for xc in (L / 2, -L / 2):                                                           # gable ends
        for k in range(7):
            y = 0.15 + k * 0.18
            m.box(STONE, (xc, y + 0.08, 0), (0.06, 0.16, D - 0.02), bevel=0.01, segs=1)
    for x in (-L / 2, L / 2):                                                            # corner quoins
        for z in (-D / 2, D / 2):
            for k in range(6): m.box(STONE2, (x, 0.2 + k * 0.22, z), (0.22 if k % 2 else 0.14, 0.2, 0.14 if k % 2 else 0.22), bevel=0.012)
    # gable triangles and the roof (steep, ridge along x)
    rh = 1.25
    m.prism_x(STONE, [(-D / 2 + 0.02, Hw), (D / 2 - 0.02, Hw), (0, Hw + rh - 0.05)], -L / 2 + 0.02, L / 2 - 0.02)
    ang = math.atan2(rh, D / 2)
    for s in (1, -1):                                                                    # roof boards under the slates
        m.box(SLATE, (0, Hw + rh / 2 + 0.03, s * D / 4), (L + 0.3, 0.05, math.hypot(rh, D / 2) + 0.2), bevel=0.01, roll=s * ang)
    # slate courses: thin strips laid on each roof plane
    for s in (1, -1):
        ang = math.atan2(rh, D / 2)
        for k in range(8):
            f = (k + 0.5) / 8                                        # 0 at the eaves, 1 at the ridge
            z = s * (D / 2 + 0.12 - f * (D / 2 + 0.1))
            y = Hw + f * rh + 0.04
            m.box(SLATE, (0, y + 0.03, z), (L + 0.28, 0.025, 0.2), bevel=0.006, roll=s * ang)
    m.cyl(SLATE, (-L / 2 - 0.15, Hw + rh + 0.05, 0), (L / 2 + 0.15, Hw + rh + 0.05, 0), 0.07, seg=8)   # ridge
    for x in (-L / 2 + 0.3, L / 2 - 0.3):                                                # chimneys
        m.box(STONE2, (x, Hw + rh + 0.2, 0), (0.4, 0.9, 0.5), bevel=0.02)
        m.box(STONE, (x, Hw + rh + 0.67, 0), (0.46, 0.06, 0.56), bevel=0.01)
        for dz in (-0.1, 0.1): m.cyl(TILE, (x, Hw + rh + 0.7, dz), (x, Hw + rh + 0.82, dz), 0.05, seg=10)
    for x in (-0.8, 0.8):                                                                 # dormers
        z = D / 2 * 0.45
        m.box(STONE, (x, Hw + 0.45, z), (0.5, 0.55, 0.5), bevel=0.01)
        m.prism(SLATE, [(x - 0.33, Hw + 0.7), (x + 0.33, Hw + 0.7), (x, Hw + 0.98)], z - 0.3, z + 0.3, bevel=0.01)
        m.box(WINDOW, (x, Hw + 0.45, z + 0.26), (0.26, 0.3, 0.02), bevel=0.0)
        m.box(WOOD, (x, Hw + 0.45, z + 0.27), (0.03, 0.3, 0.02), bevel=0.0)
    def window(x, y, face, w=0.36, h=0.46):
        z = face * (D / 2 + 0.01)
        m.box(WINDOW, (x, y, z), (w, h, 0.03), bevel=0.0)
        m.box(PLASTER, (x, y, z + face * 0.01), (0.03, h, 0.02), bevel=0.0)             # glazing bars
        m.box(PLASTER, (x, y + 0.05, z + face * 0.01), (w, 0.03, 0.02), bevel=0.0)
        m.box(STONE2, (x, y - h / 2 - 0.04, z + face * 0.03), (w + 0.12, 0.06, 0.1), bevel=0.01)   # sill
        m.box(STONE2, (x, y + h / 2 + 0.05, z + face * 0.02), (w + 0.14, 0.09, 0.06), bevel=0.01)  # lintel
        for s in (1, -1):                                                                 # shutters, open
            m.box(SHUTTER, (x + s * (w / 2 + 0.11), y, z + face * 0.03), (0.2, h, 0.03), bevel=0.006)
            for k in (-0.12, 0.12): m.box(SHUTTER, (x + s * (w / 2 + 0.11), y + k, z + face * 0.05), (0.18, 0.03, 0.01), bevel=0.0)
    for x in (-1.3, -0.45, 1.1):
        window(x, 0.75, 1)
    for x in (-1.0, 0.9):
        window(x, 0.75, -1)
    z = D / 2 + 0.01                                                                      # front door and step
    m.box(WOOD, (0.35, 0.52, z), (0.46, 0.8, 0.04), bevel=0.005)
    for k in range(1, 4): m.box(BEAM, (0.35 - 0.2 + k * 0.1, 0.52, z + 0.02), (0.015, 0.78, 0.01), bevel=0.0)
    m.box(STONE2, (0.35, 0.96, z + 0.02), (0.6, 0.1, 0.07), bevel=0.01)
    m.box(STONE2, (0.35, 0.08, z + 0.15), (0.64, 0.1, 0.28), bevel=0.015)
    # a water butt, a bench and a woodpile by the walls
    m.cyl(WOOD, (1.55, 0.02, D / 2 + 0.28), (1.55, 0.42, D / 2 + 0.28), 0.14, seg=16)
    for k in (0.12, 0.32): m.torus(BEAM, (1.55, k, D / 2 + 0.28), (0, 1, 0), 0.142, 0.012, seg=16)
    m.box(WOOD, (-0.9, 0.2, D / 2 + 0.2), (0.6, 0.04, 0.14), bevel=0.005)
    for dx in (-0.25, 0.25): m.box(WOOD, (-0.9 + dx, 0.1, D / 2 + 0.2), (0.04, 0.2, 0.12), bevel=0.0)
    for k in range(3):
        for j in range(5 - k):
            m.cyl(WOOD, (-L / 2 - 0.02, 0.07 + k * 0.12, -0.5 + j * 0.13 + k * 0.06), (-L / 2 - 0.3, 0.07 + k * 0.12, -0.5 + j * 0.13 + k * 0.06), 0.06, seg=8)
    m.finish()

def barn():
    """a timber-framed Normandy barn (colombage), 4 x 3 cells, with big plank doors and a tiled roof."""
    m = Scene('barn'); rnd = mulberry(61)
    L, D, Hw, rh = 3.7, 2.6, 1.25, 1.05
    m.box(STONE2, (0, 0.13, 0), (L + 0.06, 0.26, D + 0.06), bevel=0.02)                  # stone footing
    m.stones(STONE2, -L / 2, L / 2, 0.0, 0.26, D / 2 + 0.03, 0.05, rnd, size=0.12)
    m.stones(STONE2, -L / 2, L / 2, 0.0, 0.26, -D / 2 - 0.03, 0.05, rnd, size=0.12)
    m.box(PLASTER, (0, 0.26 + (Hw - 0.26) / 2, 0), (L - 0.04, Hw - 0.26, D - 0.04), bevel=0.005)
    m.prism_x(PLASTER, [(-D / 2 + 0.02, Hw), (D / 2 - 0.02, Hw), (0, Hw + rh - 0.04)], -L / 2 + 0.03, L / 2 - 0.03)
    # timber frame on the long faces: posts, rails and braces
    for face in (1, -1):
        z = face * (D / 2 + 0.005)
        for x in [-L / 2 + 0.05 + i * (L - 0.1) / 6 for i in range(7)]:
            m.box(BEAM, (x, (0.26 + Hw) / 2, z), (0.08, Hw - 0.26, 0.04), bevel=0.005)
        for y in (0.3, 0.8, Hw - 0.04):
            m.box(BEAM, (0, y, z), (L, 0.07, 0.04), bevel=0.005)
        for i in range(6):
            if face == 1 and i in (2, 3): continue                                        # doorway
            x0 = -L / 2 + 0.05 + i * (L - 0.1) / 6
            w = (L - 0.1) / 6                                                           # a diagonal brace in each bay
            m.box(BEAM, (x0 + w / 2, 0.55, z), (0.05, math.hypot(w, 0.5), 0.035), bevel=0.0, pitch=0, roll=0, yaw=0).rotation_euler[1] = math.atan2(w, 0.5) * (1 if i % 2 else -1)
    # gable ends: posts and a braced cross
    for face in (1, -1):
        x = face * (L / 2 + 0.005)
        for zz in (-D / 2 + 0.05, -D / 4, 0, D / 4, D / 2 - 0.05):
            m.box(BEAM, (x, (0.26 + Hw) / 2, zz), (0.04, Hw - 0.26, 0.08), bevel=0.005)
        for y in (0.3, Hw - 0.04): m.box(BEAM, (x, y, 0), (0.04, 0.07, D), bevel=0.005)
        m.box(BEAM, (x, Hw + rh * 0.35, 0), (0.04, 0.06, D * 0.62), bevel=0.0)
        m.box(BEAM, (x, Hw + rh * 0.5, 0), (0.04, rh * 0.9, 0.07), bevel=0.0)
        m.box(WINDOW, (x, Hw + rh * 0.2, D * 0.18), (0.03, 0.22, 0.22), bevel=0.0)
    # big plank doors, one ajar
    z = D / 2 + 0.03
    for k, (x0, yaw) in enumerate(((-0.33, 0.0), (0.4, -0.5))):
        cx, cz = x0, z + (0.18 if yaw else 0)
        m.box(WOOD, (cx, 0.62, cz), (0.62, 0.98, 0.05), bevel=0.005, yaw=yaw)
        for j in range(6):
            dx = -0.26 + j * 0.105
            m.box(BEAM, (cx + dx * math.cos(yaw), 0.62, cz - dx * math.sin(yaw) + 0.03), (0.012, 0.96, 0.01), bevel=0.0, yaw=yaw)
        m.box(BEAM, (cx, 0.62, cz + 0.035), (0.72, 0.06, 0.02), bevel=0.0, yaw=yaw, roll=0.9)
    m.box(WINDOW, (0.0, 0.62, D / 2 - 0.02), (1.2, 0.96, 0.02), bevel=0.0)                # dark inside
    # tiled roof: overlapping courses
    ang = math.atan2(rh, D / 2)
    for s in (1, -1):
        for k in range(9):
            f = (k + 0.5) / 9
            zz = s * (D / 2 + 0.14 - f * (D / 2 + 0.12))
            m.box(TILE, (0, Hw + f * rh + 0.05, zz), (L + 0.3, 0.035, 0.24), bevel=0.008, roll=s * ang)
    m.cyl(TILE, (-L / 2 - 0.15, Hw + rh + 0.07, 0), (L / 2 + 0.15, Hw + rh + 0.07, 0), 0.08, seg=8)
    # hay showing through the loft door, a cart wheel leaning on the wall, a pitchfork
    m.box(WINDOW, (-1.2, Hw + 0.25, D / 2 * 0.45 + 0.12), (0.4, 0.35, 0.03), bevel=0.0)
    m.foliage(HAY, [(-1.2, 1.05, D / 2 + 0.1, 0.18), (-1.05, 1.0, D / 2 + 0.12, 0.14)], res=0.05, bump=0.05, tris=300, seed=500)
    m.torus(WOOD, (1.55, 0.36, D / 2 + 0.12), (0.2, 0, 1), 0.34, 0.035, seg=24)
    for i in range(6):
        a = i / 6 * math.pi
        m.cyl(WOOD, (1.55 - math.cos(a) * 0.33, 0.36 - math.sin(a) * 0.33, D / 2 + 0.12), (1.55 + math.cos(a) * 0.33, 0.36 + math.sin(a) * 0.33, D / 2 + 0.12), 0.015, seg=6)
    m.cyl(WOOD, (1.55, 0.36, D / 2 + 0.08), (1.55, 0.36, D / 2 + 0.17), 0.07, seg=12)
    m.finish()

def stonewall():
    """one cell of dry-stone wall, grown over with moss at the top."""
    m = Scene('stonewall'); rnd = mulberry(71)
    for side in (1, -1):
        m.stones(STONE2, -0.52, 0.52, 0.0, 0.42, side * 0.14, 0.12, rnd, size=0.13)
    m.box(STONE2, (0, 0.2, 0), (1.02, 0.38, 0.2), bevel=0.02)
    for i in range(5):
        x = -0.42 + i * 0.21
        m.box(STONE, (x, 0.47, (rnd() - 0.5) * 0.04), (0.2, 0.1, 0.34), bevel=0.02, yaw=(rnd() - 0.5) * 0.2, roll=(rnd() - 0.5) * 0.2)
    m.foliage(MOSS, [(-0.35 + i * 0.35, 0.5, (rnd() - 0.5) * 0.1, 0.09) for i in range(3)], res=0.03, bump=0.02, tris=300, seed=600)
    m.finish()

def hay():
    """two round bales of hay lying in the field (a 2 x 1 cell piece), with the twine showing."""
    m = Scene('hay'); rnd = mulberry(83)
    for x, yaw in ((-0.5, 0.1), (0.52, -0.15)):
        c, s = math.cos(yaw), math.sin(yaw)
        a, b = (x - s * 0.35, 0.42, c * 0.35), (x + s * 0.35, 0.42, -c * 0.35)
        m.cyl(HAY, a, b, 0.4, seg=28, bevel=0.06)
        for k in range(6):
            t = (k + 0.5) / 6
            p = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
            m.torus(HAY, p, (-s, 0, c), 0.405, 0.012, seg=24)
        for end in (a, b):                                                                # the rolled face
            for r in (0.1, 0.2, 0.3):
                d = 1 if end is b else -1
                m.torus('#b8994f', (end[0] - s * 0.005 * d, end[1], end[2] + c * 0.005 * d), (-s, 0, c), r, 0.01, seg=20)
    for i in range(10):                                                                   # loose straw
        m.cyl(HAY, ((rnd() - 0.5) * 1.8, 0.01, (rnd() - 0.5) * 0.8), ((rnd() - 0.5) * 1.8, 0.02, (rnd() - 0.5) * 0.8), 0.012, seg=5)
    m.finish()

def reeds():
    m = Scene('reeds'); rnd = mulberry(89)
    for i in range(22):
        a = rnd() * 2 * math.pi; r = rnd() * 0.35
        x, z = math.cos(a) * r, math.sin(a) * r
        h = 0.45 + rnd() * 0.45
        lean = (rnd() - 0.5) * 0.25
        m.cyl(REED, (x, 0, z), (x + lean, h, z + lean * 0.5), 0.02, seg=5, r2=0.004)
        if rnd() < 0.35: m.cyl('#5a3d27', (x + lean * 0.9, h * 0.8, z + lean * 0.45), (x + lean, h * 0.95, z + lean * 0.5), 0.028, seg=6)   # bulrush heads
    m.finish()

def crater():
    """a shell hole: a ragged ring of thrown-up earth (the dark hole itself is painted on the ground)."""
    m = Scene('crater'); rnd = mulberry(97)
    balls = []
    for i in range(16):
        a = i / 16 * 2 * math.pi + rnd() * 0.2; r = 0.72 + rnd() * 0.12
        balls.append((math.cos(a) * r, -0.05, math.sin(a) * r, 0.18 + rnd() * 0.08))
    m.foliage(EARTH, balls, res=0.05, bump=0.05, tris=900, seed=700)
    for i in range(6):
        a = rnd() * 2 * math.pi; r = 1.0 + rnd() * 0.3
        m.box(STONE2, (math.cos(a) * r, 0.03, math.sin(a) * r), (0.08 + rnd() * 0.06, 0.06, 0.07), bevel=0.015, yaw=rnd() * 3)
    m.finish()

MODELS = {'hedge0': lambda: hedge(0), 'hedge1': lambda: hedge(1), 'oak0': lambda: oak(0), 'oak1': lambda: oak(1),
          'apple': apple, 'house': house, 'barn': barn, 'stonewall': stonewall, 'hay': hay, 'reeds': reeds, 'crater': crater}

if __name__ == '__main__':
    only = sys.argv[1:]
    for name, build in MODELS.items():
        if only and name not in only: continue
        clear(); build()
