/**
 * ============================================================
 *  ColdChain AI — Backend Server v3.2.0-hybrid
 *  Express.js + Gemini Vision API
 *  
 *  UTF-8 Karakter Desteği (Windows CMD/PS)
 * ============================================================
 */

// Windows Terminal UTF-8 Zorlaması (Masaüstü/├╝ bozulmasını önlemek için)
if (process.platform === 'win32') {
    const { execSync } = require('child_process');
    try { 
        execSync('chcp 65001', { stdio: 'ignore' }); 
        if (process.stdout.isTTY) {
            process.stdout.setDefaultEncoding('utf8');
            process.stderr.setDefaultEncoding('utf8');
        }
    } catch (e) {}
}

const express = require('express');
const multer = require('multer');
const path = require('path');

let isPackaged = false;
let userDataPath = '';
try {
    const electron = require('electron');
    if (electron && electron.app) {
        isPackaged = electron.app.isPackaged;
        userDataPath = electron.app.getPath('userData');
    }
} catch (e) {}

// Production: .env'yi installer'a paketleme — kullanıcının userData klasöründen okuruz.
// Geliştirme: proje kökündeki .env'yi kullan.
const envPath = isPackaged && userDataPath
    ? path.join(userDataPath, '.env')
    : path.join(__dirname, '.env');

require('dotenv').config({ path: envPath });

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PDFDocument } = require('pdf-lib');
const { splitPdf } = require('./pdf-helper');
const db = require('./database');
const DateFormatDetector = require('./date-format-detector');
const FormatFingerprint = require('./js/format-fingerprint');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Multer: Dosya yükleme (bellek içi) ────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB maks
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg', 'image/png', 'image/webp', 'image/bmp',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv' // .csv
        ];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
            cb(null, true);
        } else {
            cb(new Error(`Desteklenmeyen dosya türü: ${file.mimetype}`));
        }
    }
});

// ─── Statik dosya sunumu ────────────────────────────────────
// Geliştirme: kaynak dosyaları (.html/.js/.jsx) cache'leme — kod değişikliği
// tarayıcıyı yenileyince anında yansısın (eski cache'lenmiş JSX sorununu önler).
app.use(express.static(path.join(__dirname), {
    index: 'app.html',
    etag: false,
    setHeaders: (res, filePath) => {
        if (/\.(html|jsx?|css)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-store, must-revalidate');
        }
    },
}));
app.use(express.json({ limit: '20mb' }));

// ─── BÖLÜM: CORS Eklemesi (Electron file:// protokolü için)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ─── Gemini AI Kurulumu ─────────────────────────────────────
let genAI = null;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash'; // .env'den alindigi için buradan değil oradan değiştirin.
const PAGES_PER_CHUNK = 3;  // Çok fazla sayfa olunca AI satır atlar (tembellik). Maks 3 sayfa/chunk.

// ─── Fiyatlandırma (override için .env) ─────────────────────
// Gemini model fiyatları zamanla değişir; doğrudan .env'den ayarla.
// Bilinen modeller için varsayılan tablo, .env override eder.
const MODEL_PRICING = {
    'gemini-1.5-flash':         { input: 0.075, output: 0.30 },
    'gemini-1.5-flash-8b':      { input: 0.0375, output: 0.15 },
    'gemini-1.5-pro':           { input: 1.25,  output: 5.00 },
    'gemini-2.0-flash':         { input: 0.10,  output: 0.40 },
    'gemini-2.0-flash-lite':    { input: 0.075, output: 0.30 },
    'gemini-2.5-flash':         { input: 0.10,  output: 0.40 },
    'gemini-2.5-flash-preview': { input: 0.10,  output: 0.40 },
    'gemini-2.5-pro':           { input: 1.25,  output: 10.00 }
};
const PRICE_IN  = parseFloat(process.env.PRICE_INPUT_PER_M)  || MODEL_PRICING[MODEL_NAME]?.input  || 0.10;
const PRICE_OUT = parseFloat(process.env.PRICE_OUTPUT_PER_M) || MODEL_PRICING[MODEL_NAME]?.output || 0.40;
const USD_TRY   = parseFloat(process.env.USD_TRY_RATE) || 39;

function initGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
        console.warn('[UYARI] GEMINI_API_KEY ayarlanmamis!');
        console.warn(`         .env dosyasi su konumda olmalidir: ${envPath}`);
        console.warn('         Icerik: GEMINI_API_KEY=xxxxxxxxxxxx');
        console.warn('         API anahtari almak icin: https://aistudio.google.com/apikey');
        return false;
    }
    try {
        genAI = new GoogleGenerativeAI(apiKey);
        console.log(`[OK] Gemini baglantisi kuruldu (model: ${MODEL_NAME})`);
        return true;
    } catch (err) {
        console.log(`[HATA] Gemini baglanti hatasi: ${err.message}`);
        return false;
    }
}

// ─── PROMPT ──────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Sen bir soğuk zincir veri çıkarma (OCR) uzmanısın.
GÖREV: Sana gönderilen sayfalardaki İSTİSNASIZ TÜM "Buzdolabı/İç Sıcaklığı" verilerini satır satır çıkar.

🚨 KESİNLİKLE YASAK (FİLTRE/ATLAMAK/ÖZETLEMEK/DÜZELTMEK):
- "..." veya "vb." KULLANMAK KESİNLİKLE YASAK.
- "devamı benzer", "diğer saatler" diyerek satır atlamak YASAK.
- Tablonun ORTASINDAN, BAŞINDAN veya SONUNDAN satır silmek YASAK. Tüm satırları EKSİKSİZ, TEK TEK Markdown tablosuna yazmak ZORUNDASIN. Bir sayfada 60 satır varsa, 60 satırı da tabloya yazmalısın.
- TARİH veya SICAKLIK UYDURMAK, DÜZELTMEK YASAK. Belgede "128°C" yazıyorsa onu "12.8" DEĞİL, gördüğün gibi "128" olarak yazmalısın. Mantıksız görünse BİLE düzeltme yapmadan gördüğünü kopyala.

ÇIKTI FORMATI (TAM OLARAK BU 4 SÜTUN):
| Tarih | Saat | Sicaklik | Guven |
|-------|------|----------|-------|
| 04.02.2026 | 23:45:00 | 4.6 | 0.98 |

