# FortiGate Firewall Yönetim Modülü Yol Haritası

**Hedef:** Hibrit güvenli bağlantı, read-only V1 ve approval kontrollü write V2

**Kural:** Her faz deploy edilebilir, ölçülebilir ve geri alınabilir olmalıdır

## Uygulama durumu — 2026-07-14

| İş paketi | Durum | Not |
|---|---|---|
| P0.1 Direct quarantine write sınırı | Temel koruma tamamlandı | Legacy write default-off feature flag ve route-level aktif ADMIN kontrolü eklendi; V2 hazır olunca endpoint kaldırılacak |
| P0.2 Firewall RBAC ve route mapping | Temel koruma tamamlandı | FortiGate integration, quarantine ve firewall policies route'ları `firewall` kaynağına bağlandı; read tüm roller, write/delete yalnız ADMIN |
| P0.3 Credential encryption | Tamamlandı | FortiGate/FA ile NMS SNMP/SSH sırları ve config backup içerikleri AES-256-GCM envelope kullanıyor; startup plaintext migration, masking, installer key generation ve previous-key rotation mevcut |
| P0.4 Shared client ve target scope | Temel koruma tamamlandı | ADR-005, `configId:vdom` singleton factory, concurrent init dedup, target-scoped cache/session, shared Prisma ve explicit multi-target seçimi eklendi; serial/devid discovery P1'de açık |
| P0.5 Hata semantiği ve dış çağrı disiplini | REST temeli tamamlandı | TLS/auth/network/timeout/rate-limit/unsupported classifier, 15s timeout, bounded read retry ve typed API errors eklendi; source freshness envelope P1'de açık |
| P0.6 Audit fail-closed write hazırlığı | Temel koruma tamamlandı | Legacy quarantine writes immutable reservation + outcome kayıtları kullanıyor; audit reservation başarısızsa FortiGate çağrısı başlamıyor |
| P1 Read-only V1 | Tamamlandı | Hibrit onboarding, capability state, identity review, REST read API, FA korelasyonu, SNMP v1/v2c/v3, güvenli FortiOS SSH, auto-recovery ve source/freshness ürün deneyimi tamamlandı |
| P2 Controlled write V2 | Açık | Preview, approval, worker ve operation lifecycle henüz uygulanmadı |

## Başarı tanımı

- Sertifika hatasında cihaz kaydı kaybolmaz; `LIMITED` modda gerçek fallback verisi gösterilir.
- Sertifika düzeldiğinde cihaz otomatik `FULL` olur.
- Kullanıcı hangi verinin hangi kaynaktan ve ne zaman geldiğini görür.
- V1 hiçbir FortiGate write işlemi yapmaz.
- V2'de preview/approval/audit olmadan write yapılamaz.
- Çoklu FortiGate ve VDOM scope'u tüm API/cache/job katmanında korunur.

## Ön koşul: ADR ve ürün kararı

Yeni firewall bounded context, capability state ve permission modeli anayasanın ADR tetikleyicilerine girer. İlk uygulama PR'ından önce ADR şu kararları sabitlemelidir:

- `FULL/LIMITED/UNAVAILABLE` durumlarının kriterleri.
- REST/FortiAnalyzer/SNMP/SSH source ownership.
- TLS hatasında bypass yerine LIMITED davranışı.
- Serial/devid + VDOM identity.
- Credential encryption ve read/write ayrımı.
- V1 read-only, V2 worker-controlled write.
- Risk bazlı four-eyes approval.

## P0 — Mevcut riski sınırla

### P0.1 Direct quarantine write'ı kapat

**Çıktı:** `POST/DELETE /api/security/quarantine` varsayılan kapalı feature flag; geçici açık durumda ADMIN + explicit permission.

**Kabul:** VIEWER/EDITOR 403; flag kapalıyken FortiGate çağrısı yok; GET read çalışır.

**Bağımlılık:** Yok.

### P0.2 Firewall RBAC ve route mapping

**Çıktı:** Firewall resource/action seti; `/api/integrations/fortigate`, `/api/security/quarantine`, `/api/firewall-policies` ve yeni `/api/firewalls` açık mapping.

**Kabul:** Unmapped firewall endpoint kalmaz; middleware ve server-side handler aynı policy'yi doğrular.

