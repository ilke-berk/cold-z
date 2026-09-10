const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { upsertEnv } = require('../server.js');
const { loadBrowserModules } = require('./helpers/load-browser-module');

describe('upsertEnv — .env birleştirme (Ayarlar ekranı)', () => {
    test('boş dosyaya anahtar ekler', () => {
        assert.equal(upsertEnv('', { GEMINI_API_KEY: 'abc' }), 'GEMINI_API_KEY=abc\n');
    });

    test('mevcut anahtarı yerinde günceller, yorum ve diğer satırları korur', () => {
        const src = '# ColdChain\nGEMINI_API_KEY=old\nPORT=3000\n';
        const out = upsertEnv(src, { GEMINI_API_KEY: 'new' });
        assert.equal(out, '# ColdChain\nGEMINI_API_KEY=new\nPORT=3000\n');
    });

    test('null değer satırı siler (varsayılana dön)', () => {
        const out = upsertEnv('A=1\nPRICE_INPUT_PER_M=0.3\nB=2\n', { PRICE_INPUT_PER_M: null });
        assert.equal(out, 'A=1\nB=2\n');
    });

    test('CRLF dosyayı da işler, olmayan anahtarı sona ekler', () => {
        const out = upsertEnv('A=1\r\n# yorum\r\n', { GEMINI_MODEL: 'gemini-2.5-flash' });
        assert.equal(out, 'A=1\n# yorum\nGEMINI_MODEL=gemini-2.5-flash\n');
    });

    test('yorumlu # PRICE_INPUT_PER_M=… satırı anahtar sayılmaz', () => {
        const out = upsertEnv('# PRICE_INPUT_PER_M=0.10\n', { PRICE_INPUT_PER_M: '0.5' });
        assert.equal(out, '# PRICE_INPUT_PER_M=0.10\nPRICE_INPUT_PER_M=0.5\n');
    });

    test('export ön eki olan satırı da tanır', () => {
        const out = upsertEnv('export USD_TRY_RATE=39\n', { USD_TRY_RATE: '41' });
        assert.equal(out, 'USD_TRY_RATE=41\n');
    });
});

describe('retentionCutoffISO — KVKK saklama süresi kesimi (Faz 13)', () => {
    const { retentionCutoffISO } = require('../database.js');
    test('0 / geçersiz → null (sınırsız); N gün → N gün öncesi ISO', () => {
        assert.equal(retentionCutoffISO(0), null);
        assert.equal(retentionCutoffISO('abc'), null);
        assert.equal(retentionCutoffISO(-3), null);
        const now = Date.UTC(2026, 8, 10, 12, 0, 0);
        assert.equal(retentionCutoffISO(30, now), '2026-08-11T12:00:00.000Z');
        assert.equal(retentionCutoffISO('1', now), '2026-09-09T12:00:00.000Z');
    });
});

describe('CCSettings — yerel analiz ayarları', () => {
    const store = {};
    const { CCSettings } = (() => {
        const mods = loadBrowserModules(['../ui/cc-settings.js'], ['CCSettings']);
        return mods;
    })();
    // loadBrowserModules window/localStorage sağlamaz; modül window.CCSettings'e yazar.
    // Bu testte modül global'e atanmadıysa window objesinden alınır.
    const S = CCSettings || null;

    test('modül yüklenir', () => { assert.ok(S, 'CCSettings tanımlı olmalı'); });

    test('sanitize: geçersiz aralık varsayılana döner, ΔH sınırlanır', () => {
        const o = S.sanitize({ lo: 10, hi: 2, dH: 9999, tor: -5, maxInterval: 0 });
        assert.equal(o.lo, 2); assert.equal(o.hi, 8); assert.equal(o.range, 'cold');
        assert.equal(o.dH, 83.144); assert.equal(o.tor, 0); assert.equal(o.maxInterval, 1);
    });

    test('engineConfig: kJ/mol → J/mol, alanlar motor adlarıyla', () => {
        const c = S.engineConfig({ lo: -25, hi: -15, tor: 90, maxInterval: 30, dH: 83.144, range: 'frozen' });
        // vm context'ten gelen nesnenin prototipi farklı — yapısal karşılaştırma için JSON'a indir
        assert.deepEqual(JSON.parse(JSON.stringify(c)), { lowerLimit: -25, upperLimit: -15, torLimit: 90, maxIntervalMinutes: 30, activationEnergy: 83144 });
    });
});

describe('DecisionEngine — azami kayıt aralığı ayardan', () => {
    const { DecisionEngine } = loadBrowserModules(['utils.js', 'decision-engine.js'], ['Utils', 'DecisionEngine']);
    const base = (cfg) => ({
        compliance: { status: 'pass', redReasons: [], conditionalReasons: [], checks: [] },
        mkt: { stdDev: 0.8, mkt: 5.5 }, dataPoints: 96, metadata: {},
        validation: { gaps: [], hasCriticalGap: false, isFrequencyIssue: false, mostCommonGapMin: 90, avgGapMin: 90 },
        timespan: { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-02T00:00:00Z') },
        userRange: null, config: cfg,
    });
    test('90 dk aralık: varsayılan 60 dk sınırında REVİZE, 120 dk sınırında accept', () => {
        assert.equal(DecisionEngine.evaluate(base({})).decision, 'revize');
        assert.equal(DecisionEngine.evaluate(base({ maxIntervalMinutes: 120 })).decision, 'accept');
    });
});
