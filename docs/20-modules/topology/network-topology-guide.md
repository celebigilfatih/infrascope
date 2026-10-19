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

### Harita odaklı çalışma alanı
- Harita, sayfanın kullanılabilir yüksekliğini doldurur. Arama ve etkileşim modu haritanın üst araç çubuğundadır; yakınlaştırma ve ekrana sığdırma sol alt köşededir.
- Üstteki cihaz/bağlantı sayacına tıklayarak **Ağ özeti** açılır. Aktif cihazlar, kapalı port kayıtları ve kaynak açıklamaları bu panelde gösterilir.
- Sağ alttaki **Bağlantı türleri** menüsü renk açıklamalarını, tür filtrelerini ve bağlantı etiketi tercihini içerir. Seçimler önceki gibi kaydedilir.
- Pencere veya harita alanı boyutu değişince topoloji yeniden sığdırılır; aramayla odaklanılmış bir bina varsa odak korunur.
- Bina içi cihaz görünümü de harita odaklıdır. **Cihazlar** ve **Bağlantılar** düğmeleri yan paneli açıp kapatır; seçili cihazın **Ayrıntılar** düğmesi IP, durum, konum ve cihaz detay bağlantısını panelin başında gösterir. Escape önce açık paneli kapatır.
- Bina içi tür ve etiket filtreleri sağ alttaki **Bağlantı türleri** menüsündedir. Liste açılıp kapanırken seçili cihaz veya bağlantının uçları haritada odakta kalır.
- Bina içi otomatik yerleşimde birbirine bağlı cihazlar, en çok bağlantısı olan cihazın çevresinde gruplandırılır. Ayrı bağlantı grupları birbirine karışmaz; bağlantısız cihazlar dengeli bir ızgarada gösterilir. Cihaz adları iki satırla sınırlandırılır; tam ad ikonun üzerine gelince görülebilir.
- Kalabalık bina haritası en büyük bağlantı grubuna en az %75 ölçekte açılır. **Ekrana sığdır** bütün cihazları gösterir; **Okunabilir ölçek** bağlantılı gruba geri döner. Arama, görünüm dışında kalan cihazlara da odaklanır.
- Bina içi bağlantı etiketleri ikonlarla veya başka etiketlerle çakışıyorsa, ayrıca %60 altındaki ölçekte gizlenir. Çizgi üzerine gelince bağlantı bilgileri açılır. Kullanıcının etiketleri göster/gizle tercihi korunur.
- Kaydedilmiş cihaz konumları değişmez. Yeni otomatik düzeni mevcut bir binaya uygulamak için **Düzenleme → Yerleşimi sıfırla** kullanılır; yeni düzen kaydedilir ve yenilemede korunur. Yeni cihazların otomatik konumları kayıtlı ikonlarla çakışmayacak şekilde ayarlanır.
- Bina içi bağlantılar ikon, cihaz adı ve IP alanlarının çevresinden, yuvarlatılmış köşeli rotalarla geçer. Rota seçimi çizgi kesişmelerini, üst üste binmeleri ve gereksiz dönüşleri azaltır; cihaz taşındığında yeniden hesaplanır. Filtre değiştirmek diğer bağlantıların rotasını değiştirmez. İkonlar geçiş bırakmayacak kadar üst üste gelirse ilgili bağlantı listede korunur; güvenli çizgi için ikonların ayrılması istenir. Kayıtlı cihaz konumları bu işlemle değiştirilmez.
- Binalar arası çizgiler de aynı yönlendirmeyi kullanır; bina ikonu, iki satırlık adı ve cihaz sayısı için ayrılan alana girmez. Konumsuz cihazlar ikonu da engel olarak hesaba katılır. Kaydedilmiş bina konumları korunur; sürüklemede rota güncellenir ve tür filtreleri diğer rotaları değiştirmez. Çakışan bağlantı etiketleri ve %60 altındaki etiketler gizlenir; bağlantı bilgileri çizginin üzerine gelerek veya Bağlantıları yönet listesinden incelenebilir.
- Bina haritasını ekrana sığdırırken çizgilerin dış sınırları, üst araç çubuğu ve alttaki kontroller için ayrılan alan birlikte hesaba katılır.
- Her iki haritada bağlantı çizgisi veya etiketi üzerine gelince yalnız o çizgi ve iki ucundaki ikon vurgulanır; diğer çizgiler ve ikonlar soluklaşır. Bilgi kutusuna geçerken vurgu korunur. İmleç ayrılınca, Escape ile kapatılınca veya bağlantı filtrelenince mevcut seçim görünümü geri gelir. Bu geçici önizleme seçim ve yerleşim kayıtlarını değiştirmez; etiketler klavyeyle odaklandığında da çalışır.
- Bina veya cihaz ikonunun üzerine gelince ikon, doğrudan bağlı komşuları ve o ikona giren/çıkan bağlantılar vurgulanır; diğer ikonlar ve çizgiler soluklaşır. İkinci dereceden komşular vurgulanmaz; gizlenen bağlantılar komşu vurgusuna katılmaz. Fare ayrılınca önceki seçim görünümü geri gelir; bu önizleme haritayı hareket ettirmez ve seçim kaydını değiştirmez.
- İkon bilgi kutusu adını, mevcut durumunu ve toplam doğrudan bağlantı sayısını gösterir. Paralel bağlantılar ayrı sayılır; ikinci dereceden bağlantılar sayılmaz. Gizlenen bağlantı varsa haritada görünür sayı da belirtilir. Bilgi kutusuna geçerken komşu vurgusu korunur; Escape, ikon tıklaması veya harita hareketi kutuyu kapatır.
- Bina bilgi kutusunda cihaz sayısı da gösterilir; boş binalarda sayı 0'dır. Cihaz bilgi kutusu yönetim IP adresini ve Türkçe cihaz türünü gösterir; eksik IP veya tür için “Belirtilmemiş” yazılır. Uzun IP adresleri kutunun içinde satıra bölünür.
- Cihaz bilgi kutusunda IP adresinin yanındaki kopyalama düğmesi adresi panoya yazar. İşlem başarılı olunca 2,5 saniyelik onay mesajı gösterilir; panoya erişim başarısız olursa hata mesajı çıkar. IP adresi yoksa düğme gösterilmez. Düğme klavyeyle odaklandığında bilgi kutusu açık kalır.
- Cihaz bilgi kutusundaki “Detayları aç” düğmesi, kutusu açık cihazın NMS detay sayfasına aynı sekmede gider; haritadaki kalıcı seçim hedefi değiştirmez.
- “Bağlantıları göster” düğmesi yan paneli yalnız o cihazın bina içindeki doğrudan bağlantılarına açar. Bağlı cihaz adı, bu cihazın portu ve karşı uçtaki port ayrı satırlarda gösterilir; gelen bağlantılarda portların yönü cihaza göre çevrilir. Liste haritanın tür filtrelerinden bağımsızdır ve bilgi kutusundaki toplamla eşleşir. Bağlantısı olmayan cihazda boş durum mesajı, kapsamı kaldırmak için “Tüm bağlantılar” düğmesi bulunur. Bağlı cihaz adına tıklamak haritayı o cihaza odaklar, doğrudan bağlantılarını vurgular ve listeyi de o cihazın doğrudan bağlantılarıyla günceller. “Geri” düğmesi önceki cihazın odağına ve bağlantı listesine döner; art arda geçişlerde geçmiş adım adım geri alınır. Aynı cihaza yeniden odaklanmak geçmişe yinelenen adım eklemez. Listenin üstündeki “Cihaz gezinme yolu” geçmiş cihazları ve mevcut cihazı sıralar; geçmişteki bir ada tıklamak o adımın harita odağına ve doğrudan bağlantı listesine döner, sonraki adımları kaldırır. Mevcut adım belirtilir; uzun adlar ve yol dar ekranlarda satıra yayılır. “Tüm bağlantılar”, cihaz listesi, arama veya haritadan yeni seçim bu gezinme geçmişini temizler. Genel bağlantı listesinde de iki uçtaki cihaz adları aynı şekilde kullanılabilir; bağlantı bilgilerini açmak için ayrı “Bağlantıyı incele” düğmesi bulunur.
- Seçili bina ve açık bina görünümü tarayıcıda saklanır. Her binanın seçili cihazı, bağlantı listesi/kapsamı, gezinme yolu ve panel durumu ayrı saklanır; sayfa yenilenince aynı cihaz veya bağlantıya odaklanılır. Kayıtlar başarılı envanter yüklemesinden sonra geri alınır; yükleme varsayılanları kaydı ezmez. Artık görünümde olmayan cihazlar ve bağlantılar elenir. Açık bir arama sonucu kayıtlı cihaz seçimini geçersiz kılar. Bozuk veya engellenmiş tarayıcı depolaması gezinmeyi durdurmaz; düzenleme formları otomatik açılmaz. Binalar arası haritanın ve her binanın cihaz haritasının yakınlaştırma/kaydırma konumları ayrı saklanır; yenilemede otomatik odaklamanın önüne geçerek aynı görünüm geri gelir. Taşıma veya yakınlaştırma bittiğinde kayıt güncellenir. Arama, yol/cihaz/bağlantı seçimi, okunabilir ölçek ve ekrana sığdırma yeni bir odak oluşturabilir; bu odak da kaydedilir. Eski kayıtta kamera yoksa otomatik yerleşim kullanılır; geçersiz sayılar ve desteklenmeyen yakınlaştırma değerleri yok sayılır. Her iki haritadaki “Görünümü sıfırla” düğmesi ilk otomatik yakınlaştırma ve kaydırma görünümünü uygular ve kaydeder. Binalar arası haritada binalar ve rotalar ekrana sığar; bina içinde ilk okunabilir otomatik görünüm kullanılır. Bina/cihaz seçimi, gezinme yolu, bağlantı listesi ve ikon yerleşimleri korunur. Düğme Görüntüleme ve Düzenleme modunda kullanılabilir.

