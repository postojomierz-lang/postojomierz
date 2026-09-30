"""Two more Tatra trees, built in Blender and saved as scenes for bake_impostors.py.

- Dead spruce (suchy świerk): the spruces killed by bark beetles stand grey for years. Poly Haven's fir
  tree (CC0) with most of its needles gone (in patches, a few rusty-brown ones left), the dead twigs kept
  and the bark weathered silver-grey.
- Stone pine (limba, Pinus cembra): the tree of the upper tree line, 8-15 m, a broad rounded crown of
  upturned branches ending in dense, dark blue-green needle tufts, often with several tops. Built from a
  tapered trunk (the fir's bark), whorls of ascending branches and copies of Poly Haven's pine saplings
  (CC0) as the tufts.

Run: python3 make_species.py <fir_tree_01_1k.gltf> <pine_sapling_small_1k.gltf> <out_dir>
     -> <out_dir>/deadspruce.blend, <out_dir>/limba.blend (3 variants each, one root per variant)
"""
import math
import os
import random
import sys

import bpy  # before bmesh
import bmesh
import mathutils
from mathutils import Vector

fir_path, sap_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
rnd = random.Random(11)


def tint(mat, rgb, amount=1.0, desat=0.0):
    """Multiply the base colour of a glTF material by rgb (after taking out some saturation)."""
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    sock = bsdf.inputs['Base Color']
    if not sock.links:
        c = sock.default_value
        sock.default_value = (c[0] * rgb[0], c[1] * rgb[1], c[2] * rgb[2], 1)
        return
    src = sock.links[0].from_socket
    hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.inputs['Saturation'].default_value = 1 - desat
    nt.links.new(src, hsv.inputs['Color'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = amount
    nt.links.new(hsv.outputs[0], mix.inputs[6]); mix.inputs[7].default_value = (*rgb, 1)
    nt.links.new(mix.outputs[2], sock)


# ---------------------------------------------------------------- dead spruce
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=fir_path)
sc = bpy.context.scene
noise = mathutils.noise
for o in [o for o in sc.objects if o.type == 'MESH']:
    me = o.data
    twig = [i for i, m in enumerate(me.materials) if m and 'twig' in m.name]
    bm = bmesh.new(); bm.from_mesh(me)
    kill = []
    for f in bm.faces:
        if f.material_index in twig:
            c = f.calc_center_median()
            # needles left only in a few patches (and more low on the tree, where they hang on longest)
            n = noise.noise(c * 0.9)
            if n < 0.35 or rnd.random() < 0.6:
                kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me); bm.free()
    print('dead spruce', o.name, 'faces', len(me.polygons), flush=True)
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    if 'twig' in m.name:
        tint(m, (0.62, 0.38, 0.22), desat=0.85)          # the last needles: rusty brown
    elif 'dead' in m.name:
        tint(m, (0.75, 0.73, 0.70), desat=0.8)
    else:
        tint(m, (0.95, 0.93, 0.9), desat=0.85)           # bark weathered silver-grey
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'deadspruce.blend'))

# ---------------------------------------------------------------- stone pine
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sap_path)
sc = bpy.context.scene
saplings = [o for o in sc.objects if o.parent is None and o.type == 'MESH']
for o in saplings:
    o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    o.hide_render = True; o.hide_set(True)
for m in bpy.data.materials:
    if m.use_nodes and 'twig' in m.name:
        tint(m, (0.62, 0.8, 0.74), desat=0.15)           # limba: darker, bluish needles
# bark: grey-brown, scaly (a procedural material; the fir's textures do not survive the import here)
bark = bpy.data.materials.new('limba_bark'); bark.use_nodes = True
_nt = bark.node_tree; _b = _nt.nodes['Principled BSDF']
_n = _nt.nodes.new('ShaderNodeTexNoise'); _n.inputs['Scale'].default_value = 40; _n.inputs['Detail'].default_value = 6
_r = _nt.nodes.new('ShaderNodeValToRGB')
_r.color_ramp.elements[0].color = (0.10, 0.08, 0.07, 1); _r.color_ramp.elements[1].color = (0.33, 0.28, 0.24, 1)
_nt.links.new(_n.outputs['Fac'], _r.inputs[0]); _nt.links.new(_r.outputs[0], _b.inputs['Base Color'])


