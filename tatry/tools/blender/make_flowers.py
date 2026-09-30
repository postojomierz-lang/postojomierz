"""Low-poly 3D flowers of the best-known Tatra plants for the nature spots (src/nature/flowers.js):
szarotka (edelweiss: a woolly white star of bracts around yellow-grey heads, grey leaves), goryczka
krótkołodygowa (a big, upright, deep-blue trumpet on a short stem), goryczka kropkowana (tall, with pale
yellow bells in whorls), goryczka przezroczysta (a few pale, glassy bells), krokus (a violet goblet among
long grassy leaves), sasanka alpejska (a white cup with a yellow centre and feathery leaves), urdzik
(violet, fringed, nodding bells: the Tatra "bell") and dzwonek-like campanula for the rest.
Each plant is built from petals, leaves and stems (bmesh), coloured per vertex (base to tip gradients),
1 unit = 1 m with the ground at y = 0, and exported as GLB with vertex colours.
Run: python3 make_flowers.py <out_dir>
"""
import math
import os
import random
import sys

import bpy  # before bmesh
import bmesh
from mathutils import Matrix, Vector

out = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(out, exist_ok=True)


def srgb(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def mix(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(4)]


class Plant:
    def __init__(self, seed):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.rnd = random.Random(seed)

    def face(self, pts, cols):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        for loop, c in zip(f.loops, cols):
            loop[self.col] = c
        return f

    def grid(self, rows, cols, pos, colour):
        """a surface from pos(u, v) -> Vector, colour(u, v) -> rgba; u across, v along"""
        P = [[pos(i / cols, j / rows) for i in range(cols + 1)] for j in range(rows + 1)]
        C = [[colour(i / cols, j / rows) for i in range(cols + 1)] for j in range(rows + 1)]
        for j in range(rows):
            for i in range(cols):
                self.face([P[j][i], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i]], [C[j][i], C[j][i + 1], C[j + 1][i + 1], C[j + 1][i]])

    def tube(self, path, radius, colour, sides=5):
        """a thin stem along path (list of Vectors), radius(t)"""
        rings = []
        for k, p in enumerate(path):
            d = (path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]).normalized()
            a = d.cross(Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))).normalized()
            b = d.cross(a).normalized()
            r = radius(k / (len(path) - 1))
            rings.append([p + (a * math.cos(q * 2 * math.pi / sides) + b * math.sin(q * 2 * math.pi / sides)) * r for q in range(sides)])
        for k in range(len(rings) - 1):
            t0, t1 = k / (len(rings) - 1), (k + 1) / (len(rings) - 1)
            for q in range(sides):
                q1 = (q + 1) % sides
                self.face([rings[k][q], rings[k][q1], rings[k + 1][q1], rings[k + 1][q]], [colour(t0), colour(t0), colour(t1), colour(t1)])

    def stem(self, base, top, bend, radius, colour, n=6):
        path = []
        for k in range(n + 1):
            t = k / n
            p = base.lerp(top, t) + bend * math.sin(t * math.pi) * 0.5 + bend * t * 0.5
            path.append(p)
        self.tube(path, lambda t: radius * (1 - 0.4 * t), lambda t: colour)
        return path[-1], (path[-1] - path[-2]).normalized()

    def leaf(self, base, direction, length, width, lift, colour, tip=None, fold=0.3, droop=0.3):
        """a lanceolate leaf from base along direction (horizontal), rising by lift then drooping"""
        d = Vector((direction.x, direction.y, 0)).normalized()
        side = Vector((-d.y, d.x, 0))
        tip = tip or colour

        def pos(u, v):
            w = width * math.sin(math.pi * min(1, v * 1.1)) * (1 - v * 0.35)
            s = (u - 0.5) * 2
            h = lift * math.sin(v * math.pi * 0.5) - droop * length * v * v + fold * width * abs(s)
            return base + d * (length * v) + side * (s * w) + Vector((0, 0, h))
        self.grid(4, 2, pos, lambda u, v: mix(colour, tip, v))

    def petal(self, centre, axis, out_dir, length, width, cup, colour, tip, curl=0.0, pointed=True, rows=4, cols=2):
        """a petal from centre: rising along axis by `cup` (0 flat .. 1 upright), outwards along out_dir"""
        a = axis.normalized()
        o = (out_dir - a * out_dir.dot(a)).normalized()
        side = a.cross(o).normalized()
        dirv = (o * math.cos(cup * math.pi / 2) + a * math.sin(cup * math.pi / 2)).normalized()

        def pos(u, v):
            shape = math.sin(math.pi * v) if pointed else math.sin(math.pi * 0.5 * min(1, v * 1.4)) ** 0.5
            w = width * shape
            s = (u - 0.5) * 2
            bend = curl * length * v * v
            n = dirv.cross(side).normalized()
            return centre + dirv * (length * v) + side * (s * w) + n * (bend - 0.25 * width * s * s)
        self.grid(rows, cols, pos, lambda u, v: mix(colour, tip, v))

    def bell(self, top, down, length, radius, colour, rim, lobes=5, flare=0.35, rows=5, fringe=False):
        """a bell hanging from top along down: a lathe with a flared, lobed rim"""
        d = down.normalized()
        a = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
        b = d.cross(a).normalized()
        segs = lobes * 3

        def pos(u, v):
            ang = u * 2 * math.pi
            lobe = 1 + 0.18 * math.cos(ang * lobes)
            r = radius * (0.35 + 0.65 * math.sin(v * math.pi * 0.5)) * (1 + flare * v ** 3) * (lobe if v > 0.6 else 1)
            ext = length * v * (1 + (0.12 * math.cos(ang * lobes * (4 if fringe else 1)) if v > 0.85 else 0))
            return top + d * ext + (a * math.cos(ang) + b * math.sin(ang)) * r
        self.grid(rows, segs, pos, lambda u, v: mix(colour, rim, v))

    def disc(self, centre, normal, radius, colour, n=8, dome=0.3):
        nn = normal.normalized()
        a = nn.cross(Vector((1, 0, 0)) if abs(nn.x) < 0.9 else Vector((0, 1, 0))).normalized()
        b = nn.cross(a)
        top = centre + nn * radius * dome
        ring = [centre + (a * math.cos(q * 2 * math.pi / n) + b * math.sin(q * 2 * math.pi / n)) * radius for q in range(n)]
        for q in range(n):
            self.face([top, ring[q], ring[(q + 1) % n]], [colour, colour, colour])

    def save(self, name):
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me); self.bm.free()
        for p in me.polygons:
            p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        mat = bpy.data.materials.new(name + '_mat'); mat.use_nodes = True
        nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.85
        me.materials.append(mat)
        for o in bpy.context.scene.objects:
            o.select_set(o == ob)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + '.glb'), export_format='GLB', use_selection=True,
                                  export_vertex_color='ACTIVE', export_normals=True, export_materials='EXPORT', export_yup=True)
        print('exported', name, len(me.polygons), 'faces', flush=True)
        bpy.data.objects.remove(ob)