### P0.3 Credential encryption

**Çıktı:** Versioned AES-256-GCM envelope, rotation yolu, UI'da yalnız `credentialSet`.

**Kabul:** Yeni config plaintext DB'ye yazılmaz; API secret dönmez; log redaction testleri geçer.

**Durum:** Tamamlandı. FortiGate/FortiAnalyzer `IntegrationConfig`, `Device.snmpCommunity`, `Device.sshPassword` ve `NmsBackup.configuration` aynı versioned AES-256-GCM envelope sözleşmesini kullanır. Mevcut plaintext kayıtlar uygulama başlangıcında idempotent olarak korunur; dedicated key rotation iki anahtarlı geçişle yapılır. Python NMS sidecar plaintext credential kabul etmez.

### P0.4 Shared client ve target scope

**Çıktı:** `lib/prisma.ts` kullanımı, device-scoped connector factory, target-aware cache/session.

**Kabul:** `new PrismaClient()` ve route içi dağınık service instance'ları kalkar; cache key firewall ID + VDOM taşır.

**Durum:** FortiGate kapsamında tamamlandı. Tüm service oluşturma shared/ephemeral factory içinde merkezileştirildi; API, quarantine, policy ve alarm tüketicileri factory kullanıyor. Tek config bulunan eski kurulumlar uyumlu çalışır, birden fazla config varsa explicit `configId` zorunludur. Kalıcı cihaz kimliği olarak serial/devid keşfi ve çoklu hedef seçim UI'ı P1.3/P1.10 kapsamındadır.

### P0.5 Hata semantiği ve dış çağrı disiplini

**Çıktı:** TLS/auth/network/timeout/rate-limit/unsupported classifier; timeout + abort + retry/backoff.

**Kabul:** Kaynak hatası boş liste/sıfır olmaz; typed unavailable response; hanging request testi geçer.

**Durum:** FortiGate REST temelinde tamamlandı. Ana read metotları upstream hatasını boş veri olarak yutmaz; API güvenli `code` ve `retryable` alanları döndürür. GET çağrıları 15 saniyelik varsayılan timeout ve en fazla üç deneme kullanır; POST/PUT/DELETE otomatik retry almaz. Hibrit kaynak bazlı `available/stale/unavailable` envelope ve kalıcı probe/backoff state'i P1.1/P1.5 kapsamındadır.

### P0.6 Audit fail-closed write hazırlığı

**Çıktı:** Read audit logger'dan ayrı write audit reservation contract.

**Kabul:** Audit DB unavailable olduğunda dış write mock'una çağrı yapılmaz.

**Durum:** Legacy quarantine yolunda tamamlandı. Audit trail append-only `RESERVED` ve `SUCCEEDED/FAILED` kayıtlarından oluşur; genel amaçlı fail-open `logAudit` write yolunda kullanılmaz. V2 change-request worker için kalıcı idempotency, approval ve reconciliation modelleri P2 kapsamındadır.

## P1 — Read-only V1

### P1.1 Typed connector ve capability state

**Çıktı:** Firewall connector, per-source capability ve monitoring mode modeli.

**Kabul:** Bir cihaz aynı anda REST unavailable, SNMP healthy ve FA healthy durumunu temsil edebilir.

**Durum:** Tamamlandı. `FULL/LIMITED/UNAVAILABLE` evaluator; REST, FortiAnalyzer, event-cache, SNMP, SSH ve database için ayrı capability state; ortak data envelope ve UI source matrix eklendi. REST recovery önceki fallback durumlarını korur; SNMP, SSH ve FortiAnalyzer okumaları kendi capability sonuçlarını kalıcı connector state'e yazar.

### P1.2 Bloklamayan onboarding

**Çıktı:** `POST /api/firewalls` REST başarısız olsa da `Device + connector` oluşturur.

**Kabul:** Expired certificate fixture'ı `LIMITED`, tüm kaynaklar down fixture'ı `UNAVAILABLE` üretir.

