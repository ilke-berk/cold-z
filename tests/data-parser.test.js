const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers/load-browser-module');

const { DataParser } = loadBrowserModules(
    ['utils.js', 'data-parser.js'],
    ['Utils', 'DataParser']
);

describe('DataParser.findHeaderRow — başlık satırı tespiti', () => {
    test('üstte meta blok varsa başlık satırını bulur', () => {
        const grid = [
            ['Cihaz Adı', 'TLOG-23'],
            ['Seri No', 'SN12345'],
            [''],
            ['Tarih', 'Saat', 'Sıcaklık (°C)'],
            ['15.03.2024', '10:30', '5,2'],
            ['15.03.2024', '11:30', '5,4'],
        ];
        assert.equal(DataParser.findHeaderRow(grid), 3);
    });

    test('klasik dosyada 1. satır başlıktır', () => {
        const grid = [
            ['Tarih', 'Sıcaklık'],
            ['15.03.2024', '5,2'],
            ['15.03.2024', '5,3'],
        ];
        assert.equal(DataParser.findHeaderRow(grid), 0);
    });

    test('İngilizce başlıklar da tanınır', () => {
        const grid = [
            ['Logger Report'],
            ['Date', 'Time', 'Temperature'],
            ['03/15/2024', '10:30', '5.2'],
        ];
        assert.equal(DataParser.findHeaderRow(grid), 1);
    });
});

describe('DataParser.buildTimestamp — tarih sütunu yoksa veri uydurmaz', () => {
    test('dateCol yoksa null döner (new Date() değil)', () => {
        const ts = DataParser.buildTimestamp({ 'Sıcaklık': '5,2' }, { dateCol: null, timeCol: null });
        assert.equal(ts, null);
    });
});

describe('DataParser.standardize — eksik sütunlarda hata fırlatır', () => {
    test('tarih sütunu bulunamazsa anlaşılır hata verir', async () => {
        await assert.rejects(
            DataParser.standardize({ headers: ['Sıcaklık'], rows: [{ 'Sıcaklık': '5,2' }] }, null, { resampling: false }),
            /Tarih sütunu bulunamadı/
        );
    });

    test('sıcaklık sütunu bulunamazsa anlaşılır hata verir', async () => {
        await assert.rejects(
            DataParser.standardize({ headers: ['Tarih'], rows: [{ 'Tarih': '15.03.2024' }] }, null, { resampling: false }),
            /Sıcaklık sütunu bulunamadı/
        );
    });
});

describe('DataParser.standardize — kullanıcı sütun eşleştirmesi uygulanır', () => {
    test('columnMapping verildiğinde otomatik tespit yerine kullanılır', async () => {
        const rawData = {
            headers: ['Zaman', 'Deger'],
            rows: [
                { 'Zaman': '15.03.2024 10:30', 'Deger': '5,2' },
                { 'Zaman': '15.03.2024 11:30', 'Deger': '5,4' },
                { 'Zaman': '15.03.2024 12:30', 'Deger': '5,1' },
            ]
        };
        const res = await DataParser.standardize(rawData, null, {
            resampling: false,
            columnMapping: { dateCol: 'Zaman', timeCol: '', tempCol: 'Deger', humidityCol: '' }
        });
        assert.equal(res.data.length, 3);
        assert.equal(res.data[0].temperature, 5.2);
        assert.equal(res.data[0].timestamp.getDate(), 15);
        assert.equal(res.data[0].timestamp.getMonth(), 2); // Mart
    });
});

describe('DataParser.standardize — IR + güven skoru (Faz 2)', () => {
    // Tarayıcı senaryosu: dedektör + güven skoru modülleri de yüklü
    const full = loadBrowserModules(
        ['../date-format-detector.js', 'confidence.js', 'utils.js', 'data-parser.js'],
        ['DateFormatDetector', 'ConfidenceScore', 'Utils', 'DataParser']
    );
    const DP = full.DataParser;

    function makeRawData(dayCount = 15) {
        const rows = [];
        for (let d = 1; d <= dayCount; d++) {
            rows.push({
                'Tarih': `${String(d).padStart(2, '0')}.03.2024`,
                'Saat': '10:30',
                'Sıcaklık': '5,2'
            });
        }
        return { headers: ['Tarih', 'Saat', 'Sıcaklık'], rows };
    }

    test('metadata.extraction belge düzeyi IR bloğunu içerir', async () => {
        const res = await DP.standardize(makeRawData(), null, { resampling: false });
        const ext = res.metadata.extraction;
        assert.ok(ext, 'extraction bloğu yok');
        assert.equal(ext.sourcePath, 'structured');
        assert.equal(ext.totalCandidates, 15);
        assert.equal(ext.skippedRows, 0);
        assert.equal(ext.parsedRows, 15);
        assert.ok(ext.dateFormat);
        assert.equal(ext.dateFormat.format, 'DMY');
        assert.equal(ext.dateFormat.ambiguous, false);
    });

    test('temiz veri yüksek güven skoru alır, pipeline loguna yazılır', async () => {
        const res = await DP.standardize(makeRawData(), null, { resampling: false });
        const conf = res.metadata.extraction.confidence;
        assert.ok(conf, 'güven skoru hesaplanmamış');
        assert.equal(conf.score, 100);
        assert.equal(conf.needsReview, false);
        assert.ok(res.pipelineLog.some(l => l.step === 'Güven Skoru'));
    });

    test('IR satır şekli: rowIndex + confidence', async () => {
        const res = await DP.standardize(makeRawData(3), null, { resampling: false });
        assert.equal(res.data[0].confidence, 1);
        assert.equal(typeof res.data[0].rowIndex, 'number');
    });

    test('belirsiz tarih formatı insan incelemesi bayrağı kaldırır', async () => {
        // Tek gün, tüm parçalar ≤12 → format kanıtlanamaz
        const rows = [
            { 'Tarih': '05.03.2024', 'Saat': '10:00', 'Sıcaklık': '5,1' },
            { 'Tarih': '05.03.2024', 'Saat': '11:00', 'Sıcaklık': '5,2' },
            { 'Tarih': '05.03.2024', 'Saat': '12:00', 'Sıcaklık': '5,3' },
        ];
        const res = await DP.standardize({ headers: ['Tarih', 'Saat', 'Sıcaklık'], rows }, null, { resampling: false });
        const ext = res.metadata.extraction;
        assert.equal(ext.dateFormat.ambiguous, true);
        assert.equal(ext.confidence.needsReview, true);
    });
});

describe('DataParser.parseDate — format ipucu', () => {
    test('MM.DD.YYYY ipucu ile gün/ay doğru yorumlanır', () => {
        const d = DataParser.parseDate('03/15/2024', 'MM.DD.YYYY');
        assert.ok(d);
        assert.equal(d.getMonth(), 2);
        assert.equal(d.getDate(), 15);
    });

    test('ipucu yoksa varsayılan DMY', () => {
        const d = DataParser.parseDate('05/03/2024');
        assert.ok(d);
        assert.equal(d.getDate(), 5);
        assert.equal(d.getMonth(), 2);
    });
});
