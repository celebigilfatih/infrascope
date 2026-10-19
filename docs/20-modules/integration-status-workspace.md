# Entegrasyon durumu

`/integrations/status` ortak başlık, yeşil Lucide ikonları, anlamsal durum rozetleri, arama/filtreler ve mobil/koyu tema düzenini kullanır. Etkin bağlantılar, son kontrolü başarılı kayıtlar, dikkat gereken kayıtlar ve yapılandırılmamış türler ayrı sayılır. Filtreler bağlantı sonucunu, aktarım sorunlarını, devre dışı ve yapılandırılmamış durumları ayırır. Dikkat gerekenler ve başarılı kontrol sayısı örtüşebilir: bağlantısı başarılı olan bir kaydın aktarımı kısmi kalmış olabilir.

GET `/api/integrations/status` yalnızca veritabanındaki kayıtları okur. Bağlantı testi, envanter aktarımı veya yeni kaynak oturumu başlatmaz. Aktif veritabanı kullanıcısının `settings.read` yetkisini kontrol eder ve `private, no-store` döndürür. Yenileme hata verirse istemci önceki sonuçları ve tarihini korur; eski isteğin geç gelen yanıtı yeni sonucu değiştiremez.

Sunucu adresinin bulunması bir bağlantı başarısı değildir. Sabit sağlık yüzdeleri ve yeni tamamlanmış aktarımı “senkronizasyon sürüyor” olarak gösterme davranışı kaldırılmıştır. Bağlantı kontrol tarihi ve senkronizasyon tarihi ayrı alanlardır. Başarı yalnızca kayıtlı bir kontrol sonucu varsa gösterilir. Sonuç, kontrol anına aittir; sürekli erişilebilirlik garantisi değildir.

FortiGate kayıtları her bağlantı/VDOM için ayrı gösterilir. REST kaynağının kontrol sonucu, zamanı, gecikmesi ve izin verilen hata kodu okunur. SNMP gibi yedek kaynakların çalışması REST bağlantısının başarılı olduğu anlamına gelmez. Envanter aktarımı en son `IntegrationSyncLog` kaydından alınır; bu günlük profil düzeyindedir, VDOM bazında ayrım tutulmadığı ekranda belirtilir. FortiGate profilindeki `lastSyncAt/lastSyncStatus` alanları probe sırasında da değiştiği için aktarım geçmişi olarak kullanılmaz. VMware ve Zabbix için ayrıntılı günlük yoksa profilin son aktarım bilgisine açıkça işaretlenmiş geri dönüş yapılır. FortiAnalyzer olay toplayıcısı envanter aktarımı olarak gösterilmez; ayrıntılı güncellik bilgisi kendi entegrasyon ekranındadır.

VMware/FortiAnalyzer/Zabbix gibi kalıcı kontrol geçmişi bulunmayan profiller “Kontrol kaydı yok” gösterir. Ayrı entegrasyon ekranlarındaki oturumluk test sonuçları burada uydurulmaz. AWS, Azure, API ve SNMP dahil tüm kayıtlı türler listelenir. Yönetim ekranı olmayan türlere hayali bağlantı verilmez. Devre dışı profiller yapılandırılmamış sayılmaz.

NMS cihaz bazında yapılandırılır; `IntegrationConfig` SNMP kayıtlarından bağımsız bir hizmet kartıyla gösterilir. Kayıtlı cihaz ve izleme açık cihaz sayıları ile son ölçüm tarihi, bağlantı kontrolünden ayrı tutulur. Tek bir ölçüm tüm cihazların bağlı olduğunu kanıtlamaz. Bu bilgi okunamazsa sayılar sıfıra veya hizmet yapılandırılmamış durumuna çevrilmez; diğer entegrasyonlar gösterilmeye devam eder.

Kimlik bilgileri, şifreli zarflar, URL kullanıcı/parola ve sorgu parametreleri, ham kaynak hataları ve günlük mesajları istemciye aktarılmaz. Hata kodları izin verilen Türkçe açıklama/eylem metinleriyle gösterilir; bilinmeyen kodlar genel açıklamaya çevrilir. Aktarım hatalarında kayıtlı hata sayısı gösterilir; eksik sayı sıfır yapılmaz.

Kontroller: `node scripts/check-integration-status-workspace.cjs`, mevcut envanter aktarımı regresyonları, TypeScript, kapsamlı ESLint ve sentetik verili tarayıcı önizlemesi. Gerçek kaynaklarda QA amaçlı bağlantı testi veya aktarım çalıştırılmaz.

## Verification boundary

The API is explicitly dynamic and private/no-store. It serializes only selected metadata; encrypted credentials, provider diagnostics and raw logs stay on the server. No fake health percentage or in-progress sync is inferred. Existing status/message summaries remain for the in-repository inventory regression; the workspace consumes the typed evidence fields. Separate settings.read authorization uses the current ACTIVE database account, including when a signed JWT contains an older role.

The focused regression uses actual routes and disposable PostgreSQL for profile/connector/log/NMS metadata and current-account checks. Failure branches use synthetic store or HTTP responses; they do not disrupt a real database. All fixture profiles remain disabled, and no probe or inventory-sync endpoint is invoked by the status page. Allowed management links navigate to existing workspaces; unavailable management pages are not invented. The inventory regression fixture runs the actual current VMware page effects/actions against synthetic source/ORM and validates persisted history rather than relying on a state-hook index.

See design-qa.md for the final results, failed attempts and screenshots. No customer appliance, installation database, notification recipient or deployment is used.
