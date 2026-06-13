/**
 * Browser-style js/ dosyalarını Node test ortamında yükleme yardımcısı.
 *
 * Kaynak dosyalar `const X = {...}` veya `var X = (function(){...})()` şeklinde
 * global tanımlıyor, hiç `module.exports` yok. Bunları üretim kodunu hiç
 * değiştirmeden Node'da çalıştırabilmek için vm context içinde execute edip
 * istenen sembolleri geri döndürüyoruz.
 */

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const JS_ROOT = path.resolve(__dirname, '..', '..', 'js');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Dosya adı '/' içeriyorsa proje köküne göre çözülür (örn. '../date-format-detector.js'
// veya 'date-format-detector.js'@root); aksi halde js/ altından okunur.
function resolveModulePath(file) {
    if (file.includes('/') || file.includes('\\')) {
        return path.resolve(PROJECT_ROOT, file.replace(/^\.\.\//, ''));
    }
    return path.join(JS_ROOT, file);
}

function loadBrowserModules(files, names) {
    const context = {
        console,
        Math,
        Date,
        JSON,
        Object,
        Array,
        Number,
        String,
        Boolean,
        Error,
        RegExp,
        Promise,
        Set,
        Map,
        crypto: require('node:crypto').webcrypto,
        TextEncoder,
        TextDecoder,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {} }) },
        window: {},
    };

    vm.createContext(context);

    for (const file of files) {
        const filePath = resolveModulePath(file);
        const source = fs.readFileSync(filePath, 'utf8');
        // Browser modülleri `const X = {...}` ile tanımlıyor; const top-level
        // vm context'in global objesine leak etmez. Her dosyadan sonra known
        // isimleri global'e itelemek için bir post-script çalıştırıyoruz.
        const exposeScript = names
            .map(n => `try { if (typeof ${n} !== 'undefined') globalThis.${n} = ${n}; } catch (e) {}`)
            .join('\n');
        vm.runInContext(source + '\n;' + exposeScript, context, { filename: filePath });
    }

    const result = {};
    for (const name of names) {
        result[name] = context[name];
    }
    return result;
}

module.exports = { loadBrowserModules };
