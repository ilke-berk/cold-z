/* Kontrol Odası — kabuk (CRShell) + Dashboard gövdesi + paylaşılan stiller */
(function () {
  const { useState, useEffect, useRef } = React;
  const { CCIcons: Ic, CCDecision: DM, CCFmt, CCTempChart, CCGauge, CCData } = window;

  const CSS = `
  .cr{--bg:#0a0e14;--pn:#111824;--pn2:#161f2d;--ln:#1e2735;--ln2:#2a3850;
    --tx:#dde6f1;--t2:#7d8da4;--t3:#505f78;--sig:#46b6da;--sigS:rgba(70,182,218,.13);--amber:#e2a43e;--amberS:rgba(226,164,62,.13);
    --ok:#3cc081;--okS:rgba(60,192,129,.13);--bad:#ea5d6b;--badS:rgba(234,93,107,.13);--rev:#909fe2;--revS:rgba(144,159,226,.13);
    font-family:'Space Grotesk',sans-serif;background:var(--bg);color:var(--tx);
    width:100%;height:100%;display:flex;overflow:hidden;position:relative;
    background-image:linear-gradient(var(--ln) 1px,transparent 1px),linear-gradient(90deg,var(--ln) 1px,transparent 1px);background-size:44px 44px;background-position:-1px -1px;}
  .cr[data-theme=light]{--bg:#e9edf2;--pn:#fff;--pn2:#f4f7fa;--ln:#e3e9f0;--ln2:#cdd8e6;
    --tx:#0d1726;--t2:#54607a;--t3:#8392a8;--sig:#0f81a8;--sigS:#e1f1f7;--amber:#a9781a;--amberS:#f6edd7;
    --ok:#1c9961;--okS:#e3f3ea;--bad:#cb3c48;--badS:#f9e6e7;--rev:#5263a4;--revS:#e9ecf7;}
  .cr *{box-sizing:border-box;margin:0;}
  .cr-m{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;}
  .cr-up{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;font-weight:600;}
  /* rail */
  .cr-rail{width:210px;flex-shrink:0;background:var(--pn);border-right:1px solid var(--ln2);display:flex;flex-direction:column;padding:18px 14px;transition:width .22s cubic-bezier(.4,0,.2,1),padding .22s;}
  .cr-rail.cr-col{width:68px;padding:18px 12px;}
  .cr-col .cr-logo{justify-content:center;}
  .cr-col .cr-logotxt{display:none;}
  .cr-col .cr-ni{justify-content:center;padding:10px 0;gap:0;}
  .cr-col .cr-nilbl{display:none;}
  .cr-col .cr-ni.on::before{display:none;}
  .cr-col .cr-stat{justify-content:center;padding:9px;}
  .cr-nilbl{white-space:nowrap;overflow:hidden;}
  .cr-logo{display:flex;align-items:center;gap:10px;padding:4px 6px 20px;border-bottom:1px solid var(--ln);margin-bottom:14px;}
  .cr-mk{width:32px;height:32px;border:1px solid var(--sig);border-radius:7px;color:var(--sig);display:grid;place-items:center;background:var(--sigS);flex-shrink:0;}
  .cr-logotxt{overflow:hidden;}
  .cr-logo b{font-size:14.5px;font-weight:700;letter-spacing:.3px;}
  .cr-logo .cr-s{font-size:8.5px;letter-spacing:1.5px;color:var(--t3);font-weight:600;text-transform:uppercase;}
  .cr-ni{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:7px;color:var(--t2);font-size:12.5px;font-weight:500;cursor:pointer;transition:.13s;position:relative;}
  .cr-ni:hover{background:var(--pn2);color:var(--tx);}
  .cr-ni.on{background:var(--sigS);color:var(--sig);}
  .cr-ni.on::before{content:'';position:absolute;left:0;top:7px;bottom:7px;width:2.5px;border-radius:2px;background:var(--sig);}
  .cr-railf{margin-top:auto;display:flex;flex-direction:column;gap:8px;}
  .cr-stat{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--t2);padding:8px 10px;background:var(--pn2);border:1px solid var(--ln);border-radius:7px;}
  .cr-themetog{display:flex;gap:3px;background:var(--pn2);border:1px solid var(--ln);border-radius:7px;padding:3px;}
  .cr-tb{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:none;background:transparent;color:var(--t2);font-family:inherit;font-size:11px;font-weight:600;padding:6px 8px;border-radius:5px;cursor:pointer;transition:.12s;white-space:nowrap;}
  .cr-tb.on{background:var(--sig);color:var(--bg);}
  .cr-tb:hover:not(.on){color:var(--tx);}
  .cr-col .cr-themetog{flex-direction:column;gap:2px;}
  .cr-led{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 7px var(--ok);animation:crpulse 1.8s infinite;flex-shrink:0;}
  @keyframes crpulse{0%,100%{opacity:1}50%{opacity:.35}}
  /* main */
  .cr-main{flex:1;display:flex;flex-direction:column;min-width:0;}
  .cr-top{height:56px;flex-shrink:0;position:relative;z-index:30;border-bottom:1px solid var(--ln2);background:color-mix(in srgb,var(--pn) 70%,transparent);backdrop-filter:blur(8px);display:flex;align-items:center;padding:0 24px;gap:16px;}
  .cr-burger{width:34px;height:34px;border:1px solid var(--ln2);border-radius:7px;display:grid;place-items:center;color:var(--t2);cursor:pointer;flex-shrink:0;transition:.13s;}
  .cr-burger:hover{color:var(--tx);background:var(--pn2);border-color:var(--sig);}
  .cr-crumb{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);font-weight:600;}
  .cr-crumb b{color:var(--tx);}
  .cr-clock{margin-left:auto;color:var(--t2);font-size:12.5px;display:flex;align-items:center;gap:7px;}
  .cr-ic{width:34px;height:34px;border:1px solid var(--ln2);border-radius:7px;display:grid;place-items:center;color:var(--t2);cursor:pointer;position:relative;}
  .cr-ic:hover{color:var(--tx);background:var(--pn2);}
  .cr-dot{position:absolute;top:6px;right:7px;width:6px;height:6px;border-radius:50%;background:var(--bad);}
  .cr-av{width:34px;height:34px;border-radius:7px;background:var(--sig);color:#04121a;display:grid;place-items:center;font-size:12px;font-weight:700;}
  .cr-body{flex:1;overflow-y:auto;padding:22px 24px;}
  .cr-h1{font-size:22px;font-weight:700;letter-spacing:-.4px;}
  .cr-h1sub{font-size:12px;color:var(--t2);margin-top:4px;}
  .cr-hr{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;gap:16px;}
  .cr-btn{display:flex;align-items:center;gap:8px;background:var(--sig);color:#04121a;border:none;font-family:inherit;font-size:12.5px;font-weight:600;padding:11px 15px;border-radius:8px;cursor:pointer;letter-spacing:.2px;white-space:nowrap;}
  .cr-btn:hover{filter:brightness(1.08);}
  .cr-btn2{background:transparent;color:var(--t2);border:1px solid var(--ln2);}
  .cr-btn2:hover{color:var(--tx);background:var(--pn2);filter:none;}
  .cr-pn{background:var(--pn);border:1px solid var(--ln2);border-radius:12px;}
  .cr-r1{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px;}
  .cr-ph{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid var(--ln);}
  .cr-pt{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600;letter-spacing:.3px;white-space:nowrap;}
  .cr-phr{display:flex;align-items:center;gap:10px;}
  .cr-phbd{display:inline-flex;align-items:center;gap:5px;font-size:9px;letter-spacing:.8px;text-transform:uppercase;font-weight:700;color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent);border:1px solid color-mix(in srgb,var(--amber) 35%,transparent);padding:3px 7px;border-radius:5px;line-height:1;flex-shrink:0;font-family:'Space Grotesk',sans-serif;}
  .cr-phbd::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--amber);}
  .cr-live{display:flex;align-items:center;gap:6px;color:var(--ok);font-size:10px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;}
  .cr-live i{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 6px var(--ok);animation:crpulse 1.6s infinite;}
  .cr-read{display:flex;align-items:baseline;gap:14px;padding:16px 18px 4px;}
  .cr-big{font-size:52px;font-weight:700;letter-spacing:-2px;line-height:.9;}
  .cr-unit{font-size:18px;color:var(--t2);font-weight:500;}
  .cr-delta{display:flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--ok);}
  .cr-strip{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--ln);margin-top:10px;}
  .cr-sc{padding:13px 18px;border-right:1px solid var(--ln);}
  .cr-sc:last-child{border-right:none;}
  .cr-scL{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t3);font-weight:600;margin-bottom:5px;}
  .cr-scV{font-size:18px;font-weight:600;}
  .cr-side{display:flex;flex-direction:column;gap:16px;}
  .cr-gauge{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center;}
  .cr-dist{padding:14px 18px 18px;}
  .cr-dbar{margin-bottom:13px;}
  .cr-dbarL{display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:6px;color:var(--t2);}
  .cr-track{height:7px;border-radius:4px;background:var(--pn2);border:1px solid var(--ln);overflow:hidden;}
  .cr-fill{height:100%;}
  .cr-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px;}
  .cr-tile{padding:15px 17px;display:flex;flex-direction:column;gap:7px;}
  .cr-tileTop{display:flex;align-items:center;justify-content:space-between;color:var(--t2);}
  .cr-tileV{font-size:27px;font-weight:700;letter-spacing:-1px;}
  .cr-tileL{font-size:11px;color:var(--t2);letter-spacing:.3px;}
  table.cr-t{width:100%;border-collapse:collapse;}
  .cr-t th{text-align:left;font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t3);font-weight:600;padding:11px 18px;border-bottom:1px solid var(--ln2);}
  .cr-t td{padding:12px 18px;font-size:12.5px;border-bottom:1px solid var(--ln);}
  .cr-t tbody tr{cursor:pointer;transition:.1s;}
  .cr-t tbody tr:hover{background:var(--pn2);}
  .cr-chip{font-size:11px;padding:3px 8px;border-radius:5px;background:var(--pn2);border:1px solid var(--ln2);color:var(--t2);}
  .cr-bd{font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;font-weight:600;padding:4px 9px;border-radius:5px;display:inline-flex;align-items:center;gap:6px;}
  .cr-bd i{width:6px;height:6px;border-radius:50%;}
  .cr-s2{font-size:10.5px;color:var(--t3);margin-top:2px;}
  /* form (paylaşımlı) */
  .cr-field{display:flex;flex-direction:column;gap:6px;}
  .cr-label{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t3);font-weight:600;}
  .cr-input,.cr-select{font-family:'JetBrains Mono',monospace;font-size:12.5px;color:var(--tx);background:var(--pn2);border:1px solid var(--ln2);border-radius:7px;padding:9px 11px;width:100%;transition:.13s;}
  .cr-input::placeholder{color:var(--t3);}
  .cr-input:focus,.cr-select:focus{outline:none;border-color:var(--sig);background:var(--pn);}
  .cr-select{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:30px;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808a99' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;}
  .cr-formgrid{display:grid;gap:14px;}
  /* modal/panel */
  .cr-ov{position:absolute;inset:0;background:rgba(4,8,14,.66);backdrop-filter:blur(4px);display:flex;justify-content:flex-end;z-index:20;}
  .cr-panel{width:430px;height:100%;background:var(--pn);border-left:1px solid var(--ln2);padding:24px;overflow-y:auto;}
  .cr-phd{display:flex;align-items:flex-start;justify-content:space-between;}
  .cr-pcl{width:32px;height:32px;border:1px solid var(--ln2);border-radius:7px;background:var(--pn2);display:grid;place-items:center;cursor:pointer;color:var(--t2);}
  .cr-pg{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:18px 0;}
  .cr-pc{background:var(--pn2);border:1px solid var(--ln);border-radius:9px;padding:12px;}
  .cr-pcL{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t3);font-weight:600;margin-bottom:6px;}
  .cr-pcV{font-size:15px;font-weight:600;}
  .cr-rsn{padding:11px 13px;border-radius:8px;font-size:12px;margin-bottom:8px;border-left:3px solid var(--bad);background:var(--pn2);}
  /* topbar: arama + açılır menüler */
  .cr-search{position:relative;flex:1;max-width:330px;margin-left:4px;}
  .cr-search input{width:100%;font-family:'Space Grotesk',sans-serif;font-size:12.5px;color:var(--tx);background:var(--pn2);border:1px solid var(--ln2);border-radius:8px;padding:8px 12px 8px 34px;transition:.13s;}
  .cr-search input::placeholder{color:var(--t3);}
  .cr-search input:focus{outline:none;border-color:var(--sig);background:var(--pn);}
  .cr-si{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--t3);pointer-events:none;display:flex;}
  .cr-kbd{position:absolute;right:9px;top:50%;transform:translateY(-50%);font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--t3);border:1px solid var(--ln2);border-radius:4px;padding:1px 5px;pointer-events:none;}
  .cr-wrap{position:relative;display:flex;}
  .cr-dd{position:absolute;top:calc(100% + 9px);background:var(--pn);border:1px solid var(--ln2);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);z-index:40;overflow:hidden;opacity:1;}
  body[data-app-theme=light] .cr-dd{box-shadow:0 18px 50px rgba(20,40,70,.18);}
  @keyframes crdd{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
  .cr-ddhd{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--ln);font-size:12.5px;font-weight:600;}
  .cr-ddhd .cr-pill{font-size:9.5px;letter-spacing:.5px;color:var(--sig);background:var(--sigS);border-radius:20px;padding:2px 8px;font-weight:700;}
  .cr-ddft{padding:11px 16px;border-top:1px solid var(--ln);text-align:center;font-size:11.5px;color:var(--sig);cursor:pointer;font-weight:600;letter-spacing:.3px;}
  .cr-ddft:hover{background:var(--pn2);}
  .cr-nt{display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--ln);cursor:pointer;transition:.1s;}
  .cr-nt:last-child{border-bottom:none;}
  .cr-nt:hover{background:var(--pn2);}
  .cr-ntic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;}
  .cr-ntt{font-size:12.5px;font-weight:600;line-height:1.25;}
  .cr-ntd{font-size:11.5px;color:var(--t2);line-height:1.45;margin-top:3px;}
  .cr-ntago{font-size:9.5px;color:var(--t3);margin-top:5px;font-family:'JetBrains Mono',monospace;}
  .cr-unread{width:7px;height:7px;border-radius:50%;background:var(--sig);flex-shrink:0;align-self:center;}
  .cr-mhd{display:flex;gap:11px;align-items:center;padding:15px 16px;border-bottom:1px solid var(--ln);}
  .cr-mav{width:42px;height:42px;border-radius:11px;background:var(--sig);color:#04121a;display:grid;place-items:center;font-size:15px;font-weight:700;flex-shrink:0;}
  .cr-mnm{font-size:13.5px;font-weight:700;}
  .cr-mrl{font-size:10.5px;color:var(--t2);margin-top:2px;}
  .cr-mml{font-size:10px;color:var(--t3);margin-top:2px;font-family:'JetBrains Mono',monospace;}
  .cr-mi{display:flex;align-items:center;gap:11px;padding:11px 16px;font-size:12.5px;color:var(--t2);cursor:pointer;transition:.1s;white-space:nowrap;}
  .cr-mi svg{flex-shrink:0;}
  .cr-mi:hover{background:var(--pn2);color:var(--tx);}
  .cr-mi.danger:hover{color:var(--bad);}
  .cr-sr{display:flex;gap:11px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--ln);cursor:pointer;transition:.1s;}
  .cr-sr:last-child{border-bottom:none;}
  .cr-sr:hover{background:var(--pn2);}
  .cr-srt{font-size:12.5px;font-weight:600;}
  .cr-srs{font-size:10.5px;color:var(--t3);margin-top:2px;}
  .cr-empty{padding:26px 16px;text-align:center;font-size:12px;color:var(--t3);}
  `;

  const NAVS = [['dashboard', 'grid', 'Kontrol Paneli'], ['upload', 'upload', 'Veri Yükleme'], ['analysis', 'activity', 'Analiz & Karar'], ['report', 'report', 'Rapor'], ['settings', 'cog', 'Ayarlar']];

  const NOTIFS = [
    { ic: 'alert', tone: 'bad', t: 'MKT ihlali — Şifa Eczanesi', d: 'Cihaz NN-3344-B 11,8°C pik yaptı · iade reddi önerildi', ago: '4 dk önce', unread: true },
    { ic: 'thermo', tone: 'warn', t: 'Sapma tespit edildi — Depo A', d: '2–8°C bandı 38 dk aşıldı, TOR limitine yaklaşılıyor', ago: '22 dk önce', unread: true },
    { ic: 'upload', tone: 'sig', t: 'Yeni iade bildirimi', d: 'Hayat Eczanesi · LANTUS SOLOSTAR · 1.440 kayıt yüklendi', ago: '1 sa önce', unread: true },
    { ic: 'check', tone: 'ok', t: 'Rapor hazır', d: 'CC-TZ-4471-A onay sertifikası oluşturuldu', ago: '3 sa önce', unread: false },
  ];
  const ntTone = t => ({ ok: ['var(--ok)', 'var(--okS)'], warn: ['var(--amber)', 'var(--amberS)'], bad: ['var(--bad)', 'var(--badS)'], sig: ['var(--sig)', 'var(--sigS)'] }[t]);
  const pad2 = n => String(n).padStart(2, '0');

  const tone = t => ({ ok: ['var(--ok)', 'var(--okS)'], warn: ['var(--amber)', 'var(--amberS)'], rev: ['var(--rev)', 'var(--revS)'], bad: ['var(--bad)', 'var(--badS)'] }[t]);
  function Badge({ decision }) { const m = DM[decision]; const [c, s] = tone(m.tone); return <span className="cr-bd" style={{ color: c, background: s }}><i style={{ background: c }} />{m.tr}</span>; }

  // ---- Kabuk ----
  function CRShell({ theme = 'dark', active = 'dashboard', onNav = () => {}, crumb, children, overlay }) {
    const dt = theme === 'light' ? 'light' : 'dark';
    const [collapsed, setCollapsed] = useState(false);
    const [now, setNow] = useState(() => new Date());
    const [menu, setMenu] = useState(null);   // 'search' | 'bell' | 'avatar'
    const [q, setQ] = useState('');
    const topRef = useRef(null);
    const searchRef = useRef(null);
    const s = CCData.stats;
    const crumbTxt = crumb || (NAVS.find(n => n[0] === active) || [, , 'KONTROL PANELİ'])[2].toUpperCase();

    useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
    useEffect(() => {
      const onDoc = e => { if (topRef.current && !topRef.current.contains(e.target)) setMenu(null); };
      const onKey = e => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setMenu('search'); searchRef.current && searchRef.current.focus(); }
        if (e.key === 'Escape') setMenu(null);
      };
      document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
      return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, []);

    const clock = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${now.getFullYear()} · ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const unread = NOTIFS.filter(n => n.unread).length;
    const ql = q.trim().toLowerCase();
    const results = ql ? CCData.analyses.filter(a => (a.pharmacy + ' ' + a.drug + ' ' + a.serial + ' ' + a.city).toLowerCase().includes(ql)).slice(0, 6) : [];
    const goSearch = () => { setMenu(null); setQ(''); onNav('analysis'); };

    return (
      <div className="cr" data-theme={dt}>
        <style>{CSS}</style>
        <aside className={'cr-rail' + (collapsed ? ' cr-col' : '')} style={{ width: collapsed ? 68 : 210 }}>
          <div className="cr-logo"><span className="cr-mk"><Ic.snow size={18} sw={2} /></span><div className="cr-logotxt"><b>ColdChain</b><div className="cr-s">Monitoring</div></div></div>
          {NAVS.map(([id, ic, l]) => { const C = Ic[ic]; return <div key={id} className={'cr-ni' + (id === active ? ' on' : '')} title={collapsed ? l : ''} onClick={() => onNav(id)}><C size={17} /><span className="cr-nilbl">{l}</span></div>; })}
          <div className="cr-railf">
            <div className="cr-stat"><span className="cr-led" /> {!collapsed && <span>Sistem çevrimiçi · {s.devicesOnline}/{s.devicesTotal} cihaz</span>}</div>
            <div className="cr-themetog">
              {[['dark', 'Koyu', 'moon'], ['light', 'Aydınlık', 'sun']].map(([k, lbl, ic]) => {
                const C = Ic[ic];
                return <button key={k} className={'cr-tb' + (theme === k ? ' on' : '')}
                  onClick={() => window.dispatchEvent(new CustomEvent('cc-theme-set', { detail: k }))}
                  title={collapsed ? lbl : ''}>
                  <C size={13} />{!collapsed && <span>{lbl}</span>}
                </button>;
              })}
            </div>
            {!collapsed && <div className="cr-badges" style={{ display: 'flex', gap: 6 }}>{['GDP', 'FDA', 'KVKK'].map(b => <span key={b} className="cr-chip cr-up" style={{ flex: 1, textAlign: 'center' }}>{b}</span>)}</div>}
          </div>
        </aside>
        <div className="cr-main">
          <header className="cr-top" ref={topRef}>
            <div className="cr-burger" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}>{collapsed ? <Ic.menu size={17} /> : <Ic.chevL size={17} />}</div>
            <div className="cr-crumb">SİSTEM / <b>{crumbTxt}</b></div>

            <div className="cr-search">
              <span className="cr-si"><Ic.search size={15} /></span>
              <input ref={searchRef} placeholder="Eczane, ilaç veya seri no ara…" value={q}
                onChange={e => { setQ(e.target.value); setMenu('search'); }} onFocus={() => setMenu('search')} />
              {!q && <span className="cr-kbd">⌘K</span>}
              {menu === 'search' && ql && (
                <div className="cr-dd" style={{ left: 0, width: 360 }}>
                  <div className="cr-ddhd">Kayıt arama <span className="cr-pill">{results.length} SONUÇ</span></div>
                  {results.length ? results.map(a => { const ok = a.mkt >= 2 && a.mkt <= 8; return (
                    <div key={a.id} className="cr-sr" onClick={goSearch}>
                      <span className="cr-chip cr-m" style={{ flexShrink: 0 }}>{a.serial}</span>
                      <div style={{ flex: 1, minWidth: 0 }}><div className="cr-srt">{a.pharmacy}</div><div className="cr-srs">{a.drug} · {a.city}</div></div>
                      <span className="cr-m" style={{ fontSize: 12, fontWeight: 600, color: ok ? 'var(--ok)' : 'var(--bad)' }}>{a.mkt.toFixed(1)}°</span>
                    </div>); }) : <div className="cr-empty">“{q}” için kayıt bulunamadı</div>}
                </div>
              )}
            </div>

            <div className="cr-clock cr-m"><Ic.clock size={14} /> {clock}</div>

            <div className="cr-wrap">
              <div className="cr-ic" onClick={() => setMenu(m => m === 'bell' ? null : 'bell')} title="Bildirimler"><Ic.bell size={17} />{unread > 0 && <span className="cr-dot" />}</div>
              {menu === 'bell' && (
                <div className="cr-dd" style={{ right: 0, width: 348 }}>
                  <div className="cr-ddhd">Bildirimler <span className="cr-pill">{unread} YENİ</span></div>
                  {NOTIFS.map((n, i) => { const [c, bg] = ntTone(n.tone); const C = Ic[n.ic]; return (
                    <div key={i} className="cr-nt">
                      <div className="cr-ntic" style={{ color: c, background: bg }}><C size={16} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}><div className="cr-ntt">{n.t}</div><div className="cr-ntd">{n.d}</div><div className="cr-ntago">{n.ago}</div></div>
                      {n.unread && <span className="cr-unread" />}
                    </div>); })}
                  <div className="cr-ddft">Tümünü okundu işaretle</div>
                </div>
              )}
            </div>

            <div className="cr-wrap">
              <div className="cr-av" style={{ cursor: 'pointer' }} onClick={() => setMenu(m => m === 'avatar' ? null : 'avatar')}>EA</div>
              {menu === 'avatar' && (
                <div className="cr-dd" style={{ right: 0, width: 250 }}>
                  <div className="cr-mhd">
                    <span className="cr-mav">EA</span>
                    <div style={{ minWidth: 0 }}><div className="cr-mnm">Elif Aydın</div><div className="cr-mrl">Kalite Güvence (QA)</div><div className="cr-mml">elif.aydin@coldchain.ai</div></div>
                  </div>
                  <div className="cr-mi"><Ic.user size={16} /> Profilim</div>
                  <div className="cr-mi" onClick={() => { setMenu(null); onNav('settings'); }}><Ic.cog size={16} /> Ayarlar</div>
                  <div className="cr-mi"><Ic.shield size={16} /> Denetim & Uyum</div>
                  <div style={{ borderTop: '1px solid var(--ln)' }} />
                  <div className="cr-mi danger" onClick={() => { setMenu(null); window.dispatchEvent(new CustomEvent('cc-logout')); }}><Ic.logout size={16} /> Çıkış Yap</div>
                </div>
              )}
            </div>
          </header>
          <div className="cr-body">{children}</div>
        </div>
        {overlay}
      </div>
    );
  }

  // ---- Dashboard gövdesi ----
  function CRDashboard({ theme, onNav = () => {} }) {
    const [sel, setSel] = useState(null);
    const [live, setLive] = useState(null); // {analyses, stats} — DB'den
    const d = CCData;

    useEffect(() => {
      let alive = true;
      Promise.all([
        fetch('/api/recent-analyses').then(r => r.json()).catch(() => null),
        fetch('/api/stats').then(r => r.json()).catch(() => null),
      ]).then(([ra, st]) => {
        if (!alive) return;
        const rows = ra && ra.success && Array.isArray(ra.data) ? ra.data : [];
        if (!rows.length) return; // DB boş → demo kalır
        const analyses = rows.map(r => {
          let reasons = [];
          try { reasons = JSON.parse(r.reasons || '[]'); } catch (e) {}
          return {
            id: r.id, ts: r.created_at ? (r.created_at.includes('Z') || r.created_at.includes('T') ? new Date(r.created_at).getTime() : new Date(r.created_at.replace(' ', 'T') + 'Z').getTime()) : Date.now(),
            pharmacy: r.pharmacy_name || 'Belirtilmemiş', city: '',
            drug: r.drug_name || '—', serial: r.device_serial || '—',
            mkt: r.mkt_value != null ? r.mkt_value : 0, tor: null,
            decision: r.decision || 'conditional', reasons: Array.isArray(reasons) ? reasons : [],
          };
        });
        const sd = (st && st.success && st.data) || {};
        setLive({ analyses, stats: sd });
      });
      return () => { alive = false; };
    }, []);

    const isLive = !!live;
    const analyses = isLive ? live.analyses : d.analyses;
    const ls = isLive ? live.stats : null;
    const total = ls ? (ls.total_count || analyses.length) : null;
    const accPct = ls && total ? Math.round((ls.accept_count || 0) / total * 100) : null;
    const conPct = ls && total ? Math.round((ls.conditional_count || 0) / total * 100) : null;
    const rejPct = ls && total ? Math.round((ls.reject_count || 0) / total * 100) : null;
    const s = d.stats;
    const tiles = isLive ? [
      { ic: 'box', v: (total || 0).toLocaleString('tr-TR'), l: 'Toplam Analiz' },
      { ic: 'check', v: '%' + String(accPct || 0).replace('.', ','), l: 'Kabul Oranı' },
      { ic: 'thermo', v: (ls.avg_mkt != null ? Number(ls.avg_mkt).toFixed(1) : '—').replace('.', ',') + '°C', l: 'Ortalama MKT' },
      { ic: 'clock', v: String((ls.conditional_count || 0)), l: 'İnceleme Bekliyor' },
    ] : [
      { ic: 'box', v: '1.247', l: 'Toplam Analiz' }, { ic: 'check', v: '%68,5', l: 'Kabul Oranı' },
      { ic: 'thermo', v: '5,4°C', l: 'Ortalama MKT' }, { ic: 'clock', v: '47', l: 'İnceleme Bekliyor' },
    ];
    const dist = isLive
      ? [['Kabul', accPct || 0, 'var(--ok)'], ['Şartlı / Revize', conPct || 0, 'var(--amber)'], ['Red', rejPct || 0, 'var(--bad)']]
      : [['Kabul', s.acceptRate, 'var(--ok)'], ['Şartlı / Revize', s.conditionalRate, 'var(--amber)'], ['Red', s.rejectRate, 'var(--bad)']];
    const overlay = sel && (
      <div className="cr-ov" onClick={() => setSel(null)}>
        <div className="cr-panel" onClick={e => e.stopPropagation()}>
          <div className="cr-phd"><div><div style={{ fontSize: 17, fontWeight: 700 }}>{sel.pharmacy}</div><div className="cr-s2" style={{ marginTop: 4 }}>{sel.city} · {sel.drug}</div></div><div className="cr-pcl" onClick={() => setSel(null)}><Ic.x size={16} /></div></div>
          <div className="cr-pg">
            <div className="cr-pc"><div className="cr-pcL">Zaman</div><div className="cr-pcV cr-m" style={{ fontSize: 13 }}>{CCFmt.fmtTime(sel.ts)}</div></div>
            <div className="cr-pc"><div className="cr-pcL">Karar</div><Badge decision={sel.decision} /></div>
            <div className="cr-pc"><div className="cr-pcL">Seri No</div><div className="cr-pcV cr-m" style={{ fontSize: 13 }}>{sel.serial}</div></div>
            <div className="cr-pc"><div className="cr-pcL">MKT</div><div className="cr-pcV cr-m" style={{ color: sel.mkt <= 8 && sel.mkt >= 2 ? 'var(--ok)' : 'var(--bad)' }}>{sel.mkt.toFixed(2)}°C</div></div>
          </div>
          <div className="cr-pt" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 10 }}>TİTCK / GDP Gerekçeleri</div>
          {sel.reasons.length ? sel.reasons.map((r, i) => <div key={i} className="cr-rsn">{r}</div>) :
            <div className="cr-rsn" style={{ borderLeftColor: 'var(--ok)', color: 'var(--ok)' }}>İhlal tespit edilmedi. Cihaz 2–8°C bandında uyumlu.</div>}
        </div>
      </div>
    );
    return (
      <CRShell theme={theme} active="dashboard" onNav={onNav} overlay={overlay}>
        <div className="cr-hr">
          <div><div className="cr-h1">Kontrol Paneli</div><div className="cr-h1sub">İlaç soğuk zincir · gerçek zamanlı izleme ve karar akışı</div></div>
          <button className="cr-btn" onClick={() => onNav('upload')}><Ic.plus size={15} sw={2.4} /> YENİ İADE BİLDİRİMİ</button>
        </div>
        <div className="cr-r1">
          <div className="cr-pn">
            <div className="cr-ph"><div className="cr-pt"><Ic.thermo size={16} style={{ color: 'var(--sig)' }} /> DEPO ISI MONİTÖRÜ</div><div className="cr-phr"><span className="cr-phbd">placeholder</span><span className="cr-live"><i /> CANLI</span></div></div>
            <div className="cr-read"><span className="cr-big cr-m" style={{ color: 'var(--sig)' }}>5.62</span><span className="cr-unit cr-m">°C</span><span className="cr-delta"><Ic.arrowUp size={13} sw={2.6} /> 0.3° / sa</span></div>
            <div style={{ padding: '6px 14px 4px' }}>
              <CCTempChart data={d.temp} w={760} h={170} color="var(--sig)" gridColor="var(--ln)" axisColor="var(--t3)" bandColor="var(--okS)" fill={true} />
            </div>
            <div className="cr-strip cr-m">
              {[['MİN 72s', '3.91°', 'var(--sig)'], ['MAKS 72s', '9.24°', 'var(--bad)'], ['ORTALAMA', '5.40°', 'var(--tx)'], ['SAPMA SAYISI', '2', 'var(--amber)']].map(([l, v, c]) => (
                <div key={l} className="cr-sc"><div className="cr-scL" style={{ fontFamily: "'Space Grotesk'" }}>{l}</div><div className="cr-scV" style={{ color: c }}>{v}</div></div>))}
            </div>
          </div>
          <div className="cr-side">
            <div className="cr-pn" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="cr-ph"><div className="cr-pt">TOR KULLANIMI</div><span className="cr-phbd">placeholder</span></div>
              <div className="cr-gauge">
                <CCGauge value={412} max={480} label="412" sub="/ 480 dk limit" color="var(--amber)" trackColor="var(--ln)" textColor="var(--tx)" size={138} />
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 8 }}>Buzdolabı dışı toplam süre</div>
              </div>
            </div>
            <div className="cr-pn cr-dist">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div className="cr-pt">KARAR DAĞILIMI</div>
                {!isLive && <span className="cr-phbd">placeholder</span>}
              </div>
              {dist.map(([l, v, c]) => (
                <div key={l} className="cr-dbar"><div className="cr-dbarL"><span>{l}</span><b className="cr-m" style={{ color: c }}>%{String(v).replace('.', ',')}</b></div><div className="cr-track"><div className="cr-fill" style={{ width: v + '%', background: c }} /></div></div>))}
            </div>
          </div>
        </div>
        <div className="cr-tiles">
          {tiles.map((t, i) => { const C = Ic[t.ic]; return (
            <div key={i} className="cr-pn cr-tile">
              <div className="cr-tileTop"><C size={16} />{isLive
                ? <span className="cr-up" style={{ color: 'var(--t3)' }}>0{i + 1}</span>
                : <span className="cr-phbd">placeholder</span>}</div>
              <div className="cr-tileV cr-m">{t.v}</div><div className="cr-tileL">{t.l}</div>
            </div>); })}
        </div>
        <div className="cr-pn">
          <div className="cr-ph"><div className="cr-pt">İADE KAYIT AKIŞI{isLive && <span className="cr-chip" style={{ marginLeft: 8, color: 'var(--ok)', background: 'var(--okS)', borderColor: 'var(--ok)' }}>CANLI</span>}</div><div className="cr-phr">{!isLive && <span className="cr-phbd">placeholder</span>}<span className="cr-up" style={{ color: 'var(--t3)' }}>SON {analyses.length} KAYIT</span></div></div>
          <table className="cr-t">
            <thead><tr>{['Zaman', 'Eczane', 'İlaç', 'Seri', 'MKT', 'TOR', 'Karar'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {analyses.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '34px 0', color: 'var(--t2)' }}>Henüz kayıt yok — ilk analizi oluşturup kaydedin.</td></tr>
              ) : analyses.map(a => { const ok = a.mkt >= 2 && a.mkt <= 8; return (
                <tr key={a.id} onClick={() => setSel(a)}>
                  <td className="cr-m" style={{ color: 'var(--t2)' }}>{CCFmt.fmtTime(a.ts)}</td>
                  <td><div style={{ fontWeight: 600 }}>{a.pharmacy}</div><div className="cr-s2">{a.city}</div></td>
                  <td style={{ color: 'var(--t2)', maxWidth: 160 }}>{a.drug}</td>
                  <td><span className="cr-chip cr-m">{a.serial}</span></td>
                  <td className="cr-m" style={{ fontWeight: 600, color: ok ? 'var(--ok)' : 'var(--bad)' }}>{a.mkt.toFixed(2)}°</td>
                  <td className="cr-m" style={{ color: a.tor != null && a.tor > 180 ? 'var(--bad)' : 'var(--t2)' }}>{a.tor != null ? a.tor : '—'}</td>
                  <td><Badge decision={a.decision} /></td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      </CRShell>
    );
  }

  // Kıyaslama tuvali için sarmalayıcı (tek ekran)
  function DirControlRoom({ theme = 'dark' }) { return <CRDashboard theme={theme} onNav={() => {}} />; }

  Object.assign(window, { CRShell, CRDashboard, DirControlRoom, CRBadge: Badge, CR_NAVS: NAVS });
})();
