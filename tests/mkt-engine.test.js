const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers/load-browser-module');

const { Utils, MKTEngine } = loadBrowserModules(
    ['utils.js', 'mkt-engine.js'],
    ['Utils', 'MKTEngine']
);

describe('MKTEngine.calculate', () => {
    test('boş dizide error döner', () => {
        const r = MKTEngine.calculate([]);
        assert.equal(r.mkt, null);
        assert.match(r.error, /bulunamadı/);
    });

    test('sabit sıcaklıkta MKT = o sıcaklık', () => {
        const r = MKTEngine.calculate([5, 5, 5, 5, 5]);
        assert.equal(r.mkt, 5);
        assert.equal(r.min, 5);
        assert.equal(r.max, 5);
        assert.equal(r.mean, 5);
        assert.equal(r.stdDev, 0);
    });

    test('MKT ortalama sıcaklıktan ≥ olmalı (Arrhenius)', () => {
        // Arrhenius: değişen sıcaklıkta MKT > aritmetik ortalama
        const temps = [2, 4, 6, 8, 10, 4, 5, 6, 7, 8];
        const r = MKTEngine.calculate(temps);
        assert.ok(r.mkt >= r.mean, `mkt=${r.mkt} mean=${r.mean}`);
    });

    test('istatistikler doğru', () => {
        const r = MKTEngine.calculate([2, 4, 6, 8, 10]);
        assert.equal(r.min, 2);
        assert.equal(r.max, 10);
        assert.equal(r.mean, 6);
        assert.equal(r.median, 6);
        assert.equal(r.range, 8);
        assert.equal(r.sampleCount, 5);
    });

    test('median tek/çift sayıda elemanda doğru', () => {
        const odd = MKTEngine.calculate([1, 2, 3, 4, 5]);
        assert.equal(odd.median, 3);
        const even = MKTEngine.calculate([1, 2, 3, 4]);
        assert.equal(even.median, 2.5);
    });
});

describe('MKTEngine.analyzeCompliance', () => {
    const mkData = (temps, startTs = new Date('2026-01-01T00:00:00Z')) =>
        temps.map((t, i) => ({
            timestamp: new Date(startTs.getTime() + i * 15 * 60 * 1000), // 15dk aralık
            temperature: t,
        }));

    test('normal aralıkta tüm veri → pass', () => {
        const data = mkData([3, 4, 5, 6, 7, 5, 4, 3, 5, 6]);
        const r = MKTEngine.analyzeCompliance(data);
        assert.equal(r.status, 'pass');
        assert.equal(r.summary, 'Kabul Edilebilir');
        assert.equal(r.redReasons.length, 0);
    });

    test('< 0 °C → fail (donma)', () => {
        const data = mkData([3, 4, 5, -1, 3, 4]);
        const r = MKTEngine.analyzeCompliance(data);
        assert.equal(r.status, 'fail');
        assert.ok(r.redReasons.some(x => /DÜŞÜŞ|donma|0°C/i.test(x)));
    });

    test('> 15 °C → fail (kritik yükseliş)', () => {
        const data = mkData([3, 4, 5, 18, 4, 3]);
        const r = MKTEngine.analyzeCompliance(data);
        assert.equal(r.status, 'fail');
        assert.ok(r.redReasons.some(x => /YÜKSELİŞ|15°C/i.test(x)));
    });

    test('9-15 arası kısa sapma + 24h MKT 2-8 içinde → pass + şartlı', () => {
        // 96 nokta × 15dk = 24 saat. Çoğu 5°C, sadece kısa bir 9°C sapması.
        const temps = [];
        for (let i = 0; i < 96; i++) temps.push(5);
        temps[80] = 9; // tek bir sapma
        temps[81] = 9;
        const data = mkData(temps);
        const r = MKTEngine.analyzeCompliance(data);
        assert.equal(r.status, 'pass');
        assert.ok(r.conditionalReasons.length > 0, 'şartlı uyarı beklenir');
    });

    test('sürekli yüksek sıcaklık → 24h MKT limit dışı → fail', () => {
        // 24 saat boyunca 12°C → MKT > 8 olur → red
        const temps = new Array(96).fill(12);
        const data = mkData(temps);
        const r = MKTEngine.analyzeCompliance(data);
        assert.equal(r.status, 'fail');
        assert.ok(r.redReasons.some(x => /24h MKT|limit dışı|toparlanamadı/i.test(x)));
    });
});

