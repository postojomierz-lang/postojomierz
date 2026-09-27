"""Bakes Poly Haven vegetation (CC0) into impostor atlases for the browser.

For every variant (a mesh object of the glTF) it renders N side views with an orthographic camera:
albedo (Cycles DiffCol) and normals (camera space), transparent background.
Output: <out>/<name>_albedo.png (RGBA) and <name>_normal.png, views side by side,
plus <name>.json with the variant size.

Run: python3 bake_impostors.py <model.gltf> <out_dir> <name> <views> <px_w> <px_h> [samples]
"""
import bpy, sys, os, json, math
import numpy as np

gltf, out, name, views, pw, ph = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
samples = int(sys.argv[7]) if len(sys.argv) > 7 else 24
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=gltf)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = samples
sc.cycles.use_denoising = False
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = pw, ph
sc.view_layers[0].use_pass_diffuse_color = True
sc.view_layers[0].use_pass_normal = True
# flat white world so albedo is clean; lighting does not matter for the passes we keep
world = bpy.data.worlds.new('w'); sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[1].default_value = 1.0

# glTF alpha "BLEND" materials render fine in Cycles; make sure they are not skipped
roots = [o for o in sc.objects if o.parent is None and o.type in ('MESH', 'EMPTY')]
variants = [o for o in roots if o.type == 'MESH'] or roots
cam_data = bpy.data.cameras.new('c'); cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('c', cam_data); sc.collection.objects.link(cam); sc.camera = cam

def bbox(o):
    objs = [o] + [c for c in o.children_recursive if c.type == 'MESH']
    pts = []
    for ob in objs:
        if ob.type != 'MESH': continue
        for v in ob.bound_box:
            pts.append(ob.matrix_world @ __import__('mathutils').Vector(v))
    a = np.array([[p.x, p.y, p.z] for p in pts])
    return a.min(0), a.max(0)

meta = []
for vi, v in enumerate(variants):
    for o in variants: o.hide_render = (o is not v)
    for o in variants:
        for c in o.children_recursive: c.hide_render = (o is not v)
    lo, hi = bbox(v)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    H = hi[2] - lo[2]
    R = max(hi[0] - lo[0], hi[1] - lo[1]) / 2
    # frame: width 2R*1.05, height H*1.02 with aspect of the view
    scale = max(2 * R * 1.05 * ph / pw, H * 1.02)
    cam_data.ortho_scale = scale
    W_m = scale * pw / ph
    alb = np.zeros((ph, pw * views, 4), np.float32); nor = np.zeros((ph, pw * views, 4), np.float32)
    for k in range(views):
        a = 2 * math.pi * k / views
        d = R * 3 + 5
        cam.location = (cx + math.sin(a) * d, cy - math.cos(a) * d, lo[2] + scale / 2)
        cam.rotation_euler = (math.pi / 2, 0, a)
        sc.render.filepath = f'/tmp/_imp_{k}.exr'
        sc.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'; sc.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
        bpy.ops.render.render(write_still=True)
        import OpenImageIO as oiio  # pip install OpenImageIO
        inp = oiio.ImageInput.open(sc.render.filepath)
        chans = {}
        n = 0
        while inp.seek_subimage(n, 0):   # each render pass is its own EXR part
            px = inp.read_image(format='float')
            for ci, cn in enumerate(inp.spec().channelnames): chans[cn.split('.', 1)[1]] = px[:, :, ci]
            n += 1
        inp.close()
        A = chans['Combined.A'][..., None]
        col = np.stack([chans['Diffuse Color.' + c] for c in 'RGB'], -1)
        N = np.stack([chans['Normal.' + c] for c in 'XYZ'], -1)   # world space
        # world -> camera-right / up / towards-camera
        right = np.array([math.cos(a), math.sin(a), 0.0]); up = np.array([0, 0, 1.0]); tocam = np.array([math.sin(a), -math.cos(a), 0.0])
        Nc = np.stack([N @ right, N @ up, N @ tocam], -1)
        alb[:, k * pw:(k + 1) * pw, :3] = col; alb[:, k * pw:(k + 1) * pw, 3] = A[..., 0]
        nor[:, k * pw:(k + 1) * pw, :3] = Nc * 0.5 + 0.5; nor[:, k * pw:(k + 1) * pw, 3] = A[..., 0]
        print(name, vi, k, flush=True)
    from PIL import Image
    def srgb(x): return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)
    a8 = np.clip(alb, 0, 1); a8[..., :3] = srgb(a8[..., :3])
    Image.fromarray((a8 * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{out}/{name}_{vi}_albedo.png', optimize=True)
    Image.fromarray((np.clip(nor, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{out}/{name}_{vi}_normal.png', optimize=True)
    meta.append({'width': float(W_m), 'height': float(scale), 'base': float(lo[2]), 'trunkH': float(H)})
json.dump({'views': views, 'variants': meta}, open(f'{out}/{name}.json', 'w'))
print('done', name, len(variants))
