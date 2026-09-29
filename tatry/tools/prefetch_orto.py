"""Fetch the region's 0.5 m tile photos from the geoportal WMS in parallel into the cache used by
prepare_gugik.py (names by coordinates), so the PHOTO_ONLY run that follows reads them from disk.
Run: AREA=region python3 tools/prefetch_orto.py"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
sys.argv = [sys.argv[0]]
import prepare as P
import importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('g', os.path.join(HERE, 'prepare_gugik.py'))
DATA = os.path.join(HERE, '..', '..', 'region')
meta = json.load(open(os.path.join(DATA, 'meta.json')))
T = meta['tiles']; ox, oz = T['origin']; S = T['size']
WMS = ('https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime'
       '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Raster&STYLES=&CRS=EPSG:4326&FORMAT=image/jpeg&TIME=')
ED = '2012-12-31T00:00:00.000Z'
CACHE = os.path.join(HERE, '.cache', 'orto')
import urllib.request, time
def lonlat(x, z): return P.LON0 + x / P.MX, P.LAT0 - z / P.MZ
def one(t):
    i, j = t
    x0, z0 = ox + i * S, oz + j * S
    lon0, lat0 = lonlat(x0, z0 + S); lon1, lat1 = lonlat(x0 + S, z0)
    if lat1 < 49.15:                                   # wholly in Slovakia: no Polish photo
        return 0
    path = os.path.join(CACHE, f'r_tb_{lon0:.5f}_{lat0:.5f}.jpg')
    if os.path.exists(path): return 0
    url = f'{WMS}{ED}&BBOX={lat0},{lon0},{lat1},{lon1}&WIDTH=512&HEIGHT=512'
    for a in range(4):
        try:
            b = urllib.request.urlopen(url, timeout=60).read()
            open(path, 'wb').write(b); return 1
        except Exception:
            time.sleep(2 * (a + 1))
    return 0
tiles = T['list']
done = 0
with ThreadPoolExecutor(8) as ex:
    for k, r in enumerate(ex.map(one, tiles)):
        done += r
        if k % 200 == 0: print(k, '/', len(tiles), 'fetched', done, flush=True)
print('prefetch done', done)
