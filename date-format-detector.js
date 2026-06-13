// ============================================================
// date-format-detector.js
// Katmanlı tarih format tespit modülü — TEK TARİH ÇÖZÜCÜ
//
// Hem tarayıcıda (global `DateFormatDetector`) hem Node'da
// (require) çalışır. Diğer tüm tarih çözücüleri buna delege
// eder: Utils.resolveDateFormat (Excel/CSV/PDF hasadı) ve
// server.js smartDateResolve (OCR yolu).
//
// detect(lines) → { format, method, confidence, ambiguous, votes }
//   format:     'DMY' | 'MDY' | 'YMD'
//   method:     'header' | 'voting' | 'delta' | 'default'
//   confidence: 0..1 — tespitin kesinliği
//   ambiguous:  true ise format kanıtla DEĞİL bölgesel varsayılanla
//               seçildi → insan onayını tetikleyen sinyallerden biri
// ============================================================
(function (root, factory) {
    const mod = factory();
    if (typeof module === 'object' && module.exports) module.exports = mod;
    root.DateFormatDetector = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    const REGIONAL_DEFAULT = 'DMY'; // Türkiye / Avrupa

    const DATE_PATTERN = /\b(\d{1,4})[.\-\/](\d{1,2})[.\-\/](\d{1,4})\b/g;
    const TIME_PATTERN = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/;

    // ------------------------------------------------------------
    // 1. YARDIMCI: Parçalara ayır
    // ------------------------------------------------------------
    function splitDateParts(dateStr) {
        const parts = dateStr.split(/[.\-\/]/).filter(Boolean);
        return parts.length === 3 ? parts : null;
    }

    // ------------------------------------------------------------
    // 2. YARDIMCI: Yıl indeksini bul
    // ------------------------------------------------------------
    function findYearIndex(parts) {
        // 4 haneli → kesin yıl
        const idx4 = parts.findIndex(p => /^\d{4}$/.test(p));
        if (idx4 !== -1) return { index: idx4, year: parseInt(parts[idx4]) };

        // > 31 olan parça → kesinlikle yıl (2 haneli: 24 → 2024)
        const idxOver = parts.findIndex(p => parseInt(p) > 31);
        if (idxOver !== -1) {
            const y = parseInt(parts[idxOver]);
            return { index: idxOver, year: y < 100 ? 2000 + y : y };
        }

        // Son çare: son parçayı yıl say (DD-MM-YY)
        const y = parseInt(parts[2]);
        return { index: 2, year: y < 100 ? 2000 + y : y };
    }

    // ------------------------------------------------------------
    // 3. YARDIMCI: Tek örnekten format tahmini (> 12 kuralı)
    // ------------------------------------------------------------
    function guessFormatFromSingle(dateStr) {
        const parts = splitDateParts(dateStr);
        if (!parts) return null;

        const { index: yIdx } = findYearIndex(parts);
        const remaining = parts.filter((_, i) => i !== yIdx);
        const a = parseInt(remaining[0]);
        const b = parseInt(remaining[1]);

        // Temel Ay-Gün geçerlilik kontrolü
        if (a < 1 || a > 31 || b < 1 || b > 31) return null;

        if (yIdx === 0) {
            // YMD: [Year, Month, Day] -> Month (a) <= 12 olmalı
            if (a <= 12) return 'YMD';
            return null;
        }

        // Yıl sonda → ilk iki parça gün/ay
        if (a > 12 && b <= 12) return 'DMY'; // ilk parça kesinlikle gün
        if (b > 12 && a <= 12) return 'MDY'; // ikinci parça kesinlikle gün
        return null;                          // her ikisi de ≤ 12 → belirsiz
    }

    // ------------------------------------------------------------
    // 4. YARDIMCI: String → ISO date (format bilgisiyle)
    // ------------------------------------------------------------
    function parseDate(dateStr, format) {
        const parts = splitDateParts(dateStr);
        if (!parts) return null;

        const { index: yIdx, year } = findYearIndex(parts);
        const remaining = parts.filter((_, i) => i !== yIdx);

        let day, month;
        if (format === 'YMD') {
            // YMD'de remaining[0]=ay, remaining[1]=gün
            month = parseInt(remaining[0]);
            day   = parseInt(remaining[1]);
        } else if (format === 'DMY') {
            day   = parseInt(remaining[0]);
            month = parseInt(remaining[1]);
        } else { // MDY
            month = parseInt(remaining[0]);
            day   = parseInt(remaining[1]);
        }

        if (!day || !month || day > 31 || month > 12) return null;

        return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }

    // ------------------------------------------------------------
    // 5. KATMAN 1: Oylama (> 12 kuralı)
    // ------------------------------------------------------------
    function collectVotes(lines, sampleSize = 200) {
        const votes = { DMY: 0, MDY: 0, YMD: 0 };
        let sampled = 0;

        for (const line of lines) {
            if (sampled >= sampleSize) break;
            // matchAll expects a global regex
            const matches = [...line.matchAll(new RegExp(DATE_PATTERN, 'g'))];
            for (const m of matches) {
                const guess = guessFormatFromSingle(m[0]);
                if (guess) { votes[guess]++; sampled++; }
            }
        }

        const total = Object.values(votes).reduce((a, b) => a + b, 0);
        const top   = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];

        return {
            votes,
            total,
            topFormat:    top[0],
            confidence:   total > 0 ? top[1] / total : 0,
            isConclusive: total > 0 && (top[1] / total) >= 0.7
        };
    }

    // ------------------------------------------------------------
    // 6. KATMAN 2: Gün sınırı delta testi
    // ------------------------------------------------------------
    function runDeltaTest(lines, format, sampleSize = 300) {
        // Tüm tarihleri parse et (sadece gün kısmı, saat yok)
        const isoDates = [];

        for (const line of lines) {
            if (isoDates.length >= sampleSize) break;
            const m = line.match(DATE_PATTERN);
            if (!m) continue;
            const iso = parseDate(m[0], format);
            if (iso) isoDates.push(iso);
        }

        // Ardışık farklı günleri bul (gün sınırı geçişleri)
        const boundaries = [];
        for (let i = 1; i < isoDates.length; i++) {
            if (isoDates[i] !== isoDates[i - 1]) {
                boundaries.push({
                    prev: isoDates[i - 1],
                    next: isoDates[i]
                });
            }
        }

        // Tek gün verisi → delta testi anlamsız
        if (boundaries.length === 0) return null;

        // Her gün geçişinde delta hesapla, beklenmedik atlamaları say
        let badScore = 0;
        for (const { prev, next } of boundaries) {
            const deltaDays = (new Date(next) - new Date(prev)) / 86400000;

            if (deltaDays < 0)   badScore += 10; // geriye gitti → format yanlış
            if (deltaDays > 7)   badScore += 5;  // haftalık atlama şüpheli
            if (deltaDays > 30)  badScore += 20; // aylık atlama → format kesinlikle yanlış
        }

        return {
            score:          badScore,
            boundaryCount:  boundaries.length,
            // debug için ilk birkaç geçiş
            sample:         boundaries.slice(0, 3)
        };
    }

    // ------------------------------------------------------------
    // 7. KATMAN 3: Header / ilk satır analizi
    // ------------------------------------------------------------
    function checkHeaderHints(lines, checkCount = 5) {
        const EXPLICIT = {
            DMY: /\bDD[.\-\/]MM[.\-\/](YYYY?|YY)\b/i,
            MDY: /\bMM[.\-\/]DD[.\-\/](YYYY?|YY)\b/i,
            YMD: /\b(YYYY?|YY)[.\-\/]MM[.\-\/]DD\b/i,
        };

        for (const line of lines.slice(0, checkCount)) {
            for (const [fmt, re] of Object.entries(EXPLICIT)) {
                if (re.test(line)) return fmt;
            }
        }
        return null;
    }

    // ------------------------------------------------------------
    // 8. ANA FONKSİYON (ayrıntılı sonuç)
    // ------------------------------------------------------------
    function detect(lines) {
        if (!lines || lines.length === 0) {
            return { format: REGIONAL_DEFAULT, method: 'default', confidence: 0, ambiguous: true, votes: null };
        }

        // Katman 0: Header kontrolü (en güvenilir)
        const headerHint = checkHeaderHints(lines);
        if (headerHint) {
            console.log(`📅 Format header'dan tespit edildi: ${headerHint}`);
            return { format: headerHint, method: 'header', confidence: 1, ambiguous: false, votes: null };
        }

        // Katman 1: Oylama
        const voting = collectVotes(lines);
        console.log(`📊 Oylama: ${JSON.stringify(voting.votes)} | güven: ${(voting.confidence * 100).toFixed(0)}%`);

        if (voting.isConclusive) {
            console.log(`✅ Format oylama ile tespit: ${voting.topFormat}`);
            return { format: voting.topFormat, method: 'voting', confidence: voting.confidence, ambiguous: false, votes: voting.votes };
        }

        // Katman 2: Delta testi (tüm format adayları için)
        console.log('⚠️  Oy belirsiz, delta testi başlıyor...');

        const deltaResults = {};
        for (const fmt of ['DMY', 'MDY', 'YMD']) {
            deltaResults[fmt] = runDeltaTest(lines, fmt);
        }

        const candidates = Object.entries(deltaResults)
            .filter(([_, r]) => r !== null)
            .sort((a, b) => a[1].score - b[1].score);

        if (candidates.length > 0) {
            console.log('📊 Delta sonuçları:');
            for (const [fmt, r] of Object.entries(deltaResults)) {
                if (r) console.log(`   ${fmt}: skor=${r.score}, sınır=${r.boundaryCount}, örnek=${JSON.stringify(r.sample)}`);
                else   console.log(`   ${fmt}: tek gün verisi`);
            }

            const best = candidates[0];
            const tied = candidates.filter(([_, r]) => r.score === best[1].score);

            if (tied.length === 1) {
                console.log(`✅ Format delta testi ile tespit: ${best[0]}`);
                return { format: best[0], method: 'delta', confidence: 0.75, ambiguous: false, votes: voting.votes };
            }

            // Delta skorları eşit → kanıt yetersiz, bölgesel varsayılana eğil
            const preferred = tied.find(([fmt]) => fmt === REGIONAL_DEFAULT);
            const chosen = preferred ? preferred[0] : best[0];
            console.warn(`⚠️  Delta skorları eşit → format belirsiz, varsayılan: ${chosen}`);
            return { format: chosen, method: 'delta', confidence: 0.4, ambiguous: true, votes: voting.votes };
        }

        // Katman 3: Tüm veri tek gün → karar veremiyoruz
        const fallback = voting.total > 0 ? voting.topFormat : REGIONAL_DEFAULT;
        console.warn(`⚠️  Tek günlük veri, format tespit edilemedi → varsayılan: ${fallback}`);
        return { format: fallback, method: 'default', confidence: 0.3, ambiguous: true, votes: voting.votes };
    }

    // Geriye uyumlu basit API: yalnızca format string'i döner
    function detectDateFormat(lines) {
        return detect(lines).format;
    }

    // ------------------------------------------------------------
    // 9. DIŞA AKTARIM: getTimestamp factory
    // ------------------------------------------------------------
    function makeGetTimestamp(format) {
        return function getTimestamp(line) {
            if (!line) return 0;

            const dateMatch = line.match(DATE_PATTERN);
            const timeMatch = line.match(TIME_PATTERN);
            if (!dateMatch) return 0;

            const isoDate = parseDate(dateMatch[0], format);
            if (!isoDate) return 0;

            const h = timeMatch?.[1]?.padStart(2, '0') ?? '00';
            const m = timeMatch?.[2] ?? '00';
            const s = timeMatch?.[3] ?? '00';

            const dt = new Date(`${isoDate}T${h}:${m}:${s}`);
            return isNaN(dt.getTime()) ? 0 : dt.getTime();
        };
    }

    return { detect, detectDateFormat, makeGetTimestamp, parseDate, REGIONAL_DEFAULT };
});
