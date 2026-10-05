// Signature Earth — Addresses A–Z archive (million-address march).
// Every record is a REAL geocoded address from Nominatim/OpenStreetMap
// (dedupe key: OSM place_id) — never invented. Rows: [id,label,lat,lon,country,place_id].
(function () {
'use strict';
var lettersEl = document.getElementById('letters');
var listEl = document.getElementById('list');
var listTitle = document.getElementById('listTitle');
var searchInput = document.getElementById('asearch');
var suggest = document.getElementById('asuggest');
var indexRows = null, indexP = null, shown = 0, curRows = [];
var PER = 120;

function ensureIndex() {
  if (indexRows) return Promise.resolve(indexRows);
  if (indexP) return indexP;
  indexP = SE.fetchGz('data/addresses/index.json.gz').then(function (r) { indexRows = r; indexP = null; return r; })
    .catch(function (e) { indexP = null; throw e; });
  return indexP;
}
function satLink(r) { // r: row — deep link: globe fly-to + satellite + close-up
  return 'globe.html?ll=' + r[2].toFixed(5) + ',' + r[3].toFixed(5) + '&view=sat';
}
function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

fetch('data/addresses/stats.json').then(function (r) { return r.json(); }).then(function (s) {
  document.getElementById('statline').textContent =
    s.total.toLocaleString('en-US') + ' real addresses and counting — every record a real geocoded address, marching toward ' +
    s.goal.toLocaleString('en-US') + '.';
  var keys = Object.keys(s.letters || {}).sort();
  keys.forEach(function (L) {
    var b = document.createElement('button');
    b.className = 'lbtn';
    b.innerHTML = '<b>' + SE.esc(L) + '</b><span>' + s.letters[L].toLocaleString('en-US') + '</span>';
    b.onclick = function () { openLetter(L); };
    lettersEl.appendChild(b);
  });
  bestOfBest();
}).catch(function () {
  lettersEl.innerHTML = '<p style="color:#9fb3e8">The address archive is still waking up — reload in a moment.</p>';
  var sl = document.getElementById('statline');
  if (sl) sl.textContent = 'The address archive is waking up — reload in a moment.';
});

function bestCard(r) {
  return '<h3>⭐ AI&rsquo;s Best of the Best</h3>' +
    '<p class="potd-name">📍 <a href="' + satLink(r) + '">' + SE.esc(r[1]) + '</a></p>' +
    '<p class="meta">' + SE.esc(r[4] || '') + ' · ' + SE.esc(SE.fmtCoords(r[2], r[3])) +
    ' · <span style="color:#9fb3e8">' + SE.esc(r[0]) + '</span></p>' +
    '<div class="acts"><button class="abtn" id="botbRead">🔊 Read aloud</button>' +
    '<button class="abtn" id="botbCopy">📋 Copy</button>' +
    '<button class="abtn" id="botbGo">🛰 Fly there in satellite</button></div>';
}
function bestOfBest() {
  ensureIndex().then(function (rows) {
    if (!rows.length) return;
    var day = new Date().toISOString().slice(0, 10);
    var r = rows[hashStr('sigearth-addr-' + day) % rows.length];
    var el = document.getElementById('potd');
    el.innerHTML = bestCard(r);
    el.style.display = 'block';
    document.getElementById('botbRead').onclick = function () {
      JAHaudio.speak(r[1] + '. ' + (r[4] || '') + '. ' + SE.fmtCoords(r[2], r[3]) + '.');
    };
    document.getElementById('botbCopy').onclick = function () {
      SE.copyText(r[1] + ' — ' + SE.fmtCoords(r[2], r[3]) + ' See it: ' + location.origin + location.pathname.replace(/addresses\.html$/, '') + satLink(r), document.getElementById('botbCopy'));
    };
    document.getElementById('botbGo').onclick = function () { location.href = satLink(r); };
  }).catch(function () {});
}

function openLetter(L) {
  shown = 0; curRows = [];
  listTitle.textContent = 'Loading ' + L + '…';
  listEl.innerHTML = '';
  ensureIndex().then(function (rows) {
    curRows = rows.filter(function (r) {
      var c = (r[1].charAt(0) || '#').toUpperCase();
      if (c < 'A' || c > 'Z') c = '#';
      return c === L;
    });
    listTitle.textContent = '“' + L + '” — ' + curRows.length.toLocaleString('en-US') + ' addresses';
    renderMore();
  }).catch(function (e) {
    listTitle.textContent = 'Could not load the archive (' + e.message + ')';
  });
}
function renderMore() {
  var frag = document.createDocumentFragment();
  var end = Math.min(curRows.length, shown + PER);
  for (var i = shown; i < end; i++) {
    (function (r) {
      var a = document.createElement('a');
      a.className = 'prow'; a.href = satLink(r);
      a.innerHTML = '<b>🛰 ' + SE.esc(r[1]) + '</b><span>' + SE.esc(r[4] || '') + ' · ' + SE.esc(r[0]) + '</span>';
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
      if (rows[i][1].toLowerCase().indexOf(q) >= 0) out.push(rows[i]);
    }
    lastResults = out;
    if (!out.length) { suggest.innerHTML = '<button disabled>No addresses found.</button>'; return; }
    suggest.innerHTML = '';
    out.forEach(function (r) {
      var b = document.createElement('button');
      b.innerHTML = '<b>🛰 ' + SE.esc(r[1]) + '</b> <span style="color:#9fb3e8">' + SE.esc(r[4] || '') + '</span>';
      b.onclick = function () { location.href = satLink(r); };
      suggest.appendChild(b);
    });
  }).catch(function () { suggest.innerHTML = '<button disabled>Archive failed to load.</button>'; });
});
searchInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && lastResults.length) location.href = satLink(lastResults[0]);
});
document.addEventListener('click', function (e) {
  if (!e.target.closest('.searchwrap')) suggest.style.display = 'none';
});

