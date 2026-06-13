# ColdChain AI — Sistem Geliştirme Raporu

> Tarih: 12.06.2026 · İncelenen sürüm: v3.2-hybrid (`94ef6d7`)

## 1. Mevcut Mimarinin Özeti

Sistem şu anda **dört ayrı veri-alım yolu** üzerinden çalışıyor:

| Yol | Girdi | Mekanizma | İnsan müdahalesi |
|---|---|---|---|
| 1. Yapısal | Excel (.xlsx/.xls) | `js/data-parser.js` → başlık eşleştirme + değer puanlama | Sütun eşleştirme UI ✓ |
| 2. Metin | CSV/TXT/TSV/DAT/LOG | `js/smart-parser.js` `parseTextFile` → 4 sabit şema denemesi + regex | Yok (UI var ama etkisiz — aşağıda) |
| 3. Dijital PDF | Metin katmanlı PDF | Heuristik şablon → Gemini şema keşfi (1 sayfa) → deterministik regex hasadı | Şema düzenleme UI ✓ (kısmen etkisiz) |
| 4. Görüntü | Taranmış PDF/foto | `server.js` `/api/extract` → Gemini OCR → Markdown tablo parse | Yok |

Bu hibrit yaklaşım (önce ucuz deterministik, gerekirse AI) doğru bir mimari karar. Sorun, dört yolun **ortak bir normalizasyon katmanına inmemesi**: her yol kendi tarih çözücüsünü, kendi güven mantığını ve kendi çıktı şeklini kullanıyor.

## 2. Ana Sorunun Kök Nedeni: Dağınık Normalizasyon

"Farklı formatlardaki tabloların düzgün yorumlanması" probleminin tek bir nedeni yok; aynı işi yapan **dört ayrı, birbirinden habersiz tarih/format çözücü** var:

1. `server.js:496` `smartDateResolve` — medyan aralık + gelecek-tarih sayımı (sadece AI OCR yolu)
2. `js/utils.js:321` `resolveDateFormat` — parça varyans karşılaştırması (Excel + PDF hasadı)
3. `date-format-detector.js` — en gelişmişi (header ipucu → oylama → delta testi), ama **hiçbir yerden çağrılmıyor**, ölü kod
4. `js/data-parser.js:590` `parseDate` — satır bazlı tahmin

Aynı belge hangi yoldan girdiğine göre farklı tarih yorumu alabilir. Bu, güvenilmezliğin ana kaynağı.

### Tespit Edilen Somut Hatalar (hızlı kazanımlar)

Bunlar mimari değişiklik gerektirmeyen, doğrudan düzeltilebilir hatalar:

1. **CSV sütun eşleştirmesi sessizce yok sayılıyor.** `js/data-parser.js:28`'de `aiExtensions` listesi `csv`'yi içeriyor, bu yüzden CSV dosyaları `SmartParser.parseTextFile`'a gidiyor — ama `js/smart-parser.js:45-48`'deki metin dalı `options.columnMapping`'i hiç okumuyor. Kullanıcı UI'da sütunları özenle eşleştirse bile regex tahmini kullanılıyor. CSV, Excel ile aynı yapısal yoldan (`readCSV` → `standardize`) gitmeli; regex yalnızca gerçekten yapısız metin için kalmalı.

2. **PDF eşleştirme panelindeki "Tarih Ayracı" seçimi kozmetik.** `js/smart-parser.js:138`'de `ds = '[.,/\-\s]'` sabit kodlanmış; `schema.dateSep` regex inşasında hiç kullanılmıyor. Kullanıcı ayracı değiştirince hiçbir şey değişmiyor.

3. **Tarih formatı belirsizse varsayılan yanlış yöne düşüyor.** `server.js:558`'de eşitlik durumunda `medianA <= medianB` → p1=AY (MDY) seçiliyor. Türkiye'de belirsizlikte varsayılan **DMY** olmalı. Tüm gün değerleri ≤12 olan kısa veri setlerinde (örn. ayın ilk 12 günü) bu sessizce gün/ay takası yapar — bu alandaki en tehlikeli hata sınıfı, çünkü analiz "başarılı" görünür ama TOR/MKT tamamen yanlış pencerede hesaplanır.

4. **Tarih sütunu bulunamazsa `new Date()` (şu an) atanıyor.** `js/data-parser.js:557` — veri uydurmak yerine hata fırlatıp kullanıcıya sormalı.

5. **Excel'de yalnızca ilk sayfa okunuyor** (`js/data-parser.js:185`) ve **başlık satırının 1. satırda olduğu varsayılıyor.** Logger ihracatlarının çoğunda tablonun üstünde meta blok (cihaz adı, seri no, limitler) bulunur; başlık satırı tespiti (ilk N satırı tarayıp "başlığa en çok benzeyen" satırı seçme) eklenmeli.

