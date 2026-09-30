"""Animals for the scene from the Quaternius "Ultimate Animated Animal Pack" (CC0):
- red deer stag and hind/roe (Stag.gltf, Deer.gltf) recoloured to Carpathian brown;
- a brown bear made from the Wolf: the mesh is reshaped in its bind pose (heavy body and hump,
  thick legs, broad head, short muzzle, round ears, no tail) so every wolf animation still drives it,
  and recoloured dark brown.
Each animal keeps only the clips the scene uses (Walk, Idle, Eating, Gallop, Idle_HeadLow) and is
exported as GLB with its size normalised (metres, feet at y = 0, facing +Z).
Run: python3 make_animals.py <quaternius_glTF_dir> <out_dir>
"""
import bpy, sys, os, mathutils

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
KEEP = {'Walk', 'Idle', 'Eating', 'Gallop', 'Idle_Headlow', 'Idle_2_HeadLow', 'Death', 'Attack', 'Attack_Headbutt'}

def load(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, name + '.gltf'))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm and len(o.data.vertices) > 100]
    for o in list(bpy.data.objects):          # helper spheres etc.
        if o.type == 'MESH' and o not in meshes: bpy.data.objects.remove(o)
    return arm, meshes

def colour(meshes, table):
    for o in meshes:
        for m in o.data.materials:
            for key, rgb in table.items():
                if key.lower() == m.name.lower() or (key.endswith('*') and m.name.lower().startswith(key[:-1].lower())):
                    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1)
                    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9

def export(arm, meshes, name, length):
    # keep only the clips we use
    for a in list(bpy.data.actions):
        if a.name.split('|')[-1] not in KEEP and a.name not in KEEP:
            bpy.data.actions.remove(a)
    # normalise size: body length along the armature's long axis
    bb = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
    ys = [v.y for v in bb]; zs = [v.z for v in bb]
    s = length / (max(ys) - min(ys))
    arm.scale = arm.scale * s
    arm.location.z -= min(zs) * s
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + '.glb'), export_format='GLB', export_animations=True,
                              export_animation_mode='ACTIONS', export_yup=True, export_apply=False)
    print('exported', name, round(s, 3), [a.name for a in bpy.data.actions])

# ---------------------------------------------------------------- deer
arm, meshes = load('Stag')
colour(meshes, {'Material': (0.23, 0.12, 0.06), 'Material.001': (0.36, 0.22, 0.12), 'Material.003': (0.30, 0.22, 0.14),
                'Material.010': (0.02, 0.02, 0.02), 'Material.011': (0.02, 0.02, 0.02)})
export(arm, meshes, 'stag', 2.2)

arm, meshes = load('Deer')
colour(meshes, {'Main': (0.30, 0.16, 0.08), 'Main_Light': (0.55, 0.42, 0.30), 'Main_Dark': (0.16, 0.09, 0.05),
                'Hooves': (0.04, 0.03, 0.03), 'Eye_Black': (0.01, 0.01, 0.01)})
export(arm, meshes, 'hind', 1.9)

# roe deer: the same model, smaller and redder (summer coat)
arm, meshes = load('Deer')
colour(meshes, {'Main': (0.38, 0.14, 0.05), 'Main_Light': (0.60, 0.45, 0.33), 'Main_Dark': (0.20, 0.08, 0.03),
                'Hooves': (0.04, 0.03, 0.03), 'Eye_Black': (0.01, 0.01, 0.01)})
export(arm, meshes, 'roe', 1.2)

# ---------------------------------------------------------------- bear from the wolf
arm, meshes = load('Wolf')
wolf = next(o for o in meshes if o.name.startswith('Wolf'))
vg = {g.index: g.name for g in wolf.vertex_groups}
me = wolf.data
ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
y0, y1, z0, z1 = min(ys), max(ys), min(zs), max(zs)
L, H = y1 - y0, z1 - z0

def weight(v, prefixes):
    return sum(g.weight for g in v.groups if any(vg[g.group].startswith(p) for p in prefixes))

# local axes of the wolf mesh: y along the body (head at +y or -y), z up
head_dir = 1 if sum(v.co.y for v in me.vertices if weight(v, ['Head']) > 0.5) > 0 else -1
cx = sum(v.co.x for v in me.vertices) / len(me.vertices)
for v in me.vertices:
    co = v.co
    body = weight(v, ['Body', 'Back', 'Torso'])
    neck = weight(v, ['Neck'])
    head = weight(v, ['Head'])
    ear = weight(v, ['Ear'])
    leg = weight(v, ['Front', 'Back'])
    leg -= weight(v, ['Back']) - weight(v, ['BackShoulder', 'BackLeg', 'BackUpperLeg', 'BackLowerLeg'])  # 'Back' bone is spine
    tail = weight(v, ['Tail'])
    t = (co.y - y0) / L if head_dir > 0 else (y1 - co.y) / L      # 0 = rear, 1 = nose
    u = (co.z - z0) / H                                              # 0 = feet, 1 = top
    # heavy body with a shoulder hump, wider than tall
    sx = 1 + 0.75 * body + 0.35 * neck + 0.55 * leg + 0.35 * head
    sz = 1 + 0.25 * body * max(0, u - 0.45) * 2
    hump = 0.18 * H * body * max(0, 1 - abs(t - 0.62) / 0.18) * max(0, u - 0.55) * 2
    co.x = cx + (co.x - cx) * sx
    co.z = co.z * (1 + (sz - 1) * body) + hump
    # short, broad muzzle; head pulled back towards the neck
    if head > 0.3 and t > 0.82:
        co.y -= head_dir * (t - 0.82) * L * 0.45 * head
    # small round ears
    if ear > 0.3:
        top = max(zs) - 0.02 * H
        co.z -= (co.z - (top - 0.08 * H)) * 0.55 * ear if co.z > top - 0.08 * H else 0
    # tail collapses into a stub
    if tail > 0.2:
        root_y = y0 + 0.12 * L if head_dir > 0 else y1 - 0.12 * L
        co.y = root_y + (co.y - root_y) * (1 - 0.9 * tail)
        co.z = co.z - (co.z - (z0 + 0.6 * H)) * 0.6 * tail
colour(meshes, {'Main': (0.10, 0.06, 0.035), 'Main_Light': (0.13, 0.08, 0.045), 'Nose': (0.02, 0.02, 0.02), 'Eyes_Black': (0.01, 0.01, 0.01)})
export(arm, meshes, 'bear', 2.1)
