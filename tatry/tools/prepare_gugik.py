"""High-resolution Polish data from GUGiK for the detailed area (run after prepare.py).

- NMT (digital terrain model, bare earth) 1 m, WCS
- Orthophoto, edition ~2012 (high sun, few shadows in the cirques), WMS

Writes into ../public/data/:
  inner4.bin      deflate: u16 heights (dm) on a 4 m grid + u8 mask (1 = GUGiK, 0 = Copernicus fill)
  inner.jpg       2 m orthophoto over the detailed area (Sentinel-2 fills Slovakia)
  tiles/h_i_j.bin deflate: u16 heights (dm), 257x257 samples, 1 m, per 256 m tile near the trail
  tiles/o_i_j.jpg 512x512 orthophoto, 0.5 m, per tile
and adds the grid/tile description to meta.json.
Slovak side: terrain from DMR 5.0 (ÚGKK SR, 1 m) in ../zbgis/*.tif, orthophoto (GKÚ Bratislava, NLC,
2025, ~1.3 m) in ../zbgis_orto/*.tif; Sentinel-2 only where neither photo exists.
Copernicus DEM only fills what neither lidar covers, blended at the border.
"""
import io, json, math, os, zlib, urllib.request, concurrent.futures as cf
import numpy as np, rasterio
from rasterio.io import MemoryFile
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds, from_origin
from rasterio.features import rasterize
from scipy.ndimage import gaussian_filter, distance_transform_edt, zoom
from PIL import Image
from pyproj import Transformer
from affine import Affine
from shapely.geometry import LineString

import prepare as P

ROOT = os.path.join(os.path.dirname(__file__), '..')
DATA = P.OUT                                  # public/data, or ../region with AREA=region
REGION = P.AREA == 'region'
PFX = 'r_' if REGION else ''                  # cache names of the region's photo requests
BLOCK = 256                                   # region: base grid and photo in blocks of 256 samples (1024 m)
CACHE = os.path.join(os.path.dirname(__file__), '.cache')
WCS = ('https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF'
       '?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=DTM_PL-KRON86-NH_TIFF&FORMAT=image/tiff')
WMS = ('https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime'
       '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Raster&STYLES=&CRS=EPSG:4326&FORMAT=image/jpeg'
       '&TIME=')
# editions tried in order: ~2012 has a high sun and few shadows; ~2015 fills gaps; then Sentinel-2
EDITIONS = ['2012-12-31T00:00:00.000Z', '2016-12-31T00:00:00.000Z']
TILE = 256          # metres
BASE_STEP = 4       # metres, base grid
ORTHO_BASE = 2      # metres per pixel
CORRIDOR = 420      # tiles whose centre is this close to the trail get 1 m / 0.5 m data
if P.AREA == 'region': CORRIDOR = 200     # tiles touching this band round any trail of the region

to2180 = Transformer.from_crs(4326, 2180, always_xy=True)

def get(url, path):
    path = os.path.join(CACHE, path)
    if os.path.exists(path): return open(path, 'rb').read()
    for attempt in range(4):
        try:
            b = urllib.request.urlopen(url, timeout=120).read()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'wb').write(b)
            return b
        except Exception as e:
            print('retry', attempt, e)
            __import__('time').sleep(3 * (attempt + 1))
    raise RuntimeError(url)

def lonlat(x, z):
    return P.LON0 + x / P.MX, P.LAT0 - z / P.MZ

