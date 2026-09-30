"""Tatra granite rocks, made procedurally: angular blocks, slabs, weathered boulders and wedges.

Granite breaks along joints (roughly perpendicular sets and sheeting planes), so every rock starts as a box
cut by planes, gets its edges worn and a cracked, grainy surface on a dense mesh; that mesh is baked into
the colour and normal maps of a light one for the browser. The surface is a procedural granite: grey with
light feldspar and quartz grains and dark biotite specks, rust stains, map lichen (yellow-green
Rhizocarpon) and grey crusts on the tops, dark water streaks on the steep faces, darker in the cracks.

Two sizes, so the grain keeps its real scale: stones (~1.2 m) and boulders (~4 m); the view picks by size.
One GLB, every rock its own mesh (origin at the centre of its base), one shared texture atlas.
Run: python3 tools/blender/make_granite.py public/models/granite.glb [atlas px, 2048] [seed]
"""
import math
import random
import sys

import bpy  # before bmesh: the bpy module brings it
import bmesh
import mathutils
from mathutils import Vector

out = sys.argv[1]
ATLAS = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 7
GRID = 4                                  # 4 x 4 cells in the atlas
# (kind, size in metres): 10 stones and 6 boulders
PLAN = [('block', 1.2), ('block', 1.0), ('slab', 1.4), ('slab', 1.1), ('boulder', 1.1), ('boulder', 1.3),
        ('shard', 1.3), ('block', 0.9), ('slab', 1.2), ('boulder', 1.0),
        ('block', 4.0), ('slab', 4.5), ('boulder', 3.8), ('block', 5.0), ('shard', 4.2), ('boulder', 4.5)]
LOW_TRIS = {'stone': 700, 'boulder': 1300}

rnd = random.Random(SEED)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.render.bake.margin = 6


# ---------------------------------------------------------------- shape
def rock_shape(kind, size):
    """A box cut by joint planes, as a bmesh (metres, base at z = 0 roughly)."""
    if kind == 'block':
        dims = (1.0, rnd.uniform(0.75, 1.0), rnd.uniform(0.55, 0.85)); cuts = rnd.randint(6, 9); spread = 0.35; bev = 0.035
    elif kind == 'slab':
        dims = (1.0, rnd.uniform(0.7, 0.95), rnd.uniform(0.22, 0.38)); cuts = rnd.randint(4, 7); spread = 0.25; bev = 0.03
    elif kind == 'boulder':
        dims = (1.0, rnd.uniform(0.8, 0.95), rnd.uniform(0.6, 0.8)); cuts = rnd.randint(12, 16); spread = 1.2; bev = 0.09
    else:  # shard
        dims = (1.0, rnd.uniform(0.35, 0.5), rnd.uniform(0.45, 0.6)); cuts = rnd.randint(5, 7); spread = 0.7; bev = 0.03
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * dims[0], v.co.y * dims[1], v.co.z * dims[2])) * size
    for _ in range(cuts):
        # joint planes: mostly near the box's own axes (joint sets), tilted by up to `spread` radians
        axis = Vector([(1, 0, 0), (0, 1, 0), (0, 0, 1), (-1, 0, 0), (0, -1, 0), (0, 0, 1)][rnd.randrange(6)])
        n = (axis + Vector((rnd.gauss(0, spread), rnd.gauss(0, spread), rnd.gauss(0, spread)))).normalized()
        if kind == 'shard' and rnd.random() < 0.5:
            n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.2, 1))).normalized()
        ext = max(abs(v.co.dot(n)) for v in bm.verts)
        co = n * ext * rnd.uniform(0.55, 0.85)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=n, clear_outer=True)
        edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bev * size, segments=2, affect='EDGES', profile=0.6)
    return bm


def make_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    return o


def select_only(*objs, active=None):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def apply_all(o):
    select_only(o)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def tex(name, kind, **kw):
    t = bpy.data.textures.new(name, kind)
    for k, v in kw.items():
        setattr(t, k, v)
    return t


