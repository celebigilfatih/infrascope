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
