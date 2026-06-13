const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// UMD modül — Node'da doğrudan require edilir (sunucu da aynı yolu kullanır).
const FP = require('../js/format-fingerprint');

// ─── Örnek belgeler ─────────────────────────────────────────
// Aynı logger yazılımının iki farklı eczane/ay çıktısı: içerik (rakamlar)
// farklı, İSKELET aynı → parmak izi birebir tutmalı.
const elitechPage1A = [
    'Elitech Veri Raporu',
    'Eczane: Hayat Eczanesi  Seri No: EL-2024-0042',
    'Rapor Tarihi: 05.03.2026',
    'Tarih Saat Sıcaklık °C Nem %',
    '01.03.2026 00:00 4.2 45',
    '01.03.2026 00:30 4.5 46'
];
const elitechPage1B = [
    'Elitech Veri Raporu',
    'Eczane: Umut Eczanesi  Seri No: EL-2025-9911',
    'Rapor Tarihi: 18.11.2026',
    'Tarih Saat Sıcaklık °C Nem %',
    '12.11.2026 08:00 5.1 51',
    '12.11.2026 08:30 5.3 50'
];
// Farklı düzen (başka marka): parmak izi farklı olmalı.
const testoPage1 = [
    'testo Saveris 2 Rapor',
    'Cihaz: T2-883120',
    'Zaman Değer (°C)',
    '2026-03-01T00:00 4.2',
    '2026-03-01T01:00 4.4'
];

describe('FormatFingerprint.maskDigits / tokenize', () => {
    test('rakamlar # ile maskelenir', () => {
        assert.equal(FP.maskDigits('01.03.2026 00:00 4.2'), '##.##.#### ##:## #.#');
    });

    test('tamamen maske/noktalama olan tokenlar elenir, °c gibi birim tokenları kalır', () => {
        const tokens = FP.tokenize(FP.maskDigits('Tarih Saat 01.03.2026 4.2 °C'));
        assert.deepEqual(tokens, ['tarih', 'saat', '°c']);
    });

    test('Türkçe İ küçük harfe inerken birleşen nokta üretmez (TARİH ≡ Tarih)', () => {
        assert.deepEqual(FP.tokenize('TARİH'), FP.tokenize('Tarih'));
    });
});

describe('FormatFingerprint.findHeaderLine', () => {
    test('başlığa en çok benzeyen satır seçilir (meta blok atlanır)', () => {
        assert.equal(FP.findHeaderLine(elitechPage1A), 'Tarih Saat Sıcaklık °C Nem %');
    });

    test('hiç başlık benzeri satır yoksa null', () => {
        assert.equal(FP.findHeaderLine(['lorem ipsum', '123 456']), null);
    });
});

describe('FormatFingerprint.pdfFingerprint — eczane bağımsızlığı', () => {
    test('aynı iskelet + farklı içerik → AYNI hash (A eczanesinden öğrenilen B ile eşleşir)', async () => {
        const a = await FP.pdfFingerprint({ lines: elitechPage1A, producer: 'ElitechWin 5.0' });
        const b = await FP.pdfFingerprint({ lines: elitechPage1B, producer: 'ElitechWin 5.0' });
        assert.equal(a.hash, b.hash);
        assert.equal(a.kind, 'pdf');
        assert.ok(a.headerTokens.includes('tarih'));
    });

    test('farklı düzen → farklı hash', async () => {
        const a = await FP.pdfFingerprint({ lines: elitechPage1A, producer: 'ElitechWin 5.0' });
        const t = await FP.pdfFingerprint({ lines: testoPage1, producer: 'Testo Cloud' });
        assert.notEqual(a.hash, t.hash);
    });

    test('aynı iskelet + farklı Producer (yazılım sürümü) → farklı hash (ayrı varyant)', async () => {
        const a = await FP.pdfFingerprint({ lines: elitechPage1A, producer: 'ElitechWin 5.0' });
        const b = await FP.pdfFingerprint({ lines: elitechPage1A, producer: 'ElitechWin 6.1' });
        assert.notEqual(a.hash, b.hash);
    });
});

describe('FormatFingerprint.tabularFingerprint', () => {
    test('sütun sırası hash\'i etkilemez, büyük/küçük harf ve boşluk normalize edilir', async () => {
        const a = await FP.tabularFingerprint(['Tarih', 'Saat', 'Sıcaklık (°C)']);
        const b = await FP.tabularFingerprint([' sıcaklık (°c) ', 'TARİH', 'Saat']);
        assert.equal(a.hash, b.hash);
        assert.equal(a.kind, 'tabular');
    });

    test('farklı sütun kümesi → farklı hash', async () => {
        const a = await FP.tabularFingerprint(['Tarih', 'Saat', 'Sıcaklık']);
        const b = await FP.tabularFingerprint(['Tarih', 'Saat', 'Sıcaklık', 'Nem']);
        assert.notEqual(a.hash, b.hash);
    });
});

describe('FormatFingerprint.jaccard', () => {
    test('özdeş kümeler → 1', () => {
        assert.equal(FP.jaccard(['a', 'b'], ['b', 'a']), 1);
    });
    test('ayrık kümeler → 0', () => {
        assert.equal(FP.jaccard(['a'], ['b']), 0);
    });
    test('boş küme → 0 (boş başlık asla eşleşmez)', () => {
        assert.equal(FP.jaccard([], []), 0);
    });
    test('kısmi örtüşme doğru hesaplanır', () => {
        // kesişim 3, birleşim 4 → 0.75
        assert.equal(FP.jaccard(['a', 'b', 'c', 'd'], ['a', 'b', 'c']), 0.75);
    });
});