6. **`cleanYearOutliers` sessizce satır siliyor** (`js/smart-parser.js:5`) — mod yıl ±1 dışındaki her şey kayboluyor, kullanıcıya bildirilmiyor. Silinen satır sayısı pipeline log'una ve güven skoruna yansımalı.

7. **`aiClaimedTotal` toplanıyor ama hiçbir karara bağlanmıyor.** `server.js:238` AI'nın "ben N satır yazdım" iddiası ile gerçekte parse edilen sayı karşılaştırılıp loglanıyor, ama fark büyükse ne yeniden deneme ne insan onayı tetikleniyor. Bu, OCR yolundaki en ucuz doğruluk sigortası.

### Durum Güncellemesi — 12.06.2026

Yukarıdaki 7 maddenin tamamı düzeltildi (Faz 1 tamam):

1. ✅ CSV/TSV artık önce yapısal yoldan (`readCSV` → `standardize`) gidiyor; `columnMapping` uygulanıyor. Yapısal okuma başarısız olursa regex tabanlı metin parser'a düşülüyor. Ek olarak Excel/CSV yolundaki eksik `await this.standardize(...)` hatası giderildi.
2. ✅ `buildParser` artık `schema.dateSep`'i regex'e bağlıyor; ayraç belirtilmemişse eski geniş sınıf korunuyor.
3. ✅ `smartDateResolve` medyan eşitliğinde (belirsizlik) artık DMY (p1=GÜN) varsayıyor ve durumu logluyor.
4. ✅ Tarih sütunu bulunamazsa `new Date()` uydurmak yerine kullanıcıyı eşleştirme paneline yönlendiren hata fırlatılıyor.
5. ✅ `readExcel` tüm sayfaları tarayıp en çok veri satırı içereni seçiyor; `findHeaderRow` ilk 20 satırda "başlığa en çok benzeyen" satırı puanlayarak buluyor (meta blok atlanıyor).
6. ✅ `cleanYearOutliers` silmeleri üç çağrı noktasında da pipeline log'una (uyarı) ve `metadata.removedYearOutliers`'a yazılıyor. (Güven skoruna bağlanması Faz 2'de.)
7. ✅ AI iddiası ile parse edilen satır sayısı %10'dan fazla ayrışırsa chunk bir kez yeniden deneniyor; kalan fark `stats.claimMismatch` + `stats.needsReview` olarak dönülüyor. (İnsan onay ekranı tetiklemesi Faz 3'te bu bayrağa bağlanacak.)

Ayrıca §5'ten: `generationConfig`'e `temperature: 0` eklendi. Tüm değişiklikler testlerle kilitlendi (`tests/data-parser.test.js` yeni; 96/96 geçiyor).

## 3. Önerilen Hedef Mimari: Tek Normalizasyon Hattı

Öneri: dört giriş yolunu koruyup hepsini **tek bir ara temsile (IR)** indirgemek.

```
Excel ─┐
CSV  ──┤                       ┌─ Güven Skoru ≥ eşik → otomatik devam
PDF  ──┼─► ÇIKARICI ─► IR ─► DOĞRULAYICI ─┤
OCR  ──┘   (4 yol)            └─ Güven Skoru < eşik → İNSAN ONAY EKRANI
                                                │
                              MKT/TOR/Karar ◄───┘ (onaylı veri + şablon kaydı)
```

### a) Ara temsil (IR)

Her çıkarıcı aynı şekli üretir:

```
{ timestamp, temperature, humidity?, confidence, rowIndex, rawText }
```

artı belge düzeyinde `{ kaynak yol, şema, silinen satır sayısı, AI iddia/parse farkı, tarih-format güveni }`. Bugün `{timestamp, temperature}` ile `{date, time, temperature, confidence}` karışık dolaşıyor.

### b) Tek tarih çözücü

Zaten yazılmış en iyi modül olan `date-format-detector.js`'i (katmanlı: header → oylama → delta testi) hem tarayıcıya hem sunucuya açın, diğer üç çözücüyü buna delege edin. Belirsizlikte DMY varsayılanı ve **"belirsizdi" bayrağı** dönsün — bu bayrak insan onayını tetikleyen sinyallerden biri olur.

### c) Şablon hafızası (en yüksek getirili özellik)

Türkiye'deki eczane logger'ları sınırlı bir küme (Testo, Elitech, Clogger/Tufan, RC-5...). Şu an tek sabit şablon var (`js/smart-parser.js:246`). SQLite'a `format_templates` tablosu ekleyin: başlık imzası / sayfa-1 metin parmak izi → onaylanmış şema. Akış:

