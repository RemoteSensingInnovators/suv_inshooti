/* Xlorlash bo'limi va xavfli zonalar qatlami.
 * - Xaritada: xlor ombori turiga qarab 150 m (ballonli) va 500 m (konteynerli) xavfli zonalar.
 * - "Xlorlash" bo'limi: faol xlor sarfi hisobi va mezonlar ("XLORLASH.docx", "XLORLASH mezonlari.docx" asosida).
 * Zona ichidagi binolar hazard-data.js dan (OpenStreetMap). */
'use strict';
(function () {
  const app = window.floodApp, map = app.map, D = window.DASH_DATA, HZ = window.HAZARD_DATA || { sites: {} }, info = window.dashInfo;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const nf = (v, d = 0) => Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const SITE_IDS = ['choponota', 'dagbit'];
  const siteName = (id) => app.SITES[id].name.replace(' suv inshooti', '');

  // Xavfli zona radiusi xlor ombori turiga qarab
  const ZONES = [
    { r: 150, type: 'Ballonli xlor ombori' },
    { r: 500, type: 'Konteynerli xlor ombori' },
  ];
  const areaHa = (r) => (Math.PI * r * r) / 1e4;

  // Faol xlor sarfi: M = Q × D / 1000 (kg/sutka); hisobiy dozalar 0,8–3,0 mg/l
  const DOSES = [0.8, 1.0, 2.0, 3.0];
  const CHLORINATOR = { choponota: 12, dagbit: 10 }; // pasportda "kg/s" — birligi aniqlashtirilmagan; kg/soat deb olinsa ×24
  const demand = (id, dose) => (D.passports[id].capacityDay * dose) / 1000;

  // Sutkalik suv hajmiga qarab xlorlash usuli mezonlari
  const CRITERIA = [
    { min: 50, max: 1000, object: 'Kichik aholi punktlari, mahallalar, korxonalar', method: 'Tayyor natriy gipoxlorit eritmasini dozalash (nasos-dozator)', use: '50 g – 3 kg/sutka' },
    { min: 1000, max: 10000, object: 'Tuman markazlari, kichik shaharlar', method: 'Joyida osh tuzidan elektroliz orqali natriy gipoxlorit olish', use: '1 – 30 kg/sutka' },
    { min: 10000, max: 50000, object: "O'rta shaharlar suv ta'minoti", method: 'Kuchli elektroliz qurilmalari yoki ballonli gazsimon xlor', use: '10 – 150 kg/sutka', zone: 150 },
    { min: 50000, max: Infinity, object: 'Yirik shaharlar va viloyat markazlari', method: 'Vakuumli xloratorlar (konteynerli gazsimon xlor)', use: '50 – 3 000 kg/sutka', zone: 500 },
  ];
  const criterionOf = (id) => CRITERIA.find((c) => D.passports[id].capacityDay >= c.min && D.passports[id].capacityDay < c.max) || CRITERIA[CRITERIA.length - 1];

  // ───────────── Xaritadagi qatlam ─────────────
  const R_EARTH = 6371008.8, RAD = Math.PI / 180, LABEL_BEARING = 55;
  function offset(lng, lat, r, bearing) {
    const b = bearing * RAD;
    return [lng + ((r * Math.sin(b)) / (R_EARTH * Math.cos(lat * RAD))) / RAD, lat + ((r * Math.cos(b)) / R_EARTH) / RAD];
  }
  function ring(lng, lat, r, n = 128) { const pts = []; for (let i = 0; i <= n; i++) pts.push(offset(lng, lat, r, (i / n) * 360)); return pts; }

  const zonesGeo = { type: 'FeatureCollection', features: [] }, radiusGeo = { type: 'FeatureCollection', features: [] }, bldGeo = { type: 'FeatureCollection', features: [] };
  for (const id of SITE_IDS) {
    const s = app.SITES[id];
    for (const z of ZONES) zonesGeo.features.push({ type: 'Feature', properties: { site: id, r: z.r }, geometry: { type: 'Polygon', coordinates: [ring(s.lng, s.lat, z.r)] } });
    radiusGeo.features.push({ type: 'Feature', properties: { site: id }, geometry: { type: 'LineString', coordinates: [[s.lng, s.lat], offset(s.lng, s.lat, 500, LABEL_BEARING)] } });
    for (const b of (HZ.sites[id] || {}).buildings || []) bldGeo.features.push({ type: 'Feature', properties: { site: id, d: b[2] }, geometry: { type: 'Point', coordinates: [b[0], b[1]] } });
  }

  const labels = []; // {marker, r}
  let mode = 'both', layersReady = false;
  function addLayers() {
    const before = map.getLayer('flood') ? 'flood' : undefined; // suv qatlami zonalar ustida turadi
    map.addSource('hz-zones', { type: 'geojson', data: zonesGeo });
    map.addSource('hz-radius', { type: 'geojson', data: radiusGeo });
    map.addSource('hz-bld', { type: 'geojson', data: bldGeo });
    const is = (r) => ['==', ['get', 'r'], r];
    map.addLayer({ id: 'hz-500-fill', type: 'fill', source: 'hz-zones', filter: is(500), paint: { 'fill-color': '#e5484d', 'fill-opacity': 0.2 } }, before);
    map.addLayer({ id: 'hz-150-fill', type: 'fill', source: 'hz-zones', filter: is(150), paint: { 'fill-color': '#e5484d', 'fill-opacity': 0.3 } }, before);
    map.addLayer({ id: 'hz-500-line', type: 'line', source: 'hz-zones', filter: is(500), paint: { 'line-color': '#ff6b6b', 'line-width': 2.2 } }, before);
    map.addLayer({ id: 'hz-150-line', type: 'line', source: 'hz-zones', filter: is(150), paint: { 'line-color': '#ffd166', 'line-width': 2.2, 'line-dasharray': [2, 1.6] } }, before);
    map.addLayer({ id: 'hz-radius', type: 'line', source: 'hz-radius', paint: { 'line-color': '#ffffff', 'line-width': 1.6, 'line-opacity': 0.9 } }, before);
    map.addLayer({ id: 'hz-bld', type: 'circle', source: 'hz-bld', minzoom: 13,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 5.5], 'circle-color': ['case', ['<=', ['get', 'd'], 150], '#ffffff', '#ffb454'], 'circle-stroke-color': '#3a1d00', 'circle-stroke-width': 1 } }, before);
    for (const id of SITE_IDS) {
      const s = app.SITES[id];
      for (const z of ZONES) {
        const e = el('div', 'hz-label z' + z.r, z.r + ' m');
        e.title = `${z.type}: xavfli zona radiusi ${z.r} m`;
        labels.push({ r: z.r, e, marker: new maplibregl.Marker({ element: e, anchor: 'center' }).setLngLat(offset(s.lng, s.lat, z.r, LABEL_BEARING)).addTo(map) });
      }
    }
    layersReady = true;
    map.on('zoom', updateLabels);
    applyMode();
  }
  function updateLabels() {
    const z = map.getZoom();
    for (const l of labels) {
      const on = mode !== 'off' && (mode === 'both' || +mode === l.r) && z >= (l.r === 150 ? 13.6 : 12.4);
      l.e.style.display = on ? '' : 'none';
    }
  }
  function applyMode() {
    if (!layersReady) return;
    const vis = (on) => (on ? 'visible' : 'none');
    const on150 = mode === 'both' || mode === '150', on500 = mode === 'both' || mode === '500';
    map.setLayoutProperty('hz-150-fill', 'visibility', vis(on150)); map.setLayoutProperty('hz-150-line', 'visibility', vis(on150));
    map.setLayoutProperty('hz-500-fill', 'visibility', vis(on500)); map.setLayoutProperty('hz-500-line', 'visibility', vis(on500));
    map.setLayoutProperty('hz-radius', 'visibility', vis(on500));
    map.setLayoutProperty('hz-bld', 'visibility', vis(mode !== 'off'));
    map.setFilter('hz-bld', mode === '150' ? ['<=', ['get', 'd'], 150] : null);
    updateLabels();
  }
  function setMode(m) { mode = m; $('hzMode').value = m; applyMode(); document.querySelectorAll('.hz-leg').forEach((x) => { x.style.opacity = m === 'off' || (m !== 'both' && !x.classList.contains('r' + m)) ? 0.35 : 1; }); }
  function showOnMap(id) {
    if (mode === 'off') setMode('both');
    const s = app.SITES[id];
    info.showTab('map');
    map.flyTo({ center: [s.lng, s.lat], zoom: 14.7, pitch: 40, bearing: 0, duration: 1400 });
  }
  // suv qatlami (flood) app.js da style yuklangach qo'shiladi — shundan keyin zonalarni uning ostiga qo'shamiz
  const wait = setInterval(() => { let ok = false; try { ok = !!map.getLayer('flood'); } catch { ok = false; } if (ok) { clearInterval(wait); addLayers(); } }, 120);

  // ───────────── Chap paneldagi bo'lim ─────────────
  function countsText(id) {
    const h = HZ.sites[id];
    if (!h || !h.count500) return "OpenStreetMap'da bu hudud binolari kiritilmagan — zona ichidagi binolar soni noma'lum (sun'iy yo'ldosh tasviridan qarang).";
    return `Zona ichidagi binolar (OpenStreetMap bo'yicha, kamida): 150 m — ${h.count150} ta, 500 m — ${h.count500} ta.`;
  }
  function updatePanel(id) {
    if (!D.passports[id]) { $('hzInfo').textContent = ''; return; }
    const c = criterionOf(id);
    $('hzInfo').textContent = `${siteName(id)}: sutkalik quvvat ${nf(D.passports[id].capacityDay)} m³ — mezon bo'yicha «${c.method}»` + (c.zone ? `, mos xavfli zona ${c.zone} m. ` : '. ') + countsText(id);
  }
  $('hzMode').onchange = (e) => setMode(e.target.value);
  $('hzShow').onclick = () => showOnMap(app.state.siteId in app.SITES && D.passports[app.state.siteId] ? app.state.siteId : 'choponota');
  $('hzMore').onclick = () => info.showTab('xlor');
  const prevHook = window.onSiteChange;
  window.onSiteChange = (id) => { if (prevHook) prevHook(id); updatePanel(id); };
  updatePanel(app.state.siteId);

  // ───────────── "Xlorlash" bo'limi ─────────────
  function table(heads, rows, cls) {
    const t = el('table', 'grid-tbl ' + (cls || '')), hr = el('tr');
    heads.forEach((h) => hr.appendChild(el('th', null, h))); t.appendChild(hr);
    for (const r of rows) { const tr = el('tr', r.cls || ''); (r.cells || r).forEach((c, i) => tr.appendChild(el('td', i && typeof c === 'number' ? 'num' : null, typeof c === 'number' ? nf(c, 2) : c))); t.appendChild(tr); }
    return t;
  }

  let built = false;
  function renderXlor() {
    if (built) return; built = true;
    const root = $('xlorBody');

    // 1) kalkulyator
    const calc = el('div', 'card wide');
    calc.append(el('h3', null, 'Faol xlor sarfi kalkulyatori'), el('p', 'muted', "M = Q × D / 1000, bu yerda M — faol xlorning sutkalik sarfi (kg/sutka), Q — sutkalik suv hajmi (m³/sutka), D — faol xlor dozasi (mg/l)."));
    const ctl = el('div', 'row ctl'), lab = el('label', null, 'Faol xlor dozasi '), rng = el('input'), val = el('b', 'dose-val');
    rng.type = 'range'; rng.min = 0.8; rng.max = 3; rng.step = 0.1; rng.value = 1; rng.id = 'doseRange'; lab.append(rng, val); ctl.appendChild(lab); calc.appendChild(ctl);
    const bars = el('div', 'dose-bars'); calc.appendChild(bars);
    calc.appendChild(el('p', 'note', "Xlorator unumdorligi pasportda «12 kg/s» va «10 kg/s» deb yozilgan, birligi aniqlashtirilmagan. Solishtirish faqat u kg/soat bo'lgan taqdirda (288 va 240 kg/sutka) to'g'ri. Haqiqiy doza suv tarkibi, pH, harorat va kontakt vaqtiga qarab laboratoriya tahlili bilan belgilanadi."));
    const maxM = Math.max(...SITE_IDS.map((id) => demand(id, 3)));
    const draw = () => {
      const dose = +rng.value; val.textContent = nf(dose, 1) + ' mg/l';
      bars.innerHTML = '';
      for (const id of SITE_IDS) {
        const m = demand(id, dose), cap = CHLORINATOR[id] * 24, row = el('div', 'dose-row');
        row.appendChild(el('div', 'dose-name', `${siteName(id)} — ${nf(D.passports[id].capacityDay)} m³/sutka`));
        const track = el('div', 'dose-track'), fill = el('div', 'dose-fill'), mark = el('div', 'dose-cap');
        fill.style.width = (m / maxM) * 100 + '%'; mark.style.left = (cap / maxM) * 100 + '%'; mark.title = `Xlorator: ${nf(cap)} kg/sutka (kg/soat deb olinsa)`;
        track.append(fill, mark); row.appendChild(track);
        const ok = m <= cap, st = el('div', 'dose-st ' + (ok ? 'ok' : 'bad'));
        st.append(el('b', null, nf(m, 2) + ' kg/sutka'), document.createTextNode(ok
          ? `  ✓ xlorator (${CHLORINATOR[id]} kg/soat deb olinsa, ${nf(cap)} kg/sutka) yetadi`
          : `  ⚠ xlorator (${CHLORINATOR[id]} kg/soat deb olinsa, ${nf(cap)} kg/sutka) yetmaydi — yana ${nf(m - cap, 1)} kg/sutka kerak`));
        row.appendChild(st); bars.appendChild(row);
      }
    };
    rng.oninput = draw; root.appendChild(calc); draw();

    // 2) qiyosiy jadval
    const cmp = el('div', 'card wide');
    cmp.appendChild(el('h3', null, "Texnik va xlorlash ko'rsatkichlarining qiyosiy jadvali"));
    const P = D.passports, a = P.choponota, b = P.dagbit;
    cmp.appendChild(table(["Ko'rsatkich", "O'lchov birligi", "Cho'pon ota", 'Dagbit'], [
      ['Ishga tushirilgan yili', 'yil', String(a.year), String(b.year)],
      ['Umumiy yer maydoni', 'ga', nf(a.areaHa, 1), nf(b.areaHa, 1)],
      ['Artezian quduqlar soni', 'dona', String(a.wells), String(b.wells)],
      ['Sutkalik suv ishlab chiqarish quvvati', 'm³/sutka', nf(a.capacityDay), nf(b.capacityDay)],
      ['Dezinfeksiya usuli', '–', 'Suyultirilgan gazsimon xlor', 'Suyultirilgan gazsimon xlor'],
      ["Xloratorning pasportdagi ko'rsatkichi", 'kg/s (birligi aniqlashtiriladi)', '12', '10'],
      ...DOSES.map((d) => [`${nf(d, 1)} mg/l dozada faol xlor sarfi`, 'kg/sutka', nf(demand('choponota', d), 2), nf(demand('dagbit', d), 2)]),
    ], 'cmp'));
    cmp.appendChild(el('p', 'muted', `Cho'pon otaning quvvati Dagbitnikidan ${nf(a.capacityDay / b.capacityDay, 2)} baravar katta, shuning uchun bir xil dozada xlor sarfi ham shuncha ko'p.`));
    root.appendChild(cmp);

    // 3) mezonlar
    const cr = el('div', 'card wide');
    cr.append(el('h3', null, "Sutkalik suv hajmiga qarab xlorlash usuli"));
    cr.appendChild(table(['Sutkalik suv sarfi, m³/sutka', 'Obyekt turi', 'Tavsiya etiladigan usul', 'Xlor sarfi (1–3 mg/l)', 'Xavfli zona', 'Inshootlar'], CRITERIA.map((c) => {
      const here = SITE_IDS.filter((id) => criterionOf(id) === c).map((id) => `${siteName(id)} (${nf(D.passports[id].capacityDay)})`);
      return { cls: here.length ? 'hl' : '', cells: [isFinite(c.max) ? `${nf(c.min)} – ${nf(c.max)}` : `${nf(c.min)} dan yuqori`, c.object, c.method, c.use, c.zone ? c.zone + ' m' : '—', here.join(', ') || '—'] };
    })));
    root.appendChild(cr);

    // 4) me'yoriy qoidalar
    const nr = el('div', 'card');
    nr.appendChild(el('h3', null, "Me'yoriy qoidalar"));
    const ul = el('ul', 'notes');
    ["Xlor dozasi: O'zDSt 950:2011 «Ichimlik suvi» va sanitariya qoidalariga ko'ra tarmoqqa uzatishdan oldin 1 litr suvga 0,8–3,0 mg faol xlor qo'shiladi.",
      "Qoldiq xlor: tarmoqning eng chekka nuqtasida kamida 0,3–0,5 mg/l erkin qoldiq xlor saqlanishi shart.",
      "Xavfsizlik chegarasi: sutkalik hajm 10 000 m³ gacha bo'lsa, aholi punktlari ichida gazsimon xlor ballonlari o'rniga natriy gipoxlorit texnologiyasi talab etiladi."].forEach((x) => ul.appendChild(el('li', null, x)));
    nr.appendChild(ul); root.appendChild(nr);

    // 5) xavfli zonalar
    const hz = el('div', 'card');
    hz.append(el('h3', null, 'Xavfli zonalar'), el('p', 'muted', 'Radius xlor omborining turiga qarab belgilanadi.'));
    hz.appendChild(table(['Xlor ombori turi', 'Radius', 'Maydon', ...SITE_IDS.map((id) => siteName(id) + ': binolar')], ZONES.map((z) => [z.type, z.r + ' m', nf(areaHa(z.r), 1) + ' ga',
      ...SITE_IDS.map((id) => { const h = HZ.sites[id]; return h && h.count500 ? (z.r === 150 ? h.count150 : h.count500) + ' ta' : "ma'lumot yo'q"; })])));
    const row = el('div', 'row'); row.style.marginTop = '10px';
    for (const id of SITE_IDS) { const bt = el('button', null, `${siteName(id)} — xaritada ko'rsatish`); bt.onclick = () => showOnMap(id); row.appendChild(bt); }
    hz.appendChild(row);
    hz.appendChild(el('p', 'note', `Binolar soni OpenStreetMap ma'lumotidan (${HZ.fetched || ''}) olingan va to'liq bo'lmasligi mumkin; Cho'pon ota atrofidagi binolar u yerda kiritilmagan. Zona markazi sifatida inshoot nuqtasi olingan — xlor omborining aniq o'rni ma'lum bo'lsa, markazni ko'chirish kerak. Haqiqiy ombor turi (ballon yoki konteyner) ham aniqlashtirilishi lozim.`));
    root.appendChild(hz);
  }
  info.renderers.xlor = renderXlor;

  window.hazard = { setMode, showOnMap };
})();
