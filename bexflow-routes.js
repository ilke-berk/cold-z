/**
 * BexFlow API uçları (/api/bexflow/*) — server.js tarafından kaydedilir.
 * Global requireAuth zaten uygulanır: tüm uçlar oturum ister.
 */
const fs = require('fs');
const path = require('path');
const store = require('./bexflow-store');
const service = require('./bexflow-service');
const { CATEGORIES } = require('./js/bexflow-classify');

const SAFE_TYPES = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    csv: 'text/csv', txt: 'text/plain', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp',
};

module.exports = function registerBexflow(app, { db, actor, getModel }) {
    const audit = (e) => db.addAuditEntry({ user: 'Sistem', ...e }).catch(() => {});
    service.startScheduler({ audit });

    const wrap = (fn) => async (req, res) => {
        try { await fn(req, res); }
        catch (e) {
            console.error('[BEXFLOW] API hatası:', e.message);
            res.status(e.code === 'SESSION_EXPIRED' ? 409 : 500).json({ success: false, error: e.message, code: e.code || null });
        }
    };
    const needStore = (res) => { if (!store.ready()) { res.status(503).json({ success: false, error: 'Veritabanı hazır değil.' }); return false; } return true; };

    app.get('/api/bexflow/status', wrap(async (req, res) => {
        res.json({ success: true, ...service.status(), stats: store.ready() ? { ...(await store.stats()), att: await store.attachmentCounts() } : null });
    }));

    app.post('/api/bexflow/connect', wrap(async (req, res) => {
        service.openLogin();
        db.addAuditEntry({ type: 'bexflow', action: 'BexFlow giriş penceresi açıldı', user: actor(req), tags: ['bexflow'] }).catch(() => {});
        res.json({ success: true, ...service.status() });
    }));

    app.post('/api/bexflow/disconnect', wrap(async (req, res) => {
        const wipeData = !!(req.body && req.body.wipe);
        if (wipeData && !(req.user && req.user.role === 'admin')) return res.status(403).json({ success: false, error: 'Yerel veriyi silmek yönetici yetkisi ister.' });
        await service.disconnect({ wipeData });
        res.json({ success: true, ...service.status() });
    }));

    app.post('/api/bexflow/sync', wrap(async (req, res) => {
        if (!needStore(res)) return;
        // Uzun sürebilir: arka planda başlat, arayüz /status ile izler
        service.syncNow('elle: ' + actor(req)).catch(() => {});
        res.json({ success: true, ...service.status(), syncing: true });
    }));

    app.get('/api/bexflow/tasks', wrap(async (req, res) => {
        if (!needStore(res)) return;
        const q = req.query || {};
        const tasks = await store.listTasks({
            q: q.q ? String(q.q).slice(0, 100) : '', cold: q.cold === '1', missingLog: q.missingLog === '1',
            status: q.status ? String(q.status) : '', from: q.from ? String(q.from).slice(0, 10) : '', to: q.to ? String(q.to).slice(0, 10) : '',
            limit: q.limit,
        });
        res.json({ success: true, tasks });
    }));

    app.get('/api/bexflow/tasks/:id', wrap(async (req, res) => {
        if (!needStore(res)) return;
        const t = await store.getTask(Number(req.params.id));
        if (!t) return res.status(404).json({ success: false, error: 'İş bulunamadı.' });
        res.json({ success: true, task: t });
    }));

    app.get('/api/bexflow/attachments/:id/file', wrap(async (req, res) => {
        if (!needStore(res)) return;
        const a = await store.getAttachment(Number(req.params.id));
        if (!a || !a.local_path) return res.status(404).json({ success: false, error: 'Ek indirilmemiş.' });
        const root = path.resolve(service.dataDir());
        const file = path.resolve(a.local_path);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.status(404).json({ success: false, error: 'Ek dosyası bulunamadı.' });
        const ext = (a.file_name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
        res.setHeader('Content-Type', SAFE_TYPES[ext] || 'application/octet-stream');
        // Yerel kökende çalıştırılabilir içerik (html/svg) açılmasın: her zaman ek olarak
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.file_name)}`);
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).pipe(res);
    }));

    // Katman 3 (içerik — arayüz) ve 5 (kullanıcı) sınıflandırma sonucunu yazar
    app.post('/api/bexflow/attachments/:id/classify', wrap(async (req, res) => {
        if (!needStore(res)) return;
        const b = req.body || {};
        const source = b.source === 'kullanici' ? 'kullanici' : 'icerik';
        if (!Object.prototype.hasOwnProperty.call(CATEGORIES, b.category)) return res.status(400).json({ success: false, error: 'Geçersiz kategori.' });
        const conf = Math.max(0, Math.min(1, Number(b.confidence) || (source === 'kullanici' ? 1 : 0.5)));
        const reason = String(b.reason || (source === 'kullanici' ? 'Kullanıcı düzeltmesi' : '')).slice(0, 500);
        const a = await store.setClassification(Number(req.params.id), { category: b.category, confidence: conf, reason, source });
        if (!a) return res.status(404).json({ success: false, error: 'Ek bulunamadı.' });
        if (source === 'kullanici') {
            db.addAuditEntry({ type: 'bexflow', action: 'BexFlow eki elle sınıflandı', details: `#${a.id} ${a.file_name} → ${CATEGORIES[b.category]}`, user: actor(req), tags: ['bexflow', 'sınıflandırma'] }).catch(() => {});
        }
        res.json({ success: true, attachment: { id: a.id, category: a.category, confidence: a.confidence, reason: a.reason, category_source: a.category_source } });
    }));

    // Katman 4: belirsiz PDF/görsel için Gemini
    app.post('/api/bexflow/attachments/:id/ai-classify', wrap(async (req, res) => {
        if (!needStore(res)) return;
        const model = getModel();
        if (!model) return res.status(503).json({ success: false, error: 'Gemini API anahtarı ayarlı değil.' });
        const a = await store.getAttachment(Number(req.params.id));
        if (!a) return res.status(404).json({ success: false, error: 'Ek bulunamadı.' });
        const v = await service.aiClassify(a, model);
        const saved = await store.setClassification(a.id, { category: v.kategori, confidence: v.guven, reason: v.neden, source: 'ai' });
        res.json({ success: true, attachment: { id: saved.id, category: saved.category, confidence: saved.confidence, reason: saved.reason, category_source: saved.category_source } });
    }));

    app.post('/api/bexflow/attachments/:id/link-analysis', wrap(async (req, res) => {
        if (!needStore(res)) return;
        const analysisId = Number(req.body && req.body.analysisId);
        if (!analysisId) return res.status(400).json({ success: false, error: 'analysisId gerekli.' });
        await store.linkAnalysis(Number(req.params.id), analysisId);
        res.json({ success: true });
    }));

    app.get('/api/bexflow/attachments', wrap(async (req, res) => {
        if (!needStore(res)) return;
        const q = req.query || {};
        const filter = ['review', 'all', 'logs'].includes(q.filter) ? q.filter : 'review';
        res.json({ success: true, attachments: await store.listAttachments({ filter, coldOnly: q.cold === '1', limit: q.limit }), counts: await store.attachmentCounts() });
    }));

    app.get('/api/bexflow/pending-content', wrap(async (req, res) => {
        if (!needStore(res)) return;
        res.json({ success: true, attachments: await store.attachmentsNeedingContent(30) });
    }));

    app.get('/api/bexflow/report', wrap(async (req, res) => {
        if (!needStore(res)) return;
        const q = req.query || {};
        res.json({ success: true, report: await store.report({ from: q.from ? String(q.from).slice(0, 10) : '', to: q.to ? String(q.to).slice(0, 10) : '' }) });
    }));
};
