"""Places to rest and to get water along the marked trails, from OpenStreetMap: benches, picnic tables,
shelters (wiaty), springs, drinking water points and taps. Only those within 120 m of a trail of the region's
trail data (most of the region's benches stand in Zakopane's streets).

Water: 'pitna' when OSM says it is drinking water (amenity=drinking_water, a tap, a spring with
drinking_water=yes); a spring with no such tag is 'zrodlo' (water not checked); drinking_water=no is left out.
Output: public/data/region/rest.json {r: [[lon, lat, kind]], w: [[lon, lat, kind, name]]}
  kinds of r: bench, table, shelter; of w: pitna, zrodlo
Run: python3 tools/prepare_rest.py
"""
import json
import math
import os
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TRAILS = os.path.join(HERE, '..', 'public', 'data', 'region', 'trails.json')
OUT = os.path.join(HERE, '..', 'public', 'data', 'region', 'rest.json')
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
            'https://overpass.private.coffee/api/interpreter']
UA = 'Szlakownik/1.0 (https://github.com/postojomierz-lang/postojomierz; rest places)'


def overpass(q):
    for url in OVERPASS:
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except Exception as e:
            print('  ', url, e, flush=True)
    raise SystemExit('no Overpass server answered')


def main():
    trails = json.load(open(TRAILS))
    w, s, e, n = trails['region']
    bb = f'({s},{w},{n},{e})'
    sel = ['node["amenity"="bench"]', 'node["leisure"="picnic_table"]', 'node["amenity"="shelter"]', 'way["amenity"="shelter"]',
           'node["natural"="spring"]', 'node["amenity"="drinking_water"]', 'node["man_made"="water_tap"]']
    d = overpass('[out:json][timeout:120];(' + ''.join(x + bb + ';' for x in sel) + ');out center body;')
    # the trail vertices in 100 m cells
    lat0 = (s + n) / 2
    mx, mz = 111320 * math.cos(math.radians(lat0)), 110574
    cells = {}
    for lon, lat, *_ in trails['v']:
        cells.setdefault((int(lon * mx // 100), int(lat * mz // 100)), []).append((lon * mx, lat * mz))

    def near_trail(lon, lat, r=120):
        x, z = lon * mx, lat * mz
        cx, cz = int(x // 100), int(z // 100)
        return any(math.hypot(px - x, pz - z) < r for i in (-1, 0, 1) for j in (-1, 0, 1) for px, pz in cells.get((cx + i, cz + j), ()))

    rest, water = [], []
    for el in d['elements']:
        t = el.get('tags', {})
        lon, lat = (el['lon'], el['lat']) if 'lon' in el else (el['center']['lon'], el['center']['lat'])
        if not near_trail(lon, lat):
            continue
        p = [round(lon, 6), round(lat, 6)]
        if t.get('amenity') == 'bench':
            rest.append(p + ['bench'])
        elif t.get('leisure') == 'picnic_table':
            rest.append(p + ['table'])
        elif t.get('amenity') == 'shelter':
            rest.append(p + ['shelter'])
        else:
            dw = t.get('drinking_water')
            if dw == 'no':
                continue
            kind = 'pitna' if t.get('amenity') == 'drinking_water' or t.get('man_made') == 'water_tap' or dw == 'yes' else 'zrodlo'
            water.append(p + [kind, t.get('name', '')])
    json.dump({'r': rest, 'w': water}, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('rest places:', len(rest), '· water:', len(water), sum(x[2] == 'pitna' for x in water), 'drinking')


if __name__ == '__main__':
    main()
