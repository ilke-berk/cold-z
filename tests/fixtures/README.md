# Altın Korpus (Faz 6)

Gerçek eczane logger formatlarından türetilmiş girdi→beklenen-çıktı eşlemeleri.
Parser'a dokunan her değişiklik bu korpusa karşı koşulur (`tests/corpus.test.js`);
format işinde tek güvenilir ilerleme ölçüsü uçtan-uca regresyondur.

## Yapı

- `structured/*.json` — yapısal yol (CSV/Excel). `DataParser.standardize` zincirinden
  geçirilir. Şema:
  ```
  {
    "name": "...",                  // okunabilir test adı
    "note": "...",                  // formatın nereden geldiği / neyi test ettiği
    "delimiter": ",",               // CSV ayracı (parseCSV için)
    "csv": "Tarih,Sıcaklık\n...",  // ham CSV metni
    "columnMapping": { ... },        // opsiyonel: elle eşleştirme (UI'ı taklit)
    "expected": {
      "rowCount": 5,                 // postProcess sonrası kayıt sayısı (resampling kapalı)
      "first": { "iso": "...", "temp": 4.2 },
      "last":  { "iso": "...", "temp": 5.1 },
      "dateFormat": "DMY",           // opsiyonel: beklenen tespit
      "ambiguous": false             // opsiyonel
    }
  }
  ```

- `ocr/*.json` — OCR yolu (Gemini yanıtı → parser). `responseSchema` JSON veya markdown
  tablo yanıtı `parseStructuredResponse` / `parseMarkdownResponse` + `smartDateResolve`
  zincirinden geçirilir. Şema:
  ```
  {
    "name": "...",
    "mode": "json" | "markdown",
    "response": "<modelin ham çıktısı>",
    "expected": {
      "rowCount": 60,
      "firstISO": "2026-03-01",      // smartDateResolve sonrası ilk r.date
      "dateFormat": "DMY"
    }
  }
  ```

## Yeni fixture ekleme

İnsan onayından geçen gerçek bir belge "altın" hale geldiğinde (Kademe 4 örneklemeli
QA), normalize serisini buraya bir fixture olarak ekleyin. Böylece o belge bir daha
asla sessizce bozulamaz.
