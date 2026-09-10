/* Kontrol Odası — yerel analiz ayarları (localStorage 'cc-settings')
 *
 * Sunucu tarafı ayarlar (.env: API anahtarı, model, fiyat/kur) /api/settings'te;
 * burası tek makineye özgü ANALİZ varsayılanlarıdır: saklama aralığı, limitler,
 * TOR bütçesi, kabul edilen azami kayıt aralığı, MKT aktivasyon enerjisi.
 * Veri Yükleme sayfası açılışta bunları alır; motor konfigürasyonuna iner.
 */
const CCSettings = (function () {
  const KEY = 'cc-settings';
  const DEFAULTS = Object.freeze({
    range: 'cold',        // cold | frozen | room | deep | custom
    lo: 2,                // °C alt limit
    hi: 8,                // °C üst limit
    tor: 120,             // dk — TOR (buzdolabı dışı) bütçesi
    maxInterval: 60,      // dk — bundan seyrek kayıt "REVİZE" (eczaneden düzgün rapor)
    dH: 83.144,           // kJ/mol — MKT aktivasyon enerjisi (ICH Q1A / WHO)
  });
  const RANGES = Object.freeze({
    cold:   { label: 'Soğuk Zincir Standart · 2–8°C', min: 2, max: 8 },
    frozen: { label: 'Dondurulmuş · −25…−15°C', min: -25, max: -15 },
    room:   { label: 'Kontrollü Oda · 15–25°C', min: 15, max: 25 },
    deep:   { label: 'Derin Dondurucu · ≤ −60°C', min: -80, max: -60 },
    custom: { label: 'Özel Aralık', min: 2, max: 8 },
  });

  const hasStorage = () => { try { return typeof localStorage !== 'undefined'; } catch (e) { return false; } };
  const num = (v, d) => (v === '' || v == null || !isFinite(Number(v))) ? d : Number(v);
  function sanitize(s) {
    const o = { ...DEFAULTS, ...(s || {}) };
    o.range = RANGES[o.range] ? o.range : DEFAULTS.range;
    o.lo = num(o.lo, DEFAULTS.lo); o.hi = num(o.hi, DEFAULTS.hi);
    if (o.hi <= o.lo) { o.lo = DEFAULTS.lo; o.hi = DEFAULTS.hi; o.range = 'cold'; }
    o.tor = Math.max(0, num(o.tor, DEFAULTS.tor));
    o.maxInterval = Math.max(1, num(o.maxInterval, DEFAULTS.maxInterval));
    o.dH = num(o.dH, DEFAULTS.dH); if (o.dH < 10 || o.dH > 500) o.dH = DEFAULTS.dH;
    return o;
  }
  function get() {
    if (!hasStorage()) return { ...DEFAULTS };
    try { return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return { ...DEFAULTS }; }
  }
  function save(s) {
    const o = sanitize(s);
    if (hasStorage()) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* kota / gizli mod */ } }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cc-settings-changed', { detail: o }));
    }
    return o;
  }
  function reset() { if (hasStorage()) { try { localStorage.removeItem(KEY); } catch (e) {} } return save(DEFAULTS); }
  // Motor konfigürasyonu: cr-upload / cc-pipeline bunu MKTEngine.fullAnalysis'e verir
  function engineConfig(s) {
    const o = sanitize(s || get());
    return { lowerLimit: o.lo, upperLimit: o.hi, torLimit: o.tor, maxIntervalMinutes: o.maxInterval, activationEnergy: Math.round(o.dH * 1000) };
  }

  return { DEFAULTS, RANGES, get, save, reset, sanitize, engineConfig };
})();

if (typeof window !== 'undefined') window.CCSettings = CCSettings;
