/* Signature Earth — satellite close-up card (globe page).
 * A live 2D house-level satellite view inside the place card on globe.html,
 * reusing the map.html tile stack (same legal sources, same attribution):
 *   z3-14 : EOX Sentinel-2 cloudless 2020 (Copernicus, free w/ attribution)
 *   z15-19: USDA NAIP aerial via USGS WMS (public domain, US only;
 *           honest assets/no-aerial.png tile elsewhere)
 * The globe texture (4096px = ~10km/px) can never resolve houses — this
 * mini-map is what delivers the "like the image" satellite experience.
 */
(function () {
'use strict';
var map = null, pin = null, el = null;

function ensureLeaflet() {
  return !!window.L;
}

function buildMap(host, la, lo) {
  map = L.map(host, { zoomControl: false, worldCopyJump: true, zoomSnap: 0.5, maxZoom: 19, scrollWheelZoom: false })
    .setView([la, lo], 17);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg', {
    minZoom: 3, maxZoom: 14, maxNativeZoom: 14, tileSize: 256,
    attribution: 'Sentinel-2 cloudless &copy; <a href="https://s2maps.eu">EOX</a> / Copernicus'
  }).addTo(map);
  L.tileLayer.wms('https://basemap.nationalmap.gov/arcgis/services/USGSImageryOnly/MapServer/WMSServer', {
    layers: '0', format: 'image/jpeg', transparent: false, version: '1.3.0',
    minZoom: 15, maxZoom: 19, maxNativeZoom: 19, tileSize: 256,
    errorTileUrl: 'assets/no-aerial.png',
    attribution: 'USDA NAIP via USGS The National Map (public domain)'
  }).addTo(map);
}

window.SatCloseup = {
  /* Render the close-up into hostEl (a div inside the card) centered on la,lo. */
  show: function (hostEl, la, lo, label) {
    el = hostEl;
    if (!ensureLeaflet()) {
      hostEl.innerHTML = '<p style="color:#9fb3e8">Satellite view could not load — open the <a href="map.html" style="color:#d4a017">Map tab</a> instead.</p>';
      return;
    }
    hostEl.innerHTML = '';
    if (!map) {
      buildMap(hostEl, la, lo);
    } else {
      if (!map.getContainer().isConnected) { map = null; buildMap(hostEl, la, lo); }
      else { map.setView([la, lo], 17); }
    }
    if (pin) { map.removeLayer(pin); pin = null; }
    pin = L.marker([la, lo], { title: label || 'Pinned spot' }).addTo(map);
    setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 60);
  },
  hide: function () { el = null; if (pin && map) { map.removeLayer(pin); pin = null; } }
};
})();
