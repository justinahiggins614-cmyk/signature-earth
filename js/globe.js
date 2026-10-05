// Signature Earth — interactive 3D globe (Three.js).
// Drag to spin, scroll/pinch to zoom, search to fly, measure, tours, saved places.
(function () {
'use strict';
var loadmsg = document.getElementById('loadmsg');
function fail(html) { if (loadmsg) { loadmsg.style.display = 'flex'; loadmsg.innerHTML = html; } }
if (!window.THREE) {
  fail('🌍 The 3D engine could not load.<br><small>Check your connection and reload — or browse every place in the <a href="places.html" style="color:#d4a017">Places A–Z archive</a>.</small>');
  return;
}
if (loadmsg) loadmsg.style.display = 'none';

// ---------- profile-aware storage ----------
// JAHProfile storage wrapper (JAHPS): public visitors pass keys through
// unprefixed (behavior unchanged); signed-in profiles get per-profile
// namespaced storage. Mirrors the page-level adapter in globe.html/index.html.
var JAHPS = (function () { try { return (typeof JAHProfile !== "undefined") && JAHProfile.store ? JAHProfile.store : localStorage; } catch (e) { return localStorage; } })();

// ---------- math ----------
var D2R = Math.PI / 180, R2D = 180 / Math.PI;
function latLonToVec3(la, lo) {
  var phi = (lo + 180) * D2R, lam = la * D2R;
  return new THREE.Vector3(-Math.cos(phi) * Math.cos(lam), Math.sin(lam), Math.sin(phi) * Math.cos(lam));
}
function vec3ToLatLon(v) {
  var la = Math.asin(Math.max(-1, Math.min(1, v.y))) * R2D;
  var phi = Math.atan2(v.z, -v.x);
  var lo = phi * R2D - 180;
  if (lo < -180) lo += 360; if (lo > 180) lo -= 360;
  return { la: Math.round(la * 100) / 100, lo: Math.round(lo * 100) / 100 };
}
function haversineKm(a, b) {
  var dLa = (b.la - a.la) * D2R, dLo = (b.lo - a.lo) * D2R;
  var s = Math.sin(dLa / 2), t = Math.sin(dLo / 2);
  var h = s * s + Math.cos(a.la * D2R) * Math.cos(b.la * D2R) * t * t;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------- scene ----------
var canvas = document.getElementById('globe');
var renderer, scene, camera, globeGroup, sphere, raycaster;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
} catch (e) {
  fail('🌍 Your browser could not start 3D.<br><small>Try the <a href="places.html" style="color:#d4a017">Places A–Z archive</a> instead.</small>');
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
var DEF_DIST = 3.2;
camera.position.set(0, 0.6, DEF_DIST);
camera.lookAt(0, 0, 0);
// camera tilt (Google-Earth-style navigation): elevation angle of the camera
var tiltA = 0.19, TILT_MIN = -0.45, TILT_MAX = 1.15;
globeGroup = new THREE.Group();
scene.add(globeGroup);

function fallbackTexture() {
  var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  var g = c.getContext('2d');
  g.fillStyle = '#0e2a55'; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  for (var i = 0; i <= 18; i++) { g.beginPath(); g.moveTo(i * 1024 / 18, 0); g.lineTo(i * 1024 / 18, 512); g.stroke(); }
  for (var j = 0; j <= 9; j++) { g.beginPath(); g.moveTo(0, j * 512 / 9); g.lineTo(1024, j * 512 / 9); g.stroke(); }
  var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
var tex = fallbackTexture();
new THREE.TextureLoader().load('assets/earth-texture.png', function (t) {
  t.encoding = THREE.sRGBEncoding;
  sphere.material.map = t; sphere.material.needsUpdate = true;
});
sphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 128, 96),
  new THREE.MeshPhongMaterial({ map: tex, shininess: 10 })
);
globeGroup.add(sphere);
setTerrain(true); // 3D terrain on by default (public elevation data)
var sun = new THREE.DirectionalLight(0xffffff, 1.15); sun.position.set(5, 2.5, 4); scene.add(sun);
scene.add(new THREE.AmbientLight(0x8fa3cc, 0.5));
// atmosphere glow
var atm = new THREE.Mesh(
  new THREE.SphereGeometry(1.18, 48, 48),
  new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.65 - dot(vN, vec3(0.,0.,1.)), 2.4); gl_FragColor = vec4(0.38,0.58,1.0,1.0) * i; }',
    blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false
  })
);
scene.add(atm);
// stars
(function stars() {
  var n = 1400, pos = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    var v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(45 + Math.random() * 40);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaac4ff, size: 0.55 })));
})();

