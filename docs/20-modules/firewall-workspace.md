# Güvenlik Duvarları çalışma alanı

`/integrations/firewall` ortak yeşil ikon, PageHeading, anlamsal rozet, özet kartı, Türkçe arama/filtre ve responsive pencere dilini kullanır. Liste okuması uzak FortiGate bağlantısı başlatmaz.

## Durumların anlamı

- Kayıtlı profilin etkinliği, son REST kontrolü, izleme modu (tam/kısıtlı/veri alınamıyor) ve envanter aktarımı ayrı gösterilir. SNMP/SSH/FortiAnalyzer kaynakları REST başarısızken veri sağlayabilir; bu cihazın tümden çevrimdışı olduğu anlamına gelmez.
- REST sonucu kaydedilmiş kaynak kontrolü ve zamanıdır; sürekli erişilebilirlik garantisi değildir. Kaynak/tarih yoksa başarısızlık veya sıfır uydurulmaz.
- `lastSyncAt/lastSyncStatus` alanları mevcut probe akışında `connected/unavailable:*` olarak güncellendiğinden envanter aktarımı sayılmaz. Listeye eklenen `lastInventorySync` ve yönetim penceresindeki son deneme, yalnız IntegrationSyncLog üzerinden gelir. Kısmi/başarısız sonuçlar, süre, işlenen ve hata sayısı ayrılır. Günlük profil düzeyindedir; toplam cihaz envanteri veya VDOM başına sayım iddiası yoktur.
- Üstteki sayılar tüm kayıtları kapsar; eski, envantere bağlanmamış profiller toplamda bulunur. Filtreler arama, REST sonucu ve profil etkinliğidir. Başlangıç yükleme, hata, boş liste ve filtre sonucu ayrıdır; yenileme hatasında önceki kayıtlar korunur.

## Bağlantıyı yönet

`FirewallWorkspaceDialog` üç sekme sunar: Bağlantı, Bağlantı testi, Senkronizasyon. GET `/api/firewalls/workspace?configId=...&vdom=...` salt veritabanı okur, seçili hedefi doğrular, parolalar/API anahtarı/CA içeriği/ham günlük hatalarını döndürmez. `private, no-store` kullanılır.

- Yönetim adresi ve VDOM envanter cihazının kimliğine bağlıdır; bu formda değiştirilmez. İlgili kimlik inceleme, sertifika ve kaynak işlemleri mevcut ayrıntı ekranında korunmuştur.
- REST yöntemi kullanıcı/parola veya API erişim anahtarıdır. Boş girdi aynı yöntemin kayıtlı gizli değerini korur; kullanıcı değişirse parola yeniden gerekir. Yöntem değişince diğer yöntemin gizli değeri kaldırılır; UI bu etkiyi açıklar. Değişiklik özetinde gizli değerler gösterilmez.
- Ayarlar immutable configId ile aynı profile yazılır. Ad, adres/VDOM kimliği, SNMP yapılandırması, CA güven materyali ve diğer profil alanları korunur. Kimlik bilgileri/takvim aynı entegrasyon profilinin tüm VDOM bağlantıları için ortaktır.
- Aralık 1–1440 tam dakikadır. Entegrasyon etkinliği otomatik aktarım ve REST okumalarında kullanılır; ayrı NMS/SNMP ölçümlerini otomatik durdurmaz.
- Envantere arabirim, VLAN, politika ve adres kayıtları aktarılır. VIP/SD-WAN bu servis akışında ayrı kaydedilmediği için aktarım vaat edilmez. Mevcut bayraklar REST/both yönteminde korunur. Yalnız SNMP seçilince REST gerektiren bayraklar kapatılır; sadece arabirimler kullanılabilir. Modül seçimlerinin bazı canlı veri okumalarını da etkileyebildiği açıklanır.
- Kaydedilmemiş değişiklikler varken yenileme ve senkronizasyon kapalıdır; geri alma ve kaydetmeden kapatma vardır. Kaydetme uzak cihazı yapılandırmaz ve otomatik bağlantı testi yapmaz.
- POST workspace `test-saved` seçili hedefin sunucuda saklanan erişim bilgilerini; `test-draft` girilmiş yeni kimlik bilgilerini kullanır. Form testi kayıtlı gizli değer ödünç almaz. Her ikisi geçici FortiGate istemcisinden getStatus okur ve dispose eder; envanter veya kaynak/probe geçmişi yazmaz. Başarılı/başarısız/sonuç alınamayan durumlar ayrılır; hedef, kapsam ve zaman gösterilir.
- Manuel aktarım mevcut `/api/integrations/fortigate` sync akışına açık configId/VDOM ile gider. Bu işlem InfraScope envanterine yazabilir; cihaz politikası değiştirmez. Kısmi başarısız cevaplar başarı olarak gösterilmez.
- Mevcut inventory-scheduler birden fazla etkin FORTIGATE profili varken otomatik aktarımı atlar. Liste verilerinden bu koşul görülürse senkronizasyon sekmesinde açıklanır; manuel hedef seçimi çalışır. Zamanlayıcı davranışı bu iş kapsamında değiştirilmemiştir.
- Etkin rol `/api/auth/me` üzerinden okunur. Görüntüleme rolleri ayrıntıları açabilir; ekleme/kayıt/test/aktarım/kaldırma yönetici gerektirir. Yeni API kaynak/işlem iznini aktif veritabanı kullanıcısıyla ayrıca doğrular.
- HTTP ve success birlikte değerlendirilir. Kaydetme/test dönüşünde hedef, sync dönüşünde status/success ve configId/VDOM birlikte doğrulanır. Ağ, 5xx veya bozuk yazma cevabında sonuç belirsizdir; yenilemeden tekrar yazılmaz, otomatik tekrar yoktur. Ham servis/veritabanı mesajı kullanıcıya verilmez. Lisans kapasitesi hatası yetki hatasından ayrılır.

