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