// ---------- state ----------
var targetRX = 0.42, targetRY = -1.1, targetDist = DEF_DIST;
var idleT = 0, flying = false, downInfo = null, pointers = {};
var measureMode = false, measurePts = [], measureMeshes = [];
var markers = [];
var raycaster2 = new THREE.Raycaster();
var readout = document.getElementById('readout');
var needle = document.getElementById('needle');

function resize() {
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// ---------- interaction ----------
function ndc(e) {
  var r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
}
function pickLatLon(nx, ny) {
  raycaster2.setFromCamera({ x: nx, y: ny }, camera);
  var hit = raycaster2.intersectObject(sphere, false)[0];
  if (!hit) return null;
  var local = globeGroup.worldToLocal(hit.point.clone()).normalize();
  return vec3ToLatLon(local);
}
canvas.addEventListener('pointerdown', function (e) {
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  downInfo = { x: e.clientX, y: e.clientY, t: Date.now(), n: Object.keys(pointers).length, pinch: 0 };
  if (downInfo.n === 2) {
    var ks = Object.keys(pointers);
    downInfo.pinch = Math.hypot(pointers[ks[0]].x - pointers[ks[1]].x, pointers[ks[0]].y - pointers[ks[1]].y);
  }
  idleT = 0; flying = false;
});
canvas.addEventListener('pointermove', function (e) {
  if (pointers[e.pointerId]) {
    var prev = pointers[e.pointerId];
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ks = Object.keys(pointers);
    if (ks.length === 1 && downInfo) {
      targetRY += dx * 0.005; targetRX += dy * 0.005;
      targetRX = Math.max(-1.25, Math.min(1.25, targetRX));
      idleT = 0; flying = false;
    } else if (ks.length === 2 && downInfo && downInfo.pinch) {
      var d = Math.hypot(pointers[ks[0]].x - pointers[ks[1]].x, pointers[ks[0]].y - pointers[ks[1]].y);
      targetDist = Math.max(1.7, Math.min(6, targetDist * (downInfo.pinch / Math.max(1, d))));
      downInfo.pinch = d; idleT = 0; flying = false;
    }
  } else {
    var n = ndc(e), ll = pickLatLon(n.x, n.y);
    if (readout) readout.textContent = ll ? SE.fmtCoords(ll.la, ll.lo) : '—';
  }
});
function endPointer(e) {
  delete pointers[e.pointerId];
  if (downInfo && downInfo.n === 1) {
    var moved = Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y);
    if (moved < 8 && Date.now() - downInfo.t < 600) handleTap(e);
  }
  downInfo = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  targetDist = Math.max(1.7, Math.min(6, targetDist * (1 + e.deltaY * 0.001)));
  idleT = 0;
}, { passive: false });

function handleTap(e) {
  var n = ndc(e);
  // marker tap?
  raycaster2.setFromCamera({ x: n.x, y: n.y }, camera);
  var mh = raycaster2.intersectObjects(markers, false)[0];
  if (mh && mh.object.userData.rec) { openCard(mh.object.userData.rec); return; }
  var ll = pickLatLon(n.x, n.y);
  if (!ll) return;
  if (readout) readout.textContent = SE.fmtCoords(ll.la, ll.lo); // touch: tap updates readout
  if (measureMode) addMeasurePoint(ll);
}

// ---------- markers ----------
var pinTex = (function () {
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var g = c.getContext('2d');
  g.fillStyle = '#d4a017';
  g.beginPath(); g.arc(32, 24, 16, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(18, 34); g.lineTo(32, 60); g.lineTo(46, 34); g.closePath(); g.fill();
  g.fillStyle = '#101010'; g.beginPath(); g.arc(32, 24, 7, 0, Math.PI * 2); g.fill();
  var t = new THREE.CanvasTexture(c); return t;
})();
function clearMarkers() {
  markers.forEach(function (m) { globeGroup.remove(m); m.material.dispose(); });
  markers = [];
}
function addMarker(rec) {
  clearMarkers();
  var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTex, depthTest: false, transparent: true }));
  s.position.copy(latLonToVec3(rec.la, rec.lo).multiplyScalar(1.03));
  s.scale.set(0.11, 0.11, 1);
  s.userData.rec = rec;
  globeGroup.add(s); markers.push(s);
}

// ---------- fly-to ----------
var flight = null;
function flyTo(la, lo, done) {
  globeGroup.updateMatrixWorld(true);
  var world = latLonToVec3(la, lo).applyMatrix4(globeGroup.matrixWorld).normalize();
  var start = camera.position.clone().normalize();
  // shortest-path guard: if nearly antipodal, nudge
  if (start.dot(world) < -0.999) start.x += 0.01, start.normalize();
  flight = { t: 0, dur: 1.7, from: start, to: world, d0: targetDist, done: done || null };
  flying = true; idleT = 0;
}
function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

