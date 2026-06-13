const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers/load-browser-module');

const { ConfidenceScore } = loadBrowserModules(['confidence.js'], ['ConfidenceScore']);

const cleanDateFormat = { format: 'DMY', method: 'voting', confidence: 1, ambiguous: false };

function cleanSignals(overrides = {}) {
    return {
        dateFormat: cleanDateFormat,
        totalCandidates: 100,
        parsedRows: 100,
        skippedRows: 0,
        removedYearOutliers: 0,
        dedupRemoved: 0,
        temperatures: Array(100).fill(5.2),
        ...overrides
    };
}

describe('ConfidenceScore.compute — temiz çıkarım', () => {
    test('hiç sorun yoksa 100/100 ve inceleme istemez', () => {
        const r = ConfidenceScore.compute(cleanSignals());
        assert.equal(r.score, 100);
        assert.equal(r.needsReview, false);
        assert.equal(r.factors.length, 0);
    });
});

describe('ConfidenceScore.compute — tarih formatı sinyali', () => {
    test('belirsiz tarih formatı 25 puan düşürür ve incelemeyi zorlar', () => {
        const r = ConfidenceScore.compute(cleanSignals({
            dateFormat: { format: 'DMY', method: 'default', confidence: 0.3, ambiguous: true }
        }));
        assert.equal(r.score, 75);
        assert.equal(r.needsReview, true); // skor eşik üstü olsa bile belirsizlik inceleme ister
        assert.ok(r.factors.some(f => f.factor === 'tarih-formati'));
    });

    test('tespit hiç yapılmamışsa 10 puan düşer', () => {
        const r = ConfidenceScore.compute(cleanSignals({ dateFormat: null }));
        assert.equal(r.score, 90);
    });
});

describe('ConfidenceScore.compute — veri kaybı sinyalleri', () => {
    test('%30 satır kaybı 30 puan düşürür', () => {
        const r = ConfidenceScore.compute(cleanSignals({ skippedRows: 20, removedYearOutliers: 10, parsedRows: 70 }));
        assert.equal(r.score, 70 - 0); // 100 - 30 = 70
        assert.ok(r.factors.some(f => f.factor === 'veri-kaybi'));
    });

    test('mükerrer kayıtlar hafif düşürür (maks 10)', () => {
        const r = ConfidenceScore.compute(cleanSignals({ dedupRemoved: 50 }));
        assert.equal(r.score, 90);
    });
});

describe('ConfidenceScore.compute — OCR sinyalleri', () => {
    test('AI iddia farkı puanı düşürür', () => {
        const r = ConfidenceScore.compute(cleanSignals({ aiClaimedTotal: 100, claimMismatch: 10, parsedRows: 90 }));
        assert.equal(r.score, 85); // min(25, %10 * 150) = 15
    });

    test('düşük güvenli satır oranı puanı düşürür', () => {
        const r = ConfidenceScore.compute(cleanSignals({ lowConfidenceCount: 30 }));
        assert.equal(r.score, 82); // min(20, %30 * 60) = 18
    });

    test('rowConfidences dizisinden de düşük güven sayılır', () => {
        const confs = Array(90).fill(0.95).concat(Array(10).fill(0.5));
        const r = ConfidenceScore.compute(cleanSignals({ rowConfidences: confs }));
        assert.ok(r.score < 100);
        assert.ok(r.factors.some(f => f.factor === 'dusuk-guvenli-satirlar'));
    });

    test('forceReview bayrağı skor 100 olsa bile incelemeyi zorlar', () => {
        const r = ConfidenceScore.compute(cleanSignals({ forceReview: true }));
        assert.equal(r.score, 100);
        assert.equal(r.needsReview, true);
    });
});

describe('ConfidenceScore.compute — sıcaklık makullüğü ve az veri', () => {
    test('bandın dışındaki değerler puanı düşürür', () => {
        const temps = Array(50).fill(5).concat(Array(50).fill(128)); // %50 makul
        const r = ConfidenceScore.compute(cleanSignals({ temperatures: temps }));
        assert.equal(r.score, 80); // min(20, (0.9-0.5)*100) = 20
        assert.ok(r.factors.some(f => f.factor === 'sicaklik-makullugu'));
    });

    test('10 satırdan az veri 10 puan düşürür', () => {
        const r = ConfidenceScore.compute(cleanSignals({
            totalCandidates: 5, parsedRows: 5, temperatures: Array(5).fill(5)
        }));
        assert.equal(r.score, 90);
        assert.ok(r.factors.some(f => f.factor === 'az-veri'));
    });
});

describe('ConfidenceScore.compute — eşikleme', () => {
    test('birden çok sorun birikince eşik altına düşer', () => {
        const r = ConfidenceScore.compute(cleanSignals({
            dateFormat: { format: 'DMY', method: 'default', confidence: 0.3, ambiguous: true }, // -25
            skippedRows: 15, parsedRows: 85,                                                    // -15
            aiClaimedTotal: 100, claimMismatch: 8                                               // -12
        }));
        assert.ok(r.score < ConfidenceScore.REVIEW_THRESHOLD);
        assert.equal(r.needsReview, true);
    });

    test('skor asla 0 altına inmez', () => {
        const r = ConfidenceScore.compute({
            dateFormat: { ambiguous: true },
            totalCandidates: 100,
            parsedRows: 2,
            skippedRows: 98,
            aiClaimedTotal: 100,
            claimMismatch: 98,
            lowConfidenceCount: 2,
            temperatures: [999, 999]
        });
        assert.ok(r.score >= 0);
        assert.equal(r.needsReview, true);
    });
});

