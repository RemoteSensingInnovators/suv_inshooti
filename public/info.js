/* Pasport va Statistika bo'limlari: inshoot pasportlari, xizmat muddati, aholi va diagrammalar.
 * Ma'lumot data.js dan (Excel fayllardan yaratilgan) olinadi. */
'use strict';
(function () {
  const D = window.DASH_DATA, app = window.floodApp;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const nf = (v, d = 0) => Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d }).replace(/,/g, ',');
  const NOW = new Date().getFullYear();
  let passSite = 'choponota';

  // ───────────── Bo'limlar (tablar) ─────────────
  function showTab(tab) {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('info').style.display = tab === 'map' ? 'none' : 'block';
    $('viewPass').style.display = tab === 'pass' ? 'block' : 'none';
    $('viewStat').style.display = tab === 'stat' ? 'block' : 'none';
    document.body.classList.toggle('info-open', tab !== 'map');
    if (tab === 'pass') renderPassport();
    if (tab === 'stat') renderStats();
    $('info').scrollTop = 0;
  }
  document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

  // ───────────── Rezervuar ssenariylari (simulyatsiya formasi) ─────────────
  const totalVolume = (p) => p.reservoirs.reduce((s, r) => s + r.count * r.volume, 0);
  function fillPresets(id) {
    const p = D.passports[id], sel = $('preset');
    sel.innerHTML = '';
    if (!p) { sel.parentElement.style.display = 'none'; return; }
    sel.parentElement.style.display = '';
    const add = (label, m3) => { const o = el('option', null, label); o.value = m3; sel.appendChild(o); };
    add(`Barcha rezervuarlar — ${nf(totalVolume(p))} m³`, totalVolume(p));
    for (const r of p.reservoirs) add(`Bitta ${nf(r.volume)} m³ rezervuar`, r.volume);
    const o = el('option', null, "Qo'lda kiritilgan hajm"); o.value = ''; sel.appendChild(o);
    sel.value = String(totalVolume(p));
    $('volume').value = totalVolume(p) / 1e6;
  }
  $('preset').onchange = (e) => { if (e.target.value) $('volume').value = +e.target.value / 1e6; };
  $('volume').addEventListener('input', () => { $('preset').value = ''; });
  window.onSiteChange = (id) => { fillPresets(id); if (D.passports[id]) { passSite = id; if ($('viewPass').style.display === 'block') renderPassport(); } };
  fillPresets(app.state.siteId);

  // ───────────── Pasport ─────────────
  function lifeRow(label, norm, age) {
    const SCALE = 110, row = el('div', 'life-row');
    row.appendChild(el('div', 'life-label', label));
    const bar = el('div', 'life-bar');
    const band = el('div', 'life-band'); band.style.left = (norm.min / SCALE) * 100 + '%'; band.style.width = ((norm.max - norm.min) / SCALE) * 100 + '%';
    band.title = `Me'yoriy muddat: ${norm.min}–${norm.max} yil`;
    const mark = el('div', 'life-mark'); mark.style.left = Math.min(100, (age / SCALE) * 100) + '%';
    mark.appendChild(el('span', null, age + ' yil'));
    bar.append(band, mark);
    for (const t of [0, 25, 50, 75, 100]) { const tk = el('i', 'life-tick', String(t)); tk.style.left = (t / SCALE) * 100 + '%'; bar.appendChild(tk); }
    row.appendChild(bar);
    const st = age > norm.max && norm.open ? ['●', `Asosiy muddatdan (${norm.min}–${norm.max} yil) ${age - norm.max} yil o'tgan; xizmat ko'rsatish sifatiga qarab uzayishi mumkin`, 'warn']
      : age > norm.max ? ['⚠', `Me'yoriy muddatdan ${age - norm.max} yil oshgan`, 'bad']
      : age >= norm.min ? ['●', `Me'yoriy muddat oralig'ida (${norm.min}–${norm.max} yil)`, 'warn']
      : ['✓', `Me'yoriy muddatgacha ${norm.min - age} yil bor`, 'ok'];
    const s = el('div', 'life-status ' + st[2]); s.append(el('b', null, st[0] + ' '), document.createTextNode(st[1]));
    row.appendChild(s);
    return row;
  }

  function renderPassport() {
    const p = D.passports[passSite], root = $('passBody');
    root.innerHTML = '';
    document.querySelectorAll('#passSites button').forEach((b) => b.classList.toggle('on', b.dataset.site === passSite));
    const age = NOW - p.year;

    const head = el('div', 'card wide');
    head.append(el('h2', null, p.title), el('p', 'muted', p.owner + (p.address ? ' · ' + p.address : '')));
    const facts = el('div', 'facts');
    const fact = (v, l) => { const f = el('div', 'fact'); f.append(el('b', null, v), el('span', null, l)); facts.appendChild(f); };
    fact(String(p.year), 'Ishga tushgan yili');
    fact(nf(p.areaHa, 1) + ' ga', 'Umumiy yer maydoni');
    fact(nf(p.wells) + ' ta', 'Artezian quduqlar');
    fact(nf(p.capacityDay) + ' m³/sutka', 'Suv ishlab chiqarish quvvati');
    fact(nf(totalVolume(p)) + ' m³', 'Toza suv rezervuarlari: ' + p.reservoirs.map((r) => `${r.count}×${nf(r.volume)} m³`).join(' + '));
    fact(p.staff + ' kishi', 'Xodimlar');
    head.appendChild(facts);
    root.appendChild(head);

    const life = el('div', 'card');
    life.append(el('h3', null, 'Texnik xizmat muddati'), el('p', 'muted', `${NOW}-yil holatiga inshoot ${age} yildan beri ishlaydi.`));
    life.append(lifeRow(D.serviceLife.facility.label, D.serviceLife.facility, age), lifeRow(D.serviceLife.reservoir.label, D.serviceLife.reservoir, age));
    life.appendChild(el('p', 'note', "Rezervuarlarning qurilgan yili pasportda ko'rsatilmagan — yoshi inshoot ishga tushgan yil bo'yicha hisoblandi. Rezervuar keyinroq qurilgan yoki ta'mirlangan bo'lsa, haqiqiy yoshi kichikroq."));
    root.appendChild(life);

    const tech = el('div', 'card');
    tech.appendChild(el('h3', null, "Texnik ma'lumotlar"));
    const tb = el('table', 'kv');
    const kv = (k, v) => { const tr = el('tr'); tr.append(el('th', null, k), el('td', null, v)); tb.appendChild(tr); };
    kv('Himoya devori perimetri', p.perimeter);
    kv('Zararsizlantirish', p.chlorination);
    kv('Transformatorlar', p.transformers);
    p.lines.forEach((l, i) => kv(i ? '' : 'Elektr liniyalari', l));
    tech.appendChild(tb);
    root.appendChild(tech);

    const pipes = el('div', 'card');
    pipes.appendChild(el('h3', null, 'Suv tarmoqlari'));
    const pt = el('table', 'kv pipes'), maxKm = Math.max(...p.pipes.map((x) => x[1]));
    for (const [d, km] of p.pipes) {
      const tr = el('tr'); tr.appendChild(el('th', null, `D-${d} mm`));
      const td = el('td'); const bar = el('div', 'hbar'); bar.style.width = Math.max(2, (km / maxKm) * 100) + '%'; td.appendChild(bar);
      tr.append(td, el('td', 'num', nf(km, 2) + ' km')); pt.appendChild(tr);
    }
    const tr = el('tr', 'total'); tr.append(el('th', null, 'Jami'), el('td'), el('td', 'num', nf(p.pipes.reduce((s, x) => s + x[1], 0), 2) + ' km')); pt.appendChild(tr);
    pipes.appendChild(pt);
    root.appendChild(pipes);

    const sim = el('div', 'card');
    sim.append(el('h3', null, 'Toshqin simulyatsiyasi'), el('p', 'muted', "Rezervuar yorilishi ssenariysini xaritada ko'rish:"));
    const row = el('div', 'row');
    const go = (label, m3) => { const b = el('button', null, label); b.onclick = () => { app.selectSite(passSite, true); $('volume').value = m3 / 1e6; $('preset').value = String(m3); showTab('map'); $('run').click(); }; row.appendChild(b); };
    go(`Barcha rezervuarlar (${nf(totalVolume(p))} m³)`, totalVolume(p));
    for (const r of p.reservoirs) go(`Bitta ${nf(r.volume)} m³`, r.volume);
    sim.appendChild(row);
    root.appendChild(sim);

    if (p.notes.length) {
      const n = el('div', 'card wide'); n.appendChild(el('h3', null, 'Izohlar'));
      const ul = el('ul', 'notes'); p.notes.forEach((x) => ul.appendChild(el('li', null, x))); n.appendChild(ul); root.appendChild(n);
    }
    const gal = el('div', 'card wide'); gal.appendChild(el('h3', null, 'Sxema va hujjatlar'));
    const g = el('div', 'gallery');
    for (const im of p.images) {
      const f = el('figure'); const i = el('img'); i.src = im.file; i.alt = im.caption; i.loading = 'lazy';
      i.onerror = () => { f.remove(); if (!g.children.length) gal.remove(); }; // rasm fayli bo'lmasa (masalan, repozitoriydan olingan nusxada) ko'rsatilmaydi
      i.onclick = () => { $('lightImg').src = im.file; $('lightCap').textContent = im.caption; $('lightbox').style.display = 'flex'; };
      f.append(i, el('figcaption', null, im.caption)); g.appendChild(f);
    }
    gal.appendChild(g); root.appendChild(gal);
  }
  document.querySelectorAll('#passSites button').forEach((b) => (b.onclick = () => { passSite = b.dataset.site; renderPassport(); }));
  $('lightbox').onclick = () => { $('lightbox').style.display = 'none'; };
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('lightbox').style.display = 'none'; });

  // ───────────── Grafik (bitta qator: chiziq + maydon, hover bilan) ─────────────
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  function niceMax(v) { const p = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * p) return m * p; return 10 * p; }

  function lineChart(card, cfg) {
    const pts = cfg.points, host = card.querySelector('.plot');
    host.innerHTML = '';
    const W = Math.max(260, host.clientWidth), H = 190, L = 52, R = 14, T = 12, B = 26;
    const yMax = cfg.max || niceMax(Math.max(...pts.map((p) => p.y)));
    const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
    const X = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R), Y = (y) => T + (1 - y / yMax) * (H - T - B);
    const svg = sv('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': cfg.title });
    for (const g of [0, 0.5, 1]) {
      svg.appendChild(sv('line', { x1: L, x2: W - R, y1: Y(yMax * g), y2: Y(yMax * g), class: 'grid' }));
      const t = sv('text', { x: L - 6, y: Y(yMax * g) + 3.5, class: 'axis', 'text-anchor': 'end' }); t.textContent = nf(yMax * g, yMax < 10 ? 1 : 0); svg.appendChild(t);
    }
    const every = Math.ceil(pts.length / Math.floor((W - L - R) / 44));
    pts.forEach((p, i) => { if (i % every && i !== pts.length - 1) return; if (i !== pts.length - 1 && X(x1) - X(p.x) < 30) return;
      const t = sv('text', { x: X(p.x), y: H - 8, class: 'axis', 'text-anchor': 'middle' }); t.textContent = p.x; svg.appendChild(t); });
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    svg.appendChild(sv('path', { d: d + ` L${X(x1)} ${Y(0)} L${X(x0)} ${Y(0)} Z`, class: 'area' }));
    svg.appendChild(sv('path', { d, class: 'line' }));
    if (pts.length <= 24) pts.forEach((p) => svg.appendChild(sv('circle', { cx: X(p.x), cy: Y(p.y), r: 3, class: 'dot' })));
    const cross = sv('line', { y1: T, y2: H - B, class: 'cross', visibility: 'hidden' }), hot = sv('circle', { r: 5, class: 'hot', visibility: 'hidden' });
    svg.append(cross, hot);
    const hit = sv('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' });
    svg.appendChild(hit);
    host.appendChild(svg);
    const tip = el('div', 'tip'); host.appendChild(tip);
    const move = (e) => {
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left;
      let best = pts[0]; for (const p of pts) if (Math.abs(X(p.x) - mx) < Math.abs(X(best.x) - mx)) best = p;
      cross.setAttribute('x1', X(best.x)); cross.setAttribute('x2', X(best.x)); cross.setAttribute('visibility', 'visible');
      hot.setAttribute('cx', X(best.x)); hot.setAttribute('cy', Y(best.y)); hot.setAttribute('visibility', 'visible');
      tip.innerHTML = '';
      tip.append(el('b', null, `${best.x}: ${nf(best.y, best.y < 1000 ? 1 : 0)} ${cfg.unitShort || ''}`.trim()));
      if (best.note) tip.append(el('span', null, best.note));
      tip.style.display = 'block';
      const tx = X(best.x) + 10 + tip.offsetWidth > W ? X(best.x) - 10 - tip.offsetWidth : X(best.x) + 10;
      tip.style.left = Math.max(0, tx) + 'px'; tip.style.top = Math.max(0, Y(best.y) - 34) + 'px';
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); hot.setAttribute('visibility', 'hidden'); });

    const tbl = card.querySelector('.tbl table'); tbl.innerHTML = '';
    const hr = el('tr'); hr.append(el('th', null, 'Yil'), el('th', null, cfg.unit), el('th', null, 'Izoh')); tbl.appendChild(hr);
    pts.forEach((p) => { const tr = el('tr'); tr.append(el('td', null, String(p.x)), el('td', 'num', nf(p.y, p.y < 1000 ? 1 : 0)), el('td', null, p.note || '')); tbl.appendChild(tr); });
  }
  function chartCard(title, unit, extra) {
    const c = el('div', 'card chart');
    c.append(el('h3', null, title), el('p', 'muted', unit));
    if (extra) c.appendChild(extra);
    c.appendChild(el('div', 'plot'));
    const det = el('details', 'tbl'); det.append(el('summary', null, "Jadval ko'rinishi"), el('table', 'kv')); c.appendChild(det);
    return c;
  }

  // ───────────── Statistika ─────────────
  let statBuilt = false; const redraws = [];
  function renderStats() {
    if (!statBuilt) {
      statBuilt = true;
      const root = $('statBody'), P = D.population;
      // aholi
      const ctl = el('div', 'row ctl');
      const selR = el('select'), selM = el('select');
      Object.keys(P.regions).forEach((n) => { const o = el('option', null, n); o.value = n; selR.appendChild(o); });
      selR.value = 'Samarqand sh.';
      [['0', 'Jami aholi'], ['1', 'Shahar aholisi'], ['2', 'Qishloq aholisi']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; selM.appendChild(o); });
      const l1 = el('label', null, 'Hudud '); l1.appendChild(selR); const l2 = el('label', null, "Ko'rsatkich "); l2.appendChild(selM); ctl.append(l1, l2);
      const pc = chartCard('Aholi soni', 'ming kishi, yil boshiga', ctl); pc.classList.add('wide');
      const sum = el('p', 'muted'); pc.insertBefore(sum, pc.querySelector('.plot'));
      root.appendChild(pc);
      const drawPop = () => {
        const m = +selM.value, pts = P.years.map((y, i) => ({ x: y, y: P.regions[selR.value][i] ? P.regions[selR.value][i][m] : NaN })).filter((p) => isFinite(p.y));
        pc.querySelector('h3').textContent = `Aholi soni — ${selR.value}, ${selM.options[selM.selectedIndex].text.toLowerCase()}`;
        const a = pts[0], b = pts[pts.length - 1];
        sum.textContent = a.y > 0 ? `${a.x}-yilda ${nf(a.y, 1)} ming, ${b.x}-yilda ${nf(b.y, 1)} ming kishi (${b.y >= a.y ? '+' : ''}${nf(((b.y - a.y) / a.y) * 100, 0)}%).` : '';
        lineChart(pc, { title: pc.querySelector('h3').textContent, unit: 'ming kishi', unitShort: 'ming kishi', points: pts });
      };
      selR.onchange = selM.onchange = drawPop; redraws.push(drawPop);
      // diagrammalar
      for (const d of D.diagrams) {
        const c = chartCard(d.title, d.unit);
        if (d.source) c.appendChild(el('p', 'note', d.source));
        root.appendChild(c);
        redraws.push(() => lineChart(c, { title: d.title, unit: d.unit, unitShort: d.unit.replace(/^indeks.*/, ''), max: d.max, points: d.points }));
      }
      root.appendChild(el('p', 'note wide', "Aholi soni — «Hududlar bo'yicha shahar va qishloq aholisi soni» jadvalidan. Qolgan diagrammalar «diagramma uchun» jadvalidagi qiymatlar bo'yicha qurilgan; ular jadvalda qanday berilgan bo'lsa, shunday ko'rsatilgan."));
    }
    redraws.forEach((f) => f());
  }
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if ($('viewStat').style.display === 'block') redraws.forEach((f) => f()); }, 150); });

  window.dashInfo = { showTab };
})();