**Durum:** Tamamlandı. `POST /api/firewalls`, güvenli host/VDOM doğrulaması ve encrypted credential ile `Device + IntegrationConfig + FirewallConnector` kaydını transaction içinde oluşturur; trusted REST probe daha sonra çalışır ve başarısızlığı kaydı geri almaz. Onboarding SNMPv1/v2c veya SNMPv3 USM ile opsiyonel SSH fallback'i doğrudan NMS cihaz alanlarına bağlar, atomik NMS ID rezervasyonu yapar ve hiçbir fallback sırrını `IntegrationConfig` içine kopyalamaz. İlk SNMP metriği detail açılışında capability state'i yeniden değerlendirerek REST kullanılamıyorsa `LIMITED` moda geçirir. Tüm kaynaklar başarısızsa açık `UNAVAILABLE` kalır.

### P1.3 Identity ve VDOM

**Çıktı:** Serial/devid + VDOM discovery, duplicate merge/review akışı.

**Kabul:** Management IP değişince yeni cihaz oluşmaz; iki VDOM verisi karışmaz.

**Durum:** Tamamlandı. ADR-006 ve kalıcı `FirewallConnector` modeli; serial + normalize VDOM identity key; `PENDING/VERIFIED/CONFLICT` durumları; duplicate/drift review aksiyonları; mutable management host güncellemesi ve audited legacy integration link API'si eklendi. Probe sonucu conflict olduğunda aday serial doğrulanmış `Device.serialNumber` değerini ezmez. Mevcut config'ler yalnız açık inventory seçimiyle bağlanır; host/IP üzerinden tahmin yapılmaz. Detail UI mevcut kimliği koruma, yeni adayı kabul etme veya doğrulanmış mevcut connector ile birleştirme akışlarını sunar.

### P1.4 Source/freshness envelope

**Çıktı:** Tüm firewall read API'lerinde ortak envelope.

**Kabul:** `available/stale/unavailable`, `source`, `collectedAt` ve reason tutarlı döner.

**Durum:** Tamamlandı. Ortak read service canlı REST verisini `available`, güvenilir DB snapshot'ını gerçek zamanı ile `stale`, kaynak hatasını typed reason/code ile `unavailable` döndürür. Status, interface, policy, address, VIP, HA, SSL-VPN session ve IPsec endpoint'leri aynı envelope ve explicit connector/VDOM target bilgisini taşır. Yeni Firewall Yönetimi UI'ı yalnız bounded-context `/api/firewalls` uçlarını kullanır ve “0 kayıt”, “güncel değil” ile “kaynak kullanılamıyor” durumlarını ayırır. Legacy `/api/integrations/fortigate` yalnız eski dış tüketiciler için compatibility katmanı olarak kalır.

### P1.5 REST read API'leri

**Çıktı:** Status, interfaces, policies, addresses, VIPs, SSL-VPN, IPsec ve HA endpoint'leri.

**Kabul:** Endpoint explicit firewall ID/VDOM alır; global `findFirst()` kullanmaz; pagination/filter destekler.

**Durum:** Tamamlandı. `/api/firewalls/:id/status`, `interfaces`, `policies`, `addresses`, `vips`, `ha`, `vpn/ssl-sessions` ve `vpn/ipsec` connector ID üzerinden doğru config + VDOM scope'una gider. Liste kaynakları `page`, en fazla 100 kayıtlık `limit`, sınırlandırılmış `search` ve kaynağa özel allowlist filtreler kullanır; canlı REST ve stale DB snapshot aynı pagination DTO'sunu döndürür. Liste ve detay UI'ı bu endpointlere taşındı.

### P1.6 FortiAnalyzer korelasyonu

**Çıktı:** Auth/security/config-change event'lerini serial/devid/VDOM ile firewalla bağlama.

**Kabul:** Aynı isim/IP kullanan iki firewall event'i karışmaz; cache ve live source görünür.

**Durum:** Tamamlandı. Yalnız trusted REST probe ile `VERIFIED` olmuş serial, FortiAnalyzer managed-device `devid` değeriyle exact eşleştirilir; isim veya IP fallback'i yoktur. ADMIN-only `POST /api/firewalls/:id/analyzer-correlation` sonucu immutable audit kaydıyla saklanır ve `analyzerDeviceId + VDOM` benzersizliği DB seviyesinde korunur. `cached_events` kayıtları normalize `devid + VDOM + eventTime` indeksi taşır. `GET /api/firewalls/:id/events?category=auth|security|config` önce device-scoped fresh cache'i, gerektiğinde aynı `devid` ile canlı FortiAnalyzer logsearch'ü kullanır; bounded pagination, source/freshness envelope ve güvenli projected DTO döndürür. Ham log payload'ı API'ye açılmaz. Aynı isim/IP kullanan farklı serial fixture'ı ve statik scope kontrolleri `security:fortianalyzer-correlation-check` ile korunur.

