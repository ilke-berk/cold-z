/**
 * ColdChain AI — Decision Engine
 * TİTCK GDP kılavuzuna göre karar motoru
 */
const DecisionEngine = {
    evaluate(analysisResult) {
        const { compliance, validation } = analysisResult;
        const reasons = [];
        let decision = 'accept';
        let confidence = 100;

        // 1. Yeni Kabul/Red Şartları (Compliance Engine Sonuçları)
        if (compliance.status === 'fail') {
            decision = 'reject';
            // Sadece RED nedenlerini ekle
            compliance.redReasons.forEach(reason => {
                reasons.push(reason);
            });
            confidence -= 40;
        }

        // 2. ANTI-FRAUD (Sahtecilik ve Anomali Tespiti)
        // 2a. Sentetik (Sahte) Veri Kontrolü: Doğal bir buzdolabı kompresörü her zaman dalgalanma yaratır.
        // Eğer veride olağandışı bir "kusursuzluk" varsa (Standart sapma çok düşükse) ve yeterince veri varsa
        if (analysisResult.mkt && analysisResult.mkt.stdDev < 0.2 && analysisResult.dataPoints > 100) {
            if (decision !== 'reject') decision = 'revize';
            reasons.push(`🚨 ANTI-FRAUD: Standart sapma (${analysisResult.mkt.stdDev}) olağandışı düşük. Sıcaklık verileri doğal donanım gürültüsü barındırmıyor, Excel vb. yazılımlarla "sentetik (sahte)" üretilmiş kusursuz veri kalıbı olabilir!`);
            confidence -= 60;
        }

        // 2b. PDF Metadata Manipülasyonu & Mükerrer Cihaz Şüphesi
        if (analysisResult.metadata) {
            const meta = analysisResult.metadata;

            // Mükerrer cihaz kullanımı simülasyonu (Demo senaryosu için eğer seri no 'A1234' vb bilindikse alarm ver)
            if (meta.deviceSerial) {
                // Burada normalde DB'den check edilir, şimdilik bilinen bir şüpheli örnekte test edilebilir.
                if (meta.deviceSerial.includes('COPY') || meta.deviceSerial.includes('MANUAL')) {
                    decision = 'reject';
                    reasons.unshift(`🚨 ANTI-FRAUD: "${meta.deviceSerial}" seri numaralı cihaz daha önce başka bir eczane iadesinde sisteme yüklenmiş! Mükerrer rapor şüphesi.`);
                    confidence -= 80;
                }
            }

            // PDF oluşturulma tarihi vs İçindeki son veri (Zaman yolculuğu kontrolü)
            if (meta.docCreationDate && analysisResult.timespan && analysisResult.timespan.end) {
                // PDF metadata genelde "D:20240315103045+03'00'" formatında gelir, normalize edelim
                let raw = String(meta.docCreationDate);
                const pdfMatch = raw.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
                let docDate = NaN;
                if (pdfMatch) {
                    const [, y, mo, d, h = '00', mi = '00', s = '00'] = pdfMatch;
                    docDate = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).getTime();
                } else {
                    docDate = new Date(raw).getTime();
                }
                const dataEnd = new Date(analysisResult.timespan.end).getTime();
                // Eğer doküman, veriler henüz bitmeden önce yaratılmış görünüyorsa (imkansız durum)
                if (!isNaN(docDate) && !isNaN(dataEnd) && docDate < dataEnd - (24 * 60 * 60 * 1000)) {
                    if (decision !== 'reject') decision = 'revize';
                    reasons.push(`⚠️ ANTI-FRAUD: Belgedeki PDF oluşturulma tarihi, içindeki son veri kaydından daha eski. Rapor üzerinde PDF düzenleyici ile tarih manipülasyonu yapılmış olabilir.`);
                    confidence -= 50;
                }
            }

            if (meta.docCreator && meta.docCreator.toLowerCase().includes('excel')) {
                reasons.push(`⚠️ BİLGİ: Bu PDF orijinal cihaz yazılımından değil, Microsoft Excel vs. bir programdan dışa aktarılmış. Orijinalliğini kontrol ediniz.`);
            }
        }

        // 3. Veri Formatı ve Kesinti Kontrolü
        if (validation) {
            const maxGap = validation.gaps.length > 0 ? Math.max(...validation.gaps.map(g => g.minutes)) : 0;

            if (validation.mostCommonGapMin > 60) {
                if (decision !== 'reject') decision = 'revize';
                reasons.push(`⚠️ REVİZE: Veriler arasında kayıt aralığı ${Utils.formatDuration(validation.mostCommonGapMin)}. 1 saati aşan kayıt aralıkları nedeniyle eczaneden düzgün rapor talebinde bulunulması gerekmektedir.`);
                confidence -= 40;
            } else if (maxGap > 300) { // 5 saat limit
                if (decision !== 'reject') decision = 'revize';
                reasons.push(`⚠️ REVİZE: Rapor içerisinde ${Utils.formatDuration(maxGap)} bulan veri kaybı tespit edildi. Veri bütünlüğü için manuel kontrol gerekmektedir.`);
                confidence -= 50;
            } else if (validation.hasCriticalGap) {
                reasons.push(`⚠️ VERİ KAYBI: Rapor içerisinde ${Utils.formatDuration(maxGap)} varan kesintiler tespit edildi.`);
            }
        }

        /* TOR (Stability Budget) Kontrolü — Şimdilik Devre Dışı
        if (analysisResult.tor && analysisResult.tor.status === 'exceeded') {
            decision = 'reject';
            reasons.push(`❌ RED SEBEBİ: Buzdolabı dışı kalma süresi (TOR) limiti aşıldı (${Utils.formatDuration(analysisResult.tor.torMinutes)} / ${Utils.formatDuration(analysisResult.tor.torLimit)}).`);
            confidence -= 50;
        }
        */

        // 4. Veri Kapsamı Kontrolü (Satın Alma - İade Arası)
        // Eğer kullanıcı tarih girmemişse veya geçersizse, belgedeki tarihleri referans al
        const toMs = (v) => {
            if (!v) return null;
            if (v instanceof Date) return v.getTime();
            const ms = new Date(v).getTime();
            return isNaN(ms) ? null : ms;
        };

        const dataStart = toMs(analysisResult.timespan.start);
        const dataEnd = toMs(analysisResult.timespan.end);
        const userStart = toMs(analysisResult.userRange?.purchase) ?? dataStart;
        const userEnd = toMs(analysisResult.userRange?.return) ?? dataEnd;

        // 6 saatlik margin (hata payı). Tarih bilgisi yoksa kapsama kontrolü atlanır.
        const margin = 6 * 60 * 60 * 1000;

        if (dataStart !== null && userStart !== null && dataStart > (userStart + margin)) {
            if (decision !== 'reject') decision = 'revize';
            reasons.push(`⚠️ REVİZE: Veri başlangıcı satın alma tarihinden sonradır. (Eksik gün tespiti)`);
            confidence -= 30;
        }
        if (dataEnd !== null && userEnd !== null && dataEnd < (userEnd - margin)) {
            if (decision !== 'reject') decision = 'revize';
            reasons.push(`⚠️ REVİZE: Veri bitişi iade talebi tarihinden öncedir. (Eksik gün tespiti)`);
            confidence -= 30;
        }

        // 5. Pozitif Bilgiler ve MKT Özetleri (Sadece gerekli olduğunda)
        if (decision === 'accept') {
            reasons.push('✅ Sıcaklık rejimi (2-8°C) korunmuştur.');

            // Gelen verilerde atlanmış/kayıp veri var ise bildir
            if (validation && validation.hasCriticalGap && !validation.isFrequencyIssue) {
                const totalGapMinutes = validation.gaps.reduce((acc, g) => acc + g.minutes, 0);
                reasons.push(`⚠️ ATLANAN VERİ: Orijinal dosyada toplam ${Utils.formatDuration(totalGapMinutes)} veri boşluğu/atlaması tespit edildi.`);
            }

            // MKT ile telafi edilen sapmalar varsa (Maksimum 2 adet göster)
            if (compliance.checks && compliance.checks.length > 0) {
                const telafiCount = compliance.checks.filter(c => c.isMktOk).length;
                if (telafiCount > 0) {
                    reasons.push(`💡 Bilgilendirme: Kısa süreli sapmalar MKT ortalamasında sorun teşkil etmedi.`);
                }
            }
        }

        const gdpRef = this.getGDPReference(decision);
        confidence = Math.max(confidence, 40);

        return {
            decision,
            confidence,
            reasons,
            gdpReference: gdpRef,
            timestamp: new Date(),
            summary: this.getSummary(decision)
        };
    },

    getSummary(decision) {
        const summaries = {
            accept: 'İlaç soğuk zincir koşullarını karşılamaktadır. Kabul edilebilir.',
            reject: 'İlaç soğuk zincir koşullarını karşılamamaktadır. İade edilmelidir.',
            revize: 'Veri bütünlüğü veya kayıt sıklığı sorunlu. Eczaneden düzgün rapor talebinde bulunulması gerekmektedir.',
            conditional: 'İlaç belirli koşullar altında kabul edilebilir. Eczacı değerlendirmesi gereklidir.'
        };
        return summaries[decision];
    },

    getGDPReference(decision) {
        return {
            standard: 'TİTCK İyi Dağıtım Uygulamaları (GDP) Kılavuzu',
            section: 'Bölüm 9 - Nakliye ve Depolama',
            articles: [
                'Madde 9.2 - Sıcaklık izleme gereksinimleri',
                'Madde 9.3 - Sapma yönetimi prosedürleri',
                'Madde 9.4 - İade ve imha kriterleri'
            ],
            additionalRefs: [
                'WHO TRS 961, Ek 9 - Sıcaklığa duyarlı ürünlerin depolanması',
                'ICH Q1A(R2) - Stabilite testi kılavuzu'
            ]
        };
    }
};
