/**
 * ColdChain AI — Audit Trail Page
 */
const AuditPage = {
    chainStatus: null,

    async render() {
        const page = document.getElementById('page-audit');

        // Backend'den son 200 kaydı çek ve hash zincirini doğrula
        const [backendLogs, chain] = await Promise.all([
            AuditTrail.loadFromBackend(200),
            AuditTrail.verifyChain().catch(() => null)
        ]);

        if (backendLogs.length > 0) {
            AppState.auditLog = backendLogs;
        } else if (AppState.auditLog.length === 0) {
            // Hem backend hem bellek boş → kullanıcıya boş durumu göster
            AppState.auditLog = [];
        }
        this.chainStatus = chain;
        const logs = AppState.auditLog;

        page.innerHTML = `
        <div class="audit-header" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h2>Sistem Kayıtları ve Sertifikasyon (Audit Trail)</h2>
                <p style="color:var(--text-secondary); font-size:0.9rem; margin-top:4px;">SHA-256 hash zinciri ile kalıcı SQLite kaydı — değişiklik tüm sonraki hash'leri bozar.</p>
                ${this.renderChainBadge()}
            </div>
            <button class="btn btn-secondary" onclick="AuditTrail.exportAuditLog()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Excel Olarak İndir (Ek-3 Uygun)
            </button>
        </div>

        <div class="compliance-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin:24px 0;">
            <div class="card compliance-card" style="padding:16px; display:flex; gap:12px; align-items:center;">
                <div class="compliance-icon" style="background:rgba(6,182,212,0.1);color:var(--color-primary-500); padding:12px; border-radius:8px; font-weight:bold;">GDP</div>
                <div>
                    <div style="font-weight:600; font-size:0.9rem;">TİTCK / DSÖ GDP Uyumu</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">İyi Dağıtım Uygulamaları (Good Distribution Practice) yönergeleri sağlanmaktadır.</div>
                </div>
            </div>
            <div class="card compliance-card" style="padding:16px; display:flex; gap:12px; align-items:center;">
                <div class="compliance-icon" style="background:rgba(139,92,246,0.1);color:var(--color-accent-500); padding:12px; border-radius:8px; font-weight:bold;">FDA</div>
                <div>
                    <div style="font-weight:600; font-size:0.9rem;">21 CFR Part 11</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Sistem üzerindeki tüm değişiklikler ayrık ve değiştirilemez Hash'ler ile loglanmaktadır.</div>
                </div>
            </div>
            <div class="card compliance-card" style="padding:16px; display:flex; gap:12px; align-items:center; border:2px solid rgba(22, 163, 74, 0.2);">
                <div class="compliance-icon" style="background:rgba(22,163,74,0.1);color:var(--color-success-500); padding:12px; border-radius:8px;">🔒</div>
                <div>
                    <div style="font-weight:600; font-size:0.9rem; color:var(--color-success-700);">Anti-Fraud Koruması Aktif</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Yüklenen veriler manipülasyonlara (Excel/PDF edit) karşı AI tarafından denetlenir.</div>
                </div>
            </div>
        </div>

        <div class="audit-filters" style="background:var(--surface-color); padding:16px; border-radius:8px; border:1px solid var(--surface-border); margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">
            <div class="filter-group" style="display:flex; gap:8px;">
                <button class="btn btn-sm ${!this.activeFilter ? 'btn-primary' : 'btn-ghost'}" onclick="AuditPage.filter(null)">Genel Döküm</button>
                <button class="btn btn-sm ${this.activeFilter === 'upload' ? 'btn-primary' : 'btn-ghost'}" onclick="AuditPage.filter('upload')">ERP Transferleri</button>
                <button class="btn btn-sm ${this.activeFilter === 'analysis' ? 'btn-primary' : 'btn-ghost'}" onclick="AuditPage.filter('analysis')">Yapay Zeka (Güvenlik) Taramaları</button>
                <button class="btn btn-sm ${this.activeFilter === 'decision' ? 'btn-primary' : 'btn-ghost'}" onclick="AuditPage.filter('decision')">Nihai Otorite (Karar) Kayıtları</button>
            </div>
            <div style="font-size:0.8rem; color:var(--text-tertiary);">Toplam <strong style="color:var(--text-primary);">${logs.length}</strong> Değiştirilemez Kayıt Gösteriliyor</div>
        </div>

        <div class="audit-timeline" id="audit-timeline" style="background:var(--surface-color); padding:24px; border-radius:8px; border:1px solid var(--surface-border);">
            ${this.renderTimeline(logs)}
        </div>`;
    },

    activeFilter: null,

    renderChainBadge() {
        const c = this.chainStatus;
        if (!c || !c.success) {
            return `<div style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:4px 10px;background:rgba(148,163,184,0.15);border-radius:12px;font-size:0.75rem;color:var(--text-tertiary)">
                ⚪ Zincir doğrulaması bekleniyor (backend offline?)
            </div>`;
        }
        if (c.ok) {
            return `<div style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:4px 10px;background:rgba(16,185,129,0.15);border-radius:12px;font-size:0.75rem;color:var(--color-success-500);font-weight:600">
                ✅ Hash zinciri sağlam — ${c.total} kayıt doğrulandı
            </div>`;
        }
        return `<div style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:4px 10px;background:rgba(244,63,94,0.15);border-radius:12px;font-size:0.75rem;color:var(--color-danger-500);font-weight:700">
            🚨 ZİNCİR BOZUK — ${c.broken.length}/${c.total} kayıtta uyumsuzluk! Veri manipülasyonu olabilir.
        </div>`;
    },

    async filter(type) {
        this.activeFilter = type;
        await this.render();
    },

    renderTimeline(logs) {
        if (!logs.length) {
            return Components.emptyState('Kayıt bulunamadı', 'Seçili filtreye uygun denetim kaydı yok.', '', '');
        }

        return logs.map(log => {
            const isAI = log.user.includes('Sistem') || log.user.includes('AI');
            const iconSvg = log.type === 'upload' ? '📥' : log.type === 'analysis' ? '🧠' : log.type === 'decision' ? '⚖️' : '📄';
            let statusColor = 'var(--text-primary)';
            if (log.action.includes('RED')) statusColor = 'var(--color-danger-600)';
            if (log.action.includes('KABUL')) statusColor = 'var(--color-success-600)';

            return `
            <div style="display:flex; gap:16px; margin-bottom:24px; position:relative; padding-bottom:24px; border-bottom:1px solid var(--surface-border)">
                <div style="min-width:140px; text-align:right;">
                    <div style="font-size:0.85rem; font-weight:600; color:var(--text-primary);">${Utils.formatDateTime(log.timestamp).split(' ')[0]}</div>
                    <div style="font-size:0.75rem; color:var(--text-tertiary);">${Utils.formatDateTime(log.timestamp).split(' ')[1]}</div>
                </div>
                
                <div style="position:relative; display:flex; flex-direction:column; align-items:center;">
                    <div style="width:36px; height:36px; border-radius:50%; background:var(--surface-color); border:2px solid var(--surface-border); display:flex; align-items:center; justify-content:center; z-index:2; font-size:1rem;">
                        ${iconSvg}
                    </div>
                    <div style="width:2px; height:calc(100% + 24px); background:var(--surface-border); position:absolute; top:36px; z-index:1;"></div>
                </div>

                <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <strong style="color:${statusColor}; font-size:1rem;">${log.action}</strong>
                        ${isAI ? '<span style="font-size:0.7rem; background:rgba(139, 92, 246, 0.1); color:#8b5cf6; padding:2px 8px; border-radius:12px; font-weight:600;">AI OTOMASYONU</span>' : '<span style="font-size:0.7rem; background:rgba(6,182,212,0.1); color:#06b6d4; padding:2px 8px; border-radius:12px; font-weight:600;">KULLANICI (QA)</span>'}
                    </div>
                    <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.5; margin-bottom:8px;">${log.details}</p>
                    
                    <div style="display:flex; gap:12px; align-items:center; background:var(--surface-2); padding:6px 12px; border-radius:6px; font-size:0.75rem; color:var(--text-tertiary); max-width: max-content;">
                        <span style="font-family:monospace;">HASH: ${log.hash || 'N/A'}</span>
                        <span style="padding:0 8px; color:var(--surface-border);">|</span>
                        <span>Otorite: <strong>${log.user}</strong></span>
                    </div>
                </div>
            </div>`
        }).join('');
    }
};
