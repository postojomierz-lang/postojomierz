"""Bakes spruce branch cards for the 3D trees near the camera (vegetation3d.js).

From the Poly Haven fir tree (CC0) it cuts wedges of the crown (a sector of the tree around one
azimuth, a band of height) and renders each from above with an orthographic camera: albedo and the
world normal, transparent background. The branch points along +u (trunk at u = 0), across is v.
Output: <out>/branch_albedo.png, branch_normal.png (cards stacked in rows) and branch.json.

Run: python3 bake_branches.py <fir_tree_01_1k.gltf> <out_dir> [px]
"""
import bpy, bmesh, sys, os, json, math
import numpy as np

gltf, out = sys.argv[1], sys.argv[2]
PX = int(sys.argv[3]) if len(sys.argv) > 3 else 512
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=gltf)
sc = bpy.context.scene
src = next(o for o in sc.objects if o.type == 'MESH' and o.name.startswith(os.environ.get('VARIANT', 'fir_tree_01_a')))
for o in list(sc.objects):
    if o is not src: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.objects.active = src
src.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16; sc.cycles.use_denoising = False
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = PX, PX * 3 // 4
sc.view_layers[0].use_pass_diffuse_color = True
sc.view_layers[0].use_pass_normal = True
world = bpy.data.worlds.new('w'); sc.world = world
world.use_nodes = True; world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
cam_data = bpy.data.cameras.new('c'); cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('c', cam_data); sc.collection.objects.link(cam); sc.camera = cam

# the variants stand side by side in the file: centre this one on its trunk (bounding box centre)
co = np.array([v.co[:] for v in src.data.vertices])
lo, hi = co.min(0), co.max(0)
# the trunk: the vertices of the lowest metre
low = co[co[:, 2] < lo[2] + 1.0]
tx, ty = np.median(low[:, 0]), np.median(low[:, 1])
src.data.transform(__import__('mathutils').Matrix.Translation((-tx, -ty, 0)))
co[:, 0] -= tx; co[:, 1] -= ty
z0, z1 = lo[2], hi[2]
H = z1 - z0
# cards: (height fraction, azimuth): lower, middle and upper crown, different sides
# pick the four fullest wedges among candidate heights and sides (by the number of faces in them)
fc = np.zeros(len(src.data.polygons) * 3); src.data.polygons.foreach_get('center', fc); fc = fc.reshape(-1, 3)
cand = []
for hf in (0.2, 0.28, 0.36, 0.44, 0.52):
    for az in np.linspace(0, 2 * math.pi, 12, endpoint=False):
        zc = z0 + (z1 - z0) * hf
        x = fc[:, 0] * math.cos(-az) - fc[:, 1] * math.sin(-az); y = fc[:, 0] * math.sin(-az) + fc[:, 1] * math.cos(-az)
        sel = (x > 0.12) & (np.abs(y) < 0.1 + x * 0.3) & (fc[:, 2] > zc - 1.3) & (fc[:, 2] < zc + 0.4)
        if sel.sum() > 500: cand.append((sel.sum() * min(1.0, np.percentile(x[sel], 98) / 2.0), hf, az))
cand.sort(reverse=True)
CARDS = []
for _, hf, az in cand:
    if all(abs(hf - h) > 0.05 or abs(math.remainder(az - a, 2 * math.pi)) > 1.0 for h, a in CARDS): CARDS.append((hf, az))
    if len(CARDS) == 4: break
print('cards', CARDS, flush=True)
import OpenImageIO as oiio

rows_a, rows_n, meta = [], [], []
for ci, (hf, az) in enumerate(CARDS):
    zc = z0 + H * hf
    ob = src.copy(); ob.data = src.data.copy(); sc.collection.objects.link(ob); ob.hide_render = False
    src.hide_render = True
    bm = bmesh.new(); bm.from_mesh(ob.data)
    # the wedge: ±17 degrees around the azimuth, a 1.7 m band of height, outside the trunk
    x = fc[:, 0] * math.cos(-az) - fc[:, 1] * math.sin(-az); y = fc[:, 0] * math.sin(-az) + fc[:, 1] * math.cos(-az)
    keep = (x > 0.12) & (np.abs(y) < 0.1 + x * 0.3) & (fc[:, 2] > zc - 1.3) & (fc[:, 2] < zc + 0.4)
    L = float(np.percentile(x[keep], 99.5))
    bm.faces.ensure_lookup_table()
    kill = [bm.faces[i] for i in np.nonzero(~keep)[0]]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    # turn the wedge so the branch points along +X
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(-az, 3, 'Z'))
    bm.to_mesh(ob.data); bm.free()
    L *= 1.04
    cam_data.ortho_scale = L
    cam.location = (L / 2, 0, zc + 30); cam.rotation_euler = (0, 0, 0)
    sc.render.filepath = f'/tmp/_br_{ci}.exr'
    sc.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'; sc.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
    bpy.ops.render.render(write_still=True)
    inp = oiio.ImageInput.open(sc.render.filepath)
    chans = {}; n = 0
    while inp.seek_subimage(n, 0):
        px = inp.read_image(format='float')
        for k, cn in enumerate(inp.spec().channelnames): chans[cn.split('.', 1)[1]] = px[:, :, k]
        n += 1
    inp.close()
    A = chans['Combined.A']
    col = np.stack([chans['Diffuse Color.' + c] for c in 'RGB'], -1)
    N = np.stack([chans['Normal.' + c] for c in 'XYZ'], -1)       # world: X along the branch, Y across, Z up
    rows_a.append(np.concatenate([col, A[..., None]], -1))
    rows_n.append(np.concatenate([N * 0.5 + 0.5, A[..., None]], -1))
    meta.append({'length': L, 'width': L * 0.75, 'heightFrac': hf})
    bpy.data.objects.remove(ob, do_unlink=True)
    print('card', ci, 'length', round(L, 2), flush=True)

from PIL import Image
def srgb(x): return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)
alb = np.clip(np.concatenate(rows_a, 0), 0, 1); alb[..., :3] = srgb(alb[..., :3])
nor = np.clip(np.concatenate(rows_n, 0), 0, 1)
# fill the transparent texels with the nearest colour so mipmaps do not bleed white at the edges
from scipy import ndimage
for img in (alb, nor):
    mask = img[..., 3] > 0.5
    if mask.any():
        idx = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
        for c in range(3): img[..., c] = img[..., c][tuple(idx)]
Image.fromarray((alb * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{out}/branch_albedo.png')
Image.fromarray((nor * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{out}/branch_normal.png')
json.dump({'cards': meta, 'treeHeight': H}, open(f'{out}/branch.json', 'w'))
print('done', len(meta))
