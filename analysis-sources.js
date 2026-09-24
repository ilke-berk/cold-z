/**
 * Analiz kaynak belgeleri — elle yüklenen orijinal dosyaların saklanması.
 *
 * Rapor "Belgede göster" ile sapmanın belgedeki yerini açar; sorumlu bunu analizden
 * günler sonra da yapabilmeli. "Sisteme kaydet" sırasında arayüz, oturumdaki orijinal
 * dosyaları buraya yükler: userData/sources/<analiz_id>/<n>_<ad>. SHA-256 özeti tutulur
 * (dosyanın sonradan değişmediği kanıtlanabilir).
 *
 * KVKK: analiz silinince / saklama süresi dolunca cleanupOrphans() dosyaları da siler.
 * BexFlow ekleri burada TEKRAR saklanmaz (zaten userData/bexflow altında).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

let conn = null;
const run = (sql, p = []) => new Promise((res, rej) => conn.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => conn.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => conn.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));

let baseDir = __dirname;
try { const e = require('electron'); if (e && e.app) baseDir = e.app.getPath('userData'); } catch (e) { /* düz Node */ }
const ROOT = path.join(baseDir, 'sources');

function initSchema(db) {
    conn = db;
    db.run(`CREATE TABLE IF NOT EXISTS analysis_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        local_path TEXT NOT NULL,
        size INTEGER,
        sha256 TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('[HATA] analysis_sources tablosu:', err.message);
        else db.run(`CREATE INDEX IF NOT EXISTS idx_analysis_sources_aid ON analysis_sources(analysis_id)`);
    });
}

const safeName = (s) => String(s || 'dosya').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').slice(0, 120);
const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };

/** Sahipsiz kayıtları (analizi silinmiş) ve dosyalarını temizler. Dönen: silinen dosya sayısı */
async function cleanupOrphans() {
    if (!conn) return 0;
    const rows = await all(`SELECT id, analysis_id, local_path FROM analysis_sources WHERE analysis_id NOT IN (SELECT id FROM analyses)`);
    for (const r of rows) { try { fs.rmSync(r.local_path, { force: true }); } catch (e) { /* yut */ } }
    const dirs = [...new Set(rows.map(r => path.join(ROOT, String(r.analysis_id))))];
    for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* yut */ } }
    if (rows.length) await run(`DELETE FROM analysis_sources WHERE analysis_id NOT IN (SELECT id FROM analyses)`);
    return rows.length;
}

function register(app, { db, actor }) {
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 20 } });
    const wrap = (fn) => async (req, res) => {
        try { await fn(req, res); }
        catch (e) { console.error('[HATA] Kaynak belge:', e.message); res.status(500).json({ success: false, error: e.message }); }
    };

    // Analiz kaydından hemen sonra: orijinal dosyaları sakla
    app.post('/api/analyses/:id/sources', upload.array('files', 20), wrap(async (req, res) => {
        const id = Number(req.params.id);
        if (!conn) return res.status(503).json({ success: false, error: 'Veritabanı hazır değil.' });
        if (!id || !(await db.getAnalysisById(id))) return res.status(404).json({ success: false, error: 'Analiz bulunamadı.' });
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ success: false, error: 'Dosya yok.' });
        const dir = path.join(ROOT, String(id));
        fs.mkdirSync(dir, { recursive: true });
        const saved = [];
        for (const f of files) {
            // multer dosya adını latin1 çözer; Türkçe karakterler için UTF-8'e çevir
            const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
            const sha = crypto.createHash('sha256').update(f.buffer).digest('hex');
            const dup = await get(`SELECT id, file_name FROM analysis_sources WHERE analysis_id=? AND sha256=?`, [id, sha]);
            if (dup) { saved.push({ id: dup.id, name, sha256: sha }); continue; }
            const r = await run(`INSERT INTO analysis_sources (analysis_id, file_name, local_path, size, sha256) VALUES (?,?,?,?,?)`, [id, name, '', f.size, sha]);
            const local = path.join(dir, `${r.lastID}_${safeName(name)}`);
            fs.writeFileSync(local, f.buffer);
            await run(`UPDATE analysis_sources SET local_path=? WHERE id=?`, [local, r.lastID]);
            saved.push({ id: r.lastID, name, sha256: sha });
        }
        db.addAuditEntry({ type: 'save', action: 'Kaynak belgeler saklandı', details: `#${id} · ${saved.length} dosya · ${saved.map(s => s.name + ' (sha256 ' + s.sha256.slice(0, 12) + '…)').join(', ')}`, user: actor(req), tags: ['kayıt', 'kaynak'] }).catch(() => {});
        res.json({ success: true, sources: saved });
    }));

    app.get('/api/analyses/:id/sources', wrap(async (req, res) => {
        if (!conn) return res.status(503).json({ success: false, error: 'Veritabanı hazır değil.' });
        res.json({ success: true, sources: await all(`SELECT id, file_name, size, sha256, created_at FROM analysis_sources WHERE analysis_id=? ORDER BY id`, [Number(req.params.id)]) });
    }));

    app.get('/api/analyses/:id/sources/:sid/file', wrap(async (req, res) => {
        if (!conn) return res.status(503).json({ success: false, error: 'Veritabanı hazır değil.' });
        const r = await get(`SELECT * FROM analysis_sources WHERE id=? AND analysis_id=?`, [Number(req.params.sid), Number(req.params.id)]);
        const file = r && path.resolve(r.local_path);
        if (!r || !file.startsWith(path.resolve(ROOT) + path.sep) || !fs.existsSync(file)) return res.status(404).json({ success: false, error: 'Kaynak belge bulunamadı.' });
        const ext = (r.file_name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.file_name)}`);
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).pipe(res);
    }));
}

module.exports = { initSchema, register, cleanupOrphans, ROOT };
