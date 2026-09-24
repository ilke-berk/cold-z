/**
 * Kaynak belgede sapma yeri bulma (rapor → "Belgede göster").
 *
 * Belgeden çıkarılmış metin birimleri (PDF satırı / tablo satırı) alınır, her birinin
 * zamanı çözülür ve sapmanın [başlangıç, bitiş] aralığına düşenler döndürülür.
 * Ayrıştırıcının iç satır numaralarına güvenmez: sorumlu, belgedeki ASIL satırı görür.
 *
 *   units: [{ text, cells?: any[] }]  — cells varsa (Excel) Date hücreleri doğrudan kullanılır
 *   → indexUnits(units, order) : her birime ts (ms | null); tarihsiz saat satırları önceki tarihi devralır
 *   → locate(indexed, t0, t1, peak) : { hits: [i], peakHits: [i], nearest: i|null }
 *
 * Tarayıcı + Node (test) ortak; bağımlılık yok.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SourceLocate = api;
})(typeof self !== 'undefined' ? self : this, function () {

    const DATE_RE = /\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b|\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/;
    const TIME_RE = /(?:^|[^\d])(\d{1,2}):(\d{2})(?::(\d{2}))?(?![\d])/;

    /** metinden {y,m,d} — order: 'dmy' (TR varsayılan) | 'mdy' */
    function parseDate(text, order) {
        const m = String(text).match(DATE_RE);
        if (!m) return null;
        let y, mo, d;
        if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else {
            const a = +m[4], b = +m[5];
            y = +m[6]; if (y < 100) y += 2000;
            if (order === 'mdy') { mo = a; d = b; } else { d = a; mo = b; }
            if (mo > 12 && d <= 12) { const t = mo; mo = d; d = t; } // açıkça ters yazılmış
        }
        if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
        return { y, mo, d };
    }
    function parseTime(text) {
        const m = String(text).match(TIME_RE);
        if (!m) return null;
        const h = +m[1], mi = +m[2], s = m[3] ? +m[3] : 0;
        // "24:00" bazı cihazlarda gün sonu = ertesi gün 00:00 (Date taşmayı kendisi çözer)
        if ((h > 23 && !(h === 24 && mi === 0 && s === 0)) || mi > 59 || s > 59) return null;
        return { h, mi, s };
    }

    /** Excel hücreleri: Date (tarih veya saat), metin */
    function fromCells(cells, order) {
        let date = null, time = null;
        for (const c of cells || []) {
            if (c instanceof Date && !isNaN(c)) {
                if (c.getFullYear() < 1901) { if (!time) time = { h: c.getHours(), mi: c.getMinutes(), s: c.getSeconds() }; }
                else {
                    if (!date) date = { y: c.getFullYear(), mo: c.getMonth() + 1, d: c.getDate() };
                    if (!time && (c.getHours() || c.getMinutes())) time = { h: c.getHours(), mi: c.getMinutes(), s: c.getSeconds() };
                }
            } else if (c != null && c !== '') {
                const s = String(c);
                if (!date) date = parseDate(s, order);
                if (!time) time = parseTime(s);
            }
        }
        return { date, time };
    }

    function indexUnits(units, order = 'dmy') {
        let carry = null;
        return units.map((u) => {
            const { date, time } = u.cells ? fromCells(u.cells, order) : { date: parseDate(u.text, order), time: parseTime(u.text) };
            if (date) carry = date;
            const d = date || carry;
            const ts = d && time ? new Date(d.y, d.mo - 1, d.d, time.h, time.mi, time.s).getTime() : null;
            return { ...u, ts };
        });
    }

    /** Tepe değerin metinde geçip geçmediği ("9.4", "9,4", "9.40") */
    function peakVariants(peak) {
        if (peak == null || !isFinite(peak)) return [];
        const out = new Set();
        [1, 2].forEach(n => { const s = Number(peak).toFixed(n); out.add(s); out.add(s.replace('.', ',')); });
        return [...out];
    }
    function hasNumber(text, variants) {
        const t = String(text);
        return variants.some(v => new RegExp('(^|[^\\d.,])' + v.replace(/[.,]/g, '[.,]') + '(?![\\d])').test(t));
    }

    /**
     * @param indexed indexUnits çıktısı
     * @param t0,t1   sapma başlangıç/bitiş (ms)
     * @param peak    tepe sıcaklık
     * @param tolMs   kenar toleransı (varsayılan 60 sn)
     */
    function locate(indexed, t0, t1, peak, tolMs = 60000) {
        const hits = [], peakHits = [];
        const pv = peakVariants(peak);
        let nearest = null, best = Infinity;
        indexed.forEach((u, i) => {
            if (u.ts == null) return;
            if (u.ts >= t0 - tolMs && u.ts <= t1 + tolMs) {
                hits.push(i);
                if (pv.length && hasNumber(u.text, pv)) peakHits.push(i);
            } else {
                const dist = Math.min(Math.abs(u.ts - t0), Math.abs(u.ts - t1));
                if (dist < best) { best = dist; nearest = i; }
            }
        });
        return { hits, peakHits, nearest: hits.length ? null : nearest, nearestDistMs: hits.length ? 0 : best };
    }

    /** dmy ile hiç eşleşme yoksa mdy dene (ABD biçimli cihaz raporları) */
    function locateAuto(units, t0, t1, peak) {
        const a = indexUnits(units, 'dmy');
        const ra = locate(a, t0, t1, peak);
        if (ra.hits.length) return { ...ra, indexed: a, order: 'dmy' };
        const b = indexUnits(units, 'mdy');
        const rb = locate(b, t0, t1, peak);
        if (rb.hits.length) return { ...rb, indexed: b, order: 'mdy' };
        return { ...ra, indexed: a, order: 'dmy' };
    }

    /** PDF text items → satırlar (aynı y ±tol). items: [{str, x, y, w, h}] */
    function groupLines(items, tol = 2.5) {
        const lines = [];
        items.filter(it => it.str && it.str.trim()).forEach(it => {
            let L = lines.find(l => Math.abs(l.y - it.y) <= tol);
            if (!L) { L = { y: it.y, items: [] }; lines.push(L); }
            L.items.push(it);
        });
        lines.sort((a, b) => b.y - a.y); // PDF'te y yukarı doğru artar → üstten alta
        return lines.map(l => { l.items.sort((a, b) => a.x - b.x); return { text: l.items.map(i => i.str).join(' '), items: l.items }; });
    }

    return { parseDate, parseTime, indexUnits, locate, locateAuto, groupLines, peakVariants, hasNumber };
});
