/* global maplibregl */
'use strict';

// ───────────── Inshootlar (koordinatalar aniq; hajm/balandlik — pasport ma'lumoti bilan almashtiring) ─────────────
const SITES = {
  choponota: { name: "Cho'pon ota suv inshooti", lng: 67.05246, lat: 39.681374, volume: 0.006, height: 8 },
  dagbit: { name: 'Dagbit suv inshooti', lng: 66.954249, lat: 39.711825, volume: 0.5, height: 8 },
};

try { localStorage.removeItem('suvombor.sites.v1'); } catch { /* yo'q */ }

const GRID = 512; // DEM panjarasi (piksel)
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, d = 2) => Number(v).toLocaleString('uz-UZ', { maximumFractionDigits: d, minimumFractionDigits: 0 }).replace(/,/g, '.');

const state = {
  siteId: 'choponota',
  breach: { lng: SITES.choponota.lng, lat: SITES.choponota.lat },
  view: 'current',
  frames: [],
  frameIdx: 0,
  maxDepthCm: null,
  shown: null,     // hozir chizilgan chuqurlik massivi (sm)
  grid: null,      // {x0,y0,z,dx,bounds}
  summary: null,
  params: null,
  running: false,
  worker: null,
  playing: null,
};

// ───────────── Xarita ─────────────
const BASES = {
  google_satellite: { tiles: [0, 1, 2, 3].map((i) => `https://mt${i}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`), attribution: '© Google' },
  google_hybrid: { tiles: [0, 1, 2, 3].map((i) => `https://mt${i}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}`), attribution: '© Google' },
  esri_imagery: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: '© Esri, Maxar' },
  topo: { tiles: ['a', 'b', 'c'].map((c) => `https://${c}.tile.opentopomap.org/{z}/{x}/{y}.png`), attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap', maxzoom: 17 },
};
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const style = { version: 8, sources: {}, layers: [] };
for (const [id, b] of Object.entries(BASES)) {
  style.sources[id] = { type: 'raster', tiles: b.tiles, tileSize: 256, maxzoom: b.maxzoom || 20, attribution: b.attribution };
  style.layers.push({ id: 'base-' + id, type: 'raster', source: id, layout: { visibility: id === 'google_satellite' ? 'visible' : 'none' } });
}
style.sources.dem = { type: 'raster-dem', tiles: [DEM_URL], encoding: 'terrarium', tileSize: 256, maxzoom: 12, attribution: 'Relyef: Mapzen / AWS Terrain Tiles (SRTM)' };
// Relyef soyasi (hillshade) — tepalik va pastliklarni bo'rttirib ko'rsatadi; 3D relyef manbasidan alohida manba
style.sources.demShade = { type: 'raster-dem', tiles: [DEM_URL], encoding: 'terrarium', tileSize: 256, maxzoom: 12 };
style.layers.push({
  id: 'hillshade', type: 'hillshade', source: 'demShade',
  paint: { 'hillshade-exaggeration': 0.75, 'hillshade-shadow-color': '#06121f', 'hillshade-highlight-color': '#fff6dd', 'hillshade-accent-color': '#0b1a2b', 'hillshade-illumination-direction': 315 },
});
const EXAG0 = 3.5;
style.terrain = { source: 'dem', exaggeration: EXAG0 };

