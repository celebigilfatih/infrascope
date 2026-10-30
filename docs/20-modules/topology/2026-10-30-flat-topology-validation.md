# Sade ağ topolojisi doğrulaması — 30 Ekim 2026

## Değişiklik

Eski bina ikonları ve tam genişlikte harita geri getirildi. Kalıcı bölüm listesi/sağ panel yerine küçük arama, açılır filtreler, açık düzenleme girişi ve seçili bina işlem kutusu kullanılır. Harita rehberi ve bağlantı türü filtreleri haritanın sağ üstündedir; bina içinde aynı kontrol dili uygulanır.

Görsel bölüm belgeleri ve eski konumlar silinmez. Konum önceliği `positions.all` > eski bina konumu > otomatik konumdur. Yeni kayıt modeli veya endpoint eklenmedi. İlk kamera en az %65; kullanıcı isteğiyle ekrana sığdırma daha küçük olabilir. Kamera kullanıcı oturumuna aittir.

## Yakalanan ve düzeltilen davranışlar

- Tıklamanın taşıma sayılarak gereksiz kayıt oluşturması: bina ve cihaz haritalarında 4px hareket eşiği.
- Gelişmiş/grup görünümüne geçerken bekleyen veya başarısız kayıt taslağının kaybolması: kayıt kuyruğu sayfa bileşeninde yaşar.
- Kayıtlı bina seçiminin yenilemede manuel kamerayı ezmesi: yeni odak isteği ile geri yüklenmiş seçim ayrılır.
- ReactFlow v11 yakınlaştırma yardımcılarının `onMoveEnd` üretmemesi ve anlık kameranın önceki kareyi vermesi: tamamlanmış `useViewport` dönüşümü saklanır.
- Gerçek ağ grubundan dönüşte klavye odağı: grubun açma düğmesine bir kez geri verilir.
- Aramadan sonra gecikmiş kaydırma olayının yeni açılmış cihaz menüsünü kapatması: menü ancak dayandığı nesnenin gerçek sınırları değişirse kapanır.
- Mobil rehberde arka plan bağlantı balonunun Escape tuşunu tüketmesi: balon, öndeki açılır panel/menüye öncelik verir. Yerel tarayıcı tam ekrandan çıktığında rehberin modal katmanı da kapatılır.

## Otomasyon

- Saf politika kontrolü: veri değişmezliği, eski bölüm kapsamlarının korunması, konum önceliği, uzak konumda okunabilir açılış ve açık ekrana sığdırma.
- 32 bina / 33 bağlantı / 94 cihaz yapısı: gerçek yollar, arama, liste, rehber, normal/düzenleme tıklamaları, kayıtsız önizleme, sabitleme, uygulama ve geri alma.
- 503, 401, 403, yanıt kaybı ve 409: taslak ve konum korunması, aynı isteği güvenli tekrar, yetkisiz kayıt olmaması ve açık sunucu kopyası seçimi.
- Bekleyen iki taşıma ve başarısız taslağın gelişmiş görünüm geçişinde korunması; seçili bina ile manuel kameranın yenilemede kalması.
- Normal, masaüstü/mobil tam ekran, rehber Escape, gerçek grup klavye dönüşü, bina penceresi kapatma ve Kapat/Cihaz ata çakışması kontrolleri.

Tam paket sonucu: **638 / 638 farklı tarayıcı senaryosu için başarılı sonuç doğrulandı; eksik senaryo yok.** İki özel test veritabanı ve bağımsız uygulama kopyası kullanıldı. Canlı localhost veya müşteri veritabanına regresyon verisi yazılmadı.

İlk ikinci-yarı koşusunda 307/309 geçti; yukarıdaki menü ve mobil Escape hataları yakalandı. İki sorun özel test kopyasında tekrar üretildi, ilgili politika testleri önce hata verdi sonra geçti. Tam senaryolar üçer kez tekrarlandığında 6/6 geçti. Son kaynakla ikinci yarı tekrar çalıştırıldı; ilk hata günlükleri korundu.

Uzun tek-sunucu koşusunda ilk yarı 214 senaryodan sonra bellek sınırına ulaştı. Kalanlar yeni sunucularla 80'lik gruplara ayrıldı. Son kimlik eşleştirmesi: ilk yarı **214 + 35 + 80 = 329**, ikinci yarı **139 + 169 + 1 = 309**; toplam **638**. Son `+1`, kesilmiş bir senaryonun sessizce atlanmaması için ayrı çalıştırıldı. Koleksiyondaki tüm test kimlikleri başarılı kanıtlarla eşleştirildi (`missing: []`, `unexpected: []`); tek bir kesintisiz koşu başarılıymış gibi raporlanmadı.

- Genel TypeScript: `npm run type-check -- --incremental false` — **0**.
- Genel lint: `npm run lint -- --max-warnings=0` — **0**.
- Topoloji model/API/yerleşim/bağlantı/hover/sunum kontrolleri ve yeni kamera/menü politikaları — **0**.
- Yeni gruplama çalıştırıcısı için üyelik, proje, iç içe başlık, kesilen test, tekrar deneme durumu ve eksik rapor kontrolleri — **0**.

Kalıcı regresyon komutu `npm run test:incidents:regression` korunur. Çalıştırıcı seçimi bir kez toplar; en fazla 80 senaryoda bir geliştirme sunucusunu yeniden başlatır. Her grup için bağımsız HTML/JSON raporu ve toplu `--last-failed` durumu oluşturulur. Rapor kimlikleri ve seçilen test sayıları eşleşmeden başarı kabul edilmez.

Makine kanıtı: [coverage-summary.json](../../../output/topology-flat/coverage-summary.json). Okunabilir sonuç: [regression-summary.html](../../../output/topology-flat/regression-summary.html).

## Yerel teslim ve sınırlar

Runtime dosyaları kaynak karşılaştırmasıyla `D:/Dev/infrascope` içine aktarıldı. `localhost:8170/network` üzerinde gerçek yerel veride sade araç çubuğu, rehber, düzenleme seçimi ve kaynaktan bağlantı formu açılışı doğrulandı; form kaydetmeden kapatıldı. “Kapat / Cihaz ata” tam ekranda çakışmadı; bina penceresi kapanınca ana harita normal görünüme döndü. Bu tarayıcı otomasyonu native isteği reddettiğinde açıklamalı sayfa içi genişletme ekranın tamamını kapladı (1920×911); native ve reddedilme yolları izole Chromium regresyonlarında geçti.

Yerel geliştirme sunucusu yeniden açıldı ve **healthy**. Son ekran [overview.png](../../../output/topology-flat/overview.png) dosyasında. Görüntü, kullanıcı eylemi olan “Ekrana sığdır” sonrasında %50 ölçeği gösterir; yeni kamera tercihi olmayan açılışın en az %65 olması ayrıca test edildi.

Her iki özel veritabanında kullanıcı/cihaz/bina/bina bağlantısı sayıları **0** okundu. Ardından iki test projesi, geçici konteynerler, ağlar ve test bağımlılık imajı kaldırıldı. Müşteri verileri, eski konumlar ve bölüm belgeleri korunur. GitHub/GHCR yayını, müşteri güncellemesi ve NMS uygulama değişikliği yapılmadı.
