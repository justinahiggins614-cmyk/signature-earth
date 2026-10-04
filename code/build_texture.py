# Build a stylized "Signature cartography" equirectangular texture for the 3D globe.
# Land polygons: Natural Earth 110m (public domain). Output: assets/earth-texture.png
import json, math, random
from PIL import Image, ImageDraw

W, H = 2048, 1024
random.seed(7)

def proj(lon, lat):
    x = (lon + 180.0) / 360.0 * W
    y = (90.0 - lat) / 180.0 * H
    return x, y

img = Image.new('RGB', (W, H))
px = img.load()
# ocean: deep blue gradient, darker at poles
for y in range(H):
    t = y / H
    depth = 1.0 - abs(t - 0.5) * 0.7
    r = int(10 * depth); g = int(32 * depth); b = int(74 * depth + 18)
    for x in range(W):
        px[x, y] = (r, g, b)
# subtle ocean noise
for _ in range(9000):
    x = random.randrange(W); y = random.randrange(H)
    r, g, b = px[x, y]
    v = random.randint(-6, 6)
    px[x, y] = (max(0, r + v), max(0, g + v), max(0, b + v))

d = ImageDraw.Draw(img, 'RGBA')

def norm_ring(ring):
    # handle antimeridian: shift lons so ring is contiguous
    lons = [c[0] for c in ring]
    if max(lons) - min(lons) > 180:
        ring = [(c[0] + 360 if c[0] < 0 else c[0], c[1]) for c in ring]
    pts = []
    for lon, lat in ring:
        x, y = proj(lon, lat)
        pts.append((x % W, y))
    return pts

with open('/tmp/ne_land.geojson') as f:
    gj = json.load(f)
count = 0
for feat in gj['features']:
    geom = feat['geometry']
    polys = []
    if geom['type'] == 'Polygon':
        polys = [geom['coordinates']]
    elif geom['type'] == 'MultiPolygon':
        polys = geom['coordinates']
    for poly in polys:
        for ring in poly:
            pts = norm_ring(ring)
            if len(pts) > 2:
                d.polygon(pts, fill=(198, 156, 74, 255))
                count += 1
# land edge stroke for definition (draw again as outline)
for feat in gj['features']:
    geom = feat['geometry']
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates'] if geom['type'] == 'MultiPolygon' else []
    for poly in polys:
        for ring in poly:
            pts = norm_ring(ring)
            if len(pts) > 2:
                d.line(pts + [pts[0]], fill=(120, 88, 40, 255), width=2)
# land grain
for _ in range(6000):
    x = random.randrange(W); y = random.randrange(H)
    if px[x, y][0] > 100:  # on land
        r, g, b = px[x, y]
        v = random.randint(-14, 14)
        px[x, y] = (r + v, g + v, b + v)
# ice caps
for y in range(H):
    lat = 90 - (y / H) * 180
    if abs(lat) > 66:
        alpha = min(1.0, (abs(lat) - 66) / 10.0)
        for x in range(W):
            r, g, b = px[x, y]
            if r > 100:  # land ice
                px[x, y] = (int(r + (235 - r) * alpha), int(g + (242 - g) * alpha), int(b + (248 - b) * alpha))
            else:  # sea ice fringe
                px[x, y] = (int(r + (200 - r) * alpha * 0.7), int(g + (220 - g) * alpha * 0.7), int(b + (235 - b) * alpha * 0.7))
# graticule every 20 degrees
for lon in range(-180, 180, 20):
    x, _ = proj(lon, 0)
    d.line([(x, 0), (x, H)], fill=(255, 255, 255, 28), width=1)
for lat in range(-80, 81, 20):
    _, y = proj(0, lat)
    d.line([(0, y), (W, y)], fill=(255, 255, 255, 28), width=1)

img.save('/home/hatch/workspace/signature-earth/assets/earth-texture.png')
print('polygons drawn:', count)
import os
print('bytes:', os.path.getsize('/home/hatch/workspace/signature-earth/assets/earth-texture.png'))
