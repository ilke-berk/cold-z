/* Oturum açma ekranı (Kontrol Odası dili) */
(function () {
  const { useState, useRef, useEffect } = React;
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
  /* SOL marka paneli */
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
  .lg-live{display:flex;align-items:center;gap:6px;color:var(--ok);font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;}
  .lg-live i{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 6px var(--ok);animation:lgp 1.6s infinite;}
  @keyframes lgp{0%,100%{opacity:1}50%{opacity:.35}}
  .lg-feat{display:flex;gap:22px;position:relative;}
  .lg-fi{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--t2);white-space:nowrap;}
  .lg-fic{width:30px;height:30px;border-radius:8px;background:var(--sigS);color:var(--sig);display:grid;place-items:center;flex-shrink:0;}
  /* SAĞ form */
  .lg-right{width:clamp(440px,32vw,560px);flex-shrink:0;display:flex;flex-direction:column;justify-content:center;padding:40px 56px;position:relative;}
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
  .lg-link{color:var(--sig);font-weight:600;cursor:pointer;text-decoration:none;}
  .lg-link:hover{text-decoration:underline;}
  .lg-err{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--bad);background:var(--badS);border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);border-radius:8px;padding:10px 13px;}
  .lg-shake{animation:lgsh .4s;}
  @keyframes lgsh{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
  .lg-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;background:var(--sig);color:#04121a;border:none;font-family:inherit;font-size:14px;font-weight:700;letter-spacing:.3px;padding:13px;border-radius:9px;cursor:pointer;transition:.13s;margin-top:4px;white-space:nowrap;}
  .lg-btn svg{flex-shrink:0;}
  .lg-btn:hover{filter:brightness(1.08);}
  .lg-btn:disabled{opacity:.65;cursor:default;}
  .lg-spin{width:17px;height:17px;border:2px solid rgba(4,18,26,.35);border-top-color:#04121a;border-radius:50%;animation:lgspin .7s linear infinite;}
  @keyframes lgspin{to{transform:rotate(360deg)}}
  .lg-demo{margin-top:22px;background:var(--pn2);border:1px dashed var(--ln2);border-radius:9px;padding:12px 14px;}
  .lg-demoT{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t3);font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:10px;white-space:nowrap;}
  .lg-demoC{font-size:11.5px;color:var(--t2);margin-top:7px;line-height:1.7;}
  .lg-demoBtn{font-size:10.5px;font-weight:600;color:var(--sig);cursor:pointer;background:transparent;border:none;font-family:inherit;}
  .lg-demoBtn:hover{text-decoration:underline;}
  .lg-foot{display:flex;align-items:center;gap:10px;margin-top:30px;font-size:11px;color:var(--t3);}
  .lg-chip{font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;color:var(--t2);background:var(--pn2);border:1px solid var(--ln2);padding:3px 9px;border-radius:5px;}
  @media (max-width:920px){.lg-left{display:none;}.lg-right{flex:1;width:auto;}}
  `;

  const DEMO = { email: 'elif.aydin@coldchain.ai', pass: 'coldchain' };

  function CRLogin({ theme = 'dark', onAuth = () => {} }) {
    const dt = theme === 'light' ? 'light' : 'dark';
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [show, setShow] = useState(false);
    const [remember, setRemember] = useState(true);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [shake, setShake] = useState(false);
    const tmr = useRef(null);
    useEffect(() => () => clearTimeout(tmr.current), []);

    const submit = (e) => {
      e && e.preventDefault();
      if (loading) return;
      setErr('');
      if (!email.trim() || !pass) { setErr('E-posta ve şifre alanları zorunludur.'); setShake(true); setTimeout(() => setShake(false), 420); return; }
      setLoading(true);
      tmr.current = setTimeout(() => {
        const ok = email.trim().toLowerCase() === DEMO.email && pass === DEMO.pass;
        if (ok) {
          localStorage.setItem('cc-auth', email.trim().toLowerCase());
          onAuth();
        } else {
          setLoading(false);
          setErr('E-posta veya şifre hatalı. Lütfen tekrar deneyin.');
          setShake(true); setTimeout(() => setShake(false), 420);
        }
      }, 750);
    };

    const fillDemo = () => { setEmail(DEMO.email); setPass(DEMO.pass); setErr(''); };

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
              <div className="lg-hs">MKT ve TOR analizinden TİTCK/GDP uyumlu onay sertifikasına kadar tüm iade sürecini tek panelden yönetin.</div>
            </div>

            <div className="lg-mon">
              <div className="lg-monHd">
                <div className="lg-monT"><Ic.thermo size={14} style={{ color: 'var(--sig)' }} /> DEPO ISI MONİTÖRÜ</div>
                <div className="lg-live"><i /> CANLI</div>
              </div>
              <CCTempChart data={CCData.temp} w={400} h={92} color="var(--sig)" gridColor="var(--ln)" axisColor="var(--t3)" bandColor="var(--okS)" padL={26} padB={14} padT={8} />
            </div>

            <div className="lg-feat">
              {[['shield', 'SHA-256 denetim zinciri'], ['cpu', 'Yapay zeka belge analizi'], ['check', 'GDP / 21 CFR Part 11']].map(([ic, l]) => {
                const C = Ic[ic]; return <div key={l} className="lg-fi"><span className="lg-fic"><C size={15} /></span>{l}</div>;
              })}
            </div>
          </div>
        </div>

        <div className="lg-right">
          <div className="lg-card">
            <div className="lg-t1">Oturum aç</div>
            <div className="lg-t2">Devam etmek için kurumsal hesabınızla giriş yapın.</div>

            <form className={'lg-form' + (shake ? ' lg-shake' : '')} onSubmit={submit}>
              <div className="lg-field">
                <label className="lg-lbl">E-posta adresi</label>
                <div className="lg-inwrap">
                  <input className={'lg-in' + (err ? ' err' : '')} type="email" autoComplete="username" placeholder="ad.soyad@coldchain.ai"
                    value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} />
                </div>
              </div>

              <div className="lg-field">
                <label className="lg-lbl">Şifre</label>
                <div className="lg-inwrap">
                  <input className={'lg-in pw' + (err ? ' err' : '')} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                    value={pass} onChange={e => { setPass(e.target.value); setErr(''); }} />
                  <button type="button" className="lg-eye" onClick={() => setShow(s => !s)} title={show ? 'Gizle' : 'Göster'} tabIndex={-1}><Ic.eye size={17} /></button>
                </div>
              </div>

              {err && <div className="lg-err"><Ic.alert size={15} /> {err}</div>}

              <div className="lg-rowx">
                <div className="lg-rem" onClick={() => setRemember(r => !r)}>
                  <span className={'lg-box' + (remember ? ' on' : '')}><Ic.check size={12} sw={3} /></span> Beni hatırla
                </div>
                <a className="lg-link" onClick={e => e.preventDefault()}>Şifremi unuttum</a>
              </div>

              <button className="lg-btn" type="submit" disabled={loading}>
                {loading ? <><span className="lg-spin" /> Doğrulanıyor…</> : <>Giriş yap <Ic.chevR size={17} sw={2.4} /></>}
              </button>
            </form>

            <div className="lg-demo">
              <div className="lg-demoT">Demo erişimi <button className="lg-demoBtn" onClick={fillDemo}>Otomatik doldur</button></div>
              <div className="lg-demoC lg-m">e-posta: {DEMO.email}<br />şifre: {DEMO.pass}</div>
            </div>

            <div className="lg-foot">
              {['GDP', 'FDA', 'KVKK'].map(b => <span key={b} className="lg-chip">{b}</span>)}
              <span style={{ marginLeft: 'auto' }} className="lg-m">v2.1 · TİTCK uyumlu</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  window.CRLogin = CRLogin;
})();