### P1.7 Fortinet SNMP

**Çıktı:** Reachability, uptime, CPU, memory, temperature ve IF-MIB interface/counter standardı.

**Kabul:** SNMP timeout REST'i bloklamaz; SNMPv2c ve SNMPv3 test matrisi vardır.

**Durum:** Tamamlandı. Resmi Fortinet MIB'e göre `fgSysCpuUsage` (`1.3.6.1.4.1.12356.101.4.1.3.0`) ve `fgSysMemUsage` (`1.3.6.1.4.1.12356.101.4.1.4.0`) düzeltildi. Modelden modele değişen sıcaklık tek bir scalar yerine `fgHwSensorTable` isim/değer sütunlarından okunur. Eksik community artık `public` kabul edilmez. NMS açık SNMPv1/v2c community veya encrypted SNMPv3 USM credential ile session açar; v3 için `authNoPriv` SHA/SHA-256 ve `authPriv` SHA/SHA-256 + AES-128 desteklenir. `/api/firewalls/:id/snmp/health` ve `/api/firewalls/:id/snmp/interfaces`, connector'ın explicit `Device.nmsDeviceId` bağını kullanır; bounded pagination ve `available/stale/unavailable` envelope döndürür. Taze SNMP metriği REST unavailable iken connector'ı `LIMITED` yapabilir. v2c/v3 session fixture matrisi ve field-scoped encryption testleri güvenlik scriptlerine eklenmiştir. Resmi referans: [FortiGate system MIBs](https://docs.fortinet.com/document/fortigate/8.0.0/fortigate-mib-information-overview/293724).

### P1.8 Güvenli FortiOS SSH

**Çıktı:** Host-key pinning/trust akışı, FortiOS allowlist health komutları ve `show full-configuration` backup.

**Kabul:** Unknown/mismatched host key otomatik kabul edilmez; hiçbir write komutu yoktur.

**Durum:** Tamamlandı. `AutoAddPolicy` kaldırıldı; SHA-256 fingerprint önce internal NMS tarafından yalnız okunur, ardından ADMIN aynı anahtarı tekrar gözlemleyip audit transaction'ı içinde onaylar. NMS cihaz ayarları ekranı bu trust akışını terminal veya `.env` gerektirmeden sunar. SSH yalnız vendor allowlist operasyonlarını çalıştırır; FortiOS health için `get system status`, config backup için `show full-configuration` kullanılır. Backup içerikleri şifreli saklanır, açılırken checksum doğrulanır. `/api/firewalls/:id/ssh/status` SSH capability sonucunu `available/unavailable` envelope ile connector state'e yazar. Internal NMS çağrıları token ile korunur.

### P1.9 Auto recovery

**Çıktı:** 5 dakikalık REST probe, 60 dakikaya kadar backoff, manual rate-limited probe.

**Kabul:** Sertifika düzeltildikten sonra insan müdahalesi olmadan `LIMITED -> FULL` geçişi.

**Durum:** Tamamlandı. REST capability probe önceki SNMP/SSH/FortiAnalyzer kaynaklarını koruyarak yalnız `fortigate-rest` durumunu günceller. Başarıda 5 dakika, ardışık hatalarda 5/10/20/40/60 dakika `nextProbeAt` planlanır. Node startup worker'ı due connector'ları PostgreSQL advisory lock ve iki dakikalık claim lease ile paylaştırır; proses içi eşzamanlı çağrılar tek probe'a deduplicate edilir. `POST /api/firewalls/:id/probe` yalnız ADMIN için açıktır ve 30 saniyelik `Retry-After` rate limit uygular. Worker heartbeat'i `firewall_recovery_last_tick` sistem anahtarında tutulur; TLS doğrulaması veya write capability değiştirilmez.

### P1.10 Read-only ürün deneyimi

