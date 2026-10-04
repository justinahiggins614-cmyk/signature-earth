// Functional harness for Signature Earth: runs the REAL js/globe.js + js/places.js
// against a stubbed DOM + minimal THREE, exercising search→fly→card,
// measure, tours, saved places, and the A–Z archive. Exits non-zero on failure.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS', msg); }
  else { failures++; console.log('  FAIL', msg); }
}

// ---------- element stub ----------
function makeEl(id) {
  const el = {
    id, children: [], listeners: {}, style: {}, dataset: {},
    _innerHTML: '', _text: '', value: '', disabled: false,
    __isFrag: id === 'frag',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); return f; },
      contains(c) { return this._s.has(c); }
    },
    set innerHTML(v) { this._innerHTML = v; this.children = []; },
    get innerHTML() { return this._innerHTML; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    appendChild(c) {
      if (c && c.__isFrag) { c.children.forEach(k => this.children.push(k)); return c; }
      this.children.push(c); return c;
    },
    remove() {}, click() {}, focus() {},
    setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
    scrollIntoView() {}, closest() { return null; },
    querySelectorAll() { return []; },
    getContext() {
      return { fillStyle: '', strokeStyle: '', beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, fillRect() {} };
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 500 }; },
    setPointerCapture() {},
  };
  Object.defineProperty(el, 'clientWidth', { get: () => 800 });
  Object.defineProperty(el, 'clientHeight', { get: () => 500 });
  return el;
}
const els = {};
function $(id) {
  if (id === 'moreBtn' && !els.__moreBtnCreated) return null;
  return els[id] || (els[id] = makeEl(id));
}

// ---------- THREE stub (real Vector3 math) ----------
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  setLength(l) { return this.normalize().multiplyScalar(l); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  applyMatrix4() { return this; }
}
let rayHits = []; // queued by tests: [{point:V3, object}]
class Raycaster {
  setFromCamera() {}
  intersectObject() { return rayHits.splice(0, 1); }
  intersectObjects() { return []; }
}
const madeMeshes = [];
class Mesh {
  constructor(g, m) { this.geometry = g; this.material = m || {}; this.position = new V3(); this.userData = {}; madeMeshes.push(this); }
}
const THREE = {
  Vector3: V3, Raycaster,
  WebGLRenderer: class { constructor() {} setPixelRatio() {} setSize() {} render() {} },
  Scene: class { constructor() { this.children = []; } add(o) { this.children.push(o); } },
  PerspectiveCamera: class {
    constructor() { this.position = new V3(0, 0.6, 3.2); this.aspect = 1; }
    updateProjectionMatrix() {} lookAt() {}
  },
  Color: class { constructor() {} },
  Group: class {
    constructor() { this.children = []; this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; }
    add(o) { this.children.push(o); } remove(o) { this.children = this.children.filter(c => c !== o); }
    updateMatrixWorld() {} worldToLocal(v) { return v.clone(); }
  },
  Mesh, SphereGeometry: class {}, BufferGeometry: class { setAttribute() {} setFromPoints() {} },
  BufferAttribute: class {}, Points: class {}, PointsMaterial: class {},
  CanvasTexture: class {}, TextureLoader: class { load(u, ok) { if (ok) setTimeout(() => ok({ encoding: 0 }), 0); return {}; } },
  Sprite: class extends Mesh {
    constructor(m) { super(null, m); this.scale = { set() {} }; }
  },
  SpriteMaterial: class { dispose() {} }, Line: class extends Mesh {}, LineBasicMaterial: class {},
  MeshBasicMaterial: class {}, MeshPhongMaterial: class {}, DirectionalLight: class { constructor() { this.position = new V3(); } },
  AmbientLight: class {}, ShaderMaterial: class {},
  AdditiveBlending: 1, BackSide: 2, SRGBEncoding: 3001,
  Clock: class { getDelta() { return 0.016; } },
};

