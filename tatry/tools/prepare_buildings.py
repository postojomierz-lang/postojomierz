"""Buildings near the trail (OpenStreetMap via Overture Maps) -> public/data/meta.json 'buildings'.

Every footprint becomes an oriented rectangle (centre, width along the ridge, depth, angle) with a
style: the two mountain huts at Morskie Oko get their own shapes, Chata pod Rysmi is a stone hut,
small unnamed wooden buildings become shepherd huts (szałas), the rest plain wooden houses.
Run after prepare.py.
"""
import json, math, os
import shapely
from shapely.geometry import box
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
import prepare as P

DATA = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

def main():
    meta = json.load(open(os.path.join(DATA, 'meta.json')))
    ib = meta['inner']['bounds']
    fs = pfs.S3FileSystem(anonymous=True, region='us-west-2')
    root = 'overturemaps-us-west-2/release/2026-09-23.1'
    I = P.INNER
    f = ((pc.field('bbox', 'xmax') > I[0]) & (pc.field('bbox', 'xmin') < I[2]) &
         (pc.field('bbox', 'ymax') > I[1]) & (pc.field('bbox', 'ymin') < I[3]))
    rows = ds.dataset(f'{root}/theme=buildings/type=building', filesystem=fs, format='parquet').to_table(
        filter=f, columns=['names', 'class', 'num_floors', 'roof_material', 'geometry']).to_pylist()
    clip = box(ib[0] + 80, ib[1] + 80, ib[2] - 80, ib[3] - 80)
    out = []
    for r in rows:
        g = shapely.from_wkb(r['geometry'])
        if g.geom_type == 'MultiPolygon': g = max(g.geoms, key=lambda p: p.area)
        poly = shapely.geometry.Polygon([P.local(*c) for c in g.exterior.coords])
        if not clip.contains(poly.centroid) or poly.area < 9: continue
        name = (r['names'] or {}).get('primary') or ''
        rect = poly.minimum_rotated_rectangle
        cs = list(rect.exterior.coords)[:4]
        e1 = (cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]); e2 = (cs[2][0] - cs[1][0], cs[2][1] - cs[1][1])
        l1, l2 = math.hypot(*e1), math.hypot(*e2)
        # the ridge runs along the longer side
        w, d, e = (l1, l2, e1) if l1 >= l2 else (l2, l1, e2)
        ang = math.atan2(e[0], e[1])
        c = rect.centroid
        if 'Stare Schronisko' in name: style, floors = 'old_hut', 2
        elif 'Schronisko' in name: style, floors = 'hut', 3
        elif 'Chata pod Rysmi' in name: style, floors = 'stone_hut', 2
        elif r['class'] in ('toilets', 'service') or 'WC' in name: style, floors = 'shed', 1
        elif poly.area < 60: style, floors = 'szalas', 1
        else: style, floors = 'house', r['num_floors'] or 2
        out.append({'name': name, 'style': style, 'floors': floors, 'x': round(c.x, 1), 'z': round(c.y, 1),
                    'w': round(w, 1), 'd': round(d, 1), 'a': round(ang, 4)})
    meta['buildings'] = out
    json.dump(meta, open(os.path.join(DATA, 'meta.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    import collections
    print(len(out), collections.Counter(b['style'] for b in out))
    for b in out:
        if b['name'] or b['style'] != 'szalas': print(' ', b)

if __name__ == '__main__':
    main()
