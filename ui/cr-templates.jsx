/* Şablon Hafızası sayfası (Faz 4) — öğrenilen format şablonlarını listele/sil.
   Sistem her marka/varyantı bir kez öğrenir; yanlış onaylanmış bir şablon
   buradan silinir (silme hash-zincirli audit log'a yazılır, sunucu tarafında). */
(function () {
  const { useState, useEffect } = React;
  const { CCIcons: Ic, CRShell } = window;

  const TPL_CSS = `
  .tp-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .tp-tbl th{text-align:left;color:var(--t3);padding:9px 14px;border-bottom:1px solid var(--ln2);font-size:10px;text-transform:uppercase;letter-spacing:.5px;background:var(--pn2);white-space:nowrap;}
  .tp-tbl td{padding:10px 14px;border-bottom:1px solid var(--ln);color:var(--t2);vertical-align:top;}
  .tp-tbl tr:last-child td{border-bottom:none;}
  .tp-brand{font-weight:700;color:var(--tx);font-size:12.5px;}
  .tp-kind{font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;font-weight:700;padding:2px 7px;border-radius:5px;border:1px solid var(--ln2);background:var(--pn2);color:var(--t2);}
  .tp-kind.pdf{color:var(--bad);border-color:var(--bad);}
  .tp-kind.tabular{color:var(--ok);border-color:var(--ok);}
  .tp-src{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t3);}
  .tp-fp{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t3);}
  .tp-use{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--sig);}
  .tp-schema{font-size:10.5px;font-family:'JetBrains Mono',monospace;color:var(--t2);line-height:1.5;}
  .tp-del{width:28px;height:28px;border-radius:7px;border:1px solid var(--ln2);background:transparent;display:grid;place-items:center;color:var(--t3);cursor:pointer;transition:.13s;}
  .tp-del:hover{color:var(--bad);border-color:var(--bad);}
  .tp-del.arm{color:#fff;background:var(--bad);border-color:var(--bad);width:auto;padding:0 10px;font-size:10.5px;font-weight:700;gap:5px;display:inline-flex;align-items:center;height:28px;}
  .tp-empty{padding:54px 24px;text-align:center;color:var(--t3);font-size:12.5px;line-height:1.7;}
  .tp-stats{display:flex;gap:10px;flex-wrap:wrap;}
  .tp-stat{background:var(--pn);border:1px solid var(--ln2);border-radius:10px;padding:12px 16px;min-width:140px;}
  .tp-statV{font-size:20px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--tx);}
  .tp-statL{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:3px;font-weight:700;}
  `;

  function schemaSummary(t) {
    const s = t.schema || {};
    if (t.kind === 'tabular') {
      const parts = [`Tarih: ${s.dateCol || '—'}`, `Sıcaklık: ${s.tempCol || '—'}`];
      if (s.timeCol) parts.splice(1, 0, `Saat: ${s.timeCol}`);
      if (s.humidityCol) parts.push(`Nem: ${s.humidityCol}`);
      return parts.join(' · ');
    }
    return `${(s.dateOrder || 'dmy').toUpperCase()} düzeni · "${s.dateSep || '.'}" ayraç · ondalık "${s.decimalSep || ','}" · sıcaklık sütunu ${s.tempColIndex ?? 0}`;
  }

  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(String(v).replace(' ', 'T') + (String(v).includes('Z') ? '' : 'Z'));
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function CRTemplates({ theme, onNav = () => {} }) {
    const [rows, setRows] = useState(null);   // null = yükleniyor
    const [error, setError] = useState(null);
    const [armed, setArmed] = useState(null); // iki aşamalı silme: ilk tık kurar, ikinci tık siler
    const [busy, setBusy] = useState(false);

    const load = async () => {
      setError(null);
      try {
        const r = await fetch('/api/templates');
        const j = await r.json();
        if (!j.success) throw new Error(j.error || 'Şablonlar alınamadı.');
        setRows(j.data || []);
      } catch (e) {
        setError(e.message + ' — sunucunun (npm start) çalıştığından emin olun.');
        setRows([]);
      }
    };
    useEffect(() => { load(); }, []);
    // Kurulu silme düğmesi 4 sn içinde onaylanmazsa kendini sıfırlar
    useEffect(() => {
      if (armed === null) return;
      const t = setTimeout(() => setArmed(null), 4000);
      return () => clearTimeout(t);
    }, [armed]);

    const del = async (t) => {
      if (armed !== t.id) { setArmed(t.id); return; }
      setArmed(null); setBusy(true);
      try {
        const r = await fetch('/api/templates/' + t.id, { method: 'DELETE' });
        const j = await r.json();
        if (!j.success) throw new Error(j.error || 'Silme başarısız.');
        setRows(rs => (rs || []).filter(x => x.id !== t.id));
      } catch (e) {
        setError(e.message);
      }
      setBusy(false);
    };

    const list = rows || [];
    const totalUse = list.reduce((s, t) => s + (t.useCount || 0), 0);
    const pdfCount = list.filter(t => t.kind === 'pdf').length;

    return (
      <CRShell theme={theme} active="templates" onNav={onNav}>
        <style>{TPL_CSS}</style>
        <div className="cr-hr">
          <div>
            <div className="cr-h1">Şablon Hafızası</div>
            <div className="cr-h1sub">Öğrenilen format şablonları — her marka/varyant bir kez öğrenilir, sonraki belgeler AI'sız çözülür</div>
          </div>
          <button className="cr-btn cr-btn2" onClick={load} disabled={busy}><Ic.refresh size={14} /> YENİLE</button>
        </div>

        <div className="tp-stats" style={{ marginBottom: 16 }}>
          <div className="tp-stat"><div className="tp-statV">{rows === null ? '…' : list.length}</div><div className="tp-statL">Kayıtlı şablon</div></div>
          <div className="tp-stat"><div className="tp-statV">{rows === null ? '…' : totalUse}</div><div className="tp-statL">Toplam eşleşme (AI'sız parse)</div></div>
          <div className="tp-stat"><div className="tp-statV">{rows === null ? '…' : pdfCount + ' / ' + (list.length - pdfCount)}</div><div className="tp-statL">PDF / Excel-CSV</div></div>
        </div>

        {error && (
          <div className="cr-pn" style={{ padding: '13px 16px', marginBottom: 14, borderColor: 'var(--bad)', color: 'var(--bad)', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Ic.alert size={16} /> {error}
          </div>
        )}

        <div className="cr-pn" style={{ overflow: 'hidden' }}>
          <div className="cr-ph"><div className="cr-pt"><Ic.box size={15} style={{ color: 'var(--sig)' }} /> ÖĞRENİLEN FORMATLAR</div></div>
          {rows === null ? (
            <div className="tp-empty">Yükleniyor…</div>
          ) : list.length === 0 ? (
            <div className="tp-empty">
              Henüz öğrenilmiş şablon yok.<br />
              İlk analiz tamamlandığında (veya onay ekranında "formatı hatırla" işaretli kaldığında) şablonlar burada birikir;
              aynı düzendeki sonraki belgeler AI maliyeti olmadan anında çözülür.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tp-tbl">
                <thead>
                  <tr>
                    <th>Marka</th><th>Tür</th><th>Şema</th><th>Kaynak</th>
                    <th style={{ textAlign: 'right' }}>Kullanım</th><th>Öğrenildi</th><th>Son Kullanım</th><th>Parmak İzi</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(t => (
                    <tr key={t.id}>
                      <td><span className="tp-brand">{t.brand || 'Etiketsiz'}</span></td>
                      <td><span className={'tp-kind ' + t.kind}>{t.kind === 'tabular' ? 'Excel/CSV' : 'PDF'}</span></td>
                      <td><span className="tp-schema">{schemaSummary(t)}</span></td>
                      <td><span className="tp-src">{t.source || '—'}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="tp-use">{t.useCount || 0}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.lastUsedAt)}</td>
                      <td><span className="tp-fp" title={t.fingerprint}>{String(t.fingerprint).slice(0, 10)}…</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {armed === t.id ? (
                          <button className="tp-del arm" onClick={() => del(t)} disabled={busy}><Ic.alert size={12} sw={2.4} /> EMİN MİSİNİZ?</button>
                        ) : (
                          <button className="tp-del" title="Şablonu sil (audit kaydına yazılır)" onClick={() => del(t)} disabled={busy}><Ic.x size={13} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6, marginTop: 12 }}>
          Silme işlemi geri alınamaz ve hash-zincirli denetim kaydına (audit log) yazılır.
          Silinen format, bir sonraki belgede yeniden öğrenilir (AI şema keşfi + gerekiyorsa insan onayı).
        </div>
      </CRShell>
    );
  }

  window.CRTemplates = CRTemplates;
})();