// ---------- browser globals ----------
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
};
const fileMap = {
  'data/index/names.json.gz': 'data/index/names.json.gz',
  'data/places/A.json.gz': 'data/places/A.json.gz',
};
global.fetch = async (url) => {
  const rel = String(url).replace(/^\//, '');
  const p = path.join(ROOT, fileMap[rel] || rel);
  if (!fs.existsSync(p)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(p);
  const readJson = () => { try { return JSON.parse(zlib.gunzipSync(buf).toString()); } catch (e) { return JSON.parse(buf.toString()); } };
  return { ok: true, status: 200, blob: async () => new Blob([buf]), json: async () => readJson() };
};
if (typeof global.DecompressionStream === 'undefined') {
  global.DecompressionStream = class extends TransformStream {
    constructor() {
      const gz = zlib.createGunzip();
      const pending = [];
      gz.on('data', c => pending.push(c));
      super({
        transform(chunk, ctl) {
          pending.length = 0;
          gz.write(Buffer.from(chunk));
          for (const c of pending.splice(0)) ctl.enqueue(new Uint8Array(c));
        },
        flush(ctl) {
          return new Promise((res, rej) => {
            const out = [];
            gz.on('data', c => out.push(c));
            gz.on('end', () => { for (const c of out) ctl.enqueue(new Uint8Array(c)); res(); });
            gz.on('error', rej);
            gz.end();
          });
        }
      });
    }
  };
}
global.speechSynthesis = { cancel() {}, speak(u) { global.__spoken = (global.__spoken || []).concat(u.text || ''); }, getVoices: () => [] };
global.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; };
function stepFrames(n) { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; if (cb) cb(); } }
global.window = global;
global.addEventListener = (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); };
global.removeEventListener = () => {};
global.devicePixelRatio = 1;
const docListeners = {};
global.document = {
  getElementById: $,
  createElement: (t) => makeEl('anon-' + t),
  createDocumentFragment: () => makeEl('frag'),
  querySelectorAll: () => [],
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  body: makeEl('body'),
};
global.location = { search: '', origin: 'http://x', pathname: '/globe.html', href: 'http://x/globe.html' };
global.alert = (m) => { global.__alert = m; };
global.THREE = THREE;
if (typeof global.Blob === 'undefined') global.Blob = class {};
if (typeof global.URL === 'undefined') global.URL = {};
global.URL.createObjectURL = () => 'blob:x';
global.URL.revokeObjectURL = () => {};

