/**
 * BexFlow ek sınıflandırma — "bu ek bir ısı/nem kaydı mı?"
 *
 * BexFlow notlarına eklenen dosyaların hepsi sıcaklık kaydı değildir
 * (fatura, irsaliye, fotoğraf, yazışma .msg …). Karar katmanlıdır:
 *
 *   1. Uzantı      → aday mı? (.xlsx/.xls/.csv/.txt/.pdf/görsel) · .msg/.eml = yazışma
 *   2. Ad + not    → anahtar kelime puanı (ısı, nem, sıcaklık, datalogger, marka… / fatura, irsaliye…)
 *   3. İçerik      → arayüzde mevcut DataParser ile kuru okuma: zaman + sıcaklık serisi var mı?
 *                    (contentVerdict — tarayıcıda çalışır, sonucu sunucuya yazılır)
 *   4. AI          → belirsiz PDF/görsel için Gemini'ye tek soru (sunucu)
 *   5. Kullanıcı   → elle düzeltme her zaman son sözü söyler
 *
 * Bu dosya hem Node (sunucu: katman 1-2) hem tarayıcı (katman 3) tarafından
 * yüklenir; bağımlılığı yoktur.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.BexflowClassify = api;
})(typeof self !== 'undefined' ? self : this, function () {

    const CATEGORIES = {
        isi_kaydi: 'Isı/Nem Kaydı',
        fatura_irsaliye: 'Fatura / İrsaliye',
        yazisma: 'Yazışma',
        gorsel: 'Fotoğraf / Görsel',
        diger: 'Diğer',
        belirsiz: 'Belirsiz',
    };

    const TABULAR = ['xlsx', 'xls', 'csv', 'tsv', 'txt', 'log', 'dat'];
    const DOCS = ['pdf'];
    const IMAGES = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'heic', 'tif', 'tiff'];
    const MAILS = ['msg', 'eml'];

    // Türkçe karakter/büyük-küçük harf bağımsız karşılaştırma
    function fold(s) {
        return String(s || '').toLocaleLowerCase('tr-TR')
            .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
            .replace(/[_\-.]+/g, ' ');
    }

    // [kalıp, ağırlık] — katlanmış (fold) metin üzerinde aranır
    const POSITIVE = [
        [/\bisi\b|\bisi ?nem|\bsicaklik|\bderece\b|°c|\bnem\b/, 3],
        [/data ?logger|\blogger\b|termometre|thermo|termo ?hig|\btemp(erature)?\b|\bhumidity\b/, 3],
        [/\btesto\b|\belitech\b|\bebro\b|\bescort\b|\blascar\b|\blog ?tag\b|\bberlinger\b|\bsensitech\b|\btempmate\b|\bsaveris\b|farmakit/, 3],
        // bitişik yazımlar: "sicakliknemtakip", "isinemkaydi"
        [/isinem|nemtakip|isitakip/, 3],
        [/\bsogutucu\b|\bbuzdolabi|\bdolap\b|\bfrigo/, 2],
        [/\btakip\b|\bkayit\b|\blog\b|\bkayitlari\b/, 1],
        // Ay adı: aylık ısı çizelgesi ("temmuz.pdf", "DOLAP 1 EYLÜL 2026.pdf")
        [/\b(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\b/, 1],
    ];
    const NEGATIVE = [
        [/\bfatura|\be ?fatura|\binvoice\b|\birsaliye|\bdespatch\b/, 'fatura_irsaliye', 4],
        [/\bdilekce|\btutanak|\bteklif|\bsozlesme|\bprotokol\b/, 'diger', 3],
        // "IMG-…", "WhatsApp Image…" gibi otomatik adlar bilerek yok: eczaneler kâğıt ısı
        // çizelgesini çoğunlukla telefonla fotoğraflayıp gönderiyor — ad tek başına bir şey söylemez.
        [/\bfoto|\bfotograf|\bresim\b|\bekran goruntusu/, 'gorsel', 2],
    ];

    function extOf(name) {
        const m = String(name || '').match(/\.([a-z0-9]+)$/i);
        return m ? m[1].toLowerCase() : '';
    }

    function scoreText(text, weight) {
        const t = fold(text);
        let pos = 0; const hits = [];
        POSITIVE.forEach(([re, w]) => { const m = t.match(re); if (m) { pos += w * weight; hits.push(m[0].trim()); } });
        let neg = 0, negCat = null; const negHits = [];
        NEGATIVE.forEach(([re, cat, w]) => { const m = t.match(re); if (m) { neg += w * weight; negHits.push(m[0].trim()); if (!negCat) negCat = cat; } });
        return { pos, neg, negCat, hits, negHits };
    }

    /**
     * Katman 1 + 2: yalnızca ad, uzantı ve ekin bağlı olduğu not metniyle ön sınıflandırma.
     * @returns {{kategori, guven, neden, needsContent, kind}}
     *   needsContent=true → arayüz içerik kontrolüyle (katman 3) kesinleştirmeli
     */
    function classifyByMeta({ fileName, commentText } = {}) {
        const ext = extOf(fileName);
        const kind = TABULAR.includes(ext) ? 'tabular' : DOCS.includes(ext) ? 'pdf' : IMAGES.includes(ext) ? 'image' : MAILS.includes(ext) ? 'mail' : 'other';

        if (kind === 'mail') return { kategori: 'yazisma', guven: 0.8, neden: 'E-posta dosyası (.' + ext + ') — içindeki ekler ayrıca açılmalı', needsContent: false, kind };
        if (kind === 'other') return { kategori: 'diger', guven: 0.8, neden: 'Desteklenmeyen dosya türü (.' + (ext || '?') + ')', needsContent: false, kind };

        const n = scoreText(fileName, 2);      // dosya adı güçlü sinyal
        const c = scoreText(commentText, 1);   // not metni zayıf sinyal
        const pos = n.pos + c.pos, neg = n.neg + c.neg;
        const reasons = [];
        if (n.hits.length) reasons.push('dosya adı: ' + n.hits.join(', '));
        if (c.hits.length) reasons.push('not: ' + c.hits.join(', '));
        if (n.negHits.length) reasons.push('dosya adı (olumsuz): ' + n.negHits.join(', '));
        if (c.negHits.length) reasons.push('not (olumsuz): ' + c.negHits.join(', '));

        let kategori = 'belirsiz', guven = 0.3;
        if (pos >= 4 && pos > neg) { kategori = 'isi_kaydi'; guven = Math.min(0.75, 0.45 + pos * 0.04); }
        else if (neg >= 4 && neg > pos) { kategori = n.negCat || c.negCat || 'diger'; guven = Math.min(0.75, 0.45 + neg * 0.04); }

        return {
            kategori, guven: Math.round(guven * 100) / 100,
            neden: reasons.length ? reasons.join(' · ') : 'Ad/not ipucu yok',
            // Tablo dosyaları içerikle kesinleşir; PDF/görsel isteğe bağlı AI ile
            needsContent: kind === 'tabular',
            kind,
        };
    }

    /**
     * Katman 3: içerik kararı. `parsed` = DataParser.parse benzeri çıktı
     * ({ parsedData: [{timestamp, temperature}] }) ya da okuma hatası.
     * @param {object} meta   classifyByMeta sonucu
     * @param {object|null} parsed
     * @param {string|null} error
     */
    function contentVerdict(meta, parsed, error) {
        const rows = (parsed && (parsed.parsedData || parsed.data)) || [];
        const valid = rows.filter(r => {
            const t = r && (r.timestamp instanceof Date ? r.timestamp.getTime() : new Date(r.timestamp).getTime());
            const v = r && Number(r.temperature);
            return isFinite(t) && isFinite(v) && v > -90 && v < 60;
        });
        if (valid.length >= 10) {
            // Düzenli aralık: ardışık farkların medyanı > 0 ve kayıtların çoğu buna yakın
            const ts = valid.map(r => new Date(r.timestamp).getTime()).sort((a, b) => a - b);
            const diffs = []; for (let i = 1; i < ts.length; i++) diffs.push(ts[i] - ts[i - 1]);
            const med = diffs.slice().sort((a, b) => a - b)[Math.floor(diffs.length / 2)] || 0;
            const regular = med > 0 && diffs.filter(d => d > 0 && Math.abs(d - med) <= med * 0.5).length / diffs.length;
            const guven = Math.min(0.97, 0.8 + (regular > 0.7 ? 0.1 : 0) + (meta && meta.kategori === 'isi_kaydi' ? 0.05 : 0));
            return { kategori: 'isi_kaydi', guven: Math.round(guven * 100) / 100, neden: `İçerik: ${valid.length} zaman+sıcaklık kaydı` + (regular > 0.7 ? ', düzenli aralıklı' : ', düzensiz aralık') };
        }
        if (valid.length > 0) {
            return { kategori: 'belirsiz', guven: 0.45, neden: `İçerik: yalnızca ${valid.length} geçerli ölçüm — elle kontrol edin (el yazısı/elle girilmiş kayıt olabilir)` };
        }
        // Sıcaklık serisi yok
        if (meta && meta.kategori && meta.kategori !== 'isi_kaydi' && meta.kategori !== 'belirsiz') {
            return { kategori: meta.kategori, guven: Math.max(meta.guven || 0.5, 0.7), neden: 'İçerikte sıcaklık serisi yok · ' + meta.neden };
        }
        return { kategori: meta && meta.kategori === 'isi_kaydi' ? 'belirsiz' : 'diger', guven: 0.6, neden: 'İçerikte zaman+sıcaklık serisi bulunamadı' + (error ? ` (${String(error).slice(0, 80)})` : '') };
    }

    /** Gemini sınıflandırma istemi (katman 4) */
    const AI_PROMPT = [
        'Bu dosya bir ilaç deposunun iade sürecine eklenmiş bir belge.',
        'Aşağıdaki kategorilerden HANGİSİ olduğunu belirle:',
        '- isi_kaydi: zamanla ölçülmüş sıcaklık ve/veya nem değerleri içeren kayıt (datalogger raporu, termometre çıktısı, elle tutulmuş ısı takip çizelgesi dahil)',
        '- fatura_irsaliye: fatura, e-fatura, irsaliye, sevk belgesi',
        '- yazisma: e-posta, dilekçe, tutanak, açıklama yazısı',
        '- gorsel: ürün/koli fotoğrafı vb. tablo içermeyen görsel',
        '- diger: hiçbiri',
        'YALNIZCA şu JSON ile yanıt ver: {"kategori":"…","guven":0.0-1.0,"neden":"kısa Türkçe gerekçe","elle_mi":true|false}',
        '"elle_mi": ısı kaydıysa elle yazılmış/manuel mi (imza-kaşe yoksa belirt).',
    ].join('\n');

    function parseAiAnswer(text) {
        const m = String(text || '').match(/\{[\s\S]*\}/);
        if (!m) return null;
        try {
            const j = JSON.parse(m[0]);
            const kategori = Object.prototype.hasOwnProperty.call(CATEGORIES, j.kategori) ? j.kategori : 'belirsiz';
            const guven = Math.max(0, Math.min(1, Number(j.guven) || 0.5));
            const neden = 'AI: ' + String(j.neden || '').slice(0, 300) + (j.elle_mi ? ' (elle tutulmuş kayıt)' : '');
            return { kategori, guven: Math.round(guven * 100) / 100, neden, manual: !!j.elle_mi };
        } catch (e) { return null; }
    }

    return { CATEGORIES, extOf, fold, classifyByMeta, contentVerdict, AI_PROMPT, parseAiAnswer };
});