const map = new maplibregl.Map({
  container: 'map', style,
  center: [67.003, 39.697], zoom: 12, pitch: 60, bearing: -25,
  maxPitch: 72,                 // juda yotiq burchakda ufqgacha yuzlab plitka yuklanadi
  maxZoom: 17,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  fadeDuration: 0,
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

const floodCanvas = document.createElement('canvas');
floodCanvas.width = floodCanvas.height = GRID;
const fctx = floodCanvas.getContext('2d');
const fimg = fctx.createImageData(GRID, GRID);
const fpix = new Uint32Array(fimg.data.buffer);

// chuqurlik (sm) → rang (ABGR, little-endian)
const LUT = (() => {
  const stops = [[10, 160, 230, 255, 150], [50, 80, 190, 250, 185], [100, 30, 136, 229, 205], [200, 25, 80, 200, 220], [400, 60, 30, 160, 230], [800, 120, 20, 120, 240]];
  const lut = new Uint32Array(1001);
  for (let cm = 10; cm <= 1000; cm++) {
    let i = 0; while (i < stops.length - 2 && cm > stops[i + 1][0]) i++;
    const a = stops[i], b = stops[i + 1];
    const t = clamp((cm - a[0]) / (b[0] - a[0]), 0, 1);
    const c = [1, 2, 3, 4].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
    lut[cm] = (c[3] << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
  }
  for (let cm = 3; cm < 10; cm++) lut[cm] = (70 << 24) | (255 << 16) | (230 << 8) | 160; // yupqa suv
  return lut;
})();

// suv yetib kelish vaqti → rang (erta = qizil, kech = yashil); qiymat 1..1000
const ARR_LUT = (() => {
  const stops = [[1, 214, 39, 40], [250, 255, 127, 14], [500, 255, 221, 51], [750, 140, 210, 80], [1000, 44, 160, 90]];
  const lut = new Uint32Array(1001);
  for (let v = 1; v <= 1000; v++) {
    let i = 0; while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
    const a = stops[i], b = stops[i + 1], t = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
    const c = [1, 2, 3].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
    lut[v] = (215 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
  }
  return lut;
})();

function drawDepth(cm) {
  state.shown = cm;
  pushFlood();
}

// Suv qatlami — image manbasi (3D relyef ustiga yotadi).
// Yangilanishlar birlashtiriladi: oldingisi tugamaguncha yangisi boshlanmaydi, oraliq kadrlar tashlab yuboriladi.
const EMPTY_PNG = (() => { const c = document.createElement('canvas'); c.width = c.height = 2; return c.toDataURL('image/png'); })(); // shaffof
let floodCoords = [[66.9, 39.8], [67.1, 39.8], [67.1, 39.6], [66.9, 39.6]];
let floodBusy = false, floodDirty = false, floodUrl = null;
function pushFlood() {
  floodDirty = true;
  if (!floodBusy) flushFlood();
}
function flushFlood() {
  const src = map.getSource('flood');
  if (!src) return;
  floodDirty = false; floodBusy = true;
  const done = () => setTimeout(() => { floodBusy = false; if (floodDirty) flushFlood(); }, 40);
  const cm = state.shown;
  if (!cm) { src.updateImage({ url: EMPTY_PNG, coordinates: floodCoords }); return done(); }
  const lut = state.view === 'arrival' ? ARR_LUT : LUT;
  for (let k = 0; k < fpix.length; k++) { const v = cm[k]; fpix[k] = v ? lut[v > 1000 ? 1000 : v] : 0; }
  fctx.putImageData(fimg, 0, 0);
  floodCanvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob), old = floodUrl;
      floodUrl = url;
      src.updateImage({ url, coordinates: floodCoords });
      if (old) setTimeout(() => URL.revokeObjectURL(old), 3000);
    }
    done();
  }, 'image/png');
}

map.once('style.load', () => {
  map.addSource('flood', { type: 'image', url: EMPTY_PNG, coordinates: floodCoords });
  map.addLayer({ id: 'flood', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0 } });
  if (state.shown) pushFlood();
  // ?auto=1 — sahifa ochilganda simulyatsiyani avtomatik ishga tushirish
  if (new URLSearchParams(location.search).has('auto')) $('run').click();
});

