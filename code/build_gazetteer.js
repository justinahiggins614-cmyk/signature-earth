// Build the Signature Earth gazetteer from GeoNames open data (CC-BY 4.0).
// Input:  data/cities5000.txt, data/countryInfo.txt, data/admin1CodesASCII.txt
// Output: data/places/<L>.json.gz (per-letter chunks, pop-desc; '#' ships as hash.json.gz — Pages won't serve '#' in a filename)
//         data/index/names.json.gz (compact search index, pop-desc)
//         data/index/stats.json
// Real records only — never invent coordinates.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA = path.join(__dirname, '..', 'data');

function readLines(p) {
  return fs.readFileSync(p, 'utf8').split('\n');
}

// country code -> country name
const cc2name = {};
for (const line of readLines(path.join(DATA, 'countryInfo.txt'))) {
  if (!line || line[0] === '#') continue;
  const f = line.split('\t');
  if (f.length >= 5) cc2name[f[0]] = f[4];
}
// admin1 code (CC.ADM) -> region name
const adm2name = {};
for (const line of readLines(path.join(DATA, 'admin1CodesASCII.txt'))) {
  if (!line) continue;
  const f = line.split('\t');
  if (f.length >= 4) adm2name[f[0] + '.' + f[1]] = f[2] || f[3];
}

const seen = new Set();
const recs = [];
for (const line of readLines(path.join(DATA, 'cities5000.txt'))) {
  if (!line) continue;
  const f = line.split('\t');
  if (f.length < 19) continue;
  const id = f[0];
  if (seen.has(id)) continue;
  seen.add(id);
  const name = f[1];
  const ascii = (f[2] || name).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lat = parseFloat(f[4]), lon = parseFloat(f[5]);
  if (!isFinite(lat) || !isFinite(lon)) continue;
  const cc = f[8];
  recs.push({
    id, n: name, a: ascii,
    la: Math.round(lat * 1e4) / 1e4, lo: Math.round(lon * 1e4) / 1e4,
    c: cc2name[cc] || cc,
    r: adm2name[cc + '.' + f[10]] || '',
    p: parseInt(f[14] || '0', 10) || 0,
    e: f[15] && f[15] !== '' ? parseInt(f[15], 10) : null,
    t: f[17] || ''
  });
}
// biggest cities first — best search matches surface first
recs.sort((x, y) => y.p - x.p);

const letterOf = a => {
  const ch = (a[0] || '#').toUpperCase();
  return (ch >= 'A' && ch <= 'Z') ? ch : '#';
};
const buckets = {};
for (const r of recs) {
  const L = letterOf(r.a);
  (buckets[L] = buckets[L] || []).push(r);
}

const placesDir = path.join(DATA, 'places');
const idxDir = path.join(DATA, 'index');
fs.mkdirSync(placesDir, { recursive: true });
fs.mkdirSync(idxDir, { recursive: true });

const stats = { total: recs.length, letters: {}, source: 'GeoNames cities5000 + countryInfo (CC-BY 4.0)', built: new Date().toISOString().slice(0, 10) };
for (const L of Object.keys(buckets).sort()) {
  const arr = buckets[L];
  stats.letters[L] = arr.length;
  fs.writeFileSync(path.join(placesDir, (L === '#' ? 'hash' : L) + '.json.gz'), zlib.gzipSync(JSON.stringify(arr)));
}
// compact search index: [asciiName, lat, lon, country, region, pop, id]
const sidx = recs.map(r => [r.a, r.la, r.lo, r.c, r.r, r.p, r.id]);
fs.writeFileSync(path.join(idxDir, 'names.json.gz'), zlib.gzipSync(JSON.stringify(sidx)));
fs.writeFileSync(path.join(idxDir, 'stats.json'), JSON.stringify(stats, null, 1));

console.log('records:', recs.length);
console.log('letters:', Object.entries(stats.letters).map(([k, v]) => k + ':' + v).join(' '));
console.log('index bytes gz:', fs.statSync(path.join(idxDir, 'names.json.gz')).size);
