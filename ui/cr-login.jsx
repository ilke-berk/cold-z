/* Oturum açma / ilk kurulum ekranı (Kontrol Odası dili)
 *
 * Kimlik doğrulama SUNUCUDA yapılır (/api/auth/*): şifre tarayıcıda
 * karşılaştırılmaz, saklanmaz. Hiç kullanıcı yoksa (ilk çalıştırma) aynı
 * ekran ilk yöneticiyi oluşturur. */
(function () {
  const { useState, useEffect } = React;
  const { CCIcons: Ic, CCTempChart, CCData } = window;

  const LG_CSS = `
  .lg{position:fixed;inset:0;display:flex;overflow:hidden;font-family:'Space Grotesk',sans-serif;
    --bg:#0a0e14;--pn:#111824;--pn2:#161f2d;--ln:#1e2735;--ln2:#2a3850;--tx:#dde6f1;--t2:#7d8da4;--t3:#505f78;
    --sig:#46b6da;--sigS:rgba(70,182,218,.13);--ok:#3cc081;--okS:rgba(60,192,129,.13);--bad:#ea5d6b;--badS:rgba(234,93,107,.13);--amber:#e2a43e;
    background:var(--bg);color:var(--tx);}
  .lg[data-theme=light]{--bg:#e9edf2;--pn:#fff;--pn2:#f4f7fa;--ln:#e3e9f0;--ln2:#cdd8e6;--tx:#0d1726;--t2:#54607a;--t3:#8392a8;
    --sig:#0f81a8;--sigS:#e1f1f7;--ok:#1c9961;--okS:#e3f3ea;--bad:#cb3c48;--badS:#f9e6e7;--amber:#a9781a;}
  .lg *{box-sizing:border-box;margin:0;}
  .lg-m{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;}
  .lg-left{flex:1.05;position:relative;display:flex;flex-direction:column;justify-content:center;gap:36px;padding:48px 52px;border-right:1px solid var(--ln2);overflow:hidden;
    background:linear-gradient(160deg,var(--pn) 0%,var(--bg) 70%);}
  .lg-left::before{content:'';position:absolute;inset:0;background-image:linear-gradient(var(--ln) 1px,transparent 1px),linear-gradient(90deg,var(--ln) 1px,transparent 1px);background-size:44px 44px;opacity:.5;pointer-events:none;-webkit-mask-image:radial-gradient(120% 80% at 30% 20%,#000,transparent 75%);mask-image:radial-gradient(120% 80% at 30% 20%,#000,transparent 75%);}
  .lg-leftInner{position:relative;width:100%;max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:32px;}
  .lg-glow{position:absolute;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,var(--sigS),transparent 65%);top:-160px;right:-140px;pointer-events:none;}
  .lg-brand{position:absolute;top:48px;left:52px;display:flex;align-items:center;gap:12px;z-index:2;}
  .lg-mk{width:42px;height:42px;border:1px solid var(--sig);border-radius:10px;color:var(--sig);display:grid;place-items:center;background:var(--sigS);flex-shrink:0;}
  .lg-bn{font-size:18px;font-weight:700;letter-spacing:.3px;}
  .lg-bs{font-size:9.5px;letter-spacing:2.4px;color:var(--t3);font-weight:600;text-transform:uppercase;margin-top:1px;white-space:nowrap;}
  .lg-hero{position:relative;}
  .lg-h1{font-size:38px;font-weight:700;letter-spacing:-1.2px;line-height:1.08;}
  .lg-h1 span{color:var(--sig);}
  .lg-hs{font-size:14px;color:var(--t2);line-height:1.6;margin-top:16px;}
  .lg-mon{position:relative;background:color-mix(in srgb,var(--pn) 80%,transparent);border:1px solid var(--ln2);border-radius:13px;padding:15px 17px;backdrop-filter:blur(6px);}
  .lg-monHd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .lg-monT{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.4px;color:var(--t2);font-weight:600;text-transform:uppercase;}
  .lg-feat{display:flex;gap:22px;position:relative;flex-wrap:wrap;}
  .lg-fi{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--t2);white-space:nowrap;}
  .lg-fic{width:30px;height:30px;border-radius:8px;background:var(--sigS);color:var(--sig);display:grid;place-items:center;flex-shrink:0;}
  .lg-right{width:clamp(440px,32vw,560px);flex-shrink:0;display:flex;flex-direction:column;justify-content:center;padding:40px 56px;position:relative;overflow:auto;}
  .lg-card{width:100%;max-width:384px;margin:0 auto;}
  .lg-t1{font-size:25px;font-weight:700;letter-spacing:-.5px;}
  .lg-t2{font-size:13px;color:var(--t2);margin-top:7px;line-height:1.5;}
  .lg-form{margin-top:30px;display:flex;flex-direction:column;gap:16px;}
  .lg-field{display:flex;flex-direction:column;gap:7px;}
  .lg-lbl{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--t3);font-weight:600;}
  .lg-inwrap{position:relative;}
  .lg-in{width:100%;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--tx);background:var(--pn2);border:1px solid var(--ln2);border-radius:9px;padding:12px 14px;transition:.14s;}
  .lg-in::placeholder{color:var(--t3);}
  .lg-in:focus{outline:none;border-color:var(--sig);background:var(--pn);box-shadow:0 0 0 3px var(--sigS);}
  .lg-in.err{border-color:var(--bad);box-shadow:0 0 0 3px var(--badS);}
  .lg-in.pw{padding-right:44px;}
  .lg-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:none;background:transparent;color:var(--t3);display:grid;place-items:center;cursor:pointer;border-radius:7px;transition:.12s;}
  .lg-eye:hover{color:var(--sig);background:var(--pn);}
  .lg-rowx{display:flex;align-items:center;justify-content:space-between;font-size:12px;}
  .lg-rem{display:flex;align-items:center;gap:9px;cursor:pointer;color:var(--t2);user-select:none;}
  .lg-box{width:18px;height:18px;border:1.5px solid var(--ln2);border-radius:5px;display:grid;place-items:center;color:transparent;transition:.13s;flex-shrink:0;}
  .lg-box.on{background:var(--sig);border-color:var(--sig);color:#04121a;}
  .lg-err{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--bad);background:var(--badS);border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);border-radius:8px;padding:10px 13px;}
  .lg-info{display:flex;gap:9px;font-size:12px;color:var(--t2);background:var(--sigS);border:1px solid color-mix(in srgb,var(--sig) 35%,transparent);border-radius:8px;padding:10px 13px;line-height:1.5;}
  .lg-shake{animation:lgsh .4s;}
  @keyframes lgsh{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
  .lg-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;background:var(--sig);color:#04121a;border:none;font-family:inherit;font-size:14px;font-weight:700;letter-spacing:.3px;padding:13px;border-radius:9px;cursor:pointer;transition:.13s;margin-top:4px;white-space:nowrap;}
  .lg-btn svg{flex-shrink:0;}
  .lg-btn:hover{filter:brightness(1.08);}
  .lg-btn:disabled{opacity:.65;cursor:default;}
  .lg-spin{width:17px;height:17px;border:2px solid rgba(4,18,26,.35);border-top-color:#04121a;border-radius:50%;animation:lgspin .7s linear infinite;}
  @keyframes lgspin{to{transform:rotate(360deg)}}
  .lg-foot{display:flex;align-items:center;gap:10px;margin-top:30px;font-size:11px;color:var(--t3);}
  .lg-chip{font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;color:var(--t2);background:var(--pn2);border:1px solid var(--ln2);padding:3px 9px;border-radius:5px;}
  @media (max-width:920px){.lg-left{display:none;}.lg-right{flex:1;width:auto;}}
  `;

  function PwInput({ value, onChange, err, placeholder = '••••••••', autoComplete }) {
    const [show, setShow] = useState(false);
    return (
      <div className="lg-inwrap">
        <input className={'lg-in pw' + (err ? ' err' : '')} type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={onChange} />
        <button type="button" className="lg-eye" onClick={() => setShow(s => !s)} title={show ? 'Gizle' : 'Göster'} tabIndex={-1}><Ic.eye size={17} /></button>
      </div>
    );
  }

  function CRLogin({ theme = 'dark', onAuth = () => {} }) {
    const dt = theme === 'light' ? 'light' : 'dark';
    const [mode, setMode] = useState('loading');   // loading | login | setup | offline
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [pass, setPass] = useState('');
    const [pass2, setPass2] = useState('');
    const [remember, setRemember] = useState(true);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [shake, setShake] = useState(false);
    const bump = () => { setShake(true); setTimeout(() => setShake(false), 420); };

    useEffect(() => {
      let alive = true;
      fetch('/api/auth/status').then(r => r.json())
        .then(j => { if (!alive) return; if (j.authenticated && j.user) onAuth(j.user); else setMode(j.setupRequired ? 'setup' : 'login'); })
        .catch(() => { if (alive) setMode('offline'); });
      return () => { alive = false; };
    }, []);

    const submit = async (e) => {
      e && e.preventDefault();
      if (loading) return;
      setErr('');
      if (!email.trim() || !pass) { setErr('E-posta ve şifre alanları zorunludur.'); bump(); return; }
      if (mode === 'setup' && pass !== pass2) { setErr('Şifreler birbiriyle aynı değil.'); bump(); return; }
      setLoading(true);
      try {
        const url = mode === 'setup' ? '/api/auth/setup' : '/api/auth/login';
        const body = mode === 'setup' ? { email: email.trim(), name: name.trim(), password: pass } : { email: email.trim(), password: pass, remember };
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) { setErr(j.error || 'Giriş yapılamadı.'); bump(); setLoading(false); return; }
        onAuth(j.user);
      } catch (ex) { setErr('Sunucuya ulaşılamıyor. Uygulamanın (npm start / masaüstü) çalıştığından emin olun.'); bump(); setLoading(false); }
    };

    const isSetup = mode === 'setup';
    return (
      <div className="lg" data-theme={dt}>
        <style>{LG_CSS}</style>

        <div className="lg-left">
          <div className="lg-glow" />
          <div className="lg-brand">
            <span className="lg-mk"><Ic.snow size={24} sw={2} /></span>
            <div><div className="lg-bn">ColdChain AI</div><div className="lg-bs">Monitoring · Kontrol Odası</div></div>
          </div>
          <div className="lg-leftInner">
            <div className="lg-hero">
              <div className="lg-h1">İlaç soğuk zinciri için <span>akıllı karar</span> merkezi.</div>
              <div className="lg-hs">MKT ve TOR analizinden TİTCK GDP odaklı onay raporuna kadar tüm iade sürecini tek panelden yönetin.</div>
            </div>
            <div className="lg-mon">
              <div className="lg-monHd">
                <div className="lg-monT"><Ic.thermo size={14} style={{ color: 'var(--sig)' }} /> ÖRNEK ISI PROFİLİ</div>
              </div>
              <CCTempChart data={CCData.temp} w={400} h={92} color="var(--sig)" gridColor="var(--ln)" axisColor="var(--t3)" bandColor="var(--okS)" padL={26} padB={14} padT={8} />
            </div>
            <div className="lg-feat">
              {[['shield', 'İmzalı hash-zincirli denetim izi'], ['cpu', 'Yapay zeka belge analizi'], ['check', 'TİTCK GDP odaklı karar motoru']].map(([ic, l]) => {
                const C = Ic[ic]; return <div key={l} className="lg-fi"><span className="lg-fic"><C size={15} /></span>{l}</div>;
              })}
            </div>
          </div>
        </div>

        <div className="lg-right">
          <div className="lg-card">
            {mode === 'loading' && <div className="lg-t2">Bağlanıyor…</div>}
            {mode === 'offline' && (
              <>
                <div className="lg-t1">Sunucuya ulaşılamıyor</div>
                <div className="lg-t2">Yerel sunucu çalışmıyor görünüyor. Masaüstü uygulamasını (veya <span className="lg-m">npm start</span>) başlatıp sayfayı yenileyin.</div>
                <button className="lg-btn" style={{ marginTop: 22 }} onClick={() => location.reload()}><Ic.refresh size={16} /> Yeniden dene</button>
              </>
            )}
            {(mode === 'login' || isSetup) && (
              <>
                <div className="lg-t1">{isSetup ? 'İlk kurulum' : 'Oturum aç'}</div>
                <div className="lg-t2">{isSetup ? 'Henüz kullanıcı yok. İlk yönetici hesabını oluşturun; diğer kullanıcıları Ayarlar\'dan ekleyebilirsiniz.' : 'Devam etmek için hesabınızla giriş yapın.'}</div>

                <form className={'lg-form' + (shake ? ' lg-shake' : '')} onSubmit={submit}>
                  {isSetup && (
                    <div className="lg-field">
                      <label className="lg-lbl">Ad Soyad</label>
                      <div className="lg-inwrap"><input className="lg-in" type="text" autoComplete="name" placeholder="Ad Soyad" value={name} onChange={e => setName(e.target.value)} /></div>
                    </div>
                  )}
                  <div className="lg-field">
                    <label className="lg-lbl">E-posta adresi</label>
                    <div className="lg-inwrap">
                      <input className={'lg-in' + (err ? ' err' : '')} type="email" autoComplete="username" placeholder="ad.soyad@eczane.com"
                        value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} />
                    </div>
                  </div>
                  <div className="lg-field">
                    <label className="lg-lbl">{isSetup ? 'Şifre (en az 8 karakter, harf + rakam)' : 'Şifre'}</label>
                    <PwInput value={pass} onChange={e => { setPass(e.target.value); setErr(''); }} err={!!err} autoComplete={isSetup ? 'new-password' : 'current-password'} />
                  </div>
                  {isSetup && (
                    <div className="lg-field">
                      <label className="lg-lbl">Şifre (tekrar)</label>
                      <PwInput value={pass2} onChange={e => { setPass2(e.target.value); setErr(''); }} err={!!err} autoComplete="new-password" />
                    </div>
                  )}

                  {err && <div className="lg-err"><Ic.alert size={15} /> {err}</div>}

                  {!isSetup && (
                    <div className="lg-rowx">
                      <div className="lg-rem" onClick={() => setRemember(r => !r)}>
                        <span className={'lg-box' + (remember ? ' on' : '')}><Ic.check size={12} sw={3} /></span> Beni hatırla (7 gün)
                      </div>
                      <span style={{ color: 'var(--t3)' }} title="Şifre sıfırlama yöneticiniz tarafından Ayarlar › Kullanıcılar'dan yapılır">Şifremi unuttum?</span>
                    </div>
                  )}

                  <button className="lg-btn" type="submit" disabled={loading}>
                    {loading ? <><span className="lg-spin" /> Doğrulanıyor…</> : isSetup ? <>Yönetici hesabını oluştur <Ic.chevR size={17} sw={2.4} /></> : <>Giriş yap <Ic.chevR size={17} sw={2.4} /></>}
                  </button>
                </form>

                {!isSetup && <div className="lg-info" style={{ marginTop: 18 }}><Ic.lock size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>Şifreler sunucuda scrypt özeti olarak saklanır; giriş ve çıkışlar denetim zincirine yazılır. 5 başarısız denemede 15 dk kilit.</span></div>}
              </>
            )}

            <div className="lg-foot">
              {['TİTCK GDP', 'KVKK'].map(b => <span key={b} className="lg-chip">{b}</span>)}
              <span style={{ marginLeft: 'auto' }} className="lg-m">v{window.CC_VERSION || "?"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  window.CRLogin = CRLogin;
})();
