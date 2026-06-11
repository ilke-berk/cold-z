/**
 * ColdChain AI — Audit Trail (kalıcı, hash-zincirli)
 * Yeni kayıtlar backend SQLite'a yazılır. Bellekteki AppState.auditLog
 * sadece UI önbelleğidir; gerçek otorite veritabanıdır.
 */
const AuditTrail = {
    API: 'http://localhost:3000/api/audit',

    async log(type, action, details, user = 'Sistem', tags = []) {
        // 1) Hemen UI'a yansıt (optimistik)
        const local = AppState.addAuditEntry(type, action, details, user);

        // 2) Backend'e kalıcı yaz, döndüğünde gerçek hash'i ata
        try {
            const res = await fetch(this.API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, action, details, user, tags })
            });
            const data = await res.json();
            if (data.success) {
                local.hash = data.hash;
                local.id = data.id;
                local.prevHash = data.prevHash;
            }
        } catch (err) {
            console.warn('[Audit] Backend kayıt başarısız (offline?):', err.message);
            local._pendingSync = true;
        }
        return local;
    },

    logUpload(filename, size, brand) {
        return this.log('upload', 'Dosya Yüklendi',
            `${filename} (${Utils.formatFileSize(size)}) — Marka: ${brand || 'Belirlenmedi'}`,
            'Ecz. Kullanıcı', ['upload']);
    },

    logParsing(filename, rowCount, method) {
        return this.log('analysis', 'Veri Ayrıştırma',
            `${filename}: ${rowCount} kayıt çıkarıldı. Yöntem: ${method}`,
            'Sistem', ['analysis', 'parsing']);
    },

    logMKTCalculation(mktValue, sampleCount) {
        return this.log('analysis', 'MKT Hesaplama',
            `MKT: ${mktValue}°C (${sampleCount} veri noktası, ΔH/R = 83.144 kJ/mol)`,
            'Sistem', ['analysis', 'mkt']);
    },

    logDecision(decision, reasons) {
        const labels = { accept: 'KABUL', reject: 'RED', revize: 'REVİZE', conditional: 'ŞARTLI KABUL' };
        return this.log('decision', `Karar: ${labels[decision] || decision}`,
            `${reasons.join('. ')}`, 'AI Karar Motoru', ['decision', decision]);
    },

    logExport(format, filename) {
        return this.log('export', 'Rapor Oluşturuldu',
            `${format.toUpperCase()} rapor: ${filename}`,
            'Sistem', ['export', format]);
    },

    /**
     * Backend'den son audit kayıtlarını çek ve AppState'i güncelle.
     */
    async loadFromBackend(limit = 200, type = null) {
        try {
            const url = new URL(this.API);
            url.searchParams.set('limit', limit);
            if (type) url.searchParams.set('type', type);
            const res = await fetch(url);
            const data = await res.json();
            if (!data.success) return [];

            return data.data.map(r => ({
                id: r.id,
                timestamp: r.created_at ? (r.created_at.includes('Z') || r.created_at.includes('T') ? new Date(r.created_at) : new Date(r.created_at.replace(' ', 'T') + 'Z')) : new Date(),
                type: r.type,
                action: r.action,
                details: r.details,
                user: r.user,
                hash: r.hash,
                prevHash: r.prev_hash,
                tags: r.tags ? r.tags.split(',') : []
            }));
        } catch (err) {
            console.warn('[Audit] Backend okuma başarısız:', err.message);
            return [];
        }
    },

    /**
     * Hash zincirinin bütünlüğünü doğrular (backend ile).
     */
    async verifyChain() {
        try {
            const res = await fetch(this.API + '/verify');
            return await res.json();
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    getFilteredLogs(filters = {}) {
        let logs = [...AppState.auditLog];
        if (filters.type) logs = logs.filter(l => l.type === filters.type);
        if (filters.startDate) logs = logs.filter(l => new Date(l.timestamp) >= new Date(filters.startDate));
        if (filters.endDate) logs = logs.filter(l => new Date(l.timestamp) <= new Date(filters.endDate));
        if (filters.search) {
            const q = filters.search.toLowerCase();
            logs = logs.filter(l => l.action.toLowerCase().includes(q) || l.details.toLowerCase().includes(q));
        }
        return logs;
    },

    async exportAuditLog() {
        // Excel için her zaman en güncel veriyi backend'den al
        const logs = await this.loadFromBackend(1000);
        const source = logs.length > 0 ? logs : AppState.auditLog;

        const data = source.map(entry => ({
            'Tarih': Utils.formatDateTime(entry.timestamp),
            'Tür': entry.type,
            'İşlem': entry.action,
            'Detay': entry.details,
            'Kullanıcı': entry.user,
            'Hash (SHA-256)': entry.hash,
            'Önceki Hash': entry.prevHash || ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Denetim İzi');
        const fname = `DenetimIzi_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fname);

        this.logExport('excel', fname);
    }
};
