/**
 * ColdChain AI — PDF İşleme Yardımcısı (Backend)
 * 
 * Büyük PDF dosyalarını yönetilebilir parçalara böler.
 * Bu sayede Gemini API'nin çıktı karakter limitine (token limit) takılmayız.
 * 
 * Overlap (örtüşme) mantığı:
 * - Her parçanın son sayfası, bir sonraki parçanın ilk sayfası olarak tekrarlanır
 * - Bu sayede sayfa geçişlerindeki veriler kaybolmaz
 * - Dedup mekanizması backend'de bu tekrarlı veriyi temizler
 */

const { PDFDocument } = require('pdf-lib');

/**
 * Bir PDF dosyasını belirtilen sayfa sayısına göre parçalara böler.
 * 
 * @param {Buffer} pdfBuffer - Orijinal PDF dosyası (Binary)
 * @param {number} pagesPerChunk - Her bir parçada olacak maksimum sayfa sayısı
 * @param {number} overlapPages - Parçalar arası örtüşen sayfa sayısı
 * @returns {Promise<Buffer[]>} - Parçalara ayrılmış PDF buffer listesi
 * 
 * Örnek: 10 sayfa, pagesPerChunk=3, overlapPages=1
 * Parça 1: sayfa 1-3
 * Parça 2: sayfa 3-5  (sayfa 3 tekrar — overlap)
 * Parça 3: sayfa 5-7  (sayfa 5 tekrar — overlap)
 * Parça 4: sayfa 7-9  (sayfa 7 tekrar — overlap)
 * Parça 5: sayfa 9-10 (sayfa 9 tekrar — overlap)
 */
async function splitPdf(pdfBuffer, pagesPerChunk = 3, overlapPages = 1) {
    try {
        console.log(`\n📄 PDF Parçalama Başladı: ${pdfBuffer.length} bytes`);

        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pageCount = pdfDoc.getPageCount();

        console.log(`   Toplam Sayfa: ${pageCount}`);

        if (pageCount <= pagesPerChunk) {
            console.log(`   Bölme gerekmiyor (${pageCount} <= ${pagesPerChunk})`);
            return [pdfBuffer];
        }

        const chunks = [];
        // Adım boyutu = pagesPerChunk - overlap
        // Bu sayede her geçiş noktası overlap kadar sayfayla tekrarlanır
        const step = Math.max(1, pagesPerChunk - overlapPages);

        for (let start = 0; start < pageCount; start += step) {
            const end = Math.min(start + pagesPerChunk, pageCount);
            const newPdf = await PDFDocument.create();

            // Sayfaları kopyala
            const pageIndices = [];
            for (let p = start; p < end; p++) {
                pageIndices.push(p);
            }

            const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
            copiedPages.forEach(page => newPdf.addPage(page));

            const chunkBuffer = await newPdf.save();
            chunks.push(Buffer.from(chunkBuffer));

            console.log(`   Parça ${chunks.length}: Sayfalar ${start + 1}-${end} (${end - start} sayfa)`);

            // Eğer bu parça son sayfaya ulaştıysa dur
            if (end >= pageCount) break;
        }

        console.log(`✅ PDF ${chunks.length} parçaya bölündü.\n`);
        return chunks;

    } catch (error) {
        console.error('❌ PDF bölme hatası:', error.message);
        // Hata durumunda orijinali döndür ki süreç tamamen çökmesin
        return [pdfBuffer];
    }
}

module.exports = { splitPdf };
