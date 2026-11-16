/* Suv toshqini simulyatsiyasi yadrosi.
 * 2D "local inertial" sayoz suv modeli (Bates va b., 2010 — LISFLOOD-FP usuli) DEM panjarasida.
 * To'g'on yorilishi gidrografi: Froehlich (2008) cho'qqi sarfi + uchburchak gidrograf.
 * Brauzer Worker'ida ham, Node'da ham ishlaydi.
 */
(function (root) {
  const G = 9.81;

  // SRTM butun metrli "zinapoya"larini yumshatish uchun 3x3 o'rtacha
  function smoothDem(src, W, H) {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dxx = -1; dxx <= 1; dxx++) {
            const xx = x + dxx;
            if (xx < 0 || xx >= W) continue;
            s += src[yy * W + xx]; c++;
          }
        }
        out[y * W + x] = s / c;
      }
    }
    return out;
  }

  function breachHydrograph(volume, damHeight) {
    // Froehlich (2008): Qp = 0.607 * Vw^0.295 * hw^1.24  (m3/s)
    const Qp = 0.607 * Math.pow(volume, 0.295) * Math.pow(damHeight, 1.24);
    const T = (2 * volume) / Qp;          // uchburchak gidrograf: hajm = Qp*T/2
    const tr = Math.max(0.1 * T, 30);      // ko'tarilish vaqti
    const Q = (t) => (t <= 0 ? 0 : t < tr ? (Qp * t) / tr : t < T ? (Qp * (T - t)) / (T - tr) : 0);
    return { Qp, T, tr, Q };
  }

  /**
   * p: { dem:Float32Array, W, H, dx, sx, sy, volume(m3), damHeight(m), n, duration(s), frameEvery(s) }
   * onFrame({t, depthCm:Uint16Array, stats})
   * qaytaradi: { maxDepthCm:Uint16Array, summary }
   */
  function simulate(p, onFrame) {
    const W = p.W, H = p.H, N = W * H, dx = p.dx;
    const n2 = p.n * p.n;
    const z = smoothDem(p.dem, W, H);
    const h = new Float32Array(N);
    const qx = new Float32Array(N); // (i,j) va (i+1,j) orasidagi oqim, m2/s
    const qy = new Float32Array(N); // (i,j) va (i,j+1) orasidagi oqim
    const hMaxMap = new Float32Array(N);
    const hyd = breachHydrograph(p.volume, p.damHeight);

    const sx = Math.min(W - 3, Math.max(2, p.sx)), sy = Math.min(H - 3, Math.max(2, p.sy));
    const srcCells = [];
    for (let dy = -1; dy <= 1; dy++) for (let dxx = -1; dxx <= 1; dxx++) srcCells.push((sy + dy) * W + sx + dxx);

    let x0 = sx - 2, x1 = sx + 2, y0 = sy - 2, y1 = sy + 2; // faol hudud
    let t = 0, hmax = 0, injected = 0, outflow = 0, steps = 0;
    let nextFrame = p.frameEvery;
    const timeline = [];
    let peakArea = 0, peakDepth = 0;
    const cellArea = dx * dx;

    function frameStats() {
      let wet = 0, vol = 0, mx = 0, far2 = 0;
      for (let j = y0; j <= y1; j++) {
        for (let i = x0; i <= x1; i++) {
          const d = h[j * W + i];
          if (d > 0.1) {
            wet++; vol += d;
            if (d > mx) mx = d;
            const r2 = (i - sx) * (i - sx) + (j - sy) * (j - sy);
            if (r2 > far2) far2 = r2;
          }
        }
      }
      const areaKm2 = (wet * cellArea) / 1e6;
      return {
        t,
        areaKm2,
        maxDepth: mx,
        meanDepth: wet ? vol / wet : 0,
        releasedM3: injected,
        Q: hyd.Q(t),
        frontKm: (Math.sqrt(far2) * dx) / 1000,
        leftGridM3: outflow,
      };
    }

    function emit() {
      const st = frameStats();
      if (st.areaKm2 > peakArea) peakArea = st.areaKm2;
      if (st.maxDepth > peakDepth) peakDepth = st.maxDepth;
      timeline.push({ tMin: Math.round(t / 60), areaKm2: +st.areaKm2.toFixed(3), maxDepth: +st.maxDepth.toFixed(2), frontKm: +st.frontKm.toFixed(2) });
      if (onFrame) {
        const cm = new Uint16Array(N);
        for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
          const k = j * W + i; const v = h[k] * 100;
          cm[k] = v > 65535 ? 65535 : v;
        }
        onFrame({ t, depthCm: cm, stats: st });
      }
    }

    while (t < p.duration) {
      let dt = hmax > 0.01 ? (0.7 * dx) / Math.sqrt(G * hmax) : 10;
      if (dt > 15) dt = 15;
      if (t + dt > nextFrame) dt = Math.max(0.05, nextFrame - t);

      // to'g'on yorilishidan kirim
      const qin = hyd.Q(t + dt / 2);
      if (qin > 0) {
        const add = (qin * dt) / cellArea / srcCells.length;
        for (let s = 0; s < srcCells.length; s++) h[srcCells[s]] += add;
        injected += qin * dt;
      }

      const lim = dx / (4 * dt);
      const xe = Math.min(x1, W - 2), ye = Math.min(y1, H - 2);
      // x yo'nalishidagi oqimlar
      for (let j = y0; j <= y1; j++) {
        const row = j * W;
        for (let i = x0; i <= xe; i++) {
          const a = row + i, b = a + 1;
          const ha = h[a], hb = h[b];
          if (ha < 1e-4 && hb < 1e-4) { qx[a] = 0; continue; }
          const za = z[a], zb = z[b];
          const ea = za + ha, eb = zb + hb;
          const hf = (ea > eb ? ea : eb) - (za > zb ? za : zb);
          if (hf < 1e-3) { qx[a] = 0; continue; }
          let q = qx[a];
          q = (q - G * hf * dt * (eb - ea) / dx) / (1 + (G * dt * n2 * Math.abs(q)) / Math.pow(hf, 7 / 3));
          const qmax = hf * Math.sqrt(G * hf); // Fr <= 1
          if (q > qmax) q = qmax; else if (q < -qmax) q = -qmax;
          if (q > 0) { const l = ha * lim; if (q > l) q = l; }
          else { const l = -hb * lim; if (q < l) q = l; }
          qx[a] = q;
        }
      }
      // y yo'nalishidagi oqimlar
      for (let j = y0; j <= ye; j++) {
        const row = j * W;
        for (let i = x0; i <= x1; i++) {
          const a = row + i, b = a + W;
          const ha = h[a], hb = h[b];
          if (ha < 1e-4 && hb < 1e-4) { qy[a] = 0; continue; }
          const za = z[a], zb = z[b];
          const ea = za + ha, eb = zb + hb;
          const hf = (ea > eb ? ea : eb) - (za > zb ? za : zb);
          if (hf < 1e-3) { qy[a] = 0; continue; }
          let q = qy[a];
          q = (q - G * hf * dt * (eb - ea) / dx) / (1 + (G * dt * n2 * Math.abs(q)) / Math.pow(hf, 7 / 3));
          const qmax = hf * Math.sqrt(G * hf);
          if (q > qmax) q = qmax; else if (q < -qmax) q = -qmax;
          if (q > 0) { const l = ha * lim; if (q > l) q = l; }
          else { const l = -hb * lim; if (q < l) q = l; }
          qy[a] = q;
        }
      }
      // chuqurlikni yangilash
      const c = dt / dx;
      let nx0 = W, nx1 = -1, ny0 = H, ny1 = -1;
      hmax = 0;
      for (let j = y0; j <= y1; j++) {
        const row = j * W;
        for (let i = x0; i <= x1; i++) {
          const k = row + i;
          let d = h[k] + c * ((i > 0 ? qx[k - 1] : 0) - qx[k] + (j > 0 ? qy[k - W] : 0) - qy[k]);
          if (d < 0) d = 0;
          if (i === 0 || j === 0 || i === W - 1 || j === H - 1) { outflow += d * cellArea; d = 0; } // ochiq chegara
          h[k] = d;
          if (d > 1e-3) {
            if (d > hmax) hmax = d;
            if (d > hMaxMap[k]) hMaxMap[k] = d;
            if (i < nx0) nx0 = i; if (i > nx1) nx1 = i;
            if (j < ny0) ny0 = j; if (j > ny1) ny1 = j;
          }
        }
      }
      if (nx1 >= 0) {
        x0 = Math.max(0, Math.min(nx0 - 1, sx - 2)); x1 = Math.min(W - 1, Math.max(nx1 + 1, sx + 2));
        y0 = Math.max(0, Math.min(ny0 - 1, sy - 2)); y1 = Math.min(H - 1, Math.max(ny1 + 1, sy + 2));
      }
      t += dt; steps++;
      if (t >= nextFrame - 1e-6) { emit(); nextFrame += p.frameEvery; }
    }

    const maxDepthCm = new Uint16Array(N);
    let everWet = 0;
    for (let k = 0; k < N; k++) {
      const v = hMaxMap[k];
      if (v > 0.1) everWet++;
      maxDepthCm[k] = v * 100 > 65535 ? 65535 : v * 100;
    }
    const last = frameStats();
    return {
      maxDepthCm,
      summary: {
        peakDischargeM3s: +hyd.Qp.toFixed(1),
        emptyingTimeMin: +(hyd.T / 60).toFixed(1),
        releasedMlnM3: +(injected / 1e6).toFixed(4),
        totalFloodedAreaKm2: +((everWet * cellArea) / 1e6).toFixed(3), // biror payt >10 sm suv bosgan
        peakInstantAreaKm2: +peakArea.toFixed(3),
        maxDepthM: +peakDepth.toFixed(2),
        finalMeanDepthM: +last.meanDepth.toFixed(2),
        frontDistanceKm: +last.frontKm.toFixed(2),
        leftGridMlnM3: +(outflow / 1e6).toFixed(4),
        simulatedHours: +(t / 3600).toFixed(2),
        cellSizeM: +dx.toFixed(1),
        steps,
        timeline,
      },
    };
  }

  root.FloodSim = { simulate, breachHydrograph, smoothDem };
})(typeof self !== 'undefined' ? self : globalThis);
