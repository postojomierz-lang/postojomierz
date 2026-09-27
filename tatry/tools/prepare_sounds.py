"""Turns the downloaded Wikimedia Commons recordings into the game's sound files (public/sounds/).

- loops (stream, waterfall, wind): a clean stretch, mono, seamless loop by crossfading the end into
  the start, RMS-normalised;
- footsteps: single steps cut at the energy peaks of a gravel walk;
- birds and marmots: the loudest phrases (bursts of energy) cut out with short fades.
Output is MP3 (LAME header, so Web Audio decodes it gaplessly) plus credits.json.
Run: python3 prepare_sounds.py <raw_dir>   (raw files and credits.json from the download step)
"""
import json, os, subprocess, sys
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
raw_dir = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sounds')
os.makedirs(OUT, exist_ok=True)

def have(name):
    return any(os.path.splitext(x)[0] == name and os.path.getsize(os.path.join(raw_dir, x)) > 0 for x in os.listdir(raw_dir))

def load(name):
    f = next(os.path.join(raw_dir, x) for x in os.listdir(raw_dir) if os.path.splitext(x)[0] == name and os.path.getsize(os.path.join(raw_dir, x)) > 0)
    b = subprocess.run([FF, '-v', 'error', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(b, np.float32).copy()

def save(x, name, br='96k'):
    p = subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', br,
                        os.path.join(OUT, name + '.mp3')], input=x.astype(np.float32).tobytes(), check=True)
    return p

def rms(x): return float(np.sqrt(np.mean(x * x)) + 1e-9)

def loop(x, start, length, xf, target=0.1):
    a, n, k = int(start * SR), int(length * SR), int(xf * SR)
    seg = x[a:a + n + k].copy()
    if len(seg) < n + k: seg = x[-(n + k):].copy()
    ramp = np.linspace(0, 1, k, dtype=np.float32)
    out = seg[:n].copy()
    out[:k] = seg[n:n + k] * (1 - ramp) + seg[:k] * ramp   # the tail fades into the head
    return out * (target / rms(out))

def envelope(x, win=0.05):
    w = int(win * SR)
    e = np.sqrt(np.convolve(x * x, np.ones(w) / w, mode='same'))
    return e

def phrases(x, n, min_len=0.8, max_len=6.0, gap=0.35, peak=0.9):
    e = envelope(x); p50 = np.percentile(e, 50); thr = p50 + 0.22 * (e.max() - p50)
    on = e > thr
    segs, i, N = [], 0, len(x)
    while i < N:
        if not on[i]: i += 1; continue
        j = i
        while j < N and (on[j] or np.any(on[j:min(N, j + int(gap * SR))])): j += int(0.01 * SR)
        segs.append((i, min(j, N)))
        i = j + 1
    segs = [(a, b) for a, b in segs if (b - a) / SR >= min_len]
    segs = [(a, min(b, a + int(max_len * SR))) for a, b in segs]
    segs.sort(key=lambda s: -float(e[s[0]:s[1]].mean()))
    out = []
    for a, b in segs[:n]:
        a = max(0, a - int(0.08 * SR)); b = min(N, b + int(0.25 * SR))
        s = x[a:b].copy()
        f = int(0.03 * SR); s[:f] *= np.linspace(0, 1, f); s[-int(0.2 * SR):] *= np.linspace(1, 0, int(0.2 * SR))
        out.append(s * (peak / (np.abs(s).max() + 1e-9)))
    return out

def steps(x, n):
    e = envelope(x, 0.02)
    idx, out, last = np.argsort(-e), [], []
    for i in idx:
        if all(abs(i - j) > int(0.3 * SR) for j in last):
            last.append(i)
            if len(last) >= n: break
    for i in sorted(last):
        a = max(0, i - int(0.06 * SR)); b = min(len(x), i + int(0.3 * SR))
        s = x[a:b].copy(); s[-int(0.1 * SR):] *= np.linspace(1, 0, int(0.1 * SR))
        out.append(s * (0.8 / (np.abs(s).max() + 1e-9)))
    return out

made = {}
groups = {}
def done(name, key, group=None):
    made[name] = key
    groups.setdefault(group or name, []).append(name)

for f in os.listdir(OUT):
    if f.endswith('.mp3'): os.remove(os.path.join(OUT, f))
save(loop(load('stream'), 8, 22, 2.0, 0.12), 'stream'); done('stream', 'stream', 'stream')
save(loop(load('waterfall'), 2, 24, 2.5, 0.14), 'waterfall'); done('waterfall', 'waterfall', 'waterfall')
save(loop(load('wind_forest'), 5, 40, 4.0, 0.1), 'wind_forest'); done('wind_forest', 'wind_forest', 'windForest')
if have('wind_open'):
    save(loop(load('wind_open'), 3, 36, 4.0, 0.1), 'wind_open'); done('wind_open', 'wind_open', 'windOpen')
else:  # stand-in: a later stretch of the forest wind
    save(loop(load('wind_forest'), 20, 36, 4.0, 0.1), 'wind_open'); done('wind_open', 'wind_forest', 'windOpen')
for k, s in enumerate(steps(load('steps'), 6)): save(s, f'step_{k}', '64k'); done(f'step_{k}', 'steps', 'steps')
for key, n in (('wren', 3), ('robin', 2), ('nutcracker', 2), ('chough', 2)):
    if not have(key): continue
    for k, s in enumerate(phrases(load(key), n, min_len=0.6)): save(s, f'{key}_{k}', '64k'); done(f'{key}_{k}', key, key)
for k, s in enumerate(phrases(load('marmot'), 3, min_len=0.15, max_len=2.5, gap=0.25)): save(s, f'marmot_{k}', '64k'); done(f'marmot_{k}', 'marmot', 'marmot')
json.dump(groups, open(os.path.join(OUT, 'sounds.json'), 'w'), indent=1)

credits = json.load(open(os.path.join(raw_dir, 'credits.json')))
used = sorted(set(made.values()))
json.dump({k: credits[k] for k in used if k in credits}, open(os.path.join(OUT, 'credits.json'), 'w'), indent=1, ensure_ascii=False)
print('files', sorted(made), '\nsources', used)