describe('MKTEngine.retrospectiveMKTCheck — yetersiz veri', () => {
    const mkData = (temps, startTs = new Date('2026-01-01T00:00:00Z')) =>
        temps.map((t, i) => ({
            timestamp: new Date(startTs.getTime() + i * 15 * 60 * 1000),
            temperature: t,
        }));

    test('kısa kayıt: 24h penceresi dolmadan sapma → insufficient, hasProblem=false', () => {
        const r = MKTEngine.retrospectiveMKTCheck(mkData([12, 12, 12, 5, 5]));
        assert.equal(r.triggered, true);
        assert.equal(r.hasProblem, false);
        assert.equal(r.problemCount, 0);
        assert.equal(r.insufficientCount, 1);
        assert.equal(r.windows[0].status, 'insufficient');
        assert.equal(r.windows[0].isOk, null);
    });

    test('yeterli kapsam: 24h boyunca 12°C → bad', () => {
        const r = MKTEngine.retrospectiveMKTCheck(mkData(new Array(96).fill(12)));
        assert.equal(r.windows[0].status, 'bad');
        assert.equal(r.insufficientCount, 0);
    });
});

describe('MKTEngine.retrospectiveMKTCheck', () => {
    const mkData = (temps, startTs = new Date('2026-01-01T00:00:00Z')) =>
        temps.map((t, i) => ({
            timestamp: new Date(startTs.getTime() + i * 15 * 60 * 1000), // 15dk aralık
            temperature: t,
        }));

    test('hep 2-8 içinde → tetiklenmez, sorun yok', () => {
        const r = MKTEngine.retrospectiveMKTCheck(mkData([3, 4, 5, 6, 7, 5, 4]));
        assert.equal(r.triggered, false);
        assert.equal(r.hasProblem, false);
        assert.equal(r.windows.length, 0);
    });

    test('kısa düşük sapma + 24h MKT içeride → tetiklenir, sorun yok', () => {
        const temps = new Array(96).fill(5);
        temps[80] = 1.2; // tek düşük sapma (0-2 bandı, tolerans dışı → anlık değil)
        const r = MKTEngine.retrospectiveMKTCheck(mkData(temps));
        assert.equal(r.triggered, true);
        assert.equal(r.hasProblem, false);
        assert.equal(r.windows[0].type, 'low');
        assert.equal(r.windows[0].status, 'ok');
    });

    test('anlık sapma (tek 1.5°C okuması, tolerans içinde) → pencere açmaz, transientCount=1', () => {
        const temps = new Array(96).fill(5);
        temps[80] = 1.5;
        const r = MKTEngine.retrospectiveMKTCheck(mkData(temps));
        assert.equal(r.triggered, false);
        assert.equal(r.windows.length, 0);
        assert.equal(r.transientCount, 1);
    });

    test('DONMA: MKT aralık içinde olsa bile status=freeze, hasProblem=true', () => {
        const temps = new Array(96).fill(5);
        temps[80] = -1.5; // tek donma okuması; 24h MKT hâlâ ~5°C
        const r = MKTEngine.retrospectiveMKTCheck(mkData(temps));
        assert.equal(r.windows.length, 1);
        assert.equal(r.windows[0].status, 'freeze');
        assert.equal(r.windows[0].isOk, false);
        assert.ok(r.windows[0].mkt24h >= 2 && r.windows[0].mkt24h <= 8, 'MKT aralık içinde ama telafi sayılmaz');
        assert.equal(r.hasProblem, true);
        assert.equal(r.freezeCount, 1);
        assert.equal(r.problemCount, 1);
    });

    test('dondurulmuş ürün aralığında (−25…−15) donma kuralı uygulanmaz', () => {
        const temps = new Array(96).fill(-20);
        temps[80] = -14; // hafif yüksek sapma
        const r = MKTEngine.retrospectiveMKTCheck(mkData(temps), -25, -15);
        assert.equal(r.freezeCount, 0);
        assert.equal(r.windows[0].type, 'high');
    });

    test('sürekli yüksek → 24h MKT limit dışı → hatalı aralık', () => {
        const r = MKTEngine.retrospectiveMKTCheck(mkData(new Array(96).fill(12)));
        assert.equal(r.triggered, true);
        assert.equal(r.hasProblem, true);
        assert.ok(r.problemCount >= 1);
        const w = r.windows.find(x => !x.isOk);
        assert.ok(w.mkt24h > 8, `mkt24h=${w.mkt24h}`);
        assert.ok(w.windowStart && w.windowEnd, 'hatalı aralık zaman damgaları var');
    });

    test('İSTİSNASIZ: kritik sapma (>15) için de geriye MKT hesaplanır', () => {
        // analyzeCompliance bu durumda "MKT Aranmaz" der; retrospective hesaplar.
        const temps = new Array(96).fill(5);
        temps[80] = 18; // kritik yüksek sapma
        const r = MKTEngine.retrospectiveMKTCheck(mkData(temps));
        assert.equal(r.triggered, true);
        assert.equal(r.windows.length, 1);
        assert.equal(r.windows[0].type, 'high');
        assert.equal(r.windows[0].peakTemp, 18);
        assert.ok(r.windows[0].mkt24h != null, 'kritik sapmada da MKT hesaplanmalı');
    });

    test('İSTİSNASIZ: kritik düşük sapma (<0) için de geriye MKT hesaplanır', () => {
        const temps = new Array(96).fill(5);
        temps[80] = -2; // kritik donma sapması
        const r = MKTEngine.retrospectiveMKTCheck(mkData(temps));
        assert.equal(r.triggered, true);
        assert.equal(r.windows[0].type, 'low');
        assert.ok(r.windows[0].mkt24h != null);
    });

    test('boş veri → güvenli boş sonuç', () => {
        const r = MKTEngine.retrospectiveMKTCheck([]);
        assert.equal(r.triggered, false);
        assert.equal(r.hasProblem, false);
        assert.equal(r.windows.length, 0);
    });
});

