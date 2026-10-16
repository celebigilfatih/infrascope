# NMS (Network Monitoring System) Integration

> **Architecture:** Separate Python agent service + InfraScope PostgreSQL shared DB
> **Protocol:** SNMP v2c/v3 polling + SSH CLI (fallback)
> **API:** REST endpoints under `/api/integrations/nms/*`
> **DB tables:** `nms_health_metrics`, `nmsInterface`, `devices` (shared with InfraScope)

## İzlenen Cihazlar ekranı

`/integrations/nms/devices` erişim kaydını, izleme ayarını ve kaynak ölçümünü ayrı gösterir. “Yanıt kaydı güncel” kayıtlı son veri alımının izleme aralığının 2,5 katından yeni olduğunu belirtir; canlı bağlantı testi değildir. Eşik ve üzeri “Yanıt gecikiyor” olur; bu durum tek başına ağ kesintisini doğrulamaz. İzleme kapalıysa erişim doğrulanmıyor olarak gösterilir ve geçmiş kayıtlar korunur.

Son veri alımı `lastPolledAt`, CPU/bellek ölçüm zamanı ise `latestHealth.collectedAt` alanından gelir. İkisinin güncelliği bağımsızdır. Göreli zamanın yanında mutlak tarih TSİ olarak görünür. Eksik, bozuk ve gelecek tarihli kayıtlar güncel sayılmaz. CPU/bellek için geçerli yüzde 0–100 aralığıdır; gerçek sıfır korunur, eksik veya geçersiz değer “—” olur. Varsayılan izleme aralığı 300 saniyedir.

“Ölçüm özeti” cihazın mevcut liste kaydını açar; izleme durumu, iki zaman damgası, gecikme eşiği ve port kayıtlarını birlikte gösterir. Liste yenilemesi başarısız olursa önceki kayıt korunur ve açıkça belirtilir. Masaüstü tablo ve mobil kartlar aynı göstergeleri kullanır. Arama, durum filtresi, sayfalama, cihaz ayrıntısı ve mevcut izleme işlemleri korunur.

Kapalı port kayıt sayısı API'nin döndürdüğü `portDownCount` değeridir; alarm sayısı, port izleme kapsamı veya portların anlık sağlık özeti olarak yorumlanmaz. API ve cihaz yapılandırma/yazma sözleşmeleri değiştirilmemiştir.

Doğrulama: `npm run test:nms-device-monitoring`. Sentetik kayıtlarla zaman eşikleri, kapalı izleme, bağımsız ölçüm güncelliği ve eksik/geçersiz değerler test edilir; gerçek cihazlara istek gönderilmez.

## Cihazı İzlemeye Al ekranı

`/integrations/nms/add-device` cihaz seçimi, yönetim adresi/portu, SNMP erişim ayarları, isteğe bağlı SSH, veri toplama seçenekleri ve isteğe bağlı bağlantı testini ayrı bölümlerde gösterir. “Alan grubu hazır” yalnızca form doğrulamasını belirtir. SNMPv2c topluluk adı ve SNMPv3 kullanıcı/parolaları cihaz yapılandırmasıyla eşleştirilmelidir. SNMPv3 `authNoPriv` seçiliyken gizli şifreleme alanları isteğe eklenmez. Parolalar özet ve test sonuçlarına yazılmaz.

**SNMP bağlantı testi:** `POST /api/integrations/nms/test-connection`, `devices.write` yetkisini ve seçilen envanter kaydının henüz NMS izlemeye alınmadığını doğrular. Girilen IP, port ve ilgili sürümün kimlik bilgilerini iç token korumalı NMS ajanının `/test-connection` uç noktasına iletir. Ajan yalnızca standart `sysUpTime.0` ve `sysName.0` OID’lerini okur; cihazı kaydetmez, ölçüm/topoloji kaydı oluşturmaz ve düzenli izlemeyi başlatmaz. SSH, bütün portlar ve kaynak ölçümleri test edilmez. Yanıt alınması yalnızca o ayarlarla test anındaki erişimi doğrular.

Ajan testi 2 saniye SNMP zaman aşımı ve sıfır yeniden denemeyle çalışır; aynı anda en fazla dört test kabul edilir. Web isteğinin zaman sınırı 10 saniyedir. Yanıt yok, ajan/hizmet hatası ve bozuk sonuç birbirinden ayrılır. IP, cihaz veya SNMP kimlik bilgisi değişirse eski sonuç geçersizleşir; bekleyen istemci isteği iptal edilir ve geciken sonuç yok sayılır. İstemcide iptal, ajanın başlamış salt okuma işleminin anında durduğunu garanti etmez; ajan işlemi süreyle sınırlıdır.