describe('ConfidenceScore.compute — şablon kaynaklı zorunlu inceleme (Faz 4)', () => {
    test('reviewReasons skoru DÜŞÜRMEZ ama 0 puanlık gerekçe olarak görünür', () => {
        const reason = 'Önerilen şablon "Elitech" (%92 benzer) ile parse edildi';
        const r = ConfidenceScore.compute(cleanSignals({ forceReview: true, reviewReasons: [reason] }));
        assert.equal(r.score, 100);
        assert.equal(r.needsReview, true);
        const f = r.factors.find(x => x.factor === 'zorunlu-inceleme');
        assert.ok(f);
        assert.equal(f.deduction, 0);
        assert.equal(f.detail, reason);
    });

    test('boş/eksik reviewReasons sorun çıkarmaz', () => {
        const r = ConfidenceScore.compute(cleanSignals({ reviewReasons: [null, ''] }));
        assert.equal(r.score, 100);
        assert.equal(r.factors.length, 0);
    });
});

describe('ConfidenceScore.gate — zorunlu onay kapısı (Faz 3 HITL)', () => {
    const okConf = { score: 95, threshold: 70, needsReview: false, factors: [] };
    const badConf = {
        score: 55, threshold: 70, needsReview: true,
        factors: [{ factor: 'tarih-formati', deduction: 25, detail: 'Tarih formatı belirsiz' }]
    };
    const doc = (id, conf) => ({ id, name: id + '.pdf', metadata: { extraction: { confidence: conf } } });

    test('tüm belgeler güvenliyse kapı boş döner', () => {
        assert.equal(ConfidenceScore.gate([doc('a', okConf), doc('b', okConf)], []).length, 0);
    });

    test('needsReview bayraklı belge incelemeye düşer', () => {
        const pending = ConfidenceScore.gate([doc('a', okConf), doc('b', badConf)], []);
        assert.equal(pending.length, 1);
        assert.equal(pending[0].id, 'b');
        assert.equal(pending[0].score, 55);
        assert.ok(pending[0].factors.some(f => f.factor === 'tarih-formati'));
    });

    test('onaylanmış belge kapıdan geçer (dizi ve Set ile)', () => {
        const docs = [doc('a', badConf), doc('b', badConf)];
        assert.equal(ConfidenceScore.gate(docs, ['a']).length, 1);
        assert.equal(ConfidenceScore.gate(docs, new Set(['a', 'b'])).length, 0);
    });

    test('güven skoru hiç hesaplanmamışsa belge güvenli SAYILMAZ', () => {
        const noConf = { id: 'x', name: 'x.pdf', metadata: {} };
        const pending = ConfidenceScore.gate([noConf], []);
        assert.equal(pending.length, 1);
        assert.equal(pending[0].score, null);
        assert.ok(pending[0].factors.some(f => f.factor === 'skor-yok'));
    });

    test('boş/eksik girdilerde patlamaz', () => {
        assert.equal(ConfidenceScore.gate([], []).length, 0);
        assert.equal(ConfidenceScore.gate(null, null).length, 0);
    });

    test('isim yoksa id, name alanına düşer', () => {
        const pending = ConfidenceScore.gate([{ id: 'f9', metadata: {} }], []);
        assert.equal(pending[0].name, 'f9');
    });
});

describe('ConfidenceScore.gate — örneklemeli QA (Faz 6 / Kademe 4)', () => {
    const okConf = { score: 95, threshold: 70, needsReview: false, factors: [] };
    const doc = (id) => ({ id, name: id + '.pdf', metadata: { extraction: { confidence: okConf } } });

    test('qaSampleRate verilmezse yüksek güvenli belge incelemeye düşmez (geriye uyumlu)', () => {
        assert.equal(ConfidenceScore.gate([doc('a'), doc('b')], []).length, 0);
    });

    test('deterministik: aynı id aynı oranda hep aynı kararı verir', () => {
        const r1 = ConfidenceScore.gate([doc('sabit-id')], [], { qaSampleRate: 0.5 });
        const r2 = ConfidenceScore.gate([doc('sabit-id')], [], { qaSampleRate: 0.5 });
        assert.equal(r1.length, r2.length);
    });

    test('rate=1 ise her yüksek güvenli belge QA için seçilir, gerekçe etiketli', () => {
        const pending = ConfidenceScore.gate([doc('a'), doc('b'), doc('c')], [], { qaSampleRate: 1 });
        assert.equal(pending.length, 3);
        assert.ok(pending[0].factors.some(f => f.factor === 'ornekleme-qa' && f.deduction === 0));
    });

    test('QA için seçilen belge onaylanmışsa kapıdan geçer', () => {
        const pending = ConfidenceScore.gate([doc('a')], ['a'], { qaSampleRate: 1 });
        assert.equal(pending.length, 0);
    });

    test('~1/10 oranı belgelerin yalnızca bir kısmını seçer (hepsini değil, hiçbirini değil)', () => {
        const docs = Array.from({ length: 200 }, (_, i) => doc('doc-' + i));
        const picked = ConfidenceScore.gate(docs, [], { qaSampleRate: 0.1 }).length;
        assert.ok(picked > 0, 'en az birkaç belge seçilmeli');
        assert.ok(picked < docs.length, 'hepsi seçilmemeli');
    });
});
