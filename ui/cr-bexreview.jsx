/* BexFlow Ek İnceleme — kullanıcı küçük önizlemeye bakıp eki tek tıkla sınıflar.
   Ekler çoğunlukla fotoğraf / taranmış PDF olduğu için "ısı kaydı mı?" kararını
   kurallar yalnızca ÖNERİR; son söz kullanıcınındır (category_source='kullanici').
   Önizleme: görsel (img) · PDF ilk sayfa (pdf.js) · Excel/CSV ilk satırlar (SheetJS) · diğerleri simge.
   Büyük görünüm: tıklayınca açılır; klavye 1–5 sınıflar, ←/→ gezinir, Esc kapatır. */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const { CCIcons: Ic } = window;
  const BC = window.BexflowClassify;

  const CSS = `
  .rv-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 14px;margin-bottom:12px;}
  .rv-seg{display:flex;border:1px solid var(--ln2);border-radius:8px;overflow:hidden;}
  .rv-seg>div{padding:7px 12px;font-size:11.5px;font-weight:600;color:var(--t2);cursor:pointer;}
  .rv-seg>div.on{background:var(--sigS);color:var(--sig);}
  .rv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;}
  .rv-card{background:var(--pn);border:1px solid var(--ln2);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:opacity .2s,transform .2s;}
  .rv-card.gone{opacity:0;transform:scale(.96);}
  .rv-thumb{height:170px;background:var(--pn2);display:grid;place-items:center;cursor:zoom-in;overflow:hidden;position:relative;border-bottom:1px solid var(--ln);}
  .rv-thumb img,.rv-thumb canvas{max-width:100%;max-height:170px;object-fit:contain;display:block;}
  .rv-ext{position:absolute;top:8px;left:8px;font-size:9.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;padding:2px 7px;border-radius:5px;background:rgba(0,0,0,.55);color:#fff;}
  .rv-ph{font-size:11px;color:var(--t3);text-align:center;padding:10px;line-height:1.5;}
  .rv-mini{font-family:'JetBrains Mono',monospace;font-size:9.5px;border-collapse:collapse;background:#fff;color:#111;max-width:100%;}
  .rv-mini td{border:1px solid #ddd;padding:2px 4px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;}
  .rv-body{padding:10px 12px;display:flex;flex-direction:column;gap:5px;flex:1;}
  .rv-name{font-size:12px;font-weight:700;color:var(--tx);word-break:break-all;}
  .rv-meta{font-size:10.5px;color:var(--t2);line-height:1.45;}
  .rv-note{font-size:10.5px;color:var(--t3);font-style:italic;line-height:1.4;max-height:44px;overflow:hidden;}
  .rv-btns{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:0 12px 12px;}
  .rv-b{font-family:inherit;font-size:9.5px;font-weight:700;padding:6px 2px;border-radius:6px;border:1px solid var(--ln2);background:transparent;color:var(--t2);cursor:pointer;text-align:center;line-height:1.15;}
  .rv-b:hover{border-color:var(--sig);color:var(--tx);}
  .rv-b.sug{border-color:var(--amber);color:var(--amber);}
  .rv-b.on{background:var(--sig);border-color:var(--sig);color:#04121a;}
  .rv-b.log.on{background:var(--ok);border-color:var(--ok);}
  .rv-ov{position:fixed;inset:0;background:rgba(3,6,10,.82);z-index:500;display:flex;align-items:stretch;justify-content:center;padding:24px;gap:16px;}
  .rv-big{flex:1;min-width:0;background:var(--pn2);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--ln2);}
  .rv-bigv{flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:14px;}
  .rv-bigv img,.rv-bigv canvas{max-width:100%;height:auto;background:#fff;}
  .rv-side{width:320px;flex-shrink:0;background:var(--pn);border:1px solid var(--ln2);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;overflow:auto;}
  .rv-kb{font-family:'JetBrains Mono',monospace;font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid var(--ln2);color:var(--t3);margin-right:6px;}
  .rv-sb{display:flex;align-items:center;justify-content:space-between;font-family:inherit;font-size:12.5px;font-weight:600;padding:10px 12px;border-radius:8px;border:1px solid var(--ln2);background:transparent;color:var(--tx);cursor:pointer;text-align:left;}
  .rv-sb:hover{border-color:var(--sig);} .rv-sb.sug{border-color:var(--amber);} .rv-sb.on{background:var(--sigS);border-color:var(--sig);}
  .rv-pg{display:flex;gap:8px;align-items:center;justify-content:center;padding:8px;border-top:1px solid var(--ln);font-size:11.5px;color:var(--t2);}
  `;

  // Kısa etiketler + klavye sırası
  const CHOICES = [['isi_kaydi', 'Isı kaydı', 'log'], ['fatura_irsaliye', 'Fatura', ''], ['yazisma', 'Yazışma', ''], ['gorsel', 'Görsel', ''], ['diger', 'Diğer', '']];
  const IMG = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
  const SHEET = ['xlsx', 'xls', 'csv'];
  const extOf = (n) => (BC ? BC.extOf(n) : ((String(n).match(/\.([a-z0-9]+)$/i) || [, ''])[1] || '').toLowerCase());

  // ─── Dosya önbelleği + eşzamanlılık sınırı (yüzlerce kart aynı anda indirmesin) ───
  const blobCache = new Map();   // id → Promise<Blob>
  let active = 0; const queue = [];
  function limited(fn) {
    return new Promise((res, rej) => {
      const go = () => { active++; fn().then(res, rej).finally(() => { active--; const n = queue.shift(); if (n) n(); }); };
      active < 3 ? go() : queue.push(go);
    });
  }
  function getBlob(id) {
    if (!blobCache.has(id)) {
      blobCache.set(id, limited(async () => {
        const r = await fetch(`/api/bexflow/attachments/${id}/file`);
        if (!r.ok) throw new Error('Dosya alınamadı');
        return r.blob();
      }));
      blobCache.get(id).catch(() => blobCache.delete(id));
    }
    return blobCache.get(id);
  }

  async function renderPdfPage(blob, pageNo, canvas, maxW) {
    if (!window.pdfjsLib) throw new Error('PDF görüntüleyici yok');
    const data = new Uint8Array(await blob.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, maxW / v1.width);
    const vp = page.getViewport({ scale });
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const n = doc.numPages; doc.destroy();
    return n;
  }
  async function sheetRows(blob, maxRows, maxCols) {
    if (typeof XLSX === 'undefined') throw new Error('Tablo okuyucu yok');
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).filter(r => r.some(c => String(c).trim())).slice(0, maxRows).map(r => r.slice(0, maxCols));
  }

  /** Önizleme: kart (small) veya büyük görünüm (big) */
  function Preview({ a, big, page = 1, onPages }) {
    const ext = extOf(a.file_name);
    const [state, setState] = useState({ st: 'idle' });
    const box = useRef(null), canvas = useRef(null);
    const [visible, setVisible] = useState(!!big);

    useEffect(() => {  // tembel yükleme: kart görünür olunca indir
      if (big || visible || !box.current) return;
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
      io.observe(box.current);
      return () => io.disconnect();
    }, [big, visible]);

    useEffect(() => {
      if (!visible) return;
      let alive = true, url = null;
      (async () => {
        try {
          if (!IMG.includes(ext) && ext !== 'pdf' && !SHEET.includes(ext)) { setState({ st: 'none' }); return; }
          setState({ st: 'loading' });
          const blob = await getBlob(a.id);
          if (!alive) return;
          if (IMG.includes(ext)) { url = URL.createObjectURL(blob); setState({ st: 'img', url }); }
          else if (ext === 'pdf') {
            setState({ st: 'pdf' });
            await new Promise(r => setTimeout(r));
            if (!alive || !canvas.current) return;
            const n = await renderPdfPage(blob, page, canvas.current, big ? 1100 : 260);
            if (onPages) onPages(n);
          } else setState({ st: 'sheet', rows: await sheetRows(blob, big ? 60 : 7, big ? 14 : 5) });
        } catch (e) { if (alive) setState({ st: 'err', msg: e.message }); }
      })();
      return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    }, [visible, a.id, page]);

    const table = (rows) => <table className="rv-mini"><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>)}</tbody></table>;
    const body = state.st === 'img' ? <img src={state.url} alt="" />
      : state.st === 'pdf' ? <canvas ref={canvas} />
      : state.st === 'sheet' ? (state.rows.length ? table(state.rows) : <div className="rv-ph">Boş tablo</div>)
      : state.st === 'err' ? <div className="rv-ph">Önizleme yok<br />{state.msg}</div>
      : state.st === 'none' ? <div className="rv-ph"><Ic.mail size={big ? 40 : 26} /><br />{ext === 'msg' || ext === 'eml' ? 'E-posta dosyası — önizlenemez' : `.${ext || '?'} önizlenemez`}<br /><span style={{ fontSize: 10 }}>İndirip açabilirsiniz</span></div>
      : <div className="rv-ph">Yükleniyor…</div>;
    if (big) return <div ref={box} className="rv-bigv">{body}</div>;
    return <div ref={box} style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>{body}</div>;
  }

  function CRBexReview({ onOpenTask, onChanged }) {
    const [filter, setFilter] = useState('review');
    const [coldOnly, setColdOnly] = useState(true);
    const [items, setItems] = useState(null);
    const [counts, setCounts] = useState(null);
    const [gone, setGone] = useState({});         // id → true (çıkış animasyonu)
    const [open, setOpen] = useState(null);        // büyük görünümdeki ek id
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
      setErr(null);
      try {
        const j = await fetch(`/api/bexflow/attachments?filter=${filter}${coldOnly ? '&cold=1' : ''}`).then(r => r.json());
        if (!j.success) throw new Error(j.error);
        setItems(j.attachments); setCounts(j.counts); setGone({});
      } catch (e) { setErr(e.message); setItems([]); }
    }, [filter, coldOnly]);
    useEffect(() => { load(); }, [load]);

    const list = (items || []).filter(a => !(filter === 'review' && gone[a.id] === 'done'));
    const idx = open == null ? -1 : list.findIndex(a => a.id === open);
    const cur = idx >= 0 ? list[idx] : null;

    const decide = async (a, category) => {
      try {
        const r = await fetch(`/api/bexflow/attachments/${a.id}/classify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, source: 'kullanici', confidence: 1, reason: 'Önizlemeden kullanıcı kararı' }) });
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
        // Büyük görünümde bir sonrakine geç
        if (open === a.id) {
          const next = list[idx + 1] || list[idx - 1];
          setOpen(next && next.id !== a.id ? next.id : null); setPage(1);
        }
        if (filter === 'review') {
          setGone(g => ({ ...g, [a.id]: 'fade' }));
          setTimeout(() => setGone(g => ({ ...g, [a.id]: 'done' })), 220);
          setCounts(c => c ? { ...c, to_review: Math.max(0, c.to_review - 1), reviewed: c.reviewed + 1 } : c);
        } else {
          setItems(xs => xs.map(x => x.id === a.id ? { ...x, category, category_source: 'kullanici' } : x));
        }
        onChanged && onChanged();
      } catch (e) { setErr(e.message); }
    };

    useEffect(() => {  // klavye: büyük görünümde 1–5 / ← → / Esc
      if (!cur) return;
      const h = (e) => {
        if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        const n = Number(e.key);
        if (n >= 1 && n <= CHOICES.length) { e.preventDefault(); decide(cur, CHOICES[n - 1][0]); }
        else if (e.key === 'ArrowRight' && list[idx + 1]) { setOpen(list[idx + 1].id); setPage(1); }
        else if (e.key === 'ArrowLeft' && list[idx - 1]) { setOpen(list[idx - 1].id); setPage(1); }
        else if (e.key === 'Escape') setOpen(null);
      };
      window.addEventListener('keydown', h);
      return () => window.removeEventListener('keydown', h);
    });

    const suggestion = (a) => a.category_source === 'kullanici' ? null : a.category;
    const catLabel = (c) => (BC && BC.CATEGORIES[c]) || c;
    const download = async (a) => { const b = await getBlob(a.id); const u = URL.createObjectURL(b); const el = document.createElement('a'); el.href = u; el.download = a.file_name; el.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); };

    return (
      <div>
        <style>{CSS}</style>
        <div className="cr-pn rv-bar">
          <div className="rv-seg">
            {[['review', 'İncelenecek'], ['logs', 'Isı kayıtları'], ['all', 'Tümü']].map(([k, l]) => <div key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</div>)}
          </div>
          <label className="bx-chk"><input type="checkbox" checked={coldOnly} onChange={e => setColdOnly(e.target.checked)} /> Yalnız soğuk zincir iadeleri</label>
          <div style={{ flex: 1 }} />
          {counts && <span style={{ fontSize: 11.5, color: 'var(--t2)' }}><b style={{ color: 'var(--amber)' }}>{counts.to_review}</b> incelenecek · <b style={{ color: 'var(--ok)' }}>{counts.reviewed}</b> karar verildi · {counts.downloaded}/{counts.total} indirildi</span>}
          <button className="bx-sbtn" onClick={load}><Ic.refresh size={12} /> Yenile</button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--t3)', margin: '0 2px 12px', lineHeight: 1.6 }}>
          Önizlemeye bakıp eki sınıflayın. <span style={{ color: 'var(--amber)' }}>Turuncu</span> çerçeve sistemin önerisidir (dosya adı / not / içerik). Büyük görünüm için önizlemeye tıklayın — orada <span className="rv-kb">1</span>…<span className="rv-kb">5</span> tuşlarıyla sınıflayıp <span className="rv-kb">→</span> ile ilerleyebilirsiniz. Kararınız kalıcıdır; otomatik kurallar onu değiştirmez.
        </div>
        {err && <div className="cr-pn" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--bad)', borderColor: 'var(--bad)', fontSize: 12 }}>{err}</div>}

        {items === null ? <div className="cr-pn"><div className="bx-empty">Yükleniyor…</div></div>
          : !list.length ? <div className="cr-pn"><div className="bx-empty">{filter === 'review' ? 'İncelenecek ek kalmadı. 👍' : 'Kayıt yok.'}{counts && counts.downloaded < counts.total ? <><br />{counts.total - counts.downloaded} ek henüz indirilmedi — sonraki senkronizasyonda gelecek.</> : null}</div></div>
          : (
            <div className="rv-grid">
              {list.map(a => {
                const sug = suggestion(a), ext = extOf(a.file_name);
                return (
                  <div key={a.id} className={'rv-card' + (gone[a.id] ? ' gone' : '')}>
                    <div className="rv-thumb" onClick={() => { setOpen(a.id); setPage(1); }}>
                      <span className="rv-ext">{ext || '?'}</span>
                      <Preview a={a} />
                    </div>
                    <div className="rv-body">
                      <div className="rv-name">{a.file_name}</div>
                      <div className="rv-meta"><b style={{ color: 'var(--tx)' }}>{a.pharmacy}</b>{a.district ? ` · ${a.district}` : ''} · #{a.ref_no}{a.cold ? <span className="bx-tag cold" style={{ marginLeft: 6 }}>SZ</span> : null}</div>
                      {a.item_names && <div className="rv-meta">{a.item_names.length > 70 ? a.item_names.slice(0, 70) + '…' : a.item_names}</div>}
                      {a.comment_text && <div className="rv-note">“{a.comment_text}”</div>}
                      {sug && sug !== 'belirsiz' && <div className="rv-meta" style={{ color: 'var(--amber)' }}>Öneri: {catLabel(sug)}{a.reason ? ` — ${a.reason}` : ''}</div>}
                    </div>
                    <div className="rv-btns">
                      {CHOICES.map(([k, l, cls]) => (
                        <button key={k} className={'rv-b ' + cls + (a.category_source === 'kullanici' && a.category === k ? ' on' : '') + (sug === k ? ' sug' : '')} onClick={() => decide(a, k)}>{l}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        {cur && (
          <div className="rv-ov" onClick={e => { if (e.target === e.currentTarget) setOpen(null); }}>
            <div className="rv-big">
              <Preview key={cur.id + ':' + page} a={cur} big page={page} onPages={setPages} />
              {extOf(cur.file_name) === 'pdf' && pages > 1 && (
                <div className="rv-pg">
                  <button className="bx-sbtn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Önceki</button>
                  Sayfa {page} / {pages}
                  <button className="bx-sbtn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Sonraki ›</button>
                </div>
              )}
            </div>
            <div className="rv-side">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{idx + 1} / {list.length}</span>
                <button className="bx-sbtn" onClick={() => setOpen(null)}><Ic.x size={12} /> Kapat <span className="rv-kb" style={{ margin: '0 0 0 4px' }}>Esc</span></button>
              </div>
              <div className="rv-name" style={{ fontSize: 14 }}>{cur.file_name}</div>
              <div className="rv-meta"><b style={{ color: 'var(--tx)' }}>{cur.pharmacy}</b>{cur.district ? ` · ${cur.district}` : ''}<br />İade #{cur.ref_no} · {cur.created_text} · {cur.status}</div>
              {cur.item_names && <div className="rv-meta">{cur.item_names}</div>}
              {cur.comment_text && <div className="rv-meta" style={{ background: 'var(--pn2)', padding: '8px 10px', borderRadius: 8, whiteSpace: 'pre-wrap' }}><b>{cur.comment_author}</b> · {cur.comment_date}<br />{cur.comment_text}</div>}
              {suggestion(cur) && suggestion(cur) !== 'belirsiz' && <div className="rv-meta" style={{ color: 'var(--amber)' }}>Sistem önerisi: {catLabel(suggestion(cur))}{cur.reason ? ` — ${cur.reason}` : ''}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {CHOICES.map(([k], i) => (
                  <button key={k} className={'rv-sb' + (cur.category_source === 'kullanici' && cur.category === k ? ' on' : '') + (suggestion(cur) === k ? ' sug' : '')} onClick={() => decide(cur, k)}>
                    <span><span className="rv-kb">{i + 1}</span>{catLabel(k)}</span>{suggestion(cur) === k ? <span style={{ fontSize: 10, color: 'var(--amber)' }}>öneri</span> : null}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
                <button className="bx-sbtn" disabled={idx <= 0} onClick={() => { setOpen(list[idx - 1].id); setPage(1); }}>← Önceki</button>
                <button className="bx-sbtn" disabled={idx >= list.length - 1} onClick={() => { setOpen(list[idx + 1].id); setPage(1); }}>Sonraki →</button>
                <button className="bx-sbtn" onClick={() => download(cur)}>İndir</button>
                <button className="bx-sbtn" onClick={() => { setOpen(null); onOpenTask && onOpenTask(cur.task_id); }}>İadeyi aç</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  window.CRBexReview = CRBexReview;
})();
