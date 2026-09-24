const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/source-locate.js');

const ms = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();

describe('source-locate — belgede sapma yeri', () => {
    test('PDF satırları: aralıktaki satırlar ve tepe değer bulunur', () => {
        const units = [
            { text: 'Farmakit Rapor FR02 — Cihaz 5386' },
            { text: '14.09.2026 12:50 5,1 °C' },
            { text: '14.09.2026 13:00 8,6 °C' },
            { text: '14.09.2026 13:10 9,4 °C' },
            { text: '14.09.2026 13:20 8,2 °C' },
            { text: '14.09.2026 13:30 6,0 °C' },
        ];
        const r = L.locateAuto(units, ms(2026, 9, 14, 13, 0), ms(2026, 9, 14, 13, 20), 9.4);
        assert.deepEqual(r.hits, [2, 3, 4]);
        assert.deepEqual(r.peakHits, [3]);
    });

    test('tarihsiz saat satırları üstteki tarihi devralır; gün sınırı', () => {
        const units = [{ text: 'Tarih: 01/09/2026' }, { text: '23:50  7.9' }, { text: 'Tarih: 02/09/2026' }, { text: '00:00  8.3' }, { text: '00:10  8.1' }];
        const r = L.locateAuto(units, ms(2026, 9, 2, 0, 0), ms(2026, 9, 2, 0, 10), 8.3);
        assert.deepEqual(r.hits, [3, 4]);
        assert.deepEqual(r.peakHits, [3]);
    });

    test('"24:00" gün sonu = ertesi gün 00:00 (Farmakit raporlarında görülen biçim)', () => {
        const units = [{ text: '2026-09-05 20:00 6.63' }, { text: '2026-09-05 24:00 6.11' }, { text: '2026-09-06 04:00 7.36' }];
        assert.deepEqual(L.locateAuto(units, ms(2026, 9, 6, 0, 0), ms(2026, 9, 6, 0, 0), 6.11).hits, [1]);
        assert.equal(L.parseTime('24:30'), null);
    });

    test('Excel hücreleri: Date tarih + ayrı saat hücresi', () => {
        const units = [
            { text: '', cells: ['Tarih', 'Saat', 'Sıcaklık'] },
            { text: '', cells: [new Date(2026, 8, 14), new Date(1899, 11, 30, 13, 0), 8.6] },
            { text: '', cells: [new Date(2026, 8, 14), new Date(1899, 11, 30, 14, 0), 5.0] },
        ];
        assert.deepEqual(L.locateAuto(units, ms(2026, 9, 14, 13, 0), ms(2026, 9, 14, 13, 0), 8.6).hits, [1]);
    });

    test('ABD biçimi (ay/gün) dmy ile bulunamazsa mdy denenir', () => {
        const units = [{ text: '09/14/2026 13:00 9.0' }, { text: '09/03/2026 13:00 4.0' }];
        const r = L.locateAuto(units, ms(2026, 9, 3, 13, 0), ms(2026, 9, 3, 13, 0), 4.0);
        assert.equal(r.order, 'mdy');
        assert.deepEqual(r.hits, [1]);
    });

    test('eşleşme yoksa en yakın satır önerilir; ondalık sayılar saat sanılmaz', () => {
        const units = [{ text: '14.09.2026 10:00 4.5' }, { text: '14.09.2026 18:00 4,7' }];
        const r = L.locateAuto(units, ms(2026, 9, 14, 17, 0), ms(2026, 9, 14, 17, 30), 9);
        assert.deepEqual(r.hits, []);
        assert.equal(r.nearest, 1);
        assert.equal(L.parseTime('sıcaklık 4.5 derece'), null);
    });

    test('PDF text item gruplama: aynı y bir satır, üstten alta sıra', () => {
        const lines = L.groupLines([{ str: '5,1', x: 200, y: 700 }, { str: '14.09.2026 12:50', x: 50, y: 701 }, { str: 'Başlık', x: 50, y: 760 }]);
        assert.deepEqual(lines.map(l => l.text), ['Başlık', '14.09.2026 12:50 5,1']);
    });
});