# ---------------------------------------------------------------- elevation
def dtm_mosaic(ib):
    """GUGiK NMT at 1 m over the detailed area, as one EPSG:2180 array (0 = no data)."""
    corners = [lonlat(ib[0], ib[1]), lonlat(ib[2], ib[1]), lonlat(ib[0], ib[3]), lonlat(ib[2], ib[3])]
    xs, ys = zip(*[to2180.transform(*c) for c in corners])
    x0, x1 = math.floor(min(xs)) - 50, math.ceil(max(xs)) + 50
    y0, y1 = math.floor(min(ys)) - 50, math.ceil(max(ys)) + 50
    CH = 1000
    jobs = [(cx, cy) for cx in range(x0, x1, CH) for cy in range(y0, y1, CH)]
    W, H = x1 - x0, y1 - y0
    mos = np.zeros((H, W), dtype=np.float32)
    def fetch(job):
        cx, cy = job
        b = get(f'{WCS}&SUBSET=x({cx},{cx + CH})&SUBSET=y({cy},{cy + CH})', f'dtm/{cx}_{cy}.tif')
        with MemoryFile(b) as m, m.open() as r:
            return job, r.read(1), r.bounds
    with cf.ThreadPoolExecutor(2) as ex:
        for (cx, cy), a, bd in ex.map(fetch, jobs):
            c0 = int(round(bd.left - x0)); r0 = int(round(y1 - bd.top))
            h, w = a.shape
            # clip the chunk to the mosaic
            sr, sc = max(0, -r0), max(0, -c0)
            dr0, dc0 = max(0, r0), max(0, c0)
            dr1, dc1 = min(H, r0 + h), min(W, c0 + w)
            if dr1 > dr0 and dc1 > dc0:
                mos[dr0:dr1, dc0:dc1] = a[sr:sr + dr1 - dr0, sc:sc + dc1 - dc0]
    print('dtm mosaic', mos.shape, 'coverage', round(float((mos > 100).mean()), 3))
    return mos, from_origin(x0, y1, 1, 1)

def zbgis_mosaic():
    """Slovak DMR 5.0 (ÚGKK SR, 1 m, S-JTSK [JTSK03]) from tatry/zbgis/*.tif, or None."""
    import glob
    from rasterio.merge import merge
    files = sorted(glob.glob(os.path.join(ROOT, 'zbgis', '*.tif')))
    if not files: return None
    srcs = [rasterio.open(f) for f in files]
    mos, t = merge(srcs, nodata=0)
    a = mos[0].astype(np.float32)
    a[(a > 10000) | (a < 100)] = 0
    print('zbgis mosaic', a.shape, 'coverage', round(float((a > 0).mean()), 3))
    return a, t

def sk_ortho(bounds_ll, w, h):
    """Slovak orthophoto mosaic (S-JTSK, EPSG:5514, .tif + .tfw) resampled to a lon/lat pixel grid."""
    import glob
    from rasterio.merge import merge
    files = sorted(glob.glob(os.path.join(ROOT, 'zbgis_orto', '*.tif')))
    if not files: return None
    srcs = [rasterio.open(f) for f in files]
    mos, t = merge(srcs, nodata=0)
    t_dst = from_bounds(*bounds_ll, w, h)
    out = np.zeros((3, h, w), dtype=np.float32)
    for b in range(3):
        reproject(mos[b].astype(np.float32), out[b], src_transform=t, src_crs='EPSG:5514', dst_transform=t_dst,
                  dst_crs='EPSG:4326', resampling=Resampling.lanczos, src_nodata=0, dst_nodata=0)
    o = np.moveaxis(out, 0, -1)
    # white (Poland) and black (missing) mean no data; erode a little to drop resampled edges
    from scipy.ndimage import binary_erosion
    v = binary_erosion(is_valid(o), iterations=2)
    return o, v

def to_local_grid(src, src_t, bounds_ll, w, h, resampling, pixel_is_point=True, crs='EPSG:2180', nodata=0):
    """Resample a projected array onto a lon/lat grid of w x h samples (samples on the bounds)."""
    lon0, lat0, lon1, lat1 = bounds_ll
    if pixel_is_point:
        dlon, dlat = (lon1 - lon0) / (w - 1), (lat1 - lat0) / (h - 1)
        t = from_origin(lon0 - dlon / 2, lat1 + dlat / 2, dlon, dlat)
    else:
        t = from_bounds(lon0, lat0, lon1, lat1, w, h)
    dst = np.zeros((h, w), dtype=np.float32)
    reproject(src, dst, src_transform=src_t, src_crs=crs, dst_transform=t, dst_crs='EPSG:4326',
              resampling=resampling, src_nodata=nodata, dst_nodata=nodata)
    return dst