**Veri toplama:** mevcut kayıt uç noktası korunur. `pollingEnabled=true` seçilirse ajan yapılandırmayı aldıktan sonra veri toplamayı dener; kapalı seçilirse ayarlar `pollingEnabled=false` ile kaydedilir. Form 30–86400 saniyelik aralığı destekler. İlk ölçüm kayıttan ayrı bir işlemdir. Test zorunlu değildir ve kaydetme eylemi otomatik bağlantı testi çalıştırmaz.

Dağıtımda web ile NMS ajanını birlikte güncelleyin: yeni ajan kodu `nms_service/connection_test.py` içindedir ve ana FastAPI uygulamasına kaydedilir. Eski/erişilemeyen ajan testte açık bir hizmet hatası verir; örnek başarı sonucu üretilmez. Mevcut yapılandırma ve yedek iş akışları değiştirilmez.

Doğrulama: `npm run test:nms-add-device`, `npm run test:nms-connection-test`; NMS Python ortamında `python -B scripts/check-nms-connection-test.py`. Bunlar sentetik SNMP/HTTP taşıyıcıları kullanır, gerçek cihazlara istek göndermez. Python regresyonu gerçek router ve CLI sınırında dokuz test içerir; eksik araç/çalıştırma hatası 503, süre dolması veya yanıtsız cihaz ise ayrı `no_response` sonucu üretir. Paylaşılan SNMP oturumunun eski çağrıları mevcut davranışı korur; yeni test yolu `strict_errors=True` kullanır.

`tests/incident-e2e/nms-workspace.spec.ts` içindeki yedi tarayıcı testi ortak izole regresyon paketine dahildir. Liste hata/boş sonuç ayrımı, bağımsız ölçüm güncelliği, gerçek sıfır, iptal/geciken sonuç, değişen kimlik bilgileri, v3 kapsamı, kapalı veri toplama ve yinelenmeyen kayıt isteği doğrulanır. Gerçek API yetki testi eski ADMIN oturumunun güncel VIEWER rolüyle reddedildiğini, diğer testler ise sentetik taşıyıcılarla masaüstü/mobil ve açık/koyu görünümü kontrol eder. Operasyonel cihazlara veya veritabanına erişilmez.

## Architecture

```
┌─────────────────────────────────────────────────┐
│         InfraScope App Server (Next.js)          │
│                                                  │
│  /api/integrations/nms/*                        │
│  ├── /devices         → device CRUD             │
│  ├── /devices/[id]/ports/monitored              │
│  ├── /alarms          → NMS alarm queries       │
│  ├── /backups         → config backup retrieval │
│  ├── /discovery       → network device discovery│
│  └── /network-devices → switch/router data      │
└──────────────────────┬──────────────────────────┘
                       │ shared PostgreSQL
┌──────────────────────▼──────────────────────────┐
│         PostgreSQL (infrascope DB)               │
│                                                  │
│  tables:                                         │
│  ├── devices              (shared)              │
│  ├── "nmsInterface"       (monitored ports)     │
│  ├── nms_health_metrics   (poll results)        │
│  └── alarm_events         (NMS_PORT_DOWN, ...)  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│         NMS Agent (Python service)               │
│                                                  │
│  - SNMP polling (configurable interval + jitter) │
│  - SSH CLI fallback (vendor-aware)               │
│  - Writes to shared PostgreSQL tables            │
│  - Exposes REST API on separate port             │
└──────────────────────┬──────────────────────────┘
                       │ SNMP/SSH
              ┌────────▼────────┐
              │ Network Devices │
              │ - Switches      │
              │ - Routers       │
              │ - Firewalls     │
              └─────────────────┘
```

## Data Model

### `devices` table (shared)
| Column | Purpose |
|---|---|
| `id`, `name`, `management_ip` | Device identity |
| `device_type`, `vendor`, `model` | Classification |
| `snmp_community`, `snmp_version` | SNMP config |
| `status` | Online/offline (computed from last poll) |

### `nmsInterface` table
| Column | Purpose |
|---|---|
| `id`, `nms_device_id` (FK → devices) | Link to device |
| `interface_name`, `interface_index` | Port identity |
| `description` | Admin description (used for port name lookup) |
| `admin_status`, `oper_status` | Up/down state |
| `monitored` | Whether this interface triggers alarms |
| `speed`, `mtu`, `mac_address` | Port metadata |

