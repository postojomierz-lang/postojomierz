"""Puts chosen variants (root objects) of several glTF models into one .glb, so they bake into one
impostor atlas (rows in the given order).

Run: python3 combine_gltf.py <out.glb> <model.gltf>:<i,j,...|all> [...]
"""
import bpy, sys

out, specs = sys.argv[1], sys.argv[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
order = []
for spec in specs:
    path, pick = spec.rsplit(':', 1)
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    roots = [o for o in sc.objects if o not in before and o.parent is None]
    keep = range(len(roots)) if pick == 'all' else [int(i) for i in pick.split(',')]
    for i, o in enumerate(roots):
        if i in keep: order.append(o)
        else:
            for c in [o] + list(o.children_recursive): bpy.data.objects.remove(c, do_unlink=True)
# the baker takes the roots in scene order: name them so the order survives the export
for k, o in enumerate(order): o.name = f'v{k:02d}_{o.name}'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')
print('combined', len(order), '->', out)
