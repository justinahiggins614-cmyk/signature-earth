#!/usr/bin/env python3
"""
Signature Earth tile + data builder.

Builds everything the Map mode needs from legally-clean sources:
  1. assets/tiles/sig/{z}/{x}/{y}.png  — Manon's Signature-binary texture,
     reprojected equirectangular -> Web Mercator, z0-z2 (21 tiles).
     Source: assets/earth-texture.png (NASA Blue Marble NG, public domain,
     Signature-binary transform — see code/make_texture.py).
  2. assets/elevation.png — 512x256 equirectangular elevation grid (grayscale:
     0 = -500 m, 255 = 9000 m), decoded from Mapzen Terrarium tiles
     (SRTM/ETOPO public-domain data, AWS Open Data). Drives 3D terrain +
     scientist scans.
  3. assets/tiles/hill/{z}/{x}/{y}.png — hillshade overlay tiles z0-z2
     (semi-transparent black), baked from the same elevation grid.
  4. assets/no-aerial.png — honest "no deep aerial imagery here" tile used as
     Leaflet errorTileUrl outside US coverage.
  5. data/borders.geojson — Natural Earth 110m admin-0 countries, simplified
     (name only, coords rounded), public domain.

Re-run: python3 code/make_tiles.py
"""
import os, sys, math, json, io
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = 256  # tile size

# ---------------------------------------------------------------- textures
def load_src():
    p = os.path.join(ROOT, "assets", "earth-texture.png")
    im = Image.open(p).convert("RGB")
    return np.asarray(im).astype(np.float32), im.width, im.height

def merc_lat(y, z, j):
    """latitude (deg) of pixel row j in web-mercator tile (z, y)."""
    n = 2 ** z
    my_top = math.pi * (1 - 2 * y / n)
    my_bot = math.pi * (1 - 2 * (y + 1) / n)
    my = my_top + (j + 0.5) / T * (my_bot - my_top)
    return math.degrees(math.atan(math.sinh(my)))

def build_sig_tiles():
    src, sw, sh = load_src()
    out = os.path.join(ROOT, "assets", "tiles", "sig")
    n_tiles = 0
    for z in range(0, 3):
        n = 2 ** z
        jj, ii = np.mgrid[0:T, 0:T].astype(np.float64)
        for x in range(n):
            lon_l, lon_r = x / n * 360 - 180, (x + 1) / n * 360 - 180
            lon = lon_l + (ii + 0.5) / T * (lon_r - lon_l)
            # vectorized latitude via mercator
            my_top = math.pi * (1 - 2 * 0 / n)  # placeholder, computed per y below
            for y in range(n):
                my_top = math.pi * (1 - 2 * y / n)
                my_bot = math.pi * (1 - 2 * (y + 1) / n)
                my = my_top + (jj + 0.5) / T * (my_bot - my_top)
                lat = np.degrees(np.arctan(np.sinh(my)))
                sx = (lon + 180) / 360 * sw - 0.5
                sy = (90 - lat) / 180 * sh - 0.5
                sx = np.clip(sx, 0, sw - 1.001); sy = np.clip(sy, 0, sh - 1.001)
                x0, y0 = sx.astype(int), sy.astype(int)
                fx, fy = sx - x0, sy - y0
                tile = (src[y0, x0] * (1 - fx)[..., None] * (1 - fy)[..., None] +
                        src[y0, np.minimum(x0 + 1, sw - 1)] * fx[..., None] * (1 - fy)[..., None] +
                        src[np.minimum(y0 + 1, sh - 1), x0] * (1 - fx)[..., None] * fy[..., None] +
                        src[np.minimum(y0 + 1, sh - 1), np.minimum(x0 + 1, sw - 1)] * fx[..., None] * fy[..., None])
                d = os.path.join(out, str(z), str(x)); os.makedirs(d, exist_ok=True)
                Image.fromarray(tile.astype(np.uint8)).save(os.path.join(d, "%d.png" % y))
                n_tiles += 1
    print("sig tiles:", n_tiles)

# ---------------------------------------------------------------- elevation
def fetch_terrarium():
    import urllib.request
    z = 2; n = 4; size = n * T
    grid = np.zeros((size, size), np.float32)
    for x in range(n):
        for y in range(n):
            url = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png" % (z, x, y)
            with urllib.request.urlopen(url, timeout=40) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGB")
            a = np.asarray(im).astype(np.float32)
            grid[y*T:(y+1)*T, x*T:(x+1)*T] = a[..., 0]*256 + a[..., 1] + a[..., 2]/256 - 32768
    return grid  # 1024x1024 web-mercator meters

