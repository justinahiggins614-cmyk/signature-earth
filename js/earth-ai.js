/* Signature Earth — Terra, the Earth AI pal.
 * Conversational AI (GuideTalk v2.1 engine: full ecosystem knowledge +
 * conversation memory) that CONTROLS the map/globe from natural language:
 * fly-to, zoom, layers, measure, address geocoding, and pro scan modes
 * (treasure / scientist / prospector / full) with real on-device analysis.
 *
 * HONESTY IS ENFORCED IN CODE, not just words:
 *  - every scan result carries confidence:'candidate'|'indicator' and the UI
 *    always renders the matching badge;
 *  - prospector results ALWAYS carry the indicator-only disclaimer;
 *  - the AI never claims underground/mineral certainty, never invents data;
 *  - impossible asks (street view) get an honest can't-do, never a fake.
 */
(function () {
'use strict';
var TERRA = {
  id: 'JAH-AI-EARTH-001',
  name: 'Terra',
  description: 'Your Earth AI pal on Signature Earth — I fly the map and globe for you, find places and street addresses, measure distance and area, and run treasure-hunter, scientist and prospector scans over real imagery.',
  abilities: [
    'fly to any place or street address, down to house level',
    'zoom the map from planet view to individual houses',
    'measure distance and area anywhere',
    'turn map layers on and off: borders, labels, terrain shading, timelapse',
    'treasure-hunter scans: sweep the view for circular/geometric patterns',
    'scientist scans: find peaks, depressions and crater-like formations',
    'prospector scans: flag surface color indicators (clues only, never confirmed deposits)',
    'save discoveries to your personal Finds'
  ],
  domain: 'planet exploration',
  kind: 'domain'
};
function EC() { return window.EarthControl || null; }
function esc(s) { return window.SE ? SE.esc(s) : String(s); }

/* ---------------- chat UI ---------------- */
var fab = document.getElementById('aiFab'), panel = document.getElementById('aiPanel'),
    log = document.getElementById('aiLog'), form = document.getElementById('aiForm'),
    input = document.getElementById('aiInput');
var greeted = false;
function toggle(force) {
  var open = force != null ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  if (open && !greeted) {
    greeted = true;
    say('ai', 'Hi, I\'m Terra — your Earth AI. Tell me where to go ("take me to Paris", "my childhood house at 10 Main St"), what to measure, or ask for a scan ("full scan this area"). I fly the map for you.');
  }
  if (open) setTimeout(function () { input.focus(); }, 60);
}
if (fab) fab.onclick = function () { toggle(); };
var aiClose = document.getElementById('aiClose');
if (aiClose) aiClose.onclick = function () { toggle(false); };
function say(who, html) {
  var d = document.createElement('div');
  d.className = 'msg ' + who;
  d.innerHTML = html;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}
function thinking() {
  var d = say('ai', '…');
  return function (html) { d.innerHTML = html; log.scrollTop = log.scrollHeight; };
}
if (form) form.addEventListener('submit', function (e) {
  e.preventDefault();
  var q = input.value.trim();
  if (!q) return;
  input.value = '';
  say('me', esc(q));
  handle(q);
});
window.EarthAI = { toggle: toggle, say: say, ask: function (q) { toggle(true); say('me', esc(q)); handle(q); } };

/* ---------------- intent router ---------------- */
function handle(q) {
  var done = thinking();
  try {
    if (routeIntent(q, done)) return; // intent handled (may be async)
  } catch (e) { /* fall through to engine */ }
  // general chat: GuideTalk v2.1 with conversation memory
  var ans;
  try {
    ans = window.JAHtalk ? JAHtalk.reply(TERRA, q, 'earth-terra')
      : 'I\'m having trouble loading my voice — but I can still fly the map. Try "take me to Paris".';
  } catch (e) {
    ans = 'I didn\'t catch that — try "take me to Paris", "zoom in", or "full scan this area".';
  }
  done(ans);
}
function routeIntent(q, done) {
  var ec = EC(), t = q.trim(), tl = t.toLowerCase();
  // --- view switching
  if (/(^|\b)(switch to|open|go to) (the )?(map|globe)( view| mode)?\b/.test(tl)) {
    var toMap = /map/.test(tl);
    done('On it — opening the ' + (toMap ? '🗺 Map' : '🌍 Globe') + '…');
    setTimeout(function () { location.href = toMap ? 'map.html' : 'globe.html'; }, 600);
    return true;
  }
  // --- street view: honest can't-do
  if (/street ?view/.test(tl)) {
    done('I can\'t do street view — no free public street-level imagery exists anywhere clean I can use. The closest I can give you is the deepest aerial zoom: search an address and I\'ll take you to house level. Want that?');
    return true;
  }
  // --- childhood house
  var chm = tl.match(/(childhood|old) house/);
  if (chm) {
    var addr = t.match(/(?:at|on|in)\s+(.+)$/i);
    if (addr && addr[1].length > 4) {
      geocodeFly(addr[1], 17, done, 'Pinning your childhood house… 🏠');
    } else {
      done('I\'d love to take you there — which childhood house? Give me the street address (like "10 Main St, Springfield") or at least the town, and I\'ll pin it at house level.');
    }
    return true;
  }
  // --- fly to place
  var flym = t.match(/^(?:take me to|go to|fly to|show me|find|look at|navigate to)\s+(.+)$/i);
  if (flym) {
    geocodeFly(flym[1], null, done, null);
    return true;
  }
  // --- zoom
  if (/\bzoom in\b/.test(tl)) { if (ec) ec.zoomIn(); done('Zooming in. 🔍'); return true; }
  if (/\bzoom out\b/.test(tl)) { if (ec) ec.zoomOut(); done('Zooming out. 🌍'); return true; }
  var zm = tl.match(/zoom to (house|street|neighborhood|neighbourhood|city|state|country|world|planet)/);
  if (zm) {
    var zmap = { house: 17, street: 15, neighborhood: 13, neighbourhood: 13, city: 11, state: 8, country: 6, world: 3, planet: 3 };
    if (ec) ec.setZoom(zmap[zm[1]]);
    done('Zooming to ' + zm[1] + ' level.' + (zm[1] === 'house' && ec && ec.mode === 'map' ? ' Deepest aerial views cover the US — elsewhere I\'ll say so honestly.' : ''));
    return true;
  }
  // --- layers
  var lon = tl.match(/(turn on|show|enable|turn off|hide|disable)\s+(borders?|labels?|terrain|hillshade|timelapse)/);
  if (lon) {
    var on = /on|show|enable/.test(lon[1]);
    var layer = lon[2].replace(/s$/, '');
    if (layer === 'hillshade') layer = 'terrain';
    if (ec) ec.toggleLayer(layer === 'timelapse' ? 'timelapse' : layer, on);
    done((on ? 'Showing ' : 'Hiding ') + lon[2] + '. 🗺');
    return true;
  }
  // --- measure between two places
  var mm = t.match(/measure .*?(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+)$/i);
  if (mm && ec) {
    done('Measuring — geocoding both ends… 📏');
    ec.geocode(mm[1]).then(function (a) {
      return ec.geocode(mm[2]).then(function (b) {
        if (a && b) {
          ec.measure({ la: a.la, lo: a.lo }, { la: b.la, lo: b.lo });
          say('ai', '📏 From <b>' + esc(a.label) + '</b> to <b>' + esc(b.label) + '</b> — the line is drawn on the ' + (ec.mode === 'map' ? 'map' : 'globe') + ' with the distance.');
        } else say('ai', 'I could only find one of those — try naming a town or a full street address for each end.');
      });
    }).catch(function () { say('ai', 'Measuring hit a snag — try again in a moment.'); });
    return true;
  }
  // --- scans
  if (/full scan/.test(tl)) { runScans(['treasure', 'scientist', 'prospector'], done); return true; }
  if (/treasure|pattern/.test(tl)) {
    var sizeM = parseSize(tl);
    runScans(['treasure'], done, sizeM ? { radiusM: sizeM / 2 } : null);
    return true;
  }
  if (/prospect|gold|material|mineral|ore|deposit/.test(tl)) { runScans(['prospector'], done); return true; }
  if (/scientist|geolog|formation|crater|volcan|ridge|delta/.test(tl)) { runScans(['scientist'], done); return true; }
  if (/\bscan\b/.test(tl)) { runScans(['treasure', 'scientist', 'prospector'], done); return true; }
  // --- save finds
  if (/save .*find|save this|save them/.test(tl)) { saveLastScan(done); return true; }
  return false; // no intent: engine handles it
}
function parseSize(tl) {
  var m = tl.match(/(\d+(?:\.\d+)?)\s*(miles?|mile|km|kilometers?|kilometres?|meters?|metres?|feet|ft)/);
  if (!m) return null;
  var v = parseFloat(m[1]), u = m[2];
  if (/mile/.test(u)) return v * 1609.34;
  if (/km|kilometer|kilometre/.test(u)) return v * 1000;
  if (/feet|ft/.test(u)) return v * 0.3048;
  return v;
}
function geocodeFly(q, zoom, done, prefix) {
  var ec = EC();
  done((prefix || 'Looking that up…') + ' 🔎');
  if (!ec) { say('ai', 'The map isn\'t ready yet — try again in a moment.'); return; }
  ec.geocode(q).then(function (r) {
    if (!r) { say('ai', 'I couldn\'t find "' + esc(q) + '" — try a town name or a full street address.'); return; }
    ec.flyTo(r.la, r.lo, zoom || r.zoom, { n: r.label, la: r.la, lo: r.lo, c: r.sub || '' });
    say('ai', '📍 <b>' + esc(r.label) + '</b>' + (r.sub ? ' — ' + esc(r.sub) : '') +
      (r.kind === 'address' ? '<br>Taking you to house level. 🏠' : '<br>Flying you there now. ✈️'));
  }).catch(function () { say('ai', 'The search hit a snag — try again in a moment.'); });
}

/* ---------------- scan engine: real on-device analysis ---------------- */
var D2R = Math.PI / 180;
function lonLatToTile(la, lo, z) {
  var n = Math.pow(2, z);
  var x = Math.floor((lo + 180) / 360 * n);
  var lr = la * D2R;
  var y = Math.floor((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}
function tileBounds(x, y, z) {
  var n = Math.pow(2, z);
  function y2lat(yy) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI; }
  return { w: x / n * 360 - 180, e: (x + 1) / n * 360 - 180, n: y2lat(y), s: y2lat(y + 1) };
}
function eoxUrl(z, x, y) { return 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/' + z + '/' + y + '/' + x + '.jpg'; }
function loadTileImg(url) {
  return new Promise(function (res, rej) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { res(img); };
    img.onerror = function () { rej(new Error('tile')); };
    img.src = url;
  });
}
function tilePixels(img) {
  var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  var g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return { ctx: g, w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}
var lastScan = null; // {results:[...], when, kinds}

function scanViewTiles(maxTiles, za) {
  var ec = EC();
  if (!ec || ec.mode !== 'map') return Promise.reject(new Error('mapmode'));
  var v = ec.getView();
  var z = Math.max(8, Math.min(13, za || Math.round(v.zoom)));
  var c = lonLatToTile(v.la, v.lo, z);
  var tiles = [], R = 1;
  for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
    var n = Math.pow(2, z);
    tiles.push({ z: z, x: (c.x + dx + n) % n, y: Math.max(0, Math.min(n - 1, c.y + dy)) });
    if (tiles.length >= maxTiles) break;
  }
  return Promise.resolve({ tiles: tiles, z: z });
}

/* circular Hough-lite: finds ring/circle candidates in a tile */
function findCircles(px, w, h) {
  var gray = new Float32Array(w * h), i, x, y;
  for (i = 0; i < w * h; i++) gray[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114);
  var mag = new Float32Array(w * h), dxA = new Float32Array(w * h), dyA = new Float32Array(w * h);
  var edgeCount = 0;
  for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
    i = y * w + x;
    var dx = gray[i + 1] - gray[i - 1], dy = gray[i + w] - gray[i - w];
    var m = Math.sqrt(dx * dx + dy * dy);
    mag[i] = m; dxA[i] = m ? dx / m : 0; dyA[i] = m ? dy / m : 0;
    if (m > 28) edgeCount++;
  }
  if (edgeCount < 200) return [];
  var CW = 64, CH = 64, RADII = [8, 12, 16, 24, 32, 48];
  var acc = {};
  function vote(cx, cy, r) {
    var gx = Math.floor(cx / w * CW), gy = Math.floor(cy / h * CH);
    if (gx < 0 || gy < 0 || gx >= CW || gy >= CH) return;
    var k = gx + gy * CW + 'r' + r;
    acc[k] = (acc[k] || 0) + 1;
  }
  var step = 2;
  for (y = 1; y < h - 1; y += step) for (x = 1; x < w - 1; x += step) {
    i = y * w + x;
    if (mag[i] <= 28) continue;
    for (var ri = 0; ri < RADII.length; ri++) {
      var r = RADII[ri];
      vote(x - dxA[i] * r, y - dyA[i] * r, r);
      vote(x + dxA[i] * r, y + dyA[i] * r, r);
    }
  }
  var cands = [];
  for (var k in acc) {
    if (acc[k] > 26) {
      var parts = k.split('r'), gi = +parts[0], r2 = +parts[1];
      cands.push({ gx: gi % CW, gy: Math.floor(gi / CW), r: r2, v: acc[k] });
    }
  }
  cands.sort(function (a, b) { return b.v - a.v; });
  var kept = [];
  cands.forEach(function (c) {
    var px2 = (c.gx + 0.5) / CW * w, py2 = (c.gy + 0.5) / CH * h;
    var dup = kept.some(function (k) { return Math.hypot(k.x - px2, k.y - py2) < 30; });
    if (!dup && kept.length < 4) kept.push({ x: px2, y: py2, r: c.r, score: c.v });
  });
  return kept;
}

function runScans(kinds, done, opts) {
  opts = opts || {};
  var ec = EC();
  if (!ec || ec.mode !== 'map') {
    done('Scans run on the flat 🗺 Map — that\'s where I can read the imagery pixel by pixel. ' +
      (ec ? 'Tap "switch to map view" and ask me again.' : 'Open map.html and ask me there.'));
    return;
  }
  done('🔍 Scanning this area — reading real satellite pixels now…');
  var v = ec.getView();
  var results = [];
  var chain = Promise.resolve();
  if (kinds.indexOf('treasure') >= 0) chain = chain.then(function () { return treasureScan(v, opts, results); });
  if (kinds.indexOf('scientist') >= 0) chain = chain.then(function () { return scientistScan(v, results); });
  if (kinds.indexOf('prospector') >= 0) chain = chain.then(function () { return prospectorScan(v, results); });
  chain.then(function () {
    lastScan = { results: results, when: Date.now(), kinds: kinds };
    drawScanPins(results);
    reportScan(results, kinds, v);
  }).catch(function (e) {
    say('ai', 'The scan hit a snag (' + esc(e.message === 'mapmode' ? 'map not ready' : 'tile load') + ') — try again zoomed to a land area.');
  });
}

function treasureScan(v, opts, results) {
  return scanViewTiles(9).then(function (info) {
    var jobs = info.tiles.map(function (t) {
      return loadTileImg(eoxUrl(t.z, t.x, t.y)).then(function (img) {
        var tp = tilePixels(img);
        var circles = findCircles(tp.data, tp.w, tp.h);
        var b = tileBounds(t.x, t.y, t.z);
        var mPerPx = 156543.03392 * Math.cos(v.la * D2R) / Math.pow(2, t.z) * (tp.w / 256);
        return circles.map(function (c) {
          var radiusM = c.r * mPerPx;
          if (opts.radiusM && (radiusM < opts.radiusM * 0.5 || radiusM > opts.radiusM * 1.8)) return null;
          var la = b.n - (c.y / tp.h) * (b.n - b.s);
          var lo = b.w + (c.x / tp.w) * (b.e - b.w);
          return {
            kind: 'treasure', confidence: 'candidate', la: la, lo: lo,
            name: 'Possible circular feature',
            detail: 'Ring-like pattern ~' + Math.round(radiusM * 2) + ' m across (pattern score ' + c.score + '). Could be a pivot-irrigation field, a crater, or a natural ring — verify visually.',
            radiusM: radiusM
          };
        }).filter(Boolean);
      }).catch(function () { return []; });
    });
    return Promise.all(jobs).then(function (lists) {
      lists.forEach(function (l) { l.forEach(function (r) { results.push(r); }); });
    });
  });
}

function elevGridPromise() {
  if (elevGridPromise._p) return elevGridPromise._p;
  elevGridPromise._p = new Promise(function (res, rej) {
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        var g = c.getContext('2d'); g.drawImage(img, 0, 0);
        var d = g.getImageData(0, 0, c.width, c.height).data;
        var px = new Uint8ClampedArray(c.width * c.height);
        for (var i = 0; i < px.length; i++) px[i] = d[i * 4];
        res({ w: c.width, h: c.height, px: px });
      } catch (e) { rej(e); }
    };
    img.onerror = rej;
    img.src = 'assets/elevation.png';
  });
  return elevGridPromise._p;
}
function elevAt(g, la, lo) {
  var x = Math.max(0, Math.min(g.w - 1, Math.floor((lo + 180) / 360 * g.w)));
  var y = Math.max(0, Math.min(g.h - 1, Math.floor((90 - la) / 180 * g.h)));
  return g.px[y * g.w + x] / 255 * 9500 - 500;
}
function scientistScan(v, results) {
  return elevGridPromise().then(function (g) {
    var b = v.bbox, dLa = (b[2] - b[0]) / 48, dLo = (b[3] - b[1]) / 48, r, c;
    var grid = [];
    for (r = 0; r <= 48; r++) {
      grid[r] = [];
      for (c = 0; c <= 48; c++) grid[r][c] = elevAt(g, b[2] - r * dLa, b[0] + c * dLo);
    }
    function ringMean(r0, c0, rad) {
      var s = 0, n = 0;
      for (var dr = -rad; dr <= rad; dr++) for (var dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        var rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr > 48 || cc > 48) continue;
        s += grid[rr][cc]; n++;
      }
      return n ? s / n : 0;
    }
    var cands = [];
    for (r = 3; r <= 45; r++) for (c = 3; c <= 45; c++) {
      var ctr = grid[r][c], ring = ringMean(r, c, 3);
      var prom = ctr - ring;
      if (prom > 350) cands.push({ r: r, c: c, kind: 'peak', prom: prom, e: ctr });
      else if (prom < -180 && ctr < 2000) cands.push({ r: r, c: c, kind: 'depression', prom: -prom, e: ctr });
    }
    cands.sort(function (a, b2) { return b2.prom - a.prom; });
    var kept = [];
    cands.forEach(function (k) {
      var dup = kept.some(function (o) { return Math.hypot(o.r - k.r, o.c - k.c) < 6; });
      if (!dup && kept.length < 6) kept.push(k);
    });
    kept.forEach(function (k) {
      var la = b[2] - k.r * dLa, lo = b[0] + k.c * dLo;
      if (k.kind === 'peak') {
        results.push({
          kind: 'scientist', confidence: 'candidate', la: la, lo: lo,
          name: 'Notable summit',
          detail: 'High point ~' + Math.round(k.e).toLocaleString() + ' m, rising ~' + Math.round(k.prom).toLocaleString() +
            ' m above surroundings. Consistent with a mountain peak or ridge — terrain data only, verify with imagery.'
        });
      } else {
        results.push({
          kind: 'scientist', confidence: 'candidate', la: la, lo: lo,
          name: 'Notable depression',
          detail: 'Low point ~' + Math.round(k.e).toLocaleString() + ' m, ~' + Math.round(k.prom).toLocaleString() +
            ' m below surroundings. Could be a crater, caldera, sinkhole or valley — shape needs visual check, origin unconfirmed.'
        });
      }
    });
    // named features in view from the gazetteer
    return SE.fetchGz('data/index/names.json.gz').then(function (rows) {
      var inView = [];
      for (var i = 0; i < rows.length && inView.length < 400; i++) {
        var r = rows[i];
        if (r[1] < b[2] && r[1] > b[0] && r[2] < b[3] && r[2] > b[0] && r[5] > 5000) inView.push(r);
      }
      inView.sort(function (a, b2) { return b2[5] - a[5]; });
      inView.slice(0, 5).forEach(function (r) {
        results.push({
          kind: 'scientist', confidence: 'candidate', la: r[1], lo: r[2],
          name: r[0] + ' (' + r[3] + ')',
          detail: 'Named place in the scan area — real gazetteer record, worth a look on the ground (imagery).'
        });
      });
    }).catch(function () {});
  });
}