function fire(el, type, extra) {
  const ev = Object.assign({ target: el, preventDefault() {} }, extra);
  if (type === 'click' && typeof el.onclick === 'function') el.onclick(ev);
  (el.listeners[type] || []).forEach(fn => fn(ev));
}
function flush(ms = 0) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // ============ GLOBE ============
  console.log('GLOBE TESTS');
  require(path.join(ROOT, 'js/audio.js'));
  require(path.join(ROOT, 'js/site.js'));
  require(path.join(ROOT, 'js/globe.js'));
  await flush(50); stepFrames(5);

  // 1. search -> suggestions -> select Paris
  console.log('— search & fly-to');
  const search = $('search'), suggest = $('suggest');
  search.value = 'par';
  fire(search, 'input');
  await flush(900);
  assert(suggest.children.length > 0, 'suggestions rendered for "par"');
  const parisBtn = suggest.children.find(b => (b.innerHTML || '').includes('Paris'));
  assert(!!parisBtn, 'Paris among suggestions');
  parisBtn.onclick();
  stepFrames(160); // fly-to completes (~1.7s)
  await flush(20);
  assert($('card').classList.contains('open'), 'place card opened after fly-to');
  assert($('cardName').textContent.includes('Paris'), 'card shows Paris, got: ' + $('cardName').textContent);
  assert($('cardMeta').innerHTML.includes('France'), 'card meta shows France');

  // 2. card actions: read / copy / download / save
  console.log('— card actions');
  fire($('cardRead'), 'click');
  assert((global.__spoken || []).join(' ').includes('Paris'), 'read-aloud spoke the place text');
  fire($('cardSave'), 'click');
  const saved = JSON.parse(store['sigearth-saved'] || '[]');
  assert(saved.length === 1 && saved[0].n === 'Paris', 'place saved to localStorage');
  fire($('cardDl'), 'click'); // must not throw
  assert(true, 'download handler ran without throwing');

  // 3. measure: two taps -> distance label
  console.log('— measure');
  fire($('btnMeasure'), 'click');
  assert($('btnMeasure').classList.contains('on'), 'measure mode toggles on');
  // tap 1 at (lat 0, lon 0) => local dir for lon0,lat0 = (cos0? ) latLonToVec3(0,0) = (-cos(pi),0,sin(pi)) = (1,0,~0)
  rayHits = [{ point: new V3(1, 0, 0), object: madeMeshes[0] }];
  const gl = $('globe');
  fire(gl, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  fire(gl, 'pointerup', { pointerId: 1, clientX: 101, clientY: 100 });
  // tap 2 at (lat 0, lon 90E): phi=(90+180)*D2R=1.5pi -> x=-cos(1.5pi)=0, z=sin(1.5pi)=-1
  rayHits = [{ point: new V3(0, 0, -1), object: madeMeshes[0] }];
  fire(gl, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
  fire(gl, 'pointerup', { pointerId: 2, clientX: 201, clientY: 100 });
  const ml = $('measlabel');
  assert(ml.style.display === 'block' && ml.innerHTML.includes('km'), 'measure label shows distance, got: ' + ml.innerHTML.slice(0, 80));
  const km = parseFloat(ml.innerHTML.replace(/[^0-9]/g, '').slice(0, 5));
  assert(km > 9900 && km < 10100, 'quarter-earth distance ≈ 10,008 km, label says ' + ml.innerHTML.slice(0, 60));
  assert((global.__spoken || []).join(' ').includes('kilometers'), 'distance read aloud');

  // 4. tours resolve + start
  console.log('— tours');
  fire($('btnTours'), 'click');
  assert($('toursDrawer').classList.contains('open'), 'tours drawer opens');
  const tourBtns = $('tourList').children.filter(c => c.onclick);
  assert(tourBtns.length === 3, 'three tours listed, got ' + tourBtns.length);
  tourBtns[0].onclick();
  await flush(50); stepFrames(160); await flush(20);
  assert($('cardName').textContent.includes('Paris'), 'capitals tour first stop = Paris, got: ' + $('cardName').textContent);
  assert($('btnStopTour').style.display !== 'none', 'stop-tour button visible during tour');
  fire($('btnStopTour'), 'click');
  assert($('btnStopTour').style.display === 'none', 'tour stops');

  // 5. zoom + reset buttons do something sane (no throw)
  console.log('— toolbar');
  ['btnZoomIn', 'btnZoomOut', 'btnReset'].forEach(id => { fire($(id), 'click'); });
  stepFrames(5);
  assert(true, 'zoom/reset handlers ran without throwing');

  // 6. deep link ?place=
  console.log('— deep link');
  // (tested implicitly via selectPlace path; verify findPlace via search "tokyo")
  search.value = 'tokyo';
  fire(search, 'input');
  await flush(900);
  const tokyoBtn = suggest.children.find(b => (b.innerHTML || '').includes('Tokyo'));
  assert(!!tokyoBtn, 'Tokyo found in search');

  // ============ PLACES ============
  console.log('PLACES TESTS');
  Object.keys(els).forEach(k => delete els[k]); // fresh DOM
  global.location = { search: '', origin: 'http://x', pathname: '/places.html', href: 'http://x/places.html' };
  require(path.join(ROOT, 'js/places.js'));
  await flush(400);
  assert($('statline').textContent.includes('69,763'), 'statline stamped with real count: ' + $('statline').textContent.slice(0, 60));
  assert($('letters').children.length >= 26, 'letter buttons rendered: ' + $('letters').children.length);
  const btnA = $('letters').children.find(b => (b.innerHTML || '').includes('>A<'));
  assert(!!btnA, 'letter A button exists');
  btnA.onclick();
  await flush(800);
  assert($('list').children.length > 50, 'letter A entries rendered: ' + $('list').children.length);
  const first = $('list').children[0];
  assert(first.href && first.href.includes('globe.html?place='), 'entries deep-link to globe');
  const moreBtn = $('list').children.find(c => c.id === 'moreBtn');
  assert(!!moreBtn && moreBtn.style.display !== 'none', 'show-more pagination present');
  moreBtn.onclick();
  assert($('list').children.length > 120, 'show-more loads next page');
  assert($('potd').style.display === 'block' && $('potd').innerHTML.includes('Place of the Day'), 'place of the day rendered');
  fire($('potdRead'), 'click');
  assert((global.__spoken || []).length > 0, 'place-of-day read-aloud works');

  console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
