/* İnteraktif Sıcaklık & Karar Grafiği (Kontrol Odası dili)
 *
 * "Borsa ekranı" ergonomisi — ama bu bir ısı verisi İNCELEME aracıdır:
 *   • Zoom (tekerlek) + Pan (sürükle) + Sıfırla (çift tık)  → controlled `view`
 *   • Tam crosshair + sağ/alt eksen etiketleri + son değer rozeti
 *   • Hareketli ortalama (MA) overlay
 *   • Ölçüm aracı (iki nokta arası Δ°C / Δsüre / eğim)
 *   • Klavye navigasyonu (← → pan, +/- zoom, Home reset, [ ] crosshair, Esc)
 *   • Mini-map / brush (CRChartBrush) — tüm seriyi gösterir, pencereyi sürükle/boyutlandır
 *
 * Tüm yeni prop'lar opsiyonel ve defaultludur → bileşen geriye uyumlu kalır.
 */
(function () {
  const { useState, useRef, useEffect } = React;
  const e = React.createElement;

  const pad2 = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const MIN_SPAN = 5 * 60 * 1000; // en fazla yakınlaşma: 5 dakikalık pencere

  // Seçili aralık için MKT (Mean Kinetic Temperature) — MKTEngine ile aynı formül.
  // ΔH = 83.144 kJ/mol (WHO), R = 8.314 J/(mol·K). Bağımsız hesaplanır (global gerekmez).
  const MKT_DH = 83144, MKT_R = 8.314;
  function mktOf(temps) {
    const k = temps.length;
    if (!k) return null;
    let sum = 0;
    for (let i = 0; i < k; i++) sum += Math.exp(-MKT_DH / (MKT_R * (temps[i] + 273.15)));
    return MKT_DH / (MKT_R * (-Math.log(sum / k))) - 273.15;
  }

  // t (ms) → "gg.aa"
  function dateLabel(t) {
    const d = new Date(t);
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1);
  }
  // t (ms) → "HH:mm"
  function timeLabel(t) {
    const d = new Date(t);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  // t (ms) → "gg.aa.yy · HH:mm"
  function dateTimeLabel(t) {
    const d = new Date(t);
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  // süre (ms) → "2g 3sa 12dk" / "3sa 12dk" / "12dk 30sn"
  function durLabel(ms) {
    const s = Math.round(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60), ss = s % 60;
    if (d > 0) return `${d}g ${h}sa ${m}dk`;
    if (h > 0) return `${h}sa ${m}dk`;
    if (m > 0) return `${m}dk ${ss}sn`;
    return `${ss}sn`;
  }

  function CRDecisionChart({ data, gaps = [], band = [2, 8], mkt, color, theme = 'dark',
    w = 1040, h = 300, padL = 40, padR = 18, padT = 18, padB = 30,
    view = null, fullRange = null, onViewChange = null,
    maWindowMs = null, measure = false, onExitMeasure = null }) {
    const [hi, setHi] = useState(null);
    const [meas, setMeas] = useState(null); // {t0, t1} ölçüm bölgesi
    const svgRef = useRef(null);
    const panRef = useRef(null);   // {startX, t0, t1}
    const measRef = useRef(null);  // {t0} ölçüm sürükleme başlangıcı

    const n = data.length;

    // değer aralığı (min/max) — büyük dizilerde spread call-stack'i patlatabilir
    let vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = data[i].v;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    if (!isFinite(vMin)) { vMin = band[0]; vMax = band[1]; }
    const lo = Math.min(vMin, band[0]) - 1.0;
    const top = Math.max(vMax, band[1]) + 1.2;
    const innerW = w - padL - padR, innerH = h - padT - padB;

    // X ekseni: görünür pencere [vT0, vT1]. view verilmişse onu, yoksa veri uçlarını kullan.
    const vT0 = view ? view.t0 : (n > 0 ? data[0].t : 0);
    const vT1 = view ? view.t1 : (n > 0 ? data[n - 1].t : 1);
    const tSpan = (vT1 - vT0) || 1;
    // Tüm verinin aralığı (zoom/pan kelepçesi)
    const fT0 = fullRange ? fullRange.t0 : vT0;
    const fT1 = fullRange ? fullRange.t1 : vT1;
    const fullSpan = (fT1 - fT0) || 1;

    const tToX = tv => padL + ((tv - vT0) / tSpan) * innerW;
    const xToT = px => vT0 + ((px - padL) / innerW) * tSpan;
    const X = i => tToX(data[i].t);
    const Y = v => padT + (1 - (v - lo) / (top - lo)) * innerH;

    const linePath = data.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d.v).toFixed(1)}`).join(' ');
    const areaPath = n > 0
      ? linePath + ` L${X(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L${X(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
      : '';

    // Çizgi rengi: bant içi (mavi) vs. bant dışına bağlanan kollar (kırmızı).
    // Bir segmentin iki ucundan biri bantın dışındaysa o kol kırmızı çizilir.
    const inBand = v => v >= band[0] && v <= band[1];
    let inPath = '', outPath = '';
    for (let i = 0; i < n - 1; i++) {
      const seg = `M${X(i).toFixed(1)} ${Y(data[i].v).toFixed(1)} L${X(i + 1).toFixed(1)} ${Y(data[i + 1].v).toFixed(1)}`;
      if (inBand(data[i].v) && inBand(data[i + 1].v)) inPath += (inPath ? ' ' : '') + seg;
      else outPath += (outPath ? ' ' : '') + seg;
    }

    // hareketli ortalama (görünür veri üzerinden, kayan pencere)
    let maPath = '';
    if (maWindowMs && n > 1) {
      let head = 0, sum = 0;
      const pts = [];
      for (let i = 0; i < n; i++) {
        sum += data[i].v;
        while (data[head].t < data[i].t - maWindowMs) { sum -= data[head].v; head++; }
        const avg = sum / (i - head + 1);
        pts.push(`${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(avg).toFixed(1)}`);
      }
      maPath = pts.join(' ');
    }

    // sapma segmentleri: v > üst bant
    const segs = []; let cur = null;
    data.forEach((d, i) => {
      const over = d.v > band[1];
      if (over && !cur) cur = { s: i, e: i };
      else if (over && cur) cur.e = i;
      else if (!over && cur) { segs.push(cur); cur = null; }
    });
    if (cur) segs.push(cur);

    // her sapma için pik noktası
    const peaks = segs.map(s => {
      let pi = s.s, pv = data[s.s].v;
      for (let i = s.s; i <= s.e; i++) if (data[i].v > pv) { pv = data[i].v; pi = i; }
      return { i: pi, v: pv };
    });

    // y grid çizgileri (tam sayı adımlar)
    const yticks = [];
    const span = top - lo, stepN = span > 16 ? 4 : 2;
    for (let v = Math.ceil(lo / stepN) * stepN; v <= top; v += stepN) yticks.push(v);

    // x ekseni: ZAMAN olarak eşit aralıklı 5 tick
    const xtickN = 5;
    const xticks = [];
    for (let k = 0; k < xtickN; k++) {
      const f = k / (xtickN - 1);
      xticks.push({ x: padL + f * innerW, t: vT0 + f * tSpan });
    }
    // Görünen pencere ≤ 24 saat ise saat:dakika, değilse gün.ay etiketi
    const DAY_MS = 86400000;
    const fmtX = tSpan > 0 && tSpan <= DAY_MS ? timeLabel : dateLabel;

    function tToXClamped(tv) {
      if (tv <= vT0) return padL;
      if (tv >= vT1) return padL + innerW;
      return tToX(tv);
    }
    // Görünür pencereye kırpılmış veri kaybı bölgeleri (≥3px görünen)
    const gapBands = (gaps || []).map(g => {
      const x0 = tToXClamped(g.t0), x1 = tToXClamped(g.t1);
      return { x0, x1, w: x1 - x0, minutes: g.minutes };
    }).filter(g => g.w >= 3);

    const gid = 'dc' + (theme === 'light' ? 'L' : 'D');
    const bandColor = 'var(--okS)';
    const overColor = 'var(--bad)';
    const safeColor = 'var(--sig)'; // bant içi çizgi/dolgu rengi (mavi)

    // ---- view (zoom/pan) yardımcıları --------------------------------------
    function emitView(t0, t1) {
      if (!onViewChange) return;
      let s = t1 - t0;
      s = clamp(s, MIN_SPAN, fullSpan);
      // span clamp sonrası merkezleme bozulmasın diye t1'i yeniden hesapla
      if (t1 - t0 !== s) t1 = t0 + s;
      if (t0 < fT0) { t0 = fT0; t1 = t0 + s; }
      if (t1 > fT1) { t1 = fT1; t0 = t1 - s; }
      if (t0 < fT0) t0 = fT0;
      onViewChange(t0, t1);
    }
    function resetView() { if (onViewChange) onViewChange(fT0, fT1); }

    // En yakın veri index'i (zaman → index, ikili arama; data[].t artan)
    function nearestIndex(tv) {
      if (n === 0) return 0;
      let a = 0, b = n - 1;
      while (a < b) { const mid = (a + b) >> 1; if (data[mid].t < tv) a = mid + 1; else b = mid; }
      let i = a;
      if (a > 0 && Math.abs(data[a - 1].t - tv) < Math.abs(data[a].t - tv)) i = a - 1;
      return clamp(i, 0, n - 1);
    }
    function evToT(ev) {
      const r = svgRef.current.getBoundingClientRect();
      const vbx = ((ev.clientX - r.left) / r.width) * w;
      return xToT(clamp(vbx, padL, padL + innerW));
    }

    // wheel zoom — passive olmayan native listener (sayfa kaymasın)
    const liveRef = useRef({});
    liveRef.current = { vT0, vT1, fT0, fT1, fullSpan, innerW, padL, w, onViewChange, measure };
    useEffect(() => {
      const el = svgRef.current;
      if (!el) return;
      const onWheelNative = (ev) => {
        const L = liveRef.current;
        if (!L.onViewChange) return;
        ev.preventDefault();
        const r = el.getBoundingClientRect();
        const vbx = ((ev.clientX - r.left) / r.width) * L.w;
        const frac = clamp((vbx - L.padL) / L.innerW, 0, 1);
        const curSpan = L.vT1 - L.vT0;
        const tc = L.vT0 + frac * curSpan;
        const factor = ev.deltaY > 0 ? 1.25 : 1 / 1.25;
        let s = clamp(curSpan * factor, MIN_SPAN, L.fullSpan);
        let t0 = tc - frac * s, t1 = t0 + s;
        if (t0 < L.fT0) { t0 = L.fT0; t1 = t0 + s; }
        if (t1 > L.fT1) { t1 = L.fT1; t0 = t1 - s; }
        if (t0 < L.fT0) t0 = L.fT0;
        L.onViewChange(t0, t1);
      };
      el.addEventListener('wheel', onWheelNative, { passive: false });
      return () => el.removeEventListener('wheel', onWheelNative);
    }, []);

    // ölçüm modundan çıkınca/yeni veri gelince seçimi temizle
    useEffect(() => { if (!measure) setMeas(null); }, [measure]);

    function onMouseDown(ev) {
      if (n < 2) return;
      const tv = evToT(ev);
      if (measure) {
        measRef.current = { t0: tv };
        setMeas({ t0: tv, t1: tv });
      } else if (onViewChange) {
        panRef.current = { startX: ev.clientX, t0: vT0, t1: vT1 };
      }
    }
    function onMove(ev) {
      if (n === 0) return;
      // pan
      if (panRef.current) {
        const p = panRef.current;
        const r = svgRef.current.getBoundingClientRect();
        const dxPx = ((ev.clientX - p.startX) / r.width) * w;
        const dt = -(dxPx / innerW) * (p.t1 - p.t0);
        let t0 = p.t0 + dt, t1 = p.t1 + dt;
        const s = t1 - t0;
        if (t0 < fT0) { t0 = fT0; t1 = t0 + s; }
        if (t1 > fT1) { t1 = fT1; t0 = t1 - s; }
        if (onViewChange) onViewChange(t0, t1);
        return;
      }
      // measure sürükleme
      if (measRef.current) {
        const tv = evToT(ev);
        setMeas({ t0: measRef.current.t0, t1: tv });
      }
      // hover (her zaman)
      setHi(nearestIndex(evToT(ev)));
    }
    function endDrag() {
      panRef.current = null;
      if (measRef.current) {
        measRef.current = null;
        // çok kısa seçim → iptal
        setMeas(m => (m && Math.abs(m.t1 - m.t0) < tSpan * 0.005) ? null : m);
      }
    }
    function onLeave() { setHi(null); endDrag(); }

    function onKeyDown(ev) {
      if (n < 2) return;
      const k = ev.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        if (!onViewChange) return;
        ev.preventDefault();
        const d = (k === 'ArrowRight' ? 1 : -1) * tSpan * 0.2;
        emitView(vT0 + d, vT1 + d);
      } else if (k === '+' || k === '=' || k === '-' || k === '_') {
        if (!onViewChange) return;
        ev.preventDefault();
        const zin = (k === '+' || k === '=');
        const tc = (vT0 + vT1) / 2;
        let s = clamp(tSpan * (zin ? 1 / 1.3 : 1.3), MIN_SPAN, fullSpan);
        emitView(tc - s / 2, tc + s / 2);
      } else if (k === 'Home' || k === '0') {
        ev.preventDefault(); resetView();
      } else if (k === '[' || k === ']') {
        ev.preventDefault();
        const base = hi == null ? nearestIndex((vT0 + vT1) / 2) : hi;
        setHi(clamp(base + (k === ']' ? 1 : -1), 0, n - 1));
      } else if (k === 'Escape') {
        setMeas(null);
        if (measure && onExitMeasure) onExitMeasure();
      }
    }

    const hd = hi != null ? data[hi] : null;
    const hStatus = hd ? (hd.v > band[1] ? ['İHLAL', overColor] : hd.v < band[0] ? ['DÜŞÜK', 'var(--sig)'] : ['BANT İÇİ', 'var(--ok)']) : null;
    const last = n > 0 ? data[n - 1] : null;
    const lastColor = last ? (last.v > band[1] ? overColor : last.v < band[0] ? 'var(--sig)' : 'var(--ok)') : color;

    // ölçüm istatistikleri (seçili aralık için MKT + maks + min)
    let measInfo = null;
    if (meas && n > 0) {
      const a = Math.min(meas.t0, meas.t1), b = Math.max(meas.t0, meas.t1);
      let mn = Infinity, mx = -Infinity, cnt = 0;
      const vals = [];
      for (let i = 0; i < n; i++) {
        const d = data[i];
        if (d.t < a || d.t > b) continue;
        if (d.v < mn) mn = d.v; if (d.v > mx) mx = d.v;
        vals.push(d.v); cnt++;
      }
      measInfo = {
        x0: tToXClamped(a), x1: tToXClamped(b), cnt,
        min: isFinite(mn) ? mn : null, max: isFinite(mx) ? mx : null,
        mkt: vals.length ? mktOf(vals) : null,
      };
    }

    return e('svg', {
      ref: svgRef, width: '100%', viewBox: `0 0 ${w} ${h}`, tabIndex: 0,
      style: { display: 'block', overflow: 'visible', cursor: measure ? 'crosshair' : (panRef.current ? 'grabbing' : 'crosshair'), outline: 'none', touchAction: 'none' },
      onMouseDown, onMouseMove: onMove, onMouseUp: endDrag, onMouseLeave: onLeave,
      onDoubleClick: resetView, onKeyDown,
    }, [
      e('defs', { key: 'defs' }, [
        e('linearGradient', { key: 'g', id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [
          e('stop', { key: 0, offset: '0%', stopColor: safeColor, stopOpacity: 0.24 }),
          e('stop', { key: 1, offset: '100%', stopColor: safeColor, stopOpacity: 0 }),
        ]),
        e('linearGradient', { key: 'gb', id: gid + 'b', x1: 0, y1: 0, x2: 0, y2: 1 }, [
          e('stop', { key: 0, offset: '0%', stopColor: overColor, stopOpacity: 0.30 }),
          e('stop', { key: 1, offset: '100%', stopColor: overColor, stopOpacity: 0.02 }),
        ]),
        // Veri kaybı için çapraz tarama deseni
        e('pattern', { key: 'gh', id: gid + 'gap', patternUnits: 'userSpaceOnUse', width: 7, height: 7 }, [
          e('path', { key: 'p1', d: 'M0 7 L7 0', stroke: 'var(--t2)', strokeWidth: 1, strokeOpacity: 0.55 }),
          e('path', { key: 'p2', d: 'M-1 1 L1 -1 M6 8 L8 6', stroke: 'var(--t2)', strokeWidth: 1, strokeOpacity: 0.55 }),
        ]),
        // çizim alanını eksenlerin içine kırpan clip (zoom'da taşma olmasın)
        e('clipPath', { key: 'clip', id: gid + 'clip' }, [
          e('rect', { key: 'r', x: padL, y: padT, width: innerW, height: innerH }),
        ]),
      ]),

      // güvenli bant
      e('rect', { key: 'band', x: padL, y: Y(band[1]), width: innerW, height: Y(band[0]) - Y(band[1]), fill: bandColor }),

      // y grid + etiket
      ...yticks.map((v, i) => e('g', { key: 'y' + i }, [
        e('line', { key: 'l', x1: padL, x2: padL + innerW, y1: Y(v), y2: Y(v), stroke: 'var(--ln)', strokeWidth: 1 }),
        e('text', { key: 't', x: padL - 8, y: Y(v) + 3, textAnchor: 'end', fontSize: 10, fill: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace" }, v + '°'),
      ])),

      // x ekseni etiketleri (zaman-eşit aralıklı 5 tick)
      ...xticks.map((tk, i) => e('text', {
        key: 'x' + i, x: tk.x, y: h - 8, textAnchor: i === 0 ? 'start' : i === xticks.length - 1 ? 'end' : 'middle',
        fontSize: 10, fill: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace",
      }, fmtX(tk.t))),

      // bant sınır çizgileri
      e('line', { key: 'bt', x1: padL, x2: padL + innerW, y1: Y(band[1]), y2: Y(band[1]), stroke: 'var(--ok)', strokeOpacity: 0.5, strokeWidth: 1, strokeDasharray: '5 4' }),
      e('line', { key: 'bb', x1: padL, x2: padL + innerW, y1: Y(band[0]), y2: Y(band[0]), stroke: 'var(--ok)', strokeOpacity: 0.5, strokeWidth: 1, strokeDasharray: '5 4' }),
      e('text', { key: 'btl', x: padL + innerW - 2, y: Y(band[1]) - 5, textAnchor: 'end', fontSize: 9, fill: 'var(--ok)', fontFamily: "'JetBrains Mono', monospace", opacity: 0.8 }, band[1] + '° ÜST'),

      // ——— kırpılan çizim grubu (zoom'da eksen dışına taşmaz) ———
      e('g', { key: 'plot', clipPath: `url(#${gid}clip)` }, [
        // dolgu + çizgi (bant içi mavi · bant dışına bağlanan kollar kırmızı)
        areaPath && e('path', { key: 'area', d: areaPath, fill: `url(#${gid})` }),
        inPath && e('path', { key: 'lineIn', d: inPath, fill: 'none', stroke: safeColor, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
        outPath && e('path', { key: 'lineOut', d: outPath, fill: 'none', stroke: overColor, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),

        // hareketli ortalama
        maPath && e('path', { key: 'ma', d: maPath, fill: 'none', stroke: 'var(--amber)', strokeWidth: 1.6, strokeOpacity: 0.95, strokeDasharray: '6 3', strokeLinejoin: 'round' }),

        // veri kaybı bölgeleri
        ...gapBands.map((g, gi) => {
          const gw = Math.max(g.w, 3);
          const cx = g.x0 + gw / 2;
          const showLabel = gw >= 46;
          return e('g', { key: 'gap' + gi }, [
            e('rect', { key: 'b', x: g.x0, y: padT, width: gw, height: innerH, fill: 'var(--pn)', fillOpacity: 0.78 }),
            e('rect', { key: 'h', x: g.x0, y: padT, width: gw, height: innerH, fill: `url(#${gid}gap)` }),
            e('line', { key: 'l0', x1: g.x0, x2: g.x0, y1: padT, y2: padT + innerH, stroke: 'var(--t2)', strokeWidth: 1, strokeDasharray: '3 2', strokeOpacity: 0.75 }),
            e('line', { key: 'l1', x1: g.x0 + gw, x2: g.x0 + gw, y1: padT, y2: padT + innerH, stroke: 'var(--t2)', strokeWidth: 1, strokeDasharray: '3 2', strokeOpacity: 0.75 }),
            showLabel && e('g', { key: 't' }, [
              e('rect', { key: 'r', x: cx - 44, y: padT + 4, width: 88, height: 15, rx: 3, fill: 'var(--pn2)', stroke: 'var(--ln2)', strokeWidth: 1 }),
              e('text', { key: 't', x: cx, y: padT + 14, textAnchor: 'middle', fontSize: 9, fontWeight: 700, fill: 'var(--t2)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.4 }, 'VERİ KAYBI · ' + Math.round(g.minutes) + ' DK'),
            ]),
          ]);
        }),

        // sapma bölgeleri (kırmızı gölge + dikey kapatma)
        ...segs.map((s, si) => {
          const x0 = X(s.s), x1 = X(s.e);
          const yTop = padT, yBand = Y(band[1]);
          return e('g', { key: 'seg' + si }, [
            e('rect', { key: 'r', x: x0, y: yTop, width: Math.max(x1 - x0, 2), height: yBand - yTop, fill: overColor, fillOpacity: 0.07 }),
            e('path', {
              key: 'p',
              d: (() => {
                let p = `M${X(s.s).toFixed(1)} ${Y(band[1]).toFixed(1)}`;
                for (let i = s.s; i <= s.e; i++) p += ` L${X(i).toFixed(1)} ${Y(Math.max(data[i].v, band[1])).toFixed(1)}`;
                p += ` L${X(s.e).toFixed(1)} ${Y(band[1]).toFixed(1)} Z`; return p;
              })(),
              fill: `url(#${gid}b)`,
            }),
          ]);
        }),

        // pik işaretleri
        ...peaks.map((p, pi) => e('g', { key: 'pk' + pi }, [
          e('circle', { key: 'a', cx: X(p.i), cy: Y(p.v), r: 4, fill: overColor }),
          e('circle', { key: 'b', cx: X(p.i), cy: Y(p.v), r: 8, fill: overColor, fillOpacity: 0.18 }),
          e('rect', { key: 'c', x: X(p.i) - 22, y: Y(p.v) - 24, width: 44, height: 16, rx: 4, fill: overColor }),
          e('text', { key: 'd', x: X(p.i), y: Y(p.v) - 12, textAnchor: 'middle', fontSize: 10, fontWeight: 700, fill: '#fff', fontFamily: "'JetBrains Mono', monospace" }, p.v.toFixed(1) + '°'),
        ])),

        // ölçüm aracı bölgesi
        measInfo && e('g', { key: 'meas', style: { pointerEvents: 'none' } }, [
          e('rect', { key: 'r', x: measInfo.x0, y: padT, width: Math.max(measInfo.x1 - measInfo.x0, 1), height: innerH, fill: 'var(--sig)', fillOpacity: 0.10 }),
          e('line', { key: 'l0', x1: measInfo.x0, x2: measInfo.x0, y1: padT, y2: padT + innerH, stroke: 'var(--sig)', strokeWidth: 1, strokeDasharray: '4 3' }),
          e('line', { key: 'l1', x1: measInfo.x1, x2: measInfo.x1, y1: padT, y2: padT + innerH, stroke: 'var(--sig)', strokeWidth: 1, strokeDasharray: '4 3' }),
        ]),
      ]),

      // MKT referans çizgisi
      mkt != null && e('g', { key: 'mkt' }, [
        e('line', { key: 'l', x1: padL, x2: padL + innerW, y1: Y(mkt), y2: Y(mkt), stroke: mkt > band[1] ? overColor : 'var(--sig)', strokeWidth: 1.4, strokeDasharray: '2 3', strokeOpacity: 0.9 }),
        e('rect', { key: 'r', x: padL + 2, y: Y(mkt) - 16, width: 78, height: 14, rx: 3, fill: mkt > band[1] ? overColor : 'var(--sig)' }),
        e('text', { key: 't', x: padL + 6, y: Y(mkt) - 5, fontSize: 9.5, fontWeight: 700, fill: theme === 'light' ? '#fff' : '#04121a', fontFamily: "'JetBrains Mono', monospace" }, 'MKT ' + mkt.toFixed(2) + '°'),
      ]),

      // son değer rozeti (sağ eksen)
      last && !hd && e('g', { key: 'last', style: { pointerEvents: 'none' } }, [
        e('line', { key: 'l', x1: padL, x2: padL + innerW, y1: Y(last.v), y2: Y(last.v), stroke: lastColor, strokeWidth: 1, strokeOpacity: 0.35, strokeDasharray: '1 4' }),
        e('rect', { key: 'r', x: padL + innerW + 1, y: Y(last.v) - 8, width: padR - 1, height: 16, rx: 2, fill: lastColor }),
        e('text', { key: 't', x: padL + innerW + padR / 2, y: Y(last.v) + 3.5, textAnchor: 'middle', fontSize: 8.5, fontWeight: 700, fill: theme === 'light' ? '#fff' : '#04121a', fontFamily: "'JetBrains Mono', monospace" }, last.v.toFixed(1)),
      ]),

      // ölçüm bilgi kutusu — seçili aralık MKT + maks + min
      measInfo && measInfo.cnt > 0 && (() => {
        const BW = 150, BH = 56;
        const bx = clamp((measInfo.x0 + measInfo.x1) / 2 - BW / 2, padL, padL + innerW - BW);
        const mktOver = measInfo.mkt != null && measInfo.mkt > band[1];
        return e('g', { key: 'measbox', style: { pointerEvents: 'none' }, transform: `translate(${bx}, ${padT + 6})` }, [
          e('rect', { key: 'r', x: 0, y: 0, width: BW, height: BH, rx: 7, fill: 'var(--pn2)', stroke: 'var(--sig)', strokeWidth: 1 }),
          e('text', { key: 'a', x: 9, y: 15, fontSize: 9, fontWeight: 700, fill: 'var(--t3)', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 0.6 }, 'ARALIK MKT'),
          e('text', { key: 'b', x: 9, y: 34, fontSize: 16, fontWeight: 700, fill: mktOver ? overColor : 'var(--sig)', fontFamily: "'JetBrains Mono', monospace" }, (measInfo.mkt != null ? measInfo.mkt.toFixed(2) : '—') + '°C'),
          e('text', { key: 'f', x: 9, y: 49, fontSize: 10, fill: 'var(--t2)', fontFamily: "'JetBrains Mono', monospace" }, `maks ${measInfo.max != null ? measInfo.max.toFixed(1) : '—'}° · min ${measInfo.min != null ? measInfo.min.toFixed(1) : '—'}°`),
        ]);
      })(),

      // hover göstergesi (tam crosshair + eksen etiketleri)
      hd && e('g', { key: 'hov', style: { pointerEvents: 'none' } }, [
        // dikey + yatay çizgi
        e('line', { key: 'hl', x1: X(hi), x2: X(hi), y1: padT, y2: padT + innerH, stroke: 'var(--t2)', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.7 }),
        e('line', { key: 'hh', x1: padL, x2: padL + innerW, y1: Y(hd.v), y2: Y(hd.v), stroke: 'var(--t2)', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.5 }),
        e('circle', { key: 'hc', cx: X(hi), cy: Y(hd.v), r: 4.5, fill: hStatus[1], stroke: 'var(--pn)', strokeWidth: 2 }),
        // sağ eksende anlık °C
        e('rect', { key: 'yr', x: padL + innerW + 1, y: Y(hd.v) - 8, width: padR - 1, height: 16, rx: 2, fill: hStatus[1] }),
        e('text', { key: 'yt', x: padL + innerW + padR / 2, y: Y(hd.v) + 3.5, textAnchor: 'middle', fontSize: 8.5, fontWeight: 700, fill: theme === 'light' ? '#fff' : '#04121a', fontFamily: "'JetBrains Mono', monospace" }, hd.v.toFixed(1)),
        // alt eksende anlık saat
        (() => {
          const lblW = 70, lx = clamp(X(hi) - lblW / 2, padL, padL + innerW - lblW);
          return e('g', { key: 'xt' }, [
            e('rect', { key: 'r', x: lx, y: h - 18, width: lblW, height: 14, rx: 2, fill: 'var(--t2)' }),
            e('text', { key: 't', x: lx + lblW / 2, y: h - 8, textAnchor: 'middle', fontSize: 9, fontWeight: 700, fill: 'var(--pn)', fontFamily: "'JetBrains Mono', monospace" }, dateTimeLabel(hd.t)),
          ]);
        })(),
        // detay tooltip
        (() => {
          const TW = 142;
          const bx = clamp(X(hi) - TW / 2, padL, padL + innerW - TW);
          return e('g', { key: 'ht', transform: `translate(${bx}, ${padT + 4})` }, [
            e('rect', { key: 'r', x: 0, y: 0, width: TW, height: 40, rx: 6, fill: 'var(--pn2)', stroke: 'var(--ln2)', strokeWidth: 1 }),
            e('text', { key: 'a', x: 10, y: 16, fontSize: 10, fill: 'var(--tx)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }, dateTimeLabel(hd.t)),
            e('text', { key: 'b', x: 10, y: 32, fontSize: 13, fontWeight: 700, fill: hStatus[1], fontFamily: "'JetBrains Mono', monospace" }, hd.v.toFixed(2) + '°C'),
            e('text', { key: 'c', x: TW - 10, y: 32, textAnchor: 'end', fontSize: 8.5, fontWeight: 700, fill: hStatus[1], fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 0.5 }, hStatus[0]),
          ]);
        })(),
      ]),
    ]);
  }

  /* ——— Mini-map / brush (range selector) ———
   * Tüm seriyi kaba downsample ile gösterir; üstündeki pencere = görünür `view`.
   * Gövdeyi sürükle → pan, kenarları çek → zoom. onViewChange ile ana grafiği günceller.
   */
  function CRChartBrush({ data, band = [2, 8], color, view, fullRange, onViewChange,
    theme = 'dark', w = 1040, h = 54, padL = 40, padR = 18 }) {
    const ref = useRef(null);
    const dragRef = useRef(null); // {mode:'move'|'l'|'r', startX, t0, t1}
    const n = data.length;
    const innerW = w - padL - padR;
    const padT = 6, padB = 6, innerH = h - padT - padB;

    const fT0 = fullRange ? fullRange.t0 : (n ? data[0].t : 0);
    const fT1 = fullRange ? fullRange.t1 : (n ? data[n - 1].t : 1);
    const fSpan = (fT1 - fT0) || 1;

    let vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < n; i++) { const v = data[i].v; if (v < vMin) vMin = v; if (v > vMax) vMax = v; }
    if (!isFinite(vMin)) { vMin = band[0]; vMax = band[1]; }
    const lo = Math.min(vMin, band[0]) - 0.5, tp = Math.max(vMax, band[1]) + 0.5;

    const TX = t => padL + ((t - fT0) / fSpan) * innerW;
    const Y = v => padT + (1 - (v - lo) / (tp - lo)) * innerH;
    const line = data.map((d, i) => `${i ? 'L' : 'M'}${TX(d.t).toFixed(1)} ${Y(d.v).toFixed(1)}`).join(' ');
    // çizgi: bant içi mavi · bant dışına bağlanan kollar kırmızı (ana grafikle aynı)
    const safeColor = 'var(--sig)', overColor = 'var(--bad)';
    const inBand = v => v >= band[0] && v <= band[1];
    let inLine = '', outLine = '';
    for (let i = 0; i < n - 1; i++) {
      const s = `M${TX(data[i].t).toFixed(1)} ${Y(data[i].v).toFixed(1)} L${TX(data[i + 1].t).toFixed(1)} ${Y(data[i + 1].v).toFixed(1)}`;
      if (inBand(data[i].v) && inBand(data[i + 1].v)) inLine += (inLine ? ' ' : '') + s;
      else outLine += (outLine ? ' ' : '') + s;
    }

    const vT0 = view ? view.t0 : fT0, vT1 = view ? view.t1 : fT1;
    const wx0 = TX(vT0), wx1 = TX(vT1);

    function evX(ev) {
      const r = ref.current.getBoundingClientRect();
      return ((ev.clientX - r.left) / r.width) * w;
    }
    function xToT(px) { return fT0 + (clamp(px, padL, padL + innerW) - padL) / innerW * fSpan; }

    function down(mode, ev) {
      ev.stopPropagation();
      dragRef.current = { mode, startX: evX(ev), t0: vT0, t1: vT1 };
    }
    useEffect(() => {
      function move(ev) {
        const d = dragRef.current; if (!d || !onViewChange) return;
        const px = evX(ev), dt = (px - d.startX) / innerW * fSpan;
        let t0 = d.t0, t1 = d.t1;
        if (d.mode === 'move') {
          t0 = d.t0 + dt; t1 = d.t1 + dt; const s = t1 - t0;
          if (t0 < fT0) { t0 = fT0; t1 = t0 + s; }
          if (t1 > fT1) { t1 = fT1; t0 = t1 - s; }
        } else if (d.mode === 'l') {
          t0 = clamp(d.t0 + dt, fT0, t1 - MIN_SPAN);
        } else if (d.mode === 'r') {
          t1 = clamp(d.t1 + dt, t0 + MIN_SPAN, fT1);
        }
        onViewChange(t0, t1);
      }
      function up() { dragRef.current = null; }
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [innerW, fSpan, fT0, fT1, onViewChange]);

    // boşluğa tıkla → o noktayı merkez alan pencereye atla
    function bgClick(ev) {
      if (!onViewChange || dragRef.current) return;
      const tc = xToT(evX(ev)), s = vT1 - vT0;
      let t0 = tc - s / 2, t1 = tc + s / 2;
      if (t0 < fT0) { t0 = fT0; t1 = t0 + s; }
      if (t1 > fT1) { t1 = fT1; t0 = t1 - s; }
      onViewChange(t0, t1);
    }

    const gid = 'br' + (theme === 'light' ? 'L' : 'D');
    return e('svg', {
      ref, width: '100%', viewBox: `0 0 ${w} ${h}`,
      style: { display: 'block', overflow: 'visible', cursor: 'pointer', touchAction: 'none' },
      onMouseDown: bgClick,
    }, [
      e('defs', { key: 'd' }, e('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [
        e('stop', { key: 0, offset: '0%', stopColor: safeColor, stopOpacity: 0.18 }),
        e('stop', { key: 1, offset: '100%', stopColor: safeColor, stopOpacity: 0 }),
      ])),
      e('rect', { key: 'bg', x: padL, y: padT, width: innerW, height: innerH, fill: 'var(--pn2)', rx: 4 }),
      // güvenli bant
      e('rect', { key: 'band', x: padL, y: Y(band[1]), width: innerW, height: Math.max(Y(band[0]) - Y(band[1]), 0), fill: 'var(--okS)' }),
      e('path', { key: 'area', d: line + ` L${TX(fT1).toFixed(1)} ${padT + innerH} L${padL} ${padT + innerH} Z`, fill: `url(#${gid})` }),
      inLine && e('path', { key: 'lineIn', d: inLine, fill: 'none', stroke: safeColor, strokeWidth: 1, strokeOpacity: 0.85 }),
      outLine && e('path', { key: 'lineOut', d: outLine, fill: 'none', stroke: overColor, strokeWidth: 1.2, strokeOpacity: 0.95 }),
      // pencere dışı karartma
      e('rect', { key: 'mL', x: padL, y: padT, width: Math.max(wx0 - padL, 0), height: innerH, fill: 'var(--pn)', fillOpacity: 0.62 }),
      e('rect', { key: 'mR', x: wx1, y: padT, width: Math.max(padL + innerW - wx1, 0), height: innerH, fill: 'var(--pn)', fillOpacity: 0.62 }),
      // pencere çerçevesi + gövde (sürükle)
      e('rect', {
        key: 'win', x: wx0, y: padT, width: Math.max(wx1 - wx0, 2), height: innerH,
        fill: color, fillOpacity: 0.06, stroke: color, strokeWidth: 1, strokeOpacity: 0.7,
        style: { cursor: 'grab' }, onMouseDown: ev => down('move', ev),
      }),
      // sol/sağ tutamaçlar
      ...['l', 'r'].map(side => {
        const hx = side === 'l' ? wx0 : wx1;
        return e('g', { key: 'h' + side, style: { cursor: 'ew-resize' }, onMouseDown: ev => down(side, ev) }, [
          e('rect', { key: 'hit', x: hx - 5, y: padT, width: 10, height: innerH, fill: 'transparent' }),
          e('rect', { key: 'bar', x: hx - 1.5, y: padT + 2, width: 3, height: innerH - 4, rx: 1.5, fill: color, fillOpacity: 0.9 }),
        ]);
      }),
    ]);
  }

  window.CRDecisionChart = CRDecisionChart;
  window.CRChartBrush = CRChartBrush;
})();
