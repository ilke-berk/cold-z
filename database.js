// sqlite3 native bir bağımlılık; CI testleri onu derlemeden kurar
// (npm ci --ignore-scripts). Bu modülü require etmek (örn. server.js'i test
// için import ederken) sqlite3 binding'ini tetiklememeli — bu yüzden sqlite3
// top-level değil, yalnızca initDB() çağrıldığında (gerçek çalışmada) yüklenir.
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
    const sqlite3 = require('sqlite3').verbose();
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

        // Cihaz seri numarasi takibi: ayni seri farkli dosya hash'i ile gelirse
        // mukerrer rapor supheli sayilir. Anti-fraud icin kullanilir.
        db.run(`
            CREATE TABLE IF NOT EXISTS device_serials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                serial TEXT NOT NULL,
                pharmacy TEXT,
                file_hash TEXT NOT NULL,
                analysis_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('[HATA] device_serials tablo olusturma hatasi:', err.message);
            else {
                console.log('[OK] device_serials tablosu hazir.');
                db.run(`CREATE INDEX IF NOT EXISTS idx_device_serials_serial ON device_serials(serial)`);
            }
        });

        // Ham veri saklama (Faz 6): analyses yalniz ozet tutar; normalize
        // edilmis okuma serisi burada saklanir. Parser iyilestikce eski
        // belgeler yeniden islenebilir, insan duzeltmeleri egitim/korpus
        // verisi olarak kullanilabilir.
        db.run(`
            CREATE TABLE IF NOT EXISTS analysis_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_id INTEGER NOT NULL,
                readings TEXT NOT NULL,
                meta TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('[HATA] analysis_readings tablo olusturma hatasi:', err.message);
            else {
                console.log('[OK] analysis_readings tablosu hazir.');
                db.run(`CREATE INDEX IF NOT EXISTS idx_analysis_readings_aid ON analysis_readings(analysis_id)`);
            }
        });

        // Sablon hafizasi (Faz 4): belge yapisal parmak izi -> onaylanmis sema.
        // Ayni logger yazilimi ayni iskeleti bastigi icin fingerprint birebir
        // tutar; eczaneye ozgu icerik (ad, seri, tarih) parmak izinden dislanir.
        db.run(`
            CREATE TABLE IF NOT EXISTS format_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fingerprint TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL,
                brand TEXT,
                producer TEXT,
                header_tokens TEXT,
                row_signature TEXT,
                schema TEXT NOT NULL,
                source TEXT,
                use_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used_at DATETIME
            )
        `, (err) => {
            if (err) console.error('[HATA] format_templates tablo olusturma hatasi:', err.message);
            else {
                console.log('[OK] format_templates tablosu hazir.');
                db.run(`CREATE INDEX IF NOT EXISTS idx_format_templates_kind ON format_templates(kind)`);
                // Migrasyon: eski veritabanlarinda row_signature kolonu yoksa ekle
                // (basliksiz devam sayfalarinin yapisal eslesmesi icin gerekli).
                // Kolon zaten varsa SQLite hata verir; bilincli olarak yutulur.
                db.run(`ALTER TABLE format_templates ADD COLUMN row_signature TEXT`, (aErr) => {
                    if (!aErr) console.log('[OK] format_templates.row_signature kolonu eklendi (migrasyon).');
                });
            }
        });

        // Audit trail: zaman damgali, hash chain ile baglanmis log kayitlari.
        // prev_hash sayesinde bir kaydi degistirmek tum sonraki hash'leri bozar.
        // Faz 12: hash artik HMAC-SHA256 (anahtar userData/audit.key, DB'den ayri);
        // zincir basi (son id+hash) audit.head.json'da tutulur -> sondan silme de yakalanir.
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

        // Kullanicilar (Faz 12): sunucu tarafi kimlik dogrulama. Sifre scrypt
        // ozeti olarak saklanir; roller: admin | qa.
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT,
                role TEXT NOT NULL DEFAULT 'qa',
                pass_salt TEXT NOT NULL,
                pass_hash TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                must_change INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login_at DATETIME
            )
        `, (err) => {
            if (err) console.error('[HATA] users tablo olusturma hatasi:', err.message);
            else console.log('[OK] users tablosu hazir.');
        });
    });
}

// ─── KULLANICILAR (Faz 12) ──────────────────────────────────
function countUsers(filter = {}) {
    return new Promise((resolve, reject) => {
        const where = [];
        const params = [];
        if (filter.role) { where.push('role = ?'); params.push(filter.role); }
        if (filter.active !== undefined) { where.push('active = ?'); params.push(filter.active ? 1 : 0); }
        const sql = `SELECT COUNT(*) AS n FROM users${where.length ? ' WHERE ' + where.join(' AND ') : ''}`;
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row ? row.n : 0));
    });
}
function getUserByEmail(email) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => err ? reject(err) : resolve(row || null));
    });
}
function getUserById(id) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => err ? reject(err) : resolve(row || null));
    });
}
function listUsers() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT id, email, name, role, active, must_change, created_at, last_login_at FROM users ORDER BY id ASC`, [], (err, rows) => err ? reject(err) : resolve(rows));
    });
}
function createUser({ email, name, role, salt, hash, mustChange }) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO users (email, name, role, pass_salt, pass_hash, active, must_change) VALUES (?, ?, ?, ?, ?, 1, ?)`,
            [email, name || '', role || 'qa', salt, hash, mustChange ? 1 : 0],
            function (err) {
                if (err) return reject(err);
                getUserById(this.lastID).then(resolve, reject);
            }
        );
    });
}
function updateUser(id, patch) {
    return new Promise((resolve, reject) => {
        const sets = [];
        const params = [];
        if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
        if (patch.role !== undefined) { sets.push('role = ?'); params.push(patch.role); }
        if (patch.active !== undefined) { sets.push('active = ?'); params.push(patch.active ? 1 : 0); }
        if (patch.salt !== undefined && patch.hash !== undefined) { sets.push('pass_salt = ?', 'pass_hash = ?'); params.push(patch.salt, patch.hash); }
        if (patch.mustChange !== undefined) { sets.push('must_change = ?'); params.push(patch.mustChange ? 1 : 0); }
        if (!sets.length) return resolve();
        params.push(id);
        db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params, (err) => err ? reject(err) : resolve());
    });
}
function touchLogin(id) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [id], (err) => err ? reject(err) : resolve());
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

// Imza anahtari: DB'den AYRI bir dosyada (userData/audit.key, 0600). Ilk
// calismada rastgele 32 bayt uretilir. Anahtar olmadan DB'deki satirlar
// yeniden hesaplanip zincir "tamir" edilemez (eski duz SHA-256'da edilebiliyordu).
const auditKeyPath = path.join(userDataPath, 'audit.key');
const auditHeadPath = path.join(userDataPath, 'audit.head.json');
let auditKey = null;
function getAuditKey() {
    if (auditKey) return auditKey;
    try {
        auditKey = fs.readFileSync(auditKeyPath, 'utf8').trim();
        if (!/^[0-9a-f]{64}$/.test(auditKey)) throw new Error('audit.key bozuk');
    } catch (e) {
        auditKey = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(auditKeyPath, auditKey + '\n', { encoding: 'utf8', mode: 0o600 });
        console.log('[OK] Denetim imza anahtari olusturuldu:', auditKeyPath);
    }
    return auditKey;
}
function auditSign(payload) {
    return crypto.createHmac('sha256', Buffer.from(getAuditKey(), 'hex')).update(payload, 'utf8').digest('hex');
}
function auditPayload(r, prevHash) {
    return [r.type, r.action, r.details || '', r.user || 'Sistem', r.tags || '', r.created_at, prevHash].join('|');
}
function readAuditHead() {
    try { return JSON.parse(fs.readFileSync(auditHeadPath, 'utf8')); } catch (e) { return null; }
}
function writeAuditHead(head) {
    try { fs.writeFileSync(auditHeadPath, JSON.stringify(head) + '\n', { encoding: 'utf8', mode: 0o600 }); } catch (e) { /* salt-okunur dizin: zincir yine DB'de */ }
}

function getLastAudit() {
    return new Promise((resolve, reject) => {
        db.get(`SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1`, [], (err, row) => {
            if (err) reject(err);
            else resolve(row ? { id: row.id, hash: row.hash } : { id: 0, hash: 'GENESIS' });
        });
    });
}

// Yazmalar sirali kuyruga alinir: "son hash'i oku + ekle" iki ayri ifade oldugundan
// es zamanli iki kayit ayni prev_hash'i alip zinciri kalici olarak bozuyordu.
let auditQueue = Promise.resolve();
function addAuditEntry(entry) {
    const job = auditQueue.then(() => _addAuditEntry(entry));
    auditQueue = job.catch(() => {});
    return job;
}
async function _addAuditEntry(entry) {
    const last = await getLastAudit();
    const prevHash = last.hash;
    const timestamp = new Date().toISOString();
    const tags = Array.isArray(entry.tags) ? entry.tags.join(',') : (entry.tags || '');
    const row = { type: entry.type, action: entry.action, details: entry.details || '', user: entry.user || 'Sistem', tags, created_at: timestamp };
    const hash = auditSign(auditPayload(row, prevHash));

    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO audit_log (type, action, details, user, tags, prev_hash, hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.type, row.action, row.details, row.user, tags, prevHash, hash, timestamp],
            function (err) {
                if (err) return reject(err);
                writeAuditHead({ lastId: this.lastID, lastHash: hash, updatedAt: timestamp });
                resolve({ id: this.lastID, hash, prevHash, timestamp });
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
            let legacyCount = 0;   // Faz 12 oncesi duz SHA-256 satirlar (imzasiz ama zincirli)
            for (const r of rows) {
                const payload = auditPayload(r, prevHash);
                const signed = auditSign(payload);
                const legacy = sha256(payload);
                const okSigned = signed === r.hash;
                const okLegacy = !okSigned && legacy === r.hash;
                if (okLegacy) legacyCount++;
                if ((!okSigned && !okLegacy) || r.prev_hash !== prevHash) {
                    broken.push({ id: r.id, expected: signed, actual: r.hash });
                }
                prevHash = r.hash;
            }

            // Zincir basi: son kayit silinmis mi? (hash zinciri sondan kirpmayi goremez)
            const head = readAuditHead();
            const tail = rows.length ? rows[rows.length - 1] : null;
            const headMismatch = !!head && (!tail || tail.id !== head.lastId || tail.hash !== head.lastHash);
            resolve({
                ok: broken.length === 0 && !headMismatch,
                total: rows.length,
                broken,
                legacyCount,
                signedCount: rows.length - legacyCount - broken.length,
                headMismatch,
                head: head ? { lastId: head.lastId, updatedAt: head.updatedAt } : null,
                signing: 'HMAC-SHA256 (anahtar: ' + path.basename(auditKeyPath) + ')'
            });
        });
    });
}

// ─── DEVICE SERIAL DEDUP ────────────────────────────────────
/**
 * Bir cihaz seri numarasini kontrol et: bu seri daha once FARKLI bir dosya
 * hash'i ile sisteme yuklenmis mi? Eger evet -> mukerrer/supheli.
 * Ayni dosyanin tekrar yuklenmesi (ayni file_hash) mukerrer sayilmaz.
 */
function checkDeviceSerial(serial, fileHash) {
    return new Promise((resolve, reject) => {
        if (!serial) {
            return resolve({ isDuplicate: false, previousOccurrences: [] });
        }
        db.all(
            `SELECT id, pharmacy, file_hash, analysis_id, created_at
             FROM device_serials
             WHERE serial = ? AND file_hash != ?
             ORDER BY created_at ASC`,
            [serial, fileHash || ''],
            (err, rows) => {
                if (err) reject(err);
                else resolve({
                    isDuplicate: rows.length > 0,
                    previousOccurrences: rows
                });
            }
        );
    });
}

/**
 * Yeni bir cihaz seri kaydi olustur. Her analizde cagrilir; ayni seri+hash
 * birden fazla yazilabilir (idempotent degil) ama mukerrer kontrolu file_hash
 * uzerinden yapildigi icin sorun yok.
 */
function recordDeviceSerial({ serial, pharmacy, fileHash, analysisId }) {
    return new Promise((resolve, reject) => {
        if (!serial || !fileHash) {
            return reject(new Error('serial ve fileHash zorunlu'));
        }
        db.run(
            `INSERT INTO device_serials (serial, pharmacy, file_hash, analysis_id)
             VALUES (?, ?, ?, ?)`,
            [serial, pharmacy || '', fileHash, analysisId || null],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            }
        );
    });
}

// ─── FORMAT SABLON HAFIZASI (Faz 4) ─────────────────────────

function rowToTemplate(r) {
    if (!r) return null;
    let headerTokens = [];
    let schema = null;
    try { headerTokens = JSON.parse(r.header_tokens || '[]'); } catch (e) {}
    try { schema = JSON.parse(r.schema); } catch (e) {}
    return {
        id: r.id,
        fingerprint: r.fingerprint,
        kind: r.kind,
        brand: r.brand || '',
        producer: r.producer || '',
        headerTokens,
        rowSignature: r.row_signature || '',
        schema,
        source: r.source || '',
        useCount: r.use_count || 0,
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at
    };
}

function listTemplates(kind = null) {
    return new Promise((resolve, reject) => {
        const sql = kind
            ? `SELECT * FROM format_templates WHERE kind = ? ORDER BY use_count DESC`
            : `SELECT * FROM format_templates ORDER BY use_count DESC`;
        const params = kind ? [kind] : [];
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(rowToTemplate));
        });
    });
}

function findTemplateByFingerprint(fingerprint) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM format_templates WHERE fingerprint = ?`, [fingerprint], (err, row) => {
            if (err) reject(err);
            else resolve(rowToTemplate(row));
        });
    });
}

