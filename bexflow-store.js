/**
 * BexFlow verisinin yerel SQLite deposu (database.js ile aynı bağlantı).
 *
 *   bexflow_tasks        iş (iade) başlığı + detay form alanları
 *   bexflow_items        iade kalemleri (ürün, barkod, miat, soğuk zincir)
 *   bexflow_comments     notlar / onay geçmişi
 *   bexflow_attachments  ekler + sınıflandırma (ısı kaydı mı?) + bağlı analiz
 *
 * KVKK: veriler yalnızca yerelde tutulur; ek dosyaları userData/bexflow altında.
 */

let conn = null;
const run = (sql, p = []) => new Promise((res, rej) => conn.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => conn.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => conn.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));

function initSchema(db) {
    conn = db;
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS bexflow_tasks (
            id INTEGER PRIMARY KEY,
            folder TEXT,
            title TEXT,
            ref_no TEXT,
            subject TEXT,
            customer_code TEXT,
            pharmacy TEXT,
            district TEXT,
            region TEXT,
            unit TEXT,
            workflow TEXT,
            status TEXT,
            created_text TEXT,
            created_iso TEXT,
            cold INTEGER DEFAULT 0,
            reason TEXT,
            gross_total REAL,
            fields_json TEXT,
            notices_json TEXT,
            list_hash TEXT,
            detail_synced_at DATETIME,
            first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS bexflow_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            item_id TEXT, name TEXT, barcode TEXT, purchase_date TEXT,
            quantity_text TEXT, boxes REAL, total REAL,
            expiry TEXT, expiry_iso TEXT, expiry_stock REAL, stock_days TEXT,
            class_name TEXT, cold INTEGER DEFAULT 0, track_type TEXT, comment TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_bexflow_items_task ON bexflow_items(task_id)`);
        db.run(`CREATE TABLE IF NOT EXISTS bexflow_comments (
            id INTEGER PRIMARY KEY,
            task_id INTEGER NOT NULL,
            author TEXT, date_text TEXT, date_iso TEXT,
            action TEXT, status TEXT, text TEXT, mail_message_id INTEGER
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_bexflow_comments_task ON bexflow_comments(task_id)`);
        db.run(`CREATE TABLE IF NOT EXISTS bexflow_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            comment_id INTEGER,
            file_name TEXT NOT NULL,
            remote_path TEXT NOT NULL UNIQUE,
            local_path TEXT,
            size INTEGER,
            content_type TEXT,
            category TEXT DEFAULT 'belirsiz',
            confidence REAL,
            reason TEXT,
            category_source TEXT,
            needs_content INTEGER DEFAULT 0,
            analysis_id INTEGER,
            downloaded_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_bexflow_att_task ON bexflow_attachments(task_id)`, (err) => {
            if (err) console.error('[HATA] bexflow tablolari:', err.message);
            else console.log('[OK] bexflow tablolari hazir.');
        });
    });
}

function ready() { return !!conn; }

/** "01.2028" → "2028-01" */
function expiryIso(s) {
    const m = String(s || '').match(/^(\d{1,2})\.(\d{4})$/);
    return m ? `${m[2]}-${m[1].padStart(2, '0')}` : null;
}

async function getTaskHashes() {
    // detail_ok: detay gerçekten dolu mu (boş {} kaydedilmişse yeniden çekilir)
    const rows = await all(`SELECT id, list_hash, detail_synced_at, (detail_synced_at IS NOT NULL AND COALESCE(fields_json,'{}') <> '{}') AS detail_ok FROM bexflow_tasks`);
    const map = new Map();
    rows.forEach(r => map.set(r.id, r));
    return map;
}

async function upsertTaskHeader(t, listHash) {
    await run(`INSERT INTO bexflow_tasks (id, folder, title, ref_no, subject, customer_code, pharmacy, district, region, unit, workflow, status, created_text, created_iso, list_hash, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET folder=excluded.folder, title=excluded.title, ref_no=excluded.ref_no, subject=excluded.subject,
            customer_code=excluded.customer_code, pharmacy=excluded.pharmacy, district=excluded.district, region=excluded.region,
            unit=excluded.unit, workflow=excluded.workflow, status=excluded.status, created_text=excluded.created_text,
            created_iso=excluded.created_iso, list_hash=excluded.list_hash, updated_at=CURRENT_TIMESTAMP`,
        [t.id, t.folder, t.title, t.refNo, t.subject, t.customerCode, t.pharmacy, t.district, t.region, t.unit, t.workflow, t.status, t.createdText, t.createdIso, listHash]);
}

function fieldValue(fields, ...keys) {
    for (const k of keys) { const f = fields && fields[k]; if (f && f.value) return f.value; }
    return null;
}

/** Detayı (alanlar, kalemler, notlar) tek işlemde yazar. Ek satırlarını oluşturur ama indirmez. */
async function saveTaskDetail(taskId, detail) {
    const trNum = (s) => { const n = Number(String(s || '').replace(/\./g, '').replace(',', '.')); return isFinite(n) && s ? n : null; };
    await run('BEGIN');
    try {
        await run(`UPDATE bexflow_tasks SET cold=?, reason=?, gross_total=?, fields_json=?, notices_json=?, detail_synced_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
            detail.cold ? 1 : 0,
            fieldValue(detail.fields, 'RemoteInvoice.ReturnInvoiceReason'),
            trNum(fieldValue(detail.fields, 'RemoteInvoice.GROSSTOTAL')),
            JSON.stringify(detail.fields || {}),
            JSON.stringify(detail.notices || []),
            taskId,
        ]);
        await run(`DELETE FROM bexflow_items WHERE task_id=?`, [taskId]);
        for (const i of detail.items || []) {
            await run(`INSERT INTO bexflow_items (task_id, item_id, name, barcode, purchase_date, quantity_text, boxes, total, expiry, expiry_iso, expiry_stock, stock_days, class_name, cold, track_type, comment)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [taskId, i.itemId, i.name, i.barcode, i.purchaseDate, i.quantityText, i.boxes, i.total, i.expiry, expiryIso(i.expiry), i.expiryStock, i.stockDays, i.className, i.cold ? 1 : 0, i.trackType, i.comment]);
        }
        for (const c of detail.comments || []) {
            await run(`INSERT INTO bexflow_comments (id, task_id, author, date_text, date_iso, action, status, text, mail_message_id) VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET author=excluded.author, date_text=excluded.date_text, date_iso=excluded.date_iso, action=excluded.action, status=excluded.status, text=excluded.text`,
                [c.id, taskId, c.author, c.date, c.dateIso, c.action, c.status, c.text, c.mailMessageId || 0]);
            for (const a of c.attachments || []) {
                await run(`INSERT OR IGNORE INTO bexflow_attachments (task_id, comment_id, file_name, remote_path) VALUES (?,?,?,?)`, [taskId, c.id, a.fileName, a.path]);
            }
        }
        await run('COMMIT');
    } catch (e) {
        await run('ROLLBACK').catch(() => {});
        throw e;
    }
}

function pendingDownloads(limit = 50) {
    return all(`SELECT a.*, c.text AS comment_text FROM bexflow_attachments a LEFT JOIN bexflow_comments c ON c.id = a.comment_id
        WHERE a.local_path IS NULL ORDER BY a.id LIMIT ?`, [limit]);
}

function markDownloaded(id, { localPath, size, contentType, meta }) {
    return run(`UPDATE bexflow_attachments SET local_path=?, size=?, content_type=?, downloaded_at=CURRENT_TIMESTAMP,
            category=CASE WHEN category_source='kullanici' THEN category ELSE ? END,
            confidence=CASE WHEN category_source='kullanici' THEN confidence ELSE ? END,
            reason=CASE WHEN category_source='kullanici' THEN reason ELSE ? END,
            category_source=CASE WHEN category_source='kullanici' THEN category_source ELSE 'ad' END,
            needs_content=? WHERE id=?`,
        [localPath, size, contentType, meta.kategori, meta.guven, meta.neden, meta.needsContent ? 1 : 0, id]);
}

function getAttachment(id) {
    return get(`SELECT a.*, c.text AS comment_text FROM bexflow_attachments a LEFT JOIN bexflow_comments c ON c.id = a.comment_id WHERE a.id=?`, [id]);
}

/** source: 'icerik' | 'ai' | 'kullanici'. Kullanıcı kararını otomatik katmanlar ezmez. */
async function setClassification(id, { category, confidence, reason, source }) {
    const cur = await getAttachment(id);
    if (!cur) return null;
    if (cur.category_source === 'kullanici' && source !== 'kullanici') return cur;
    await run(`UPDATE bexflow_attachments SET category=?, confidence=?, reason=?, category_source=?, needs_content=0 WHERE id=?`,
        [category, confidence, reason, source, id]);
    return getAttachment(id);
}

function linkAnalysis(id, analysisId) {
    return run(`UPDATE bexflow_attachments SET analysis_id=? WHERE id=?`, [analysisId, id]);
}

/** Liste: filtreler — q (serbest), cold (1), status, missingLog (1), from/to (created_iso) */
async function listTasks(f = {}) {
    const where = [], p = [];
    if (f.q) { where.push(`(t.title LIKE ? OR t.pharmacy LIKE ? OR t.ref_no LIKE ? OR CAST(t.id AS TEXT) LIKE ? OR EXISTS (SELECT 1 FROM bexflow_items i WHERE i.task_id=t.id AND (i.name LIKE ? OR i.barcode LIKE ?)))`); const q = `%${f.q}%`; p.push(q, q, q, q, q, q); }
    if (f.cold) { where.push('t.cold=1'); }
    if (f.status) { where.push('t.status=?'); p.push(f.status); }
    if (f.from) { where.push('t.created_iso>=?'); p.push(f.from); }
    if (f.to) { where.push('t.created_iso<=?'); p.push(f.to + 'T23:59:59'); }
    const rows = await all(`SELECT t.id, t.folder, t.title, t.ref_no, t.subject, t.customer_code, t.pharmacy, t.district, t.region, t.unit, t.workflow, t.status,
            t.created_text, t.created_iso, t.cold, t.reason, t.gross_total, t.detail_synced_at, t.first_seen_at,
            (SELECT c.author || '|' || COALESCE(c.date_text,'') || '|' || COALESCE(c.text,'') FROM bexflow_comments c WHERE c.task_id=t.id ORDER BY COALESCE(c.date_iso,'') DESC, c.id DESC LIMIT 1) AS last_note,
            (SELECT COUNT(*) FROM bexflow_items i WHERE i.task_id=t.id) AS item_count,
            (SELECT GROUP_CONCAT(i.name, ' · ') FROM bexflow_items i WHERE i.task_id=t.id) AS item_names,
            (SELECT MIN(i.expiry_iso) FROM bexflow_items i WHERE i.task_id=t.id) AS min_expiry,
            (SELECT COUNT(*) FROM bexflow_attachments a WHERE a.task_id=t.id) AS att_count,
            (SELECT COUNT(*) FROM bexflow_attachments a WHERE a.task_id=t.id AND a.category='isi_kaydi') AS log_count,
            (SELECT COUNT(*) FROM bexflow_attachments a WHERE a.task_id=t.id AND a.category='belirsiz') AS unknown_count,
            (SELECT MAX(a.analysis_id) FROM bexflow_attachments a WHERE a.task_id=t.id) AS analysis_id
        FROM bexflow_tasks t ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY COALESCE(t.created_iso, '') DESC, t.id DESC LIMIT ?`, [...p, Math.min(Number(f.limit) || 300, 2000)]);
    // Isı kaydı "eksik" ancak incelenmemiş (belirsiz) ek kalmadıysa kesindir; aksi halde "kontrol bekliyor"
    rows.forEach(r => {
        const [author, date, ...text] = String(r.last_note || '').split('|');
        r.last_note = r.last_note ? { author, date, text: text.join('|').slice(0, 240) } : null;
        r.missing_log =r.cold && !r.log_count && !r.unknown_count ? 1 : 0; r.pending_review = r.cold && !r.log_count && r.unknown_count ? 1 : 0; });
    return f.missingLog ? rows.filter(r => r.missing_log) : rows;
}

async function getTask(id) {
    const task = await get(`SELECT * FROM bexflow_tasks WHERE id=?`, [id]);
    if (!task) return null;
    try { task.fields = JSON.parse(task.fields_json || '{}'); } catch (e) { task.fields = {}; }
    try { task.notices = JSON.parse(task.notices_json || '[]'); } catch (e) { task.notices = []; }
    delete task.fields_json; delete task.notices_json;
    task.items = await all(`SELECT * FROM bexflow_items WHERE task_id=? ORDER BY id`, [id]);
    task.comments = await all(`SELECT * FROM bexflow_comments WHERE task_id=? ORDER BY COALESCE(date_iso,'') DESC, id DESC`, [id]);
    task.attachments = await all(`SELECT id, task_id, comment_id, file_name, size, content_type, category, confidence, reason, category_source, needs_content, analysis_id, downloaded_at, local_path IS NOT NULL AS downloaded
        FROM bexflow_attachments WHERE task_id=? ORDER BY id`, [id]);
    const hasLog = task.attachments.some(a => a.category === 'isi_kaydi');
    const unknown = task.attachments.some(a => a.category === 'belirsiz');
    task.missing_log = task.cold && !hasLog && !unknown ? 1 : 0;
    task.pending_review = task.cold && !hasLog && unknown ? 1 : 0;
    return task;
}

/**
 * Ek inceleme listesi (kullanıcı önizleyip karar verir).
 * filter: 'review' = henüz kullanıcı kararı yok · 'all' · 'logs' = ısı kaydı olanlar
 */
function listAttachments({ filter = 'review', coldOnly = false, limit = 500 } = {}) {
    const where = ['a.local_path IS NOT NULL'];
    if (filter === 'review') where.push("COALESCE(a.category_source,'') <> 'kullanici'");
    if (filter === 'logs') where.push("a.category = 'isi_kaydi'");
    if (coldOnly) where.push('t.cold = 1');
    return all(`SELECT a.id, a.task_id, a.file_name, a.size, a.category, a.confidence, a.reason, a.category_source, a.analysis_id,
            c.text AS comment_text, c.author AS comment_author, c.date_text AS comment_date,
            t.ref_no, t.pharmacy, t.district, t.status, t.cold, t.created_text,
            (SELECT GROUP_CONCAT(i.name, ' · ') FROM bexflow_items i WHERE i.task_id = t.id) AS item_names
        FROM bexflow_attachments a
        JOIN bexflow_tasks t ON t.id = a.task_id
        LEFT JOIN bexflow_comments c ON c.id = a.comment_id
        WHERE ${where.join(' AND ')}
        ORDER BY COALESCE(t.created_iso,'') DESC, a.id LIMIT ?`, [Math.min(Number(limit) || 500, 2000)]);
}

/** Yalnızca ad/not kuralıyla sınıflanmış ekler (kurallar güncellenince yeniden değerlendirilir) */
function metaClassifiedAttachments() {
    return all(`SELECT a.id, a.file_name, a.category, c.text AS comment_text FROM bexflow_attachments a
        LEFT JOIN bexflow_comments c ON c.id = a.comment_id WHERE a.category_source = 'ad'`);
}
function updateMetaClassification(id, meta) {
    return run(`UPDATE bexflow_attachments SET category=?, confidence=?, reason=? WHERE id=? AND category_source='ad'`, [meta.kategori, meta.guven, meta.neden, id]);
}

async function attachmentCounts() {
    return get(`SELECT COUNT(*) AS total, COALESCE(SUM(local_path IS NOT NULL),0) AS downloaded,
        COALESCE(SUM(local_path IS NOT NULL AND COALESCE(category_source,'') <> 'kullanici'),0) AS to_review,
        COALESCE(SUM(category_source = 'kullanici'),0) AS reviewed FROM bexflow_attachments`);
}

/** Arayüzün içerik kontrolü yapması gereken ekler (indirilmiş, tablo türü, otomatik karar) */
function attachmentsNeedingContent(limit = 30) {
    return all(`SELECT id, task_id, file_name, category, confidence, reason FROM bexflow_attachments
        WHERE needs_content=1 AND local_path IS NOT NULL AND COALESCE(category_source,'') <> 'kullanici' ORDER BY id LIMIT ?`, [limit]);
}

/** Rapor: tarih aralığındaki işlerin özeti */
async function report({ from, to } = {}) {
    const tasks = await listTasks({ from, to, limit: 2000 });
    const ids = tasks.map(t => t.id);
    const items = ids.length ? await all(`SELECT i.*, t.pharmacy, t.ref_no, t.status FROM bexflow_items i JOIN bexflow_tasks t ON t.id=i.task_id
        WHERE i.task_id IN (${ids.map(() => '?').join(',')})`, ids) : [];
    const byPharmacy = {};
    tasks.forEach(t => {
        const k = t.pharmacy || '(bilinmiyor)';
        const b = byPharmacy[k] || (byPharmacy[k] = { pharmacy: k, district: t.district, tasks: 0, cold: 0, missingLog: 0, total: 0 });
        b.tasks++; if (t.cold) b.cold++; if (t.missing_log) b.missingLog++; b.total += Number(t.gross_total) || 0;
    });
    const byProduct = {};
    items.forEach(i => {
        const k = i.barcode || i.name;
        const b = byProduct[k] || (byProduct[k] = { name: i.name, barcode: i.barcode, cold: !!i.cold, lines: 0, boxes: 0, total: 0, minExpiry: null });
        b.lines++; b.boxes += Number(i.boxes) || 0; b.total += Number(i.total) || 0;
        if (i.expiry_iso && (!b.minExpiry || i.expiry_iso < b.minExpiry)) b.minExpiry = i.expiry_iso;
    });
    const byReason = {};
    tasks.forEach(t => { const k = (t.reason || '(belirtilmemiş)').trim(); byReason[k] = (byReason[k] || 0) + 1; });
    const now = new Date();
    const soon = new Date(now.getFullYear(), now.getMonth() + 6, 1);
    const soonIso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}`;
    return {
        range: { from: from || null, to: to || null },
        totals: {
            tasks: tasks.length,
            cold: tasks.filter(t => t.cold).length,
            missingLog: tasks.filter(t => t.missing_log).length,
            pendingReview: tasks.filter(t => t.pending_review).length,
            withLog: tasks.filter(t => t.log_count > 0).length,
            analyzed: tasks.filter(t => t.analysis_id).length,
            grossTotal: tasks.reduce((s, t) => s + (Number(t.gross_total) || 0), 0),
            items: items.length,
        },
        byPharmacy: Object.values(byPharmacy).sort((a, b) => b.tasks - a.tasks),
        byProduct: Object.values(byProduct).sort((a, b) => b.total - a.total),
        byReason: Object.entries(byReason).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        byStatus: Object.entries(tasks.reduce((m, t) => { const k = t.status || '—'; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([status, count]) => ({ status, count })),
        missingLogTasks: tasks.filter(t => t.missing_log).map(t => ({ id: t.id, ref_no: t.ref_no, pharmacy: t.pharmacy, created_text: t.created_text, item_names: t.item_names })),
        nearExpiry: items.filter(i => i.expiry_iso && i.expiry_iso <= soonIso).map(i => ({ task_id: i.task_id, ref_no: i.ref_no, pharmacy: i.pharmacy, name: i.name, barcode: i.barcode, expiry: i.expiry })),
    };
}

async function stats() {
    const r = await get(`SELECT COUNT(*) AS tasks, COALESCE(SUM(cold),0) AS cold, MAX(updated_at) AS last_update,
        COALESCE(SUM(detail_synced_at IS NOT NULL AND COALESCE(fields_json,'{}') <> '{}'),0) AS detailed FROM bexflow_tasks`);
    const a = await get(`SELECT COUNT(*) AS attachments, COALESCE(SUM(category='isi_kaydi'),0) AS logs, COALESCE(SUM(category='belirsiz'),0) AS unknown FROM bexflow_attachments`);
    return { ...(r || {}), ...(a || {}) };
}

/** Senkron penceresinin (BEXFLOW_DAYS) dışında kalan eski işleri YEREL veritabanından siler. Dönen: silinen işlerin id'leri */
async function pruneBefore(sinceDate) {
    const rows = await all(`SELECT id FROM bexflow_tasks WHERE created_iso IS NOT NULL AND substr(created_iso,1,10) < ?`, [sinceDate]);
    if (!rows.length) return [];
    const ids = rows.map(r => r.id);
    const inList = ids.map(() => '?').join(',');
    await run(`DELETE FROM bexflow_items WHERE task_id IN (${inList})`, ids);
    await run(`DELETE FROM bexflow_comments WHERE task_id IN (${inList})`, ids);
    await run(`DELETE FROM bexflow_attachments WHERE task_id IN (${inList})`, ids);
    await run(`DELETE FROM bexflow_tasks WHERE id IN (${inList})`, ids);
    return ids;
}

/** Bağlantı kesilince isteğe bağlı: tüm yerel BexFlow verisini sil */
async function wipe() {
    await run('DELETE FROM bexflow_items'); await run('DELETE FROM bexflow_comments');
    await run('DELETE FROM bexflow_attachments'); await run('DELETE FROM bexflow_tasks');
}

module.exports = {
    initSchema, ready, expiryIso,
    getTaskHashes, upsertTaskHeader, saveTaskDetail,
    pendingDownloads, markDownloaded, getAttachment, setClassification, linkAnalysis, attachmentsNeedingContent,
    listTasks, getTask, report, stats, wipe, pruneBefore, listAttachments, attachmentCounts, metaClassifiedAttachments, updateMetaClassification,
};