// ---------- gazetteer ----------
var indexRows = null, indexLoading = null;
function ensureIndex() {
  if (indexRows) return Promise.resolve(indexRows);
  if (indexLoading) return indexLoading;
  var sug = document.getElementById('suggest');
  indexLoading = SE.fetchGz('data/index/names.json.gz').then(function (rows) {
    indexRows = rows; indexLoading = null;
    var qp = new URLSearchParams(location.search).get('place');
    if (qp) {
      var hit = rows.find(function (r) { return String(r[6]) === qp; });
      if (hit) selectPlace(rowToRec(hit));
    }
    var llp = new URLSearchParams(location.search).get('ll');
    if (llp) {
      var m = llp.match(/(-?[\d.]+),(-?[\d.]+)/);
      if (m) selectPlace({ id: 'll', n: 'Pinned spot', a: 'Pinned spot', la: +m[1], lo: +m[2], c: '', r: '', p: 0, e: null, t: '' });
    }
    return rows;
  }).catch(function (err) {
    indexLoading = null;
    if (sug) { sug.style.display = 'block'; sug.innerHTML = '<button disabled>Could not load place data: ' + SE.esc(err.message) + '</button>'; }
    throw err;
  });
  return indexLoading;
}
function rowToRec(r) { return { id: r[6], n: r[0], a: r[0], la: r[1], lo: r[2], c: r[3], r: r[4], p: r[5], e: null, t: '' }; }
function findPlace(name, country) {
  if (!indexRows) return null;
  var nm = name.toLowerCase();
  var pool = indexRows.filter(function (r) { return r[0].toLowerCase() === nm; });
  if (country) {
    var c = pool.filter(function (r) { return r[3].toLowerCase() === country.toLowerCase(); });
    if (c.length) return rowToRec(c[0]);
  }
  return pool.length ? rowToRec(pool[0]) : null;
}

// ---------- search ----------
var searchInput = document.getElementById('search'), suggest = document.getElementById('suggest'), lastResults = [];
searchInput.addEventListener('input', function () {
  var q = searchInput.value.trim().toLowerCase();
  if (q.length < 2) { suggest.style.display = 'none'; return; }
  suggest.style.display = 'block';
  suggest.innerHTML = '<button disabled>Loading places…</button>';
  ensureIndex().then(function (rows) {
    var starts = [], contains = [];
    for (var i = 0; i < rows.length && (starts.length + contains.length) < 40; i++) {
      var nm = rows[i][0].toLowerCase();
      if (nm.indexOf(q) === 0) starts.push(rows[i]);
      else if (nm.indexOf(q) > 0) contains.push(rows[i]);
    }
    lastResults = starts.concat(contains).slice(0, 8);
    if (!lastResults.length) {
      suggest.innerHTML = '<button id="addrBtn">🌐 No named place — search street addresses…</button>';
      document.getElementById('addrBtn').onclick = function () { nominatimSearch(searchInput.value.trim()); };
      return;
    }
    suggest.innerHTML = '';
    lastResults.forEach(function (r, i) {
      var b = document.createElement('button');
      b.innerHTML = '<b>' + SE.esc(r[0]) + '</b> <span style="color:#9fb3e8">' + SE.esc(r[3]) + (r[5] ? ' · ' + SE.fmtPop(r[5]) : '') + '</span>';
      b.onclick = function () { suggest.style.display = 'none'; searchInput.value = r[0]; selectPlace(rowToRec(r)); };
      suggest.appendChild(b);
    });
  }).catch(function () {});
});
searchInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && lastResults.length) {
    suggest.style.display = 'none'; searchInput.value = lastResults[0][0];
    selectPlace(rowToRec(lastResults[0]));
  }
});
document.addEventListener('click', function (e) {
  if (!e.target.closest('.searchwrap')) suggest.style.display = 'none';
});
// street-address search via Nominatim (free, OSM contributors, attributed in footer)
function nominatimSearch(q) {
  suggest.style.display = 'block';
  suggest.innerHTML = '<button disabled>🌐 Searching addresses…</button>';
  fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(q), {
    headers: { 'Accept': 'application/json' }
  }).then(function (r) { return r.json(); }).then(function (js) {
    if (!js || !js.length) { suggest.innerHTML = '<button disabled>No address found — try a town or landmark.</button>'; return; }
    suggest.innerHTML = '';
    js.forEach(function (o) {
      var label = (o.display_name || '').split(',').slice(0, 3).join(',');
      var b = document.createElement('button');
      b.innerHTML = '🏠 <b>' + SE.esc(label) + '</b>';
      b.onclick = function () {
        suggest.style.display = 'none'; searchInput.value = label;
        selectPlace({
          id: 'addr:' + o.place_id, n: label, a: label,
          la: +o.lat, lo: +o.lon,
          c: (o.display_name || '').split(',').pop().trim(), r: '', p: 0, e: null, t: ''
        });
      };
      suggest.appendChild(b);
    });
  }).catch(function () {
    suggest.innerHTML = '<button disabled>Address search is unreachable right now.</button>';
  });
}

