"""The Tatra animals of the nature catalogue, from the Quaternius "Ultimate Animated Animal Pack" (CC0),
reshaped in their bind pose so every animation of the source still drives them (as the bear in
make_animals.py):
- chamois (kozica) from the Deer: stockier, shorter neck, dark autumn coat with a pale face, and the
  black hooked horns, parented to the head bone;
- marmot (świstak) from the Wolf: very short legs, a round heavy body, short muzzle, tiny ears, a short
  bushy tail, grey-brown;
- wolf (wilk): the Wolf in grey.
Exported as GLB with the clips the scene uses, size normalised (metres, feet at y = 0).
Run: python3 make_tatra_animals.py <quaternius_glTF_dir> <out_dir>
"""
import bpy  # before bmesh
import bmesh
import math
import os
import sys

import mathutils
from mathutils import Matrix, Vector

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
KEEP = {'Walk', 'Idle', 'Eating', 'Gallop', 'Idle_Headlow', 'Idle_2_HeadLow'}


def load(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, name + '.gltf'))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm and len(o.data.vertices) > 100]
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o not in meshes:
            bpy.data.objects.remove(o)
    return arm, meshes


def colour(meshes, table):
    for o in meshes:
        for m in o.data.materials:
            for key, rgb in table.items():
                if key.lower() == m.name.lower():
                    b = m.node_tree.nodes['Principled BSDF']
                    for l in list(b.inputs['Base Color'].links):      # the pack's colour comes from a node
                        m.node_tree.links.remove(l)
                    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.9


def export(arm, meshes, name, length, extra=()):
    for a in list(bpy.data.actions):
        if a.name.split('|')[-1] not in KEEP and a.name not in KEEP:
            bpy.data.actions.remove(a)
    bb = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    ys = [v.y for v in bb]; zs = [v.z for v in bb]
    s = length / (max(ys) - min(ys))
    arm.scale = arm.scale * s
    arm.location.z -= min(zs) * s
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + '.glb'), export_format='GLB', export_animations=True,
                              export_animation_mode='ACTIONS', export_yup=True, export_apply=False)
    print('exported', name, round(s, 3), [a.name for a in bpy.data.actions], flush=True)


def reshape(mesh_obj, fn):
    """Move the bind-pose vertices of the main mesh with fn(co, w, t, u) (w: weight by bone prefix)."""
    vg = {g.index: g.name for g in mesh_obj.vertex_groups}
    me = mesh_obj.data
    ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    y0, y1, z0, z1 = min(ys), max(ys), min(zs), max(zs)
    L, H = y1 - y0, z1 - z0

    def w(v, prefixes):
        return sum(g.weight for g in v.groups if any(vg[g.group].startswith(p) for p in prefixes))
    head_dir = 1 if sum(v.co.y for v in me.vertices if w(v, ['Head']) > 0.5) > 0 else -1
    cx = sum(v.co.x for v in me.vertices) / len(me.vertices)
    for v in me.vertices:
        t = (v.co.y - y0) / L if head_dir > 0 else (y1 - v.co.y) / L     # 0 rear, 1 nose
        u = (v.co.z - z0) / H                                             # 0 feet, 1 top
        fn(v.co, lambda p: w(v, p), t, u, dict(cx=cx, y0=y0, y1=y1, z0=z0, z1=z1, L=L, H=H, hd=head_dir))
    return dict(y0=y0, y1=y1, z0=z0, z1=z1, L=L, H=H, hd=head_dir, cx=cx)


# ---------------------------------------------------------------- chamois from the deer
arm, meshes = load('Deer')
deer = max(meshes, key=lambda o: len(o.data.vertices))


def chamois(co, w, t, u, g):
    neck, head, body, leg = w(['Neck']), w(['Head']), w(['Body', 'Spine', 'Hips']), w(['Leg', 'Front', 'Back'])
    # shorter neck: the head and neck come back and down a little
    if neck + head > 0.3 and t > 0.7:
        k = (t - 0.7) / 0.3
        co.y -= g['hd'] * k * g['L'] * 0.12 * (neck + head)
        co.z -= k * g['H'] * 0.06 * (neck + head)
    # stockier: body wider, legs a little thicker
    co.x = g['cx'] + (co.x - g['cx']) * (1 + 0.25 * body + 0.15 * leg)


info = reshape(deer, chamois)
colour(meshes, {'Main': (0.11, 0.075, 0.05), 'Main_Light': (0.62, 0.55, 0.44), 'Main_Dark': (0.05, 0.035, 0.025),
                'Hooves': (0.03, 0.03, 0.03), 'Eye_Black': (0.01, 0.01, 0.01)})