KURALLAR:
1. SATIR NUMARASI EKLEME. İlk sütun TARİH olsun.
2. TARİHİ TAMAMLA: Tablodaki tarih sütununda sadece "1" gibi bir gün yazıyorsa, sayfanın üst kısımlarına bakarak hangi Ay/Yıl olduğunu bul ve ÇIKTI olarak mutlaka "GG.AA.YYYY" formatında tam tarih yaz (örneğin "01.02.2026"). EKSİK TARİH YAZMAK YASAKTIR. Ancak kesinlikle günleri veya ayları kaydırma, sadece belgede gördüğün ay ve yıla göre o günü birleştir.
3. BAŞTAN SONA OKU: Her sayfanın en üstünden en altına kadar tüm satırları EKSİKSİZ oku.
4. Sıcaklık formatı sadece ondalık sayı olsun (ör: 4.6). Ne görüyorsan (eksik veya hatalı basım da olsa) 128 ise 128 yaz. Asla doğrusu budur diye düşünme.
5. Güvenlik skoru 0.00 ile 1.00 arası.
6. HİÇBİR ORTAM VEYA NEM VERİSİ ALMA, sadece buzdolabı cihaz sıcaklığı.
7. Sayfa ayırma yapma, TÜM okumaları yukarıdaki formatta TEK BİR tabloda BİRLEŞTİR.

META BİLGİ (Tablonun en sonuna ekle):
META_START
pharmacyName: (eczane adı, varsa)
deviceBrand: (cihaz markası, varsa)
totalReadings: (BU TABLODA YAZDIĞIN TOPLAM SAYI)
META_END
`;

// ─── YAPILANDIRILMIŞ ÇIKTI (Faz 5) ──────────────────────────
// Markdown tablo + regex sökme yerine Gemini'nin responseSchema desteğiyle
// doğrudan JSON dizisi alınır — parseMarkdownResponse'taki başlık-atlatma ve
// hücre-indeksleme hata sınıfının tamamı ortadan kalkar. Markdown yolu,
// yapılandırılmış çıktı başarısız olursa parça bazında YEDEK olarak kalır.
const STRUCTURED_OUTPUT = process.env.GEMINI_STRUCTURED !== '0';

const EXTRACTION_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        readings: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    date: { type: 'STRING', description: 'GG.AA.YYYY formatında TAM tarih' },
                    time: { type: 'STRING', description: 'HH:MM veya HH:MM:SS' },
                    temperature: { type: 'NUMBER' },
                    confidence: { type: 'NUMBER', description: '0.00-1.00 arası okuma güveni' }
                },
                required: ['date', 'temperature']
            }
        },
        pharmacyName: { type: 'STRING' },
        deviceBrand: { type: 'STRING' },
        totalReadings: { type: 'INTEGER', description: 'readings dizisine yazılan kayıt sayısı' }
    },
    required: ['readings']
};

const EXTRACTION_PROMPT_JSON = `Sen bir soğuk zincir veri çıkarma (OCR) uzmanısın.
GÖREV: Gönderilen sayfalardaki İSTİSNASIZ TÜM "Buzdolabı/İç Sıcaklık" okumalarını satır satır çıkar.

