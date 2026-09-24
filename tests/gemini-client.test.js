const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { toParts, GeminiClient } = require('../gemini-client.js');

describe('gemini-client — içerik parçaları ve sarmalayıcı yüzeyi', () => {
    test('metin + inlineData parçaları yeni SDK biçimine çevrilir', () => {
        const parts = toParts(['merhaba', { inlineData: { data: 'AAAA', mimeType: 'image/png' } }]);
        assert.deepEqual(parts, [{ text: 'merhaba' }, { inlineData: { data: 'AAAA', mimeType: 'image/png' } }]);
        assert.deepEqual(toParts('tek'), [{ text: 'tek' }]);
        assert.throws(() => toParts([{ foo: 1 }]), /Desteklenmeyen/);
    });

    test('anahtar yoksa hata; getGenerativeModel eski yüzeyi verir', () => {
        assert.throws(() => new GeminiClient(''), /anahtar/);
        const c = new GeminiClient('test-key-test-key-1234', { timeout: 5000 });
        const m = c.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0 } });
        assert.equal(m.model, 'gemini-2.5-flash');
        assert.equal(typeof m.generateContent, 'function');
    });

    test('generateContent yanıtı text()/usageMetadata/candidates ile normalize eder (sahte SDK)', async () => {
        const c = new GeminiClient('test-key-test-key-1234');
        let captured = null;
        c.ai = { models: { generateContent: async (req) => { captured = req; return { text: 'sonuç', usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 }, candidates: [{ finishReason: 'STOP' }] }; } } };
        const m = c.getGenerativeModel({ model: 'x', generationConfig: { maxOutputTokens: 5, responseMimeType: 'application/json' } });
        const { response } = await m.generateContent(['soru', { inlineData: { data: 'Zg==', mimeType: 'application/pdf' } }]);
        assert.equal(response.text(), 'sonuç');
        assert.equal(response.usageMetadata.promptTokenCount, 3);
        assert.equal(response.candidates[0].finishReason, 'STOP');
        assert.equal(captured.model, 'x');
        assert.equal(captured.config.maxOutputTokens, 5);
        assert.equal(captured.config.responseMimeType, 'application/json');
        assert.equal(captured.contents[0].parts.length, 2);
    });

    test('text getter yoksa parçalar birleştirilir', async () => {
        const c = new GeminiClient('test-key-test-key-1234');
        c.ai = { models: { generateContent: async () => ({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }) } };
        const { response } = await c.getGenerativeModel({ model: 'x' }).generateContent('q');
        assert.equal(response.text(), 'ab');
    });
});
