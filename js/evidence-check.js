/**
 * ColdChain AI — Kanıt Kontrolü (Tier 0 doğrulama)
 *
 * "Hiçbir çıkarıcıya körü körüne güvenme" mimarisinin ücretsiz katmanı:
 * çıkarılan her sıcaklık, kaynağı olan ham satırda BAĞIMSIZ bir sayı
 * tokeni olarak gerçekten bulunmalıdır. Yanlış şemayla kesir kırpma
 * (5.94 → 94), yanlış sütun seçimi ve benzeri sistematik okuma hataları
 * bu kontrole yakalanır: "94", "5.94"ün içinde geçer ama bağımsız token
 * değildir.
 *
 * Ek olarak zaman tutarlılığı denetlenir: belgeye hakim örnekleme
 * aralığının çok dışına düşen satırlar (tarih/saat okuma hatası işareti)
 * sayılır.
 *
 * Saf modül — DOM yok, ağ yok; hem tarayıcıda hem test vm'inde çalışır.
 */
const EvidenceCheck = (function () {

    // toFixed(2) yuvarlamalarını tolere eder (5.944 ≈ 5.94), 5.9 ≠ 5.94.
    const TOLERANCE = 0.005;

    // Zaman aykırısı eşiği: en yakın komşuya uzaklık bu sınırı aşarsa
    // satır belgenin kendi zaman dokusunun dışındadır.
    const OUTLIER_MIN_HOURS = 48;
    const OUTLIER_INTERVAL_FACTOR = 30;

    function normalize(raw) {
        return String(raw || '')
            .replace(/−/g, '-')   // Unicode eksi → ASCII
            .replace(/ /g, ' ');  // NBSP → boşluk
    }

    /**
     * Ham satırdaki BAĞIMSIZ sayı tokenlerini döndürür (normalize float).
     * Tarih (02.07.2026), saat (00:31) ve ISO tarih (2026-07-02) parçaları
     * sınır kurallarıyla elenir; ondalık virgül/nokta eşdeğer sayılır.
     */
    function extractStandaloneNumbers(rawText) {
        const s = normalize(rawText);
        const out = [];
        const re = /[+-]?\d+(?:[.,]\d+)?/g;
        let m;
        while ((m = re.exec(s)) !== null) {
            let tok = m[0];
            let start = m.index;
            // Önünde rakam olan işaret gerçek işaret değil, aralık/tarih
            // ayracıdır (2026-07 → "-07" bir sayı değildir) → token elenir.
            if (tok[0] === '-' || tok[0] === '+') {
                if (start > 0 && /\d/.test(s[start - 1])) continue;
            }
            const end = start + tok.length;
            const prev = start > 0 ? s[start - 1] : '';
            const next = end < s.length ? s[end] : '';
            const next2 = end + 1 < s.length ? s[end + 1] : '';
            // Sol sınır: rakam ya da ayraç (., : ,) bitişiğinde başlayan
            // token daha büyük bir sayının/tarihin parçasıdır.
            if (/[\d.,:]/.test(prev)) continue;
            // Sağ sınır: hemen ardından rakam, ya da "ayraç + rakam"
            // geliyorsa (02.07…, 00:31, 2026-07) token bir parçadır.
            if (/\d/.test(next)) continue;
            if (/[.,:\/-]/.test(next) && /\d/.test(next2)) continue;
            const val = parseFloat(tok.replace(',', '.'));
            if (isFinite(val)) out.push(val);
        }
        return out;
    }

    /** Değer ham satırda bağımsız sayı olarak (±TOLERANCE) geçiyor mu? */
    function valueAppearsStandalone(rawText, value) {
        if (typeof value !== 'number' || !isFinite(value)) return false;
        return extractStandaloneNumbers(rawText)
            .some(t => Math.abs(t - value) < TOLERANCE);
    }

    /**
     * IR satırlarını denetler. rawText'i olmayan satırlar (Excel/CSV
     * hücreleri) cezasız atlanır — kanıt yoksa hüküm de yok.
     * @returns {{checked, missing:[{arrayIndex,rowIndex,temperature,rawText}], skippedNoRaw, missingRatio}}
     */
    function checkRows(rows) {
        const missing = [];
        let checked = 0, skippedNoRaw = 0;
        (rows || []).forEach((row, arrayIndex) => {
            if (!row || typeof row.rawText !== 'string' || !row.rawText.trim()
                || typeof row.temperature !== 'number' || !isFinite(row.temperature)) {
                skippedNoRaw++;
                return;
            }
            checked++;
            if (!valueAppearsStandalone(row.rawText, row.temperature)) {
                missing.push({ arrayIndex, rowIndex: row.rowIndex, temperature: row.temperature, rawText: row.rawText });
            }
        });
        return { checked, missing, skippedNoRaw, missingRatio: missing.length / Math.max(1, checked) };
    }

    /**
     * Zaman tutarlılığı: kronolojik sıralı satırlarda hakim aralığın
     * (mod) çok dışına düşenleri bulur. Normal logger boşlukları
     * (cihaz kapalı kalmış vb.) validateData'nın işidir; buradaki eşik
     * yalnızca "yanlış parse edilmiş tarih" ölçeğindeki kopuşları yakalar.
     * @returns {{dominantIntervalMin, outliers:[{arrayIndex,timestamp,gapMin}], outlierCount}}
     */
    function checkTimestamps(rows) {
        const pts = [];
        (rows || []).forEach((row, arrayIndex) => {
            const t = row && row.timestamp;
            const ms = t instanceof Date ? t.getTime() : (typeof t === 'number' ? t : NaN);
            if (isFinite(ms)) pts.push({ arrayIndex, ms });
        });
        if (pts.length < 5) return { dominantIntervalMin: 0, outliers: [], outlierCount: 0 };

        // Mod aralık (validateData'daki yaklaşımın aynısı)
        const gapCounts = {};
        for (let i = 1; i < pts.length; i++) {
            const gapMin = Math.round((pts[i].ms - pts[i - 1].ms) / 60000);
            gapCounts[gapMin] = (gapCounts[gapMin] || 0) + 1;
        }
        let dominant = 60, maxCount = 0;
        for (const [gap, count] of Object.entries(gapCounts)) {
            if (count > maxCount) { maxCount = count; dominant = parseInt(gap, 10); }
        }

        const thresholdMin = Math.max(OUTLIER_MIN_HOURS * 60, OUTLIER_INTERVAL_FACTOR * Math.max(1, dominant));
        const outliers = [];
        for (let i = 0; i < pts.length; i++) {
            const toPrev = i > 0 ? (pts[i].ms - pts[i - 1].ms) / 60000 : Infinity;
            const toNext = i < pts.length - 1 ? (pts[i + 1].ms - pts[i].ms) / 60000 : Infinity;
            const nearest = Math.min(toPrev, toNext);
            if (nearest > thresholdMin) {
                outliers.push({ arrayIndex: pts[i].arrayIndex, timestamp: pts[i].ms, gapMin: Math.round(nearest) });
            }
        }
        return { dominantIntervalMin: dominant, outliers, outlierCount: outliers.length };
    }

    return { extractStandaloneNumbers, valueAppearsStandalone, checkRows, checkTimestamps, TOLERANCE };
})();