- Her iki haritada “Seçili ve bağlıları göster” görünümündeki “Bağlantı derinliği” seçimi, seçili ikondan 1 veya 2 adım uzaklıktaki ikonları gösterir. İlk değer 1 adımdır: yalnız doğrudan komşular ve seçili ikona gelen/giden çizgiler kalır. 2 adımda bu komşuların bağlantıları da açılır; üçüncü adıma geçilmez. Bağlantılar iki yönde izlenir ve mevcut bağlantı türü filtreleri hesaplamadan önce uygulanır. Fareyle üzerine gelmek kapsamı değiştirmez. Bağlantısız seçimde yalnız seçili ikon gösterilir. Seçim yoksa düğme pasiftir. Derinlik değişince harita yeni kapsama sığar; ikon konumları ve rotaları korunur. “Tümünü göster” ikonları ve tür filtrelerine uyan bağlantıları genel haritada yeniden gösterir. Görünüm ve derinlik tarayıcıda ana harita ve her bina için ayrı saklanır; genel görünüme dönmek derinlik tercihini silmez. Arama ve cihaz yolu ile yeni seçim yapmak kapsamı o ikona taşır.
- İki adımlık görünümde bina ve cihaz ikonlarının sol üstündeki küçük “1” ve “2” rozetleri, seçili ikona en kısa bağlantı uzaklığını gösterir. Seçili ikon rozet taşımaz. Rozetler soluk ikonlarda da okunur kalır; fareyle başka ikona veya çizgiye gelmek uzaklığın başlangıcını değiştirmez. Derinlik seçiminin altındaki küçük açıklama, iki haritada da “1: Doğrudan bağlı” ve “2: Bir ikon üzerinden” anlamlarını gösterir. Açıklamadaki 1 ve 2 rozetlerine tıklamak, o uzaklıktaki ikonları bağımsız olarak gösterir veya gizler. Her rozetin yanındaki sayı, o uzaklıktaki farklı ikonların toplamıdır; seçili ikon sayılmaz. Sayılar uzaklık filtresi kapalıyken de korunur ve mevcut bağlantı türü filtreleri ile seçili ikona göre güncellenir. Seçili ikon her zaman görünür; gizlenen uçlara ait çizgiler çizilmez. Uzaklık önce hesaplandığı için 1 kapatıldığında 2 adımlık ikonlar kaybolmaz. İkisi de kapalıysa yalnız seçili ikon gösterilir. “Filtreleri sıfırla” düğmesi iki uzaklığı tek işlemde açar, haritayı gösterilen ikonlara sığdırır ve bu tercihi ilgili harita için kaydeder. İki uzaklık zaten açıksa düğme pasiftir. Tercih ana harita ve her bina için ayrı kaydedilir. 1 adıma veya genel haritaya dönünce bu filtreler uygulanmaz; iki adımlık görünüme dönünce tercihler yeniden kullanılır.

