/* ColdChain AI — paylaşılan ikonlar, yardımcılar, SVG grafik */
(function () {
  const e = React.createElement;

  // ---- İkonlar (stroke=currentColor, boyut prop'u) ----
  const I = (path, vb = '0 0 24 24') => ({ size = 20, sw = 1.75, style, fill = 'none' }) =>
    e('svg', { width: size, height: size, viewBox: vb, fill, stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', style }, path.map((d, i) => e('path', { key: i, d })));

  const Icons = {
    grid: I(['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z']),
    upload: I(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12']),
    activity: I(['M22 12h-4l-3 9L9 3l-3 9H2']),
    report: I(['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8']),
    shield: I(['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z']),
    bell: I(['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0']),
    search: I(['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3']),
    thermo: I(['M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z']),
    check: I(['M20 6L9 17l-5-5']),
    x: I(['M18 6L6 18', 'M6 6l12 12']),
    alert: I(['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01']),
    clock: I(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2']),
    plus: I(['M12 5v14', 'M5 12h14']),
    arrowUp: I(['M12 19V5', 'M5 12l7-7 7 7']),
    arrowDown: I(['M12 5v14', 'M19 12l-7 7-7-7']),
    box: I(['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12']),
    snow: I(['M12 2v20', 'M4.93 4.93l14.14 14.14', 'M19.07 4.93L4.93 19.07', 'M2 12h20', 'M7 5l5 2 5-2', 'M7 19l5-2 5 2', 'M5 7l2 5-2 5', 'M19 7l-2 5 2 5']),
    sun: I(['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4']),
    moon: I(['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']),
    chevR: I(['M9 18l6-6-6-6']),
    pill: I(['M10.5 20.5L3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z', 'M8.5 8.5l7 7']),
    menu: I(['M3 6h18', 'M3 12h18', 'M3 18h18']),
    panelLeft: I(['M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M9 4v16']),
    chevL: I(['M15 18l-6-6 6-6']),
    cog: I(['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']),
    user: I(['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z']),
    logout: I(['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9']),
    mail: I(['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 6l-10 7L2 6']),
    lock: I(['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4']),
    dollar: I(['M12 1v22', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6']),
    save: I(['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8']),
    eye: I(['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']),
    cpu: I(['M4 4h16v16H4z', 'M9 9h6v6H9z', 'M9 1v3', 'M15 1v3', 'M9 20v3', 'M15 20v3', 'M20 9h3', 'M20 14h3', 'M1 9h3', 'M1 14h3']),
    refresh: I(['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M1 14l4.64 4.36A9 9 0 0 0 20.49 15']),
  };

  // ---- Karar etiketleri ----
  const decisionMeta = {
    accept: { tr: 'Kabul', tone: 'ok' },
    conditional: { tr: 'Şartlı', tone: 'warn' },
    revize: { tr: 'Revize', tone: 'rev' },
    reject: { tr: 'Red', tone: 'bad' },
  };

  // ---- Tarih ----
  function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 60) return Math.round(diff) + ' dk önce';
    if (diff < 1440) return Math.round(diff / 60) + ' sa önce';
    return Math.round(diff / 1440) + ' gün önce';
  }

  // ---- SVG sıcaklık alan grafiği ----
  // props: data [{h,v}], w, h, color, band [min,max], gridColor, bandColor, axisColor, fillFrom, fillTo
  function TempChart({ data, w = 900, h = 230, color, band = [2, 8], gridColor, bandColor, axisColor, fill = true, dash = false, padL = 34, padB = 22, padT = 14 }) {
    // min/max — büyük dizilerde spread call-stack'i patlatabildiği için döngüyle
    let vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i].v;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    if (!isFinite(vMin)) { vMin = band[0]; vMax = band[1]; }
    const lo = Math.min(vMin, band[0]) - 0.6;
    const hi = Math.max(vMax, band[1]) + 0.6;
    const innerW = w - padL - 8, innerH = h - padB - padT;
    const x = i => padL + (i / (data.length - 1)) * innerW;
    const y = v => padT + (1 - (v - lo) / (hi - lo)) * innerH;
    const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(d.v).toFixed(1)}`).join(' ');
    const area = line + ` L${x(data.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
    const ticks = [];
    const step = (hi - lo) / 4;
    for (let i = 0; i <= 4; i++) { const v = lo + step * i; ticks.push(v); }
    const gid = 'g' + Math.random().toString(36).slice(2, 7);

    return e('svg', { width: '100%', viewBox: `0 0 ${w} ${h}`, style: { display: 'block', overflow: 'visible' } }, [
      e('defs', { key: 'd' }, e('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [
        e('stop', { key: 0, offset: '0%', stopColor: color, stopOpacity: 0.22 }),
        e('stop', { key: 1, offset: '100%', stopColor: color, stopOpacity: 0 }),
      ])),
      // güvenli bant (2-8°C)
      e('rect', { key: 'band', x: padL, y: y(band[1]), width: innerW, height: y(band[0]) - y(band[1]), fill: bandColor, rx: 2 }),
      e('line', { key: 'bt', x1: padL, x2: padL + innerW, y1: y(band[1]), y2: y(band[1]), stroke: color, strokeOpacity: 0.35, strokeWidth: 1, strokeDasharray: '4 4' }),
      e('line', { key: 'bb', x1: padL, x2: padL + innerW, y1: y(band[0]), y2: y(band[0]), stroke: color, strokeOpacity: 0.35, strokeWidth: 1, strokeDasharray: '4 4' }),
      // y ekseni etiketleri + grid
      ...ticks.map((v, i) => e('g', { key: 't' + i }, [
        e('line', { key: 'l', x1: padL, x2: padL + innerW, y1: y(v), y2: y(v), stroke: gridColor, strokeWidth: 1 }),
        e('text', { key: 'x', x: padL - 8, y: y(v) + 3, textAnchor: 'end', fontSize: 10, fill: axisColor, fontFamily: 'inherit' }, v.toFixed(0) + '°'),
      ])),
      fill && e('path', { key: 'area', d: area, fill: `url(#${gid})` }),
      e('path', { key: 'line', d: line, fill: 'none', stroke: color, strokeWidth: 2, strokeDasharray: dash ? '0' : '0', strokeLinejoin: 'round' }),
      // son nokta
      e('circle', { key: 'dot', cx: x(data.length - 1), cy: y(data[data.length - 1].v), r: 3.5, fill: color }),
      e('circle', { key: 'dot2', cx: x(data.length - 1), cy: y(data[data.length - 1].v), r: 6.5, fill: color, fillOpacity: 0.18 }),
    ]);
  }

  // ---- Radyal gauge (TOR / kapasite) ----
  function Gauge({ value, max, label, sub, color, trackColor, textColor, size = 132 }) {
    const r = size / 2 - 12, c = 2 * Math.PI * r;
    const pct = Math.min(value / max, 1);
    const off = c * (1 - pct * 0.75); // 270° yay
    return e('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` }, [
      e('circle', { key: 'bg', cx: size / 2, cy: size / 2, r, fill: 'none', stroke: trackColor, strokeWidth: 9, strokeDasharray: c, strokeDashoffset: c * 0.25, strokeLinecap: 'round', transform: `rotate(135 ${size / 2} ${size / 2})` }),
      e('circle', { key: 'fg', cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, strokeWidth: 9, strokeDasharray: c, strokeDashoffset: off, strokeLinecap: 'round', transform: `rotate(135 ${size / 2} ${size / 2})`, style: { transition: 'stroke-dashoffset .6s' } }),
      e('text', { key: 'v', x: size / 2, y: size / 2 - 2, textAnchor: 'middle', fontSize: 26, fontWeight: 700, fill: textColor, fontFamily: 'inherit', style: { fontVariantNumeric: 'tabular-nums' } }, label),
      e('text', { key: 's', x: size / 2, y: size / 2 + 18, textAnchor: 'middle', fontSize: 11, fill: textColor, fillOpacity: 0.55, fontFamily: 'inherit' }, sub),
    ]);
  }

  Object.assign(window, { CCIcons: Icons, CCDecision: decisionMeta, CCFmt: { fmtTime, timeAgo }, CCTempChart: TempChart, CCGauge: Gauge });
})();