# the horns: hooked black tubes on the head bone
hb = next(b for b in arm.data.bones if 'Head' in b.name)
horn_mat = bpy.data.materials.new('Horn'); horn_mat.use_nodes = True
horn_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
M = arm.matrix_world
# the crown of the head: the highest vertex of the head that is not an ear
vg = {g.index: g.name for g in deer.vertex_groups}
def wt(v, pre): return sum(g.weight for g in v.groups if vg[g.group].startswith(pre))
skull = [v for v in deer.data.vertices if wt(v, 'Head') > 0.6 and wt(v, 'Ear') < 0.05]
crown = deer.matrix_world @ max(skull, key=lambda v: v.co.z).co
fwd = (M.to_3x3() @ Vector((0, info['hd'], 0))).normalized()
up = Vector((0, 0, 1))
size = info['H'] * M.to_scale()[2] * 0.11
bm = bmesh.new()
for side in (-1, 1):
    base = crown + Vector((side * size * 0.3, 0, 0)) - up * size * 0.05
    pts = []
    for k in range(9):                                   # straight up, then hooked backwards at the tip
        a = k / 8
        hook = max(0, a - 0.55) / 0.45
        pts.append(base + up * size * (a * 1.0 - hook * hook * 0.25) - fwd * size * (hook * 0.55) + Vector((side * size * 0.05 * a, 0, 0)))
    rings = []
    for k, p in enumerate(pts):
        r = size * 0.12 * (1 - k / 9 * 0.8)
        d = (pts[min(k + 1, 8)] - pts[max(k - 1, 0)]).normalized()
        a1 = d.cross(Vector((1, 0, 0))).normalized(); a2 = d.cross(a1).normalized()
        rings.append([bm.verts.new(p + (a1 * math.cos(q * 1.2566) + a2 * math.sin(q * 1.2566)) * r) for q in range(5)])
    for k in range(8):
        for q in range(5):
            bm.faces.new([rings[k][q], rings[k][(q + 1) % 5], rings[k + 1][(q + 1) % 5], rings[k + 1][q]])
# into the chamois mesh itself, weighted fully to the head bone: the horns move exactly as the head does
deer.data.materials.append(horn_mat)
mi = len(deer.data.materials) - 1
inv = deer.matrix_world.inverted()
head_group = next(g for g in deer.vertex_groups if g.name.startswith('Head'))
dm = bmesh.new(); dm.from_mesh(deer.data)
deform = dm.verts.layers.deform.verify()
vmap = {}
for v in bm.verts:
    nv = dm.verts.new(inv @ v.co); nv[deform][head_group.index] = 1.0; vmap[v] = nv
for f in bm.faces:
    nf = dm.faces.new([vmap[v] for v in f.verts]); nf.material_index = mi
bm.free()
dm.to_mesh(deer.data); dm.free()
export(arm, meshes, 'chamois', 1.25)

# ---------------------------------------------------------------- marmot from the wolf
arm, meshes = load('Wolf')
wolf = next(o for o in meshes if o.name.startswith('Wolf'))


def marmot(co, w, t, u, g):
    body, neck, head, ear, tail = w(['Body', 'Back', 'Torso']), w(['Neck']), w(['Head']), w(['Ear']), w(['Tail'])
    leg = w(['Front', 'BackShoulder', 'BackLeg', 'BackUpperLeg', 'BackLowerLeg'])
    belly = g['z0'] + 0.42 * g['H']
    # very short legs: everything below the belly squeezed up
    if co.z < belly:
        co.z = belly - (belly - co.z) * 0.32
    # a round heavy body
    co.x = g['cx'] + (co.x - g['cx']) * (1 + 0.9 * body + 0.5 * neck + 0.4 * head + 0.5 * leg)
    if body > 0.3 and u > 0.45:
        co.z += (u - 0.45) * g['H'] * 0.35 * body
    # short muzzle, head closer to the body
    if head > 0.3 and t > 0.8:
        co.y -= g['hd'] * (t - 0.8) * g['L'] * 0.55 * head
    if neck + head > 0.3 and t > 0.68:
        co.y -= g['hd'] * g['L'] * 0.08 * (neck + head)
    # tiny ears
    if ear > 0.3:
        co.z -= (co.z - (g['z1'] - 0.12 * g['H'])) * 0.75 * ear if co.z > g['z1'] - 0.12 * g['H'] else 0
    # short bushy tail
    if tail > 0.2:
        root = g['y0'] + 0.1 * g['L'] if g['hd'] > 0 else g['y1'] - 0.1 * g['L']
        co.y = root + (co.y - root) * (1 - 0.6 * tail)
        co.x = g['cx'] + (co.x - g['cx']) * (1 + 0.8 * tail)


reshape(wolf, marmot)
colour(meshes, {'Main': (0.30, 0.25, 0.18), 'Main_Light': (0.45, 0.38, 0.28), 'Nose': (0.03, 0.02, 0.02), 'Eyes_Black': (0.01, 0.01, 0.01)})
export(arm, meshes, 'marmot', 0.6)

# ---------------------------------------------------------------- wolf
arm, meshes = load('Wolf')
colour(meshes, {'Main': (0.30, 0.28, 0.25), 'Main_Light': (0.56, 0.53, 0.48), 'Nose': (0.02, 0.02, 0.02), 'Eyes_Black': (0.01, 0.01, 0.01)})
export(arm, meshes, 'wolf', 1.3)
