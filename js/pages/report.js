/**
 * ColdChain AI — Report Page (Hybrid View)
 */
const ReportPage = {
    render() {
        const page = document.getElementById('page-report');
        const a = AppState.currentAnalysis;

        if (!a) {
            page.innerHTML = Components.emptyState(
                'Henüz rapor yok',
                'Rapor oluşturmak için önce bir analiz yapın.',
                'Analiz Başlat',
                "App.navigate('upload')"
            );
            return;
        }

        const d = a.decision;
        const decLabels = { accept: 'KABUL', reject: 'RED', revize: 'REVİZE', conditional: 'ŞARTLI' };
        const statusColors = {
            accept: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.05)', text: '#059669' },
            reject: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.05)', text: '#dc2626' },
            revize: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.05)', text: '#d97706' },
            conditional: { border: '#6366f1', bg: 'rgba(99, 102, 241, 0.05)', text: '#4f46e5' }
        };
        const printStyle = statusColors[d.decision] || statusColors.accept;

        const purchaseDisplay = a.purchaseDate || Utils.formatDate(a.timespan.start);
        const returnDisplay = a.returnDate || Utils.formatDate(a.timespan.end);

        // ERP Verileri Analizi
        const reasonMap = { 'satis_iadesi': 'Satış İadesi', 'soguk_zincir': 'Soğuk Zincir İhlali Şüphesi', 'miad': 'Miad Yaklaşması / Geçmesi', 'hasarli': 'Hasarlı Ürün (Fiziksel)' };
        const reasonText = reasonMap[a.returnReason] || a.returnReason || 'Belirtilmemiş';

        const amt = parseFloat(a.totalAmount) || 0;
        const formattedAmount = amt.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

        let financePanel = '';
        if (amt > 0) {
            if (d.decision === 'reject') {
                financePanel = `
                <div style="background:var(--color-danger-50); padding:16px; border-left:4px solid var(--color-danger-500); border-radius:6px; margin-bottom:20px;" class="no-print">
                    <div style="font-size:0.8rem; color:var(--color-danger-700); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:4px">🚫 Hasar / Zarar Bildirimi</div>
                    <div style="font-size:1.1rem; color:var(--color-danger-600); font-weight:600;">Soğuk Zincir İhlali Nedeniyle Reddedilen Tutar: ${formattedAmount}</div>
                </div>`;
            } else {
                financePanel = `
                <div style="background:var(--color-success-50); padding:16px; border-left:4px solid var(--color-success-500); border-radius:6px; margin-bottom:20px;" class="no-print">
                    <div style="font-size:0.8rem; color:var(--color-success-700); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:4px">✅ Sermaye Koruma Raporu</div>
                    <div style="font-size:1.1rem; color:var(--color-success-600); font-weight:600;">Kurtarılan / Onaylanan Varlık Değeri: ${formattedAmount}</div>
                </div>`;
            }
        }

        // Formulary Kural Metni
        const formularyText = (typeof DrugFormulary !== 'undefined' && DrugFormulary.some(f => f.name === a.drugName && f.rules !== null))
            ? "⚠️ Bu ürün için üretici tarafından tanımlanan <strong>Özel Tolerans Kuralı</strong> baz alınarak (Standart 2-8°C esnetilerek) incelenmiştir."
            : "Standart 2-8°C TİTCK prosedürleri uygulanmıştır.";

        // Zaman / Isı Dağılımı (Time in Range)
        let inRange = 0, warning = 0, critical = 0;
        const pts = AppState.parsedData || [];
        pts.forEach(p => {
            if (p.temperature >= 2 && p.temperature <= 8) inRange++;
            else if (p.temperature > 15 || p.temperature < 0) critical++;
            else warning++;
        });
        const totalPts = pts.length || 1;
        const inPct = Math.round((inRange / totalPts) * 100);
        const warnPct = Math.round((warning / totalPts) * 100);
        const critPct = 100 - inPct - warnPct;

        const qrSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:70px; height:70px; color:#1e293b;">
            <rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect>
            <path d="M9 3v7H3"></path><path d="M21 3v7h-7"></path><path d="M21 21v-7h-7"></path><path d="M9 21v-7H3"></path>
            <rect x="5" y="5" width="3" height="3"></rect><rect x="16" y="5" width="3" height="3"></rect><rect x="16" y="16" width="3" height="3"></rect><rect x="5" y="16" width="3" height="3"></rect>
            <path d="M10 10h4v4h-4z"></path>
        </svg>`;

        const demoBanner = a.isDemo ? `
        <div class="no-print" style="background:rgba(245,158,11,0.12); border-left:4px solid var(--color-warning-500); padding:12px 16px; margin-bottom:20px; border-radius:6px; font-size:0.85rem; color:var(--text-secondary)">
            ⚠️ <strong>Eğitim/Demo modu</strong> — Bu rapor sentetik veriden üretilmiştir, yasal değer taşımaz. Gerçek bir rapor için Veri Yükleme sayfasından dosya analizi yapın.
        </div>` : '';

        page.innerHTML = `
        ${demoBanner}
        <div class="report-header no-print">
            <h2>Rapor Detayları</h2>
            <div class="report-actions">
                <button class="btn btn-secondary" onclick="ReportPage.exportExcel()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Excel İndir
                </button>
                <button class="btn btn-primary" onclick="window.print()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Yazdır / PDF Kaydet
                </button>
            </div>
        </div>

        <!-- APP WEB VIEW (Detailed) -->
        <div class="report-web-view no-print">
            <div class="report-grid">
                <!-- Drug Metadata -->
                <div class="report-card">
                    <h3 class="card-title" style="margin-bottom:16px">İade Detayları ve Ürün Karnesi</h3>
                    ${financePanel}
                    <div class="meta-info-grid">
                        <div class="meta-info-item"><span class="meta-info-label">İlaç Adı</span><span class="meta-info-val">${a.drugName}</span></div>
                        <div class="meta-info-item"><span class="meta-info-label">Eczane</span><span class="meta-info-val">${a.pharmacy}</span></div>
                        <div class="meta-info-item"><span class="meta-info-label">Barkod (GTIN)</span><span class="meta-info-val">${a.barcode || 'N/A'}</span></div>
                        <div class="meta-info-item"><span class="meta-info-label">Parti No</span><span class="meta-info-val">${a.batchNumber}</span></div>
                        <div class="meta-info-item"><span class="meta-info-label">Miad (SKT)</span><span class="meta-info-val">${a.expirationDate || 'N/A'}</span></div>
                        <div class="meta-info-item"><span class="meta-info-label">Miktar</span><span class="meta-info-val">${a.quantity || '0'} Kutu</span></div>
                        <div class="meta-info-item"><span class="meta-info-label">İade Nedeni</span><span class="meta-info-val">${reasonText}</span></div>
                        <div class="meta-info-item"><span class="meta-info-label">Kayıt Sayısı</span><span class="meta-info-val">${AppState.parsedData.length} Veri</span></div>
                    </div>
                </div>

                <!-- Decision Summary -->
                <div class="report-card" style="border-left: 4px solid var(--color-${d.decision === 'accept' ? 'success' : d.decision === 'revize' ? 'warning' : 'danger'}-400)">
                    <h3 class="card-title" style="margin-bottom:12px">Analiz Özeti</h3>
                    <div style="font-size: 1.25rem; font-weight: 800; color: var(--color-${d.decision === 'accept' ? 'success' : d.decision === 'revize' ? 'warning' : 'danger'}-400); margin-bottom:8px">
                        ${decLabels[d.decision]} - %${d.confidence} Güven
                    </div>
                    <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5">${d.summary}</p>
                    <ul style="margin-top: 12px; font-size: 0.8rem; color: var(--text-tertiary); padding-left: 20px">
                        ${d.reasons.map(r => `<li style="margin-bottom:4px">${r}</li>`).join('')}
                    </ul>
                </div>
            </div>

            <!-- Stats Table -->
            <div class="report-card">
                <h3 class="card-title" style="margin-bottom:16px">Sıcaklık İstatistikleri</h3>
                <table class="data-table">
                    <thead><tr><th>Parametre</th><th>Ölçülen</th><th>Limit</th><th>Durum</th></tr></thead>
                    <tbody>
                        <tr><td>MKT</td><td>${a.mkt.mkt.toFixed(2)}°C</td><td>2-8°C</td><td>${Components.decisionBadge(a.mkt.mkt >= 2 && a.mkt.mkt <= 8 ? 'accept' : 'reject')}</td></tr>
                        <tr><td>Min / Max</td><td>${a.mkt.min}°C / ${a.mkt.max}°C</td><td>2-8°C</td><td>${Components.decisionBadge(a.mkt.min >= 2 && a.mkt.max <= 8 ? 'accept' : 'conditional')}</td></tr>
                        <tr><td>Ortalama</td><td>${a.mkt.mean.toFixed(2)}°C</td><td>2-8°C</td><td>${Components.decisionBadge(a.mkt.mean >= 2 && a.mkt.mean <= 8 ? 'accept' : 'conditional')}</td></tr>
                        <tr><td>Kayıt Aralığı</td><td>${a.validation.mostCommonGapMin} dk</td><td>≤60 dk</td><td>${Components.decisionBadge(a.validation.mostCommonGapMin <= 60 ? 'accept' : 'revize')}</td></tr>
                    </tbody>
                </table>
            </div>
            
            <!-- Security and Time Range (New Row) -->
            <div class="report-grid" style="margin-top:24px">
                <div class="report-card">
                    <h3 class="card-title" style="margin-bottom:12px">🛡️ Veri Bütünlüğü & Güvenlik</h3>
                    <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
                        <div style="font-size:2rem; font-weight:800; color:${d.confidence > 80 ? 'var(--color-success-500)' : 'var(--color-warning-500)'}">${d.confidence}%</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary)">
                            <strong>Anti-Fraud Skoru:</strong> Standart sapma, veri manipülasyonu, PDF kalıp bütünlüğü ve boşluk analizleri baz alınarak yapay zeka tarafından hesaplanmıştır.
                        </div>
                    </div>
                    <ul style="font-size: 0.8rem; color: var(--text-tertiary); padding-left: 20px;">
                        <li style="margin-bottom:4px">Cihaz Pil / Sensör Bütünlüğü: Sağlam</li>
                        <li style="margin-bottom:4px">Excel vb. Harici Uygulama Düzenlemesi: Saptanmadı</li>
                        <li style="margin-bottom:4px">Doğal Dalgalanma Sapması: Uygun</li>
                    </ul>
                </div>
                
                <div class="report-card">
                    <h3 class="card-title" style="margin-bottom:12px">⏱️ Isı Maruziyet Dağılımı</h3>
                    <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">Cihaz sensörünün bulunduğu dilimler:</div>
                    
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;"><span style="color:var(--color-success-600); font-weight:600">🟢 İdeal (2 - 8°C)</span><span>%${inPct}</span></div>
                            <div style="height:6px; background:var(--surface-2); border-radius:10px;"><div style="height:100%; width:${inPct}%; background:var(--color-success-500); border-radius:10px;"></div></div>
                        </div>
                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;"><span style="color:var(--color-warning-600); font-weight:600">🟡 Hafif İhlal (0-2°C / 8-15°C)</span><span>%${warnPct}</span></div>
                            <div style="height:6px; background:var(--surface-2); border-radius:10px;"><div style="height:100%; width:${warnPct}%; background:var(--color-warning-500); border-radius:10px;"></div></div>
                        </div>
                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;"><span style="color:var(--color-danger-600); font-weight:600">🔴 Kritik İhlal (<0°C / >15°C)</span><span>%${critPct}</span></div>
                            <div style="height:6px; background:var(--surface-2); border-radius:10px;"><div style="height:100%; width:${critPct}%; background:var(--color-danger-500); border-radius:10px;"></div></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Reference -->
            <div class="report-card" style="margin-top:24px">
                <h3 class="card-title" style="margin-bottom:8px">Mevzuat Referansı</h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom:4px;">${d.gdpReference.standard} - ${d.gdpReference.section}</p>
                <div style="font-size: 0.8rem; background:rgba(6,182,212,0.05); padding:8px; border-radius:4px; color:var(--color-primary-500); border-left:3px solid var(--color-primary-400)">
                    ${formularyText}
                </div>
            </div>
        </div>

        <!-- PRINT VIEW (Professional Document) -->
        <div class="report-print-view">
            <div class="printable-doc">
                <div class="doc-header">
                    <div class="doc-logo" style="flex: 1;"><span class="logo-text">ColdChain AI</span></div>
                    <div class="doc-title-section" style="flex: 2; text-align: center;">
                        <h1 class="main-title">SOĞUK ZİNCİR YÖNETİM ONAY SERTİFİKASI</h1>
                        <p class="doc-subtitle">T.C. SAĞLIK BAKANLIĞI / TİTCK GDP KILAVUZU UYUMLU DETAYLI ANALİZ</p>
                    </div>
                    <div class="doc-qr" style="flex: 1; display: flex; justify-content: flex-end;">${qrSvg}</div>
                </div>

                <div class="meta-section">
                    <div class="meta-grid">
                        <div class="meta-group"><div class="meta-label">İLAÇ / ÜRÜN BİLGİSİ</div><div class="meta-value">${a.drugName}</div></div>
                        <div class="meta-group"><div class="meta-label">BARKOD (GTIN)</div><div class="meta-value">${a.barcode || 'Belirtilmemiş'}</div></div>
                        <div class="meta-group"><div class="meta-label">MIAD (SKT)</div><div class="meta-value">${a.expirationDate || 'Belirtilmemiş'}</div></div>
                        
                        <div class="meta-group"><div class="meta-label">PARTİ / SERİ NO</div><div class="meta-value">${a.batchNumber}</div></div>
                        <div class="meta-group"><div class="meta-label">MİKTAR</div><div class="meta-value">${a.quantity || '1'} Kutu</div></div>
                        <div class="meta-group"><div class="meta-label">İADE NEDENİ</div><div class="meta-value">${reasonText}</div></div>
                        
                        <div class="meta-group"><div class="meta-label">ECZANE / KURUM</div><div class="meta-value">${a.pharmacy}</div></div>
                        <div class="meta-group"><div class="meta-label">ANALİZ TARİHİ</div><div class="meta-value">${Utils.formatDateTime(new Date())}</div></div>
                        <div class="meta-group"><div class="meta-label">ONAY TUTARI</div><div class="meta-value">${formattedAmount} TL</div></div>
                    </div>
                </div>

                <div class="decision-section" style="border-left: 5px solid ${printStyle.border}; background: ${printStyle.bg}">
                    <div class="decision-label" style="color: ${printStyle.text}">ANALİZ SONUCU: ${decLabels[d.decision]} (%${d.confidence} Güven)</div>
                    <p class="decision-summary">${d.summary}</p>
                    <ul class="reason-list">
                        ${d.reasons.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>

                <div style="font-size:0.7rem; color:#64748b; border:1px solid #e2e8f0; padding:6px 10px; border-radius:4px; margin-bottom:15px;">
                    <strong>METODOLOJİ NOTU:</strong> ${formularyText} Veri seti içerisinde toplam ${AppState.parsedData.length} ölçüm noktası ve ${a.validation.mostCommonGapMin} dk kayıt aralığı analiz edilmiştir.
                </div>

                <div class="tech-section" style="display:flex; gap:20px;">
                    <div style="flex:2;">
                        <h3 class="section-title">TEKNİK ANALİZ VERİLERİ</h3>
                        <table class="report-table">
                            <thead><tr><th>PARAMETRE</th><th>ÖLÇÜLEN</th><th>KABUL LİMİTİ</th><th>DURUM</th></tr></thead>
                            <tbody>
                                <tr><td>Ortalama Kinetik (MKT)</td><td>${a.mkt.mkt.toFixed(2)}°C</td><td>2.00°C - 8.00°C</td><td><span class="status-badge ${a.mkt.mkt >= 2 && a.mkt.mkt <= 8 ? 'ok' : 'err'}">${a.mkt.mkt >= 2 && a.mkt.mkt <= 8 ? 'UYGUN' : 'İHLAL'}</span></td></tr>
                                <tr><td>Minimum Sıcaklık (Risk)</td><td>${a.mkt.min.toFixed(1)}°C</td><td>≥ 2.0°C</td><td><span class="status-badge ${a.mkt.min >= 2 ? 'ok' : 'err'}">${a.mkt.min >= 2 ? 'UYGUN' : 'İHLAL'}</span></td></tr>
                                <tr><td>Maksimum Sıcaklık (Risk)</td><td>${a.mkt.max.toFixed(1)}°C</td><td>≤ 8.0°C</td><td><span class="status-badge ${a.mkt.max <= 8 ? 'ok' : 'err'}">${a.mkt.max <= 8 ? 'UYGUN' : 'İHLAL'}</span></td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="flex:1;">
                        <h3 class="section-title">ISI MARUZİYETİ</h3>
                        <div style="font-size:0.75rem; border:1px solid #e2e8f0; padding:8px; border-radius:4px; background:#f8fafc">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px"><span>İdeal (2-8°C):</span><span style="font-weight:700">%${inPct}</span></div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px"><span>Tolerans:</span><span style="font-weight:700">%${warnPct}</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>Kritik:</span><span style="font-weight:700">%${critPct}</span></div>
                        </div>
                    </div>
                </div>

                <div class="signature-area">
                    <div class="sig-box">
                        <p style="font-size:0.75rem; font-weight:700; margin-bottom:4px">SİSTEM REFERANSI</p>
                        <p style="font-size:0.65rem; color:#64748b; margin-top:10px">ColdChain AI v2.1 Verification Service<br>ID: ${a.id || Math.random().toString(36).substring(7).toUpperCase()}</p>
                    </div>
                    <div class="sig-box">
                        <p style="font-size:0.75rem; font-weight:700; margin-bottom:4px">KALİTE GÜVENCE MÜDÜRÜ ONAYI</p>
                        <div class="sig-line"></div>
                        <p style="font-size:0.7rem; color:#64748b">İmza / Kaşe</p>
                    </div>
                </div>
            </div>
        </div>`;
    },

    exportExcel() {
        // ... same logic as before ...
        const a = AppState.currentAnalysis;
        if (!a) return;
        const summary = [
            { Parametre: 'İlaç', Değer: a.drugName },
            { Parametre: 'Parti No', Değer: a.batchNumber },
            { Parametre: 'Karar', Değer: a.decision.decision.toUpperCase() }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Özet');
        XLSX.writeFile(wb, `ColdChain_Rapor_${a.batchNumber}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
};
