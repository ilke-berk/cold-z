const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadBrowserModules } = require('./helpers/load-browser-module');

const { Utils } = loadBrowserModules(['utils.js'], ['Utils']);

describe('Utils.celsius/kelvin dönüşümleri', () => {
    test('0°C = 273.15 K', () => {
        assert.equal(Utils.celsiusToKelvin(0), 273.15);
    });
    test('100°C = 373.15 K', () => {
        assert.equal(Utils.celsiusToKelvin(100), 373.15);
    });
    test('round-trip: c → k → c yaklaşık eşit (float epsilon içinde)', () => {
        const c = 7.42;
        const back = Utils.kelvinToCelsius(Utils.celsiusToKelvin(c));
        assert.ok(Math.abs(back - c) < 1e-9, `diff=${back - c}`);
    });
});

describe('Utils.generateHash (cyrb53)', () => {
    test('aynı girdi → aynı hash (deterministik)', () => {
        const a = Utils.generateHash('test');
        const b = Utils.generateHash('test');
        assert.equal(a, b);
    });
    test('farklı girdi → farklı hash', () => {
        assert.notEqual(Utils.generateHash('a'), Utils.generateHash('b'));
    });
    test('cyrb53 prefix ve uzunluk', () => {
        const h = Utils.generateHash('coldchain');
        assert.match(h, /^cyrb53:[0-9a-f]{16}$/);
    });
    test('obje JSON.stringify ile hash\'lenir', () => {
        const a = Utils.generateHash({ x: 1, y: 2 });
        const b = Utils.generateHash(JSON.stringify({ x: 1, y: 2 }));
        assert.equal(a, b);
    });
});

