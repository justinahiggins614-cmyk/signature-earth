/* Signature Earth — Map mode (MapQuest-style 2D slippy map, house-level zoom).
 * Leaflet 1.9.4 vendored in assets/leaflet (no CDN dependency).
 * Layers (all legally clean, attributed on-map):
 *   z0-2 : Manon's own Signature-binary texture tiles (assets/tiles/sig)
 *   z3-14: Sentinel-2 cloudless 2020 via EOX (Copernicus, free w/ attribution)
 *   z15-19: USDA NAIP aerial via USGS The National Map (public domain, US only;
 *           honest no-aerial tile elsewhere via errorTileUrl)
 * Overlays: country borders + labels (Natural Earth, public domain),
 *           hillshade (own tiles), timelapse (NASA GIBS MODIS Terra, time-enabled).
 */
(function () {
'use strict';
if (!window.L) {
  document.getElementById('mapmsg').style.display = 'flex';
  document.getElementById('mapmsg').innerHTML = '🗺 The map engine could not load.<br><small>Check your connection and reload — or try the <a href="globe.html" style="color:#d4a017">3D globe</a>.</small>';
  return;
}
var D2R = Math.PI / 180, R2D = 180 / Math.PI, R = 6371000;
function havKm(a, b) {
  var dLa = (b.la - a.la) * D2R, dLo = (b.lo - a.lo) * D2R;
  var s = Math.sin(dLa / 2), t = Math.sin(dLo / 2);
  var h = s * s + Math.cos(a.la * D2R) * Math.cos(b.la * D2R) * t * t;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function ringAreaM2(lls) { // Chamberlain-Duquette spherical excess, lls=[[lat,lng]...]
  var a = 0;
  for (var i = 0; i < lls.length; i++) {
    var p1 = lls[i], p2 = lls[(i + 1) % lls.length];
    a += (p2[1] - p1[1]) * D2R * (2 + Math.sin(p1[0] * D2R) + Math.sin(p2[0] * D2R));
  }
  return Math.abs(a * R * R / 2);
}
function fmtDist(km) {
  if (km < 1) return Math.round(km * 1000) + ' m';
  if (km < 100) return km.toFixed(1) + ' km';
  return Math.round(km).toLocaleString('en-US') + ' km';
}
function fmtArea(m2) {
  if (m2 < 1e6) return Math.round(m2).toLocaleString('en-US') + ' m²';
  return (m2 / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' km²';
}

var map = L.map('map', { zoomControl: false, worldCopyJump: true, zoomSnap: 0.5, maxZoom: 19 }).setView([22, 8], 2.5);
L.control.zoom({ position: 'topright' }).addTo(map);

var sigTiles = L.tileLayer('assets/tiles/sig/{z}/{x}/{y}.png', {
  minZoom: 0, maxZoom: 2, maxNativeZoom: 2, tileSize: 256,
  attribution: 'Signature texture: NASA Visible Earth (public domain) + Signature-binary transform'
});
var eoxTiles = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg', {
  minZoom: 3, maxZoom: 14, maxNativeZoom: 14, tileSize: 256, crossOrigin: true,
  attribution: 'Sentinel-2 cloudless &copy; <a href="https://s2maps.eu">EOX</a> / Copernicus'
});
/* NAIP via the WMS renderer (not the cached tile endpoint, which stops at z16):
 * this serves native 1 m aerial photography at any zoom — genuinely house-level.
 * Public domain (USDA NAIP via USGS The National Map). */
var naipTiles = L.tileLayer.wms('https://basemap.nationalmap.gov/arcgis/services/USGSImageryOnly/MapServer/WMSServer', {
  layers: '0', format: 'image/jpeg', transparent: false, version: '1.3.0',
  minZoom: 15, maxZoom: 19, maxNativeZoom: 19, tileSize: 256, crossOrigin: true,
  errorTileUrl: 'assets/no-aerial.png',
  attribution: 'USDA NAIP via USGS The National Map (public domain)'
});
sigTiles.addTo(map); eoxTiles.addTo(map); naipTiles.addTo(map);

// hillshade overlay (own tiles, z0-2)
var hillTiles = L.tileLayer('assets/tiles/hill/{z}/{x}/{y}.png', {
  minZoom: 0, maxZoom: 2, maxNativeZoom: 2, tileSize: 256, opacity: 0.85
});

// borders + labels (Natural Earth, public domain)
var bordersLayer = null, labelsLayer = null, bordersOn = false, labelsOn = false;
function ensureBorders() {
  if (bordersLayer) return Promise.resolve();
  return fetch('data/borders.geojson').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (gj) {
    bordersLayer = L.geoJSON(gj, {
      style: { color: '#d4a017', weight: 1.2, opacity: 0.85, fill: false, interactive: false }
    });
    var pts = [];
    gj.features.forEach(function (f) {
      var coords = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      var big = coords[0], best = null, bestLen = 0;
      coords.forEach(function (poly) {
        var ring = poly[0], minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        ring.forEach(function (c) {
          if (c[0] < minx) minx = c[0]; if (c[0] > maxx) maxx = c[0];
          if (c[1] < miny) miny = c[1]; if (c[1] > maxy) maxy = c[1];
        });
        var w = (maxx - minx) * (maxy - miny);
        if (w > bestLen) { bestLen = w; best = [(miny + maxy) / 2, (minx + maxx) / 2]; }
      });
      if (best) pts.push({ n: f.properties.name, ll: best });
    });
    labelsLayer = L.layerGroup(pts.map(function (p) {
      return L.marker(p.ll, {
        icon: L.divIcon({ className: 'ctylabel', html: SE.esc(p.n), iconSize: null }),
        interactive: false, keyboard: false
      });
    }));
  });
}
function setBorders(on) {
  bordersOn = on;
  ensureBorders().then(function () {
    if (on) bordersLayer.addTo(map); else map.removeLayer(bordersLayer);
  }).catch(function () {});
}
function setLabels(on) {
  labelsOn = on;
  ensureBorders().then(function () {
    if (on) labelsLayer.addTo(map); else map.removeLayer(labelsLayer);
  }).catch(function () {});
}
function setHillshade(on) {
  if (on) hillTiles.addTo(map); else map.removeLayer(hillTiles);
}

// ---------- timelapse (NASA GIBS MODIS Terra true color, 2001-2024) ----------
var timeLayer = null, timeOn = false, timeYear = 2020, timeTimer = null;
function timeUrl(y) {
  return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/' +
    y + '-06-15/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg';
}
function setTimelapse(on) {
  timeOn = on;
  var ctl = document.getElementById('timectl');
  if (on) {
    if (!timeLayer) {
      timeLayer = L.tileLayer(timeUrl(timeYear), {
        minZoom: 0, maxZoom: 13, maxNativeZoom: 9, tileSize: 256, crossOrigin: true,
        attribution: 'MODIS Terra &copy; NASA GIBS (public domain)'
      });
    }
    timeLayer.addTo(map);
    map.removeLayer(sigTiles); map.removeLayer(eoxTiles); map.removeLayer(naipTiles);
    ctl.style.display = 'flex';
    document.getElementById('timeyear').textContent = timeYear;
    document.getElementById('timeslider').value = timeYear;
  } else {
    if (timeLayer) map.removeLayer(timeLayer);
    sigTiles.addTo(map); eoxTiles.addTo(map); naipTiles.addTo(map);
    ctl.style.display = 'none';
    stopTimePlay();
  }
  var b = document.getElementById('btnTime'); if (b) b.classList.toggle('on', on);
}
function stopTimePlay() {
  if (timeTimer) { clearInterval(timeTimer); timeTimer = null; }
  var b = document.getElementById('btnTimePlay'); if (b) b.textContent = '▶ Play years';
}
document.getElementById('timeslider').addEventListener('input', function (e) {
  timeYear = +e.target.value;
  document.getElementById('timeyear').textContent = timeYear;
  if (timeLayer) timeLayer.setUrl(timeUrl(timeYear));
  stopTimePlay();
});
document.getElementById('btnTimePlay').onclick = function () {
  if (timeTimer) { stopTimePlay(); return; }
  this.textContent = '⏸ Pause';
  timeTimer = setInterval(function () {
    timeYear = timeYear >= 2024 ? 2001 : timeYear + 1;
    document.getElementById('timeslider').value = timeYear;
    document.getElementById('timeyear').textContent = timeYear;
    if (timeLayer) timeLayer.setUrl(timeUrl(timeYear));
  }, 1400);
};

// ---------- coordinates readout ----------
var coordsEl = document.getElementById('coords');
map.on('mousemove', function (e) {
  coordsEl.textContent = SE.fmtCoords(e.latlng.lat, e.latlng.lng);
});
map.on('click', function (e) {
  coordsEl.textContent = SE.fmtCoords(e.latlng.lat, e.latlng.lng);
});

// ---------- pins + place card ----------
var pin = null, pinRec = null;
var card = document.getElementById('card');
function dropPin(la, lo, rec) {
  if (pin) map.removeLayer(pin);
  pinRec = rec || null;
  pin = L.marker([la, lo], { title: rec ? rec.n : 'Pinned spot' }).addTo(map);
  if (rec) openCard(rec);
}
function openCard(rec) {
  document.getElementById('cardName').textContent = '📍 ' + rec.n;
  var meta = SE.esc(rec.c || '') + '<br>' + SE.esc(SE.fmtCoords(rec.la, rec.lo));
  if (rec.p) meta += ' · 👥 ' + SE.fmtPop(rec.p);
  document.getElementById('cardMeta').innerHTML = meta;
  card.classList.add('open');
}
document.getElementById('cardClose').onclick = function () { card.classList.remove('open'); JAHaudio.stop(); };
document.getElementById('cardRead').onclick = function () { if (pinRec) JAHaudio.speak(SE.placeText(pinRec)); };
document.getElementById('cardCopy').onclick = function () {
  if (pinRec) SE.copyText(SE.placeText(pinRec) + ' See it: ' + location.origin + location.pathname + '#ll=' + pinRec.la.toFixed(4) + ',' + pinRec.lo.toFixed(4), document.getElementById('cardCopy'));
};
document.getElementById('cardStand').onclick = function () {
  if (!pin) return;
  var ll = pin.getLatLng();
  map.flyTo(ll, 18, { duration: 1.6 });
  JAHaudio.speak('Standing here. This is the deepest clean aerial view available for this spot.');
};
function rowToRec(r) { return { id: r[6], n: r[0], la: r[1], lo: r[2], c: r[3], p: r[5] }; }

// ---------- search: gazetteer first, Nominatim for addresses ----------
var indexRows = null, indexP = null;
function ensureIndex() {
  if (indexRows) return Promise.resolve(indexRows);
  if (indexP) return indexP;
  indexP = SE.fetchGz('data/index/names.json.gz').then(function (r) { indexRows = r; indexP = null; return r; })
    .catch(function (e) { indexP = null; throw e; });
  return indexP;
}
var searchInput = document.getElementById('search'), suggest = document.getElementById('suggest'), lastResults = [];
function renderSuggest(items) {
  suggest.innerHTML = '';
  if (!items.length) {
    suggest.innerHTML = '<button class="srow" data-addr="1">🌐 No named place — search street addresses…</button>';
  } else {
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'srow';
      b.innerHTML = '<b>' + SE.esc(it.label) + '</b> <span>' + SE.esc(it.sub || '') + '</span>';
      b.onclick = function () { pickResult(it); };
      suggest.appendChild(b);
    });
  }
  suggest.style.display = 'block';
}
function pickResult(it) {
  suggest.style.display = 'none';
  searchInput.value = it.label;
  dropPin(it.la, it.lo, { n: it.label, la: it.la, lo: it.lo, c: it.sub, p: it.pop });
  map.flyTo([it.la, it.lo], it.zoom || 11, { duration: 1.8 });
  if (it.kind === 'address') JAHaudio.speak('Found it. ' + it.label);
}
searchInput.addEventListener('input', function () {
  var q = searchInput.value.trim().toLowerCase();
  if (q.length < 2) { suggest.style.display = 'none'; return; }
  suggest.innerHTML = '<button class="srow" disabled>Loading…</button>';
  suggest.style.display = 'block';
  ensureIndex().then(function (rows) {
    var out = [];
    for (var i = 0; i < rows.length && out.length < 8; i++) {
      if (rows[i][0].toLowerCase().indexOf(q) === 0)
        out.push({ kind: 'place', label: rows[i][0], sub: rows[i][3], la: rows[i][1], lo: rows[i][2], pop: rows[i][5], zoom: 10 });
    }
    lastResults = out;
    renderSuggest(out);
    var ab = suggest.querySelector('[data-addr]');
    if (ab) ab.onclick = function () { addressSearch(searchInput.value.trim()); };
  }).catch(function () { suggest.innerHTML = '<button class="srow" disabled>Place data failed to load.</button>'; });
});
function addressSearch(q) {
  suggest.innerHTML = '<button class="srow" disabled>🌐 Searching addresses…</button>';
  fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(q), {
    headers: { 'Accept': 'application/json' }
  }).then(function (r) { return r.json(); }).then(function (js) {
    var items = (js || []).map(function (o) {
      var label = (o.display_name || '').split(',').slice(0, 3).join(',');
      return { kind: 'address', label: label, sub: 'street address', la: +o.lat, lo: +o.lon, zoom: 17 };
    });
    if (!items.length) {
      suggest.innerHTML = '<button class="srow" disabled>No address found — try a town or landmark.</button>';
      return;
    }
    lastResults = items;
    renderSuggest(items);
  }).catch(function () {
    suggest.innerHTML = '<button class="srow" disabled>Address search is unreachable right now.</button>';
  });
}
searchInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    if (lastResults.length) pickResult(lastResults[0]);
    else if (searchInput.value.trim().length > 2) addressSearch(searchInput.value.trim());
  }
});
document.addEventListener('click', function (e) {
  if (!e.target.closest('.searchwrap')) suggest.style.display = 'none';
});