- Belge gelince önce parmak izi eşleşmesi → eşleşirse **sıfır AI maliyeti, anında parse**
- Eşleşmezse mevcut AI şema keşfi → kullanıcı onaylar → şablon kaydedilir
- Böylece sistem her yeni markayı **bir kez** öğrenir; insan onayı zamanla kendi kendini azaltır. Birkaç hafta içinde belgelerin büyük çoğunluğu deterministik yoldan akar.

#### Eşleştirme tasarımı (12.06.2026'da netleştirildi — Faz 4'ün şartnamesi)

**Temel ilke: marka tespit edilmez, tanınır.** Eşleştirme anahtarı marka adı değil, belgenin yapısal parmak izidir; marka adı şablona insan/AI tarafından bir kez yazılan etikettir.

**Parmak izi üretimi (kayıt ve sorguda birebir aynı adımlar):**

- *PDF:* sayfa-1 metni → tüm rakamlar `#` ile maskelenir (tarih/sıcaklık/seri no gibi içerik değişkenleri dışlanır) → boşluk normalize → başlık satırı token'ları (örn. `tarih|saat|dolap °c`) + PDF metadata `Producer/Creator` alanı → SHA-256.
- *Excel/CSV:* sütun adları küçük harf + kırpılmış + sıralı + birleştirilmiş → SHA-256.

**İki kademeli eşleştirme:**

1. **Kesin (hash):** Aynı logger yazılımı aynı iskeleti bastığından hash birebir tutar → şablon anında uygulanır, sıfır AI, tam otomatik.
2. **Bulanık:** Hash tutmazsa başlık token kümeleri arasında Jaccard benzerliği (eşik ~0.85) + aynı `Producer` → aday şablon bulunur ama **asla sessizce uygulanmaz**; onay ekranına "önerilen şablon (%N benzer)" olarak düşer, onaylanırsa yeni varyant ayrı parmak iziyle kaydedilir. Hiçbiri tutmazsa belge "yeni format"tır → AI şema keşfi + insan onayı.

**Eczane bağımsızlığı:** Rapor düzenini eczane değil cihaz yazılımı ürettiğinden ve eczaneye özgü her şey (ad, seri no, tarihler) parmak izinden dışlandığından, A eczanesinden öğrenilen şablon B eczanesinin aynı marka belgesiyle otomatik eşleşir. 600 eczane × 20 marka senaryosunda sistem **eczane başına değil, marka (ve rapor düzeni varyantı) başına bir kez** öğrenir. Aynı markanın farklı ihracı (PDF vs CSV) veya farklı yazılım sürümü ayrı şablondur — bu hata değil, özelliktir.

**Belgede yazan marka adının rolü (yardımcı sinyal, anahtar değil):** 20 marka bilinen küme olduğundan sayfa-1'de deterministik kelime taraması (`Testo`, `Elitech`, `Tufan`, `RC-5`...) üç işe yarar: (1) şablon kaydında marka alanını önceden doldurur; (2) **çapraz doğrulama** — parmak izi "Elitech şablonu" derken belgede "Testo" yazıyorsa çelişki var demektir, belge §4'teki anlaşmazlık yönlendirmesiyle insan kuyruğuna düşer; (3) bulanık eşleşmede aday şablon kümesini daraltır. Ana anahtar yapılmaz çünkü marka adı logoda (metin katmanında yok) olabilir, yazımı değişkendir ve belgenin *kim tarafından* üretildiğini söyler, tablonun *nasıl dizildiğini* söylemez.

### d) Güven skoru ve eşikleme

Tek bir 0–100 çıkarım güveni hesaplanır:

- tarih-format tespiti kesin miydi (oylama/delta sonucu)
- atlanan + silinen satır oranı (`skipped`, `cleanYearOutliers`, dedup)
- AI iddiası vs parse edilen satır farkı
- sıcaklık dağılımı makullüğü (örn. değerlerin %90'ı −30…+40 bandında mı)
- OCR yolunda satır bazlı `confidence < 0.75` oranı (şu an sayılıyor ama kullanılmıyor)

### Durum Güncellemesi — 12.06.2026 (Faz 2 tamam)

§3'teki üç bileşen de uygulandı:

**b) Tek tarih çözücü ✅** — `date-format-detector.js` UMD'ye çevrildi (tarayıcıda global `DateFormatDetector`, sunucuda `require`); yeni `detect(lines)` API'si `{format, method, confidence, ambiguous}` döner. Üç eski çözücü artık buna delege ediyor:

- `js/utils.js` `resolveDateFormat` → ince sarmalayıcı (`resolveDateFormatDetailed` eklendi; eski sözleşme korundu: belirsizlikte `null`). Eski varyans mantığı yalnızca dedektör yüklü değilse yedek.
- `server.js` `smartDateResolve` → medyan mantığı kaldırıldı, dedektöre delege; OCR'a özgü **gelecek-tarih vetosu** ek katman olarak korundu. Tespit sonucu `stats.dateFormat` olarak frontend'e iner; belirsizlik `stats.needsReview`'u da tetikler.
- `js/data-parser.js` `standardize` ve `js/smart-parser.js`'in hasat/metin yolları → `resolveDateFormatDetailed` kullanıyor; belirsizlik pipeline loguna uyarı olarak düşüyor.

**a) Ara temsil (IR) ✅** — Dört yol da aynı şekli üretiyor:

- Satır düzeyi: `{timestamp: Date, temperature, humidity?, confidence, rowIndex, rawText*}` (*rawText satır-tabanlı yollarda: PDF hasadı, metin, OCR). OCR yolu daha önce epoch sayısı döndürüyordu; artık `Date` ve **ortak `DataParser.postProcess` hattından geçiyor** (sıralama+dedup+validasyon+skor) — daha önce bu hattı atlıyordu. Heuristik (Clogger) yol da aynı hatta bağlandı.
- Belge düzeyi: `metadata.extraction = {sourcePath, schema, totalCandidates, parsedRows, skippedRows, removedYearOutliers, dedupRemoved, aiClaimedTotal?, claimMismatch?, lowConfidenceCount?, dateFormat, confidence}`.