def limb(p0, p1, r0, r1, name, parent):
    """A tapered cylinder from p0 to p1 (bark)."""
    d = Vector(p1) - Vector(p0)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=7, radius1=r0, radius2=r1, depth=d.length, calc_uvs=True)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    me.materials.append(bark)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.location = (Vector(p0) + Vector(p1)) / 2
    o.parent = parent
    return o


def tuft(pos, direction, size, parent):
    src = rnd.choice(saplings)
    o = src.copy(); sc.collection.objects.link(o)       # linked copy: shares the mesh
    o.hide_render = False; o.hide_set(False)
    o.parent = parent
    o.rotation_mode = 'QUATERNION'
    q = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    o.rotation_quaternion = q @ mathutils.Quaternion((0, 0, 1), rnd.uniform(0, 6.283))
    o.location = pos
    o.scale = (size, size, size * rnd.uniform(0.8, 1.0))
    return o


for v in range(3):
    root = bpy.data.objects.new(f'limba_{v}', None); sc.collection.objects.link(root)
    H = rnd.uniform(10, 14)
    lean = Vector((rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04), 1)).normalized()
    # trunk in three pieces, slightly crooked
    pts = [Vector((0, 0, 0))]
    for k in range(1, 4):
        pts.append(pts[-1] + (lean + Vector((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), 0))).normalized() * H * 0.32)
    for k in range(3):
        limb(pts[k], pts[k + 1], 0.32 * (1 - k * 0.3), 0.32 * (1 - (k + 1) * 0.3) + 0.03, f'trunk_{v}_{k}', root)
    top = pts[-1]
    # whorls of ascending branches from ~2.5 m; the crown is broadest at ~40 % of the height
    z = rnd.uniform(2.0, 3.0)
    while z < H * 0.93:
        f = z / H
        R = H * 0.3 * math.sin(math.pi * min(1, f * 1.15)) ** 0.8 + 0.4
        n = rnd.randint(4, 6)
        a0 = rnd.uniform(0, 6.283)
        base = pts[0].lerp(top, f)
        for k in range(n):
            az = a0 + k * 6.283 / n + rnd.uniform(-0.4, 0.4)
            side = Vector((math.cos(az), math.sin(az), 0))
            L = R * rnd.uniform(0.75, 1.05)
            rise = rnd.uniform(0.35, 0.8)                   # ascending, stone pine branches turn up
            end = base + side * L + Vector((0, 0, L * rise))
            limb(base, end, 0.07 * (1 - f * 0.6), 0.02, f'br_{v}', root)
            # tufts at the end and along the outer half, pointing up and out
            # stone pine needles grow in dense clumps: tufts along most of the branch, big at the end, plus
            # a few short side shoots so the crown closes
            for t in (0.3, 0.5, 0.68, 0.84, 1.0):
                p = base.lerp(end, t)
                d = (side * 0.45 + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 1))).normalized()
                tuft(p, d, rnd.uniform(1.4, 2.0) * (0.75 + 0.45 * t), root)
            for k2 in range(2):
                t = rnd.uniform(0.45, 0.85)
                p = base.lerp(end, t)
                sd = Vector((-side.y, side.x, 0)) * (1 if k2 else -1)
                tuft(p + sd * L * 0.2, (sd * 0.6 + Vector((0, 0, 1))).normalized(), rnd.uniform(1.2, 1.6), root)
        z += rnd.uniform(0.5, 0.75)
    # the top: two or three leaders with tufts (old stone pines often have several)
    for k in range(rnd.randint(2, 3)):
        d = Vector((rnd.uniform(-0.35, 0.35), rnd.uniform(-0.35, 0.35), 1)).normalized()
        tuft(top + d * 0.3, d, rnd.uniform(1.8, 2.4), root)
    root.location = (v * 40, 0, 0)                       # side by side; the baker centres each
    print('limba', v, 'height', round(H, 1), 'objects', len(root.children), flush=True)
for o in saplings:
    sc.collection.objects.unlink(o)                      # keep the mesh data for the copies, drop the originals
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'limba.blend'))
print('saved', out)
