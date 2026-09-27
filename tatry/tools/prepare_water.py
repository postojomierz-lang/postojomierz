"""Streams and waterfalls around the trail (OpenStreetMap via Overture Maps) -> public/data/meta.json.

Streams are clipped to the detailed area, resampled every 3 m and oriented downstream using the
terrain model; waterfalls are points. Run after prepare.py and prepare_gugik.py.
"""
import json, math, os
import numpy as np, shapely, zlib
from shapely.geometry import LineString, box
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
import prepare as P

DATA = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

def base_heights(meta):
    w, h = meta['base']['n']
    raw = zlib.decompress(open(os.path.join(DATA, 'inner4.bin'), 'rb').read())
    d = np.frombuffer(raw[:w * h * 2], '<u2').reshape(h, w).astype(np.int32)
    first = d[:, 0].copy(); d = np.where(d > 32767, d - 65536, d); d[:, 0] = first
    return np.cumsum(d, 1) / 10.0

def main():
    meta = json.load(open(os.path.join(DATA, 'meta.json')))
    ib = meta['base']['bounds']; bw, bh = meta['base']['n']
    H = base_heights(meta)
    def height(x, z):
        i = min(bw - 1, max(0, round((x - ib[0]) / (ib[2] - ib[0]) * (bw - 1))))
        j = min(bh - 1, max(0, round((z - ib[1]) / (ib[3] - ib[1]) * (bh - 1))))
        return float(H[j, i])

    fs = pfs.S3FileSystem(anonymous=True, region='us-west-2')
    root = 'overturemaps-us-west-2/release/2026-09-23.1'
    I = P.INNER
    f = ((pc.field('bbox', 'xmax') > I[0]) & (pc.field('bbox', 'xmin') < I[2]) &
         (pc.field('bbox', 'ymax') > I[1]) & (pc.field('bbox', 'ymin') < I[3]))
    rows = ds.dataset(f'{root}/theme=base/type=water', filesystem=fs, format='parquet').to_table(
        filter=f, columns=['class', 'names', 'geometry', 'is_intermittent']).to_pylist()

    clip = box(ib[0] + 60, ib[1] + 60, ib[2] - 60, ib[3] - 60)
    big = {'Rybí potok', 'Rybi Potok', 'Roztoka', 'Biela voda', 'Białka'}
    streams, falls = [], []
    for r in rows:
        g = shapely.from_wkb(r['geometry'])
        name = (r['names'] or {}).get('primary')
        if r['class'] == 'waterfall' and g.geom_type == 'Point':
            x, z = P.local(g.x, g.y)
            if clip.contains(shapely.geometry.Point(x, z)):
                falls.append({'name': name, 'x': round(x, 1), 'z': round(z, 1)})
            continue
        if r['class'] not in ('stream', 'river') or g.geom_type != 'LineString': continue
        if name == 'Poprad': continue
        line = LineString([P.local(*c) for c in g.coords]).intersection(clip)
        parts = [line] if line.geom_type == 'LineString' else list(getattr(line, 'geoms', []))
        for part in parts:
            if part.geom_type != 'LineString' or part.length < 25: continue
            n = max(2, int(part.length / 3) + 1)
            pts = [part.interpolate(k / (n - 1), normalized=True).coords[0] for k in range(n)]
            if height(*pts[0]) < height(*pts[-1]): pts = pts[::-1]        # downstream
            intermittent = bool(r.get('is_intermittent'))
            width = 5.0 if name in big else (0.8 if intermittent else (3.2 if name else 1.8))
            streams.append({'name': name, 'width': width, 'intermittent': intermittent,
                            'pts': [[round(x, 1), round(z, 1)] for x, z in pts]})
    meta['streams'] = streams
    meta['waterfalls'] = falls
    json.dump(meta, open(os.path.join(DATA, 'meta.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    print('streams', len(streams), 'points', sum(len(s['pts']) for s in streams), 'waterfalls', len(falls))
    print([f['name'] for f in falls])

if __name__ == '__main__':
    main()