**d) Güven skoru ✅** — Yeni `js/confidence.js` (`ConfidenceScore.compute`), §3-d'deki beş sinyalin tamamından 0–100 skor üretir (tarih-format kesinliği, atlanan+silinen oran, AI iddia farkı, sıcaklık makullüğü, OCR satır güveni; ek: az veri cezası). Eşik 70; `needsReview` bayrağı skor eşik altındaysa, tarih formatı belirsizse veya sunucu `needsReview` gönderdiyse kalkar — Faz 3'teki zorunlu onay kapısı bu bayrağa bağlanacak. Skor `postProcess` içinde hesaplanır ve pipeline loguna 🎯 satırı olarak yazılır. (Faz 1/6'da ertelenen "cleanYearOutliers silmeleri güven skoruna yansısın" maddesi de böylece kapandı.)

Testler: `tests/date-format-detector.test.js` ve `tests/confidence.test.js` yeni; `utils/data-parser/smart-parser` testlerine IR + skor senaryoları eklendi (133/133 geçiyor). `app.html` ve `index.html`'e iki yeni script eklendi.

### Durum Güncellemesi — 13.06.2026 (Faz 4 tamam: Şablon hafızası)

§3-c şartnamesi uygulandı; Kademe 3 ("formatı hatırla") de bu fazda kapandı:

**Parmak izi modülü ✅** — Yeni `js/format-fingerprint.js` (UMD: tarayıcıda global `FormatFingerprint`, sunucuda `require`). Kayıt ve sorgu BİREBİR AYNI adımları kullanır:

- *PDF:* sayfa-1 satırları → rakamlar `#` ile maskelenir → boşluk normalize → **başlık satırı token'ları** + PDF `Producer/Creator` → SHA-256. Şartnameden tek sapma netleştirme oldu: hash girdisi maskeli tam metin DEĞİL, başlık iskeleti + üreticidir — rakam maskesi eczane ADINI dışlayamadığından tam metin hash'i eczane bağımsızlığını bozuyordu (testle kanıtlandı). Başlık satırı bulunamayan belgede muhafazakâr yedek (maskeli tam metin) kullanılır: genellemez ama asla yanlış eşleşmez.
- *Excel/CSV:* sütun adları küçük harf + kırpılmış + sıralı + birleştirilmiş → SHA-256 (sütun sırası hash'i etkilemez). Türkçe `İ` → `i̇` (birleşen nokta) tuzağı Unicode NFD + combining-mark temizliğiyle kapatıldı.

**İki kademeli eşleştirme ✅** — `FormatFingerprint.matchTemplate` (sunucu da aynı modülü kullanır → kayıt/sorgu asimetrisi imkânsız):

1. *Kesin (hash):* şablon anında uygulanır, sıfır AI, tam otomatik (`use_count` artar).
2. *Bulanık:* Jaccard ≥ 0.85 + (ikisi de biliniyorsa) aynı `Producer`; marka ipucu aday kümesini daraltır. Aday **asla sessizce uygulanmaz**: şemayla parse edilir ama `reviewReasons` → `forceReview` zinciriyle Faz 3 onay kapısına "önerilen şablon (%N benzer)" olarak düşer; onaylanırsa belgenin kendi parmak izi yeni varyant olarak kaydedilir.
3. *Marka çapraz doğrulaması:* sayfa-1'de deterministik marka taraması (`Testo`, `Elitech`, `RC-5`, `Clogger/Tufan`...) şablon etiketiyle çelişirse (`brandConflict`) belge kesin eşleşmede bile insan kuyruğuna düşer (§4 anlaşmazlık yönlendirmesi).

**Depolama + API ✅** — SQLite `format_templates` tablosu (`database.js`); `POST /api/templates/match`, `POST /api/templates` (hash-zincirli audit'e "Format şablonu öğrenildi" yazar), `GET /api/templates`.

**Akış entegrasyonu ✅** —

- *PDF:* `SmartParser.matchKnownTemplate` hem yükleme önizlemesinde (`ui/cr-upload.jsx` — AI şema keşfinden ÖNCE) hem `parseSmart` içinde çalışır; kesin eşleşmede `discoverSchema` AI çağrısı hiç yapılmaz ("Bilinen format: X · AI maliyeti 0"). Heuristik (Clogger) yol da parmak izini taşır → ilk analizden sonra gerçek şablona dönüşür.
- *Excel/CSV:* sütun imzası kesin eşleşirse kayıtlı eşleştirme paneli otomatik dolar; bulanık benzerlik yalnızca durum satırında önerilir (eşleştirme paneli zaten insan kontrolünde). Kullanıcı eşleştirmeyi elle değiştirirse şablon bağı kopar, onaylı yeni hâli ayrı kaydedilir.
- *Öğrenme (Kademe 3):* analiz başarıyla tamamlanınca kapıdan geçen her belgenin şeması parmak iziyle kaydedilir — insan onayından geçenler `hitl-onay`, yüksek güvenle otomatik geçenler `oto-yuksek-guven` kaynak etiketiyle. Onay ekranındaki "**Bu cihaz formatını hatırla**" kutusu (varsayılan açık) kapatılırsa kayıt yapılmaz. Böylece sistem her markayı/varyantı bir kez öğrenir; 600 eczane senaryosunda öğrenme eczane başına değil marka başına gerçekleşir.

**Yönetim ekranı ✅** — Kontrol Odası'na "Şablon Hafızası" sayfası eklendi (`ui/cr-templates.jsx`): öğrenilen şablonlar marka/tür/şema özeti/kaynak/kullanım sayısı/parmak iziyle listelenir; yanlış onaylanmış şablon iki aşamalı düğmeyle silinir (`DELETE /api/templates/:id` → hash-zincirli audit'e "Format şablonu silindi" yazılır; silinen format bir sonraki belgede yeniden öğrenilir).

**Eski sayfa (index.html) uyumu ✅** — Eski akışta Faz 3 onay kapısı olmadığından bulanık şablon orada sessizce uygulanmış olurdu; bulanık eşleşme `allowFuzzyTemplate` ile opt-in yapıldı (yalnızca kapılı CCPipeline akışı ister). Eski sayfa kesin eşleşmenin sıfır-AI faydasını alır, bulanıkta Faz 4 öncesi davranışını korur.

Testler: `tests/format-fingerprint.test.js` yeni (maskeleme, eczane bağımsızlığı, Producer varyantı, Jaccard, marka çelişkisi, kind filtresi); güven skoruna `reviewReasons` (0 puanlık görünür gerekçe) senaryoları eklendi — **171/171 geçiyor**. Uçtan uca duman testi: kaydet → kesin eşleşme (+marka çelişkisi) → bulanık aday → eşleşme yok → sil → audit zinciri doğrulaması, tamamı doğrulandı. `app.html`/`index.html`'e `js/format-fingerprint.js` eklendi. Veritabanı migration gerektirmez: `format_templates` tablosu sunucu açılışında kendini kurar.

## 4. İnsanı Döngüye Dahil Etme (Human-in-the-Loop) Tasarımı

Mevcut eşleştirme paneli (`ui/cr-upload.jsx:395-532`) iyi bir temel ama **pasif** — kullanıcı fark edip tıklamazsa hiç görünmüyor. Önerilen kademeli model:

### Kademe 1 — Zorunlu onay kapısı (düşük maliyet, büyük etki)

Güven skoru eşiğin altındaysa "ANALİZİ BAŞLAT" düğmesi kilitlenir; kullanıcı önce eşleştirme + önizlemeyi onaylamak zorunda kalır. Önizleme 3 satır yerine baş/orta/son'dan örneklenmiş ~10 satır göstersin (tarih kayması en çok ay sınırlarında belli olur). Yüksek güvende mevcut akış hiç yavaşlamaz.

### Kademe 2 — Satır düzeyi inceleme ızgarası (OCR yolu için)

`confidence < 0.75` satırları, kaynak sayfanın görüntüsüyle yan yana, düzenlenebilir bir tabloda göster. Operatör yalnızca işaretli satırları doğrular (belgenin tamamını değil). pdfjs zaten yüklü olduğundan sayfa render etmek ek bağımlılık gerektirmez. Her düzeltme `audit_log`'a yazılır — hash-zincirli audit altyapısı (`database.js:67`) zaten var, GDP/TİTCK izlenebilirliği için bu büyük artı.

### Kademe 3 — Öğreten onay ("bu formatı hatırla")

Kullanıcı bir eşleştirmeyi onayladığında "Bu cihaz formatı için kaydet" seçeneği → şablon hafızasına yazılır. İnsan, sistemi her markada bir kez eğitir.

### Kademe 4 — Örneklemeli kalite kontrolü

Yüksek güvenli geçen belgelerin rastgele 1/N'i yine de incelemeye düşürülür. Bu hem parser doğruluğunu ölçer hem de zamanla **etiketli bir test korpusu** biriktirir (bkz. §6).

### Anlaşmazlık yönlendirmesi

İki sinyal çelişiyorsa (örn. AI 60 satır iddia etti, 41 parse edildi; ya da tarih dedektörleri farklı format söylüyor) belge otomatik olarak insan kuyruğuna düşer. "Emin değilim" demek, yanlış MKT hesaplamaktan her zaman ucuzdur — bu sistemde yanlış pozitif kabul, gerçek bir soğuk zincir ihlalini gizleyebilir.

### Durum Güncellemesi — 12.06.2026 (Faz 3 / Kademe 1 tamam)

Zorunlu onay kapısı uygulandı:

- **Kapı kararı** — yeni `ConfidenceScore.gate(parsedResults, approvedIds)` (`js/confidence.js`): `needsReview` bayraklı ve henüz onaylanmamış belgeleri döner. Güven skoru hiç hesaplanamamış belge **güvenli sayılmaz**, incelemeye düşer. Faz 1/7'de ertelenen "sunucu `needsReview` bayrağı insan onayını tetiklesin" maddesi de böylece kapandı (bayrak `forceReview` → `confidence.needsReview` → kapı zincirini izliyor).
- **Pipeline entegrasyonu** — `CCPipeline.run` artık MKT/karar hesabından ÖNCE kapıyı kontrol eder; bekleyen inceleme varsa analiz yapmadan `{needsReview, reviews, parseCache}` döner. Parse sonuçları dosya+eşleştirme anahtarıyla önbelleğe alınır: onay sonrası ikinci koşuda **AI/OCR maliyeti sıfır**, hiçbir belge iki kez parse edilmez. Eşleştirme değiştirilirse o dosyanın önbelleği ve onayı otomatik geçersizleşir.
- **Onay ekranı** — `ui/cr-upload.jsx`: düşük güvenli her belge için skor, eşik, puan kıran nedenler ve baş/orta/son'dan örneklenmiş ~10 satırlık önizleme (tam tarih + ham kaynak satırla) gösterilir; "ANALİZİ BAŞLAT" düğmesi tüm belgeler onaylanana dek kilitlidir ("ONAY BEKLENİYOR (N)"). Son onayla analiz otomatik devam eder.
- **Genişletilmiş önizleme** — 1. adımdaki eşleştirme panelleri de (Excel/CSV + PDF) ilk 3 satır yerine `Utils.sampleRows` ile baş/orta/son örneklemi (~10 satır) gösteriyor — tarih kayması en çok ay sınırlarında belli olur.
- **Audit kaydı** — kapının tetiklenmesi (`Onay kapısı tetiklendi`), her insan onayı (`Düşük güvenli çıkarım insan onayından geçti`, skor + nedenlerle) ve onaylı tamamlanan analiz (`hitl-onaylı` etiketi) hash-zincirli `audit_log`'a yazılır.

Testler: `Utils.sampleRows` ve `ConfidenceScore.gate` senaryoları eklendi (145/145 geçiyor). Kademe 2 (satır düzeyi inceleme ızgarası) Faz 5'te (✅ — bkz. §5 güncellemesi); Kademe 3 ("formatı hatırla") Faz 4'te (✅ — bkz. §3 Faz 4 güncellemesi); Kademe 4 (örneklemeli QA) Faz 6'da (✅ — bkz. §6 güncellemesi) tamamlandı.

## 5. AI Katmanında Sağlamlaştırma

- **Markdown tablo yerine yapılandırılmış çıktı:** `/api/extract` şu an Gemini'den Markdown tablo isteyip regex'le söküyor (`server.js:349`) — en kırılgan halka. Gemini'nin `responseMimeType: 'application/json'` + `responseSchema` desteğiyle doğrudan `[{date, time, temp, conf}]` dizisi alın; `parseMarkdownResponse`'taki başlık-atlatma, hücre-indeksleme hatalarının tamamı ortadan kalkar.
- **`temperature: 0`** ekleyin (`server.js:199` `generationConfig`) — OCR işinde determinizm gerekir.
- **Model güncellemesi:** Varsayılan `gemini-1.5-flash` kullanımdan kalkma yolunda; `gemini-2.5-flash`'a (fiyat tablosunda zaten var) geçişi test edin — OCR doğruluğu da belirgin daha iyi.
- **Chunk yeniden denemesi:** Sayfada metin/çizgi olduğu bilinen bir chunk 0 satır dönerse bir kez yeniden dene; `finishReason`'ı kontrol edip `MAX_TOKENS` kesilmesini tespit et.
- Chunk'lar şu an sıralı işleniyor; 2-3 paralel istek süreyi belirgin kısaltır (rate limit'e dikkat).

### Durum Güncellemesi — 13.06.2026 (Faz 5 tamam: AI sağlamlaştırma + satır ızgarası)

**Yapılandırılmış çıktı ✅** — `/api/extract` artık Gemini'den `responseMimeType: 'application/json'` + `responseSchema` ile doğrudan `{readings:[{date,time,temperature,confidence}], pharmacyName, deviceBrand, totalReadings}` ister; yeni `parseStructuredResponse` (`server.js`) bunu savunmacı parse eder (code-block sargısı, kayıp alan, virgüllü ondalık tolere edilir). Markdown tablo yolu **yedek** olarak kalır: yapılandırılmış çağrı hata verirse (model/SDK desteklemezse veya JSON bozuksa) parça otomatik markdown moduna düşer. Markdown ve JSON parser'ları artık ortak `splitRawDate` yardımcısını paylaşır — `>12` kuralı ve `_isISO` bayrağı tek yerden üretilir, `smartDateResolve`'a tutarlı iner. `temperature:0` Faz 1'de eklenmişti.

**Yeniden deneme + paralellik ✅** — Bir parça **0 satır** dönerse (içerik olduğu biliniyor), `finishReason === 'MAX_TOKENS'` ile kesildiyse veya AI iddiası ile parse %10'dan fazla ayrışırsa parça bir kez yeniden denenir; JSON modu 0 satır verdiyse yeniden deneme markdown'la yapılır (farklı yol çoğu kesintiyi kurtarır). Chunk'lar artık `EXTRACT_CONCURRENCY` (varsayılan 2, maks 4) işçiyle **paralel** işlenir; işçiler kademeli başlar (rate-limit nezaketi), sonuçlar sırayla birleştirilir (paralellik kronolojiyi bozmaz).

**Satır inceleme ızgarası ✅ (HITL Kademe 2)** — Onay ekranında, düşük güvenli (`confidence < 0.75`) OCR satırları kaynak sayfa görüntüsüyle **yan yana**, düzenlenebilir bir ızgarada gösterilir (`ui/cr-upload.jsx`). Operatör yalnızca işaretli satırları doğrular: değeri elle düzeltir veya satırı analizden çıkarır. Sayfa görüntüsü pdfjs ile canvas'a render edilir (ek bağımlılık yok; görsellerde objectURL). Her satıra OCR yolunda yaklaşık kaynak sayfa (`page`) iliştirilir. Düzeltmeler onayla birlikte parse önbelleğine uygulanır ve **ayrı bir audit kaydına** (`Düşük güvenli satırlar elle düzeltildi`, kim neyi `X→Y` değiştirdi) yazılır.

## 6. Kalıcı Doğruluk Altyapısı

- **Altın korpus + regresyon testi:** Eldeki gerçek PDF/Excel örneklerinden beklenen çıktılarıyla bir test korpusu kurun (`tests/fixtures/`). Parser'a dokunan her değişiklik korpusa karşı koşsun. Mevcut testler (`tests/`) motorları kapsıyor ama gerçek belge uçtan-uca testi yok — format işinde tek güvenilir ilerleme ölçüsü budur.
- **Ham veriyi sakla:** `analyses` tablosu yalnız özet tutuyor (`database.js:24`). Normalize edilmiş okuma serisini de (ayrı tablo veya JSON) saklayın; parser iyileştikçe eski belgeleri **yeniden işleyebilir** ve insan düzeltmelerini eğitim verisi olarak kullanabilirsiniz.

### Durum Güncellemesi — 13.06.2026 (Faz 6 tamam: kalıcı doğruluk altyapısı)

**Altın korpus + regresyon ✅** — `tests/fixtures/` altında gerçek logger formatı örnekleri (Elitech GG.AA.YYYY noktalı-virgül CSV, Testo ISO ayrı-sütun, gün>12 kesin-DMY; OCR'da yapılandırılmış JSON + markdown tablo). `tests/corpus.test.js` bunları **uçtan-uca** parser zincirinden geçirir: yapısal yol `Utils.parseCSV → DataParser.standardize`, OCR yolu `parseStructured/Markdown → smartDateResolve`. Her fixture rowCount, ilk/son timestamp+sıcaklık ve tarih-format/belirsizlik bilgisini doğrular. Korpus daha kurulurken bir doğruluğu yakaladı: aynı-gün saatlik veri formatı kanıtlayamaz → `ambiguous=true` doğru davranıştır (fixture ayırt edici güne çevrildi). `server.js` artık `require.main === module` ile yalnız doğrudan çalıştırılınca port açar; parser fonksiyonları test için export edilir. `tests/helpers/load-browser-module.js` kök dizin dosyalarını da (date-format-detector.js) yükleyebilir.

**Ham veri saklama + yeniden işleme ✅** — Yeni `analysis_readings` tablosu (`database.js`) normalize seriyi kompakt `[epochMs, °C, güven, nem?]` biçiminde saklar. `CCPipeline` bunu kayda ekler; `POST /api/save-analysis` `analysis_readings`'e yazar; `GET /api/analyses/:id/readings` geri verir → parser iyileştikçe eski belgeler yeniden işlenebilir, insan düzeltmeleri korpusa beslenebilir.

**Örneklemeli QA ✅ (HITL Kademe 4)** — `ConfidenceScore.gate(results, approvedIds, {qaSampleRate})`: yüksek güvenli geçen belgelerin **deterministik ~1/10'u** (id hash'i — aynı belge oturumda tekrar seçilip bırakılmaz) yine de denetime düşürülür, "örneklemeli kalite kontrolü" gerekçesiyle (0 puanlık etiket, skoru düşürmez). `CCPipeline` `ConfidenceScore.QA_SAMPLE_RATE` ile çağırır. Bu hem parser doğruluğunu sürekli ölçer hem de onaylanan örneklerle zamanla etiketli test korpusu biriktirir.

Testler: `tests/corpus.test.js` yeni (korpus + `parseStructuredResponse`/`splitRawDate` birim doğrulamaları); `ConfidenceScore.gate` QA örnekleme senaryoları eklendi — **190/190 geçiyor**. Uçtan uca duman testi: ham seri kaydet → geri al → 404, doğrulandı. Tablo migration gerektirmez (sunucu açılışında kurulur).

## 7. Önerilen Yol Haritası

| Faz | İçerik | Süre | Etki |
|---|---|---|---|
| **1. Hata temizliği ✅** | §2'deki 7 madde: CSV yönlendirme, dateSep, DMY varsayılanı, `new Date()` uydurması, başlık satırı tespiti, sessiz silmelerin raporlanması | 1-2 gün | Mevcut yanlış sonuçların çoğunu keser |
| **2. Tek çözücü + IR + güven skoru ✅** | date-format-detector'ı her yere bağla; ortak çıktı şekli; skor hesabı | 3-5 gün | Tutarlılık, ölçülebilirlik |
| **3. HITL kapısı ✅** | Zorunlu onay ekranı + genişletilmiş önizleme + audit kaydı | 3-4 gün | Düşük güvenli belgelerde sıfıra yakın sessiz hata |
| **4. Şablon hafızası ✅** | Parmak izi → şema tablosu; "formatı hatırla" | 1 hafta | AI maliyeti ↓, hız ↑, insan yükü zamanla ↓ |
| **5. Yapılandırılmış AI çıktısı + satır inceleme ızgarası ✅** | responseSchema; düşük güvenli satır editörü | 1 hafta | OCR yolunun güvenilirliği |
| **6. Korpus + yeniden işleme ✅** | Altın test seti; ham veri saklama; örneklemeli QA | Sürekli | Kalıcı doğruluk güvencesi |

## Özet

Sistemin hibrit (deterministik-önce, AI-yedekli) omurgası doğru. Ana sorun parser eksikliği değil, **dağınıklık**: dört yol, dört tarih çözücüsü, birbirine bağlanmamış güven sinyalleri ve etkisi olmayan UI kontrolleri. Çözüm üç ayaklı:

1. **Tek normalizasyon hattı + güven skoru** — her belge aynı ara temsile iner, çıkarım kalitesi ölçülebilir hale gelir.
2. **Güven düşükken devreye giren zorunlu insan onayı** — onayların şablon olarak hatırlanmasıyla insan yükü zamanla kendiliğinden azalır.
3. **Gerçek belgelerden regresyon korpusu** — her parser değişikliği ölçülebilir şekilde doğrulanır.

Faz 1'deki hatalar (özellikle CSV eşleştirmesinin yok sayılması ve gün/ay takası varsayılanı) bugün üretimde sessiz yanlış sonuç üretebildiğinden ilk oradan başlanması önerilir.