def build_elevation():
    grid = fetch_terrarium()  # mercator 1024x1024
    W, H = 512, 256
    ii, jj = np.mgrid[0:H, 0:W].astype(np.float64)
    lon = (jj + 0.5) / W * 360 - 180
    lat = 90 - (ii + 0.5) / H * 180
    lat_r = np.radians(np.clip(lat, -85.05, 85.05))
    mx = np.radians(lon)
    my = np.log(np.tan(math.pi/4 + lat_r/2))
    px = (mx + math.pi) / (2*math.pi) * 1024 - 0.5
    py = (math.pi - my) / (2*math.pi) * 1024 - 0.5
    px = np.clip(px, 0, 1022.999); py = np.clip(py, 0, 1022.999)
    x0, y0 = px.astype(int), py.astype(int)
    fx, fy = px - x0, py - y0
    el = (grid[y0, x0]*(1-fx)*(1-fy) + grid[y0, x0+1]*fx*(1-fy) +
          grid[y0+1, x0]*(1-fx)*fy + grid[y0+1, x0+1]*fx*fy)
    v = np.clip((el + 500) / 9500, 0, 1)
    Image.fromarray((v*255).astype(np.uint8)).save(os.path.join(ROOT, "assets", "elevation.png"))
    print("elevation.png written")
    return grid

def build_hillshade(grid):
    # grid: 1024x1024 mercator meters; simple NW-light hillshade
    dzdx = np.gradient(grid, axis=1); dzdy = np.gradient(grid, axis=0)
    # meters per pixel at zoom 2 ~ 39100; exaggerate for visible shading
    cell = 39100.0
    slope = np.arctan(np.hypot(dzdx, dzdy) / cell)
    aspect = np.arctan2(-dzdx, dzdy)
    az, zen = math.radians(315), math.radians(45)
    shade = (math.cos(zen)*np.cos(slope) +
             math.sin(zen)*np.sin(slope)*np.cos(az - aspect))
    shade = np.clip(shade, 0, 1)
    alpha = ((1 - shade) * 150).astype(np.uint8)
    out = os.path.join(ROOT, "assets", "tiles", "hill")
    n_tiles = 0
    for z in range(0, 3):
        f = 2 ** (2 - z)  # downsample factor from z2 grid
        for x in range(2 ** z):
            for y in range(2 ** z):
                a = alpha[y*f*T:(y+1)*f*T, x*f*T:(x+1)*f*T]
                if f > 1:
                    a = np.asarray(Image.fromarray(a).resize((T, T), Image.BILINEAR))
                rgba = np.zeros((T, T, 4), np.uint8)
                rgba[..., 3] = a
                d = os.path.join(out, str(z), str(x)); os.makedirs(d, exist_ok=True)
                Image.fromarray(rgba).save(os.path.join(d, "%d.png" % y))
                n_tiles += 1
    print("hill tiles:", n_tiles)

# ---------------------------------------------------------------- honest tile
def build_no_aerial():
    im = Image.new("RGB", (T, T), (10, 16, 32))
    d = ImageDraw.Draw(im)
    for i in range(0, T, 32):
        d.line([(i, 0), (i, T)], fill=(20, 28, 52)); d.line([(0, i), (T, i)], fill=(20, 28, 52))
    d.rectangle([28, 88, 228, 168], outline=(212, 160, 23), width=2)
    d.text((128, 112), "No deep aerial", fill=(212, 160, 23), anchor="mm")
    d.text((128, 132), "imagery here yet", fill=(212, 160, 23), anchor="mm")
    im.save(os.path.join(ROOT, "assets", "no-aerial.png"))
    print("no-aerial.png written")

# ---------------------------------------------------------------- borders
def rnd(o):
    if isinstance(o, float): return round(o, 2)
    if isinstance(o, list): return [rnd(v) for v in o]
    return o

def build_borders():
    src = os.path.join(ROOT, "data", "ne_countries_110m.geojson")
    with open(src, encoding="utf-8") as f:
        gj = json.load(f)
    feats = []
    for ft in gj["features"]:
        p = ft.get("properties", {})
        name = p.get("ADMIN") or p.get("NAME") or "Unknown"
        feats.append({"type": "Feature",
                      "properties": {"name": name},
                      "geometry": {"type": ft["geometry"]["type"],
                                   "coordinates": rnd(ft["geometry"]["coordinates"])}})
    out = {"type": "FeatureCollection", "features": feats}
    dst = os.path.join(ROOT, "data", "borders.geojson")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print("borders.geojson: %d features, %d bytes" % (len(feats), os.path.getsize(dst)))

if __name__ == "__main__":
    build_sig_tiles()
    grid = build_elevation()
    build_hillshade(grid)
    build_no_aerial()
    build_borders()
    print("tile build complete")
