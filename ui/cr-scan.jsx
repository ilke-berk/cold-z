/* Soğuk Zincir Tarama — analiz sırasında gösterilen canvas bekleme animasyonu */
(function () {
  const { useRef, useEffect } = React;

  const PALETTE = {
    dark:  { bg: '#0c121d', grid: 'rgba(70,182,218,.07)', sig: '#46b6da', ok: '#3cc081', bad: '#ea5d6b', amber: '#e2a43e', tx: '#dde6f1', t2: '#7d8da4', t3: '#4a586f', band: 'rgba(60,192,129,.10)', bandLn: 'rgba(60,192,129,.32)' },
    light: { bg: '#eef3f8', grid: 'rgba(15,129,168,.08)', sig: '#0f81a8', ok: '#1c9961', bad: '#cb3c48', amber: '#a9781a', tx: '#0d1726', t2: '#54607a', t3: '#9aa7bb', band: 'rgba(28,153,97,.12)', bandLn: 'rgba(28,153,97,.34)' },
  };

  const MSGS = ['Sütunlar eşleniyor', 'Zaman serisi okunuyor', 'Sapmalar taranıyor', 'MKT hesaplanıyor', 'Bütünlük doğrulanıyor'];
  const LO = -1, HI = 13;            // °C eksen aralığı
  const BAND = [2, 8];
  const TARGET_MKT = 5.21;

  // Sahte ama gerçekçi sıcaklık dalgası (0..1 normalize x → °C)
  function temp(x) {
    let v = 4.8 + Math.sin(x * 6.0) * 0.55 + Math.sin(x * 14.0 + 1) * 0.22;
    // ~%62'de kısa bir sapma tepesi
    const d = x - 0.62, bump = Math.exp(-(d * d) / 0.0016);
    v += bump * 3.7;
    return v;
  }

  function CRScanLoader({ theme = 'dark', height = 232 }) {
    const wrapRef = useRef(null);
    const cvRef = useRef(null);
    const raf = useRef(0);
    const start = useRef(0);

    useEffect(() => {
      const cv = cvRef.current, wrap = wrapRef.current;
      const ctx = cv.getContext('2d');
      let W = 0, Hh = 0, dpr = 1;
      const P = PALETTE[theme === 'light' ? 'light' : 'dark'];

      // buz kristalleri
      const flakes = Array.from({ length: 16 }, () => ({
        x: Math.random(), y: Math.random(), r: 4 + Math.random() * 9,
        rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.5,
        spd: 0.012 + Math.random() * 0.03, ph: Math.random() * Math.PI * 2,
      }));

      function resize() {
        const rect = wrap.getBoundingClientRect();
        W = rect.width; Hh = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = W * dpr; cv.height = Hh * dpr;
        cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      resize();
      const ro = new ResizeObserver(resize); ro.observe(wrap);

      const padL = 30, padR = 16, padT = 26, padB = 30;
      const yOf = (v, h) => padT + (1 - (v - LO) / (HI - LO)) * (h - padT - padB);

      function hexagon(cx, cy, r, rot) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = rot + i * Math.PI / 3;
          const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
      }

      function frame(ts) {
        if (!start.current) start.current = ts;
        const el = (ts - start.current) / 1000;
        const innerW = W - padL - padR;
        const period = 2.6;
        const phase = (el % period) / period;
        const ease = phase < 0.5 ? 2 * phase * phase : 1 - Math.pow(-2 * phase + 2, 2) / 2;
        const sweep = ease;                       // 0..1 tarama konumu
        const sweepX = padL + sweep * innerW;

        ctx.clearRect(0, 0, W, Hh);

        // arka plan
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, Hh);

        // ızgara (yatay kayan)
        ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
        const gs = 26, off = (el * 9) % gs;
        for (let gx = padL - off; gx < W - padR + gs; gx += gs) {
          ctx.beginPath(); ctx.moveTo(gx, padT - 8); ctx.lineTo(gx, Hh - padB + 8); ctx.stroke();
        }
        for (let v = 0; v <= 12; v += 2) {
          const gy = yOf(v, Hh);
          ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
        }

        // güvenli bant 2-8°C
        const yb1 = yOf(BAND[1], Hh), yb0 = yOf(BAND[0], Hh);
        ctx.fillStyle = P.band; ctx.fillRect(padL, yb1, innerW, yb0 - yb1);
        ctx.strokeStyle = P.bandLn; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, yb1); ctx.lineTo(W - padR, yb1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(padL, yb0); ctx.lineTo(W - padR, yb0); ctx.stroke();
        ctx.setLineDash([]);

        // y eksen etiketleri
        ctx.fillStyle = P.t3; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let v = 0; v <= 12; v += 4) ctx.fillText(v + '°', padL - 7, yOf(v, Hh));

        // buz kristalleri (bant ışıltısı)
        flakes.forEach(f => {
          f.y -= f.spd * 0.01; f.rot += f.spin * 0.01;
          if (f.y < -0.05) { f.y = 1.05; f.x = Math.random(); }
          const px = padL + f.x * innerW, py = padT + f.y * (Hh - padT - padB);
          const tw = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(el * 2 + f.ph));
          ctx.strokeStyle = P.sig; ctx.globalAlpha = tw; ctx.lineWidth = 1;
          hexagon(px, py, f.r, f.rot); ctx.stroke();
          ctx.beginPath(); ctx.arc(px, py, 1.1, 0, 7); ctx.fillStyle = P.sig; ctx.fill();
          ctx.globalAlpha = 1;
        });

        // açığa çıkan sıcaklık eğrisi (0..sweep)
        const N = 150;
        const xAt = i => padL + (i / N) * innerW;
        // dolgu
        ctx.beginPath();
        ctx.moveTo(padL, Hh - padB);
        for (let i = 0; i <= N; i++) {
          const xx = i / N; if (xx > sweep) break;
          ctx.lineTo(xAt(i), yOf(temp(xx), Hh));
        }
        ctx.lineTo(sweepX, Hh - padB); ctx.closePath();
        const grd = ctx.createLinearGradient(0, padT, 0, Hh - padB);
        grd.addColorStop(0, P.sig + '38'); grd.addColorStop(1, P.sig + '00');
        ctx.fillStyle = grd; ctx.fill();
        // çizgi
        ctx.beginPath();
        let started = false, lastX = padL, lastY = 0;
        for (let i = 0; i <= N; i++) {
          const xx = i / N; if (xx > sweep) break;
          const px = xAt(i), py = yOf(temp(xx), Hh);
          started ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          started = true; lastX = px; lastY = py;
        }
        const peakOver = temp(sweep) > BAND[1];
        ctx.strokeStyle = peakOver ? P.bad : P.sig; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
        ctx.shadowColor = peakOver ? P.bad : P.sig; ctx.shadowBlur = 9; ctx.stroke();
        ctx.shadowBlur = 0;

        // tarama çizgisi + parlama
        const gg = ctx.createLinearGradient(sweepX - 26, 0, sweepX + 8, 0);
        gg.addColorStop(0, P.sig + '00'); gg.addColorStop(1, P.sig + '2a');
        ctx.fillStyle = gg; ctx.fillRect(sweepX - 26, padT - 8, 34, Hh - padT - padB + 16);
        ctx.strokeStyle = P.sig; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(sweepX, padT - 8); ctx.lineTo(sweepX, Hh - padB + 8); ctx.stroke();
        ctx.globalAlpha = 1;
        // tarama başı (parlayan nokta)
        if (started) {
          ctx.beginPath(); ctx.arc(lastX, lastY, 9, 0, 7); ctx.fillStyle = (peakOver ? P.bad : P.sig) + '22'; ctx.fill();
          ctx.beginPath(); ctx.arc(lastX, lastY, 3.6, 0, 7); ctx.fillStyle = peakOver ? P.bad : P.sig;
          ctx.shadowColor = peakOver ? P.bad : P.sig; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
        }

        // HUD — canlı MKT sayacı
        const ramp = Math.min(el / 2.4, 1);
        const mkt = (TARGET_MKT * (0.5 + 0.5 * (1 - Math.pow(1 - ramp, 3)))) + (ramp >= 1 ? Math.sin(el * 3) * 0.015 : 0);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = P.t3; ctx.font = "600 9px 'Space Grotesk', sans-serif";
        ctx.fillText('CANLI MKT', padL + 4, padT + 4);
        ctx.fillStyle = P.sig; ctx.font = "700 30px 'JetBrains Mono', monospace";
        ctx.fillText(mkt.toFixed(2), padL + 4, padT + 32);
        ctx.fillStyle = P.t2; ctx.font = "600 11px 'JetBrains Mono', monospace";
        ctx.fillText('°C', padL + 4 + ctx.measureText(mkt.toFixed(2)).width + 6, padT + 32);

        // durum mesajı (sağ üst, döngüsel)
        const mi = Math.floor(el / 0.95) % MSGS.length;
        const dots = '.'.repeat(1 + (Math.floor(el * 2) % 3));
        ctx.textAlign = 'right';
        ctx.fillStyle = P.t2; ctx.font = "600 10px 'JetBrains Mono', monospace";
        ctx.fillText(MSGS[mi] + dots, W - padR, padT - 6);
        ctx.textAlign = 'left';

        raf.current = requestAnimationFrame(frame);
      }
      frame(performance.now());                 // anında ilk kare (RAF kısıtlansa bile görünür)
      raf.current = requestAnimationFrame(frame);
      return () => { cancelAnimationFrame(raf.current); ro.disconnect(); start.current = 0; };
    }, [theme]);

    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height, borderBottom: '1px solid var(--ln)' }}>
        <canvas ref={cvRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    );
  }

  window.CRScanLoader = CRScanLoader;
})();
