/**
 * BexFlow servisi — Electron oturumu + periyodik senkronizasyon
 *
 * Oturum: BexFlow girişinde reCAPTCHA var, otomatik giriş YAPILMAZ.
 * "Bağlan" ayrı bir pencere açar (kalıcı 'persist:bexflow' oturumu); kullanıcı
 * kendi hesabıyla girer, /mailbox/'a ulaşınca pencere kapanır. Parola uygulamaya
 * hiç gelmez; yalnızca BexFlow'un kendi oturum çerezi Electron oturumunda kalır.
 *
 * Senkronizasyon (salt-okuma): klasörler → iş listesi → yeni/değişen işlerin
 * detayı → eklerin indirilmesi → ad/not ile ön sınıflandırma. İçerik kontrolü
 * (ısı kaydı mı?) arayüzde mevcut DataParser ile yapılır (bkz. js/bexflow-classify.js).
 *
 * Yalnızca Electron içinde çalışır; `npm start` (düz Node) modunda available=false.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient, DEFAULT_BASE, FOLDERS } = require('./bexflow-client');
const store = require('./bexflow-store');
const classify = require('./js/bexflow-classify');

let electron = null;
try { const e = require('electron'); if (e && e.app && e.session) electron = e; } catch (e) { /* düz Node */ }

