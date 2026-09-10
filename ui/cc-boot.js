/* Kontrol Odası önyükleme (app.html'den ayrı dosya: içerik güvenlik politikası
   satır içi script'e izin vermez — script-src 'self').
   1) pdf.js worker yolunu yerel dosyaya bağlar,
   2) derlenmiş arayüz (web/ui) ve React yüklendiğinde uygulamayı monte eder,
   3) yüklenemezse sonsuz spinner yerine yönlendirici mesaj gösterir. */
(function () {
  if (window.pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'web/vendor/pdf.worker.min.js';
  }
  var tries = 0;
  var fail = function (html) {
    var lbl = document.querySelector('#ccBoot .lbl');
    if (lbl) lbl.innerHTML = html;
    var ring = document.querySelector('#ccBoot .ring');
    if (ring) ring.style.display = 'none';
  };
  var start = function () {
    if (window.CRApp && window.CRShell && window.React && window.ReactDOM) {
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.CRApp));
      var boot = document.getElementById('ccBoot');
      if (boot) { boot.classList.add('hide'); setTimeout(function () { boot.remove(); }, 400); }
      return;
    }
    if (++tries > 100) {
      if (!window.React || !window.ReactDOM || !window.XLSX) {
        fail('Kütüphaneler yüklenemedi (web/vendor eksik).<br>Proje dizininde <code>npm run build:ui</code> çalıştırıp sayfayı yenileyin.');
      } else {
        fail('Arayüz dosyaları bulunamadı (web/ui eksik).<br>Proje dizininde <code>npm run build:ui</code> çalıştırıp sayfayı yenileyin.');
      }
      return;
    }
    setTimeout(start, 30);
  };
  start();
})();
