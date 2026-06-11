/* ColdChain AI — Pipeline & API katmanı
   Yeni Kontrol Odası arayüzünü mevcut Express backend'ine bağlar.
   Mevcut motorları (DataParser, MKTEngine, DecisionEngine, Utils) AYNEN kullanır
   — eski js/pages/upload.js orkestrasyonunun React'e taşınmış hâlidir.

   Akış:  File[] → DataParser.parse (/api/extract) → MKTEngine.fullAnalysis
          → DecisionEngine.evaluate → scenario (UI şekli) + record (DB şekli)
*/
window.CCPipeline = (function () {

  // ---- küçük yardımcılar ----
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDT(ts) {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function fmtDur(min) {
    if (window.Utils && Utils.formatDuration) return Utils.formatDuration(min || 0);
    return Math.round(min || 0) + ' dk';
  }

  // Motor karar kodu → UI karar kodu/etiketi
  const LABELS = { accept: 'KABUL', reject: 'RED', revize: 'REVİZE', conditional: 'ŞARTLI' };

  // ---- Engine çıktısı → UI "scenario" şekli ----
  function toScenario(record, data, form, cfg) {
    const a = record;
    const mkt = a.mkt || {};
    const dec = a.decision || {};
    const lo = Number(cfg.lowerLimit) || 2, hi = Number(cfg.upperLimit) || 8;
    const engDec = dec.decision || 'accept';

    // Sıcaklık serisi — her nokta gerçek timestamp'i (ms) + sıcaklığı taşır.
    // Grafik tarafı kullanıcının seçtiği zaman ölçeğine (10dk/30dk/1sa/2sa/Gün)
    // göre bu seriden bin'ler oluşturur.
    const n = data.length;
    const temp = [];
    for (let i = 0; i < n; i++) {
      const p = data[i];
      const ts = new Date(p.timestamp).getTime();
      if (!isFinite(ts) || !isFinite(p.temperature)) continue;
      temp.push({ t: ts, v: p.temperature });
    }

    // Isı maruziyet dağılımı (time-in-range)
    let ideal = 0, warn = 0, crit = 0;
    data.forEach(p => {
      const v = p.temperature;
      if (v >= lo && v <= hi) ideal++;
      else if ((v >= 0 && v < lo) || (v > hi && v <= 15)) warn++;
      else crit++;
    });
    const tot = n || 1;
    const tir = { ideal: Math.round(ideal / tot * 100), warn: Math.round(warn / tot * 100), crit: Math.round(crit / tot * 100) };

    // sapmalar
    const exc = (a.excursions && a.excursions.excursions) || [];
    const excursions = exc.map(e => ({
      start: fmtDT(e.start), end: fmtDT(e.end), dur: fmtDur(e.duration),
      type: e.type || 'high', peak: e.peakTemp != null ? e.peakTemp : (e.startTemp || 0),
    }));

    // Veri kaybı pencereleri: mutlak başlangıç/bitiş timestamp'i (ms)
    const validation = a.validation || {};
    const rawGaps = validation.gaps || [];
    const gaps = rawGaps.map(g => ({
      t0: new Date(g.start).getTime(),
      t1: new Date(g.end).getTime(),
      minutes: g.minutes,
    })).filter(g => isFinite(g.t0) && isFinite(g.t1) && g.t1 > g.t0);

    return {
      key: 'real', decision: engDec, label: LABELS[engDec] || '—', conf: dec.confidence || 0,
      lo: lo, hi: hi,
      pharmacy: form.pharmacy || 'Belirtilmemiş', city: form.city || '',
      drug: form.drug || 'Belirtilmemiş', serial: form.serial || a.deviceSerial || '—',
      batch: form.batch || '—', barcode: form.barcode || '—', expiry: form.expiry || '—',
      qty: Number(form.qty) || 0, amount: Number(String(form.amount).replace(',', '.')) || 0,
      reason: form.reason || 'Belirtilmemiş',
      mkt: mkt.mkt || 0, min: mkt.min || 0, max: mkt.max || 0, mean: mkt.mean || 0,
      points: a.dataPoints || n, gap: (a.validation && a.validation.mostCommonGapMin) || 0,
      torUsed: Math.round((a.tor && a.tor.torMinutes) || 0), torLimit: (a.tor && a.tor.torLimit) || Number(cfg.torLimit) || 120,
      excCount: (a.excursions && a.excursions.excursionCount) || excursions.length,
      summary: dec.summary || '', reasons: dec.reasons || [],
      excursions, tir, gdp: 'TİTCK İyi Dağıtım Uygulamaları (GDP) Kılavuzu',
      temp: temp.length ? temp : [{ t: Date.now(), v: mkt.mean || 5 }],
      gaps,
    };
  }

  // ---- Ana çalıştırıcı: dosyalar → analiz ----
  // files: [{ id, file }]   form: {pharmacy,drug,serial,batch,barcode,qty,expiry,amount,reason,purchaseDate,returnDate,city}
  // cfg:   {lowerLimit, upperLimit, torLimit}
  // hooks: {onStep(step), onFile(id, pct, statusText)}
  async function run(files, form, cfg, hooks) {
    hooks = hooks || {};
    const onStep = hooks.onStep || function () {};
    const onFile = hooks.onFile || function () {};

    if (typeof DataParser === 'undefined' || typeof MKTEngine === 'undefined' || typeof DecisionEngine === 'undefined') {
      throw new Error('Analiz motorları yüklenemedi. Sunucu (npm start) çalışıyor mu?');
    }

    // 1) Her dosyayı çözümle
    const parsed = [];
    for (const item of files) {
      onFile(item.id, 6, 'işleniyor');
      let virtual = 6;
      const tick = setInterval(() => { virtual = Math.min(virtual + 4, 88); onFile(item.id, virtual, 'işleniyor'); }, 400);
      try {
        const res = await DataParser.parse(item.file, null, {
          resampling: false,
          onProgress: (p) => { virtual = Math.max(virtual, p); onFile(item.id, virtual, 'işleniyor'); },
          columnMapping: item.columnMapping,
        });
        clearInterval(tick);
        onFile(item.id, 100, (res.rowCount || (res.parsedData ? res.parsedData.length : 0)) + ' kayıt');
        parsed.push(res);
      } catch (err) {
        clearInterval(tick);
        onFile(item.id, 100, 'hata', true);
        throw new Error(`${item.file.name}: ${err.message}`);
      }
    }

    onStep({ ic: 'search', t: 'COLUMN_MAP', tx: 'Sütun tespiti — tarih & sıcaklık kolonları eşlendi', st: 'ok' });

    const meta = (parsed.find(p => p.metadata && Object.keys(p.metadata).length) || {}).metadata || {};
    onStep({
      ic: 'box', t: 'METADATA',
      tx: 'Meta veri — ' + (meta.deviceSerial ? ('cihaz ' + meta.deviceSerial) : 'cihaz seri bulunamadı') + (meta.pharmacyName ? (' · ' + meta.pharmacyName) : ''),
      st: 'ok',
    });

    // 2) Birleştir + kronolojik sırala
    let allData = [];
    parsed.forEach(p => { if (p.parsedData) allData = allData.concat(p.parsedData); });
    allData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    onStep({ ic: 'activity', t: 'PARSE', tx: `Ayrıştırma — ${allData.length.toLocaleString('tr-TR')} ölçüm noktası okundu`, st: 'ok' });

    // 3) Çoklu dosyada tekilleştir
    const before = allData.length;
    if (parsed.length > 1) {
      const seen = new Set();
      allData = allData.filter(d => { const k = new Date(d.timestamp).getTime() + '_' + d.temperature; if (seen.has(k)) return false; seen.add(k); return true; });
    }
    const dups = before - allData.length;
    onStep({ ic: 'alert', t: 'DEDUPE', tx: `Tekilleştirme — ${dups} yinelenen kayıt temizlendi`, st: dups > 0 ? 'warn' : 'ok' });

    if (!allData.length) throw new Error('Dosyalardan geçerli sıcaklık verisi çıkarılamadı. Belgeyi kontrol edip tekrar deneyin.');

    // 4) MKT + karar
    const cfg2 = { lowerLimit: Number(cfg.lowerLimit) || 2, upperLimit: Number(cfg.upperLimit) || 8, torLimit: Number(cfg.torLimit) || 120 };
    const rawValidation = parsed.length === 1 ? (parsed[0].metadata && parsed[0].metadata.validation) : null;
    const analysis = MKTEngine.fullAnalysis(allData, cfg2, rawValidation);
    onStep({ ic: 'check', t: 'VALIDATE', tx: 'Doğrulama — zaman serisi bütünlüğü onaylandı', st: 'ok' });

    analysis.userRange = { purchase: form.purchaseDate, return: form.returnDate };
    if (parsed[0] && parsed[0].metadata) analysis.metadata = parsed[0].metadata;

    // 5) Cihaz seri no mükerrer kontrolü (backend)
    const deviceSerial = (analysis.metadata && analysis.metadata.deviceSerial) || form.serial;
    let primaryFileHash = null;
    if (deviceSerial && files[0] && files[0].file && window.Utils && Utils.sha256OfBytes) {
      try {
        const buf = await files[0].file.arrayBuffer();
        primaryFileHash = await Utils.sha256OfBytes(buf);
        const r = await fetch(`/api/device-serial/check?serial=${encodeURIComponent(deviceSerial)}&fileHash=${primaryFileHash}`);
        const j = await r.json();
        if (j.success) {
          analysis.metadata = analysis.metadata || {};
          analysis.metadata.dedupResult = { isDuplicate: j.isDuplicate, previousOccurrences: j.previousOccurrences || [] };
        }
      } catch (e) { /* offline ise karar akışını bloklamadan devam */ }
    }

    const decision = DecisionEngine.evaluate(analysis);
    onStep({ ic: 'thermo', t: 'MKT', tx: `MKT ${analysis.mkt.mkt}°C · TOR ${Math.round(analysis.tor.torMinutes)} dk hesaplandı`, st: 'ok' });

    if (deviceSerial && primaryFileHash) {
      fetch('/api/device-serial', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: deviceSerial, pharmacy: form.pharmacy || '', fileHash: primaryFileHash, analysisId: null }),
      }).catch(() => {});
    }

    // 6) DB'ye gidecek kayıt (eski AppState.currentAnalysis ile aynı şekil)
    const record = Object.assign({}, analysis, {
      decision,
      drugName: form.drug || 'Belirtilmemiş',
      batchNumber: form.batch || 'Belirtilmemiş',
      pharmacy: form.pharmacy || 'Belirtilmemiş',
      deviceSerial: deviceSerial || '',
      purchaseDate: form.purchaseDate, returnDate: form.returnDate,
      returnReason: form.reason || 'Belirtilmemiş',
      barcode: form.barcode || 'Belirtilmemiş',
      quantity: form.qty || '0',
      expirationDate: form.expiry || 'Belirtilmemiş',
      totalAmount: form.amount || '0',
      files: files.map(f => f.file.name), date: new Date(),
    });

    const scenario = toScenario(record, allData, form, cfg2);

    // audit: analiz tamamlandı
    postAudit({ type: 'analysis', action: 'Analiz tamamlandı', details: `${record.drugName} · MKT ${analysis.mkt.mkt}°C · ${decision.decision}`, tags: ['analiz', decision.decision] });

    return { record, scenario, rowCount: allData.length, decision, mkt: analysis.mkt.mkt, tor: Math.round(analysis.tor.torMinutes) };
  }

  // ---- API yardımcıları ----
  function postAudit(entry) {
    return fetch('/api/audit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).then(r => r.json()).catch(() => null);
  }

  async function save(record) {
    const res = await fetch('/api/save-analysis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    const j = await res.json();
    if (j && j.success) {
      postAudit({ type: 'save', action: 'Kayıt sisteme yazıldı', details: `#${j.id} · ${record.drugName}`, tags: ['kayıt'] });
    }
    return j;
  }

  function health() { return fetch('/api/health').then(r => r.json()); }
  function recent() { return fetch('/api/recent-analyses').then(r => r.json()); }
  function stats() { return fetch('/api/stats').then(r => r.json()); }

  return { run, toScenario, save, health, recent, stats, postAudit };
})();
