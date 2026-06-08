/* Analiz & Rapor için paylaşılan senaryo verisi (KABUL / ŞARTLI / RED) */
window.CCScenarios = (function () {
  // Demo verisi: şu andan geriye 72 saatlik mutlak timestamp aralığı.
  const DEMO_NOW = Date.now();
  const DEMO_SPAN_MS = 72 * 3600 * 1000;
  const DEMO_START = DEMO_NOW - DEMO_SPAN_MS;

  function gen(profile) {
    const arr = [];
    const base = profile === 'reject' ? 6 : profile === 'conditional' ? 5.4 : 4.8;
    for (let i = 0; i < 96; i++) {
      // "conditional" demo'sunda 50–55. index arasında veri kaybı simülasyonu (noktaları üretme)
      if (profile === 'conditional' && i >= 50 && i <= 55) continue;
      let v = base + Math.sin(i / 7) * 0.5 + Math.sin(i / 2.7) * 0.2 + (Math.random() - 0.5) * 0.3;
      if (profile === 'accept') { if (i >= 42 && i <= 46) v += (5 - Math.abs(44 - i)) * 0.74; }
      if (profile === 'conditional') {
        if (i >= 30 && i <= 35) v += (5 - Math.abs(32.5 - i)) * 0.92;
        if (i >= 70 && i <= 74) v += (4 - Math.abs(72 - i)) * 1.16;
      }
      if (profile === 'reject') {
        if (i >= 34 && i <= 58) { const tt = (i - 34) / 24; v = 7 + Math.sin(tt * Math.PI) * 11 + (Math.random() - 0.5) * 0.8; }
      }
      arr.push({ t: DEMO_START + (i / 96) * DEMO_SPAN_MS, v: Math.round(v * 100) / 100 });
    }
    return arr;
  }
  // Demo veri kaybı pencereleri (mutlak ms)
  const DEMO_GAPS = {
    accept: [],
    conditional: [{
      t0: DEMO_START + (50 / 96) * DEMO_SPAN_MS,
      t1: DEMO_START + (55 / 96) * DEMO_SPAN_MS,
      minutes: Math.round(((55 - 50) / 96) * 72 * 60),
    }],
    reject: [],
  };

  const accept = {
    key: 'accept', decision: 'accept', label: 'KABUL', conf: 97,
    pharmacy: 'Hayat Eczanesi', city: 'İstanbul / Kadıköy', drug: 'Lantus SoloStar 100 IU/ml',
    serial: 'TZ-4471-A', batch: 'BN23847', barcode: '8681308004471', expiry: '2027-04', qty: 10, amount: 4250.5,
    reason: 'Soğuk Zincir İhlali Şüphesi',
    mkt: 5.21, min: 3.42, max: 8.41, mean: 5.08, points: 1440, gap: 5, torUsed: 38, torLimit: 120, excCount: 1,
    summary: 'MKT 2–8°C bandında; tek kısa sapma tolerans sınırları içinde kaldı. Ürün iade için uygundur.',
    reasons: ['MKT 5,21°C — 8°C üst sınırının güvenle altında', 'Tek kısa sapma (8,4°C · 22 dk) tolerans dahilinde', 'Veri bütünlüğü ve 5 dk kayıt aralığı uygun'],
    excursions: [{ start: '05.06 14:20', end: '05.06 14:42', dur: '22 dk', type: 'high', peak: 8.41 }],
    tir: { ideal: 96, warn: 4, crit: 0 }, gdp: 'TİTCK GDP Kılavuzu · Ek-3 Madde 4.1', temp: gen('accept'),
    gaps: DEMO_GAPS.accept,
  };
  const conditional = {
    key: 'conditional', decision: 'conditional', label: 'ŞARTLI', conf: 74,
    pharmacy: 'Merkez Eczanesi', city: 'İzmir / Konak', drug: 'Comirnaty COVID-19 Aşısı',
    serial: 'PF-1029-X', batch: 'FF8821', barcode: '8699999001029', expiry: '2026-09', qty: 6, amount: 9120.0,
    reason: 'Soğuk Zincir İhlali Şüphesi',
    mkt: 6.73, min: 3.11, max: 9.82, mean: 6.41, points: 1280, gap: 10, torUsed: 96, torLimit: 120, excCount: 2,
    summary: 'MKT bant içinde ancak iki kısa 8°C aşımı mevcut. Üretici stabilite verisiyle teyit önerilir.',
    reasons: ['MKT 6,73°C — sınıra yakın ama bant içinde', 'İki kısa sapma (maks 9,8°C) gözlendi', 'Üretici stabilite (CTT) verisi ile teyit önerilir'],
    excursions: [
      { start: '04.06 22:05', end: '04.06 22:51', dur: '46 dk', type: 'high', peak: 9.42 },
      { start: '06.06 04:10', end: '06.06 04:38', dur: '28 dk', type: 'high', peak: 9.82 },
    ],
    tir: { ideal: 82, warn: 18, crit: 0 }, gdp: 'TİTCK GDP Kılavuzu · Ek-3 Madde 4.2', temp: gen('conditional'),
    gaps: DEMO_GAPS.conditional,
  };
  const reject = {
    key: 'reject', decision: 'reject', label: 'RED', conf: 99,
    pharmacy: 'Yeni Umut Eczanesi', city: 'Konya / Selçuklu', drug: 'Eylea 40 mg/ml',
    serial: 'BY-7788-G', batch: 'EY5503', barcode: '8699546007788', expiry: '2026-12', qty: 4, amount: 31600.0,
    reason: 'Soğuk Zincir İhlali Şüphesi',
    mkt: 9.84, min: 4.05, max: 18.62, mean: 9.21, points: 1180, gap: 15, torUsed: 503, torLimit: 120, excCount: 4,
    summary: 'MKT 8°C üst sınırını aştı ve 15°C üzeri kritik sapma doğrulandı. Soğuk zincir kırılması — iade reddi.',
    reasons: ['MKT 9,84°C — 8°C üst sınırı aşıldı', 'Kritik sapma: 18,6°C (>15°C anlık red sebebi)', 'Toplam TOR 503 dk — 120 dk limiti aşıldı', 'GDP Ek-3 Madde 4.2 ihlali'],
    excursions: [
      { start: '05.06 09:30', end: '05.06 15:48', dur: '6 sa 18 dk', type: 'high', peak: 18.62 },
      { start: '05.06 18:02', end: '05.06 19:20', dur: '1 sa 18 dk', type: 'high', peak: 13.4 },
      { start: '06.06 02:15', end: '06.06 02:51', dur: '36 dk', type: 'high', peak: 11.1 },
      { start: '06.06 05:40', end: '06.06 06:04', dur: '24 dk', type: 'high', peak: 9.7 },
    ],
    tir: { ideal: 58, warn: 17, crit: 25 }, gdp: 'TİTCK GDP Kılavuzu · Ek-3 Madde 4.2', temp: gen('reject'),
    gaps: DEMO_GAPS.reject,
  };

  return { accept, conditional, reject, order: ['accept', 'conditional', 'reject'] };
})();