def detail(o, size):
    """Dense mesh with the joints' cracks, worn bumps and grain."""
    m = o.modifiers.new('remesh', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = size / 140
    apply_all(o)
    # big weathering bumps
    d = o.modifiers.new('bumps', 'DISPLACE')
    d.texture = tex('b' + o.name, 'CLOUDS', noise_scale=size * 0.35, noise_depth=3)
    d.strength = size * 0.035; d.mid_level = 0.5; d.texture_coords = 'OBJECT'
    # cracks: edges of Voronoi cells pushed in
    c = o.modifiers.new('cracks', 'DISPLACE')
    c.texture = tex('c' + o.name, 'VORONOI', distance_metric='DISTANCE', color_mode='INTENSITY',
                    noise_scale=size * 0.28, weight_1=-1.0, weight_2=1.0, weight_3=0.0, weight_4=0.0, noise_intensity=6.0)
    c.strength = size * 0.012; c.mid_level = 0.9; c.texture_coords = 'OBJECT'
    # grain
    g = o.modifiers.new('grain', 'DISPLACE')
    g.texture = tex('g' + o.name, 'STUCCI', noise_scale=size * 0.03, turbulence=5.0)
    g.strength = size * 0.004; g.texture_coords = 'OBJECT'
    apply_all(o)
    bpy.ops.object.shade_smooth()


# ---------------------------------------------------------------- material (world metres, so grains keep their size)
def granite_material():
    mat = bpy.data.materials.new('granite_proc')
    mat.use_nodes = True
    nt = mat.node_tree
    N, L = nt.nodes, nt.links
    N.clear()
    outn = N.new('ShaderNodeOutputMaterial')
    bsdf = N.new('ShaderNodeEmission')        # baked as emission: the plain colour, no lighting
    L.new(bsdf.outputs[0], outn.inputs[0])
    geo = N.new('ShaderNodeNewGeometry')
    pos = geo.outputs['Position']

    def noise(scale, detail=4.0, rough=0.55):
        n = N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        L.new(pos, n.inputs['Vector']); return n

    def ramp(src, stops):
        r = N.new('ShaderNodeValToRGB')
        cr = r.color_ramp
        cr.elements[0].position, cr.elements[0].color = stops[0]
        cr.elements[1].position, cr.elements[1].color = stops[1]
        for p, c in stops[2:]:
            e = cr.elements.new(p); e.color = c
        L.new(src, r.inputs[0]); return r

    def mix(a, b, fac, blend='MIX'):
        m = N.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = blend
        L.new(fac, m.inputs[0]); L.new(a, m.inputs[6]); L.new(b, m.inputs[7]); return m.outputs[2]

    def mixc(a, b, fac, blend='MIX'):
        """mix with b a socket or a colour, fac a socket or a number"""
        m = N.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = blend
        if isinstance(fac, (int, float)): m.inputs[0].default_value = fac
        else: L.new(fac, m.inputs[0])
        L.new(a, m.inputs[6])
        if isinstance(b, tuple): m.inputs[7].default_value = b
        else: L.new(b, m.inputs[7])
        return m.outputs[2]

    def val(src, lo, hi):
        """smoothstep-like mask from a float."""
        r = N.new('ShaderNodeMapRange'); r.inputs[1].default_value = lo; r.inputs[2].default_value = hi
        r.interpolation_type = 'SMOOTHSTEP'; L.new(src, r.inputs[0]); return r.outputs[0]

    # grains: light grey matrix, white feldspar/quartz grains (~5 mm) and black biotite specks
    vor = N.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 180; L.new(pos, vor.inputs['Vector'])
    vor.feature = 'F1'
    grains = ramp(vor.outputs['Color'], [(0.0, (0.05, 0.05, 0.05, 1)), (0.12, (0.05, 0.05, 0.05, 1)),
                                         (0.16, (0.46, 0.45, 0.43, 1)), (0.62, (0.52, 0.51, 0.49, 1)),
                                         (0.68, (0.78, 0.77, 0.74, 1)), (1.0, (0.86, 0.84, 0.80, 1))])
    # fine speckle noise over it, and big mottling
    fine = noise(420, 2, 0.5)
    base = mix(grains.outputs[0], ramp(fine.outputs['Fac'], [(0.3, (0.35, 0.35, 0.34, 1)), (0.7, (0.7, 0.7, 0.68, 1))]).outputs[0],
               val(fine.outputs['Fac'], 0.0, 1.0), 'OVERLAY')
    mott = noise(1.2, 5, 0.6)
    base = mixc(base, ramp(mott.outputs['Fac'], [(0.35, (0.42, 0.41, 0.40, 1)), (0.7, (0.62, 0.61, 0.58, 1))]).outputs[0], 0.55, 'MULTIPLY')
    # rust: iron stains, faint
    rust = noise(2.5, 6, 0.65)
    base = mixc(base, (0.45, 0.33, 0.22, 1), val(rust.outputs['Fac'], 0.62, 0.75))
    # up-facing factor (lichen on the tops, streaks on the steep faces)
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sep.inputs[0])
    up = val(sep.outputs['Z'], 0.1, 0.8)
    steep = N.new('ShaderNodeMath'); steep.operation = 'SUBTRACT'; steep.inputs[0].default_value = 1.0
    L.new(val(sep.outputs['Z'], -0.2, 0.45), steep.inputs[1])
    # dark water streaks: noise stretched along z
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (6.0, 6.0, 0.4); L.new(pos, mp.inputs['Vector'])
    st = N.new('ShaderNodeTexNoise'); st.inputs['Scale'].default_value = 3.0; st.inputs['Detail'].default_value = 3
    L.new(mp.outputs[0], st.inputs['Vector'])
    sm = N.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'
    L.new(val(st.outputs['Fac'], 0.55, 0.7), sm.inputs[0]); L.new(steep.outputs[0], sm.inputs[1])
    sm2 = N.new('ShaderNodeMath'); sm2.operation = 'MULTIPLY'; sm2.inputs[1].default_value = 0.55
    L.new(sm.outputs[0], sm2.inputs[0])
    base = mixc(base, (0.16, 0.16, 0.16, 1), sm2.outputs[0])
    # lichens: yellow-green map lichen and grey-white crusts in patches, mostly on the tops
    for scale, lo, hi, col, amt in [(3.5, 0.55, 0.61, (0.55, 0.58, 0.22, 1), 0.9), (2.2, 0.54, 0.6, (0.72, 0.72, 0.66, 1), 0.7),
                                    (5.0, 0.66, 0.7, (0.10, 0.10, 0.09, 1), 0.6)]:
        ln = noise(scale, 8, 0.7)
        m = N.new('ShaderNodeMath'); m.operation = 'MULTIPLY'
        L.new(val(ln.outputs['Fac'], lo, hi), m.inputs[0])
        f = N.new('ShaderNodeMath'); f.operation = 'MULTIPLY_ADD'; f.inputs[1].default_value = 0.6; f.inputs[2].default_value = 0.4
        L.new(up, f.inputs[0]); L.new(f.outputs[0], m.inputs[1])
        m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; m2.inputs[1].default_value = amt
        L.new(m.outputs[0], m2.inputs[0])
        base = mixc(base, col, m2.outputs[0])
    # cracks and hollows darker (ambient occlusion)
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.15; ao.samples = 16; ao.only_local = True   # the light mesh around it must not shade it
    aom = val(ao.outputs['AO'], 0.2, 1.0)
    aoc = N.new('ShaderNodeMix'); aoc.data_type = 'RGBA'; aoc.blend_type = 'MULTIPLY'
    L.new(base, aoc.inputs[6])
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L.new(aom, inv.inputs[1])
    L.new(inv.outputs[0], aoc.inputs[0])
    aoc.inputs[7].default_value = (0.35, 0.35, 0.35, 1)
    L.new(aoc.outputs[2], bsdf.inputs['Color'])
    return mat


