/**
 * Altın Korpus Regresyon Testi (Faz 6)
 *
 * tests/fixtures/ altındaki gerçek logger formatı örneklerini uçtan-uca
 * parser zincirinden geçirir ve beklenen normalize seriyle karşılaştırır.
 * Parser'a dokunan her değişiklik bunlara karşı koşar — format işinde tek
 * güvenilir ilerleme ölçüsü budur.
 *
 *  - structured/: CSV metni → Utils.parseCSV → DataParser.standardize
 *  - ocr/:        Gemini yanıtı → server parseStructured/Markdown + smartDateResolve
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBrowserModules } = require('./helpers/load-browser-module');

const FIX = path.join(__dirname, 'fixtures');
const loadJson = dir => fs.existsSync(path.join(FIX, dir))
    ? fs.readdirSync(path.join(FIX, dir)).filter(f => f.endsWith('.json'))
        .map(f => ({ file: f, data: JSON.parse(fs.readFileSync(path.join(FIX, dir, f), 'utf8')) }))
    : [];

// ─── YAPISAL YOL (CSV/Excel) ────────────────────────────────
const { Utils, DataParser } = loadBrowserModules(
    ['../date-format-detector.js', 'confidence.js', 'format-fingerprint.js', 'utils.js', 'data-parser.js'],
    ['DateFormatDetector', 'ConfidenceScore', 'FormatFingerprint', 'Utils', 'DataParser']
);

describe('Korpus — yapısal yol (CSV/Excel uçtan uca)', () => {
    for (const { file, data: fx } of loadJson('structured')) {
        test(`${fx.name} [${file}]`, async () => {
            const { headers, data } = Utils.parseCSV(fx.csv, fx.delimiter || ',');
            const result = await DataParser.standardize(
                { headers, rows: data },
                null,
                { resampling: false, sourcePath: 'csv', columnMapping: fx.columnMapping || undefined }
            );
            const series = result.data;
            const exp = fx.expected;

            assert.equal(series.length, exp.rowCount, 'kayıt sayısı');

            const first = series[0];
            assert.equal(first.temperature, exp.first.temp, 'ilk sıcaklık');
            assert.equal(new Date(first.timestamp).getTime(), new Date(exp.first.iso).getTime(), 'ilk timestamp');

            const last = series[series.length - 1];
            assert.equal(last.temperature, exp.last.temp, 'son sıcaklık');
            assert.equal(new Date(last.timestamp).getTime(), new Date(exp.last.iso).getTime(), 'son timestamp');

            const det = result.metadata.extraction && result.metadata.extraction.dateFormat;
            if (exp.dateFormat) assert.equal(det && det.format, exp.dateFormat, 'tarih formatı');
            if (typeof exp.ambiguous === 'boolean') assert.equal(!!(det && det.ambiguous), exp.ambiguous, 'belirsizlik');
        });
    }
});

// ─── OCR YOLU (Gemini yanıtı → parser) ──────────────────────
const server = require('../server');

describe('Korpus — OCR yolu (yapılandırılmış JSON + markdown)', () => {
    for (const { file, data: fx } of loadJson('ocr')) {
        test(`${fx.name} [${file}]`, () => {
            const parsed = fx.mode === 'json'
                ? server.parseStructuredResponse(fx.response)
                : server.parseMarkdownResponse(fx.response);
            const exp = fx.expected;

            assert.equal(parsed.readings.length, exp.rowCount, 'okuma sayısı');

            // smartDateResolve readings[i].date alanını doldurur ve format döndürür
            const detection = server.smartDateResolve(parsed.readings);
            assert.equal(parsed.readings[0].date, exp.firstISO, 'ilk normalize tarih (YYYY-MM-DD)');
            if (exp.dateFormat) assert.equal(detection.format, exp.dateFormat, 'tarih formatı');
        });
    }
});

// ─── server parser birim doğrulamaları (Faz 5) ──────────────
describe('parseStructuredResponse — yapılandırılmış JSON çıkarımı', () => {
    test('code-block sargılı JSON da çözülür', () => {
        const r = server.parseStructuredResponse('```json\n{"readings":[{"date":"01.03.2026","time":"10:00","temperature":4.5,"confidence":0.9}]}\n```');
        assert.equal(r.readings.length, 1);
        assert.equal(r.readings[0].temperature, 4.5);
    });

    test('readings dizisi yoksa fırlatır (markdown yedeğine düşsün diye)', () => {
        assert.throws(() => server.parseStructuredResponse('{"foo":1}'));
        assert.throws(() => server.parseStructuredResponse('düz metin, JSON değil'));
    });

    test('tarih/sıcaklık çözülemeyen kayıt atlanır, geçerliler kalır', () => {
        const r = server.parseStructuredResponse(JSON.stringify({
            readings: [
                { date: 'GEÇERSİZ', temperature: 4 },
                { date: '02.03.2026', time: '11:00', temperature: 5.1, confidence: 0.95 }
            ]
        }));
        assert.equal(r.readings.length, 1);
        assert.equal(r.readings[0].temperature, 5.1);
    });

    test('virgüllü ondalık sıcaklık sayıya çevrilir', () => {
        const r = server.parseStructuredResponse('{"readings":[{"date":"01.03.2026","temperature":"4,2"}]}');
        assert.equal(r.readings[0].temperature, 4.2);
    });

    test('meta alanları (eczane/marka/totalReadings) okunur', () => {
        const r = server.parseStructuredResponse(JSON.stringify({
            readings: [{ date: '01.03.2026', temperature: 4 }],
            pharmacyName: 'Test Ecz', deviceBrand: 'Elitech', totalReadings: 1
        }));
        assert.equal(r.metadata.pharmacyName, 'Test Ecz');
        assert.equal(r.metadata.deviceBrand, 'Elitech');
        assert.equal(r.aiClaimedTotal, 1);
    });
});

describe('splitRawDate — ortak tarih parçalayıcı', () => {
    // _isISO = "parça sırası >12 kuralıyla kesinleşti; p1=ay, p2=gün"
    test('ilk parça >12 ise sıra kesinleşir ve p1=ay olacak şekilde takas edilir', () => {
        const r = server.splitRawDate('15/03/2026');
        assert.equal(r.y, '2026');
        assert.equal(r.isISO, true);
        assert.equal(r.p1, '03'); // ay
        assert.equal(r.p2, '15'); // gün
    });

    test('belirsiz tarih (her iki parça ≤12) takas edilmez, isISO false', () => {
        const r = server.splitRawDate('05/03/2026');
        assert.equal(r.isISO, false);
        assert.equal(r.p1, '05');
        assert.equal(r.p2, '03');
    });

    test('ISO YYYY-MM-DD doğru parçalanır (gün>12 → sıra kesin)', () => {
        const r = server.splitRawDate('2026-03-15');
        assert.equal(r.y, '2026');
        assert.equal(r.isISO, true);
    });

    test('2 haneli yıl 2000+ olur', () => {
        const r = server.splitRawDate('05.03.26');
        assert.equal(r.y, '2026');
    });
});
