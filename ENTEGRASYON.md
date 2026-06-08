# 🧊 ColdChain AI — Kontrol Odası Entegrasyonu

Yeni "Kontrol Odası" arayüzü artık **gerçek backend'e bağlı**. Demo verisiyle değil,
yüklediğiniz dosyalardan çıkan gerçek ölçümlerle MKT/TOR hesaplar ve KABUL/RED/REVİZE kararı üretir.

## Çalıştırma

```bash
npm install
cp .env.example .env        # sonra GEMINI_API_KEY'i girin
npm start                   # http://localhost:3000
```

- **Yeni arayüz (Kontrol Odası):**  http://localhost:3000/  → açılışta gelir
- **Eski klasik arayüz:**           http://localhost:3000/index.html

> Giriş: `elif.aydin@coldchain.ai` / `coldchain` (login ekranındaki "Otomatik doldur").

## Ne değişti — veri akışı

```
Veri Yükleme ekranı
   │  dosya (PDF / Excel / CSV / görsel)
   ▼
DataParser.parse → (PDF/görsel ise) /api/extract  (Gemini OCR, backend)
   ▼
MKTEngine.fullAnalysis   →  MKT, TOR, sapmalar, doğrulama
   ▼
DecisionEngine.evaluate  →  KABUL / RED / REVİZE  (TİTCK GDP + anti-fraud)
   ▼
CCStore  (sonuç burada saklanır, sayfa yenilense de kalır)
   ▼
Analiz & Karar  +  Rapor ekranları   ← gerçek sonucu okur
   ▼
"Sisteme Kaydet"  → /api/save-analysis (SQLite) + /api/audit (hash zinciri)
   ▼
Kontrol Paneli   ← /api/recent-analyses + /api/stats (canlı kayıtlar)
```

## Eklenen / değişen dosyalar

| Dosya | Rol |
|---|---|
| `app.html` | Yeni arayüzün giriş noktası (motorlar + UI'yi doğru sırada yükler) |
| `ui/` | Kontrol Odası React arayüzü (eski `redesign/` klasörünün taşınmış hâli) |
| `ui/cc-pipeline.js` | **Köprü**: dosya → motorlar → karar; API çağrıları (/api/extract, save, audit) |
| `ui/cc-store.js` | Analiz sonucu deposu (ekranlar arası paylaşım, localStorage) |
| `server.js` | Kök adres artık `app.html`'i sunuyor (eski UI `/index.html`'de) |
| `js/ai-vision.js` | Sabit `localhost:3000` yerine relative URL (port bağımsız) |

> Motor çekirdeği (`js/utils.js`, `js/mkt-engine.js`, `js/decision-engine.js`,
> `js/data-parser.js`, `js/smart-parser.js`, `js/ai-vision.js`, `js/drug-formulary.js`)
> **değiştirilmedi** — yeni arayüz bunları aynen kullanıyor. Yani iki arayüz de
> birebir aynı kararı verir.

## Demo ↔ Gerçek davranışı

- **Kontrol Paneli:** DB'de kayıt varsa onları gösterir ("CANLI" rozeti); boşsa/sunucu
  kapalıysa demo veriye düşer.
- **Analiz & Rapor:** Bir analiz yaptıysanız gerçek sonucu ("● GERÇEK ANALİZ"); yoksa
  demo senaryo seçicisini ("DEMO VERİSİ") gösterir.

## Sık karşılaşılan

- **"Analiz başarısız" / extract hatası:** Sunucu açık mı? `.env` içinde `GEMINI_API_KEY` var mı?
- **PDF/görsel yavaş:** Gemini OCR backend'de çalışıyor, ilk istek birkaç saniye sürebilir.
- **Excel/CSV:** OCR'a gitmez, tarayıcıda hızlıca ayrıştırılır.