function selectPlace(rec) {
  stopTour();
  addMarker(rec);
  flyTo(rec.la, rec.lo, function () { openCard(rec); });
}

// ---------- place card ----------
var card = document.getElementById('card'), currentRec = null;
function openCard(rec) {
  currentRec = rec;
  document.getElementById('cardName').textContent = '📍 ' + rec.n;
  var meta = SE.esc(rec.r ? rec.r + ', ' + rec.c : rec.c) + '<br>' + SE.esc(SE.fmtCoords(rec.la, rec.lo));
  if (rec.p) meta += ' · 👥 ' + SE.fmtPop(rec.p);
  if (rec.e != null) meta += ' · ⛰ ' + rec.e + ' m';
  if (rec.t) meta += '<br>🕓 ' + SE.esc(rec.t);
  document.getElementById('cardMeta').innerHTML = meta;
  card.classList.add('open');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
document.getElementById('cardClose').onclick = function () { card.classList.remove('open'); JAHaudio.stop(); };
document.getElementById('cardRead').onclick = function () { if (currentRec) JAHaudio.speak(SE.placeText(currentRec)); };
document.getElementById('cardCopy').onclick = function () {
  if (currentRec) SE.copyText(SE.placeText(currentRec) + ' See it: ' + location.origin + location.pathname + '?place=' + currentRec.id, document.getElementById('cardCopy'));
};
document.getElementById('cardDl').onclick = function () {
  if (currentRec) SE.download('signature-earth-place-' + currentRec.id + '.json', JSON.stringify(currentRec, null, 2));
};
document.getElementById('cardSave').onclick = function () {
  if (!currentRec) return;
  var saved = loadSaved();
  if (!saved.some(function (s) { return s.id === currentRec.id; })) {
    saved.unshift({ id: currentRec.id, n: currentRec.n, la: currentRec.la, lo: currentRec.lo, c: currentRec.c });
    try { JAHPS.set('sigearth-saved', JSON.stringify(saved.slice(0, 60))); } catch (e) {}
    renderSaved();
  }
  var b = document.getElementById('cardSave'), old = b.textContent;
  b.textContent = '⭐ Saved!'; setTimeout(function () { b.textContent = old; }, 1400);
};

// ---------- measure ----------
var btnMeasure = document.getElementById('btnMeasure'), measlabel = document.getElementById('measlabel');
btnMeasure.onclick = function () {
  measureMode = !measureMode;
  btnMeasure.classList.toggle('on', measureMode);
  btnMeasure.setAttribute('aria-pressed', measureMode ? 'true' : 'false');
  if (!measureMode) clearMeasure();
};
function fmtKm(km) {
  if (km < 1) return Math.round(km * 1000).toLocaleString('en-US') + ' m';
  if (km < 100) return km.toFixed(1) + ' km';
  return Math.round(km).toLocaleString('en-US') + ' km';
}
function fmtKm2(km2) {
  if (km2 < 1) return Math.round(km2 * 1e6).toLocaleString('en-US') + ' m²';
  return km2.toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' km²';
}
function ringAreaKm2(pts) { // spherical excess (Chamberlain-Duquette), pts=[{la,lo}]
  var a = 0;
  for (var i = 0; i < pts.length; i++) {
    var p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    a += (p2.lo - p1.lo) * D2R * (2 + Math.sin(p1.la * D2R) + Math.sin(p2.la * D2R));
  }
  return Math.abs(a * 6371 * 6371 / 2);
}
var measureClose = null;
function clearMeasure() {
  measureMeshes.forEach(function (m) { globeGroup.remove(m); });
  measureMeshes = []; measurePts = [];
  if (measureClose) { globeGroup.remove(measureClose); measureClose = null; }
  measlabel.style.display = 'none'; measlabel.innerHTML = '';
}
function measureSeg(a, b, lift) {
  var va = latLonToVec3(a.la, a.lo), vb = latLonToVec3(b.la, b.lo);
  var pts = [];
  for (var i = 0; i <= 32; i++) {
    var v = va.clone().lerp(vb, i / 32).normalize().multiplyScalar(lift + Math.sin(Math.PI * i / 32) * 0.05);
    pts.push(v);
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffb347 }));
}
function updateMeasureLabel() {
  var n = measurePts.length;
  if (n === 0) { measlabel.style.display = 'none'; return; }
  if (n === 1) {
    measlabel.innerHTML = '📏 First point set — tap a second point for distance, or keep tapping then ✓ Done for area.';
  } else {
    var html;
    if (n === 2) {
      html = '📏 ' + fmtKm(haversineKm(measurePts[0], measurePts[1]));
    } else {
      var per = 0, i;
      for (i = 0; i < n; i++) per += haversineKm(measurePts[i], measurePts[(i + 1) % n]);
      html = '📐 ' + fmtKm2(ringAreaKm2(measurePts)) + ' · edge ' + fmtKm(per);
    }
    html += ' <button class="abtn" id="measDone">✓ Done</button> <button class="abtn" id="measClear">✕ Clear</button>';
    measlabel.innerHTML = html;
    document.getElementById('measDone').onclick = function () {
      measureMode = false; btnMeasure.classList.remove('on'); btnMeasure.setAttribute('aria-pressed', 'false');
      JAHaudio.speak(measlabel.textContent.replace(/✓ Done|✕ Clear/g, '').trim());
    };
    document.getElementById('measClear').onclick = clearMeasure;
  }
  measlabel.style.display = 'block';
}
function addMeasurePoint(ll) {
  measurePts.push(ll);
  var dot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff5533 }));
  dot.position.copy(latLonToVec3(ll.la, ll.lo).multiplyScalar(1.015));
  globeGroup.add(dot); measureMeshes.push(dot);
  if (measurePts.length >= 2) {
    var seg = measureSeg(measurePts[measurePts.length - 2], ll, 1.02);
    globeGroup.add(seg); measureMeshes.push(seg);
  }
  if (measureClose) { globeGroup.remove(measureClose); measureClose = null; }
  if (measurePts.length >= 3) {
    measureClose = measureSeg(ll, measurePts[0], 1.02);
    globeGroup.add(measureClose);
  }
  updateMeasureLabel();
}

