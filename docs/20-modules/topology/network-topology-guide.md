# infraScope Network Topology Kullanım Kılavuzu

Bu belge, infraScope projesindeki modern ağ topolojisi görselleştirme sisteminin özelliklerini ve kullanımını açıklar.

## 1. Genel Bakış
Network Topology sayfası, altyapınızın hem fiziksel hem de mantıksal katmanlarını görselleştirmek için tasarlanmıştır. Sistem, ölçeklenebilir bir ReactFlow tabanlı harita ve detaylı drill-down (derinlemesine inceleme) görünümleri sunar.

## 2. Görünüm Modları

### 🏢 Bina Görünümü (Building View) - Varsayılan
En üst seviye stratejik görünümdür. 
- **Semantik Zoom**: Harita üzerinde yakınlaştıkça detaylar (binalar -> cihazlar) kademeli olarak belirir.
- **Sağlık Durumu**: Binalar, içlerindeki cihazların durumuna göre renk değiştirir (Yeşil: Sağlıklı, Turuncu: Kısmen Sorunlu, Kırmızı: Kritik).
- **Cihaz Dağılımı**: Binaların üzerinde Core, Distribution ve Access katmanlarındaki cihaz sayıları görüntülenir.

### 🧩 Mantıksal Görünüm (Logical View)
Altyapıyı hiyerarşik kutular içinde gösterir.
- **Hiyerarşi**: Bina > Kat > Oda > Kabinet > Cihaz.
- **Kademeli Zoom**: Zoom seviyesine göre başlıklar veya detaylı port bilgileri görünür.

### 🖥️ Fiziksel Görünüm (Physical View)
Cihaz merkezli bir görünümdür. Tüm cihazlar türlerine göre ikonlarla ve durum göstergeleriyle listelenir.

### 🌳 Hiyerarşi Görünümü (Hierarchy View)
Topolojiyi interaktif bir akordeon listesi olarak sunar. Hızlı navigasyon için idealdir.

## 3. Temel Özellikler

### Cihaz ve bağlantı ayrıntıları
- **Cihazlar** sekmesi, kayıtlı cihaz bağlantılarını katmanlı bir haritada gösterir. Konum atanmamış cihazlar da korunur; birbirine bağlı olmayan cihazlar için çizgi üretilmez. Sürüklenen konumlar görünüm boyunca korunur.
- Cihaz çizgileri durum etiketi ve çizgi biçimiyle ayrılır: açık düz yeşil, kapalı kesik kırmızı, beklemede noktalı sarı, bilinmeyen noktalı gri. Bina haritasında kablo türü renkleri korunur; durum etikette ayrıca yazılır.
- Çizgiye tıklamak bağlantı adını, kayıtlı durumunu, iki cihazı ve gerçek port adlarını açar. Cihaz seçimi yönetim IP’sini, kritiklik bilgisini, konumunu, arayüzlerini ve bağlı cihazlarını gösterir. Komşu bağlantıdan uç cihaza geçilebilir.
- **Bağlantı listesi**, geçerli cihaz filtrelerine uyan bağlantıları cihaz/port/durum metniyle arama ve duruma göre süzme olanağı sağlar. Çizgi hedeflerine alternatif olarak klavyeyle kullanılabilir. Bina bağlantıları **Bağlantıları yönet** üzerinden incelenir.
- **Haritayı genişlet**, harita ile ayrıntı paneline daha fazla alan ayırır. Normal görünüme düğmeyle veya harita içindeyken Esc ile dönülür.
- NMS port uyarıları kayıtlı bağlantı durumundan ve cihazın envanter durumundan ayrıdır. Kapalı port kaydı dönmemesi bütün portların izlendiğini veya açık olduğunu kanıtlamaz. Her uyarıda son ölçüm TSİ ile gösterilir; kaynak alınamazsa sıfır yerine eksik veri açıklaması gösterilir.
- Bağlantı uçları mevcut veri modeli üzerinden eşlenir: kaynak switch portu → ilişkili cihaz arayüzü. Birleşim yapılmayan eski hedef alanları başka bir cihaza atfedilmez; kaynağı olmayan ve kendisine bağlanan kayıtlar çizilmez. Eksik hız bilgisine örnek değer atanmaz.

Doğrulama: `npm run test:topology-workspace` (uç eşlemesi, bilinmeyen durum, çevrimli yerleşim, ayrıntı paneli, eksik kaynaklar) ve `npm run test:topology-contracts` (mevcut yakınlaştırma/ilişki sözleşmeleri). Testler sentetik kayıtlarla çalışır; gerçek ağa yazmaz.

`npm run test:incidents:regression` ayrıca topoloji dosyalarında sıfır uyarı toleranslı lint ve beş Chromium senaryosu çalıştırır: bağlantı/cihaz ayrıntıları ve klavye, kaynak hatası ile gerçek boş sonuç ayrımı, envanter hatasından toparlanma, mobil açık ve koyu tema. Testlerde topoloji kaynakları taklit edilir; giriş yalnız ayrı test veritabanını kullanır ve topolojiye yazma isteği gönderilmediği doğrulanır. Kaynak alınamazsa özet, harita ve bağlantı listesi doğrulanmış `0` göstermez; bağlantı verisinin alınamadığını belirtir.

### 🔍 Drill-down Navigasyon (Zoom View)
Topoloji haritasının dışındaki seviye butonları ile binaların, katların ve odaların içine girebilirsiniz.
- **Breadcrumb**: Üst kısımdaki navigasyon çubuğu ile geri dönebilir veya üst seviyelere hızlıca geçebilirsiniz.
- **Görsel Zenginleştirme**: Kabinet seviyesinde gerçek fotoğraflar veya gerçekçi renderlar görüntülenir.

### 🔗 Bağlantı Yönetimi (Connection Management)
- **Bina Bağlantıları**: Binalar arası fiber, bakır veya kablosuz linkleri yönetebilirsiniz.
- **Cihaz Bağlantıları**: Cihazlar arası port bazlı bağlantılar oluşturabilirsiniz.
- **Otomatik Tespit**: Farklı binalardaki cihazları birbirine bağladığınızda sistem otomatik olarak bir bina bağlantısı önerir.

### 📸 PNG Dışa Aktarma
Haritanın o anki görünümünü yüksek çözünürlüklü PNG olarak kaydedebilirsiniz.

## 4. Ekran Görüntüsü Önerileri (Paket Hazırlığı İçin)
Belgelendirme paketi için aşağıdaki ekran görüntülerinin alınması önerilir:
1. **Building_Overview.png**: Tüm binaların göründüğü ana Building View.
2. **Semantic_Zoom_Detail.png**: Bir binaya yaklaşıldığında cihazların belirdiği an.
3. **Logical_Hierarchy.png**: Kat ve oda kutularının göründüğü Logical View.
4. **Rack_Photo_View.png**: Bir kabinetin detaylarının ve fotoğrafının göründüğü Zoom View.
5. **Connection_Wizard.png**: Yeni bir bağlantı ekleme ekranı.

---
*Hazırlayan: infraScope Geliştirme Ekibi*