// ---------- Ask the AI about the archive ----------
// Honest client-side finder: matches the archive index, never invents answers.
var askInput = document.getElementById('askInput'), askBtn = document.getElementById('askBtn'), askOut = document.getElementById('askOut');
function askArchive(q) {
  askOut.style.display = 'block';
  askOut.innerHTML = '<p style="color:#9fb3e8">Looking through the address archive…</p>';
  ensureIndex().then(function (rows) {
    var ql = q.trim().toLowerCase();
    if (ql.length < 2) { askOut.innerHTML = '<p style="color:#9fb3e8">Type a street, city, or country to search the archive.</p>'; return; }
    var words = ql.split(/\s+/), scored = [];
    for (var i = 0; i < rows.length; i++) {
      var hay = (rows[i][1] + ' ' + (rows[i][4] || '')).toLowerCase();
      var score = 0;
      words.forEach(function (w) { if (w.length > 1 && hay.indexOf(w) >= 0) score += w.length; });
      if (score > 0) scored.push([score, rows[i]]);
    }
    scored.sort(function (a, b) { return b[0] - a[0]; });
    var top = scored.slice(0, 3);
    if (!top.length) {
      askOut.innerHTML = '<p>The archive has no address matching <b>' + SE.esc(q) + '</b> yet — it grows every 2 hours. Try the globe search for any street address in the world.</p>';
      return;
    }
    var html = '<p>Found ' + scored.length.toLocaleString('en-US') + ' match' + (scored.length === 1 ? '' : 'es') + ' for <b>' + SE.esc(q) + '</b>:</p>';
    top.forEach(function (t) {
      var r = t[1];
      html += '<p>📍 <a href="' + satLink(r) + '" style="color:#fff">' + SE.esc(r[1]) + '</a><br>' +
        '<span style="color:#9fb3e8">' + SE.esc(r[4] || '') + ' · ' + SE.esc(SE.fmtCoords(r[2], r[3])) + ' · ' + SE.esc(r[0]) + '</span></p>';
    });
    askOut.innerHTML = html;
    JAHaudio.speak('Found ' + scored.length + ' matches. Top result: ' + top[0][1][1]);
  }).catch(function () {
    askOut.innerHTML = '<p style="color:#9fb3e8">The archive is still loading — try again in a moment.</p>';
  });
}
askBtn.onclick = function () { askArchive(askInput.value); };
askInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') askArchive(askInput.value); });
})();