// ---------- tours ----------
var TOURS = [
  { name: '🏛 World Capitals Grand Tour', stops: [['Paris', 'France'], ['London', 'United Kingdom'], ['Tokyo', 'Japan'], ['Cairo', 'Egypt'], ['Nairobi', 'Kenya'], ['New Delhi', 'India'], ['Canberra', 'Australia'], ['Ottawa', 'Canada'], ['Brasilia', 'Brazil'], ['Washington', 'United States']] },
  { name: '🌃 Megacities of Earth', stops: [['Shanghai', 'China'], ['Delhi', 'India'], ['Mexico City', 'Mexico'], ['Cairo', 'Egypt'], ['Mumbai', 'India'], ['Beijing', 'China'], ['Osaka', 'Japan'], ['São Paulo', 'Brazil']] },
  { name: '🌍 Around the World in 80 Seconds', stops: [['Reykjavik', 'Iceland'], ['New York', 'United States'], ['Rio de Janeiro', 'Brazil'], ['Cape Town', 'South Africa'], ['Sydney', 'Australia'], ['Singapore', 'Singapore'], ['Moscow', 'Russia']] }
];
var tourTimer = null, tourActive = false;
var btnStopTour = document.getElementById('btnStopTour');
function stopTour() {
  tourActive = false;
  if (tourTimer) { clearTimeout(tourTimer); tourTimer = null; }
  btnStopTour.style.display = 'none'; JAHaudio.stop();
}
btnStopTour.onclick = stopTour;
function renderTours() {
  var list = document.getElementById('tourList'); list.innerHTML = '';
  TOURS.forEach(function (t) {
    var b = document.createElement('button');
    b.className = 'row';
    b.innerHTML = '<b>' + SE.esc(t.name) + '</b><br><span style="color:#9fb3e8;font-size:.85rem">' + t.stops.length + ' stops</span>';
    b.onclick = function () { startTour(t); };
    list.appendChild(b);
  });
}
function startTour(t) {
  ensureIndex().then(function () {
    var stops = [];
    t.stops.forEach(function (s) { var r = findPlace(s[0], s[1]); if (r) stops.push(r); });
    if (!stops.length) { alert('Tour places are still loading — try again in a moment.'); return; }
    stopTour(); tourActive = true; btnStopTour.style.display = 'inline-block';
    document.getElementById('toursDrawer').classList.remove('open');
    var i = 0;
    (function next() {
      if (!tourActive) return;
      if (i >= stops.length) { stopTour(); JAHaudio.speak('Tour complete. ' + t.name + ' finished.'); return; }
      var rec = stops[i++];
      addMarker(rec);
      flyTo(rec.la, rec.lo, function () {
        if (!tourActive) return;
        openCard(rec);
        JAHaudio.speak('Stop ' + i + ' of ' + stops.length + '. ' + SE.placeText(rec));
        tourTimer = setTimeout(next, 6000);
      });
    })();
  }).catch(function () { alert('Place data is still loading — try again in a moment.'); });
}