describe('Utils.sha256 (gerçek SHA-256)', () => {
    test('boş string için bilinen hash', async () => {
        const r = await Utils.sha256('');
        // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        assert.equal(r, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
    test('"abc" için NIST test vektörü', async () => {
        const r = await Utils.sha256('abc');
        assert.equal(r, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
    test('Node crypto ile karşılaştır', async () => {
        const data = 'audit-log-payload-123';
        const r = await Utils.sha256(data);
        const expected = crypto.createHash('sha256').update(data).digest('hex');
        assert.equal(r, expected);
    });
    test('64 karakter hex', async () => {
        const r = await Utils.sha256('anything');
        assert.match(r, /^[0-9a-f]{64}$/);
    });
});

describe('Utils.parseTimestamp', () => {
    test('YYYY-MM-DD formatı', () => {
        const d = Utils.parseTimestamp('2024-03-15', '10:30:00');
        assert.ok(d instanceof Date);
        assert.equal(d.getFullYear(), 2024);
        assert.equal(d.getMonth(), 2); // March
        assert.equal(d.getDate(), 15);
        assert.equal(d.getHours(), 10);
        assert.equal(d.getMinutes(), 30);
    });
    test('DD-MM-YYYY varsayılan formatı', () => {
        const d = Utils.parseTimestamp('15-03-2024', '10:30');
        assert.equal(d.getFullYear(), 2024);
        assert.equal(d.getMonth(), 2);
        assert.equal(d.getDate(), 15);
    });
    test('DD.MM.YYYY (nokta ayraçlı)', () => {
        const d = Utils.parseTimestamp('15.03.2024', '08:15');
        assert.equal(d.getFullYear(), 2024);
        assert.equal(d.getMonth(), 2);
        assert.equal(d.getDate(), 15);
    });
    test('MM/DD/YYYY format hint ile', () => {
        const d = Utils.parseTimestamp('03/15/2024', '10:30', 'MM/DD/YYYY');
        assert.equal(d.getFullYear(), 2024);
        assert.equal(d.getMonth(), 2);
        assert.equal(d.getDate(), 15);
    });
    test('2 haneli yıl → 2000+', () => {
        const d = Utils.parseTimestamp('15-03-24', '10:30');
        assert.equal(d.getFullYear(), 2024);
    });
    test('boş string → null', () => {
        assert.equal(Utils.parseTimestamp('', '10:30'), null);
    });
    test('saat yoksa 00:00:00', () => {
        const d = Utils.parseTimestamp('15-03-2024', '');
        assert.equal(d.getHours(), 0);
        assert.equal(d.getMinutes(), 0);
    });
});

describe('Utils.resolveDateFormat (dedektörsüz — eski varyans yedeği)', () => {
    test('YYYY-MM-DD direkt tanınır', () => {
        const r = Utils.resolveDateFormat(['2024-01-01', '2024-01-02', '2024-01-03']);
        assert.equal(r, 'YYYY-MM-DD');
    });
    test('Türk formatı (gün varyansı yüksek) → DD.MM.YYYY', () => {
        // İlk parça (gün) 1..28 arası varyans yüksek, ikinci parça (ay) sabit
        const dates = [];
        for (let d = 1; d <= 28; d++) dates.push(`${d}.03.2024`);
        const r = Utils.resolveDateFormat(dates);
        assert.equal(r, 'DD.MM.YYYY');
    });
    test('Az veriyle null döner', () => {
        const r = Utils.resolveDateFormat(['01.01.2024']);
        assert.equal(r, null);
    });
});

describe('Utils.resolveDateFormatDetailed — tek çözücü delegasyonu (Faz 2)', () => {
    // Aynı vm context'e dedektörü de yükleyerek tarayıcı senaryosunu kurarız
    const ctx = loadBrowserModules(
        ['../date-format-detector.js', 'utils.js'],
        ['DateFormatDetector', 'Utils']
    );
    const U = ctx.Utils;

    test('dedektör global olarak görünür', () => {
        assert.ok(ctx.DateFormatDetector);
        assert.equal(typeof ctx.DateFormatDetector.detect, 'function');
    });

    test('TR tarihleri (gün > 12) → DMY, oylama, kesin', () => {
        const r = U.resolveDateFormatDetailed(['15.03.2024 10:30', '16.03.2024 11:30', '17.03.2024 12:30']);
        assert.equal(r.format, 'DMY');
        assert.equal(r.formatHint, 'DD.MM.YYYY');
        assert.equal(r.method, 'voting');
        assert.equal(r.ambiguous, false);
    });

    test('US tarihleri → MDY / MM.DD.YYYY ipucu', () => {
        const r = U.resolveDateFormatDetailed(['03/15/2024', '03/16/2024', '03/17/2024']);
        assert.equal(r.format, 'MDY');
        assert.equal(r.formatHint, 'MM.DD.YYYY');
    });

    test('ISO tarihleri → YMD / YYYY-MM-DD ipucu', () => {
        const r = U.resolveDateFormatDetailed(['2024-03-15', '2024-03-16', '2024-03-17']);
        assert.equal(r.format, 'YMD');
        assert.equal(r.formatHint, 'YYYY-MM-DD');
    });

    test('tüm günler ≤12 ama ardışık → delta testi DMY çözer', () => {
        const dates = [];
        for (let d = 1; d <= 12; d++) dates.push(`${String(d).padStart(2, '0')}.03.2024`);
        const r = U.resolveDateFormatDetailed(dates);
        assert.equal(r.format, 'DMY');
        assert.equal(r.method, 'delta');
        assert.equal(r.ambiguous, false);
    });

    test('tek günlük belirsiz veri → DMY varsayılan + ambiguous bayrağı', () => {
        const r = U.resolveDateFormatDetailed(['05.03.2024', '05.03.2024', '05.03.2024']);
        assert.equal(r.format, 'DMY');
        assert.equal(r.ambiguous, true);
        // Geriye uyumlu sözleşme: belirsizlikte resolveDateFormat null döner
        assert.equal(U.resolveDateFormat(['05.03.2024', '05.03.2024', '05.03.2024']), null);
    });
});

describe('Utils.parseCSV', () => {
    test('basit CSV parse', () => {
        const csv = 'tarih,saat,sicaklik\n2024-01-01,10:00,5.2\n2024-01-01,10:15,5.4';
        const r = Utils.parseCSV(csv);
        assert.equal(r.headers.length, 3);
        assert.equal(r.data.length, 2);
        assert.equal(r.data[0].sicaklik, '5.2');
    });
    test('Windows satır sonu (CRLF) çalışır', () => {
        const csv = 'a,b\r\n1,2\r\n3,4';
        const r = Utils.parseCSV(csv);
        assert.equal(r.data.length, 2);
    });
});

describe('Utils.getFileType', () => {
    test('xlsx → excel', () => assert.equal(Utils.getFileType('rapor.xlsx'), 'excel'));
    test('pdf → pdf', () => assert.equal(Utils.getFileType('belge.PDF'), 'pdf'));
    test('jpg → image', () => assert.equal(Utils.getFileType('foto.jpg'), 'image'));
    test('bilinmeyen → other', () => assert.equal(Utils.getFileType('a.xyz'), 'other'));
});

describe('Utils.sampleRows — baş/orta/son örneklemi (Faz 3 HITL)', () => {
    const mk = n => Array.from({ length: n }, (_, i) => ({ v: i }));

    test('boş/geçersiz girdi → boş dizi', () => {
        assert.equal(Utils.sampleRows([]).length, 0);
        assert.equal(Utils.sampleRows(null).length, 0);
        assert.equal(Utils.sampleRows(undefined).length, 0);
    });

    test('n veya daha az satır → hepsi sırayla döner', () => {
        const out = Utils.sampleRows(mk(7), 10);
        assert.equal(out.length, 7);
        assert.equal(JSON.stringify(out.map(s => s.index)), JSON.stringify([0, 1, 2, 3, 4, 5, 6]));
        assert.equal(out[3].row.v, 3);
    });

    test('büyük dizide tam n örnek, sıralı ve tekrarsız', () => {
        const out = Utils.sampleRows(mk(1000), 10);
        assert.equal(out.length, 10);
        const idx = out.map(s => s.index);
        assert.equal(JSON.stringify(idx), JSON.stringify([...idx].sort((a, b) => a - b)));
        assert.equal(new Set(idx).size, 10);
    });

    test('baş, orta ve son bölgelerden örnek alır', () => {
        const out = Utils.sampleRows(mk(1000), 10);
        const idx = out.map(s => s.index);
        // baş: ilk 3 satır
        assert.ok(idx.includes(0) && idx.includes(1) && idx.includes(2));
        // son: son 3 satır
        assert.ok(idx.includes(999) && idx.includes(998) && idx.includes(997));
        // orta: 0.25–0.75 bandından en az bir örnek
        assert.ok(idx.some(i => i >= 250 && i <= 750), `orta bölge örneklenmedi: ${idx}`);
    });

    test('index, row ile tutarlı (kaynak satıra geri izlenebilir)', () => {
        const rows = mk(500);
        for (const s of Utils.sampleRows(rows, 10)) {
            assert.equal(s.row, rows[s.index]);
        }
    });

    test('sınır: dizi tam n+1 uzunluğunda olsa da tekrarsız n örnek döner', () => {
        const out = Utils.sampleRows(mk(11), 10);
        assert.equal(out.length, 10);
        assert.equal(new Set(out.map(s => s.index)).size, 10);
    });
});
