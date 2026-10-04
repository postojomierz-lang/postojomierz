"""Which article of the Polish Wikipedia describes each place of the 3D labels and the planner (peaks,
passes, huts of the region's trail data). The app fetches the article's lead and picture when a card is
opened (src/nature/card.js), from the hiker's own phone: the Wikimedia servers limit a shared address (such as
a build machine's) to a trickle, so only the matching is done here, in one Wikidata query.

A place gets an article with a Polish page and coordinates whose name matches its own and which lies within
1.5 km (many Tatra names repeat: Rohatka, Kopa, Giewont...).
Output: public/data/places_wiki.json {place name: article title}
Run: python3 tools/fetch_place_wiki.py
"""
import json
import math
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TRAILS = os.path.join(HERE, '..', 'public', 'data', 'region', 'trails.json')
OUT = os.path.join(HERE, '..', 'public', 'data', 'places_wiki.json')
UA = 'Szlakownik/1.0 (https://github.com/postojomierz-lang/postojomierz; place descriptions)'
BOX = (19.85, 49.08, 20.31, 49.29)


def get(url, data=None, accept='application/json'):
    for k in range(6):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Api-User-Agent': UA, 'Accept': accept})
            with urllib.request.urlopen(req, timeout=120) as r:
                out = json.loads(r.read())
            time.sleep(2)
            return out
        except Exception as e:
            print('  retry', k, e, flush=True)
            time.sleep(30 * (k + 1))
    raise SystemExit('the Wikimedia servers do not answer')


def norm(s):
    s = unicodedata.normalize('NFKD', s.lower().replace('ł', 'l'))
    return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in s if not unicodedata.combining(c))).strip()


def metres(lon1, lat1, lon2, lat2):
    return math.hypot((lon1 - lon2) * 111320 * math.cos(math.radians(lat1)), (lat1 - lat2) * 110574)


def items():
    q = f"""SELECT ?item ?coord ?article WHERE {{
      SERVICE wikibase:box {{ ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:cornerSouthWest "Point({BOX[0]} {BOX[1]})"^^geo:wktLiteral .
        bd:serviceParam wikibase:cornerNorthEast "Point({BOX[2]} {BOX[3]})"^^geo:wktLiteral . }}
      ?article schema:about ?item ; schema:isPartOf <https://pl.wikipedia.org/> .
    }}"""
    r = get('https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q}), accept='application/sparql-results+json')
    out = {}
    for b in r['results']['bindings']:
        lon, lat = map(float, re.findall(r'[-\d.]+', b['coord']['value'])[:2])
        title = urllib.parse.unquote(b['article']['value'].split('/wiki/')[1]).replace('_', ' ')
        out.setdefault(title, {'title': title, 'lon': lon, 'lat': lat})
    return list(out.values())


def match(name, lon, lat, cands):
    n, best, bd = norm(name), None, 1500
    for c in cands:
        base = norm(re.sub(r'\s*\(.*\)$', '', c['title']))
        if not (base == n or (len(n) > 5 and (n in base or base in n))):
            continue
        d = metres(c['lon'], c['lat'], lon, lat) + (0 if base == n else 300)
        if d < bd:
            best, bd = c, d
    return best


def main():
    data = json.load(open(TRAILS))
    places = [p for p in data['poi'] if p['k'] in ('peak', 'pass', 'hut')]
    cands = items()
    print('Wikidata items with a Polish article:', len(cands), flush=True)
    out = {}
    for p in places:
        if p['n'] in out:
            continue
        c = match(p['n'], p['p'][0], p['p'][1], cands)
        if c:
            out[p['n']] = c['title']
    json.dump(dict(sorted(out.items())), open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('places with an article:', len(out), 'of', len(places))

if __name__ == '__main__':
    main()
