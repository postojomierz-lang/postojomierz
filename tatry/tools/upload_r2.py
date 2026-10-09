#!/usr/bin/env python3
"""Sends the region data (../../region/) to the Cloudflare R2 bucket, under the key prefix region/.

Only the files that changed are sent: the bucket's listing gives the MD5 (ETag) of every object, and a file
whose MD5 matches is skipped. Every object gets its Content-Type and Cache-Control.
The app reads the data from R2_PUBLIC_URL + '/region/' (REGION_BASE in tatry/src/region.js).

Environment: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET.
  python3 tatry/tools/upload_r2.py              # send the changed files
  python3 tatry/tools/upload_r2.py --dry-run    # only say what would be sent
  python3 tatry/tools/upload_r2.py --delete     # also remove objects that no longer exist locally
"""
import argparse, datetime, gzip, hashlib, hmac, os, sys, time, urllib.parse, xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2] / 'region'
PREFIX = 'region/'
TYPES = {'.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
         '.bin': 'application/octet-stream', '.u16': 'application/octet-stream'}
# the file names do not change with their content, so the browser keeps them for a day only; meta.json (the
# index of everything else) for a few minutes, so a new upload shows up quickly
CACHE_DEFAULT = 'public, max-age=86400'
CACHE_SHORT = {'meta.json': 'public, max-age=300'}
EMPTY_SHA = hashlib.sha256(b'').hexdigest()
# JSON goes up gzipped (Content-Encoding: gzip; the browser unpacks it): R2 does not compress, and meta.json, with
# every stream's line in it, is 17 MB as it is, 5 MB packed (the first thing a phone waits for before the 3D view)
PACKED = {'.json'}


def packed(path):
    body = path.read_bytes()
    if path.suffix.lower() in PACKED:
        return gzip.compress(body, 9, mtime=0), {'Content-Encoding': 'gzip'}   # (mtime 0: the same bytes, the same MD5)
    return body, {}


def set_prefix(p):
    global PREFIX
    PREFIX = p.rstrip('/') + '/'


def env(name):
    v = os.environ.get(name)
    if not v:
        sys.exit(f'brak zmiennej środowiska {name}')
    return v


KEY_ID, SECRET, ACCOUNT, BUCKET = (env(n) for n in ('R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID', 'R2_BUCKET'))
HOST = f'{ACCOUNT}.r2.cloudflarestorage.com'
session = requests.Session()


def _hmac(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def signed(method, key='', query=None, body=b'', headers=None):
    """AWS Signature V4 request to the bucket (region 'auto', service s3)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date, day = now.strftime('%Y%m%dT%H%M%SZ'), now.strftime('%Y%m%d')
    path = '/' + BUCKET + ('/' + urllib.parse.quote(key, safe='/~') if key else '')
    query = query or {}
    qs = '&'.join(f'{urllib.parse.quote(k, safe="~")}={urllib.parse.quote(str(v), safe="~")}' for k, v in sorted(query.items()))
    payload = hashlib.sha256(body).hexdigest() if body else EMPTY_SHA
    h = {k.lower(): v for k, v in (headers or {}).items()}
    h.update({'host': HOST, 'x-amz-date': amz_date, 'x-amz-content-sha256': payload})
    names = sorted(h)
    canonical = '\n'.join([method, path, qs, ''.join(f'{n}:{str(h[n]).strip()}\n' for n in names), ';'.join(names), payload])
    scope = f'{day}/auto/s3/aws4_request'
    to_sign = '\n'.join(['AWS4-HMAC-SHA256', amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = _hmac(_hmac(_hmac(_hmac(('AWS4' + SECRET).encode(), day), 'auto'), 's3'), 'aws4_request')
    h['authorization'] = (f'AWS4-HMAC-SHA256 Credential={KEY_ID}/{scope}, SignedHeaders={";".join(names)}, '
                          f'Signature={hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()}')
    url = f'https://{HOST}{path}' + ('?' + qs if qs else '')
    for attempt in range(5):
        try:
            r = session.request(method, url, data=body or None, headers=h, timeout=120)
            if r.status_code < 500:
                return r
        except requests.RequestException:
            pass
        time.sleep(2 ** attempt)
    sys.exit(f'{method} {key or "(lista)"}: nie udało się po 5 próbach')


def remote_etags():
    """key -> MD5 of every object under PREFIX."""
    out, token = {}, None
    ns = '{http://s3.amazonaws.com/doc/2006-03-01/}'
    while True:
        q = {'list-type': '2', 'prefix': PREFIX, 'max-keys': '1000'}
        if token:
            q['continuation-token'] = token
        r = signed('GET', query=q)
        if r.status_code != 200:
            sys.exit(f'lista obiektów: HTTP {r.status_code} {r.text[:200]}')
        root = ET.fromstring(r.content)
        for c in root.iter(ns + 'Contents'):
            out[c.find(ns + 'Key').text] = c.find(ns + 'ETag').text.strip('"')
        if root.findtext(ns + 'IsTruncated') != 'true':
            return out
        token = root.findtext(ns + 'NextContinuationToken')


def put(path, key):
    body, extra = packed(path)
    rel = path.relative_to(ROOT).as_posix()
    r = signed('PUT', key, body=body, headers={
        'Content-Type': TYPES.get(path.suffix.lower(), 'application/octet-stream'),
        'Cache-Control': CACHE_SHORT.get(rel, CACHE_DEFAULT), **extra})
    if r.status_code != 200:
        sys.exit(f'PUT {key}: HTTP {r.status_code} {r.text[:200]}')
    return len(body)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true', help='tylko pokaż, co zostałoby wysłane')
    ap.add_argument('--delete', action='store_true', help='usuń z bucketu pliki, których nie ma lokalnie')
    ap.add_argument('--jobs', type=int, default=16, help='liczba równoległych wysyłek')
    ap.add_argument('--prefix', default=PREFIX, help='klucz w buckecie (np. region2/ przy zmianie siatki regionu: '
                    'stare nazwy plików dostają inną treść, a przeglądarki trzymają je przez dobę)')
    a = ap.parse_args()
    set_prefix(a.prefix)

    local = {PREFIX + p.relative_to(ROOT).as_posix(): p for p in sorted(ROOT.rglob('*')) if p.is_file()}
    remote = remote_etags()
    todo = [(k, p) for k, p in local.items() if remote.get(k) != hashlib.md5(packed(p)[0]).hexdigest()]
    gone = sorted(set(remote) - set(local))
    size = sum(p.stat().st_size for _, p in todo)
    print(f'lokalnie {len(local)} plików, w buckecie {len(remote)}; do wysłania {len(todo)} ({size / 1e6:.1f} MB), '
          f'nieaktualnych w buckecie {len(gone)}')
    if a.dry_run:
        for k, _ in todo[:20]:
            print('  +', k)
        for k in gone[:20]:
            print('  -', k)
        return

    sent, t0 = 0, time.time()
    with ThreadPoolExecutor(a.jobs) as ex:
        futs = [ex.submit(put, p, k) for k, p in todo]
        for n, f in enumerate(as_completed(futs), 1):
            sent += f.result()
            if n % 500 == 0 or n == len(futs):
                print(f'  {n}/{len(futs)}  {sent / 1e6:.0f} MB  {time.time() - t0:.0f} s', flush=True)
    if a.delete and gone:
        for k in gone:
            r = signed('DELETE', k)
            if r.status_code not in (200, 204):
                sys.exit(f'DELETE {k}: HTTP {r.status_code}')
        print(f'usunięto {len(gone)} obiektów')
    print('gotowe')


if __name__ == '__main__':
    main()
