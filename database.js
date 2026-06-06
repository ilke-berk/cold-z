const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let userDataPath = __dirname;
try {
    const electron = require('electron');
    if (electron && electron.app) {
        userDataPath = electron.app.getPath('userData');
    }
} catch (e) {}

const dbPath = path.join(userDataPath, 'coldchain.db');
let db;

function initDB() {
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('[HATA] SQLite baglanti hatasi:', err.message);
            return;
        }
        console.log('[OK] SQLite veritabanina baglandi:', dbPath);

        db.run(`
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pharmacy_name TEXT,
                drug_name TEXT,
                batch_number TEXT,
                device_serial TEXT,
                decision TEXT,
                mkt_value REAL,
                total_readings INTEGER,
                start_date TEXT,
                end_date TEXT,
                files TEXT,
                reasons TEXT,
                raw_data_summary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('[HATA] analyses tablo olusturma hatasi:', err.message);
            else console.log('[OK] analyses tablosu hazir.');
        });

        // Audit trail: zaman damgali, hash chain ile baglanmis log kayitlari.
        // prev_hash sayesinde bir kaydi degistirmek tum sonraki hash'leri bozar.
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                user TEXT,
                tags TEXT,
                prev_hash TEXT,
                hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('[HATA] audit_log tablo olusturma hatasi:', err.message);
            else console.log('[OK] audit_log tablosu hazir.');
        });
    });
}

function saveAnalysis(data) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO analyses (
                pharmacy_name, drug_name, batch_number, device_serial,
                decision, mkt_value, total_readings, start_date, end_date,
                files, reasons, raw_data_summary
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            data.pharmacy || '',
            data.drugName || '',
            data.batchNumber || '',
            data.deviceSerial || '',
            data.decision ? data.decision.decision : '',
            data.mkt ? data.mkt.mkt : null,
            data.dataPoints || 0,
            data.timespan ? new Date(data.timespan.start).toISOString() : null,
            data.timespan ? new Date(data.timespan.end).toISOString() : null,
            data.files ? data.files.join(',') : '',
            data.decision ? JSON.stringify(data.decision.reasons) : '[]',
            data.summaryData ? JSON.stringify(data.summaryData) : '{}'
        ];

        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
}

function getRecentAnalyses(limit = 10) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM analyses ORDER BY created_at DESC LIMIT ?`;
        db.all(sql, [limit], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function getStats() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                COUNT(*) as total_count,
                SUM(CASE WHEN decision = 'accept' THEN 1 ELSE 0 END) as accept_count,
                SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END) as reject_count,
                SUM(CASE WHEN decision = 'revize' OR decision = 'conditional' THEN 1 ELSE 0 END) as conditional_count,
                AVG(mkt_value) as avg_mkt
            FROM analyses
        `;
        db.get(sql, [], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// ─── AUDIT TRAIL ────────────────────────────────────────────
const crypto = require('crypto');

function sha256(str) {
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function getLastAuditHash() {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1`,
            [],
            (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.hash : 'GENESIS');
            }
        );
    });
}

async function addAuditEntry(entry) {
    const prevHash = await getLastAuditHash();
    const timestamp = new Date().toISOString();
    const tags = Array.isArray(entry.tags) ? entry.tags.join(',') : (entry.tags || '');

    // Hash chain: yeni kayit, kendi alanlari + onceki hash'i icerir.
    // Bir kaydi degistirmek, tum sonraki hash'lerin yanlis olmasina yol acar.
    const payload = [
        entry.type, entry.action, entry.details || '',
        entry.user || 'Sistem', tags, timestamp, prevHash
    ].join('|');
    const hash = sha256(payload);

    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO audit_log (type, action, details, user, tags, prev_hash, hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [entry.type, entry.action, entry.details || '', entry.user || 'Sistem',
             tags, prevHash, hash, timestamp],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, hash, prevHash, timestamp });
            }
        );
    });
}

function getAuditLog(limit = 200, type = null) {
    return new Promise((resolve, reject) => {
        const sql = type
            ? `SELECT * FROM audit_log WHERE type = ? ORDER BY id DESC LIMIT ?`
            : `SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`;
        const params = type ? [type, limit] : [limit];
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * Audit zincirinin butunlugunu dogrular: her satirin hash'i
 * (alanlar + onceki hash) ile yeniden hesaplandiginda esit olmali.
 */
function verifyAuditChain() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM audit_log ORDER BY id ASC`, [], (err, rows) => {
            if (err) return reject(err);

            let prevHash = 'GENESIS';
            const broken = [];
            for (const r of rows) {
                const payload = [
                    r.type, r.action, r.details || '',
                    r.user || 'Sistem', r.tags || '', r.created_at, prevHash
                ].join('|');
                const expected = sha256(payload);
                if (expected !== r.hash || r.prev_hash !== prevHash) {
                    broken.push({ id: r.id, expected, actual: r.hash });
                }
                prevHash = r.hash;
            }
            resolve({ ok: broken.length === 0, total: rows.length, broken });
        });
    });
}

module.exports = {
    initDB,
    saveAnalysis,
    getRecentAnalyses,
    getStats,
    addAuditEntry,
    getAuditLog,
    verifyAuditChain
};