const PARTITION = 'persist:bexflow';
const BASE = (process.env.BEXFLOW_URL || DEFAULT_BASE).replace(/\/+$/, '');
const SYNC_MIN = Math.max(5, Number(process.env.BEXFLOW_SYNC_MIN) || 15);
// Varsayılan: Posta Kutusu + Gidenler (işlem yaptığınız geçmiş iadeler). BEXFLOW_FOLDERS=",sentbox,requests"
const SYNC_FOLDERS = (process.env.BEXFLOW_FOLDERS != null ? process.env.BEXFLOW_FOLDERS : ',sentbox').split(',').map(s => s.trim()).filter((s, i, a) => a.indexOf(s) === i && (s === '' || FOLDERS[s] !== undefined));
const MAX_ATTACHMENT = 25 * 1024 * 1024;
// Klasör başına en fazla kaç sayfa (50'lik) iş listelensin — Gidenler binlerce iş içerebilir
const MAX_PAGES = Math.max(1, Number(process.env.BEXFLOW_MAX_PAGES) || 10);
// Kaç gün geriye gidilsin (oluşturma tarihine göre). Daha eskiler çekilmez ve yerelden temizlenir.
const DAYS = Math.max(1, Number(process.env.BEXFLOW_DAYS) || 30);
function sinceDate() {
    const d = new Date(Date.now() - DAYS * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const state = {
    available: !!electron,
    connected: false,        // son kontrolde oturum açıktı
    syncing: false,
    loginOpen: false,
    lastSyncAt: null,
    lastError: null,
    lastResult: null,        // { tasks, newTasks, details, downloads }
    progress: null,          // { phase, done, total }
};
let audit = () => {};
let timer = null;
let loginWin = null;

function dataDir() {
    const base = electron ? electron.app.getPath('userData') : __dirname;
    const d = path.join(base, 'bexflow');
    fs.mkdirSync(d, { recursive: true });
    return d;
}

function ses() { return electron.session.fromPartition(PARTITION); }
function client() { return createClient({ fetch: (u, i) => ses().fetch(u, i), base: BASE }); }

function status() {
    return { ...state, base: BASE, syncMinutes: SYNC_MIN, days: DAYS, since: sinceDate(), folders: SYNC_FOLDERS.map(f => ({ id: f, name: FOLDERS[f] })) };
}

// ─── Giriş penceresi ────────────────────────────────────────
function openLogin() {
    if (!electron) throw new Error('BexFlow bağlantısı yalnızca masaüstü uygulamasında kullanılabilir.');
    if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }
    const { BrowserWindow, shell } = electron;
    const parent = BrowserWindow.getAllWindows().find(w => !w.isDestroyed()) || undefined;
    loginWin = new BrowserWindow({
        width: 520, height: 720, parent, modal: false, autoHideMenuBar: true,
        title: 'BexFlow — Giriş (kendi hesabınızla)',
        webPreferences: { partition: PARTITION, nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    state.loginOpen = true;
    const allowed = (u) => { try { const h = new URL(u).host; return h === new URL(BASE).host || /(^|\.)google\.com$|(^|\.)gstatic\.com$|(^|\.)recaptcha\.net$/.test(h); } catch (e) { return false; } };
    loginWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    loginWin.webContents.on('will-navigate', (e, url) => { if (!allowed(url)) e.preventDefault(); });
    let done = false;
    const check = (url) => {
        if (done) return;
        let u; try { u = new URL(url); } catch (e) { return; }
        // Giriş sonrası BexFlow'un herhangi bir iç sayfası (genelde /mailbox/) = oturum açık
        if (u.host === new URL(BASE).host && !/^\/(Login|Account)/i.test(u.pathname)) {
            done = true;
            state.connected = true; state.lastError = null;
            audit({ type: 'bexflow', action: 'BexFlow oturumu açıldı', details: BASE, tags: ['bexflow'] });
            setTimeout(() => { if (loginWin && !loginWin.isDestroyed()) loginWin.close(); }, 600);
            syncNow('giriş').catch(() => {});
        }
    };
    loginWin.webContents.on('did-navigate', (e, url) => check(url));
    loginWin.webContents.on('did-navigate-in-page', (e, url) => check(url));
    loginWin.on('closed', () => { loginWin = null; state.loginOpen = false; });
    loginWin.loadURL(BASE + '/mailbox/');
}

async function disconnect({ wipeData = false } = {}) {
    if (!electron) return;
    await ses().clearStorageData();
    state.connected = false;
    if (wipeData) {
        await store.wipe();
        try { fs.rmSync(dataDir(), { recursive: true, force: true }); } catch (e) { /* yut */ }
    }
    audit({ type: 'bexflow', action: 'BexFlow bağlantısı kesildi', details: wipeData ? 'Yerel BexFlow verisi silindi' : '', tags: ['bexflow'] });
}

async function checkSession() {
    if (!electron) return false;
    try { state.connected = await client().ping(); }
    catch (e) { state.lastError = e.message; }
    return state.connected;
}

// ─── Senkronizasyon ─────────────────────────────────────────
const listHash = (t) => crypto.createHash('sha1').update(JSON.stringify([t.status, t.title, t.lastComment, t.createdText])).digest('hex');
const safeName = (s) => String(s || 'dosya').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').slice(0, 120);

async function syncNow(trigger = 'elle') {
    if (!electron) throw new Error('BexFlow senkronizasyonu yalnızca masaüstü uygulamasında çalışır.');
    if (!store.ready()) throw new Error('Veritabanı henüz hazır değil.');
    if (state.syncing) return status();
    state.syncing = true; state.lastError = null;
    const result = { tasks: 0, newTasks: 0, details: 0, downloads: 0, errors: 0 };
    try {
        const c = client();
        const since = sinceDate();
        const pruned = await store.pruneBefore(since);
        if (pruned.length) {
            // Yerel ek dosyaları da sil (BexFlow'daki hiçbir şeye dokunulmaz)
            for (const id of pruned) { try { fs.rmSync(path.join(dataDir(), String(id)), { recursive: true, force: true }); } catch (e) { /* yut */ } }
            console.log(`[BEXFLOW] ${since} öncesi ${pruned.length} iş yerelden temizlendi (BEXFLOW_DAYS=${DAYS}).`);
        }
        const known = await store.getTaskHashes();
        const toDetail = [], queued = new Set();
        for (const folder of SYNC_FOLDERS) {
            state.progress = { phase: `Liste: ${FOLDERS[folder]}`, done: 0, total: 0 };
            const ctx = await c.openFolder(folder);
            const { tasks } = await c.listTasks(ctx, { maxPages: MAX_PAGES, since });
            for (const t of tasks) {
                const h = listHash(t);
                const prev = known.get(t.id);
                if (!prev) result.newTasks++;
                await store.upsertTaskHeader(t, h);
                if (!queued.has(t.id) && (!prev || prev.list_hash !== h || !prev.detail_ok)) { toDetail.push({ ctx, t }); queued.add(t.id); }
                known.set(t.id, { list_hash: h, detail_ok: prev && prev.detail_ok });
            }
            result.tasks += tasks.length;
        }
        state.connected = true;
        // En yeni işler önce: uzun ilk senkronda güncel iadeler hemen görünür
        toDetail.sort((a, b) => String(b.t.createdIso || '').localeCompare(String(a.t.createdIso || '')));

        let i = 0, streak = 0;
        for (const { ctx, t } of toDetail) {
            state.progress = { phase: 'İş detayları', done: i++, total: toDetail.length };
            try {
                const d = await c.getTaskDetail(ctx, t);
                await store.saveTaskDetail(t.id, d);
                result.details++; streak = 0;
            } catch (e) {
                if (e.code === 'SESSION_EXPIRED') throw e;
                result.errors++;
                // Art arda hatalar: sistematik sorun (biçim değişikliği vb.) — BexFlow'u boşuna yormadan dur
                if (++streak >= 5) throw new Error('İş detayları art arda alınamadı: ' + e.message);
                console.error(`[BEXFLOW] Detay alınamadı (#${t.id}):`, e.message);
            }
        }

        const pend = await store.pendingDownloads(300);
        let j = 0;
        for (const a of pend) {
            state.progress = { phase: 'Ekler indiriliyor', done: j++, total: pend.length };
            try {
                const { buffer, contentType } = await c.downloadAttachment(a.remote_path);
                if (buffer.length > MAX_ATTACHMENT) throw new Error('Ek 25 MB sınırını aşıyor');
                const dir = path.join(dataDir(), String(a.task_id));
                fs.mkdirSync(dir, { recursive: true });
                const local = path.join(dir, `${a.id}_${safeName(a.file_name)}`);
                fs.writeFileSync(local, buffer);
                const meta = classify.classifyByMeta({ fileName: a.file_name, commentText: a.comment_text });
                await store.markDownloaded(a.id, { localPath: local, size: buffer.length, contentType, meta });
                result.downloads++;
            } catch (e) {
                if (e.code === 'SESSION_EXPIRED') throw e;
                result.errors++;
                console.error(`[BEXFLOW] Ek indirilemedi (#${a.id}):`, e.message);
            }
        }

        // Kurallar güncellendiyse eski ön sınıflandırmaları tazele (içerik/AI/kullanıcı kararlarına dokunmaz)
        for (const a of await store.metaClassifiedAttachments()) {
            const meta = classify.classifyByMeta({ fileName: a.file_name, commentText: a.comment_text });
            if (meta.kategori !== a.category) await store.updateMetaClassification(a.id, meta);
        }

        state.lastResult = result;
        state.lastSyncAt = new Date().toISOString();
        if (result.newTasks || result.details || result.downloads) {
            audit({ type: 'bexflow', action: 'BexFlow senkronizasyonu', details: `${trigger}: ${result.tasks} iş, ${result.newTasks} yeni, ${result.details} detay, ${result.downloads} ek${result.errors ? `, ${result.errors} hata` : ''}`, tags: ['bexflow', 'senkron'] });
        }
    } catch (e) {
        state.lastError = e.message;
        if (e.code === 'SESSION_EXPIRED') state.connected = false;
        console.error('[BEXFLOW] Senkronizasyon hatası:', e.message);
    } finally {
        state.syncing = false; state.progress = null;
    }
    return status();
}

function startScheduler({ audit: auditFn } = {}) {
    if (auditFn) audit = auditFn;
    if (!electron || timer) return;
    // Açılışta oturum hâlâ geçerliyse (Beni hatırla) sessizce senkronize et
    setTimeout(async () => { if (store.ready() && await checkSession()) syncNow('açılış').catch(() => {}); }, 30000).unref();
    timer = setInterval(() => { if (state.connected && !state.syncing) syncNow('zamanlı').catch(() => {}); }, SYNC_MIN * 60 * 1000);
    timer.unref();
}

// ─── Katman 4: AI sınıflandırma (belirsiz PDF / görsel) ─────
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp' };
async function aiClassify(att, model) {
    const ext = classify.extOf(att.file_name);
    if (!MIME[ext]) throw new Error('AI sınıflandırma yalnızca PDF ve görseller için.');
    if (!att.local_path || !fs.existsSync(att.local_path)) throw new Error('Ek henüz indirilmedi.');
    const buf = fs.readFileSync(att.local_path);
    if (buf.length > 15 * 1024 * 1024) throw new Error('Dosya AI için çok büyük (15 MB).');
    const { response } = await model.generateContent([classify.AI_PROMPT, { inlineData: { data: buf.toString('base64'), mimeType: MIME[ext] } }]);
    const text = typeof response.text === 'function' ? response.text() : String(response.text || '');
    const verdict = classify.parseAiAnswer(text);
    if (!verdict) throw new Error('AI yanıtı çözümlenemedi.');
    return verdict;
}

module.exports = { status, openLogin, disconnect, checkSession, syncNow, startScheduler, aiClassify, dataDir };
