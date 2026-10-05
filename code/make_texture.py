#!/usr/bin/env python3
"""
Signature Earth texture pipeline — "Signature binary" transform.

SOURCE (public domain, never scraped proprietary tiles):
  NASA Blue Marble Next Generation (2004), Visible Earth / NASA GSFC
  "world.topo.bathy.200412.3x5400x2700.jpg" — science satellite imagery,
  public domain. Downloaded once to /tmp/bluemarble.jpg; this script reads
  the path given as argv[1] (or the default below).

TRANSFORM (original, deterministic, reproducible):
  1. Resize to 2048x1024 equirectangular (LANCZOS).
  2. Gentle Signature grade: saturation x1.06, contrast x1.02 (true colors kept).
  3. Binary grain: ordered Bayer-8 dither on luminance, amplitude +/-5.
  4. Signature bit veil: Manon's own 144-bit Signature mark (12x12 grid, from
     signature-math — 13 ones, 131 zeros) tiled across the texture in 32px
     cells; cells holding a 1 get a faint warm-gold lift, 0-cells untouched.
     Subliminal, geographically faithful, legally distinct.

Output: assets/earth-texture.png (2048x1024 RGB), loaded by js/globe.js
via THREE.TextureLoader. Re-run: python3 code/make_texture.py /tmp/bluemarble.jpg
"""
import sys, os
from PIL import Image, ImageEnhance

W, H = 2048, 1024
SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/bluemarble.jpg"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "assets", "earth-texture.png")

# Manon's 144-bit Signature mark (12x12, from signature-math canonical grid)
BITS = ("000000000000"
        "000000000000"
        "000000000000"
        "000000000000"
        "000000011100"
        "001111011000"
        "001000100000"
        "010001000000"
        "000000000000"
        "000000000000"
        "000000000000"
        "000000000000")
assert len(BITS) == 144 and BITS.count("1") == 13

# Bayer 8x8 ordered-dither matrix (values 0..63)
BAYER = [[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],
         [12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],
         [3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],
         [15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]]

def main():
    img = Image.open(SRC).convert("RGB").resize((W, H), Image.LANCZOS)
    img = ImageEnhance.Color(img).enhance(1.06)
    img = ImageEnhance.Contrast(img).enhance(1.02)
    px = img.load()

    # 3. binary grain on luminance
    for y in range(H):
        row = BAYER[y % 8]
        for x in range(W):
            r, g, b = px[x, y]
            v = int((row[x % 8] / 63.0 - 0.5) * 10)  # +/-5
            px[x, y] = (max(0, min(255, r + v)),
                        max(0, min(255, g + v)),
                        max(0, min(255, b + v)))

    # 4. signature bit veil: 12x12 bit grid tiled in 32px cells, faint gold lift on 1s
    CELL = 32
    for gy in range(H // CELL):
        for gx in range(W // CELL):
            if BITS[(gy % 12) * 12 + (gx % 12)] == "1":
                for dy in range(CELL):
                    for dx in range(CELL):
                        x, y = gx * CELL + dx, gy * CELL + dy
                        r, g, b = px[x, y]
                        # ~10% blend toward warm gold (255, 196, 110)
                        px[x, y] = (int(r * 0.90 + 255 * 0.10),
                                    int(g * 0.90 + 196 * 0.10),
                                    int(b * 0.90 + 110 * 0.10))

    img.save(OUT)
    print("wrote", OUT, img.size, os.path.getsize(OUT), "bytes")

if __name__ == "__main__":
    main()
