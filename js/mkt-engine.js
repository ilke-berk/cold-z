/**
 * ColdChain AI — MKT (Mean Kinetic Temperature) Engine
 *
 * MKT hesaplama formülü (USP <1079> / WHO TRS 961):
 * T_mk = (ΔH/R) / (-ln( Σ w_i·e^(-ΔH/RT_i) / Σ w_i ))
 *
 * ΔH = Aktivasyon enerjisi (varsayılan: 83.144 kJ/mol — WHO önerisi)
 * R  = Evrensel gaz sabiti (8.314 J/(mol·K))
 *
 * ZAMAN AĞIRLIĞI: Formül eşit aralıklı örnekleme varsayar. Logger aralığı
 * değişkense, veri boşluğu varsa ya da birden fazla dosya birleştirildiyse
 * her örneğin ağırlığı temsil ettiği SÜRE olmalıdır (yamuk / trapez
 * integrasyonu). `calculateWeighted` bunu yapar; `calculate` yalnızca ham
 * sıcaklık dizisi için (eşit ağırlık) geriye uyumlu tutulmuştur.
 *
 * Veri boşluğu (gapCapMinutes'i aşan aralık) boyunca sıcaklık BİLİNMEZ:
 * ne MKT'ye ne TOR'a ne pencere kapsamasına sayılır; ayrıca raporlanır.
 *
 * SAPMA SINIFLARI:
 *   transient — kısa (minExcursionMinutes altı) ve limite yakın
 *               (spikeTolerance içinde) tek/çift okuma: kapı açılışı, sensör
 *               gürültüsü. Listelenir, ama MKT penceresi açmaz, ihlal sayılmaz.
 *               Kritik veya donma okumaları ASLA transient sayılmaz.
 *   freeze    — freezeLimit (varsayılan 0°C) altı: geri dönüşsüz hasar.
 *               MKT ile "telafi" EDİLEMEZ; her zaman sorun olarak işaretlenir.
 *   critical  — criticalLow altı / criticalHigh üstü (2-8 için 0 / 15).
 *   normal    — limit dışı ama kritik değil: geriye dönük 24h MKT'ye tabi.
 *
 * HİSTEREZİS: 8.0 / 8.1 / 7.9 / 8.1 gibi "flapping" tek bir sapma olarak
 * sayılır; sapma ancak sıcaklık limitin `hysteresis` kadar içine dönünce
 * kapanır.
 */