// ---------- measure: distance + area ----------
var measureMode = false, measurePts = [], measureLine = null, measureFill = null;
var measlabel = document.getElementById('measlabel'), btnMeasure = document.getElementById('btnMeasure');
btnMeasure.onclick = function () {
  measureMode = !measureMode;
  btnMeasure.classList.toggle('on', measureMode);
  if (!measureMode) clearMeasure();
  else { measlabel.style.display = 'block'; measlabel.innerHTML = '📏 Tap points on the map — two for distance, three or more then ✓ Done for area.'; }
};
function clearMeasure() {
  if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
  if (measureFill) { map.removeLayer(measureFill); measureFill = null; }
  measurePts = []; measlabel.style.display = 'none'; measlabel.innerHTML = '';
}
function redrawMeasure() {
  if (measureLine) map.removeLayer(measureLine);
  if (measureFill) map.removeLayer(measureFill);
  if (measurePts.length >= 2)
    measureLine = L.polyline(measurePts, { color: '#ffb347', weight: 3 }).addTo(map);
  if (measurePts.length >= 3)
    measureFill = L.polygon(measurePts, { color: '#ffb347', weight: 1, fillOpacity: 0.18 }).addTo(map);
  if (measurePts.length === 1) {
    measlabel.innerHTML = '📏 First point set — tap a second point.';
  } else if (measurePts.length === 2) {
    var km = havKm({ la: measurePts[0][0], lo: measurePts[0][1] }, { la: measurePts[1][0], lo: measurePts[1][1] });
    measlabel.innerHTML = '📏 ' + fmtDist(km) + ' <button class="abtn" id="measDone">✓ Done</button> <button class="abtn" id="measClear">✕ Clear</button>';
  } else if (measurePts.length >= 3) {
    var per = 0;
    for (var i = 0; i < measurePts.length; i++) {
      var a = measurePts[i], b = measurePts[(i + 1) % measurePts.length];
      per += havKm({ la: a[0], lo: a[1] }, { la: b[0], lo: b[1] });
    }
    var area = ringAreaM2(measurePts);
    measlabel.innerHTML = '📐 ' + fmtArea(area) + ' · edge ' + fmtDist(per) +
      ' <button class="abtn" id="measDone">✓ Done</button> <button class="abtn" id="measClear">✕ Clear</button>';
  }
  var d = document.getElementById('measDone'), c = document.getElementById('measClear');
  if (d) d.onclick = function () {
    measureMode = false; btnMeasure.classList.remove('on');
    JAHaudio.speak(measlabel.textContent.replace(/✓ Done|✕ Clear/g, '').trim());
  };
  if (c) c.onclick = clearMeasure;
}
map.on('click', function (e) {
  if (!measureMode) return;
  measurePts.push([e.latlng.lat, e.latlng.lng]);
  redrawMeasure();
});