PROC = granite_material()
albedo = bpy.data.images.new('granite_albedo', ATLAS, ATLAS, alpha=False)
normal = bpy.data.images.new('granite_normal', ATLAS, ATLAS, alpha=False)
normal.colorspace_settings.name = 'Non-Color'
albedo.generated_color = (0.5, 0.5, 0.5, 1)
normal.generated_color = (0.5, 0.5, 1.0, 1)

low_mat = bpy.data.materials.new('granite')
low_mat.use_nodes = True
lnt = low_mat.node_tree
bs = lnt.nodes['Principled BSDF']
bs.inputs['Roughness'].default_value = 0.85
ia = lnt.nodes.new('ShaderNodeTexImage'); ia.image = albedo
inn = lnt.nodes.new('ShaderNodeTexImage'); inn.image = normal
nm = lnt.nodes.new('ShaderNodeNormalMap')
lnt.links.new(ia.outputs[0], bs.inputs['Base Color'])
lnt.links.new(inn.outputs[0], nm.inputs['Color'])
lnt.links.new(nm.outputs[0], bs.inputs['Normal'])

lows = []
cell = 1.0 / GRID
for k, (kind, size) in enumerate(PLAN):
    group = 'boulder' if size > 2 else 'stone'
    hi = make_object(f'hi_{k}', rock_shape(kind, size))
    detail(hi, size)
    hi.data.materials.append(PROC)
    # the light mesh: the dense one decimated, so the silhouette keeps the cracks' big shapes
    lo = hi.copy(); lo.data = hi.data.copy(); lo.name = lo.data.name = f'{group}_{kind}_{k}'
    scene.collection.objects.link(lo)
    select_only(lo)
    tris = sum(len(p.vertices) - 2 for p in lo.data.polygons)
    m = lo.modifiers.new('d', 'DECIMATE'); m.ratio = min(1.0, LOW_TRIS[group] / max(1, tris))
    apply_all(lo)
    lo.data.validate()
    lo.data.materials.clear(); lo.data.materials.append(low_mat)
    # UVs into this rock's cell of the atlas
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.015)
    bpy.ops.object.mode_set(mode='OBJECT')
    uv = lo.data.uv_layers.active.data
    cx, cy = k % GRID, k // GRID
    pad = 0.02
    for d in uv:
        d.uv = Vector(((cx + pad + d.uv.x * (1 - 2 * pad)) * cell, (cy + pad + d.uv.y * (1 - 2 * pad)) * cell))
    # bake: colour of the procedural granite, then the dense mesh's normals, into this cell
    for node in lnt.nodes:
        node.select = False
    select_only(hi, lo, active=lo)
    ia.select = True; inn.select = False; lnt.nodes.active = ia      # the target: active and selected
    bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=size * 0.05,
                        max_ray_distance=size * 0.15, use_clear=False, margin=6)
    ia.select = False; inn.select = True; lnt.nodes.active = inn
    bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=size * 0.05,
                        max_ray_distance=size * 0.15, use_clear=False, margin=6)
    # origin at the centre of the base
    bb = [Vector(c) for c in lo.bound_box]
    cxm = sum(v.x for v in bb) / 8; cym = sum(v.y for v in bb) / 8; czm = min(v.z for v in bb)
    lo.data.transform(mathutils.Matrix.Translation((-cxm, -cym, -czm)))
    bpy.data.objects.remove(hi)
    lows.append(lo)
    print(lo.name, 'tris', sum(len(p.vertices) - 2 for p in lo.data.polygons), flush=True)

# save the baked atlases as files first (packing a generated image throws the bake away)
import os, tempfile
tmp = tempfile.mkdtemp()
for img in (albedo, normal):
    img.filepath_raw = os.path.join(tmp, img.name + '.png'); img.file_format = 'PNG'; img.save()
    img.source = 'FILE'; img.reload()
select_only(*lows)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88,
                          use_selection=True, export_apply=True, export_yup=True)
if os.environ.get('PREVIEW'):
    import shutil
    shutil.copy(albedo.filepath_raw, out.replace('.glb', '_albedo.png'))
    shutil.copy(normal.filepath_raw, out.replace('.glb', '_normal.png'))
print('exported', out)