- Bina bilgi kutusundaki “Cihazları göster” düğmesi, o binanın cihazlarını ve bina içi bağlantılarını mevcut harita penceresinde açar. Konumsuz Cihazlar grubu için de çalışır; önceki cihaz araması yeni binaya taşınmaz.

### Görüntüleme / Düzenleme
- Harita ilk açıldığında **Görüntüleme** modu etkindir. Arama, seçim, bağlantı ayrıntıları, filtreler ve haritada gezinme kullanılabilir; ikon taşıma ve yeni bağlantı oluşturma kapalıdır.
- **Düzenleme** modu, yetkili kullanıcılar için ikon taşımayı ve bağlantı noktalarından sürükleyerek bağlantı oluşturmayı açar. Yeni bağlantı ve yerleşimi sıfırlama işlemleri de bu modu gerektirir.
- Mod seçimi ana harita ve bina içi cihaz görünümü arasında ortaktır. Sayfa yenilendiğinde Görüntüleme moduna dönülür; kaydedilmiş ikon konumları korunur.

### Cihaz ve bağlantı ayrıntıları
- **Cihazlar** sekmesi, kayıtlı cihaz bağlantılarını katmanlı bir haritada gösterir. Konum atanmamış cihazlar da korunur; birbirine bağlı olmayan cihazlar için çizgi üretilmez. Sürüklenen konumlar görünüm boyunca korunur.
- Cihaz çizgileri durum etiketi ve çizgi biçimiyle ayrılır: açık düz yeşil, kapalı kesik kırmızı, beklemede noktalı sarı, bilinmeyen noktalı gri. Bina haritasında kablo türü renkleri korunur; durum etikette ayrıca yazılır.
- Çizgiye tıklamak bağlantı adını, kayıtlı durumunu, iki cihazı ve gerçek port adlarını açar. Cihaz seçimi yönetim IP’sini, kritiklik bilgisini, konumunu, arayüzlerini ve bağlı cihazlarını gösterir. Komşu bağlantıdan uç cihaza geçilebilir.
- **Bağlantı listesi**, geçerli cihaz filtrelerine uyan bağlantıları cihaz/port/durum metniyle arama ve duruma göre süzme olanağı sağlar. Çizgi hedeflerine alternatif olarak klavyeyle kullanılabilir. Bina bağlantıları **Bağlantıları yönet** üzerinden incelenir.
- **Haritayı genişlet** düğmesinde açıklama ikonun sağında görünür. Düğme, harita ile ayrıntı paneline daha fazla alan ayırır. Genişletilmiş görünümde düğme **Normal görünüme dön** yazar; bu düğmeyle veya harita içindeyken Esc ile normal görünüme dönülür. Açıklama dar ekranlarda da görünür kalır.
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


