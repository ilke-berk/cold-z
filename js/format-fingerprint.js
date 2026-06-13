// ============================================================
// format-fingerprint.js — Şablon Hafızası Parmak İzi (Faz 4)
//
// Temel ilke: marka TESPİT EDİLMEZ, TANINIR. Eşleştirme anahtarı
// belgenin yapısal parmak izidir; marka adı şablona bir kez yazılan
// etikettir ve yalnızca yardımcı sinyaldir (çapraz doğrulama +
// bulanık eşleşmede aday daraltma).
//
// Parmak izi üretimi kayıt ve sorguda BİREBİR AYNI adımlardır:
//   PDF:       sayfa-1 metni → rakamlar '#' ile maskelenir (tarih/
//              sıcaklık/seri no gibi içerik değişkenleri dışlanır)
//              → boşluk normalize → başlık satırı token'ları +
//              PDF Producer/Creator → SHA-256
//   Excel/CSV: sütun adları küçük harf + kırpılmış + sıralı +
//              birleştirilmiş → SHA-256
//
// Hem tarayıcıda (global `FormatFingerprint`) hem Node'da (require)
// çalışır — sunucu eşleştirme mantığını da buradan alır, böylece
// kayıt/sorgu asimetrisi oluşamaz.
// ============================================================
(function (root, factory) {
    const mod = factory();
    if (typeof module === 'object' && module.exports) module.exports = mod;
    root.FormatFingerprint = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // Bulanık eşleşme eşiği: başlık token kümeleri arası Jaccard benzerliği
    const FUZZY_THRESHOLD = 0.85;

    // Türkiye eczane logger'ları sınırlı bir küme — sayfa-1'de deterministik
    // kelime taraması. Sıra önemli: daha ayırt edici markalar önce gelir.
    const KNOWN_BRANDS = [
        { label: 'Testo',         pattern: /\btesto\b/i },
        { label: 'Elitech',       pattern: /\belitech\b/i },
        { label: 'RC-5',          pattern: /\bRC[-\s]?5\b/i },
        { label: 'Clogger/Tufan', pattern: /\b(clogger|tufan)\b/i },
        { label: 'LogTag',        pattern: /\blog\s?tag\b/i },
        { label: 'Ebro',          pattern: /\bebro\b/i },
        { label: 'Tempmate',      pattern: /\btemp\s?mate\b/i },
        { label: 'Sensitech',     pattern: /\bsensitech\b/i },
        { label: 'TempSen',       pattern: /\b(tempsen|tempod)\b/i }
    ];

    // Başlık satırını bulmak için bilinen sütun adı kelimeleri
    const HEADER_KEYWORDS = [
        'tarih', 'saat', 'zaman', 'date', 'time', 'datetime',
        'sıcaklık', 'sicaklik', 'temp', '°c', 'celsius',
        'nem', 'humidity', 'dolap', 'ortam', 'değer', 'deger', 'value'
    ];

    function maskDigits(text) {
        return String(text || '').replace(/\d/g, '#');
    }

    function normalizeWhitespace(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    // Küçük harf + birleşen işaretleri (combining marks) at: Türkçe 'İ'
    // toLowerCase'te 'i' + birleşen nokta (U+0307) üretir; aksi halde
    // "TARİH" ile "Tarih" farklı token'a düşer ve hash tutmaz.
    function canon(text) {
        return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    // Maskelenmiş bir satırı token'lara böler; tamamen rakam-maskesi/
    // noktalama olan token'lar (##.##.####, ##:## ...) elenir.
    function tokenize(line) {
        return normalizeWhitespace(canon(line))
            .split(' ')
            .map(t => t.replace(/[|;,]+/g, ''))
            .filter(t => t.length > 1 && !/^[#.,:\/\-%°()]+$/.test(t));
    }

    // Sayfa-1 satırları içinde "başlığa en çok benzeyen" satırı seçer
    // (bilinen sütun adı kelimesi sayısına göre; en az 2 isabet ister).
    function findHeaderLine(lines) {
        let best = null;
        let bestScore = 0;
        const scan = Math.min((lines || []).length, 40);
        for (let i = 0; i < scan; i++) {
            const lower = String(lines[i] || '').toLowerCase();
            let score = 0;
            for (const kw of HEADER_KEYWORDS) {
                if (lower.includes(kw)) score++;
            }
            if (score > bestScore) { bestScore = score; best = lines[i]; }
        }
        return bestScore >= 2 ? best : null;
    }

    function headerTokensFromLines(lines) {
        const header = findHeaderLine(lines);
        return header ? tokenize(maskDigits(header)) : [];
    }

    async function sha256Hex(str) {
        const g = typeof globalThis !== 'undefined' ? globalThis : {};
        if (g.crypto && g.crypto.subtle && typeof TextEncoder !== 'undefined') {
            const buf = await g.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        // Node yedeği (subtle yoksa) — tarayıcıda bu dala hiç girilmez
        return require('crypto').createHash('sha256').update(str, 'utf8').digest('hex');
    }

    /**
     * PDF parmak izi: sayfa-1 metni → rakam maskesi → boşluk normalize →
     * BAŞLIK SATIRI token'ları + PDF Producer/Creator → SHA-256.
     *
     * Hash girdisi bilinçli olarak başlık iskeleti + üretici yazılımla
     * sınırlıdır: eczaneye özgü içerik (eczane adı, seri no, tarihler)
     * başlık satırında bulunmadığından dışarıda kalır → A eczanesinden
     * öğrenilen şablon B eczanesinin aynı marka belgesiyle otomatik eşleşir.
     *
     * Başlık satırı bulunamazsa muhafazakâr yedek: maskeli tam metin hash'e
     * girer — bu belge eczaneler arası genellemeyebilir ama asla yanlış
     * şablonla eşleşmez.
     */
    async function pdfFingerprint({ lines, producer, creator } = {}) {
        const headerTokens = headerTokensFromLines(lines || []);
        const skeleton = headerTokens.length > 0
            ? headerTokens.join('|')
            : 'raw:' + normalizeWhitespace(canon(maskDigits((lines || []).join(String.fromCharCode(10)))));
        const payload = ['pdf', skeleton, producer || '', creator || ''].join(String.fromCharCode(1));
        return {
            kind: 'pdf',
            hash: await sha256Hex(payload),
            headerTokens,
            producer: producer || '',
            creator: creator || ''
        };
    }

    /**
     * Excel/CSV parmak izi: sütun adları küçük harf + kırpılmış +
     * sıralı + birleştirilmiş → SHA-256. Sütun SIRASI hash'i etkilemez;
     * token listesi (sırasız küme) bulanık eşleşme için saklanır.
     */
    async function tabularFingerprint(headers) {
        const tokens = (headers || []).map(h => canon(h).trim()).filter(Boolean);
        const payload = ['tabular', tokens.slice().sort().join('|')].join(String.fromCharCode(1));
        return { kind: 'tabular', hash: await sha256Hex(payload), headerTokens: tokens };
    }

    function jaccard(a, b) {
        const A = new Set(a || []);
        const B = new Set(b || []);
        if (A.size === 0 || B.size === 0) return 0;
        let inter = 0;
        for (const t of A) if (B.has(t)) inter++;
        return inter / (A.size + B.size - inter);
    }

    function detectBrand(text) {
        const s = String(text || '');
        for (const b of KNOWN_BRANDS) {
            if (b.pattern.test(s)) return b.label;
        }
        return null;
    }

    function normBrand(b) {
        return String(b || '').toLowerCase().replace(/[^a-z0-9ğüşöçı]/g, '');
    }

    // Marka etiketleri serbest yazımlı olabilir ("Elitech" vs "Elitech RC-5"):
    // biri diğerini içeriyorsa çelişki sayılmaz.
    function brandsAgree(a, b) {
        const x = normBrand(a);
        const y = normBrand(b);
        if (!x || !y) return true;
        return x.includes(y) || y.includes(x);
    }

    /**
     * İki kademeli eşleştirme (kayıt ve sorgu simetrik):
     *  1. Kesin (hash): birebir tutarsa şablon anında uygulanır (sıfır AI).
     *     Belgedeki marka kelimesi şablon etiketiyle çelişiyorsa
     *     `brandConflict: true` döner → insan kuyruğuna yönlendirilmeli.
     *  2. Bulanık: başlık token kümeleri Jaccard ≥ FUZZY_THRESHOLD ve
     *     (ikisi de biliniyorsa) aynı Producer → aday önerilir ama ASLA
     *     sessizce uygulanmaz; marka ipucu aday kümesini daraltır.
     *
     * templates: [{ fingerprint, kind, brand, producer, headerTokens, schema, ... }]
     * query:     { fingerprint, headerTokens, producer, kind, brandHint }
     */
    function matchTemplate(templates, query) {
        const list = templates || [];
        const q = query || {};

        const exact = list.find(t => t.fingerprint === q.fingerprint);
        if (exact) {
            return {
                match: 'exact',
                template: exact,
                similarity: 1,
                brandConflict: !brandsAgree(exact.brand, q.brandHint)
            };
        }

        let best = null;
        for (const t of list) {
            if (q.kind && t.kind && t.kind !== q.kind) continue;
            if (q.producer && t.producer && q.producer !== t.producer) continue;
            if (q.brandHint && t.brand && !brandsAgree(t.brand, q.brandHint)) continue;
            const sim = jaccard(t.headerTokens, q.headerTokens);
            if (sim >= FUZZY_THRESHOLD && (!best || sim > best.similarity)) {
                best = { template: t, similarity: sim };
            }
        }
        if (best) {
            return { match: 'fuzzy', template: best.template, similarity: best.similarity, brandConflict: false };
        }
        return { match: 'none' };
    }

    return {
        FUZZY_THRESHOLD,
        KNOWN_BRANDS,
        maskDigits,
        normalizeWhitespace,
        tokenize,
        findHeaderLine,
        headerTokensFromLines,
        sha256Hex,
        pdfFingerprint,
        tabularFingerprint,
        jaccard,
        detectBrand,
        brandsAgree,
        matchTemplate
    };
});
