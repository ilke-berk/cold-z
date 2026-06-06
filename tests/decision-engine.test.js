const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers/load-browser-module');

const { DecisionEngine } = loadBrowserModules(
    ['utils.js', 'decision-engine.js'],
    ['Utils', 'DecisionEngine']
);

// Geçerli minimal analysisResult fabrikası — testlerde override edilir
function baseAnalysis(overrides = {}) {
    return {
        compliance: { status: 'pass', redReasons: [], conditionalReasons: [], checks: [] },
        mkt: { stdDev: 0.8, mkt: 5.5 },
        dataPoints: 96,
        metadata: {},
        validation: { gaps: [], hasCriticalGap: false, isFrequencyIssue: false, mostCommonGapMin: 15, avgGapMin: 15 },
        timespan: { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-02T00:00:00Z') },
        userRange: null,
        ...overrides
    };
}

describe('DecisionEngine.evaluate — temel kararlar', () => {
    test('temiz veri → accept', () => {
        const r = DecisionEngine.evaluate(baseAnalysis());
        assert.equal(r.decision, 'accept');
        assert.equal(r.confidence, 100);
    });

    test('compliance.status fail → reject', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            compliance: {
                status: 'fail',
                redReasons: ['KRİTİK DÜŞÜŞ: 0°C altı'],
                conditionalReasons: [],
                checks: []
            }
        }));
        assert.equal(r.decision, 'reject');
        assert.ok(r.reasons.some(x => /KRİTİK DÜŞÜŞ/.test(x)));
    });

    test('summary kararla uyumlu', () => {
        const r = DecisionEngine.evaluate(baseAnalysis());
        assert.match(r.summary, /Kabul edilebilir/i);
    });
});

describe('DecisionEngine — Anti-Fraud (sentetik veri tespiti)', () => {
    test('düşük stdDev + yüksek dataPoints → revize', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            mkt: { stdDev: 0.1, mkt: 5.5 },
            dataPoints: 200
        }));
        assert.equal(r.decision, 'revize');
        assert.ok(r.reasons.some(x => /ANTI-FRAUD|sentetik/i.test(x)));
    });

    test('düşük dataPoints sayısında tetiklenmez', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            mkt: { stdDev: 0.1, mkt: 5.5 },
            dataPoints: 50
        }));
        assert.equal(r.decision, 'accept');
    });

    test('reject varsa anti-fraud bulgusu reject\'i değiştirmez', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            compliance: { status: 'fail', redReasons: ['x'], conditionalReasons: [], checks: [] },
            mkt: { stdDev: 0.1, mkt: 5.5 },
            dataPoints: 200
        }));
        assert.equal(r.decision, 'reject');
    });
});

describe('DecisionEngine — Mükerrer cihaz (COPY/MANUAL)', () => {
    test('COPY içeren seri → reject', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            metadata: { deviceSerial: 'X-COPY-001' }
        }));
        assert.equal(r.decision, 'reject');
        assert.ok(r.reasons.some(x => /Mükerrer|ANTI-FRAUD/i.test(x)));
    });

    test('MANUAL içeren seri → reject', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            metadata: { deviceSerial: 'DEV-MANUAL-9' }
        }));
        assert.equal(r.decision, 'reject');
    });

    test('normal seri numarası → accept', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            metadata: { deviceSerial: 'SN12345' }
        }));
        assert.equal(r.decision, 'accept');
    });
});

describe('DecisionEngine — PDF tarih (D:...) parse + NaN guard', () => {
    test('PDF D:YYYYMMDDhhmmss formatı doğru parse edilir + zaman yolculuğu yakalanır', () => {
        // Doküman 2024-01-01 yaratılmış ama içindeki veriler 2024-06-01'e kadar gidiyor → şüpheli
        const r = DecisionEngine.evaluate(baseAnalysis({
            metadata: { docCreationDate: "D:20240101120000+03'00'" },
            timespan: {
                start: new Date('2024-05-01T00:00:00Z'),
                end: new Date('2024-06-01T00:00:00Z'),
            }
        }));
        assert.equal(r.decision, 'revize');
        assert.ok(r.reasons.some(x => /tarih manipülasyon|zaman yolculuğu/i.test(x)));
    });

    test('PDF tarih veriden sonra ise alarm yok', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            metadata: { docCreationDate: 'D:20260201120000' },
            timespan: {
                start: new Date('2026-01-01T00:00:00Z'),
                end: new Date('2026-01-31T00:00:00Z'),
            }
        }));
        assert.equal(r.decision, 'accept');
    });

    test('geçersiz docCreationDate → NaN karşılaştırma uyarısı tetiklenmez (null guard)', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            metadata: { docCreationDate: 'çöp-tarih-string' }
        }));
        assert.equal(r.decision, 'accept');
        assert.ok(!r.reasons.some(x => /zaman yolculuğu|manipülasyon/i.test(x)));
    });

    test('docCreator Excel ise bilgi notu eklenir', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            metadata: { docCreator: 'Microsoft Excel 2019' }
        }));
        assert.ok(r.reasons.some(x => /Excel|orijinalliğini/i.test(x)));
    });
});

describe('DecisionEngine — userRange null guard', () => {
    test('userRange yoksa, veri kapsama kontrolü atlanır (NaN olmaz)', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({ userRange: null }));
        assert.equal(r.decision, 'accept');
    });

    test('userRange.purchase boş string ise dataStart fallback kullanılır', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            userRange: { purchase: '', return: '' }
        }));
        assert.equal(r.decision, 'accept');
    });

    test('veri başlangıcı satın almadan çok geç → revize', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            userRange: {
                purchase: new Date('2025-12-01T00:00:00Z'), // 1 ay öncesi
                return: new Date('2026-01-02T00:00:00Z')
            }
        }));
        assert.equal(r.decision, 'revize');
        assert.ok(r.reasons.some(x => /Eksik gün|Veri başlangıcı/i.test(x)));
    });
});

describe('DecisionEngine — gap / kayıt sıklığı', () => {
    test('mostCommonGap > 60 dk → revize', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            validation: { gaps: [], hasCriticalGap: false, isFrequencyIssue: true, mostCommonGapMin: 90, avgGapMin: 90 }
        }));
        assert.equal(r.decision, 'revize');
        assert.ok(r.reasons.some(x => /kayıt aralığı/i.test(x)));
    });

    test('maxGap > 300dk (5 saat) → revize', () => {
        const r = DecisionEngine.evaluate(baseAnalysis({
            validation: {
                gaps: [{ start: new Date(), end: new Date(), minutes: 400 }],
                hasCriticalGap: true,
                isFrequencyIssue: false,
                mostCommonGapMin: 15,
                avgGapMin: 20
            }
        }));
        assert.equal(r.decision, 'revize');
        assert.ok(r.reasons.some(x => /veri kaybı/i.test(x)));
    });
});

describe('DecisionEngine — confidence taban', () => {
    test('confidence en az 40 olmalı', () => {
        // Tüm cezalar toplansın: reject + anti-fraud + manipülasyon
        const r = DecisionEngine.evaluate(baseAnalysis({
            compliance: { status: 'fail', redReasons: ['x'], conditionalReasons: [], checks: [] },
            mkt: { stdDev: 0.05, mkt: 5 },
            dataPoints: 500,
            metadata: { deviceSerial: 'A-COPY-1' }
        }));
        assert.ok(r.confidence >= 40, `confidence=${r.confidence}`);
    });
});
