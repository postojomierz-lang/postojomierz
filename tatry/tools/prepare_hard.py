"""Hard passages on the trails, from OpenStreetMap: fixed chains, staples and ladders (safety_rope=*, a via
ferrata) and exposed alpine stretches (sac_scale alpine_hiking and harder, T4-T6: Orla Perć, the ridges).
The planner marks the route's chains and alpine stretches with them (a helmet and gloves in the 🎒 list).

Output: public/data/region/hard.json {c: [[name, [[lon, lat], ...]]], a: [[name, T, [[lon, lat], ...]]]}
  c: chains (name '' when the way has none), a: alpine stretches with their SAC grade (4, 5, 6)
Run: python3 tools/prepare_hard.py
"""
import json
import os
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TRAILS = os.path.join(HERE, '..', 'public', 'data', 'region', 'trails.json')
OUT = os.path.join(HERE, '..', 'public', 'data', 'region', 'hard.json')
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
            'https://overpass.private.coffee/api/interpreter']
UA = 'Szlakownik/1.0 (https://github.com/postojomierz-lang/postojomierz; hard passages)'
SAC = {'alpine_hiking': 4, 'demanding_alpine_hiking': 5, 'difficult_alpine_hiking': 6}


def overpass(q):
    for url in OVERPASS * 2:                     # busy servers: a second round
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.loads(r.read())
        except Exception as e:
            print('  ', url, e, flush=True)
    raise SystemExit('no Overpass server answered')


def line(e):
    return [[round(p['lon'], 5), round(p['lat'], 5)] for p in e.get('geometry') or []]


def main():
    w, s, e, n = json.load(open(TRAILS))['region']
    bb = f'({s},{w},{n},{e})'
    # two smaller queries: the servers time out on one with both
    els = overpass(f'[out:json][timeout:200];(way["safety_rope"]{bb};way["highway"="via_ferrata"]{bb};);out tags geom;')['elements']
    els += overpass(f'[out:json][timeout:200];way["highway"]["sac_scale"~"alpine_hiking"]{bb};out tags geom;')['elements']
    chains, alpine = [], []
    for el in els:
        t, pts = el.get('tags', {}), line(el)
        if len(pts) < 2:
            continue
        name = t.get('name', '')
        if (t.get('safety_rope') not in (None, 'no')) or t.get('highway') == 'via_ferrata':
            chains.append([name, pts])
        if t.get('sac_scale') in SAC:
            alpine.append([name, SAC[t['sac_scale']], pts])
    json.dump({'c': chains, 'a': alpine}, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'chains {len(chains)}, alpine {len(alpine)} -> {OUT} ({os.path.getsize(OUT) // 1024} kB)')


if __name__ == '__main__':
    main()