KURALLAR:
1. HİÇBİR SATIRI ATLAMA, ÖZETLEME, "devamı benzer" DEME. Sayfada 60 satır varsa readings dizisinde 60 kayıt olmalı.
2. TARİHİ TAMAMLA: satırda yalnız gün yazıyorsa sayfanın üstündeki Ay/Yıl ile birleştirip "GG.AA.YYYY" yaz. Gün/ay sırasını ASLA kaydırma, belgede ne görüyorsan onu yaz.
3. DEĞER UYDURMA/DÜZELTME YASAK: belgede "128" yazıyorsa mantıksız görünse bile 128 yaz.
4. SADECE buzdolabı/iç sıcaklık değerini al; ortam sıcaklığı ve nem ALMA.
5. confidence: o satırı ne kadar net okuduğun (0.00-1.00).
6. totalReadings: readings dizisine gerçekten yazdığın kayıt sayısı.
7. Tüm sayfaları TEK readings dizisinde birleştir.`;

// ─── API: Görüntü/PDF'den Veri Çıkarma (Akıllı Chunking) ───

app.post('/api/extract', upload.single('file'), async (req, res) => {
    const startTime = Date.now();

    if (!genAI) {
        return res.status(503).json({
            success: false,
            error: 'Gemini API bağlantısı yok. .env dosyasında GEMINI_API_KEY ayarlanmalı.',
            hint: 'https://aistudio.google.com/apikey'
        });
    }

    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'Dosya yüklenmedi. file alanı ile bir görüntü veya PDF gönderin.'
        });
    }

    try {
        const fileSizeKB = (req.file.size / 1024).toFixed(1);
        console.log(`-`.repeat(60));
        console.log(`[ISTEK] ${req.file.originalname} (${fileSizeKB} KB, ${req.file.mimetype})`);
        console.log(`-`.repeat(60));

        // --- AKILLI CHUNKING ---
        // PDF -> 10 sayfa/parca, OVERLAP YOK
        // Goruntu -> tek parca (chunking gerekmez)
        let chunks = [req.file.buffer];
        if (req.file.mimetype === 'application/pdf') {
            chunks = await splitPdf(req.file.buffer, PAGES_PER_CHUNK, 0);  // 0 overlap!
            console.log(`   [PDF] ${chunks.length} parcaya ayrildi (${PAGES_PER_CHUNK} sayfa/parca, overlap YOK)`);
        }

        // ─── CHUNK İŞLEME (Faz 5: yapılandırılmış çıktı + paralel) ──
        const CONCURRENCY = Math.max(1, Math.min(parseInt(process.env.EXTRACT_CONCURRENCY) || 2, 4));
        console.log(`🤖 ${chunks.length} parça işleniyor (model: ${MODEL_NAME}, mod: ${STRUCTURED_OUTPUT ? 'JSON şema' : 'markdown'}, paralellik: ${CONCURRENCY})...\n`);

        const baseGen = { maxOutputTokens: 65536, temperature: 0 }; // OCR işinde determinizm gerekir
        const modelMd = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: baseGen });
        const modelJson = genAI.getGenerativeModel({
            model: MODEL_NAME,
            generationConfig: { ...baseGen, responseMimeType: 'application/json', responseSchema: EXTRACTION_RESPONSE_SCHEMA }
        });

        let allReadings = [];
        let consolidatedMetadata = {};
        let totalLowConfidence = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalAIClaimed = 0;
        let structuredChunks = 0;
        let markdownChunks = 0;

        async function processChunk(i) {
            const imagePart = {
                inlineData: { data: chunks[i].toString('base64'), mimeType: req.file.mimetype }
            };
            const stats = { inputTokens: 0, outputTokens: 0 };

            const callModel = async (mode) => {
                const m = mode === 'json' ? modelJson : modelMd;
                const prompt = mode === 'json' ? EXTRACTION_PROMPT_JSON : EXTRACTION_PROMPT;
                const result = await m.generateContent([prompt, imagePart]);
                const response = await result.response;
                const usage = response.usageMetadata || {};
                stats.inputTokens += usage.promptTokenCount || 0;
                stats.outputTokens += usage.candidatesTokenCount || 0;
                // MAX_TOKENS kesilmesi: çıktı yarım kaldı → yeniden deneme sinyali
                const finishReason = response.candidates?.[0]?.finishReason;
                if (finishReason === 'MAX_TOKENS') {
                    console.log(`      [UYARI] Parça ${i + 1}: çıktı MAX_TOKENS ile kesildi`);
                }
                const parsed = mode === 'json'
                    ? parseStructuredResponse(response.text())
                    : parseMarkdownResponse(response.text());
                parsed._truncated = finishReason === 'MAX_TOKENS';
                return parsed;
            };

            let mode = STRUCTURED_OUTPUT ? 'json' : 'md';
            let parsed;
            try {
                parsed = await callModel(mode);
            } catch (e) {
                if (mode === 'json') {
                    // responseSchema desteklenmiyor veya JSON bozuk → markdown yedeği
                    console.log(`      [JSON→MD] Parça ${i + 1}: yapılandırılmış çıktı başarısız (${e.message}) → markdown moduna düşülüyor`);
                    mode = 'md';
                    parsed = await callModel('md');
                } else {
                    throw e;
                }
            }

            // Yeniden deneme tetikleri: 0 satır (sayfada içerik olduğu biliniyor),
            // MAX_TOKENS kesilmesi veya AI iddiası ile parse arasında büyük fark.
            const claimed = parsed.aiClaimedTotal || 0;
            const needRetry = parsed.readings.length === 0
                || parsed._truncated
                || (claimed > 0 && parsed.readings.length < claimed * 0.9);
            if (needRetry) {
                console.log(`      [RETRY] Parça ${i + 1}: ${parsed.readings.length} satır (iddia: ${claimed || '?'}${parsed._truncated ? ', kesik çıktı' : ''}) → yeniden deneniyor...`);
                await new Promise(r => setTimeout(r, 500));
                try {
                    // JSON modu 0 satır verdiyse markdown'la dene — farklı yol çoğu zaman kurtarır
                    const retryMode = (parsed.readings.length === 0 && mode === 'json') ? 'md' : mode;
                    const retryParsed = await callModel(retryMode);
                    if (retryParsed.readings.length > parsed.readings.length) {
                        console.log(`      [RETRY] Daha iyi sonuç: ${retryParsed.readings.length} satır (${retryMode})`);
                        parsed = retryParsed;
                        mode = retryMode;
                    } else {
                        console.log(`      [RETRY] İyileşme yok (${retryParsed.readings.length} satır), ilk sonuç korundu`);
                    }
                } catch (e) { /* yeniden deneme başarısızsa ilk sonuç korunur */ }
            }

            // Satır inceleme ızgarası (Kademe 2) için yaklaşık kaynak sayfa:
            // parça i, sayfa i*PAGES_PER_CHUNK+1'den başlar.
            parsed.readings.forEach(r => { r.page = i * PAGES_PER_CHUNK + 1; });
            return { parsed, stats, mode };
        }

        const results = new Array(chunks.length);
        let nextIdx = 0;
        const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async (_, w) => {
            // Rate limit nezaketi: işçiler kademeli başlar
            await new Promise(r => setTimeout(r, w * 400));
            while (true) {
                const i = nextIdx++;
                if (i >= chunks.length) break;
                const t0 = Date.now();
                results[i] = await processChunk(i);
                console.log(`   [OK] Parça ${i + 1}/${chunks.length}: ${results[i].parsed.readings.length} satır (${results[i].mode}, ${Date.now() - t0}ms)`);
            }
        });
        await Promise.all(workers);

        // Sonuçları SIRAYLA birleştir (paralellik sıralamayı bozmaz)
        for (const rr of results) {
            allReadings = allReadings.concat(rr.parsed.readings);
            Object.assign(consolidatedMetadata, rr.parsed.metadata);
            totalLowConfidence += rr.parsed.lowConfidenceCount;
            totalAIClaimed += (rr.parsed.aiClaimedTotal || rr.parsed.readings.length);
            totalInputTokens += rr.stats.inputTokens;
            totalOutputTokens += rr.stats.outputTokens;
            if (rr.mode === 'json') structuredChunks++; else markdownChunks++;
        }

        // ─── MALİYET HESABI ─────────────────────────────────
        const totalTokens = totalInputTokens + totalOutputTokens;
        const inputCost = (totalInputTokens / 1_000_000) * PRICE_IN;
        const outputCost = (totalOutputTokens / 1_000_000) * PRICE_OUT;
        const totalCost = inputCost + outputCost;

        console.log(`\n   [TOKEN] TOPLAM KULLANIM:`);
        console.log(`      Input  : ${totalInputTokens.toLocaleString()} token ($${inputCost.toFixed(6)})`);
        console.log(`      Output : ${totalOutputTokens.toLocaleString()} token ($${outputCost.toFixed(6)})`);
        console.log(`      Toplam : ${totalTokens.toLocaleString()} token`);
        console.log(`      [MALIYET] $${totalCost.toFixed(4)} (TL ${(totalCost * USD_TRY).toFixed(4)})`);

        // ─── TARİH FORMAT TESPİTİ (tek çözücü + gelecek vetosu) ───
        console.log(`\n   -- TARIH FORMAT ANALIZI --`);
        const dateFormatDetection = smartDateResolve(allReadings);

        // Sonuçları göster
        const sampleCount = Math.min(3, allReadings.length);
        if (sampleCount > 0) {
            console.log(`   İlk ${sampleCount} kayıt:`);
            for (let i = 0; i < sampleCount; i++) {
                const r = allReadings[i];
                console.log(`     → ${r.date} ${r.time} | ${r.temperature}°C`);
            }
            if (allReadings.length > 3) {
                console.log(`   Son 3 kayıt:`);
                for (let i = Math.max(0, allReadings.length - 3); i < allReadings.length; i++) {
                    const r = allReadings[i];
                    console.log(`     → ${r.date} ${r.time} | ${r.temperature}°C`);
                }
            }
        }

        // ─── DEDUPLİKASYON (güvenlik ağı — overlap yok ama yine de) ──
        const totalBeforeDedup = allReadings.length;
        const uniqueMap = new Map();
        allReadings.forEach(r => {
            const key = `${r.date}_${r.time}_${r.temperature}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, r);
            }
        });
        const finalReadings = Array.from(uniqueMap.values());
        const dedupLoss = totalBeforeDedup - finalReadings.length;

        if (dedupLoss > 0) {
            console.log(`   🧹 Dedup: ${dedupLoss} tekrarlı kayıt temizlendi`);
        }

        const elapsed = Date.now() - startTime;
        const avgConfidence = allReadings.length > 0
            ? parseFloat((allReadings.reduce((s, r) => s + r.confidence, 0) / allReadings.length).toFixed(2))
            : 0;

        // AI iddiası ile parse edilen sayı arasındaki fark (retry sonrası hâlâ
        // büyükse) VEYA tarih formatı belirsizliği → insan incelemesi işareti
        const claimMismatch = Math.max(0, totalAIClaimed - allReadings.length);
        const claimNeedsReview = totalAIClaimed > 0 && claimMismatch > totalAIClaimed * 0.1;
        const needsReview = claimNeedsReview || !!(dateFormatDetection && dateFormatDetection.ambiguous);
        if (claimNeedsReview) {
            console.log(`   [UYARI] AI ${totalAIClaimed} satir iddia etti, ${allReadings.length} parse edildi → insan incelemesi önerilir`);
        }
        if (dateFormatDetection && dateFormatDetection.ambiguous) {
            console.log(`   [UYARI] Tarih formatı belirsiz → insan incelemesi önerilir`);
        }

        console.log(`\n${'-'.repeat(55)}`);
        console.log(`   [SONUC] ${finalReadings.length} kayit | ${chunks.length} chunk | ${(elapsed / 1000).toFixed(1)}s | $${totalCost.toFixed(4)}`);
        console.log(`${'-'.repeat(55)}\n`);

        res.json({
            success: true,
            readings: finalReadings,
            metadata: consolidatedMetadata,
            rawMarkdown: '',  // Çok büyük olabilir, frontend'e gönderme
            modelUsed: MODEL_NAME,
            stats: {
                totalReadings: finalReadings.length,
                avgConfidence: avgConfidence,
                lowConfidenceCount: totalLowConfidence,
                elapsedMs: elapsed,
                chunkCount: chunks.length,
                dedupRemoved: dedupLoss,
                aiClaimedTotal: totalAIClaimed,
                claimMismatch: claimMismatch,
                extractionMode: { structured: structuredChunks, markdown: markdownChunks },
                needsReview: needsReview,
                dateFormat: dateFormatDetection,
                tokens: {
                    input: totalInputTokens,
                    output: totalOutputTokens,
                    total: totalTokens
                },
                cost: {
                    input: parseFloat(inputCost.toFixed(6)),
                    output: parseFloat(outputCost.toFixed(6)),
                    total: parseFloat(totalCost.toFixed(6)),
                    totalTRY: parseFloat((totalCost * USD_TRY).toFixed(4))
                }
            }
        });

    } catch (err) {
        console.error('[HATA] Cikarim hatasi:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ─── ORTAK TARİH PARÇALAYICI ────────────────────────────────
// Ham tarih string'ini yıl + iki belirsiz parçaya ayırır. _isISO=true,
// "sıra kesin biliniyor: p1=ay, p2=gün" demektir (>12 kuralıyla çözülmüş).
// Hem markdown hem yapılandırılmış JSON parser'ı bunu kullanır —
// smartDateResolve'un beklediği alanlar tek yerden üretilir.
function splitRawDate(dMatch) {
    const dParts = dMatch.split(/[\.\/-]/);
    let y, p1, p2;
    let isISO = false;

    if (dParts[0].length === 4) {
        y = dParts[0]; p1 = dParts[1]; p2 = dParts[2];
        if (parseInt(p1) > 12) {
            isISO = true;
            const tmp = p1; p1 = p2; p2 = tmp;
        } else if (parseInt(p2) > 12) {
            isISO = true;
        }
    } else {
        y = dParts[2].length === 2 ? '20' + dParts[2] : dParts[2];
        p1 = dParts[0]; p2 = dParts[1];
        if (parseInt(p1) > 12) {
            isISO = true;
            const tmp = p1; p1 = p2; p2 = tmp;
        } else if (parseInt(p2) > 12) {
            isISO = true;
        }
    }
    return { y, p1, p2, isISO };
}

// ─── YAPILANDIRILMIŞ JSON PARSE MOTORU (Faz 5) ──────────────
// responseSchema garantili JSON döner; yine de savunmacı parse edilir
// (code-block sargısı, kayıp alanlar). Hata fırlatırsa çağıran markdown
// yedeğine düşer.
function parseStructuredResponse(text) {
    let clean = String(text || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
    let data;
    try {
        data = JSON.parse(clean);
    } catch (e) {
        const m = clean.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('Yapılandırılmış çıktı JSON olarak çözülemedi');
        data = JSON.parse(m[0]);
    }
    const list = Array.isArray(data.readings) ? data.readings : (Array.isArray(data) ? data : null);
    if (!list) throw new Error('Yapılandırılmış çıktıda readings dizisi yok');

    const dateRegex = /(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4})|(\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2})/;
    const timeRegex = /(\d{1,2}:\d{2}(?::\d{2})?)/;
    const readings = [];
    let lowConfidenceCount = 0;
    let skipped = 0;

    for (const r of list) {
        const dm = String(r.date || '').match(dateRegex);
        if (!dm) { skipped++; continue; }
        const temperature = typeof r.temperature === 'number'
            ? r.temperature
            : parseFloat(String(r.temperature ?? '').replace(',', '.'));
        if (isNaN(temperature)) { skipped++; continue; }

        const tm = String(r.time || '').match(timeRegex);
        const normalizedTime = tm ? (tm[1].split(':').length === 2 ? tm[1] + ':00' : tm[1]) : '00:00:00';
        const confidence = (typeof r.confidence === 'number' && r.confidence > 0 && r.confidence <= 1)
            ? r.confidence : 0.98;

        const parts = splitRawDate(dm[0]);
        readings.push({
            _rawDate: dm[0],
            _rawYear: parts.y,
            _rawP1: parts.p1,
            _rawP2: parts.p2,
            _isISO: parts.isISO,
            date: null,
            time: normalizedTime,
            temperature: temperature,
            confidence: confidence
        });
        if (confidence < 0.75) lowConfidenceCount++;
    }

    if (skipped > 0) {
        console.log(`   [Parser/JSON] ${skipped} kayıt atlandı (tarih/sıcaklık çözülemedi).`);
    }

    const metadata = {};
    if (data.pharmacyName && data.pharmacyName !== '-' && data.pharmacyName !== 'yok') metadata.pharmacyName = String(data.pharmacyName);
    if (data.deviceBrand && data.deviceBrand !== '-' && data.deviceBrand !== 'yok') metadata.deviceBrand = String(data.deviceBrand);
    const aiClaimedTotal = parseInt(data.totalReadings) || 0;
    const avgConfidence = readings.length > 0
        ? parseFloat((readings.reduce((s, x) => s + x.confidence, 0) / readings.length).toFixed(2))
        : 0;

    return { readings, metadata, avgConfidence, lowConfidenceCount, aiClaimedTotal };
}

// ─── MARKDOWN PARSE MOTORU (yedek yol) ──────────────────────

function parseMarkdownResponse(text) {
    const readings = [];
    let metadata = {};
    let lowConfidenceCount = 0;
    let skipped = 0;
    let aiClaimedTotal = 0;

    const lines = text.split('\n');
    const dateRegex = /(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4})|(\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2})/;
    const timeRegex = /(\d{1,2}:\d{2}(?::\d{2})?)/;

    for (const line of lines) {
        const trimmed = line.trim();

        // Sadece tablo satırlarıyla ilgilen
        if (!trimmed.startsWith('|')) continue;
        const pipeCount = (trimmed.match(/\|/g) || []).length;
        if (pipeCount < 4) continue;

        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');

        // Başlık ve ayraç satırlarını atla
        const lowerTrimmed = trimmed.toLowerCase();
        if (lowerTrimmed.includes('tarih') || lowerTrimmed.includes('date') ||
            lowerTrimmed.includes('sicaklik') || lowerTrimmed.includes('guven') ||
            trimmed.includes('---') || lowerTrimmed.includes('saat')) {
            continue;
        }
        if (cells.length < 3) continue;

        // ── ADIM 1: Tarih ve Saat hücrelerini İNDEKSLERİYLE bul ──
        let dateIdx = -1, timeIdx = -1;
        for (let i = 0; i < cells.length; i++) {
            if (dateIdx === -1 && dateRegex.test(cells[i])) { dateIdx = i; continue; }
            if (timeIdx === -1 && timeRegex.test(cells[i])) { timeIdx = i; continue; }
        }

        if (dateIdx === -1) { skipped++; continue; }

        // ── ADIM 2: Sıcaklığı tarih/saatten SONRA ara ──
        const searchStart = Math.max(dateIdx, timeIdx) + 1;
        let tempIdx = -1;
        for (let i = searchStart; i < cells.length; i++) {
            // Sadece sayısal kısımları al, eksi işaretini de koruyarak
            const clean = cells[i].replace(',', '.').replace(/[^\d.-]/g, '');
            const val = parseFloat(clean);
            if (!isNaN(val)) {
                tempIdx = i;
                break;
            }
        }

        if (tempIdx === -1) { skipped++; continue; }

        // ── ADIM 3: Güven skoru (sıcaklıktan sonraki hücre) ──
        let confidence = 0.98;
        if (tempIdx + 1 < cells.length) {
            const confVal = parseFloat(cells[tempIdx + 1].replace(',', '.'));
            if (!isNaN(confVal) && confVal > 0 && confVal <= 1) {
                confidence = confVal;
            }
        }

        // ── ADIM 4: Tarih parçalarını kaydet (ortak yardımcı) ──
        const dMatch = cells[dateIdx].match(dateRegex)[0];
        const dp = splitRawDate(dMatch);
        const y = dp.y, p1 = dp.p1, p2 = dp.p2, isISO = dp.isISO;

        // ── ADIM 5: Saat normalizasyonu ──
        let normalizedTime = '00:00:00';
        if (timeIdx !== -1) {
            const tMatch = cells[timeIdx].match(timeRegex)[0];
            normalizedTime = tMatch.split(':').length === 2 ? tMatch + ':00' : tMatch;
        }

        // ── ADIM 6: Sıcaklık oku ──
        const temperature = parseFloat(cells[tempIdx].replace(',', '.').replace(/[^\d.-]/g, ''));
        if (isNaN(temperature)) { skipped++; continue; }

        const entry = {
            _rawDate: dMatch,
            _rawYear: y,
            _rawP1: p1,
            _rawP2: p2,
            _isISO: isISO,
            date: null,
            time: normalizedTime,
            temperature: temperature,
            confidence: confidence
        };

        readings.push(entry);

        if (confidence < 0.75) lowConfidenceCount++;
    }

    if (skipped > 0) {
        console.log(`   [Parser] ${skipped} satır atlandı (tarih/sıcaklık bulunamadı).`);
    }

    // ── META bilgisi ──
    const metaMatch = text.match(/META_START([\s\S]*?)META_END/);
    if (metaMatch) {
        const metaLines = metaMatch[1].split('\n');
        for (const ml of metaLines) {
            const kv = ml.match(/^(\w+):\s*(.+)$/);
            if (kv) {
                const key = kv[1].trim();
                const value = kv[2].trim();
                if (key === 'totalReadings') {
                    aiClaimedTotal = parseInt(value) || 0;
                }
                if (value && value !== '-' && value !== 'yok') {
                    metadata[key] = value;
                }
            }
        }
    }

    const avgConfidence = readings.length > 0
        ? parseFloat((readings.reduce((s, r) => s + r.confidence, 0) / readings.length).toFixed(2))
        : 0;

    return { readings, metadata, avgConfidence, lowConfidenceCount, aiClaimedTotal };
}

