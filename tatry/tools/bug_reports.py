"""Read the test reports sent from the app's 🐞 button (table bug_reports in Supabase).
Prints each report (number, time, app, description, where, device, recent errors) and saves its
screenshot next to it. Needs SUPABASE_URL and SUPABASE_ANON_KEY in the environment (the same public
key the app is built with).
Run: python3 tools/bug_reports.py [--since ID] [--out DIR] [--json]
"""
import argparse
import base64
import json
import os
import sys
import urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('--since', type=int, default=0, help='only reports with a higher number')
ap.add_argument('--out', default='bug_reports', help='where to save the screenshots')
ap.add_argument('--json', action='store_true', help='print the full context as JSON')
a = ap.parse_args()
url, key = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_ANON_KEY')
if not url or not key:
    sys.exit('SUPABASE_URL / SUPABASE_ANON_KEY not set')
req = urllib.request.Request(
    f'{url}/rest/v1/bug_reports?select=*&id=gt.{a.since}&order=id.asc',
    headers={'apikey': key, 'Authorization': f'Bearer {key}'})
rows = json.load(urllib.request.urlopen(req, timeout=30))
os.makedirs(a.out, exist_ok=True)
for r in rows:
    c = r.get('context') or {}
    print(f"\n#{r['id']}  {r['created_at'][:16].replace('T', ' ')}  [{r['app']}]")
    print('  opis:', r['description'])
    if c.get('where'):
        print('  gdzie:', c['where'])
    print('  urządzenie:', c.get('screen'), '|', c.get('quality', ''), c.get('fps', ''), '|', (c.get('ua') or '')[:90])
    if c.get('build'):
        print('  wersja:', c['build'])
    for u in c.get('ui') or []:
        print('  na ekranie:', u)
    log = c.get('log') or []
    for e in log[-6:]:
        print(f"  {e.get('type')}: {e.get('msg', '')[:160]}")
    shot = r.get('screenshot')
    if shot and shot.startswith('data:image'):
        path = os.path.join(a.out, f"report_{r['id']}.jpg")
        with open(path, 'wb') as f:
            f.write(base64.b64decode(shot.split(',', 1)[1]))
        print('  zrzut:', path)
    if a.json:
        print(json.dumps({k: v for k, v in c.items() if k != 'log'}, ensure_ascii=False, indent=1))
print(f'\n{len(rows)} zgłoszeń')