// ---------- drawers ----------
function wireDrawer(btnId, drawerId) {
  var b = document.getElementById(btnId), d = document.getElementById(drawerId);
  b.onclick = function () {
    var open = d.classList.toggle('open');
    b.classList.toggle('on', open);
    if (drawerId === 'toursDrawer' && open) { renderTours(); ensureIndex().catch(function () {}); }
    if (drawerId === 'savedDrawer' && open) renderSaved();
  };
}
wireDrawer('btnTours', 'toursDrawer');
wireDrawer('btnSaved', 'savedDrawer');
document.querySelectorAll('[data-close]').forEach(function (x) {
  x.onclick = function () { document.getElementById(x.getAttribute('data-close')).classList.remove('open'); };
});

// ---------- saved ----------
function loadSaved() {
  try { return JSON.parse(JAHPS.get('sigearth-saved') || '[]'); } catch (e) { return []; }
}
function renderSaved() {
  var saved = loadSaved(), list = document.getElementById('savedList');
  list.innerHTML = '';
  if (!saved.length) { list.innerHTML = '<p style="color:#9fb3e8">Nothing saved yet — open any place and tap ⭐ Save.</p>'; return; }
  saved.forEach(function (s) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0';
    var b = document.createElement('button');
    b.className = 'row'; b.style.cssText = 'flex:1;text-align:left;background:#16224a;border:1px solid #2a3a66;color:#eef;border-radius:10px;padding:10px;cursor:pointer';
    b.innerHTML = '<b>' + SE.esc(s.n) + '</b> <span style="color:#9fb3e8">' + SE.esc(s.c) + '</span>';
    b.onclick = function () { selectPlace({ id: s.id, n: s.n, a: s.n, la: s.la, lo: s.lo, c: s.c, r: '', p: 0, e: null, t: '' }); };
    var x = document.createElement('button');
    x.className = 'abtn'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove ' + s.n);
    x.onclick = function () {
      try { JAHPS.set('sigearth-saved', JSON.stringify(loadSaved().filter(function (o) { return o.id !== s.id; }))); } catch (e) {}
      renderSaved();
    };
    row.appendChild(b); row.appendChild(x); list.appendChild(row);
  });
}

