const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../auth.js');

describe('auth — şifre özeti (scrypt)', () => {
    test('doğru şifre doğrulanır, yanlış şifre reddedilir, aynı şifre farklı tuz üretir', () => {
        const a = A.hashPassword('Sifre1234');
        const b = A.hashPassword('Sifre1234');
        assert.notEqual(a.salt, b.salt);
        assert.notEqual(a.hash, b.hash);
        assert.equal(A.verifyPassword('Sifre1234', a.salt, a.hash), true);
        assert.equal(A.verifyPassword('sifre1234', a.salt, a.hash), false);
        assert.equal(A.verifyPassword('Sifre1234', '', ''), false);
    });

    test('şifre politikası: en az 8 karakter, harf + rakam', () => {
        assert.match(A.passwordProblem('kisa1'), /en az 8/);
        assert.match(A.passwordProblem('sadeceharfler'), /harf ve bir rakam/);
        assert.match(A.passwordProblem('12345678'), /harf ve bir rakam/);
        assert.equal(A.passwordProblem('Gecerli99'), null);
    });
});

describe('auth — çerez', () => {
    test('parseCookies birden çok çerezi ve URL kodlamasını çözer', () => {
        const c = A.parseCookies('a=1; cc_session=abc%20def; x=y=z');
        assert.equal(c.a, '1');
        assert.equal(c.cc_session, 'abc def');
        assert.equal(c.x, 'y=z');
        assert.deepEqual(A.parseCookies(undefined), {});
    });

    test('cookieHeader HttpOnly + SameSite=Strict; Max-Age yalnızca verilirse', () => {
        const h = A.cookieHeader('tok', 3600);
        assert.match(h, /^cc_session=tok; Path=\/; HttpOnly; SameSite=Strict; Max-Age=3600$/);
        assert.doesNotMatch(A.cookieHeader('tok', null), /Max-Age/);
        assert.match(A.cookieHeader('', 0), /Max-Age=0/);
    });
});

describe('auth — oturum deposu', () => {
    test('süre dolunca oturum düşer, kullanım süreyi kaydırır', () => {
        let now = 1_000_000;
        const s = new A.SessionStore(() => now);
        const tok = s.create(7, false);
        assert.equal(s.get(tok).userId, 7);
        now += A.SESSION_TTL_MS - 1000;
        assert.ok(s.get(tok), 'son kullanımdan itibaren süre kayar');
        now += A.SESSION_TTL_MS + 1;
        assert.equal(s.get(tok), null);
    });

    test('"beni hatırla" daha uzun ömür; destroyUser tüm oturumları kapatır', () => {
        let now = 0;
        const s = new A.SessionStore(() => now);
        const t1 = s.create(1, true), t2 = s.create(1, false), t3 = s.create(2, true);
        now += A.SESSION_TTL_MS + 1;
        assert.ok(s.get(t1)); assert.equal(s.get(t2), null);
        s.destroyUser(1);
        assert.equal(s.get(t1), null); assert.ok(s.get(t3));
    });
});

describe('auth — giriş deneme sınırlayıcı', () => {
    test('5 başarısız denemede 15 dk kilit, süre dolunca açılır', () => {
        let now = 0;
        const l = new A.LoginLimiter(() => now);
        for (let i = 0; i < A.MAX_ATTEMPTS - 1; i++) { l.fail('ip'); assert.equal(l.check('ip').blocked, false); }
        l.fail('ip');
        const c = l.check('ip');
        assert.equal(c.blocked, true);
        assert.ok(c.retryAfterSec > 0);
        now += A.LOCK_MS + 1;
        assert.equal(l.check('ip').blocked, false);
        l.reset('ip');
        assert.equal(l.check('ip').blocked, false);
    });
});