describe('MKTEngine.calculateWeighted — zaman ağırlıklı MKT', () => {
    const T0 = new Date('2026-01-01T00:00:00Z').getTime();
    const at = (min, t) => ({ timestamp: new Date(T0 + min * 60000), temperature: t });

    test('eşit aralıklı seride ağırlıklı ≈ ağırlıksız', () => {
        const data = [];
        for (let i = 0; i < 96; i++) data.push(at(i * 15, i % 2 ? 4 : 10));
        const w = MKTEngine.calculateWeighted(data);
        const u = MKTEngine.calculate(data.map(d => d.temperature));
        assert.equal(w.method, 'time-weighted');
        assert.ok(Math.abs(w.mkt - u.mkt) < 0.05, `w=${w.mkt} u=${u.mkt}`);
    });

    test('düzensiz örnekleme: sık örneklenen soğuk dönem ağırlıksız MKT\'yi aşağı çeker, ağırlıklı çekmez', () => {
        // 12 saat 4°C @5dk (144 nokta) + 12 saat 10°C @60dk (12 nokta)
        const data = [];
        for (let i = 0; i < 144; i++) data.push(at(i * 5, 4));
        for (let i = 0; i < 12; i++) data.push(at(720 + i * 60, 10));
        const w = MKTEngine.calculateWeighted(data);
        const u = MKTEngine.calculate(data.map(d => d.temperature));
        // gerçek zaman payı yarı yarıya: referans = eşit-ağırlıklı [4,10]
        const ref = MKTEngine.calculate([4, 10]).mkt;
        assert.ok(u.mkt < ref - 1, `ağırlıksız (${u.mkt}) yanlı olmalı, ref=${ref}`);
        assert.ok(Math.abs(w.mkt - ref) < 0.15, `ağırlıklı (${w.mkt}) ≈ ref (${ref})`);
        assert.equal(w.mktUnweighted, u.mkt);
    });

    test('veri boşluğu (gapCap üstü) integrasyona girmez, excludedGapMinutes raporlanır', () => {
        const data = [at(0, 5), at(15, 5), at(30, 5), at(30 + 600, 5), at(30 + 615, 5)]; // 10 saatlik boşluk
        const w = MKTEngine.calculateWeighted(data);
        assert.equal(w.excludedGapMinutes, 600);
        assert.equal(w.excludedGaps, 1);
        assert.equal(w.weightedMinutes, 45);
        assert.equal(w.mkt, 5);
    });

    test('tek örnek → ağırlıksız yedek, hata yok', () => {
        const w = MKTEngine.calculateWeighted([at(0, 6)]);
        assert.equal(w.mkt, 6);
        assert.equal(w.method, 'unweighted');
    });

    test('boş seri → error', () => {
        assert.equal(MKTEngine.calculateWeighted([]).mkt, null);
    });

    test('aktivasyon enerjisi override çalışır', () => {
        const data = [at(0, 2), at(15, 12), at(30, 2), at(45, 12)];
        const a = MKTEngine.calculateWeighted(data, { activationEnergy: 83144 });
        const b = MKTEngine.calculateWeighted(data, { activationEnergy: 120000 });
        assert.ok(b.mkt > a.mkt, 'daha yüksek ΔH → daha yüksek MKT');
        assert.equal(b.activationEnergy, 120000);
    });

    test('büyük seri (200k) çağrı yığınını taşırmaz', () => {
        const temps = new Array(200000).fill(5);
        const r = MKTEngine.calculate(temps);
        assert.equal(r.mkt, 5);
        assert.equal(r.min, 5);
    });
});

