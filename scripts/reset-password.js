// Kullanıcı şifresini yerel makinede sıfırlar. Şifre ekranda görünmez ve
// hiçbir yere yazılmaz; yalnızca scrypt özeti veritabanına kaydedilir.
// Kullanım:  node scripts/reset-password.js [e-posta]
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const MIN_PASSWORD = 8;
const dbPath = path.join(process.env.APPDATA || __dirname, 'coldchain-ai', 'coldchain.db');

function ask(question, { hidden = false } = {}) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        if (hidden) {
            rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(question); };
        }
        rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
    });
}

function passwordProblem(pw) {
    const s = String(pw || '');
    if (s.length < MIN_PASSWORD) return `Şifre en az ${MIN_PASSWORD} karakter olmalı.`;
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Şifre en az bir harf ve bir rakam içermeli.';
    return null;
}

(async () => {
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(dbPath);
    const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
    const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

    const users = await all('SELECT id, email, role FROM users ORDER BY id');
    if (!users.length) { console.log('Veritabanında kullanıcı yok — uygulama ilk kurulum ekranını gösterir.'); process.exit(0); }

    console.log(`\nVeritabanı: ${dbPath}\nKayıtlı kullanıcılar:`);
    users.forEach((u) => console.log(`  ${u.id}. ${u.email} (${u.role})`));

    let email = process.argv[2];
    if (!email) {
        const def = users[0].email;
        email = (await ask(`\nHangi hesap? [${def}]: `)).trim() || def;
    }
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) { console.error(`\n[HATA] '${email}' bulunamadı.`); process.exit(1); }

    const pw = await ask(`\n${user.email} için yeni şifre (görünmez): `, { hidden: true });
    const problem = passwordProblem(pw);
    if (problem) { console.error(`\n[HATA] ${problem}`); process.exit(1); }
    const again = await ask('Yeni şifre (tekrar): ', { hidden: true });
    if (pw !== again) { console.error('\n[HATA] Şifreler eşleşmedi.'); process.exit(1); }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    await run('UPDATE users SET pass_salt = ?, pass_hash = ?, must_change = 0 WHERE id = ?', [salt, hash, user.id]);
    console.log(`\n[OK] ${user.email} şifresi güncellendi. Uygulamayı yeniden başlatmana gerek yok, yeni şifreyle giriş yapabilirsin.`);
    db.close();
})().catch((e) => { console.error('[HATA]', e.message); process.exit(1); });
