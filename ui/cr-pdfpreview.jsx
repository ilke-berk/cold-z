/* Belge Önizleme & Akıllı Ayrıştırma — PDF kaynak ↔ çıkarılan veri eşlemesi */
(function () {
  const { useState } = React;
  const { CCIcons: Ic } = window;

  const DP_CSS = `
  .dp-ov{position:absolute;inset:0;background:rgba(4,8,14,.74);backdrop-filter:blur(6px);z-index:60;display:flex;align-items:center;justify-content:center;padding:34px;}
  body[data-app-theme=light] .dp-ov{background:rgba(20,40,70,.42);}
  .dp-box{width:100%;max-width:1120px;height:100%;max-height:780px;background:var(--pn);border:1px solid var(--ln2);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55);}
  .dp-hd{display:flex;align-items:center;gap:14px;padding:15px 20px;border-bottom:1px solid var(--ln2);flex-shrink:0;}
  .dp-hdic{width:38px;height:38px;border-radius:10px;background:var(--sigS);color:var(--sig);display:grid;place-items:center;flex-shrink:0;}
  .dp-hdt{font-size:14.5px;font-weight:700;white-space:nowrap;}
  .dp-hds{font-size:11px;color:var(--t2);margin-top:2px;font-family:'JetBrains Mono',monospace;white-space:nowrap;}
  .dp-leg{display:flex;gap:14px;margin-left:auto;align-items:center;}
  .dp-lg{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--t2);}
  .dp-lgd{width:11px;height:11px;border-radius:3px;}
  .dp-cl{width:34px;height:34px;border:1px solid var(--ln2);border-radius:8px;background:var(--pn2);display:grid;place-items:center;cursor:pointer;color:var(--t2);flex-shrink:0;}
  .dp-cl:hover{color:var(--bad);border-color:var(--bad);}
  .dp-body{flex:1;display:grid;grid-template-columns:1fr 1fr;min-height:0;}
  .dp-col{display:flex;flex-direction:column;min-height:0;}
  .dp-col+.dp-col{border-left:1px solid var(--ln2);}
  .dp-coltop{display:flex;align-items:center;justify-content:space-between;padding:11px 18px;border-bottom:1px solid var(--ln);flex-shrink:0;}
  .dp-coltt{font-size:10px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:var(--t2);display:flex;align-items:center;gap:8px;white-space:nowrap;}
  .dp-scroll{flex:1;overflow-y:auto;padding:18px;}

  /* sol: kağıt belge */
  .dp-paper{background:#fbfcfd;border:1px solid #e2e7ee;border-radius:7px;padding:22px 22px 26px;color:#1a2536;font-family:'Space Grotesk',sans-serif;box-shadow:0 2px 14px rgba(0,0,0,.18);}
  .dp-php{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a2536;padding-bottom:12px;margin-bottom:14px;}
  .dp-brand{display:flex;align-items:center;gap:9px;}
  .dp-brandmk{width:30px;height:30px;border-radius:6px;background:#1a2536;color:#fff;display:grid;place-items:center;font-weight:800;font-size:13px;font-family:'JetBrains Mono',monospace;}
  .dp-brandt{font-size:13px;font-weight:800;letter-spacing:.3px;}
  .dp-brands{font-size:9px;color:#6b7689;letter-spacing:1px;text-transform:uppercase;}
  .dp-docmeta{text-align:right;font-size:9.5px;color:#6b7689;font-family:'JetBrains Mono',monospace;line-height:1.7;}
  .dp-metag{display:grid;grid-template-columns:1fr 1fr;gap:7px 18px;margin-bottom:16px;}
  .dp-mrow{display:flex;justify-content:space-between;font-size:10.5px;border-bottom:1px dotted #d2d9e2;padding-bottom:4px;}
  .dp-mk{color:#6b7689;}
  .dp-mv{font-weight:600;font-family:'JetBrains Mono',monospace;color:#1a2536;}
  .dp-tt{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#1a2536;margin-bottom:7px;display:flex;align-items:center;gap:7px;}
  .dp-tt::after{content:'';flex:1;height:1px;background:#e2e7ee;}
  table.dp-tb{width:100%;border-collapse:collapse;font-family:'JetBrains Mono',monospace;font-size:10.5px;}
  .dp-tb th{text-align:left;font-size:8.5px;letter-spacing:.6px;text-transform:uppercase;color:#8390a2;font-weight:700;padding:5px 8px;border-bottom:1.5px solid #cfd6e0;position:relative;}
  .dp-tb th.det{color:#0d5e7e;}
  .dp-tag{display:inline-block;margin-left:6px;font-size:7px;letter-spacing:.5px;padding:1px 4px;border-radius:3px;vertical-align:middle;font-weight:800;}
  .dp-tb td{padding:5px 8px;border-bottom:1px solid #eef1f5;color:#2a3547;}
  .dp-tb tr{transition:background .1s;}
  .dp-tb tr.on{background:#dff0f7;}
  .dp-tb tr.dup{color:#aab3c0;}
  .dp-tb tr.dup .dp-c2{text-decoration:line-through;}
  .dp-cell-date.det{background:rgba(15,129,168,.10);}
  .dp-cell-temp.det{background:rgba(226,164,62,.13);font-weight:700;}
  .dp-over{color:#c0392b !important;font-weight:800;}
  .dp-flag{font-size:7.5px;font-weight:800;letter-spacing:.4px;padding:1px 5px;border-radius:3px;}

  /* sağ: çıkarım */
  .dp-schema{background:var(--pn2);border:1px solid var(--ln);border-radius:10px;padding:14px;margin-bottom:14px;}
  .dp-schemaT{font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:var(--t2);margin-bottom:12px;display:flex;align-items:center;gap:8px;white-space:nowrap;}
  .dp-chips{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .dp-chip{background:var(--pn);border:1px solid var(--ln2);border-radius:7px;padding:8px 10px;}
  .dp-chipL{font-size:8.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--t3);font-weight:600;white-space:nowrap;}
  .dp-chipV{font-size:12px;font-weight:600;margin-top:3px;font-family:'JetBrains Mono',monospace;color:var(--tx);display:flex;align-items:center;gap:6px;}
  .dp-conf{display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--ln);}
  .dp-conftrack{flex:1;height:6px;border-radius:4px;background:var(--pn);border:1px solid var(--ln2);overflow:hidden;}
  .dp-conffill{height:100%;background:linear-gradient(90deg,var(--sig),var(--ok));border-radius:4px;}
  .dp-rows{display:flex;flex-direction:column;}
  .dp-rowsT{font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:var(--t2);margin-bottom:9px;display:flex;align-items:center;justify-content:space-between;white-space:nowrap;}
  .dp-pr{display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:8px;border:1px solid transparent;transition:.1s;cursor:default;}
  .dp-pr.on{background:var(--sigS);border-color:var(--sig);}
  .dp-pr.dup{opacity:.5;}
  .dp-pric{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;flex-shrink:0;}
  .dp-prdate{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--t2);width:118px;flex-shrink:0;}
  .dp-prtemp{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;width:58px;flex-shrink:0;}
  .dp-prst{margin-left:auto;font-size:9px;letter-spacing:.5px;font-weight:700;padding:2px 7px;border-radius:5px;}
  .dp-foot{flex-shrink:0;border-top:1px solid var(--ln2);padding:13px 18px;display:flex;align-items:center;gap:14px;background:var(--pn2);}
  .dp-fstat{display:flex;flex-direction:column;}
  .dp-fstatV{font-size:16px;font-weight:700;font-family:'JetBrains Mono',monospace;}
  .dp-fstatL{font-size:9.5px;color:var(--t2);letter-spacing:.4px;}
  `;

  // 08:00'dan başlayıp 30 dk aralıklı; index 4 yinelenen, 7-9 sapma
  const ROWS = [
    { t: '05.06.2026 08:00', temp: 4.6, rh: 41 },
    { t: '05.06.2026 08:30', temp: 4.9, rh: 42 },
    { t: '05.06.2026 09:00', temp: 5.1, rh: 40 },
    { t: '05.06.2026 09:30', temp: 5.0, rh: 41 },
    { t: '05.06.2026 09:30', temp: 5.0, rh: 41, dup: true },
    { t: '05.06.2026 10:00', temp: 5.3, rh: 43 },
    { t: '05.06.2026 10:30', temp: 6.2, rh: 44 },
    { t: '05.06.2026 11:00', temp: 7.8, rh: 47 },
    { t: '05.06.2026 11:30', temp: 8.41, rh: 49, over: true },
    { t: '05.06.2026 12:00', temp: 7.1, rh: 46 },
    { t: '05.06.2026 12:30', temp: 5.6, rh: 43 },
    { t: '05.06.2026 13:00', temp: 5.0, rh: 41 },
    { t: '05.06.2026 13:30', temp: 4.7, rh: 40 },
    { t: '05.06.2026 14:00', temp: 4.8, rh: 41 },
  ];

  function CRDocPreview({ theme = 'dark', file, onClose = () => {} }) {
    const [hov, setHov] = useState(null);
    const fname = (file && file.name) || 'Elitech_RC5_TZ-4471-A.pdf';

    return (
      <div className="dp-ov" onMouseDown={onClose}>
        <style>{DP_CSS}</style>
        <div className="dp-box" onMouseDown={e => e.stopPropagation()}>
          <div className="dp-hd">
            <div className="dp-hdic"><Ic.eye size={19} /></div>
            <div>
              <div className="dp-hdt">Belge Önizleme & Akıllı Ayrıştırma</div>
              <div className="dp-hds">{fname}</div>
            </div>
            <div className="dp-leg">
              <div className="dp-lg"><span className="dp-lgd" style={{ background: 'rgba(15,129,168,.45)' }} /> Tarih kolonu</div>
              <div className="dp-lg"><span className="dp-lgd" style={{ background: 'rgba(226,164,62,.5)' }} /> Sıcaklık kolonu</div>
              <div className="dp-lg"><span className="dp-lgd" style={{ background: 'var(--bad)' }} /> Bant aşımı</div>
            </div>
            <div className="dp-cl" onClick={onClose}><Ic.x size={17} /></div>
          </div>

          <div className="dp-body">
            {/* SOL — kaynak belge */}
            <div className="dp-col">
              <div className="dp-coltop">
                <div className="dp-coltt"><Ic.report size={14} /> Kaynak Belge (PDF)</div>
                <span className="cr-chip cr-m" style={{ fontSize: 10 }}>1 / 1 sayfa</span>
              </div>
              <div className="dp-scroll">
                <div className="dp-paper">
                  <div className="dp-php">
                    <div className="dp-brand">
                      <div className="dp-brandmk">EL</div>
                      <div><div className="dp-brandt">Elitech RC-5</div><div className="dp-brands">Data Logger Report</div></div>
                    </div>
                    <div className="dp-docmeta">Rapor No: RC5-240605<br />Oluşturma: 05.06.2026 14:05<br />Yazılım: ElitechLog v6.2</div>
                  </div>

                  <div className="dp-metag">
                    {[['Cihaz Seri', 'TZ-4471-A'], ['Model', 'RC-5 +'], ['Başlangıç', '05.06 08:00'], ['Bitiş', '05.06 14:00'],
                      ['Kayıt Aralığı', '30 dk'], ['Toplam Kayıt', '1.440']].map(([k, v]) => (
                      <div key={k} className="dp-mrow"><span className="dp-mk">{k}</span><span className="dp-mv">{v}</span></div>))}
                  </div>

                  <div className="dp-tt">Sıcaklık Kayıt Tablosu</div>
                  <table className="dp-tb">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th className="det">Zaman Damgası<span className="dp-tag" style={{ background: 'rgba(15,129,168,.15)', color: '#0d5e7e' }}>TARİH</span></th>
                        <th className="det">Sıcaklık<span className="dp-tag" style={{ background: 'rgba(226,164,62,.2)', color: '#9a6a10' }}>°C</span></th>
                        <th>Nem %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROWS.map((r, i) => (
                        <tr key={i} className={(hov === i ? 'on ' : '') + (r.dup ? 'dup' : '')}
                          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
                          <td style={{ color: '#9aa4b3' }}>{r.dup ? '–' : String(i < 4 ? i + 1 : i).padStart(2, '0')}</td>
                          <td className="dp-c1 dp-cell-date det">{r.t}</td>
                          <td className={'dp-c2 dp-cell-temp det' + (r.over ? ' dp-over' : '')}>{r.temp.toFixed(1)}</td>
                          <td style={{ color: '#9aa4b3' }}>{r.rh}</td>
                        </tr>))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, fontSize: 9, color: '#9aa4b3', fontFamily: "'JetBrains Mono',monospace", textAlign: 'center' }}>… 1.426 kayıt daha · sayfa sonu …</div>
                </div>
              </div>
            </div>

            {/* SAĞ — çıkarım */}
            <div className="dp-col">
              <div className="dp-coltop">
                <div className="dp-coltt"><Ic.cpu size={14} style={{ color: 'var(--sig)' }} /> Akıllı Ayrıştırma Çıktısı</div>
                <span className="up-smart" style={{ fontSize: 8.5 }}>Smart Hybrid</span>
              </div>
              <div className="dp-scroll">
                <div className="dp-schema">
                  <div className="dp-schemaT"><Ic.cpu size={13} /> Algılanan Şema</div>
                  <div className="dp-chips">
                    {[['Tarih Biçimi', 'DD.MM.YYYY HH:mm'], ['Sütun Ayracı', 'TAB ( \\t )'], ['Sıcaklık Kolonu', '# 3 · °C'], ['Cihaz Markası', 'Elitech RC-5']].map(([k, v]) => (
                      <div key={k} className="dp-chip"><div className="dp-chipL">{k}</div><div className="dp-chipV"><Ic.check size={11} style={{ color: 'var(--ok)' }} />{v}</div></div>))}
                  </div>
                  <div className="dp-conf">
                    <span style={{ fontSize: 10.5, color: 'var(--t2)' }}>Eşleme güveni</span>
                    <div className="dp-conftrack"><div className="dp-conffill" style={{ width: '98%' }} /></div>
                    <b className="cr-m" style={{ fontSize: 12.5, color: 'var(--ok)' }}>%98</b>
                  </div>
                </div>

                <div className="dp-rows">
                  <div className="dp-rowsT"><span>Çıkarılan Kayıtlar</span><span className="cr-m" style={{ color: 'var(--t3)' }}>14 / 1.440 gösteriliyor</span></div>
                  {ROWS.map((r, i) => {
                    const st = r.dup ? ['ATLANDI', 'var(--t3)', 'rgba(125,141,164,.12)']
                      : r.over ? ['SAPMA', 'var(--bad)', 'var(--badS)']
                      : r.temp > 7 ? ['SINIRDA', 'var(--amber)', 'var(--amberS)']
                      : ['BANT İÇİ', 'var(--ok)', 'var(--okS)'];
                    const IcC = r.dup ? Ic.refresh : r.over ? Ic.alert : Ic.check;
                    return (
                      <div key={i} className={'dp-pr' + (hov === i ? ' on' : '') + (r.dup ? ' dup' : '')}
                        onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
                        <div className="dp-pric" style={{ color: st[1], background: st[2] }}><IcC size={13} /></div>
                        <span className="dp-prdate">{r.t.slice(11)} <span style={{ color: 'var(--t3)' }}>{r.t.slice(3, 5)}.{r.t.slice(0, 2)}</span></span>
                        <span className="dp-prtemp" style={{ color: r.over ? 'var(--bad)' : r.temp > 7 ? 'var(--amber)' : 'var(--tx)' }}>{r.temp.toFixed(2)}°</span>
                        <span className="dp-prst" style={{ color: st[1], background: st[2] }}>{st[0]}</span>
                      </div>);
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="dp-foot">
            {[['1.440', 'Okunan satır', 'var(--tx)'], ['1.428', 'Benzersiz kayıt', 'var(--sig)'], ['12', 'Yinelenen (atlandı)', 'var(--amber)'], ['1', 'Sapma penceresi', 'var(--bad)']].map(([v, l, c]) => (
              <div key={l} className="dp-fstat"><span className="dp-fstatV" style={{ color: c }}>{v}</span><span className="dp-fstatL">{l}</span></div>))}
            <button className="cr-btn" style={{ marginLeft: 'auto' }} onClick={onClose}><Ic.check size={15} sw={2.2} /> Ayrıştırmayı Onayla</button>
          </div>
        </div>
      </div>
    );
  }

  window.CRDocPreview = CRDocPreview;
})();
