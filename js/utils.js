/**
 * ColdChain AI — Utility Functions
 */

const Utils = {
    /**
     * Generate unique ID
     */
    generateId() {
        return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Format date to locale string
     */
    formatDate(date, options = {}) {
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            ...options
        });
    },

    /**
     * Format date and time
     */
    formatDateTime(date) {
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    /**
     * Format time only
     */
    formatTime(date) {
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Format relative time
     */
    timeAgo(date) {
        const d = date instanceof Date ? date : new Date(date);
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);

        if (diff < 60) return 'Az önce';
        if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
        if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`;
        return Utils.formatDate(d);
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    /**
     * Format temperature
     */
    formatTemp(value, unit = '°C') {
        return `${parseFloat(value).toFixed(1)}${unit}`;
    },

    /**
     * Format duration in minutes to human readable
     */
    formatDuration(minutes) {
        if (minutes < 60) return `${Math.round(minutes)} dk`;
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        if (hours < 24) return `${hours} sa ${mins} dk`;
        const days = Math.floor(hours / 24);
        const remainHours = hours % 24;
        return `${days} gün ${remainHours} sa`;
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Deep clone object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Senkron, hızlı, kriptografik OLMAYAN hash (cyrb53).
     * UI'da kayıt parmak izi göstermek için yeterli, audit-doğrulama için DEĞİL.
     * Gerçek doğrulama için Utils.sha256(...) (async) kullan.
     */
    generateHash(data) {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        const hi = (h2 >>> 0).toString(16).padStart(8, '0');
        const lo = (h1 >>> 0).toString(16).padStart(8, '0');
        return `cyrb53:${hi}${lo}`;
    },

    /**
     * Gerçek SHA-256 hash (Web Crypto API).
     * Audit chain ve veri bütünlüğü doğrulaması için kullanılır.
     * @returns {Promise<string>} Hex formatında 64 karakterli hash
     */
    async sha256(data) {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        const encoder = new TextEncoder();
        const buf = await crypto.subtle.digest('SHA-256', encoder.encode(str));
        const bytes = Array.from(new Uint8Array(buf));
        return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 300ms ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * Parse CSV string
     */
    parseCSV(text, delimiter = ',') {
        const lines = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
            if (values.length < 2) continue;
            const row = {};
            headers.forEach((h, j) => {
                row[h] = values[j] || '';
            });
            data.push(row);
        }

        return { headers, data };
    },

    /**
     * Get file extension
     */
    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    },

    /**
     * Get file type category
     */
    getFileType(filename) {
        const ext = Utils.getFileExtension(filename);
        if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel';
        if (['pdf'].includes(ext)) return 'pdf';
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
        return 'other';
    },

    /**
     * Group items into lines based on y-coordinate proximity.
     * Tolerans: 8px — PDF render motorları bazen aynı satırdaki öğelere
     * 1-6px arası farklı Y değerleri verebilir.
     * Mantık: Her yeni öğeyi satırın ORTALAMA Y değeriyle karşılaştır
     * (ardışık karşılaştırma yerine), böylece kümülatif kayma sorunu önlenir.
     */
    groupLines(items) {
        const lines = [];
        if (items.length === 0) return lines;

        const TOLERANCE = 8; // px

        let currentLine = [items[0]];
        let lineAvgY = items[0].y;

        for (let j = 1; j < items.length; j++) {
            // Mevcut satırın ortalama Y değeriyle karşılaştır
            if (Math.abs(items[j].y - lineAvgY) <= TOLERANCE) {
                currentLine.push(items[j]);
                // Ortalamayı güncelle
                lineAvgY = currentLine.reduce((sum, item) => sum + item.y, 0) / currentLine.length;
            } else {
                lines.push(currentLine);
                currentLine = [items[j]];
                lineAvgY = items[j].y;
            }
        }
        lines.push(currentLine);
        lines.forEach(line => line.sort((a, b) => a.x - b.x));
        return lines;
    },

    /**
     * Parse timestamp string with a given format hint.
     */
    parseTimestamp(dateStr, timeStr, formatHint) {
        if (!dateStr) return null;

        try {
            // Ayraçlara göre parçala (boşluk, nokta, tire, slaş)
            const dateParts = dateStr.trim().split(/[.\/-\s]/).filter(p => p.length > 0);

            // Saat parçala
            const timeParts = timeStr ? timeStr.trim().split(/[:\.,\s]/).filter(p => p.length > 0).map(Number) : [0, 0, 0];

            let year, month, day;

            if (dateParts[0].length === 4) {
                // YYYY-MM-DD
                year = parseInt(dateParts[0]);
                month = parseInt(dateParts[1]) - 1;
                day = parseInt(dateParts[2]);
            } else if (dateParts.length >= 3) {
                // Format hint'e göre karar ver
                const isMDY = formatHint && (formatHint.startsWith('MM') || formatHint.includes('MM-DD') || formatHint.includes('MM/DD'));

                if (isMDY) {
                    month = parseInt(dateParts[0]) - 1;
                    day = parseInt(dateParts[1]);
                    year = parseInt(dateParts[2]);
                } else {
                    // Varsayılan: DD-MM-YYYY
                    day = parseInt(dateParts[0]);
                    month = parseInt(dateParts[1]) - 1;
                    year = parseInt(dateParts[2]);
                }

                if (year < 100) year += 2000;
            } else {
                return null;
            }

            const date = new Date(year, month, day, timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);
            return isNaN(date.getTime()) ? null : date;
        } catch (e) {
            return null;
        }
    },

    /**
     * resolveDateFormat - Kullanıcı Mantığı
     */
    resolveDateFormat(dateStrings) {
        if (!dateStrings || dateStrings.length < 3) return null;

        const sampleParts = dateStrings[0].replace(/\s/g, '').split(/[.\/-]/);
        if (sampleParts[0] && sampleParts[0].length === 4) return 'YYYY-MM-DD';

        const part1Values = new Set();
        const part2Values = new Set();

        const limit = Math.min(dateStrings.length, 300);
        for (let i = 0; i < limit; i++) {
            const parts = dateStrings[i].replace(/\s/g, '').split(/[.\/-]/).map(p => p.trim());
            if (parts.length >= 2) {
                part1Values.add(parts[0]);
                part2Values.add(parts[1]);
            }
        }

        if (part1Values.size > part2Values.size) {
            console.log(`📅 Format Analizi Resolved: DD.MM.YYYY (Varyans: ${part1Values.size}/${part2Values.size})`);
            return 'DD.MM.YYYY';
        } else if (part2Values.size > part1Values.size) {
            console.log(`📅 Format Analizi Resolved: MM.DD.YYYY (Varyans: ${part2Values.size}/${part1Values.size})`);
            return 'MM.DD.YYYY';
        }

        return null;
    },

    /**
     * Convert Celsius to Kelvin
     */
    celsiusToKelvin(c) {
        return parseFloat(c) + 273.15;
    },

    /**
     * Convert Kelvin to Celsius
     */
    kelvinToCelsius(k) {
        return parseFloat(k) - 273.15;
    }
};
