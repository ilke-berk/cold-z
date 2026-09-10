/* Denetim İzi sayfası — hash-zincirli SQLite audit_log'un Kontrol Odası görünümü.
   Eski arayüzdeki (js/pages/audit.js) sayfanın React'e taşınmış hâli:
   son kayıtlar, tür filtresi, zincir doğrulaması (GET /api/audit/verify) ve
   Excel dışa aktarım. Yeni kayıt burada YAZILMAZ; kayıtlar analiz/şablon/onay
   akışlarında sunucu tarafında üretilir. */
(function () {
  const { useState, useEffect } = React;
  const { CCIcons: Ic, CRShell } = window;

  const AU_CSS = `
  .au-chain{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid var(--ln2);background:var(--pn2);color:var(--t2);margin-top:8px;}
  .au-chain.ok{color:var(--ok);border-color:var(--ok);background:var(--okS);}
  .au-chain.bad{color:var(--bad);border-color:var(--bad);background:var(--badS);}
  .au-filters{display:flex;gap:6px;flex-wrap:wrap;}
  .au-f{padding:6px 11px;border-radius:7px;border:1px solid var(--ln2);background:transparent;color:var(--t2);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;}
  .au-f.on{background:var(--sigS);color:var(--sig);border-color:var(--sig);}
  .au-row{display:grid;grid-template-columns:132px 34px 1fr;gap:14px;padding:14px 16px;border-bottom:1px solid var(--ln);}
  .au-row:last-child{border-bottom:none;}
  .au-d{font-size:12px;font-weight:600;color:var(--tx);font-family:'JetBrains Mono',monospace;}
  .au-t{font-size:10.5px;color:var(--t3);font-family:'JetBrains Mono',monospace;margin-top:2px;}
  .au-ic{width:34px;height:34px;border-radius:50%;border:1px solid var(--ln2);background:var(--pn2);display:grid;place-items:center;color:var(--sig);}
  .au-act{font-size:13px;font-weight:700;color:var(--tx);}
  .au-act.bad{color:var(--bad);} .au-act.ok{color:var(--ok);}
  .au-who{font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;font-weight:700;padding:2px 7px;border-radius:5px;border:1px solid var(--ln2);background:var(--pn2);color:var(--t2);margin-left:8px;}
  .au-det{font-size:12px;color:var(--t2);line-height:1.55;margin-top:4px;white-space:pre-wrap;word-break:break-word;}
  .au-hash{display:inline-flex;gap:10px;align-items:center;margin-top:7px;padding:4px 9px;border-radius:6px;background:var(--pn2);border:1px solid var(--ln);font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t3);max-width:100%;overflow:hidden;}
  .au-hash b{color:var(--t2);font-weight:600;}
  .au-empty{padding:54px 24px;text-align:center;color:var(--t3);font-size:12.5px;line-height:1.7;}
  .au-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
  .au-stat{background:var(--pn);border:1px solid var(--ln2);border-radius:10px;padding:12px 16px;min-width:140px;}
  .au-statV{font-size:20px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--tx);}
  .au-statL{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:3px;font-weight:700;}
  `;

  const TYPES = [[null, 'Tümü'], ['upload', 'Yükleme'], ['analysis', 'Analiz'], ['decision', 'Karar'], ['template', 'Şablon'], ['export', 'Dışa aktarım']];
  const TYPE_ICON = { upload: 'upload', analysis: 'cpu', decision: 'check', template: 'box', export: 'report' };

  function parseTs(v) {
    if (!v) return null;
    const s = String(v);
    const d = new Date(s.includes('T') || s.includes('Z') ? s : s.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? null : d;
  }
  const p2 = n => String(n).padStart(2, '0');
  const fmtD = d => d ? `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}` : '—';
  const fmtT = d => d ? `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` : '';

  function actionTone(a) {
    const s = String(a || '').toUpperCase();
    if (/RED|SİLİNDİ|BOZUK|HATA/.test(s)) return 'bad';
    if (/KABUL|TAMAMLANDI|DOĞRULANDI/.test(s)) return 'ok';
    return '';
  }

  function ChainBadge({ chain }) {
    if (chain === undefined) return <div className="au-chain"><Ic.clock size={13} /> Zincir doğrulanıyor…</div>;
    if (!chain || !chain.success) return <div className="au-chain"><Ic.alert size={13} /> Zincir doğrulaması yapılamadı (sunucu çevrimdışı?)</div>;
    if (chain.ok) return <div className="au-chain ok"><Ic.check size={13} /> Hash zinciri sağlam — {chain.total} kayıt SHA-256 ile doğrulandı</div>;
    return <div className="au-chain bad"><Ic.alert size={13} /> ZİNCİR BOZUK — {chain.broken.length}/{chain.total} kayıtta uyumsuzluk (ilk: #{chain.broken[0] && chain.broken[0].id})</div>;
  }

  function CRAudit({ theme, onNav = () => {} }) {
    const [rows, setRows] = useState(null);     // null = yükleniyor
    const [error, setError] = useState(null);
    const [type, setType] = useState(null);
    const [chain, setChain] = useState(undefined);
    const [busy, setBusy] = useState(false);

    const load = async (t = type) => {
      setError(null); setBusy(true);
      try {
        const u = new URL('/api/audit', location.href);
        u.searchParams.set('limit', '300');
        if (t) u.searchParams.set('type', t);
        const r = await fetch(u);
        const j = await r.json();
        if (!j.success) throw new Error(j.error || 'Denetim kayıtları alınamadı.');
        setRows(j.data || []);
      } catch (e) { setError(e.message); setRows([]); }
      setBusy(false);
    };
    const verify = async () => {
      setChain(undefined);
      try { const r = await fetch('/api/audit/verify'); setChain(await r.json()); }
      catch (e) { setChain({ success: false, error: e.message }); }
    };
    useEffect(() => { load(null); verify(); }, []);
    const pick = t => { setType(t); load(t); };

    const exportExcel = async () => {
      if (typeof XLSX === 'undefined') { setError('Excel kütüphanesi yüklenemedi (çevrimdışı?).'); return; }
      try {
        const r = await fetch('/api/audit?limit=1000');
        const j = await r.json();
        const src = (j.success && j.data) || rows || [];
        const data = src.map(e => ({
          'Tarih': `${fmtD(parseTs(e.created_at))} ${fmtT(parseTs(e.created_at))}`.trim(),
          'Tür': e.type, 'İşlem': e.action, 'Detay': e.details || '', 'Kullanıcı': e.user || '',
          'Hash (SHA-256)': e.hash || '', 'Önceki Hash': e.prev_hash || '',
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Denetim İzi');
        XLSX.writeFile(wb, `DenetimIzi_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (e) { setError('Dışa aktarım başarısız: ' + e.message); }
    };

    const list = rows || [];
    const counts = list.reduce((m, r) => { m[r.type] = (m[r.type] || 0) + 1; return m; }, {});

    return (
      <CRShell theme={theme} active="audit" onNav={onNav}>
        <style>{AU_CSS}</style>
        <div className="cr-hr">
          <div>
            <div className="cr-h1">Denetim İzi</div>
            <div className="cr-h1sub">SHA-256 hash zinciri ile kalıcı SQLite kaydı — bir kaydın değişmesi sonraki tüm hash'leri bozar</div>
            <ChainBadge chain={chain} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cr-btn cr-btn2" onClick={verify}><Ic.shield size={14} /> ZİNCİRİ DOĞRULA</button>
            <button className="cr-btn cr-btn2" onClick={exportExcel} disabled={!list.length}><Ic.save size={14} /> EXCEL</button>
            <button className="cr-btn cr-btn2" onClick={() => load()} disabled={busy}><Ic.refresh size={14} /> YENİLE</button>
          </div>
        </div>

        <div className="au-stats">
          <div className="au-stat"><div className="au-statV">{rows === null ? '…' : list.length}</div><div className="au-statL">Gösterilen kayıt</div></div>
          <div className="au-stat"><div className="au-statV">{rows === null ? '…' : (counts.analysis || 0)}</div><div className="au-statL">Analiz</div></div>
          <div className="au-stat"><div className="au-statV">{rows === null ? '…' : (counts.decision || 0)}</div><div className="au-statL">Karar</div></div>
          <div className="au-stat"><div className="au-statV">{chain && chain.success ? chain.total : '…'}</div><div className="au-statL">Zincirdeki toplam</div></div>
        </div>

        {error && (
          <div className="cr-pn" style={{ padding: '13px 16px', marginBottom: 14, borderColor: 'var(--bad)', color: 'var(--bad)', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Ic.alert size={16} /> {error}
          </div>
        )}

        <div className="cr-pn" style={{ overflow: 'hidden' }}>
          <div className="cr-ph" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="cr-pt"><Ic.shield size={15} style={{ color: 'var(--sig)' }} /> KAYITLAR</div>
            <div className="au-filters">
              {TYPES.map(([k, l]) => <button key={String(k)} className={'au-f' + (k === type ? ' on' : '')} onClick={() => pick(k)}>{l}</button>)}
            </div>
          </div>
          {rows === null ? (
            <div className="au-empty">Yükleniyor…</div>
          ) : list.length === 0 ? (
            <div className="au-empty">Bu filtreye uygun denetim kaydı yok.<br />Analiz, onay, şablon ve dışa aktarım işlemleri burada zincire eklenir.</div>
          ) : list.map(e => {
            const d = parseTs(e.created_at);
            const IcT = Ic[TYPE_ICON[e.type]] || Ic.report;
            const sys = /sistem|ai|motor/i.test(String(e.user || ''));
            return (
              <div key={e.id} className="au-row">
                <div><div className="au-d">{fmtD(d)}</div><div className="au-t">{fmtT(d)} · #{e.id}</div></div>
                <div className="au-ic"><IcT size={15} /></div>
                <div style={{ minWidth: 0 }}>
                  <div><span className={'au-act ' + actionTone(e.action)}>{e.action}</span><span className="au-who">{sys ? 'Sistem' : (e.user || 'Kullanıcı')}</span></div>
                  {e.details && <div className="au-det">{e.details}</div>}
                  <div className="au-hash"><span><b>HASH</b> {e.hash || 'N/A'}</span><span style={{ color: 'var(--ln2)' }}>|</span><span><b>ÖNCEKİ</b> {(e.prev_hash || 'GENESIS').slice(0, 16)}…</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </CRShell>
    );
  }

  window.CRAudit = CRAudit;
})();