def copernicus(bounds_ll, w, h):
    srcs = [f'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N49_00_E0{e}_00_DEM/Copernicus_DSM_COG_10_N49_00_E0{e}_00_DEM.tif' for e in (19, 20)]
    lon0, lat0, lon1, lat1 = bounds_ll
    dlon, dlat = (lon1 - lon0) / (w - 1), (lat1 - lat0) / (h - 1)
    t = from_origin(lon0 - dlon / 2, lat1 + dlat / 2, dlon, dlat)
    out = np.zeros((h, w), dtype=np.float32)
    for s in srcs:
        with rasterio.open(s) as r:
            tmp = np.zeros_like(out)
            reproject(rasterio.band(r, 1), tmp, dst_transform=t, dst_crs='EPSG:4326', resampling=Resampling.cubic)
            out = np.where(tmp != 0, tmp, out)
    return out

def fuse(dtm, cop, step):
    """GUGiK where present; Copernicus elsewhere, shifted to match along the border and feathered."""
    have = dtm > 100
    if have.all(): return dtm, have
    # Copernicus is a surface model and slightly off; correct it by the median difference near the border
    d_in = distance_transform_edt(have) * step
    band = have & (d_in < 150)
    off = float(np.median(dtm[band] - cop[band])) if band.any() else 0.0
    cop = cop + off
    d_out = distance_transform_edt(~have) * step
    w = np.clip(1 - d_out / 120, 0, 1)            # feather 120 m into Slovakia
    near = gaussian_filter(np.where(have, dtm, cop), 3)
    out = np.where(have, dtm, w * near + (1 - w) * cop)
    print('copernicus offset', round(off, 1), 'm')
    return out.astype(np.float32), have

def pack_heights(h, mask=None):
    # decimetres, stored as differences along each row (first value absolute): compresses ~3x better
    v = np.clip(np.round(h * 10), 0, 65535).astype(np.int32)
    d = v.copy(); d[:, 1:] = v[:, 1:] - v[:, :-1]
    b = (d & 0xFFFF).astype('<u2').tobytes()
    if mask is not None: b += mask.astype(np.uint8).tobytes()
    return zlib.compress(b, 9)

# ---------------------------------------------------------------- orthophoto
def wms(lon0, lat0, lon1, lat1, w, h, name, ed=0):
    tag = '' if ed == 0 else f'_e{ed}'
    b = get(f'{WMS}{EDITIONS[ed]}&BBOX={lat0},{lon0},{lat1},{lon1}&WIDTH={w}&HEIGHT={h}', f'orto/{name}{tag}.jpg')
    return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(np.float32)

def is_valid(o):
    # the service paints "no data" pure white or pure black
    return (o.sum(2) > 24) & (o.min(2) < 248)

def wms_filled(lon0, lat0, lon1, lat1, w, h, name):
    """First edition, gaps filled from the next one; returns image and validity."""
    o = wms(lon0, lat0, lon1, lat1, w, h, name, 0)
    v = is_valid(o)
    if v.mean() < 0.999:
        o2 = wms(lon0, lat0, lon1, lat1, w, h, name, 1)
        v2 = is_valid(o2) & ~v
        if v2.any():
            # match the second edition to the first where both exist
            both = v & is_valid(o2)
            if both.sum() > 1000:
                for c in range(3):
                    a, b = o[..., c][both], o2[..., c][both]
                    o2[..., c] = (o2[..., c] - b.mean()) / max(b.std(), 1) * a.std() + a.mean()
            o = np.where(v2[..., None], o2, o)
            v = v | v2
    return o, v