// markerlar
const siteMarkers = {};
function addSiteMarker(id) {
  const s = SITES[id];
  const el = document.createElement('div');
  el.className = 'site-marker';
  el.innerHTML = '<div class="dot"></div><div class="lbl"></div>';
  el.querySelector('.lbl').textContent = s.name;
  el.addEventListener('click', (e) => { e.stopPropagation(); selectSite(id, true); });
  siteMarkers[id] = new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, -8] }).setLngLat([s.lng, s.lat]).addTo(map);
}
const breachEl = document.createElement('div');
breachEl.className = 'breach-marker';
breachEl.title = 'Yorilish nuqtasi';
const breachMarker = new maplibregl.Marker({ element: breachEl }).setLngLat([state.breach.lng, state.breach.lat]).addTo(map);

function setBreach(lng, lat) {
  state.breach = { lng, lat };
  breachMarker.setLngLat([lng, lat]);
}

function refreshSiteSelect() {
  const sel = $('site');
  sel.innerHTML = '';
  for (const [id, s] of Object.entries(SITES)) {
    const o = document.createElement('option'); o.value = id; o.textContent = s.name; sel.appendChild(o);
  }
  sel.value = state.siteId;
}

function selectSite(id, fly) {
  const s = SITES[id]; if (!s) return false;
  state.siteId = id;
  $('site').value = id;
  $('volume').value = s.volume;
  $('height').value = s.height;
  setBreach(s.lng, s.lat);
  if (fly) map.flyTo({ center: [s.lng, s.lat], zoom: 13, pitch: 60, duration: 1800, offset: [0, 170] });
  return true;
}

// ───────────── DEM yuklash (terrarium plitkalari → balandlik panjarasi) ─────────────
const tileCache = new Map();
function loadTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, new Promise((res, rej) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => { tileCache.delete(key); rej(new Error('DEM plitkasi yuklanmadi: ' + key)); };
      im.src = DEM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    }));
  }
  return tileCache.get(key);
}
const lng2px = (lng, z) => ((lng + 180) / 360) * 2 ** z * 256;
const lat2py = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z * 256; };
const px2lng = (px, z) => (px / (2 ** z * 256)) * 360 - 180;
const py2lat = (py, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / (2 ** z * 256)))) * 180) / Math.PI;

async function loadDem(lng, lat, z) {
  const x0 = Math.round(lng2px(lng, z) - GRID / 2), y0 = Math.round(lat2py(lat, z) - GRID / 2);
  const cv = document.createElement('canvas'); cv.width = cv.height = GRID;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + GRID - 1) / 256); ty++)
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + GRID - 1) / 256); tx++)
      jobs.push(loadTile(z, tx, ty).then((im) => ctx.drawImage(im, tx * 256 - x0, ty * 256 - y0)));
  await Promise.all(jobs);
  const d = ctx.getImageData(0, 0, GRID, GRID).data;
  const dem = new Float32Array(GRID * GRID);
  for (let k = 0; k < dem.length; k++) dem[k] = d[k * 4] * 256 + d[k * 4 + 1] + d[k * 4 + 2] / 256 - 32768;
  const w = px2lng(x0, z), e = px2lng(x0 + GRID, z), n = py2lat(y0, z), s = py2lat(y0 + GRID, z);
  return {
    dem, x0, y0, z,
    dx: (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (2 ** z * 256),
    coords: [[w, n], [e, n], [e, s], [w, s]],
    sx: Math.round(lng2px(lng, z) - x0), sy: Math.round(lat2py(lat, z) - y0),
  };
}

// ───────────── Simulyatsiya ─────────────
function readParams() {
  return {
    volume: clamp(parseFloat($('volume').value) || 0.5, 0.001, 200),
    height: clamp(parseFloat($('height').value) || 8, 1, 100),
    percent: clamp(parseFloat($('percent').value) || 100, 1, 100),
    hours: clamp(parseFloat($('hours').value) || 3, 0.5, 12),
    n: clamp(parseFloat($('manning').value) || 0.05, 0.02, 0.15),
  };
}

function stopPlay() { if (state.playing) { clearTimeout(state.playing); state.playing = null; $('play').textContent = '▶'; } }

