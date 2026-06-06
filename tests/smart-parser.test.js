const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers/load-browser-module');

const { SmartParser } = loadBrowserModules(
    ['utils.js', 'smart-parser.js'],
    ['Utils', 'SmartParser']
);

// parseTextFile pdfjsLib + DataParser bağımlılığı içerdiğinden çekirdek
// olan buildParser(schema)'yı doğrudan test ediyoruz: 4 farklı tarih
// şemasını ürettiği parseLine fonksiyonunu raw string'lerle çağırırız.

describe('SmartParser.buildParser — DMY nokta ayraçlı (TR yaygın)', () => {
    const parse = SmartParser.buildParser({
        dateOrder: 'dmy', dateSep: '.', timeSep: ':', decimalSep: ',', tempColIndex: 0
    });

    test('15.03.2024 10:30 5,2 → yakalanır', () => {
        const r = parse('15.03.2024 10:30 5,2');
        assert.ok(r);
        assert.equal(r.dateStr, '15/03/2024');
        assert.equal(r.timeStr, '10:30');
        assert.equal(r.tempStr, 5.2);
    });

    test('negatif sıcaklık parse edilir', () => {
        const r = parse('01.01.2024 08:00 -2,5');
        assert.ok(r);
        assert.equal(r.tempStr, -2.5);
    });

    test('°C birimi ile gelen değer parse edilir', () => {
        const r = parse('15.03.2024 10:30 5,2°C');
        assert.ok(r);
        assert.equal(r.tempStr, 5.2);
    });

    test('tarih yoksa null', () => {
        assert.equal(parse('sadece text 5,2'), null);
    });

    test('sıcaklık yoksa null', () => {
        assert.equal(parse('15.03.2024 10:30'), null);
    });
});

describe('SmartParser.buildParser — YMD tire ayraçlı (ISO)', () => {
    const parse = SmartParser.buildParser({
        dateOrder: 'ymd', dateSep: '-', timeSep: ':', decimalSep: '.', tempColIndex: 0
    });

    test('2024-03-15 10:30 5.2 → yakalanır', () => {
        const r = parse('2024-03-15 10:30 5.2');
        assert.ok(r);
        assert.equal(r.dateStr, '15/03/2024');
        assert.equal(r.timeStr, '10:30');
        assert.equal(r.tempStr, 5.2);
    });
});

describe('SmartParser.buildParser — MDY slash ayraçlı (US)', () => {
    const parse = SmartParser.buildParser({
        dateOrder: 'mdy', dateSep: '/', timeSep: ':', decimalSep: '.', tempColIndex: 0
    });

    test('03/15/2024 10:30 5.2 → yakalanır', () => {
        const r = parse('03/15/2024 10:30 5.2');
        assert.ok(r);
        assert.equal(r.dateStr, '15/03/2024'); // normalize edilmiş output
        assert.equal(r.tempStr, 5.2);
    });
});

describe('SmartParser.buildParser — mantıksal doğrulama (anti seri-no)', () => {
    const parse = SmartParser.buildParser({
        dateOrder: 'dmy', dateSep: '.', timeSep: ':', decimalSep: '.', tempColIndex: 0
    });

    test('ay > 12 → reddedilir (seri no falan olabilir)', () => {
        assert.equal(parse('15.99.2024 10:30 5.2'), null);
    });

    test('gün > 31 → reddedilir', () => {
        assert.equal(parse('99.03.2024 10:30 5.2'), null);
    });

    test('yıl < 2000 → reddedilir', () => {
        assert.equal(parse('15.03.1999 10:30 5.2'), null);
    });

    test('yıl > 2060 → reddedilir', () => {
        assert.equal(parse('15.03.2099 10:30 5.2'), null);
    });

    test('2 haneli yıl 24 → 2024 olarak kabul', () => {
        const r = parse('15.03.24 10:30 5.2');
        assert.ok(r);
        assert.equal(r.dateStr, '15/03/2024');
    });
});

describe('SmartParser.buildParser — saat parse koruması', () => {
    const parse = SmartParser.buildParser({
        dateOrder: 'dmy', dateSep: '.', timeSep: ':', decimalSep: ',', tempColIndex: 0
    });

    test('saat yoksa 00:00 fallback', () => {
        const r = parse('15.03.2024 5,2');
        assert.ok(r);
        assert.equal(r.timeStr, '00:00');
    });

    test('% ile biten sayı saat olarak algılanmaz', () => {
        // "80% nem" değerini saat zannetmemeli
        const r = parse('15.03.2024 80% 10:30 5,2');
        assert.ok(r);
        assert.equal(r.timeStr, '10:30');
    });
});

describe('SmartParser.buildParser — 4 şema arası seçim mantığı simülasyonu', () => {
    // parseTextFile, 4 şema dener ve en çok hit alan kazanır
    const trialSchemas = [
        { dateOrder: 'dmy', dateSep: '.', timeSep: ':', decimalSep: ',', tempColIndex: 0 },
        { dateOrder: 'dmy', dateSep: '/', timeSep: ':', decimalSep: '.', tempColIndex: 0 },
        { dateOrder: 'ymd', dateSep: '-', timeSep: ':', decimalSep: '.', tempColIndex: 0 },
        { dateOrder: 'mdy', dateSep: '/', timeSep: ':', decimalSep: '.', tempColIndex: 0 }
    ];

    function bestSchema(lines) {
        let best = { count: 0, schema: null };
        for (const schema of trialSchemas) {
            const parse = SmartParser.buildParser(schema);
            let count = 0;
            for (const line of lines) if (parse(line)) count++;
            if (count > best.count) best = { count, schema };
        }
        return best;
    }

    test('TR formatı (dd.mm.yyyy + virgül desimal) → dmy/nokta seçilir', () => {
        const lines = [
            '15.03.2024 10:30 5,2',
            '15.03.2024 10:45 5,3',
            '15.03.2024 11:00 5,4',
        ];
        const r = bestSchema(lines);
        assert.equal(r.count, 3);
        assert.equal(r.schema.dateOrder, 'dmy');
        assert.equal(r.schema.dateSep, '.');
    });

    test('ISO formatı (yyyy-mm-dd) → ymd seçilir', () => {
        const lines = [
            '2024-03-15 10:30 5.2',
            '2024-03-15 10:45 5.3',
            '2024-03-15 11:00 5.4',
        ];
        const r = bestSchema(lines);
        assert.equal(r.count, 3);
        assert.equal(r.schema.dateOrder, 'ymd');
    });

    test('tanınmayan formatta hiçbir şema yakalayamaz', () => {
        const lines = ['random text', 'no date here', 'just words'];
        const r = bestSchema(lines);
        assert.equal(r.count, 0);
    });
});
