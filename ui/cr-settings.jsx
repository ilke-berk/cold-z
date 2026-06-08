/* Ayarlar sayfası gövdesi (Kontrol Odası dili) */
(function () {
  const { useState } = React;
  const { CCIcons: Ic, CRShell } = window;

  const SET_CSS = `
  .set-g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;align-items:start;}
  .set-bd{padding:18px;display:grid;gap:14px;}
  .set-sw{position:relative;width:42px;height:24px;border-radius:13px;background:var(--ln2);cursor:pointer;transition:.16s;flex-shrink:0;}
  .set-sw.on{background:var(--sig);}
  .set-sw::after{content:'';position:absolute;top:2.5px;left:2.5px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.16s;box-shadow:0 1px 3px rgba(0,0,0,.35);}
  .set-sw.on::after{transform:translateX(18px);}
  .set-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-top:1px solid var(--ln);}
  .set-row:first-child{border-top:none;padding-top:0;}
  .set-rl{font-size:12.5px;font-weight:600;}
  .set-rs{font-size:11px;color:var(--t3);margin-top:3px;line-height:1.45;max-width:340px;}
  .set-seg{display:flex;gap:3px;background:var(--pn2);border:1px solid var(--ln2);border-radius:8px;padding:3px;}
  .set-seg button{border:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;padding:6px 12px;border-radius:6px;background:transparent;color:var(--t2);transition:.12s;white-space:nowrap;}
  .set-seg button.on{background:var(--sig);color:#04121a;}
  .set-key{display:flex;gap:8px;}
  .set-iconbtn{width:38px;flex-shrink:0;border:1px solid var(--ln2);background:var(--pn2);border-radius:7px;display:grid;place-items:center;color:var(--t2);cursor:pointer;transition:.13s;}
  .set-iconbtn:hover{color:var(--sig);border-color:var(--sig);}
  .set-status{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:600;padding:8px 12px;border-radius:8px;}
  .set-status i{width:7px;height:7px;border-radius:50%;}
  .set-note{font-size:11px;color:var(--t3);line-height:1.5;padding-top:4px;border-top:1px solid var(--ln);}
  .set-foot{display:flex;align-items:center;gap:12px;position:sticky;bottom:0;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(8px);padding:14px 0 4px;margin-top:4px;border-top:1px solid var(--ln2);}
  `;

  function Switch({ on, set }) { return <div className={'set-sw' + (on ? ' on' : '')} onClick={() => set(!on)} />; }
  function Row({ label, sub, children }) {
    return <div className="set-row"><div style={{ minWidth: 0 }}><div className="set-rl">{label}</div>{sub && <div className="set-rs">{sub}</div>}</div>{children}</div>;
  }
  function Field({ label, children }) { return <div className="cr-field"><label className="cr-label">{label}</label>{children}</div>; }

  const RANGES = {
    cold: 'Soğuk Zincir Standart · 2–8°C',
    frozen: 'Dondurulmuş · −25…−15°C',
    room: 'Kontrollü Oda · 15–25°C',
    deep: 'Derin Dondurucu · ≤ −60°C',
    custom: 'Özel Aralık',
  };
  const MODELS = [['flash15', 'gemini-1.5-flash'], ['flash25', 'gemini-2.5-flash'], ['pro25', 'gemini-2.5-pro']];

  function CRSettings({ theme, onNav = () => {} }) {
    const [range, setRange] = useState('cold');
    const [lo, setLo] = useState(2);
    const [hi, setHi] = useState(8);
    const [tor, setTor] = useState(120);
    const [gap, setGap] = useState(60);
    const [dH, setDH] = useState(83.144);
    const [model, setModel] = useState('flash25');
    const [showKey, setShowKey] = useState(false);
    const [rate, setRate] = useState(39);
    const [pin, setPin] = useState(0.30);
    const [pout, setPout] = useState(2.50);
    const [budget, setBudget] = useState(500);
    const [sw, setSw] = useState({ mailReject: true, push: false, autoExcel: true, hideDemo: false, vision: true, antifraud: true });
    const [retention, setRetention] = useState('5y');
    const tw = (k) => setSw(s => ({ ...s, [k]: !s[k] }));

    return (
      <CRShell theme={theme} active="settings" onNav={onNav}>
        <style>{SET_CSS}</style>
        <div className="cr-hr">
          <div><div className="cr-h1">Ayarlar</div><div className="cr-h1sub">Sıcaklık eşikleri, yapay zeka modeli, fiyatlandırma ve güvenlik tercihleri</div></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="cr-btn cr-btn2"><Ic.refresh size={15} /> Varsayılana dön</button>
            <button className="cr-btn"><Ic.save size={15} /> Değişiklikleri kaydet</button>
          </div>
        </div>

        <div className="set-g2">
          {/* Sıcaklık eşikleri */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.thermo size={15} style={{ color: 'var(--sig)' }} /> SICAKLIK & EŞİK DEĞERLERİ</div></div>
            <div className="set-bd">
              <Field label="Varsayılan Saklama Koşulu">
                <select className="cr-select" value={range} onChange={e => setRange(e.target.value)}>
                  {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Alt Limit °C"><input className="cr-input" type="number" value={lo} onChange={e => setLo(e.target.value)} /></Field>
                <Field label="Üst Limit °C"><input className="cr-input" type="number" value={hi} onChange={e => setHi(e.target.value)} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="TOR Limiti (dakika)"><input className="cr-input" type="number" value={tor} onChange={e => setTor(e.target.value)} /></Field>
                <Field label="Maks. Kayıt Aralığı (dk)"><input className="cr-input" type="number" value={gap} onChange={e => setGap(e.target.value)} /></Field>
              </div>
              <Field label="Aktivasyon Enerjisi ΔH (kJ/mol) — MKT"><input className="cr-input" type="number" step="0.001" value={dH} onChange={e => setDH(e.target.value)} /></Field>
              <div className="set-note">MKT hesabı bu ΔH katsayısını kullanır. ICH Q1A standardı için <b style={{ color: 'var(--sig)' }}>83,144 kJ/mol</b> önerilir.</div>
            </div>
          </div>

          {/* Yapay zeka modeli */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.cpu size={15} style={{ color: 'var(--sig)' }} /> YAPAY ZEKA MODELİ (.env)</div>
              <span className="set-status" style={{ color: 'var(--ok)', background: 'var(--okS)' }}><i style={{ background: 'var(--ok)' }} />BAĞLI</span></div>
            <div className="set-bd">
              <Field label="Çözümleme Modeli">
                <div className="set-seg">{MODELS.map(([k, l]) => <button key={k} className={k === model ? 'on' : ''} onClick={() => setModel(k)}>{l.replace('gemini-', '')}</button>)}</div>
              </Field>
              <Field label="GEMINI_API_KEY">
                <div className="set-key">
                  <input className="cr-input" type={showKey ? 'text' : 'password'} defaultValue="AIzaSyD-9tQ4mvK7n2bX1pR8w" />
                  <div className="set-iconbtn" onClick={() => setShowKey(v => !v)} title={showKey ? 'Gizle' : 'Göster'}><Ic.eye size={16} /></div>
                </div>
              </Field>
              <Row label="Görüntü / OCR taraması" sub="PDF ve fotoğraf loggerlarını Smart Hybrid ile otomatik çöz."><Switch on={sw.vision} set={() => tw('vision')} /></Row>
              <Row label="Anti-Fraud denetimi" sub="Yüklenen veride manipülasyon (Excel/PDF düzenleme) tespiti."><Switch on={sw.antifraud} set={() => tw('antifraud')} /></Row>
              <div className="set-note">API anahtarı yalnızca yerel <b className="cr-m" style={{ color: 'var(--t2)' }}>userData/.env</b> dosyasında saklanır, installer'a paketlenmez.</div>
            </div>
          </div>
        </div>

        <div className="set-g2">
          {/* Fiyat & kur */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.dollar size={15} style={{ color: 'var(--sig)' }} /> FİYAT & KUR</div></div>
            <div className="set-bd">
              <Field label="USD / TRY Kuru"><input className="cr-input" type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Girdi ($ / 1M token)"><input className="cr-input" type="number" step="0.01" value={pin} onChange={e => setPin(e.target.value)} /></Field>
                <Field label="Çıktı ($ / 1M token)"><input className="cr-input" type="number" step="0.01" value={pout} onChange={e => setPout(e.target.value)} /></Field>
              </div>
              <Field label="Aylık Bütçe Uyarı Eşiği (₺)"><input className="cr-input" type="number" value={budget} onChange={e => setBudget(e.target.value)} /></Field>
              <div className="set-note">Bu değerler <b className="cr-m" style={{ color: 'var(--t2)' }}>.env</b> fiyat tablosunu geçersiz kılar. Boş bırakılırsa model bazlı varsayılan tablo kullanılır.</div>
            </div>
          </div>

          {/* Bildirim & otomasyon */}
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.bell size={15} style={{ color: 'var(--sig)' }} /> BİLDİRİM & OTOMASYON</div></div>
            <div className="set-bd">
              <Row label="RED kararında e-posta" sub="İade reddi verildiğinde QA ekibine otomatik uyarı gönder."><Switch on={sw.mailReject} set={() => tw('mailReject')} /></Row>
              <Row label="Masaüstü push bildirimi" sub="Sapma ve MKT ihlallerinde anlık bildirim."><Switch on={sw.push} set={() => tw('push')} /></Row>
              <Row label="Otomatik Excel dışa aktarım" sub="Her analiz sonrası raporu otomatik kaydet."><Switch on={sw.autoExcel} set={() => tw('autoExcel')} /></Row>
              <Row label="Demo butonunu üretimde gizle" sub="Prod build'de sentetik veri butonu görünmesin."><Switch on={sw.hideDemo} set={() => tw('hideDemo')} /></Row>
            </div>
          </div>
        </div>

        {/* Güvenlik */}
        <div className="cr-pn" style={{ marginBottom: 16 }}>
          <div className="cr-ph"><div className="cr-pt"><Ic.lock size={15} style={{ color: 'var(--sig)' }} /> VERİ BÜTÜNLÜĞÜ & GÜVENLİK</div></div>
          <div className="set-bd" style={{ gridTemplateColumns: '1fr 1fr', display: 'grid', gap: 18 }}>
            <div>
              <Field label="Denetim Zinciri Durumu">
                <div className="set-status" style={{ color: 'var(--ok)', background: 'var(--okS)', justifyContent: 'flex-start' }}><i style={{ background: 'var(--ok)' }} />Sağlam — 1.247 kayıt SHA-256 ile doğrulandı</div>
              </Field>
              <div style={{ height: 12 }} />
              <Field label="Hash Algoritması"><input className="cr-input" value="SHA-256 (hash chain)" readOnly style={{ color: 'var(--t3)' }} /></Field>
            </div>
            <div>
              <Field label="KVKK Veri Saklama Süresi">
                <select className="cr-select" value={retention} onChange={e => setRetention(e.target.value)}>
                  {[['1y', '1 yıl'], ['2y', '2 yıl'], ['5y', '5 yıl (TİTCK önerisi)'], ['10y', '10 yıl']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <div style={{ height: 12 }} />
              <button className="cr-btn cr-btn2" style={{ width: '100%', justifyContent: 'center' }}><Ic.shield size={15} /> Denetim zincirini şimdi doğrula</button>
            </div>
          </div>
        </div>

        <div className="set-foot">
          <button className="cr-btn"><Ic.save size={15} /> Değişiklikleri kaydet</button>
          <button className="cr-btn cr-btn2" onClick={() => onNav('dashboard')}><Ic.chevL size={15} /> Kontrol Paneli</button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace" }}>ColdChain AI · v2.1 · son kayıt 06.06.2026 09:24</span>
        </div>
      </CRShell>
    );
  }

  window.CRSettings = CRSettings;
})();
