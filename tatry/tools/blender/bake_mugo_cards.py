"""Bakes the needle cards of the 3D dwarf pine near the camera (vegetation3d.js, buildMugo3D).

Dwarf mountain pine (Pinus mugo) is a clump of leaning stems whose tips carry dense, upturned needle
shoots. The cards are the tops of Poly Haven's pine saplings (CC0) rendered from the side (a shoot: stem
at the bottom edge, pointing up) and one from above (a rosette), orthographic, with albedo, alpha and
the normals turned into the card's frame (u across, v up the shoot, out of the card towards the viewer).
Output: <out>/mugo_card_albedo.png, mugo_card_normal.png (cards side by side) and mugo_cards.json.

Run: python3 bake_mugo_cards.py <pine_sapling_small_1k.gltf> <out_dir> [px]
"""
import json
import math
import os
import sys

import bpy
import bmesh
import numpy as np

gltf, out = sys.argv[1], sys.argv[2]
PX = int(sys.argv[3]) if len(sys.argv) > 3 else 512
TOP = 0.5                                 # the top half of a sapling makes a shoot
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=gltf)
sc = bpy.context.scene
srcs = sorted([o for o in sc.objects if o.type == 'MESH'], key=lambda o: o.name)
for o in srcs:
    bpy.context.view_layer.objects.active = o
    for s in sc.objects: s.select_set(s is o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.hide_render = True

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16; sc.cycles.use_denoising = False
sc.render.film_transparent = True
sc.view_layers[0].use_pass_diffuse_color = True
sc.view_layers[0].use_pass_normal = True
world = bpy.data.worlds.new('w'); sc.world = world
world.use_nodes = True; world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
cam_data = bpy.data.cameras.new('c'); cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('c', cam_data); sc.collection.objects.link(cam); sc.camera = cam
import OpenImageIO as oiio


def render(ob, view):
    """view 'side': camera at -Y looking +Y (u = X, v = Z); 'top': from above (u = X, v = Y)."""
    co = np.array([ob.matrix_world @ v.co for v in ob.data.vertices])
    lo, hi = co.min(0), co.max(0)
    if view == 'side':
        w, h = hi[0] - lo[0], hi[2] - lo[2]
        s = max(w, h) * 1.02
        cam.location = ((lo[0] + hi[0]) / 2, lo[1] - 20, lo[2] + s / 2); cam.rotation_euler = (math.pi / 2, 0, 0)
        sc.render.resolution_x = sc.render.resolution_y = PX
        cam_data.ortho_scale = s
    else:
        s = max(hi[0] - lo[0], hi[1] - lo[1]) * 1.02
        cam.location = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2] + 20); cam.rotation_euler = (0, 0, 0)
        sc.render.resolution_x = sc.render.resolution_y = PX
        cam_data.ortho_scale = s
    ob.hide_render = False
    sc.render.filepath = '/tmp/_mugo_card.exr'
    sc.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'; sc.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
    bpy.ops.render.render(write_still=True)
    ob.hide_render = True
    inp = oiio.ImageInput.open(sc.render.filepath)
    chans = {}; n = 0
    while inp.seek_subimage(n, 0):
        px = inp.read_image(format='float')
        for k, cn in enumerate(inp.spec().channelnames): chans[cn.split('.', 1)[1]] = px[:, :, k]
        n += 1
    inp.close()
    A = chans['Combined.A']
    col = np.stack([chans['Diffuse Color.' + c] for c in 'RGB'], -1)
    Nw = np.stack([chans['Normal.' + c] for c in 'XYZ'], -1)
    # into the card frame: x across (u), y up the card (v), z out of the card towards the viewer
    N = np.stack([Nw[..., 0], Nw[..., 2], -Nw[..., 1]], -1) if view == 'side' else Nw
    return col, A, N, s


cards, cols, nors = [], [], []
for k, o in enumerate(srcs + [srcs[0]]):
    view = 'top' if k == len(srcs) else 'side'
    ob = o.copy(); ob.data = o.data.copy(); sc.collection.objects.link(ob)
    if view == 'side':
        # keep the top of the sapling: the shoot
        co = np.array([v.co[:] for v in ob.data.vertices]); z0, z1 = co[:, 2].min(), co[:, 2].max()
        bm = bmesh.new(); bm.from_mesh(ob.data)
        cut = z1 - (z1 - z0) * TOP
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < cut], context='FACES')
        bm.to_mesh(ob.data); bm.free()
    col, A, N, s = render(ob, view)
    bpy.data.objects.remove(ob, do_unlink=True)
    cols.append(np.concatenate([col, A[..., None]], -1))
    nors.append(np.concatenate([N * 0.5 + 0.5, A[..., None]], -1))
    cards.append({'view': view, 'size': float(s)})
    print('card', k, view, round(s, 3), flush=True)

from PIL import Image
from scipy import ndimage


def srgb(x): return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)


alb = np.clip(np.concatenate(cols, 1), 0, 1); alb[..., :3] = srgb(alb[..., :3])
nor = np.clip(np.concatenate(nors, 1), 0, 1)
for img in (alb, nor):
    # fill the transparent texels with the nearest colour so mipmaps do not bleed at the edges
    mask = img[..., 3] > 0.5
    idx = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    for c in range(3): img[..., c] = img[..., c][tuple(idx)]
Image.fromarray((alb * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{out}/mugo_card_albedo.png')
Image.fromarray((nor * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{out}/mugo_card_normal.png')
json.dump({'cards': cards}, open(f'{out}/mugo_cards.json', 'w'))
print('done', len(cards))