Z = Vector((0, 0, 1))
green, dark = srgb(0x4f7a2e), srgb(0x2f4f1c)


def rosette(pl, n, length, width, colour, tip=None, lift=0.02, droop=0.3, base=Vector((0, 0, 0.005))):
    for k in range(n):
        a = k / n * 2 * math.pi + pl.rnd.random() * 0.4
        pl.leaf(base, Vector((math.cos(a), math.sin(a), 0)), length * (0.8 + 0.4 * pl.rnd.random()), width, lift, colour, tip, droop=droop)


def szarotka():
    pl = Plant(1)
    felt, felt_tip = srgb(0xd9dbd2), srgb(0xf4f4ee)
    grey = srgb(0x9aa38f)
    rosette(pl, 7, 0.05, 0.007, grey, srgb(0xb8bfae), lift=0.01)
    for s in range(3):                                            # three stems, each with its star
        a = s * 2.1 + 0.3
        base = Vector((math.cos(a) * 0.012, math.sin(a) * 0.012, 0))
        top, d = pl.stem(base, base + Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, 0.1 + 0.03 * s)), Vector((0.01, 0, 0)), 0.0022, grey)
        for k in range(3):                                        # small leaves on the stem
            aa = k * 2.2
            p = base.lerp(top, 0.25 + 0.2 * k)
            pl.leaf(p, Vector((math.cos(aa), math.sin(aa), 0)), 0.02, 0.004, 0.006, grey, droop=0.1)
        n = 9
        for k in range(n):                                        # the woolly star of bracts
            b = k / n * 2 * math.pi
            out_d = Vector((math.cos(b), math.sin(b), 0))
            pl.petal(top, d, out_d, 0.022 + 0.006 * pl.rnd.random(), 0.0065, 0.12, felt, felt_tip, curl=-0.1)
        for k in range(5):                                        # the flower heads in the middle
            b = k / 5 * 2 * math.pi
            pl.disc(top + Vector((math.cos(b), math.sin(b), 0)) * 0.005 + d * 0.003, d, 0.0035, srgb(0xc8c49a), n=6, dome=0.8)
        pl.disc(top + d * 0.004, d, 0.004, srgb(0xd8d2a0), n=6, dome=0.9)
    pl.save('szarotka')