// Animatsiya: 1× tezlikda kadr 100 ms turadi; tezlik ro'yxatdan tanlanadi (0.25× = eng sekin)
function startPlay(fromStart) {
  if (!state.frames.length || state.running) return;
  stopPlay(); setView('current');
  let i = fromStart || state.frameIdx >= state.frames.length - 1 ? 0 : state.frameIdx + 1;
  $('play').textContent = '⏸';
  const tick = () => {
    if (!state.playing) return;
    if (floodBusy) { state.playing = setTimeout(tick, 30); return; } // oldingi kadr hali chizilmoqda
    showFrame(i); i++;
    if (i >= state.frames.length) {
      if ($('loop').classList.contains('on')) { i = 0; state.playing = setTimeout(tick, 1200); } else stopPlay();
      return;
    }
    state.playing = setTimeout(tick, 100 / (+$('speed').value || 1));
  };
  state.playing = setTimeout(tick, 0);
}
function stepFrame(d) {
  if (!state.frames.length) return;
  stopPlay(); setView('current');
  showFrame(clamp(state.frameIdx + d, 0, state.frames.length - 1));
}

// Har bir katakka suv (≥10 sm) birinchi marta qachon yetib kelgani: 1..1000 shkalada, 0 = yetib kelmagan
function computeArrival() {
  const n = state.frames.length, arr = new Uint16Array(GRID * GRID);
  const tEnd = state.frames[n - 1].t;
  for (let i = 0; i < n; i++) {
    const d = state.frames[i].depthCm, v = Math.max(1, Math.round((state.frames[i].t / tEnd) * 1000));
    for (let k = 0; k < d.length; k++) if (d[k] >= 10 && !arr[k]) arr[k] = v;
  }
  state.arrival = arr; state.tEnd = tEnd;
}

function runSimulation() {
  return new Promise(async (resolve, reject) => {
    stopPlay();
    if (state.worker) { state.worker.terminate(); state.worker = null; }
    const p = readParams();
    const released = (p.volume * p.percent) / 100; // mln m³
    const z = released > 8 || p.hours > 6 ? 11 : 12; // katta ssenariy → kengroq (30 km) hudud
    state.running = true; state.frames = []; state.maxDepthCm = null; state.summary = null; state.arrival = null;
    $('exportBox').style.display = 'none';
    $('run').disabled = true; $('run').textContent = 'Hisoblanmoqda…';
    setProgress(0.03);
    let g;
    try { g = await loadDem(state.breach.lng, state.breach.lat, z); }
    catch (err) { finish(); return reject(err); }
    state.grid = g;
    state.params = { ...p, site: state.siteId, siteName: SITES[state.siteId]?.name, breach: { ...state.breach } };
    floodCoords = g.coords;
    map.flyTo({ center: [state.breach.lng, state.breach.lat], zoom: z === 11 ? 11.6 : 12.8, pitch: 60, duration: 1500, offset: [0, 170] });
    drawDepth(null);
    setView('current');
    $('timeline').style.display = 'flex';

    const duration = p.hours * 3600;
    const frameEvery = Math.max(30, Math.round(duration / 120 / 30) * 30); // ~120 kadr — sekin, ravon animatsiya uchun
    const w = new Worker('sim-worker.js');
    state.worker = w;
    function finish() {
      state.running = false; state.worker = null;
      $('run').disabled = false; $('run').textContent = 'Simulyatsiyani boshlash';
      setTimeout(() => setProgress(0), 400);
    }
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'frame') {
        state.frames.push({ t: m.t, stats: m.stats, depthCm: m.depthCm });
        setProgress(m.t / duration); // kadrlar hisob tugagach, boshidan sekin ko'rsatiladi
      } else if (m.type === 'done') {
        state.maxDepthCm = m.maxDepthCm; state.summary = m.summary;
        showSummary(); finish(); w.terminate();
        $('tSlider').max = state.frames.length - 1;
        computeArrival();
        $('exportBox').style.display = 'block';
        showFrame(0);
        startPlay(true);
        const tl = m.summary.timeline, step = Math.max(1, Math.ceil(tl.length / 12));
        resolve({
          site: state.params.siteName || 'tanlangan nuqta',
          breach_point: { lng: +state.breach.lng.toFixed(5), lat: +state.breach.lat.toFixed(5) },
          inputs: { volume_mln_m3: p.volume, breach_percent: p.percent, dam_height_m: p.height, duration_hours: p.hours, manning_n: p.n },
          results: { ...m.summary, totalFloodedAreaHa: +(m.summary.totalFloodedAreaKm2 * 100).toFixed(1), timeline: tl.filter((_, k) => k % step === step - 1 || k === tl.length - 1) },
          notes: m.summary.leftGridMlnM3 > 0.001 ? 'Suvning bir qismi hisob hududidan chiqib ketdi — haqiqiy maydon kattaroq bo\'lishi mumkin.' : undefined,
        });
      } else if (m.type === 'error') { finish(); w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = (err) => { finish(); reject(new Error(err.message || 'Worker xatosi')); };
    w.postMessage({ dem: g.dem, W: GRID, H: GRID, dx: g.dx, sx: g.sx, sy: g.sy, volume: released * 1e6, damHeight: p.height, n: p.n, duration, frameEvery });
  });
}

