/* Kontrol Odası — gezinilebilir uygulama (oturum + sayfa + tema yönetimi)
 *
 * Oturum SUNUCU tarafındadır (HttpOnly çerez, /api/auth/*). Bu bileşen
 * açılışta /api/auth/status'a bakar: kurulum gerekiyorsa veya oturum yoksa
 * giriş ekranı; varsa kullanıcı window.CCAuth.user'a yazılır (kabuk avatar
 * ve rol kontrolleri oradan okur). Herhangi bir /api çağrısı 401 dönerse
 * oturum düşmüş demektir → giriş ekranına dönülür. */
(function () {
  const { useState, useEffect } = React;
  const { CCIcons: Ic, CRShell, CRDashboard, CRUpload, CRAnalysis, CRReport, CRSettings, CRTemplates, CRAudit, CRLogin, CRBexflow } = window;

  window.CCAuth = window.CCAuth || { user: null };

  // 401 yakalayıcı: aynı kökene giden /api çağrıları (auth uçları hariç)
  if (!window.__ccFetchPatched) {
    window.__ccFetchPatched = true;
    const orig = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const res = await orig(input, init);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (res.status === 401 && /^(\/|https?:\/\/[^/]+\/)api\//.test(url) && !/\/api\/auth\//.test(url)) {
          window.dispatchEvent(new CustomEvent('cc-unauthorized'));
        }
      } catch (e) { /* yut */ }
      return res;
    };
  }

  function Placeholder({ theme, active, onNav, label }) {
    return (
      <CRShell theme={theme} active={active} onNav={onNav}>
        <div className="cr-hr">
          <div><div className="cr-h1">{label}</div><div className="cr-h1sub">Bu ekran henüz yok</div></div>
        </div>
        <div className="cr-pn" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '70px 24px', textAlign: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--sigS)', color: 'var(--sig)', display: 'grid', placeItems: 'center' }}><Ic.box size={26} /></div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{label}</div>
          <button className="cr-btn cr-btn2" onClick={() => onNav('dashboard')} style={{ marginTop: 6 }}><Ic.chevL size={14} /> Kontrol Paneli'ne dön</button>
        </div>
      </CRShell>
    );
  }

  function CRApp() {
    const [auth, setAuth] = useState(undefined);     // undefined=sorgulanıyor | null=oturum yok | {user, setupRequired}
    const [page, setPage] = useState(() => localStorage.getItem('cc-page') || 'dashboard');
    const [theme, setTheme] = useState(() => localStorage.getItem('cc-theme') || 'dark');
    useEffect(() => { localStorage.setItem('cc-theme', theme); document.body.setAttribute('data-app-theme', theme); }, [theme]);
    useEffect(() => { localStorage.setItem('cc-page', page); }, [page]);

    const setUser = (user) => { window.CCAuth.user = user || null; setAuth(user ? { user } : null); };

    const refresh = async () => {
      try {
        const j = await fetch('/api/auth/status').then(r => r.json());
        if (j.authenticated && j.user) setUser(j.user);
        else { window.CCAuth.user = null; setAuth(null); }
        window.CCAuth.setupRequired = !!j.setupRequired;
      } catch (e) { window.CCAuth.user = null; setAuth(null); }
    };
    useEffect(() => { refresh(); }, []);

    useEffect(() => {
      const onLogout = async () => {
        try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* çevrimdışı: yine de yerel oturumu kapat */ }
        localStorage.removeItem('cc-auth'); // eski sürümden kalan anahtar
        setPage('dashboard'); setUser(null);
      };
      const onUnauthorized = () => { if (window.CCAuth.user) { setUser(null); } };
      const onThemeSet = (e) => { if (e.detail === 'dark' || e.detail === 'light') setTheme(e.detail); };
      window.addEventListener('cc-logout', onLogout);
      window.addEventListener('cc-unauthorized', onUnauthorized);
      window.addEventListener('cc-theme-set', onThemeSet);
      return () => { window.removeEventListener('cc-logout', onLogout); window.removeEventListener('cc-unauthorized', onUnauthorized); window.removeEventListener('cc-theme-set', onThemeSet); };
    }, []);

    let body;
    if (auth === undefined) body = null; // önyükleme ekranı (cc-boot) hâlâ görünür değil; kısa boşluk kabul
    else if (!auth) body = <CRLogin theme={theme} onAuth={(user) => { setUser(user); setPage('dashboard'); }} />;
    else if (page === 'dashboard') body = <CRDashboard theme={theme} onNav={setPage} />;
    else if (page === 'upload') body = <CRUpload theme={theme} onNav={setPage} />;
    else if (page === 'bexflow') body = <CRBexflow theme={theme} onNav={setPage} />;
    else if (page === 'analysis') body = <CRAnalysis theme={theme} onNav={setPage} />;
    else if (page === 'report') body = <CRReport theme={theme} onNav={setPage} />;
    else if (page === 'templates') body = <CRTemplates theme={theme} onNav={setPage} />;
    else if (page === 'audit') body = <CRAudit theme={theme} onNav={setPage} />;
    else if (page === 'settings') body = <CRSettings theme={theme} onNav={setPage} />;
    else body = <Placeholder theme={theme} active={page} onNav={setPage} label="Ekran" />;

    return <>{body}</>;
  }

  window.CRApp = CRApp;
})();