**Çıktı:** Firewall list/detail, capability badges, source/freshness ve remediation.

**Kabul:** UI “0” ile “unavailable”ı ayırır; LIMITED özellik matrisi erişilebilir biçimde görünür.

**Durum:** Tamamlandı. `/integrations/firewall` çoklu firewall envanteri, mode özetleri, arama, legacy inventory link, hibrit onboarding ve yalnız InfraScope bağlantı yapılandırmasını kaldıran ADMIN onaylı remove akışı sunar. Remove işlemi FortiGate'e write çağrısı yapmaz, immutable audit kaydı üretir ve bağlı envanter cihazını korur. `/integrations/firewall/:id` ise status, interface, policy, address, VIP/NAT, SSL-VPN, IPsec, HA ve auth event okumalarını source/freshness zarfıyla gösterir. Source matrix `FULL/LIMITED/UNAVAILABLE`, tazelik, son başarılı veri ve remediation bilgisini renk dışında ikon/metinle de açıklar. Kimlik conflict review, FortiAnalyzer exact correlation, manual rate-limited probe ve SSH SHA-256 host-key trust akışları müşteri `.env` veya terminal işlemi gerektirmeden erişilebilir durumdadır. V1 ekranlarında FortiGate write aksiyonu bulunmaz.

## P2 — Write-enabled V2

### P2.1 Change-control veri modeli

**Çıktı:** Change request, approval, operation attempt, lifecycle transition ve idempotency alanları.

**Kabul:** Append-only transition history; requester/approver ayrımı; stale preview state'i.

### P2.2 Preview engine

**Çıktı:** Typed operation registry, canonical before/after diff, impact analizi, 10 dakikalık signed token.

**Kabul:** Unknown field/path reddedilir; secret preview'da görünmez.

### P2.3 Approval policy

**Çıktı:** MEDIUM self-approval ve HIGH/CRITICAL four-eyes policy.

**Kabul:** Aynı ADMIN yüksek risk request'ini onaylayamaz; role/permission değişikliği apply öncesi tekrar değerlendirilir.

### P2.4 Internal worker

**Çıktı:** Lease, idempotency, current-state hash, typed apply ve read-after-write.

**Kabul:** Duplicate delivery tek FortiGate write üretir; timeout sonrası kör retry yapılmaz.

### P2.5 Karantina yönetimi

**Çıktı:** Add/remove request, expiry, reason, verify ve audit.

**Kabul:** Direct endpoint kaldırılır; LIMITED modda request apply olmaz.

### P2.6 Address object yönetimi

**Çıktı:** Create/update/disable; delete referans yoksa ve HIGH approval ile.

**Kabul:** Policy/group referans analizi; duplicate/overlap kontrolleri.

### P2.7 Policy enable/disable

**Çıktı:** Policy state değişikliği için typed request.

**Kabul:** Policy content değişikliğiyle birleştirilmez; before/after verify edilir.

### P2.8 Süreli internet erişimi

**Çıktı:** Dar scope, 8 saat varsayılan/24 saat maksimum, logging açık policy ve auto-disable.

**Kabul:** `any/any`, servicesiz, süresiz ve logging-off talepleri reddedilir.

## İlk uygulanması gereken 10 küçük görev

| # | Görev | Beklenen küçük çıktı | Öncelik |
|---:|---|---|---|
| 1 | Firewall ADR | Tek karar belgesi ve review | P0 |
| 2 | Quarantine feature flag | Direct write varsayılan kapalı | P0 |
| 3 | Firewall RBAC mapping | Explicit resource/action/route | P0 |
| 4 | Connector factory | Device-scoped shared service | P0 |
| 5 | Hata classifier | TLS/auth/network typed sonuç | P0 |
| 6 | Capability evaluator | FULL/LIMITED/UNAVAILABLE saf fonksiyon | P1 |
| 7 | Hybrid onboarding | REST hatasında da kayıt | P1 |
| 8 | Fortinet SNMP/SSH | Health + güvenli backup | P1 |
| 9 | Read envelope | Source/freshness standardı | P1 |
| 10 | FA correlation | Serial/devid/VDOM eşleştirme | P1 |

## Önerilen sprint dizilimi

### Sprint 1 — Güvenlik sınırı

