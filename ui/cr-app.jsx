/* Kontrol Odası — gezinilebilir uygulama (sayfa + tema yönetimi) */
(function () {
  const { useState, useEffect } = React;
  const { CCIcons: Ic, CRShell, CRDashboard, CRUpload, CRAnalysis, CRReport, CRSettings, CRTemplates, CRLogin } = window;

  function Placeholder({ theme, active, onNav, label }) {
    return (
      <CRShell theme={theme} active={active} onNav={onNav}>
        <div className="cr-hr">
          <div><div className="cr-h1">{label}</div><div className="cr-h1sub">Bu ekran sıradaki adımda bu tasarım dilinin üzerine kurulacak</div></div>
        </div>
        <div className="cr-pn" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '70px 24px', textAlign: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--sigS)', color: 'var(--sig)', display: 'grid', placeItems: 'center' }}><Ic.box size={26} /></div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{label} — yakında</div>
          <div style={{ fontSize: 12.5, color: 'var(--t2)', maxWidth: 360, lineHeight: 1.6 }}>
            Kontrol Paneli ve Veri Yükleme hazır. Bu ekranı da aynı kabuk, palet ve bileşenlerle tasarlayacağız.
          </div>
          <button className="cr-btn cr-btn2" onClick={() => onNav('dashboard')} style={{ marginTop: 6 }}><Ic.chevL size={14} /> Kontrol Paneli'ne dön</button>
        </div>
      </CRShell>
    );
  }

  const LABELS = { analysis: 'Analiz & Karar', report: 'Rapor' };

  function CRApp() {
    const [authed, setAuthed] = useState(() => !!localStorage.getItem('cc-auth'));
    const [page, setPage] = useState(() => localStorage.getItem('cc-page') || 'dashboard');
    const [theme, setTheme] = useState(() => localStorage.getItem('cc-theme') || 'dark');
    useEffect(() => { localStorage.setItem('cc-theme', theme); document.body.setAttribute('data-app-theme', theme); }, [theme]);
    useEffect(() => { localStorage.setItem('cc-page', page); }, [page]);
    useEffect(() => {
      const onLogout = () => { localStorage.removeItem('cc-auth'); setPage('dashboard'); setAuthed(false); };
      const onThemeSet = (e) => { if (e.detail === 'dark' || e.detail === 'light') setTheme(e.detail); };
      window.addEventListener('cc-logout', onLogout);
      window.addEventListener('cc-theme-set', onThemeSet);
      return () => { window.removeEventListener('cc-logout', onLogout); window.removeEventListener('cc-theme-set', onThemeSet); };
    }, []);

    let body;
    if (!authed) body = <CRLogin theme={theme} onAuth={() => setAuthed(true)} />;
    else if (page === 'dashboard') body = <CRDashboard theme={theme} onNav={setPage} />;
    else if (page === 'upload') body = <CRUpload theme={theme} onNav={setPage} />;
    else if (page === 'analysis') body = <CRAnalysis theme={theme} onNav={setPage} />;
    else if (page === 'report') body = <CRReport theme={theme} onNav={setPage} />;
    else if (page === 'templates') body = <CRTemplates theme={theme} onNav={setPage} />;
    else if (page === 'settings') body = <CRSettings theme={theme} onNav={setPage} />;
    else body = <Placeholder theme={theme} active={page} onNav={setPage} label={LABELS[page] || 'Ekran'} />;

    return (
      <>
        {body}
      </>
    );
  }

  window.CRApp = CRApp;
})();
