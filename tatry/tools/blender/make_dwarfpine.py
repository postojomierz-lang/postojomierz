"""Dwarf mountain pine (kosodrzewina, Pinus mugo) clumps from Poly Haven's pine_sapling_small (CC0).

Mugo pine grows as a low, sprawling bush: many stems rise from one root and lean outwards, often
almost lying on the slope, 1-2.5 m high. Each clump here is 11-15 linked copies of the saplings, tilted
radially outwards by 32-68 degrees (three more upright in the middle) and squashed a little.
The result is exported as a glTF with one root empty per clump, ready for bake_impostors.py.

Run: python3 make_dwarfpine.py <pine_sapling_small_1k.gltf> <out.glb> [clumps]
"""
import bpy, sys, math, random

src, out = sys.argv[1], sys.argv[2]
clumps = int(sys.argv[3]) if len(sys.argv) > 3 else 4
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
saplings = [o for o in sc.objects if o.parent is None and o.type == 'MESH']
for o in saplings:
    o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)

for c in range(clumps):
    root = bpy.data.objects.new(f'mugo_{c}', None)
    sc.collection.objects.link(root)
    n = random.randint(11, 15)
    for k in range(n):
        src_o = random.choice(saplings)
        o = src_o.copy()                      # linked copy: shares the mesh
        sc.collection.objects.link(o)
        o.parent = root
        az = 2 * math.pi * (k + random.random() * 0.6) / n
        central = k < 3
        tilt = math.radians(random.uniform(10, 30) if central else random.uniform(32, 68))
        s = random.uniform(0.55, 0.8) if central else random.uniform(0.7, 1.05)
        r0 = random.uniform(0.0, 0.15) if central else random.uniform(0.1, 0.35)
        o.location = (math.cos(az) * r0, math.sin(az) * r0, 0)
        # lean outwards: rotate about the horizontal axis perpendicular to the azimuth
        o.rotation_mode = 'AXIS_ANGLE'
        o.rotation_axis_angle = (tilt, -math.sin(az), math.cos(az), 0)
        o.scale = (s, s, s * random.uniform(0.85, 1.0))
    root.scale = (1, 1, 0.85)
for o in saplings:
    o.hide_render = True; o.hide_set(True)
    sc.collection.objects.unlink(o)       # keep the mesh data for the copies, drop the originals
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_visible=False)
print('clumps', clumps, '->', out)
