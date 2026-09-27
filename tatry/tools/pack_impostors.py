"""Packs baked impostor views (tools/blender/bake_impostors.py) into WebP atlases for the browser.
Rows = variants, columns = views. Transparent pixels get the colour of the nearest opaque pixel
(no dark fringes when the texture is mip-mapped).
Run: python3 pack_impostors.py <bake_dir> <out_dir> <name> [<name> ...]
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

src, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(out, exist_ok=True)
index = {}
for name in names:
    meta = json.load(open(os.path.join(src, name + '.json')))
    rows = []
    for kind in ('albedo', 'normal'):
        imgs = [np.asarray(Image.open(os.path.join(src, f'{name}_{v}_{kind}.png')).convert('RGBA')) for v in range(len(meta['variants']))]
        atlas = np.concatenate(imgs, 0).copy()
        a = atlas[..., 3] > 8
        _, (ri, ci) = distance_transform_edt(~a, return_indices=True)
        atlas[..., :3] = atlas[ri, ci, :3]
        if kind == 'normal':
            atlas[..., 3] = 255
        Image.fromarray(atlas, 'RGBA').save(os.path.join(out, f'{name}_{kind}.webp'), quality=88 if kind == 'albedo' else 92, method=6)
        rows = len(imgs)
    index[name] = {'views': meta['views'], 'rows': rows, 'variants': meta['variants']}
    print(name, rows, 'variants x', meta['views'], 'views')
p = os.path.join(out, 'impostors.json')
old = json.load(open(p)) if os.path.exists(p) else {}
old.update(index)
json.dump(old, open(p, 'w'), indent=1)
