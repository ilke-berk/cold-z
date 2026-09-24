/* BexFlow İadeleri — Alliance Healthcare BexFlow iş akışından çekilen iadeler.
   Bağlantı (kullanıcı kendi hesabıyla, captcha'lı giriş) Electron penceresinde açılır;
   senkronizasyon sunucuda koşar (bexflow-service.js). Bu ekran:
     • iade listesi + detay (ürün, miat, soğuk zincir, notlar, ekler)
     • ek sınıflandırma: ısı kaydı mı? — tablo ekleri burada mevcut DataParser ile
       içerikten kesinleşir (katman 3), PDF/görsel için isteğe bağlı AI, elle düzeltme
     • ısı kaydını "Veri Yükleme"ye aktarıp mevcut analiz hattında değerlendirme
     • dönem raporu (eczane / ürün / iade nedeni / ısı kaydı eksik / miadı yakın) */
(function () {
  const { useState, useEffect, useRef } = React;
  const { CCIcons: Ic, CRShell } = window;
  const BC = window.BexflowClassify;

  const CSS = `
  .bx-top{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
  .bx-pill{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:.4px;padding:6px 11px;border-radius:999px;border:1px solid var(--ln2);background:var(--pn2);color:var(--t2);text-transform:uppercase;}
  .bx-dot{width:8px;height:8px;border-radius:50%;background:var(--t3);}
  .bx-pill.on{color:var(--ok);border-color:var(--ok);background:var(--okS);} .bx-pill.on .bx-dot{background:var(--ok);}
  .bx-pill.off{color:var(--amber);border-color:var(--amber);background:var(--amberS);} .bx-pill.off .bx-dot{background:var(--amber);}
  .bx-pill.busy .bx-dot{background:var(--sig);animation:bxp 1s infinite;}
  @keyframes bxp{50%{opacity:.3}}
  .bx-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
  .bx-stat{background:var(--pn);border:1px solid var(--ln2);border-radius:10px;padding:11px 15px;min-width:130px;cursor:default;}
  .bx-stat.click{cursor:pointer;} .bx-stat.click:hover{border-color:var(--sig);}
  .bx-statV{font-size:19px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--tx);}
  .bx-statL{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:3px;font-weight:700;}
  .bx-tabs{display:flex;gap:4px;margin-bottom:12px;}
  .bx-tab{padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;color:var(--t2);cursor:pointer;border:1px solid transparent;}
  .bx-tab.on{color:var(--tx);background:var(--pn);border-color:var(--ln2);}
  .bx-flt{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 14px;border-bottom:1px solid var(--ln);}
  .bx-chk{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--t2);cursor:pointer;user-select:none;}
  .bx-grid{display:grid;grid-template-columns:minmax(360px,1fr) minmax(420px,1.25fr);gap:14px;align-items:start;}
  @media (max-width:1180px){.bx-grid{grid-template-columns:1fr;}}
  .bx-list{max-height:calc(100vh - 360px);min-height:260px;overflow:auto;}
  .bx-row{padding:11px 14px;border-bottom:1px solid var(--ln);cursor:pointer;display:flex;flex-direction:column;gap:4px;}
  .bx-row:hover{background:var(--pn2);} .bx-row.on{background:var(--sigS);box-shadow:inset 3px 0 0 var(--sig);}
  .bx-r1{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:700;color:var(--tx);}
  .bx-r2{font-size:11px;color:var(--t2);display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
  .bx-m{font-family:'JetBrains Mono',monospace;}
  .bx-tag{font-size:9.5px;letter-spacing:.5px;text-transform:uppercase;font-weight:700;padding:2px 7px;border-radius:5px;border:1px solid var(--ln2);color:var(--t2);background:var(--pn2);white-space:nowrap;}
  .bx-tag.cold{color:var(--sig);border-color:var(--sig);background:var(--sigS);}
  .bx-tag.miss{color:var(--bad);border-color:var(--bad);background:var(--badS);}
  .bx-tag.ok{color:var(--ok);border-color:var(--ok);background:var(--okS);}
  .bx-tag.warn{color:var(--amber);border-color:var(--amber);background:var(--amberS);}
  .bx-sec{padding:14px 16px;border-bottom:1px solid var(--ln);}
  .bx-sec:last-child{border-bottom:none;}
  .bx-sech{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;margin-bottom:9px;display:flex;justify-content:space-between;align-items:center;gap:8px;}
  .bx-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:9px 16px;}
  .bx-k{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);font-weight:700;}
  .bx-v{font-size:12.5px;color:var(--tx);margin-top:2px;word-break:break-word;}
  .bx-notice{padding:9px 12px;border-radius:8px;border:1px solid var(--sig);background:var(--sigS);color:var(--sig);font-size:12px;font-weight:700;margin-bottom:8px;display:flex;gap:8px;align-items:center;}
  .bx-notice.bad{border-color:var(--bad);background:var(--badS);color:var(--bad);}
  .bx-tbl{width:100%;border-collapse:collapse;font-size:11.5px;}
  .bx-tbl th{text-align:left;color:var(--t3);padding:7px 8px;border-bottom:1px solid var(--ln2);font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}
  .bx-tbl td{padding:8px;border-bottom:1px solid var(--ln);color:var(--t2);vertical-align:top;}
  .bx-tbl tr:last-child td{border-bottom:none;}
  .bx-att{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px dashed var(--ln);}
  .bx-att:last-child{border-bottom:none;}
  .bx-attn{font-size:12.5px;color:var(--tx);font-weight:600;word-break:break-all;}
  .bx-attr{font-size:10.5px;color:var(--t3);margin-top:3px;line-height:1.5;}
  .bx-sel{font-family:inherit;font-size:11px;color:var(--tx);background:var(--pn2);border:1px solid var(--ln2);border-radius:6px;padding:5px 7px;}
  .bx-sbtn{font-family:inherit;font-size:10.5px;font-weight:700;padding:5px 9px;border-radius:6px;border:1px solid var(--ln2);background:transparent;color:var(--t2);cursor:pointer;white-space:nowrap;display:inline-flex;gap:5px;align-items:center;}
  .bx-sbtn:hover{color:var(--tx);border-color:var(--sig);} .bx-sbtn:disabled{opacity:.5;cursor:default;}
  .bx-sbtn.pri{background:var(--sig);color:#04121a;border-color:var(--sig);}
  .bx-note{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--ln);}
  .bx-note:last-child{border-bottom:none;}
  .bx-nh{font-size:11px;color:var(--t2);display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
  .bx-nt{font-size:12px;color:var(--tx);white-space:pre-wrap;margin-top:4px;line-height:1.5;}
  .bx-empty{padding:48px 22px;text-align:center;color:var(--t3);font-size:12.5px;line-height:1.7;}
  .bx-bar{height:6px;border-radius:3px;background:var(--pn2);overflow:hidden;min-width:60px;}
  .bx-bar>div{height:100%;background:var(--sig);}
  .bx-rgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  @media (max-width:1180px){.bx-rgrid{grid-template-columns:1fr;}}
  .bx-cbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 14px;margin-bottom:12px;}
  .bx-chip{font-size:11.5px;font-weight:600;padding:6px 12px;border-radius:999px;border:1px solid var(--ln2);color:var(--t2);cursor:pointer;user-select:none;display:inline-flex;gap:6px;align-items:center;}
  .bx-chip:hover{border-color:var(--sig);} .bx-chip.on{background:var(--sigS);color:var(--sig);border-color:var(--sig);}
  .bx-chip b{font-family:'JetBrains Mono',monospace;font-weight:700;}
  .bx-day{font-size:10.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;margin:16px 2px 9px;display:flex;gap:8px;align-items:center;}
  .bx-day:first-child{margin-top:0;} .bx-day::after{content:'';flex:1;height:1px;background:var(--ln);}
  .bx-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;}
  .bx-card{background:var(--pn);border:1px solid var(--ln2);border-left:4px solid var(--ln2);border-radius:12px;padding:13px 15px;cursor:pointer;display:flex;flex-direction:column;gap:8px;transition:border-color .15s,transform .15s;}
  .bx-card:hover{border-color:var(--sig);transform:translateY(-1px);}
  .bx-card.p-bad{border-left-color:var(--bad);} .bx-card.p-warn{border-left-color:var(--amber);} .bx-card.p-cold{border-left-color:var(--sig);} .bx-card.p-ok{border-left-color:var(--ok);}
  .bx-card.on{box-shadow:0 0 0 2px var(--sig);}
  .bx-ch{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;}
  .bx-cn{font-size:14px;font-weight:700;color:var(--tx);line-height:1.3;}
  .bx-cs{font-size:11px;color:var(--t2);margin-top:2px;}
  .bx-new{font-size:9px;font-weight:800;letter-spacing:.6px;padding:2px 6px;border-radius:4px;background:var(--sig);color:#04121a;vertical-align:2px;margin-left:6px;}
  .bx-cm{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px 0;border-top:1px solid var(--ln);border-bottom:1px solid var(--ln);}
  .bx-cm .bx-v{font-size:12px;font-weight:600;}
  .bx-cp{font-size:11.5px;color:var(--t2);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .bx-cnote{font-size:11px;color:var(--t2);background:var(--pn2);border-radius:7px;padding:7px 9px;line-height:1.45;}
  .bx-cnote span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;}
  .bx-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;justify-content:flex-end;}
  .bx-drw{width:min(780px,100%);height:100%;background:var(--bg,var(--pn));border-left:1px solid var(--ln2);overflow:auto;box-shadow:-10px 0 30px rgba(0,0,0,.3);}
  .bx-drwh{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 16px;background:var(--pn);border-bottom:1px solid var(--ln2);}
  `;
  const FOLDER_NAMES = { '': 'Posta Kutusu', inbox: 'Cevap Bekleyenler', pool: 'Havuz', waiting: 'Park Edilen', sentbox: 'Gidenler', requests: 'Taleplerim' };
  const SEEN_KEY = 'bx.cardsSeenAt';
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { /* yut */ } };
  // SQLite CURRENT_TIMESTAMP (UTC, "YYYY-MM-DD HH:MM:SS") → ms
  const utcMs = (v) => { if (!v) return 0; const d = new Date(String(v).replace(' ', 'T') + (/[zZ+]/.test(String(v).slice(10)) ? '' : 'Z')); return isNaN(d) ? 0 : d.getTime(); };
  const dayLabel = (iso) => {
    if (!iso) return 'Tarihsiz';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); if (isNaN(d)) return 'Tarihsiz';
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((t - d) / 86400000);
    if (diff <= 0) return 'Bugün'; if (diff === 1) return 'Dün';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  };
  // Kartın öncelik rengi: eksik ısı kaydı > kontrol bekleyen/miat > soğuk zincir > analiz edilmiş
  const priority = (t) => t.missing_log ? 'bad' : (t.pending_review || t.unknown_count || expSoon(t.min_expiry)) ? 'warn' : t.analysis_id ? 'ok' : t.cold ? 'cold' : '';

  const CAT = (BC && BC.CATEGORIES) || { isi_kaydi: 'Isı/Nem Kaydı', fatura_irsaliye: 'Fatura / İrsaliye', yazisma: 'Yazışma', gorsel: 'Fotoğraf / Görsel', diger: 'Diğer', belirsiz: 'Belirsiz' };
  const SRC = { ad: 'ad/not', icerik: 'içerik', ai: 'AI', kullanici: 'elle' };
  const catClass = (c) => c === 'isi_kaydi' ? 'ok' : c === 'belirsiz' ? 'warn' : '';
  const money = (n) => n == null || n === '' ? '—' : Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
  const trToIsoDate = (s) => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const fmtTs = (v) => { if (!v) return '—'; const d = new Date(String(v).replace(' ', 'T') + (/[zZ+]/.test(String(v).slice(10)) ? '' : 'Z')); return isNaN(d) ? String(v) : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const expSoon = (iso) => { if (!iso) return false; const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth() + 6, 1); return iso <= `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}`; };

  async function api(url, opts) {
    const r = await fetch(url, opts && opts.body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...opts, body: JSON.stringify(opts.body) } : opts);
    const j = await r.json().catch(() => ({ success: false, error: 'Geçersiz yanıt' }));
    if (!j.success) { const e = new Error(j.error || 'İstek başarısız'); e.code = j.code; throw e; }
    return j;
  }
  async function attachmentFile(a) {
    const r = await fetch(`/api/bexflow/attachments/${a.id}/file`);
    if (!r.ok) throw new Error('Ek dosyası alınamadı');
    const blob = await r.blob();
    return new File([blob], a.file_name, { type: blob.type });
  }

  // ─── Katman 3: içerik kontrolü (mevcut DataParser, AI'sız) ────────────
  async function sniffContent(a) {
    const meta = BC.classifyByMeta({ fileName: a.file_name, commentText: '' });
    meta.kategori = a.category; meta.guven = a.confidence; meta.neden = a.reason || meta.neden;
    let parsed = null, err = null;
    try {
      const file = await attachmentFile(a);
      const ext = BC.extOf(a.file_name);
      const raw = (ext === 'xlsx' || ext === 'xls') ? await DataParser.readExcel(file) : await DataParser.readCSV(file);
      if (raw && raw.rows && raw.rows.length) {
        const res = await DataParser.standardize(raw, null, { resampling: false, sourcePath: ext === 'xlsx' || ext === 'xls' ? 'excel' : 'csv' });
        parsed = { parsedData: res.data };
      }
    } catch (e) { err = e.message; }
    return BC.contentVerdict(meta, parsed, err);
  }

  function CRBexflow({ theme, onNav = () => {} }) {
    const [st, setSt] = useState(null);           // /status
    const [tab, setTab] = useState('cards');
    // "Yeni" = bu kullanıcının Talepler ekranına son bakışından sonra ilk kez çekilen iş (yalnızca bu tarayıcıda)
    const [seenAt] = useState(() => { const prev = Number(lsGet(SEEN_KEY)) || 0; lsSet(SEEN_KEY, String(Date.now())); return prev; });
    const [opened, setOpened] = useState(() => new Set());
    const [tasks, setTasks] = useState(null);
    const [flt, setFlt] = useState({ q: '', cold: false, missingLog: false });
    const [sel, setSel] = useState(null);         // seçili iş id
    const [task, setTask] = useState(null);       // detay
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState({});         // {key: true}
    const [sniffing, setSniffing] = useState(0);
    const [report, setReport] = useState(null);
    const [range, setRange] = useState(() => { const d = new Date(); const f = new Date(d.getFullYear(), d.getMonth(), 1); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; return { from: iso(f), to: iso(d) }; });
    const wasSyncing = useRef(false);

    const setB = (k, v) => setBusy(b => ({ ...b, [k]: v }));
    const loadStatus = async () => { try { const j = await api('/api/bexflow/status'); setSt(j); return j; } catch (e) { setError(e.message); return null; } };
    const loadTasks = async () => {
      try {
        const p = new URLSearchParams(); if (flt.q) p.set('q', flt.q); if (flt.cold) p.set('cold', '1'); if (flt.missingLog) p.set('missingLog', '1');
        const j = await api('/api/bexflow/tasks?' + p.toString()); setTasks(j.tasks);
      } catch (e) { setError(e.message); setTasks([]); }
    };
    const loadTask = async (id) => { if (!id) { setTask(null); return; } try { const j = await api('/api/bexflow/tasks/' + id); setTask(j.task); } catch (e) { setError(e.message); } };
    const loadReport = async () => { setReport(null); try { const j = await api(`/api/bexflow/report?from=${range.from}&to=${range.to}`); setReport(j.report); } catch (e) { setError(e.message); } };

    // İçerik kontrolü bekleyen tablo eklerini sırayla işle
    const runSniff = async () => {
      if (!BC || typeof DataParser === 'undefined') return;
      let list = [];
      try { list = (await api('/api/bexflow/pending-content')).attachments || []; } catch (e) { return; }
      if (!list.length) return;
      setSniffing(list.length);
      for (const a of list) {
        try {
          const v = await sniffContent(a);
          await api(`/api/bexflow/attachments/${a.id}/classify`, { body: { category: v.kategori, confidence: v.guven, reason: v.neden, source: 'icerik' } });
        } catch (e) { /* sonraki ek */ }
        setSniffing(n => Math.max(0, n - 1));
      }
      setSniffing(0);
      loadTasks(); if (sel) loadTask(sel); loadStatus();
    };

    useEffect(() => { loadStatus().then(() => runSniff()); }, []);
    useEffect(() => { const t = setTimeout(loadTasks, 250); return () => clearTimeout(t); }, [flt.q, flt.cold, flt.missingLog]);
    useEffect(() => { loadTask(sel); }, [sel]);
    // Senkron sürerken yeni işler/detaylar geldikçe listeyi tazele
    useEffect(() => { if (st && st.stats) loadTasks(); }, [st && st.stats && st.stats.tasks, st && st.stats && st.stats.detailed]);
    useEffect(() => { if (tab === 'report') loadReport(); }, [tab, range.from, range.to]);
    // Senkron / giriş sürerken durumu sık yokla; bitince listeyi tazele ve içerik kontrolünü koştur
    useEffect(() => {
      const fast = st && (st.syncing || st.loginOpen);
      const t = setInterval(loadStatus, fast ? 1500 : 20000);
      if (st) {
        if (wasSyncing.current && !st.syncing) { loadTasks(); if (sel) loadTask(sel); runSniff(); }
        wasSyncing.current = !!st.syncing;
      }
      return () => clearInterval(t);
    }, [st && st.syncing, st && st.loginOpen, st && st.lastSyncAt]);

    const connect = async () => { setError(null); setB('conn', true); try { setSt(await api('/api/bexflow/connect', { method: 'POST' })); } catch (e) { setError(e.message); } setB('conn', false); };
    const sync = async () => { setError(null); try { setSt(await api('/api/bexflow/sync', { method: 'POST' })); } catch (e) { setError(e.message); } };
    const disconnect = async () => { if (!window.confirm('BexFlow oturumu kapatılsın mı? (Çekilmiş iadeler yerelde kalır.)')) return; try { setSt(await api('/api/bexflow/disconnect', { body: {} })); } catch (e) { setError(e.message); } };

    const reclassify = async (a, category) => {
      setB('c' + a.id, true);
      try { await api(`/api/bexflow/attachments/${a.id}/classify`, { body: { category, source: 'kullanici', confidence: 1, reason: 'Kullanıcı düzeltmesi' } }); await loadTask(sel); loadTasks(); }
      catch (e) { setError(e.message); }
      setB('c' + a.id, false);
    };
    const aiClassify = async (a) => {
      setB('ai' + a.id, true);
      try { await api(`/api/bexflow/attachments/${a.id}/ai-classify`, { method: 'POST' }); await loadTask(sel); loadTasks(); }
      catch (e) { setError(e.message); }
      setB('ai' + a.id, false);
    };
    const openFile = async (a) => {
      try { const f = await attachmentFile(a); const url = URL.createObjectURL(f); const el = document.createElement('a'); el.href = url; el.download = a.file_name; el.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
      catch (e) { setError(e.message); }
    };
    // Isı kayıtlarını Veri Yükleme ekranına aktar (iade bilgileri formu önceden doldurur)
    const sendToAnalysis = async (atts) => {
      setB('an', true);
      try {
        const files = [];
        for (const a of atts) files.push(await attachmentFile(a));
        const f = task.fields || {};
        const cold = (task.items || []).find(i => i.cold) || (task.items || [])[0] || {};
        window.CCBexHandoff = {
          taskId: task.id,
          attachmentIds: atts.map(a => a.id),
          sources: atts.map(a => ({ id: a.id, name: a.file_name })),
          files,
          form: {
            pharmacy: [task.pharmacy, task.district].filter(Boolean).join(' / '),
            drug: cold.name || '',
            barcode: cold.barcode || '',
            qty: cold.boxes != null ? String(cold.boxes) : '',
            expiry: cold.expiry || '',
            amount: cold.total != null ? String(cold.total) : '',
            purchaseDate: trToIsoDate(cold.purchase_date),
            returnDate: trToIsoDate((f['RemoteInvoice.DATESENT'] || {}).value || task.created_text),
            batch: task.ref_no ? `BexFlow ${task.ref_no}` : '',
          },
        };
        onNav('upload');
      } catch (e) { setError(e.message); }
      setB('an', false);
    };

    const stats = (st && st.stats) || {};
    const list = tasks || [];
    const missingCount = list.filter(t => t.missing_log).length;
    const pill = !st ? { c: '', t: 'Denetleniyor…' } : !st.available ? { c: 'off', t: 'Yalnızca masaüstü uygulaması' } : st.syncing ? { c: 'on busy', t: (st.progress && st.progress.phase) ? `${st.progress.phase}${st.progress.total ? ` ${st.progress.done}/${st.progress.total}` : ''}` : 'Senkronize ediliyor…' } : st.loginOpen ? { c: 'off busy', t: 'Giriş penceresi açık' } : st.connected ? { c: 'on', t: 'BexFlow bağlı' } : { c: 'off', t: 'Oturum kapalı' };

    return (
      <CRShell theme={theme} active="bexflow" onNav={onNav}>
        <style>{CSS}</style>
        <div className="cr-hr">
          <div>
            <div className="cr-h1">BexFlow İadeleri</div>
            <div className="cr-h1sub">Alliance Healthcare BexFlow iş akışından salt-okunur çekilen iadeler · ürün, miat, soğuk zincir, ekler</div>
          </div>
          <div className="bx-top">
            <span className={'bx-pill ' + pill.c}><span className="bx-dot" />{pill.t}</span>
            {st && st.available && !st.connected && <button className="cr-btn" onClick={connect} disabled={busy.conn || st.loginOpen}><Ic.lock size={14} /> BEXFLOW'A BAĞLAN</button>}
            {st && st.available && st.connected && <button className="cr-btn" onClick={sync} disabled={st.syncing}><Ic.refresh size={14} /> ŞİMDİ SENKRONİZE ET</button>}
            {st && st.available && st.connected && <button className="cr-btn cr-btn2" onClick={disconnect} disabled={st.syncing}><Ic.logout size={14} /> Oturumu kapat</button>}
          </div>
        </div>

        {st && !st.available && (
          <div className="cr-pn" style={{ padding: '13px 16px', marginBottom: 14, fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6 }}>
            BexFlow bağlantısı yalnızca masaüstü uygulamasında (Electron) açılabilir; tarayıcı modunda (npm start) daha önce çekilmiş veriler görüntülenir.
          </div>
        )}
        {st && st.available && !st.connected && !st.loginOpen && (
          <div className="cr-pn" style={{ padding: '13px 16px', marginBottom: 14, fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.65 }}>
            <b style={{ color: 'var(--tx)' }}>Nasıl bağlanılır?</b> "BexFlow'a bağlan" ayrı bir pencere açar. Kendi BexFlow kullanıcı adı ve şifrenizle girip
            "Ben robot değilim" doğrulamasını yapın (<b>Beni hatırla</b> işaretli kalsın). Posta kutusu açılınca pencere kendiliğinden kapanır ve
            senkronizasyon başlar; sonra her {st.syncMinutes} dakikada bir güncellenir. Şifreniz bu uygulamaya gelmez ve saklanmaz; sistem BexFlow'da
            yalnızca okuma yapar (onay/red/not işlemi yapmaz).
            {st.lastError && <div style={{ color: 'var(--amber)', marginTop: 6 }}>Son durum: {st.lastError}</div>}
          </div>
        )}
        {error && (
          <div className="cr-pn" style={{ padding: '11px 14px', marginBottom: 14, borderColor: 'var(--bad)', color: 'var(--bad)', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.alert size={16} /> {error}</span>
            <button className="bx-sbtn" onClick={() => setError(null)}><Ic.x size={12} /></button>
          </div>
        )}

        <div className="bx-stats">
          <div className="bx-stat"><div className="bx-statV">{stats.tasks ?? '…'}</div><div className="bx-statL">İade işi{st && st.days ? ` · son ${st.days} gün` : ''}{stats.tasks ? ` · ${stats.detailed || 0} detaylı` : ''}</div></div>
          <div className={'bx-stat click'} onClick={() => { setTab(t => t === 'list' ? 'list' : 'cards'); setFlt(f => ({ ...f, cold: !f.cold, missingLog: false })); }}><div className="bx-statV" style={{ color: 'var(--sig)' }}>{stats.cold ?? '…'}</div><div className="bx-statL">Soğuk zincir</div></div>
          <div className={'bx-stat click'} onClick={() => { setTab(t => t === 'list' ? 'list' : 'cards'); setFlt(f => ({ ...f, missingLog: !f.missingLog, cold: false })); }}><div className="bx-statV" style={{ color: missingCount ? 'var(--bad)' : 'var(--tx)' }}>{tasks === null ? '…' : (flt.missingLog ? list.length : missingCount)}</div><div className="bx-statL">Isı kaydı eksik (SZ)</div></div>
          <div className="bx-stat"><div className="bx-statV" style={{ color: 'var(--ok)' }}>{stats.logs ?? '…'}</div><div className="bx-statL">Isı kaydı eki</div></div>
          <div className="bx-stat click" onClick={() => setTab('review')}><div className="bx-statV" style={{ color: stats.att && stats.att.to_review ? 'var(--amber)' : 'var(--tx)' }}>{stats.att ? stats.att.to_review : '…'}</div><div className="bx-statL">İncelenecek ek{stats.att ? ` · ${stats.att.downloaded}/${stats.att.total} indi` : ''}{sniffing ? ` · ${sniffing} kontrol ediliyor` : ''}</div></div>
          <div className="bx-stat"><div className="bx-statV" style={{ fontSize: 13, paddingTop: 5 }}>{st && st.lastSyncAt ? fmtTs(st.lastSyncAt) : '—'}</div><div className="bx-statL">Son senkron{st && st.lastResult ? ` · ${st.lastResult.newTasks} yeni` : ''}</div></div>
        </div>

        <div className="bx-tabs">
          <div className={'bx-tab' + (tab === 'cards' ? ' on' : '')} onClick={() => setTab('cards')}>Talepler</div>
          <div className={'bx-tab' + (tab === 'list' ? ' on' : '')} onClick={() => setTab('list')}>Liste</div>
          <div className={'bx-tab' + (tab === 'review' ? ' on' : '')} onClick={() => setTab('review')}>Ek İnceleme{stats.att && stats.att.to_review ? ` (${stats.att.to_review})` : ''}</div>
          <div className={'bx-tab' + (tab === 'report' ? ' on' : '')} onClick={() => setTab('report')}>Rapor</div>
        </div>

        {tab === 'cards' ? (
          <>
            <TaskCards tasks={tasks} total={stats.tasks} flt={flt} setFlt={setFlt} sel={sel} isNew={(t) => seenAt && !opened.has(t.id) && utcMs(t.first_seen_at) > seenAt}
              onOpen={(id) => { setSel(id); setOpened(s => new Set(s).add(id)); }} />
            {sel && (
              <DetailDrawer onClose={() => setSel(null)}>
                {!task || task.id !== sel ? <div className="bx-empty">Yükleniyor…</div> : (
                  <TaskDetail task={task} busy={busy} onReclassify={reclassify} onAi={aiClassify} onOpen={openFile} onAnalyze={sendToAnalysis} />
                )}
              </DetailDrawer>
            )}
          </>
        ) : tab === 'list' ? (
          <div className="bx-grid">
            <div className="cr-pn" style={{ overflow: 'hidden' }}>
              <div className="bx-flt">
                <input className="cr-input" style={{ flex: 1, minWidth: 180 }} placeholder="Ara: eczane, iade no, ilaç, barkod…" value={flt.q} onChange={e => setFlt(f => ({ ...f, q: e.target.value }))} />
                <label className="bx-chk"><input type="checkbox" checked={flt.cold} onChange={e => setFlt(f => ({ ...f, cold: e.target.checked }))} /> Soğuk zincir</label>
                <label className="bx-chk"><input type="checkbox" checked={flt.missingLog} onChange={e => setFlt(f => ({ ...f, missingLog: e.target.checked }))} /> Isı kaydı eksik</label>
              </div>
              <div className="bx-list">
                {tasks === null ? <div className="bx-empty">Yükleniyor…</div>
                  : !list.length ? <div className="bx-empty">{stats.tasks ? 'Filtreye uyan iade yok.' : 'Henüz BexFlow verisi yok. Bağlanıp senkronize edin.'}</div>
                  : list.map(t => (
                    <div key={t.id} className={'bx-row' + (sel === t.id ? ' on' : '')} onClick={() => setSel(t.id)}>
                      <div className="bx-r1"><span>{t.pharmacy || t.title}</span><span className="bx-m" style={{ color: 'var(--t3)', fontWeight: 500, fontSize: 11 }}>{t.created_text || ''}</span></div>
                      <div className="bx-r2">
                        <span className="bx-m">#{t.ref_no || t.id}</span>
                        {t.district && <span>· {t.district}</span>}
                        <span>· {t.status || '—'}</span>
                      </div>
                      <div className="bx-r2">
                        {t.cold ? <span className="bx-tag cold">Soğuk zincir</span> : null}
                        {t.missing_log ? <span className="bx-tag miss">Isı kaydı yok</span> : t.log_count ? <span className="bx-tag ok">{t.log_count} ısı kaydı</span> : t.pending_review ? <span className="bx-tag warn">Ekler kontrol bekliyor</span> : null}
                        {t.unknown_count ? <span className="bx-tag warn">{t.unknown_count} belirsiz ek</span> : null}
                        {t.analysis_id ? <span className="bx-tag ok">Analiz #{t.analysis_id}</span> : null}
                        {expSoon(t.min_expiry) ? <span className="bx-tag warn">Miat yakın</span> : null}
                        {t.item_names && <span style={{ color: 'var(--t3)' }}>{t.item_names.length > 60 ? t.item_names.slice(0, 60) + '…' : t.item_names}</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="cr-pn" style={{ overflow: 'hidden' }}>
              {!task ? <div className="bx-empty">Detay için soldan bir iade seçin.</div> : (
                <TaskDetail task={task} busy={busy} onReclassify={reclassify} onAi={aiClassify} onOpen={openFile} onAnalyze={sendToAnalysis} />
              )}
            </div>
          </div>
        ) : tab === 'review' ? (
          <window.CRBexReview onOpenTask={(id) => { setTab('list'); setSel(id); }} onChanged={() => { loadStatus(); loadTasks(); }} />
        ) : (
          <ReportView report={report} range={range} setRange={setRange} onOpen={(id) => { setTab('list'); setSel(id); }} />
        )}
      </CRShell>
    );
  }

  // ─── Talep kartları: her iade tek bakışta — güne göre gruplu, öncelik renkli ─────
  function TaskCards({ tasks, total, flt, setFlt, sel, isNew, onOpen }) {
    const [view, setView] = useState('all');     // all | new | action | cold
    const all = tasks || [];
    const needsAction = (t) => t.missing_log || t.pending_review || t.unknown_count;
    const counts = { all: all.length, new: all.filter(isNew).length, action: all.filter(needsAction).length, cold: all.filter(t => t.cold).length };
    const shown = all.filter(t => view === 'new' ? isNew(t) : view === 'action' ? needsAction(t) : view === 'cold' ? t.cold : true);
    const groups = [];
    shown.forEach(t => { const l = dayLabel(t.created_iso); const g = groups[groups.length - 1]; if (g && g.label === l) g.items.push(t); else groups.push({ label: l, items: [t] }); });
    const chips = [['all', 'Tümü'], ['new', 'Yeni'], ['action', 'İşlem gerekli'], ['cold', 'Soğuk zincir']];
    return (
      <div>
        <div className="cr-pn bx-cbar">
          {chips.map(([k, l]) => <span key={k} className={'bx-chip' + (view === k ? ' on' : '')} onClick={() => setView(k)}>{l} <b>{counts[k]}</b></span>)}
          <input className="cr-input" style={{ flex: 1, minWidth: 200, marginLeft: 'auto' }} placeholder="Ara: eczane, iade no, ilaç, barkod…" value={flt.q} onChange={e => setFlt(f => ({ ...f, q: e.target.value }))} />
          {(flt.cold || flt.missingLog) && <span className="bx-chip on" onClick={() => setFlt(f => ({ ...f, cold: false, missingLog: false }))}>{flt.missingLog ? 'Isı kaydı eksik' : 'Soğuk zincir'} <Ic.x size={11} /></span>}
        </div>
        {tasks === null ? <div className="cr-pn"><div className="bx-empty">Yükleniyor…</div></div>
          : !shown.length ? <div className="cr-pn"><div className="bx-empty">{total ? (view === 'new' ? 'Son bakışınızdan beri yeni talep yok.' : 'Filtreye uyan talep yok.') : 'Henüz BexFlow verisi yok. Bağlanıp senkronize edin.'}</div></div>
          : groups.map(g => (
            <div key={g.label}>
              <div className="bx-day">{g.label} · {g.items.length}</div>
              <div className="bx-cards">{g.items.map(t => <TaskCard key={t.id} t={t} on={sel === t.id} isNew={isNew(t)} onOpen={onOpen} />)}</div>
            </div>
          ))}
      </div>
    );
  }

  function TaskCard({ t, on, isNew, onOpen }) {
    const p = priority(t);
    const time = String(t.created_text || '').match(/\d{1,2}:\d{2}/);
    const note = t.last_note;
    return (
      <div className={'bx-card' + (p ? ' p-' + p : '') + (on ? ' on' : '')} onClick={() => onOpen(t.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(t.id); }}>
        <div className="bx-ch">
          <div style={{ minWidth: 0 }}>
            <div className="bx-cn">{t.pharmacy || t.title}{isNew && <span className="bx-new">YENİ</span>}</div>
            <div className="bx-cs"><span className="bx-m">#{t.ref_no || t.id}</span>{t.district ? ` · ${t.district}` : ''}{t.folder && FOLDER_NAMES[t.folder] ? ` · ${FOLDER_NAMES[t.folder]}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="bx-m" style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{time ? time[0] : ''}</div>
            <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2, maxWidth: 130 }}>{t.status || '—'}</div>
          </div>
        </div>
        <div className="bx-r2">
          {t.cold ? <span className="bx-tag cold">Soğuk zincir</span> : null}
          {t.missing_log ? <span className="bx-tag miss">Isı kaydı yok</span> : t.log_count ? <span className="bx-tag ok">{t.log_count} ısı kaydı</span> : t.pending_review ? <span className="bx-tag warn">Ekler kontrol bekliyor</span> : null}
          {t.unknown_count && !t.pending_review ? <span className="bx-tag warn">{t.unknown_count} belirsiz ek</span> : null}
          {expSoon(t.min_expiry) ? <span className="bx-tag warn">Miat yakın</span> : null}
          {t.analysis_id ? <span className="bx-tag ok">Analiz #{t.analysis_id}</span> : null}
          {!t.detail_synced_at ? <span className="bx-tag">Detay bekleniyor</span> : null}
        </div>
        <div className="bx-cm">
          <div><div className="bx-k">Kalem</div><div className="bx-v bx-m">{t.detail_synced_at ? t.item_count : '—'}</div></div>
          <div><div className="bx-k">Ek</div><div className="bx-v bx-m">{t.detail_synced_at ? t.att_count : '—'}</div></div>
          <div><div className="bx-k">Tutar</div><div className="bx-v bx-m">{t.gross_total != null ? money(t.gross_total) : '—'}</div></div>
        </div>
        {t.reason && <div style={{ fontSize: 11.5, color: 'var(--tx)' }}><span className="bx-k" style={{ marginRight: 6 }}>Neden</span>{t.reason}</div>}
        {t.item_names && <div className="bx-cp">{t.item_names}</div>}
        {note && (note.text || note.author) && (
          <div className="bx-cnote"><b style={{ color: 'var(--tx)' }}>{note.author}</b>{note.date ? <span className="bx-m" style={{ color: 'var(--t3)', display: 'inline', marginLeft: 6 }}>{note.date}</span> : null}{note.text ? <span>{note.text}</span> : null}</div>
        )}
      </div>
    );
  }

  function DetailDrawer({ onClose, children }) {
    useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
    return (
      <div className="bx-ov" onClick={onClose}>
        <div className="bx-drw" onClick={e => e.stopPropagation()}>
          <div className="bx-drwh"><span className="bx-k">Talep detayı</span><button className="bx-sbtn" onClick={onClose}><Ic.x size={12} /> Kapat (Esc)</button></div>
          {children}
        </div>
      </div>
    );
  }

  function TaskDetail({ task, busy, onReclassify, onAi, onOpen, onAnalyze }) {
    const f = task.fields || {};
    const val = (k) => (f[k] || {}).value || '';
    const logs = task.attachments.filter(a => a.category === 'isi_kaydi' && a.downloaded);
    // Öne çıkan alanlar + geri kalan tüm form alanları
    const primary = [['İade Nedeni', task.reason], ['Talep Tarihi', val('RemoteInvoice.DATESENT') || task.created_text], ['Genel Toplam', task.gross_total != null ? money(task.gross_total) : val('RemoteInvoice.GROSSTOTAL')], ['Müşteri Kodu', task.customer_code], ['Bölge', task.region], ['Birim', task.unit]];
    const rest = Object.entries(f).filter(([k, v]) => v && v.value && v.label && !/DATESENT|GROSSTOTAL|ReturnInvoiceReason|SogukZincir/.test(k));
    return (
      <div>
        <div className="bx-sec">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{task.pharmacy || task.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 3 }}><span className="bx-m">İade #{task.ref_no || '—'} · BexFlow #{task.id}</span> · {task.workflow} · <b>{task.status}</b></div>
            </div>
            {logs.length > 0 && <button className="bx-sbtn pri" disabled={busy.an} onClick={() => onAnalyze(logs)}><Ic.activity size={13} /> {logs.length > 1 ? `${logs.length} KAYDI ` : ''}ANALİZE GÖNDER</button>}
          </div>
          <div style={{ marginTop: 10 }}>
            {(task.notices || []).map((n, i) => <div key={i} className="bx-notice"><Ic.snow size={14} /> {n}</div>)}
            {task.missing_log ? <div className="bx-notice bad"><Ic.alert size={14} /> Soğuk zincir iadesi ama ekler arasında ısı kaydı bulunamadı.</div> : null}
            {task.pending_review ? <div className="bx-notice" style={{ borderColor: 'var(--amber)', background: 'var(--amberS)', color: 'var(--amber)' }}><Ic.eye size={14} /> Ekler henüz incelenmedi — ısı kaydı olup olmadığı "Ek İnceleme" sekmesinde belirlenir.</div> : null}
          </div>
          <div className="bx-kv">
            {primary.filter(([, v]) => v).map(([k, v]) => <div key={k}><div className="bx-k">{k}</div><div className="bx-v">{v}</div></div>)}
          </div>
          {rest.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11, color: 'var(--t3)', cursor: 'pointer' }}>Diğer form alanları ({rest.length})</summary>
              <div className="bx-kv" style={{ marginTop: 8 }}>{rest.map(([k, v]) => <div key={k}><div className="bx-k">{v.label}</div><div className="bx-v">{v.value}</div></div>)}</div>
            </details>
          )}
        </div>

        <div className="bx-sec">
          <div className="bx-sech"><span>Ürünler ({task.items.length})</span></div>
          {!task.items.length ? <div style={{ fontSize: 12, color: 'var(--t3)' }}>Kalem bilgisi yok.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="bx-tbl">
                <thead><tr><th>Ürün</th><th>Barkod</th><th>Miat</th><th>Miktar</th><th style={{ textAlign: 'right' }}>Tutar</th><th>Tip</th></tr></thead>
                <tbody>{task.items.map(i => (
                  <tr key={i.id}>
                    <td style={{ color: 'var(--tx)', fontWeight: 600 }}>{i.name}<div style={{ fontSize: 10.5, color: 'var(--t3)', fontWeight: 400 }}>{i.class_name}{i.purchase_date ? ` · alım ${i.purchase_date}` : ''}{i.stock_days ? ` · stok gün ${i.stock_days}` : ''}</div></td>
                    <td className="bx-m">{i.barcode}</td>
                    <td className="bx-m" style={{ color: expSoon(i.expiry_iso) ? 'var(--amber)' : undefined }}>{i.expiry || '—'}</td>
                    <td className="bx-m">{i.quantity_text || i.boxes}</td>
                    <td className="bx-m" style={{ textAlign: 'right' }}>{money(i.total)}</td>
                    <td>{i.cold ? <span className="bx-tag cold">SZ</span> : null} {i.track_type ? <span className="bx-tag">{i.track_type}</span> : null}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bx-sec">
          <div className="bx-sech"><span>Ekler ({task.attachments.length})</span><span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Sınıf yanlışsa değiştirin — kararınız kalıcıdır</span></div>
          {!task.attachments.length ? <div style={{ fontSize: 12, color: 'var(--t3)' }}>Ek yok.</div> : task.attachments.map(a => {
            const ext = BC ? BC.extOf(a.file_name) : '';
            const aiAble = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext) && a.category_source !== 'kullanici';
            return (
              <div key={a.id} className="bx-att">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bx-attn">{a.file_name}</div>
                  <div className="bx-attr">
                    <span className={'bx-tag ' + catClass(a.category)}>{CAT[a.category] || a.category}</span>
                    {' '}{a.confidence != null ? `%${Math.round(a.confidence * 100)}` : ''} · {SRC[a.category_source] || 'bekliyor'}{a.reason ? ` · ${a.reason}` : ''}
                    {!a.downloaded && <span style={{ color: 'var(--amber)' }}> · henüz indirilmedi</span>}
                    {a.analysis_id ? <span style={{ color: 'var(--ok)' }}> · Analiz #{a.analysis_id}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <select className="bx-sel" value={a.category} disabled={busy['c' + a.id]} onChange={e => onReclassify(a, e.target.value)}>
                    {Object.entries(CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  {aiAble && a.category !== 'isi_kaydi' && <button className="bx-sbtn" disabled={busy['ai' + a.id] || !a.downloaded} onClick={() => onAi(a)} title="Gemini'ye yalnızca bu dosya gönderilir">{busy['ai' + a.id] ? 'AI…' : 'AI ile sınıflandır'}</button>}
                  {a.downloaded ? <button className="bx-sbtn" onClick={() => onOpen(a)}>İndir</button> : null}
                  {a.category === 'isi_kaydi' && a.downloaded ? <button className="bx-sbtn pri" disabled={busy.an} onClick={() => onAnalyze([a])}>Analiz</button> : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bx-sec">
          <div className="bx-sech"><span>Notlar ve onay geçmişi ({task.comments.length})</span></div>
          {task.comments.map(c => (
            <div key={c.id} className="bx-note">
              <div style={{ flex: 1 }}>
                <div className="bx-nh"><b style={{ color: 'var(--tx)' }}>{c.author}</b><span className="bx-m">{c.date_text}</span>{c.action && <span className="bx-tag">{c.action}</span>}{c.status && <span>{c.status}</span>}</div>
                {c.text && <div className="bx-nt">{c.text}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ReportView({ report, range, setRange, onOpen }) {
    const exportXlsx = () => {
      if (!report || typeof XLSX === 'undefined') return;
      const wb = XLSX.utils.book_new();
      const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ bilgi: 'kayıt yok' }]), name);
      const T = report.totals;
      add('Özet', [{ 'Dönem': `${range.from} – ${range.to}`, 'İade işi': T.tasks, 'Soğuk zincir': T.cold, 'Isı kaydı eksik': T.missingLog, 'Isı kaydı olan': T.withLog, 'Analiz edilen': T.analyzed, 'Kalem': T.items, 'Toplam tutar': T.grossTotal }]);
      add('Eczane', report.byPharmacy.map(p => ({ Eczane: p.pharmacy, İlçe: p.district, 'İade': p.tasks, 'Soğuk zincir': p.cold, 'Isı kaydı eksik': p.missingLog, 'Tutar': p.total })));
      add('Ürün', report.byProduct.map(p => ({ Ürün: p.name, Barkod: p.barcode, 'SZ': p.cold ? 'Evet' : '', Satır: p.lines, Kutu: p.boxes, Tutar: p.total, 'En yakın miat': p.minExpiry })));
      add('İade nedeni', report.byReason.map(r => ({ Neden: r.reason, Adet: r.count })));
      add('Isı kaydı eksik', report.missingLogTasks.map(t => ({ 'BexFlow #': t.id, 'İade #': t.ref_no, Eczane: t.pharmacy, Tarih: t.created_text, Ürünler: t.item_names })));
      add('Miadı yakın', report.nearExpiry.map(i => ({ 'İade #': i.ref_no, Eczane: i.pharmacy, Ürün: i.name, Barkod: i.barcode, Miat: i.expiry })));
      XLSX.writeFile(wb, `BexFlow-Rapor-${range.from}_${range.to}.xlsx`);
    };
    const T = report && report.totals;
    const maxP = report ? Math.max(1, ...report.byPharmacy.map(p => p.tasks)) : 1;
    return (
      <div>
        <div className="cr-pn" style={{ padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="cr-field"><label className="cr-label">Başlangıç</label><input className="cr-input" type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /></div>
          <div className="cr-field"><label className="cr-label">Bitiş</label><input className="cr-input" type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} /></div>
          <div style={{ flex: 1 }} />
          <button className="cr-btn cr-btn2" onClick={() => window.print()} disabled={!report}><Ic.report size={14} /> Yazdır</button>
          <button className="cr-btn" onClick={exportXlsx} disabled={!report}><Ic.save size={14} /> EXCEL'E AKTAR</button>
        </div>
        {!report ? <div className="cr-pn"><div className="bx-empty">Rapor hazırlanıyor…</div></div> : (
          <>
            <div className="bx-stats">
              {[['İade işi', T.tasks], ['Soğuk zincir', T.cold], ['Isı kaydı eksik', T.missingLog, T.missingLog ? 'var(--bad)' : null], ['Ekleri incelenmemiş', T.pendingReview || 0, T.pendingReview ? 'var(--amber)' : null], ['Isı kaydı olan', T.withLog, 'var(--ok)'], ['Analiz edilen', T.analyzed], ['Toplam tutar', money(T.grossTotal)]].map(([l, v, c]) => (
                <div key={l} className="bx-stat"><div className="bx-statV" style={{ color: c || undefined, fontSize: typeof v === 'string' ? 15 : undefined }}>{v}</div><div className="bx-statL">{l}</div></div>
              ))}
            </div>
            <div className="bx-rgrid">
              <div className="cr-pn" style={{ overflow: 'hidden' }}>
                <div className="cr-ph"><div className="cr-pt">ECZANE BAZINDA</div></div>
                <div style={{ overflowX: 'auto' }}><table className="bx-tbl"><thead><tr><th>Eczane</th><th>İade</th><th></th><th>SZ</th><th>Kayıt eksik</th><th style={{ textAlign: 'right' }}>Tutar</th></tr></thead>
                  <tbody>{report.byPharmacy.slice(0, 25).map(p => <tr key={p.pharmacy}><td style={{ color: 'var(--tx)' }}>{p.pharmacy}<div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{p.district}</div></td><td className="bx-m">{p.tasks}</td><td><div className="bx-bar"><div style={{ width: (p.tasks / maxP * 100) + '%' }} /></div></td><td className="bx-m">{p.cold}</td><td className="bx-m" style={{ color: p.missingLog ? 'var(--bad)' : undefined }}>{p.missingLog}</td><td className="bx-m" style={{ textAlign: 'right' }}>{money(p.total)}</td></tr>)}</tbody></table></div>
              </div>
              <div className="cr-pn" style={{ overflow: 'hidden' }}>
                <div className="cr-ph"><div className="cr-pt">ÜRÜN BAZINDA</div></div>
                <div style={{ overflowX: 'auto' }}><table className="bx-tbl"><thead><tr><th>Ürün</th><th>Satır</th><th>Kutu</th><th>Miat</th><th style={{ textAlign: 'right' }}>Tutar</th></tr></thead>
                  <tbody>{report.byProduct.slice(0, 25).map(p => <tr key={p.barcode || p.name}><td style={{ color: 'var(--tx)' }}>{p.name} {p.cold ? <span className="bx-tag cold">SZ</span> : null}<div className="bx-m" style={{ fontSize: 10.5, color: 'var(--t3)' }}>{p.barcode}</div></td><td className="bx-m">{p.lines}</td><td className="bx-m">{p.boxes}</td><td className="bx-m" style={{ color: expSoon(p.minExpiry) ? 'var(--amber)' : undefined }}>{p.minExpiry || '—'}</td><td className="bx-m" style={{ textAlign: 'right' }}>{money(p.total)}</td></tr>)}</tbody></table></div>
              </div>
              <div className="cr-pn" style={{ overflow: 'hidden' }}>
                <div className="cr-ph"><div className="cr-pt" style={{ color: 'var(--bad)' }}>ISI KAYDI EKSİK SOĞUK ZİNCİR İADELERİ ({report.missingLogTasks.length})</div></div>
                {!report.missingLogTasks.length ? <div className="bx-empty">Bu dönemde eksik ısı kaydı yok.</div> : (
                  <table className="bx-tbl"><thead><tr><th>İade #</th><th>Eczane</th><th>Tarih</th><th>Ürünler</th></tr></thead>
                    <tbody>{report.missingLogTasks.map(t => <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(t.id)}><td className="bx-m">{t.ref_no || t.id}</td><td style={{ color: 'var(--tx)' }}>{t.pharmacy}</td><td className="bx-m">{t.created_text}</td><td>{t.item_names}</td></tr>)}</tbody></table>
                )}
              </div>
              <div className="cr-pn" style={{ overflow: 'hidden' }}>
                <div className="cr-ph"><div className="cr-pt">İADE NEDENLERİ · MİADI 6 AY İÇİNDE DOLAN ({report.nearExpiry.length})</div></div>
                <table className="bx-tbl"><tbody>{report.byReason.map(r => <tr key={r.reason}><td>{r.reason}</td><td className="bx-m" style={{ textAlign: 'right' }}>{r.count}</td></tr>)}</tbody></table>
                {report.nearExpiry.length > 0 && <table className="bx-tbl" style={{ borderTop: '1px solid var(--ln2)' }}><thead><tr><th>Ürün</th><th>Eczane</th><th>Miat</th></tr></thead>
                  <tbody>{report.nearExpiry.slice(0, 20).map((i, k) => <tr key={k} style={{ cursor: 'pointer' }} onClick={() => onOpen(i.task_id)}><td style={{ color: 'var(--tx)' }}>{i.name}</td><td>{i.pharmacy}</td><td className="bx-m" style={{ color: 'var(--amber)' }}>{i.expiry}</td></tr>)}</tbody></table>}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  window.CRBexflow = CRBexflow;
})();