describe('MKTEngine.findExcursionSegments — histerezis / anlık sapma sınıflandırması', () => {
    const mkData = (temps, stepMin = 15) => temps.map((t, i) => ({ timestamp: new Date(Date.UTC(2026, 0, 1) + i * stepMin * 60000), temperature: t }));

    test('flapping (8.1 / 7.9 / 8.1 / 7.9) histerezisle TEK sapma', () => {
        const segs = MKTEngine.findExcursionSegments(mkData([5, 8.1, 7.9, 8.1, 7.9, 8.1, 5]));
        assert.equal(segs.length, 1);
        assert.equal(segs[0].start, 1);
        assert.equal(segs[0].end, 5);
    });

    test('limitin içine tam dönüş sapmayı kapatır → iki ayrı sapma', () => {
        const segs = MKTEngine.findExcursionSegments(mkData([5, 9, 5, 5, 9, 5]));
        assert.equal(segs.length, 2);
    });

    test('tek 8.3°C okuması → transient; tek 9.0°C okuması → normal', () => {
        const a = MKTEngine.findExcursionSegments(mkData([5, 8.3, 5]));
        assert.equal(a[0].transient, true);
        assert.equal(a[0].classification, 'transient');
        assert.equal(a[0].durationMinutes, 15);
        const b = MKTEngine.findExcursionSegments(mkData([5, 9.0, 5]));
        assert.equal(b[0].transient, false);
        assert.equal(b[0].classification, 'normal');
    });

    test('kısa ama kritik / donma okuması ASLA transient sayılmaz', () => {
        const hot = MKTEngine.findExcursionSegments(mkData([5, 16, 5]));
        assert.equal(hot[0].classification, 'critical');
        const frz = MKTEngine.findExcursionSegments(mkData([5, -0.2, 5]));
        assert.equal(frz[0].classification, 'freeze');
        assert.equal(frz[0].freeze, true);
    });

    test('süre orta nokta yaklaşımı: 3 dışarı okuma @15dk → 45 dk', () => {
        const segs = MKTEngine.findExcursionSegments(mkData([5, 9, 9, 9, 5]));
        assert.equal(segs[0].durationMinutes, 45);
        assert.equal(segs[0].sampleCount, 3);
    });

    test('analyzeExcursions: anlık sapmalar sayıma girmez ama listede işaretli', () => {
        const r = MKTEngine.analyzeExcursions(mkData([5, 8.3, 5, 5, 10, 10, 5]));
        assert.equal(r.excursions.length, 2);
        assert.equal(r.excursionCount, 1);
        assert.equal(r.transientCount, 1);
        assert.equal(r.excursions[0].transient, true);
        assert.equal(r.highExcursions, 1);
    });
});

