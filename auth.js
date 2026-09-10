/**
 * ColdChain AI — Kimlik doğrulama ve yetkilendirme (Faz 12)
 *
 * Tek kullanıcılı masaüstü/yerel sunucu için yeterli, ama GERÇEK bir oturum
 * modeli: sunucu tarafında kullanıcı tablosu (scrypt ile şifre özeti),
 * HttpOnly + SameSite=Strict çerezle oturum, iki rol.
 *
 *   admin — her şey: ayarlar (.env), şablon silme, kullanıcı yönetimi
 *   qa    — analiz, onay, rapor, denetim izi okuma
 *
 * İlk çalıştırma: hiç kullanıcı yoksa /api/auth/status setupRequired=true
 * döner; arayüz ilk yöneticiyi oluşturur (yalnızca yerel makineden).
 *
 * Oturumlar bellek içindedir (süreç yeniden başlayınca yeniden giriş).
 * Başarısız giriş denemeleri IP başına sınırlanır (5 deneme / 15 dk).
 */
const crypto = require('crypto');

const COOKIE = 'cc_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;      // 12 saat (kayan)
const REMEMBER_TTL_MS = 7 * 24 * 60 * 60 * 1000; // "beni hatırla": 7 gün
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const MIN_PASSWORD = 8;
const ROLES = ['admin', 'qa'];

// ─── Şifre özeti (scrypt, Node yerleşik) ─────────────────────
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return { salt, hash };
}
function verifyPassword(password, salt, hash) {
    if (!salt || !hash) return false;
    const calc = crypto.scryptSync(String(password), salt, 64);
    const stored = Buffer.from(hash, 'hex');
    return calc.length === stored.length && crypto.timingSafeEqual(calc, stored);
}
function passwordProblem(pw) {
    const s = String(pw || '');
    if (s.length < MIN_PASSWORD) return `Şifre en az ${MIN_PASSWORD} karakter olmalı.`;
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Şifre en az bir harf ve bir rakam içermeli.';
    return null;
}
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()) && String(e).length <= 120;

// ─── Çerez yardımcıları ───────────────────────────────────────
function parseCookies(header) {
    const out = {};
    String(header || '').split(';').forEach(part => {
        const i = part.indexOf('=');
        if (i < 0) return;
        const k = part.slice(0, i).trim();
        if (!k) return;
        out[k] = decodeURIComponent(part.slice(i + 1).trim());
    });
    return out;
}
function cookieHeader(token, maxAgeSec) {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
    if (maxAgeSec != null) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
    return parts.join('; ');
}

// ─── Oturum deposu (bellek içi) ───────────────────────────────
class SessionStore {
    constructor(now = () => Date.now()) { this.map = new Map(); this.now = now; }
    create(userId, remember = false) {
        const token = crypto.randomBytes(32).toString('hex');
        const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
        this.map.set(token, { userId, remember, ttl, expires: this.now() + ttl, created: this.now() });
        return token;
    }
    get(token) {
        if (!token) return null;
        const s = this.map.get(token);
        if (!s) return null;
        if (s.expires <= this.now()) { this.map.delete(token); return null; }
        s.expires = this.now() + s.ttl; // kayan süre
        return s;
    }
    destroy(token) { this.map.delete(token); }
    destroyUser(userId) { for (const [t, s] of this.map) if (s.userId === userId) this.map.delete(t); }
    get size() { return this.map.size; }
}

// ─── Giriş deneme sınırlayıcı ─────────────────────────────────
class LoginLimiter {
    constructor(now = () => Date.now()) { this.map = new Map(); this.now = now; }
    check(key) {
        const e = this.map.get(key);
        if (!e) return { blocked: false };
        if (e.until && e.until > this.now()) return { blocked: true, retryAfterSec: Math.ceil((e.until - this.now()) / 1000) };
        if (e.until && e.until <= this.now()) this.map.delete(key);
        return { blocked: false };
    }
    fail(key) {
        const e = this.map.get(key) || { count: 0, until: 0 };
        e.count += 1;
        if (e.count >= MAX_ATTEMPTS) { e.until = this.now() + LOCK_MS; e.count = 0; }
        this.map.set(key, e);
        return e;
    }
    reset(key) { this.map.delete(key); }
}

