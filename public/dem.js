/* DEM qatlami va Inspektor.
 * - DEM (balandlik) qatlami: relyef plitkalari (terrarium, SRTM ~30 m) balandlik bo'yicha ranglanadi.
 * - Inspektor: xaritada bosilgan nuqtaning balandligi (metrda), koordinatasi, eng yaqin inshootgacha masofa,
 *   xavfli zonaga tushishi va (simulyatsiya bo'lsa) suv chuqurligi.
 * - Kursor ostidagi koordinata va balandlik doimiy ko'rsatib turiladi. */
'use strict';
(function () {
  const app = window.floodApp, map = app.map;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const nf = (v, d = 0) => Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d });
  const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const TILE = 256, ZQ = 12; // so'rov uchun zoom: SRTM (~30 m) aniqligiga mos

  // ───────────── Relyef plitkalarini o'qish ─────────────
  const pending = new Map(), decoded = new Map(); // "z/x/y" → Promise<pixels> / pixels (RGBA)
  function tilePixels(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (!pending.has(key)) {
      const p = (async () => {
        const r = await fetch(TERRARIUM.replace('{z}', z).replace('{x}', x).replace('{y}', y));
        if (!r.ok) throw new Error('DEM plitkasi: ' + r.status);
        const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const cv = document.createElement('canvas'); cv.width = cv.height = TILE;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0);
        const data = cx.getImageData(0, 0, TILE, TILE).data;
        decoded.set(key, data);
        if (decoded.size > 96) { const old = decoded.keys().next().value; decoded.delete(old); pending.delete(old); }
        return data;
      })();
      p.catch(() => pending.delete(key));
      pending.set(key, p);
    }
    return pending.get(key);
  }
  const elevOf = (d, o) => d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768; // terrarium kodlash
  const lng2px = (lng, z) => ((lng + 180) / 360) * 2 ** z * TILE;
  const lat2py = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z * TILE; };

  // nuqta atrofidagi 4 piksel bo'yicha bichiziqli interpolyatsiya; get(gx, gy) — bitta pikselning balandligi
  function bilinear(lng, lat, get) {
    const px = lng2px(lng, ZQ) - 0.5, py = lat2py(lat, ZQ) - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    const a = get(x0, y0), b = get(x0 + 1, y0), c = get(x0, y0 + 1), d = get(x0 + 1, y0 + 1);
    if ([a, b, c, d].some((v) => v == null)) return null;
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
  const split = (g) => [Math.floor(g / TILE), ((g % TILE) + TILE) % TILE];
  async function elevationAt(lng, lat) { // metr, dengiz sathidan
    const px = lng2px(lng, ZQ) - 0.5, py = lat2py(lat, ZQ) - 0.5;
    const need = new Set();
    for (const gx of [Math.floor(px), Math.floor(px) + 1]) for (const gy of [Math.floor(py), Math.floor(py) + 1]) need.add(split(gx)[0] + '/' + split(gy)[0]);
    await Promise.all([...need].map((k) => { const [x, y] = k.split('/'); return tilePixels(ZQ, +x, +y); }));
    return elevationSync(lng, lat);
  }
  function elevationSync(lng, lat) { // plitka hali yuklanmagan bo'lsa null (va yuklashni boshlaydi)
    return bilinear(lng, lat, (gx, gy) => {
      const [tx, ox] = split(gx), [ty, oy] = split(gy), d = decoded.get(`${ZQ}/${tx}/${ty}`);
      if (!d) { tilePixels(ZQ, tx, ty).catch(() => {}); return null; }
      return elevOf(d, (oy * TILE + ox) * 4);
    });
  }

  // ───────────── DEM qatlami (balandlik bo'yicha ranglangan) ─────────────
  const STOPS = [[560, 15, 107, 60], [600, 47, 143, 78], [640, 111, 184, 90], [680, 181, 213, 104], [720, 239, 229, 138], [760, 240, 197, 106],
    [800, 221, 154, 79], [850, 192, 115, 63], [950, 154, 90, 58], [1100, 139, 125, 116], [1400, 207, 202, 196], [1800, 255, 255, 255]];
  const E0 = 400, E1 = 2000, LUT = new Uint32Array(E1 - E0 + 1); // balandlik (m) → rang (ABGR)
  for (let e = E0; e <= E1; e++) {
    let i = 0; while (i < STOPS.length - 2 && e > STOPS[i + 1][0]) i++;
    const a = STOPS[i], b = STOPS[i + 1], t = Math.min(1, Math.max(0, (e - a[0]) / (b[0] - a[0])));
    const c = [1, 2, 3].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
    LUT[e - E0] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
  }
  // MapLibre uchun maxsus protokol: demcolor://z/x/y → ranglangan PNG plitka
  maplibregl.addProtocol('demcolor', async (params) => {
    const m = params.url.match(/^demcolor:\/\/(\d+)\/(\d+)\/(\d+)/);
    if (!m) throw new Error('demcolor: noto\'g\'ri manzil');
    const src = await tilePixels(+m[1], +m[2], +m[3]);
    const cv = document.createElement('canvas'); cv.width = cv.height = TILE;
    const cx = cv.getContext('2d'), img = cx.createImageData(TILE, TILE), out = new Uint32Array(img.data.buffer);
    for (let k = 0; k < out.length; k++) { const e = Math.round(elevOf(src, k * 4)); out[k] = LUT[(e < E0 ? E0 : e > E1 ? E1 : e) - E0]; }
    cx.putImageData(img, 0, 0);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    return { data: await blob.arrayBuffer() };
  });

  let layerReady = false;
  function addDemLayer() {
    map.addSource('dem-color', { type: 'raster', tiles: ['demcolor://{z}/{x}/{y}'], tileSize: TILE, maxzoom: 12, attribution: 'DEM: SRTM (AWS Terrain Tiles)' });
    // asos xarita ustida, relyef soyasi, xavfli zonalar va suv qatlami ostida
    map.addLayer({ id: 'dem-color', type: 'raster', source: 'dem-color', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.78, 'raster-fade-duration': 0 } }, map.getLayer('hillshade') ? 'hillshade' : undefined);
    layerReady = true;
    setDem($('demOn').checked);
  }
  function setDem(on) {
    $('demOn').checked = on;
    $('demLegend').style.display = on ? 'block' : 'none';
    if (layerReady) map.setLayoutProperty('dem-color', 'visibility', on ? 'visible' : 'none');
  }
  $('demOn').onchange = (e) => setDem(e.target.checked);
  // afsona: bosqichlar teng oraliqda, yozuvlari bilan
  (() => {
    const bar = $('demBar'), ticks = $('demTicks'), show = [560, 640, 720, 800, 950, 1800];
    bar.style.background = 'linear-gradient(90deg,' + STOPS.map((s, i) => `rgb(${s[1]},${s[2]},${s[3]}) ${(i / (STOPS.length - 1)) * 100}%`).join(',') + ')';
    STOPS.forEach((s, i) => { if (!show.includes(s[0])) return; const t = el('span', null, s[0] === 1800 ? '1800+' : String(s[0])); t.style.left = (i / (STOPS.length - 1)) * 100 + '%'; ticks.appendChild(t); });
  })();
  const waitStyle = setInterval(() => { let ok = false; try { ok = !!map.getLayer('flood'); } catch { ok = false; } if (ok) { clearInterval(waitStyle); addDemLayer(); } }, 120);

  // xarita ustidagi ma'lumot bloki yuqori panel ostida turadi (panel ikki qatorga o'tsa ham)
  function placeInfo() { const tb = $('topbar').getBoundingClientRect(), mp = $('map').getBoundingClientRect(); $('mapInfo').style.top = Math.max(8, tb.bottom - mp.top + 8) + 'px'; }
  window.addEventListener('resize', placeInfo); placeInfo(); setTimeout(placeInfo, 500);

  // ───────────── Kursor ostidagi koordinata va balandlik ─────────────
  let moveEvt = null;
  map.on('mousemove', (e) => {
    const first = !moveEvt; moveEvt = e;
    if (first) requestAnimationFrame(() => {
      const ev = moveEvt; moveEvt = null;
      const { lng, lat } = ev.lngLat, h = map.isMoving() ? null : elevationSync(lng, lat);
      $('cursorInfo').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}` + (h != null ? ` · ${nf(h)} m` : '');
    });
  });
  map.getCanvasContainer().addEventListener('mouseleave', () => { $('cursorInfo').textContent = "Kursorni xarita ustiga olib boring"; });

  // ───────────── Inspektor ─────────────
  const R_EARTH = 6371008.8, RAD = Math.PI / 180;
  function distance(lat1, lng1, lat2, lng2) {
    const dLat = (lat2 - lat1) * RAD, dLng = (lng2 - lng1) * RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
    return R_EARTH * 2 * Math.asin(Math.sqrt(a));
  }
  const hhmm = (t) => { const m = Math.round(t / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  function floodAt(lng, lat) { // simulyatsiya panjarasidagi katak ma'lumoti
    const st = app.state, g = st.grid;
    if (!g || !st.frames.length) return null;
    const n = Math.round(Math.sqrt(g.dem.length));
    const i = Math.floor(lng2px(lng, g.z) - g.x0), j = Math.floor(lat2py(lat, g.z) - g.y0);
    if (i < 0 || j < 0 || i >= n || j >= n) return null;
    const k = j * n + i, f = st.frames[st.frameIdx];
    return { now: f ? f.depthCm[k] / 100 : 0, t: f ? f.t : 0, max: st.maxDepthCm ? st.maxDepthCm[k] / 100 : 0, arrival: st.arrival && st.arrival[k] ? (st.arrival[k] / 1000) * st.tEnd : null };
  }

  let inspOn = true, reqId = 0;
  const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '320px', offset: 10, className: 'insp-popup' });
  function setInspector(on) {
    inspOn = on;
    $('inspBtn').classList.toggle('on', on);
    map.getCanvas().style.cursor = on ? 'crosshair' : '';
    if (!on) popup.remove();
  }
  $('inspBtn').onclick = () => setInspector(!inspOn);

  function row(label, value, cls) { const r = el('div', 'insp-row ' + (cls || '')); r.append(el('span', null, label), el('b', null, value)); return r; }
  function inspect(lng, lat) {
    const id = ++reqId, box = el('div', 'insp');
    const head = el('div', 'insp-elev'), big = el('b', null, '…'), unit = el('span', null, "balandlik yuklanmoqda");
    head.append(big, unit); box.appendChild(head);
    box.appendChild(row('Koordinata', `${lat.toFixed(6)}, ${lng.toFixed(6)}`));
    // eng yaqin inshoot va xavfli zona
    let best = null;
    for (const [sid, s] of Object.entries(app.SITES)) { const d = distance(lat, lng, s.lat, s.lng); if (!best || d < best.d) best = { d, name: s.name }; }
    if (best) {
      box.appendChild(row('Eng yaqin inshoot', `${best.name} — ${best.d < 1000 ? nf(best.d) + ' m' : nf(best.d / 1000, 2) + ' km'}`));
      if (best.d <= 150) box.appendChild(row('Xavfli zona', '⚠ 150 m zona ichida', 'warn'));
      else if (best.d <= 500) box.appendChild(row('Xavfli zona', '⚠ 500 m zona ichida', 'warn'));
      else box.appendChild(row('Xavfli zona', 'zonadan tashqarida'));
    }
    const fl = floodAt(lng, lat);
    if (fl) {
      if (fl.max >= 0.03) {
        box.appendChild(row(`Suv chuqurligi (${hhmm(fl.t)} da)`, nf(fl.now, 2) + ' m'));
        box.appendChild(row('Eng katta chuqurlik', nf(fl.max, 2) + ' m'));
        if (fl.arrival != null) box.appendChild(row('Suv yetib kelishi', hhmm(fl.arrival) + ' soatda'));
      } else box.appendChild(row('Toshqin (oxirgi hisob)', 'suv yetib kelmaydi'));
    }
    const copy = el('button', 'insp-copy', 'Koordinatani nusxalash');
    copy.onclick = () => { const t = `${lat.toFixed(6)}, ${lng.toFixed(6)}`; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { copy.textContent = 'Nusxalandi ✓'; }, () => { copy.textContent = t; }); };
    box.appendChild(copy);
    box.appendChild(el('div', 'insp-note', 'Balandlik — DEM (SRTM, ~30 m) bo\'yicha, dengiz sathidan; xatosi bir necha metr bo\'lishi mumkin.'));
    popup.setLngLat([lng, lat]).setDOMContent(box).addTo(map);
    elevationAt(lng, lat).then((h) => {
      if (id !== reqId) return;
      if (h == null) throw new Error('bo\'sh');
      big.textContent = nf(h, 1) + ' m'; unit.textContent = 'dengiz sathidan balandlik';
    }).catch(() => { if (id === reqId) { big.textContent = '—'; unit.textContent = "balandlik ma'lumotini yuklab bo'lmadi (internetni tekshiring)"; } });
  }
  map.on('click', (e) => { if (inspOn) inspect(e.lngLat.lng, e.lngLat.lat); });
  setInspector(true);

  window.demTools = { elevationAt, setDem, setInspector, inspect };
})();