def goryczka_clusii():
    pl = Plant(2)
    rosette(pl, 6, 0.045, 0.012, green, srgb(0x6f9a3e), lift=0.005, droop=0.05)
    blue, deep = srgb(0x1c3fc4), srgb(0x14268a)
    top, d = pl.stem(Vector((0, 0, 0)), Vector((0.004, 0, 0.035)), Vector((0, 0, 0)), 0.003, green)
    # the trumpet: a cone opening upwards, five pointed lobes at the rim
    pl.bell(top, Vector((0, 0.05, 1)), 0.055, 0.012, deep, blue, lobes=5, flare=1.1, rows=6)
    for k in range(5):                                            # the flared lobes
        b = k / 5 * 2 * math.pi + 0.3
        rim = top + Vector((0, 0.003, 0.055))
        pl.petal(rim, Vector((0, 0.05, 1)), Vector((math.cos(b), math.sin(b), 0)), 0.014, 0.008, 0.35, blue, srgb(0x3a60e0))
    pl.save('goryczka-krotkolodygowa')


def goryczka_punctata():
    pl = Plant(3)
    yel, spot = srgb(0xe6c43a), srgb(0xd8b020)
    top, d = pl.stem(Vector((0, 0, 0)), Vector((0.01, 0, 0.42)), Vector((0.01, 0.005, 0)), 0.004, green, n=8)
    for w, h in [(0.18, 3), (0.3, 3), (0.42, 4)]:                 # whorls of leaves and bells up the stem
        c = Vector((0.01 * w / 0.42, 0, w))
        for k in range(2):
            a = k * math.pi + w * 7
            pl.leaf(c - Vector((0, 0, 0.01)), Vector((math.cos(a), math.sin(a), 0)), 0.07, 0.018, 0.03, green, srgb(0x6a9a40), droop=0.2)
        for k in range(h):
            a = k / h * 2 * math.pi + w * 3
            base = c + Vector((math.cos(a), math.sin(a), 0)) * 0.012
            pl.bell(base, Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 1)), 0.038, 0.012, srgb(0xb8a040), yel, lobes=6, flare=0.5, rows=4)
    pl.save('goryczka-kropkowana')


def goryczka_frigida():
    pl = Plant(4)
    for k in range(5):
        a = k / 5 * 2 * math.pi
        pl.leaf(Vector((0, 0, 0.003)), Vector((math.cos(a), math.sin(a), 0)), 0.04, 0.004, 0.02, green, droop=0.1)
    pale, stripe = srgb(0xe9ecc8), srgb(0x9aa0c8)
    for s in range(2):
        a = s * 2.6
        top, d = pl.stem(Vector((math.cos(a) * 0.008, math.sin(a) * 0.008, 0)), Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, 0.07)), Vector((0.005, 0, 0)), 0.0025, green)
        pl.bell(top, Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 1)), 0.032, 0.009, stripe, pale, lobes=5, flare=0.7, rows=5)
    pl.save('goryczka-przezroczysta')


