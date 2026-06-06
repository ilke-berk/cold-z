const fs = require('fs');
const path = require('path');
const { pdfToImages, extractTableWithGemini, saveToCSV } = require('./vision-helper');
// 'test-new.js' içindeki bazı fonksiyonları buradan referans alacak şekilde kurgulayacağız.
// Ancak daha temiz bir yapı için ana mantığı buraya entegre ediyoruz.

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const Canvas = require('canvas');

/**
 * PDF'den Metin Çekmeyi Dener (Sistem 1: Hızlı Yol)
 */
async function tryTextExtraction(pdfPath) {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdf = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
    let textLines = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        if (pageText.trim()) textLines.push(pageText);
    }
    return textLines;
}

/**
 * ANA GİRİŞ NOKTASI (CLI)
 */
async function main() {
    const inputPath = process.argv[2];
    
    if (!inputPath) {
        console.log("\n🚀 SOĞUK ZİNCİR AKILLI PARSER v1.0");
        console.log("-----------------------------------");
        console.log("Kullanım: node coldchain-parser.js <dosya_yolu.pdf>");
        return;
    }

    const fullPath = path.resolve(inputPath);
    if (!fs.existsSync(fullPath)) {
        console.error("❌ Hata: Dosya bulunamadı.");
        return;
    }

    console.log(`\n🔍 İşlem Başlatılıyor: ${path.basename(fullPath)}`);

    try {
        // --- ADIM 1: Metin Taramayı Dene (Ucuz & Hızlı) ---
        console.log("⚡ Adım 1: Hızlı Metin Taraması Yapılıyor...");
        const textData = await tryTextExtraction(fullPath);
        
        // Eğer 5'ten az satır metin gelirse, dosya muhtemelen taranmış bir resimdir.
        const isScanned = textData.length < 5 || textData.join('').length < 100;

        if (!isScanned) {
            console.log("✅ Metin verisi bulundu! test-new.js mantığı ile işleniyor...");
            console.log("ℹ️  Bu dosya text tabanlı, hızlı motorla tamamlanacaktır.");
            
            const { startReading } = require('./test-new');
            await startReading(fullPath);
            
            console.log(`\n🎊 İŞLEM TAMAMLANDI! (Hızlı Motor)`);
        } else {
            // --- ADIM 2: Gemini Vision Fallback (Akıllı & Kesin) ---
            console.log("⚠️  Metin bulunamadı veya yetersiz! (Scanned PDF detected)");
            console.log("🤖 Adım 2: Gemini Vision Fallback Devreye Giriyor...");
            
            const tempDir = path.join(__dirname, 'temp_ocr_workdir');
            const images = await pdfToImages(fullPath, tempDir);
            
            const finalizedData = [];
            const PARALLEL_LIMIT = parseInt(process.env.OCR_PARALLEL_LIMIT) || 5; 

            for (let i = 0; i < images.length; i += PARALLEL_LIMIT) {
                const chunk = images.slice(i, i + PARALLEL_LIMIT);
                console.log(`📡 Sayfalar (${chunk.map(img => img.pageNumber).join(', ')}) AI tarafından asenkron olarak okunuyor...`);
                
                // Bu gruptaki sayfaları aynı anda AI'a gönderiyoruz
                const results = await Promise.all(chunk.map(img => extractTableWithGemini(img)));
                
                results.forEach(data => {
                    if (data) finalizedData.push(...data);
                });
            }

            if (finalizedData.length > 0) {
                console.log(`📊 Toplam ${finalizedData.length} satır veri başarıyla çekildi.`);
                const csvPath = saveToCSV(finalizedData, fullPath);
                console.log(`\n🎊 İŞLEM TAMAMLANDI!`);
                console.log(`💾 Sonuç Dosyası: ${path.basename(csvPath)}`);
            } else {
                console.log("❌ Üzgünüm, AI bu belgeden veri çıkaramadı.");
            }

            // Temizlik (opsiyonel)
            // fs.rmSync(tempDir, { recursive: true, force: true });
        }

    } catch (err) {
        console.error("❌ Kritik Hata:", err.message);
    }
}

main();
