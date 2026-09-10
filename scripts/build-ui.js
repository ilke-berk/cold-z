#!/usr/bin/env node
/**
 * ColdChain AI — Arayüz derleme betiği (Faz 10: çevrimdışı arayüz)
 *
 * İki iş yapar, ikisi de node_modules'tan `web/` altına ÇIKTI üretir
 * (web/ git'e girmez; `npm start`, `npm run app` ve `npm run build`
 * öncesinde otomatik koşar):
 *
 *   1. Üçüncü taraf kütüphaneleri yerelleştirir  → web/vendor/
 *      React, ReactDOM (production UMD), SheetJS (xlsx), pdf.js (+worker),
 *      Space Grotesk / JetBrains Mono fontları (latin + latin-ext, woff2).
 *      Böylece arayüz CDN'e (unpkg, jsdelivr, Google Fonts) bağımlı değildir;
 *      internetsiz / proxy arkasındaki eczane bilgisayarında da açılır.
 *
 *   2. ui/*.jsx dosyalarını bir kez derler          → web/ui/*.js
 *      Tarayıcıda @babel/standalone ile her açılışta derleme kalkar
 *      (3 MB indirme + saniyeler süren derleme yerine hazır JS).
 *
 * Kullanım:
 *   node scripts/build-ui.js            tek sefer derle
 *   node scripts/build-ui.js --watch    ui/ değişince yeniden derle (geliştirme)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'web');
const OUT_VENDOR = path.join(OUT, 'vendor');
const OUT_FONTS = path.join(OUT_VENDOR, 'fonts');
const OUT_UI = path.join(OUT, 'ui');
const UI_SRC = path.join(ROOT, 'ui');

// [node_modules içindeki kaynak, web/vendor içindeki hedef adı]
const VENDOR = [
    ['react/umd/react.production.min.js', 'react.min.js'],
    ['react-dom/umd/react-dom.production.min.js', 'react-dom.min.js'],
    ['xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js'],
    ['pdfjs-dist/build/pdf.min.js', 'pdf.min.js'],
    ['pdfjs-dist/build/pdf.worker.min.js', 'pdf.worker.min.js'],
];

// [paket, dosya öneki, ağırlıklar]
const FONTS = [
    ['@fontsource/space-grotesk', 'space-grotesk', [400, 500, 600, 700]],
    ['@fontsource/jetbrains-mono', 'jetbrains-mono', [400, 500, 600]],
];
const FONT_SUBSETS = ['latin', 'latin-ext']; // Türkçe karakterler latin-ext'te

function log(msg) { process.stdout.write(`[build-ui] ${msg}\n`); }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function pkgVersion(name) {
    try { return JSON.parse(fs.readFileSync(path.join(NM, name, 'package.json'), 'utf8')).version; }
    catch (e) { return null; }
}

function vendor() {
    ensureDir(OUT_VENDOR);
    const versions = {};
    for (const [src, dst] of VENDOR) {
        const from = path.join(NM, src);
        if (!fs.existsSync(from)) throw new Error(`Kütüphane bulunamadı: ${src} — önce "npm install" çalıştırın.`);
        fs.copyFileSync(from, path.join(OUT_VENDOR, dst));
        const pkg = src.split('/')[0];
        versions[pkg] = pkgVersion(pkg);
    }

    // Fontlar: fontsource CSS'lerini tek fonts.css'te birleştir, yolları yeniden yaz
    ensureDir(OUT_FONTS);
    let css = '/* Yerel fontlar — scripts/build-ui.js tarafından üretildi (OFL lisanslı) */\n';
    for (const [pkg, prefix, weights] of FONTS) {
        const base = path.join(NM, pkg);
        if (!fs.existsSync(base)) throw new Error(`Font paketi bulunamadı: ${pkg} — önce "npm install" çalıştırın.`);
        versions[pkg] = pkgVersion(pkg);
        for (const w of weights) {
            for (const subset of FONT_SUBSETS) {
                const cssFile = path.join(base, `${subset}-${w}.css`);
                if (!fs.existsSync(cssFile)) continue;
                css += fs.readFileSync(cssFile, 'utf8').replace(/url\(\.\/files\//g, 'url(./fonts/') + '\n';
                const woff2 = `${prefix}-${subset}-${w}-normal.woff2`;
                const from = path.join(base, 'files', woff2);
                if (fs.existsSync(from)) fs.copyFileSync(from, path.join(OUT_FONTS, woff2));
            }
        }
    }
    fs.writeFileSync(path.join(OUT_VENDOR, 'fonts.css'), css);
    fs.writeFileSync(path.join(OUT_VENDOR, 'VERSIONS.json'), JSON.stringify(versions, null, 2) + '\n');

    // Tek sürüm kaynağı: package.json → web/version.js (arayüz window.CC_VERSION okur)
    const appVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    fs.writeFileSync(path.join(OUT, 'version.js'), `window.CC_VERSION = ${JSON.stringify(appVersion)};\n`);
    versions.app = appVersion;
    log(`vendor: ${VENDOR.length} kütüphane + fontlar → web/vendor (${Object.entries(versions).map(([k, v]) => `${k}@${v}`).join(', ')})`);
}

let babel = null;
function compileOne(file) {
    if (!babel) babel = require('@babel/core');
    const src = path.join(UI_SRC, file);
    const out = path.join(OUT_UI, file.replace(/\.jsx$/, '.js'));
    const code = fs.readFileSync(src, 'utf8');
    const res = babel.transformSync(code, {
        filename: src,
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-react', { runtime: 'classic' }]],
        sourceMaps: 'inline',
        sourceFileName: `../../ui/${file}`,
        compact: false,
        retainLines: true,
    });
    fs.writeFileSync(out, res.code);
}

function compileAll() {
    ensureDir(OUT_UI);
    const files = fs.readdirSync(UI_SRC).filter(f => f.endsWith('.jsx')).sort();
    for (const f of files) compileOne(f);
    // Eski derlenmiş çıktılar (silinmiş jsx) temizlensin
    for (const f of fs.readdirSync(OUT_UI)) {
        if (f.endsWith('.js') && !files.includes(f.replace(/\.js$/, '.jsx'))) fs.unlinkSync(path.join(OUT_UI, f));
    }
    log(`jsx: ${files.length} dosya derlendi → web/ui`);
    return files;
}

function main() {
    const watch = process.argv.includes('--watch');
    const t0 = Date.now();
    vendor();
    compileAll();
    log(`tamam (${Date.now() - t0} ms)`);

    if (!watch) return;
    log('izleniyor: ui/*.jsx (Ctrl+C ile çık)');
    let timer = null;
    fs.watch(UI_SRC, (evt, name) => {
        if (!name || !name.endsWith('.jsx')) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                if (fs.existsSync(path.join(UI_SRC, name))) { compileOne(name); log(`yeniden derlendi: ${name}`); }
                else compileAll();
            } catch (e) { log(`HATA ${name}: ${e.message}`); }
        }, 120);
    });
}

try { main(); }
catch (e) { process.stderr.write(`[build-ui] HATA: ${e.message}\n`); process.exit(1); }
