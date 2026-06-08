/* ColdChain AI — Gerçek analiz sonucu deposu (UI ile pipeline arasında köprü)
   Upload bittiğinde scenario buraya yazılır; Analiz/Rapor ekranları buradan okur.
   localStorage'a yazılır ki sayfa yenilense de sonuç kaybolmasın. */
window.CCStore = (function () {
  const KEY = 'cc-real-result';
  let result = null; // { scenario, record(meta), savedId }
  try { const raw = localStorage.getItem(KEY); if (raw) result = JSON.parse(raw); } catch (e) {}
  const subs = new Set();
  function emit() { subs.forEach(fn => { try { fn(result); } catch (e) {} }); }
  return {
    get() { return result; },
    getScenario() { return result && result.scenario; },
    set(r) {
      result = r;
      try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { /* kota aşılırsa sessiz geç */ }
      emit();
    },
    patch(p) { result = Object.assign({}, result, p); try { localStorage.setItem(KEY, JSON.stringify(result)); } catch (e) {} emit(); },
    clear() { result = null; try { localStorage.removeItem(KEY); } catch (e) {} emit(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
})();
