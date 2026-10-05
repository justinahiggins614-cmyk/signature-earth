#!/usr/bin/env python3
"""
Satellite texture for Signature Earth globe view ("Satellite" mode).

SOURCE (public domain, never scraped proprietary tiles):
  NASA Blue Marble Next Generation (2004), NASA Goddard Space Flight Center /
  Visible Earth: "world.topo.bathy.200412.3x5400x2700.jpg" — the SAME source
  as the Signature-binary globe texture (see code/make_texture.py).

TRANSFORM: NONE beyond resize — this is the natural-color satellite view,
exactly as the satellites saw it. No binary grain, no bit veil, no color
grade. That is the whole point of Satellite mode: "like the image."

Output: assets/earth-satellite.jpg (4096x2048 RGB JPEG, quality 85), loaded
on demand by js/globe.js when the user taps the Satellite pill. The Signature
(binary) texture stays the default.

Re-run: python3 code/make_satellite_texture.py code/.src/bluemarble.jpg
"""
import sys, os
from PIL import Image

W, H = 4096, 2048
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "code", ".src", "bluemarble.jpg")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "assets", "earth-satellite.jpg")

def main():
    img = Image.open(SRC).convert("RGB").resize((W, H), Image.LANCZOS)
    img.save(OUT, "JPEG", quality=85, progressive=True)
    print("wrote", OUT, img.size, os.path.getsize(OUT), "bytes")

if __name__ == "__main__":
    main()
