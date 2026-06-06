/**
 * ColdChain AI — Dashboard Page
 */
const DashboardPage = {
    chartInstance: null,
    snowActive: false,

    async render() {
        const page = document.getElementById('page-dashboard');

        // Önce yükleniyor animasyonu
        page.innerHTML = `
        <div class="dashboard-header">
            <div class="dashboard-greeting">
                <h1 class="greeting-title">Hoş Geldiniz 👋</h1>
                <p class="greeting-subtitle">${Utils.formatDate(new Date())} — Veriler yükleniyor...</p>
            </div>
        </div>
        <div style="padding:40px; text-align:center; color:var(--text-secondary)">
            ⏳ İstatistikler ve Geçmiş Analizler Güncelleniyor...
        </div>`;

        try {
            // API'den gerçek istatistikleri ve son işlemleri al
            const [statsRes, recentRes] = await Promise.all([
                fetch('http://localhost:3000/api/stats').then(r => r.json()),
                fetch('http://localhost:3000/api/recent-analyses').then(r => r.json())
            ]);

            const dbStats = statsRes.success ? statsRes.data : null;
            this.loadedAnalyses = recentRes.success ? recentRes.data : [];
            const recentAnalyses = this.loadedAnalyses;

            // İstatistikleri hesapla
            const totalAnalyses = dbStats ? dbStats.total_count : 0;
            const acceptCount = dbStats ? (dbStats.accept_count || 0) : 0;
            const conditionalCount = dbStats ? (dbStats.conditional_count || 0) : 0;
            const rejectCount = dbStats ? (dbStats.reject_count || 0) : 0;

            const acceptRate = totalAnalyses > 0 ? ((acceptCount / totalAnalyses) * 100).toFixed(1) : 0;
            const conditionalRate = totalAnalyses > 0 ? ((conditionalCount / totalAnalyses) * 100).toFixed(1) : 0;
            const rejectRate = totalAnalyses > 0 ? ((rejectCount / totalAnalyses) * 100).toFixed(1) : 0;

            const avgMKT = dbStats?.avg_mkt ? dbStats.avg_mkt.toFixed(1) : '--';
            const pendingReviews = conditionalCount; // Şartlı ve Revize olanlar ilgilenilmeyi bekler

            page.innerHTML = `
            <div class="dashboard-header">
                <div class="dashboard-greeting">
                    <h1 class="greeting-title">Kontrol Paneli 👋</h1>
                    <p class="greeting-subtitle">${Utils.formatDate(new Date())} — İlaç Soğuk Zincir Yönetimi</p>
                </div>
                <div class="dashboard-actions" style="display:flex; align-items:center;">
                    <button id="btn-snow" class="btn btn-secondary" onclick="DashboardPage.toggleSnow()" style="margin-right:12px; border-color:var(--surface-border); background:rgba(255,255,255,0.05)">
                        ❄️ Kar Yağdır
                    </button>
                    <button class="btn btn-primary" onclick="AppState.clearSession(); App.navigate('upload')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Yeni İade Bildirimi
                    </button>
                </div>
            </div>

            <div class="quick-stats">
                ${Components.metricCard(
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
                totalAnalyses, 'Toplam Analiz', '', 'up', 'primary'
            )}
                ${Components.metricCard(
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
                acceptRate + '%', 'Kabul Oranı', '', 'up', 'success'
            )}
                ${Components.metricCard(
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
                avgMKT + '°C', 'Ortalama MKT', 'Tüm cihazlar', 'up', 'accent'
            )}
                ${Components.metricCard(
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
                pendingReviews, 'İncelenmesi Gereken', 'Şartlı / Revize', 'down', 'warning'
            )}
            </div>

            <div class="dashboard-grid">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Türkiye Geneli Kabul / Red Dağılımı</h3>
                    </div>
                    <div class="decision-distribution">
                        <div class="decision-bar-group">
                            <div class="decision-bar-label"><span>Kabul (Koşulsuz)</span><span style="color:var(--color-success-400); font-weight:600;">${acceptRate}%</span></div>
                            <div class="decision-bar"><div class="decision-bar-fill accept" style="width:${acceptRate}%; box-shadow:0 0 10px var(--color-success-400);"></div></div>
                        </div>
                        <div class="decision-bar-group">
                            <div class="decision-bar-label"><span>Şartlı / Revize İnceleme</span><span style="color:var(--color-warning-400); font-weight:600;">${conditionalRate}%</span></div>
                            <div class="decision-bar"><div class="decision-bar-fill conditional" style="width:${conditionalRate}%; box-shadow:0 0 10px var(--color-warning-400);"></div></div>
                        </div>
                        <div class="decision-bar-group">
                            <div class="decision-bar-label"><span>Zorunlu Red</span><span style="color:var(--color-danger-400); font-weight:600;">${rejectRate}%</span></div>
                            <div class="decision-bar"><div class="decision-bar-fill reject" style="width:${rejectRate}%; box-shadow:0 0 10px var(--color-danger-400);"></div></div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Son Uyarılar & İhlaller</h3></div>
                    <div class="activity-list" style="max-height: 200px; overflow-y: auto; padding-right:8px;">
                        ${recentAnalyses.filter(a => a.decision !== 'accept').slice(0, 4).map(a => `
                        <div class="activity-item" style="padding:12px; background:var(--surface-1); border-radius:8px; margin-bottom:8px; border-left:3px solid ${a.decision === 'reject' ? 'var(--color-danger-400)' : 'var(--color-warning-400)'}; cursor:pointer" onclick="DashboardPage.showAnalysisDetails(${a.id})">
                            <div class="activity-content" style="width:100%">
                                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                    <span style="font-weight:600; font-size:0.85rem; color:var(--text-primary)">${a.pharmacy_name || 'Bilinmeyen'}</span>
                                    <span style="font-size:0.75rem; color:var(--text-tertiary)">${Utils.timeAgo(new Date(a.created_at))}</span>
                                </div>
                                <div style="font-size:0.8rem; color:var(--text-secondary); display:flex; justify-content:space-between">
                                    <span>${a.device_serial || a.drug_name || 'Cihaz İhlali'}</span>
                                    <span style="color:${a.mkt_value > 8 ? 'var(--color-danger-400)' : 'var(--text-secondary)'}">MKT: ${a.mkt_value ? a.mkt_value.toFixed(1) + '°C' : '-'}</span>
                                </div>
                            </div>
                        </div>`).join('') || '<div style="text-align:center; padding:20px; color:var(--text-tertiary)">Son zamanlarda ihlal/red yaşanmadı.</div>'}
                    </div>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="card" style="grid-column: 1 / -1">
                    <div class="card-header">
                        <div style="display:flex; align-items:center; gap:12px">
                            <h3 class="card-title">Depo Isı İzleme</h3>
                            <span style="background:rgba(6,182,212,0.1); color:var(--color-primary-400); padding:2px 8px; border-radius:12px; font-size:0.7rem; border:1px solid rgba(6,182,212,0.2)">CANLI İZLEME</span>
                        </div>
                    </div>
                    <div class="chart-container" style="height:250px"><canvas id="dashboard-temp-chart"></canvas></div>
                </div>
            </div>

            <div class="recent-reports">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Geçmiş İade Ekstresi</h3>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead><tr>
                                <th>İşlem Tarihi</th><th>Eczane</th><th>İlaç</th><th>Seri No</th><th>MKT</th><th>Karar</th>
                            </tr></thead>
                            <tbody>
                                ${recentAnalyses.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-tertiary)">Henüz kayıtlı analiz bulunmuyor. Yeni bir analiz gerçekleştirdiğinizde burada görüntülenecektir.</td></tr>' :
                    recentAnalyses.map(a => `
                                <tr onclick="DashboardPage.showAnalysisDetails(${a.id})" style="cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background=''">
                                    <td>${Utils.formatDateTime(new Date(a.created_at))}</td>
                                    <td style="font-weight:600">${a.pharmacy_name || '-'}</td>
                                    <td>${a.drug_name || '-'}</td>
                                    <td><code style="font-size:0.75rem;background:var(--surface-2);padding:2px 6px;border-radius:4px">${a.device_serial || a.batch_number || 'N/A'}</code></td>
                                    <td><span class="temp-value ${(a.mkt_value || 0) <= 8 && (a.mkt_value || 0) >= 2 ? 'normal' : 'high'}">${a.mkt_value ? a.mkt_value.toFixed(2) + '°C' : '-'}</span></td>
                                    <td>${Components.decisionBadge(a.decision)}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Detay Modalı Arka Planı -->
            <div id="analysis-detail-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s;">
                <div class="modal-content" style="background:var(--surface-color); border-radius:12px; width:90%; max-width:600px; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); transform:scale(0.95); transition:transform 0.2s;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--surface-border); padding-bottom:12px;">
                        <h2 id="modal-title" style="margin:0; font-size:1.25rem; font-weight:600; color:var(--text-primary)">Analiz Detayı</h2>
                        <button onclick="DashboardPage.closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-secondary); padding:4px;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div id="modal-body" style="max-height:60vh; overflow-y:auto; padding-right:8px;"></div>
                    <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--surface-border); display:flex; justify-content:flex-end; gap:12px;">
                        <button class="btn btn-secondary" onclick="DashboardPage.closeModal()">Kapat</button>
                    </div>
                </div>
            </div>
            `;
        } catch (error) {
            console.error("Dashboard yüklenirken hata:", error);
            page.innerHTML += `<div style="text-align:center;color:#ef4444;padding:20px">Backend'e ulaşılamadı. Veritabanı ve Sunucu bağlantısını kontrol edin.</div>`;
        }

        this.initChart(72);
    },

    showAnalysisDetails(id) {
        if (!this.loadedAnalyses) return;
        const analysis = this.loadedAnalyses.find(a => a.id === id);
        if (!analysis) return;

        const modal = document.getElementById('analysis-detail-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');

        title.textContent = `${analysis.pharmacy_name || 'İsimsiz'} — İade Detayı`;

        // JSON parse işlemleri
        let reasons = [];
        try { reasons = JSON.parse(analysis.reasons); } catch (e) { }

        const reasonsHtml = reasons && reasons.length > 0
            ? reasons.map(r => `<div style="background:var(--surface-2); padding:10px; border-radius:6px; margin-bottom:8px; font-size:0.85rem; border-left:3px solid ${analysis.decision === 'reject' ? 'var(--color-danger-400)' : 'var(--color-warning-400)'}">${r}</div>`).join('')
            : `<div style="background:rgba(16, 185, 129, 0.1); color:var(--color-success-400); padding:10px; border-radius:6px; font-size:0.85rem;">✅ Herhangi bir ihlal tespit edilmedi. Cihaz uyumlu çalışmıştır.</div>`;

        body.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:20px;">
                <div style="background:var(--surface-1); padding:12px; border-radius:8px; border:1px solid var(--surface-border)">
                    <div style="font-size:0.75rem; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px">Kayıt Tarihi</div>
                    <div style="font-weight:500; color:var(--text-primary)">${Utils.formatDateTime(new Date(analysis.created_at))}</div>
                </div>
                <div style="background:var(--surface-1); padding:12px; border-radius:8px; border:1px solid var(--surface-border)">
                    <div style="font-size:0.75rem; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px">Nihai Karar</div>
                    <div>${Components.decisionBadge(analysis.decision)}</div>
                </div>
                <div style="background:var(--surface-1); padding:12px; border-radius:8px; border:1px solid var(--surface-border)">
                    <div style="font-size:0.75rem; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px">Cihaz / Seri No</div>
                    <div style="font-weight:500; font-family:monospace; color:var(--text-primary)">${analysis.device_serial || 'Bilinmiyor'}</div>
                </div>
                <div style="background:var(--surface-1); padding:12px; border-radius:8px; border:1px solid var(--surface-border)">
                    <div style="font-size:0.75rem; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px">Hesaplanan MKT</div>
                    <div style="font-weight:600; font-size:1.1rem; color:${analysis.mkt_value <= 8 && analysis.mkt_value >= 2 ? 'var(--color-success-400)' : 'var(--color-danger-400)'}">${analysis.mkt_value ? analysis.mkt_value.toFixed(2) + '°C' : '-'}</div>
                </div>
            </div>
            
            <h3 style="font-size:0.95rem; margin-bottom:12px; color:var(--text-secondary); border-bottom:1px solid var(--surface-border); padding-bottom:8px;">TİTCK / GDP Kılavuz Kararları (Nedenler)</h3>
            <div style="margin-bottom:16px;">
                ${reasonsHtml}
            </div>

            <div style="font-size:0.8rem; color:var(--text-tertiary); background:var(--surface-2); padding:10px; border-radius:6px; margin-top:16px;">
                <strong>Orijinal Rapor Dosyaları:</strong> ${analysis.files || 'Ek dosya yok'}
            </div>
        `;

        // Animasyonlu gösterim
        modal.style.display = 'flex';
        // Küçük bir gecikme ile opacity'yi 1 yaparak transition tetiklenir
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.querySelector('.modal-content').style.transform = 'scale(1)';
        }, 10);
    },

    closeModal() {
        const modal = document.getElementById('analysis-detail-modal');
        if (modal) {
            modal.style.opacity = '0';
            modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
            // Animasyon bittikten sonra gerçekten gizle
            setTimeout(() => {
                modal.style.display = 'none';
            }, 200); // 0.2s transition süresiyle eşleşir
        }
    },

    initChart(hours) {
        const ctx = document.getElementById('dashboard-temp-chart');
        if (!ctx) return;
        if (this.chartInstance) this.chartInstance.destroy();

        const data = AppState.generateDemoTempData(hours, 15);

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.timestamp),
                datasets: [
                    {
                        label: 'Depo Sıcaklığı (°C)',
                        data: data.map(d => d.temperature),
                        borderColor: '#0ea5e9', // Daha canlı bir mavi
                        backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                            gradient.addColorStop(0, 'rgba(14, 165, 233, 0.2)');
                            gradient.addColorStop(1, 'rgba(14, 165, 233, 0)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.4, // Çizgileri yumuşat
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        borderWidth: 2,
                        segment: { borderColor: ctx2 => { const v = ctx2.p0.parsed.y; return v > 8 || v < 2 ? '#ef4444' : '#0ea5e9'; } } // Taşanları kırmızı yap
                    },
                    {
                        label: 'Üst Limit (8°C)',
                        data: data.map(() => 8),
                        borderColor: 'rgba(244,63,94,0.4)',
                        borderDash: [8, 4],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: 'Alt Limit (2°C)',
                        data: data.map(() => 2),
                        borderColor: 'rgba(6,182,212,0.3)',
                        borderDash: [8, 4],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,22,41,0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(148,163,184,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            title: (items) => Utils.formatDateTime(items[0].label),
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.y.toFixed(1)}°C`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: hours <= 24 ? 'hour' : 'day' },
                        grid: { color: 'rgba(148,163,184,0.05)' },
                        ticks: { color: '#64748b', font: { size: 11 } }
                    },
                    y: {
                        min: -2, max: 18,
                        grid: { color: 'rgba(148,163,184,0.05)' },
                        ticks: { color: '#64748b', font: { size: 11 }, callback: v => v + '°C' }
                    }
                }
            }
        });
    },

    updateChart(hours) {
        this.initChart(hours);
    },

    toggleSnow() {
        this.snowActive = !this.snowActive;
        const btn = document.getElementById('btn-snow');

        if (this.snowActive) {
            btn.innerHTML = '🛑 Karı Durdur';
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');

            // Eğer stil yoksa dinamik olarak ekle
            if (!document.getElementById('snow-style')) {
                const style = document.createElement('style');
                style.id = 'snow-style';
                style.innerHTML = `
                    .snowflake {
                        color: #fff;
                        font-family: Arial, sans-serif;
                        text-shadow: 0 0 5px rgba(255,255,255,0.3);
                        position: fixed;
                        top: -10%;
                        z-index: 9999;
                        user-select: none;
                        cursor: default;
                        animation-name: snowflakes-fall, snowflakes-shake;
                        animation-duration: 10s, 3s;
                        animation-timing-function: linear, ease-in-out;
                        animation-iteration-count: infinite, infinite;
                        animation-play-state: running, running;
                    }
                    @keyframes snowflakes-fall {
                        0% { top: -10%; }
                        100% { top: 100%; }
                    }
                    @keyframes snowflakes-shake {
                        0% { transform: translateX(0px); }
                        50% { transform: translateX(80px); }
                        100% { transform: translateX(0px); }
                    }
                `;
                document.head.appendChild(style);
            }

            // Kar tanelerini tutacak saydam konteyner
            const snowContainer = document.createElement('div');
            snowContainer.id = 'snow-container';
            snowContainer.style.position = 'fixed';
            snowContainer.style.top = '0';
            snowContainer.style.left = '0';
            snowContainer.style.width = '100vw';
            snowContainer.style.height = '100vh';
            snowContainer.style.pointerEvents = 'none'; // Kar taneleri tıklamalara engel olmasın
            snowContainer.style.zIndex = '9998';
            document.body.appendChild(snowContainer);

            // 50 adet kar tanesi oluştur ve rastgele dağıt
            const snowflakes = ['❅', '❆', '❄', '•'];
            for (let i = 0; i < 60; i++) {
                const sf = document.createElement('div');
                sf.className = 'snowflake';
                sf.innerHTML = snowflakes[Math.floor(Math.random() * snowflakes.length)];
                sf.style.left = Math.random() * 100 + 'vw';
                sf.style.animationDelay = (Math.random() * 10) + 's, ' + (Math.random() * 3) + 's';
                sf.style.fontSize = (Math.random() * 1.0 + 0.5) + 'rem';
                sf.style.opacity = Math.random() * 0.8 + 0.2;
                snowContainer.appendChild(sf);
            }
        } else {
            // Karı Temizle
            btn.innerHTML = '❄️ Kar Yağdır';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');

            const container = document.getElementById('snow-container');
            if (container) container.remove();
        }
    }
};