## Ekleme ve mevcut işlemler

Onboarding cihaz ve yönetim alanlarını, REST erişimini, SNMP/SSH alternatif kaynaklarını ikonlu bölümlere ayırır. Kayıtla ilk REST kontrolünün birlikte çalıştığı, kontrol başarısız olsa da cihaz kaydının korunabildiği açıklanır. Türkçe alan/sayı doğrulaması, gönderim sırasında kapanma/çift gönderim engeli ve sonucu belirsiz kayıtta yenilemeye kadar tekrar açma engeli vardır. Gizli değerler kapanınca temizlenen formda tutulur. Var olan backend cihaz limiti, şifreleme, kimlik ve fail-open probe akışı korunur.

Eski profil bağlama, cihaz ayrıntıları ve bağlantı kaldırma uçları korunur. Kaldırma cihazın kendisini veya FortiGate politikasını silmez. Gerçek cihaz testi, aktarımı, erişim bilgisi kaydı veya kaldırma QA için yapılmaz.

## Doğrulama

`node scripts/check-firewall-workspace.cjs`: gerçek TypeScript/şifreleme/route modülleri ve sentetik ORM/taşıma ile salt metadata okuması, envanter/probe ayrımı, gizli alanları dışarı vermeme, hedef/VDOM kontrolü, aynı profilde sır koruma, yöntem değiştirme, TLS/SNMP materyalini koruma, devre dışı durumu, SNMP kapsamı, rol ve belirsiz yazma davranışlarını kontrol eder. Gerçek servis, ortam anahtarı veya veritabanı kullanılmaz.

## Review contracts (19 October 2026)

Settings saves require the observed updatedAt and host. An atomic update compares the persisted configuration, version, enabled state, interval and linked connector identity. Conflicts return SETTINGS_CHANGED/409 without invalidating clients; refresh is required before retry. Concurrent PostgreSQL saves must commit only one draft. Credentials remain encrypted and inactive authentication fields are removed when the method changes.

List, workspace, generic resource, event, SNMP health and VPN reads use the existing current-ACTIVE-account firewall/read guard. Workspace actions and onboarding use firewall/write before parsing or source access. Successful metadata reads are private/no-store. Test responses include the actual host, VDOM, profile and server observation time, which the dialog validates. Probes use the existing ephemeral factory and dispose their session; no duplicate client lifecycle or alarm engine is introduced.

Validation is recorded in design-qa.md. The focused browser suite uses actual routes and a disposable PostgreSQL database for metadata, updates, conflicts, removal and authorization. Allowed appliance probes/syncs and source reads use explicit synthetic replies inside an internal network; they do not certify any customer FortiOS installation. The scheduler's existing multi-profile skip is unchanged. Client aborts suppress obsolete UI results but do not promise cancellation of an operation already issued on the server.
