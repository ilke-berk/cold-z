/* Kaynak belge görüntüleyici — rapordan orijinal dosyayı açar ve sapmanın
   belgedeki yerini gösterir (sorumlu "gerçekten orada sapma var mı?" diye bakar).
     • Dijital PDF : sapma aralığındaki satırlar sarı, tepe değer satırı kırmızı vurgulanır; o sayfaya gidilir
     • Excel/CSV   : aralıktaki satırlar tabloda vurgulanır
     • Fotoğraf / taranmış PDF: metin yok → belge açılır, aranan zaman ve tepe değer üstte yazar
   Konum, ayrıştırıcının iç satır numarasına değil belgenin KENDİ metnindeki tarih/saate göre bulunur
   (js/source-locate.js). Dosyalar: bu oturumda yüklenenler bellekten, BexFlow ekleri sunucudan. */
(function () {
  const { useState, useEffect, useRef, useMemo } = React;
  const { CCIcons: Ic } = window;
  const SL = window.SourceLocate;

  // ─── Kaynak dosya kaydı ───
  // Öncelik: bu oturumdaki File nesnesi → kayıtla saklanmış kopya (analysisSourceId) → BexFlow eki
  const registry = new Map();
  window.CCSources = {
    register(list) { registry.clear(); (list || []).forEach(x => { if (x && x.name && x.file) registry.set(x.name, x.file); }); },
    has(src) { return registry.has(src.name) || !!src.bexflowAttachmentId || !!src.analysisSourceId; },
    /** Oturumdaki dosya (kayıt sırasında sunucuya saklamak için) */
    file(src) { return registry.get(src.name) || null; },
    async resolve(src) {
      if (registry.has(src.name)) return registry.get(src.name);
      if (src.analysisSourceId && src.analysisId) {
        const r = await fetch(`/api/analyses/${src.analysisId}/sources/${src.analysisSourceId}/file`);
        if (!r.ok) throw new Error('Saklanan kaynak belge alınamadı (silinmiş olabilir)');
        const b = await r.blob();
        const f = new File([b], src.name, { type: b.type });
        registry.set(src.name, f);
        return f;
      }
      if (src.bexflowAttachmentId) {
        const r = await fetch(`/api/bexflow/attachments/${src.bexflowAttachmentId}/file`);
        if (!r.ok) throw new Error('BexFlow eki alınamadı');
        const b = await r.blob();
        const f = new File([b], src.name, { type: b.type });
        registry.set(src.name, f);
        return f;
      }
      return null;
    },
  };

  const CSS = `
  .sv-ov{position:fixed;inset:0;background:rgba(3,6,10,.86);z-index:600;display:flex;flex-direction:column;padding:18px 22px;gap:12px;}
  .sv-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--pn);border:1px solid var(--ln2);border-radius:12px;padding:10px 14px;}
  .sv-t{font-size:13px;font-weight:700;color:var(--tx);}
  .sv-s{font-size:11.5px;color:var(--t2);}
  .sv-files{display:flex;gap:6px;flex-wrap:wrap;}
  .sv-f{font-size:11px;padding:5px 10px;border-radius:7px;border:1px solid var(--ln2);color:var(--t2);cursor:pointer;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .sv-f.on{border-color:var(--sig);color:var(--sig);background:var(--sigS);}
  .sv-f.hit{border-color:var(--amber);}
  .sv-msg{font-size:12px;padding:8px 12px;border-radius:8px;border:1px solid var(--ln2);background:var(--pn2);color:var(--t2);}
  .sv-msg.ok{border-color:var(--ok);color:var(--ok);background:var(--okS);}
  .sv-msg.warn{border-color:var(--amber);color:var(--amber);background:var(--amberS);}
  .sv-body{flex:1;min-height:0;overflow:auto;background:var(--pn2);border:1px solid var(--ln2);border-radius:12px;padding:16px;display:flex;justify-content:center;align-items:flex-start;}
  .sv-page{position:relative;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.4);}
  .sv-page canvas{display:block;width:100%;height:auto;}
  .sv-hl{position:absolute;background:rgba(255,196,0,.32);border:1.5px solid rgba(230,160,0,.95);border-radius:2px;pointer-events:none;}
  .sv-hl.peak{background:rgba(234,93,107,.28);border-color:#e0283a;border-width:2px;}
  .sv-tbl{border-collapse:collapse;font-family:'JetBrains Mono',monospace;font-size:11.5px;background:#fff;color:#111;}
  .sv-tbl td{border:1px solid #d9dde3;padding:3px 7px;white-space:nowrap;}
  .sv-tbl td.rn{color:#8a93a3;background:#f3f5f8;text-align:right;}
  .sv-tbl tr.hit td{background:#fff1bf;}
  .sv-tbl tr.peak td{background:#ffd1d6;font-weight:700;}
  .sv-img{max-width:100%;height:auto;background:#fff;}
  .sv-pg{display:flex;gap:8px;align-items:center;font-size:11.5px;color:var(--t2);}
  `;

  const IMG = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
  const extOf = (n) => ((String(n || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1] || '').toLowerCase();
  const fmt = (ms) => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  // ─── Belgeyi yükle + metin birimlerini çıkar (dosya başına bir kez) ───
  const docCache = new Map();
  function loadDoc(src) {
    if (docCache.has(src.name)) return docCache.get(src.name);
    const p = (async () => {
      const file = await window.CCSources.resolve(src);
      if (!file) return { kind: 'missing' };
      const ext = extOf(src.name);
      if (IMG.includes(ext)) return { kind: 'image', url: URL.createObjectURL(file), units: [] };
      if (ext === 'pdf') {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const units = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const tc = await page.getTextContent();
          const items = tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) }));
          SL.groupLines(items).forEach(l => units.push({ ...l, page: p }));
        }
        return { kind: 'pdf', pdf, pages: pdf.numPages, units, hasText: units.some(u => /\d/.test(u.text)) };
      }
      if (['xlsx', 'xls', 'csv', 'tsv', 'txt'].includes(ext)) {
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        const shown = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        const units = rows.map((cells, i) => ({ cells, text: (shown[i] || []).join(' '), row: i }));
        return { kind: 'sheet', rows: shown, units, hasText: true };
      }
      return { kind: 'other', units: [] };
    })();
    docCache.set(src.name, p);
    p.catch(() => docCache.delete(src.name));
    return p;
  }

  function PdfPage({ doc, pageNo, hits, peakHits }) {
    const cv = useRef(null);
    const [vp, setVp] = useState(null);
    useEffect(() => {
      let alive = true, task = null;
      (async () => {
        const page = await doc.pdf.getPage(pageNo);
        const v = page.getViewport({ scale: Math.min(2.2, 1200 / page.getViewport({ scale: 1 }).width) });
        if (!alive || !cv.current) return;
        cv.current.width = v.width; cv.current.height = v.height;
        // Vurgu kutuları yalnızca ölçüye bağlı: çizimin bitmesini beklemeden göster
        // (pdf.js ekran çizimi requestAnimationFrame kullanır; pencere arka plandayken gecikebilir)
        setVp(v);
        task = page.render({ canvasContext: cv.current.getContext('2d'), viewport: v });
        await task.promise.catch(() => {});
      })();
      return () => { alive = false; if (task) try { task.cancel(); } catch (e) {} };
    }, [doc, pageNo]);
    // Satır dikdörtgenleri (PDF birimi → tuval pikseli → yüzde)
    const boxes = vp ? [...hits.map(i => [i, false]), ...peakHits.map(i => [i, true])].map(([i, peak]) => {
      const u = doc.units[i]; if (!u || u.page !== pageNo) return null;
      const xs = u.items.map(t => t.x), xe = u.items.map(t => t.x + t.w), ys = u.items.map(t => t.y), ye = u.items.map(t => t.y + (t.h || 8));
      const r = vp.convertToViewportRectangle([Math.min(...xs) - 3, Math.min(...ys) - 2, Math.max(...xe) + 3, Math.max(...ye) + 2]);
      const x1 = Math.min(r[0], r[2]), y1 = Math.min(r[1], r[3]), x2 = Math.max(r[0], r[2]), y2 = Math.max(r[1], r[3]);
      return { key: i + (peak ? 'p' : ''), peak, style: { left: x1 / vp.width * 100 + '%', top: y1 / vp.height * 100 + '%', width: (x2 - x1) / vp.width * 100 + '%', height: (y2 - y1) / vp.height * 100 + '%' } };
    }).filter(Boolean) : [];
    const first = useRef(null);
    useEffect(() => { if (vp && first.current) first.current.scrollIntoView({ block: 'center' }); }, [vp, hits.join()]);
    return (
      <div className="sv-page" style={{ width: 'min(100%, 1100px)' }}>
        <canvas ref={cv} />
        {boxes.map((b, k) => <div key={b.key} ref={k === 0 ? first : null} className={'sv-hl' + (b.peak ? ' peak' : '')} style={b.style} />)}
      </div>
    );
  }

  function SheetView({ doc, hits, peakHits }) {
    const hitSet = new Set(hits), peakSet = new Set(peakHits);
    const first = hits.length ? hits[0] : 0, last = hits.length ? hits[hits.length - 1] : 0;
    const [all, setAll] = useState(false);
    const from = all || !hits.length ? 0 : Math.max(0, first - 12), to = all || !hits.length ? Math.min(doc.rows.length, 3000) : Math.min(doc.rows.length, last + 13);
    const ref = useRef(null);
    useEffect(() => { if (ref.current) ref.current.scrollIntoView({ block: 'center' }); }, [hits.join()]);
    return (
      <div>
        {hits.length > 0 && !all && <div className="sv-pg" style={{ marginBottom: 8 }}>Satır {from + 1}–{to} gösteriliyor <button className="bx-sbtn" onClick={() => setAll(true)}>Tüm tablo</button></div>}
        <table className="sv-tbl"><tbody>
          {doc.rows.slice(from, to).map((r, k) => {
            const i = from + k;
            return <tr key={i} ref={i === first && hits.length ? ref : null} className={peakSet.has(i) ? 'peak' : hitSet.has(i) ? 'hit' : ''}><td className="rn">{i + 1}</td>{r.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>;
          })}
        </tbody></table>
      </div>
    );
  }

  /**
   * @param sources     [{name, bexflowAttachmentId?}]
   * @param excursions  rapordaki sapmalar ({t0,t1,peak,type,start,end,dur})
   * @param initialExc  açılışta gösterilecek sapma (-1 = yalnız belge)
   * @param initialFile açılış dosyası
   */
  function CRSourceViewer({ sources, excursions = [], initialExc = -1, initialFile = 0, onClose }) {
    const [ei, setEi] = useState(initialExc);
    const [fi, setFi] = useState(initialFile);
    const [docs, setDocs] = useState({});        // name → doc | {error}
    const [page, setPage] = useState(1);
    const exc = ei >= 0 ? excursions[ei] : null;

    useEffect(() => {  // tüm kaynakları yükle (sapma arama tüm dosyalarda yapılır)
      let alive = true;
      sources.forEach(s => loadDoc(s).then(d => alive && setDocs(x => ({ ...x, [s.name]: d })), e => alive && setDocs(x => ({ ...x, [s.name]: { kind: 'error', error: e.message } }))));
      return () => { alive = false; };
    }, [sources.map(s => s.name).join('|')]);

    // Her dosyada bu sapmanın konumu
    const found = useMemo(() => {
      const out = {};
      if (!exc || !isFinite(exc.t0)) return out;
      sources.forEach(s => { const d = docs[s.name]; if (d && d.units && d.units.length) out[s.name] = SL.locateAuto(d.units, exc.t0, exc.t1 || exc.t0, exc.peak); });
      return out;
    }, [ei, docs]);

    // Sapma değişince: eşleşmesi en çok olan dosyaya ve ilk eşleşen sayfaya git
    useEffect(() => {
      if (!exc) return;
      const best = sources.map((s, i) => [i, (found[s.name] || {}).hits ? found[s.name].hits.length : 0]).sort((a, b) => b[1] - a[1])[0];
      const target = best && best[1] > 0 ? best[0] : fi;
      if (target !== fi) setFi(target);
      const f = found[sources[target].name], d = docs[sources[target].name];
      if (f && d && d.kind === 'pdf') { const i = f.hits[0] != null ? f.hits[0] : f.nearest; if (i != null) setPage(d.units[i].page); }
    }, [found]);

    useEffect(() => {
      const h = (e) => {
        if (e.key === 'Escape') onClose();
        else if (e.key === 'ArrowRight' && ei >= 0 && ei < excursions.length - 1) setEi(ei + 1);
        else if (e.key === 'ArrowLeft' && ei > 0) setEi(ei - 1);
      };
      window.addEventListener('keydown', h);
      return () => window.removeEventListener('keydown', h);
    });

    const src = sources[fi];
    const doc = src && docs[src.name];
    const f = src && found[src.name];
    const hits = (f && f.hits) || [];
    const peakHits = (f && f.peakHits) || [];
    const nearestHit = f && !hits.length && f.nearest != null ? [f.nearest] : [];

    let msg = null;
    if (exc && !isFinite(exc.t0)) msg = { c: 'warn', t: 'Bu rapor eski bir sürümde üretilmiş; sapma zamanı yok. Belgeyi yeniden analiz ederseniz konum gösterilir.' };
    else if (exc && doc && (doc.kind === 'image' || (doc.kind === 'pdf' && !doc.hasText))) msg = { c: 'warn', t: `Bu belge fotoğraf/taranmış görüntü; metin içermediği için yer otomatik bulunamaz. Aranan: ${fmt(exc.t0)} – ${fmt(exc.t1 || exc.t0)}, tepe ${Number(exc.peak).toFixed(1)} °C.` };
    else if (exc && doc && hits.length) msg = { c: 'ok', t: `${hits.length} kayıt bu sapma aralığında${doc.kind === 'pdf' ? ` (sayfa ${[...new Set(hits.map(i => doc.units[i].page))].join(', ')})` : ''}${peakHits.length ? ` · tepe ${Number(exc.peak).toFixed(1)} °C satırı kırmızı` : ''}. Sarı: aralıktaki satırlar.` };
    else if (exc && doc && doc.units && f) msg = { c: 'warn', t: f.nearest != null ? `Belgede ${fmt(exc.t0)} – ${fmt(exc.t1 || exc.t0)} aralığında satır bulunamadı. En yakın kayıt vurgulandı (${Math.round(f.nearestDistMs / 60000)} dk uzakta) — belgede bu zaman aralığı eksik olabilir.` : 'Belgede tarih/saat okunamadı; aralığı elle kontrol edin.' };

    const pdfHits = doc && doc.kind === 'pdf' ? (hits.length ? hits : nearestHit) : [];

    return (
      <div className="sv-ov" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <style>{CSS}</style>
        <div className="sv-top">
          {exc ? (
            <>
              <button className="bx-sbtn" disabled={ei <= 0} onClick={() => setEi(ei - 1)}>‹</button>
              <div>
                <div className="sv-t">Sapma {ei + 1} / {excursions.length} · {exc.type === 'high' ? 'Yüksek' : 'Düşük'} sıcaklık · tepe {Number(exc.peak).toFixed(2)} °C</div>
                <div className="sv-s">{exc.start} → {exc.end} · {exc.dur}</div>
              </div>
              <button className="bx-sbtn" disabled={ei >= excursions.length - 1} onClick={() => setEi(ei + 1)}>›</button>
            </>
          ) : <div className="sv-t">Kaynak belge</div>}
          <div style={{ flex: 1 }} />
          <div className="sv-files">
            {sources.map((s, i) => <div key={s.name} className={'sv-f' + (i === fi ? ' on' : '') + (found[s.name] && found[s.name].hits.length ? ' hit' : '')} title={s.name} onClick={() => { setFi(i); setPage(1); }}>{s.name}</div>)}
          </div>
          <button className="bx-sbtn" onClick={async () => { const fl = await window.CCSources.resolve(src); if (!fl) return; const u = URL.createObjectURL(fl); const a = document.createElement('a'); a.href = u; a.download = src.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }}>İndir</button>
          <button className="bx-sbtn" onClick={onClose}><Ic.x size={12} /> Kapat (Esc)</button>
        </div>
        {msg && <div className={'sv-msg ' + msg.c}>{msg.t}</div>}
        <div className="sv-body">
          {!doc ? <div className="sv-s">Belge yükleniyor…</div>
            : doc.kind === 'error' ? <div className="sv-msg warn">Belge açılamadı: {doc.error}</div>
            : doc.kind === 'missing' ? <div className="sv-msg warn">Orijinal dosya bulunamadı. Elle yüklenen dosyalar "Sisteme kaydet" ile birlikte saklanır; kaydedilmeden kapatılan analizlerin dosyası saklanmaz.</div>
            : doc.kind === 'image' ? <img className="sv-img" src={doc.url} alt={src.name} />
            : doc.kind === 'sheet' ? <SheetView doc={doc} hits={hits.length ? hits : nearestHit} peakHits={peakHits} />
            : doc.kind === 'pdf' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
                {doc.pages > 1 && <div className="sv-pg"><button className="bx-sbtn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Önceki</button> Sayfa {page} / {doc.pages} <button className="bx-sbtn" disabled={page >= doc.pages} onClick={() => setPage(page + 1)}>Sonraki ›</button></div>}
                <PdfPage key={src.name + ':' + page} doc={doc} pageNo={page} hits={pdfHits} peakHits={peakHits} />
              </div>
            )
            : <div className="sv-msg">Bu dosya türü önizlenemiyor — "İndir" ile açın.</div>}
        </div>
      </div>
    );
  }

  window.CRSourceViewer = CRSourceViewer;
})();
