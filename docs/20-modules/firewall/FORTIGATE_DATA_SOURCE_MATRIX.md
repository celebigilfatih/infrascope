# FortiGate Veri Kaynağı Matrisi

**Durum:** Proposed source-of-truth sözleşmesi

**Amaç:** Her özellik için authoritative kaynak, fallback ve `LIMITED/FULL` davranışını tek yerde tanımlamak

## Kaynak rolleri

| Kaynak | Sahip olduğu gerçek | Sahip olmadığı gerçek |
|---|---|---|
| InfraScope DB | Inventory identity, connector config, son başarılı snapshot ve freshness | FortiGate'in anlık current state'i |
| FortiGate REST | CMDB current state, monitor state ve kontrollü write | Uzun süreli olay/log geçmişi |
| FortiAnalyzer / event cache | Güvenlik, admin, VPN ve config-change olay geçmişi | Güncel policy/address/VIP listesinin tamamı |
| SNMP | Health, reachability, interface oper state ve sayaçlar | Policy/object/VPN session ayrıntısı |
| SSH | Read-only identity ve config backup fallback | Genel CMDB parser veya write kanalı |

## Read kabiliyetleri

| # | Özellik | Mevcut kaynak | Authoritative hedef kaynak | `LIMITED` davranışı | `FULL` davranışı | Freshness hedefi | Fallback / not |
|---:|---|---|---|---|---|---|---|
| 1 | FortiGate envanteri | `Device` ve FortiGate sync; host `fortiDeviceId` | `Device + FirewallConnector`, serial/devid + VDOM | Kayıt her durumda görünür; capability badge | Aynı kayıt REST kimliğiyle zenginleşir | Değişiklik bazlı | Host yalnız management address olur |
| 2 | Sistem durumu | REST test/sync | REST status; SNMP health tamamlayıcı | SNMP/SSH özet; REST alanları unavailable | Model, serial, version ve system state REST | 2 dk | Son REST snapshot stale gösterilebilir |
| 3 | Interface/port durumu | REST; Python NMS SNMP ayrı | SNMP oper/counter + REST config ayrıntısı | Connector-scoped NMS interface endpoint'i available/stale/unavailable döndürür | SNMP canlı durum, REST config ve monitor stats | 2-5 dk | v1/v2c/v3 bridge uygulandı; SSH yalnız dar tanı komutları |
| 4 | Firewall policy listesi | REST ve DB snapshot | FortiGate REST CMDB | Son snapshot stale veya unavailable | Current policy listesi | 15 dk | FortiAnalyzer yalnız change event'i sağlar |
| 5 | Address object listesi | REST ve DB snapshot | FortiGate REST CMDB | Son snapshot stale veya unavailable | Current object listesi | 15 dk | FA/SSH current list yerine geçmez |
| 6 | VIP / NAT objeleri | REST | FortiGate REST CMDB | Son snapshot stale veya unavailable | Current VIP/NAT listesi | 15 dk | FA yalnız değişiklik olayını gösterebilir |
| 7 | SSL-VPN kullanıcıları ve aktif oturumlar | FortiGate REST monitor | FortiGate REST monitor | Aktif oturum unavailable; event geçmişi FA'dan | Aktif kullanıcı/oturum current state | 2 dk | Event cache aktif session sayısı olarak kullanılmaz |
| 8 | IPsec VPN durumu | FortiGate REST monitor | FortiGate REST monitor | Up/down event geçmişi FA'dan; current state unavailable/stale | Aktif tunnel current state | 2 dk | FA olay kaynağıdır |
| 9 | HA durumu | FortiGate REST CMDB | FortiGate REST monitor/CMDB | Temel SNMP health varsa sınırlı; HA ayrıntısı unavailable | Mode, primary/member ve health | 5 dk | SSH yalnız tanısal fallback olabilir |
| 10 | Hatalı admin login | `cached_events`, FortiAnalyzer, direkt FG query | Event cache + FortiAnalyzer | Exact `devid + VDOM` cache/canlı olay görünümü | Aynı; REST yalnız canlı fallback | 5 dk | Serial/devid + VDOM korelasyonu uygulandı; isim/IP fallback'i yok |
| 11 | Hatalı SSL-VPN login | `cached_events`, FortiAnalyzer, direkt FG query | Event cache + FortiAnalyzer | Exact `devid + VDOM` cache/canlı olay görünümü | Aynı; REST canlı fallback | 5 dk | Aktif session ile auth event karıştırılmaz; ham log API'ye açılmaz |
| 12 | Güvenlik/event logları ve alarmlar | FortiAnalyzer/FortiView/cache | FortiAnalyzer + event cache | FA/cache freshness'e göre available/stale | REST durumundan bağımsız çalışır | 5 dk | Device-scoped auth/security/config endpoint'i uygulandı |
| 13 | SNMP temel health | Python NMS Fortinet OID'leri | NMS SNMP | Taze metric REST down iken `LIMITED`; eski metric stale/unavailable | REST'e tamamlayıcı bağımsız health | 2-5 dk | Resmi CPU/memory OID ve sensor-table temperature; encrypted v3 USM authNoPriv/authPriv uygulandı |
| 14 | SSH fallback health | Python NMS pinned SSH | Güvenli allowlist FortiOS SSH | REST/SNMP yoksa sınırlı identity/health | Tanı amaçlı, normalde ikincil | 5 dk | SHA-256 host-key trust ve `get system status` uygulandı |
| 15 | Config backup | Python NMS pinned SSH | SSH read-only `show full-configuration` | SSH sağlıklıysa çalışır | REST durumundan bağımsız çalışır | İsteğe bağlı | Şifreli içerik, SHA-256 bütünlük kontrolü ve audit metadata uygulanmış durumda |

