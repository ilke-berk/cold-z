/* Dışa aktarım: temiz A4 YAZDIR/PDF belgesi (portal) + Excel (.xlsx) üretimi */
(function () {
  const { CCIcons: Ic, CCTempChart } = window;

  /* ---------- ortak ---------- */
  const decMeta = {
    accept:      { hex: '#1c9961', soft: '#e9f6ee', t1: 'KABUL',  sub: 'İADE ONAYLANDI',     flag: 'UYGUN' },
    conditional: { hex: '#b07d18', soft: '#f7efd9', t1: 'ŞARTLI', sub: 'KOŞULLU KABUL',       flag: 'İNCELE' },
    revize:      { hex: '#b07d18', soft: '#f7efd9', t1: 'REVİZE', sub: 'REVİZE İSTENDİ',      flag: 'REVİZE' },
    reject:      { hex: '#cb3c48', soft: '#fae7e8', t1: 'RED',    sub: 'İADE REDDEDİLDİ',     flag: 'İHLAL' },
  };
  const decFallback = decMeta.conditional;
  const fmtTRY = n => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
  const getDocDate = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  // Belge no: seri yoksa parti, o da yoksa kayıt ID'si (eski çıktıda "CC-—-2606" oluyordu)
  const isBlank = v => v == null || String(v).trim() === '' || String(v).trim() === '—';
  const docId = S => 'CC-' + (!isBlank(S.serial) ? S.serial : !isBlank(S.batch) ? S.batch : (S.savedId || S.id || 'KAYIT')) + '-2606';

  /* dakika → "18 g 22 sa 9 dk" */
  function fmtLong(min) {
    min = Math.round(Number(min) || 0);
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), mm = min % 60;
    const out = [];
    if (d) out.push(d + ' g');
    if (h) out.push(h + ' sa');
    if (mm || !out.length) out.push(mm + ' dk');
    return out.join(' ');
  }

  /* ---------- gerekçe gruplama ----------
     Motor aynı kalıptaki "… 24h MKT (x°C) limit dışı …" satırını her sapma için ayrı üretir
     (Demircan çıktısında 18 satır). Yazdırmada en fazla `max` satır gösterilir; MKT satırları
     tek satırda gruplanır, tam liste EK-2'ye gider. */
  const stripIcon = s => String(s == null ? '' : s).replace(/^[\s\u{1F300}-\u{1FAFF}☀-➿⭐❌⚠️]+/u, '').trim();
  const softOf = hex => hex === '#cb3c48' ? '#fae7e8' : hex === '#b07d18' ? '#f7efd9' : '#f1f5f9';
  // Not: JS'de /i bayrağı İ/ı harflerini eşlemez; Türkçe kelimeler nokta (.) ile yazıldı.
  function tagOf(text) {
    if (/^kr.t.k/i.test(text)) return ['KRİTİK', '#cb3c48'];
    if (/^red sebeb|^red\b/i.test(text)) return ['RED', '#cb3c48'];
    if (/anti-fraud/i.test(text)) return ['ANTI-FRAUD', '#cb3c48'];
    if (/24h MKT .*limit d.ş./i.test(text)) return ['MKT', '#cb3c48'];
    if (/24h MKT .*telafi edildi/i.test(text)) return ['MKT', '#b07d18'];
    if (/^rev.ze/i.test(text)) return ['REVİZE', '#b07d18'];
    if (/ver. kayb|atlanan ver/i.test(text)) return ['VERİ', '#b07d18'];
    if (/aş.ld.|limit d.ş.|ihlal/i.test(text)) return ['İHLAL', '#cb3c48'];
    if (/korunmuştur|sorun teşkil etmedi/i.test(text)) return ['UYGUN', '#1c9961'];
    return ['BİLGİ', '#64748b'];
  }
  function groupReasons(reasons, max) {
    max = max || 3;
    const items = (reasons || []).map(r => { const text = stripIcon(r); const [tag, color] = tagOf(text); return { tag, color, text }; });
    const isBad = i => i.tag === 'MKT' && i.color === '#cb3c48';
    const isOk = i => i.tag === 'MKT' && i.color !== '#cb3c48';
    const group = (list, label) => {
      if (list.length < 2) return list;
      const vals = list.map(i => { const mm = i.text.match(/24h MKT \(([-\d.,]+)\s*°C\)/); return mm ? parseFloat(mm[1].replace(',', '.')) : NaN; }).filter(isFinite).sort((a, b) => a - b);
      const rng = vals.length ? ` (24h MKT ${vals[0].toFixed(2)} – ${vals[vals.length - 1].toFixed(2)} °C)` : '';
      return [{ tag: list.length + ' ×', color: list[0].color, text: label + rng + '. Tam liste EK-2\'de.', grouped: list.length }];
    };
    const prio = t => t === 'KRİTİK' ? 0 : t === 'RED' ? 1 : t === 'ANTI-FRAUD' ? 2 : t === 'REVİZE' ? 4 : t === 'VERİ' ? 5 : 6;
    const rest = items.filter(i => i.tag !== 'MKT');
    const merged = [
      ...rest.filter(i => prio(i.tag) < 3),
      ...group(items.filter(isBad), 'Sapma sonrası 24 saatlik MKT limit dışı, zincir toparlanamadı'),
      ...rest.filter(i => prio(i.tag) >= 3),
      ...group(items.filter(isOk), 'Sapma 24 saatlik MKT ile telafi edildi'),
    ];
    const top = merged.slice(0, max);
    const grouped = merged.some(i => i.grouped);
    return { all: items, top, appendix: grouped || items.length > top.length };
  }

  /* EK-1 özet kutuları için sapma istatistiği */
  function parseDurMin(x) {
    if (x.durMin != null) return Number(x.durMin) || 0;
    const s = String(x.dur || ''); let m = 0;
    const g = s.match(/(\d+)\s*g\b/), h = s.match(/(\d+)\s*sa/), d = s.match(/(\d+)\s*dk/);
    if (g) m += +g[1] * 1440; if (h) m += +h[1] * 60; if (d) m += +d[1];
    return m;
  }
  function excSummary(ex) {
    let low = 0, high = 0, total = 0, longest = null, li = -1;
    (ex || []).forEach((x, i) => {
      const mn = parseDurMin(x); total += mn;
      if (x.type === 'high') high++; else low++;
      if (!longest || mn > longest.mn) { longest = { mn, x }; li = i; }
    });
    return { count: (ex || []).length, low, high, total, longest, li };
  }

  const statsRows = S => ([
    ['Ortalama Kinetik Sıcaklık (MKT)', S.mkt.toFixed(2) + ' °C', '2,00 – 8,00 °C', S.mkt >= 2 && S.mkt <= 8],
    ['Minimum Sıcaklık',                S.min.toFixed(2) + ' °C', '≥ 2,00 °C',      S.min >= 2],
    ['Maksimum Sıcaklık',               S.max.toFixed(2) + ' °C', '≤ 8,00 °C',      S.max <= 8],
    ['Ortalama Sıcaklık',               S.mean.toFixed(2) + ' °C', '2,00 – 8,00 °C', S.mean >= 2 && S.mean <= 8],
    ['Buzdolabı Dışı Süre (TOR)',       S.torUsed.toLocaleString('tr-TR') + ' dk' + (S.torUsed >= 120 ? ' · ' + fmtLong(S.torUsed) : ''), '≤ ' + S.torLimit + ' dk', S.torUsed <= S.torLimit],
    ['Kayıt Aralığı',                   S.gap + ' dk',            '≤ 60 dk',         S.gap <= 60],
    ['Sapma Sayısı',                    S.excCount + ' adet',     'bilgi',           null],
    ['Ölçüm Noktası',                   S.points.toLocaleString('tr-TR'), 'bilgi',  null],
  ]);

  /* =========================================================
     1) TEMİZ A4 YAZDIR / PDF BELGESİ  (body > #print-root portala)
     ========================================================= */
  const PD_CSS = `
  #print-root{font-family:'Space Grotesk',sans-serif;color:#1f2937;}
  .pd-mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;}
  /* A4 210mm − 2×12mm kenar = 186mm yazdırılabilir alan; 780px'lik eski genişlik sağdan taşıyordu */
  .pd{background:#fff;width:186mm;max-width:186mm;margin:0 auto;padding:0;}
  .pd section{break-inside:avoid;}
  /* uzun tablolar: sayfa bölünebilir, satırlar bölünmez, başlık her sayfada tekrarlanır */
  .pd section.pd-long{break-inside:auto;}
  .pd-long .pd-tblWrap{overflow:visible;}
  .pd-long thead{display:table-header-group;}
  .pd-long tr{break-inside:avoid;}
  .pd-ek{break-before:page;display:flex;align-items:center;gap:10px;margin:0 0 14px;}
  .pd-ek span{font-size:9px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#94a3b8;border:1px solid #e3e9f0;border-radius:4px;padding:3px 9px;}
  .pd-ek i{flex:1;height:1px;background:#e3e9f0;}
  .pd-st .pd-cnt{color:#94a3b8;font-weight:600;letter-spacing:.4px;text-transform:none;}
  .pd-n{font-size:8px;font-weight:700;letter-spacing:.4px;padding:1px 5px;border-radius:3px;white-space:nowrap;margin-right:7px;vertical-align:1px;}
  .pd-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e7edf3;border:1px solid #e7edf3;border-radius:7px;overflow:hidden;margin-bottom:10px;}
  .pd-kpi div{background:#fff;padding:8px 11px;}
  .pd-kpi small{display:block;font-size:8px;letter-spacing:.7px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:2px;}
  .pd-kpi b{font-size:12px;}
  .pd-kpi em{font-style:normal;font-size:8.5px;color:#94a3b8;}
  .pd-more{font-size:9.5px;color:#94a3b8;padding:6px 10px;border-top:1px dashed #e3e9f0;text-align:center;}
  /* başlık */
  .pd-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:2.5px solid #0f1828;padding-bottom:14px;margin-bottom:18px;}
  .pd-logo{display:flex;align-items:center;gap:10px;}
  .pd-mk{width:34px;height:34px;border-radius:8px;background:#0f81a8;color:#fff;display:grid;place-items:center;flex-shrink:0;}
  .pd-brand b{font-size:16px;font-weight:700;color:#0f1828;letter-spacing:.2px;display:block;line-height:1.1;}
  .pd-brand span{font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#0f81a8;font-weight:700;white-space:nowrap;}
  .pd-hdR{text-align:right;}
  .pd-hdT{font-size:13.5px;font-weight:700;color:#0f1828;letter-spacing:.2px;}
  .pd-hdS{font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;color:#64748b;font-weight:600;margin-top:4px;}
  .pd-hdMeta{font-size:10px;color:#475569;margin-top:7px;line-height:1.55;}
  .pd-hdMeta b{color:#0f1828;}
  /* karar bandı */
  .pd-dec{display:flex;align-items:center;gap:16px;border-left:6px solid;border-radius:8px;padding:14px 18px;margin-bottom:18px;}
  .pd-decT{font-size:21px;font-weight:800;line-height:1.05;letter-spacing:-.4px;white-space:nowrap;}
  .pd-decSub{font-size:9px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;margin-top:5px;}
  .pd-decR{margin-left:auto;text-align:right;}
  .pd-decConf{font-size:26px;font-weight:800;line-height:1;}
  .pd-decConfL{font-size:8px;letter-spacing:1.4px;text-transform:uppercase;color:#64748b;font-weight:700;margin-top:3px;}
  /* bölüm başlığı */
  .pd-st{font-size:10px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#0f81a8;margin:0 0 9px;display:flex;align-items:center;gap:7px;white-space:nowrap;}
  .pd-st::after{content:'';flex:1;height:1px;background:#e3e9f0;}
  .pd-block{margin-bottom:18px;}
  /* meta ızgara */
  .pd-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#e7edf3;border:1px solid #e7edf3;border-radius:7px;overflow:hidden;}
  .pd-gi{background:#fff;padding:9px 12px;}
  .pd-giL{font-size:8px;letter-spacing:.7px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:3px;}
  .pd-giV{font-size:11.5px;font-weight:600;color:#1f2937;}
  /* özet */
  .pd-sum{font-size:11.5px;line-height:1.6;color:#334155;margin-bottom:9px;}
  .pd-rs{font-size:10.5px;color:#475569;line-height:1.45;padding:5px 0 5px 12px;border-left:2.5px solid;margin-bottom:5px;}
  /* tablolar */
  table.pd-tbl{width:100%;border-collapse:collapse;}
  .pd-tbl th{text-align:left;font-size:8px;letter-spacing:.6px;text-transform:uppercase;color:#64748b;font-weight:700;background:#f1f5f9;padding:7px 10px;border-bottom:1px solid #e3e9f0;}
  .pd-tbl td{font-size:10.5px;padding:7px 10px;border-bottom:1px solid #eef2f6;color:#334155;}
  .pd-tbl td.m{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;}
  .pd-tbl tr:last-child td{border-bottom:none;}
  .pd-bd{font-size:8.5px;font-weight:700;letter-spacing:.4px;padding:2.5px 7px;border-radius:4px;white-space:nowrap;}
  .pd-tblWrap{border:1px solid #e3e9f0;border-radius:7px;overflow:hidden;}
  /* grafik */
  .pd-chart{border:1px solid #e3e9f0;border-radius:7px;padding:12px 10px 6px;background:#fff;}
  .pd-cap{font-size:9px;color:#94a3b8;margin-top:6px;text-align:center;letter-spacing:.2px;}
  /* iki sütun */
  .pd-2c{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  /* dağılım barları: etiket | çubuk | yüzde (yüzde sabit sütunda, kenara yaslanmaz) */
  .pd-tir{display:grid;grid-template-columns:170px 1fr 40px;gap:10px;align-items:center;margin-bottom:7px;font-size:10px;color:#475569;}
  .pd-tir b{text-align:right;}
  .pd-tirL{display:flex;justify-content:space-between;font-size:10px;color:#475569;margin-bottom:4px;}
  .pd-bar{height:6px;border-radius:3px;background:#f1f5f9;border:1px solid #e7edf3;overflow:hidden;}
  .pd-barf{height:100%;border-radius:3px;}
  /* güvenlik */
  .pd-sec{display:flex;justify-content:space-between;gap:10px;font-size:10px;padding:6px 0;border-top:1px solid #eef2f6;}
  .pd-sec:first-child{border-top:none;}
  .pd-ok{color:#1c9961;font-weight:700;white-space:nowrap;}
  /* mevzuat */
  .pd-reg{font-size:10.5px;color:#475569;line-height:1.55;padding:11px 14px;background:#f5f8fb;border-left:3px solid #0f81a8;border-radius:0 7px 7px 0;}
  .pd-reg b{color:#0f1828;}
  /* imza */
  .pd-sig{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:22px;padding-top:16px;border-top:1px dashed #cbd5e1;}
  .pd-sigT{font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#475569;margin-bottom:4px;}
  .pd-sigSub{font-size:9px;color:#94a3b8;line-height:1.5;}
  .pd-sigLine{height:1px;background:#94a3b8;margin:30px 0 6px;}
  /* alt bilgi */
  .pd-ft{margin-top:18px;padding-top:12px;border-top:1px solid #e3e9f0;display:flex;justify-content:space-between;font-size:8.5px;color:#94a3b8;letter-spacing:.3px;}

  @media screen { #print-root{ display:none; } }
  @media print {
    html,body{height:auto !important;overflow:visible !important;background:#fff !important;}
    #root{ display:none !important; }
    #print-root{ display:block !important; }
    @page{ size:A4 portrait; margin:13mm 12mm; }
  }`;

  function metaItems(S) {
    return [
      ['İlaç / Ürün', S.drug], ['Barkod (GTIN)', S.barcode], ['Miad (SKT)', S.expiry],
      ['Parti No', S.batch], ['Seri No', S.serial], ['Miktar', S.qty + ' Kutu'],
      ['Eczane / Kurum', S.pharmacy], ['Şehir / İlçe', S.city], ['İade Nedeni', S.reason],
    ];
  }

  function CRPrintDoc({ S }) {
    const m = decMeta[S.decision] || decFallback;
    const target = document.getElementById('print-root');
    if (!target) return null;

    const DOC_DATE = getDocDate();

    const tir = S.tir;
    const retro = window.CCRetro ? window.CCRetro(S) : null;
    const RG = groupReasons(S.reasons, 3);
    const EX = excSummary(S.excursions);
    const retroRows = retro && retro.windows ? retro.windows : [];
    const retroTop = retroRows.slice(0, 3);
    const retroHead = <tr><th>Sapma</th><th>Sapma Aralığı</th><th>Geriye Dönük 24 Saatlik Aralık</th><th>Kapsam</th><th>24h MKT</th><th style={{ textAlign: 'right' }}>Durum</th></tr>;
    const retroRow = (w, i) => (
      <tr key={i}>
        <td>{w.type === 'high' ? 'Yüksek' : 'Düşük'} · {w.peak} °C</td>
        <td className="m">{w.excRange}</td>
        <td className="m" style={{ color: '#475569' }}>{w.range}</td>
        <td className="m" style={{ color: w.insufficient ? '#b45309' : '#475569' }}>{w.coverage}</td>
        <td className="m" style={{ fontWeight: 600, color: w.status === 'bad' ? '#cb3c48' : w.insufficient ? '#94a3b8' : '#334155' }}>{w.mkt24h != null ? w.mkt24h + ' °C' : '—'}</td>
        <td style={{ textAlign: 'right' }}><span className="pd-bd" style={{ color: w.status === 'bad' ? '#cb3c48' : w.insufficient ? '#b45309' : '#1c9961', background: w.status === 'bad' ? '#fae7e8' : w.insufficient ? '#fef3c7' : '#e9f6ee' }}>{w.status === 'bad' ? 'İHLAL' : w.insufficient ? 'YETERSİZ VERİ' : 'UYGUN'}</span></td>
      </tr>);
    const doc = (
      <div className="pd">
        <style>{PD_CSS}</style>

        {/* Başlık */}
        <header className="pd-hd">
          <div className="pd-logo">
            <span className="pd-mk"><Ic.snow size={19} sw={2} /></span>
            <div className="pd-brand"><b>ColdChain AI</b><span>Soğuk Zincir İzleme</span></div>
          </div>
          <div className="pd-hdR">
            <div className="pd-hdT">SOĞUK ZİNCİR ANALİZ RAPORU</div>
            <div className="pd-hdS">T.C. Sağlık Bakanlığı · TİTCK GDP Kılavuzu Uyumlu</div>
            <div className="pd-hdMeta">
              Belge No: <b className="pd-mono">{docId(S)}</b><br />
              Analiz Tarihi: <b className="pd-mono">{DOC_DATE}</b>
            </div>
          </div>
        </header>

        {/* Karar bandı */}
        <section className="pd-dec" style={{ borderColor: m.hex, background: m.soft }}>
          <div>
            <div className="pd-decT" style={{ color: m.hex }}>ANALİZ SONUCU: {m.t1}</div>
            <div className="pd-decSub" style={{ color: m.hex }}>{m.sub}</div>
          </div>
          <div className="pd-decR">
            <div className="pd-decConf pd-mono" style={{ color: m.hex }}>%{S.conf}</div>
            <div className="pd-decConfL">Güven Skoru</div>
          </div>
        </section>

        {/* Ürün bilgileri */}
        <section className="pd-block">
          <div className="pd-st">İade & Ürün Bilgileri</div>
          <div className="pd-grid">
            {metaItems(S).map(([l, v]) => (
              <div key={l} className="pd-gi"><div className="pd-giL">{l}</div><div className="pd-giV">{v}</div></div>))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10,
            padding: '9px 14px', border: '1px solid ' + m.hex, borderRadius: 7, background: m.soft }}>
            <span style={{ fontSize: 9, letterSpacing: '.8px', textTransform: 'uppercase', fontWeight: 700, color: m.hex }}>
              {S.decision === 'reject' ? 'Reddedilen / Hasar Tutarı' : 'Korunan Varlık Değeri'}</span>
            <span className="pd-mono" style={{ fontSize: 16, fontWeight: 700, color: m.hex }}>{fmtTRY(S.amount)}</span>
          </div>
        </section>

        {/* İstatistik tablosu (sonuç tablosu özetin ÜSTÜNDE) */}
        <section className="pd-block">
          <div className="pd-st">Sıcaklık İstatistikleri</div>
          <div className="pd-tblWrap">
            <table className="pd-tbl">
              <thead><tr><th>Parametre</th><th>Ölçülen</th><th>Kabul Limiti</th><th style={{ textAlign: 'right' }}>Durum</th></tr></thead>
              <tbody>
                {statsRows(S).map((r, i) => (
                  <tr key={i}>
                    <td>{r[0]}</td>
                    <td className="m" style={{ fontWeight: 600 }}>{r[1]}</td>
                    <td className="m" style={{ color: '#94a3b8' }}>{r[2]}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r[3] === null
                        ? <span style={{ fontSize: 10, color: '#94a3b8' }}>—</span>
                        : <span className="pd-bd" style={{ color: r[3] ? '#1c9961' : '#cb3c48', background: r[3] ? '#e9f6ee' : '#fae7e8' }}>{r[3] ? 'UYGUN' : 'İHLAL'}</span>}
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Değerlendirme özeti — en fazla 3 gruplu gerekçe, tam liste EK-2 */}
        <section className="pd-block">
          <div className="pd-st">Değerlendirme Özeti{RG.all.length > 0 && <span className="pd-cnt">· {RG.all.length} gerekçe{RG.appendix ? ', tam liste EK-2' : ''}</span>}</div>
          <div className="pd-sum">{S.summary}</div>
          {RG.top.map((it, i) => (
            <div key={i} className="pd-rs" style={{ borderColor: it.color }}>
              <span className="pd-n" style={{ color: it.color, background: softOf(it.color) }}>{it.tag}</span>{it.text}
            </div>))}
        </section>

        {/* Isı maruziyet dağılımı (yüzdeler 1. sayfada, sabit sütunda) */}
        <section className="pd-block">
          <div className="pd-st">Isı Maruziyet Dağılımı</div>
          {[['İdeal · 2–8 °C', tir.ideal, '#1c9961'], ['Hafif ihlal · 0–2 / 8–15 °C', tir.warn, '#b07d18'], ['Kritik · <0 / >15 °C', tir.crit, '#cb3c48']].map(([l, v, c]) => (
            <div key={l} className="pd-tir">
              <span>{l}</span>
              <div className="pd-bar"><div className="pd-barf" style={{ width: v + '%', background: c }} /></div>
              <b className="pd-mono" style={{ color: c }}>%{v}</b>
            </div>))}
        </section>

        {/* MKT Kontrol (Geriye Dönük) — ilk 3 pencere, kalanı EK-3 */}
        {retro && (
          <section className="pd-block">
            <div className="pd-st">MKT Kontrol · Geriye Dönük 24 Saat{retro.hasProblem && <span className="pd-cnt">· {retro.problemCount} ihlal / {retroRows.length} pencere</span>}</div>
            {retro.engineMissing || retro.noData ? (
              <div className="pd-reg">
                <b>Kontrol yapılamadı</b> — {retro.engineMissing ? 'MKT motoru yüklenemedi' : 'sıcaklık serisi bulunamadı'}; bu bölüm için sonuç üretilemedi.
              </div>
            ) : !retro.triggered ? (
              <div className="pd-reg">
                <b>Sorun bulunamadı</b> — sıcaklık hiçbir noktada {retro.lo}–{retro.hi} °C aralığının dışına çıkmadı; geriye dönük 24 saatlik MKT kontrolü gerekmedi.
              </div>
            ) : !retro.hasProblem && !retro.insufficientCount ? (
              <div className="pd-reg">
                <b>Sorun bulunamadı</b> — tespit edilen {retro.excursionCount} sapma için düzelme anından geriye 24 saatlik MKT hesaplandı ve tümü {retro.lo}–{retro.hi} °C aralığında kaldı.
              </div>
            ) : (
              <div className="pd-tblWrap">
                <table className="pd-tbl">
                  <thead>{retroHead}</thead>
                  <tbody>
                    {retroTop.map(retroRow)}
                  </tbody>
                </table>
                {retroRows.length > retroTop.length && <div className="pd-more">+ {retroRows.length - retroTop.length} pencere daha · tam liste EK-3</div>}
              </div>
            )}
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 7, lineHeight: 1.5 }}>
              <b>Yöntem:</b> Sıcaklık {retro.lo}–{retro.hi} °C aralığının dışına her çıktığında, sapmanın düzeldiği andan geriye doğru 24 saatlik MKT hesaplanır. Bu pencerenin MKT'si aralık dışındaysa ilgili aralık hatalı bildirilir. Pencere 24 saati kapsamıyorsa (kayıt başı veya veri boşluğu) satır yetersiz veri olarak işaretlenir ve ihlal sayılmaz.
            </div>
          </section>
        )}

        {/* Sıcaklık grafiği (ısı kaydı) */}
        <section className="pd-block">
          <div className="pd-st">Sıcaklık Profili · Ölçüm Süresi</div>
          <div className="pd-chart">
            <CCTempChart data={S.temp} w={700} h={180} color="#0f81a8" band={[2, 8]}
              gridColor="#eef2f6" axisColor="#94a3b8" bandColor="rgba(28,153,97,.12)" fill={true} />
          </div>
          <div className="pd-cap">Yeşil bant: 2–8 °C kabul aralığı · Toplam {S.points.toLocaleString('tr-TR')} ölçüm noktası · {S.gap} dk kayıt aralığı</div>
        </section>

        {/* Veri bütünlüğü + Mevzuat (yan yana) */}
        <section className="pd-block pd-2c">
          <div>
            <div className="pd-st">Veri Bütünlüğü & Güvenlik</div>
            {[['Cihaz / sensör bütünlüğü', 'Sağlam'], ['Harici düzenleme izi', 'Saptanmadı'], ['Doğal dalgalanma sapması', 'Uygun'], ['PDF kalıp / boşluk analizi', 'Tutarlı']].map(([l, v]) => (
              <div key={l} className="pd-sec"><span style={{ color: '#475569' }}>{l}</span><span className="pd-ok">✓ {v}</span></div>))}
          </div>
          <div>
            <div className="pd-st">Mevzuat Referansı</div>
            <div className="pd-reg">
              <b>{S.gdp}</b> · Standart 2–8 °C TİTCK saklama prosedürleri uygulanmıştır.
              Toplam {S.points.toLocaleString('tr-TR')} ölçüm noktası, {S.gap} dk kayıt aralığı ve {S.torUsed.toLocaleString('tr-TR')} dk ({fmtLong(S.torUsed)}) buzdolabı dışı süre (TOR) baz alınarak değerlendirilmiştir.
            </div>
          </div>
        </section>

        {/* İmza */}
        <section className="pd-sig">
          <div>
            <div className="pd-sigT">Sistem Referansı</div>
            <div className="pd-sigSub" style={{ marginTop: 6 }}>ColdChain AI v2.1 — Verification Service<br />Belge No: <span className="pd-mono">{docId(S)}</span><br />Yapay zeka destekli otomatik analiz.</div>
          </div>
          <div>
            <div className="pd-sigT">Kalite Güvence Müdürü Onayı</div>
            <div className="pd-sigLine" />
            <div className="pd-sigSub">Ad Soyad / İmza / Kaşe</div>
          </div>
        </section>

        {/* ===== EKLER (yeni sayfadan başlar) ===== */}
        {(S.excursions.length > 0 || RG.appendix || retroRows.length > retroTop.length) && (
          <div className="pd-ek"><span>Ek · Isı Sapmaları</span><i /></div>
        )}

        {/* EK-1 · Sapma özeti + tam tablo (sayfa başında sütun başlığı tekrarlanır) */}
        {S.excursions.length > 0 && (
          <section className="pd-block pd-long">
            <div className="pd-st">EK-1 · Tespit Edilen Sapmalar<span className="pd-cnt">· {EX.count}</span></div>
            <div className="pd-kpi">
              <div><small>Toplam sapma</small><b className="pd-mono">{EX.count}</b></div>
              <div><small>Düşük / yüksek</small><b className="pd-mono">{EX.low} / {EX.high}</b></div>
              <div><small>Toplam süre</small><b className="pd-mono">{EX.total.toLocaleString('tr-TR')} dk</b> <em>· {fmtLong(EX.total)}</em></div>
              <div><small>En uzun</small><b className="pd-mono">{EX.longest ? EX.longest.mn.toLocaleString('tr-TR') + ' dk' : '—'}</b> {EX.longest && <em>· #{EX.li + 1}, {EX.longest.x.start}</em>}</div>
            </div>
            <div className="pd-tblWrap">
              <table className="pd-tbl">
                <thead><tr><th>#</th><th>Başlangıç</th><th>Bitiş</th><th>Süre</th><th>Tür</th><th style={{ textAlign: 'right' }}>Tepe</th></tr></thead>
                <tbody>
                  {S.excursions.map((x, i) => (
                    <tr key={i} style={i === EX.li && EX.count > 1 ? { background: '#fff8f8' } : undefined}>
                      <td className="m" style={{ color: '#94a3b8' }}>{String(i + 1).padStart(String(EX.count).length, '0')}</td>
                      <td className="m">{x.start}</td>
                      <td className="m">{x.end}</td>
                      <td className="m" style={{ fontWeight: 600 }}>{x.dur}</td>
                      <td>{x.type === 'high' ? 'Yüksek sıcaklık' : 'Düşük sıcaklık'}{i === EX.li && EX.count > 1 ? ' · en uzun' : ''}</td>
                      <td className="m" style={{ textAlign: 'right', fontWeight: 700, color: x.peak > 8 || x.peak < 2 ? '#cb3c48' : '#1c9961' }}>{x.peak.toFixed(2)} °C</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* EK-2 · Gerekçelerin tam listesi (1. sayfada gruplandıysa) */}
        {RG.appendix && (
          <section className="pd-block pd-long">
            <div className="pd-st">EK-2 · Gerekçelerin Tam Listesi<span className="pd-cnt">· {RG.all.length}</span></div>
            {RG.all.map((it, i) => (
              <div key={i} className="pd-rs" style={{ borderColor: it.color, breakInside: 'avoid' }}>
                <span className="pd-n" style={{ color: it.color, background: softOf(it.color) }}>{it.tag}</span>{it.text}
              </div>))}
          </section>
        )}

        {/* EK-3 · Geriye dönük MKT pencerelerinin tamamı (1. bölümde kısaltıldıysa) */}
        {retroRows.length > retroTop.length && (
          <section className="pd-block pd-long">
            <div className="pd-st">EK-3 · Geriye Dönük 24 Saatlik MKT Pencereleri<span className="pd-cnt">· {retroRows.length}</span></div>
            <div className="pd-tblWrap">
              <table className="pd-tbl">
                <thead>{retroHead}</thead>
                <tbody>{retroRows.map(retroRow)}</tbody>
              </table>
            </div>
          </section>
        )}

        <footer className="pd-ft">
          <span>ColdChain AI · Soğuk Zincir Yönetim Sistemi</span>
          <span className="pd-mono">{docId(S)} · {DOC_DATE}</span>
        </footer>
      </div>
    );

    return ReactDOM.createPortal(doc, target);
  }

  /* =========================================================
     2) EXCEL (.xlsx) — SheetJS varsa çok sayfalı; yoksa CSV
     ========================================================= */
  function exportExcel(S) {
    const m = decMeta[S.decision] || decFallback;
    const fname = 'ColdChain_Rapor_' + S.batch + '_' + m.t1;
    const DOC_DATE = getDocDate();

    if (window.XLSX) {
      const XLSX = window.XLSX;
      const wb = XLSX.utils.book_new();
      const title = 'COLDCHAIN AI — SOĞUK ZİNCİR ANALİZ RAPORU';

      /* --- Özet sayfası --- */
      const ozet = [
        [title], ['T.C. Sağlık Bakanlığı · TİTCK GDP Kılavuzu Uyumlu Analiz'], [],
        ['Belge No', docId(S)], ['Analiz Tarihi', DOC_DATE], [],
        ['ANALİZ SONUCU'], ['Karar', m.t1], ['Açıklama', m.sub], ['Güven Skoru', '%' + S.conf], ['Özet', S.summary], [],
        ['ÜRÜN & İADE BİLGİLERİ'],
        ['İlaç / Ürün', S.drug], ['Barkod (GTIN)', S.barcode], ['Miad (SKT)', S.expiry],
        ['Parti No', S.batch], ['Seri No', S.serial], ['Miktar', S.qty + ' Kutu'],
        ['Eczane / Kurum', S.pharmacy], ['Şehir / İlçe', S.city], ['İade Nedeni', S.reason],
        ['Tutar (TRY)', S.amount], [],
        ['GEREKÇELER'],
        ...S.reasons.map((r, i) => [(i + 1) + '.', r]), [],
        ['Mevzuat Referansı', S.gdp],
      ];
      const wsOzet = XLSX.utils.aoa_to_sheet(ozet);
      wsOzet['!cols'] = [{ wch: 22 }, { wch: 78 }];
      wsOzet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
      ];
      XLSX.utils.book_append_sheet(wb, wsOzet, 'Özet');

      /* --- İstatistikler --- */
      const istat = [['Parametre', 'Ölçülen', 'Kabul Limiti', 'Durum'],
        ...statsRows(S).map(r => [r[0], r[1], r[2], r[3] === null ? 'Bilgi' : (r[3] ? 'UYGUN' : 'İHLAL')])];
      const wsIstat = XLSX.utils.aoa_to_sheet(istat);
      wsIstat['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 18 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsIstat, 'İstatistikler');

      /* --- Sapmalar --- */
      const sapma = [['#', 'Başlangıç', 'Bitiş', 'Süre', 'Tür', 'Tepe (°C)'],
        ...S.excursions.map((x, i) => [i + 1, x.start, x.end, x.dur, x.type === 'high' ? 'Yüksek sıcaklık' : 'Düşük sıcaklık', x.peak])];
      const wsSapma = XLSX.utils.aoa_to_sheet(sapma);
      wsSapma['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsSapma, 'Sapmalar');

      /* --- Isı dağılımı --- */
      const dagilim = [['Dilim', 'Aralık', 'Oran (%)'],
        ['İdeal', '2–8 °C', S.tir.ideal], ['Hafif ihlal', '0–2 / 8–15 °C', S.tir.warn], ['Kritik', '<0 / >15 °C', S.tir.crit]];
      const wsDag = XLSX.utils.aoa_to_sheet(dagilim);
      wsDag['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsDag, 'Isı Dağılımı');

      /* --- Ham veri --- */
      const pad = n => String(n).padStart(2, '0');
      const fmtTs = ms => {
        const d = new Date(ms);
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      const ham = [['Sıra', 'Tarih · Saat', 'Sıcaklık (°C)', 'Durum'],
        ...S.temp.map((d, i) => [i + 1, fmtTs(d.t), d.v, (d.v >= 2 && d.v <= 8) ? 'Uygun' : 'Sapma'])];
      const wsHam = XLSX.utils.aoa_to_sheet(ham);
      wsHam['!cols'] = [{ wch: 7 }, { wch: 20 }, { wch: 14 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsHam, 'Ham Veri');

      XLSX.writeFile(wb, fname + '.xlsx');
      return;
    }

    /* --- CSV fallback (SheetJS yüklenmediyse) --- */
    const rows = [
      [title], [], ['Belge No', docId(S)], ['Analiz Tarihi', DOC_DATE], ['Karar', m.t1, '%' + S.conf], [],
      ['ÜRÜN', S.drug], ['Eczane', S.pharmacy], ['Parti', S.batch], ['Tutar (TRY)', S.amount], [],
      ['İSTATİSTİKLER'], ['Parametre', 'Ölçülen', 'Limit', 'Durum'],
      ...statsRows(S).map(r => [r[0], r[1], r[2], r[3] === null ? 'Bilgi' : (r[3] ? 'UYGUN' : 'İHLAL')]), [],
      ['SAPMALAR'], ['Başlangıç', 'Bitiş', 'Süre', 'Tepe'],
      ...S.excursions.map(x => [x.start, x.end, x.dur, x.peak]),
    ];
    const esc = v => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '\uFEFF' + rows.map(r => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  Object.assign(window, { CRPrintDoc, CRExportExcel: exportExcel });
})();
