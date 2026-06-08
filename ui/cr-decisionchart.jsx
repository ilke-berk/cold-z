/* İnteraktif Sıcaklık & Karar Grafiği (Kontrol Odası dili) */
(function () {
  const { useState, useRef } = React;
  const e = React.createElement;

  const pad2 = n => String(n).padStart(2, '0');
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

  function CRDecisionChart({ data, gaps = [], band = [2, 8], mkt, color, theme = 'dark',
    w = 1040, h = 300, padL = 40, padR = 18, padT = 18, padB = 30 }) {
    const [hi, setHi] = useState(null);
    const svgRef = useRef(null);

    // min/max — büyük dizilerde spread call-stack'i patlatabildiği için döngüyle
    const n = data.length;
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
    // X: ZAMAN bazlı. data[i].t (mutlak ms) değerine göre konumlandırılır.
    const tMin = n > 0 ? data[0].t : 0;
    const tMax = n > 0 ? data[n - 1].t : 1;
    const tSpan = (tMax - tMin) || 1;
    const X = i => padL + ((data[i].t - tMin) / tSpan) * innerW;
    const Y = v => padT + (1 - (v - lo) / (top - lo)) * innerH;

    const linePath = data.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d.v).toFixed(1)}`).join(' ');
    const areaPath = linePath + ` L${X(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L${padL} ${(padT + innerH).toFixed(1)} Z`;

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
      xticks.push({ x: padL + f * innerW, t: tMin + f * tSpan });
    }
    // Görünen pencere ≤ 24 saat ise saat:dakika, değilse gün.ay etiketi
    const DAY_MS = 86400000;
    const fmtX = tSpan > 0 && tSpan <= DAY_MS ? timeLabel : dateLabel;

    function tToX(tv) {
      if (n < 2) return padL;
      if (tv <= tMin) return padL;
      if (tv >= tMax) return padL + innerW;
      return padL + ((tv - tMin) / tSpan) * innerW;
    }
    // Görünür pencereye kırpılmış veri kaybı bölgeleri (≥3px görünen)
    const gapBands = (gaps || []).map(g => {
      const x0 = tToX(g.t0), x1 = tToX(g.t1);
      return { x0, x1, w: x1 - x0, minutes: g.minutes };
    }).filter(g => g.w >= 3);

    const gid = 'dc' + (theme === 'light' ? 'L' : 'D');
    const bandColor = 'var(--okS)';
    const overColor = 'var(--bad)';

    function onMove(ev) {
      const r = svgRef.current.getBoundingClientRect();
      const vbx = ((ev.clientX - r.left) / r.width) * w;
      const frac = Math.max(0, Math.min(1, (vbx - padL) / innerW));
      const tv = tMin + frac * tSpan;
      // data[].t artan sıralı → en yakın index için ikili arama
      let lo2 = 0, hi2 = n - 1;
      while (lo2 < hi2) {
        const mid = (lo2 + hi2) >> 1;
        if (data[mid].t < tv) lo2 = mid + 1; else hi2 = mid;
      }
      let i = lo2;
      if (lo2 > 0 && Math.abs(data[lo2 - 1].t - tv) < Math.abs(data[lo2].t - tv)) i = lo2 - 1;
      i = Math.max(0, Math.min(n - 1, i));
      setHi(i);
    }

    const hd = hi != null ? data[hi] : null;
    const hStatus = hd ? (hd.v > band[1] ? ['İHLAL', overColor] : hd.v < band[0] ? ['DÜŞÜK', 'var(--sig)'] : ['BANT İÇİ', 'var(--ok)']) : null;

    return e('svg', {
      ref: svgRef, width: '100%', viewBox: `0 0 ${w} ${h}`,
      style: { display: 'block', overflow: 'visible', cursor: 'crosshair' },
      onMouseMove: onMove, onMouseLeave: () => setHi(null),
    }, [
      e('defs', { key: 'defs' }, [
        e('linearGradient', { key: 'g', id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [
          e('stop', { key: 0, offset: '0%', stopColor: color, stopOpacity: 0.24 }),
          e('stop', { key: 1, offset: '100%', stopColor: color, stopOpacity: 0 }),
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
      e('text', { key: 'btl', x: padL + innerW - 2, y: Y(band[1]) - 5, textAnchor: 'end', fontSize: 9, fill: 'var(--ok)', fontFamily: "'JetBrains Mono', monospace", opacity: 0.8 }, '8° ÜST'),

      // dolgu + çizgi
      e('path', { key: 'area', d: areaPath, fill: `url(#${gid})` }),
      e('path', { key: 'line', d: linePath, fill: 'none', stroke: color, strokeWidth: 2, strokeLinejoin: 'round' }),

      // veri kaybı bölgeleri (çizgiyi yanıltıcı düzlüğüyle birlikte örter)
      ...gapBands.map((g, gi) => {
        const gw = Math.max(g.w, 3);
        const cx = g.x0 + gw / 2;
        const showLabel = gw >= 46;
        return e('g', { key: 'gap' + gi }, [
          // taban örtü (panel rengi) — alttaki çizgi/dolgu okunmasın
          e('rect', { key: 'b', x: g.x0, y: padT, width: gw, height: innerH, fill: 'var(--pn)', fillOpacity: 0.78 }),
          // çapraz tarama deseni
          e('rect', { key: 'h', x: g.x0, y: padT, width: gw, height: innerH, fill: `url(#${gid}gap)` }),
          // kenar çizgileri
          e('line', { key: 'l0', x1: g.x0, x2: g.x0, y1: padT, y2: padT + innerH, stroke: 'var(--t2)', strokeWidth: 1, strokeDasharray: '3 2', strokeOpacity: 0.75 }),
          e('line', { key: 'l1', x1: g.x0 + gw, x2: g.x0 + gw, y1: padT, y2: padT + innerH, stroke: 'var(--t2)', strokeWidth: 1, strokeDasharray: '3 2', strokeOpacity: 0.75 }),
          // etiket — sadece yeterince geniş ise
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
          // bandın üstündeki kısmın doldurulmuş hali
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

      // MKT referans çizgisi
      mkt != null && e('g', { key: 'mkt' }, [
        e('line', { key: 'l', x1: padL, x2: padL + innerW, y1: Y(mkt), y2: Y(mkt), stroke: mkt > band[1] ? overColor : 'var(--sig)', strokeWidth: 1.4, strokeDasharray: '2 3', strokeOpacity: 0.9 }),
        e('rect', { key: 'r', x: padL + 2, y: Y(mkt) - 16, width: 78, height: 14, rx: 3, fill: mkt > band[1] ? overColor : 'var(--sig)' }),
        e('text', { key: 't', x: padL + 6, y: Y(mkt) - 5, fontSize: 9.5, fontWeight: 700, fill: theme === 'light' ? '#fff' : '#04121a', fontFamily: "'JetBrains Mono', monospace" }, 'MKT ' + mkt.toFixed(2) + '°'),
      ]),

      // hover göstergesi
      hd && e('g', { key: 'hov', style: { pointerEvents: 'none' } }, [
        e('line', { key: 'hl', x1: X(hi), x2: X(hi), y1: padT, y2: padT + innerH, stroke: 'var(--t2)', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.7 }),
        e('circle', { key: 'hc', cx: X(hi), cy: Y(hd.v), r: 4.5, fill: hStatus[1], stroke: 'var(--pn)', strokeWidth: 2 }),
        (() => {
          const TW = 142;
          const bx = Math.max(padL, Math.min(X(hi) - TW / 2, padL + innerW - TW));
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

  window.CRDecisionChart = CRDecisionChart;
})();
