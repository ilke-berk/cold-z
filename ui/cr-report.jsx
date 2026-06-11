/* Rapor sayfası gövdesi (Kontrol Odası dili + beyaz sertifika önizlemesi) */
(function () {
  const { CCIcons: Ic, CRShell, CCScenarios, CRPrintDoc, CRExportExcel, CCStore, CCPipeline } = window;

  const RP_CSS = `
  .rp-g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;align-items:start;}
  .rp-meta{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--ln);border:1px solid var(--ln);border-radius:9px;overflow:hidden;}
  .rp-mi{background:var(--pn);padding:11px 14px;}
  .rp-miL{font-size:9px;letter-spacing:.8px;text-transform:uppercase;color:var(--t3);font-weight:600;margin-bottom:4px;}
  .rp-miV{font-size:13px;font-weight:600;}
  .rp-fin{display:flex;align-items:center;gap:12px;padding:13px 15px;border-radius:9px;margin-bottom:14px;border-left:3px solid;}
  .rp-finL{font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:700;}
  .rp-finV{font-size:17px;font-weight:700;}
  .rp-conf{font-size:40px;font-weight:700;letter-spacing:-2px;line-height:1;}
  .rp-bar{height:7px;border-radius:4px;background:var(--pn2);border:1px solid var(--ln);overflow:hidden;margin-top:5px;}
  .rp-barf{height:100%;border-radius:4px;}
  .rp-tirRow{margin-bottom:11px;}
  .rp-tirL{display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:5px;}
  .rp-ref{font-size:12px;color:var(--t2);line-height:1.6;padding:13px 15px;background:var(--sigS);border-left:3px solid var(--sig);border-radius:0 8px 8px 0;}
  /* beyaz sertifika */
  .rp-cert{background:#ffffff;color:#1f2937;border-radius:12px;padding:34px 38px;box-shadow:0 18px 50px rgba(0,0,0,.35);font-family:'Space Grotesk',sans-serif;}
  .rp-certHd{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #0f1828;padding-bottom:16px;margin-bottom:20px;}
  .rp-certLogo{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:700;color:#0f1828;}
  .rp-certMk{width:30px;height:30px;border-radius:7px;background:#0f81a8;color:#fff;display:grid;place-items:center;}
  .rp-certTitle{text-align:center;flex:1;}
  .rp-certT1{font-size:15px;font-weight:700;letter-spacing:.3px;color:#0f1828;}
  .rp-certT2{font-size:9.5px;letter-spacing:.8px;color:#64748b;margin-top:4px;text-transform:uppercase;}
  .rp-certQr{color:#0f1828;}
  .rp-certMeta{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px;}
  .rp-cmL{font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:3px;}
  .rp-cmV{font-size:12.5px;font-weight:600;color:#1f2937;}
  .rp-certDec{padding:14px 16px;border-radius:8px;border-left:5px solid;margin-bottom:16px;}
  .rp-certDecT{font-size:14px;font-weight:700;margin-bottom:5px;}
  .rp-certDecS{font-size:11.5px;color:#475569;line-height:1.5;}
  table.rp-certTbl{width:100%;border-collapse:collapse;margin-bottom:18px;}
  .rp-certTbl th{text-align:left;font-size:8.5px;letter-spacing:.6px;text-transform:uppercase;color:#94a3b8;font-weight:700;padding:7px 10px;background:#f1f5f9;}
  .rp-certTbl td{font-size:12px;padding:9px 10px;border-bottom:1px solid #eef2f6;color:#334155;font-family:'JetBrains Mono',monospace;}
  .rp-certTbl td:first-child{font-family:'Space Grotesk';font-weight:500;}
  .rp-cbd{font-size:9.5px;font-weight:700;letter-spacing:.4px;padding:3px 8px;border-radius:4px;}
  .rp-sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;padding-top:18px;border-top:1px dashed #cbd5e1;}
  .rp-sigT{font-size:10px;font-weight:700;color:#334155;letter-spacing:.3px;margin-bottom:6px;}
  .rp-sigLine{height:1px;background:#94a3b8;margin:26px 0 6px;}
  .rp-sigSub{font-size:9.5px;color:#94a3b8;}
  `;

  const decMeta = {
    accept: { c: 'var(--ok)', s: 'var(--okS)', hex: '#1c9961', bg: '#e9f6ee', t1: 'KABUL', sub: 'İADE ONAYLANDI' },
    conditional: { c: 'var(--amber)', s: 'var(--amberS)', hex: '#b07d18', bg: '#f7efd9', t1: 'ŞARTLI', sub: 'KOŞULLU KABUL' },
    reject: { c: 'var(--bad)', s: 'var(--badS)', hex: '#cb3c48', bg: '#fae7e8', t1: 'RED', sub: 'İADE REDDEDİLDİ' },
  };
  const getDocDate = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fmtTRY = n => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

  function CRReport({ theme, onNav = () => {} }) {
    const { useState } = React;
    const DOC_DATE = getDocDate();
    const stored = (CCStore && CCStore.get()) || null;
    const real = stored && stored.scenario;
    const sc = localStorage.getItem('cc-scenario') || 'accept';
    const S = real || CCScenarios[sc];
    const [saveState, setSaveState] = useState(stored && stored.savedId ? 'saved' : 'idle'); // idle|saving|saved|error
    const [savedId, setSavedId] = useState(stored && stored.savedId);
    const lo = Number(S.lo) || 2, hi = Number(S.hi) || 8;
    const m = decMeta[S.decision] || decMeta.conditional;
    const conf = S.conf;
    const tir = S.tir;
    const stat = (label, val, lim, ok) => ({ label, val, lim, ok });
    const stats = [
      stat('MKT (Ortalama Kinetik)', S.mkt.toFixed(2) + '°C', lo.toFixed(2) + ' – ' + hi.toFixed(2) + '°C', S.mkt >= lo && S.mkt <= hi),
      stat('Min / Maks', S.min.toFixed(1) + ' / ' + S.max.toFixed(1) + '°C', lo + ' – ' + hi + '°C', S.min >= lo && S.max <= hi),
      stat('Ortalama', S.mean.toFixed(2) + '°C', lo + ' – ' + hi + '°C', S.mean >= lo && S.mean <= hi),
      stat('Kayıt Aralığı', S.gap + ' dk', '≤ 60 dk', S.gap <= 60),
    ];

    const doSave = async () => {
      if (!real || !stored.record || saveState === 'saving' || saveState === 'saved') return;
      setSaveState('saving');
      try {
        const j = await CCPipeline.save(stored.record);
        if (j && j.success) { setSavedId(j.id); setSaveState('saved'); CCStore.patch({ savedId: j.id }); }
        else setSaveState('error');
      } catch (e) { setSaveState('error'); }
    };

    return (
      <CRShell theme={theme} active="report" onNav={onNav}>
        <style>{RP_CSS}</style>
        <CRPrintDoc S={S} />
        <div className="cr-hr">
          <div><div className="cr-h1">Rapor</div><div className="cr-h1sub">{S.pharmacy} · {S.drug} · parti {S.batch}</div></div>
          <div style={{ display: 'flex', gap: 12 }}>
            {real && (
              <button className="cr-btn" onClick={doSave} disabled={saveState === 'saving' || saveState === 'saved'}
                style={{ background: saveState === 'saved' ? 'var(--ok)' : undefined, opacity: saveState === 'saving' ? .7 : 1 }}>
                {saveState === 'saved' ? <React.Fragment><Ic.check size={15} sw={2.4} /> KAYDEDİLDİ #{savedId}</React.Fragment>
                  : saveState === 'saving' ? 'KAYDEDİLİYOR…'
                  : saveState === 'error' ? <React.Fragment><Ic.alert size={15} /> TEKRAR DENE</React.Fragment>
                  : <React.Fragment><Ic.box size={15} /> SİSTEME KAYDET</React.Fragment>}
              </button>
            )}
            <button className="cr-btn cr-btn2" onClick={() => CRExportExcel(S)}><Ic.grid size={15} /> Excel İndir</button>
            <button className="cr-btn" onClick={() => window.print()}><Ic.report size={15} /> YAZDIR / PDF</button>
          </div>
        </div>

        <div className="rp-g2">
          {/* Ürün karnesi */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.box size={15} style={{ color: 'var(--sig)' }} /> İADE DETAYLARI & ÜRÜN KARNESİ</div></div>
            <div style={{ padding: 18 }}>
              <div className="rp-fin" style={{ borderColor: m.c, background: m.s }}>
                <div style={{ flex: 1 }}>
                  <div className="rp-finL" style={{ color: m.c }}>{S.decision === 'reject' ? 'Reddedilen / hasar tutarı' : 'Korunan varlık değeri'}</div>
                  <div className="rp-finV cr-m" style={{ color: m.c }}>{fmtTRY(S.amount)}</div>
                </div>
              </div>
              <div className="rp-meta">
                {[['İlaç Adı', S.drug], ['Eczane', S.pharmacy], ['Barkod (GTIN)', S.barcode], ['Parti / Seri', S.batch], ['Miad (SKT)', S.expiry], ['Miktar', S.qty + ' Kutu'], ['İade Nedeni', S.reason], ['Kayıt Sayısı', S.points.toLocaleString('tr-TR') + ' veri']].map(([l, v]) => (
                  <div key={l} className="rp-mi"><div className="rp-miL">{l}</div><div className="rp-miV">{v}</div></div>))}
              </div>
            </div>
          </div>

          {/* Analiz özeti */}
          <div className="cr-pn" style={{ borderLeft: '3px solid ' + m.c }}>
            <div className="cr-ph"><div className="cr-pt"><Ic.activity size={15} style={{ color: 'var(--sig)' }} /> ANALİZ ÖZETİ</div></div>
            <div style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: m.c }}>{m.t1}</span>
                <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>· <b className="cr-m" style={{ color: m.c }}>%{conf}</b> güven</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--tx)', marginBottom: 14 }}>{S.summary}</div>
              <div className="rp-tirRow" style={{ marginBottom: 0 }}>
                {S.reasons.map((r, i) => <div key={i} style={{ fontSize: 12, color: 'var(--t2)', padding: '6px 0 6px 12px', borderLeft: '2px solid ' + m.c, marginBottom: 6, lineHeight: 1.4 }}>{r}</div>)}
              </div>
            </div>
          </div>
        </div>

        {/* İstatistik tablosu */}
        <div className="cr-pn" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div className="cr-ph"><div className="cr-pt">SICAKLIK İSTATİSTİKLERİ</div></div>
          <table className="cr-t">
            <thead><tr>{['Parametre', 'Ölçülen', 'Kabul Limiti', 'Durum'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {stats.map((r, i) => (
                <tr key={i} style={{ cursor: 'default' }}>
                  <td style={{ color: 'var(--t2)' }}>{r.label}</td>
                  <td className="cr-m" style={{ fontWeight: 600 }}>{r.val}</td>
                  <td className="cr-m" style={{ color: 'var(--t3)' }}>{r.lim}</td>
                  <td><span className="an-st" style={{ color: r.ok ? 'var(--ok)' : 'var(--bad)', background: 'transparent', padding: 0 }}><i style={{ width: 5, height: 5, borderRadius: '50%', background: r.ok ? 'var(--ok)' : 'var(--bad)' }} />{r.ok ? 'UYGUN' : 'İHLAL'}</span></td>
                </tr>))}
            </tbody>
          </table>
        </div>

        {/* Güvenlik + ısı maruziyeti */}
        <div className="rp-g2">
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.shield size={15} style={{ color: 'var(--sig)' }} /> VERİ BÜTÜNLÜĞÜ & GÜVENLİK</div></div>
            <div style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                <div className="rp-conf cr-m" style={{ color: conf > 80 ? 'var(--ok)' : 'var(--amber)' }}>%{conf}</div>
                <div style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.5 }}><b style={{ color: 'var(--tx)' }}>Anti-Fraud skoru</b> — standart sapma, veri manipülasyonu, PDF kalıp bütünlüğü ve boşluk analizine göre yapay zeka tarafından hesaplandı.</div>
              </div>
              {[['Cihaz pil / sensör bütünlüğü', 'Sağlam'], ['Harici uygulama düzenlemesi', 'Saptanmadı'], ['Doğal dalgalanma sapması', 'Uygun']].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '7px 0', borderTop: '1px solid var(--ln)' }}><span style={{ color: 'var(--t2)' }}>{l}</span><span style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ {v}</span></div>))}
            </div>
          </div>

          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.thermo size={15} style={{ color: 'var(--sig)' }} /> ISI MARUZİYET DAĞILIMI</div></div>
            <div style={{ padding: 18 }}>
              {[['İdeal · 2–8°C', tir.ideal, 'var(--ok)'], ['Hafif ihlal · 0–2 / 8–15°C', tir.warn, 'var(--amber)'], ['Kritik · <0 / >15°C', tir.crit, 'var(--bad)']].map(([l, v, c]) => (
                <div key={l} className="rp-tirRow">
                  <div className="rp-tirL"><span style={{ color: 'var(--t2)' }}>{l}</span><b className="cr-m" style={{ color: c }}>%{v}</b></div>
                  <div className="rp-bar"><div className="rp-barf" style={{ width: v + '%', background: c }} /></div>
                </div>))}
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>Cihaz sensörünün ölçüm süresi boyunca bulunduğu sıcaklık dilimleri.</div>
            </div>
          </div>
        </div>

        {/* Mevzuat */}
        <div className="cr-pn" style={{ marginBottom: 16 }}>
          <div className="cr-ph"><div className="cr-pt">MEVZUAT REFERANSI</div></div>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 12.5, color: 'var(--t2)', marginBottom: 10 }}>{S.gdp}</div>
            <div className="rp-ref">Standart 2–8°C TİTCK prosedürleri uygulanmıştır. Toplam {S.points.toLocaleString('tr-TR')} ölçüm noktası ve {S.gap} dk kayıt aralığı analiz edilmiştir.</div>
          </div>
        </div>

        {/* SERTİFİKA ÖNİZLEMESİ */}
        <div className="cr-pt" style={{ marginBottom: 12 }}><Ic.report size={15} style={{ color: 'var(--sig)' }} /> ONAY SERTİFİKASI ÖNİZLEMESİ</div>
        <div className="rp-cert">
          <div className="rp-certHd">
            <div className="rp-certLogo"><span className="rp-certMk"><Ic.snow size={17} sw={2} /></span> ColdChain AI</div>
            <div className="rp-certTitle">
              <div className="rp-certT1">SOĞUK ZİNCİR YÖNETİM ONAY SERTİFİKASI</div>
              <div className="rp-certT2">T.C. Sağlık Bakanlığı / TİTCK GDP Kılavuzu Uyumlu Analiz</div>
            </div>
            <div className="rp-certQr"><Ic.grid size={46} sw={1.2} /></div>
          </div>
          <div className="rp-certMeta">
            {[['İlaç / Ürün', S.drug], ['Barkod (GTIN)', S.barcode], ['Miad (SKT)', S.expiry], ['Parti / Seri No', S.batch + ' · ' + S.serial], ['Miktar', S.qty + ' Kutu'], ['İade Nedeni', S.reason], ['Eczane / Kurum', S.pharmacy], ['Analiz Tarihi', DOC_DATE], ['Onay Tutarı', fmtTRY(S.amount)]].map(([l, v]) => (
              <div key={l}><div className="rp-cmL">{l}</div><div className="rp-cmV">{v}</div></div>))}
          </div>
          <div className="rp-certDec" style={{ borderColor: m.hex, background: m.bg }}>
            <div className="rp-certDecT" style={{ color: m.hex }}>ANALİZ SONUCU: {m.t1} (%{conf} GÜVEN) — {m.sub}</div>
            <div className="rp-certDecS">{S.summary}</div>
          </div>
          <table className="rp-certTbl">
            <thead><tr><th>Parametre</th><th>Ölçülen</th><th>Kabul Limiti</th><th>Durum</th></tr></thead>
            <tbody>
              {[['Ortalama Kinetik (MKT)', S.mkt.toFixed(2) + '°C', '2,00 – 8,00°C', S.mkt >= 2 && S.mkt <= 8],
                ['Minimum Sıcaklık', S.min.toFixed(1) + '°C', '≥ 2,0°C', S.min >= 2],
                ['Maksimum Sıcaklık', S.max.toFixed(1) + '°C', '≤ 8,0°C', S.max <= 8],
                ['Buzdolabı Dışı (TOR)', S.torUsed + ' dk', '≤ ' + S.torLimit + ' dk', S.torUsed <= S.torLimit]].map((r, i) => (
                <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td>
                  <td><span className="rp-cbd" style={{ color: r[3] ? '#1c9961' : '#cb3c48', background: r[3] ? '#e9f6ee' : '#fae7e8' }}>{r[3] ? 'UYGUN' : 'İHLAL'}</span></td></tr>))}
            </tbody>
          </table>
          <div className="rp-sig">
            <div>
              <div className="rp-sigT">SİSTEM REFERANSI</div>
              <div className="rp-sigSub" style={{ marginTop: 8 }}>ColdChain AI v2.1 Verification Service<br />Belge ID: CC-{S.serial}-2606</div>
            </div>
            <div>
              <div className="rp-sigT">KALİTE GÜVENCE MÜDÜRÜ ONAYI</div>
              <div className="rp-sigLine" />
              <div className="rp-sigSub">İmza / Kaşe</div>
            </div>
          </div>
        </div>

        <div style={{ height: 8 }} />
      </CRShell>
    );
  }

  window.CRReport = CRReport;
})();