### `nms_health_metrics` table
| Column | Purpose |
|---|---|
| `id`, `nms_device_id` | Device reference |
| `cpu_usage`, `memory_usage` | Resource utilization |
| `uptime` | Device uptime (seconds) |
| `polled_at` | Timestamp of poll |

## SNMP Configuration

| Parameter | Value | Rationale |
|---|---|---|
| **Timeout** | 3s | Fail-fast — don't block poll cycles |
| **Retries** | 1 | One retry is enough; unreachable devices should fail quickly |
| **Community** | Per-device encrypted value | Configurable per device |
| **Polling interval** | Configurable + jitter | Prevents thundering herd |

## NMS_PORT_DOWN Alarm

**Detection logic** (in `lib/alarms/detection-engine.ts`):

1. Query `nmsInterface` for all `monitored=true` interfaces
2. Filter where `oper_status = 'down'` AND `admin_status = 'up'`
3. Check cooldown: `deviceName + interface_name + alarmCode` (AI-6)
4. Check in-memory dedup: `createdPortsThisEval` Set (race condition fix)
5. Create `alarm_event` with `rawData: { interface_name, admin_status, oper_status }`

**Auto-resolve:** On next check cycle, if the port's `oper_status` is back to `up`,
the alarm is auto-resolved.

**Port enrichment:** The alarm modal's "Port Listesini Getir" button calls
`/api/integrations/nms/devices/[id]/ports/monitored` to show:
- All monitored interfaces for the device
- Monitored-down ports highlighted in red
- admin/oper status, description, speed, error counters

## Config Backup Integration

Configuration backups use durable PostgreSQL jobs and an independent NMS worker.
ADMIN/EDITOR requests commit a job and audit entry, then return HTTP 202. Fixed OS
profiles select actual Running/Startup commands; unsupported combinations fail.
SSH capture enforces approved host keys, bounded output/deadlines, clean completion
and platform-specific structural checks. Successful artifacts are encrypted with
AES-256-GCM and verified by SHA-256 on content access.

The worker reloads current device credentials independently of SNMP polling,
serializes work per device, retries only transient failures and fences stale lease
owners. Failed authentication blocks unchanged credentials for 15 minutes. The UI
shows durable job state separately from saved artifacts. Active users can read
metadata; ADMIN/EDITOR can create/read content; ADMIN controls deletion/policies.
Content reads, outcomes, policy changes and retention are audited. Deleting an
inventory device preserves its encrypted artifacts as global archive records.

Per-device interval schedules are explicitly enabled by ADMIN. Retention preserves
the newest configured count. Failure and overdue signals use `NMS_BACKUP_FAILED`
in the existing query registry, with cooldown and automatic incident resolution.
Database-only queries do not depend on FortiAnalyzer cache availability.

Customer packages contain application, PostgreSQL, NMS and persistent database-dump
services. Dedicated encryption keys are mandatory in production. Local dumps and
portable authenticated DB-and-key recovery bundles serve different purposes; see
`docs/30-runbooks/nms-backups.md` and ADR-007 for platform limits, recovery and tests.
## Network Device Discovery

`/api/integrations/nms/discovery` endpoint:
- Scans subnet for SNMP-responsive devices
- Identifies vendor via SNMP sysObjectID
- Creates device records with auto-detected properties
- Supports batch import

## Error Handling

| Error | Handler |
|---|---|
| SNMP timeout (3s) | Interface marked unreachable, retry next cycle |
| SNMP auth fail | Logged, device flagged for credential review |
| SSH connection fail | Config backup skipped, logged |
| NMS agent unreachable | Alarm runner skips NMS queries, no false alarms from stale data |

## Related

- [NMS device ID allocation](../../30-runbooks/NMS_DEVICE_ID_ALLOCATION.md) — B17: shared transaction lock for legacy enablement, discovery import and firewall onboarding; atomic discovery marker and concurrency regressions
- [ADR-024](../../10-architecture/adr/ADR-024-shared-nms-device-id-allocation.md) — Allocation boundary and explicit ReadCommitted isolation

- `docs/30-runbooks/DUPLICATE_PORT_DOWN_EVENTS.md` — Race condition fix
- `docs/20-modules/alarms/NMS_ALARM_FALSE_POSITIVE_PREVENTION.md` — False positive prevention
- `lib/alarms/detection-engine.ts` — NMS_PORT_DOWN detection logic
- `docs/10-architecture/IMPROVEMENTS_ANALYSIS.md` — NMS DB consolidation notes