describe('FormatFingerprint.detectBrand — yardımcı sinyal', () => {
    test('bilinen marka kelimesi yakalanır', () => {
        assert.equal(FP.detectBrand('testo Saveris 2 Rapor'), 'Testo');
        assert.equal(FP.detectBrand('ELITECH RC-5 USB Data Logger'), 'Elitech');
        assert.equal(FP.detectBrand('RC-5 USB Logger'), 'RC-5');
        assert.equal(FP.detectBrand('Tufan Soğutma Sistemleri'), 'Clogger/Tufan');
    });
    test('bilinmeyen metin → null', () => {
        assert.equal(FP.detectBrand('Sıradan bir rapor başlığı'), null);
    });
});

describe('FormatFingerprint.matchTemplate — iki kademeli eşleştirme', () => {
    const schema = { dateOrder: 'dmy', dateSep: '.', timeSep: ':', decimalSep: ',', tempColIndex: 0 };
    const templates = [
        { id: 1, fingerprint: 'HASH-ELITECH', kind: 'pdf', brand: 'Elitech', producer: 'ElitechWin 5.0', headerTokens: ['tarih', 'saat', 'sıcaklık', '°c', 'nem'], schema },
        { id: 2, fingerprint: 'HASH-TESTO', kind: 'pdf', brand: 'Testo', producer: 'Testo Cloud', headerTokens: ['zaman', 'değer', '°c'], schema }
    ];

    test('kesin (hash) eşleşme → exact, similarity 1, çelişki yok', () => {
        const r = FP.matchTemplate(templates, { fingerprint: 'HASH-ELITECH', brandHint: 'Elitech' });
        assert.equal(r.match, 'exact');
        assert.equal(r.template.id, 1);
        assert.equal(r.similarity, 1);
        assert.equal(r.brandConflict, false);
    });

    test('kesin eşleşme + belgede FARKLI marka kelimesi → brandConflict (insan kuyruğu)', () => {
        const r = FP.matchTemplate(templates, { fingerprint: 'HASH-ELITECH', brandHint: 'Testo' });
        assert.equal(r.match, 'exact');
        assert.equal(r.brandConflict, true);
    });

    test('marka etiketi diğerini kapsıyorsa çelişki sayılmaz (Elitech vs Elitech RC-5)', () => {
        assert.equal(FP.brandsAgree('Elitech', 'Elitech RC-5'), true);
        assert.equal(FP.brandsAgree('Elitech', ''), true);
        assert.equal(FP.brandsAgree('Elitech', 'Testo'), false);
    });

    test('hash tutmaz + Jaccard ≥ 0.85 + aynı Producer → fuzzy aday', () => {
        const r = FP.matchTemplate(templates, {
            fingerprint: 'HASH-YENI',
            kind: 'pdf',
            producer: 'ElitechWin 5.0',
            headerTokens: ['tarih', 'saat', 'sıcaklık', '°c', 'nem', 'durum'] // 5/6 ≈ 0.83 → eşik altı
        });
        assert.equal(r.match, 'none'); // 0.83 < 0.85

        const r2 = FP.matchTemplate(templates, {
            fingerprint: 'HASH-YENI',
            kind: 'pdf',
            producer: 'ElitechWin 5.0',
            headerTokens: ['tarih', 'saat', 'sıcaklık', '°c', 'nem'] // birebir küme → 1.0
        });
        assert.equal(r2.match, 'fuzzy');
        assert.equal(r2.template.id, 1);
        assert.ok(r2.similarity >= FP.FUZZY_THRESHOLD);
    });

    test('Producer ikisinde de biliniyor ama farklı → fuzzy aday OLMAZ', () => {
        const r = FP.matchTemplate(templates, {
            fingerprint: 'HASH-YENI',
            kind: 'pdf',
            producer: 'BaskaYazilim 1.0',
            headerTokens: ['tarih', 'saat', 'sıcaklık', '°c', 'nem']
        });
        assert.equal(r.match, 'none');
    });

    test('marka ipucu çelişen şablonu aday kümesinden çıkarır', () => {
        const r = FP.matchTemplate(templates, {
            fingerprint: 'HASH-YENI',
            kind: 'pdf',
            producer: 'ElitechWin 5.0',
            brandHint: 'Testo', // şablon 1 Elitech etiketli → elenir
            headerTokens: ['tarih', 'saat', 'sıcaklık', '°c', 'nem']
        });
        assert.equal(r.match, 'none');
    });

    test('hiçbir şey tutmazsa none (yeni format → AI keşfi + insan onayı)', () => {
        const r = FP.matchTemplate(templates, {
            fingerprint: 'HASH-YENI', kind: 'pdf', headerTokens: ['apayrı', 'kolonlar']
        });
        assert.equal(r.match, 'none');
    });

    test('kind filtresi: tabular sorgu pdf şablonuyla bulanık eşleşmez', () => {
        const r = FP.matchTemplate(templates, {
            fingerprint: 'HASH-YENI', kind: 'tabular',
            headerTokens: ['tarih', 'saat', 'sıcaklık', '°c', 'nem']
        });
        assert.equal(r.match, 'none');
    });
});