// ---------- toolbar ----------
document.getElementById('btnReset').onclick = function () { map.flyTo([22, 8], 2.5, { duration: 1.4 }); };
document.getElementById('btnTime').onclick = function () { setTimelapse(!timeOn); };
var layersOpen = false;
document.getElementById('btnLayers').onclick = function () {
  layersOpen = !layersOpen;
  document.getElementById('layersPanel').classList.toggle('open', layersOpen);
  this.classList.toggle('on', layersOpen);
};
document.getElementById('lyBorders').onchange = function () { setBorders(this.checked); };
document.getElementById('lyLabels').onchange = function () { setLabels(this.checked); };
document.getElementById('lyHill').onchange = function () { setHillshade(this.checked); };
document.getElementById('btnAi').onclick = function () {
  if (window.EarthAI) window.EarthAI.toggle();
};

// ---------- deep links: #ll= / ?find= ----------
(function deepLink() {
  var m = location.hash.match(/ll=(-?[\d.]+),(-?[\d.]+)/);
  if (m) {
    var la = +m[1], lo = +m[2];
    dropPin(la, lo, { n: 'Pinned spot', la: la, lo: lo, c: '' });
    map.setView([la, lo], 15);
    return;
  }
  var f = new URLSearchParams(location.search).get('find');
  if (f && window.EarthFinds) {
    window.EarthFinds.get(f).then(function (fd) {
      if (!fd) return;
      dropPin(fd.la, fd.lo, { n: fd.name, la: fd.la, lo: fd.lo, c: fd.country || '' });
      map.flyTo([fd.la, fd.lo], 13, { duration: 1.8 });
    });
  }
})();

