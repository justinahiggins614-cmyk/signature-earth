/* Signature Earth — Finds catalog data.
 * Every seeded find is a real, documented geographic feature with honest
 * coordinates and plain-language descriptions. "unexplained" is used ONLY
 * where science genuinely debates the feature — never as hype.
 * User discoveries (from AI scans) are stored separately in localStorage.
 */
(function () {
'use strict';
var FINDS = [
  { id: 'JAH-FIND-000001', name: 'Richat Structure', country: 'Mauritania', la: 21.124, lo: -11.408, zoom: 11,
    cat: 'formation', status: 'explained',
    what: 'A 40 km-wide bullseye of concentric rock rings in the Sahara — the "Eye of the Sahara", clearly visible from space.',
    why: 'One of the most striking circular landforms on Earth. Long mistaken for an impact crater; drilling showed it is an eroded geologic dome pushed up by igneous rock — no meteor involved.',
    value: 'Scientific landmark; a favorite calibration target for satellite imagery.' },
  { id: 'JAH-FIND-000002', name: 'Barringer Meteor Crater', country: 'United States', la: 35.028, lo: -111.022, zoom: 14,
    cat: 'formation', status: 'explained',
    what: 'A 1.2 km-wide, 170 m-deep crater in the Arizona desert, made ~50,000 years ago by an iron-nickel meteor about 50 m across.',
    why: 'The best-preserved impact crater on Earth — the place where scientists proved craters like the Moon\'s can come from space rocks, not volcanoes.',
    value: 'Research landmark; iron meteorite fragments were historically mined here.' },
  { id: 'JAH-FIND-000003', name: 'Great Blue Hole', country: 'Belize', la: 17.315, lo: -87.535, zoom: 14,
    cat: 'formation', status: 'explained',
    what: 'A near-perfect 300 m-wide circle of deep blue in Lighthouse Reef — a drowned limestone sinkhole 125 m deep.',
    why: 'Formed during ice ages when sea level was lower; flooded as the ice melted. Its layered sediments are a climate history book.',
    value: 'World-famous dive site; climate research archive.' },
  { id: 'JAH-FIND-000004', name: 'Salar de Uyuni', country: 'Bolivia', la: -20.134, lo: -67.489, zoom: 10,
    cat: 'formation', status: 'explained',
    what: 'The world\'s largest salt flat — 10,582 km² of blinding white hexagonal salt crust, all that remains of a prehistoric lake.',
    why: 'So flat and bright it is used to calibrate satellite altimeters. Its brines hold some of the planet\'s largest lithium reserves.',
    value: 'Indicator: major lithium source (mining active) — surface clue only, reserves need drilling to confirm.' },
  { id: 'JAH-FIND-000005', name: 'Grand Canyon', country: 'United States', la: 36.107, lo: -112.113, zoom: 11,
    cat: 'formation', status: 'explained',
    what: 'A 446 km-long, 1.6 km-deep canyon carved by the Colorado River through two billion years of rock layers.',
    why: 'Earth\'s greatest open geology textbook — you can read the planet\'s history in its striped walls.',
    value: 'Scientific and scenic landmark.' },
  { id: 'JAH-FIND-000006', name: 'Uluru', country: 'Australia', la: -25.344, lo: 131.037, zoom: 13,
    cat: 'formation', status: 'explained',
    what: 'A giant sandstone monolith rising 348 m above the desert plain — sacred to the Anangu people, far larger underground than above.',
    why: 'Its striking red comes from iron oxide rusting on the rock surface — the same chemistry prospectors look for, on a grand scale.',
    value: 'Cultural landmark; textbook iron-oxide staining.' },
  { id: 'JAH-FIND-000007', name: 'Mount Roraima', country: 'Venezuela', la: 5.143, lo: -60.763, zoom: 12,
    cat: 'formation', status: 'explained',
    what: 'A flat-topped tepui plateau with 400 m vertical cliffs, isolated above the rainforest for millions of years.',
    why: 'Its summit hosts plants and animals found nowhere else — an island in the sky that inspired "The Lost World".',
    value: 'Biodiversity treasure; unique geology.' },
  { id: 'JAH-FIND-000008', name: 'Dallol Hydrothermal Field', country: 'Ethiopia', la: 14.242, lo: 40.300, zoom: 13,
    cat: 'anomaly', status: 'explained',
    what: 'Neon-yellow and green acid springs, salt chimneys and steaming pools in the Danakil Depression, 125 m below sea level.',
    why: 'One of the most alien landscapes on Earth — groundwater heated by magma dissolves salt and sulfur into psychedelic formations.',
    value: 'Indicator: potash and sulfur deposits are mined in the region — surface clue only.' },
  { id: 'JAH-FIND-000009', name: 'Chocolate Hills', country: 'Philippines', la: 9.917, lo: 124.167, zoom: 12,
    cat: 'formation', status: 'explained',
    what: 'About 1,200 near-identical grass-covered limestone mounds scattered across Bohol, turning chocolate-brown in the dry season.',
    why: 'Nobody fully agrees how they got so uniform — the leading idea is weathered marine limestone, but their symmetry is uncanny.',
    value: 'Geologic curiosity; national landmark.' },
  { id: 'JAH-FIND-000010', name: 'Nazca Lines', country: 'Peru', la: -14.728, lo: -75.130, zoom: 13,
    cat: 'anomaly', status: 'unexplained',
    statusNote: 'Purpose debated: no scientific consensus on why they were made.',
    what: 'Hundreds of giant straight lines and animal figures etched into the desert floor ~2,000 years ago, fully visible only from the air.',
    why: 'Built by the Nazca culture by clearing dark stones to expose light earth. Theories range from ritual pathways to astronomical markers — the true purpose is still debated.',
    value: 'Archaeological wonder; UNESCO World Heritage.' },
  { id: 'JAH-FIND-000011', name: 'Tsingy de Bemaraha', country: 'Madagascar', la: -18.897, lo: 44.806, zoom: 12,
    cat: 'formation', status: 'explained',
    what: 'A forest of razor-sharp limestone needles — "tsingy" means "where one cannot walk barefoot".',
    why: 'Rainwater dissolved the limestone plateau into a maze of pinnacles over millions of years, sheltering unique wildlife in its cracks.',
    value: 'Biodiversity hotspot; UNESCO World Heritage.' },
  { id: 'JAH-FIND-000012', name: 'Deadvlei', country: 'Namibia', la: -24.759, lo: 15.290, zoom: 14,
    cat: 'formation', status: 'explained',
    what: 'A white clay pan dotted with 900-year-old dead camel-thorn trees, ringed by some of the world\'s tallest red dunes.',
    why: 'The trees died when dunes cut off their water — but the dry air preserved them like sculptures for nearly a millennium.',
    value: 'Iconic desert landscape; climate snapshot.' },
  { id: 'JAH-FIND-000013', name: 'Pamukkale', country: 'Türkiye', la: 37.920, lo: 29.121, zoom: 13,
    cat: 'formation', status: 'explained',
    what: 'Blinding-white travertine terraces spilling down a hillside, built drop by drop from calcium-rich hot springs.',
    why: 'Two thousand years of mineral water have built a "cotton castle" of natural infinity pools — geology you can bathe in.',
    value: 'Thermal springs; UNESCO World Heritage.' },
  { id: 'JAH-FIND-000014', name: 'Zhangjiajie Pillars', country: 'China', la: 29.315, lo: 110.434, zoom: 12,
    cat: 'formation', status: 'explained',
    what: 'Thousands of towering quartzite sandstone pillars rising through the mist — the landscape that inspired the floating mountains of Avatar.',
    why: 'Ancient seabeds were uplifted, then carved by water and ice into pillars over 300 million years.',
    value: 'Scenic and geologic landmark; UNESCO World Heritage.' },
  { id: 'JAH-FIND-000015', name: 'Upheaval Dome', country: 'United States', la: 38.437, lo: -109.929, zoom: 13,
    cat: 'anomaly', status: 'unexplained',
    statusNote: 'Origin debated: meteor impact vs. rising salt dome — no consensus.',
    what: 'A 5 km-wide bullseye of shattered, uplifted rock layers in Utah\'s Canyonlands, visible as concentric rings from above.',
    why: 'Two camps of geologists argue: a buried meteor impact, or a rising plug of salt that punched the layers upward. The rocks keep both secrets for now.',
    value: 'Active research puzzle — a genuine geological whodunit.' }
];
var byId = {};
FINDS.forEach(function (f) { byId[f.id] = f; });
window.EarthFinds = {
  FINDS: FINDS,
  BEST: 'JAH-FIND-000001',
  get: function (id) { return Promise.resolve(byId[id] || null); },
  loadUser: function () {
    try { return JSON.parse(localStorage.getItem('sigearth-finds') || '[]'); }
    catch (e) { return []; }
  },
  saveUser: function (list) {
    try { localStorage.setItem('sigearth-finds', JSON.stringify(list.slice(0, 200))); } catch (e) {}
  }
};
})();
