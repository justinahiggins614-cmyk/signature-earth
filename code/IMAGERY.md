# Signature Earth imagery — provenance & transform

## Source (public domain — never scraped proprietary tiles)
NASA Blue Marble Next Generation (2004), NASA Goddard Space Flight Center /
Visible Earth: `world.topo.bathy.200412.3x5400x2700.jpg` — science satellite
imagery, public domain. This is the geographic truth layer: every continent,
coastline, and ocean is exactly where the satellites saw it ("exactly same").

## The Signature-binary transform (original — "legally different")
`code/make_texture.py` (deterministic, reproducible — re-run it any time):
1. Resize to 2048×1024 equirectangular (LANCZOS).
2. Gentle Signature grade: saturation ×1.06, contrast ×1.02 (true colors kept).
3. **Binary grain** — ordered Bayer-8 dither on luminance (±5): the Signature
   binary micro-texture.
4. **Signature bit veil** — Manon's own 144-bit Signature mark (the 12×12
   canonical grid from signature-math: 13 ones, 131 zeros) tiled across the
   texture in 32px cells; cells holding a 1 get a faint warm-gold lift.
   Subliminal, geographically faithful, unmistakably his.

Output: `assets/earth-texture.png` (2048×1024 RGB PNG), loaded by
`js/globe.js` via `THREE.TextureLoader` (replaces the canvas fallback).

## What this is NOT
- No Google Earth / Google Maps tiles, ever (proprietary — never scraped).
- The old `code/build_texture.py` generated a stylized cartoon texture from
  Natural Earth polygons; it is superseded by this pipeline and kept only
  as the documented stylized-fallback generator.

Place data: GeoNames open gazetteer (CC-BY 4.0). Not affiliated with Google
or Google Earth.