## Write kabiliyetleri

Tüm write satırları yalnız `FULL + writeEnabled + trusted REST + onaylı request` koşulunda çalışır. `LIMITED` modda uygulanmaz.

| # | İşlem | Mevcut durum | Authoritative write kanalı | Risk | Preview zorunluluğu | Onay | Verify / rollback yaklaşımı |
|---:|---|---|---|---|---|---|---|
| 1 | Karantinaya IP/cihaz ekleme | Direct REST endpoint mevcut | FortiGate REST monitor | MEDIUM | IP, VDOM, expiry, reason, mevcut state | ADMIN; gerekçeli self-approval olabilir | Read-after-write banned list; expiry ile doğal geri dönüş |
| 2 | Karantinadan çıkarma | Direct REST endpoint mevcut | FortiGate REST monitor | HIGH | Hangi kaydın neden kaldırıldığı | Farklı ADMIN | Read-after-write; gerekirse yeni add request |
| 3 | Address object oluşturma | Güvenli servis yok | FortiGate REST CMDB | MEDIUM | Canonical payload, duplicate ve subnet/FQDN | ADMIN; gerekçeli self-approval olabilir | Object tekrar okunur; create başarısızsa state değişmez |
| 4 | Address object güncelleme | Güvenli servis yok | FortiGate REST CMDB | MEDIUM | Before/after diff ve referanslar | ADMIN; gerekçeli self-approval olabilir | ETag/state hash; eski payload ayrı compensating request olabilir |
| 5 | Address object disable/silme | Güvenli servis yok | FortiGate REST CMDB | HIGH | Policy/group referans grafiği | Farklı ADMIN | Disable tercih edilir; delete yalnız referans yoksa |
| 6 | Süreli internet erişim policy'si | Yok | FortiGate REST CMDB | CRITICAL | Placement, interfaces, addresses, services, NAT, logging, duration | Farklı ADMIN | 8 saat varsayılan, 24 saat max; expiry worker kapatır ve doğrular |
| 7 | Policy enable/disable | Yok | FortiGate REST CMDB | HIGH | Policy ID, current state, traffic etkisi | Farklı ADMIN | Current-state hash + read-after-write; ters işlem yeni request |

## Özellik bazlı kaynak seçme kuralları

1. REST-only current state başarısızsa boş dizi dönülmez; `unavailable` veya önceki snapshot ile `stale` dönülür.
2. FortiAnalyzer event'i current config olarak yorumlanmaz.
3. SNMP interface state, REST interface config ile entity identity üzerinden birleştirilir; biri diğerini sessizce ezmez.
4. SSH çıktısı yalnız allowlist parser tarafından kabul edilir; bilinmeyen komut çıktısı structured data sayılmaz.
5. Cache cevabı `source=database/event-cache` ve gerçek `collectedAt` taşır.
6. Aynı özellik için fallback kaynağı değiştiğinde UI source badge'i de değişir.
7. FortiAnalyzer eşleşmesi yalnız isim/IP tahminiyle değil serial/devid/VDOM ile yapılır.

## Hata sınıfları ve kullanıcı davranışı

| Hata | Monitoring mode etkisi | UI davranışı | Write etkisi |
|---|---|---|---|
| TLS expired/untrusted/hostname | REST unavailable; diğer kaynaklara göre LIMITED | Sertifika hatası ve son başarılı zaman | Bloke |
| REST auth invalid | REST unavailable; diğer kaynaklara göre LIMITED | Credential doğrulama isteği | Bloke |
| REST 429/rate-limit | Geçici degraded, backoff | Yeniden deneme zamanı | Bloke |
| SNMP timeout | SNMP unavailable; REST varsa FULL olabilir | Health kaynağı değişir | Doğrudan etkisi yok |
| SSH host-key mismatch | SSH unavailable ve güvenlik uyarısı | Yeniden trust/onay akışı | SSH zaten write değildir |
| FortiAnalyzer down | Event kaynağı stale/unavailable | Event freshness uyarısı | CMDB write'ı tek başına bloklamaz |
| Tüm kaynaklar down | UNAVAILABLE | Son snapshot stale veya veri yok | Bloke |

## FortiOS/VDOM uyumluluk matrisi gereksinimi

Uygulamadan önce desteklenen FortiOS sürümleri ve aşağıdaki kombinasyonlar fixture/device lab ile doğrulanmalıdır:

- Standalone root VDOM.
- Multi-VDOM.
- HA active-passive.
- Token auth ve cookie auth.
- Read-only REST admin profile.
- Ayrı write admin profile.
- FortiAnalyzer managed device correlation.
- SNMPv2c ve tercihen SNMPv3.
- SSH host-key pinning ve FortiOS pager davranışı.

## İlgili belgeler

- [Mevcut durum denetimi](./FORTIGATE_MANAGEMENT_AUDIT.md)
- [Hedef mimari](./FORTIGATE_MANAGEMENT_DESIGN.md)
- [Write guardrail'ları](./FORTIGATE_WRITE_OPERATIONS_GUARDRAILS.md)
- [Yol haritası](./FORTIGATE_ROADMAP.md)