def krokus():
    pl = Plant(5)
    for k in range(6):                                            # long, narrow leaves, nearly upright
        a = k / 6 * 2 * math.pi
        pl.leaf(Vector((0, 0, 0)), Vector((math.cos(a), math.sin(a), 0)), 0.03, 0.0035, 0.13, green, srgb(0x7aa050), fold=0.8, droop=0.05)
    violet, pale, throat = srgb(0x8a4ac8), srgb(0xb88ae0), srgb(0xd8c8e8)
    top, d = pl.stem(Vector((0, 0, 0)), Vector((0, 0, 0.07)), Vector((0, 0, 0)), 0.003, srgb(0xe8e0d0))
    for k in range(6):                                            # the goblet: six petals, three in, three out
        b = k / 6 * 2 * math.pi + (0.2 if k % 2 else 0)
        pl.petal(top, Z, Vector((math.cos(b), math.sin(b), 0)), 0.045, 0.013, 0.78 if k % 2 else 0.7, throat, violet if k % 2 else pale, curl=-0.05, pointed=False, rows=5)
    for k in range(3):                                            # orange stigma and yellow anthers
        b = k / 3 * 2 * math.pi
        pl.stem(top, top + Vector((math.cos(b) * 0.004, math.sin(b) * 0.004, 0.028)), Vector((0, 0, 0)), 0.0012, srgb(0xf08a1c), n=2)
    pl.save('krokus')


def sasanka():
    pl = Plant(6)
    for k in range(5):                                            # feathery, finely cut leaves: several narrow blades
        a = k / 5 * 2 * math.pi
        for j in range(3):
            aa = a + (j - 1) * 0.3
            pl.leaf(Vector((0, 0, 0.005)), Vector((math.cos(aa), math.sin(aa), 0)), 0.06, 0.004, 0.04, green, srgb(0x6a9040), droop=0.2)
    white, cream = srgb(0xf6f4ea), srgb(0xfffef8)
    top, d = pl.stem(Vector((0, 0, 0)), Vector((0.01, 0, 0.22)), Vector((0.01, 0, 0)), 0.0035, green, n=7)
    for k in range(3):                                            # the leafy collar under the flower
        a = k * 2.1
        pl.leaf(top - Vector((0, 0, 0.03)), Vector((math.cos(a), math.sin(a), 0)), 0.03, 0.004, 0.01, green, droop=0.2)
    for k in range(6):                                            # a wide white cup
        b = k / 6 * 2 * math.pi
        pl.petal(top, d, Vector((math.cos(b), math.sin(b), 0)), 0.03, 0.014, 0.45, srgb(0xe8e4d4), white if k % 2 else cream, curl=-0.05, pointed=False, rows=4)
    pl.disc(top + d * 0.004, d, 0.009, srgb(0xf0c21e), n=10, dome=0.6)
    pl.save('sasanka')


def urdzik():
    pl = Plant(7)
    for k in range(4):                                            # round, leathery leaves
        a = k / 4 * 2 * math.pi
        pl.leaf(Vector((0, 0, 0.004)), Vector((math.cos(a), math.sin(a), 0)), 0.028, 0.014, 0.008, dark, green, droop=0.05)
    vio, pale = srgb(0x7a4ac0), srgb(0xa98ae0)
    for s in range(3):                                            # nodding, fringed bells on arching stalks
        a = s * 2.1
        top, d = pl.stem(Vector((0, 0, 0)), Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, 0.09 + 0.02 * s)), Vector((math.cos(a) * 0.015, math.sin(a) * 0.015, 0)), 0.0018, srgb(0x6a4a5a))
        pl.bell(top, Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, -1)), 0.016, 0.006, vio, pale, lobes=5, flare=0.9, rows=4, fringe=True)
    pl.save('urdzik')


for f in (szarotka, goryczka_clusii, goryczka_punctata, goryczka_frigida, krokus, sasanka, urdzik):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    f()