// ---------- layers: borders, labels, 3D terrain (public data only) ----------
var bordersGroup = null, labelsGroup = null;
var layersOn = { borders: false, labels: false, terrain: true };
var elevData = null; // {w,h,px:Uint8ClampedArray} equirect elevation 0..255
function ensureElevation(cb) {
  if (elevData) { cb(elevData); return; }
  var img = new Image();
  img.onload = function () {
    try {
      var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      var g = c.getContext('2d'); g.drawImage(img, 0, 0);
      var d = g.getImageData(0, 0, c.width, c.height).data;
      var px = new Uint8ClampedArray(c.width * c.height);
      for (var i = 0; i < px.length; i++) px[i] = d[i * 4];
      elevData = { w: c.width, h: c.height, px: px };
      cb(elevData);
    } catch (e) { cb(null); }
  };
  img.onerror = function () { cb(null); };
  img.src = 'assets/elevation.png';
}
function elevMeters(la, lo) {
  if (!elevData) return 0;
  var x = Math.min(elevData.w - 1, Math.max(0, Math.floor((lo + 180) / 360 * elevData.w)));
  var y = Math.min(elevData.h - 1, Math.max(0, Math.floor((90 - la) / 180 * elevData.h)));
  return elevData.px[y * elevData.w + x] / 255 * 9500 - 500;
}
var sphereBase = null, TER_EXAG = 45;
function applyTerrain(on) {
  layersOn.terrain = on;
  var pos = sphere.geometry.attributes.position;
  if (!sphereBase) {
    sphereBase = new Float32Array(pos.array.length);
    sphereBase.set(pos.array);
  }
  if (!on || !elevData) {
    pos.array.set(sphereBase);
  } else {
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.set(sphereBase[i * 3], sphereBase[i * 3 + 1], sphereBase[i * 3 + 2]);
      var ll = vec3ToLatLon(v.clone().normalize());
      var r = 1 + (elevMeters(ll.la, ll.lo) / 6371000) * TER_EXAG;
      v.normalize().multiplyScalar(r);
      pos.array[i * 3] = v.x; pos.array[i * 3 + 1] = v.y; pos.array[i * 3 + 2] = v.z;
    }
  }
  pos.needsUpdate = true;
  sphere.geometry.computeVertexNormals();
}
function setTerrain(on) {
  ensureElevation(function () { applyTerrain(on); });
}
function setBordersGlobe(on) {
  layersOn.borders = on;
  if (!bordersGroup) {
    bordersGroup = new THREE.Group();
    fetch('data/borders.geojson').then(function (r) { return r.json(); }).then(function (gj) {
      gj.features.forEach(function (f) {
        var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        polys.forEach(function (poly) {
          poly.forEach(function (ring) {
            var pts = ring.map(function (c) { return latLonToVec3(c[1], c[0]).multiplyScalar(1.004); });
            bordersGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({ color: 0xd4a017, transparent: true, opacity: 0.75 })));
          });
        });
      });
      if (layersOn.borders) globeGroup.add(bordersGroup);
    }).catch(function () {});
    return;
  }
  if (on) globeGroup.add(bordersGroup); else globeGroup.remove(bordersGroup);
}
function setLabelsGlobe(on) {
  layersOn.labels = on;
  if (!labelsGroup) {
    labelsGroup = new THREE.Group();
    fetch('data/borders.geojson').then(function (r) { return r.json(); }).then(function (gj) {
      gj.features.forEach(function (f) {
        var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        var best = null, bestW = 0;
        polys.forEach(function (poly) {
          var ring = poly[0], minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, i;
          for (i = 0; i < ring.length; i++) {
            var c = ring[i];
            if (c[0] < minx) minx = c[0]; if (c[0] > maxx) maxx = c[0];
            if (c[1] < miny) miny = c[1]; if (c[1] > maxy) maxy = c[1];
          }
          var w = (maxx - minx) * (maxy - miny);
          if (w > bestW) { bestW = w; best = [(miny + maxy) / 2, (minx + maxx) / 2]; }
        });
        if (!best) return;
        var c2 = document.createElement('canvas'); c2.width = 256; c2.height = 64;
        var g2 = c2.getContext('2d');
        g2.font = 'bold 30px system-ui,sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.lineWidth = 5; g2.strokeStyle = 'rgba(4,8,18,0.9)';
        g2.strokeText(f.properties.name, 128, 32); g2.fillStyle = '#ffe9a8';
        g2.fillText(f.properties.name, 128, 32);
        var tex2 = new THREE.CanvasTexture(c2);
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex2, transparent: true, depthTest: false, opacity: 0.92 }));
        sp.position.copy(latLonToVec3(best[0], best[1]).multiplyScalar(1.02));
        sp.scale.set(0.34, 0.085, 1);
        labelsGroup.add(sp);
      });
      if (layersOn.labels) globeGroup.add(labelsGroup);
    }).catch(function () {});
    return;
  }
  if (on) globeGroup.add(labelsGroup); else globeGroup.remove(labelsGroup);
}
// compass: click resets a north-up-ish default view (keeps zoom)
var compassEl = document.getElementById('compass');
if (compassEl) {
  compassEl.style.pointerEvents = 'auto';
  compassEl.style.cursor = 'pointer';
  compassEl.title = 'Reset north-up view';
  compassEl.onclick = function () {
    targetRX = 0.42; targetRY = -1.1; tiltA = 0.19; idleT = 0; flying = false;
  };
}

// ---------- toolbar extras ----------
document.getElementById('btnZoomIn').onclick = function () { targetDist = Math.max(1.7, targetDist * 0.82); idleT = 0; };
document.getElementById('btnZoomOut').onclick = function () { targetDist = Math.min(6, targetDist * 1.22); idleT = 0; };
document.getElementById('btnReset').onclick = function () {
  stopTour(); clearMeasure(); clearMarkers(); card.classList.remove('open'); JAHaudio.stop();
  targetRX = 0.42; targetRY = -1.1; targetDist = DEF_DIST; idleT = 0;
};