// ─── AKILLI TARİH FORMAT TESPİTİ ────────────────────────────
// Faz 2: Asıl tespit tek tarih çözücüye (date-format-detector.js, katmanlı:
// header → oylama → delta) delege edildi. Buradaki tek ek katman, OCR'a özgü
// "gelecek tarih vetosu"dur: seçilen yorum okumaların çoğunu geleceğe
// atıyorsa tespit çevrilir. Dönen tespit bilgisi stats.dateFormat olarak
// frontend'e iner ve güven skoruna katılır.
function smartDateResolve(readings) {
    if (!readings || readings.length === 0) return null;

    function buildTimestamps(readings, interpretation) {
        return readings.map(r => {
            let month, day;
            if (r._isISO) {
                month = parseInt(r._rawP1);
                day = parseInt(r._rawP2);
            } else if (interpretation === 'p1_month') {
                month = parseInt(r._rawP1);
                day = parseInt(r._rawP2);
            } else {
                month = parseInt(r._rawP2);
                day = parseInt(r._rawP1);
            }
            if (month < 1 || month > 12 || day < 1 || day > 31) return null;

            const timeParts = r.time.split(':');
            return new Date(parseInt(r._rawYear), month - 1, day,
                parseInt(timeParts[0]) || 0,
                parseInt(timeParts[1]) || 0,
                parseInt(timeParts[2]) || 0
            ).getTime();
        }).filter(t => t !== null);
    }

    function futureCount(timestamps) {
        const now = Date.now() + 7 * 86400000;
        return timestamps.filter(t => t > now).length;
    }

    // Gün/ay sırası belirsiz (ISO olmayan) okumalardan tarih satırları kur
    const ambiguousLines = readings
        .filter(r => !r._isISO)
        .map(r => `${r._rawDate} ${r.time || ''}`);

    let detection;
    if (ambiguousLines.length === 0) {
        detection = { format: 'YMD', method: 'iso', confidence: 1, ambiguous: false };
    } else {
        detection = DateFormatDetector.detect(ambiguousLines);
    }

    // p1 = tarihin ortadaki olmayan ilk parçası: DMY'de gün, MDY'de ay.
    // 4 haneli yıl önde gelen (YMD) string'lerde p1 orta parça = ay'dır.
    let useP1AsMonth = detection.format === 'MDY' || detection.format === 'YMD';

    // Gelecek-tarih vetosu: seçilen yorum okumaların >%30'unu geleceğe atıyor
    // ve diğer yorum atmıyorsa, tespit yanlıştır → çevir.
    const tsChosen = buildTimestamps(readings, useP1AsMonth ? 'p1_month' : 'p1_day');
    const tsOther = buildTimestamps(readings, useP1AsMonth ? 'p1_day' : 'p1_month');
    if (futureCount(tsChosen) > readings.length * 0.3 && futureCount(tsOther) <= readings.length * 0.1) {
        useP1AsMonth = !useP1AsMonth;
        detection = {
            ...detection,
            format: useP1AsMonth ? 'MDY' : 'DMY',
            method: 'future-veto',
            confidence: 0.9,
            ambiguous: false
        };
        console.log(`   [TarihAlgo] Gelecek tarih vetosu: yorum çevrildi.`);
    }

    console.log(`   [TarihAlgo] Format: ${detection.format} (yöntem: ${detection.method}, güven %${Math.round(detection.confidence * 100)}${detection.ambiguous ? ', BELİRSİZ → TR varsayılanı DMY' : ''})`);
    console.log(`   [TarihAlgo] Seçilen yorum: ${useP1AsMonth ? 'p1=AY' : 'p1=GÜN'}`);

    readings.forEach(r => {
        let month, day;
        if (r._isISO) {
            month = r._rawP1;
            day = r._rawP2;
        } else if (useP1AsMonth) {
            month = r._rawP1;
            day = r._rawP2;
        } else {
            month = r._rawP2;
            day = r._rawP1;
        }
        r.date = `${r._rawYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    });

    return detection;
}


// ─── SCHEMA DISCOVERY PROMPT (Smart Hybrid v2.5 — Regex Discovery) ──────────────
const SCHEMA_PROMPT = `Sen bir soğuk zincir veri yapısı analiz uzmanısın. 
Bu belgenin yapısını analiz et ve deterministik bir parser için gereken şemayı çıkar.

GÖREV: 
1. Tablo yapısını keşfet (tarih, saat, sıcaklık sütunlarını bul).
2. Satırlardaki ayraçları ve veri sıralamasını tespit et.
3. Varsa eczane adını ve cihaz seri numarasını bul.

YALNIZCA şu JSON formatında cevap dön (başka hiçbir metin ekleme):
{
  "dateOrder": "dmy",
  "dateSep": ".",
  "timeSep": ":",
  "decimalSep": ",",
  "tempColIndex": 0,
  "hasAmbient": false,
  "pharmacyName": "Eczane Adı",
  "deviceBrand": "Marka",
  "deviceSerial": "SN12345",
  "dateFormat": "DD.MM.YYYY"
}

Kurallar:
- 'dateOrder': dmy (gün-ay-yıl), mdy (ay-gün-yıl), ymd (yıl-ay-gün).
- 'timeSep': Saat ayracı. Eğer rakamlar arasında ':' varsa mutlaka ':' seç. Sıcaklıktaki ondalık noktasıyla karıştırma.
- 'tempColIndex': Satırdaki kaçıncı sıcaklık değeri dolap sıcaklığı (0=ilk, 1=ikinci)? Dolap genelde 2-8°C, ortam 18-30°C'dir.
- SADECE JSON döndür, markdown code block kullanma, açıklama ekleme.`;


// ─── API: Schema Discovery (Sadece İlk Sayfa — Smart Hybrid v2) ───
app.post('/api/analyze-schema', upload.single('file'), async (req, res) => {
    const startTime = Date.now();

    if (!genAI) {
        return res.status(503).json({ success: false, error: 'Gemini API bağlantısı yok.' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Dosya yüklenmedi.' });
    }

    try {
        let pageBuffer = req.file.buffer;
        let pageCount = 1;

        // PDF ise hedef sayfayı çıkar
        if (req.file.mimetype === 'application/pdf') {
            const pdfDoc = await PDFDocument.load(req.file.buffer);
            pageCount = pdfDoc.getPageCount();

            let targetPageIndex = 0;
            if (req.body.targetPage) {
                const requestedPage = parseInt(req.body.targetPage);
                if (!isNaN(requestedPage) && requestedPage >= 1 && requestedPage <= pageCount) {
                    targetPageIndex = requestedPage - 1;
                }
            }

            const targetPagePdf = await PDFDocument.create();
            const [page] = await targetPagePdf.copyPages(pdfDoc, [targetPageIndex]);
            targetPagePdf.addPage(page);
            pageBuffer = Buffer.from(await targetPagePdf.save());

            console.log(`\n${'='.repeat(55)}`);
            console.log(`[SCHEMA] Sayfa ${targetPageIndex + 1}/${pageCount} cikarildi (${(pageBuffer.length / 1024).toFixed(0)}KB)`);
            console.log(`${'='.repeat(55)}`);
        }

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            generationConfig: { maxOutputTokens: 4096 }
        });

        const imagePart = {
            inlineData: {
                data: pageBuffer.toString('base64'),
                mimeType: req.file.mimetype
            }
        };

        const chunkStart = Date.now();
        const result = await model.generateContent([SCHEMA_PROMPT, imagePart]);
        const response = await result.response;
        const text = response.text();
        const elapsed = Date.now() - chunkStart;

        // Token kullanımı
        const usage = response.usageMetadata || {};
        const inputTokens = usage.promptTokenCount || 0;
        const outputTokens = usage.candidatesTokenCount || 0;
        const inputCost = (inputTokens / 1_000_000) * PRICE_IN;
        const outputCost = (outputTokens / 1_000_000) * PRICE_OUT;
        const totalCost = inputCost + outputCost;

        console.log(`   [OK] Schema yaniti alindi (${elapsed}ms)`);
        console.log(`   [TOK] Token: ${inputTokens} in + ${outputTokens} out = $${totalCost.toFixed(6)}`);

        // JSON'u parse et (markdown code block varsa temizle)
        let cleanText = text.trim();
        cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        let schema = {};
        if (jsonMatch) {
            try {
                schema = JSON.parse(jsonMatch[0]);
            } catch (parseErr) {
                console.error('   [UYARI] JSON parse hatasi:', parseErr.message);
                console.log('   Ham metin:', cleanText.substring(0, 500));
            }
        }

        const totalElapsed = Date.now() - startTime;
        console.log(`   [BILGI] Schema: dateOrder=${schema.dateOrder || '?'}, sep="${schema.dateSep || '?'}", tempCol=${schema.tempColIndex ?? '?'}, marka=${schema.deviceBrand || '?'}`);
        console.log(`   [SURE] Toplam: ${totalElapsed}ms\n`);

        res.json({
            success: true,
            schema,
            pageCount,
            tokens: {
                input: inputTokens,
                output: outputTokens,
                total: inputTokens + outputTokens
            },
            cost: {
                input: parseFloat(inputCost.toFixed(6)),
                output: parseFloat(outputCost.toFixed(6)),
                total: parseFloat(totalCost.toFixed(6)),
                totalTRY: parseFloat((totalCost * USD_TRY).toFixed(4))
            },
            elapsedMs: totalElapsed,
            rawText: text
        });

    } catch (err) {
        console.error('[HATA] Schema analiz hatasi:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        geminiReady: !!genAI,
        model: MODEL_NAME,
        timestamp: new Date().toISOString(),
        version: '3.2.0-hybrid'
    });
});

// ─── DATABASE API ROUTES ────────────────────────────────────

app.post('/api/save-analysis', async (req, res) => {
    try {
        const id = await db.saveAnalysis(req.body);

        // Faz 6: normalize edilmiş okuma serisini de sakla (özet yetmez) —
        // parser iyileştikçe eski belgeler yeniden işlenebilir.
        const series = req.body && req.body.readingsSeries;
        if (Array.isArray(series) && series.length > 0 && series.length <= 200000) {
            db.saveReadings(id, series, {
                count: series.length,
                drugName: req.body.drugName || '',
                files: req.body.files || []
            }).then(r => {
                console.log(`[OK] Analiz #${id}: ${r.count} ham okuma saklandi`);
            }).catch(e => {
                console.error('[UYARI] Ham okuma saklanamadi:', e.message);
            });
        }

        res.json({ success: true, id, message: 'Analiz sisteme kaydedildi.' });
    } catch (err) {
        console.error('[HATA] Kayit hatasi:', err.message);
        res.status(500).json({ success: false, error: 'Kayıt başarısız oldu.' });
    }
});

