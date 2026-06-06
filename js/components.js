/**
 * ColdChain AI — Reusable UI Components
 */
const Components = {
    metricCard(icon, value, label, changeText, changeDir, colorClass) {
        return `
        <div class="card metric-card stat-card ${colorClass}">
            <div class="metric-icon ${colorClass}">${icon}</div>
            <div class="metric-value" data-count="${value}">${value}</div>
            <div class="metric-label">${label}</div>
            ${changeText ? `<span class="metric-change ${changeDir}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="${changeDir === 'up' ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"/>
                </svg>
                ${changeText}
            </span>` : ''}
        </div>`;
    },

    decisionBadge(decision, tooltip = "") {
        const labels = { accept: 'Kabul', reject: 'Red', revize: 'Revize', conditional: 'Şartlı' };
        return `<span class="badge-status badge-${decision}" ${tooltip ? `title="${tooltip}" style="cursor:help;"` : ''}>${labels[decision] || decision}</span>`;
    },

    fileIcon(type) {
        const icons = {
            excel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
            pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
            image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
        };
        return icons[type] || icons.excel;
    },

    progressBar(percentage, color = '') {
        return `<div class="progress-bar"><div class="progress-fill ${color}" style="width:${percentage}%"></div></div>`;
    },

    emptyState(title, text, btnText, btnAction) {
        return `
        <div class="empty-state">
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <h3 class="empty-state-title">${title}</h3>
            <p class="empty-state-text">${text}</p>
            ${btnText ? `<button class="btn btn-primary" onclick="${btnAction}">${btnText}</button>` : ''}
        </div>`;
    },

    torGauge(used, total, status) {
        const pct = Math.min((used / total) * 100, 100);
        const r = 65, c = 2 * Math.PI * r;
        const offset = c - (pct / 100) * c;
        const colors = { safe: '#10b981', caution: '#f59e0b', warning: '#f97316', exceeded: '#f43f5e' };
        const color = colors[status] || colors.safe;
        return `
        <div class="tor-gauge">
            <svg class="tor-gauge-svg" viewBox="0 0 160 160">
                <circle class="tor-gauge-bg" cx="80" cy="80" r="${r}"/>
                <circle class="tor-gauge-fill" cx="80" cy="80" r="${r}" 
                    stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
            </svg>
            <div class="tor-gauge-text">
                <span class="tor-value">${Math.round(used)}</span>
                <span class="tor-total">/ ${total} dk</span>
            </div>
        </div>`;
    }
};