## Nesne işlem menüleri

Bina, cihaz ve bağlantı çizgisinde sağ tık; nesne veya ayrıntı panelindeki “⋯” düğmesi; odaklanmış nesnede Shift+F10 aynı menüyü açar. Ok tuşları, Home ve End seçenekler arasında gezinir; Escape yalnızca menüyü kapatır ve odağı geri verir. Menü bina içi pencerede pencere sınırlarını korur.

Cihazda ayrıntılar, kimliğe göre doğrudan bağlantılar ve varsa yönetim IP’sini kopyalama; binada cihazları açma ve bağlantılı binaları gösterme; bağlantıda ayrıntılar ve açık kaynak/hedef kısayolları sunulur. Desteklenen bağlantıların düzenlemesi yetki ve Düzenleme modu gerektirir. Menü açılışı veri sorgusu, yenileme, ping veya SSH başlatmaz. Aynı seçeneklere mobilde ayrıntı panelinin normal boyutlu düğmesinden de erişilir.

Regresyon: tests/incident-e2e/topology-object-menu.spec.ts, mevcut topology-workspace.spec.ts ile izole incident regresyon ortamında çalıştırılır. Doğrulama sonuçları design-qa.md içinde kayıtlıdır. Bina atama regresyonu, doğrudan kat atamasını koruma/temizleme ve çakışmada tüm isteği geri alma davranışını da doğrular.


## Bina ataması ve doğrudan kat kaydı

Aynı binaya yeniden atanan cihazın doğrudan kat kaydı korunur. Farklı binaya taşıma veya bina atamasını kaldırma eski kat kaydını temizler. Kabinete bağlı cihazın konumu kabinet üzerinden belirlenir. Birden çok cihazın atamasında herhangi bir cihazın bina, kat veya kabineti arada değişirse istek 409 döner ve bu isteğin önceki yazmaları da geri alınır; diğer oturumun kaydı korunur.

`npm run test:topology-building` sentetik atama, bağlantı ve yerleşim kontrollerini çalıştırır. Gerçek PostgreSQL atama regresyonu yalnız `npm run test:incidents:regression` içindeki ayrı incident veritabanında, açık opt-in ile çalışır; mevcut kurulum veritabanına bağlanmaz.
