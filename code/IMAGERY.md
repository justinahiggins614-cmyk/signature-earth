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

## The Satellite texture (2026-10-05, "Satellite" globe mode)
`code/make_satellite_texture.py` (deterministic, reproducible — re-run it any
time): resizes the SAME Blue Marble NG source to 4096×2048 equirectangular
(LANCZOS) with NO binary grain, NO bit veil, NO color grade — natural-color
satellite imagery, exactly as the satellites saw it.

Output: `assets/earth-satellite.jpg` (4096×2048 RGB JPEG, progressive,
quality 85, ~1.1MB). Loaded ON DEMAND by `js/globe.js` when the user taps
the 🛰 Satellite pill (Signature stays the default; choice persists in
localStorage). If the JPG fails to load, the globe falls back to the
Signature texture — never a blank globe.

Why a globe texture can't show houses: 4096px across the whole planet is
~10km/px. The house-level "like the image" experience comes from the
Satellite-view close-up card (js/satcloseup.js): a live 2D mini-map on the
same page reusing the map.html tile stack — EOX Sentinel-2 z3–14,
USGS NAIP WMS z15–19 (public domain, US only) with the honest
`assets/no-aerial.png` tile elsewhere.

## What this is NOT
- No Google Earth / Google Maps tiles, ever (proprietary — never scraped).
- The old `code/build_texture.py` generated a stylized cartoon texture from
  Natural Earth polygons; it is superseded by this pipeline and kept only
  as the documented stylized-fallback generator.

Place data: GeoNames open gazetteer (CC-BY 4.0). Not affiliated with Google
or Google Earth.
