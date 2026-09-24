/**
 * ColdChain AI — Gemini istemci sarmalayıcısı (Faz 14)
 *
 * Kullanımdan kaldırılan @google/generative-ai yerine resmi @google/genai SDK'sı.
 * server.js'in kullandığı küçük yüzey korunur, böylece çağrı noktaları değişmez:
 *
 *   const client = new GeminiClient(apiKey, { timeout: 180000 });
 *   const model  = client.getGenerativeModel({ model, generationConfig });
 *   const { response } = await model.generateContent([promptText, { inlineData: { data, mimeType } }]);
 *   response.text()              // birleştirilmiş metin
 *   response.usageMetadata       // { promptTokenCount, candidatesTokenCount, totalTokenCount }
 *   response.candidates[0].finishReason
 *
 * generationConfig anahtarları (maxOutputTokens, temperature, responseMimeType,
 * responseSchema) yeni SDK'nın `config` alanıyla birebir aynı adlardadır.
 */
const { GoogleGenAI } = require('@google/genai');

function toParts(input) {
    const arr = Array.isArray(input) ? input : [input];
    return arr.map(p => {
        if (typeof p === 'string') return { text: p };
        if (p && p.text !== undefined) return { text: String(p.text) };
        if (p && p.inlineData) return { inlineData: { data: p.inlineData.data, mimeType: p.inlineData.mimeType } };
        throw new Error('Desteklenmeyen içerik parçası');
    });
}

class GeminiClient {
    constructor(apiKey, opts = {}) {
        if (!apiKey) throw new Error('API anahtarı gerekli');
        const timeout = Math.max(1000, Number(opts.timeout) || 180000);
        this.ai = new GoogleGenAI({ apiKey, httpOptions: { timeout } });
    }

    getGenerativeModel({ model, generationConfig = {} } = {}) {
        const ai = this.ai;
        const modelName = model;
        return {
            model: modelName,
            async generateContent(input) {
                const resp = await ai.models.generateContent({
                    model: modelName,
                    contents: [{ role: 'user', parts: toParts(input) }],
                    config: { ...generationConfig },
                });
                const text = () => {
                    // resp.text birleştirilmiş metin getter'ı; yoksa parçaları elle birleştir
                    if (typeof resp.text === 'string') return resp.text;
                    const parts = resp.candidates?.[0]?.content?.parts || [];
                    return parts.map(p => p.text || '').join('');
                };
                return {
                    response: {
                        text,
                        usageMetadata: resp.usageMetadata || {},
                        candidates: resp.candidates || [],
                        raw: resp,
                    }
                };
            }
        };
    }
}

module.exports = { GeminiClient, toParts };
