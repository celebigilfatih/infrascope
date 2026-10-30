# Omurga ve görsel bölümler — doğrulama raporu

Tarih: 30 Ekim 2026. Çalışma, mevcut izole `codex/customer-release-1.0.10` dalında geliştirildi; ardından aynı tabandaki temiz `D:\Dev\infrascope` main çalışma alanına kopyalanarak çalışan `localhost:8170` uygulamasına aktarıldı. Henüz commit/push yapılmadı. Müşteri sunucusuna, müşteri veritabanına, GitHub Releases veya GHCR'ye değişiklik uygulanmadı.

## Değişiklikler

- Açılışta omurga ve açılabilir görsel bölümler; sol tarafta bina/bölüm araması, sağ tarafta seçim ayrıntıları ve açık cihaz haritası eylemi.
- Bağlantılardan kararlı bölüm önerisi; kullanıcı uygulayana kadar salt okunur önizleme. Bölüm oluşturma, yeniden adlandırma, bina üyeliği değiştirme ve bölümü kaldırarak üyeleri omurgaya döndürme.
- Gerçek bağlantılara geri açılan özet çizgileri; fiziksel kayıtlar ve gerçek `NetworkGroup` kayıtlarıyla ayrı veri modeli.
- Görünüme özel konum/kamera, otomatik kayıt ve güvenli yeniden deneme; sabitleme, otomatik yerleşim önizlemesi ve geri alma.
- Sürümlü `SystemConfig` belgesi ve `/api/network/topology-presentation` GET/PUT; yetki kontrolü, tekil üyelik doğrulaması, atomik revizyon karşılaştırması ve kayıp yanıtın güvenli tekrarı. Şema geçişi gerekmiyor.
- Silinen bina üyeliklerinin yazmadan uzlaştırılması; çakışma sonrası kalıcı karşılaştırma taslağı; eski yerleşim servisinden bağımsız yeni harita ve açıklamalı bağlantı araçları yeniden yükleme eylemi.

## Kontroller

| Kontrol | Sonuç |
| --- | --- |
| TypeScript, `tsc --noEmit --incremental false` | Geçti |
| Genel lint, sıfır ESLint uyarısı/hatası | Geçti |
| Model, API ve Türkçe/ASCII gezinme araması regresyonları | Geçti |
| Mevcut topoloji oluşturma, yerleşim, port rezervasyonu, bağlantı, filtre, kamera, tam ekran, sözleşme ve çalışma alanı kontrolleri | Geçti |
| Normal çalıştırıcının incident/API/DB ve diğer modül ön kontrolleri | Geçti |
| Topoloji odaklı ilk tarayıcı paketi | 37/37 geçti |
| Güncel kaynakla topoloji/NMS/web analizi ek tarayıcı koşusu | 37/37 geçti |
| Tüm modüllerin benzersiz tarayıcı senaryoları | **634/634 geçti; kalan başarısız senaryo yok** |
| Geçici test kaynakları ve verileri | 12 test konteyneri, geçici veritabanları, test ağı ve bağımlılık volume'u kaldırıldı |
| Yerel geliştirme sunucusu son sağlık kontrolü | `/api/health`: HTTP 200, `status: healthy` |
| Çalışan localhost doğrulaması | Sol liste, omurga/bölüm kartları, Sistem Odası seçim paneli ve A Blok bölümü açılışı doğrulandı; ortak görünüm kaydedilmedi |

32 bina, 94 cihaz ve 33 bağlantılı sentetik veriyle okunabilir açılış, tüm ağı açma, gerçek bağlantı sayılarının korunması, bina seçimi ve cihaz penceresi, düzenleme, kayıt hatası/401/403/kayıp yanıt, revizyon çakışması, bölüm üyeliği/adı/kaldırma, sabitleme/önizleme/geri alma, mobil çekmece, klavye, tam ekran/Esc ve mevcut düğme çakışması akışları doğrulandı. Müşteri IP veya yapılandırma içeriği test verisine kopyalanmadı.

