# Okunabilir bina haritası — 2 Kasım 2026

## Sonuç ve kapsam

Yerel düzeltme tamamlandı. Mevcut bina ikonları ve sade araç çubuğu korundu. Büyük ağların varsayılan yerleşimi bağlantılı komşuları yakın tutan sıkı bir düzene geçti; gerçek bağlantı çizgileri bina ikonları, iki satırlı adlar ve cihaz sayılarının çevresinden geçiyor.

Örnek, gerçek Next/React Flow ekranında **32 sentetik bina, 33 bağlantı ve 94 cihaz** ile çalıştırıldı. Örnek veriler HTTP yanıtı olarak yalnızca test tarayıcısına sunuldu; localhost envanterine veya müşteri veritabanına aktarılmadı. Ana yerel uygulama ayrıca `http://localhost:8170/network` üzerinde mevcut **10 bina / 1 mantıksal ağ grubu** ile açılıp görsel olarak doğrulandı.

Müşteri sunucusuna erişilmedi, güncelleme/yayın yapılmadı. Kayıtlı `positions.all` ve eski bina konumları önceliğini koruyor. Yeni varsayılanlar yalnızca kaydı olmayan nesnelere uygulanır; mevcut yerleşimi yeniden düzenlemek için açık önizleme ve uygulama gerekir.

## Düzeltmeler

- Sade harita güvenli rotaları silip Bezier eğrileriyle değiştirmeyi bıraktı.
- Normal bina, büyük merkez ikonu ve gerçek mantıksal grup kartı için ayrı engel boyutları kullanıldı.
- 12'den büyük bina kataloglarında komşuluk temelli, kararlı ve sıkı varsayılan konumlar kullanılıyor. Küçük haritaların mevcut görünümü korundu.
- Otomatik düzenleme aynı yerleşimi önizliyor; sabitlenen konumları koruyor. İptal yazmaz; Uygula / Geri al mevcut kayıt kuyruğunu kullanır.
- Üç ve on paralel/ters yönlü bağlantının her biri ayrı rota üretiyor.
- Sürükleme boyunca ağır rota araması yapılmıyor. Çizgiler açıklamalı olarak geçici gizleniyor ve bırakınca doğrulanmış rotalarla geri geliyor. Bu tercih, pointer tutulurken çizgi önizlemesinden vazgeçerek sürüklemeyi akıcı tutar.
- Uygun rota bulunamayan kayıtlar sessizce kaybolmuyor; açıklama ve bağlantı ayrıntı listesi gösteriliyor. Nesneler kendiliğinden taşınmıyor.

## Doğrulama

- **Son tarayıcı koşusu: 64/64 başarılı; 0 başarısız, 0 atlanan, 0 tekrar denemeyle geçen.** Önceki ara koşu 63/63 idi; son koşu bu sayının üzerine eklenerek toplam test sayısı gibi sunulmaz.
- Sekiz seçili dosya: topology-readable, topology-overview, topology-presentation, topology-presentation-api, topology-editing, topology-workspace, topology-object-menu ve bulk-acknowledge. Tam 638 senaryoluk yayın paketi bu çalışmada yeniden çalıştırılmadı.
- Gerçek SVG yolları boyunca örneklenen noktalar, DOM'daki gerçek bina adı ve cihaz sayısı dikdörtgenleriyle karşılaştırıldı: kesişme yok.
- 32/33 örneği tam ekranda sığdırıldığında ölçek yaklaşık **%86**. Bu sentetik örnek, müşterinin farklı bağlantı grafiği ve kayıtlı konumlarıyla birebir sayısal karşılaştırma değildir.
- Salt görüntüleme, yenileme, kamera, önizleme ve iptal sırasında yazma yapılmadığı; eski kayıtlı koordinatların geri geldiği doğrulandı.
- Taşıma, kayıt hatası/tekrar deneme, 401/403, yanıt kaybı, 409/revizyon yarışı, pin, uygulama/geri alma, tam ekran/Esc, bina kapatma, Kapat/Cihaz ata ve mobil görünüm regresyonları geçti.
- TypeScript ve genel lint temiz. Yeni/değişen TypeScript, test ve kontrol betikleri ayrıca sıfır uyarıyla ESLint'ten geçti.
- Bina/cihaz yönlendirme, yerleşim, sunum/API, arama, filtre, çalışma alanı ve sözleşme kontrol betikleri geçti. Yayın kalite sözleşmesinin 35 senaryosu da geçti; üretim derlemesi/yayın bu görevin kapsamına alınmadı.
- Bağımsız incelemedeki iki önemli bulgu (paralel yollar ve sürükleme maliyeti) önce başarısız testlerle yeniden üretildi, ardından düzeltildi ve son 64'lük koşu yeşil tamamlandı.

## Temizlik ve kanıt

Testler yalnızca `infrascope_incident_e2e` adlı ayrı Docker veritabanını kullandı. `infrascope-readable-20261102` projesinin PostgreSQL/tmpfs'i ve iki geçici test konteyneri kaldırıldı; isim filtresiyle geride kaynak kalmadığı doğrulandı. Canlı yerel veritabanı, node_modules hacmi ve müşteri verileri korunur.

Kanıtlar `output/readable-topology/` altında: `final64/browser-batches.json`, `final64/batches/browser-1/result.json`, HTML raporu ve `32-buildings-33-links-fullscreen.png`. Yerel gerçek ekranın görüntüsü `output/topology-ux-audit-20261102/localhost-routing-after.png` dosyasındadır.

## Açık sınır

Yaklaşık 400 ve daha fazla binada yerleşim optimizasyonunun ek hızlandırılması ayrı iş olarak kaldı; mevcut kabul örneği 32/33'tür. Kayıtlı nesneler üst üste gelirse bunları otomatik taşımak yerine çizilemeyen bağlantı uyarısı gösterilir. Müşterinin haritasının düzelmiş olduğu iddia edilmez: kod yalnızca yerelde, commit/push/yayın yapılmadan incelemeye hazırdır.