// ─── Express entegrasyonu ─────────────────────────────────────
const PUBLIC_API = new Set(['/api/health', '/api/auth/status', '/api/auth/setup', '/api/auth/login']);

function publicUser(u) {
    if (!u) return null;
    return { id: u.id, email: u.email, name: u.name || '', role: u.role, mustChangePassword: !!u.must_change, lastLoginAt: u.last_login_at || null, kvkkAckAt: u.kvkk_ack_at || null };
}

/**
 * @param {object} deps { db, audit(entry), isLoopback(req) }
 */
function createAuth({ db, audit = async () => {}, isLoopback = () => true }) {
    const sessions = new SessionStore();
    const limiter = new LoginLimiter();

    async function userFromRequest(req) {
        const token = parseCookies(req.headers.cookie)[COOKIE];
        const s = sessions.get(token);
        if (!s) return null;
        const u = await db.getUserById(s.userId);
        if (!u || !u.active) { sessions.destroy(token); return null; }
        req.sessionToken = token;
        return u;
    }

    // Tüm /api/* için: herkese açık uçlar dışında oturum zorunlu
    async function requireAuth(req, res, next) {
        if (!req.path.startsWith('/api/')) return next();
        if (PUBLIC_API.has(req.path)) return next();
        try {
            const u = await userFromRequest(req);
            if (!u) return res.status(401).json({ success: false, error: 'Oturum gerekli.', code: 'UNAUTHORIZED' });
            req.user = u;
            next();
        } catch (e) { next(e); }
    }
    const requireRole = (...roles) => (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'Oturum gerekli.', code: 'UNAUTHORIZED' });
        if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok (' + roles.join('/') + ' rolü gerekir).', code: 'FORBIDDEN' });
        next();
    };
    const ipOf = req => String(req.ip || (req.socket && req.socket.remoteAddress) || 'unknown');

    function register(app) {
        app.get('/api/auth/status', async (req, res) => {
            try {
                const count = await db.countUsers();
                const u = count > 0 ? await userFromRequest(req) : null;
                res.json({ success: true, setupRequired: count === 0, authenticated: !!u, user: publicUser(u) });
            } catch (e) { res.status(500).json({ success: false, error: 'Durum alınamadı.' }); }
        });

        // İlk yönetici — yalnızca hiç kullanıcı yokken ve yerel makineden
        app.post('/api/auth/setup', async (req, res) => {
            try {
                if (!isLoopback(req)) return res.status(403).json({ success: false, error: 'İlk kurulum yalnızca yerel makineden yapılabilir.' });
                if ((await db.countUsers()) > 0) return res.status(409).json({ success: false, error: 'Kurulum zaten yapılmış.' });
                const { email, name, password } = req.body || {};
                if (!validEmail(email)) return res.status(400).json({ success: false, error: 'Geçerli bir e-posta girin.' });
                const pp = passwordProblem(password); if (pp) return res.status(400).json({ success: false, error: pp });
                const { salt, hash } = hashPassword(password);
                const user = await db.createUser({ email: String(email).trim().toLowerCase(), name: String(name || '').trim().slice(0, 80), role: 'admin', salt, hash, mustChange: false });
                await audit({ type: 'auth', action: 'İlk yönetici oluşturuldu', details: `${user.email} (admin)`, user: user.email, tags: ['auth', 'setup'] });
                const token = sessions.create(user.id, true);
                res.setHeader('Set-Cookie', cookieHeader(token, REMEMBER_TTL_MS / 1000));
                res.json({ success: true, user: publicUser(user) });
            } catch (e) {
                res.status(500).json({ success: false, error: /UNIQUE/.test(e.message) ? 'Bu e-posta zaten kayıtlı.' : 'Kurulum başarısız.' });
            }
        });

        app.post('/api/auth/login', async (req, res) => {
            try {
                const key = ipOf(req);
                const lim = limiter.check(key);
                if (lim.blocked) return res.status(429).json({ success: false, error: `Çok fazla başarısız deneme. ${Math.ceil(lim.retryAfterSec / 60)} dk sonra tekrar deneyin.`, retryAfterSec: lim.retryAfterSec });
                const { email, password, remember } = req.body || {};
                const u = validEmail(email) ? await db.getUserByEmail(String(email).trim().toLowerCase()) : null;
                const ok = !!u && u.active && verifyPassword(password || '', u.pass_salt, u.pass_hash);
                if (!ok) {
                    const e = limiter.fail(key);
                    await audit({ type: 'auth', action: 'Başarısız giriş denemesi', details: `${String(email || '').trim().toLowerCase().slice(0, 120) || '(boş)'} · ${key}${e.until ? ' · hesap geçici olarak kilitlendi' : ''}`, user: 'Sistem', tags: ['auth', 'fail'] });
                    return res.status(401).json({ success: false, error: 'E-posta veya şifre hatalı.' });
                }
                limiter.reset(key);
                const token = sessions.create(u.id, !!remember);
                await db.touchLogin(u.id);
                await audit({ type: 'auth', action: 'Oturum açıldı', details: `${u.email} (${u.role})${remember ? ' · beni hatırla' : ''}`, user: u.email, tags: ['auth', 'login'] });
                res.setHeader('Set-Cookie', cookieHeader(token, remember ? REMEMBER_TTL_MS / 1000 : null));
                res.json({ success: true, user: publicUser(u) });
            } catch (e) { res.status(500).json({ success: false, error: 'Giriş yapılamadı.' }); }
        });

        app.post('/api/auth/logout', async (req, res) => {
            const token = parseCookies(req.headers.cookie)[COOKIE];
            const s = sessions.get(token);
            if (s) {
                const u = await db.getUserById(s.userId).catch(() => null);
                sessions.destroy(token);
                if (u) await audit({ type: 'auth', action: 'Oturum kapatıldı', details: u.email, user: u.email, tags: ['auth', 'logout'] });
            }
            res.setHeader('Set-Cookie', cookieHeader('', 0));
            res.json({ success: true });
        });

        app.get('/api/auth/me', (req, res) => res.json({ success: true, user: publicUser(req.user) }));

        // Kendi şifresini değiştir
        app.post('/api/auth/password', async (req, res) => {
            try {
                const { current, next } = req.body || {};
                if (!verifyPassword(current || '', req.user.pass_salt, req.user.pass_hash)) return res.status(400).json({ success: false, error: 'Mevcut şifre hatalı.' });
                const pp = passwordProblem(next); if (pp) return res.status(400).json({ success: false, error: pp });
                const { salt, hash } = hashPassword(next);
                await db.updateUser(req.user.id, { salt, hash, mustChange: false });
                await audit({ type: 'auth', action: 'Şifre değiştirildi', details: req.user.email, user: req.user.email, tags: ['auth', 'password'] });
                res.json({ success: true });
            } catch (e) { res.status(500).json({ success: false, error: 'Şifre değiştirilemedi.' }); }
        });

        // KVKK bildirimi onayı (Faz 13): kullanıcı başına bir kez, zaman damgalı, denetim izinde
        app.post('/api/auth/kvkk-ack', async (req, res) => {
            try {
                if (typeof db.setKvkkAck !== 'function') return res.status(501).json({ success: false, error: 'Desteklenmiyor.' });
                await db.setKvkkAck(req.user.id);
                const u = await db.getUserById(req.user.id);
                await audit({ type: 'auth', action: 'KVKK bildirimi onaylandı', details: `${req.user.email} — belge görüntülerinin OCR için Google Gemini'ye gönderilmesi ve yerel saklama koşulları`, user: req.user.email, tags: ['auth', 'kvkk'] });
                res.json({ success: true, user: publicUser(u) });
            } catch (e) { res.status(500).json({ success: false, error: 'Onay kaydedilemedi.' }); }
        });

        // ── Kullanıcı yönetimi (admin)
        app.get('/api/users', requireRole('admin'), async (req, res) => {
            try { res.json({ success: true, data: (await db.listUsers()).map(publicUser).map((u, i, arr) => ({ ...u, active: !!(arr, u), })) }); }
            catch (e) { res.status(500).json({ success: false, error: 'Kullanıcılar alınamadı.' }); }
        });
        app.post('/api/users', requireRole('admin'), async (req, res) => {
            try {
                const { email, name, role, password } = req.body || {};
                if (!validEmail(email)) return res.status(400).json({ success: false, error: 'Geçerli bir e-posta girin.' });
                if (!ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Rol admin veya qa olmalı.' });
                const pp = passwordProblem(password); if (pp) return res.status(400).json({ success: false, error: pp });
                const { salt, hash } = hashPassword(password);
                const user = await db.createUser({ email: String(email).trim().toLowerCase(), name: String(name || '').trim().slice(0, 80), role, salt, hash, mustChange: true });
                await audit({ type: 'auth', action: 'Kullanıcı oluşturuldu', details: `${user.email} (${role})`, user: req.user.email, tags: ['auth', 'user'] });
                res.json({ success: true, user: publicUser(user) });
            } catch (e) {
                res.status(/UNIQUE/.test(e.message) ? 409 : 500).json({ success: false, error: /UNIQUE/.test(e.message) ? 'Bu e-posta zaten kayıtlı.' : 'Kullanıcı oluşturulamadı.' });
            }
        });
        app.patch('/api/users/:id', requireRole('admin'), async (req, res) => {
            try {
                const id = parseInt(req.params.id);
                const target = await db.getUserById(id);
                if (!target) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
                const b = req.body || {};
                const patch = {};
                const changes = [];
                if (b.role !== undefined) {
                    if (!ROLES.includes(b.role)) return res.status(400).json({ success: false, error: 'Rol admin veya qa olmalı.' });
                    if (target.role === 'admin' && b.role !== 'admin' && (await db.countUsers({ role: 'admin', active: true })) <= 1) return res.status(400).json({ success: false, error: 'Son etkin yönetici rolü düşürülemez.' });
                    patch.role = b.role; changes.push(`rol → ${b.role}`);
                }
                if (b.active !== undefined) {
                    const act = !!b.active;
                    if (!act && target.id === req.user.id) return res.status(400).json({ success: false, error: 'Kendi hesabınızı pasifleştiremezsiniz.' });
                    if (!act && target.role === 'admin' && (await db.countUsers({ role: 'admin', active: true })) <= 1) return res.status(400).json({ success: false, error: 'Son etkin yönetici pasifleştirilemez.' });
                    patch.active = act; changes.push(act ? 'etkinleştirildi' : 'pasifleştirildi');
                    if (!act) sessions.destroyUser(target.id);
                }
                if (b.name !== undefined) { patch.name = String(b.name).trim().slice(0, 80); changes.push('ad'); }
                if (b.password !== undefined) {
                    const pp = passwordProblem(b.password); if (pp) return res.status(400).json({ success: false, error: pp });
                    const { salt, hash } = hashPassword(b.password);
                    patch.salt = salt; patch.hash = hash; patch.mustChange = true; changes.push('şifre sıfırlandı');
                    sessions.destroyUser(target.id);
                }
                if (!changes.length) return res.json({ success: true, user: publicUser(target) });
                await db.updateUser(id, patch);
                const updated = await db.getUserById(id);
                await audit({ type: 'auth', action: 'Kullanıcı güncellendi', details: `${target.email}: ${changes.join(', ')}`, user: req.user.email, tags: ['auth', 'user'] });
                res.json({ success: true, user: publicUser(updated) });
            } catch (e) { res.status(500).json({ success: false, error: 'Kullanıcı güncellenemedi.' }); }
        });
    }

    return { requireAuth, requireRole, register, sessions, limiter, userFromRequest };
}

module.exports = {
    createAuth, hashPassword, verifyPassword, passwordProblem, parseCookies, cookieHeader,
    SessionStore, LoginLimiter, publicUser, COOKIE, ROLES, SESSION_TTL_MS, REMEMBER_TTL_MS, MAX_ATTEMPTS, LOCK_MS
};
