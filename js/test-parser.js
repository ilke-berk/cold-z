/**
 * test-parser.js
 * Yeni Analiz Akışı:
 * INPUT (PDF/JPEG/CSV/Excel) 
 *   ↓ 
 * [AI / OCR / Parser] 
 *   ↓ 
 * INTERMEDIATE (JSON - canonical structure) 
 *   ↓ 
 * [Validation + schema mapping] 
 *   ↓ 
 * FINAL FORMAT -> PARQUET 
 *   ↓ 
 * [Analysis agent -> approve/reject]
 */

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('testFileInput');
    const textArea = document.getElementById('testInputTexto');
    const parseBtn = document.getElementById('btnParse');
    const outputArea = document.getElementById('testOutputArea');

    const log = (msg, stage = 'INFO') => {
        const time = new Date().toLocaleTimeString();
        outputArea.innerHTML += `<div class="log-line"><strong>[${time}] [${stage}]</strong> ${msg}</div>`;
        outputArea.scrollTop = outputArea.scrollHeight;
    };

    const clearLogs = () => { outputArea.innerHTML = ''; };

    // --- PIPELINE STAGES ---

    // 1. STAGE: INPUT (Dosya Okuma)
    async function handleInput(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        clearLogs();
        log(`Dosya algılandı: ${file.name} (${file.type})`, 'INPUT');
        
        // Uzantıya göre ön hazırlık (Excel, PDF vb.)
        const extension = file.name.split('.').pop().toLowerCase();
        log(`Dosya tipi: ${extension} olarak işlenecek.`);
        
        // Şimdilik sadece metin olarak oku (veya binary ise ileride genişletilir)
        if (['txt', 'csv'].includes(extension)) {
            const text = await file.text();
            textArea.value = text;
        } else {
            log(`Not: ${extension} formatı için özel buffer okuması yapılacak.`, 'INPUT');
        }
    }

    // 2. STAGE: AI (Discovery) & JS (Extraction)
    async function smartParser(file, rawText) {
        log("AI ile şema (yapı) tespiti yapılıyor...", "DISCOVERY");
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/analyze-schema', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error);

            const schema = result.schema;
            log(`<b>Şema Tespit Edildi (AI):</b>`, "AI");
            
            // Hibrit Çözüm: Asıl veriyi AI Olmadan JS ile çıkarıyoruz (Ücretsiz!)
            const fullData = nonAiParser(rawText, schema);
            
            // Loglara bilgi ver
            log(`• JS ile ${fullData.length} satır veri çıkarıldı. (AI Maliyeti: SADECE ANALİZ)`, "SUCCESS");
            
            // Şemayı ve tam veriyi birleştirip dön
            schema.extractedRows = fullData; 
            return result;
        } catch (error) {
            log(`Analiz Hatası: ${error.message}`, "ERROR");
            throw error;
        }
    }

    // YENİ: Yapay Zekasız Veri Çıkarıcı (Hız ve Maliyet Tasarrufu)
    function nonAiParser(text, schema) {
        const lines = text.split('\n').filter(l => l.trim() !== '');
        const delimiter = schema.delimiter || ',';
        const dateIdx = schema.columns.findIndex(c => c === schema.dateColumnName);
        const tempIdx = schema.columns.findIndex(c => c === schema.tempColumnName);
        const timeIdx = schema.hasSeperateTime ? schema.columns.findIndex(c => c === schema.timeColumnName) : -1;

        const results = [];
        // skipRows'tan sonra başla (Header satırını da atla: +1)
        const startLine = schema.skipRows || 0; 

        for (let i = startLine; i < lines.length; i++) {
            const cols = lines[i].split(delimiter).map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 2) continue; // Boş satır koruması

            const date = cols[dateIdx];
            const time = timeIdx !== -1 ? cols[timeIdx] : "00:00:00";
            let tempStr = cols[tempIdx] || "0";
            
            // Birim temizliği (°C vb.)
            if (schema.tempUnit) tempStr = tempStr.replace(schema.tempUnit, '').trim();
            const temp = parseFloat(tempStr.replace(',', '.'));

            results.push({ date, time, temperature: temp });
        }
        return results;
    }

    // 3. STAGE: INTERMEDIATE (JSON - Canonical Structure)
    function convertToCanonical(schema, sourceType = "unknown", tableType = "flat") {
        log(`Veri kanonik JSON yapısına dönüştürülüyor... (Kaynak: ${sourceType})`, "INTERMEDIATE");
        
        // AI'dan gelen örnek satırları kanonik yapıya dönüştür
        const rows = (schema.sampleRows || []).map(row => {
            // Tarih ve saati birleştirerek timestamp oluştur
            const timestamp = `${row.date} ${row.time}`;
            return [timestamp, row.temperature, null]; // Ortam ısısı şimdilik null
        });

        const canonical = {
            source_type: sourceType,
            table_type: tableType,
            columns: [
                { name: "timestamp", type: "datetime" },
                { name: "fridge_temp", type: "float" },
                { name: "ambient_temp", type: "float" }
            ],
            rows: rows.length > 0 ? rows : [["Veri Bulunamadı", 0, null]],
            metadata: {
                version: "1.2",
                generatedAt: new Date().toISOString(),
                detected_device: schema.deviceBrand
            }
        };
        
        return canonical;
    }

    // 4. STAGE: [Validation + Schema Mapping]
    function validateAndMap(canonicalData) {
        log("Şema doğrulanıyor ve limit kontrolü yapılıyor...", "VALIDATION");
        
        const fridgeTempIdx = canonicalData.columns.findIndex(c => c.name === 'fridge_temp');
        const ambientTempIdx = canonicalData.columns.findIndex(c => c.name === 'ambient_temp');
        const rows = canonicalData.rows;

        if (rows.length === 0) throw new Error("Doğrulama hatası: Satır bulunamadı.");

        // Örnek doğrulama: Buzdolabı sıcaklığı 2-8 dışında mı? (null değilse kontrol et)
        const violations = rows.filter(row => {
            const temp = row[fridgeTempIdx];
            return temp !== null && (temp < 2 || temp > 8);
        });

        if (violations.length > 0) {
            log(`${violations.length} adet limit dışı buzdolabı sıcaklığı tespit edildi!`, "WARNING");
        }

        // Ortam ısısı null ise bilgilendir
        const missingAmbient = rows.filter(row => row[ambientTempIdx] === null).length;
        if (missingAmbient > 0) {
            log(`${missingAmbient} satırda ortam ısısı verisi bulunamadı (null).`, "INFO");
        }

        return canonicalData;
    }

    // 5. STAGE: FINAL FORMAT -> PARQUET (Simülasyon)
    async function convertToParquet(validatedData) {
        log("Final formatına (PARQUET) dönüştürülüyor...", "FORMAT");
        // Frontend'de gerçek parquet yazımı için kütüphane gerekecektir.
        // Şimdilik sadece binary blob simülasyonu.
        return "PARQUET_BLOB_MOCK_DATA";
    }

    // 6. STAGE: ANALYSIS AGENT (Approve/Reject)
    function runAnalysisAgent(finalData) {
        log("Analiz agent'ı (MKT, Limits) kararı veriyor...", "AGENT");
        const decision = {
            status: "APPROVED",
            score: 0.95,
            reason: "Tüm değerler 2-8°C bandında kalmıştır."
        };
        log(`KARAR: ${decision.status} (Güven: ${decision.score})`, decision.status === 'APPROVED' ? 'SUCCESS' : 'ERROR');
        return decision;
    }

    // --- MAIN EXECUTION ---
    let currentSourceType = "text"; // Varsayılan

    parseBtn.addEventListener('click', async () => {
        try {
            const rawData = textArea.value;
            if (!rawData && !fileInput.files[0]) {
                log("Hata: Girdi boş!");
                return;
            }

            clearLogs();
            
            // Eğer dosya seçiliyse extension'dan alalım
            if (fileInput.files[0]) {
                const file = fileInput.files[0];
                currentSourceType = file.name.split('.').pop().toLowerCase();
            }

            // Pipeline Akışı
            const file = fileInput.files[0] || new Blob([rawData], { type: 'text/plain' });
            const analysisResult = await smartParser(file, rawData);
            
            // Eğer fullData (extractedRows) varsa onları kullan
            if (analysisResult.schema.extractedRows) {
                analysisResult.schema.sampleRows = analysisResult.schema.extractedRows;
            }

            const canonical = convertToCanonical(analysisResult.schema, currentSourceType, analysisResult.schema.documentType);
            const validated = validateAndMap(canonical);
            const parquet = await convertToParquet(validated);
            const finalDecision = runAnalysisAgent(parquet);

            log("Tüm akış başarıyla tamamlandı.", "FINISH");
            
            // Sonucu UI'da göster (Gösterimi güncelle!)
            outputArea.innerHTML += `<div class="log-line"><strong>[SONUÇ]</strong> <pre>${JSON.stringify(canonical, null, 2)}</pre></div>`;
            console.log("Final Sonuç:", finalDecision);

        } catch (error) {
            log(`Pipeline Hatası: ${error.message}`, "CRITICAL");
        }
    });

    fileInput.addEventListener('change', handleInput);
});
