/**
 * ColdChain AI — Analysis Page
 */
const AnalysisPage = {
    chartInstance: null,
    selectedPointIndex: -1,
    currentInterval: '1h',

    intervalOptions: [
        { key: '10m', label: '10 dk', ms: 10 * 60000 },
        { key: '30m', label: '30 dk', ms: 30 * 60000 },
        { key: '1h',  label: '1 sa',  ms: 60 * 60000 },
        { key: '2h',  label: '2 sa',  ms: 120 * 60000 },
        { key: '3h',  label: '3 sa',  ms: 180 * 60000 },
        { key: '6h',  label: '6 sa',  ms: 360 * 60000 },
        { key: 'daily', label: 'Gün', ms: 24 * 3600000 }
    ],

    tsMs(t) {
        if (t == null) return NaN;
        if (t instanceof Date) return t.getTime();
        if (typeof t === 'number') return t;
        const parsed = new Date(t).getTime();
        return isNaN(parsed) ? NaN : parsed;
    },

    /**
     * Veri boşluğu analizi: ortalama aralığın 1.5 katından uzun boşlukları tespit eder
     */
    analyzeGaps(data) {
        if (!data || data.length < 3) return { gaps: [], avgIntervalMs: 0, totalGaps: 0, avgIntervalLabel: '—' };

        // Tüm ardışık veri noktaları arasındaki aralıkları hesapla
        const intervals = [];
        for (let i = 1; i < data.length; i++) {
            const t1 = data[i - 1].timestamp instanceof Date ? data[i - 1].timestamp.getTime() : new Date(data[i - 1].timestamp).getTime();
            const t2 = data[i].timestamp instanceof Date ? data[i].timestamp.getTime() : new Date(data[i].timestamp).getTime();
            const diff = t2 - t1;
            if (diff > 0) intervals.push({ index: i, diff, from: t1, to: t2 });
        }

        if (intervals.length === 0) return { gaps: [], avgIntervalMs: 0, totalGaps: 0, avgIntervalLabel: '—' };

        // Medyan aralığı bul (ortalama outlier'lara duyarlı, medyan daha sağlam)
        const sorted = [...intervals].sort((a, b) => a.diff - b.diff);
        const medianInterval = sorted[Math.floor(sorted.length / 2)].diff;

        // Ortalama aralığı da hesapla (gösterim için)
        const avgInterval = intervals.reduce((s, i) => s + i.diff, 0) / intervals.length;

        // Eşik: medyan aralığın 1.5 katı (ancak saatlik veri istendiği için minimum 1 saat)
        const threshold = Math.max(medianInterval * 1.5, 3600000);

        // Eşiği aşan boşlukları tespit et
        const gaps = intervals
            .filter(i => i.diff > threshold)
            .map(i => {
                const multiplier = i.diff / medianInterval;
                let severity = 'minor';

                // USER REQUEST: 5 saatten (300 dk) büyük boşluk veya 1 saatten (60 dk) büyük genel aralık kritiktir
                if (i.diff >= 18000000) severity = 'critical'; // 5 saat
                else if (medianInterval > 3600000) severity = 'critical'; // 1 saatten büyük genel kayıt aralığı
                else if (multiplier >= 1.5) severity = 'warning';

                return {
                    from: new Date(i.from),
                    to: new Date(i.to),
                    durationMs: i.diff,
                    multiplier: multiplier,
                    severity: severity
                };
            })
            .sort((a, b) => b.durationMs - a.durationMs); // En uzun boşluk önce

        return {
            gaps,
            avgIntervalMs: avgInterval,
            medianIntervalMs: medianInterval,
            thresholdMs: threshold,
            totalGaps: gaps.length,
            avgIntervalLabel: this.formatInterval(avgInterval),
            thresholdLabel: this.formatInterval(threshold)
        };
    },

    formatInterval(ms) {
        if (ms < 60000) return Math.round(ms / 1000) + ' sn';
        return Utils.formatDuration(ms / 60000);
    },

    formatTimeShort(date) {
        return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
    },

    renderGapPanel(gapAnalysis) {
        const { gaps, totalGaps, avgIntervalLabel, thresholdLabel } = gapAnalysis;

        const criticalCount = gaps.filter(g => g.severity === 'critical').length;
        const badgeClass = criticalCount > 0 ? 'danger' : totalGaps > 0 ? 'warning' : 'success';
        const badgeText = criticalCount > 0 ? `${criticalCount} KRİTİK` : totalGaps > 0 ? `${totalGaps} BOŞLUK` : 'TEMİZ';

        let listHtml = '';
        if (gaps.length === 0) {
            listHtml = `
                <div class="gap-empty">
                    <div class="gap-empty-icon">✅</div>
                    <div class="gap-empty-text">Veri Boşluğu Yok</div>
                    <div class="gap-empty-sub">Tüm kayıtlar düzenli aralıklarla girilmiş veya önemli bir veri kaybı tespit edilmedi.</div>
                </div>`;
        } else {
            listHtml = '<div class="gap-list">' + gaps.map((g, i) => `
                <div class="gap-item" style="animation-delay:${i * 60}ms">
                    <div class="gap-severity ${g.severity}"></div>
                    <div class="gap-info">
                        <div class="gap-time-range">
                            <span>${this.formatTimeShort(g.from)}</span>
                            <span class="gap-arrow">→</span>
                            <span>${this.formatTimeShort(g.to)}</span>
                        </div>
                        <span class="gap-duration ${g.severity}">${this.formatInterval(g.durationMs)}</span>
                        <div class="gap-multiplier">${g.multiplier.toFixed(1)}x ortalama aralık</div>
                    </div>
                </div>`).join('') + '</div>';
        }

        return `
            <div class="gap-panel" id="gap-analysis-panel">
                <div class="gap-panel-header">
                    <div class="gap-panel-header-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </div>
                    <div class="gap-panel-header-text">
                        <div class="gap-panel-title">Veri Boşluğu Analizi</div>
                        <div class="gap-panel-subtitle">Atlanan kayıt tespiti</div>
                    </div>
                    <span class="gap-panel-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="gap-stats">
                    <div class="gap-stat">
                        <div class="gap-stat-value">${avgIntervalLabel}</div>
                        <div class="gap-stat-label">Ort. Aralık</div>
                    </div>
                    <div class="gap-stat">
                        <div class="gap-stat-value">${totalGaps}</div>
                        <div class="gap-stat-label">Tespit Edilen</div>
                    </div>
                </div>
                ${listHtml}
                <div class="gap-threshold-bar">
                    <span class="gap-threshold-label">Mini. Eşik Değeri</span>
                    <span class="gap-threshold-value">${thresholdLabel}</span>
                </div>
            </div>`;
    },

    resampleData(data, interval) {
        if (!data || data.length === 0 || interval === 'raw') return data;

        const opt = this.intervalOptions.find(o => o.key === interval);
        const step = opt ? opt.ms : null;
        if (!step) return data;

        // Basit seyrekleştirme: ilk noktayı al, sonra her `step` ms geçtiğinde
        // bir sonraki noktayı al. Veri zaten kaba ise (örn. saatlik veriye 10 dk
        // seçilirse) tüm noktalar geçer; tam tersi (5 dk veriye 3 saat) ise
        // her 3 saatte bir nokta seçilir.
        const resampled = [];
        let nextTargetTime = this.tsMs(data[0].timestamp);

        for (const item of data) {
            const t = this.tsMs(item.timestamp);
            if (isNaN(t)) continue;
            if (t >= nextTargetTime) {
                resampled.push(item);
                nextTargetTime = t + step;
            }
        }
        return resampled;
    },

    changeInterval(interval) {
        this.currentInterval = interval;
        this.selectedPointIndex = -1;
        this.render();

        const opt = this.intervalOptions.find(o => o.key === interval);
        const label = opt ? opt.label : interval;
        const totalCount = AppState.parsedData?.length || 0;
        const shownCount = this.resampleData(AppState.parsedData || [], interval).length;

        let msg = `${label} aralığı: ${shownCount}/${totalCount} nokta gösteriliyor`;
        if (shownCount === totalCount && totalCount > 0) {
            msg += ' (veri zaten bu aralıktan daha seyrek)';
        }
        Utils.showToast(msg, 'info');
    },

    handleKeyDown(e) {
        // Sadece analiz sayfası aktifken yanıt ver, input/textarea içindeyken yutma
        if (AppState.currentPage !== 'analysis') return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (!this.chartInstance || !AppState.parsedData) return;
        const data = AppState.parsedData;

        if (e.key === 'ArrowRight') {
            this.selectedPointIndex = Math.min(this.selectedPointIndex + 1, data.length - 1);
            this.syncTooltip();
        } else if (e.key === 'ArrowLeft') {
            this.selectedPointIndex = Math.max(this.selectedPointIndex - 1, 0);
            this.syncTooltip();
        } else if (e.key === 'Home') {
            this.selectedPointIndex = 0;
            this.syncTooltip();
        } else if (e.key === 'End') {
            this.selectedPointIndex = data.length - 1;
            this.syncTooltip();
        } else if (e.key === 'Escape') {
            this.chartInstance.resetZoom();
        }
    },

    syncTooltip() {
        if (this.selectedPointIndex === -1) return;
        const meta = this.chartInstance.getDatasetMeta(0);
        const point = meta.data[this.selectedPointIndex];

        if (point) {
            this.chartInstance.tooltip.setActiveElements([
                { datasetIndex: 0, index: this.selectedPointIndex }
            ]);
            this.chartInstance.update();
        }
    },

    /**
     * "MKT Kontrol (Geriye Dönük)" bölümünü oluşturur.
     * Sıcaklık 2-8 dışına her çıktığında (istisnasız) düzelme anından geriye
     * 24 saatlik MKT kontrol edilir. Sorun yoksa "Sorun bulunamadı", varsa
     * hatalı 24 saatlik aralık(lar) gösterilir.
     */
    renderRetrospectiveMKT(a) {
        const lower = a.config?.lowerLimit ?? 2;
        const upper = a.config?.upperLimit ?? 8;
        const retro = a.retrospectiveMKT;

        // Eski/eksik analiz nesneleri için güvenli geri dönüş (canlı hesap)
        const r = retro || (typeof MKTEngine !== 'undefined'
            ? MKTEngine.retrospectiveMKTCheck(AppState.parsedData || [], lower, upper)
            : { triggered: false, hasProblem: false, problemCount: 0, excursionCount: 0, windows: [] });

        let badgeClass, badgeText;
        if (r.hasProblem) { badgeClass = 'chip-danger'; badgeText = `${r.problemCount} HATALI ARALIK`; }
        else if (r.triggered) { badgeClass = 'chip-success'; badgeText = 'SORUN BULUNAMADI'; }
        else { badgeClass = 'chip-success'; badgeText = 'TEMİZ'; }

        // Gövde
        let body = '';
        if (!r.triggered) {
            body = `
                <div style="display:flex;align-items:center;gap:12px;padding:18px;background:rgba(16,185,129,0.06);border-radius:8px">
                    <span style="font-size:1.6rem">✅</span>
                    <div>
                        <div style="font-weight:600;color:var(--color-success-500)">Sorun bulunamadı</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary)">Sıcaklık hiçbir noktada ${lower}-${upper}°C aralığının dışına çıkmadı; geriye dönük 24 saatlik MKT kontrolü gerekmedi.</div>
                    </div>
                </div>`;
        } else if (!r.hasProblem) {
            body = `
                <div style="display:flex;align-items:center;gap:12px;padding:18px;background:rgba(16,185,129,0.06);border-radius:8px">
                    <span style="font-size:1.6rem">✅</span>
                    <div>
                        <div style="font-weight:600;color:var(--color-success-500)">Sorun bulunamadı</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary)">Tespit edilen <strong>${r.excursionCount}</strong> sapma için düzelme anından geriye 24 saatlik MKT hesaplandı ve tümü ${lower}-${upper}°C aralığında kaldı.</div>
                    </div>
                </div>`;
        } else {
            const problem = r.windows.filter(w => !w.isOk);
            const ok = r.windows.filter(w => w.isOk);

            const rowHtml = (w, faulty) => `
                <tr class="${faulty ? 'deviation-highlight' : ''}">
                    <td>
                        <span class="badge-status badge-${w.type === 'high' ? 'reject' : 'conditional'}">
                            ${w.type === 'high' ? 'Yüksek' : 'Düşük'} (${w.peakTemp}°C)
                        </span>
                    </td>
                    <td style="font-size:0.82rem">${Utils.formatDateTime(w.windowStart)} → ${Utils.formatDateTime(w.windowEnd)}</td>
                    <td style="font-weight:700;color:${faulty ? 'var(--color-danger-400)' : 'var(--text-primary)'}">${w.mkt24h != null ? w.mkt24h + '°C' : '—'}</td>
                    <td>${Components.decisionBadge(faulty ? 'reject' : 'accept', faulty
                        ? `Hatalı aralık: Bu 24 saatlik pencerede MKT (${w.mkt24h}°C) ${lower}-${upper}°C dışında.`
                        : `24h MKT (${w.mkt24h}°C) limit içinde kaldı.`)}</td>
                </tr>`;

            body = `
                <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:rgba(239,68,68,0.07);border-radius:8px;margin-bottom:14px">
                    <span style="font-size:1.6rem">⚠️</span>
                    <div>
                        <div style="font-weight:600;color:var(--color-danger-500)">${r.problemCount} hatalı aralık tespit edildi</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary)">Aşağıdaki geriye dönük 24 saatlik pencere(ler)de MKT ${lower}-${upper}°C aralığının dışında kaldı.</div>
                    </div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead><tr><th>Sapma</th><th>Geriye Dönük 24 Saatlik Aralık</th><th>24h MKT</th><th>Durum</th></tr></thead>
                        <tbody>
                            ${problem.map(w => rowHtml(w, true)).join('')}
                            ${ok.length > 0 ? `
                            <tr>
                                <td colspan="4" style="padding:0;border:none">
                                    <details class="compliance-accordion">
                                        <summary class="accordion-trigger">
                                            <span>✓ Sorunsuz kontroller (${ok.length})</span>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                                        </summary>
                                        <table class="data-table" style="margin-top:0;border-radius:0;background:rgba(0,0,0,0.05)">
                                            <tbody>${ok.map(w => rowHtml(w, false)).join('')}</tbody>
                                        </table>
                                    </details>
                                </td>
                            </tr>` : ''}
                        </tbody>
                    </table>
                </div>`;
        }

        return `
        <div class="card retrospective-mkt-details" style="margin-top:20px">
            <div class="card-header">
                <h3 class="card-title">MKT Kontrol (Geriye Dönük)</h3>
                <div class="chip ${badgeClass}">${badgeText}</div>
            </div>
            ${body}
            <div style="margin-top:14px;font-size:0.8rem;color:var(--text-secondary);padding:12px;background:rgba(255,255,255,0.3);border-radius:8px">
                <strong>Yöntem:</strong> Sıcaklık ${lower}-${upper}°C aralığının dışına <strong>her çıktığında (istisnasız)</strong>, sapmanın düzeldiği andan geriye doğru 24 saatlik MKT hesaplanır. Bu pencerenin MKT'si ${lower}-${upper}°C dışında ise ilgili aralık hatalı olarak bildirilir.
            </div>
        </div>`;
    },

    render() {
        const page = document.getElementById('page-analysis');
        const a = AppState.currentAnalysis;

        if (!a) {
            this.showDemoScenario('accept');
            return;
        }

        const d = a.decision;
        const decIcons = {
            accept: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            reject: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            revize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
            conditional: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        };
        const decLabels = { accept: 'KABUL', reject: 'RED', revize: 'REVİZE', conditional: 'ŞARTLI KABUL' };
        const mktClass = a.mkt.mkt <= a.config.upperLimit ? 'safe' : a.mkt.mkt <= a.config.upperLimit + 2 ? 'warning' : 'danger';

        page.innerHTML = `
        ${a.isDemo ? `
        <div style="text-align:center; padding-top:16px; margin-bottom:24px;">
            <h2 style="font-size:1.6rem; margin-bottom:8px; color:var(--text-primary)">Gerçek Görünümlü Eğitim Modu</h2>
            <p style="color:var(--text-secondary); max-width:650px; margin:0 auto; line-height:1.5; font-size:0.95rem;">Sistemimizin iade kararlarını nasıl verdiğini aşağıdaki örnek senaryolarla test edebilir, <strong>asıl analiz ve rapor ekranında</strong> nasıl görüneceğini birebir deneyimleyebilirsiniz.</p>
            
            <div style="display:flex; justify-content:center; gap:16px; margin-top:20px;">
                <button class="btn" style="background:${a.demoType === 'accept' ? 'var(--color-success-600)' : 'var(--surface-3)'}; color:${a.demoType === 'accept' ? '#fff' : 'var(--text-secondary)'}; border:none; padding:10px 20px; transition:all 0.2s;" onclick="AnalysisPage.showDemoScenario('accept')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    KABUL Örneği İncele
                </button>
                <button class="btn" style="background:${a.demoType === 'revize' ? '#f59e0b' : 'var(--surface-3)'}; color:${a.demoType === 'revize' ? '#fff' : 'var(--text-secondary)'}; border:none; padding:10px 20px; transition:all 0.2s;" onclick="AnalysisPage.showDemoScenario('revize')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    REVİZE Örneği İncele
                </button>
                <button class="btn" style="background:${a.demoType === 'reject' ? 'var(--color-danger-600)' : 'var(--surface-3)'}; color:${a.demoType === 'reject' ? '#fff' : 'var(--text-secondary)'}; border:none; padding:10px 20px; transition:all 0.2s;" onclick="AnalysisPage.showDemoScenario('reject')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    RED Örneği İncele
                </button>
            </div>
        </div>` : ''}
        <div class="analysis-header">
            <h2>Analiz Sonuçları</h2>
            <div style="display:flex;gap:12px">
                <button class="btn btn-secondary" onclick="App.navigate('upload')">Yeni Analiz</button>
                <button class="btn btn-secondary" onclick="AnalysisPage.exportToExcel()">📊 Excel'e Aktar</button>
                <button class="btn btn-primary" onclick="App.navigate('report')">Rapor Görüntüle</button>
            </div>
        </div>

        <div class="workflow-steps">
            <div class="workflow-step completed"><span class="step-number">✓</span><span class="step-label">Veri Yükleme</span></div>
            <div class="step-connector completed"></div>
            <div class="workflow-step completed"><span class="step-number">✓</span><span class="step-label">Veri Çıkarma</span></div>
            <div class="step-connector completed"></div>
            <div class="workflow-step completed"><span class="step-number">✓</span><span class="step-label">MKT Hesaplama</span></div>
            <div class="step-connector completed"></div>
            <div class="workflow-step completed"><span class="step-number">✓</span><span class="step-label">Karar</span></div>
        </div>

        <div class="analysis-grid">
            <div class="card mkt-result">
                <h3 class="card-title" style="margin-bottom:16px">Ortalama Kinetik Sıcaklık</h3>
                <div class="mkt-value ${mktClass}">${a.mkt.mkt}</div>
                <div class="mkt-unit">°C (MKT)</div>
                <div class="mkt-label">İstatistikler</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px;font-size:0.8rem">
                    <div><div style="color:var(--text-tertiary)">Min</div><div style="font-weight:600">${a.mkt.min}°C</div></div>
                    <div><div style="color:var(--text-tertiary)">Ort</div><div style="font-weight:600">${a.mkt.mean}°C</div></div>
                    <div><div style="color:var(--text-tertiary)">Max</div><div style="font-weight:600">${a.mkt.max}°C</div></div>
                </div>
                <div class="mkt-formula">T<sub>mk</sub> = ΔH/R ÷ (-ln(Σe<sup>-ΔH/RTi</sup>/n))</div>
            </div>

            <!-- TOR Card Şimdilik Gizlendi
            <div class="card tor-result">
                ... 
            </div>
            -->

            <div class="card decision-card ${d.decision}">
                <h3 class="card-title" style="margin-bottom:16px">AI Karar Önerisi</h3>
                <div class="decision-icon ${d.decision}">${decIcons[d.decision]}</div>
                <div class="decision-text ${d.decision}">${decLabels[d.decision]}</div>
                <div class="decision-reason">${d.summary}</div>
                <div style="margin-top:16px;text-align:left;font-size:0.8rem">
                    <div style="color:var(--text-tertiary);margin-bottom:8px;font-weight:600">Değerlendirme Kriterleri:</div>
                    ${d.reasons.map(r => `<div style="color:var(--text-secondary);margin-bottom:4px;padding-left:12px;border-left:2px solid var(--surface-border)">• ${r}</div>`).join('')}
                </div>
            </div>
        </div>

        <div class="card summary-table-section" style="margin-top:20px">
            <div class="card-header">
                <h3 class="card-title">Özet Karar Tablosu</h3>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>PARAMETRE</th>
                            <th>DEĞER</th>
                            <th>LİMİT</th>
                            <th>DURUM</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>MKT</td>
                            <td>${a.mkt.mkt}°C</td>
                            <td>2-8°C</td>
                            <td>${Components.decisionBadge(a.mkt.mkt >= 2 && a.mkt.mkt <= 8 ? 'accept' : 'reject', a.mkt.mkt >= 2 && a.mkt.mkt <= 8 ? 'MKT değeri ideal sınırlar içinde.' : 'Red Nedeni: Ortalama Kinetik Sıcaklık (MKT) değeri ilacın farmasötik yapısını bozacak seviyeye ulaştı.')}</td>
                        </tr>
                        <tr>
                            <td>Minimum</td>
                            <td>${a.mkt.min}°C</td>
                            <td>≥2°C (0°C Kritik)</td>
                            <td>${Components.decisionBadge(a.mkt.min < 0 ? 'reject' : a.mkt.min < 2 ? 'conditional' : 'accept', a.mkt.min < 0 ? 'Red Nedeni: Dondurucu hava ihlali! İlaç donduğu için etken maddesi kristalleşmiş olabilir.' : '')}</td>
                        </tr>
                        <tr>
                            <td>Maksimum</td>
                            <td>${a.mkt.max}°C</td>
                            <td>≤8°C (15°C Kritik)</td>
                            <td>${Components.decisionBadge(a.mkt.max > 15 ? 'reject' : a.mkt.max > 8 ? 'conditional' : 'accept', a.mkt.max > 15 ? 'Red Nedeni: Ciddi sıcaklık aşımı tespit edildi. Dolap veya depo ortamında uzun süre sıcağa maruz kalınmış.' : '')}</td>
                        </tr>
                        <tr>
                            <td>Ortalama</td>
                            <td>${a.mkt.mean}°C</td>
                            <td>2-8°C</td>
                            <td>${Components.decisionBadge(a.mkt.mean >= 2 && a.mkt.mean <= 8 ? 'accept' : 'conditional')}</td>
                        </tr>
                        <!-- TOR Satırı Şimdilik Gizlendi
                        <tr>
                            <td>TOR</td>
                            ...
                        </tr>
                        -->
                        <tr>
                            <td>Sapma Sayısı</td>
                            <td>${a.excursions.excursionCount}</td>
                            <td>0</td>
                            <td>${Components.decisionBadge(a.compliance.status === 'fail' ? 'reject' : a.excursions.excursionCount === 0 ? 'accept' : 'conditional', a.compliance.status === 'fail' ? 'Red Nedeni: Bir veya birden fazla kural/sapma koşulu ihlal edildi.' : '')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="chart-with-gaps">
            <div class="card temp-chart-section">
                <div class="card-header">
                    <h3 class="card-title">Sıcaklık Grafiği</h3>
                    <div style="display:flex;gap:12px;align-items:center">
                        <!-- Interval Toggles -->
                        <div class="interval-toggles" style="display:flex;background:var(--surface-2);padding:4px;border-radius:8px;gap:4px">
                            ${this.intervalOptions.map(opt => `
                                <button class="btn btn-sm ${this.currentInterval === opt.key ? 'btn-primary' : ''}"
                                    style="padding:4px 10px;font-size:0.7rem;min-width:45px;border:none"
                                    onclick="AnalysisPage.changeInterval('${opt.key}')">
                                    ${opt.label}
                                </button>
                            `).join('')}
                        </div>

                        <button class="btn btn-secondary btn-sm" onclick="AnalysisPage.chartInstance.resetZoom()" title="Görünümü Sıfırla (Esc)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            Sıfırla
                        </button>
                        <div class="chip" style="font-size:0.75rem">${a.dataPoints} Veri</div>
                    </div>
                </div>
                <div class="temp-chart-container" style="position:relative;height:350px"><canvas id="analysis-temp-chart"></canvas></div>
                <div style="text-align:center;font-size:0.75rem;color:var(--text-muted);margin-top:12px;display:flex;justify-content:center;gap:20px;padding:8px;background:var(--surface-2);border-radius:12px">
                    <span>🖱️ <b>Büyüt/Küçült:</b> Mouse Tekerleği veya Mousepad Kaydırma</span>
                    <span>🖐️ <b>Kaydır:</b> Sol Tık ile Tut ve Sürükle</span>
                    <span>⌨️ <b>Gezin:</b> Ok Tuşları (Sıfırla: Esc)</span>
                </div>
                <div class="chart-legend">
                    <div class="legend-item"><div class="legend-line temp"></div>Sıcaklık</div>
                    <div class="legend-item"><div class="legend-line upper"></div>Üst Limit (${a.config.upperLimit}°C)</div>
                    <div class="legend-item"><div class="legend-line lower"></div>Alt Limit (${a.config.lowerLimit}°C)</div>
                </div>
            </div>
            ${this.renderGapPanel(this.analyzeGaps(AppState.parsedData))}
        </div>

        ${a.excursions.excursionCount > 0 ? `
        <div class="card excursion-details" style="padding:0; overflow:hidden">
            <details class="compliance-accordion">
                <summary class="accordion-trigger" style="background:none; padding:16px 20px">
                    <h3 class="card-title">Sapma Detayları (${a.excursions.excursionCount} sapma)</h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <div class="table-wrapper" style="border-top:1px solid var(--surface-border)">
                    <table class="data-table">
                        <thead><tr><th>#</th><th>Başlangıç</th><th>Bitiş</th><th style="cursor:pointer">Süre ↓</th><th>Tür</th><th>Pik Değer</th></tr></thead>
                        <tbody>${[...a.excursions.excursions].sort((a, b) => b.duration - a.duration).map((ex, i) => `
                        <tr class="deviation-highlight">
                            <td>${i + 1}</td>
                            <td>${Utils.formatDateTime(ex.start)}</td>
                            <td>${Utils.formatDateTime(ex.end)}</td>
                            <td style="font-weight:600">${Utils.formatDuration(ex.duration)}</td>
                            <td><span class="badge-status badge-${ex.type === 'high' ? 'reject' : 'conditional'}">${ex.type === 'high' ? 'Yüksek' : 'Düşük'}</span></td>
                            <td><span class="temp-value ${ex.type}">${ex.peakTemp}°C</span></td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </details>
        </div>` : ''}

        <div class="card compliance-details">
            <div class="card-header">
                <h3 class="card-title">Kabul Şartları Analizi</h3>
                <div class="chip ${a.compliance.status === 'pass' ? 'chip-success' : 'chip-danger'}">${a.compliance.summary}</div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Senaryo</th><th>Isının Düzeldiği Zaman</th><th>24 Saatlik MKT</th><th>Veri Kapsamı</th><th>Durum</th></tr></thead>
                    <tbody>
                        ${(() => {
                const allChecks = a.compliance.checks;
                const criticalExcursions = a.excursions.excursions.filter(ex => ex.peakTemp < 0 || ex.peakTemp > 15);

                if (allChecks.length === 0 && criticalExcursions.length === 0) {
                    return '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:20px">Özel MKT hesabı veya kritik sapma tespit edilmedi.</td></tr>';
                }

                const failed = allChecks.filter(c => !c.isMktOk);
                const passed = allChecks.filter(c => c.isMktOk);
                let html = '';

                // Kritik Sapmalar (Anlık Red sebebi)
                if (criticalExcursions.length > 0) {
                    html += criticalExcursions.map(c => `
                                <tr class="deviation-highlight">
                                    <td>
                                        <span class="badge-status badge-reject" style="background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.3)">
                                            Kritik Sapma (${c.peakTemp}°C)
                                        </span>
                                    </td>
                                    <td>${Utils.formatDateTime(c.end)}</td>
                                    <td style="font-weight:600;color:var(--color-danger-400)">MKT Aranmaz</td>
                                    <td style="font-size:0.8rem;color:var(--text-secondary)">
                                        Süre: ${Utils.formatDuration(c.duration)}
                                    </td>
                                    <td><span class="badge-status badge-reject" title="Anlık Kritik Limit İhlali! İlaç bu sıcaklıkta yapısal özelliğini kalıcı olarak yitirir.">ANLIK RED</span></td>
                                </tr>`).join('');
                }

                const renderRow = (c) => `
                                <tr class="${!c.isMktOk ? 'deviation-highlight' : ''}">
                                    <td>
                                        <span class="badge-status badge-${c.type === 'high' ? 'warning' : 'info'}">
                                            ${c.type === 'high' ? '15-25°C Arası' : '1-2°C Arası'} (${c.peakTemp}°C)
                                        </span>
                                    </td>
                                    <td>${Utils.formatDateTime(c.segmentEnd)}</td>
                                    <td style="font-weight:600">${c.mkt24h}°C</td>
                                    <td style="font-size:0.8rem;color:${c.windowCoverageMinutes < 1200 ? 'var(--color-danger-400)' : 'var(--text-secondary)'}">
                                        ${Utils.formatDuration(c.windowCoverageMinutes)}
                                        ${c.windowCoverageMinutes < 1200 ? ' ⚠️' : ''}
                                    </td>
                                    <td>${Components.decisionBadge(c.isMktOk ? 'accept' : 'reject', c.isMktOk ? 'MKT limitler dahilinde kalmayı başardı.' : 'Bu periyotta MKT yasal sınır olan 8°C üstünde kaldı. RED onayı verildi.')}</td>
                                </tr>`;

                // Diğer başarısız segmentleri göster
                html += failed.map(renderRow).join('');

                // Başarılı olanları açılır kapanır yap
                if (passed.length > 0) {
                    html += `
                                <tr>
                                    <td colspan="5" style="padding:0; border:none;">
                                        <details class="compliance-accordion">
                                            <summary class="accordion-trigger">
                                                <span>✓ Diğer Uygun Kontroller (${passed.length})</span>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                                            </summary>
                                            <table class="data-table" style="margin-top:0; border-radius:0; background:rgba(0,0,0,0.05)">
                                                <tbody>
                                                    ${passed.map(renderRow).join('')}
                                                </tbody>
                                            </table>
                                        </details>
                                    </td>
                                </tr>`;
                }
                return html;
            })()}
                    </tbody>
                </table>
            </div>
            <style>
                .compliance-accordion { border-top: 1px solid var(--surface-border); }
                .accordion-trigger { 
                    padding: 12px 16px; 
                    cursor: pointer; 
                    background: var(--surface-2); 
                    display: flex; 
                    align-items: center; 
                    justify-content: space-between;
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: var(--text-secondary);
                    transition: all 0.2s;
                    user-select: none;
                }
                .accordion-trigger:hover { background: var(--surface-hover); color: var(--text-primary); }
                .accordion-trigger list-style { display: none; }
                .compliance-accordion[open] .accordion-trigger { background: var(--surface-1); border-bottom: 1px solid var(--surface-border); }
                .compliance-accordion[open] svg { transform: rotate(180deg); }
                .compliance-accordion summary::-webkit-details-marker { display: none; }
            </style>
            <div style="margin-top:16px;font-size:0.8rem;color:var(--text-secondary);padding:12px;background:rgba(255,255,255,0.3);border-radius:8px">
                <strong>Not:</strong> 0°C altı veya 25°C üstü anlık red sebebidir. 1-2°C veya 15-25°C arası durumlarda düzelme zamanından geriye dönük 24 saatlik MKT 2-8°C aralığında olmalıdır. Diğer küçük sapmalar (örn. 8.1°C) gözardı edilir.
            </div>
        </div>

        ${this.renderRetrospectiveMKT(a)}

        <div class="analysis-actions">
            <button class="btn btn-primary btn-lg" onclick="AnalysisPage.saveToDB()" id="btn-save-db">💾 Sisteme Kaydet</button>
            <button class="btn btn-secondary btn-lg" onclick="App.navigate('report')">📄 Rapor Oluştur</button>
            <button class="btn btn-secondary btn-lg" onclick="App.navigate('audit')">🛡️ Denetim İzi</button>
        </div>`;

        this.initAnalysisChart(AppState.parsedData, a.config);
    },

    async exportToExcel() {
        if (!AppState.parsedData || !AppState.currentAnalysis) {
            Utils.showToast('Aktarılacak veri bulunamadı.', 'error');
            return;
        }

        try {
            const data = AppState.parsedData;
            const analysis = AppState.currentAnalysis;
            
            // 1. Özet Sayfası (Analysis Overview)
            const summaryRows = [
                ['COLDCHAIN AI - ANALİZ ÖZETİ'],
                [''],
                ['Eczane/Kurum', analysis.pharmacy || 'N/A'],
                ['Dönem', `${Utils.formatDateTime(data[0].timestamp)} - ${Utils.formatDateTime(data[data.length-1].timestamp)}`],
                ['Sıcaklık Limiti', `${analysis.config.lowerLimit} - ${analysis.config.upperLimit} °C`],
                [''],
                ['İSTATİSTİKLER'],
                ['Ortalama Kinetik Sıcaklık (MKT)', analysis.mkt.mkt + ' °C'],
                ['Minimum Sıcaklık', analysis.mkt.min + ' °C'],
                ['Maksimum Sıcaklık', analysis.mkt.max + ' °C'],
                ['Ortalama Sıcaklık', analysis.mkt.mean + ' °C'],
                [''],
                ['KARAR', (analysis.decision?.decision || '').toUpperCase()],
                ['Özet', analysis.decision?.summary || 'Analiz tamamlandı.']
            ];

            const wb = XLSX.utils.book_new();
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
            XLSX.utils.book_append_sheet(wb, wsSummary, "Analiz Özeti");

            // 2. Ölçüm Verileri Sayfası
            const measurementRows = data.map(d => ({
                'Tarih': Utils.formatDate(d.timestamp),
                'Saat': Utils.formatTime(d.timestamp),
                'Sıcaklık (°C)': d.temperature,
                'Durum': (d.temperature > analysis.config.upperLimit) ? 'YÜKSEK' : (d.temperature < analysis.config.lowerLimit) ? 'DÜŞÜK' : 'NORMAL'
            }));

            const wsMeasurements = XLSX.utils.json_to_sheet(measurementRows);
            XLSX.utils.book_append_sheet(wb, wsMeasurements, "Ölçüm Verileri");

            // Dosyayı İndir
            const fileName = `Analiz_${analysis.batchNumber || 'Rapor'}_${new Date().getTime()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            Utils.showToast('✅ Excel dosyası başarıyla oluşturuldu ve indirildi.', 'success');
        } catch (err) {
            console.error('Excel Export Hatası:', err);
            Utils.showToast('Excel dışa aktarma sırasında bir hata oluştu.', 'error');
        }
    },

    async saveToDB() {
        if (!AppState.currentAnalysis) return;

        const btn = document.getElementById('btn-save-db');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Kaydediliyor...';
        }

        try {
            const result = await fetch('http://localhost:3000/api/save-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(AppState.currentAnalysis)
            });
            const data = await result.json();

            if (data.success) {
                Utils.showToast('✅ Analiz başarıyla sisteme (SQLite) kaydedildi.', 'success');
                if (btn) {
                    btn.innerHTML = '✅ Kaydedildi';
                    btn.classList.replace('btn-primary', 'btn-success');
                }
            } else {
                throw new Error(data.error || 'Bilinmeyen hata');
            }
        } catch (err) {
            Utils.showToast('Kayıt başarısız: ' + err.message, 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '💾 Tekrar Dene';
            }
        }
    },

    showDemoScenario(type) {
        const isAccept = type === 'accept';
        const isRevize = type === 'revize';

        // Demo Verisi Oluştur (Karar motorunu çalıştırmak için tamamen sentetik mantıklı veriler)
        const demoData = [];
        let now = new Date().getTime() - (72 * 3600000); // 3 gün öncesinden başla

        for (let i = 0; i < 72; i++) {
            // Revize senaryosunda 40. ve 41. saatleri atlayarak 3 saatlik (180dk) bir boşluk yaratıyoruz
            if (isRevize && (i === 40 || i === 41)) {
                continue;
            }

            let currentTemp;
            if (isRevize) {
                // Revize örneği için sıcaklıklar hep ideal (4-6 arası) olsun ki kafa karışmasın
                currentTemp = 4.5 + (Math.random() * 1.5);
            } else if (isAccept) {
                currentTemp = 4 + (Math.random() * 3); // 4-7 arası güvenli
                if (i === 30) currentTemp = 9.1; // Ufak bir geçici pik
                if (i === 31) currentTemp = 8.5;
            } else {
                if (i < 20) {
                    currentTemp = 4 + (Math.random() * 3);
                } else if (i >= 20 && i < 40) {
                    currentTemp = 16 + (Math.random() * 6); // 16-22 arası net RED ihlali
                } else {
                    currentTemp = 10 + (Math.random() * 4); // 10-14 arası seyir
                }
            }
            demoData.push({
                timestamp: new Date(now + (i * 3600000)),
                temperature: parseFloat(currentTemp.toFixed(2))
            });
        }

        AppState.parsedData = demoData;
        const config = { lowerLimit: 2, upperLimit: 8, torLimit: 120 };

        // Revize (Şüpheli) durum simülasyonu - MKTEngine'e geçilecek validation objesi
        let rawValidation = null;
        if (isRevize) {
            rawValidation = {
                mostCommonGapMin: 180, // Bu değer decision engine'e gider
                status: 'warning',
                warnings: ['Cihaz sensörü ölçüm yapmayı durdurmuş. Loglar arası süre çok geniş (180 dakika).'],
                gaps: [{ minutes: 180 }],
                outliers: 0
            };
        }

        const analysis = MKTEngine.fullAnalysis(demoData, config, rawValidation);
        const decision = DecisionEngine.evaluate(analysis);

        // Demoyu sanki gerçek bir upload'muş gibi AppState'e yükle
        AppState.currentAnalysis = {
            ...analysis,
            decision: decision,
            isDemo: true,
            demoType: type,
            drugName: isAccept ? 'Demo İlaç (Kabul)' : isRevize ? 'Demo İlaç (Riskli Boşluk)' : 'Demo İlaç (Red)',
            batchNumber: isAccept ? 'KABUL-DEMO-001' : isRevize ? 'RVZ-DEMO-555' : 'RED-DEMO-999',
            pharmacy: 'Eğitim Eczanesi',
            purchaseDate: '',
            returnDate: '',
            returnReason: isAccept ? 'Genel Tolerans Örneği' : isRevize ? '3 Saat Veri Kaybı (Kritik)' : 'Uzun Süreli İhlal Örneği',
            barcode: '0000000000000',
            quantity: '1',
            expirationDate: '2030-12-31',
            totalAmount: '0',
            files: ['Egitim_Verisi_Raporu.pdf'],
            date: new Date()
        };

        // Sayfayı tekrar render et (Üstte butonlar artık çıkacak)
        this.render();
    },

    initAnalysisChart(rawData, config) {
        const ctx = document.getElementById('analysis-temp-chart');
        if (!ctx || !rawData?.length) return;
        if (this.chartInstance) this.chartInstance.destroy();

        // Veriyi seçilen aralığa göre seyrelt
        const data = this.resampleData(rawData, this.currentInterval);

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.timestamp),
                datasets: [
                    {
                        label: 'Sıcaklık', data: data.map(d => d.temperature),
                        borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.08)', fill: true,
                        tension: 0.2, pointRadius: 0, pointHoverRadius: 6, borderWidth: 2,
                        segment: { borderColor: ctx2 => { const v = ctx2.p0.parsed.y; return v > config.upperLimit || v < config.lowerLimit ? '#f43f5e' : '#06b6d4'; } }
                    },
                    {
                        label: `Üst Limit(${config.upperLimit}°C)`, data: data.map(() => config.upperLimit),
                        borderColor: 'rgba(244,63,94,0.5)', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false
                    },
                    {
                        label: `Alt Limit(${config.lowerLimit}°C)`, data: data.map(() => config.lowerLimit),
                        borderColor: 'rgba(6,182,212,0.3)', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,22,41,0.95)', titleColor: '#f1f5f9', bodyColor: '#94a3b8',
                        borderColor: 'rgba(148,163,184,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8,
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                return new Intl.DateTimeFormat('tr-TR', {
                                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                }).format(new Date(items[0].parsed.x));
                            }
                        }
                    },
                    zoom: {
                        limits: {
                            x: { min: 'original', max: 'original' },
                            y: { min: -10, max: 25 }
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                            threshold: 5
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.05
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x'
                        }
                    },
                    annotation: {
                        annotations: {
                            dangerZoneTop: {
                                type: 'box', yMin: config.upperLimit, yMax: 25,
                                backgroundColor: 'rgba(244,63,94,0.05)', borderWidth: 0
                            },
                            dangerZoneBottom: {
                                type: 'box', yMin: -10, yMax: config.lowerLimit,
                                backgroundColor: 'rgba(6,182,212,0.05)', borderWidth: 0
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        grid: { color: 'rgba(148,163,184,0.05)' },
                        ticks: {
                            color: '#64748b',
                            font: { size: 11 },
                            callback: function (value) {
                                return new Intl.DateTimeFormat('tr-TR', {
                                    month: 'short', day: 'numeric', hour: '2-digit'
                                }).format(new Date(value));
                            }
                        }
                    },
                    y: {
                        position: 'right',
                        min: -10, max: 25,
                        grid: { color: 'rgba(148,163,184,0.05)' },
                        ticks: { color: '#64748b', font: { size: 11 }, callback: v => v + '°C' }
                    }
                }
            },
            plugins: [{
                id: 'crosshair',
                afterInit: (chart) => { chart.crosshair = { x: 0, y: 0, draw: false }; },
                afterEvent: (chart, args) => {
                    const { event } = args;
                    if (event.type === 'mousemove') {
                        chart.crosshair.x = event.x;
                        chart.crosshair.y = event.y;
                        chart.crosshair.draw = true;
                    } else if (event.type === 'mouseout') {
                        chart.crosshair.draw = false;
                    }
                    chart.draw();
                },
                afterDraw: (chart) => {
                    if (!chart.crosshair || !chart.crosshair.draw) return;
                    const { ctx, chartArea: { top, bottom, left, right }, scales: { x, y } } = chart;
                    const { x: mouseX, y: mouseY } = chart.crosshair;

                    if (mouseX < left || mouseX > right || mouseY < top || mouseY > bottom) return;

                    ctx.save();
                    ctx.setLineDash([5, 5]);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';

                    // Vertical line
                    ctx.beginPath(); ctx.moveTo(mouseX, top); ctx.lineTo(mouseX, bottom); ctx.stroke();
                    // Horizontal line
                    ctx.beginPath(); ctx.moveTo(left, mouseY); ctx.lineTo(right, mouseY); ctx.stroke();

                    // Label Backgrounds
                    ctx.setLineDash([]);
                    ctx.font = '11px Inter';

                    // X Axis Label (Bottom)
                    const date = new Date(x.getValueForPixel(mouseX));
                    const dateStr = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(date);
                    const xTextWidth = ctx.measureText(dateStr).width;
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(mouseX - (xTextWidth + 12) / 2, bottom, xTextWidth + 12, 20);
                    ctx.fillStyle = '#cbd5e1';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(dateStr, mouseX, bottom + 10);

                    // Y Axis Label (Right)
                    const temp = y.getValueForPixel(mouseY).toFixed(1) + '°C';
                    const yTextWidth = ctx.measureText(temp).width;
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(right, mouseY - 10, yTextWidth + 12, 20);
                    ctx.fillStyle = '#cbd5e1';
                    ctx.textAlign = 'left';
                    ctx.fillText(temp, right + 6, mouseY);

                    ctx.restore();
                }
            }]
        });

        // Klavye kontrolünü bağla (önceki binding varsa temizle)
        if (this._keyBound) window.removeEventListener('keydown', this._keyBound);
        this._keyBound = this.handleKeyDown.bind(this);
        window.addEventListener('keydown', this._keyBound);
    }
};