- ADR.
- Quarantine flag.
- RBAC route mapping.
- Credential encryption tasarımı ve secret redaction.

### Sprint 2 — Connector temeli

- Shared Prisma/service.
- Target-scoped connector/cache.
- Hata classifier, timeout/backoff/session lifecycle.
- Capability evaluator unit testleri.

### Sprint 3 — Hybrid onboarding

- Device + connector API.
- Identity/VDOM discovery.
- LIMITED/UNAVAILABLE ve manual probe.
- Source/freshness envelope.

### Sprint 4 — Read feature set

- REST read endpoints.
- FortiAnalyzer correlation.
- SNMP health ve interface.
- SSH host-key + backup.

### Sprint 5 — V1 hardening

- Auto recovery.
- UI capability/freshness.
- Multi-device/VDOM testleri.
- Metrics, runbook ve production pilot.

### Sprint 6+ — V2 kontrollü write

- Change-control schema ve worker.
- Preview/approval/audit.
- Quarantine pilotu.
- Address/policy operasyonları kademeli rollout.

## V1 release kapıları

- Production TLS bypass static check temiz.
- Plaintext yeni credential yazımı yok.
- Firewall API route'ları explicit permission map'te.
- Expired certificate onboarding testi geçiyor.
- `LIMITED -> FULL` recovery testi geçiyor.
- Multi-firewall/VDOM isolation testi geçiyor.
- Read API'lerde source/freshness contract testi geçiyor.
- SSH host-key mismatch reddediliyor.
- Uygulama build/type-check ve Docker appliance smoke testi geçiyor.
- Runbook: REST TLS failure, auth failure, SNMP timeout, FA unavailable.

## V2 release kapıları

- Direct quarantine write tamamen kaldırılmış.
- Worker dışında FortiGate write kod yolu yok.
- Audit reservation failure testi geçiyor.
- MEDIUM/HIGH/CRITICAL approval matrix testleri geçiyor.
- Current-state hash ve expired preview reddi testleri geçiyor.
- Idempotency/duplicate delivery testi geçiyor.
- Read-after-write doğrulama ve circuit breaker testi geçiyor.
- Secret redaction ve immutable lifecycle audit testi geçiyor.
- Lab ve pilot müşteri onayı tamamlanmış.

## Rollback stratejisi

- Read-only connector feature flag ile eski ekran yanında çalıştırılabilir.
- Yeni connector write kapalıyken rollout edilir; gözlem verisi toplanır.
- Write operasyonları işlem tipi bazında ayrı flag taşır.
- Sorunda write flag kapatılır; read-only V1 etkilenmez.
- Veri migration'ları backward-compatible expand/migrate/contract yöntemiyle yapılır.
- FortiGate'te rollback, sessiz ters işlem değil yeni audited compensation request'tir.

## Ölçülecek ürün ve operasyon metrikleri

- Onboarding başarı oranı ve mode dağılımı.
- REST TLS/auth/network hata dağılımı.
- LIMITED'dan FULL'a recovery süresi.
- Her veri türünde stale/unavailable oranı.
- Probe latency ve backoff süresi.
- Device/VDOM correlation mismatch.
- Change request approval süresi.
- Apply/verify başarısı ve idempotency collision.
- Audit reservation failure.

## Bağımlılıklar ve açık kararlar

- Encryption key yönetimi ve rotation operasyonu.
- Desteklenen FortiOS sürüm matrisi.
- Multi-VDOM lisans/ürün kapsamı.
- FortiGate minimum read/write admin profile tanımları.
- SSH host-key ilk trust deneyimi.
- Quarantine default expiry politikası.
- V2 için worker/queue teknolojisi.

Bu kararlar V1 read-only geliştirmeyi gereksiz yere bloklamamalı; ancak ilgili release kapısından önce ADR/runbook ile kapanmalıdır.

## İlgili belgeler

- [Mevcut durum denetimi](./FORTIGATE_MANAGEMENT_AUDIT.md)
- [Hedef mimari](./FORTIGATE_MANAGEMENT_DESIGN.md)
- [Veri kaynağı matrisi](./FORTIGATE_DATA_SOURCE_MATRIX.md)
- [Write guardrail'ları](./FORTIGATE_WRITE_OPERATIONS_GUARDRAILS.md)
