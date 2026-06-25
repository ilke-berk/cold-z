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
        TEMPLATE_MATCH_ENDPOINT: '/api/templates/match',
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
            // Şablon hafızası bilgisi pipeline'dan (UI ön-eşleştirmesi) gelebilir
            // veya aşağıda burada üretilir — ikisi de aynı IR alanlarına iner.
            let fingerprint = options.fingerprint || null;
            let templateUse = options.templateMatch || null;

            if (schema) {
                log('🧠', `Kullanıcı tanımlı PDF şeması yüklendi: ${schema.deviceBrand || 'Tanımsız'}`, 'success');
                schemaResult = { success: true, schema, cost: { total: 0 } };
            } else {
                // ─── ADIM 1.5: Şablon Hafızası (Faz 4) ────────────────
                // Bulanık eşleşme YALNIZCA onay kapısı olan akışta uygulanır
                // (opts.allowFuzzyTemplate — CCPipeline gönderir): kapısız eski
                // sayfada bulanık şema sessizce kabul edilmiş olurdu.
                const tpl = await this.matchKnownTemplate(file, textCheck);
                if (tpl) {
                    fingerprint = tpl.fingerprint;
                    // Kesin (hash) ve yapısal (satır-deseni) eşleşme güçlü
                    // sinyaldir → otomatik uygulanır. Bulanık eşleşme yalnızca
                    // onay kapısı olan akışta (allowFuzzyTemplate) uygulanır.
                    const autoApply = tpl.match === 'exact' || tpl.match === 'structural';
                    const fuzzyAllowed = tpl.match === 'fuzzy' && options.allowFuzzyTemplate;
                    if ((autoApply || fuzzyAllowed) && tpl.template?.schema?.dateOrder) {
                        schema = tpl.template.schema;
                        schemaResult = { success: true, schema, cost: { total: 0 } };
                        templateUse = {
                            id: tpl.template.id,
                            brand: tpl.template.brand,
                            match: tpl.match,
                            similarity: tpl.similarity || 1,
                            brandConflict: tpl.brandConflict
                        };
                        if (tpl.match === 'exact') {
                            log('🗂️', `Bilinen format tanındı: ${tpl.template.brand || 'etiketsiz şablon'} → şablon hafızasından anında parse (AI maliyeti 0).`, 'success');
                        } else if (tpl.match === 'structural') {
                            log('🗂️', `Aynı belge ailesi tanındı (satır deseni eşleşti): ${tpl.template.brand || 'etiketsiz şablon'} → başlıksız sayfa olsa da şablon hafızasından anında parse (AI maliyeti 0).`, 'success');
                        } else {
                            log('🗂️', `Benzer format şablonu önerildi: ${tpl.template.brand || '#' + tpl.template.id} (%${Math.round((tpl.similarity || 0) * 100)} benzer) — sessizce uygulanmaz, insan onayına düşecek.`, 'warning');
                        }
                    }
                }
            }

            if (!schema) {
                // ─── ADIM 2: Hızlı Tanıma (Heuristic) ─────────────────
                log('⚡', 'Hızlı tanıma motoru çalıştırılıyor...');
                const fastResult = await this.tryHeuristicParse(file, onProgress, log, fingerprint);
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

            // Şablon kaynaklı zorunlu inceleme nedenleri: bulanık eşleşme asla
            // sessizce kabul edilmez; marka çelişkisi anlaşmazlık yönlendirmesidir.
            const reviewReasons = [];
            if (templateUse) {
                if (templateUse.match === 'fuzzy') {
                    reviewReasons.push(`Önerilen şablon "${templateUse.brand || '#' + templateUse.id}" (%${Math.round((templateUse.similarity || 0) * 100)} benzer) ile parse edildi — onaylanırsa bu belge yeni format varyantı olarak hafızaya kaydedilir.`);
                }
                if (templateUse.brandConflict) {
                    reviewReasons.push(`Marka çelişkisi: belgede "${(fingerprint && fingerprint.brandDetected) || '?'}" markası görünürken eşleşen şablon "${templateUse.brand}" etiketli — çıkarımı kontrol edin.`);
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
            if (harvestResult.dateDetection?.ambiguous) {
                log('📅', `Tarih formatı kesin tespit edilemedi (yöntem: ${harvestResult.dateDetection.method}) → TR varsayılanı GG.AA.YYYY kullanıldı.`, 'warning');
            }
            if (harvestResult.removedYearOutliers > 0) {
                log('🧹', `${harvestResult.removedYearOutliers} satır, çoğunluk yılının ±1 dışında kaldığı için elendi (tarih okuma hatası olabilir).`, 'warning');
            }

            // ─── ADIM 5: Post-Process ────────────────────────────
            onProgress(90);
            const metadata = {
                pharmacyName: schema.pharmacyName,
                deviceBrand: schema.deviceBrand,
                deviceSerial: textCheck.deviceSerial || schema.deviceSerial,
                docCreationDate: textCheck.docCreationDate,
                extractionMethod: 'universal-reader-v4',
                aiCost: schemaResult.cost?.total || 0,
                removedYearOutliers: harvestResult.removedYearOutliers || 0,
                schema: schema,
                // IR belge düzeyi blok — güven skoru postProcess'te hesaplanır
                extraction: {
                    sourcePath: 'pdf-digital',
                    schema: schema,
                    totalCandidates: harvestResult.totalCandidates,
                    skippedRows: harvestResult.tsFailures,
                    removedYearOutliers: harvestResult.removedYearOutliers || 0,
                    dateFormat: harvestResult.dateDetection,
                    // Şablon hafızası (Faz 4): parmak izi analiz sonrası kayıt
                    // için, template bilgi/zorunlu inceleme kapı için taşınır.
                    fingerprint: fingerprint || undefined,
                    template: templateUse || undefined,
                    forceReview: reviewReasons.length > 0 || undefined,
                    reviewReasons: reviewReasons.length > 0 ? reviewReasons : undefined
                }
            };

            const processed = DataParser.postProcess(harvestResult.data, [], metadata, { resampling: false });
            const conf = processed.metadata.extraction?.confidence;
            if (conf) {
                log('🎯', `Güven skoru: ${conf.score}/100${conf.needsReview ? ' — insan incelemesi önerilir' : ''}`, conf.needsReview ? 'warning' : 'success');
            }
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
            // Şemada ayraç belirtilmişse (AI keşfi veya kullanıcı seçimi) ona sadık kal;
            // belirtilmemişse tüm yaygın ayraçları kabul et.
            const ds = schema.dateSep ? esc(schema.dateSep) : '[.,/\\-\\s]';
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
            let lineCounter = 0;

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
                        parsed.raw = lineStr;
                        parsed.rowIndex = lineCounter;
                        data.push(parsed);
                    }
                    lineCounter++;
                }
            }

            // Tek tarih çözücü: şema yanlış dateOrder verdiyse normalize edilmiş
            // tarihlerdeki tutarsızlığı burada yakalarız (oylama + delta testi).
            const dateDetection = Utils.resolveDateFormatDetailed(data.map(d => d.dateStr));
            const resolvedFormat = dateDetection.formatHint || 'DD/MM/YYYY';
            const finalData = [];
            let tsFailures = 0;
            for (const item of data) {
                const ts = Utils.parseTimestamp(item.dateStr, item.timeStr, resolvedFormat);
                if (ts) {
                    // IR satır şekli: deterministik hasat → confidence 1
                    finalData.push({ timestamp: ts, temperature: item.tempStr, confidence: 1, rowIndex: item.rowIndex, rawText: item.raw });
                } else {
                    tsFailures++;
                }
            }
            // Kronolojik sıralama
            finalData.sort((a, b) => a.timestamp - b.timestamp);
            const cleanedData = cleanYearOutliers(finalData);
            return {
                data: cleanedData,
                resolvedFormat,
                dateDetection,
                totalCandidates: data.length,
                tsFailures,
                removedYearOutliers: finalData.length - cleanedData.length
            };
        },

        async tryHeuristicParse(file, onProgress, log, fingerprint = null) {
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
                        // Heuristik yol da ortak IR hattından geçer (sıralama + dedup +
                        // validasyon + güven skoru) — diğer yollarla aynı çıktı şekli.
                        const metadata = {
                            deviceBrand: 'Clogger/Tufan',
                            extractionMethod: 'heuristic-v4',
                            removedYearOutliers: res.removedYearOutliers || 0,
                            extraction: {
                                sourcePath: 'pdf-heuristic',
                                schema: schema,
                                totalCandidates: res.totalCandidates,
                                skippedRows: res.tsFailures,
                                removedYearOutliers: res.removedYearOutliers || 0,
                                dateFormat: res.dateDetection,
                                // Parmak izi taşınırsa belge analiz sonrası şablon
                                // hafızasına yazılır → sonraki kopyalar 'exact' yoldan gider.
                                fingerprint: fingerprint || undefined
                            }
                        };
                        const processed = DataParser.postProcess(res.data, [], metadata, { resampling: false });
                        const conf = processed.metadata.extraction?.confidence;
                        if (conf && log) {
                            log('🎯', `Güven skoru: ${conf.score}/100${conf.needsReview ? ' — insan incelemesi önerilir' : ''}`, conf.needsReview ? 'warning' : 'success');
                        }
                        return { source: file.name, method: 'heuristic-v4', parsedData: processed.data, rowCount: processed.data.length, metadata: processed.metadata, pageCount: pdf.numPages };
                    }
                }
            } catch (e) {} return null;
        },

        async checkDigitalContent(file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const metaData = await pdf.getMetadata();

                // Şablon hafızası (Faz 4) parmak izi için ilk birkaç sayfanın
                // satırları toplanır. Kolon başlığı çoğu logger PDF'inde yalnızca
                // ilk veri sayfasında basılır; aynı belgenin "devam sayfaları"
                // ayrı yüklendiğinde başlığı yakalayabilmek için ilk birkaç sayfa
                // taranır (fpPages). Veri satırları her sayfada bulunduğundan
                // satır-deseni imzası bu sayfalardan sayfa-bağımsız üretilebilir.
                const scanCount = Math.min(3, pdf.numPages);
                const fpPages = [];
                let page1TextContent = null;
                for (let pno = 1; pno <= scanCount; pno++) {
                    const pg = await pdf.getPage(pno);
                    const tc = await pg.getTextContent();
                    if (pno === 1) page1TextContent = tc;
                    const pgItems = tc.items.map(item => ({
                        str: item.str, x: item.transform[4], y: item.transform[5]
                    }));
                    pgItems.sort((a, b) => b.y - a.y);
                    fpPages.push(Utils.groupLines(pgItems).map(line => line.map(i => i.str).join(' ')));
                }

                const textContent = page1TextContent;
                const fullText = textContent.items.map(i => i.str).join(' ');
                const serialMatch = fullText.match(/(?:S\/N|Seri No|Serial|Cihaz No|Logger ID|ID|No)\s*[:=]?\s*([A-Z0-9-]{5,20})/i);
                const page1Lines = fpPages[0] || [];
                return {
                    itemCount: textContent.items.length,
                    pageCount: pdf.numPages,
                    docCreationDate: metaData?.info?.CreationDate,
                    producer: metaData?.info?.Producer || '',
                    creator: metaData?.info?.Creator || '',
                    page1Lines,
                    fpPages,
                    page1Text: fullText,
                    deviceSerial: serialMatch ? serialMatch[1].trim() : null
                };
            } catch (e) { return { itemCount: 0, pageCount: 1 }; }
        },

        /**
         * Şablon hafızası sorgusu (Faz 4). Marka tespit edilmez, TANINIR:
         * anahtar belgenin yapısal parmak izi; sayfa-1'deki marka kelimesi
         * yalnızca yardımcı sinyal (etiket ön-doldurma + çapraz doğrulama +
         * bulanık adayları daraltma). Sunucu kapalıysa null döner ve akış
         * normal yoldan (heuristik → AI keşfi) devam eder.
         */
        async matchKnownTemplate(file, textCheck = null) {
            if (typeof FormatFingerprint === 'undefined') return null;
            try {
                const check = textCheck || await this.checkDigitalContent(file);
                const fpPages = (check.fpPages && check.fpPages.length)
                    ? check.fpPages
                    : (check.page1Lines && check.page1Lines.length ? [check.page1Lines] : []);
                if (!fpPages.length) return null;
                const allLines = fpPages.reduce((acc, pg) => acc.concat(pg), []);
                // Başlığı (kolon adları) içeren ilk sayfayı bul; devam sayfaları
                // başlıksız olabileceğinden başlık token'ları o sayfadan, satır
                // deseni ise tüm taranan sayfalardan üretilir.
                let headerLines = null;
                for (const pg of fpPages) {
                    if (FormatFingerprint.findHeaderLine(pg)) { headerLines = pg; break; }
                }
                const fingerprint = await FormatFingerprint.pdfFingerprint({
                    lines: allLines,
                    headerLines: headerLines || fpPages[0],
                    producer: check.producer,
                    creator: check.creator
                });
                fingerprint.brandDetected = FormatFingerprint.detectBrand(check.page1Text || allLines.join(' '));
                const resp = await fetch(this.TEMPLATE_MATCH_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fingerprint: fingerprint.hash,
                        headerTokens: fingerprint.headerTokens,
                        rowSignature: fingerprint.rowSignature,
                        producer: fingerprint.producer,
                        kind: 'pdf',
                        brandHint: fingerprint.brandDetected
                    })
                });
                const m = await resp.json();
                if (!m || !m.success) return { fingerprint, match: 'none' };
                return {
                    fingerprint,
                    match: m.match,
                    template: m.template,
                    similarity: m.similarity,
                    brandConflict: !!m.brandConflict
                };
            } catch (e) {
                return null;
            }
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
                // OCR çıktısı da ortak IR'a iner: Date timestamp + satır güveni +
                // kaynak metin; ardından diğer yollarla aynı postProcess hattı.
                const parsedData = result.readings
                    .map((r, i) => ({
                        timestamp: new Date(r.date + ' ' + r.time),
                        temperature: r.temperature,
                        confidence: typeof r.confidence === 'number' ? r.confidence : 0.9,
                        rowIndex: i,
                        rawText: `${r.date} ${r.time} ${r.temperature}`,
                        // Kademe 2 inceleme ızgarası: satırın kaynak sayfası (yaklaşık,
                        // chunk başlangıcı) — düşük güvenli satır, sayfa görüntüsüyle
                        // yan yana gösterilir.
                        page: r.page || 1
                    }))
                    .filter(d => !isNaN(d.timestamp.getTime()));
                const tsFailures = result.readings.length - parsedData.length;
                const cleanedData = cleanYearOutliers(parsedData);
                const removedYearOutliers = parsedData.length - cleanedData.length;
                if (removedYearOutliers > 0) {
                    onLog({ icon: '🧹', message: `${removedYearOutliers} satır, çoğunluk yılının ±1 dışında kaldığı için elendi (OCR tarih hatası olabilir).`, status: 'warning' });
                }

                const metadata = {
                    ...result.metadata,
                    removedYearOutliers,
                    extractionMethod: 'full-ai-ocr-v4',
                    aiStats: result.stats,
                    extraction: {
                        sourcePath: 'ocr',
                        totalCandidates: result.readings.length,
                        skippedRows: tsFailures,
                        removedYearOutliers,
                        dedupRemoved: result.stats?.dedupRemoved || 0,
                        aiClaimedTotal: result.stats?.aiClaimedTotal || 0,
                        claimMismatch: result.stats?.claimMismatch || 0,
                        lowConfidenceCount: result.stats?.lowConfidenceCount || 0,
                        dateFormat: result.stats?.dateFormat || null,
                        forceReview: !!result.stats?.needsReview
                    }
                };
                const processed = DataParser.postProcess(cleanedData, [], metadata, { resampling: false });
                const conf = processed.metadata.extraction?.confidence;
                if (conf) {
                    onLog({ icon: '🎯', message: `Güven skoru: ${conf.score}/100${conf.needsReview ? ' — insan incelemesi önerilir' : ''}`, status: conf.needsReview ? 'warning' : 'success' });
                }

                return {
                    source: file.name,
                    method: 'full-ai-ocr-v4',
                    parsedData: processed.data,
                    rowCount: processed.data.length,
                    metadata: processed.metadata,
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
                for (let li = 0; li < lines.length; li++) {
                    const p = parseLine(lines[li]);
                    if (p) {
                        p.raw = lines[li];
                        p.rowIndex = li;
                        hits.push(p);
                    }
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

            // Tek tarih çözücü: normalize edilmiş tarihler üzerinde format doğrulaması
            const dateDetection = Utils.resolveDateFormatDetailed(best.data.map(d => d.dateStr));
            const resolvedFormat = dateDetection.formatHint || 'DD/MM/YYYY';
            if (dateDetection.ambiguous) {
                log('📅', `Tarih formatı kesin tespit edilemedi (yöntem: ${dateDetection.method}) → TR varsayılanı GG.AA.YYYY kullanıldı.`, 'warning');
            }
            const finalData = [];
            let tsFailures = 0;
            for (const item of best.data) {
                const ts = Utils.parseTimestamp(item.dateStr, item.timeStr, resolvedFormat);
                if (ts) {
                    finalData.push({ timestamp: ts, temperature: item.tempStr, confidence: 1, rowIndex: item.rowIndex, rawText: item.raw });
                } else {
                    tsFailures++;
                }
            }
            finalData.sort((a, b) => a.timestamp - b.timestamp);
            const cleanedData = cleanYearOutliers(finalData);
            const removedYearOutliers = finalData.length - cleanedData.length;
            if (removedYearOutliers > 0) {
                log('🧹', `${removedYearOutliers} satır, çoğunluk yılının ±1 dışında kaldığı için elendi.`, 'warning');
            }

            const metadata = {
                deviceBrand: 'Metin Dosyası',
                extractionMethod: 'text-parser-v4',
                removedYearOutliers,
                schema: best.schema,
                extraction: {
                    sourcePath: 'text',
                    schema: best.schema,
                    totalCandidates: best.count,
                    skippedRows: tsFailures,
                    removedYearOutliers,
                    dateFormat: dateDetection
                }
            };
            const processed = DataParser.postProcess(cleanedData, [], metadata, { resampling: false });
            const conf = processed.metadata.extraction?.confidence;
            if (conf) {
                log('🎯', `Güven skoru: ${conf.score}/100${conf.needsReview ? ' — insan incelemesi önerilir' : ''}`, conf.needsReview ? 'warning' : 'success');
            }
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
