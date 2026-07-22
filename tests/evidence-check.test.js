const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers/load-browser-module');

const { EvidenceCheck } = loadBrowserModules(['evidence-check.js'], ['EvidenceCheck']);

describe('EvidenceCheck.extractStandaloneNumbers — sınır kuralları', () => {
    test('Azur satırı: bağımsız sayılar; 94 kesiri token DEĞİL', () => {
        const nums = EvidenceCheck.extractStandaloneNumbers('2026-07-02 00:04:09 5.94 °C 26.5 °C %60.72');
        assert.ok(nums.includes(5.94));
        assert.ok(nums.includes(26.5));
        assert.ok(!nums.includes(94));
        assert.ok(!nums.includes(4));   // 00:04'ün parçası
        assert.ok(!nums.includes(9));   // :09'un parçası
    });

    test('nokta ayraçlı tarih parçaları token üretmez', () => {
        const nums = EvidenceCheck.extractStandaloneNumbers('02.07.2026 07:00 7 °C');
        assert.equal(nums.length, 1);
        assert.equal(nums[0], 7);
    });

    test('ISO tarih tire parçaları negatif sayı üretmez', () => {
        const nums = EvidenceCheck.extractStandaloneNumbers('2026-03-23 12:45 -1.2 °C');
        assert.ok(!nums.includes(-3));
        assert.ok(!nums.includes(-23));
        assert.ok(nums.includes(-1.2));
    });

    test('Unicode eksi ve NBSP normalize edilir', () => {
        const nums = EvidenceCheck.extractStandaloneNumbers('15.03.2024 10:30 −1,2 °C');
        assert.ok(nums.includes(-1.2));
    });
});

describe('EvidenceCheck.valueAppearsStandalone — Azur regresyonu', () => {
    const raw = '2026-07-02 00:04:09 5.94 °C 26.5 °C %60.72';

    test('kesir kırpılmış 94 → BULUNAMAZ (sistematik hata yakalanır)', () => {
        assert.equal(EvidenceCheck.valueAppearsStandalone(raw, 94), false);
    });
    test('gerçek değer 5.94 → bulunur', () => {
        assert.equal(EvidenceCheck.valueAppearsStandalone(raw, 5.94), true);
    });
    test('tolerans iki yönlü: 5.9 ≠ 5.94', () => {
        assert.equal(EvidenceCheck.valueAppearsStandalone(raw, 5.9), false);
    });
    test('virgül/nokta eşdeğerliği: raw "5,94" ↔ parsed 5.94', () => {
        assert.equal(EvidenceCheck.valueAppearsStandalone('06.03.2026 02:11 5,94 °C', 5.94), true);
    });
    test('tamsayı ve ".0" eşdeğerliği', () => {
        assert.equal(EvidenceCheck.valueAppearsStandalone('06.03.2026 02:11 5 °C', 5), true);
        assert.equal(EvidenceCheck.valueAppearsStandalone('06.03.2026 02:11 5.0 °C', 5), true);
    });
    test('saat parçası asla eşleşmez: 00:31 → 31 bulunamaz', () => {
        assert.equal(EvidenceCheck.valueAppearsStandalone('15.03.2024 00:31', 31), false);
    });
});

describe('EvidenceCheck.checkRows', () => {
    test('kesir kırpma vakasında tüm satırlar missing', () => {
        const rows = [
            { temperature: 94, rawText: '2026-07-02 00:04:09 5.94 °C 26.5 °C %60.72', rowIndex: 1 },
            { temperature: 37, rawText: '2026-07-02 00:24:21 5.37 °C 26.6 °C %60.82', rowIndex: 2 },
        ];
        const r = EvidenceCheck.checkRows(rows);
        assert.equal(r.checked, 2);
        assert.equal(r.missing.length, 2);
        assert.equal(r.missingRatio, 1);
        assert.equal(r.missing[0].arrayIndex, 0);
    });

    test('doğru parse → missing yok', () => {
        const r = EvidenceCheck.checkRows([
            { temperature: 5.94, rawText: '2026-07-02 00:04:09 5.94 °C', rowIndex: 1 },
        ]);
        assert.equal(r.missing.length, 0);
    });

    test('rawText olmayan satırlar (Excel/CSV) cezasız atlanır', () => {
        const r = EvidenceCheck.checkRows([
            { temperature: 5.2 },
            { temperature: 5.3, rawText: '' },
            { temperature: 5.94, rawText: '2026-07-02 5.94 °C' },
        ]);
        assert.equal(r.skippedNoRaw, 2);
        assert.equal(r.checked, 1);
        assert.equal(r.missingRatio, 0);
    });

    test('boş girdi güvenli', () => {
        const r = EvidenceCheck.checkRows([]);
        assert.equal(r.checked, 0);
        assert.equal(r.missingRatio, 0);
    });
});

describe('EvidenceCheck.checkTimestamps', () => {
    const mk = (ms) => ({ timestamp: new Date(ms) });
    const HOUR = 3600000;
    const base = new Date('2026-07-02T00:00:00').getTime();

    test('temiz saatlik seri → aykırı yok', () => {
        const rows = Array.from({ length: 100 }, (_, i) => mk(base + i * HOUR));
        const r = EvidenceCheck.checkTimestamps(rows);
        assert.equal(r.outlierCount, 0);
        assert.equal(r.dominantIntervalMin, 60);
    });

    test('2 yıl uzağa düşen satır aykırı sayılır', () => {
        const rows = Array.from({ length: 100 }, (_, i) => mk(base + i * HOUR));
        rows.push(mk(base + 2 * 365 * 24 * HOUR));
        rows.sort((a, b) => a.timestamp - b.timestamp);
        const r = EvidenceCheck.checkTimestamps(rows);
        assert.equal(r.outlierCount, 1);
    });

    test('normal logger boşluğu (1 gün) aykırı DEĞİL', () => {
        const rows = [
            ...Array.from({ length: 50 }, (_, i) => mk(base + i * HOUR)),
            ...Array.from({ length: 50 }, (_, i) => mk(base + (24 + 50 + i) * HOUR)),
        ];
        const r = EvidenceCheck.checkTimestamps(rows);
        assert.equal(r.outlierCount, 0);
    });

    test('5 satırdan az → kontrol atlanır', () => {
        const r = EvidenceCheck.checkTimestamps([mk(base), mk(base + 999 * 24 * HOUR)]);
        assert.equal(r.outlierCount, 0);
    });
});
