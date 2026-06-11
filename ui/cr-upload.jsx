/* Veri Yükleme sayfası — GERÇEK dosya yükleme + analiz pipeline'ı (Kontrol Odası dili) */
(function () {
  const { useState, useRef } = React;
  const { CCIcons: Ic, CRShell, CCStore, CCPipeline } = window;

  const UP_CSS = `
  /* Stepper */
  .up-stepper{display:flex;align-items:center;background:var(--pn);border:1px solid var(--ln2);border-radius:12px;padding:14px 22px;margin-bottom:16px;}
  .up-stepItem{display:flex;align-items:center;gap:11px;flex-shrink:0;cursor:default;}
  .up-stepItem.clickable{cursor:pointer;}
  .up-stepNum{width:28px;height:28px;border-radius:50%;background:var(--pn2);border:1px solid var(--ln2);color:var(--t3);display:grid;place-items:center;font-size:12px;font-weight:700;flex-shrink:0;transition:.16s;font-family:'JetBrains Mono',monospace;}
  .up-stepItem.done .up-stepNum{background:var(--ok);border-color:var(--ok);color:#04121a;}
  .up-stepItem.active .up-stepNum{background:var(--sig);border-color:var(--sig);color:#04121a;box-shadow:0 0 0 4px var(--sigS);}
  .up-stepLbl{font-size:12.5px;font-weight:600;color:var(--t2);white-space:nowrap;line-height:1.2;}
  .up-stepItem.active .up-stepLbl{color:var(--tx);}
  .up-stepItem.done .up-stepLbl{color:var(--ok);}
  .up-stepSub{font-size:9px;letter-spacing:.8px;text-transform:uppercase;color:var(--t3);font-weight:700;margin-top:3px;}
  .up-stepConn{flex:1;height:2px;background:var(--ln2);border-radius:2px;margin:0 18px;transition:.16s;min-width:24px;}
  .up-stepConn.on{background:var(--sig);opacity:.55;}
  /* Step content + nav */
  .up-stepContent{animation:upfade .2s ease;}
  @keyframes upfade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  .up-nav{display:flex;align-items:center;gap:12px;margin-top:18px;}
  .up-nav .up-spc{flex:1;}
  .up-formCol{display:flex;flex-direction:column;gap:14px;padding:20px;}
  .up-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .up-grid{display:grid;grid-template-columns:1.62fr 1fr;gap:16px;margin-bottom:0;align-items:start;}
  .up-drop{border:1.5px dashed var(--ln2);border-radius:12px;background:var(--pn);padding:30px 24px;text-align:center;cursor:pointer;transition:.15s;}
  .up-drop:hover,.up-drop.drag{border-color:var(--sig);background:var(--sigS);}
  .up-dropIc{width:52px;height:52px;border-radius:13px;background:var(--sigS);color:var(--sig);display:grid;place-items:center;margin:0 auto 13px;transition:.15s;}
  .up-drop.drag .up-dropIc{transform:translateY(-3px);}
  .up-dropT{font-size:15px;font-weight:600;}
  .up-dropS{font-size:12px;color:var(--t2);margin-top:5px;}
  .up-formats{display:flex;gap:7px;justify-content:center;margin-top:15px;flex-wrap:wrap;}
  .up-fmt{font-size:10px;font-family:'JetBrains Mono',monospace;letter-spacing:.4px;color:var(--t2);background:var(--pn2);border:1px solid var(--ln);padding:4px 9px;border-radius:6px;}
  .up-queue{margin-top:14px;display:flex;flex-direction:column;gap:8px;}
  .up-row{display:flex;align-items:center;gap:13px;background:var(--pn);border:1px solid var(--ln2);border-radius:10px;padding:11px 14px;}
  .up-fic{width:38px;height:38px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;}
  .up-finfo{min-width:0;flex-shrink:0;width:218px;}
  .up-fname{font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .up-fmeta{font-size:10.5px;color:var(--t3);margin-top:2px;font-family:'JetBrains Mono',monospace;}
  .up-smart{font-size:8.5px;letter-spacing:.6px;text-transform:uppercase;font-weight:700;color:var(--sig);background:var(--sigS);border:1px solid var(--sig);padding:2px 5px;border-radius:4px;flex-shrink:0;}
  .up-prog{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0;}
  .up-bar{height:6px;border-radius:4px;background:var(--pn2);border:1px solid var(--ln);overflow:hidden;}
  .up-barf{height:100%;background:var(--sig);border-radius:4px;transition:width .35s ease;}
  .up-fstat{font-size:10.5px;font-family:'JetBrains Mono',monospace;white-space:nowrap;}
  .up-rm{width:28px;height:28px;border-radius:7px;border:1px solid var(--ln2);background:transparent;display:grid;place-items:center;color:var(--t3);cursor:pointer;flex-shrink:0;transition:.13s;}
  .up-rm:hover{color:var(--bad);border-color:var(--bad);}
  .up-actions{display:flex;gap:12px;margin-top:14px;}
  .up-step{display:flex;align-items:center;gap:11px;padding:11px 18px;border-bottom:1px solid var(--ln);font-size:12.5px;}
  .up-stepIc{width:25px;height:25px;border-radius:6px;display:grid;place-items:center;flex-shrink:0;}
  .up-stepTx{flex:1;}
  .up-stepT{font-size:9.5px;font-family:'JetBrains Mono',monospace;color:var(--t3);}
  .up-result{display:flex;align-items:center;gap:13px;padding:15px 18px;border-top:2px solid var(--sig);background:var(--sigS);}
  .up-err{display:flex;align-items:flex-start;gap:11px;padding:14px 18px;border-top:2px solid var(--bad);background:var(--badS);font-size:12.5px;color:var(--bad);line-height:1.5;}
  .up-low{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  .up-acwrap{position:relative;}
  .up-ac{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--pn);border:1px solid var(--ln2);border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,.4);z-index:30;max-height:220px;overflow-y:auto;padding:4px;}
  .up-aci{padding:9px 11px;font-size:12px;color:var(--t2);border-radius:6px;cursor:pointer;font-family:'JetBrains Mono',monospace;}
  .up-aci:hover{background:var(--pn2);color:var(--tx);}
  .up-spin{width:18px;height:18px;border:2px solid var(--ln2);border-top-color:var(--sig);border-radius:50%;animation:upspin .8s linear infinite;}
  @keyframes upspin{to{transform:rotate(360deg)}}
  .up-mapBtn{font-size:11px;color:var(--sig);background:transparent;border:none;cursor:pointer;padding:4px 8px;border-radius:4px;display:inline-flex;align-items:center;gap:4px;margin-top:5px;transition:.15s;font-weight:600;}
  .up-mapBtn:hover{background:var(--sigS);}
  .up-mapPanel{background:var(--pn2);border:1px solid var(--ln);border-radius:8px;padding:12px;margin-top:8px;animation:upfade .25s ease;}
  .up-mapGrid{display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:12px;}
  .up-mapField{display:flex;flex-direction:column;gap:4px;}
  .up-mapLabel{font-size:10px;text-transform:uppercase;color:var(--t3);font-weight:700;letter-spacing:.3px;}
  .up-mapSelect{background:var(--pn);border:1px solid var(--ln2);border-radius:6px;color:var(--tx);padding:5px 8px;font-size:11.5px;outline:none;font-family:'Space Grotesk',sans-serif;}
  .up-mapSelect:focus{border-color:var(--sig);}
  .up-previewTbl{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px;font-family:'JetBrains Mono',monospace;}
  .up-previewTbl th{text-align:left;color:var(--t3);padding:4px 6px;background:var(--pn);border-bottom:1px solid var(--ln2);font-size:10px;}
  .up-previewTbl td{padding:4px 6px;color:var(--t2);border-bottom:1px solid var(--ln);}
  `;

  const RANGES = {
    cold: { label: 'Soğuk Zincir Standart · 2–8°C', min: 2, max: 8 },
    frozen: { label: 'Dondurulmuş · −25…−15°C', min: -25, max: -15 },
    room: { label: 'Kontrollü Oda · 15–25°C', min: 15, max: 25 },
    deep: { label: 'Derin Dondurucu · ≤ −60°C', min: -80, max: -60 },
    custom: { label: 'Özel Aralık', min: 2, max: 8 },
  };
  const REASONS = ['Soğuk Zincir İhlali Şüphesi', 'Satış İadesi', 'Miad Yaklaşması / Geçmesi', 'Hasarlı Ürün (Fiziksel)'];
  const STEPS = [
    { id: 1, lbl: 'Dosya & Sıcaklık' },
    { id: 2, lbl: 'İlaç & Eczane' },
    { id: 3, lbl: 'İade & Finansal' },
  ];
  const FORMULARY = (window.DrugFormulary && window.DrugFormulary.map(d => d.name)) ||
    ['LANTUS SOLOSTAR 100 IU/ML', 'HUMIRA 40 MG', 'ENBREL 50 MG', 'NOVORAPID FLEXPEN', 'COMIRNATY COVID-19 AŞISI', 'CLEXANE 6000 IU', 'EYLEA 40 MG/ML', 'LUCENTIS 10 MG/ML', 'OZEMPIC 1 MG', 'TRESIBA FLEXTOUCH'];

  const kindColor = { pdf: ['var(--bad)', 'var(--badS)'], excel: ['var(--ok)', 'var(--okS)'], csv: ['var(--amber)', 'var(--amberS)'], image: ['var(--rev)', 'var(--revS)'] };
  const stCol = { ok: ['var(--ok)', 'var(--okS)'], warn: ['var(--amber)', 'var(--amberS)'], bad: ['var(--bad)', 'var(--badS)'] };
  const decCol = { accept: 'var(--ok)', reject: 'var(--bad)', revize: 'var(--rev)', conditional: 'var(--amber)' };

  function detectKind(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'xlsx' || ext === 'xls') return 'excel';
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return 'csv';
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext)) return 'image';
    return 'excel';
  }
  function fmtSize(bytes) { return (window.Utils && Utils.formatFileSize) ? Utils.formatFileSize(bytes) : (bytes / 1024).toFixed(0) + ' KB'; }
  let seq = 0;

  function CRUpload({ theme, onNav = () => {} }) {
    const CRScanLoader = window.CRScanLoader;
    const fileRef = useRef(null);
    const [files, setFiles] = useState([]);     // {id, file, name, kind, size, ai, prog, status, done, error}
    const [drag, setDrag] = useState(false);
    const [range, setRange] = useState('cold');
    const [limits, setLimits] = useState({ lo: 2, hi: 8, tor: 120 });
    const [form, setForm] = useState({ pharmacy: '', batch: '', drug: '', serial: '', purchaseDate: '', returnDate: '', reason: REASONS[0], barcode: '', qty: '', expiry: '', amount: '' });
    const [acOpen, setAcOpen] = useState(false);
    const [pipe, setPipe] = useState([]);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);  // {rowCount, mkt, tor, decision, label}
    const [error, setError] = useState(null);
    const [step, setStep] = useState(1);

    const canAdvance = () => {
      if (step === 1) return files.length > 0;
      return true;
    };
    const goNext = () => { if (canAdvance() && step < 3) setStep(step + 1); };
    const goPrev = () => { if (step > 1 && !running) setStep(step - 1); };

    const setF = (k, v) => setForm(s => ({ ...s, [k]: v }));

    const detectFileColumns = async (fileObj) => {
      const { file } = fileObj;
      try {
        const ext = file.name.split('.').pop().toLowerCase();
        let rawData = null;
        if (ext === 'xlsx' || ext === 'xls') {
          rawData = await DataParser.readExcel(file);
        } else if (ext === 'csv') {
          rawData = await DataParser.readCSV(file);
        } else if (ext === 'pdf') {
          // PDF: Arka planda AI ile şema tespiti yap
          setFiles(current => current.map(f => f.id === fileObj.id ? { ...f, status: 'Şema öğreniliyor...' } : f));
          const res = await SmartParser.discoverSchema(file, 1);
          if (res.success && res.schema) {
            const schema = res.schema;
            // Tarayıcı tarafında hızlı re-parse
            setFiles(current => current.map(f => f.id === fileObj.id ? { ...f, status: 'Numune toplanıyor...' } : f));
            const harvest = await SmartParser.harvestWithDeterministicParser(file, schema);
            const previewRows = (harvest.data || []).slice(0, 3).map(r => ({
              date: Utils.formatDateTime(r.timestamp),
              temp: r.temperature
            }));
            
            setFiles(current => current.map(f => f.id === fileObj.id ? {
              ...f,
              rows: previewRows,
              status: 'Şema hazır',
              columnMapping: {
                dateOrder: schema.dateOrder || 'dmy',
                dateSep: schema.dateSep || '.',
                timeSep: schema.timeSep || ':',
                decimalSep: schema.decimalSep || ',',
                tempColIndex: schema.tempColIndex ?? 0,
                deviceBrand: schema.deviceBrand || 'Otomatik',
                deviceSerial: schema.deviceSerial || ''
              }
            } : f));
          } else {
            setFiles(current => current.map(f => f.id === fileObj.id ? { ...f, status: 'Hazır (Otomatik AI)' } : f));
          }
          return;
        }
        
        if (rawData && rawData.headers && rawData.headers.length) {
          const mapping = await DataParser.detectColumns(rawData.headers, rawData.rows);
          setFiles(current => current.map(f => f.id === fileObj.id ? {
            ...f,
            headers: rawData.headers,
            rows: rawData.rows.slice(0, 3),
            columnMapping: {
              dateCol: mapping.dateCol || rawData.headers[0] || '',
              timeCol: mapping.timeCol || '__same__',
              tempCol: mapping.tempCol || rawData.headers[1] || '',
              humidityCol: mapping.humidityCol || '__none__'
            }
          } : f));
        }
      } catch (e) {
        console.error("Belge analizi başarısız:", file.name, e);
        setFiles(current => current.map(f => f.id === fileObj.id ? { ...f, status: 'Hazır (Hata: ' + e.message + ')' } : f));
      }
    };

    const updateFileMapping = async (fileId, key, value) => {
      let updatedFile = null;
      
      setFiles(current => {
        return current.map(f => {
          if (f.id === fileId) {
            const nextMapping = {
              ...f.columnMapping,
              [key]: value
            };
            updatedFile = { ...f, columnMapping: nextMapping };
            return updatedFile;
          }
          return f;
        });
      });

      // PDF ise, yeni şemayla arka planda tekrar parse et ve önizlemeyi güncelle!
      if (updatedFile && updatedFile.kind === 'pdf' && updatedFile.columnMapping) {
        try {
          setFiles(current => current.map(f => f.id === fileId ? { ...f, status: 'Güncelleniyor...' } : f));
          const harvest = await SmartParser.harvestWithDeterministicParser(updatedFile.file, updatedFile.columnMapping);
          const previewRows = (harvest.data || []).slice(0, 3).map(r => ({
            date: Utils.formatDateTime(r.timestamp),
            temp: r.temperature
          }));
          setFiles(current => current.map(f => f.id === fileId ? { ...f, rows: previewRows, status: 'Şema güncellendi' } : f));
        } catch (e) {
          console.error("PDF anlık re-parse başarısız:", e);
          setFiles(current => current.map(f => f.id === fileId ? { ...f, status: 'Re-parse hatası' } : f));
        }
      }
    };
    
    const toggleShowMapping = (fileId) => {
      setFiles(current => current.map(f => {
        if (f.id === fileId) {
          return {
            ...f,
            showMapping: !f.showMapping
          };
        }
        return f;
      }));
    };

    const addFiles = (fileList) => {
      const arr = Array.from(fileList || []);
      if (!arr.length) return;
      setError(null); setResult(null); setPipe([]);
      const newFiles = arr.map(file => {
        const kind = detectKind(file.name);
        return { 
          id: 'f' + (++seq), 
          file, 
          name: file.name, 
          kind, 
          size: fmtSize(file.size), 
          ai: kind === 'pdf' || kind === 'image', 
          prog: 0, 
          status: 'Hazır', 
          done: false, 
          error: false,
          headers: [],
          rows: [],
          columnMapping: null,
          showMapping: false
        };
      });
      setFiles(prev => [...prev, ...newFiles]);
      newFiles.forEach(f => {
        if (f.kind === 'excel' || f.kind === 'csv' || f.kind === 'pdf') {
          detectFileColumns(f);
        }
      });
    };
    const removeFile = id => setFiles(f => f.filter(x => x.id !== id));

    const onRange = v => { setRange(v); const r = RANGES[v]; setLimits(l => ({ ...l, lo: r.min, hi: r.max })); };

    const runAnalysis = async () => {
      if (running) return;
      if (!files.length) { setError('Önce en az bir dosya yükleyin.'); return; }
      setRunning(true); setResult(null); setError(null); setPipe([]);
      // ilerleme çubuklarını sıfırla
      setFiles(f => f.map(x => ({ ...x, prog: 0, status: x.ai ? 'Smart bekliyor' : 'Hazır', done: false, error: false })));

      const cfg = { lowerLimit: limits.lo, upperLimit: limits.hi, torLimit: limits.tor };
      try {
        const out = await CCPipeline.run(
          files.map(f => {
            const cleanMapping = f.columnMapping ? { ...f.columnMapping } : null;
            if (cleanMapping && f.kind !== 'pdf') {
              if (cleanMapping.timeCol === '__same__' || cleanMapping.timeCol === '__none__') {
                cleanMapping.timeCol = '';
              }
              if (cleanMapping.humidityCol === '__none__') {
                cleanMapping.humidityCol = '';
              }
            }
            return { id: f.id, file: f.file, columnMapping: cleanMapping };
          }),
          form, cfg,
          {
            onStep: (s) => setPipe(p => [...p, s]),
            onFile: (id, pct, status, isErr) => setFiles(f => f.map(x => x.id === id ? { ...x, prog: Math.round(pct), status, done: pct >= 100 && !isErr, error: !!isErr } : x)),
          }
        );
        CCStore.set({ scenario: out.scenario, record: serializeRecord(out.record), savedId: null });
        setResult({ rowCount: out.rowCount, mkt: out.mkt, tor: out.tor, decision: out.decision.decision, label: (window.CCPipeline, out.scenario.label) });
        setRunning(false);
      } catch (err) {
        setRunning(false);
        setError(err.message || 'Analiz sırasında bir hata oluştu.');
      }
    };

    // record içindeki Date alanlarını JSON-uyumlu hale getir (kaydetme için saklanır)
    function serializeRecord(r) {
      try { return JSON.parse(JSON.stringify(r)); } catch (e) { return r; }
    }

    const clearAll = () => { setFiles([]); setPipe([]); setResult(null); setError(null); };

    const acList = form.drug ? FORMULARY.filter(d => d.toUpperCase().includes(form.drug.toUpperCase())).slice(0, 8) : [];
    const PIPE_TOTAL = 6;

    return (
      <CRShell theme={theme} active="upload" onNav={onNav}>
        <div className="cr-hr">
          <div><div className="cr-h1">Veri Yükleme</div><div className="cr-h1sub">Adım {step} / 3 · {STEPS[step - 1].lbl}</div></div>
          <button className="cr-btn cr-btn2" onClick={() => onNav('dashboard')}><Ic.chevL size={15} /> KONTROL PANELİ</button>
        </div>

        <style>{UP_CSS}</style>

        <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.bmp"
          style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

        {/* Stepper */}
        <div className="up-stepper">
          {STEPS.map((s, i) => {
            const isActive = step === s.id;
            const isDone = step > s.id;
            const clickable = isDone || (isActive ? false : (s.id === step + 1 && canAdvance()));
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <div className={'up-stepConn' + (step >= s.id ? ' on' : '')} />}
                <div className={'up-stepItem' + (isActive ? ' active' : '') + (isDone ? ' done' : '') + (clickable ? ' clickable' : '')}
                     onClick={() => { if (clickable && !running) setStep(s.id); }}>
                  <span className="up-stepNum">{isDone ? <Ic.check size={13} sw={3} /> : s.id}</span>
                  <div>
                    <div className="up-stepLbl">{s.lbl}</div>
                    <div className="up-stepSub">{isDone ? 'Tamamlandı' : isActive ? 'Aktif adım' : 'Bekliyor'}</div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Step 1: Dosya & Sıcaklık */}
        {step === 1 && (
          <div className="up-stepContent up-grid">
            <div>
              <div className={'up-drop' + (drag ? ' drag' : '')}
                onClick={() => fileRef.current && fileRef.current.click()}
                onDragEnter={e => { e.preventDefault(); setDrag(true); }}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={e => { e.preventDefault(); setDrag(false); }}
                onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
                <div className="up-dropIc"><Ic.upload size={24} /></div>
                <div className="up-dropT">Dosyaları sürükleyip bırakın</div>
                <div className="up-dropS">veya bilgisayardan seçmek için tıklayın · birden fazla dosya desteklenir</div>
                <div className="up-formats">{['.xlsx', '.csv', '.pdf', '.png / .jpg'].map(f => <span key={f} className="up-fmt">{f}</span>)}</div>
              </div>

              {files.length > 0 && (
                <div className="up-queue">
                  {files.map(f => {
                    const [c, bg] = kindColor[f.kind] || kindColor.excel;
                    return (
                      <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--pn)', border: '1px solid var(--ln2)', borderRadius: 10, padding: '4px 0', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '8px 14px' }}>
                          <div className="up-fic" style={{ color: c, background: bg }}><Ic.report size={19} /></div>
                          <div className="up-finfo" style={{ flex: 1, minWidth: 0 }}>
                            <div className="up-fname" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}{f.ai && <span className="up-smart">Smart</span>}</div>
                            <div className="up-fmeta">{f.size} · {f.kind.toUpperCase()}</div>
                            {f.columnMapping && (
                              <button className="up-mapBtn" onClick={() => toggleShowMapping(f.id)}>
                                <Ic.grid size={12} /> {f.showMapping ? 'Eşleştirmeyi Gizle' : 'Sütun Eşleştirmeyi Düzenle'}
                              </button>
                            )}
                          </div>
                          <div className="up-prog" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                            <div className="up-bar"><div className="up-barf" style={{ width: f.prog + '%', background: f.error ? 'var(--bad)' : f.done ? 'var(--ok)' : 'var(--sig)' }} /></div>
                            <div className="up-fstat" style={{ color: f.error ? 'var(--bad)' : f.done ? 'var(--ok)' : 'var(--t2)' }}>{f.done ? '✓ ' : ''}{f.status}</div>
                          </div>
                          <button className="up-rm" onClick={() => removeFile(f.id)}><Ic.x size={14} /></button>
                        </div>
                        
                        {f.columnMapping && f.showMapping && f.kind !== 'pdf' && (
                          <div className="up-mapPanel" style={{ margin: '4px 14px 10px' }}>
                            <div className="up-mapGrid">
                              <div className="up-mapField">
                                <label className="up-mapLabel">Tarih Sütunu</label>
                                <select className="up-mapSelect" value={f.columnMapping.dateCol} 
                                        onChange={e => updateFileMapping(f.id, 'dateCol', e.target.value)}>
                                  {f.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </div>
                              <div className="up-mapField">
                                <label className="up-mapLabel">Saat Sütunu</label>
                                <select className="up-mapSelect" value={f.columnMapping.timeCol} 
                                        onChange={e => updateFileMapping(f.id, 'timeCol', e.target.value)}>
                                  <option value="__same__">[Tarih Sütunu ile Aynı / Birleşik]</option>
                                  <option value="__none__">[Saat Yok / 00:00]</option>
                                  {f.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </div>
                              <div className="up-mapField">
                                <label className="up-mapLabel">Sıcaklık Sütunu</label>
                                <select className="up-mapSelect" value={f.columnMapping.tempCol} 
                                        onChange={e => updateFileMapping(f.id, 'tempCol', e.target.value)}>
                                  {f.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </div>
                              <div className="up-mapField">
                                <label className="up-mapLabel">Nem Sütunu</label>
                                <select className="up-mapSelect" value={f.columnMapping.humidityCol || '__none__'} 
                                        onChange={e => updateFileMapping(f.id, 'humidityCol', e.target.value === '__none__' ? '' : e.target.value)}>
                                  <option value="__none__">[Nem Yok]</option>
                                  {f.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </div>
                            </div>
                            
                            {/* Veri Önizleme */}
                            {f.rows && f.rows.length > 0 && (
                              <div style={{ marginTop: 10, overflowX: 'auto' }}>
                                <div className="up-mapLabel" style={{ marginBottom: 4 }}>Veri Önizleme (İlk {f.rows.length} Satır)</div>
                                <table className="up-previewTbl">
                                  <thead>
                                    <tr>
                                      <th style={{ padding: '4px 6px', textAlign: 'left' }}>Tarih ({f.columnMapping.dateCol})</th>
                                      {f.columnMapping.timeCol !== '__same__' && f.columnMapping.timeCol !== '__none__' && (
                                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Saat ({f.columnMapping.timeCol})</th>
                                      )}
                                      <th style={{ padding: '4px 6px', textAlign: 'left' }}>Sıcaklık ({f.columnMapping.tempCol})</th>
                                      {f.columnMapping.humidityCol && f.columnMapping.humidityCol !== '__none__' && (
                                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Nem ({f.columnMapping.humidityCol})</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {f.rows.map((row, idx) => (
                                      <tr key={idx}>
                                        <td style={{ padding: '4px 6px' }}>{String(row[f.columnMapping.dateCol] || '—')}</td>
                                        {f.columnMapping.timeCol !== '__same__' && f.columnMapping.timeCol !== '__none__' && (
                                          <td style={{ padding: '4px 6px' }}>{String(row[f.columnMapping.timeCol] || '—')}</td>
                                        )}
                                        <td style={{ padding: '4px 6px' }}>{String(row[f.columnMapping.tempCol] || '—')}</td>
                                        {f.columnMapping.humidityCol && f.columnMapping.humidityCol !== '__none__' && (
                                          <td style={{ padding: '4px 6px' }}>{String(row[f.columnMapping.humidityCol] || '—')}</td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {f.columnMapping && f.showMapping && f.kind === 'pdf' && (
                          <div className="up-mapPanel" style={{ margin: '4px 14px 10px' }}>
                            <div className="up-mapGrid">
                              <div className="up-mapField">
                                <label className="up-mapLabel">Tarih Düzeni (Date Order)</label>
                                <select className="up-mapSelect" value={f.columnMapping.dateOrder} 
                                        onChange={e => updateFileMapping(f.id, 'dateOrder', e.target.value)}>
                                  <option value="dmy">dmy (GG.AA.YYYY)</option>
                                  <option value="mdy">mdy (AA/GG/YYYY)</option>
                                  <option value="ymd">ymd (YYYY-AA-GG)</option>
                                </select>
                              </div>
                              <div className="up-mapField">
                                <label className="up-mapLabel">Derece Sütun İndeksi</label>
                                <select className="up-mapSelect" value={f.columnMapping.tempColIndex} 
                                        onChange={e => updateFileMapping(f.id, 'tempColIndex', parseInt(e.target.value))}>
                                  <option value={0}>0 (İlk / Dolap Sıcaklığı)</option>
                                  <option value={1}>1 (İkinci / Ortam Sıcaklığı)</option>
                                  <option value={2}>2 (Üçüncü Sıcaklık)</option>
                                </select>
                              </div>
                              <div className="up-mapField">
                                <label className="up-mapLabel">Tarih Ayracı</label>
                                <select className="up-mapSelect" value={f.columnMapping.dateSep} 
                                        onChange={e => updateFileMapping(f.id, 'dateSep', e.target.value)}>
                                  <option value=".">. (Nokta)</option>
                                  <option value="/">/ (Slaş)</option>
                                  <option value="-">- (Tire)</option>
                                  <option value=" ">[Boşluk]</option>
                                </select>
                              </div>
                              <div className="up-mapField">
                                <label className="up-mapLabel">Ondalık Ayracı</label>
                                <select className="up-mapSelect" value={f.columnMapping.decimalSep} 
                                        onChange={e => updateFileMapping(f.id, 'decimalSep', e.target.value)}>
                                  <option value=",">, (Virgül)</option>
                                  <option value=".">. (Nokta)</option>
                                </select>
                              </div>
                            </div>
                            
                            {/* Veri Önizleme */}
                            {f.rows && f.rows.length > 0 && (
                              <div style={{ marginTop: 10, overflowX: 'auto' }}>
                                <div className="up-mapLabel" style={{ marginBottom: 4 }}>PDF Okuma Numunesi (İlk {f.rows.length} Kayıt)</div>
                                <table className="up-previewTbl">
                                  <thead>
                                    <tr>
                                      <th style={{ padding: '4px 6px', textAlign: 'left' }}>Tarih & Saat</th>
                                      <th style={{ padding: '4px 6px', textAlign: 'left' }}>Sıcaklık</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {f.rows.map((row, idx) => (
                                      <tr key={idx}>
                                        <td style={{ padding: '4px 6px' }}>{row.date}</td>
                                        <td style={{ padding: '4px 6px' }}>{row.temp}°C</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="cr-pn">
              <div className="cr-ph"><div className="cr-pt"><Ic.thermo size={15} style={{ color: 'var(--sig)' }} /> SICAKLIK AYARLARI</div></div>
              <div className="up-formCol">
                <div className="cr-field">
                  <label className="cr-label">Sıcaklık Aralığı (Saklama Koşulu)</label>
                  <select className="cr-select" value={range} onChange={e => onRange(e.target.value)}>
                    {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="up-row2">
                  <div className="cr-field"><label className="cr-label">Alt Limit °C</label><input className="cr-input" type="number" value={limits.lo} onChange={e => setLimits(l => ({ ...l, lo: e.target.value }))} /></div>
                  <div className="cr-field"><label className="cr-label">Üst Limit °C</label><input className="cr-input" type="number" value={limits.hi} onChange={e => setLimits(l => ({ ...l, hi: e.target.value }))} /></div>
                </div>
                <div className="cr-field"><label className="cr-label">TOR Limiti (dakika)</label><input className="cr-input" type="number" value={limits.tor} onChange={e => setLimits(l => ({ ...l, tor: e.target.value }))} /></div>
                <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5, paddingTop: 4, borderTop: '1px solid var(--ln)' }}>
                  Seçilen banda göre MKT ve TOR otomatik değerlendirilir. Standart soğuk zincir için <b style={{ color: 'var(--sig)' }}>2–8°C</b> önerilir.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: İlaç & Eczane */}
        {step === 2 && (
          <div className="up-stepContent cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.pill size={15} style={{ color: 'var(--sig)' }} /> İLAÇ & ECZANE BİLGİLERİ</div></div>
            <div className="up-formCol">
              <div className="up-row2">
                <div className="cr-field"><label className="cr-label">Eczane</label><input className="cr-input" placeholder="ör: Hayat Eczanesi" value={form.pharmacy} onChange={e => setF('pharmacy', e.target.value)} /></div>
                <div className="cr-field"><label className="cr-label">Parti Numarası</label><input className="cr-input" placeholder="ör: BN23847" value={form.batch} onChange={e => setF('batch', e.target.value)} /></div>
              </div>
              <div className="cr-field up-acwrap">
                <label className="cr-label">İlaç Adı</label>
                <input className="cr-input" placeholder="İlaç adını yazın…" value={form.drug}
                  onChange={e => { setF('drug', e.target.value); setAcOpen(true); }}
                  onFocus={() => setAcOpen(true)} onBlur={() => setTimeout(() => setAcOpen(false), 150)} />
                {acOpen && acList.length > 0 && (
                  <div className="up-ac">
                    {acList.map(d => <div key={d} className="up-aci" onMouseDown={() => { setF('drug', d); setAcOpen(false); }}>{d}</div>)}
                  </div>
                )}
              </div>
              <div className="up-row2">
                <div className="cr-field"><label className="cr-label">Satın Alma Tarihi</label><input className="cr-input" type="date" value={form.purchaseDate} onChange={e => setF('purchaseDate', e.target.value)} /></div>
                <div className="cr-field"><label className="cr-label">İade Talebi Tarihi</label><input className="cr-input" type="date" value={form.returnDate} onChange={e => setF('returnDate', e.target.value)} /></div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: İade & Finansal + Analiz */}
        {step === 3 && (
          <div className="up-stepContent" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="cr-pn">
              <div className="cr-ph"><div className="cr-pt"><Ic.report size={15} style={{ color: 'var(--sig)' }} /> İADE & FİNANSAL DETAYLAR (ERP)</div></div>
              <div className="up-formCol">
                <div className="cr-field">
                  <label className="cr-label">İade Nedeni</label>
                  <select className="cr-select" value={form.reason} onChange={e => setF('reason', e.target.value)}>{REASONS.map(r => <option key={r}>{r}</option>)}</select>
                </div>
                <div className="up-row2">
                  <div className="cr-field"><label className="cr-label">Barkod (GTIN)</label><input className="cr-input" placeholder="ör: 8681308…" value={form.barcode} onChange={e => setF('barcode', e.target.value)} /></div>
                  <div className="cr-field"><label className="cr-label">Miktar (Kutu)</label><input className="cr-input" type="number" placeholder="ör: 10" value={form.qty} onChange={e => setF('qty', e.target.value)} /></div>
                </div>
                <div className="up-row2">
                  <div className="cr-field"><label className="cr-label">Miad (SKT)</label><input className="cr-input" type="month" value={form.expiry} onChange={e => setF('expiry', e.target.value)} /></div>
                  <div className="cr-field"><label className="cr-label">Genel Toplam (₺)</label><input className="cr-input" type="number" placeholder="ör: 3500.50" value={form.amount} onChange={e => setF('amount', e.target.value)} /></div>
                </div>
              </div>
            </div>

            {(pipe.length > 0 || running || error || result) && (
              <div className="cr-pn" style={{ overflow: 'hidden' }}>
                <div className="cr-ph"><div className="cr-pt"><Ic.activity size={15} style={{ color: 'var(--sig)' }} /> YAPAY ZEKA BELGE ANALİZİ</div>
                  <span className="cr-up" style={{ color: 'var(--t3)' }}>{pipe.length}/{PIPE_TOTAL} ADIM</span></div>
                {running && CRScanLoader && <CRScanLoader theme={theme} />}
                {pipe.map((s, i) => { const [c, bg] = stCol[s.st]; const C = Ic[s.ic] || Ic.check; return (
                  <div key={i} className="up-step">
                    <div className="up-stepIc" style={{ color: c, background: bg }}><C size={14} /></div>
                    <div className="up-stepTx"><div>{s.tx}</div></div>
                    <div className="up-stepT" style={{ color: c }}>{s.t}</div>
                  </div>); })}
                {error && (
                  <div className="up-err">
                    <Ic.alert size={17} />
                    <div><b>Analiz başarısız.</b> {error}<br /><span style={{ color: 'var(--t2)', fontSize: 11.5 }}>İpucu: Sunucunun çalıştığından (npm start) ve .env içinde GEMINI_API_KEY olduğundan emin olun.</span></div>
                  </div>
                )}
                {result && (
                  <div className="up-result">
                    <div className="up-stepIc" style={{ color: decCol[result.decision] || 'var(--ok)', background: 'var(--okS)' }}><Ic.check size={15} sw={2.4} /></div>
                    <div style={{ flex: 1, fontSize: 13 }}><b>{result.rowCount.toLocaleString('tr-TR')} kayıt</b> birleştirildi → <b className="cr-m">MKT {result.mkt}°C</b> · <b className="cr-m">TOR {result.tor} dk</b></div>
                    <span className="cr-bd" style={{ color: decCol[result.decision], background: 'var(--pn2)' }}><i style={{ background: decCol[result.decision] }} />{result.label}</span>
                    <button className="cr-btn" onClick={() => onNav('analysis')} style={{ padding: '8px 13px' }}>Sonuçlar <Ic.chevR size={14} /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom navigation */}
        <div className="up-nav">
          <button className="cr-btn cr-btn2" onClick={goPrev} disabled={step === 1 || running}>
            <Ic.chevL size={14} /> Geri
          </button>
          {step === 1 && files.length > 0 && (
            <button className="cr-btn cr-btn2" onClick={clearAll} disabled={running}>Tümünü temizle</button>
          )}
          <div className="up-spc" />
          {step < 3 ? (
            <button className="cr-btn" onClick={goNext} disabled={!canAdvance()}>
              İleri <Ic.chevR size={14} />
            </button>
          ) : (
            <button className="cr-btn" onClick={runAnalysis} disabled={running || !files.length} style={{ opacity: running ? .7 : 1 }}>
              {running ? <span className="up-spin" /> : <Ic.activity size={15} sw={2.2} />} {running ? 'ANALİZ EDİLİYOR…' : 'ANALİZİ BAŞLAT'}
            </button>
          )}
        </div>
      </CRShell>
    );
  }

  window.CRUpload = CRUpload;
})();