const MKTEngine = {
    // Sabitler
    R: 8.314,           // Evrensel gaz sabiti J/(mol·K)
    DEFAULT_DH: 83144,  // Aktivasyon enerjisi J/mol (83.144 kJ/mol)
    WINDOW_HOURS: 24,   // Geriye dönük MKT penceresi
    // Geriye dönük 24 saatlik MKT penceresi için asgari GERÇEK veri kapsamı (saat).
    // Kapsama ilk-son örnek arası süre DEĞİL, boşluk (gapCap üstü) dışlanmış
    // örnek-arası sürelerin toplamıdır. Bunun altında karar verilemez:
    // "yetersiz veri" olarak işaretlenir, ihlal SAYILMAZ (karar motoru bunu
    // "şartlı" — eczacı değerlendirmesi — olarak yükseltir).
    MIN_WINDOW_COVERAGE_HOURS: 20,
    MIN_WINDOW_SAMPLES: 6,          // 24 saat arayla iki örnek "tam kapsama" olamaz
    DEFAULT_GAP_CAP_MINUTES: 120,   // bunun üstü örnek-arası süre = veri boşluğu (bilinmeyen)
    DEFAULT_HYSTERESIS: 0.3,        // °C — sapma kapanışı için limitin içine dönüş payı
    DEFAULT_MIN_EXCURSION_MINUTES: 30,
    DEFAULT_SPIKE_TOLERANCE: 0.5,   // °C — limitin bu kadar ötesindeki kısa okuma "anlık"
    DEFAULT_FREEZE_LIMIT: 0,        // °C — altı donma (soğuk zincir / oda ürünleri için)

    // ------------------------------------------------------------------
    // Yardımcılar
    // ------------------------------------------------------------------
    _toMs(t) {
        if (t instanceof Date) return t.getTime();
        if (typeof t === 'number') return t;
        return new Date(t).getTime();
    },
    // Math.min(...arr) büyük serilerde çağrı yığınını taşırır — döngüyle
    _minOf(arr) { let m = Infinity; for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i]; return m; },
    _maxOf(arr) { let m = -Infinity; for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i]; return m; },
    _round(v, d = 2) { return v == null || !isFinite(v) ? null : parseFloat(v.toFixed(d)); },
    _c2k(c) { return (typeof Utils !== 'undefined' && Utils.celsiusToKelvin) ? Utils.celsiusToKelvin(c) : c + 273.15; },
    _k2c(k) { return (typeof Utils !== 'undefined' && Utils.kelvinToCelsius) ? Utils.kelvinToCelsius(k) : k - 273.15; },
    _fmtDur(m) { return (typeof Utils !== 'undefined' && Utils.formatDuration) ? Utils.formatDuration(Math.round(m)) : `${Math.round(m)} dk`; },

    /**
     * Konfigürasyonu tam seçenek setine açar. Kritik eşikler, donma limiti ve
     * sapma parametreleri aralığa göre türetilir; hepsi config ile ezilebilir.
     *
     * 2-8°C için varsayılanlar: criticalLow 0, criticalHigh 15, freezeLimit 0.
     * Dondurulmuş (−25…−15) için: criticalLow −27, criticalHigh −8, freezeLimit yok.
     */
    normalizeOptions(config = {}) {
        const c = config || {};
        const num = (v, d) => (v === undefined || v === null || v === '' || !isFinite(Number(v))) ? d : Number(v);
        const lowerLimit = num(c.lowerLimit, 2);
        const upperLimit = num(c.upperLimit, 8);
        const span = Math.max(0.1, upperLimit - lowerLimit);
        const freezeDefault = lowerLimit >= 0 ? this.DEFAULT_FREEZE_LIMIT : null;
        const freezeLimit = (c.freezeLimit === undefined) ? freezeDefault
            : (c.freezeLimit === null || c.freezeLimit === '' ? null : Number(c.freezeLimit));
        return {
            lowerLimit,
            upperLimit,
            torLimit: num(c.torLimit, 120),
            activationEnergy: num(c.activationEnergy, this.DEFAULT_DH),
            criticalLow: num(c.criticalLow, lowerLimit - 2),
            criticalHigh: num(c.criticalHigh, upperLimit + 7),
            freezeLimit: (freezeLimit != null && isFinite(freezeLimit)) ? freezeLimit : null,
            gapCapMinutes: Math.max(1, num(c.gapCapMinutes, this.DEFAULT_GAP_CAP_MINUTES)),
            hysteresis: Math.min(span / 4, Math.max(0, num(c.hysteresis, this.DEFAULT_HYSTERESIS))),
            minExcursionMinutes: Math.max(0, num(c.minExcursionMinutes, this.DEFAULT_MIN_EXCURSION_MINUTES)),
            spikeTolerance: Math.max(0, num(c.spikeTolerance, this.DEFAULT_SPIKE_TOLERANCE)),
        };
    },

    /**
     * Girdi serisini analiz için hazırlar: geçersiz satırları atar, kronolojik
     * sıralar, aynı zaman damgasındaki mükerrerleri (ilk okuma kalır) siler.
     * Girdi dizisi DEĞİŞTİRİLMEZ; kopya döner.
     */
    prepareSeries(data) {
        const src = Array.isArray(data) ? data : [];
        const rows = [];
        let droppedInvalid = 0;
        for (let i = 0; i < src.length; i++) {
            const d = src[i];
            if (!d) { droppedInvalid++; continue; }
            const ms = this._toMs(d.timestamp);
            const t = Number(d.temperature);
            if (!isFinite(ms) || !isFinite(t)) { droppedInvalid++; continue; }
            rows.push({ ...d, timestamp: d.timestamp instanceof Date ? d.timestamp : new Date(ms), temperature: t, _ms: ms });
        }
        let wasUnsorted = false;
        for (let i = 1; i < rows.length; i++) if (rows[i]._ms < rows[i - 1]._ms) { wasUnsorted = true; break; }
        if (wasUnsorted) rows.sort((a, b) => a._ms - b._ms);
        const out = [];
        let duplicateTimestamps = 0;
        for (let i = 0; i < rows.length; i++) {
            if (i > 0 && rows[i]._ms === rows[i - 1]._ms) { duplicateTimestamps++; continue; }
            const { _ms, ...rest } = rows[i];
            out.push(rest);
        }
        return {
            data: out,
            preprocessing: { inputCount: src.length, outputCount: out.length, droppedInvalid, wasUnsorted, duplicateTimestamps }
        };
    },

    /**
     * En yaygın örnek-arası süre (dakika, yuvarlanmış). Boşluk eşiği ve
     * pencere kapsaması bunun katına göre belirlenir.
     */
    modalIntervalMinutes(data) {
        const counts = {};
        let best = 0, bestCount = 0;
        for (let i = 1; i < data.length; i++) {
            const m = Math.round((this._toMs(data[i].timestamp) - this._toMs(data[i - 1].timestamp)) / 60000);
            if (!(m > 0)) continue;
            counts[m] = (counts[m] || 0) + 1;
            if (counts[m] > bestCount) { bestCount = counts[m]; best = m; }
        }
        return best;
    },

    // ------------------------------------------------------------------
    // MKT
    // ------------------------------------------------------------------
    /**
     * MKT hesapla (EŞİT AĞIRLIK — yalnızca ham sıcaklık dizisi için).
     * Zaman damgalı seri için `calculateWeighted` kullanın.
     * @param {number[]} temperatures - Celsius cinsinden sıcaklık dizisi
     * @param {number} activationEnergy - Aktivasyon enerjisi (J/mol), varsayılan 83144
     */
    calculate(temperatures, activationEnergy = null) {
        const dH = activationEnergy || this.DEFAULT_DH;
        const temps = (temperatures || []).filter(t => isFinite(t));
        const n = temps.length;

        if (n === 0) {
            return { mkt: null, error: 'Sıcaklık verisi bulunamadı' };
        }

        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += Math.exp(-dH / (this.R * this._c2k(temps[i])));
        }
        const avg = sum / n;
        const mktKelvin = dH / (this.R * (-Math.log(avg)));
        const mktCelsius = this._k2c(mktKelvin);
        const stats = this.calculateStats(temps);

        return {
            mkt: this._round(mktCelsius, 2),
            mktKelvin: this._round(mktKelvin, 2),
            activationEnergy: dH,
            sampleCount: n,
            method: 'unweighted',
            ...stats
        };
    },

    /**
     * ZAMAN AĞIRLIKLI MKT (trapez integrasyonu).
     * Her örnek-arası aralıkta e^(-ΔH/RT) iki uç değerin ortalaması kabul edilir
     * ve aralığın süresiyle ağırlıklanır. gapCapMinutes'i aşan aralıklar veri
     * boşluğudur: dışlanır ve `excludedGapMinutes` olarak raporlanır.
     *
     * Tek örnek ya da hiç geçerli aralık yoksa eşit ağırlıklı hesaba düşer
     * (method: 'unweighted').
     *
     * @param {Array} data - [{timestamp, temperature}] (kronolojik)
     * @param {object} config - {activationEnergy, gapCapMinutes}
     */
    calculateWeighted(data, config = {}) {
        const o = this.normalizeOptions(config);
        const dH = o.activationEnergy;
        const rows = (data || []).filter(d => d && isFinite(Number(d.temperature)) && isFinite(this._toMs(d.timestamp)));
        const n = rows.length;
        if (n === 0) return { mkt: null, error: 'Sıcaklık verisi bulunamadı' };

        const temps = new Array(n);
        const ex = new Array(n);
        for (let i = 0; i < n; i++) {
            temps[i] = Number(rows[i].temperature);
            ex[i] = Math.exp(-dH / (this.R * this._c2k(temps[i])));
        }

        let sum = 0, totalMin = 0, excludedGapMinutes = 0, excludedGaps = 0;
        for (let i = 1; i < n; i++) {
            const dt = (this._toMs(rows[i].timestamp) - this._toMs(rows[i - 1].timestamp)) / 60000;
            if (!(dt > 0)) continue;
            if (dt > o.gapCapMinutes) { excludedGapMinutes += dt; excludedGaps++; continue; }
            sum += dt * (ex[i - 1] + ex[i]) / 2;
            totalMin += dt;
        }

        const unweighted = this.calculate(temps, dH);
        if (!(totalMin > 0)) {
            return { ...unweighted, method: 'unweighted', weightedMinutes: 0, excludedGapMinutes: this._round(excludedGapMinutes, 1), excludedGaps, mktUnweighted: unweighted.mkt };
        }

        const avg = sum / totalMin;
        const mktKelvin = dH / (this.R * (-Math.log(avg)));
        const mktCelsius = this._k2c(mktKelvin);
        return {
            ...unweighted,
            mkt: this._round(mktCelsius, 2),
            mktKelvin: this._round(mktKelvin, 2),
            method: 'time-weighted',
            weightedMinutes: this._round(totalMin, 1),
            excludedGapMinutes: this._round(excludedGapMinutes, 1),
            excludedGaps,
            mktUnweighted: unweighted.mkt
        };
    },

    /**
     * Sıcaklık istatistikleri
     */
    calculateStats(temperatures) {
        const n = temperatures.length;
        if (n === 0) return { min: null, max: null, mean: null, median: null, stdDev: null, range: null };
        const min = this._minOf(temperatures);
        const max = this._maxOf(temperatures);
        let sum = 0;
        for (let i = 0; i < n; i++) sum += temperatures[i];
        const mean = sum / n;

        let varSum = 0;
        for (let i = 0; i < n; i++) varSum += Math.pow(temperatures[i] - mean, 2);
        const stdDev = Math.sqrt(varSum / n);

        const sorted = [...temperatures].sort((a, b) => a - b);
        const median = n % 2 === 0
            ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
            : sorted[Math.floor(n / 2)];

        return {
            min: this._round(min, 1),
            max: this._round(max, 1),
            mean: this._round(mean, 2),
            median: this._round(median, 2),
            stdDev: this._round(stdDev, 3),
            range: this._round(max - min, 1)
        };
    },

    // ------------------------------------------------------------------
    // Sapma segmentleri (tek kaynak — excursion / compliance / retrospektif)
    // ------------------------------------------------------------------
    /**
     * Kabul aralığı dışındaki ardışık okumaları segmentlere böler.
     * Histerezis: sapma, sıcaklık [lo+h, hi−h] içine dönünce kapanır.
     * Segment sınırları (start/end) GERÇEKTEN limit dışı okumalardır;
     * histerezis bandındaki ara okumalar segmentin içinde sayılır.
     *
     * Süre (durationMinutes): ilk dışarı okumadan son dışarı okumaya + her iki
     * uçta komşu içeri okumaya kadar olan aralığın yarısı (orta nokta yaklaşımı;
     * her yarı gapCap/2 ile sınırlanır). Tek okuma, 15 dk'lık loggerda ≈ 15 dk.
     *
     * @returns {Array<{start,end,recoverIdx,startTime,endTime,recoverTime,type,
     *   peakTemp,minTemp,maxTemp,exceedance,durationMinutes,sampleCount,
     *   freeze,critical,transient,classification}>}
     */
    findExcursionSegments(data, config = {}) {
        const o = this.normalizeOptions(config);
        const { lowerLimit: lo, upperLimit: hi, hysteresis: h } = o;
        const segs = [];
        if (!data || data.length === 0) return segs;

        let cur = null;
        for (let i = 0; i < data.length; i++) {
            const t = data[i].temperature;
            const isOut = t < lo || t > hi;
            if (!cur) {
                if (isOut) cur = { start: i, end: i, recoverIdx: null };
                continue;
            }
            // sapma açık: gerçekten dışarıdaysa uzat; içeri (histerezis payıyla) döndüyse kapat
            if (isOut) { cur.end = i; continue; }
            const recovered = t >= lo + h && t <= hi - h;
            if (recovered) { cur.recoverIdx = i; segs.push(cur); cur = null; }
            // histerezis bandında: segment açık kalır, end ilerlemez
        }
        if (cur) segs.push(cur);

        const ms = i => this._toMs(data[i].timestamp);
        const halfCap = o.gapCapMinutes / 2;
        return segs.map(s => {
            let minT = Infinity, maxT = -Infinity;
            for (let i = s.start; i <= s.end; i++) {
                const t = data[i].temperature;
                if (t < minT) minT = t;
                if (t > maxT) maxT = t;
            }
            const overHi = Math.max(0, maxT - hi);
            const underLo = Math.max(0, lo - minT);
            const type = overHi >= underLo && overHi > 0 ? 'high' : 'low';
            const exceedance = Math.max(overHi, underLo);
            const peakTemp = type === 'high' ? maxT : minT;

            let dur = (ms(s.end) - ms(s.start)) / 60000;
            if (s.start > 0) dur += Math.min(halfCap, (ms(s.start) - ms(s.start - 1)) / 120000);
            if (s.recoverIdx != null) dur += Math.min(halfCap, (ms(s.recoverIdx) - ms(s.end)) / 120000);
            else if (s.end + 1 < data.length) dur += Math.min(halfCap, (ms(s.end + 1) - ms(s.end)) / 120000);

            const freeze = o.freezeLimit != null && minT < o.freezeLimit;
            const critical = minT < o.criticalLow || maxT > o.criticalHigh;
            const transient = !freeze && !critical && dur < o.minExcursionMinutes && exceedance <= o.spikeTolerance;
            const classification = freeze ? 'freeze' : critical ? 'critical' : transient ? 'transient' : 'normal';

            return {
                start: s.start, end: s.end, recoverIdx: s.recoverIdx,
                startTime: data[s.start].timestamp,
                endTime: data[s.end].timestamp,
                recoverTime: s.recoverIdx != null ? data[s.recoverIdx].timestamp : null,
                type, peakTemp: this._round(peakTemp, 1), minTemp: this._round(minT, 1), maxTemp: this._round(maxT, 1),
                exceedance: this._round(exceedance, 2),
                durationMinutes: this._round(dur, 1),
                sampleCount: s.end - s.start + 1,
                freeze, critical, transient, classification
            };
        });
    },

    /**
     * Sapma (excursion) analizi — geriye uyumlu şekil + sınıflandırma.
     * excursionCount / totalExcursionMinutes / high-low sayıları ANLIK
     * (transient) sapmaları İÇERMEZ; onlar `transientCount` ile ayrı raporlanır
     * ve listede `transient: true` ile yer alır.
     *
     * @param {Array} data - [{timestamp, temperature}]
     * @param {number} lowerLimit - Alt limit (°C)
     * @param {number} upperLimit - Üst limit (°C)
     * @param {object} opts - ek seçenekler (normalizeOptions)
     */
    analyzeExcursions(data, lowerLimit = 2, upperLimit = 8, opts = {}) {
        const cfg = { ...opts, lowerLimit, upperLimit };
        const segs = this.findExcursionSegments(data || [], cfg);

        const excursions = segs.map(s => ({
            start: s.startTime,
            end: s.recoverTime || s.endTime,
            startTemp: data[s.start].temperature,
            endTemp: data[s.recoverIdx != null ? s.recoverIdx : s.end].temperature,
            type: s.type,
            peakTemp: s.peakTemp,
            minTemp: s.minTemp,
            maxTemp: s.maxTemp,
            exceedance: s.exceedance,
            duration: s.durationMinutes,
            sampleCount: s.sampleCount,
            readings: data.slice(s.start, s.end + 1),
            transient: s.transient,
            freeze: s.freeze,
            critical: s.critical,
            classification: s.classification
        }));

        const counted = excursions.filter(e => !e.transient);
        let totalExcursionMinutes = 0;
        for (const e of counted) totalExcursionMinutes += e.duration || 0;

        return {
            excursions,
            excursionCount: counted.length,
            transientCount: excursions.length - counted.length,
            totalExcursionMinutes: this._round(totalExcursionMinutes, 1),
            highExcursions: counted.filter(e => e.type === 'high').length,
            lowExcursions: counted.filter(e => e.type === 'low').length,
            freezeExcursions: counted.filter(e => e.freeze).length,
            criticalExcursions: counted.filter(e => e.critical).length
        };
    },

    // ------------------------------------------------------------------
    // Geriye dönük pencere
    // ------------------------------------------------------------------
    /**
     * Verilen çapa indeksinden geriye WINDOW_HOURS saatlik pencereyi çıkarır.
     * Kapsama = pencere içindeki örnek-arası sürelerin toplamı (gapCap üstü
     * aralıklar boşluk sayılır, kapsamaya girmez). MKT zaman ağırlıklıdır.
     */
    _backwardWindow(data, anchorIdx, o) {
        const anchorMs = this._toMs(data[anchorIdx].timestamp);
        const windowStartMs = anchorMs - this.WINDOW_HOURS * 3600000;
        let first = anchorIdx;
        while (first > 0 && this._toMs(data[first - 1].timestamp) >= windowStartMs) first--;
        const windowData = data.slice(first, anchorIdx + 1);

        let coveredMinutes = 0, gapMinutes = 0;
        for (let i = 1; i < windowData.length; i++) {
            const dt = (this._toMs(windowData[i].timestamp) - this._toMs(windowData[i - 1].timestamp)) / 60000;
            if (!(dt > 0)) continue;
            if (dt > o.gapCapMinutes) gapMinutes += dt; else coveredMinutes += dt;
        }
        const spanMinutes = windowData.length > 1
            ? (this._toMs(windowData[windowData.length - 1].timestamp) - this._toMs(windowData[0].timestamp)) / 60000 : 0;

        const mktInfo = this.calculateWeighted(windowData, o);
        const insufficient = coveredMinutes < this.MIN_WINDOW_COVERAGE_HOURS * 60 || windowData.length < this.MIN_WINDOW_SAMPLES;
        let insufficientWhy = null;
        if (insufficient) {
            if (windowData.length < this.MIN_WINDOW_SAMPLES) insufficientWhy = `pencerede yalnızca ${windowData.length} örnek var (en az ${this.MIN_WINDOW_SAMPLES} gerekir)`;
            else if (gapMinutes > 0) insufficientWhy = `pencerede ${this._fmtDur(gapMinutes)} veri boşluğu var; gerçek kapsama ${this._fmtDur(coveredMinutes)}`;
            else insufficientWhy = `kayıt, sapmadan yalnızca ${this._fmtDur(coveredMinutes)} önce başlıyor`;
        }
        return {
            windowData, mktInfo,
            windowStart: windowData.length ? windowData[0].timestamp : new Date(windowStartMs),
            windowEnd: data[anchorIdx].timestamp,
            coveredMinutes: this._round(coveredMinutes, 1),
            gapMinutes: this._round(gapMinutes, 1),
            spanMinutes: this._round(spanMinutes, 1),
            sampleCount: windowData.length,
            insufficient, insufficientWhy
        };
    },

    /**
     * Kabul/red şartlarına göre uygunluk analizi (aralığa göre parametrik).
     * 2-8°C için: <0 veya >15 → RED; 0-2 / 8-15 → 24h MKT; MKT 2-8 dışı → RED;
     * donma (<freezeLimit) → RED (MKT bakılmaz); anlık sapma (8.1 gibi) → gözardı
     * (listelenir). Diğer aralıklar için eşikler normalizeOptions'tan türer.
     *
     * @param {Array} data - [{timestamp, temperature}] (kronolojik)
     * @param {object} config - {lowerLimit, upperLimit, criticalLow, criticalHigh, freezeLimit, ...}
     */
    analyzeCompliance(data, config = {}) {
        const o = this.normalizeOptions(config);
        const { lowerLimit: lo, upperLimit: hi, criticalLow, criticalHigh, freezeLimit } = o;
        const checks = [];
        let globalStatus = 'pass';
        const redReasons = [];
        const conditionalReasons = [];
        const insufficientReasons = [];
        const transientReasons = [];
        const criticalSegments = [];
        const rows = data || [];

        // 1. Kritik sınır kontrolü (aralığa göre) + donma
        const lowCut = freezeLimit != null ? Math.max(freezeLimit, criticalLow) : criticalLow;
        const isCritLow = p => p.temperature < lowCut;
        const isCritHigh = p => p.temperature > criticalHigh;
        const lowSegs = this._findSegments(rows, isCritLow).map(s => ({ ...s, type: 'low' }));
        const highSegs = this._findSegments(rows, isCritHigh).map(s => ({ ...s, type: 'high' }));
        if (lowSegs.length || highSegs.length) {
            globalStatus = 'fail';
            criticalSegments.push(...lowSegs, ...highSegs);
            if (lowSegs.length > 0) {
                let minPoint = null;
                for (const p of rows) if (isCritLow(p) && (!minPoint || p.temperature < minPoint.temperature)) minPoint = p;
                const frozen = freezeLimit != null && minPoint.temperature < freezeLimit;
                redReasons.push(`KRİTİK DÜŞÜŞ: Sıcaklık ${lowCut}°C altına düştü (en düşük ${minPoint.temperature}°C · ${this._fmtTs(minPoint.timestamp)}). ${this._describeSegments(lowSegs, `${lowCut}°C altı`)}.${frozen ? ' Donma riski tespiti! Donma hasarı geri dönüşsüzdür; MKT ile telafi edilemez.' : ' Ürün stabilitesi bozulmuş olabilir.'}`);
            }
            if (highSegs.length > 0) {
                let maxPoint = null;
                for (const p of rows) if (isCritHigh(p) && (!maxPoint || p.temperature > maxPoint.temperature)) maxPoint = p;
                redReasons.push(`KRİTİK YÜKSELİŞ: Sıcaklık ${criticalHigh}°C üstüne çıktı (en yüksek ${maxPoint.temperature}°C · ${this._fmtTs(maxPoint.timestamp)}). ${this._describeSegments(highSegs, `${criticalHigh}°C üstü`)}. Ürün stabilitesi bozulmuş olabilir.`);
            }
        }

        // 2. Limit dışı segmentler (histerezisli, sınıflandırılmış)
        const segments = this.findExcursionSegments(rows, o);
        const bandLabel = seg => seg.type === 'high' ? `${hi}-${criticalHigh}°C` : `${lowCut}-${lo}°C`;
        const segRange = seg => `${this._fmtTs(seg.startTime)} → ${this._fmtTs(seg.endTime)}`;
        const peakLabel = seg => `${seg.type === 'high' ? 'en yüksek' : 'en düşük'} ${seg.peakTemp}°C`;

        for (const seg of segments) {
            // Kritik / donma segmentleri zaten RED — MKT aranmaz
            if (seg.critical || seg.freeze) continue;

            if (seg.transient) {
                transientReasons.push(`Anlık sapma gözardı edildi: ${segRange(seg)}, ${peakLabel(seg)} (${this._fmtDur(seg.durationMinutes)}, limitten ${seg.exceedance}°C sapma).`);
                continue;
            }

            const win = this._backwardWindow(rows, seg.end, o);
            const mktInfo = win.mktInfo;
            const insufficientData = win.insufficient;
            const isMktOk = insufficientData ? null : (mktInfo.mkt != null && mktInfo.mkt >= lo && mktInfo.mkt <= hi);

            const checkResult = {
                segmentStart: seg.startTime,
                segmentEnd: seg.endTime,
                type: seg.type,
                peakTemp: seg.peakTemp,
                durationMinutes: seg.durationMinutes,
                mkt24h: mktInfo.mkt,
                mktMethod: mktInfo.method,
                isMktOk,
                insufficientData,
                insufficientWhy: win.insufficientWhy,
                windowStart: win.windowStart,
                windowEnd: win.windowEnd,
                windowCoverageMinutes: Math.round(win.coveredMinutes),
                windowGapMinutes: Math.round(win.gapMinutes),
                windowSampleCount: win.sampleCount,
            };
            checks.push(checkResult);

            const winRange = `${this._fmtTs(win.windowStart)} → ${this._fmtTs(win.windowEnd)}`;
            if (insufficientData) {
                insufficientReasons.push(`${bandLabel(seg)} sapması (${segRange(seg)}, ${peakLabel(seg)}) için geriye dönük 24 saatlik veri yok (${win.insufficientWhy}; pencere: ${winRange}). MKT (${mktInfo.mkt}°C) karara katılmadı — yetersiz veri.`);
            } else if (!isMktOk) {
                globalStatus = 'fail';
                redReasons.push(`${bandLabel(seg)} sapması (${segRange(seg)}, ${peakLabel(seg)}) sonrası 24h MKT (${mktInfo.mkt}°C) limit dışı [pencere: ${winRange}]. Zincir toparlanamadı.`);
            } else {
                conditionalReasons.push(`${bandLabel(seg)} sapması (${segRange(seg)}, ${peakLabel(seg)}) algılandı ancak 24h MKT (${mktInfo.mkt}°C) ile telafi edildi [pencere: ${winRange}].`);
            }
        }

        const countedSegments = segments.filter(s => !s.transient);
        return {
            status: globalStatus,
            checks,
            criticalSegments,
            redReasons,
            conditionalReasons,
            insufficientReasons,
            transientReasons,
            transientCount: segments.length - countedSegments.length,
            summary: globalStatus === 'pass' ? 'Kabul Edilebilir' : 'Reddedildi',
            excursionCount: countedSegments.length,
            limits: { lowerLimit: lo, upperLimit: hi, criticalLow, criticalHigh, freezeLimit }
        };
    },

    /**
     * Geriye Dönük 24 Saatlik MKT Kontrolü (İSTİSNASIZ)
     *
     * Kabul aralığı dışına çıkan her (anlık olmayan) sapma için, sapmanın son
     * okumasından geriye 24 saatlik zaman ağırlıklı MKT hesaplanır.
     *   status 'ok'           — MKT aralık içinde
     *   status 'bad'          — MKT aralık dışı (hatalı aralık)
     *   status 'freeze'       — sapma donma limitinin altına indi: MKT ne olursa
     *                           olsun sorun (donma geri dönüşsüz)
     *   status 'insufficient' — pencere yeterince dolu değil; ihlal SAYILMAZ
     * Anlık (transient) sapmalar pencere açmaz; `transientCount` ile raporlanır.
     *
     * @returns {object} { triggered, hasProblem, problemCount, freezeCount, insufficientCount, transientCount, excursionCount, windows[] }
     */
    retrospectiveMKTCheck(data, lowerLimit = 2, upperLimit = 8, opts = {}) {
        const o = this.normalizeOptions({ ...opts, lowerLimit, upperLimit });
        const windows = [];
        const empty = { triggered: false, hasProblem: false, problemCount: 0, freezeCount: 0, insufficientCount: 0, transientCount: 0, excursionCount: 0, windows };
        if (!data || data.length === 0) return empty;

        const segments = this.findExcursionSegments(data, o);
        let transientCount = 0;

        for (const seg of segments) {
            if (seg.transient) { transientCount++; continue; }
            const win = this._backwardWindow(data, seg.end, o);
            const mktInfo = win.mktInfo;
            const mktInRange = mktInfo.mkt != null && mktInfo.mkt >= o.lowerLimit && mktInfo.mkt <= o.upperLimit;

            let status, isOk;
            if (seg.freeze) { status = 'freeze'; isOk = false; }
            else if (win.insufficient) { status = 'insufficient'; isOk = null; }
            else { status = mktInRange ? 'ok' : 'bad'; isOk = mktInRange; }

            windows.push({
                excursionStart: seg.startTime,
                excursionEnd: seg.endTime,
                type: seg.type,
                classification: seg.classification,
                peakTemp: seg.peakTemp,
                durationMinutes: seg.durationMinutes,
                windowStart: win.windowStart,
                windowEnd: win.windowEnd,
                mkt24h: mktInfo.mkt,
                mktMethod: mktInfo.method,
                isOk,
                status,
                freeze: seg.freeze,
                critical: seg.critical,
                insufficientData: status === 'insufficient',
                insufficientWhy: status === 'insufficient' ? win.insufficientWhy : null,
                sampleCount: win.sampleCount,
                coverageHours: this._round(win.coveredMinutes / 60, 1),
                gapMinutes: win.gapMinutes
            });
        }

        const problemWindows = windows.filter(w => w.status === 'bad');
        const freezeWindows = windows.filter(w => w.status === 'freeze');
        const insufficientWindows = windows.filter(w => w.status === 'insufficient');
        return {
            triggered: windows.length > 0,
            hasProblem: problemWindows.length + freezeWindows.length > 0,
            problemCount: problemWindows.length + freezeWindows.length,
            freezeCount: freezeWindows.length,
            insufficientCount: insufficientWindows.length,
            transientCount,
            excursionCount: windows.length,
            windows
        };
    },

    /**
     * Zaman damgasını "GG.AA.YYYY SS:DD" biçiminde yazar (gerekçe metinleri için)
     */
    _fmtTs(ts) {
        const d = ts instanceof Date ? ts : new Date(ts);
        if (isNaN(d.getTime())) return '—';
        const p = n => String(n).padStart(2, '0');
        return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    /**
     * Koşulu sağlayan ardışık noktaları segmentlere böler
     * @returns {Array<{start:number,end:number,startTime:Date,endTime:Date,durationMinutes:number}>}
     */
    _findSegments(data, predicate) {
        const segs = [];
        let cur = null;
        for (let i = 0; i < data.length; i++) {
            if (predicate(data[i])) {
                if (!cur) cur = { start: i, end: i };
                else cur.end = i;
            } else if (cur) {
                segs.push(cur);
                cur = null;
            }
        }
        if (cur) segs.push(cur);
        return segs.map(s => {
            const startTime = data[s.start].timestamp;
            const endTime = data[s.end].timestamp;
            const durationMinutes = Math.max(0, (this._toMs(endTime) - this._toMs(startTime)) / 60000);
            return { ...s, startTime, endTime, durationMinutes: parseFloat(durationMinutes.toFixed(1)) };
        });
    },

    /**
     * Segment listesini tek cümlelik zaman aralığı özetine çevirir
     */
    _describeSegments(segs, label) {
        const fmtDur = m => this._fmtDur(m);
        const range = s => `${this._fmtTs(s.startTime)} → ${this._fmtTs(s.endTime)}`;
        const total = segs.reduce((acc, s) => acc + s.durationMinutes, 0);
        if (segs.length === 1) return `${label} aralık: ${range(segs[0])} (${fmtDur(total)})`;
        const first = segs[0];
        const last = segs[segs.length - 1];
        return `${label} ${segs.length} ayrı aralık — ilki ${range(first)}, sonuncusu ${range(last)} (toplam ${fmtDur(total)})`;
    },

    // ------------------------------------------------------------------
    // TOR
    // ------------------------------------------------------------------
    /**
     * TOR (Time Out of Refrigeration) — ayrıntılı.
     * Her örnek-arası aralık: iki uç da limit dışıysa tamamı, yalnızca biri
     * dışıysa yarısı (geçiş orta noktada varsayılır) sayılır. gapCap'i aşan
     * aralık BİLİNMEYEN'dir: sayılmaz, `unknownGapMinutes` olarak raporlanır
     * (eski hesap 6 saatlik logger kesintisini tamamen "dolap dışı" sayıyordu).
     *
     *   torMinutes    — üst limit ÜSTÜ süre ("buzdolabı dışı", stabilite bütçesi)
     *   coldMinutes   — alt limit altı (donma hariç) süre
     *   freezeMinutes — donma limiti altı süre
     */
    calculateTORDetailed(data, lowerLimit = 2, upperLimit = 8, opts = {}) {
        const o = this.normalizeOptions({ ...opts, lowerLimit, upperLimit });
        let warm = 0, cold = 0, freeze = 0, unknown = 0, unknownGaps = 0, observed = 0;
        const rows = data || [];
        const share = (a, b) => (a && b) ? 1 : (a || b) ? 0.5 : 0;
        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1], curr = rows[i];
            const dt = (this._toMs(curr.timestamp) - this._toMs(prev.timestamp)) / 60000;
            if (!(dt > 0)) continue;
            if (dt > o.gapCapMinutes) { unknown += dt; unknownGaps++; continue; }
            observed += dt;
            warm += dt * share(prev.temperature > o.upperLimit, curr.temperature > o.upperLimit);
            cold += dt * share(prev.temperature < o.lowerLimit, curr.temperature < o.lowerLimit);
            if (o.freezeLimit != null) {
                freeze += dt * share(prev.temperature < o.freezeLimit, curr.temperature < o.freezeLimit);
            }
        }
        return {
            torMinutes: this._round(warm, 1),
            coldMinutes: this._round(cold, 1),
            freezeMinutes: this._round(freeze, 1),
            outOfRangeMinutes: this._round(warm + cold, 1),
            observedMinutes: this._round(observed, 1),
            unknownGapMinutes: this._round(unknown, 1),
            unknownGaps,
            method: 'interval-midpoint'
        };
    },

    /**
     * TOR (dakika) — geriye uyumlu sayısal kısayol (üst limit üstü süre)
     */
    calculateTOR(data, lowerLimit = 2, upperLimit = 8, opts = {}) {
        return this.calculateTORDetailed(data, lowerLimit, upperLimit, opts).torMinutes;
    },

    /**
     * Stabilite bütçesi değerlendirmesi
     */
    evaluateStabilityBudget(torMinutes, torLimit = 120) {
        const usedPercentage = torLimit > 0 ? (torMinutes / torLimit) * 100 : (torMinutes > 0 ? Infinity : 0);
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
            usedPercentage: isFinite(usedPercentage) ? parseFloat(usedPercentage.toFixed(1)) : 999,
            status
        };
    },

    // ------------------------------------------------------------------
    // Tam analiz
    // ------------------------------------------------------------------
    /**
     * Tam analiz yap. Girdi sırasız / mükerrer / geçersiz satırlı olabilir;
     * önce prepareSeries ile temizlenir (girdi değiştirilmez).
     */
    fullAnalysis(data, config = {}, externalValidation = null) {
        const prep = this.prepareSeries(data);
        const rows = prep.data;

        // Boşluk eşiği: en yaygın aralığın 2 katı, en az varsayılan (120 dk)
        const modal = this.modalIntervalMinutes(rows);
        const o = this.normalizeOptions({
            ...config,
            gapCapMinutes: config.gapCapMinutes != null ? config.gapCapMinutes : Math.max(this.DEFAULT_GAP_CAP_MINUTES, modal * 2)
        });
        const { lowerLimit, upperLimit, torLimit } = o;

        // MKT (zaman ağırlıklı)
        const mktResult = this.calculateWeighted(rows, o);

        // Sapma analizi
        const excursionResult = this.analyzeExcursions(rows, lowerLimit, upperLimit, o);

        // TOR + stabilite bütçesi
        const torDetail = this.calculateTORDetailed(rows, lowerLimit, upperLimit, o);
        const stabilityBudget = { ...this.evaluateStabilityBudget(torDetail.torMinutes, torLimit), ...torDetail, torMinutes: torDetail.torMinutes };

        // Uygunluk analizi (aralığa göre parametrik)
        const compliance = this.analyzeCompliance(rows, o);

        // Geriye dönük 24h MKT kontrolü (istisnasız)
        const retrospectiveMKT = this.retrospectiveMKTCheck(rows, lowerLimit, upperLimit, o);

        // Zaman boşluğu analizi (gaps)
        let validationResult;
        if (externalValidation) {
            validationResult = {
                ...externalValidation,
                mostCommonGapMin: externalValidation.mostCommonGapMin || externalValidation.avgGapMin || 0
            };
        } else {
            const intervals = [];
            let totalGapMin = 0;
            for (let i = 1; i < rows.length; i++) {
                const gapMin = (this._toMs(rows[i].timestamp) - this._toMs(rows[i - 1].timestamp)) / 60000;
                intervals.push({ start: rows[i - 1].timestamp, end: rows[i].timestamp, minutes: gapMin });
                totalGapMin += gapMin;
            }
            const gapThreshold = o.gapCapMinutes;
            const gaps = intervals.filter(inv => inv.minutes > gapThreshold);
            const avgGapMin = rows.length > 1 ? totalGapMin / (rows.length - 1) : 0;
            validationResult = {
                gaps,
                hasCriticalGap: gaps.length > 0,
                isFrequencyIssue: modal > 60,
                avgGapMin: Math.round(avgGapMin),
                mostCommonGapMin: modal
            };
        }

        return {
            mkt: mktResult,
            excursions: excursionResult,
            tor: stabilityBudget,
            compliance,
            retrospectiveMKT,
            validation: validationResult,
            resampling: externalValidation?.resampling || null,
            preprocessing: prep.preprocessing,
            config: { ...o },
            dataPoints: rows.length,
            timespan: {
                start: rows[0]?.timestamp,
                end: rows[rows.length - 1]?.timestamp,
                durationMinutes: rows.length > 1
                    ? (this._toMs(rows[rows.length - 1].timestamp) - this._toMs(rows[0].timestamp)) / 60000
                    : 0
            }
        };
    }
};

// Tarayıcıda global olarak eriş (üst düzey const, window özelliği oluşturmaz)
if (typeof window !== 'undefined') window.MKTEngine = MKTEngine;
