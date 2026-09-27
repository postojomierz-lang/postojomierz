"""Decimates Poly Haven rock sets (CC0) for the browser: one GLB with every rock as its own mesh,
centred at its base, ~1500 triangles each, textures at 512 px JPEG.
Run: python3 decimate_rocks.py <out.glb> <set1.gltf> [<set2.gltf> ...]
"""
import bpy, sys, mathutils

out, sets = sys.argv[1], sys.argv[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
rocks = []
for si, path in enumerate(sets):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in [o for o in bpy.data.objects if o not in before and o.type == 'MESH']:
        o.name = f'rock_{len(rocks)}'
        rocks.append(o)
for o in rocks:
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects: s.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    m = o.modifiers.new('d', 'DECIMATE'); m.ratio = min(1.0, 1500 / max(tris, 1))
    bpy.ops.object.modifier_apply(modifier='d')
    # origin at the centre of the base, placed at the world origin
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    cx = sum(v.x for v in bb) / 8; cy = sum(v.y for v in bb) / 8; cz = min(v.z for v in bb)
    o.data.transform(mathutils.Matrix.Translation((-cx + o.location.x, -cy + o.location.y, -cz + o.location.z)))
    o.location = (0, 0, 0)
    print(o.name, tris, '->', sum(len(p.vertices) - 2 for p in o.data.polygons))
for img in bpy.data.images:
    if img.size[0] > 512: img.scale(512, 512)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
                          export_apply=True, export_yup=True)
print('exported', out)
