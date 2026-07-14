# FortiGate Firewall Yönetim Modülü Mevcut Durum Denetimi

**Durum:** Analiz belgesi

**Tarih:** 2026-07-13

**Kapsam:** FortiGate, FortiAnalyzer, NMS/SNMP/SSH, firewall write yüzeyi, RBAC ve audit

**Kod değişikliği:** Yok

## Değerlendirme yöntemi

- **Observed:** Kaynak kodda doğrudan görülen davranış.
- **Inferred:** Birden fazla gözlemin birlikte işaret ettiği, uygulama testi yapılmadan kesinleştirilemeyen sonuç.
- **Proposed:** Hedef mimari için önerilen davranış; mevcut kodun özelliği değildir.

Bu denetim, ürün anayasasındaki sahte veri göstermeme, cache kaynağını belirtme, entegrasyonlarda timeout/backoff/session lifecycle, singleton client, tek Prisma client, production TLS doğrulaması, şifreli credential ve immutable audit kurallarını esas alır ([CONSTITUTION.md:31](../../00-product/CONSTITUTION.md#3-pazarlığa-kapalı-ilkeler-non-negotiables)). Yeni bir firewall bounded context ve authz modeli oluşturulacağı için uygulamadan önce ADR zorunludur.

## Yönetici özeti

Mevcut sistem FortiGate REST API'den önemli miktarda read verisi alabiliyor; FortiAnalyzer tarafı ise güvenlik ve kimlik doğrulama olaylarında daha olgun bir cache-first kaynak. Python NMS servisinde gerçek SNMP polling ve temel SSH desteği bulunuyor. Buna rağmen bu kaynaklar tek bir cihaz kimliği, capability durumu ve freshness sözleşmesi altında birleşmiyor.

En önemli risk, karantina endpoint'inin authenticated herhangi bir kullanıcı tarafından preview, ayrı permission, approval ve audit olmadan gerçek FortiGate değişikliği yapabilmesidir. Credential'ların JSON/DB alanlarında plaintext tutulması, FortiGate servisinin kendi Prisma client'ını açması, cihazdan bağımsız cache anahtarları ve kaynak hatalarının boş listeye çevrilmesi de production readiness açısından öncelikli eksiklerdir.

Önerilen yön, REST başarısız olduğunda cihaz eklemeyi engellemeyen hibrit modeldir: `FULL`, `LIMITED` ve `UNAVAILABLE` izleme durumları; bunlardan bağımsız ve varsayılan kapalı write capability; V1 read-only, V2 approval kontrollü write.

## 1. Mevcut durum

### FortiGate

- **Observed:** `FortiGateService`, cookie tabanlı login/logout ve token fallback destekler; REST istekleri merkezi TLS helper üzerinden gider ([fortigate.ts:173](../../../lib/integrations/fortigate.ts#L173), [fortigate.ts:194](../../../lib/integrations/fortigate.ts#L194), [fortigate.ts:291](../../../lib/integrations/fortigate.ts#L291)).
- **Observed:** Interface, policy, address, VIP, HA, SSL-VPN, IPsec ve karantina verileri REST endpoint'lerinden okunur ([fortigate.ts:338](../../../lib/integrations/fortigate.ts#L338), [fortigate.ts:425](../../../lib/integrations/fortigate.ts#L425), [fortigate.ts:467](../../../lib/integrations/fortigate.ts#L467), [fortigate.ts:497](../../../lib/integrations/fortigate.ts#L497), [fortigate.ts:545](../../../lib/integrations/fortigate.ts#L545), [fortigate.ts:886](../../../lib/integrations/fortigate.ts#L886), [fortigate.ts:1185](../../../lib/integrations/fortigate.ts#L1185), [fortigate.ts:1341](../../../lib/integrations/fortigate.ts#L1341)).
- **Observed:** TypeScript içindeki SNMP client gerçek SNMP protokolü uygulamaz; HTTP placeholder ve boş `walk()` kullanır. `fetchInterfacesSNMP()` de boş liste döndürür ([fortigate.ts:148](../../../lib/integrations/fortigate.ts#L148), [fortigate.ts:386](../../../lib/integrations/fortigate.ts#L386)).
- **Observed:** Servis, anayasanın tek Prisma client kuralına aykırı olarak `new PrismaClient()` oluşturur ([fortigate.ts:10](../../../lib/integrations/fortigate.ts#L10)).
- **Observed:** Envanter kimliği host değerini `fortiDeviceId` olarak kullanır ve yeni cihazı bağlantı doğrulanmadan `ACTIVE` oluşturur ([fortigate.ts:577](../../../lib/integrations/fortigate.ts#L577)).

### FortiAnalyzer

- **Observed:** JSON-RPC oturumu, logout, global host-scoped state ve shared service üretimi vardır ([fortianalyzer.ts:141](../../../lib/integrations/fortianalyzer.ts#L141), [fortianalyzer.ts:208](../../../lib/integrations/fortianalyzer.ts#L208), [fortianalyzer.ts:275](../../../lib/integrations/fortianalyzer.ts#L275), [fortianalyzer.ts:1139](../../../lib/integrations/fortianalyzer.ts#L1139)).
- **Observed:** Alarm query katmanı önce PostgreSQL `cached_events`, sonra FortiAnalyzer canlı sorgu kullanır ([base.ts:140](../../../lib/alarms/queries/base.ts#L140)). Admin login ve VPN login/tunnel olayları özel query'lerle alınır ([auth-events.ts:24](../../../lib/alarms/queries/auth-events.ts#L24), [auth-events.ts:106](../../../lib/alarms/queries/auth-events.ts#L106), [auth-events.ts:151](../../../lib/alarms/queries/auth-events.ts#L151)).
- **Observed:** FortiAnalyzer config kaydetme akışı, password değerini `IntegrationConfig.config` JSON'una yazar ([fortianalyzer route:96](../../../app/api/integrations/fortianalyzer/route.ts#L96)). Şemanın yorumu “Encrypted credentials” dese de bu route'ta encryption çağrısı yoktur ([schema.prisma:838](../../../prisma/schema.prisma#L838)).

### NMS, SNMP ve SSH

- **Observed:** Python NMS, Fortinet vendor tespiti ve CPU/memory/temperature OID'leri içerir ([orchestrator.py:165](../../../nms_service/orchestrator.py#L165), [vendor_oids.py:203](../../../nms_service/snmp/vendor_oids.py#L203)).
- **Resolved:** SSH unknown host key kabulü kaldırıldı. Bağlantı yalnız ADMIN tarafından onaylanmış SHA-256 fingerprint ile açılır; mismatch bağlantıyı durdurur ([poller.py](../../../nms_service/ssh/poller.py)).
- **Resolved:** Serbest komut yürütme kaldırıldı. FortiOS için yalnız `get system status` ve `show full-configuration` read operasyonları allowlist içindedir ([poller.py](../../../nms_service/ssh/poller.py)).
- **Resolved:** SNMP community, SSH parola ve config backup metni AES-256-GCM ile korunur; Python sidecar plaintext credential kabul etmez ([credentials.py](../../../nms_service/security/credentials.py), [integration-credentials.ts](../../../lib/security/integration-credentials.ts)).
- **Inferred:** NMS, FortiGate health için değerlidir; ancak mevcut haliyle REST'in policy/address/VIP/VPN verisini karşılayan bir alternatif değildir.

## 2. Hangi veri hangi kaynaktan geliyor?

| Veri | Bugünkü kaynak | Değerlendirme |
|---|---|---|
| Envanter kaydı | `Device` + FortiGate sync | Host tabanlı kimlik; çoklu VDOM için yetersiz |
| Sistem/bağlantı durumu | FortiGate REST test/sync | Config varlığı UI'da yanlışlıkla connected sayılabiliyor |
| Interface/port | FortiGate REST; Python NMS SNMP ayrı akış | TypeScript SNMP yolu tamamlanmamış |
| Policy/address/VIP | FortiGate REST, sonra DB snapshot | Current state için doğru authoritative kaynak REST |
| Aktif SSL-VPN/IPsec/HA | FortiGate REST monitor/CMDB | REST yoksa kesin güncel veri yok |
| Admin ve VPN login olayları | `cached_events` + FortiAnalyzer; bazı direkt FortiGate event query'leri | FortiAnalyzer ana olay kaynağı olmalı |
| Güvenlik olayları | FortiAnalyzer/FortiView/event cache | Ürünün mevcut log mimarisiyle uyumlu |
| Health metrikleri | Python NMS SNMP | Fortinet OID kapsamı mevcut ama capability modeli yok |
| Config backup | Python NMS SSH | Pinned host key, FortiOS allowlist, encrypted storage, checksum ve audit uygulanmış durumda |
| Karantina read/write | FortiGate REST | Write koruması yetersiz |

Ayrıntılı kararlar [FORTIGATE_DATA_SOURCE_MATRIX.md](./FORTIGATE_DATA_SOURCE_MATRIX.md) içindedir.

## 3. Eksik kalan veriler

- REST/SNMP/SSH/FortiAnalyzer capability sonuçlarını cihaz bazında saklayan typed connector yok.
- Serial/devid + VDOM ile kalıcı cihaz kimliği ve FortiAnalyzer korelasyonu yok.
- Kaynak bazında `lastSuccessAt`, `lastAttemptAt`, hata sınıfı ve backoff durumu yok.
- REST başarısız olduğunda SNMP/SSH/FortiAnalyzer ile onboarding'i tamamlayan akış yok.
- Read cevaplarında `available`, `stale`, `unavailable` ayrımı standart değil.
- Address group, service object, policy package/VDOM ayrıntısı için kapsam sözleşmesi net değil.
- SSH trust tamamlandı; kalan ürün işi trust değişimi için merkezi güvenlik alarmı ve planlı backup scheduler'ıdır.
- Write için current-state hash, preview, approval, idempotency, operation attempt ve read-after-write doğrulaması yok.

## 4. REST API'ye zorunlu bağlı özellikler

Current-state açısından policy, address object, VIP/NAT, aktif SSL-VPN oturumu, aktif IPsec durumu, HA ayrıntısı ve karantina state'i REST'e bağlıdır. FortiAnalyzer bunların değişiklik/event geçmişini verebilir, fakat mevcut CMDB listesinin yerine geçmez. Write işlemlerinin tamamı yalnızca trusted REST üzerinden yapılmalıdır; SSH write kanalı olmamalıdır.

## 5. FortiAnalyzer'dan alınabilecek özellikler

- Başarısız/başarılı admin login olayları.
- SSL-VPN authentication ve tunnel olayları.
- IPsec up/down ve güvenlik olayları.
- Config/policy değişiklik event'i ve mümkünse aktör attribution.
- IPS, web, IOC ve diğer güvenlik logları.

FortiAnalyzer event kaynağıdır; current policy/address/VIP envanterinin authoritative kaynağı değildir.

## 6. SNMP/SSH ile alınabilecek özellikler

### SNMP

- Erişilebilirlik, uptime, CPU, memory, temperature.
- IF-MIB üzerinden interface admin/oper state ve sayaçlar.
- Model, serial ve firmware için desteklenen MIB'lerde identity keşfi.

### SSH

- REST yokken sınırlı kimlik/health doğrulaması.
- Read-only config backup.
- Destek tanısı için kontrollü komut seti.

SSH, policy/address/VIP current state için genel parser veya write kanalı olarak kullanılmamalıdır.

## 7. Sertifika hatasında çalışacak “Kısıtlı İzleme” modu

**Proposed:** TLS expiry, trust veya hostname hatası REST capability'yi kapatır fakat cihaz kaydını engellemez. SNMP, SSH veya FortiAnalyzer'dan en az biri güncel veri üretebiliyorsa cihaz `LIMITED` olur. UI hangi özelliklerin unavailable olduğunu neden ve timestamp ile gösterir. Sertifika otomatik kabul edilmez; `NODE_TLS_REJECT_UNAUTHORIZED=0` ve genel `rejectUnauthorized=false` geri getirilmez.

## 8. Sertifika geçerliyse “Tam İzleme” modu

**Proposed:** TLS chain/hostname, authentication ve read probe başarılıysa cihaz `FULL` olur. REST probe 5 dakikada bir çalışır; ardışık hatalarda en fazla 60 dakikaya kadar exponential backoff uygulanır. Sertifika düzeldiğinde başarılı probe cihazı otomatik `FULL` durumuna yükseltir. Write yine ayrıca `writeEnabled`, permission ve approval gerektirir.

## 9. Read-only V1 kapsamı

- Cihaz onboarding ve capability probe.
- `FULL/LIMITED/UNAVAILABLE` durumu.
- Status, interface, policy, address, VIP, SSL-VPN, IPsec, HA ve auth-event read API'leri.
- FortiAnalyzer serial/devid/VDOM korelasyonu.
- SNMP health ve SSH config backup.
- Source/freshness envelope, stale veri gösterimi ve otomatik recovery.
- Çoklu FortiGate ve VDOM desteği.

## 10. Write-enabled V2 kapsamı

- Approval kontrollü karantina add/remove.
- Address object create/update/disable; delete yalnız referans analizi ve yüksek risk onayıyla.
- Policy enable/disable.
- En son aşamada süreli ve dar kapsamlı internet erişim policy'si.
- Genel REST/CLI passthrough yok.

## 11. Karantina yönetimi tasarımı

### Mevcut risk

- **Observed:** `POST` ve `DELETE /api/security/quarantine` doğrudan servis metodunu çağırır ([quarantine route:80](../../../app/api/security/quarantine/route.ts#L80), [quarantine route:116](../../../app/api/security/quarantine/route.ts#L116)).
- **Observed:** Servis `/monitor/user/banned/add_users` ve `/clear_users` endpoint'lerine doğrudan POST yapar ([fortigate.ts:1391](../../../lib/integrations/fortigate.ts#L1391), [fortigate.ts:1407](../../../lib/integrations/fortigate.ts#L1407)).
- **Observed:** Route middleware permission map'inde olmadığı için yalnız authenticated session kontrolü alır ([middleware.ts:20](../../../middleware.ts#L20), [middleware.ts:136](../../../middleware.ts#L136)).

### Hedef

Karantina add `MEDIUM`, remove `HIGH` riskli change request olmalıdır. Preview IP, VDOM, expiry, reason, mevcut state ve hedef state'i göstermelidir. Apply yalnız internal worker tarafından, current-state hash doğrulandıktan sonra yapılmalıdır.

## 12. Firewall address object yönetimi tasarımı

Create/update için canonical object adı, type, subnet/FQDN, interface/VDOM ve referans etkisi preview'da gösterilir. Disable/delete öncesi policy ve group referansları çözülür. Referanslı object fiziksel silinmez; işlem engellenir veya ayrı CRITICAL plan gerektirir. REST response sonrasında object tekrar okunarak beklenen state doğrulanır.

## 13. İnternet erişimi açma/policy yönetimi için güvenlik modeli

- İlk V2 sürümünde varsayılan 8 saat, en fazla 24 saat süreli policy.
- `any/any`, servicesiz, süresiz veya kaynak cihaz/IP ile bağlanmamış istek reddedilir.
- Policy placement, NAT, logging, source/destination interface ve service açık preview'da gösterilir.
- Talep eden ve onaylayan farklı ADMIN olmalıdır.
- Süre dolumunda kapatma ayrı idempotent operation olarak doğrulanır ve audit edilir.

## 14. RBAC/permission ihtiyaçları

Mevcut `Resource` union'ı firewall içermez ve action modeli yalnız `read/write/delete` seviyesindedir ([permission-policy.ts:1](../../../lib/auth/permission-policy.ts#L1)). Hedef permission seti:

- `firewall:read`
- `firewall:configure`
- `firewall:request_change`
- `firewall:approve_change`
- `firewall:emergency_quarantine`

Execution yetkisi kullanıcı rolüne verilmez; yalnız internal worker service identity'sinde bulunur.

## 15. Audit log ihtiyaçları

Mevcut `AuditLog` append-only kullanım için alanlar sunar ([schema.prisma:455](../../../prisma/schema.prisma#L455)); ancak `logAudit()` hata yutar ve ana akışı sürdürür ([logger.ts:16](../../../lib/audit/logger.ts#L16)). Read olaylarında fail-open kabul edilebilir; dış write öncesi audit reservation ve change request kaydı fail-closed olmalıdır.

Her write audit'i actor/requester/approver, target device, VDOM, operation, sanitized before/after diff, reason, preview hash, idempotency key, FortiGate response özeti, verification sonucu ve timestamp içermelidir. Secret, session cookie ve token loglanmamalıdır.

## 16. Approval/dry-run/preview ihtiyaçları

Detaylı workflow ve risk tablosu [FORTIGATE_WRITE_OPERATIONS_GUARDRAILS.md](./FORTIGATE_WRITE_OPERATIONS_GUARDRAILS.md) içinde tanımlanmıştır. Preview, canlı current state'e bağlı ve 10 dakika geçerli imzalı token üretmelidir. Stale preview, capability düşüşü, TLS/auth hatası veya current-state hash değişimi apply işlemini durdurmalıdır.

## 17. P0/P1/P2 düzeltme listesi

### P0

- Direct quarantine write yüzeyini feature flag ile kapatmak; geçici olarak ADMIN-only yapmak.
- Firewall route'larını açık permission map'e almak.
- Credential'ları encrypted-at-rest modele taşımak.
- Shared Prisma, connector factory ve device-scoped cache kullanmak.
- Hata yutmayı kaldırıp unavailable/stale semantiği eklemek.
- Timeout, abort, retry, backoff ve session lifecycle'ı standardize etmek.

### P1

- Read-only V1 capability probe ve hibrit onboarding.
- `FULL/LIMITED/UNAVAILABLE` state modeli.
- Fortinet SNMP ve güvenli SSH backup desteği.
- Typed read API'leri ve source/freshness envelope.
- Serial/devid/VDOM FortiAnalyzer korelasyonu ve auto recovery.

### P2

- Change request/operation attempt veri modeli.
- Preview, approval, idempotent worker ve read-after-write doğrulaması.
- Karantina ve address object yönetimi.
- Policy enable/disable ve sonra süreli internet erişim policy'si.

## 18. İlk uygulanması gereken 10 küçük görev

1. Firewall bounded context ve TLS/fallback ADR'sini yazmak.
2. Quarantine write endpoint'ini kapalı feature flag arkasına almak.
3. Firewall RBAC resource/action setini ve route mapping'i eklemek.
4. Device-scoped FortiGate connector factory oluşturmak.
5. TLS/auth/network hata sınıflandırıcısını eklemek.
6. Capability probe ve durum evaluator'ını oluşturmak.
7. REST başarısız olsa da Device + connector oluşturan onboarding API'sini eklemek.
8. FortiGate SNMP ve SSH fallback/config-backup desteğini tamamlamak.
9. Source/freshness taşıyan read response standardını uygulamak.
10. FortiAnalyzer loglarını serial/devid/VDOM ile cihaza bağlamak.

## Kritik bulgular

| Öncelik | Bulgu | Etki |
|---|---|---|
| P0 | Direct quarantine write yalnız authentication ile erişilebilir | Yetkisiz operasyonel değişiklik |
| P0 | Credential değerleri plaintext JSON/DB alanlarında | DB sızıntısında cihaz erişimi |
| P0 | Audit logger write için fail-open | Değişiklik audit izi olmadan uygulanabilir |
| P1 | Kaynak hatası boş liste/null olarak dönebiliyor | “Veri yok” ile “kaynak down” karışır |
| P1 | `new PrismaClient()` ve dağınık service instance'ları | Pool/session/backoff state dağılması |
| P1 | Host bazlı kimlik ve `findFirst()` | Çoklu FortiGate/VDOM yanlış eşleşmesi |
| P1 | Cache key'leri cihaz kimliğini taşımıyor | Çoklu cihazda cross-device stale veri riski |
| P1 | SSH unknown host key otomatik kabul ediliyor | MITM ve yanlış cihaz riski |
| P2 | FortiGate dokümanı SNMP/SSH kapsamını olduğundan olgun gösteriyor | Operasyonel beklenti ve test boşluğu |

## Kanıt sınırlamaları

- Bu çalışma kaynak kod analizidir; gerçek FortiGate/FortiAnalyzer'a istek gönderilmedi.
- FortiOS sürüm/VDOM/API profil farklılıkları cihaz matrisi testinde ayrıca doğrulanmalıdır.
- Önerilen model ve API'ler henüz uygulanmış değildir.