describe('MKTEngine.calculateTORDetailed', () => {
    const T0 = Date.UTC(2026, 0, 1);
    const at = (min, t) => ({ timestamp: new Date(T0 + min * 60000), temperature: t });

    test('geçiş aralıkları yarım, tam dışarı aralıklar tam sayılır', () => {
        const r = MKTEngine.calculateTORDetailed([at(0, 5), at(15, 10), at(30, 10), at(45, 5)]);
        assert.equal(r.torMinutes, 30); // 7.5 + 15 + 7.5
        assert.equal(r.coldMinutes, 0);
        assert.equal(r.unknownGapMinutes, 0);
    });

    test('logger kesintisi TOR\'a sayılmaz, unknownGapMinutes olarak raporlanır (eski hesap 360 dk sayıyordu)', () => {
        const r = MKTEngine.calculateTORDetailed([at(0, 5), at(15, 10), at(15 + 360, 5), at(15 + 375, 5)]);
        assert.equal(r.torMinutes, 7.5);
        assert.equal(r.unknownGapMinutes, 360);
        assert.equal(r.unknownGaps, 1);
        assert.equal(MKTEngine.calculateTOR([at(0, 5), at(15, 10), at(15 + 360, 5)]), 7.5);
    });

    test('alt limit altı süre TOR değil coldMinutes; donma freezeMinutes', () => {
        const r = MKTEngine.calculateTORDetailed([at(0, 5), at(15, 1), at(30, 1), at(45, -1), at(60, 5)]);
        assert.equal(r.torMinutes, 0);
        assert.equal(r.coldMinutes, 45);   // 7.5 + 15 + 15 + 7.5 (donma süresi de alt limit altıdır)
        assert.equal(r.freezeMinutes, 15); // 1→-1 yarım + -1→5 yarım
    });
});

describe('MKTEngine — 24h pencere kapsaması gerçek veriye göre', () => {
    const T0 = Date.UTC(2026, 0, 1);
    const at = (min, t) => ({ timestamp: new Date(T0 + min * 60000), temperature: t });

    test('24 saat arayla iki 12°C örneği "tam kapsama" DEĞİL → insufficient', () => {
        const r = MKTEngine.retrospectiveMKTCheck([at(0, 12), at(1440, 12)]);
        assert.equal(r.windows[0].status, 'insufficient');
        assert.match(r.windows[0].insufficientWhy, /örnek/);
    });

    test('pencere içinde 6 saatlik boşluk → kapsama boşluk düşülerek hesaplanır → insufficient', () => {
        const data = [];
        for (let m = 0; m <= 1440; m += 15) {
            if (m > 600 && m < 960) continue; // 6 saatlik kesinti
            data.push(at(m, m >= 1380 ? 12 : 5));
        }
        const r = MKTEngine.retrospectiveMKTCheck(data);
        assert.equal(r.windows[0].status, 'insufficient');
        assert.ok(r.windows[0].coverageHours < 20, `coverage=${r.windows[0].coverageHours}`);
        assert.ok(r.windows[0].gapMinutes >= 360);
    });

    test('kesintisiz 24 saat + sapma → değerlendirilir', () => {
        const data = [];
        for (let m = 0; m <= 1500; m += 15) data.push(at(m, m >= 1440 ? 12 : 5));
        const r = MKTEngine.retrospectiveMKTCheck(data);
        assert.equal(r.windows[0].status, 'ok');
        assert.ok(r.windows[0].coverageHours >= 20);
    });
});

describe('MKTEngine.analyzeCompliance — aralığa göre parametrik', () => {
    const mkData = temps => temps.map((t, i) => ({ timestamp: new Date(Date.UTC(2026, 0, 1) + i * 15 * 60000), temperature: t }));

    test('dondurulmuş ürün (−25…−15): −20°C seri pass (eski kod 0°C altını RED sayıyordu)', () => {
        const r = MKTEngine.analyzeCompliance(mkData(new Array(20).fill(-20)), { lowerLimit: -25, upperLimit: -15 });
        assert.equal(r.status, 'pass');
        assert.equal(r.limits.criticalLow, -27);
        assert.equal(r.limits.criticalHigh, -8);
        assert.equal(r.limits.freezeLimit, null);
    });

    test('dondurulmuş ürün: −7°C → kritik yükseliş RED', () => {
        const temps = new Array(20).fill(-20); temps[10] = -7;
        const r = MKTEngine.analyzeCompliance(mkData(temps), { lowerLimit: -25, upperLimit: -15 });
        assert.equal(r.status, 'fail');
        assert.match(r.redReasons[0], /-8°C üstüne/);
    });

    test('anlık 8.3°C sapması: check açılmaz, transientReasons\'a düşer', () => {
        const temps = new Array(96).fill(5); temps[80] = 8.3;
        const r = MKTEngine.analyzeCompliance(mkData(temps));
        assert.equal(r.status, 'pass');
        assert.equal(r.checks.length, 0);
        assert.equal(r.transientCount, 1);
        assert.match(r.transientReasons[0], /Anlık sapma/);
    });

    test('donma gerekçesi "MKT ile telafi edilemez" der', () => {
        const r = MKTEngine.analyzeCompliance(mkData([5, 5, -1, 5, 5]));
        assert.match(r.redReasons[0], /telafi edilemez/);
    });
});

