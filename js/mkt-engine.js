/**
 * ColdChain AI — MKT (Mean Kinetic Temperature) Engine
 * 
 * MKT hesaplama formülü:
 * T_mk = (ΔH/R) / (-ln((e^(-ΔH/RT₁) + e^(-ΔH/RT₂) + ... + e^(-ΔH/RTₙ)) / n))
 * 
 * ΔH = Aktivasyon enerjisi (varsayılan: 83.144 kJ/mol — WHO önerisi)
 * R  = Evrensel gaz sabiti (8.314 J/(mol·K))
 */

const MKTEngine = {
    // Sabitler
    R: 8.314,           // Evrensel gaz sabiti J/(mol·K)
    DEFAULT_DH: 83144,  // Aktivasyon enerjisi J/mol (83.144 kJ/mol)

    /**
     * MKT hesapla
     * @param {number[]} temperatures - Celsius cinsinden sıcaklık dizisi
     * @param {number} activationEnergy - Aktivasyon enerjisi (J/mol), varsayılan 83144
     * @returns {object} MKT sonuçları
     */
    calculate(temperatures, activationEnergy = null) {
        const dH = activationEnergy || this.DEFAULT_DH;
        const n = temperatures.length;

        if (n === 0) {
            return {
                mkt: null,
                error: 'Sıcaklık verisi bulunamadı'
            };
        }

        // Celsius -> Kelvin dönüşümü
        const tempKelvin = temperatures.map(t => Utils.celsiusToKelvin(t));

        // e^(-ΔH/RT) toplamını hesapla
        let sum = 0;
        for (let i = 0; i < n; i++) {
            const exponent = -dH / (this.R * tempKelvin[i]);
            sum += Math.exp(exponent);
        }

        // Ortalama
        const avg = sum / n;

        // MKT (Kelvin)
        const mktKelvin = dH / (this.R * (-Math.log(avg)));

        // Kelvin -> Celsius
        const mktCelsius = Utils.kelvinToCelsius(mktKelvin);

        // İstatistikler
        const stats = this.calculateStats(temperatures);

        return {
            mkt: parseFloat(mktCelsius.toFixed(2)),
            mktKelvin: parseFloat(mktKelvin.toFixed(2)),
            activationEnergy: dH,
            sampleCount: n,
            ...stats
        };
    },

    /**
     * Sıcaklık istatistikleri
     */
    calculateStats(temperatures) {
        const n = temperatures.length;
        const min = Math.min(...temperatures);
        const max = Math.max(...temperatures);
        const sum = temperatures.reduce((a, b) => a + b, 0);
        const mean = sum / n;

        // Standart sapma
        const variance = temperatures.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        // Medyan
        const sorted = [...temperatures].sort((a, b) => a - b);
        const median = n % 2 === 0
            ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
            : sorted[Math.floor(n / 2)];

        return {
            min: parseFloat(min.toFixed(1)),
            max: parseFloat(max.toFixed(1)),
            mean: parseFloat(mean.toFixed(2)),
            median: parseFloat(median.toFixed(2)),
            stdDev: parseFloat(stdDev.toFixed(3)),
            range: parseFloat((max - min).toFixed(1))
        };
    },

    /**
     * Sapma (excursion) analizi
     * @param {Array} data - [{timestamp, temperature}]
     * @param {number} lowerLimit - Alt limit (°C)
     * @param {number} upperLimit - Üst limit (°C)
     */
    analyzeExcursions(data, lowerLimit = 2, upperLimit = 8) {
        const excursions = [];
        let currentExcursion = null;
        let totalExcursionMinutes = 0;

        for (let i = 0; i < data.length; i++) {
            const point = data[i];
            const isOutOfRange = point.temperature < lowerLimit || point.temperature > upperLimit;
            const excursionType = point.temperature > upperLimit ? 'high' :
                point.temperature < lowerLimit ? 'low' : null;

            if (isOutOfRange) {
                if (!currentExcursion) {
                    currentExcursion = {
                        start: point.timestamp,
                        startTemp: point.temperature,
                        type: excursionType,
                        peakTemp: point.temperature,
                        readings: [point]
                    };
                } else {
                    currentExcursion.readings.push(point);
                    if (excursionType === 'high' && point.temperature > currentExcursion.peakTemp) {
                        currentExcursion.peakTemp = point.temperature;
                    }
                    if (excursionType === 'low' && point.temperature < currentExcursion.peakTemp) {
                        currentExcursion.peakTemp = point.temperature;
                    }
                }
            } else if (currentExcursion) {
                currentExcursion.end = point.timestamp;
                currentExcursion.endTemp = point.temperature;
                currentExcursion.duration = (new Date(point.timestamp) - new Date(currentExcursion.start)) / 60000;
                totalExcursionMinutes += currentExcursion.duration;
                excursions.push(currentExcursion);
                currentExcursion = null;
            }
        }

        // Close any open excursion
        if (currentExcursion) {
            const lastPoint = data[data.length - 1];
            currentExcursion.end = lastPoint.timestamp;
            currentExcursion.endTemp = lastPoint.temperature;
            currentExcursion.duration = (new Date(lastPoint.timestamp) - new Date(currentExcursion.start)) / 60000;
            totalExcursionMinutes += currentExcursion.duration;
            excursions.push(currentExcursion);
        }

        return {
            excursions,
            excursionCount: excursions.length,
            totalExcursionMinutes: parseFloat(totalExcursionMinutes.toFixed(1)),
            highExcursions: excursions.filter(e => e.type === 'high').length,
            lowExcursions: excursions.filter(e => e.type === 'low').length
        };
    },

    /**
     * Kullanıcıya özel kabul/red şartlarına göre analiz (New Compliance Rules)
     * 1. < 0 veya > 25 -> RED
     * 2. 1-2 arası veya 15-25 arası -> 24h MKT Analizi
     * 3. 24h MKT 2-8 dışındaysa -> RED
     * 4. Diğer durumlar -> KABUL
     * 5. Anlık sapmalar (8.1 gibi) -> GÖZARDI
     */
    analyzeCompliance(data) {
        const checks = [];
        let globalStatus = 'pass';
        const redReasons = [];
        const conditionalReasons = [];

        // 1. Kritik Sınır Kontrolü (< 0 veya > 15)
        // USER REQUEST: 15 üstü red, 0 altı red.
        const criticalPoints = data.filter(d => d.temperature < 0 || d.temperature > 15);
        if (criticalPoints.length > 0) {
            globalStatus = 'fail';
            const min = Math.min(...criticalPoints.map(p => p.temperature));
            const max = Math.max(...criticalPoints.map(p => p.temperature));
            if (min < 0) redReasons.push(`KRİTİK DÜŞÜŞ: Sıcaklık 0°C altına düştü (${min}°C). Donma riski tespiti!`);
            if (max > 15) redReasons.push(`KRİTİK YÜKSELİŞ: Sıcaklık 15°C üstüne çıktı (${max}°C). Ürün stabilitesi bozulmuş olabilir.`);
        }

        // 2. MKT Kontrolü Gerektiren Segmentleri Bul (0-2 veya 8-15)
        // USER REQUEST: 0-2 arası şartlı, 8-15 arası şartlı.
        const segments = [];
        let currentSegment = null;

        for (let i = 0; i < data.length; i++) {
            const p = data[i];
            const isWarning = (p.temperature >= 0 && p.temperature < 2) || (p.temperature > 8 && p.temperature <= 15);

            if (isWarning) {
                if (!currentSegment) {
                    currentSegment = { start: i, end: i, type: p.temperature < 2 ? 'low' : 'high' };
                } else {
                    currentSegment.end = i;
                }
            } else if (currentSegment) {
                segments.push(currentSegment);
                currentSegment = null;
            }
        }
        if (currentSegment) segments.push(currentSegment);

        // Her segment için 24 saatlik MKT hesapla
        for (const seg of segments) {
            const fixIndex = seg.end;
            const fixTime = data[fixIndex].timestamp;
            const startTime = new Date(fixTime.getTime() - 24 * 60 * 60 * 1000);

            // 24 saatlik pencereye giren verileri filtrele
            const windowData = data.filter(d => d.timestamp >= startTime && d.timestamp <= fixTime);
            const windowTemps = windowData.map(d => d.temperature);

            // Veri penceresi kapsama kontrolü (Pencerenin ne kadarı dolu?)
            let windowCoverageHours = 0;
            if (windowData.length > 1) {
                windowCoverageHours = (new Date(windowData[windowData.length - 1].timestamp) - new Date(windowData[0].timestamp)) / 3600000;
            }

            const mktInfo = this.calculate(windowTemps);
            // Karar: 24h MKT 2-8 arasındaysa OK
            const isMktOk = mktInfo.mkt >= 2 && mktInfo.mkt <= 8;

            const checkResult = {
                segmentStart: data[seg.start].timestamp,
                segmentEnd: data[seg.end].timestamp,
                type: seg.type,
                peakTemp: seg.type === 'high' ? Math.max(...data.slice(seg.start, seg.end + 1).map(p => p.temperature)) : Math.min(...data.slice(seg.start, seg.end + 1).map(p => p.temperature)),
                mkt24h: mktInfo.mkt,
                isMktOk: isMktOk,
                windowCoverageMinutes: Math.round(windowCoverageHours * 60),
            };

            checks.push(checkResult);

            if (!isMktOk) {
                globalStatus = 'fail';
                redReasons.push(`${seg.type === 'high' ? '8-15°C' : '0-2°C'} sapması sonrası 24h MKT (${mktInfo.mkt}°C) limit dışı. Zincir toparlanamadı.`);
            } else {
                conditionalReasons.push(`${seg.type === 'high' ? '8-15°C' : '0-2°C'} sapması algılandı ancak 24h MKT (${mktInfo.mkt}°C) ile telafi edildi.`);
            }
        }

        // Eğer kritik fail yoksa ama sapmalar varsa durum "accept" (MKT kurtardığı için) 
        // ancak UI'da detaylarda belirtilecek. 
        // User dedi ki: "sapıp mkt ortalaması kurtarmıyorsa red. yoksa kabul"

        return {
            status: globalStatus,
            checks,
            redReasons,
            conditionalReasons,
            summary: globalStatus === 'pass' ? 'Kabul Edilebilir' : 'Reddedildi',
            excursionCount: segments.length
        };
    },

    /**
     * TOR (Time Out of Refrigeration) hesapla
     */
    calculateTOR(data, lowerLimit = 2, upperLimit = 8) {
        let torMinutes = 0;

        for (let i = 1; i < data.length; i++) {
            const prev = data[i - 1];
            const curr = data[i];

            if (prev.temperature > upperLimit || prev.temperature < lowerLimit) {
                const timeDiff = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 60000;
                torMinutes += timeDiff;
            }
        }

        return parseFloat(torMinutes.toFixed(1));
    },

    /**
     * Stabilite bütçesi değerlendirmesi
     */
    evaluateStabilityBudget(torMinutes, torLimit = 120) {
        const usedPercentage = (torMinutes / torLimit) * 100;
        const remaining = Math.max(0, torLimit - torMinutes);

        let status;
        if (usedPercentage <= 50) status = 'safe';
        else if (usedPercentage <= 75) status = 'caution';
        else if (usedPercentage <= 100) status = 'warning';
        else status = 'exceeded';

        return {
            torMinutes,
            torLimit,
            remaining: parseFloat(remaining.toFixed(1)),
            usedPercentage: parseFloat(usedPercentage.toFixed(1)),
            status
        };
    },

    /**
     * Tam analiz yap
     */
    fullAnalysis(data, config = {}, externalValidation = null) {
        const {
            lowerLimit = 2,
            upperLimit = 8,
            torLimit = 120,
            activationEnergy = null
        } = config;

        const temperatures = data.map(d => d.temperature);

        // MKT Hesaplama
        const mktResult = this.calculate(temperatures, activationEnergy);

        // Sapma Analizi
        const excursionResult = this.analyzeExcursions(data, lowerLimit, upperLimit);

        // TOR Hesaplama
        const torMinutes = this.calculateTOR(data, lowerLimit, upperLimit);

        // Stabilite Bütçesi
        const stabilityBudget = this.evaluateStabilityBudget(torMinutes, torLimit);

        // Yeni Compliance Analizi
        const compliance = this.analyzeCompliance(data);

        // Zaman Boşluğu Analizi (Gaps)
        let validationResult;

        if (externalValidation) {
            validationResult = {
                ...externalValidation,
                mostCommonGapMin: externalValidation.mostCommonGapMin || externalValidation.avgGapMin || 0
            };
        } else {
            const intervals = [];
            const gapCounts = {};
            let totalGapMin = 0;

            for (let i = 1; i < data.length; i++) {
                const gap = data[i].timestamp - data[i - 1].timestamp;
                const gapMin = gap / 60000;
                intervals.push({ start: data[i - 1].timestamp, end: data[i].timestamp, minutes: gapMin });

                const roundedGap = Math.round(gapMin);
                gapCounts[roundedGap] = (gapCounts[roundedGap] || 0) + 1;
                totalGapMin += gapMin;
            }

            // En yaygın kayıt aralığını (mod/trend) bul
            let mostCommonGapMin = 0;
            let maxCount = 0;
            for (const [gapVal, count] of Object.entries(gapCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    mostCommonGapMin = parseInt(gapVal, 10);
                }
            }

            // Eşik değeri: En yaygın aralığın 2 katı veya minimum 120 dk (2 saat)
            const gapThreshold = Math.max(120, mostCommonGapMin * 2);
            const gaps = intervals.filter(inv => inv.minutes > gapThreshold);

            const avgGapMin = data.length > 1 ? totalGapMin / (data.length - 1) : 0;
            const hasCriticalGap = gaps.length > 0;
            const isFrequencyIssue = mostCommonGapMin > 60;

            validationResult = {
                gaps,
                hasCriticalGap,
                isFrequencyIssue,
                avgGapMin: Math.round(avgGapMin),
                mostCommonGapMin: mostCommonGapMin
            };
        }

        return {
            mkt: mktResult,
            excursions: excursionResult,
            tor: stabilityBudget,
            compliance,
            validation: validationResult,
            resampling: externalValidation?.resampling || null,
            config: { lowerLimit, upperLimit, torLimit },
            dataPoints: data.length,
            timespan: {
                start: data[0]?.timestamp,
                end: data[data.length - 1]?.timestamp,
                durationMinutes: data.length > 1
                    ? (new Date(data[data.length - 1].timestamp) - new Date(data[0].timestamp)) / 60000
                    : 0
            }
        };
    }
};
