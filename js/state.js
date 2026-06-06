/**
 * ColdChain AI — Application State Management
 */

const AppState = {
    // Current page
    currentPage: 'dashboard',

    // Upload state
    uploadedFiles: [],
    selectedBrand: null,
    processingQueue: [],

    // Parsed data
    parsedData: [],
    currentAnalysis: null,

    // Analysis results
    analyses: [],

    // Audit trail
    auditLog: [],

    // Eski Demo Dataları Kaldırıldı! (Artık canlı veritabanı kullanılıyor)

    // Temperature ranges for pharmaceuticals
    tempRanges: {
        'cold_chain_standard': { min: 2, max: 8, label: 'Soğuk Zincir (2-8°C)' },
        'frozen': { min: -25, max: -15, label: 'Dondurulmuş (-25 ile -15°C)' },
        'controlled_room': { min: 15, max: 25, label: 'Kontrollü Oda (15-25°C)' },
        'deep_frozen': { min: -90, max: -60, label: 'Derin Dondurulmuş (-90 ile -60°C)' }
    },

    // Logger brands
    loggerBrands: [
        { id: 'logtag', name: 'LogTag', desc: 'TRID30-7F / UTRID-16' },
        { id: 'clogger', name: 'Clogger', desc: 'Sıcaklık Veri Kaydedici' },
        { id: 'elpro', name: 'Elpro', desc: 'LIBERO Series' },
        { id: 'testo', name: 'Testo', desc: 'Testo 184 T1/T3' },
        { id: 'sensitech', name: 'SensiTech', desc: 'TempTale Ultra' },
        { id: 'other', name: 'Diğer', desc: 'Manuel veri girişi' }
    ],

    /**
     * Add audit log entry (UI-side optimistic insert).
     * Gerçek kalıcı kayıt AuditTrail.log() içinden backend'e yazılır.
     */
    addAuditEntry(type, action, details, user = 'Sistem') {
        const entry = {
            id: Utils.generateId(),
            timestamp: new Date(),
            type,
            action,
            details,
            user,
            hash: Utils.generateHash(details + Date.now()),
            tags: [type]
        };
        this.auditLog.unshift(entry);
        return entry;
    },

    /**
     * Generate demo temperature data
     */
    generateDemoTempData(hours = 72, interval = 15) {
        const data = [];
        const startTime = new Date(Date.now() - hours * 3600000);
        const pointCount = (hours * 60) / interval;

        for (let i = 0; i < pointCount; i++) {
            const time = new Date(startTime.getTime() + i * interval * 60000);

            // Simulate realistic temperature fluctuations
            let baseTemp = 4.5;

            // Add daily cycle
            const hourOfDay = time.getHours();
            baseTemp += Math.sin((hourOfDay / 24) * Math.PI * 2) * 0.8;

            // Add some random noise
            baseTemp += (Math.random() - 0.5) * 1.2;

            // Simulate occasional excursions
            if (i > pointCount * 0.3 && i < pointCount * 0.35) {
                baseTemp += 4; // Simulated door opening / power failure
            }

            if (i > pointCount * 0.7 && i < pointCount * 0.72) {
                baseTemp += 6; // Another excursion
            }

            data.push({
                timestamp: time,
                temperature: parseFloat(baseTemp.toFixed(1)),
                humidity: parseFloat((45 + Math.random() * 20).toFixed(1))
            });
        }

        return data;
    },

    /**
     * Oturumu temizle (Yeni analiz için)
     */
    clearSession() {
        this.uploadedFiles = [];
        this.parsedData = [];
        this.currentAnalysis = null;
        this.selectedBrand = null;
        this.processingQueue = [];
    }
};

// Audit log: gerçek kayıtlar backend SQLite'tan gelir.
// Demo seed'i sadece backend boş döndürürse görsel olarak doldurulur (AuditPage içinde).
