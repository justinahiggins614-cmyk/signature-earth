// Signature Earth — Places A–Z gazetteer archive.
(function () {
'use strict';
var lettersEl = document.getElementById('letters');
var listEl = document.getElementById('list');
var listTitle = document.getElementById('listTitle');
var searchInput = document.getElementById('psearch');
var suggest = document.getElementById('psuggest');
var indexRows = null, indexP = null, curLetter = null, curRows = [], shown = 0;
var PER = 120;

function ensureIndex() {
  if (indexRows) return Promise.resolve(indexRows);
  if (indexP) return indexP;
  indexP = SE.fetchGz('data/index/names.json.gz').then(function (r) { indexRows = r; indexP = null; return r; })
    .catch(function (e) { indexP = null; throw e; });
  return indexP;
}

fetch('data/index/stats.json').then(function (r) { return r.json(); }).then(function (s) {
  document.getElementById('statline').textContent =
    s.total.toLocaleString('en-US') + ' real places and counting — every record a real gazetteer entry, marching toward 1,000,000.';
  var keys = Object.keys(s.letters).sort();
  keys.forEach(function (L) {
    var b = document.createElement('button');
    b.className = 'lbtn';
    b.innerHTML = '<b>' + SE.esc(L) + '</b><span>' + s.letters[L].toLocaleString('en-US') + '</span>';
    b.onclick = function () { openLetter(L); };
    lettersEl.appendChild(b);
  });
  pickOfDay();
}).catch(function () {
  lettersEl.innerHTML = '<p style="color:#9fb3e8">Place data is still loading — reload in a moment.</p>';
  var sl = document.getElementById('statline');
  if (sl) sl.textContent = 'The gazetteer is waking up — reload in a moment.';
});

function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pickOfDay() {
  ensureIndex().then(function (rows) {
    var day = new Date().toISOString().slice(0, 10);
    var rec = rows[hashStr('sigearth-' + day) % rows.length];
    var r = { id: rec[6], n: rec[0], la: rec[1], lo: rec[2], c: rec[3], r: rec[4], p: rec[5], e: null, t: '' };
    var el = document.getElementById('potd');
    el.innerHTML =
      '<h3>⭐ Place of the Day — ' + SE.esc(day) + '</h3>' +
      '<p class="potd-name">📍 <a href="globe.html?place=' + r.id + '">' + SE.esc(r.n) + '</a></p>' +
      '<p class="meta">' + SE.esc(SE.placeText(r)) + '</p>' +
      '<div class="acts"><button class="abtn" id="potdRead">🔊 Read aloud</button>' +
      '<button class="abtn" id="potdCopy">📋 Copy</button>' +
      '<button class="abtn" id="potdGo">🌍 Fly there</button></div>';
    el.style.display = 'block';
    document.getElementById('potdRead').onclick = function () { JAHaudio.speak(SE.placeText(r)); };
    document.getElementById('potdCopy').onclick = function () { SE.copyText(SE.placeText(r), document.getElementById('potdCopy')); };
    document.getElementById('potdGo').onclick = function () { location.href = 'globe.html?place=' + r.id; };
  }).catch(function () {});
}

function openLetter(L) {
  curLetter = L; shown = 0; curRows = [];
  listTitle.textContent = 'Loading ' + L + '…';
  listEl.innerHTML = '';
  SE.fetchGz('data/places/' + (L === '#' ? 'hash' : L) + '.json.gz').then(function (rows) {
    curRows = rows;
    listTitle.textContent = '“' + L + '” — ' + rows.length.toLocaleString('en-US') + ' places';
    renderMore();
  }).catch(function (e) {
    listTitle.textContent = 'Could not load letter ' + L + ' (' + e.message + ')';
  });
}
function renderMore() {
  var frag = document.createDocumentFragment();
  var end = Math.min(curRows.length, shown + PER);
  for (var i = shown; i < end; i++) {
    (function (r) {
      var a = document.createElement('a');
      a.className = 'prow'; a.href = 'globe.html?place=' + r.id;
      a.innerHTML = '<b>' + SE.esc(r.n) + '</b><span>' + SE.esc(r.c) + (r.p ? ' · ' + SE.fmtPop(r.p) : '') + '</span>';
      frag.appendChild(a);
    })(curRows[i]);
  }
  listEl.appendChild(frag);
  shown = end;
  var more = document.getElementById('moreBtn');
  if (shown < curRows.length) {
    if (!more) {
      more = document.createElement('button');
      more.id = 'moreBtn'; more.className = 'tbtn';
      more.onclick = renderMore;
      listEl.appendChild(more);
    } else { listEl.appendChild(more); }
    more.textContent = 'Show more (' + (curRows.length - shown).toLocaleString('en-US') + ' remaining)';
    more.style.display = '';
  } else if (more) more.style.display = 'none';
}

// archive search
var lastResults = [];
searchInput.addEventListener('input', function () {
  var q = searchInput.value.trim().toLowerCase();
  if (q.length < 2) { suggest.style.display = 'none'; return; }
  suggest.style.display = 'block';
  suggest.innerHTML = '<button disabled>Loading…</button>';
  ensureIndex().then(function (rows) {
    var out = [];
    for (var i = 0; i < rows.length && out.length < 8; i++) {
      if (rows[i][0].toLowerCase().indexOf(q) === 0) out.push(rows[i]);
    }
    lastResults = out;
    if (!out.length) { suggest.innerHTML = '<button disabled>No places found.</button>'; return; }
    suggest.innerHTML = '';
    out.forEach(function (r) {
      var b = document.createElement('button');
      b.innerHTML = '<b>' + SE.esc(r[0]) + '</b> <span style="color:#9fb3e8">' + SE.esc(r[3]) + '</span>';
      b.onclick = function () { location.href = 'globe.html?place=' + r[6]; };
      suggest.appendChild(b);
    });
  }).catch(function () { suggest.innerHTML = '<button disabled>Place data failed to load.</button>'; });
});
searchInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && lastResults.length) location.href = 'globe.html?place=' + lastResults[0][6];
});
document.addEventListener('click', function (e) {
  if (!e.target.closest('.searchwrap')) suggest.style.display = 'none';
});
})();
