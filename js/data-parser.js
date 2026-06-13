/**
 * ColdChain AI — Veri İşleme Aşamaları
 * Ham veriyi analiz için uygun formata dönüştüren akıllı sistem
 * 
 * Analiz Adımları:
 * 1. Belge Okuma      → Veri dosyasını satırlara çevir
 * 2. İçerik Tespiti   → Tarih, saat, sıcaklık değerlerini bul
 * 3. Zaman Eşleştirme → Tarih ve saat bilgisini birleştir
 * 4. Veri Temizleme   → Boş, kopuk veya okunmayan satırları çıkar
 * 5. Standartlaştırma → Tüm verileri ortak analiz formatına dönüştür
 * 6. Kronolojik Dizim → Verileri zamana göre sıraya diz
 * 7. Çift Kayıt Silme → Mükerrer (tekrar eden) kayıtları engelle
 * 8. Limit Kontrolü   → İlaç sıcaklık kurallarına olan uyumu denetle
 * 9. Künye Çıkarma    → Eczane adı, seri numarası gibi belge bilgilerini ayıkla
 */
const DataParser = {

    // ==========================================
    // ANA GİRİŞ NOKTASI
    // ==========================================
    async parse(file, brand = null, options = { resampling: true }) {
        const ext = Utils.getFileExtension(file.name);
        const onProgress = options.onProgress || (() => { });
        let rawData;

        // --- ADIM 0: CSV/TSV önce yapısal yoldan denenir ---
        // Sütun eşleştirme UI'ının seçimi yalnızca standardize() içinde okunur;
        // SmartParser'ın regex yolu columnMapping'i yok sayar. Bu yüzden CSV/TSV
        // Excel ile aynı yapısal hattan gider; regex yalnızca yapısal okuma
        // başarısız olursa (başlıksız / serbest metin dosyaları) devreye girer.
        if (['csv', 'tsv'].includes(ext)) {
            try {
                rawData = await this.readCSV(file);
                if (!rawData || !rawData.rows.length) throw new Error('Dosya boş veya okunamadı');
                const result = await this.standardize(rawData, brand, { ...options, sourcePath: 'csv' });
                return {
                    source: file.name,
                    brand,
                    rawData: rawData.rows,
                    parsedData: result.data,
                    rowCount: result.data.length,
                    columns: rawData.headers,
                    metadata: result.metadata,
                    pipeline: result.pipelineLog
                };
            } catch (err) {
                console.warn(`⚠️ ${file.name}: yapısal CSV okuma başarısız (${err.message}) → metin parser deneniyor`);
                rawData = null;
            }
        }

        // --- ADIM 1 & 2: Görsel veya taranmış PDF ise Smart Hybrid v2 AI Modelini Çağır ---
        // (Not: Smart Hybrid kendi içerisinde %100 Native Grid Extraction barındırır, ekstra readPDFText'e gerek yoktur)
        const aiExtensions = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'pdf', 'txt', 'csv', 'tsv', 'log', 'dat'];
        if (aiExtensions.includes(ext) || ext === 'pdf') {
            if (typeof SmartParser !== 'undefined') {
                console.log(`🧠 Smart Hybrid v2 ile işleniyor: ${file.name}`);
                const pipelineLog = [];
                const onLog = (msg) => {
                    pipelineLog.push({
                        step: msg.message,
                        status: msg.status === 'error' ? 'error' : msg.status === 'warning' ? 'warning' : 'success',
                        detail: msg.message,
                        icon: msg.icon || '🧠'
                    });
                };

                const smartResult = await SmartParser.parseSmart(file, onProgress, onLog, options);
                return {
                    source: file.name,
                    brand: brand || 'SmartHybrid',
                    rawData: smartResult.rawData || smartResult.parsedData,
                    parsedData: smartResult.parsedData,
                    rowCount: smartResult.rowCount,
                    columns: ['timestamp', 'temperature'],
                    metadata: smartResult.metadata,
                    pipeline: smartResult.pipeline || pipelineLog
                };
            } else if (typeof AIVision !== 'undefined') {
                console.log(`🤖 AI Vision ile işleniyor: ${file.name}`);
                return await AIVision.extract(file, onProgress, options);
            } else {
                console.warn('⚠️ AIVision ve SmartParser modülleri yüklü değil, fallback deneniyor');
            }
        }

        // --- ADIM 3: Klasik Excel/CSV İşlemleri ---
        switch (ext) {
            case 'xlsx': case 'xls':
                rawData = await this.readExcel(file);
                break;
            case 'csv':
                rawData = await this.readCSV(file);
                break;
            default:
                if (!rawData) throw new Error('Desteklenmeyen veya tanınmayan dosya formatı. Lütfen kontrol edip tekrar deneyin.');
        }

        if (!rawData || !rawData.rows.length) {
            throw new Error('Dosya boş veya okunamadı');
        }

        // Pipeline çalıştır
        const result = await this.standardize(rawData, brand, { ...options, sourcePath: ext === 'csv' ? 'csv' : 'excel' });

        return {
            source: file.name,
            brand,
            rawData: rawData.rows,
            parsedData: result.data,
            rowCount: result.data.length,
            columns: rawData.headers,
            metadata: result.metadata,
            pipeline: result.pipelineLog
        };
    },

    // ==========================================
    // PDF METİN ÇIKARMA (PDF.js kullanarak)
    // ==========================================
    async readPDFText(file) {
        return new Promise(async (resolve, reject) => {
            try {
                if (typeof pdfjsLib === 'undefined') {
                    reject(new Error('PDF.js yüklenmemiş'));
                    return;
                }

                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const rows = [];

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();

                    // 1. Tüm parçaları koordinatlarıyla topla
                    const items = textContent.items.map(item => ({
                        str: item.str,
                        x: item.transform[4],
                        y: item.transform[5]
                    }));

                    // 2. Y koordinatına göre (yukarıdan aşağı) sırala
                    items.sort((a, b) => b.y - a.y);

                    // 3. Yakınlık bazlı satır gruplama (8px tolerans)
                    const lines = [];
                    if (items.length > 0) {
                        let currentLine = [items[0]];
                        for (let j = 1; j < items.length; j++) {
                            const prev = items[j - 1];
                            const curr = items[j];

                            // Eğer bir önceki parça ile aradaki dikey fark 8px'den azsa aynı satırdır
                            if (Math.abs(prev.y - curr.y) <= 8) {
                                currentLine.push(curr);
                            } else {
                                lines.push(currentLine);
                                currentLine = [curr];
                            }
                        }
                        lines.push(currentLine);
                    }

                    // 4. Her satırı kendi içinde soldan sağa sırala ve işle
                    for (const lineItems of lines) {
                        lineItems.sort((a, b) => a.x - b.x);
                        const lineText = lineItems.map(item => item.str).join(' ');

                        // Veri ayıklama
                        const tempRegex = /(-?\d+[.,]\d+)\s*°?C?/;
                        const dateRegex = /(\d{1,2}[\/\-\.,]\d{1,2}[\/\-\.,]\d{2,4})/;
                        const timeRegex = /(\d{1,2}[:\.,]\d{2}(?::\d{2})?)/;

                        const dateMatch = lineText.match(dateRegex);
                        const tempMatch = lineText.match(tempRegex);
                        const timeMatch = lineText.match(timeRegex);

                        if (dateMatch && tempMatch) {
                            rows.push({
                                'Tarih': dateMatch[1],
                                'Saat': timeMatch ? timeMatch[1] : '',
                                'Sıcaklık': tempMatch[1]
                            });
                        }
                    }
                }

                if (rows.length > 0) {
                    resolve({ headers: ['Tarih', 'Saat', 'Sıcaklık'], rows });
                } else {
                    reject(new Error('PDF içinde veri tablosu bulunamadı (taranmış belge olabilir)'));
                }
            } catch (err) {
                reject(err);
            }
        });
    },

    // ==========================================
    // ADIM 1: HAM OKUMA
    // ==========================================
    async readExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array', cellDates: true });

                    // Tüm sayfaları değerlendir; logger ihracatlarında veri tablosu
                    // ilk sayfada olmayabilir → en çok veri satırı içeren sayfa seçilir.
                    let best = null;
                    for (const sheetName of wb.SheetNames) {
                        const sheet = wb.Sheets[sheetName];
                        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
                        if (!grid.length) continue;

                        // Başlık satırı her zaman 1. satır değildir: tablonun üstünde
                        // meta blok (cihaz adı, seri no, limitler) olabilir.
                        const headerIdx = this.findHeaderRow(grid);
                        const headers = grid[headerIdx].map((h, i) => String(h ?? '').trim() || `Sütun ${i + 1}`);
                        const rows = grid.slice(headerIdx + 1)
                            .filter(r => r.some(c => String(c ?? '').trim() !== ''))
                            .map(r => {
                                const obj = {};
                                headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
                                return obj;
                            });

                        if (!best || rows.length > best.rows.length) {
                            best = { headers, rows, sheetName, headerRow: headerIdx + 1 };
                        }
                    }

                    if (!best || !best.rows.length) { reject(new Error('Excel dosyası boş')); return; }
                    resolve(best);
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('Dosya okunamadı'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * İlk N satırı tarayıp "başlığa en çok benzeyen" satırı seçer.
     * Başlık satırı: çok sayıda dolu hücre + bilinen sütun adları + sayısal olmayan içerik.
     */
    findHeaderRow(grid) {
        const keywords = [
            'tarih', 'date', 'saat', 'time', 'zaman', 'timestamp', 'datetime',
            'sıcaklık', 'sicaklik', 'temp', 'celsius', '°c', 'nem', 'humidity',
            'ch1', 'ch 1', 'probe', 'sensor', 'değer', 'deger', 'value', 'reading', 'durum', 'status'
        ];
        const maxScan = Math.min(grid.length, 20);
        let bestIdx = 0;
        let bestScore = -Infinity;

        for (let i = 0; i < maxScan; i++) {
            const cells = (grid[i] || []).map(c => String(c ?? '').trim()).filter(c => c !== '');
            if (cells.length < 2) continue; // meta satırları genelde 1-2 hücre

            let score = cells.length;
            const lower = cells.map(c => c.toLowerCase());
            score += lower.filter(c => keywords.some(k => c.includes(k))).length * 10;
            // Veri satırları sayı/tarih/saat doludur; başlık hücreleri metin olur
            score -= cells.filter(c => /^[-+]?[\d.,:\/\s-]+$/.test(c)).length * 4;

            if (score > bestScore) { bestScore = score; bestIdx = i; }
        }
        return bestIdx;
    },

    async readCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    // Ayıraç tespiti: virgül, noktalı virgül, tab
                    const firstLine = text.split('\n')[0];
                    let delim = ',';
                    const commas = (firstLine.match(/,/g) || []).length;
                    const semis = (firstLine.match(/;/g) || []).length;
                    const tabs = (firstLine.match(/\t/g) || []).length;
                    if (semis > commas && semis > tabs) delim = ';';
                    else if (tabs > commas && tabs > semis) delim = '\t';

                    const { headers, data } = Utils.parseCSV(text, delim);
                    resolve({ headers, rows: data });
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('Dosya okunamadı'));
            reader.readAsText(file, 'utf-8');
        });
    },


    // ==========================================
    // ADIM 2-9: STANDARDİZASYON PİPELINE
    // ==========================================
    async standardize(rawData, brand, options = { resampling: true }) {
        const log = [];
        const { headers, rows } = rawData;

        // --- ADIM 2: Sütun Tespiti ---
        const colMap = options.columnMapping 
            ? { statusCol: null, ignoredCols: [], ...options.columnMapping }
            : await this.detectColumns(headers, rows);
        log.push({
            step: 'column_detection',
            message: `Sütunlar tespit edildi → Tarih: "${colMap.dateCol || '—'}", Saat: "${colMap.timeCol || '—'}", Sıcaklık: "${colMap.tempCol || '—'}", Nem: "${colMap.humidityCol || '—'}"`,
            details: colMap
        });

        if (!colMap.tempCol) {
            throw new Error('Sıcaklık sütunu bulunamadı. Sütunlar: ' + headers.join(', '));
        }

        if (!colMap.dateCol) {
            // Tarihsiz veri uydurmak (örn. tüm satırlara "şimdi" atamak) analizi
            // sessizce yanlışlatır; bunun yerine kullanıcıdan eşleştirme istenir.
            throw new Error('Tarih sütunu bulunamadı. Lütfen sütun eşleştirme panelinden tarih sütununu seçin. Sütunlar: ' + headers.join(', '));
        }

        // --- ADIM 3: Meta Bilgi Çıkarımı ---
        const metadata = this.extractMetadata(rows, headers, colMap);
        log.push({
            step: 'metadata_extraction',
            message: `Meta bilgi: ${metadata.pharmacyName ? 'Eczane: ' + metadata.pharmacyName : ''} ${metadata.deviceSerial ? '| Cihaz: ' + metadata.deviceSerial : ''}`.trim()
        });

        // --- ADIM 3.5: Tarih Format Tespiti (tek çözücü: date-format-detector) ---
        let resolvedFormat = null;
        let dateDetection = null;
        if (colMap.dateCol) {
            const samples = rows.slice(0, 200).map(r => String(r[colMap.dateCol] || '').trim()).filter(s => s.length > 5);
            dateDetection = Utils.resolveDateFormatDetailed(samples);
            if (dateDetection.ambiguous) {
                // Belirsizlikte parseDate zaten DMY varsayar; bayrak güven skoruna iner.
                log.push({ step: 'date_resolution', message: `Tarih formatı kesin tespit edilemedi (yöntem: ${dateDetection.method}) → TR varsayılanı GG.AA.YYYY kullanılacak`, icon: '📅', status: 'warning' });
            } else {
                resolvedFormat = dateDetection.formatHint;
                log.push({ step: 'date_resolution', message: `Tarih formatı tespit edildi: ${resolvedFormat} (yöntem: ${dateDetection.method}, güven %${Math.round(dateDetection.confidence * 100)})`, icon: '📅' });
            }
        }

        // --- ADIM 4-5: Dönüştürme + Temizleme ---
        let data = [];
        let skipped = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Sıcaklık parse
            const temp = this.parseTemperature(row[colMap.tempCol]);
            if (temp === null || isNaN(temp)) {
                skipped++;
                continue;
            }

            // Timestamp oluştur (ayrı tarih+saat veya birleşik)
            const ts = this.buildTimestamp(row, colMap, resolvedFormat);
            if (!ts || isNaN(ts.getTime())) {
                skipped++;
                continue;
            }

            // IR satır şekli: {timestamp, temperature, humidity?, confidence, rowIndex}
            // (yapısal yolda hücreler deterministik okunur → confidence 1)
            const entry = {
                timestamp: ts,
                temperature: parseFloat(temp.toFixed(2)),
                confidence: 1,
                rowIndex: i
            };

            // Nem varsa ekle
            if (colMap.humidityCol && row[colMap.humidityCol]) {
                const hum = parseFloat(String(row[colMap.humidityCol]).replace(',', '.'));
                if (!isNaN(hum) && hum >= 0 && hum <= 100) {
                    entry.humidity = hum;
                }
            }

            data.push(entry);
        }

        log.push({
            step: 'parsing',
            message: `${rows.length} satırdan ${data.length} geçerli kayıt çıkarıldı. ${skipped} satır atlandı.`
        });

        // Şablon hafızası (Faz 4): sütun imzasından deterministik parmak izi.
        // Analiz tamamlanınca bu imza + onaylı eşleştirme şablon olarak kaydedilir;
        // aynı imzalı sonraki dosyalar eşleştirmeyi hazır bulur.
        let fingerprint = options.fingerprint || null;
        if (!fingerprint && typeof FormatFingerprint !== 'undefined') {
            try { fingerprint = await FormatFingerprint.tabularFingerprint(headers); } catch (e) {}
        }

        // IR belge düzeyi blok: kaynak yol, şema, kayıp sayıları, tarih-format güveni.
        // postProcess bu sinyallerden tek güven skorunu hesaplar.
        metadata.extraction = {
            sourcePath: options.sourcePath || 'structured',
            schema: colMap,
            totalCandidates: rows.length,
            skippedRows: skipped,
            removedYearOutliers: 0,
            dateFormat: dateDetection,
            fingerprint: fingerprint || undefined,
            template: options.templateMatch || undefined
        };

        // ADIM 6-10: Sıralama, Deduplikasyon, Validasyon ve Resampling
        return this.postProcess(data, log, metadata, options);
    },

    /**
     * Ortak Post-Process Pipeline (Tüm veri kaynakları için: Excel, AI, CSV)
     */
    postProcess(data, log, metadata, options = { resampling: true }) {
        if (!data || data.length === 0) return { data: [], metadata, pipelineLog: log };

        // --- ÖN ADIM: Tarih Format Düzeltmesi ---
        // NOT: Tarih formatı artık backend'deki smartDateResolve() tarafından
        // global medyan analizi ile belirleniyor. Eski satır bazlı flip devre dışı.
        // (Backend tüm okumaları topladıktan sonra DD.MM vs MM.DD karşılaştırması yapar)

        // --- ADIM 6: Kronolojik Sıralama ---
        data.sort((a, b) => a.timestamp - b.timestamp);
        log.push({ step: 'Zaman Düzenlemesi', message: 'Tüm sıcaklık okumaları tarih ve saat sırasına dizildi', icon: '⏱️' });

        // --- ADIM 7: Deduplikasyon ---
        const beforeDedup = data.length;
        data = this.removeDuplicates(data);
        const dupCount = beforeDedup - data.length;
        if (dupCount > 0) {
            log.push({ step: 'Çift Kayıt Kontrolü', message: `${dupCount} adet cihaz tarafında yanlış veya mükerrer basılmış kopya değer ayıklandı`, icon: '🗑️' });
        }

        // --- ADIM 8: Veri Kalite Kontrolü (Validation) ---
        const validation = this.validateData(data);
        metadata.validation = validation;

        log.push({
            step: 'Veri Bütünlüğü Kontrolü',
            message: validation.warnings.length > 0 ? `Dikkat çeken noktalar: ${validation.warnings.join(', ')}` : 'Sıcaklık değerleri tutarlı, kopuk okuma tespiti temiz.',
            icon: '✔'
        });

        // Aşırı değerleri işaretle ama çıkarma (bilimsel analiz için)
        if (validation.outliers > 0) {
            data.forEach(d => {
                if (d.temperature < -50 || d.temperature > 60) {
                    d._outlier = true;
                }
            });
        }

        // --- ADIM 8.5: Güven Skoru (IR doğrulayıcısı, Faz 2) ---
        // Resampling'den ÖNCE hesaplanır: resampling bilinçli seyreltmedir,
        // çıkarım kalitesi kaybı değildir.
        if (metadata && metadata.extraction && typeof ConfidenceScore !== 'undefined') {
            const ext = metadata.extraction;
            ext.dedupRemoved = (ext.dedupRemoved || 0) + dupCount;
            ext.parsedRows = data.length;
            ext.confidence = ConfidenceScore.compute({
                ...ext,
                temperatures: data.map(d => d.temperature),
                rowConfidences: data.map(d => (typeof d.confidence === 'number' ? d.confidence : 1))
            });
            const c = ext.confidence;
            log.push({
                step: 'Güven Skoru',
                message: c.needsReview
                    ? `Çıkarım güven skoru ${c.score}/100 — insan incelemesi önerilir (${c.factors.map(f => f.detail).join('; ') || 'eşik altı'})`
                    : `Çıkarım güven skoru ${c.score}/100 — otomatik devam için yeterli.`,
                icon: '🎯',
                status: c.needsReview ? 'warning' : 'success'
            });
        }

        // --- ADIM 9: 1 Saatlik Standardizasyon (Hourly Resampling) ---
        const beforeResample = data.length;
        if (options.resampling && data.length > 0) {
            const resampled = [];
            let nextTargetTime = data[0].timestamp.getTime();

            for (const item of data) {
                if (item.timestamp.getTime() >= nextTargetTime) {
                    resampled.push(item);
                    nextTargetTime = item.timestamp.getTime() + 3600000; // +1 saat
                }
            }
            data = resampled;
            metadata.resampling = { before: beforeResample, after: data.length };
            log.push({
                step: 'Saatlik Filtreleme',
                message: `Saatlik özet grafik için ölçümler süzüldü: ${beforeResample} ham veriden ${data.length} ana ölçü noktası seçildi.`
            });
        } else if (!options.resampling) {
            log.push({
                step: 'Detaylı İnceleme Onayı',
                message: `Hiçbir veri elenmedi, dosyadaki tüm ${data.length} adet detaylı sıcaklık değişimi milimesine kadar analize alındı.`,
                icon: '📊'
            });
        }

        // --- ADIM 10: Zaman Aralığı Özeti ---
        if (data.length > 1) {
            const span = data[data.length - 1].timestamp - data[0].timestamp;
            const intervalMs = span / (data.length - 1);
            const intervalMin = (intervalMs / 60000).toFixed(0);
            log.push({
                step: 'Kayıt Özeti',
                message: `Cihaz ${Utils.formatDuration(span / 60000)} boyunca ortamdaydı. Okumalar ortalama ${intervalMin} dakikada bir yapılmış. (İlk Kayıt: ${Utils.formatDateTime(data[0].timestamp)} | Son Kayıt: ${Utils.formatDateTime(data[data.length - 1].timestamp)})`,
                icon: '📝'
            });
        }

        return { data, metadata, pipelineLog: log };
    },

    // ==========================================
    // SÜTUN TESPİT MOTORU
    // ==========================================
    async detectColumns(headers, rows = []) {
        const norm = h => h.toLowerCase().trim().replace(/[()°\s_-]/g, '');

        // Tarih pattern'leri
        const datePatterns = [
            'tarih', 'date', 'datetime', 'date/time', 'date_time',
            'timestamp', 'kayıttarihi', 'kayit_tarihi', 'reading date',
            'readingtime', 'kayıt zamanı', 'logdate', 'recorded'
        ];

        const dateRejectPatterns = ['başlangıç', 'bitiş', 'start', 'end', 'set', 'limit', 'özel', 'ozel'];

        // Saat pattern'leri
        const timePatterns = [
            'saat', 'time', 'zaman', 'clock', 'readingtime', 'kayıt saati', 'hora'
        ];

        // Sıcaklık pattern'leri
        const primaryTempPatterns = [
            'sıcaklık', 'sicaklik', 'temperature', 'temperature_c',
            'temp', 'tempc', 'celsius', 'reading', 'ch1', 'ch 1', 'channel1', 'channel 1',
            'probe1', 'sensor1', 'tempavg', 'meantemp'
        ];

        const rejectPatterns = ['limit', 'setpoint', 'eşik', 'esik', 'min', 'max', 'çalışma', 'calisma', 'range', 'unit', 'birim', 'status', 'durum', 'alarm', 'ortam', 'ambient', 'dis', 'extern', 'nem', 'humidity', '%'];

        const findCandidates = (patterns) => {
            const matches = [];
            for (const h of headers) {
                const n = norm(h);
                // Tam eşleşme (Tam eşleşenleri başa koy)
                if (patterns.some(p => n === p.replace(/[\s_-]/g, ''))) {
                    matches.unshift(h);
                } else if (patterns.some(p => n.includes(p.replace(/[\s_-]/g, '')))) {
                    // Kısmi eşleşme
                    if (!matches.includes(h)) matches.push(h);
                }
            }
            return matches;
        };

        const dateCandidates = findCandidates(datePatterns).filter(h => {
            const n = norm(h);
            return !dateRejectPatterns.some(p => n.includes(p));
        });
        const timeCandidates = findCandidates(timePatterns);

        // Sıcaklık adayları: Tarih ve Saat olmayan, rejectPattern içermeyen sütunlar
        let tempCandidates = headers.filter(h => {
            const n = norm(h);
            return !dateCandidates.includes(h) && 
                   !timeCandidates.includes(h) && 
                   !rejectPatterns.some(p => n.includes(p));
        });

        // Eğer yukarıdaki filtreleme ile hiç aday kalmadıysa (çok katı olduysa), 
        // tarih ve saat olmayanlara geri dön ama yine de red kelimelerini kontrol et
        if (tempCandidates.length === 0) {
            tempCandidates = headers.filter(h => {
                const n = norm(h);
                return !dateCandidates.includes(h) && !timeCandidates.includes(h) && !['tarih', 'saat', 'time'].some(p => n.includes(p));
            });
        }

        // --- Seçim Fonksiyonu (Otomatik veya Async Prompt) ---
        const pick = (name, candidates, patterns = [], rows = []) => {
            if (candidates.length === 0) return null;

            // Eğer Sıcaklık tespiti yapılıyorsa ve birden fazla aday varsa, veriye bakarak puanla
            if (name === 'Sıcaklık' && candidates.length > 1 && rows.length > 0) {
                const scores = candidates.map(c => {
                    let score = 0;
                    const samples = rows.slice(0, 50).map(r => this.parseTemperature(r[c])).filter(v => v !== null);
                    if (samples.length > 0) {
                        const inRange = samples.filter(v => v >= 2 && v <= 8).length / samples.length;
                        score += inRange * 200; // 2-8 derece arası ise çok yüksek puan
                        
                        // Varyans kontrolü (0.1 - 5 derece arası normal buzdolabı hareketidir)
                        const sorted = [...samples].sort((a,b) => a-b);
                        const spread = sorted[sorted.length-1] - sorted[0];
                        if (spread > 0.1 && spread < 10) score += 50;
                    }
                    if (patterns.some(p => norm(c).includes(p.replace(/[\s_-]/g, '')))) score += 100;
                    return { candidate: c, score };
                });
                
                scores.sort((a, b) => b.score - a.score);
                // Eğer en iyi adayın puanı diğerlerinden belirgin şekilde yüksekse (veya tek makul adaysa) sorma
                if (scores[0].score > scores[1].score + 50 || scores[0].score > 150) {
                    return scores[0].candidate;
                }
            }

            // Tek aday varsa ve bu aday bilinen bir pattern içeriyorsa sorma, doğrudan seç
            if (candidates.length === 1) {
                const n = norm(candidates[0]);
                if (patterns.length === 0 || patterns.some(p => n.includes(p.replace(/[\s_-]/g, '')))) {
                    return candidates[0];
                }
            }

            // Birden fazla aday varsa veya tek aday ama şüpheliyse otomatik tahmini seç
            if (candidates.length > 1 || (candidates.length === 1 && patterns.length > 0)) {
                // Öncelikli olanı bul (tam eşleşme veya en çok benzeyen)
                const defaultIdx = candidates.findIndex(c =>
                    patterns.some(k => norm(c).includes(k.replace(/[\s_-]/g, '')))
                ) + 1 || 1;

                // Eğer tek aday varsa ve biz yine de kontrol ediyorsak
                if (candidates.length === 1 && patterns.some(k => norm(candidates[0]).includes(k.replace(/[\s_-]/g, '')))) {
                    return candidates[0]; // Güçlü eşleşme
                }

                // window.prompt yerine otomatik olarak en iyi aday seçilir. Kullanıcı UI'dan düzenleyebilir.
                return candidates[defaultIdx - 1] || candidates[0];
            }
            return candidates[0];
        };

        return {
            dateCol: pick('Tarih', dateCandidates, datePatterns),
            timeCol: pick('Saat', timeCandidates, timePatterns),
            tempCol: pick('Sıcaklık', tempCandidates, primaryTempPatterns, rows),
            humidityCol: pick('Nem', findCandidates(['nem', 'humidity', 'rh'])),
            statusCol: pick('Durum', findCandidates(['status', 'durum', 'alarm'])),
            ignoredCols: headers.filter(h => {
                const n = norm(h);
                return ['serino', 'serialno', 'serial', 'seri', 'logger', 'loggerid',
                    'ad', 'name', 'eczane', 'pharmacy', 'drugname', 'drug_name',
                    'ilac', 'ilaç', 'marka', 'brand', 'model'
                ].some(p => n.includes(p));
            })
        };
    },



    // ==========================================
    // TIMESTAMP İNŞA MOTORU
    // ==========================================
    buildTimestamp(row, colMap, formatHint = null) {
        const dateCol = colMap.dateCol;
        const timeCol = colMap.timeCol;

        // Durum 1: Tek birleşik sütun (date+time bir arada)
        if (dateCol && !timeCol) {
            return this.parseDate(row[dateCol], formatHint);
        }

        // Durum 2: Tarih ve Saat ayrı sütunlarda
        if (dateCol && timeCol) {
            const dateVal = String(row[dateCol] || '').trim();
            const timeVal = String(row[timeCol] || '').trim();

            if (!dateVal) return null;

            // Saat boşsa sadece tarihi kullan
            if (!timeVal) {
                return this.parseDate(dateVal, formatHint);
            }

            // Tarih + Saat birleştir
            return this.parseDateAndTime(dateVal, timeVal, formatHint);
        }

        // Durum 3: Hiç tarih sütunu yok → timestamp uydurma, satırı geçersiz say
        return null;
    },

    parseDateAndTime(dateStr, timeStr, formatHint = null) {
        // GG/AA/YYYY veya G/A/YYYY formatı (Ayraçlar: / - . ,)
        const dm = dateStr.match(/^(\d{1,2})[\/\-\.,](\d{1,2})[\/\-\.,](\d{2,4})$/);
        if (dm) {
            let day, month, year;
            year = parseInt(dm[3], 10);
            if (year < 100) year += 2000;

            if (formatHint === 'MM.DD.YYYY') {
                month = parseInt(dm[1], 10) - 1;
                day = parseInt(dm[2], 10);
            } else {
                day = parseInt(dm[1], 10);
                month = parseInt(dm[2], 10) - 1;
            }

            // Saat parse: HH:MM:SS veya H:MM:SS
            const tm = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (tm) {
                return new Date(year, month, day, parseInt(tm[1]), parseInt(tm[2]), parseInt(tm[3] || 0));
            }
            // Saat okunamazsa sadece tarih
            return new Date(year, month, day);
        }

        // Diğer formatlar: birleştirip genel parse'a gönder
        const combined = dateStr + ' ' + timeStr;
        return this.parseDate(combined, formatHint);
    },

    parseDate(value, formatHint = null) {
        if (!value) return null;
        if (value instanceof Date && !isNaN(value.getTime())) return value;

        const str = String(value).trim();
        if (!str) return null;

        // ISO 8601: 2024-05-20T08:00:00 veya 2024-05-20 08:00:00
        let d = new Date(str);
        if (!isNaN(d.getTime()) && str.match(/^\d{4}[-\/]/)) return d;

        // DD/MM/YYYY HH:MM:SS (Ayraçlar: / - . ,)
        const full = str.match(/^(\d{1,2})[\/\-\.,](\d{1,2})[\/\-\.,](\d{2,4})\s+(\d{1,2})[:\.,](\d{2})(?::(\d{2}))?$/);
        if (full) {
            let yr = parseInt(full[3], 10);
            if (yr < 100) yr += 2000;

            let day, month;
            if (formatHint === 'MM.DD.YYYY') {
                month = parseInt(full[1], 10) - 1;
                day = parseInt(full[2], 10);
            } else {
                day = parseInt(full[1], 10);
                month = parseInt(full[2], 10) - 1;
            }

            return new Date(yr, month, day,
                parseInt(full[4], 10), parseInt(full[5], 10), parseInt(full[6] || 0, 10));
        }

        // DD/MM/YYYY (sadece tarih) (Ayraçlar: / - . ,)
        const dateOnly = str.match(/^(\d{1,2})[\/\-\.,](\d{1,2})[\/\-\.,](\d{2,4})$/);
        if (dateOnly) {
            let yr = parseInt(dateOnly[3], 10);
            if (yr < 100) yr += 2000;

            let day, month;
            if (formatHint === 'MM.DD.YYYY') {
                month = parseInt(dateOnly[1], 10) - 1;
                day = parseInt(dateOnly[2], 10);
            } else {
                day = parseInt(dateOnly[1], 10);
                month = parseInt(dateOnly[2], 10) - 1;
            }
            return new Date(yr, month, day);
        }

        // Excel seri numarası
        const num = parseFloat(str);
        if (!isNaN(num) && num > 40000 && num < 55000) {
            return new Date((num - 25569) * 86400000);
        }

        // Son çare: native Date parse
        d = new Date(str);
        if (!isNaN(d.getTime())) return d;

        return null;
    },

    // ==========================================
    // SICAKLIK PARSE
    // ==========================================
    parseTemperature(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return value;

        let str = String(value).trim();
        // "4,2°C" → "4.2" | "-1.2 °C" → "-1.2"
        str = str.replace(/°[CF]?\s*$/i, '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(str);

        // Makul aralık kontrolü: -80°C ile +60°C arası (ultra-soğuk dahil)
        if (!isNaN(num) && num >= -80 && num <= 60) {
            return num;
        }

        return null;
    },

    // ==========================================
    // DEDUPLİKASYON
    // ==========================================
    removeDuplicates(data) {
        const seen = new Set();
        return data.filter(d => {
            // Aynı timestamp + aynı sıcaklık = duplikat
            const key = d.timestamp.getTime() + '_' + d.temperature;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },

    // ==========================================
    // VALİDASYON
    // ==========================================
    validateData(data) {
        const result = {
            valid: 0,
            outliers: 0,
            warnings: [],
            gaps: [],
            hasCriticalGap: false,
            isFrequencyIssue: false,
            avgGapMin: 0,
            mostCommonGapMin: 0
        };
        let totalGapMin = 0;
        const gapCounts = {};

        // İLK GEÇIŞ: Tüm aralıkları hesapla ve en yaygın aralığı (mod) bul
        const allGapsMin = [];
        for (let i = 1; i < data.length; i++) {
            const gap = data[i].timestamp - data[i - 1].timestamp;
            const gapMin = gap / 60000;
            allGapsMin.push(gapMin);
            totalGapMin += gapMin;

            const roundedGap = Math.round(gapMin);
            gapCounts[roundedGap] = (gapCounts[roundedGap] || 0) + 1;
        }

        // En yaygın kayıt aralığını (mod) bul
        let maxCount = 0;
        let mostCommonGap = 60; // varsayılan 60 dk
        for (const [gapVal, count] of Object.entries(gapCounts)) {
            if (count > maxCount) {
                maxCount = count;
                mostCommonGap = parseInt(gapVal, 10);
            }
        }
        result.mostCommonGapMin = mostCommonGap;

        if (data.length > 1) {
            result.avgGapMin = Math.round(totalGapMin / (data.length - 1));
        }

        // DİNAMİK EŞİK: En yaygın aralığın 1.8 katı (minimum 90 dk)
        // Bu sayede saatlik verilerdeki doğal kaymalar (60-65 dk) gap olarak algılanmaz
        const gapThresholdMin = Math.max(mostCommonGap * 1.8, 90);
        console.log(`[validateData] Mod aralık: ${mostCommonGap} dk, Gap eşiği: ${gapThresholdMin.toFixed(0)} dk`);

        // İKİNCİ GEÇIŞ: Değerleri kontrol et ve dinamik eşiğe göre boşluk tespit et
        for (let i = 0; i < data.length; i++) {
            const d = data[i];

            // Aşırı değer kontrolü
            if (d.temperature < -50 || d.temperature > 50) {
                result.outliers++;
            } else {
                result.valid++;
            }

            // Zaman boşluğu kontrolü (dinamik eşik ile)
            if (i > 0) {
                const gapMin = allGapsMin[i - 1];
                if (gapMin > gapThresholdMin) {
                    result.gaps.push({
                        start: data[i - 1].timestamp,
                        end: d.timestamp,
                        minutes: Math.round(gapMin)
                    });
                    result.hasCriticalGap = true;
                }
            }
        }

        // Frekans kontrolü
        if (data.length > 1) {
            if (result.hasCriticalGap) {
                result.isFrequencyIssue = result.gaps.every(g => Math.abs(g.minutes - result.avgGapMin) < (result.avgGapMin * 0.1));
            }
            if (result.mostCommonGapMin > 120) {
                result.isFrequencyIssue = true;
            }
        }

        if (result.outliers > 0) {
            result.warnings.push(`${result.outliers} aşırı değer bulundu`);
        }
        if (result.gaps.length > 0) {
            result.warnings.push(`${result.gaps.length} büyük zaman boşluğu tespit edildi`);
        }
        if (data.length < 3) {
            result.warnings.push('Çok az veri noktası — analiz güvenilirliği düşük');
        }

        return result;
    },

    // ==========================================
    // META BİLGİ ÇIKARIMI
    // ==========================================
    extractMetadata(rows, headers, colMap) {
        const meta = {};
        const norm = h => h.toLowerCase().trim().replace(/[\s_-]/g, '');

        // İlk satırdan meta bilgi çıkar
        const firstRow = rows[0];

        for (const h of headers) {
            const n = norm(h);
            const val = String(firstRow[h] || '').trim();
            if (!val) continue;

            // Eczane / İsim
            if (['ad', 'name', 'eczane', 'pharmacy'].some(p => n.includes(p))) {
                meta.pharmacyName = val;
            }
            // Seri No / Cihaz ID
            if (['serino', 'serialno', 'serial', 'seri', 'loggerid', 'logger_id', 'deviceid'].some(p => n.includes(p))) {
                meta.deviceSerial = val;
            }
            // İlaç adı
            if (['drugname', 'drug_name', 'ilac', 'ilaç', 'ilacadi'].some(p => n.includes(p))) {
                meta.drugName = val;
            }
        }

        return meta;
    }
};