Bağımsız kod incelemesinde bulunan dört sorun için başarısız regresyonlar gözlendi, düzeltmeler uygulandı ve tarayıcıda yeniden doğrulandı: silinen bina, sonraki düzenlemede kaybolan çakışma taslağı, kapsam değişiminde ezilen kamera ve eski yerleşim servisi hatası. İnceleme takibi bu düzeltmelerde önemli açık sorun bulmadı.

Yerel aktarımda 29 bina/230 cihaz/31 bağlantılı gerçek veri kullanıldı. Yedi omurga kolunun tek uzun sütuna dizilmesi ayrıca düzeltildi: merkez çevresindeki kompakt konumlar için önce başarısız bir regresyon gözlendi, sonra model/API/gezinme/sözleşme kontrolleri, TypeScript ve ilgili lint yeniden geçti. Tarayıcı yenilemesinden sonra yeni yerleşim doğrulandı. Bu son yerleşim düzeltmesi için tüm 634 senaryo tekrar koşturulmadı; yukarıdaki tam paket sonucu ana uygulama değişikliğine aittir.

## Koşu altyapısı ve kanıtlar

İlk tam çalıştırıcıdaki ön kontroller tamamlandı; 632 senaryolu tarayıcı koşusu, yeni iki senaryo ve bölümlü çalışma için kasıtlı durduruldu. Son kapsam toplam **634 benzersiz senaryo**.

İlk dört parçalı koşuda 456 senaryo geçti. Geçici kaynak kopyasının fazla geniş `backups` dışlama kuralı dört NMS testinde 404 üretti; kopya düzeltildi. Ayrıca Docker'ın 16 GB belleğinde dört geliştirme sunucusu kaynak baskısı ve OOM/bağlantı hataları üretti. İlk bellek sınırı Next geliştirme sunucularının tepe kullanımına düşük kaldığından bazı istekler de bağlantı reddi aldı. Test sınırları ve eşzamanlılık yeniden düzenlendi; 178 başarısız senaryonun tamamı yeniden doğrulandı. Son erişim grupları 38/38 ve 37/37 geçti. Bu altyapı sorunları için NMS, incident veya web analizi üretim kodu değiştirilmedi. İlk başarısız sonuçlar gizlenmeden günlüklerde korundu. Birleşik sonuç **634 geçti, 0 başarısız**.

- [Birleşik benzersiz senaryo sonuçları](../../../output/topology-presentation-regression/results.json)
- [TypeScript günlüğü](../../../output/topology-presentation-typescript.log)
- [Lint günlüğü](../../../output/topology-presentation-lint.log)
- [İlk çalıştırıcı ve modül ön kontrolleri](../../../output/topology-presentation-full-regression.log)
- [Güncel kaynakla ek koşu](../../../output/topology-presentation-followup.log)
- [Özet görünüm ekran görüntüsü](../../../output/topology-presentation-summary.png)

Her parçanın HTML raporu ve ilk başarısızlık kanıtları `output/topology-presentation-shard-*-report` altında; başarılı yeniden koşuların raporları ayrı tutuluyor. Birleşik JSON, aynı testin sonraki sonucunu dosya/proje/tam başlık kimliğiyle eşleyerek toplam sayıyı şişirmiyor.

## Tekrar çalıştırma

```sh
npm run test:topology-presentation
npm run test:topology-building
npm run test:topology-workspace
npm run test:topology-contracts
npm run test:incidents:regression
```

Normal regresyon çalıştırıcısı geçici veritabanı gerektirir ve sonunda kendi Docker kaynaklarını temizler. Bu çalışma sırasında oluşturulan özel parçalı test kaynakları da kaldırıldı; yalnız rapor ve günlük kanıtları tutuldu. Bellek baskısından etkilenen yerel geliştirme web süreci yeniden başlatıldı. Geliştirme veritabanı ve müşteri kurulumu değiştirilmedi.
