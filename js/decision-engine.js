/**
 * ColdChain AI — Decision Engine
 * TİTCK GDP kılavuzuna göre karar motoru
 */
const DecisionEngine = {
    // Karar şiddeti sırası: bir bulgu kararı yalnızca YUKARI taşıyabilir.
    //   accept      — sorun yok
    //   conditional — veri sağlam ama sistem tek başına karar veremiyor (eczacı değerlendirmesi)
    //   revize      — veri bütünlüğü/sıklığı sorunlu, eczaneden düzgün rapor istenir
    //   reject      — ihlal
    RANK: { accept: 0, conditional: 1, revize: 2, reject: 3 },

    evaluate(analysisResult) {
        const { compliance, validation } = analysisResult;
        const cfg = analysisResult.config || {};
        const lo = Number.isFinite(Number(cfg.lowerLimit)) ? Number(cfg.lowerLimit) : 2;
        const hi = Number.isFinite(Number(cfg.upperLimit)) ? Number(cfg.upperLimit) : 8;
        const reasons = [];
        let decision = 'accept';
        let confidence = 100;
        const escalate = (to) => { if ((this.RANK[to] || 0) > (this.RANK[decision] || 0)) decision = to; };

        // 1. Kabul/Red Şartları (Compliance Engine Sonuçları)
        if (compliance.status === 'fail') {
            decision = 'reject';
            // Sadece RED nedenlerini ekle
            compliance.redReasons.forEach(reason => {
                reasons.push(reason);
            });
            confidence -= 40;
        }

        // 1b. Donma — MKT ile telafi EDİLEMEZ (compliance kritik eşiği zaten
        // yakalar; geriye dönük kontrol donmayı ayrıca işaretlediğinde de RED)
        const retro = analysisResult.retrospectiveMKT;
        if (retro && retro.freezeCount > 0 && decision !== 'reject') {
            decision = 'reject';
            const fw = retro.windows.find(w => w.status === 'freeze');
            reasons.push(`❌ RED SEBEBİ: Donma tespiti — sıcaklık ${cfg.freezeLimit != null ? cfg.freezeLimit : 0}°C altına indi (en düşük ${fw ? fw.peakTemp : '?'}°C). Donma hasarı geri dönüşsüzdür; 24h MKT değeri bu durumda telafi sayılmaz.`);
            confidence -= 40;
        }

        // 2. ANTI-FRAUD (Sahtecilik ve Anomali Tespiti)
        // 2a. Sentetik (Sahte) Veri Kontrolü: Doğal bir buzdolabı kompresörü her zaman dalgalanma yaratır.
        // Eğer veride olağandışı bir "kusursuzluk" varsa (Standart sapma çok düşükse) ve yeterince veri varsa
        if (analysisResult.mkt && analysisResult.mkt.stdDev < 0.2 && analysisResult.dataPoints > 100) {
            escalate('revize');
            reasons.push(`🚨 ANTI-FRAUD: Standart sapma (${analysisResult.mkt.stdDev}) olağandışı düşük. Sıcaklık verileri doğal donanım gürültüsü barındırmıyor, Excel vb. yazılımlarla "sentetik (sahte)" üretilmiş kusursuz veri kalıbı olabilir!`);
            confidence -= 60;
        }

        // 2b. PDF Metadata Manipülasyonu & Mükerrer Cihaz Şüphesi
        if (analysisResult.metadata) {
            const meta = analysisResult.metadata;

            // Mükerrer cihaz kontrolü: DB'den gelen dedupResult'a göre
            // (backend /api/device-serial/check). Aynı seri, farklı dosya
            // hash'i ile daha önce görülmüşse mükerrer rapor şüphesi.
            if (meta.deviceSerial && meta.dedupResult?.isDuplicate) {
                decision = 'reject';
                const prev = meta.dedupResult.previousOccurrences?.[0];
                const ctx = prev
                    ? (prev.pharmacy
                        ? `"${prev.pharmacy}" eczanesinde ${new Date(prev.created_at).toLocaleDateString('tr-TR')} tarihinde`
                        : `${new Date(prev.created_at).toLocaleDateString('tr-TR')} tarihinde`)
                    : 'daha önce';
                reasons.unshift(`🚨 ANTI-FRAUD: "${meta.deviceSerial}" seri numaralı cihaz ${ctx} sisteme yüklenmiş! Mükerrer rapor şüphesi.`);
                confidence -= 80;
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
                    escalate('revize');
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

            const maxInterval = Number.isFinite(Number(cfg.maxIntervalMinutes)) && Number(cfg.maxIntervalMinutes) > 0 ? Number(cfg.maxIntervalMinutes) : 60;
            if (validation.mostCommonGapMin > maxInterval) {
                escalate('revize');
                reasons.push(`⚠️ REVİZE: Veriler arasında kayıt aralığı ${Utils.formatDuration(validation.mostCommonGapMin)}. ${Utils.formatDuration(maxInterval)} sınırını aşan kayıt aralıkları nedeniyle eczaneden düzgün rapor talebinde bulunulması gerekmektedir.`);
                confidence -= 40;
            } else if (maxGap > 300) { // 5 saat limit
                escalate('revize');
                reasons.push(`⚠️ REVİZE: Rapor içerisinde ${Utils.formatDuration(maxGap)} bulan veri kaybı tespit edildi. Veri bütünlüğü için manuel kontrol gerekmektedir.`);
                confidence -= 50;
            } else if (validation.hasCriticalGap) {
                reasons.push(`⚠️ VERİ KAYBI: Rapor içerisinde ${Utils.formatDuration(maxGap)} varan kesintiler tespit edildi.`);
            }
        }

        // 3b. TOR (Stabilite Bütçesi) Kontrolü
        // Ürün bazlı stabilite verisi (formüler) olmadan TOR aşımı tek başına
        // RED gerekçesi yapılmaz — ama sessizce de geçilmez: karar ŞARTLI'ya
        // yükselir, eczacı ürünün üretici stabilite verisiyle değerlendirir.
        // TOR yalnızca üst limit ÜSTÜ süredir; logger kesintileri sayılmaz
        // (tor.unknownGapMinutes ayrıca raporlanır).
        const tor = analysisResult.tor;
        if (tor && tor.status === 'exceeded') {
            escalate('conditional');
            reasons.push(`⚠️ ŞARTLI: Buzdolabı dışı kalma süresi (TOR) limiti aşıldı (${Utils.formatDuration(tor.torMinutes)} / ${Utils.formatDuration(tor.torLimit)}). Ürünün üretici stabilite verisiyle eczacı değerlendirmesi gerekir.`);
            confidence -= 25;
        } else if (tor && tor.status === 'warning') {
            reasons.push(`⚠️ BİLGİ: TOR bütçesinin %${tor.usedPercentage}'i kullanıldı (${Utils.formatDuration(tor.torMinutes)} / ${Utils.formatDuration(tor.torLimit)}).`);
        }
        if (tor && tor.unknownGapMinutes > 0) {
            reasons.push(`⚠️ BİLGİ: ${Utils.formatDuration(tor.unknownGapMinutes)} veri boşluğu boyunca sıcaklık bilinmiyor; bu süre TOR ve MKT'ye dahil edilmedi.`);
        }

        // 3c. Yetersiz veriyle değerlendirilemeyen sapmalar → ŞARTLI
        // "İhlal sayılmaz" doğru, ama "temiz kabul" de değil: sistem karar
        // veremediğini söyler, eczacı değerlendirir.
        const insufficient = (compliance.insufficientReasons || []).length;
        if (insufficient > 0) {
            escalate('conditional');
            reasons.push(`⚠️ ŞARTLI: ${insufficient} sapma için geriye dönük 24 saatlik veri yetersiz; MKT ile değerlendirilemedi. Eczacı değerlendirmesi gerekir.`);
            compliance.insufficientReasons.forEach(r => reasons.push(`   · ${r}`));
            confidence -= 15;
        }

        // 3d. Anlık sapmalar (bilgi — karara etki etmez)
        if (compliance.transientCount > 0) {
            reasons.push(`💡 Bilgilendirme: ${compliance.transientCount} anlık sapma (kısa süreli, limite yakın tek okuma) kapı açılışı/sensör gürültüsü olarak değerlendirildi ve ihlal sayılmadı.`);
        }

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
            escalate('revize');
            reasons.push(`⚠️ REVİZE: Veri başlangıcı satın alma tarihinden sonradır. (Eksik gün tespiti)`);
            confidence -= 30;
        }
        if (dataEnd !== null && userEnd !== null && dataEnd < (userEnd - margin)) {
            escalate('revize');
            reasons.push(`⚠️ REVİZE: Veri bitişi iade talebi tarihinden öncedir. (Eksik gün tespiti)`);
            confidence -= 30;
        }

        // 5. Pozitif Bilgiler ve MKT Özetleri (Sadece gerekli olduğunda)
        if (decision === 'accept') {
            reasons.push(`✅ Sıcaklık rejimi (${lo}-${hi}°C) korunmuştur.`);

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
            conditional: 'Sistem tek başına karar veremedi (TOR bütçesi aşımı veya değerlendirilemeyen sapma). Eczacı değerlendirmesi gereklidir.'
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

// Tarayıcıda global olarak eriş (üst düzey const, window özelliği oluşturmaz)
if (typeof window !== 'undefined') window.DecisionEngine = DecisionEngine;
