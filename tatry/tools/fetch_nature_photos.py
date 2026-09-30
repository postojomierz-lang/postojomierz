"""Photos for the nature cards: one real photo per species of src/nature/catalog.js, from iNaturalist
(research-grade observations, the Tatras first) or Wikimedia Commons, with its author and licence (shown on
the card, as the licences require).

For every species it searches Commons for photos of it (from the Tatras first, then anywhere), skips maps,
old plates and drawings, reads the file's author and licence and downloads a 640 px thumbnail. Only freely licensed files (CC0, public domain, CC BY, CC BY-SA) are kept.
Output: public/nature/<id>.jpg and public/nature/photos.json {id: {file, author, license, url}}.
Polite to the Wikimedia servers: one request at a time with a pause, a descriptive User-Agent.
Run: python3 tools/fetch_nature_photos.py [id ...]
"""
import html
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'nature')
UA = 'rysy3d-prototype/0.1 (https://github.com/postojomierz-lang/postojomierz; nature cards)'
FREE = re.compile(r'^(cc0|public domain|pd|cc[ -]by(-sa)?[ -]?[0-9.]*|cc[ -]by-sa|cc[ -]by)', re.I)


def get(url, binary=False):
    for k in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
            time.sleep(3.0)
            return b if binary else json.loads(b)
        except Exception as e:
            print('  retry', k, e, flush=True)
            time.sleep(60 * (k + 1))            # 429: the servers ask to slow down
    return None


def catalog():
    src = open(os.path.join(HERE, '..', 'src', 'nature', 'catalog.js'), encoding='utf-8').read()
    return re.findall(r"\['([^']+)', '([^']+)', '([^']+)', '(\w+)', (\d)", src)


BAD = re.compile(r'map|range|distribution|drawing|illustration|K[oö]hler|Sturm|Flora_von|plate|herbarium|specimen|stamp|\.svg', re.I)
strip = lambda v: html.unescape(re.sub('<[^>]+>', '', v or '')).strip()


def search(query):
    """Files on Commons for a search, best first: (name, thumb url, licence, author, page url)."""
    q = urllib.parse.quote(query)
    r = get('https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6'
            f'&gsrlimit=12&gsrsearch={q}%20filetype:bitmap&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=640')
    if not r or 'query' not in r:
        return []
    out = []
    for page in sorted(r['query']['pages'].values(), key=lambda p: p.get('index', 99)):
        ii = (page.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata', {})
        name = page['title'][5:]
        lic = strip(md.get('LicenseShortName', {}).get('value'))
        if ii.get('mime') != 'image/jpeg' or BAD.search(name) or not FREE.match(lic or '') or ii.get('width', 0) < 640:
            continue
        author = strip(md.get('Artist', {}).get('value')) or strip(md.get('Credit', {}).get('value'))
        out.append({'file': name, 'thumb': ii.get('thumburl'), 'license': lic, 'author': author[:120], 'url': ii.get('descriptionurl')})
    return out


INAT_LIC = {'cc0': 'CC0', 'cc-by': 'CC BY 4.0', 'cc-by-sa': 'CC BY-SA 4.0'}
TATRAS = '&swlat=49.1&swlng=19.7&nelat=49.35&nelng=20.45'


def inat(latin, box=''):
    # the most-voted freely licensed research-grade photo of the species on iNaturalist
    q = urllib.parse.quote(latin)
    r = get(f'https://api.inaturalist.org/v1/observations?taxon_name={q}&photo_license=cc0,cc-by,cc-by-sa'
            f'&quality_grade=research&per_page=10&order_by=votes{box}')
    for o in (r or {}).get('results', []):
        for ph in o.get('photos', []):
            lic = INAT_LIC.get(ph.get('license_code'))
            if lic and ph.get('url'):
                u = o.get('user') or {}
                author = u.get('name') or u.get('login') or 'iNaturalist'
                return {'file': f"inaturalist-{ph['id']}", 'thumb': ph['url'].replace('/square.', '/medium.'),
                        'license': lic, 'author': author[:120], 'url': f"https://www.inaturalist.org/photos/{ph['id']}"}
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    idx_path = os.path.join(OUT, 'photos.json')
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    only = set(sys.argv[1:])
    for sid, name, latin, group, rarity in catalog():
        if (only and sid not in only) or (not only and sid in idx):
            continue
        print(sid, latin, flush=True)
        # a photo from the Tatras if there is one, else any photo of the species
        latin_q = latin.replace(' m. fario', '')
        info = inat(latin_q, TATRAS)
        if not info:
            found = search(f'{latin_q} Tatry') or search(f'"{latin_q}"')
            info = found[0] if found else inat(latin_q)
        if not info:
            print('  no free photo', flush=True)
            continue
        b = get(info['thumb'], binary=True)
        if not b:
            continue
        im = Image.open(io.BytesIO(b)).convert('RGB')
        im.thumbnail((640, 640))
        im.save(os.path.join(OUT, f'{sid}.jpg'), quality=82, optimize=True, progressive=True)
        idx[sid] = {'file': info['file'], 'author': info['author'], 'license': info['license'], 'url': info['url']}
        json.dump(idx, open(idx_path, 'w'), ensure_ascii=False, indent=1)
    print('photos', len(idx))


if __name__ == '__main__':
    main()