/**
 * Sablon kaydet/guncelle. Ayni fingerprint tekrar gelirse sema ve etiket
 * tazelenir (kullanici eslestirmeyi duzeltmis olabilir); use_count korunur.
 */
function saveTemplate({ fingerprint, kind, brand, producer, headerTokens, rowSignature, schema, source }) {
    return new Promise((resolve, reject) => {
        if (!fingerprint || !kind || !schema) {
            return reject(new Error('fingerprint, kind ve schema zorunlu'));
        }
        const tokensJson = JSON.stringify(headerTokens || []);
        const rowSig = rowSignature || '';
        const schemaJson = typeof schema === 'string' ? schema : JSON.stringify(schema);
        db.get(`SELECT id FROM format_templates WHERE fingerprint = ?`, [fingerprint], (err, row) => {
            if (err) return reject(err);
            if (row) {
                db.run(
                    `UPDATE format_templates
                     SET schema = ?, header_tokens = ?, producer = ?, source = ?,
                         row_signature = CASE WHEN ? != '' THEN ? ELSE row_signature END,
                         brand = CASE WHEN ? != '' THEN ? ELSE brand END
                     WHERE id = ?`,
                    [schemaJson, tokensJson, producer || '', source || '',
                     rowSig, rowSig, brand || '', brand || '', row.id],
                    (uErr) => uErr ? reject(uErr) : resolve({ id: row.id, updated: true })
                );
            } else {
                db.run(
                    `INSERT INTO format_templates (fingerprint, kind, brand, producer, header_tokens, row_signature, schema, source)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [fingerprint, kind, brand || '', producer || '', tokensJson, rowSig, schemaJson, source || ''],
                    function (iErr) {
                        if (iErr) reject(iErr);
                        else resolve({ id: this.lastID, updated: false });
                    }
                );
            }
        });
    });
}

function touchTemplate(id) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE format_templates SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [id],
            (err) => err ? reject(err) : resolve()
        );
    });
}

// ─── HAM OKUMA SERISI (Faz 6) ───────────────────────────────

/**
 * Normalize edilmis okuma serisini kompakt JSON olarak sakla.
 * series: [[epochMs, temperature, confidence, humidity?], ...]
 */
function saveReadings(analysisId, series, meta) {
    return new Promise((resolve, reject) => {
        if (!analysisId || !Array.isArray(series) || series.length === 0) {
            return reject(new Error('analysisId ve dolu series zorunlu'));
        }
        db.run(
            `INSERT INTO analysis_readings (analysis_id, readings, meta) VALUES (?, ?, ?)`,
            [analysisId, JSON.stringify(series), JSON.stringify(meta || {})],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, count: series.length });
            }
        );
    });
}

function getReadings(analysisId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT * FROM analysis_readings WHERE analysis_id = ? ORDER BY id DESC LIMIT 1`,
            [analysisId],
            (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                let series = [];
                let meta = {};
                try { series = JSON.parse(row.readings); } catch (e) {}
                try { meta = JSON.parse(row.meta || '{}'); } catch (e) {}
                resolve({ analysisId, series, meta, createdAt: row.created_at });
            }
        );
    });
}

/**
 * Sablonu sil; audit detayi icin silinen kaydi geri doner.
 * Bulunamazsa null (404 yerine sessiz no-op degil — cagiran karar verir).
 */
function deleteTemplate(id) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM format_templates WHERE id = ?`, [id], (err, row) => {
            if (err) return reject(err);
            if (!row) return resolve(null);
            db.run(`DELETE FROM format_templates WHERE id = ?`, [id], (dErr) => {
                if (dErr) reject(dErr);
                else resolve(rowToTemplate(row));
            });
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
    verifyAuditChain,
    checkDeviceSerial,
    recordDeviceSerial,
    listTemplates,
    findTemplateByFingerprint,
    saveTemplate,
    touchTemplate,
    deleteTemplate,
    saveReadings,
    getReadings,
    countUsers,
    getUserByEmail,
    getUserById,
    listUsers,
    createUser,
    updateUser,
    touchLogin
};
