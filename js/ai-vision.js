/**
 * ColdChain AI — AI Vision Modülü (Frontend)
 * 
 * Görüntü ve PDF dosyalarını backend'deki Gemini API'ye gönderir,
 * dönen Markdown'ı yapılandırılmış veriye dönüştürür.
 * 
 * Optimizasyonlar:
 *   - Görüntü sıkıştırma (Canvas ile boyut küçültme)
 *   - Dosya hash ile önbellekleme (aynı dosya 2. kez gönderilmez)
 *   - Gerçek zamanlı progress callback
 *
 * Akış:
 *   File → [Sıkıştır] → Backend /api/extract → Markdown → JSON → Pipeline
 */
const AIVision = {

    // API endpoint
    ENDPOINT: '/api/extract',

    // Önbellek (aynı dosyayı tekrar gönderme)
    _cache: new Map(),

    // Görüntü sıkıştırma ayarları
    COMPRESS: {
        maxWidth: 1600,       // Maks piksel genişlik
        maxHeight: 1600,      // Maks piksel yükseklik
        quality: 0.85,        // JPEG kalitesi (0-1)
        minSizeForCompress: 500 * 1024  // 500KB altı sıkıştırılmaz
    },

    /**
     * Dosyanın AI Vision ile işlenip işlenemeyeceğini kontrol eder
     */
    canProcess(file) {
        const ext = Utils.getFileExtension(file.name);
        return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'pdf'].includes(ext);
    },

    /**
     * Dosya AI gerektiriyor mu? (Excel/CSV değilse)
     */
    requiresAI(file) {
        const ext = Utils.getFileExtension(file.name);
        return ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext);
    },

    /**
     * Backend'in hazır olup olmadığını kontrol et
     */
    async checkHealth() {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            return {
                serverReady: data.status === 'ok',
                geminiReady: data.geminiReady,
                model: data.model,
                version: data.version
            };
        } catch (err) {
            return { serverReady: false, geminiReady: false, error: err.message };
        }
    },

    /**
     * Basit dosya hash (önbellek anahtarı)
     */
    async _fileHash(file) {
        const buffer = await file.slice(0, 8192).arrayBuffer(); // İlk 8KB
        const arr = new Uint8Array(buffer);
        let hash = 0;
        for (let i = 0; i < arr.length; i++) {
            hash = ((hash << 5) - hash + arr[i]) | 0;
        }
        return `${file.name}_${file.size}_${hash}`;
    },

    /**
     * Görüntüyü sıkıştır (Canvas API ile boyut küçültme)
     */
    async compressImage(file) {
        // PDF sıkıştırılmaz, olduğu gibi gönderilir
        const ext = Utils.getFileExtension(file.name);
        if (ext === 'pdf') return file;

        // Küçük dosyalar sıkıştırılmaz
        if (file.size < this.COMPRESS.minSizeForCompress) {
            console.log(`📐 Sıkıştırma atlandı (${(file.size / 1024).toFixed(0)}KB < ${(this.COMPRESS.minSizeForCompress / 1024).toFixed(0)}KB)`);
            return file;
        }

        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);
                let { width, height } = img;
                const maxW = this.COMPRESS.maxWidth;
                const maxH = this.COMPRESS.maxHeight;

                // Boyut küçültme gerekli mi?
                if (width <= maxW && height <= maxH) {
                    console.log(`📐 Sıkıştırma atlandı (${width}x${height} zaten küçük)`);
                    resolve(file);
                    return;
                }

                // En-boy oranını koru
                const ratio = Math.min(maxW / width, maxH / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        const compressed = new File([blob], file.name, { type: 'image/jpeg' });
                        const savings = ((1 - compressed.size / file.size) * 100).toFixed(0);
                        console.log(`📐 Sıkıştırma: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (-%${savings}, ${width}x${height})`);
                        resolve(compressed);
                    },
                    'image/jpeg',
                    this.COMPRESS.quality
                );
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                console.warn('📐 Sıkıştırma başarısız, orijinal kullanılıyor');
                resolve(file);
            };

            img.src = url;
        });
    },

    /**
     * ANA FONKSİYON: Görüntü/PDF'den sıcaklık verisi çıkar
     * @param {File} file - Görüntü veya PDF dosyası
     * @param {Function} onProgress - İlerleme callback (0-100)
     * @returns {Object} DataParser formatında sonuç
     */
    async extract(file, onProgress, options = { resampling: true }) {
        const startTime = Date.now();
        const progress = onProgress || (() => { });

        // 1. Önbellek kontrolü
        const hash = await this._fileHash(file);
        if (this._cache.has(hash)) {
            console.log('💾 Önbellekten döndürülüyor (0ms)');
            progress(100);
            return this._cache.get(hash);
        }

        progress(5); // Başladı

        // 2. Görüntü sıkıştırma
        const processedFile = await this.compressImage(file);
        progress(15);

        // 3. FormData oluştur ve gönder
        const formData = new FormData();
        formData.append('file', processedFile);

        progress(20); // Upload başlıyor

        // 4. Simüle progress (Gelişmiş Sanal İlerleme)
        // Hedef: 25 saniyede %90'a ulaşmak.
        // Başlangıç: %20, Kalan: %70. Saniyede artış: 70/25 = 2.8%
        let progressValue = 20;
        const intervalMs = 500; // Yarım saniyede bir güncelle
        const increment = (70 / (25000 / intervalMs)); // Her adımda eklenecek miktar

        const progressTimer = setInterval(() => {
            if (progressValue < 90) {
                // Hafif rastgelelik ekle ki doğal dursun
                const jitter = (Math.random() - 0.5) * 0.5;
                progressValue += (increment + jitter);
                progress(Math.min(90, Math.round(progressValue)));
            }
        }, intervalMs);

        try {
            const response = await fetch(this.ENDPOINT, {
                method: 'POST',
                body: formData
            });

            clearInterval(progressTimer);
            progress(95);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `API hatası: ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Bilinmeyen hata');
            }

            progress(95);

            // AI yanıtını DataParser formatına dönüştür
            const rawParsedData = this.convertToStandardFormat(result.readings);
            const elapsed = Date.now() - startTime;

            // Ortak Pipeline (Sıralama, Deduplikasyon, Resampling, Validation)
            const initialLog = this.buildPipelineLog(result, elapsed);
            const metadata = {
                pharmacyName: result.metadata?.pharmacyName,
                deviceSerial: result.metadata?.deviceSerial,
                deviceBrand: result.metadata?.deviceBrand,
                documentType: result.metadata?.documentType,
                extractionMethod: 'ai-vision',
                modelUsed: result.modelUsed || 'Gemini AI',
                confidence: result.stats?.avgConfidence,
                lowConfidenceCount: result.stats?.lowConfidenceCount,
                processingTimeMs: elapsed,
                // IR belge düzeyi blok — güven skoru postProcess'te hesaplanır
                extraction: {
                    sourcePath: 'ocr',
                    totalCandidates: result.readings.length,
                    skippedRows: result.readings.length - rawParsedData.length,
                    removedYearOutliers: 0,
                    dedupRemoved: result.stats?.dedupRemoved || 0,
                    aiClaimedTotal: result.stats?.aiClaimedTotal || 0,
                    claimMismatch: result.stats?.claimMismatch || 0,
                    lowConfidenceCount: result.stats?.lowConfidenceCount || 0,
                    dateFormat: result.stats?.dateFormat || null,
                    forceReview: !!result.stats?.needsReview
                }
            };

            // DataParser'ın ortak post-process mantığını çalıştır
            const processed = DataParser.postProcess(rawParsedData, initialLog, metadata, options);

            const output = {
                source: file.name,
                brand: result.metadata?.deviceBrand || null,
                rawData: result.readings,
                parsedData: processed.data,
                rowCount: processed.data.length,
                columns: ['Tarih', 'Saat', 'Sıcaklık'],
                metadata: processed.metadata,
                pipeline: processed.pipelineLog
            };

            // Önbelleğe kaydet
            this._cache.set(hash, output);

            progress(100);
            return output;

        } catch (err) {
            clearInterval(progressTimer);
            throw err;
        }
    },

    /**
     * AI çıktısını { timestamp, temperature } formatına dönüştür
     */
    convertToStandardFormat(readings) {
        const data = [];
        console.log(`🧪 AIVision: ${readings.length} ham okuma işleniyor...`);

        for (let i = 0; i < readings.length; i++) {
            const r = readings[i];
            const ts = this.buildTimestamp(r.date, r.time);

            if (!ts || isNaN(ts.getTime())) {
                console.warn(`⚠️ Geçersiz Zaman: ${r.date} ${r.time}`, r);
                continue;
            }

            const temp = parseFloat(r.temperature);
            if (isNaN(temp)) {
                console.warn(`⚠️ Geçersiz Sıcaklık: ${r.temperature}`, r);
                continue;
            }

            data.push({
                timestamp: ts,
                temperature: parseFloat(temp.toFixed(2)),
                confidence: r.confidence || 0.9,
                rowIndex: i,
                rawText: `${r.date} ${r.time} ${r.temperature}`
            });
        }

        console.log(`✅ AIVision: ${data.length} geçerli kayıt oluşturuldu.`);
        return data;
    },

    /**
     * Tarih ve saat stringlerinden Date nesnesi oluştur
     */
    buildTimestamp(dateStr, timeStr) {
        if (!dateStr) return null;

        try {
            // YYYY-MM-DD veya YYYY/MM/DD
            const isoParts = dateStr.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/);
            if (isoParts) {
                const year = parseInt(isoParts[1]);
                const month = parseInt(isoParts[2]) - 1;
                const day = parseInt(isoParts[3]);

                if (timeStr) {
                    const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
                    if (timeParts) {
                        return new Date(year, month, day,
                            parseInt(timeParts[1]),
                            parseInt(timeParts[2]),
                            parseInt(timeParts[3] || 0)
                        );
                    }
                }
                return new Date(year, month, day);
            }

            // DD.MM.YYYY veya DD/MM/YYYY
            const trParts = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
            if (trParts) {
                let year = parseInt(trParts[3]);
                if (year < 100) year += 2000;
                const month = parseInt(trParts[2]) - 1;
                const day = parseInt(trParts[1]);

                if (timeStr) {
                    const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
                    if (timeParts) {
                        return new Date(year, month, day,
                            parseInt(timeParts[1]),
                            parseInt(timeParts[2]),
                            parseInt(timeParts[3] || 0)
                        );
                    }
                }
                return new Date(year, month, day);
            }

            // Hiçbiri tutmazsa native parse dene
            const d = new Date(timeStr ? `${dateStr} ${timeStr}` : dateStr);
            return isNaN(d.getTime()) ? null : d;

        } catch (e) {
            return null;
        }
    },

    /**
     * Pipeline log oluştur (upload sayfasında gösterilecek)
     */
    buildPipelineLog(result, elapsed) {
        const modelName = result.modelUsed || 'Gemini AI';
        const elapsedSec = (elapsed / 1000).toFixed(1);
        const log = [
            {
                step: 'Yapay Zeka Görsel Analizi',
                status: 'success',
                detail: `${modelName} kullanılarak ${result.readings.length} okuma başarıyla tamamlandı (${elapsedSec}s)`,
                icon: '🤖'
            },
            {
                step: 'Belge Türü ve Kalitesi',
                status: 'info',
                detail: this.getDocumentTypeLabel(result.metadata?.documentType),
                icon: '📋'
            },
            {
                step: 'Okunabilirlik / Netlik Durumu',
                status: result.stats?.avgConfidence >= 0.85 ? 'success' :
                    result.stats?.avgConfidence >= 0.70 ? 'warning' : 'error',
                detail: `Belge Netlik Oranı: %${Math.round((result.stats?.avgConfidence || 0) * 100)}`,
                icon: '🎯'
            }
        ];

        if (result.stats?.lowConfidenceCount > 0) {
            log.push({
                step: 'Bulanık veya Zor Okunan Kısımlar',
                status: 'warning',
                detail: `Belgede ${result.stats.lowConfidenceCount} adet ölçüm okunamayacak kadar bulanıktı — yapay zeka en yakın ihtimali tahmin etti`,
                icon: '⚠️'
            });
        }

        if (result.metadata?.pharmacyName) {
            log.push({
                step: 'Eczane Tespiti',
                status: 'info',
                detail: result.metadata.pharmacyName,
                icon: '💊'
            });
        }

        return log;
    },

    /**
     * Belge türü etiketleri
     */
    getDocumentTypeLabel(type) {
        const labels = {
            'dijital_rapor': 'Dijital Rapor (yazılım çıktısı)',
            'taranmis_form': 'Taranmış Form',
            'ekran_fotosu': 'Ekran Fotoğrafı',
            'el_yazisi': 'El Yazısı Kayıt',
            'yazici_ciktisi': 'Yazıcı Çıktısı'
        };
        return labels[type] || type || 'Bilinmiyor';
    }
};