describe('MKTEngine.fullAnalysis — girdi dayanıklılığı', () => {
    const T0 = Date.UTC(2026, 0, 1);
    const at = (min, t) => ({ timestamp: new Date(T0 + min * 60000), temperature: t });

    test('sırasız girdi sıralanır; girdi dizisi değişmez', () => {
        const input = [at(30, 5), at(0, 5), at(15, 5)];
        const copy = input.slice();
        const a = MKTEngine.fullAnalysis(input);
        assert.equal(a.preprocessing.wasUnsorted, true);
        assert.equal(a.timespan.durationMinutes, 30);
        assert.deepEqual(input, copy);
        assert.ok(a.validation.gaps.every(g => g.minutes > 0));
    });

    test('mükerrer zaman damgası ve geçersiz satırlar ayıklanır', () => {
        const a = MKTEngine.fullAnalysis([at(0, 5), at(0, 5.1), at(15, 'x'), { timestamp: 'çöp', temperature: 5 }, at(15, 5)]);
        assert.equal(a.preprocessing.duplicateTimestamps, 1);
        assert.equal(a.preprocessing.droppedInvalid, 2);
        assert.equal(a.dataPoints, 2);
    });

    test('tek örnek / boş seri hata fırlatmaz', () => {
        const one = MKTEngine.fullAnalysis([at(0, 5)]);
        assert.equal(one.mkt.mkt, 5);
        assert.equal(one.tor.torMinutes, 0);
        const none = MKTEngine.fullAnalysis([]);
        assert.equal(none.mkt.mkt, null);
        assert.equal(none.dataPoints, 0);
    });

    test('config: kritik eşikler ve gapCap çıktıya yazılır; MKT zaman ağırlıklı', () => {
        const data = [];
        for (let m = 0; m < 1440; m += 10) data.push(at(m, 5));
        const a = MKTEngine.fullAnalysis(data, { lowerLimit: 2, upperLimit: 8, torLimit: 120 });
        assert.equal(a.config.criticalLow, 0);
        assert.equal(a.config.criticalHigh, 15);
        assert.equal(a.config.freezeLimit, 0);
        assert.equal(a.config.gapCapMinutes, 120);
        assert.equal(a.mkt.method, 'time-weighted');
        assert.equal(a.tor.method, 'interval-midpoint');
    });
});

describe('MKTEngine.evaluateStabilityBudget', () => {
    test('düşük TOR → safe', () => {
        const r = MKTEngine.evaluateStabilityBudget(30, 120);
        assert.equal(r.status, 'safe');
        assert.equal(r.remaining, 90);
        assert.equal(r.usedPercentage, 25);
    });

    test('orta TOR → caution', () => {
        const r = MKTEngine.evaluateStabilityBudget(75, 120);
        assert.equal(r.status, 'caution');
    });

    test('yüksek TOR → warning', () => {
        const r = MKTEngine.evaluateStabilityBudget(100, 120);
        assert.equal(r.status, 'warning');
    });

    test('limit aşımı → exceeded + remaining=0', () => {
        const r = MKTEngine.evaluateStabilityBudget(150, 120);
        assert.equal(r.status, 'exceeded');
        assert.equal(r.remaining, 0);
    });
});

