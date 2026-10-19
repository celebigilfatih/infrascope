# Yapılandırma Geçmişi

`/network/config-revisions` ortak PageHeading, SemanticBadge ve çalışma alanı tasarımını kullanır. Yönetici olayları ile tam yapılandırma yedekleri ayrı sekmelerdedir.

- Cihaz/VDOM listesi `/api/firewalls` üzerinden okunur. Çoklu bağlantıda seçim gerekir. Envantere bağlanmamış profiller için eşleştirme yönlendirmesi gösterilir.
- Olaylar yalnızca seçili `/api/firewalls/:connectorId/events?category=config&limit=100&page=1` üzerinden alınır. Yanıt zarfı, FortiAnalyzer kimliği ve her satırın cihaz/VDOM/kategori kapsamı doğrulanır. Genel FortiAnalyzer varsayılan profili çağrılmaz.
- Devre dışı profilde olay istenmez. FortiAnalyzer kimliği yoksa açık eşleştirme durumu gösterilir. Önbellek/önceki veri ile erişim hatası ve doğrulanmış boş sonuç ayrılır.
- Arama ve işlem türü filtresi alınan en fazla 100 olayda yerel uygulanır; bu sınır ve kaynak toplamı arayüzde belirtilir. Onarlı sayfalama, mobil kartlar ve işlem ayrıntıları vardır. Kaynak açıklamaları aynen gösterilir. Sürüm veya dosya farkı olarak sunulmaz.
- Sürüm bilgileri seçili envanter cihazının `/api/integrations/nms/devices/:deviceId/backups` uç noktasından alınır (en fazla son 500 yedek). Yedekler tüm cihazı ve birden fazla VDOM'u kapsayabilir. Son kayıt canlı yapılandırma olarak etiketlenmez.
- Çalışan ve başlangıç yapılandırmaları ayrıdır. Aynı türde, farklı kimlikli, tarih sırası doğru iki sürüm gerekir. İçerik yalnızca Karşılaştır eyleminde, aynı cihazın kapsamlı yedek uç noktalarından okunur. Mevcut ADMIN/EDITOR yetki ve sunucu dosya bütünlüğü doğrulaması korunur. Salt liste okuyucusu içeriği isteyemez.
- Karşılaştırma eklenen/kaldırılan satırları eski/yeni satır numaraları ve metin işaretleriyle gösterir. Satır sonu CRLF/LF farkı yok sayılır. Ortak önek/son ek ayrılır; LCS en fazla 2 milyon hücre, dosya başına 500 bin karakter/20 bin satır; görünüm sayfası 200 satırdır. Büyük dosyada mevcut yedek indirme ekranına yönlendirilir.
- Cihaz, VDOM, tür veya sürüm seçimi değiştiğinde eski içerik temizlenir; bekleyen okumalar iptal edilir. Tam dosyalar tarayıcı depolamasına, loga veya analitik servisine yazılmaz. Yenileme hatasında önceki metadata açık etiketle korunur, karşılaştırma kapatılır.
- Tarihler Europe/Istanbul (TSİ), eksik tarih/değer bilinmiyor olarak gösterilir. Güvenli Türkçe hata metinleri sağlayıcının ham hata mesajlarını içermez.

Doğrulama: `node scripts/check-config-history.cjs`, ilgili dosyalarda ESLint ve TypeScript. Tarayıcı kontrolleri gerçek bileşen + ayrı sentetik GET taşımasıyla yapılır; gerçek cihaz ayarı veya yedek oluşturulmaz.

## Verification boundary

See design-qa.md for the completed review, exact checks and retained evidence. Browser source responses are synthetic; private PostgreSQL is used only for fixture metadata and current-account authorization. No live FortiGate, customer database, backup file or notification recipient is used. The existing source factories, bounded read contracts and backup authorization remain in use.