// Faz 6: saklanan ham seriyi geri ver (yeniden işleme / korpus için)
app.get('/api/analyses/:id/readings', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'Geçersiz id.' });
        const data = await db.getReadings(id);
        if (!data) return res.status(404).json({ success: false, error: 'Bu analiz için ham seri saklanmamış.' });
        res.json({ success: true, ...data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/recent-analyses', async (req, res) => {
    try {
        const analyses = await db.getRecentAnalyses(10);
        res.json({ success: true, data: analyses });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Veriler alınamadı.' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: 'İstatistikler alınamadı.' });
    }
});

// ─── AUDIT TRAIL API ─────────────────────────────────────────

app.post('/api/audit', async (req, res) => {
    try {
        const { type, action, details, user, tags } = req.body || {};
        if (!type || !action) {
            return res.status(400).json({ success: false, error: 'type ve action zorunlu.' });
        }
        const entry = await db.addAuditEntry({ type, action, details, user, tags });
        res.json({ success: true, ...entry });
    } catch (err) {
        console.error('[HATA] Audit kayit hatasi:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/audit', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
        const type = req.query.type || null;
        const rows = await db.getAuditLog(limit, type);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Audit log alınamadı.' });
    }
});

app.get('/api/audit/verify', async (req, res) => {
    try {
        const result = await db.verifyAuditChain();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Audit chain doğrulanamadı.' });
    }
});

// ─── DEVICE SERIAL DEDUP API ────────────────────────────────

app.get('/api/device-serial/check', async (req, res) => {
    try {
        const serial = req.query.serial;
        const fileHash = req.query.fileHash || '';
        if (!serial) {
            return res.status(400).json({ success: false, error: 'serial zorunlu.' });
        }
        const result = await db.checkDeviceSerial(serial, fileHash);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[HATA] Device serial check hatasi:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/device-serial', async (req, res) => {
    try {
        const { serial, pharmacy, fileHash, analysisId } = req.body || {};
        if (!serial || !fileHash) {
            return res.status(400).json({ success: false, error: 'serial ve fileHash zorunlu.' });
        }
        const result = await db.recordDeviceSerial({ serial, pharmacy, fileHash, analysisId });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[HATA] Device serial kayit hatasi:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── ŞABLON HAFIZASI API (Faz 4) ────────────────────────────
// Eşleştirme mantığı js/format-fingerprint.js'te — tarayıcı parmak izini
// hangi adımlarla üretiyorsa sunucu da aynı modülle eşleştirir.

app.post('/api/templates/match', async (req, res) => {
    try {
        const { fingerprint, headerTokens, rowSignature, producer, kind, brandHint } = req.body || {};
        if (!fingerprint) {
            return res.status(400).json({ success: false, error: 'fingerprint zorunlu.' });
        }
        const templates = await db.listTemplates(kind || null);
        const result = FormatFingerprint.matchTemplate(templates, {
            fingerprint, headerTokens, rowSignature, producer, kind, brandHint
        });
        if (result.match === 'exact') {
            db.touchTemplate(result.template.id).catch(() => {});
            console.log(`[SABLON] Kesin eslesme: #${result.template.id} ${result.template.brand || '(etiketsiz)'}${result.brandConflict ? ' [MARKA CELISKISI -> insan kuyrugu]' : ''}`);
        } else if (result.match === 'structural') {
            db.touchTemplate(result.template.id).catch(() => {});
            console.log(`[SABLON] Yapisal eslesme (satir deseni): #${result.template.id} ${result.template.brand || '(etiketsiz)'} -> ayni belge ailesi, otomatik uygulanir${result.brandConflict ? ' [MARKA CELISKISI -> insan kuyrugu]' : ''}`);
        } else if (result.match === 'fuzzy') {
            console.log(`[SABLON] Bulanik aday: #${result.template.id} ${result.template.brand || '(etiketsiz)'} (%${Math.round(result.similarity * 100)} benzer) -> onaysiz uygulanmaz`);
        }
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[HATA] Sablon eslestirme hatasi:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/templates', async (req, res) => {
    try {
        const { fingerprint, kind, brand, producer, headerTokens, rowSignature, schema, source, user } = req.body || {};
        if (!fingerprint || !kind || !schema) {
            return res.status(400).json({ success: false, error: 'fingerprint, kind ve schema zorunlu.' });
        }
        const saved = await db.saveTemplate({ fingerprint, kind, brand, producer, headerTokens, rowSignature, schema, source });
        console.log(`[SABLON] ${saved.updated ? 'Guncellendi' : 'Kaydedildi'}: #${saved.id} ${brand || '(etiketsiz)'} · ${kind} · kaynak: ${source || '?'}`);
        db.addAuditEntry({
            type: 'template',
            action: saved.updated ? 'Format şablonu güncellendi' : 'Format şablonu öğrenildi',
            details: `${brand || 'Etiketsiz marka'} · ${kind} · parmak izi ${String(fingerprint).slice(0, 12)}… · kaynak: ${source || '?'}`,
            user,
            tags: ['şablon', source || 'bilinmeyen']
        }).catch(() => {});
        res.json({ success: true, ...saved });
    } catch (err) {
        console.error('[HATA] Sablon kayit hatasi:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/templates', async (req, res) => {
    try {
        const rows = await db.listTemplates(req.query.kind || null);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Şablonlar alınamadı.' });
    }
});

app.delete('/api/templates/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Geçersiz şablon id.' });
        }
        const deleted = await db.deleteTemplate(id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Şablon bulunamadı.' });
        }
        console.log(`[SABLON] Silindi: #${id} ${deleted.brand || '(etiketsiz)'} · kullanim: ${deleted.useCount}`);
        db.addAuditEntry({
            type: 'template',
            action: 'Format şablonu silindi',
            details: `#${id} ${deleted.brand || 'Etiketsiz marka'} · ${deleted.kind} · ${deleted.useCount} kez kullanılmış · parmak izi ${String(deleted.fingerprint).slice(0, 12)}…`,
            user: (req.body && req.body.user) || undefined,
            tags: ['şablon', 'silme']
        }).catch(() => {});
        res.json({ success: true, deleted: { id: deleted.id, brand: deleted.brand } });
    } catch (err) {
        console.error('[HATA] Sablon silme hatasi:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── SUNUCUYU BAŞLAT ────────────────────────────────────────
// Yalnızca doğrudan çalıştırılınca (node server.js) port açılır; test
// (require) ederken saf parser fonksiyonlarına erişmek için açılmaz.

function start() {
    const geminiReady = initGemini();
    app.listen(PORT, () => {
        console.log('\n' + '='.repeat(60));
        console.log('  ColdChain AI Server v3.2.0-hybrid (Smart Chunking + SQLite)');
        console.log('='.repeat(60));
        console.log(`  > Adres: http://localhost:${PORT}`);
        console.log(`  > Gemini: ${geminiReady ? '[ HAZIR ]' : '[ API ANAHTARI EKSIK ]'}`);
        console.log(`  > Model: ${MODEL_NAME}`);
        console.log(`  > Ayar: ${PAGES_PER_CHUNK} sayfa/parca, 0 overlap`);
        console.log(`  > Dizin: ${path.normalize(__dirname)}`);
        console.log('='.repeat(60) + '\n');

        // Veritabanını Başlat
        db.initDB();
    });
}

if (require.main === module) {
    start();
}

// Faz 6: korpus/regresyon testleri saf OCR parser'larını burdan alır.
module.exports = {
    app,
    start,
    parseStructuredResponse,
    parseMarkdownResponse,
    smartDateResolve,
    splitRawDate
};