describe('MKTEngine.analyzeExcursions', () => {
    const mkData = (temps, startTs = new Date('2026-01-01T00:00:00Z')) =>
        temps.map((t, i) => ({
            timestamp: new Date(startTs.getTime() + i * 60_000), // 1dk aralık
            temperature: t,
        }));

    test('hiç sapma yok', () => {
        const r = MKTEngine.analyzeExcursions(mkData([3, 4, 5, 6, 7, 8]));
        assert.equal(r.excursionCount, 0);
        assert.equal(r.totalExcursionMinutes, 0);
    });

    test('tek yüksek sapma', () => {
        const r = MKTEngine.analyzeExcursions(mkData([5, 5, 10, 12, 11, 5, 5]));
        assert.equal(r.excursionCount, 1);
        assert.equal(r.highExcursions, 1);
        assert.equal(r.lowExcursions, 0);
        assert.equal(r.excursions[0].peakTemp, 12);
    });

    test('alt sapma', () => {
        const r = MKTEngine.analyzeExcursions(mkData([5, 5, 1, 0, 1, 5]));
        assert.equal(r.lowExcursions, 1);
        assert.equal(r.excursions[0].peakTemp, 0);
    });

    test('sonu kapanmamış sapma → son nokta ile kapatılır', () => {
        const r = MKTEngine.analyzeExcursions(mkData([5, 5, 10, 11, 12]));
        assert.equal(r.excursionCount, 1);
        assert.ok(r.excursions[0].end);
    });
});

describe('MKTEngine.analyzeCompliance — gerekçelerde zaman aralığı', () => {
    const mkData = (temps, startTs = new Date('2026-01-01T00:00:00Z')) =>
        temps.map((t, i) => ({
            timestamp: new Date(startTs.getTime() + i * 15 * 60 * 1000),
            temperature: t,
        }));
    const TS = /\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/;

    test('kritik düşüş gerekçesi en düşük noktanın zamanını ve aralığı taşır', () => {
        const r = MKTEngine.analyzeCompliance(mkData([3, 4, -1, -0.5, 3, 4]));
        const reason = r.redReasons.find(x => /KRİTİK DÜŞÜŞ/.test(x));
        assert.ok(reason, 'kritik düşüş gerekçesi olmalı');
        assert.match(reason, TS);
        assert.match(reason, /→/);
        assert.equal(r.criticalSegments.length, 1);
        assert.equal(r.criticalSegments[0].type, 'low');
        assert.equal(r.criticalSegments[0].durationMinutes, 15);
    });

    test('birden fazla kritik aralık → adet + ilk/son aralık yazılır', () => {
        const r = MKTEngine.analyzeCompliance(mkData([3, -1, 3, 4, 5, -2, 3]));
        const reason = r.redReasons.find(x => /KRİTİK DÜŞÜŞ/.test(x));
        assert.match(reason, /2 ayrı aralık/);
        assert.equal(r.criticalSegments.length, 2);
    });

    test('24h MKT ihlal gerekçesi sapma aralığını ve pencereyi taşır', () => {
        const r = MKTEngine.analyzeCompliance(mkData(new Array(96).fill(12)));
        const reason = r.redReasons.find(x => /24h MKT/.test(x));
        assert.match(reason, TS);
        assert.match(reason, /pencere:/);
        assert.match(reason, /en yüksek 12°C/);
        assert.ok(r.checks[0].windowStart && r.checks[0].windowEnd);
    });

    test('pencere 24 saati kapsamıyorsa → yetersiz veri, ihlal sayılmaz', () => {
        // Kayıt başında 1.5°C: geriye 24 saat veri yok → red olmamalı
        const r = MKTEngine.analyzeCompliance(mkData([1.5, 1.4, 5, 5, 5, 5]));
        assert.equal(r.status, 'pass');
        assert.equal(r.redReasons.length, 0);
        assert.equal(r.checks[0].insufficientData, true);
        assert.equal(r.checks[0].isMktOk, null);
        assert.equal(r.insufficientReasons.length, 1);
        assert.match(r.insufficientReasons[0], /yetersiz veri/);
    });

    test('şartlı (telafi) gerekçesi de zaman aralığı taşır', () => {
        const temps = new Array(96).fill(5); temps[80] = 9; temps[81] = 9;
        const r = MKTEngine.analyzeCompliance(mkData(temps));
        assert.match(r.conditionalReasons[0], TS);
        assert.match(r.conditionalReasons[0], /en yüksek 9°C/);
    });
});