// ---------- EarthControl API (drives the map from the AI pal) ----------
window.EarthControl = {
  mode: 'map',
  _map: map,
  flyTo: function (la, lo, zoom, rec) {
    if (rec) dropPin(la, lo, rec); else { if (pin) map.removeLayer(pin); pin = null; }
    map.flyTo([la, lo], zoom || 12, { duration: 1.8 });
  },
  setZoom: function (z) { map.setZoom(z); },
  zoomIn: function () { map.zoomIn(); },
  zoomOut: function () { map.zoomOut(); },
  getView: function () {
    var c = map.getCenter(), b = map.getBounds();
    return {
      la: c.lat, lo: c.lng, zoom: map.getZoom(),
      bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
    };
  },
  toggleLayer: function (name, on) {
    if (name === 'borders') { setBorders(on); document.getElementById('lyBorders').checked = on; }
    else if (name === 'labels') { setLabels(on); document.getElementById('lyLabels').checked = on; }
    else if (name === 'hillshade' || name === 'terrain') { setHillshade(on); document.getElementById('lyHill').checked = on; }
    else if (name === 'timelapse') setTimelapse(on);
  },
  measure: function (a, b) { // a,b = {la,lo,n}
    clearMeasure(); measureMode = true; btnMeasure.classList.add('on');
    measurePts = [[a.la, a.lo], [b.la, b.lo]];
    redrawMeasure();
    map.flyToBounds(L.latLngBounds(measurePts), { padding: [40, 40] });
  },
  geocode: function (q) {
    return ensureIndex().then(function (rows) {
      var ql = q.toLowerCase(), best = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][0].toLowerCase() === ql) { best = rows[i]; break; }
      }
      if (best) return { kind: 'place', label: best[0], sub: best[3], la: best[1], lo: best[2], zoom: 10 };
      return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), {
        headers: { Accept: 'application/json' }
      }).then(function (r) { return r.json(); }).then(function (js) {
        if (js && js.length) {
          var o = js[0];
          return { kind: 'address', label: (o.display_name || '').split(',').slice(0, 3).join(','), sub: 'address', la: +o.lat, lo: +o.lon, zoom: 16 };
        }
        return null;
      });
    });
  },
  searchBox: function (q) { searchInput.value = q; searchInput.dispatchEvent(new Event('input')); searchInput.focus(); }
};
document.getElementById('mapmsg').style.display = 'none';
})();
