/* ColdChain AI — paylaşılan demo veri seti (gerçekçi his için) */
window.CCData = (function () {
  // 72 saatlik depo sıcaklık serisi (°C). Hedef bant 2–8°C.
  // İki kısa ekskürsiyon (excursion) içeriyor ki "canlı izleme" gerçek hissetsin.
  const temp = [];
  let base = 4.6;
  for (let i = 0; i < 96; i++) {
    const t = i / 96;
    let v = base + Math.sin(i / 7) * 0.7 + Math.sin(i / 2.3) * 0.25 + (Math.random() - 0.5) * 0.35;
    if (i >= 40 && i <= 46) v += (6 - Math.abs(43 - i)) * 0.9; // 1. ekskürsiyon
    if (i >= 74 && i <= 79) v += (5 - Math.abs(76.5 - i)) * 0.8; // 2. ekskürsiyon
    temp.push({ h: -72 + (i / 96) * 72, v: Math.round(v * 100) / 100 });
  }

  const analyses = [
    { id: 1, ts: '2026-06-06T09:14:00', pharmacy: 'Hayat Eczanesi', city: 'İstanbul / Kadıköy', drug: 'Lantus SoloStar 100 IU/ml', serial: 'TZ-4471-A', mkt: 5.21, tor: 38, decision: 'accept', reasons: [] },
    { id: 2, ts: '2026-06-06T08:52:00', pharmacy: 'Şifa Eczanesi', city: 'Ankara / Çankaya', drug: 'Humira 40 mg', serial: 'LG-8820-C', mkt: 9.84, tor: 412, decision: 'reject', reasons: ['MKT 8°C üst sınırını aştı (9.84°C)', 'Toplam 412 dk buzdolabı dışı süre — TOR limiti aşıldı', 'GDP Ek-3 madde 4.2 ihlali'] },
    { id: 3, ts: '2026-06-06T08:31:00', pharmacy: 'Merkez Eczanesi', city: 'İzmir / Konak', drug: 'Comirnaty COVID-19 Aşısı', serial: 'PF-1029-X', mkt: 6.73, tor: 96, decision: 'conditional', reasons: ['Kısa süreli 8.4°C sapma gözlendi', 'Üretici stabilite verisi ile teyit önerilir'] },
    { id: 4, ts: '2026-06-06T07:58:00', pharmacy: 'Anadolu Eczanesi', city: 'Bursa / Nilüfer', drug: 'NovoRapid FlexPen', serial: 'NN-3344-B', mkt: 4.92, tor: 21, decision: 'accept', reasons: [] },
    { id: 5, ts: '2026-06-05T17:42:00', pharmacy: 'Güven Eczanesi', city: 'Antalya / Muratpaşa', drug: 'Enbrel 50 mg', serial: 'WY-6610-D', mkt: 7.88, tor: 168, decision: 'revize', reasons: ['MKT sınıra yakın (7.88°C)', 'Cihaz kalibrasyon kaydı eksik — revize talep edildi'] },
    { id: 6, ts: '2026-06-05T16:20:00', pharmacy: 'Deva Eczanesi', city: 'İstanbul / Şişli', drug: 'Clexane 6000 IU', serial: 'SA-2201-F', mkt: 5.07, tor: 12, decision: 'accept', reasons: [] },
    { id: 7, ts: '2026-06-05T15:05:00', pharmacy: 'Yeni Umut Eczanesi', city: 'Konya / Selçuklu', drug: 'Eylea 40 mg/ml', serial: 'BY-7788-G', mkt: 10.42, tor: 503, decision: 'reject', reasons: ['MKT kritik seviyede (10.42°C)', 'Soğuk zincir kırılması doğrulandı', 'İade reddi — imha protokolü önerilir'] },
    { id: 8, ts: '2026-06-05T14:11:00', pharmacy: 'Sağlık Eczanesi', city: 'Adana / Seyhan', drug: 'Lucentis 10 mg/ml', serial: 'NV-5520-H', mkt: 6.18, tor: 74, decision: 'conditional', reasons: ['Tek sapma noktası 8.1°C', 'MKT bant içinde — şartlı kabul'] },
  ];

  const stats = {
    total: 1247,
    accept: 854, conditional: 239, reject: 154,
    acceptRate: 68.5, conditionalRate: 19.2, rejectRate: 12.3,
    avgMkt: 5.4,
    pending: 47,
    devicesOnline: 38, devicesTotal: 42,
    todayCount: 23,
  };

  return { temp, analyses, stats };
})();