// ---------- main loop ----------
var clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(0.05, clock.getDelta());
  if (flight) {
    flight.t += dt / flight.dur;
    var e = easeIO(Math.min(1, flight.t));
    var dir = flight.from.clone().lerp(flight.to, e).normalize();
    var dist = flight.d0 + (2.55 - flight.d0) * e + Math.sin(Math.PI * e) * 0.55;
    camera.position.copy(dir.multiplyScalar(dist));
    camera.lookAt(0, 0, 0);
    // keep globe orientation matched so markers stay glued
    if (flight.t >= 1) { var cb = flight.done; flight = null; flying = false; idleT = 0; if (cb) cb(); }
  } else {
    idleT += dt;
    if (idleT > 5 && !measureMode) targetRY += dt * 0.035;
    globeGroup.rotation.y += (targetRY - globeGroup.rotation.y) * Math.min(1, dt * 7);
    globeGroup.rotation.x += (targetRX - globeGroup.rotation.x) * Math.min(1, dt * 7);
    var cd = camera.position.length();
    var nd = cd + (targetDist - cd) * Math.min(1, dt * 6);
    camera.position.set(0, Math.sin(tiltA), Math.cos(tiltA)).multiplyScalar(nd);
    camera.lookAt(0, 0, 0);
  }
  if (needle) needle.style.transform = 'rotate(' + (-globeGroup.rotation.y * R2D % 360) + 'deg)';
  renderer.render(scene, camera);
}
// tilt controls (Google-Earth-style navigation)
function wireTilt(id, dir) {
  var b = document.getElementById(id);
  if (b) b.onclick = function () {
    tiltA = Math.max(TILT_MIN, Math.min(TILT_MAX, tiltA + dir * 0.12));
    idleT = 0;
  };
}
wireTilt('btnTiltUp', 1); wireTilt('btnTiltDn', -1);
// layers panel
var layersPanelOpen = false;
var btnLayers = document.getElementById('btnLayers');
if (btnLayers) btnLayers.onclick = function () {
  layersPanelOpen = !layersPanelOpen;
  document.getElementById('layersPanel').classList.toggle('open', layersPanelOpen);
  btnLayers.classList.toggle('on', layersPanelOpen);
};
function wireLayerChk(id, fn) {
  var c = document.getElementById(id);
  if (c) c.onchange = function () { fn(c.checked); };
}
wireLayerChk('lyBorders', setBordersGlobe);
wireLayerChk('lyLabels', setLabelsGlobe);
wireLayerChk('lyTerrain', setTerrain);
var btnAiGlobe = document.getElementById('btnAi');
if (btnAiGlobe) btnAiGlobe.onclick = function () { if (window.EarthAI) window.EarthAI.toggle(); };

// ---------- EarthControl API (drives the globe from the AI pal) ----------
function zoomToDist(z) { return Math.max(1.7, Math.min(6, 7.5 - z * 0.35)); }
window.EarthControl = {
  mode: 'globe',
  flyTo: function (la, lo, zoom, rec) {
    if (zoom) targetDist = zoomToDist(zoom);
    if (rec) selectPlace(rec);
    else {
      addMarker({ la: la, lo: lo, n: 'Pinned spot' });
      flyTo(la, lo);
    }
  },
  setZoom: function (z) { targetDist = zoomToDist(z); idleT = 0; },
  zoomIn: function () { targetDist = Math.max(1.7, targetDist * 0.82); idleT = 0; },
  zoomOut: function () { targetDist = Math.min(6, targetDist * 1.22); idleT = 0; },
  getView: function () {
    globeGroup.updateMatrixWorld(true);
    var dir = camera.position.clone().normalize();
    var local = globeGroup.worldToLocal(dir.clone()).normalize();
    var ll = vec3ToLatLon(local);
    var ang = Math.asin(Math.min(1, 1 / camera.position.length())) * R2D;
    return { la: ll.la, lo: ll.lo, zoom: 7.5 - camera.position.length() / 0.35, bbox: [ll.la - ang, ll.lo - ang, ll.la + ang, ll.lo + ang] };
  },
  toggleLayer: function (name, on) {
    if (name === 'borders') { setBordersGlobe(on); var a = document.getElementById('lyBorders'); if (a) a.checked = on; }
    else if (name === 'labels') { setLabelsGlobe(on); var b = document.getElementById('lyLabels'); if (b) b.checked = on; }
    else if (name === 'terrain') { setTerrain(on); var c = document.getElementById('lyTerrain'); if (c) c.checked = on; }
  },
  measure: function (a, b) {
    if (!measureMode) btnMeasure.onclick();
    clearMeasure();
    addMeasurePoint({ la: a.la, lo: a.lo });
    addMeasurePoint({ la: b.la, lo: b.lo });
  },
  geocode: function (q) {
    return ensureIndex().then(function (rows) {
      var ql = q.toLowerCase();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][0].toLowerCase() === ql)
          return { kind: 'place', label: rows[i][0], sub: rows[i][3], la: rows[i][1], lo: rows[i][2], zoom: 10 };
      }
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
  }
};

globeGroup.rotation.set(targetRX, targetRY, 0);
animate();
ensureIndex().catch(function () {});
})();
