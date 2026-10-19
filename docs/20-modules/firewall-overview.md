# Güvenlik duvarı genel görünümü

`/network/firewall`, ortak PageHeading, yeşil Lucide ikonları ve anlamsal durum rozetleriyle cihaz sağlığını, güvenlik özetini, kayıtlı izleme kaynaklarını, SD-WAN, arabirim ve SSL-VPN kullanıcı okumalarını gösterir. Çoklu bağlantıda cihaz/VDOM seçimi zorunludur; tek bağlı cihaz otomatik seçilir. Envantere bağlanmamış profiller açıkça ayrılır. Devre dışı profil için kaynak okuması başlatılmaz.

Veriler mevcut `/api/firewalls/:id/...` okuma uçlarından alınır. Yanıtın connectorId, deviceId, VDOM ve varsa configId alanları seçili hedefle eşleşmelidir. Kaynak ve toplama zamanı doğrulanır. Cihaz değiştirildiğinde önceki hedefin verisi gösterilmez; istek iptal edilir. Aynı okumanın yenilenmesi başarısızsa önceki veri tarih/kaynak ve uyarıyla korunur. Arama/sayfalama sonuçları ayrı istek kimliği taşır; önceki sorgunun satırları yeni sorgunun altına taşınmaz.

Örnek cihaz adı, seri numarası, sürüm ve eksik ölçümler için kullanılan sıfırlar kaldırılmıştır. Gerçek sıfır korunur; eksik CPU/bellek/oturum/MFA ve HA bilgileri bilinmiyor olarak gösterilir. CPU/bellekte güncel REST ölçümü, yoksa güncel SNMP ölçümü; güncel ölçüm yoksa tarihli önceki ölçüm tercih edilir. SNMP ölçümleri cihaz düzeyindedir. Her ölçümün kaynağı gösterilir. Kaynakta eksik model/seri/sürüm için envanter bilgisine açıkça belirtilmiş geri dönüş vardır.

Güvenlik özeti politika toplamı ve SSL-VPN kullanıcı kaydı sayısını gösterir; risk puanı veya kaynağı doğrulanmamış olay sayısı üretmez. Politika/VPN verileri seçili VDOM'a aittir. VPN aramasındaki sonuç sayısı genel kullanıcı sayısı gibi sunulmaz. FortiAnalyzer'ın global durum/ADOM listesi seçili cihazın güvenliği olarak sorgulanmaz. Kaynak matrisi eşleştirilmiş cihazın kayıtlarını gösterir; kayıt yoksa “Kaynak bilgisi yok” der. Ham kaynak hata açıklamaları yerine Türkçe güvenli hata metinleri kullanılır. FortiCare destek seviyesi lisans geçerliliği olarak gösterilmez.

Arabirim ve SSL-VPN listeleri sunucu tarafında 10'lu sayfalanır; arama 300 ms gecikmeyle uygulanır. Masaüstünde tablolar, mobilde kartlar kullanılır. Kayıtlı envanter fallback arabirimlerinin kaynağın doldurduğu sıfır trafik değerleri ve bağlantı durumu doğrulanmış ölçüm sayılmaz. Trafik bayt sayaçlarıdır; hat kapasitesinden ayrılır. Eksik/başarısız veri ile doğrulanmış boş liste farklı gösterilir.

Ortak `FirewallSourceMatrix` bileşeni REST, SNMP, SSH, FortiAnalyzer, olay önbelleği ve veritabanı kaynaklarını; son kontrol ve başarılı veri zamanlarıyla gösterir. Geçersiz tarih ekranı bozmaz. Bu değişiklik cihaz ayrıntıları ekranına da aynı kaynak dilini taşır.

Kontroller: `node scripts/check-firewall-overview.cjs`, kapsamlı TypeScript/ESLint, mevcut firewall okuma/kaynak kontrolleri ve ayrı sentetik tarayıcı önizlemesi. Gerçek kurulumda QA amacıyla ayar/kimlik bilgisi kaydı, probe veya envanter senkronizasyonu çalıştırılmaz.

## Verification boundary

See design-qa.md for the completed review, exact checks and retained evidence. Browser source responses are synthetic; private PostgreSQL is used only for fixture metadata and current-account authorization. No live FortiGate, customer database, backup file or notification recipient is used. The existing source factories, bounded read contracts and backup authorization remain in use.