def main():
    meta = json.load(open(os.path.join(DATA, 'meta.json')))
    ib = meta['inner']['bounds']              # local metres x0 z0 x1 z1
    ll = (*lonlat(ib[0], ib[3]), *lonlat(ib[2], ib[1]))   # lon0 lat0 lon1 lat1

    # PHOTO_ONLY=1: redo only the photos (base blocks and tiles), keep the heights already written
    photo_only = os.environ.get('PHOTO_ONLY') == '1'
    if photo_only:
        mos = mos_t = zb = None
    else:
        mos, mos_t = dtm_mosaic(ib)
        zb = zbgis_mosaic() if not photo_only else None
    SK = 'EPSG:8353'  # S-JTSK [JTSK03] / Krovak East North
    zb_off = [0.0]
    def lidar(bounds, w, h, resampling):
        """GUGiK where present, Slovak DMR 5.0 elsewhere (0 = neither), without spikes."""
        from scipy.ndimage import median_filter, distance_transform_edt as edt
        def one(src, t, crs):
            # cut the source down to the target area first (the region's mosaic is ~1 GB)
            tr = Transformer.from_crs(4326, crs, always_xy=True)
            xs, ys = tr.transform([bounds[0], bounds[2], bounds[0], bounds[2]], [bounds[1], bounds[1], bounds[3], bounds[3]])
            c0, r0 = ~t * (min(xs) - 20, max(ys) + 20); c1, r1 = ~t * (max(xs) + 20, min(ys) - 20)
            c0, r0 = max(0, int(c0)), max(0, int(r0)); c1, r1 = min(src.shape[1], int(c1) + 1), min(src.shape[0], int(r1) + 1)
            if c1 - c0 < 2 or r1 - r0 < 2: return np.zeros((h, w), np.float32)
            sub = np.ascontiguousarray(src[r0:r1, c0:c1]); st = t * Affine.translation(c0, r0)
            v = to_local_grid(sub, st, bounds, w, h, resampling, crs=crs)
            # only samples whose whole neighbourhood is valid: interpolating against "no data"
            # (zeros) would dig pits along the edge of each survey
            m = to_local_grid((sub > 100).astype(np.float32), st, bounds, w, h, Resampling.bilinear, crs=crs, nodata=None)
            return np.where(m > 0.999, v, 0)
        a = one(mos, mos_t, 'EPSG:2180')
        if zb is not None:
            b = one(zb[0], zb[1], SK)
            a = np.where(a > 100, a, np.where(b > 100, b + zb_off[0], 0))
        ok = a > 100
        if ok.any() and not ok.all():
            # close the thin seams between the two surveys with the nearest valid height
            d, (ri, ci) = edt(~ok, return_indices=True)
            seam = ~ok & (d < 6)
            a = np.where(seam, a[ri, ci], a)
        # lidar on vertical walls has isolated spikes of tens of metres: replace outliers by the local median
        med = median_filter(a, 5)
        a = np.where((np.abs(a - med) > 4) & (a > 100), med, a)
        return a
    if zb is not None and not photo_only:
        # the two height systems (PL-KRON86-NH, Bpv) differ by under a metre: measure it on the overlap
        bw_ = int(round((ib[2] - ib[0]) / 8)) + 1; bh_ = int(round((ib[3] - ib[1]) / 8)) + 1
        a8 = to_local_grid(mos, mos_t, ll, bw_, bh_, Resampling.average)
        b8 = to_local_grid(zb[0], zb[1], ll, bw_, bh_, Resampling.average, crs=SK)
        both = (a8 > 100) & (b8 > 100)
        zb_off[0] = float(np.median(a8[both] - b8[both])) if both.sum() > 50 else 0.0
        print('ZBGIS height offset', round(zb_off[0], 2), 'm on', int(both.sum()), 'samples')

    # ---- base grid, 4 m
    bw = int(round((ib[2] - ib[0]) / BASE_STEP)) + 1
    bh = int(round((ib[3] - ib[1]) / BASE_STEP)) + 1
    if photo_only:
        blocks = meta['base'].get('blocks', [])
        base = None
    else:
      dtm4 = lidar(ll, bw, bh, Resampling.average)
      cop4 = copernicus(ll, bw, bh)
      base, have = fuse(dtm4, cop4, BASE_STEP)
      print('lidar coverage of the detailed area', round(float(have.mean()), 3))
      # lakes: flat water surface a bit below the shore
      tb = from_bounds(*ll, bw, bh)
      from shapely.geometry import Polygon
      for l in meta['lakes']:
          ring = [lonlat(x, z) for x, z in l['ring']]
          m = rasterize([Polygon(ring)], out_shape=base.shape, transform=tb).astype(bool)
          if not m.any(): continue
          if (m & have).sum() > 0.5 * m.sum():
              # the terrain model has the real water surface: use it
              l['level'] = round(float(np.median(base[m & have])), 2)
          base[m] = np.minimum(base[m], l['level'] - 1.0)
      blocks = []
      if REGION:
          # blocks of BLOCK x BLOCK samples plus one shared row/column, each with its lidar mask
          os.makedirs(os.path.join(DATA, 'base'), exist_ok=True)
          for bj in range(math.ceil((bh - 1) / BLOCK)):
              for bi in range(math.ceil((bw - 1) / BLOCK)):
                  sl = (slice(bj * BLOCK, bj * BLOCK + BLOCK + 1), slice(bi * BLOCK, bi * BLOCK + BLOCK + 1))
                  hb, mb = base[sl], have[sl]
                  pad = ((0, BLOCK + 1 - hb.shape[0]), (0, BLOCK + 1 - hb.shape[1]))
                  hb, mb = np.pad(hb, pad, mode='edge'), np.pad(mb, pad, mode='constant')
                  open(os.path.join(DATA, 'base', f'h_{bi}_{bj}.bin'), 'wb').write(pack_heights(hb, mb))
                  blocks.append([bi, bj])
      else:
          open(os.path.join(DATA, 'inner4.bin'), 'wb').write(pack_heights(base, have))
      print('base', bw, bh, 'max', round(float(base.max()), 1), 'blocks', len(blocks))

    # ---- orthophoto base, 2 m, in 4 quadrants (WMS max 4096 px)
    ow = int(round((ib[2] - ib[0]) / ORTHO_BASE)); oh = int(round((ib[3] - ib[1]) / ORTHO_BASE))
    ortho = np.zeros((oh, ow, 3), dtype=np.float32)
    validq = np.zeros((oh, ow), dtype=bool)
    nq_x, nq_z = math.ceil(ow / 4000), math.ceil(oh / 4000)
    cols = [(ow * k // nq_x, ow * (k + 1) // nq_x) for k in range(nq_x)]
    rows = [(oh * k // nq_z, oh * (k + 1) // nq_z) for k in range(nq_z)]
    for qi, (c0, c1) in enumerate(cols):
        for qj, (r0, r1) in enumerate(rows):
            lon_a = ll[0] + (ll[2] - ll[0]) * c0 / ow; lon_b = ll[0] + (ll[2] - ll[0]) * c1 / ow
            lat_b = ll[3] - (ll[3] - ll[1]) * r0 / oh; lat_a = ll[3] - (ll[3] - ll[1]) * r1 / oh
            o, v = wms_filled(lon_a, lat_a, lon_b, lat_b, c1 - c0, r1 - r0, f'{PFX}base_{qi}{qj}')
            ortho[r0:r1, c0:c1] = o; validq[r0:r1, c0:c1] = v
    valid = validq
    sen = np.asarray(Image.open(os.path.join(DATA, 'inner.sentinel.jpg')).convert('RGB').resize((ow, oh), Image.BICUBIC)).astype(np.float32)
    lum = lambda im: im @ np.array([0.3, 0.55, 0.15], dtype=np.float32)
    def fit_cmap(src, sel):
        # per-channel gain towards Sentinel-2 colours (so shader constants hold)
        # multiplicative only: an offset would crush the dark shadow pixels to zero before they are lifted
        return [(float(sen[..., c][sel].mean() / max(src[..., c][sel].mean(), 1)), 0.0) for c in range(3)]
    def apply_cmap(src, cm):
        return np.stack([src[..., c] * cm[c][0] + cm[c][1] for c in range(3)], -1)
    def shadow_mask(o):
        # cast shadows of the morning flight: much darker than the high-sun Sentinel-2 image (July, 10:00 UTC);
        # dark forest or water is dark in both, so it is left alone
        r = gaussian_filter(lum(o), 2) / np.maximum(gaussian_filter(lum(sen), 3), 1)
        from scipy.ndimage import binary_opening, binary_closing
        from scipy.ndimage import label
        m = (r < 0.62) & valid
        m = binary_closing(binary_opening(m, iterations=1), iterations=2)
        # fill unflagged islands inside shadows (they stay as dark blots) and drop tiny flagged specks
        # (patches in dark forest turn light green)
        def small(x, n):
            lab, k = label(x)
            sizes = np.bincount(lab.ravel())
            return (sizes < n)[lab] & x
        m = m | small(~m & valid, 3000)
        m = m & ~small(m, 400)
        return m & valid
    raw = ortho.copy()
    cmap = fit_cmap(raw, valid)
    m0 = shadow_mask(apply_cmap(raw, cmap))
    cmap = fit_cmap(raw, valid & ~m0)                 # colours fitted on sunlit ground only
    ortho = apply_cmap(raw, cmap)
    shadow = shadow_mask(ortho)
    # inside shadows: brightness and colour from Sentinel-2, fine texture from the orthophoto.
    # Both averages use shadow pixels only, so no bright halos leak across shadow edges.
    def nconv(img, m, sig):
        w = gaussian_filter(m.astype(np.float32), sig)
        return np.stack([gaussian_filter(img[..., c] * m, sig) for c in range(3)], -1) / np.maximum(w, 1e-3)[..., None]
    # one factor for all three channels (per-channel factors copied Sentinel's snow and blue shadow
    # colours into the corries as turquoise and flat green blots), at most 4x
    ls, lo = nconv(sen, shadow, 10) @ np.array([0.3, 0.55, 0.15], np.float32), nconv(ortho, shadow, 10) @ np.array([0.3, 0.55, 0.15], np.float32)
    corr = np.clip(ls / np.maximum(lo, 1.5), 0.8, 4.0)[..., None].repeat(3, -1)
    soft = gaussian_filter(shadow.astype(np.float32), 1.5)[..., None]
    gain = 1 + (corr - 1) * soft                      # also applied to the detailed tiles
    ortho *= gain
    # colour in the shadows: Sentinel-2's (warm granite, green meadow), but only as a hue within ±15 %
    # of grey, so its snow and blue shadows cannot turn the corries turquoise
    W3 = np.array([0.3, 0.55, 0.15], np.float32)
    sc = nconv(sen, shadow, 10)
    hue = np.clip(sc / np.maximum((sc @ W3)[..., None], 1.0), 0.85, 1.15)
    def detint(img, s_, hue_=None):
        h = hue if hue_ is None else hue_
        m = (img @ W3)[..., None]
        own = img / np.maximum(m, 1.0)
        return m * (own + (h - own) * 0.8 * s_)
    ortho = detint(ortho, soft)
    print('shadows equalised on', round(float(shadow.sum() / valid.sum()), 3), 'of the Polish photo')
    # Slovak orthophoto (ÚGKK SR / GKÚ Bratislava, 2025, uploaded to ../zbgis_orto) replaces Sentinel-2
    sk = sk_ortho(ll, ow, oh)
    if sk is not None:
        so, sv_ = sk
        sv_ &= ~valid
        if sv_.sum() > 1000:
            # same kind of mapping as the Polish photo: towards Sentinel-2 colours, slightly more contrast
            for c in range(3):
                o, t = so[..., c][sv_], sen[..., c][sv_]
                a = t.std() * 1.15 / o.std()
                so[..., c] = so[..., c] * a + (t.mean() - a * o.mean())
            ortho = np.where(sv_[..., None], so, ortho)
            valid = valid | sv_
            print('slovak orthophoto on', round(float(sv_.mean()), 3), 'of the area')
    ortho = np.where(valid[..., None], ortho, sen)
    dist = distance_transform_edt(~valid) * ORTHO_BASE
    wgt = np.clip(1 - dist / 60, 0, 1)[..., None]
    fused = np.clip(np.where(valid[..., None], ortho, wgt * gaussian_filter(ortho, (4, 4, 0)) + (1 - wgt) * sen), 0, 255).astype(np.uint8)
    if REGION:
        # photo blocks matching the height blocks: 1024 m, 512 px
        os.makedirs(os.path.join(DATA, 'photo'), exist_ok=True)
        PB = BLOCK * BASE_STEP // ORTHO_BASE
        for bi, bj in blocks:
            im = fused[bj * PB:(bj + 1) * PB, bi * PB:(bi + 1) * PB]
            im = np.pad(im, ((0, PB - im.shape[0]), (0, PB - im.shape[1]), (0, 0)), mode='edge')
            Image.fromarray(im).save(os.path.join(DATA, 'photo', f'o_{bi}_{bj}.jpg'), quality=82, optimize=True)
    else:
        Image.fromarray(fused).save(os.path.join(DATA, 'inner.jpg'), quality=86, optimize=True, progressive=True)

    # ---- detailed tiles near the trail
    if REGION:
        from shapely.geometry import MultiLineString, box as sbox
        from shapely.prepared import prep
        zone = prep(MultiLineString([LineString(l) for l in meta['trails'] if len(l) > 1]).buffer(CORRIDOR))
    else:
        line = LineString(meta['trail'])
    nx = math.ceil((ib[2] - ib[0]) / TILE); nz = math.ceil((ib[3] - ib[1]) / TILE)
    tiles = []
    old_tiles = meta.get('tiles', {}).get('list', [])
    os.makedirs(os.path.join(DATA, 'tiles'), exist_ok=True)
    fused_img = Image.fromarray(fused)
    for j in range(nz):
        for i in range(nx):
            x0 = ib[0] + i * TILE; z0 = ib[1] + j * TILE
            from shapely.geometry import Point
            if REGION:
                if not zone.intersects(sbox(x0, z0, x0 + TILE, z0 + TILE)): continue
            elif line.distance(Point(x0 + TILE / 2, z0 + TILE / 2)) > CORRIDOR: continue
            x1, z1 = x0 + TILE, z0 + TILE
            if x1 > ib[2] or z1 > ib[3]: continue
            tll = (*lonlat(x0, z1), *lonlat(x1, z0))
            if photo_only:
                if [i, j] not in old_tiles: continue
                h = None
            else:
                h = lidar(tll, TILE + 1, TILE + 1, Resampling.bilinear)
            ok = h > 100 if h is not None else None
            if h is not None and ok.mean() < 0.02: continue
            # fill the Slovak part of a border tile from the base grid
            if h is not None and not ok.all():
                gx = (np.arange(TILE + 1) + (x0 - ib[0])) / BASE_STEP
                gz = (np.arange(TILE + 1) + (z0 - ib[1])) / BASE_STEP
                from scipy.ndimage import map_coordinates
                GZ, GX = np.meshgrid(gz, gx, indexing='ij')
                bb = map_coordinates(base, [GZ, GX], order=1)
                h = np.where(ok, h, bb)
            if h is not None: open(os.path.join(DATA, 'tiles', f'h_{i}_{j}.bin'), 'wb').write(pack_heights(h))
            o, ov = wms_filled(*tll, 512, 512, f'{PFX}t_{i}_{j}')
            px0 = (x0 - ib[0]) / ORTHO_BASE; pz0 = (z0 - ib[1]) / ORTHO_BASE
            box = (px0, pz0, px0 + TILE / ORTHO_BASE, pz0 + TILE / ORTHO_BASE)
            o = apply_cmap(o, cmap)
            for c in range(3):
                g = Image.fromarray(gain[..., c].astype(np.float32)).crop(box).resize((512, 512), Image.BILINEAR)
                o[..., c] *= np.asarray(g)
            sg = Image.fromarray(soft[..., 0].astype(np.float32)).crop(box).resize((512, 512), Image.BILINEAR)
            hs = np.stack([np.asarray(Image.fromarray(hue[..., c].astype(np.float32)).crop(box).resize((512, 512), Image.BILINEAR)) for c in range(3)], -1)
            o = detint(o, np.asarray(sg)[..., None], hs)
            # background from the fused base where the tile has no data
            bg = np.asarray(fused_img.crop((px0, pz0, px0 + TILE / ORTHO_BASE, pz0 + TILE / ORTHO_BASE)).resize((512, 512), Image.BICUBIC)).astype(np.float32)
            o = np.where(ov[..., None], o, bg)
            Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(os.path.join(DATA, 'tiles', f'o_{i}_{j}.jpg'), quality=84, optimize=True)
            tiles.append([i, j])
    print('tiles', len(tiles))

    if not photo_only: meta['base'] = {'bounds': ib, 'n': [bw, bh], 'step': BASE_STEP, **({'block': BLOCK, 'blocks': blocks} if REGION else {})}
    meta['tiles'] = {'size': TILE, 'origin': ib[:2], 'list': tiles, 'samples': TILE + 1, 'orthoPx': 512}
    if 'GUGiK' not in meta['sources']: meta['sources'] += '; GUGiK: NMT 1 m, ortofotomapa (geoportal.gov.pl)'
    if zb is not None and 'ÚGKK' not in meta['sources']: meta['sources'] += '; Zdroj produktov LLS: ÚGKK SR (DMR 5.0, CC BY 4.0)'
    if sk is not None and 'NLC' not in meta['sources']: meta['sources'] += '; ortofotomozaika SR: GKÚ Bratislava, NLC'
    json.dump(meta, open(os.path.join(DATA, 'meta.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    print('done')

if __name__ == '__main__':
    main()