function setProgress(f) { document.querySelector('#progress i').style.width = clamp(f, 0, 1) * 100 + '%'; }
const hhmm = (t) => { const tot = Math.round(t), m = Math.floor(tot / 60), sec = tot % 60; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` + (sec ? ':' + String(sec).padStart(2, '0') : ''); };

// Suv bosgan maydonning vaqt bo'yicha grafigi (bosib/sudrab vaqtni tanlash mumkin)
function drawChart() {
  const cv = $('chart'), fr = state.frames;
  const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
  if (!w) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  if (fr.length < 2) return;
  const padL = 34, padB = 16, padT = 6, pw = w - padL - 6, ph = h - padB - padT;
  const maxA = Math.max(0.001, ...fr.map((f) => f.stats.areaKm2));
  const X = (i) => padL + (i / (fr.length - 1)) * pw, Y = (a) => padT + ph - (a / maxA) * ph;
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; c.fillStyle = '#93a4b8'; c.font = '10px Segoe UI, sans-serif';
  for (const g of [0, 0.5, 1]) { c.beginPath(); c.moveTo(padL, Y(maxA * g)); c.lineTo(padL + pw, Y(maxA * g)); c.stroke(); c.textAlign = 'right'; c.fillText(fmt(maxA * g, 2), padL - 4, Y(maxA * g) + 3); }
  c.textAlign = 'right'; c.fillText(hhmm(fr[fr.length - 1].t) + ' soat', padL + pw, h - 3);
  c.beginPath(); c.moveTo(X(0), Y(0));
  fr.forEach((f, i) => c.lineTo(X(i), Y(f.stats.areaKm2)));
  c.lineTo(X(fr.length - 1), Y(0)); c.closePath(); c.fillStyle = 'rgba(63,182,255,.22)'; c.fill();
  c.beginPath(); fr.forEach((f, i) => (i ? c.lineTo(X(i), Y(f.stats.areaKm2)) : c.moveTo(X(i), Y(f.stats.areaKm2))));
  c.strokeStyle = '#3fb6ff'; c.lineWidth = 1.8; c.stroke();
  const i = state.frameIdx;
  c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(i), padT); c.lineTo(X(i), padT + ph); c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(X(i), Y(fr[i].stats.areaKm2), 3.5, 0, 7); c.fill();
  cv._seek = (px) => clamp(Math.round(((px - padL) / pw) * (fr.length - 1)), 0, fr.length - 1);
}

function showFrame(i) {
  const f = state.frames[i]; if (!f) return;
  state.frameIdx = i;
  $('tSlider').value = i;
  $('tLabel').textContent = hhmm(f.t) + ' soat';
  if (state.view === 'current') drawDepth(f.depthCm);
  const s = f.stats;
  $('sArea').textContent = `${fmt(s.areaKm2)} km² (${fmt(s.areaKm2 * 100, 0)} ga)`;
  $('sDepth').textContent = fmt(s.maxDepth, 1) + ' m';
  $('sMean').textContent = fmt(s.meanDepth, 2) + ' m';
  $('sFront').textContent = fmt(s.frontKm, 1) + ' km';
  $('sVol').textContent = fmt(s.releasedM3 / 1e6, 3) + ' mln m³';
  drawChart();
}
function showSummary() {
  const s = state.summary; if (!s) return;
  $('sQ').textContent = fmt(s.peakDischargeM3s, 0) + ' m³/s';
  $('sTotal').textContent = fmt(s.totalFloodedAreaKm2) + ' km²';
}
function setView(v) {
  state.view = v === 'max' && state.maxDepthCm ? 'max' : v === 'arrival' && state.arrival ? 'arrival' : 'current';
  $('viewCur').classList.toggle('on', state.view === 'current');
  $('viewMax').classList.toggle('on', state.view === 'max');
  $('viewArr').classList.toggle('on', state.view === 'arrival');
  const arr = state.view === 'arrival';
  $('legBar').classList.toggle('arr', arr);
  $('legL').textContent = arr ? 'darhol' : '0.1 m';
  $('legR').textContent = arr ? hhmm(state.tEnd || 0) + ' soat' : '8+ m';
  $('legTitle').textContent = arr ? 'Suv yetib kelish vaqti' : state.view === 'max' ? 'Maksimal chuqurlik' : 'Suv chuqurligi';
  if (state.view === 'max') drawDepth(state.maxDepthCm);
  else if (arr) drawDepth(state.arrival);
  else if (state.frames.length) drawDepth(state.frames[state.frameIdx].depthCm);
}
function setBasemap(id) {
  if (!BASES[id]) return;
  for (const b of Object.keys(BASES)) map.setLayoutProperty('base-' + b, 'visibility', b === id ? 'visible' : 'none');
  document.querySelectorAll('#topbar button[data-base]').forEach((el) => el.classList.toggle('on', el.dataset.base === id));
}
function setExaggeration(x) {
  x = clamp(+x || 1, 1, 8);
  $('exag').value = x; $('exagV').textContent = x + '×';
  if ($('t3d').checked) map.setTerrain({ source: 'dem', exaggeration: x });
}

// ───────────── UI hodisalari ─────────────
refreshSiteSelect();
Object.keys(SITES).forEach(addSiteMarker);
selectSite('choponota', false);

$('site').onchange = (e) => selectSite(e.target.value, true);

$('run').onclick = () => {
  addMsg('info', 'Hisoblanmoqda…');
  runSimulation()
    .then((r) => addMsg('info', `${r.site}: ${r.inputs.duration_hours} soatda jami ${fmt(r.results.totalFloodedAreaKm2)} km² (${fmt(r.results.totalFloodedAreaHa, 0)} ga) maydonni suv bosadi.` + (r.notes ? ' ⚠ ' + r.notes : '')))
    .catch((err) => addMsg('err', 'Xato: ' + err.message));
};
$('tSlider').oninput = (e) => { stopPlay(); setView('current'); showFrame(+e.target.value); };
$('viewCur').onclick = () => setView('current');
$('viewMax').onclick = () => setView('max');
$('viewArr').onclick = () => { stopPlay(); setView('arrival'); };
$('play').onclick = () => (state.playing ? stopPlay() : startPlay(false));
$('prev').onclick = () => stepFrame(-1);
$('next').onclick = () => stepFrame(1);
$('loop').onclick = () => $('loop').classList.toggle('on');
$('opacity').oninput = (e) => { if (map.getLayer('flood')) map.setPaintProperty('flood', 'raster-opacity', +e.target.value); };
// grafikda bosib/sudrab vaqtni tanlash
(() => {
  const cv = $('chart'); let drag = false;
  const seek = (e) => { if (!cv._seek || !state.frames.length) return; stopPlay(); setView('current'); showFrame(cv._seek(e.clientX - cv.getBoundingClientRect().left)); };
  cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); seek(e); });
  cv.addEventListener('pointermove', (e) => { if (drag) seek(e); });
  cv.addEventListener('pointerup', () => { drag = false; });
  window.addEventListener('resize', drawChart);
})();
// klaviatura: Probel — ijro/pauza, ← → — kadrma-kadr
window.addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  else if (e.code === 'ArrowLeft') stepFrame(-1);
  else if (e.code === 'ArrowRight') stepFrame(1);
});

// ───────────── Eksport ─────────────
function lutPng(arr, lut) {
  const cv = document.createElement('canvas'); cv.width = cv.height = GRID;
  const cx = cv.getContext('2d'), im = cx.createImageData(GRID, GRID), px = new Uint32Array(im.data.buffer);
  for (let k = 0; k < px.length; k++) { const v = arr[k]; px[k] = v ? lut[v > 1000 ? 1000 : v] : 0; }
  cx.putImageData(im, 0, 0);
  return new Promise((res) => cv.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));
}
const fileStem = () => 'toshqin_' + state.params.site + '_' + String(state.params.volume).replace('.', '_') + 'mln';
async function buildKmz() {
  const E = window.FloodExport, g = state.grid, p = state.params, s = state.summary;
  const [w, n] = g.coords[0], [e, so] = g.coords[2];
  const box = '<LatLonBox><north>' + n + '</north><south>' + so + '</south><east>' + e + '</east><west>' + w + '</west></LatLonBox>';
  const desc = 'Suv hajmi: ' + p.volume + ' mln m³, yorilish: ' + p.percent + '%, balandlik: ' + p.height + ' m, davomiylik: ' + p.hours + ' soat. ' +
    'Jami suv bosgan maydon: ' + s.totalFloodedAreaKm2 + ' km², eng katta chuqurlik: ' + s.maxDepthM + ' m, cho\'qqi sarf: ' + s.peakDischargeM3s + ' m³/s. Taxminiy model (SRTM 30 m).';
  const kml = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n' +
    '<name>' + E.xmlEsc(p.siteName) + ' — toshqin simulyatsiyasi</name>\n<description>' + E.xmlEsc(desc) + '</description>\n' +
    '<Placemark><name>' + E.xmlEsc(p.siteName) + ' (yorilish nuqtasi)</name><Point><coordinates>' + p.breach.lng + ',' + p.breach.lat + ',0</coordinates></Point></Placemark>\n' +
    '<GroundOverlay><name>Maksimal chuqurlik</name><color>d9ffffff</color><Icon><href>files/max_depth.png</href></Icon>' + box + '</GroundOverlay>\n' +
    '<GroundOverlay><name>Suv yetib kelish vaqti (qizil = erta)</name><visibility>0</visibility><color>d9ffffff</color><Icon><href>files/arrival.png</href></Icon>' + box + '</GroundOverlay>\n' +
    '</Document></kml>\n';
  return E.makeZip([
    { name: 'doc.kml', data: new TextEncoder().encode(kml) },
    { name: 'files/max_depth.png', data: await lutPng(state.maxDepthCm, LUT) },
    { name: 'files/arrival.png', data: await lutPng(state.arrival, ARR_LUT) },
  ]);
}
$('expKmz').onclick = async () => { if (state.summary) window.FloodExport.download(await buildKmz(), fileStem() + '.kmz'); };
function buildCsv() {
  const rows = ['vaqt_daqiqa;maydon_km2;maks_chuqurlik_m;ortacha_chuqurlik_m;tolqin_masofasi_km;chiqqan_hajm_m3;sarf_m3s'];
  for (const f of state.frames) { const s = f.stats; rows.push([(f.t / 60).toFixed(1), s.areaKm2.toFixed(4), s.maxDepth.toFixed(2), s.meanDepth.toFixed(2), s.frontKm.toFixed(2), Math.round(s.releasedM3), s.Q.toFixed(1)].join(';')); }
  return '\ufeff' + rows.join('\r\n');
}
$('expCsv').onclick = () => { if (state.frames.length) window.FloodExport.download(new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' }), fileStem() + '.csv'); };
document.querySelectorAll('#topbar button[data-base]').forEach((b) => (b.onclick = () => setBasemap(b.dataset.base)));
$('exag').oninput = (e) => { $('exagV').textContent = e.target.value + '×'; };
$('exag').onchange = (e) => setExaggeration(e.target.value);
$('t3d').onchange = (e) => {
  if (e.target.checked) { setExaggeration($('exag').value); map.easeTo({ pitch: 60, duration: 600 }); }
  else { map.setTerrain(null); map.easeTo({ pitch: 0, duration: 600 }); }
};
$('exag').value = EXAG0; $('exagV').textContent = EXAG0 + '×';
$('shade').onchange = (e) => map.setLayoutProperty('hillshade', 'visibility', e.target.checked ? 'visible' : 'none');



// kursor ostidagi chuqurlik
let hoverEvt = null;
map.on('mousemove', (e) => {
  if (hoverEvt) { hoverEvt = e; return; }
  hoverEvt = e;
  requestAnimationFrame(() => { const ev = hoverEvt; hoverEvt = null; updateHover(ev); });
});
map.on('movestart', () => { $('hover').style.display = 'none'; });
function updateHover(e) {
  const g = state.grid, hv = $('hover');
  if (map.isMoving()) return (hv.style.display = 'none');
  if (!g || !state.shown) return (hv.style.display = 'none');
  const i = Math.floor(lng2px(e.lngLat.lng, g.z) - g.x0), j = Math.floor(lat2py(e.lngLat.lat, g.z) - g.y0);
  const cm = i >= 0 && j >= 0 && i < GRID && j < GRID ? state.shown[j * GRID + i] : 0;
  if (state.view === 'arrival' ? !cm : cm < 3) return (hv.style.display = 'none');
  const r = map.getContainer().getBoundingClientRect();
  hv.style.display = 'block'; hv.style.left = r.left + e.point.x + 14 + 'px'; hv.style.top = r.top + e.point.y + 10 + 'px';
  hv.textContent = state.view === 'arrival'
    ? `Suv yetib keladi: ${hhmm(Math.round(((cm / 1000) * state.tEnd) / 60) * 60)} soatda · yer: ${fmt(g.dem[j * GRID + i], 0)} m`
    : `Chuqurlik: ${fmt(cm / 100, 2)} m · yer: ${fmt(g.dem[j * GRID + i], 0)} m`;
}

// ───────────── Holat xabari ─────────────
function addMsg(kind, text) {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + (kind === 'err' ? 'err' : '');
  el.style.display = 'block';
}

// Yo'riqnoma birinchi kirishda ochiq turadi, keyin foydalanuvchi tanlovi eslab qolinadi
(() => {
  const d = $('help');
  let seen = false;
  try { seen = localStorage.getItem('suvombor.helpSeen') === '1'; } catch { /* yo'q */ }
  d.open = !seen;
  d.addEventListener('toggle', () => { try { localStorage.setItem('suvombor.helpSeen', '1'); } catch { /* yo'q */ } });
})();
// Parametr maydonida Enter — simulyatsiyani boshlaydi
document.querySelectorAll('.form input').forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('run').disabled) $('run').click(); }));

window.floodApp = { state, runSimulation, selectSite, map, startPlay, stopPlay, setView, buildKmz, buildCsv };