function prospectorScan(v, results) {
  return scanViewTiles(9).then(function (info) {
    var jobs = info.tiles.map(function (t) {
      return loadTileImg(eoxUrl(t.z, t.x, t.y)).then(function (img) {
        var tp = tilePixels(img), d = tp.data, n = tp.w * tp.h;
        var R = 0, G = 0, B = 0, i;
        for (i = 0; i < n; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
        n = Math.floor(n / 4); R /= n; G /= n; B /= n;
        var redness = R / (G + B + 1), bright = (R + G + B) / 3, veg = G / (R + B + 1);
        var b = tileBounds(t.x, t.y, t.z);
        var la = (b.n + b.s) / 2, lo = (b.w + b.e) / 2;
        var flags = [];
        if (redness > 0.42 && R > 90) flags.push('iron-rich red soil color');
        if (bright > 150 && veg < 0.42) flags.push('bright bare outcrop (exposed rock?)');
        if (veg < 0.34 && bright > 110) flags.push('vegetation anomaly (sparse cover on bright ground)');
        return flags.map(function (f) {
          return {
            kind: 'prospector', confidence: 'indicator', la: la, lo: lo,
            name: 'Surface color indicator',
            detail: f + ' in this tile. ' + HONEST_PROSPECTOR
          };
        });
      }).catch(function () { return []; });
    });
    return Promise.all(jobs).then(function (lists) {
      var seen = 0;
      lists.forEach(function (l) {
        l.forEach(function (r) { if (seen < 8) { results.push(r); seen++; } });
      });
    });
  });
}
var HONEST_PROSPECTOR = '⚠️ INDICATOR ONLY — imagery color is a clue, never a confirmed deposit. Minerals need ground sampling and lab assays; I cannot see underground.';

/* pins + report */
var scanPins = [];
function drawScanPins(results) {
  var ec = EC();
  if (ec && ec._scanLayer && ec._map) { try { ec._map.removeLayer(ec._scanLayer); } catch (e) {} ec._scanLayer = null; }
  scanPins = [];
  if (!ec || ec.mode !== 'map' || !window.L || !ec._map) return;
  ec._scanLayer = L.layerGroup().addTo(ec._map);
  var colors = { treasure: '#d4a017', scientist: '#35e0ff', prospector: '#ff7a3c' };
  results.forEach(function (r, i) {
    var mk = L.circleMarker([r.la, r.lo], {
      radius: 9, color: colors[r.kind] || '#fff', weight: 3, fillOpacity: 0.35
    }).addTo(ec._scanLayer);
    var badge = r.confidence === 'indicator'
      ? '<br><span style="color:#ffb347">⚠️ INDICATOR ONLY — not a confirmed find</span>'
      : '<br><span style="color:#9fb3e8">⚠️ CANDIDATE — verify visually</span>';
    mk.bindPopup('<b>' + esc(r.name) + '</b>' + badge + '<br>' + esc(r.detail) +
      '<br><button class="abtn" data-scan-save="' + i + '">💾 Save to Finds</button>');
    scanPins.push(mk);
  });
}
function reportScan(results, kinds, v) {
  var names = { treasure: 'treasure-hunter', scientist: 'scientist', prospector: 'prospector' };
  var h = '🔍 <b>Scan complete</b> — ' + kinds.map(function (k) { return names[k]; }).join(' + ') +
    ' over this view (' + results.length + ' candidate' + (results.length === 1 ? '' : 's') + ').<br>';
  if (!results.length) {
    h += 'Nothing flagged here. Try zooming to a land area, or run a <b>full scan</b> somewhere with more texture — deserts, mountains and farmland give the best patterns.';
  } else {
    h += '<div style="margin-top:6px">';
    results.slice(0, 10).forEach(function (r, i) {
      var badge = r.confidence === 'indicator' ? '⚠️ indicator' : '⚠️ candidate';
      h += '• <b>' + esc(r.name) + '</b> ' + badge + '<br><span style="color:#9fb3e8;font-size:.85rem">' +
        esc(r.detail).slice(0, 140) + '</span><br>';
    });
    h += '</div><span style="color:#9fb3e8;font-size:.85rem">Colored pins mark every hit on the map — tap one, then 💾 Save to Finds to keep it.</span>';
  }
  h += '<br><span style="color:#8fa0c8;font-size:.8rem">Honest note: I read pixels and terrain numbers — I can\'t see underground, and I never invent certainty. Every hit says what it is: a candidate or an indicator.</span>';
  say('ai', h);
  var pops = document.querySelectorAll('[data-scan-save]');
  for (var i = 0; i < pops.length; i++) {
    (function (idx) {
      pops[idx].onclick = function () { saveScanResult(results[idx]); };
    })(+pops[i].getAttribute('data-scan-save'));
  }
}
function saveScanResult(r) {
  if (!window.EarthFinds) return;
  var list = EarthFinds.loadUser();
  var rec = {
    id: 'JAH-SCAN-' + String(Date.now()).slice(-6),
    name: r.name + ' (scan)', country: '', la: r.la, lo: r.lo,
    cat: r.kind, status: r.confidence === 'indicator' ? 'explained' : 'unexplained',
    statusNote: r.confidence === 'indicator' ? 'Surface indicator only — not a confirmed find.' : 'Candidate from AI scan — unverified.',
    what: r.detail, why: 'Flagged by Terra\'s ' + r.kind + ' scan. Verify visually before treating it as anything more.',
    value: '', zoom: 15, user: true
  };
  list.unshift(rec);
  EarthFinds.saveUser(list);
  say('ai', '💾 Saved to your <b>Finds</b> — see it on the 💎 Finds tab.');
}
function saveLastScan(done) {
  if (!lastScan || !lastScan.results.length) { done('No scan results to save yet — run a scan first ("full scan this area").'); return; }
  lastScan.results.forEach(function (r) { saveScanResult(r); });
  done('💾 Saved ' + lastScan.results.length + ' scan hits to your Finds. They\'re on the 💎 Finds tab.');
}

/* expose scan layer hook for map.js */
window.EarthScan = { run: runScans, get last() { return lastScan; } };
})();
