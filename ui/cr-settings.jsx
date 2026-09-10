/* Ayarlar sayfası (Kontrol Odası dili)
 *
 * İki ayar kaynağı vardır ve ikisi de GERÇEKTEN kaydedilir:
 *   • Sunucu (.env, GET/POST /api/settings): Gemini API anahtarı, model, fiyat/kur,
 *     paralellik. Anahtar sunucuya yazılır, tarayıcıda tutulmaz; geri okunurken
 *     yalnızca maskeli son 4 hane gelir. Kaydedince sunucu yeniden başlatılmadan
 *     devreye girer (initGemini yeniden koşar).
 *   • Yerel analiz varsayılanları (CCSettings → localStorage): saklama aralığı,
 *     limitler, TOR bütçesi, azami kayıt aralığı, ΔH. Veri Yükleme sayfası ve
 *     karar motoru bunları kullanır.
 * Karşılığı olmayan (e-posta, push, otomatik Excel, saklama süresi) anahtarlar
 * kaldırıldı: etkisi olmayan bir ayar, yanlış güven verir.
 */
(function () {
  const { useState, useEffect } = React;
  const { CCIcons: Ic, CRShell } = window;

  // Denetim zinciri durumu — sunucudan canlı (GET /api/audit/verify)
  function ChainStatus({ chain }) {
    if (chain === undefined) return <div className="set-status" style={{ color: 'var(--t3)', justifyContent: 'flex-start' }}><i style={{ background: 'var(--t3)' }} />Doğrulanıyor…</div>;
    if (!chain || !chain.success) return <div className="set-status" style={{ color: 'var(--amber)', background: 'var(--amberS)', justifyContent: 'flex-start' }}><i style={{ background: 'var(--amber)' }} />Doğrulanamadı — sunucu çevrimdışı olabilir</div>;
    if (chain.ok) return <div className="set-status" style={{ color: 'var(--ok)', background: 'var(--okS)', justifyContent: 'flex-start' }}><i style={{ background: 'var(--ok)' }} />Sağlam — {chain.total} kayıt SHA-256 ile doğrulandı</div>;
    return <div className="set-status" style={{ color: 'var(--bad)', background: 'var(--badS)', justifyContent: 'flex-start' }}><i style={{ background: 'var(--bad)' }} />ZİNCİR BOZUK — {chain.broken.length}/{chain.total} kayıtta uyumsuzluk</div>;
  }

  const SET_CSS = `
  .set-g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;align-items:start;}
  .set-bd{padding:18px;display:grid;gap:14px;}
  .set-seg{display:flex;gap:3px;background:var(--pn2);border:1px solid var(--ln2);border-radius:8px;padding:3px;flex-wrap:wrap;}
  .set-seg button{border:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;padding:6px 12px;border-radius:6px;background:transparent;color:var(--t2);transition:.12s;white-space:nowrap;}
  .set-seg button.on{background:var(--sig);color:#04121a;}
  .set-key{display:flex;gap:8px;}
  .set-iconbtn{width:38px;flex-shrink:0;border:1px solid var(--ln2);background:var(--pn2);border-radius:7px;display:grid;place-items:center;color:var(--t2);cursor:pointer;transition:.13s;}
  .set-iconbtn:hover{color:var(--sig);border-color:var(--sig);}
  .set-status{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:600;padding:8px 12px;border-radius:8px;}
  .set-status i{width:7px;height:7px;border-radius:50%;}
  .set-note{font-size:11px;color:var(--t3);line-height:1.5;padding-top:4px;border-top:1px solid var(--ln);}
  .set-foot{display:flex;align-items:center;gap:12px;position:sticky;bottom:0;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(8px);padding:14px 0 4px;margin-top:4px;border-top:1px solid var(--ln2);}
  .set-msg{font-size:12px;padding:10px 14px;border-radius:8px;border:1px solid var(--ln2);display:flex;gap:8px;align-items:center;}
  .set-msg.ok{color:var(--ok);border-color:var(--ok);background:var(--okS);}
  .set-msg.bad{color:var(--bad);border-color:var(--bad);background:var(--badS);}
  .set-msg.info{color:var(--t2);}
  .set-dirty{font-size:10px;letter-spacing:.6px;text-transform:uppercase;font-weight:700;color:var(--amber);border:1px solid var(--amber);border-radius:5px;padding:2px 7px;}
  `;

  function Field({ label, children, hint }) { return <div className="cr-field"><label className="cr-label">{label}</label>{children}{hint && <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 4 }}>{hint}</div>}</div>; }

  const MODEL_CHOICES = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  const ROLE_LABEL = { admin: 'Yönetici', qa: 'QA' };
  const api = async (url, body, method) => {
    const r = await fetch(url, { method: method || (body ? 'POST' : 'GET'), headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.error || ('İstek başarısız (' + r.status + ')'));
    return j;
  };
  const fmtTs = v => { if (!v) return '—'; const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T') + 'Z'); return isNaN(d) ? String(v) : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  // Kendi şifresini değiştir (herkes)
  function PasswordPanel() {
    const [cur, setCur] = useState(''); const [nx, setNx] = useState(''); const [nx2, setNx2] = useState('');
    const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
    const me = (window.CCAuth && window.CCAuth.user) || {};
    const go = async () => {
      setMsg(null);
      if (nx !== nx2) { setMsg({ tone: 'bad', text: 'Yeni şifreler birbiriyle aynı değil.' }); return; }
      setBusy(true);
      try { await api('/api/auth/password', { current: cur, next: nx }); setCur(''); setNx(''); setNx2(''); setMsg({ tone: 'ok', text: 'Şifre değiştirildi.' }); }
      catch (e) { setMsg({ tone: 'bad', text: e.message }); }
      setBusy(false);
    };
    return (
      <div className="cr-pn" style={{ marginBottom: 16 }}>
        <div className="cr-ph"><div className="cr-pt"><Ic.user size={15} style={{ color: 'var(--sig)' }} /> HESABIM</div><span className="set-status" style={{ color: 'var(--t2)', border: '1px solid var(--ln2)' }}>{me.email} · {ROLE_LABEL[me.role] || me.role}</span></div>
        <div className="set-bd">
          {me.mustChangePassword && <div className="set-msg bad"><Ic.alert size={14} /> Geçici şifreyle giriş yaptınız; lütfen şimdi değiştirin.</div>}
          {msg && <div className={'set-msg ' + msg.tone}>{msg.tone === 'ok' ? <Ic.check size={14} /> : <Ic.alert size={14} />}{msg.text}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Mevcut şifre"><input className="cr-input" type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></Field>
            <Field label="Yeni şifre" hint="En az 8 karakter, harf + rakam"><input className="cr-input" type="password" autoComplete="new-password" value={nx} onChange={e => setNx(e.target.value)} /></Field>
            <Field label="Yeni şifre (tekrar)"><input className="cr-input" type="password" autoComplete="new-password" value={nx2} onChange={e => setNx2(e.target.value)} /></Field>
          </div>
          <div><button className="cr-btn cr-btn2" onClick={go} disabled={busy || !cur || !nx}><Ic.lock size={14} /> Şifremi değiştir</button></div>
        </div>
      </div>
    );
  }

  // Kullanıcı yönetimi (yalnızca admin)
  function UsersPanel() {
    const me = (window.CCAuth && window.CCAuth.user) || {};
    const [rows, setRows] = useState(null); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
    const [nu, setNu] = useState({ email: '', name: '', role: 'qa', password: '' });
    const [resetFor, setResetFor] = useState(null); const [resetPw, setResetPw] = useState('');
    const load = async () => { try { const j = await api('/api/users'); setRows(j.data || []); } catch (e) { setMsg({ tone: 'bad', text: e.message }); setRows([]); } };
    useEffect(() => { load(); }, []);
    const add = async () => {
      setBusy(true); setMsg(null);
      try { await api('/api/users', nu); setNu({ email: '', name: '', role: 'qa', password: '' }); setMsg({ tone: 'ok', text: 'Kullanıcı eklendi. İlk girişte şifresini değiştirmesi istenecek.' }); await load(); }
      catch (e) { setMsg({ tone: 'bad', text: e.message }); }
      setBusy(false);
    };
    const patch = async (id, body, okText) => {
      setBusy(true); setMsg(null);
      try { await api('/api/users/' + id, body, 'PATCH'); setMsg({ tone: 'ok', text: okText }); setResetFor(null); setResetPw(''); await load(); }
      catch (e) { setMsg({ tone: 'bad', text: e.message }); }
      setBusy(false);
    };
    return (
      <div className="cr-pn" style={{ marginBottom: 16 }}>
        <div className="cr-ph"><div className="cr-pt"><Ic.shield size={15} style={{ color: 'var(--sig)' }} /> KULLANICILAR & ROLLER</div><span className="set-status" style={{ color: 'var(--t3)' }}>admin: her şey · qa: analiz, onay, rapor, denetim izi</span></div>
        <div className="set-bd">
          {msg && <div className={'set-msg ' + msg.tone}>{msg.tone === 'ok' ? <Ic.check size={14} /> : <Ic.alert size={14} />}{msg.text}</div>}
          <div style={{ overflowX: 'auto' }}>
            <table className="tp-tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{['E-posta', 'Ad', 'Rol', 'Durum', 'Son giriş', ''].map(h => <th key={h} style={{ textAlign: 'left', color: 'var(--t3)', padding: '8px 10px', borderBottom: '1px solid var(--ln2)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows === null ? <tr><td colSpan={6} style={{ padding: 12, color: 'var(--t3)' }}>Yükleniyor…</td></tr> : rows.map(u => (
                  <tr key={u.id}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--ln)', fontFamily: "'JetBrains Mono',monospace" }}>{u.email}{u.id === me.id ? ' (siz)' : ''}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--ln)' }}>{u.name || '—'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--ln)' }}>
                      <select className="cr-select" value={u.role} disabled={busy || u.id === me.id} onChange={e => patch(u.id, { role: e.target.value }, 'Rol güncellendi.')} style={{ padding: '4px 8px', fontSize: 11 }}>
                        <option value="admin">Yönetici</option><option value="qa">QA</option>
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--ln)', color: u.active ? 'var(--ok)' : 'var(--bad)', fontWeight: 600 }}>{u.active ? 'Etkin' : 'Pasif'}{u.mustChangePassword ? ' · geçici şifre' : ''}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--ln)', color: 'var(--t3)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>{fmtTs(u.lastLoginAt)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--ln)', whiteSpace: 'nowrap' }}>
                      {resetFor === u.id ? (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <input className="cr-input" type="text" placeholder="geçici şifre" value={resetPw} onChange={e => setResetPw(e.target.value)} style={{ width: 150, padding: '4px 8px', fontSize: 11 }} />
                          <button className="cr-btn cr-btn2" disabled={busy || !resetPw} onClick={() => patch(u.id, { password: resetPw }, 'Şifre sıfırlandı; kullanıcı ilk girişte değiştirecek.')} style={{ padding: '4px 10px', fontSize: 11 }}>Kaydet</button>
                          <button className="cr-btn cr-btn2" onClick={() => { setResetFor(null); setResetPw(''); }} style={{ padding: '4px 10px', fontSize: 11 }}>Vazgeç</button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="cr-btn cr-btn2" disabled={busy} onClick={() => { setResetFor(u.id); setResetPw(''); }} style={{ padding: '4px 10px', fontSize: 11 }}>Şifre sıfırla</button>
                          {u.id !== me.id && <button className="cr-btn cr-btn2" disabled={busy} onClick={() => patch(u.id, { active: !u.active }, u.active ? 'Kullanıcı pasifleştirildi; açık oturumları kapatıldı.' : 'Kullanıcı etkinleştirildi.')} style={{ padding: '4px 10px', fontSize: 11, color: u.active ? 'var(--bad)' : 'var(--ok)' }}>{u.active ? 'Pasifleştir' : 'Etkinleştir'}</button>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr .7fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <Field label="E-posta"><input className="cr-input" type="email" value={nu.email} onChange={e => setNu(o => ({ ...o, email: e.target.value }))} /></Field>
            <Field label="Ad Soyad"><input className="cr-input" value={nu.name} onChange={e => setNu(o => ({ ...o, name: e.target.value }))} /></Field>
            <Field label="Rol"><select className="cr-select" value={nu.role} onChange={e => setNu(o => ({ ...o, role: e.target.value }))}><option value="qa">QA</option><option value="admin">Yönetici</option></select></Field>
            <Field label="Geçici şifre" hint="İlk girişte değiştirilir"><input className="cr-input" type="text" value={nu.password} onChange={e => setNu(o => ({ ...o, password: e.target.value }))} /></Field>
            <button className="cr-btn" onClick={add} disabled={busy || !nu.email || !nu.password} style={{ marginBottom: 18 }}><Ic.plus size={14} /> Ekle</button>
          </div>
        </div>
      </div>
    );
  }

  function CRSettings({ theme, onNav = () => {} }) {
    const S = window.CCSettings;
    const RANGES = (S && S.RANGES) || {};

    // --- yerel analiz ayarları
    const [local, setLocal] = useState(() => (S ? S.get() : {}));
    const [localSaved, setLocalSaved] = useState(() => JSON.stringify(S ? S.get() : {}));
    const localDirty = JSON.stringify(local) !== localSaved;
    const setL = (k, v) => setLocal(o => ({ ...o, [k]: v }));
    const onRange = v => { const r = RANGES[v]; setLocal(o => ({ ...o, range: v, lo: r ? r.min : o.lo, hi: r ? r.max : o.hi })); };

    // --- sunucu ayarları (.env)
    const [srv, setSrv] = useState(undefined);       // undefined=yükleniyor | null=ulaşılamadı | {settings}
    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');         // yalnızca kullanıcı yeni anahtar yazarsa dolar
    const [showKey, setShowKey] = useState(false);
    const [usdTry, setUsdTry] = useState('');
    const [priceIn, setPriceIn] = useState('');
    const [priceOut, setPriceOut] = useState('');
    const [conc, setConc] = useState(2);
    const [retention, setRetention] = useState('0');   // gün; 0 = sınırsız (KVKK saklama süresi)
    const [purging, setPurging] = useState(false);
    const [msg, setMsg] = useState(null);             // {tone, text}
    const [busy, setBusy] = useState(false);
    const [testing, setTesting] = useState(false);

    const applyServer = (st) => {
      setSrv(st);
      setModel(st.model || '');
      setUsdTry(String(st.usdTry ?? ''));
      setPriceIn(st.priceInOverride ? String(st.priceIn) : '');
      setPriceOut(st.priceOutOverride ? String(st.priceOut) : '');
      setConc(st.extractConcurrency || 2);
      setRetention(String(st.retentionDays || 0));
      setApiKey('');
    };
    const loadServer = async () => {
      try { const r = await fetch('/api/settings'); const j = await r.json(); if (j.success) applyServer(j.settings); else setSrv(null); }
      catch (e) { setSrv(null); }
    };
    useEffect(() => { loadServer(); }, []);

    const serverDirty = !!srv && (
      apiKey.trim() !== '' || model !== srv.model || conc !== srv.extractConcurrency || String(retention) !== String(srv.retentionDays || 0) ||
      String(usdTry) !== String(srv.usdTry) ||
      priceIn !== (srv.priceInOverride ? String(srv.priceIn) : '') ||
      priceOut !== (srv.priceOutOverride ? String(srv.priceOut) : '')
    );

    // --- denetim zinciri
    const [chain, setChain] = useState(undefined);
    const verifyChain = async () => {
      setChain(undefined);
      try { const r = await fetch('/api/audit/verify'); setChain(await r.json()); }
      catch (e) { setChain({ success: false, error: e.message }); }
    };
    useEffect(() => { verifyChain(); }, []);

    // --- kaydet / sıfırla / test
    const saveAll = async () => {
      setBusy(true); setMsg(null);
      const done = [];
      try {
        if (localDirty && S) { const o = S.save(local); setLocal(o); setLocalSaved(JSON.stringify(o)); done.push('analiz varsayılanları'); }
        if (serverDirty) {
          const body = {};
          if (apiKey.trim() !== '') body.apiKey = apiKey.trim();
          if (model !== srv.model) body.model = model;
          if (String(usdTry) !== String(srv.usdTry)) body.usdTry = usdTry === '' ? null : Number(usdTry);
          if (priceIn !== (srv.priceInOverride ? String(srv.priceIn) : '')) body.priceIn = priceIn === '' ? null : Number(priceIn);
          if (priceOut !== (srv.priceOutOverride ? String(srv.priceOut) : '')) body.priceOut = priceOut === '' ? null : Number(priceOut);
          if (conc !== srv.extractConcurrency) body.extractConcurrency = conc;
          if (String(retention) !== String(srv.retentionDays || 0)) body.retentionDays = Number(retention) || 0;
          const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const j = await r.json();
          if (!j.success) throw new Error(j.error || 'Sunucu ayarları kaydedilemedi.');
          applyServer(j.settings);
          done.push('.env (' + (j.changed || []).length + ' alan)');
          if (body.apiKey && !j.geminiReady) setMsg({ tone: 'bad', text: 'Anahtar kaydedildi ama Gemini başlatılamadı; "Bağlantıyı test et" ile kontrol edin.' });
        }
        if (!done.length) setMsg({ tone: 'info', text: 'Değişiklik yok.' });
        else if (!msg) setMsg({ tone: 'ok', text: 'Kaydedildi: ' + done.join(' · ') + (done.some(d => d.startsWith('.env')) ? ' — sunucu yeniden başlatılmadan devrede.' : '') });
      } catch (e) { setMsg({ tone: 'bad', text: e.message }); }
      setBusy(false);
    };
    const resetLocal = () => { if (!S) return; const o = S.reset(); setLocal(o); setLocalSaved(JSON.stringify(o)); setMsg({ tone: 'info', text: 'Analiz varsayılanları sıfırlandı (2–8°C, TOR 120 dk, 60 dk aralık, ΔH 83,144).' }); };
    const testConn = async () => {
      setTesting(true); setMsg(null);
      try {
        const body = {}; if (apiKey.trim()) body.apiKey = apiKey.trim(); if (model) body.model = model;
        const r = await fetch('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        setMsg(j.success ? { tone: 'ok', text: `Bağlantı başarılı — ${j.model}, ${j.latencyMs} ms${apiKey.trim() ? ' (anahtar henüz kaydedilmedi; Kaydet ile yazın)' : ''}.` } : { tone: 'bad', text: 'Bağlantı başarısız: ' + j.error });
      } catch (e) { setMsg({ tone: 'bad', text: 'Sunucuya ulaşılamadı: ' + e.message }); }
      setTesting(false);
    };

    const dirty = localDirty || serverDirty;
    const aiStatus = srv === undefined ? ['var(--t3)', 'SORGULANIYOR'] : srv === null ? ['var(--bad)', 'SUNUCU YOK'] : !srv.hasKey ? ['var(--amber)', 'ANAHTAR YOK'] : srv.geminiReady ? ['var(--ok)', 'BAĞLI'] : ['var(--bad)', 'BAŞLATILAMADI'];
    const pricingFor = srv && srv.modelPricing && srv.modelPricing[model];
    const modelList = MODEL_CHOICES.includes(model) || !model ? MODEL_CHOICES : [model, ...MODEL_CHOICES];

    return (
      <CRShell theme={theme} active="settings" onNav={onNav}>
        <style>{SET_CSS}</style>
        <div className="cr-hr">
          <div><div className="cr-h1">Ayarlar {dirty && <span className="set-dirty" style={{ marginLeft: 8, verticalAlign: 'middle' }}>kaydedilmedi</span>}</div><div className="cr-h1sub">Analiz varsayılanları (bu bilgisayar) · Yapay zeka ve fiyat ayarları (.env)</div></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="cr-btn cr-btn2" onClick={resetLocal} disabled={busy}><Ic.refresh size={15} /> Varsayılana dön</button>
            <button className="cr-btn" onClick={saveAll} disabled={busy || !dirty}><Ic.save size={15} /> {busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</button>
          </div>
        </div>

        {msg && <div className={'set-msg ' + msg.tone} style={{ marginBottom: 14 }}>{msg.tone === 'ok' ? <Ic.check size={14} /> : msg.tone === 'bad' ? <Ic.alert size={14} /> : <Ic.clock size={14} />}{msg.text}</div>}

        <div className="set-g2">
          {/* Analiz varsayılanları */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.thermo size={15} style={{ color: 'var(--sig)' }} /> ANALİZ VARSAYILANLARI</div>{localDirty && <span className="set-dirty">değişti</span>}</div>
            <div className="set-bd">
              <Field label="Varsayılan Saklama Koşulu">
                <select className="cr-select" value={local.range} onChange={e => onRange(e.target.value)}>
                  {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Alt Limit °C"><input className="cr-input" type="number" value={local.lo} onChange={e => setLocal(o => ({ ...o, lo: e.target.value, range: 'custom' }))} /></Field>
                <Field label="Üst Limit °C"><input className="cr-input" type="number" value={local.hi} onChange={e => setLocal(o => ({ ...o, hi: e.target.value, range: 'custom' }))} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="TOR Bütçesi (dakika)" hint="Üst limit üstü toplam süre bunu aşarsa karar ŞARTLI"><input className="cr-input" type="number" value={local.tor} onChange={e => setL('tor', e.target.value)} /></Field>
                <Field label="Azami Kayıt Aralığı (dk)" hint="Logger bundan seyrek kaydetmişse REVİZE"><input className="cr-input" type="number" value={local.maxInterval} onChange={e => setL('maxInterval', e.target.value)} /></Field>
              </div>
              <Field label="Aktivasyon Enerjisi ΔH (kJ/mol) — MKT"><input className="cr-input" type="number" step="0.001" value={local.dH} onChange={e => setL('dH', e.target.value)} /></Field>
              <div className="set-note">Bu değerler Veri Yükleme sayfasının açılış varsayılanıdır ve karar motoruna iner; sayfada dosya bazında değiştirilebilir. ICH Q1A / WHO için ΔH <b style={{ color: 'var(--sig)' }}>83,144 kJ/mol</b>. Bu bilgisayarda saklanır (tarayıcı deposu).</div>
            </div>
          </div>

          {/* Yapay zeka */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.cpu size={15} style={{ color: 'var(--sig)' }} /> YAPAY ZEKA (GEMINI · .env)</div>
              <span className="set-status" style={{ color: aiStatus[0], background: 'transparent', border: '1px solid ' + aiStatus[0] }}><i style={{ background: aiStatus[0] }} />{aiStatus[1]}</span></div>
            <div className="set-bd">
              {srv === null && <div className="set-msg bad"><Ic.alert size={14} /> Sunucuya ulaşılamıyor; .env ayarları okunamadı.</div>}
              <Field label="Çözümleme Modeli" hint={pricingFor ? `Liste fiyatı: $${pricingFor.input} girdi / $${pricingFor.output} çıktı (1M token)` : (model ? 'Bu model fiyat tablosunda yok; fiyatı aşağıda elle girin.' : '')}>
                <div className="set-seg">{modelList.map(m => <button key={m} className={m === model ? 'on' : ''} onClick={() => setModel(m)} disabled={!srv}>{m.replace('gemini-', '')}</button>)}</div>
              </Field>
              <Field label="GEMINI_API_KEY" hint={srv && srv.hasKey ? `Kayıtlı anahtar: ${srv.keyMasked} — değiştirmek için yenisini yazın` : 'Anahtar almak için: aistudio.google.com/apikey'}>
                <div className="set-key">
                  <input className="cr-input" type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={srv && srv.hasKey ? srv.keyMasked : 'AIza…'} autoComplete="off" spellCheck={false} disabled={!srv} />
                  <div className="set-iconbtn" onClick={() => setShowKey(v => !v)} title={showKey ? 'Gizle' : 'Göster'}><Ic.eye size={16} /></div>
                </div>
              </Field>
              <Field label="OCR Paralelliği (parça / aynı anda)" hint="Büyük taranmış PDF'lerde hız; 4 üstü oran sınırına takılır">
                <div className="set-seg">{[1, 2, 3, 4].map(n => <button key={n} className={n === conc ? 'on' : ''} onClick={() => setConc(n)} disabled={!srv}>{n}</button>)}</div>
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="cr-btn cr-btn2" onClick={testConn} disabled={testing || !srv} style={{ flex: 1, justifyContent: 'center' }}><Ic.activity size={14} /> {testing ? 'Deneniyor…' : 'Bağlantıyı test et'}</button>
              </div>
              <div className="set-note">Anahtar yalnızca sunucudaki <b className="cr-m" style={{ color: 'var(--t2)' }}>{srv && srv.envPath ? srv.envPath : '.env'}</b> dosyasına yazılır; tarayıcıda saklanmaz, kurulum paketine girmez, geri okunurken yalnızca son 4 hanesi görünür.</div>
            </div>
          </div>
        </div>

        <div className="set-g2">
          {/* Fiyat & kur */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.dollar size={15} style={{ color: 'var(--sig)' }} /> FİYAT & KUR (.env)</div></div>
            <div className="set-bd">
              <Field label="USD / TRY Kuru"><input className="cr-input" type="number" step="0.01" value={usdTry} onChange={e => setUsdTry(e.target.value)} disabled={!srv} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Girdi ($ / 1M token)"><input className="cr-input" type="number" step="0.001" value={priceIn} onChange={e => setPriceIn(e.target.value)} placeholder={srv ? 'model tablosu: ' + srv.priceIn : ''} disabled={!srv} /></Field>
                <Field label="Çıktı ($ / 1M token)"><input className="cr-input" type="number" step="0.001" value={priceOut} onChange={e => setPriceOut(e.target.value)} placeholder={srv ? 'model tablosu: ' + srv.priceOut : ''} disabled={!srv} /></Field>
              </div>
              <div className="set-note">Boş bırakılan fiyat alanı seçili modelin liste fiyatını kullanır; dolu alan onu geçersiz kılar. Her OCR yanıtındaki maliyet bu değerlerle hesaplanır.</div>
            </div>
          </div>

          {/* Güvenlik */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.lock size={15} style={{ color: 'var(--sig)' }} /> VERİ BÜTÜNLÜĞÜ & GÜVENLİK</div></div>
            <div className="set-bd">
              <Field label="Denetim Zinciri Durumu"><ChainStatus chain={chain} /></Field>
              <Field label="İmza" hint={chain && chain.success && chain.signing ? chain.signing + (chain.legacyCount ? ` · ${chain.legacyCount} eski (imzasız) satır` : '') : ''}><input className="cr-input" value="HMAC-SHA256 hash zinciri" readOnly style={{ color: 'var(--t3)' }} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                <Field label="KVKK Veri Saklama Süresi (gün, 0 = sınırsız)" hint="Süreyi aşan analizler, ham seriler ve cihaz seri kayıtları her gün otomatik silinir; denetim izi silinmez">
                  <input className="cr-input" type="number" min="0" step="1" value={retention} onChange={e => setRetention(e.target.value)} disabled={!srv} />
                </Field>
                <button className="cr-btn cr-btn2" style={{ marginBottom: 18 }} disabled={purging || !srv || !(Number(srv && srv.retentionDays) > 0)} title={srv && !(Number(srv.retentionDays) > 0) ? 'Önce bir saklama süresi kaydedin' : ''} onClick={async () => {
                  setPurging(true); setMsg(null);
                  try { const j = await api('/api/maintenance/purge', {}); setMsg({ tone: 'ok', text: j.skipped ? 'Saklama süresi sınırsız; temizlik yapılmadı.' : `Temizlik tamam: ${j.analyses} analiz, ${j.readings} ham seri, ${j.deviceSerials} cihaz kaydı silindi (> ${j.days} gün).` }); }
                  catch (e) { setMsg({ tone: 'bad', text: e.message }); }
                  setPurging(false);
                }}><Ic.refresh size={14} /> {purging ? 'Temizleniyor…' : 'Şimdi temizle'}</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="cr-btn cr-btn2" style={{ justifyContent: 'center' }} onClick={verifyChain}><Ic.shield size={15} /> Zinciri doğrula</button>
                <button className="cr-btn cr-btn2" style={{ justifyContent: 'center' }} onClick={() => onNav('audit')}><Ic.report size={15} /> Denetim izini aç</button>
              </div>
              <div className="set-note">Sunucu yalnızca bu bilgisayardan (127.0.0.1) erişilebilir; ayar yazma uzak adreslerden reddedilir. Her ayar değişikliği denetim zincirine yazılır (anahtar maskeli).</div>
            </div>
          </div>
        </div>

        <PasswordPanel />
        {((window.CCAuth && window.CCAuth.user) || {}).role === 'admin' && <UsersPanel />}

        <div className="set-foot">
          <button className="cr-btn" onClick={saveAll} disabled={busy || !dirty}><Ic.save size={15} /> {busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</button>
          <button className="cr-btn cr-btn2" onClick={() => onNav('dashboard')}><Ic.chevL size={15} /> Kontrol Paneli</button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace" }}>ColdChain AI · {srv && srv.port ? 'port ' + srv.port + ' · ' : ''}{srv && srv.model ? srv.model : ''}</span>
        </div>
      </CRShell>
    );
  }

  window.CRSettings = CRSettings;
})();
