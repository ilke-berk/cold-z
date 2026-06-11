/**
 * ColdChain AI — Smart Hybrid Parser v4.0 (Universal Reader Edition)
 */
var SmartParser = (function () {
    function cleanYearOutliers(data) {
        if (!data || data.length === 0) return data;
        const yearCounts = {};
        for (const item of data) {
            const y = new Date(item.timestamp).getFullYear();
            if (!isNaN(y)) {
                yearCounts[y] = (yearCounts[y] || 0) + 1;
            }
        }
        let maxCount = 0;
        let modeYear = new Date().getFullYear();
        for (const [y, count] of Object.entries(yearCounts)) {
            if (count > maxCount) {
                maxCount = count;
                modeYear = parseInt(y);
            }
        }
        const minYear = modeYear - 1;
        const maxYear = modeYear + 1;
        return data.filter(item => {
            const y = new Date(item.timestamp).getFullYear();
            return y >= minYear && y <= maxYear;
        });
    }

    return {
        SCHEMA_ENDPOINT: '/api/analyze-schema',
        AI_ENDPOINT: '/api/extract',
        cleanYearOutliers,

        async parseSmart(file, onProgress = () => { }, onLog = () => { }, options = {}) {
            const startTime = Date.now();
            const log = (icon, msg, status = 'info') => {
                console.log(`${icon} ${msg}`);
                onLog({ icon, message: msg, status, time: Date.now() - startTime });
            };

            log('🚀', `Belge İnceleme Başladı: ${file.name}`);

            const ext = file.name.split('.').pop().toLowerCase();
            if (['txt', 'csv', 'tsv', 'dat', 'log'].includes(ext)) {
                log('📝', `Metin dosyası tespit edildi (.${ext}) → Doğrudan okuma başlatılıyor...`);
                return await this.parseTextFile(file, onProgress, log);
            }

            // ─── ADIM 1: Dijital Metin Kontrolü ───────────────────
            onProgress(5);
            log('📄', 'Belgenin dijital yapısı kontrol ediliyor...');
            const textCheck = await this.checkDigitalContent(file);
            
            if (textCheck.itemCount < 5) {
                log('⚠️', 'Görüntü tabanlı belge tespit edildi → Fotoğraf modu aktif.', 'warning');
                return await this.fullAIFallback(file, onProgress, onLog);
            }

            let schemaResult = null;
            let schema = options.columnMapping;

            if (schema) {
                log('🧠', `Kullanıcı tanımlı PDF şeması yüklendi: ${schema.deviceBrand || 'Tanımsız'}`, 'success');
                schemaResult = { success: true, schema, cost: { total: 0 } };
            } else {
                // ─── ADIM 2: Hızlı Tanıma (Heuristic) ─────────────────
                log('⚡', 'Hızlı tanıma motoru çalıştırılıyor...');
                const fastResult = await this.tryHeuristicParse(file, onProgress, log);
                if (fastResult) {
                    log('⚡', 'Bilinen şablon ile anında çözüldü.', 'success');
                    return fastResult;
                }

                // ─── ADIM 3: AI Schema Learning (v4.0) ──────────────
                onProgress(10);
                const bestPages = await this.findBestSchemaPages(file);
                
                for (let i = 0; i < Math.min(2, bestPages.length); i++) {
                    const page = bestPages[i];
                    log('🧠', `AI Sayfa ${page} yapısını öğreniyor...`);
                    schemaResult = await this.discoverSchema(file, page);

                    if (schemaResult.success && schemaResult.schema?.dateOrder) {
                        schema = schemaResult.schema;
                        log('🧠', `Format Öğrenildi: ${schema.deviceBrand || 'Tanımsız'} (${schema.dateOrder} düzeni)`, 'success');
                        break;
                    }
                }
            }

            if (!schema) {
                log('❌', 'Belge formatı anlaşılamadı → Fotoğraf moduna geçiliyor', 'error');
                return await this.fullAIFallback(file, onProgress, onLog);
            }

            // ─── ADIM 4: Deterministik Hasat ─────────────────────────
            onProgress(40);
            log('🚜', `${textCheck.pageCount} sayfadaki veriler deterministik parser ile toplanıyor...`);
            const harvestResult = await this.harvestWithDeterministicParser(file, schema);

            if (harvestResult.data.length === 0) {
                log('❌', 'Veri bulunamadı → Fotoğraf moduna geçiliyor', 'error');
                return await this.fullAIFallback(file, onProgress, onLog);
            }

            log('✅', `Hasat başarılı: ${harvestResult.data.length} kayıt yakalandı`, 'success');

            // ─── ADIM 5: Post-Process ────────────────────────────
            onProgress(90);
            const metadata = {
                pharmacyName: schema.pharmacyName,
                deviceBrand: schema.deviceBrand,
                deviceSerial: textCheck.deviceSerial || schema.deviceSerial,
                docCreationDate: textCheck.docCreationDate,
                extractionMethod: 'universal-reader-v4',
                aiCost: schemaResult.cost?.total || 0,
                schema: schema
            };

            const processed = DataParser.postProcess(harvestResult.data, [], metadata, { resampling: false });
            log('📊', `Tamamlandı: ${processed.data.length} ölçüm çıkarıldı.`, 'success');
            onProgress(100);

            return {
                source: file.name,
                method: 'universal-reader-v4',
                parsedData: processed.data,
                rowCount: processed.data.length,
                metadata: processed.metadata,
                cost: schemaResult.cost,
                pageCount: textCheck.pageCount || 1
            };
        },

        buildParser(schema) {
            const esc = c => ({ '.': '\\.', '-': '\\-', '/': '\\/', ',': ',', ' ': '\\s' }[c] || '\\.');
            const ds = '[.,/\\-\\s]'; 
            const ts = schema.timeSep ? esc(schema.timeSep) : '[:.]';
            const dec = schema.decimalSep ? esc(schema.decimalSep) : '[.,]';
            const order = schema.dateOrder || 'dmy';

            const dateRe = order === 'ymd'
                ? new RegExp(`(?<![\\d])(\\d{4})${ds}(\\d{1,2})${ds}(\\d{1,2})(?![\\d])`)
                : new RegExp(`(?<![\\d])(\\d{1,2})${ds}(\\d{1,2})${ds}(\\d{2,4})(?![\\d])`);

            // HATA ÖNLEME: Zaman ayracı hem nokta hem iki nokta olabilir (Genelde : tercih edilir).
            // Derece (°C) veya Yüzde (%) ile biten sayıları zaman olarak algılama.
            const timeRe = new RegExp(`(?<![\\d])(\\d{1,2})[:.](\\d{2})(?![:.]\\d)(?![\\d])(?!\\s*[°CcFf℃℉%])`, 'i');
            
            // Sıcaklık için de benzer koruma
            const unitRe = new RegExp(`(?<![\\d])([+-]?\\d{1,3}(?:${dec}\\d{1,2})?)\\s*(?:°\\s*[CcFf]|℃|℉)`, 'g');
            // Ondalık kısmı opsiyonel — bazı satırlarda dolap sıcaklığı tam sayı yazılabiliyor (örn. "5", "19").
            // Look-behind/ahead'e ',', ':', '-' eklendi: tarih (23.03.2026), saat (00:31) ve ISO tarih (2026-03-23) yanlış yakalanmasın.
            const bareRe = new RegExp(`(?<![\\d.,:\\-])([+-]?\\d{1,3}(?:${dec}\\d{1,2})?)(?![\\d.,:\\-])(?!\\s*%)`, 'g');

            return function(line) {
                // Önce tarihi bul
                const dm = line.match(dateRe);
                if (!dm) return null;

                let d, m, y;
                if (order === 'ymd') [, y, m, d] = dm;
                else if (order === 'mdy') [, m, d, y] = dm;
                else [, d, m, y] = dm;
                
                if (y.length === 2) y = '20' + y;

                // 🛡️ Mantıksal doğrulama (Seri no gibi yanlış eşleşmeleri elemeyi sağlar)
                const d_val = parseInt(d), m_val = parseInt(m), y_val = parseInt(y);
                if (m_val < 1 || m_val > 12 || d_val < 1 || d_val > 31 || y_val < 2000 || y_val > 2060) return null;

                const dateStr = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;

                const afterDate = line.slice(dm.index + dm[0].length);
                const tm = afterDate.match(timeRe);
                const timeStr = tm ? (tm[1].padStart(2, '0') + ':' + tm[2]) : "00:00";

                const temps = [];
                let match;
                unitRe.lastIndex = 0;
                while ((match = unitRe.exec(afterDate)) !== null) {
                    temps.push(parseFloat(match[1].replace(',', '.')));
                }
                if (temps.length === 0) {
                    bareRe.lastIndex = 0;
                    while ((match = bareRe.exec(afterDate)) !== null) {
                        temps.push(parseFloat(match[1].replace(',', '.')));
                    }
                }

                if (temps.length === 0) return null;
                const fridgeTemp = temps[schema.tempColIndex || 0] ?? temps[0];

                return { dateStr, timeStr, tempStr: fridgeTemp };
            };
        },

        async harvestWithDeterministicParser(file, schema) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const data = [];
            const parseLine = this.buildParser(schema);

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const items = textContent.items.map(item => ({ 
                    str: item.str, 
                    x: item.transform[4], 
                    y: item.transform[5] 
                }));

                items.sort((a, b) => b.y - a.y);
                const lines = Utils.groupLines(items);

                for (const lineItems of lines) {
                    const lineStr = lineItems.map(i => i.str).join(" ");
                    const parsed = parseLine(lineStr);
                    if (parsed) {
                        data.push(parsed);
                    }
                }
            }

            const resolvedFormat = Utils.resolveDateFormat(data.map(d => d.dateStr)) || 'DD/MM/YYYY';
            const finalData = [];
            for (const item of data) {
                const ts = Utils.parseTimestamp(item.dateStr, item.timeStr, resolvedFormat);
                if (ts) finalData.push({ timestamp: ts, temperature: item.tempStr });
            }
            // Kronolojik sıralama
            finalData.sort((a, b) => a.timestamp - b.timestamp);
            const cleanedData = cleanYearOutliers(finalData);
            return { data: cleanedData, resolvedFormat };
        },

        async tryHeuristicParse(file, onProgress, log) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const page = await pdf.getPage(1);
                const textContent = await page.getTextContent();
                const fullText = textContent.items.map(i => i.str).join(' ');
                
                if (fullText.includes('Tarih - Saat') || fullText.includes('Dolap °C')) {
                    const schema = { dateOrder: 'ymd', dateSep: '-', timeSep: ':', decimalSep: ',', tempColIndex: 0 };
                    const res = await this.harvestWithDeterministicParser(file, schema);
                    if (res.data.length > 0) {
                        return { source: file.name, method: 'heuristic-v4', parsedData: res.data, rowCount: res.data.length, metadata: { deviceBrand: 'Clogger/Tufan' }, pageCount: pdf.numPages };
                    }
                }
            } catch (e) {} return null;
        },

        async checkDigitalContent(file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const page = await pdf.getPage(1);
                const textContent = await page.getTextContent();
                const metaData = await pdf.getMetadata();
                const fullText = textContent.items.map(i => i.str).join(' ');
                const serialMatch = fullText.match(/(?:S\/N|Seri No|Serial|Cihaz No|Logger ID|ID|No)\s*[:=]?\s*([A-Z0-9-]{5,20})/i);
                return {
                    itemCount: textContent.items.length,
                    pageCount: pdf.numPages,
                    docCreationDate: metaData?.info?.CreationDate,
                    deviceSerial: serialMatch ? serialMatch[1].trim() : null
                };
            } catch (e) { return { itemCount: 0, pageCount: 1 }; }
        },

        async findBestSchemaPages(file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const maxPages = Math.min(5, pdf.numPages);
                const keywords = ['tarih', 'saat', 'sıcaklık', 'date', 'time', 'temp'];
                const pageScores = [];
                for (let i = 1; i <= maxPages; i++) {
                    const page = await pdf.getPage(i);
                    const text = (await page.getTextContent()).items.map(item => item.str.toLowerCase()).join(' ');
                    let score = 0;
                    for (const kw of keywords) { if (text.includes(kw)) score++; }
                    pageScores.push({ page: i, score });
                }
                return pageScores.sort((a, b) => b.score - a.score).map(p => p.page);
            } catch (e) { return [1]; }
        },

        async discoverSchema(file, pageNum = 1) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('targetPage', pageNum);
            const response = await fetch(this.SCHEMA_ENDPOINT, { method: 'POST', body: formData });
            return await response.json();
        },

        async fullAIFallback(file, onProgress, onLog) {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch(this.AI_ENDPOINT, { method: 'POST', body: formData });
            const result = await response.json();
            if (result.success) {
                const parsedData = result.readings.map(r => ({ timestamp: new Date(r.date + ' ' + r.time).getTime(), temperature: r.temperature }));
                const cleanedData = cleanYearOutliers(parsedData);
                return {
                    source: file.name,
                    method: 'full-ai-ocr-v4',
                    parsedData: cleanedData,
                    rowCount: cleanedData.length,
                    metadata: result.metadata,
                    cost: result.stats?.cost || 0
                };
            }
            throw new Error(result.error || 'AI analizi başarısız.');
        },

        async parseTextFile(file, onProgress, log) {
            onProgress(20);
            const text = await file.text();
            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
            log('📖', `${lines.length} satır okundu, satır bazlı parse başlıyor...`);

            // Birinci sayfa için varsayılan şema dene; AI'a gerek olmadan
            // bilinen format yakalanırsa hemen hasat et.
            const trialSchemas = [
                { dateOrder: 'dmy', dateSep: '.', timeSep: ':', decimalSep: ',', tempColIndex: 0 },
                { dateOrder: 'dmy', dateSep: '/', timeSep: ':', decimalSep: '.', tempColIndex: 0 },
                { dateOrder: 'ymd', dateSep: '-', timeSep: ':', decimalSep: '.', tempColIndex: 0 },
                { dateOrder: 'mdy', dateSep: '/', timeSep: ':', decimalSep: '.', tempColIndex: 0 }
            ];

            let best = { count: 0, data: [], schema: null };
            for (const schema of trialSchemas) {
                const parseLine = this.buildParser(schema);
                const hits = [];
                for (const line of lines) {
                    const p = parseLine(line);
                    if (p) hits.push(p);
                }
                if (hits.length > best.count) {
                    best = { count: hits.length, data: hits, schema };
                }
            }

            if (best.count === 0) {
                log('❌', 'Metin dosyasında tarih+sıcaklık deseni bulunamadı.', 'error');
                throw new Error('Metin dosyası tanınmayan formatta. CSV/TXT için en azından tarih, saat ve sıcaklık sütunları bulunmalı.');
            }

            log('✅', `${best.count} satır yakalandı (format: ${best.schema.dateOrder}, ayraç: "${best.schema.dateSep}")`, 'success');
            onProgress(70);

            const resolvedFormat = Utils.resolveDateFormat(best.data.map(d => d.dateStr)) || 'DD/MM/YYYY';
            const finalData = [];
            for (const item of best.data) {
                const ts = Utils.parseTimestamp(item.dateStr, item.timeStr, resolvedFormat);
                if (ts) finalData.push({ timestamp: ts, temperature: item.tempStr });
            }
            finalData.sort((a, b) => a.timestamp - b.timestamp);
            const cleanedData = cleanYearOutliers(finalData);

            const metadata = {
                deviceBrand: 'Metin Dosyası',
                extractionMethod: 'text-parser-v4',
                schema: best.schema
            };
            const processed = DataParser.postProcess(cleanedData, [], metadata, { resampling: false });
            onProgress(100);

            return {
                source: file.name,
                method: 'text-parser-v4',
                parsedData: processed.data,
                rowCount: processed.data.length,
                metadata: processed.metadata,
                pageCount: 1
            };
        }
    };
})();
