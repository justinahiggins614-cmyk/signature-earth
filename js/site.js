// Shared helpers for Signature Earth.
window.SE = (function () {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fetchGz(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unzip data files.');
      var ds = new DecompressionStream('gzip');
      return r.blob().then(function (b) {
        return new Response(b.stream().pipeThrough(ds)).json();
      });
    });
  }
  function copyText(t, btn) {
    function done(ok) {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ok ? '✓ Copied' : 'Copy failed';
      setTimeout(function () { btn.textContent = old; }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); });
    } else {
      try {
        var ta = document.createElement('textarea');
        ta.value = t; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); done(true);
      } catch (e) { done(false); }
    }
  }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function fmtPop(p) {
    p = +p || 0;
    if (p >= 1e6) return (p / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (p >= 1e3) return (p / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(p);
  }
  function fmtCoords(la, lo) {
    function d(v, pos, neg) {
      return Math.abs(v).toFixed(2) + '° ' + (v >= 0 ? pos : neg);
    }
    return d(la, 'N', 'S') + ', ' + d(lo, 'E', 'W');
  }
  function placeText(r) {
    // r: {id,n,a,la,lo,c,r,p,e,t} or search row [a,la,lo,c,r,p,id]
    var o = Array.isArray(r)
      ? { n: r[0], la: r[1], lo: r[2], c: r[3], r: r[4], p: r[5], id: r[6], t: '' }
      : r;
    var bits = [o.n, o.r ? o.r + ', ' + o.c : o.c, fmtCoords(o.la, o.lo)];
    if (o.p) bits.push('Population ' + fmtPop(o.p));
    if (o.e != null) bits.push('Elevation ' + o.e + ' m');
    if (o.t) bits.push('Timezone ' + o.t);
    return bits.join('. ') + '.';
  }
  return { esc: esc, fetchGz: fetchGz, copyText: copyText, download: download, fmtPop: fmtPop, fmtCoords: fmtCoords, placeText: placeText };
})();