describe('auth — createAuth ile Express benzeri akış (sahte db)', () => {
    function fakeDb() {
        const users = [];
        return {
            users,
            countUsers: async (f = {}) => users.filter(u => (f.role ? u.role === f.role : true) && (f.active === undefined ? true : !!u.active === !!f.active)).length,
            getUserByEmail: async e => users.find(u => u.email === e) || null,
            getUserById: async id => users.find(u => u.id === id) || null,
            listUsers: async () => users,
            createUser: async ({ email, name, role, salt, hash, mustChange }) => { const u = { id: users.length + 1, email, name, role, pass_salt: salt, pass_hash: hash, active: 1, must_change: mustChange ? 1 : 0 }; users.push(u); return u; },
            updateUser: async (id, p) => { const u = users.find(x => x.id === id); Object.assign(u, { name: p.name ?? u.name, role: p.role ?? u.role, active: p.active === undefined ? u.active : (p.active ? 1 : 0), pass_salt: p.salt ?? u.pass_salt, pass_hash: p.hash ?? u.pass_hash, must_change: p.mustChange === undefined ? u.must_change : (p.mustChange ? 1 : 0) }); },
            touchLogin: async () => {},
        };
    }
    function fakeApp() {
        const routes = {};
        const reg = m => (p, ...h) => { routes[m + ' ' + p] = h; };
        return { get: reg('GET'), post: reg('POST'), patch: reg('PATCH'), routes };
    }
    function fakeRes() {
        const r = { statusCode: 200, headers: {}, body: null };
        r.status = c => { r.statusCode = c; return r; };
        r.json = b => { r.body = b; return r; };
        r.setHeader = (k, v) => { r.headers[k] = v; };
        return r;
    }
    async function run(handlers, req) {
        const res = fakeRes();
        for (const h of handlers) {
            let nexted = false;
            await h(req, res, () => { nexted = true; });
            if (!nexted) break;
        }
        return res;
    }

    test('kurulum → giriş → korumalı uç → rol kontrolü → çıkış', async () => {
        const db = fakeDb();
        const audits = [];
        const auth = A.createAuth({ db, audit: async e => audits.push(e), isLoopback: () => true });
        const app = fakeApp();
        auth.register(app);

        // status: kurulum gerekli
        let res = await run(app.routes['GET /api/auth/status'], { headers: {}, path: '/api/auth/status' });
        assert.equal(res.body.setupRequired, true);

        // zayıf şifre reddedilir
        res = await run(app.routes['POST /api/auth/setup'], { headers: {}, body: { email: 'a@b.co', name: 'A', password: 'kisa' } });
        assert.equal(res.statusCode, 400);

        // ilk yönetici
        res = await run(app.routes['POST /api/auth/setup'], { headers: {}, body: { email: 'Admin@Eczane.com', name: 'Admin', password: 'Sifre1234' } });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.user.role, 'admin');
        assert.equal(res.body.user.email, 'admin@eczane.com');
        const cookie = res.headers['Set-Cookie'].split(';')[0];

        // ikinci kurulum reddedilir
        res = await run(app.routes['POST /api/auth/setup'], { headers: {}, body: { email: 'x@y.co', password: 'Sifre1234' } });
        assert.equal(res.statusCode, 409);

        // korumalı uç: çerez yok → 401; çerez var → geçer
        res = await run([auth.requireAuth], { headers: {}, path: '/api/templates' });
        assert.equal(res.statusCode, 401);
        const req = { headers: { cookie }, path: '/api/templates' };
        res = await run([auth.requireAuth, (rq, rs) => rs.json({ me: rq.user.email })], req);
        assert.equal(res.body.me, 'admin@eczane.com');

        // qa kullanıcısı oluştur, giriş yap, admin ucuna erişemesin
        res = await run(app.routes['POST /api/users'], { headers: { cookie }, user: db.users[0], body: { email: 'qa@eczane.com', name: 'QA', role: 'qa', password: 'Qa123456' } });
        assert.equal(res.statusCode, 200, JSON.stringify(res.body));
        res = await run(app.routes['POST /api/auth/login'], { headers: {}, ip: '1.1.1.1', body: { email: 'qa@eczane.com', password: 'yanlis1234' } });
        assert.equal(res.statusCode, 401);
        res = await run(app.routes['POST /api/auth/login'], { headers: {}, ip: '1.1.1.1', body: { email: 'qa@eczane.com', password: 'Qa123456' } });
        assert.equal(res.statusCode, 200);
        const qaCookie = res.headers['Set-Cookie'].split(';')[0];
        const qaReq = { headers: { cookie: qaCookie }, path: '/api/users' };
        res = await run([auth.requireAuth, auth.requireRole('admin'), (rq, rs) => rs.json({ ok: 1 })], qaReq);
        assert.equal(res.statusCode, 403);

        // son yönetici düşürülemez
        res = await run(app.routes['PATCH /api/users/:id'], { headers: { cookie }, user: db.users[0], params: { id: '1' }, body: { role: 'qa' } });
        assert.equal(res.statusCode, 400);

        // çıkış → çerez geçersiz
        res = await run(app.routes['POST /api/auth/logout'], { headers: { cookie } });
        assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
        res = await run([auth.requireAuth], { headers: { cookie }, path: '/api/templates' });
        assert.equal(res.statusCode, 401);

        assert.ok(audits.some(a => a.action === 'Oturum açıldı'));
        assert.ok(audits.some(a => a.action === 'Başarısız giriş denemesi'));
    });
});
