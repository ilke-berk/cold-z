# ColdChain AI — Soğuk Zincir İade Otomasyon Sistemi

Eczaneden iade edilen soğuk zincir ilaçlarının sıcaklık kayıtlarını (Excel/CSV, dijital veya taranmış PDF, fotoğraf) okuyup **MKT** (ortalama kinetik sıcaklık), **TOR** (buzdolabı dışı süre) ve sapma analiziyle kabul / şartlı / revize / red kararı üreten, TİTCK İyi Dağıtım Uygulamaları (GDP) odaklı masaüstü uygulaması. Tek makinede çalışır: yerel Node sunucusu + Electron penceresi (veya tarayıcı).

## Hızlı başlangıç

```bash
npm ci               # bağımlılıklar (sqlite3 native modülü derlenir; Windows'ta VS Build Tools + Python gerekir)
npm start            # arayüzü derler, sunucuyu başlatır → http://localhost:3000
npm run app          # aynı şey, Electron penceresinde
```

İlk açılışta giriş ekranı **İlk kurulum** moduna geçer ve ilk yönetici hesabını oluşturur. Yapay zeka (OCR) için Gemini API anahtarı **Ayarlar › Yapay Zeka** ekranından girilir; `.env` dosyasını elle düzenlemek gerekmez. Anahtar olmadan da uygulama açılır: Excel/CSV ve daha önce öğrenilmiş PDF şablonları AI'sız çözülür, yalnızca taranmış belgeler bekler.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm start` | `web/` derlemesi + sunucu (127.0.0.1:3000) |
| `npm run app` | `web/` derlemesi + Electron |
| `npm run build` | `web/` derlemesi + `electron-builder` (Windows NSIS kurulum dosyası, `dist/`) |
| `npm run build:ui` | `ui/*.jsx` → `web/ui/*.js`, kütüphaneler + fontlar → `web/vendor/` |
| `npm run dev:ui` | JSX değişince yeniden derle (geliştirme) |
| `npm test` | Birim testleri (`node --test`); flaky paralellik görürseniz `node --test --test-concurrency=1 "tests/**/*.test.js"` |

Arayüz kaynakları `ui/*.jsx` altındadır; tarayıcıda Babel yoktur, derlenmiş çıktı (`web/`) git'e girmez ve `npm start` / `npm run app` / `npm run build` öncesinde otomatik üretilir. Hiçbir CDN bağımlılığı yoktur; uygulama internetsiz açılır.

## Mimari

```
Excel/CSV ─┐                                   ┌─ güven ≥ eşik → otomatik
PDF (metin)┼─► js/data-parser + smart-parser ─► IR ─► js/confidence ─┤
Tarama/foto┘   (gerekirse /api/extract → Gemini OCR)                └─ düşük güven → insan onayı (HITL)
                                                       │
                       js/mkt-engine (zaman ağırlıklı MKT, TOR, sapma sınıfları)
                       js/decision-engine (kabul / şartlı / revize / red)
                                                       │
                       rapor · sertifika · Excel  ·  SQLite (analyses, analysis_readings, format_templates, audit_log, users)
```

- **Sunucu** `server.js` (Express): OCR/şema keşfi/satır doğrulama (Gemini), ayarlar (`.env`), şablon hafızası, denetim izi, kullanıcılar, KVKK silme/temizlik, yedekleme. Yalnızca `127.0.0.1`'e bağlanır (`HOST` ile değiştirilebilir), CSP + aynı köken.
- **Kimlik** `auth.js`: scrypt şifre, HttpOnly çerez oturumu, roller `admin` (ayarlar, şablon silme, kullanıcılar) ve `qa` (analiz, onay, rapor). 5 başarısız giriş → 15 dk kilit.
- **Veri** `database.js` (SQLite): `coldchain.db`. Denetim izi HMAC-SHA256 hash zinciri; imza anahtarı `audit.key`, zincir başı `audit.head.json` (DB'den ayrı).
- **Motorlar** `js/`: hem tarayıcıda hem Node testlerinde çalışan saf modüller (`mkt-engine`, `decision-engine`, `data-parser`, `smart-parser`, `confidence`, `format-fingerprint`, `evidence-check`).
- **Arayüz** `ui/`: React (Kontrol Odası). Sayfalar `cr-*.jsx`, kabuk `dir-controlroom.jsx`, akış `cc-pipeline.js`, yerel ayarlar `cc-settings.js`.

Ayrıntılı tasarım kararları ve faz geçmişi: [GELISTIRME-RAPORU.md](GELISTIRME-RAPORU.md).

## Veri konumları

| Ortam | Konum |
|---|---|
| Geliştirme (`npm start`) | proje kökü: `coldchain.db`, `.env`, `audit.key`, `audit.head.json`, `backups/` |
| Paketli kurulum (Electron) | `%APPDATA%\coldchain-ai\` altında aynı dosyalar |

**Yedekleme:** Ayarlar › Veri Bütünlüğü › *Şimdi yedekle* veya günlük otomatik (`BACKUP_AUTO=0` kapatır, `BACKUP_KEEP` tutulan sayı). Yedek klasörü: `backups/<zaman damgası>/` içinde `coldchain.db` (tutarlı anlık görüntü), `audit.key`, `audit.head.json`, `MANIFEST.json`. **Geri yükleme:** uygulamayı kapatın, bu üç dosyayı veri konumuna kopyalayın. `.env` yedeğe girmez; API anahtarı yeniden girilir.

**KVKK:** Veri yerelde kalır. Yalnızca taranmış PDF/fotoğraf ve tanınmayan PDF formatlarında belge *görüntüsü* OCR için Google Gemini API'ye gider; kullanıcı ilk analizden önce bunu bir kez onaylar. Saklama süresi (`RETENTION_DAYS`, Ayarlar) aşılınca analizler otomatik silinir; her kayıt yönetici tarafından tek tek silinebilir. Denetim izi silinmez.

## Ortam değişkenleri

`.env.example` dosyasına bakın. Ayarlar ekranı `GEMINI_API_KEY`, `GEMINI_MODEL`, fiyat/kur, `EXTRACT_CONCURRENCY` ve `RETENTION_DAYS` değerlerini sizin için yazar. Elle: `PORT`, `HOST`, `GEMINI_TIMEOUT_MS`, `BACKUP_AUTO`, `BACKUP_KEEP`.

## Gereksinimler

- Node.js 22.x (testler `--test` glob desteği ister)
- Windows paketleme: `npm run build` (NSIS). Proje kökünde `.env` varsa `scripts/after-pack.js` onu `resources/seed.env` olarak pakete ekler; paketli ilk açılışta `userData/.env` yoksa oraya kopyalanır (alıcı API anahtarı girmez; `KURULUM.txt` alıcıya verilir). CI'da `.env` olmadığı için tohum eklenmez.
- Paketlerken `npm start` ile çalışan geliştirme sunucusunu kapatın: sqlite3 ikilisini kilitler (EPERM). Paketleme node_modules içindeki sqlite3'ü Electron ABI'sine derler; sonra `npm start` için `npm rebuild sqlite3` gerekir. CI, her push'ta Windows'ta paketlemeyi prova eder (`.github/workflows/test.yml`).

## Lisans

ISC. Fontlar (Space Grotesk, JetBrains Mono) SIL OFL; kütüphane sürümleri `web/vendor/VERSIONS.json`.
