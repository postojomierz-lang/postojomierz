"""Rowan (jarzębina, Sorbus aucuparia), built in Blender for bake_impostors.py.

In the Tatras the rowan grows at the forest edge and among the dwarf pine up to ~1700 m: a small tree of
4-9 m, often with several stems, an open rounded crown of pinnate leaves (11-15 leaflets) and, from late
summer, clusters of bright red berries. Everything is geometry, no textures: bark cylinders, leaflets as
small ellipses along each leaf stalk, berries as little spheres. Three variants: two in summer green
with ripe berries, one turning orange-red as at the end of September.

Run: python3 make_rowan.py <out_dir>   -> <out_dir>/rowan.blend (one root per variant)
"""
import math
import os
import random
import sys

import bpy  # before bmesh
import bmesh
import mathutils
from mathutils import Vector, Matrix

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
rnd = random.Random(23)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def material(name, rgb, rough=0.6):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    return m


BARK = material('rowan_bark', (0.16, 0.15, 0.13), 0.8)          # smooth grey bark
BERRY = material('rowan_berry', (0.62, 0.05, 0.02), 0.35)
LEAF = [material('rowan_leaf', (0.13, 0.26, 0.05)), material('rowan_leaf2', (0.17, 0.30, 0.06)),
        material('rowan_leaf_autumn', (0.55, 0.18, 0.03)), material('rowan_leaf_autumn2', (0.62, 0.34, 0.05))]


def add_mesh(name, bm, mats, parent):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); o.parent = parent
    return o


def cylinder(bm, p0, p1, r0, r1, seg=6):
    d = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    ret = bmesh.ops.create_cone(bm, cap_ends=False, segments=seg, radius1=r0, radius2=r1, depth=d.length)
    M = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=M, verts=ret['verts'])


def leaf(bm, base, direction, length, mat_index):
    """A pinnate leaf: 5-7 pairs of leaflets and one at the tip, along a stalk."""
    d = direction.normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-3: side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(d).normalized()
    pairs = rnd.randint(5, 7)
    for k in range(pairs + 1):
        t = 0.2 + 0.8 * k / pairs
        c = base + d * length * t
        for sgn in ((1, -1) if k < pairs else (0,)):
            ax = (side * sgn + d * 0.35).normalized() if sgn else d
            L, W = length * 0.28, length * 0.08
            centre = c + ax * L * 0.5
            vs = []
            for a in range(8):
                ang = a / 8 * 2 * math.pi
                p = centre + ax * math.cos(ang) * L * 0.5 + (ax.cross(up)).normalized() * math.sin(ang) * W * 0.5 \
                    + up * (math.cos(ang) ** 2) * L * 0.08                      # a little cupped
                vs.append(bm.verts.new(p))
            f = bm.faces.new(vs); f.material_index = mat_index


for v in range(3):
    root = bpy.data.objects.new(f'rowan_{v}', None); sc.collection.objects.link(root)
    autumn = v == 2
    H = rnd.uniform(5.0, 7.5)
    wood = bmesh.new(); leaves = bmesh.new(); berries = bmesh.new()
    stems = rnd.randint(1, 3)
    tips = []
    for s in range(stems):
        lean = Vector((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 1)).normalized()
        p0 = Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0))
        top = p0 + lean * H * rnd.uniform(0.75, 1.0)
        cylinder(wood, p0, top, 0.12 / math.sqrt(stems), 0.03)
        # branches: ascending, along the upper two thirds, with twigs that carry the leaves
        for b in range(rnd.randint(13, 18)):
            t = rnd.uniform(0.3, 0.95)
            a = p0.lerp(top, t)
            az = rnd.uniform(0, 6.283)
            L = H * 0.35 * (1.1 - t * 0.6) * rnd.uniform(0.7, 1.1)
            e = a + Vector((math.cos(az), math.sin(az), rnd.uniform(0.5, 1.1))).normalized() * L
            cylinder(wood, a, e, 0.035, 0.01, 5)
            for tw in range(rnd.randint(6, 9)):
                u = rnd.uniform(0.25, 1.0)
                q = a.lerp(e, u)
                d = Vector((math.cos(az + rnd.uniform(-1, 1)), math.sin(az + rnd.uniform(-1, 1)), rnd.uniform(0.2, 0.8))).normalized()
                q2 = q + d * rnd.uniform(0.4, 0.8)
                cylinder(wood, q, q2, 0.012, 0.005, 4)
                tips.append((q2, d))
    # leaves: rosettes at the twig tips, drooping a little; berry clusters on some tips
    for (q, d) in tips:
        for k in range(rnd.randint(8, 11)):
            az = rnd.uniform(0, 6.283)
            ld = (d * 0.4 + Vector((math.cos(az), math.sin(az), rnd.uniform(-0.35, 0.25)))).normalized()
            mi = (2 + rnd.randint(0, 1)) if autumn and rnd.random() < 0.8 else rnd.randint(0, 1)
            leaf(leaves, q, ld, rnd.uniform(0.22, 0.32), mi)
        if rnd.random() < 0.3:
            c = q + Vector((0, 0, -0.08))
            for k in range(rnd.randint(18, 35)):
                p = c + Vector((rnd.gauss(0, 0.05), rnd.gauss(0, 0.05), rnd.gauss(0, 0.03) - 0.03))
                bmesh.ops.create_icosphere(berries, subdivisions=1, radius=0.013, matrix=Matrix.Translation(p))
    add_mesh(f'rowan_wood_{v}', wood, [BARK], root)
    add_mesh(f'rowan_leaves_{v}', leaves, LEAF, root)
    add_mesh(f'rowan_berries_{v}', berries, [BERRY], root)
    root.location = (v * 30, 0, 0)                  # side by side; the baker centres each
    print('rowan', v, 'height', round(H, 1), 'tips', len(tips), flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'rowan.blend'))
print('saved', out)
