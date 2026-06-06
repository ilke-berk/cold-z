const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const Canvas = require('canvas');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const XLSX = require('xlsx'); // Faz 4 için gerekli
require('dotenv').config();

// Gemini Kurulumu
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const MODEL_NAME = process.env.OCR_GEMINI_MODEL || 'gemini-2.0-flash';

// Node.js ortamında render için Canvas fabrikası
function NodeCanvasFactory() { }
NodeCanvasFactory.prototype = {
    create: (w, h) => { 
        const c = Canvas.createCanvas(w, h); 
        return { canvas: c, context: c.getContext('2d') }; 
    },
    reset: (cc, w, h) => { cc.canvas.width = w; cc.canvas.height = h; },
    destroy: (cc) => { cc.canvas.width = 0; cc.canvas.height = 0; }
};

const STANDARD_FONTS_PATH = path.join(__dirname, 'node_modules', 'pdfjs-dist', 'standard_fonts');

/**
 * Faz 1: PDF dosyasını yüksek çözünürlüklü görsellere çevirir.
 */
async function pdfToImages(pdfPath, outputDir) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({
        data,
        verbosity: 0,
        standardFontDataUrl: STANDARD_FONTS_PATH + path.sep,
        canvasFactory: new NodeCanvasFactory(),
        disableFontFace: true 
    });

    const pdf = await loadingTask.promise;
    const images = [];

    console.log(`\n📸 [Faz 1] PDF İşleniyor: ${pdf.numPages} sayfa bulundu.`);

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        // 🚀 300 DPI için 4.0x ölçekleme
        const viewport = page.getViewport({ scale: 4.0 }); 
        const canvasFactory = new NodeCanvasFactory();
        const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
        
        const renderContext = {
            canvasContext: canvasAndContext.context,
            viewport: viewport,
            canvasFactory: canvasFactory,
        };

        await page.render(renderContext).promise;

        const fileName = `page_${i.toString().padStart(3, '0')}.png`;
        const filePath = path.join(outputDir, fileName);
        const buffer = canvasAndContext.canvas.toBuffer('image/png');
        
        fs.writeFileSync(filePath, buffer);

        images.push({
            pageNumber: i,
            base64: buffer.toString('base64'),
            mimeType: 'image/png',
            path: filePath
        });

        console.log(`   ✅ Sayfa ${i} hazırlandı: ${fileName}`);
    }

    return images;
}

/**
 * Faz 2: Gemini Vision ile tablodan veri çıkarır.
 */
async function extractTableWithGemini(imageData) {
    if (!genAI) throw new Error("GEMINI_API_KEY .env dosyasında bulunamadı!");

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `Bu görsel bir 'Soğuk Zincir Isı Takip Formu'dur. 
Tabloyu analiz et ve içindeki verileri SADECE aşağıdaki JSON formatında döndür. 
Başka hiçbir metin veya açıklama ekleme.

Format:
[
  {
    "date": "GG/AA/YYYY",
    "time": "SS:DD",
    "fridgeTemp": 4.5,
    "ambientTemp": 22.1
  }
]

Kurallar:
1. 'fridgeTemp' (dolap sıcaklığı) 2-8°C civarında olan değerdir.
2. 'ambientTemp' (ortam sıcaklığı) varsa çıkar, yoksa null yap.
3. Yanlızca sayısal değerleri çıkar (°C sembolünü ekleme).
4. Tarih ve saati standart formatta (GG/AA/YYYY ve SS:DD) tut.`;

    try {
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: imageData.base64, mimeType: imageData.mimeType } },
        ]);

        const response = await result.response;
        const text = response.text().replace(/```json|```/g, '').trim();
        
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("❌ JSON Parse Hatası:", text);
            return null;
        }

    } catch (err) {
        if (err.message.includes('429')) {
            const waitTime = Math.floor(Math.random() * 3000) + 2000; // 2-5 sn arası rasgele bekle (çakışmayı önler)
            console.log(`⏳ Rate limit (429)! ${waitTime}ms bekleniyor ve tekrar deneniyor...`);
            await new Promise(r => setTimeout(r, waitTime));
            return extractTableWithGemini(imageData); 
        }
        throw err;
    }
}

/**
 * Faz 4: Verileri CSV olarak kaydeder (test-new.js ile tam uyumlu formatta)
 */
function saveToCSV(allData, pdfPath) {
    if (!allData.length) return null;

    const hasAmb = allData.some(r => r.ambientTemp != null);
    const header = hasAmb
        ? 'Tarih,Saat,Dolap Sıcaklığı (°C),Ortam Sıcaklığı (°C),Kaynak'
        : 'Tarih,Saat,Dolap Sıcaklığı (°C),Kaynak';

    const rows = allData.map(r => {
        const f = r.fridgeTemp != null ? r.fridgeTemp.toFixed(2) : '';
        const a = r.ambientTemp != null ? r.ambientTemp.toFixed(2) : '';
        const source = 'Gemini OCR';
        return hasAmb
            ? `${r.date},${r.time},${f},${a},${source}`
            : `${r.date},${r.time},${f},${source}`;
    });

    const outPath = pdfPath.replace(/\.[^.]+$/, '_output.csv');
    fs.writeFileSync(outPath, '\uFEFF' + [header, ...rows].join('\n'), 'utf8'); // BOM: Excel/CSV uyumu
    return outPath;
}

module.exports = { pdfToImages, extractTableWithGemini, saveToCSV };
