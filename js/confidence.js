/**
 * ColdChain AI — Çıkarım Güven Skoru (Faz 2)
 *
 * Dört veri-alım yolunun (Excel/CSV, dijital PDF, metin, OCR) ürettiği
 * ortak ara temsil (IR) sinyallerinden tek bir 0–100 güven skoru hesaplar.
 * Skor eşiğin altındaysa belge insan incelemesine işaretlenir (Faz 3'te
 * zorunlu onay kapısı bu bayrağa bağlanacak).
 *
 * Sinyaller (hepsi opsiyonel; olmayan sinyal cezalandırılmaz):
 *   dateFormat          { format, method, confidence, ambiguous } — tek tarih çözücünün çıktısı
 *   totalCandidates     parse edilmeye aday satır sayısı
 *   parsedRows          başarıyla çıkarılan satır sayısı
 *   skippedRows         tarih/sıcaklık çözülemediği için atlanan satırlar
 *   removedYearOutliers cleanYearOutliers'ın sildiği satırlar
 *   dedupRemoved        mükerrer kayıt temizliği
 *   aiClaimedTotal      AI'nın "ben N satır yazdım" iddiası (OCR yolu)
 *   claimMismatch       iddia ile parse edilen arasındaki fark (OCR yolu)
 *   lowConfidenceCount  OCR'da confidence < 0.75 satır sayısı
 *   rowConfidences      satır bazlı güven dizisi (lowConfidenceCount yoksa kullanılır)
 *   temperatures        sıcaklık dizisi (makullük bandı kontrolü)
 *   forceReview         yukarı akıştan gelen zorunlu inceleme bayrağı
 */
