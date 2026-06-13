const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Tek tarih çözücü hem Node'da (require) hem tarayıcıda (global) çalışır;
// burada Node yüzünü test ediyoruz. Tarayıcı yüzü utils.test.js'te vm
// context üzerinden ayrıca doğrulanır.
const Detector = require('../date-format-detector');

describe('DateFormatDetector.detect — Katman 0: header ipucu', () => {
    test('başlıkta DD.MM.YYYY varsa anında DMY', () => {
        const r = Detector.detect(['Tarih (DD.MM.YYYY)', '05.03.2024 10:00 5.2']);
        assert.equal(r.format, 'DMY');
        assert.equal(r.method, 'header');
        assert.equal(r.ambiguous, false);
        assert.equal(r.confidence, 1);
    });

    test('başlıkta MM/DD/YYYY varsa MDY', () => {
        const r = Detector.detect(['Date (MM/DD/YYYY)', '03/05/2024 10:00']);
        assert.equal(r.format, 'MDY');
        assert.equal(r.method, 'header');
    });
});

describe('DateFormatDetector.detect — Katman 1: oylama (>12 kuralı)', () => {
    test('gün > 12 olan tarihler DMY oyu verir', () => {
        const lines = ['15.03.2024 10:00', '16.03.2024 11:00', '17.03.2024 12:00'];
        const r = Detector.detect(lines);
        assert.equal(r.format, 'DMY');
        assert.equal(r.method, 'voting');
        assert.equal(r.ambiguous, false);
        assert.ok(r.confidence >= 0.7);
    });

    test('ikinci parça > 12 olan tarihler MDY oyu verir', () => {
        const lines = ['03/15/2024 10:00', '03/16/2024 11:00'];
        const r = Detector.detect(lines);
        assert.equal(r.format, 'MDY');
        assert.equal(r.ambiguous, false);
    });

    test('4 haneli yıl önde → YMD', () => {
        const lines = ['2024-03-15 10:00', '2024-03-16 11:00'];
        const r = Detector.detect(lines);
        assert.equal(r.format, 'YMD');
        assert.equal(r.ambiguous, false);
    });
});

describe('DateFormatDetector.detect — Katman 2: delta testi', () => {
    test('tüm günler ≤12 ama ardışık → delta DMY seçer', () => {
        // Ayın ilk 12 günü: oylama belirsiz kalır, ama gün sınırı geçişleri
        // DMY yorumunda +1 gün, MDY yorumunda ~+31 gün verir.
        const lines = [];
        for (let d = 1; d <= 12; d++) lines.push(`${String(d).padStart(2, '0')}.03.2024 09:00 5.2`);
        const r = Detector.detect(lines);
        assert.equal(r.format, 'DMY');
        assert.equal(r.method, 'delta');
        assert.equal(r.ambiguous, false);
    });
});

describe('DateFormatDetector.detect — belirsizlik bayrağı', () => {
    test('tek günlük, tüm parçalar ≤12 → DMY varsayılan + ambiguous', () => {
        const lines = ['05.03.2024 10:00', '05.03.2024 11:00', '05.03.2024 12:00'];
        const r = Detector.detect(lines);
        assert.equal(r.format, 'DMY'); // bölgesel varsayılan
        assert.equal(r.ambiguous, true);
        assert.ok(r.confidence < 0.7);
    });

    test('boş girdi → DMY varsayılan + ambiguous', () => {
        const r = Detector.detect([]);
        assert.equal(r.format, 'DMY');
        assert.equal(r.ambiguous, true);
    });
});

describe('DateFormatDetector — geriye uyumlu API', () => {
    test('detectDateFormat yalnızca format string döner', () => {
        assert.equal(Detector.detectDateFormat(['15.03.2024', '16.03.2024']), 'DMY');
    });

    test('parseDate format bilgisiyle ISO üretir', () => {
        assert.equal(Detector.parseDate('15.03.2024', 'DMY'), '2024-03-15');
        assert.equal(Detector.parseDate('03/15/2024', 'MDY'), '2024-03-15');
        assert.equal(Detector.parseDate('2024-03-15', 'YMD'), '2024-03-15');
    });

    test('parseDate geçersiz ay/gün → null', () => {
        assert.equal(Detector.parseDate('15.99.2024', 'DMY'), null);
    });

    test('makeGetTimestamp satırdan epoch üretir', () => {
        const getTs = Detector.makeGetTimestamp('DMY');
        const ts = getTs('15.03.2024 10:30 5.2');
        const d = new Date(ts);
        assert.equal(d.getFullYear(), 2024);
        assert.equal(d.getMonth(), 2);
        assert.equal(d.getDate(), 15);
        assert.equal(d.getHours(), 10);
        assert.equal(d.getMinutes(), 30);
    });
});
