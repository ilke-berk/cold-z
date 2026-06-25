/* Analiz & Karar sayfası gövdesi (Kontrol Odası dili) */
(function () {
  const { useState, useMemo, useEffect } = React;
  const { CCIcons: Ic, CRShell, CCTempChart, CCScenarios, CCStore } = window;

  const AN_CSS = `
  .an-seg{display:flex;gap:3px;background:var(--pn2);border:1px solid var(--ln2);border-radius:9px;padding:3px;}
  .an-seg button{display:flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;letter-spacing:.4px;padding:7px 13px;border-radius:6px;background:transparent;color:var(--t2);transition:.13s;}
  .an-seg button i{width:7px;height:7px;border-radius:50%;}
  .an-seg button.on{color:#04121a;}
  .an-steps{display:flex;align-items:center;background:var(--pn);border:1px solid var(--ln2);border-radius:12px;padding:15px 22px;margin-bottom:16px;}
  .an-step{display:flex;align-items:center;gap:9px;}
  .an-stepN{width:23px;height:23px;border-radius:50%;background:var(--sig);color:#04121a;display:grid;place-items:center;font-size:11px;font-weight:700;flex-shrink:0;}
  .an-stepL{font-size:12px;font-weight:600;white-space:nowrap;}
  .an-conn{flex:1;height:2px;background:var(--sig);opacity:.45;margin:0 12px;border-radius:2px;min-width:16px;}
  .an-g2{display:grid;grid-template-columns:1fr 1.25fr;gap:16px;margin-bottom:16px;align-items:start;}
  .an-mkt{padding:22px;text-align:center;}
  .an-mktV{font-size:58px;font-weight:700;letter-spacing:-3px;line-height:.95;}
  .an-mktU{font-size:13px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-top:4px;}
  .an-mktStrip{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px;border-top:1px solid var(--ln);padding-top:16px;}
  .an-mktSc{text-align:center;}
  .an-mktScL{font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--t3);font-weight:600;}
  .an-mktScV{font-size:17px;font-weight:600;margin-top:3px;}
  .an-formula{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--t3);margin-top:16px;padding:9px;background:var(--pn2);border:1px solid var(--ln);border-radius:7px;}
  .an-decHead{display:flex;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid var(--ln);}
  .an-decIc{width:50px;height:50px;border-radius:13px;display:grid;place-items:center;flex-shrink:0;}
  .an-decBig{font-size:24px;font-weight:700;letter-spacing:-.5px;line-height:1;}
  .an-decConf{font-size:11.5px;color:var(--t2);margin-top:4px;}
  .an-decBody{padding:16px 20px;}
  .an-decSum{font-size:13px;line-height:1.55;color:var(--tx);margin-bottom:14px;}
  .an-rsnL{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t3);font-weight:600;margin-bottom:10px;}
  .an-rsn{font-size:12px;color:var(--t2);padding:8px 0 8px 13px;border-left:2px solid var(--ln2);margin-bottom:7px;line-height:1.45;}
  .an-toggles{display:flex;background:var(--pn2);border:1px solid var(--ln);border-radius:8px;padding:3px;gap:2px;}
  .an-toggles button{border:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:600;padding:5px 11px;border-radius:6px;background:transparent;color:var(--t2);transition:.12s;}
  .an-toggles button.on{background:var(--sig);color:#04121a;}
  .an-g2b{display:grid;grid-template-columns:1.35fr 1fr;gap:16px;align-items:start;}
  .an-scroll{scrollbar-width:none;-ms-overflow-style:none;}
  .an-scroll::-webkit-scrollbar{width:0;height:0;display:none;}
  .an-st{font-size:10px;letter-spacing:.5px;text-transform:uppercase;font-weight:600;padding:3px 8px;border-radius:5px;display:inline-flex;align-items:center;gap:5px;}
  .an-st i{width:5px;height:5px;border-radius:50%;}
  .an-legend{display:flex;gap:18px;padding:10px 18px;border-top:1px solid var(--ln);font-size:11px;color:var(--t2);flex-wrap:wrap;align-items:center;}
  .an-lg{display:flex;align-items:center;gap:7px;}
  .an-lgl{width:16px;height:2px;border-radius:2px;}
  .an-bar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid var(--ln);}
  .an-lbl{font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--t3);font-weight:600;}
  .an-mbtn{border:1px solid var(--ln2);cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:600;padding:6px 11px;border-radius:7px;background:var(--pn2);color:var(--t2);transition:.12s;display:inline-flex;align-items:center;gap:6px;}
  .an-mbtn:hover{color:var(--tx);border-color:var(--sig);}
  .an-mbtn.on{background:var(--sig);color:#04121a;border-color:var(--sig);}
  .an-mbtn:disabled{cursor:default;}
  .an-kbd{font-family:'JetBrains Mono',monospace;font-size:9.5px;background:var(--pn2);border:1px solid var(--ln2);border-radius:4px;padding:1px 5px;color:var(--t3);}
  `;

  const decTone = { accept: ['var(--ok)', 'var(--okS)'], conditional: ['var(--amber)', 'var(--amberS)'], revize: ['var(--rev, var(--amber))', 'var(--revS, var(--amberS))'], reject: ['var(--bad)', 'var(--badS)'] };
  const decIcon = { accept: 'check', conditional: 'alert', revize: 'refresh', reject: 'x' };
  const decSuffix = { accept: ' — İADE UYGUN', conditional: ' — ŞARTLI KABUL', revize: ' — REVİZE İSTENDİ', reject: ' — İADE REDDİ' };
  const IV_MS = { '10dk': 600000, '30dk': 1800000, '1sa': 3600000, '2sa': 7200000, 'Gün': 86400000 };
  const TARGET_PTS = 900;

  // Görünür pencere [t0,t1] için downsample — bin içindeki en düşük ve en yüksek
  // GERÇEK ölçüm noktası (gerçek zaman + gerçek değer) korunur; pik/dip kaybolmaz.
  // 'Oto' modunda bin boyu görünür süreden hedef nokta sayısına göre seçilir →
  // zoom yapınca çözünürlük otomatik incelir (borsa grafiği davranışı).
  function buildSeries(series, t0, t1, ivKey) {
    if (!series || series.length < 2) return series || [];
    const fil = [];
    for (let i = 0; i < series.length; i++) {
      const p = series[i];
      if (!isFinite(p.t) || !isFinite(p.v)) continue;
      if (p.t >= t0 && p.t <= t1) {
        if (fil.length === 0 && i > 0) fil.push(series[i - 1]); // sol komşu (çizgi kenara değsin)
        fil.push(p);
      } else if (fil.length > 0 && p.t > t1) { fil.push(p); break; } // sağ komşu
    }
    if (fil.length < 2) return fil;
    const span = (t1 - t0) || 1;
    const binMs = ivKey === 'Oto' ? Math.max(span / TARGET_PTS, 1) : IV_MS[ivKey];
    if (!binMs) return fil;
    const bins = new Map();
    for (const p of fil) {
      const k = Math.floor(p.t / binMs);
      let b = bins.get(k);
      if (!b) { bins.set(k, { lo: p, hi: p }); continue; }
      if (p.v < b.lo.v) b.lo = p;
      if (p.v > b.hi.v) b.hi = p;
    }
    const keys = Array.from(bins.keys()).sort((a, b) => a - b);
    const out = [];
    for (const k of keys) {
      const b = bins.get(k);
      if (b.lo === b.hi) { out.push({ t: b.lo.t, v: b.lo.v }); continue; }
      const first = b.lo.t <= b.hi.t ? b.lo : b.hi;
      const second = first === b.lo ? b.hi : b.lo;
      out.push({ t: first.t, v: first.v }, { t: second.t, v: second.v });
    }
    return out.length >= 2 ? out : fil;
  }

  function statusBadge(state) {
    const m = { ok: ['var(--ok)', 'UYGUN'], warn: ['var(--amber)', 'SINIRDA'], bad: ['var(--bad)', 'İHLAL'] }[state];
    return <span className="an-st" style={{ color: m[0], background: 'transparent', padding: 0 }}><i style={{ background: m[0] }} />{m[1]}</span>;
  }

  function CRAnalysis({ theme, onNav = () => {} }) {
    const CRDecisionChart = window.CRDecisionChart;
    const CRChartBrush = window.CRChartBrush;
    const real = (CCStore && CCStore.getScenario()) || null;
    const isDemo = !real;
    const [sc, setSc] = useState(() => localStorage.getItem('cc-scenario') || 'accept');
    const [view, setView] = useState(null);   // {t0,t1} görünür pencere · null = tümü
    const [measure, setMeasure] = useState(false);
    const S = real || CCScenarios[sc];
    const setScenario = k => { setSc(k); localStorage.setItem('cc-scenario', k); };
    const band = [Number(S.lo) || 2, Number(S.hi) || 8];
    const [dc, dbg] = decTone[S.decision] || decTone.conditional;
    const DI = Ic[decIcon[S.decision] || 'alert'] || Ic.alert;

    // Tüm verinin zaman aralığı (zoom/pan kelepçesi + brush ekseni)
    const fullRange = useMemo(() => {
      const s = S.temp || [];
      return s.length ? { t0: s[0].t, t1: s[s.length - 1].t } : null;
    }, [S.temp]);

    // Senaryo/veri değişince görünüm ve modları sıfırla
    useEffect(() => { setView(null); setMeasure(false); }, [S.temp]);

    // Ana grafik: görünür pencere + seçilen granülerlik ile downsample
    const win = view || fullRange || { t0: 0, t1: 1 };
    const chartData = useMemo(
      () => buildSeries(S.temp || [], win.t0, win.t1, 'Oto'),
      [S.temp, win.t0, win.t1]
    );
    // Mini-map: tüm seri, kaba Oto downsample
    const brushData = useMemo(() => {
      const s = S.temp || [];
      return fullRange ? buildSeries(s, fullRange.t0, fullRange.t1, 'Oto') : s;
    }, [S.temp, fullRange]);
    const chartGaps = S.gaps || [];

    // Geriye Dönük 24h MKT kontrolü (istisnasız — 2-8 dışı her sapma için)
    const retro = useMemo(() => (window.CCRetro ? window.CCRetro(S) : null), [S]);

    const rows = [
      ['MKT (Ortalama Kinetik)', S.mkt.toFixed(2) + '°C', band[0] + '–' + band[1] + '°C', S.mkt >= band[0] && S.mkt <= band[1] ? 'ok' : 'bad'],
      ['Minimum Sıcaklık', S.min.toFixed(2) + '°C', '≥ ' + band[0] + '°C', S.min < 0 ? 'bad' : S.min < band[0] ? 'warn' : 'ok'],
      ['Maksimum Sıcaklık', S.max.toFixed(2) + '°C', '≤ ' + band[1] + '°C', S.max > band[1] + 7 ? 'bad' : S.max > band[1] ? 'warn' : 'ok'],
      ['Ortalama Sıcaklık', S.mean.toFixed(2) + '°C', band[0] + '–' + band[1] + '°C', S.mean >= band[0] && S.mean <= band[1] ? 'ok' : 'warn'],
      ['Sapma Sayısı', String(S.excCount), '0', S.excCount === 0 ? 'ok' : S.decision === 'reject' ? 'bad' : 'warn'],
      ['TOR (Buzdolabı Dışı)', S.torUsed + ' dk', '≤ ' + S.torLimit + ' dk', S.torUsed > S.torLimit ? 'bad' : 'ok'],
    ];

    return (
      <CRShell theme={theme} active="analysis" onNav={onNav}>
        <style>{AN_CSS}</style>
        <div className="cr-hr">
          <div><div className="cr-h1">Analiz & Karar</div><div className="cr-h1sub">{S.pharmacy} · {S.drug} · cihaz {S.serial}</div></div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {isDemo ? (
              <React.Fragment>
                <span className="cr-chip" style={{ color: 'var(--amber)', background: 'var(--amberS)', borderColor: 'var(--amber)' }}>DEMO VERİSİ</span>
                <div className="an-seg">
                  {CCScenarios.order.map(k => { const t = CCScenarios[k]; const [c] = decTone[k]; const on = k === sc; return (
                    <button key={k} className={on ? 'on' : ''} style={on ? { background: c } : null} onClick={() => setScenario(k)}><i style={{ background: on ? '#04121a' : c }} />{t.label}</button>); })}
                </div>
              </React.Fragment>
            ) : (
              <span className="cr-chip" style={{ color: 'var(--ok)', background: 'var(--okS)', borderColor: 'var(--ok)' }}>● GERÇEK ANALİZ</span>
            )}
            <button className="cr-btn cr-btn2" style={{ padding: '9px 13px' }} onClick={() => onNav('report')}><Ic.report size={15} /> Rapor</button>
          </div>
        </div>

        <div className="an-steps">
          {['Veri Yükleme', 'Veri Çıkarma', 'MKT Hesaplama', 'Karar'].map((l, i, arr) => (
            <React.Fragment key={l}>
              <div className="an-step"><span className="an-stepN"><Ic.check size={13} sw={3} /></span><span className="an-stepL">{l}</span></div>
              {i < arr.length - 1 && <div className="an-conn" />}
            </React.Fragment>
          ))}
        </div>

        <div className="an-g2">
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.thermo size={15} style={{ color: 'var(--sig)' }} /> ORTALAMA KİNETİK SICAKLIK</div></div>
            <div className="an-mkt">
              <div className="an-mktV cr-m" style={{ color: S.mkt > band[1] ? 'var(--bad)' : 'var(--sig)' }}>{S.mkt.toFixed(2)}</div>
              <div className="an-mktU">°C · MKT</div>
              <div className="an-mktStrip cr-m">
                {[['MİN', S.min.toFixed(1), 'var(--sig)'], ['ORT', S.mean.toFixed(1), 'var(--tx)'], ['MAKS', S.max.toFixed(1), S.max > 8 ? 'var(--bad)' : 'var(--tx)']].map(([l, v, c]) => (
                  <div key={l} className="an-mktSc"><div className="an-mktScL" style={{ fontFamily: "'Space Grotesk'" }}>{l}</div><div className="an-mktScV" style={{ color: c }}>{v}°</div></div>))}
              </div>
              <div className="an-formula">T_mk = (ΔH/R) ÷ (−ln(Σ e^(−ΔH/RTᵢ) / n))</div>
            </div>
          </div>

          <div className="cr-pn">
            <div className="an-decHead">
              <div className="an-decIc" style={{ color: dc, background: dbg }}><DI size={24} sw={2.4} /></div>
              <div style={{ flex: 1 }}>
                <div className="an-decBig" style={{ color: dc }}>{S.label}{decSuffix[S.decision] || ''}</div>
                <div className="an-decConf">Yapay zeka karar önerisi · <b className="cr-m" style={{ color: dc }}>%{S.conf}</b> güven</div>
              </div>
            </div>
            <div className="an-decBody">
              <div className="an-decSum">{S.summary}</div>
              <div className="an-rsnL">Değerlendirme Kriterleri</div>
              {S.reasons.map((r, i) => <div key={i} className="an-rsn" style={{ borderLeftColor: dc }}>{r}</div>)}
            </div>
          </div>
        </div>

        <div className="cr-pn" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div className="cr-ph">
            <div className="cr-pt"><Ic.activity size={15} style={{ color: 'var(--sig)' }} /> SICAKLIK GRAFİĞİ</div>
            <span className="cr-chip cr-m">{S.points.toLocaleString('tr-TR')} ölçüm · {chartData.length.toLocaleString('tr-TR')} nokta</span>
          </div>
          <div className="an-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginLeft: 'auto' }}>
              <button className={'an-mbtn' + (measure ? ' on' : '')} onClick={() => setMeasure(v => !v)} title="Aralık seç → MKT, maks, min"><Ic.activity size={13} /> Ölç</button>
              <button className="an-mbtn" onClick={() => setView(null)} disabled={!view} style={!view ? { opacity: .45 } : null} title="Tüm aralığa dön"><Ic.refresh size={13} /> Sıfırla</button>
            </div>
          </div>
          <div style={{ padding: '14px 18px 2px' }}>
            <CRDecisionChart data={chartData} gaps={chartGaps} mkt={S.mkt} band={band} w={1040} h={264} theme={theme}
              color={S.decision === 'reject' ? 'var(--bad)' : 'var(--sig)'}
              view={view || fullRange} fullRange={fullRange}
              onViewChange={(t0, t1) => setView({ t0, t1 })}
              measure={measure} onExitMeasure={() => setMeasure(false)} />
          </div>
          {CRChartBrush && fullRange && brushData && brushData.length > 1 && (
            <div style={{ padding: '0 18px 12px' }}>
              <CRChartBrush data={brushData} band={band} theme={theme} w={1040} h={50}
                color={S.decision === 'reject' ? 'var(--bad)' : 'var(--sig)'}
                view={view || fullRange} fullRange={fullRange}
                onViewChange={(t0, t1) => setView({ t0, t1 })} />
            </div>
          )}
          <div className="an-legend">
            <div className="an-lg"><span className="an-lgl" style={{ background: S.decision === 'reject' ? 'var(--bad)' : 'var(--sig)' }} /> Ölçülen sıcaklık</div>
            <div className="an-lg"><span className="an-lgl" style={{ background: 'var(--ok)', opacity: .5, borderTop: '2px dashed var(--ok)' }} /> Güvenli bant {band[0]}–{band[1]}°C</div>
            <div className="an-lg"><span className="an-lgl" style={{ background: 'var(--bad)' }} /> Sapma / pik</div>
            <div className="an-lg"><span className="an-lgl" style={{ height: 10, width: 18, background: 'repeating-linear-gradient(135deg, var(--t2) 0 2px, transparent 2px 5px)', border: '1px dashed var(--t2)', opacity: .75 }} /> Veri kaybı{chartGaps && chartGaps.length ? ' · ' + chartGaps.length : ''}</div>
            <div className="an-lg" style={{ marginLeft: 'auto', color: 'var(--t3)', gap: 5 }}>
              <span className="an-kbd">tekerlek</span> yakınlaş · <span className="an-kbd">sürükle</span> kaydır · <span className="an-kbd">çift tık</span> sıfırla · <span className="an-kbd">← →</span> <span className="an-kbd">+ −</span>
            </div>
          </div>
        </div>

        <div className="an-g2b">
          <div className="cr-pn" style={{ overflow: 'hidden' }}>
            <div className="cr-ph"><div className="cr-pt">ÖZET KARAR TABLOSU</div></div>
            <table className="cr-t">
              <thead><tr>{['Parametre', 'Ölçülen', 'Limit', 'Durum'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td style={{ color: 'var(--t2)' }}>{r[0]}</td>
                    <td className="cr-m" style={{ fontWeight: 600 }}>{r[1]}</td>
                    <td className="cr-m" style={{ color: 'var(--t3)' }}>{r[2]}</td>
                    <td>{statusBadge(r[3])}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>

          <div className="cr-pn" style={{ overflow: 'hidden' }}>
            <div className="cr-ph"><div className="cr-pt">SAPMA DETAYLARI</div><span className="cr-up" style={{ color: S.excCount ? 'var(--amber)' : 'var(--ok)' }}>{S.excCount} SAPMA</span></div>
            {S.excursions.length === 0 ? (
              <div style={{ padding: '34px 20px', textAlign: 'center', color: 'var(--t2)', fontSize: 12.5 }}>Sapma tespit edilmedi — cihaz tüm süre boyunca banttaydı.</div>
            ) : (
              <div className="an-scroll" style={{ maxHeight: 286, overflowY: 'auto' }}>
                <table className="cr-t">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--pn)' }}><tr>{['#', 'Başlangıç', 'Süre', 'Tür', 'Pik'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {S.excursions.map((e, i) => (
                      <tr key={i} style={{ cursor: 'default' }}>
                        <td className="cr-m" style={{ color: 'var(--t3)' }}>{i + 1}</td>
                        <td className="cr-m" style={{ color: 'var(--t2)' }}>{e.start}</td>
                        <td className="cr-m" style={{ fontWeight: 600 }}>{e.dur}</td>
                        <td><span className="an-st" style={{ color: 'var(--amber)', background: 'var(--amberS)' }}><i style={{ background: 'var(--amber)' }} />Yüksek</span></td>
                        <td className="cr-m" style={{ fontWeight: 600, color: e.peak > 15 ? 'var(--bad)' : 'var(--amber)' }}>{e.peak.toFixed(1)}°</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {retro && (
          <div className="cr-pn" style={{ marginTop: 16, overflow: 'hidden' }}>
            <div className="cr-ph">
              <div className="cr-pt"><Ic.thermo size={15} style={{ color: 'var(--sig)' }} /> MKT KONTROL (GERİYE DÖNÜK)</div>
              <span className="cr-up" style={{ color: retro.hasProblem ? 'var(--bad)' : 'var(--ok)' }}>
                {retro.hasProblem ? retro.problemCount + ' HATALI ARALIK' : 'SORUN BULUNAMADI'}
              </span>
            </div>
            {!retro.triggered ? (
              <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Ic.check size={20} style={{ color: 'var(--ok)' }} />
                <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
                  <b style={{ color: 'var(--ok)' }}>Sorun bulunamadı</b> — sıcaklık hiçbir noktada {retro.lo}–{retro.hi}°C aralığının dışına çıkmadı; geriye dönük 24 saatlik MKT kontrolü gerekmedi.
                </div>
              </div>
            ) : !retro.hasProblem ? (
              <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Ic.check size={20} style={{ color: 'var(--ok)' }} />
                <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
                  <b style={{ color: 'var(--ok)' }}>Sorun bulunamadı</b> — tespit edilen {retro.excursionCount} sapma için düzelme anından geriye 24 saatlik MKT hesaplandı ve tümü {retro.lo}–{retro.hi}°C aralığında kaldı.
                </div>
              </div>
            ) : (
              <table className="cr-t">
                <thead><tr>{['Sapma', 'Geriye Dönük 24 Saatlik Aralık', '24h MKT', 'Durum'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {retro.windows.map((w, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td><span className="an-st" style={{ color: w.type === 'high' ? 'var(--amber)' : 'var(--sig)', background: 'transparent', padding: 0 }}><i style={{ background: w.type === 'high' ? 'var(--amber)' : 'var(--sig)' }} />{w.type === 'high' ? 'Yüksek' : 'Düşük'} {w.peak}°</span></td>
                      <td className="cr-m" style={{ color: 'var(--t2)' }}>{w.range}</td>
                      <td className="cr-m" style={{ fontWeight: 600, color: w.isOk ? 'var(--tx)' : 'var(--bad)' }}>{w.mkt24h != null ? w.mkt24h + '°C' : '—'}</td>
                      <td>{statusBadge(w.isOk ? 'ok' : 'bad')}</td>
                    </tr>))}
                </tbody>
              </table>
            )}
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--ln)', fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
              <b>Yöntem:</b> Sıcaklık {retro.lo}–{retro.hi}°C aralığının dışına <b>her çıktığında (istisnasız)</b>, sapmanın düzeldiği andan geriye doğru 24 saatlik MKT hesaplanır. Bu pencerenin MKT'si {retro.lo}–{retro.hi}°C dışındaysa ilgili aralık hatalı olarak bildirilir.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button className="cr-btn" onClick={() => onNav('report')}><Ic.report size={15} /> RAPOR OLUŞTUR</button>
          <button className="cr-btn cr-btn2" onClick={() => onNav('upload')}><Ic.upload size={15} /> Yeni Analiz</button>
        </div>
      </CRShell>
    );
  }

  window.CRAnalysis = CRAnalysis;
})();
