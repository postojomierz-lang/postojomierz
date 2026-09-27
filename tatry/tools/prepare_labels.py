"""Map labels (peaks, passes, lakes, huts, waterfalls) -> public/data/meta.json 'labels'.

Peaks and passes come from OpenStreetMap via Overture (base/land, class peak/saddle) over the whole
panorama. A peak is kept if it is the highest point within ~0.8 km (isolation), or if it is a well-known
summit; passes only near the trail. Names: Polish where OSM has one (names.common['pl']), else the
primary name. Lakes, huts and waterfalls are taken from meta.json. Run after the other prepare_* steps.
"""
import json, math, os
import shapely
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
import prepare as P

DATA = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
FAMOUS = ['Kasprowy', 'Giewont', 'Gerlach', 'Lomnický', 'Łomnica', 'Rysy', 'Mięguszowiecki', 'Mengusovský', 'Wysoka', 'Vysoká',
          'Mnich', 'Świnica', 'Kozi Wierch', 'Kriváň', 'Krywań', 'Cubryna', 'Szpiglasowy', 'Kościelec', 'Zawrat', 'Wołowiec',
          'Starorobociański', 'Lodowy', 'Ľadový', 'Kežmarský', 'Slavkovský', 'Baranie', 'Żabi', 'Žabí', 'Opalony', 'Mnich']

def name_of(r):
    n = r['names'] or {}
    common = n.get('common') or {}
    pl = dict(common).get('pl') if not isinstance(common, dict) else common.get('pl')
    nm = pl or n.get('primary') or ''
    if ' / ' in nm:                     # "Kasprov vrch / Kasprowy Wierch": take the Polish half
        parts = nm.split(' / ')
        nm = parts[-1] if any(ch in parts[-1] for ch in 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ') or 'Wierch' in parts[-1] else parts[0]
    return nm.strip()

def main():
    meta = json.load(open(os.path.join(DATA, 'meta.json')))
    fs = pfs.S3FileSystem(anonymous=True, region='us-west-2')
    root = 'overturemaps-us-west-2/release/2026-09-23.1'
    O = P.OUTER
    f = ((pc.field('bbox', 'xmax') > O[0]) & (pc.field('bbox', 'xmin') < O[2]) &
         (pc.field('bbox', 'ymax') > O[1]) & (pc.field('bbox', 'ymin') < O[3]))
    rows = ds.dataset(f'{root}/theme=base/type=land', filesystem=fs, format='parquet').to_table(
        filter=f & pc.field('class').isin(['peak', 'saddle']), columns=['names', 'class', 'elevation', 'geometry']).to_pylist()
    ob = meta['outer']['bounds']
    trail = shapely.geometry.LineString(meta['trail'])
    pts = []
    for r in rows:
        g = shapely.from_wkb(r['geometry'])
        if g.geom_type != 'Point': g = g.representative_point()
        x, z = P.local(g.x, g.y)
        if not (ob[0] + 300 < x < ob[2] - 300 and ob[1] + 300 < z < ob[3] - 300): continue
        nm = name_of(r)
        if not nm: continue
        try: ele = float(r['elevation']) if r['elevation'] is not None else None
        except (TypeError, ValueError): ele = None
        pts.append({'kind': r['class'], 'name': nm, 'x': x, 'z': z, 'ele': ele})
    peaks = [p for p in pts if p['kind'] == 'peak' and p['ele']]
    labels = []
    for p in peaks:
        higher = [q for q in peaks if q['ele'] > p['ele']]
        iso = min((math.hypot(q['x'] - p['x'], q['z'] - p['z']) for q in higher), default=1e9)
        famous = any(k in p['name'] for k in FAMOUS)
        if iso > 800 or (famous and iso > 150) or (p['ele'] > 2300 and iso > 400):
            labels.append({'kind': 'peak', 'name': p['name'], 'x': round(p['x'], 1), 'z': round(p['z'], 1), 'ele': round(p['ele']),
                           'rank': p['ele'] / 1000 + min(iso, 5000) / 2500 + (1.5 if famous else 0)})
    for p in pts:
        if p['kind'] == 'saddle' and trail.distance(shapely.geometry.Point(p['x'], p['z'])) < 2500:
            labels.append({'kind': 'pass', 'name': p['name'], 'x': round(p['x'], 1), 'z': round(p['z'], 1),
                           'ele': round(p['ele']) if p['ele'] else None, 'rank': 1.2})
    seen = set()
    for l in meta.get('lakes', []):
        if not l.get('name') or l['name'] in seen: continue
        seen.add(l['name'])
        cx = sum(q[0] for q in l['ring']) / len(l['ring']); cz = sum(q[1] for q in l['ring']) / len(l['ring'])
        labels.append({'kind': 'lake', 'name': l['name'], 'x': round(cx, 1), 'z': round(cz, 1), 'ele': round(l['level']), 'rank': 1.4})
    for b in meta.get('buildings', []):
        if b.get('name') and b['style'] in ('hut', 'old_hut', 'stone_hut', 'house') and 'Pawilon' not in b['name']:
            labels.append({'kind': 'hut', 'name': b['name'], 'x': b['x'], 'z': b['z'], 'ele': None, 'rank': 1.6})
    for w in meta.get('waterfalls', []):
        if w.get('name') and w['name'] not in seen:
            seen.add(w['name'])
            labels.append({'kind': 'fall', 'name': w['name'], 'x': w['x'], 'z': w['z'], 'ele': None, 'rank': 1.0})
    meta['labels'] = labels
    json.dump(meta, open(os.path.join(DATA, 'meta.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    import collections
    print(len(labels), collections.Counter(l['kind'] for l in labels))
    print(sorted([l['name'] + ' ' + str(l['ele']) for l in labels if l['kind'] == 'peak'], key=len)[:80])

if __name__ == '__main__':
    main()
