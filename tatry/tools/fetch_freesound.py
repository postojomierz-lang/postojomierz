"""Downloads the Freesound previews used by the game (needs an Authorization: Token header for
freesound.org, e.g. injected by the environment) into ./snd2 with credits.json."""
import json, urllib.request, os
IDS = {'stream': 826443, 'waterfall': 442475, 'wind_forest': 679753, 'wind_open': 578630,
       'steps_gravel': 609173, 'steps_rock': 770084, 'steps_grass': 580699,
       'marmot': 351664, 'marmot2': 822939, 'wren': 156032, 'forest': 658498, 'redstart': 56302, 'chough': 127353}
credits = {}
for key, sid in IDS.items():
    d = json.load(urllib.request.urlopen(f'https://freesound.org/apiv2/sounds/{sid}/?fields=id,name,username,license,url,previews'))
    lic = 'CC0' if 'zero' in d['license'] else 'CC BY 4.0' if '4.0' in d['license'] else 'CC BY 3.0' if '3.0' in d['license'] else d['license']
    credits[key] = {'title': d['name'], 'author': d['username'], 'license': lic, 'url': d['url']}
    out = f'snd2/{key}.mp3'
    if not os.path.exists(out):
        open(out, 'wb').write(urllib.request.urlopen(d['previews']['preview-hq-mp3']).read())
    print(key, lic, d['username'], os.path.getsize(out) // 1024, 'KB')
json.dump(credits, open('snd2/credits.json', 'w'), indent=1, ensure_ascii=False)
