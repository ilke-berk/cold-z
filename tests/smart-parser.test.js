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

    test('tam sayı sıcaklıklar (°C birimiyle) doğru parse edilir', () => {
        const r = parse('06.03.2026 02:11   5 °C   16,6 °C   49 %');
        assert.ok(r);
        assert.equal(r.tempStr, 5);
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

describe('SmartParser.buildParser — dateSep şemaya sadık (kozmetik değil)', () => {
    test('schema dateSep "/" iken nokta ayraçlı tarih yakalanmaz', () => {
        const parse = SmartParser.buildParser({
            dateOrder: 'dmy', dateSep: '/', timeSep: ':', decimalSep: ',', tempColIndex: 0
        });
        assert.equal(parse('15.03.2024 10:30 5,2'), null);
        const r = parse('15/03/2024 10:30 5,2');
        assert.ok(r);
        assert.equal(r.dateStr, '15/03/2024');
    });

    test('dateSep verilmezse tüm yaygın ayraçlar kabul edilir', () => {
        const parse = SmartParser.buildParser({ dateOrder: 'dmy', tempColIndex: 0 });
        assert.ok(parse('15.03.2024 10:30 5,2'));
        assert.ok(parse('15/03/2024 10:30 5.2'));
    });
});

describe('SmartParser.parseTextFile — uçtan uca IR hattı (Faz 2)', () => {
    // Metin yolu artık ortak IR'a iner: dedektör + güven skoru + postProcess.
    // pdfjsLib gerekmez; file.text() mock'lanır.
    const full = loadBrowserModules(
        ['../date-format-detector.js', 'confidence.js', 'utils.js', 'data-parser.js', 'smart-parser.js'],
        ['DateFormatDetector', 'ConfidenceScore', 'Utils', 'DataParser', 'SmartParser']
    );
    const SP = full.SmartParser;

    function mockFile(content, name = 'veri.txt') {
        return { name, text: async () => content };
    }

    test('TR metin dosyası: IR satırları + extraction bloğu + güven skoru', async () => {
        const lines = ['# Logger Çıktısı'];
        for (let d = 13; d <= 24; d++) lines.push(`${d}.03.2024 10:30 5,2`);
        const result = await SP.parseTextFile(mockFile(lines.join('\n')), () => { }, () => { });

        assert.equal(result.method, 'text-parser-v4');
        assert.equal(result.parsedData.length, 12);

        // IR satır şekli
        const row = result.parsedData[0];
        assert.ok(row.timestamp instanceof Date);
        assert.equal(row.confidence, 1);
        assert.equal(typeof row.rowIndex, 'number');
        assert.ok(typeof row.rawText === 'string' && row.rawText.includes('.03.2024'));

        // Belge düzeyi IR bloğu
        const ext = result.metadata.extraction;
        assert.equal(ext.sourcePath, 'text');
        assert.equal(ext.totalCandidates, 12);
        assert.equal(ext.dateFormat.format, 'DMY');
        assert.equal(ext.dateFormat.ambiguous, false);

        // Güven skoru: temiz veri → yüksek skor, inceleme istemez
        assert.equal(ext.confidence.score, 100);
        assert.equal(ext.confidence.needsReview, false);
    });

    test('tanınmayan metin formatı anlaşılır hata fırlatır', async () => {
        await assert.rejects(
            SP.parseTextFile(mockFile('rastgele\nmetin\nsatırları'), () => { }, () => { }),
            /tanınmayan formatta/
        );
    });
});

describe('SmartParser.cleanYearOutliers — Yıl Filtreleme Mantığı', () => {
    test('çoğunluğa uymayan uzak yılları ayıklar', () => {
        const mockData = [
            { timestamp: new Date('2026-03-01 10:00').getTime(), temperature: 5.2 },
            { timestamp: new Date('2000-01-03 23:55').getTime(), temperature: 3.0 },
            { timestamp: new Date('2026-03-01 11:00').getTime(), temperature: 5.3 },
            { timestamp: new Date('2026-03-01 12:00').getTime(), temperature: 5.4 }
        ];
        const cleaned = SmartParser.cleanYearOutliers(mockData);
        assert.equal(cleaned.length, 3);
        assert.equal(cleaned.some(d => new Date(d.timestamp).getFullYear() === 2000), false);
    });
});

