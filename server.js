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
app.use(express.static(path.join(__dirname)));
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

        // ─── HER CHUNK'I SIRAYLA İŞLE ───────────────────────
        console.log(`🤖 ${chunks.length} parça işleniyor (model: ${MODEL_NAME})...\n`);

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            generationConfig: {
                maxOutputTokens: 65536,
            }
        });

        let allReadings = [];
        let consolidatedMetadata = {};
        let totalLowConfidence = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalAIClaimed = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunkStart = Date.now();
            console.log(`   ── Parça ${i + 1}/${chunks.length} ──`);

            const imagePart = {
                inlineData: {
                    data: chunks[i].toString('base64'),
                    mimeType: req.file.mimetype
                }
            };

            const result = await model.generateContent([EXTRACTION_PROMPT, imagePart]);
            const response = await result.response;
            const text = response.text();
            const chunkElapsed = Date.now() - chunkStart;

            // Token kullanımı
            const usage = response.usageMetadata || {};
            const inputTokens = usage.promptTokenCount || 0;
            const outputTokens = usage.candidatesTokenCount || 0;
            totalInputTokens += inputTokens;
            totalOutputTokens += outputTokens;

            // Parse et
            const parsed = parseMarkdownResponse(text);
            totalAIClaimed += (parsed.aiClaimedTotal || parsed.readings.length);

            console.log(`      [OK] ${parsed.readings.length} satir bulundu (AI iddiasi: ${parsed.aiClaimedTotal || '?'})`);
            console.log(`      [TOK] Token: ${inputTokens.toLocaleString()} in + ${outputTokens.toLocaleString()} out | ${chunkElapsed}ms`);

            // Sonuçları birleştir
            allReadings = allReadings.concat(parsed.readings);
            Object.assign(consolidatedMetadata, parsed.metadata);
            totalLowConfidence += parsed.lowConfidenceCount;

            // Rate limit koruması: chunk'lar arası 500ms bekle
            if (i < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
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

        // ─── TARİH FORMAT TESPİTİ ───────────────────────────
        console.log(`\n   -- TARIH FORMAT ANALIZI --`);
        smartDateResolve(allReadings);

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


// ─── MARKDOWN PARSE MOTORU ───────────────────────────────────

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

        // ── ADIM 4: Tarih parçalarını kaydet ──
        const dMatch = cells[dateIdx].match(dateRegex)[0];
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
function smartDateResolve(readings) {
    if (!readings || readings.length === 0) return;

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

    function medianGap(timestamps) {
        if (timestamps.length < 2) return Infinity;
        const sorted = [...timestamps].sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < sorted.length; i++) {
            gaps.push(Math.abs(sorted[i] - sorted[i - 1]));
        }
        gaps.sort((a, b) => a - b);
        return gaps[Math.floor(gaps.length / 2)];
    }

    function futureCount(timestamps) {
        const now = Date.now() + 7 * 86400000;
        return timestamps.filter(t => t > now).length;
    }

    const tsA = buildTimestamps(readings, 'p1_month');
    const tsB = buildTimestamps(readings, 'p1_day');

    const medianA = medianGap(tsA);
    const medianB = medianGap(tsB);
    const futureA = futureCount(tsA);
    const futureB = futureCount(tsB);

    console.log(`   [TarihAlgo] Yorum A (p1=AY):  medyan=${(medianA / 60000).toFixed(0)} dk, gelecek=${futureA}`);
    console.log(`   [TarihAlgo] Yorum B (p1=GÜN): medyan=${(medianB / 60000).toFixed(0)} dk, gelecek=${futureB}`);

    let useP1AsMonth;
    if (futureA > readings.length * 0.3 && futureB <= readings.length * 0.1) {
        useP1AsMonth = false;
        console.log(`   [TarihAlgo] Gelecek tarih tespiti: Yorum A reddedildi.`);
    } else if (futureB > readings.length * 0.3 && futureA <= readings.length * 0.1) {
        useP1AsMonth = true;
        console.log(`   [TarihAlgo] Gelecek tarih tespiti: Yorum B reddedildi.`);
    } else {
        useP1AsMonth = medianA <= medianB;
    }

    console.log(`   [TarihAlgo] Seçilen format: ${useP1AsMonth ? 'p1=AY' : 'p1=GÜN'}`);

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
        res.json({ success: true, id, message: 'Analiz sisteme kaydedildi.' });
    } catch (err) {
        console.error('[HATA] Kayit hatasi:', err.message);
        res.status(500).json({ success: false, error: 'Kayıt başarısız oldu.' });
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

// ─── SUNUCUYU BAŞLAT ────────────────────────────────────────

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