const ConfidenceScore = (function () {

    const REVIEW_THRESHOLD = 70;   // skor bunun altındaysa insan incelemesi önerilir
    const PLAUSIBLE_MIN = -30;     // makul sıcaklık bandı (°C)
    const PLAUSIBLE_MAX = 40;
    const LOW_ROW_CONFIDENCE = 0.75;
    // Örneklemeli QA (Faz 6 / Kademe 4): yüksek güvenli geçen belgelerin
    // ~1/10'u yine de incelemeye düşürülür — parser doğruluğunu ölçer ve
    // zamanla etiketli test korpusu biriktirir.
    const QA_SAMPLE_RATE = 0.1;

    // Deterministik örnekleme: aynı belge aynı oturumda tekrar tekrar
    // rastgele seçilip bırakılmasın diye Math.random yerine id hash'i.
    function hashStr(s) {
        let h = 0;
        const str = String(s || '');
        for (let i = 0; i < str.length; i++) {
            h = ((h * 31) + str.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    }

    function compute(signals = {}) {
        const factors = [];
        let totalDeduction = 0;
        const deduct = (factor, points, detail) => {
            const p = Math.min(100, Math.max(0, Math.round(points)));
            if (p > 0) {
                factors.push({ factor, deduction: p, detail });
                totalDeduction += p;
            }
        };

        const parsedRows = signals.parsedRows || 0;
        const base = Math.max(1, signals.totalCandidates || parsedRows);

        // 1) Tarih-format tespiti kesin miydi? (en tehlikeli hata sınıfı: gün/ay takası)
        const df = signals.dateFormat;
        if (df) {
            if (df.ambiguous) {
                deduct('tarih-formati', 25,
                    `Tarih formatı belirsiz (yöntem: ${df.method || '?'}); bölgesel varsayılan kullanıldı`);
            } else {
                const conf = typeof df.confidence === 'number' ? df.confidence : 1;
                deduct('tarih-formati', (1 - conf) * 15,
                    `Tarih formatı %${Math.round(conf * 100)} güvenle tespit edildi (yöntem: ${df.method || '?'})`);
            }
        } else {
            deduct('tarih-formati', 10, 'Tarih formatı tespiti yapılmadı');
        }

        // 2) Atlanan + silinen satır oranı
        const lost = (signals.skippedRows || 0) + (signals.removedYearOutliers || 0);
        if (lost > 0) {
            deduct('veri-kaybi', Math.min(30, (lost / base) * 100),
                `${lost}/${base} satır atlandı veya yıl filtresinde elendi`);
        }

        // 3) Mükerrer kayıt oranı (hafif sinyal — cihaz çift basmış olabilir)
        if (signals.dedupRemoved > 0) {
            deduct('mukerrer', Math.min(10, (signals.dedupRemoved / base) * 50),
                `${signals.dedupRemoved} mükerrer kayıt temizlendi`);
        }

        // 4) AI iddiası vs parse edilen satır farkı (OCR yolu)
        if (signals.aiClaimedTotal > 0) {
            const mismatch = typeof signals.claimMismatch === 'number'
                ? signals.claimMismatch
                : Math.max(0, signals.aiClaimedTotal - parsedRows);
            if (mismatch > 0) {
                deduct('ai-iddia-farki', Math.min(25, (mismatch / signals.aiClaimedTotal) * 150),
                    `AI ${signals.aiClaimedTotal} satır iddia etti, ${mismatch} satır eksik parse edildi`);
            }
        }

        // 5) Sıcaklık dağılımı makullüğü (−30…+40 bandı)
        const temps = Array.isArray(signals.temperatures)
            ? signals.temperatures.filter(t => typeof t === 'number' && isFinite(t))
            : [];
        if (temps.length > 0) {
            const inBand = temps.filter(t => t >= PLAUSIBLE_MIN && t <= PLAUSIBLE_MAX).length / temps.length;
            if (inBand < 0.9) {
                deduct('sicaklik-makullugu', Math.min(20, (0.9 - inBand) * 100),
                    `Değerlerin yalnızca %${Math.round(inBand * 100)}'i ${PLAUSIBLE_MIN}…${PLAUSIBLE_MAX}°C bandında`);
            }
        }

        // 6) Satır bazlı OCR güveni (confidence < 0.75 oranı)
        let lowConf = typeof signals.lowConfidenceCount === 'number' ? signals.lowConfidenceCount : null;
        if (lowConf === null && Array.isArray(signals.rowConfidences) && signals.rowConfidences.length > 0) {
            lowConf = signals.rowConfidences.filter(c => typeof c === 'number' && c < LOW_ROW_CONFIDENCE).length;
        }
        if (lowConf > 0 && parsedRows > 0) {
            deduct('dusuk-guvenli-satirlar', Math.min(20, (lowConf / parsedRows) * 60),
                `${lowConf}/${parsedRows} satır düşük güvenle (<${LOW_ROW_CONFIDENCE}) okundu`);
        }

        // 7) Çok az veri noktası
        if (parsedRows > 0 && parsedRows < 10) {
            deduct('az-veri', 10, `Yalnızca ${parsedRows} veri noktası — istatistiksel güven düşük`);
        }

        // 8) Yukarı akıştan gelen zorunlu inceleme nedenleri (Faz 4: önerilen
        // şablon, marka çelişkisi...). Skoru düşürmezler ama forceReview ile
        // birlikte gelir ve onay ekranında gerekçe olarak görünmeleri gerekir.
        if (Array.isArray(signals.reviewReasons)) {
            for (const reason of signals.reviewReasons) {
                if (reason) factors.push({ factor: 'zorunlu-inceleme', deduction: 0, detail: String(reason) });
            }
        }

        const score = Math.max(0, Math.min(100, 100 - totalDeduction));
        const needsReview = score < REVIEW_THRESHOLD
            || !!(df && df.ambiguous)
            || !!signals.forceReview;

        return { score, threshold: REVIEW_THRESHOLD, needsReview, factors };
    }

    /**
     * Zorunlu onay kapısı (Faz 3, HITL Kademe 1).
     * Parse sonuçlarını tarar; insan incelemesi gerektiren ve henüz
     * ONAYLANMAMIŞ olanları döner. UI bu liste boşalana dek analizi kilitler.
     *
     * parsedResults: [{ id, name, metadata }] — metadata.extraction.confidence
     *                postProcess tarafından doldurulmuş olmalı.
     * approvedIds:   kullanıcının onayladığı dosya id'leri (dizi veya Set).
     *
     * Dönen öğe: { id, name, score, threshold, factors } — skor yoksa
     * (confidence hesaplanamamışsa) belge güvenli sayılmaz, incelemeye düşer.
     *
     * opts.qaSampleRate (Faz 6 / Kademe 4): >0 ise, yüksek güvenli geçen
     * belgelerin deterministik ~1/N'i de "örneklemeli kalite kontrolü"
     * gerekçesiyle incelemeye düşürülür. Geriye uyumluluk için varsayılan 0
     * (örnekleme yok) — çağıran (CCPipeline) QA_SAMPLE_RATE gönderir.
     */
    function gate(parsedResults, approvedIds, opts = {}) {
        const approved = approvedIds instanceof Set ? approvedIds : new Set(approvedIds || []);
        const rate = typeof opts.qaSampleRate === 'number' ? opts.qaSampleRate : 0;
        const pending = [];
        for (const res of (parsedResults || [])) {
            const ext = res && res.metadata && res.metadata.extraction;
            const conf = ext && ext.confidence;
            let needsReview = conf ? !!conf.needsReview : true;
            let factors = (conf && conf.factors) || [{ factor: 'skor-yok', deduction: 100, detail: 'Güven skoru hesaplanamadı — çıkarım doğrulanamıyor' }];

            if (!needsReview && rate > 0) {
                const denom = Math.max(1, Math.round(1 / rate));
                if (hashStr(String(res.id) + '|' + (res.name || '')) % denom === 0) {
                    needsReview = true;
                    factors = factors.concat([{
                        factor: 'ornekleme-qa',
                        deduction: 0,
                        detail: `Örneklemeli kalite kontrolü (1/${denom}): yüksek güvenli belge rastgele denetime seçildi — onaylanan örnekler etiketli test korpusunu besler`
                    }]);
                }
            }

            if (needsReview && !approved.has(res.id)) {
                pending.push({
                    id: res.id,
                    name: res.name || res.source || String(res.id),
                    score: conf ? conf.score : null,
                    threshold: conf ? conf.threshold : REVIEW_THRESHOLD,
                    factors
                });
            }
        }
        return pending;
    }

    return { compute, gate, REVIEW_THRESHOLD, QA_SAMPLE_RATE };
})();
