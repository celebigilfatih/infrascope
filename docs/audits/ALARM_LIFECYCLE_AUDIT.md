# InfraScope Alarm Lifecycle Audit

**Tarih:** 2026-07-10  
**Kapsam:** Alarm tanımları, alarm event üretimi, lifecycle, deduplication, bildirim, cleanup/retention ve alarm UI  
**Yöntem:** Statik kod ve dokümantasyon incelemesi; kod veya veri modeli değiştirilmemiştir.

## Kaynak Doküman Notu

Görevde belirtilen aşağıdaki dosyalar repoda bulunmamaktadır:

- `docs/PROJECT_CONSTITUTION.md`
- `docs/CODEX_WORKFLOW.md`
- `docs/CHANGELOG_AI.md`

İncelemede bunların authoritative karşılıkları olarak aşağıdaki mevcut kaynaklar kullanılmıştır:

- `docs/00-product/CONSTITUTION.md`
- `docs/QUEST_MODE_GUIDE.md`
- `CHANGELOG.md`
- `docs/10-architecture/OVERVIEW.md`
- `docs/20-modules/alarms/*`

Anayasa alarm sisteminde cooldown ve auto-resolve davranışını zorunlu tutmakta, scheduler işlerinin idempotent olmasını istemekte ve cooldown anahtarını `deviceName + interface_name + alarmCode` olarak tanımlamaktadır (`docs/00-product/CONSTITUTION.md`, ilkeler 5 ve 14; AI-6).

## Genel Değerlendirme

InfraScope alarm sistemi güçlü bir detection/query katmanına, alarm kataloğuna, suppression/whitelist desteğine, email bildirimi ve DLQ mekanizmasına sahiptir. Buna karşılık kalıcı veri modeli halen "her tetiklenme bir `AlarmEvent`" yaklaşımındadır. Aktif problem, tekrar eden occurrence, kullanıcı onayı, teknik çözülme, operasyonel kapatma ve arşiv kavramları birbirinden ayrılmamıştır.

En kritik risk, event sayısını kontrol etmek için fiziksel silmenin lifecycle yönetimi yerine kullanılmasıdır. Bu yaklaşım geçmiş olay hafızasını, korelasyon alarm sonuçlarını, notification kanıtlarını ve audit güvenilirliğini zayıflatmaktadır.

## Mevcut Alarm Akışı

1. `AlarmDefinition`, alarmın kodunu, adını, kategori/severity değerini, detection logic'ini, cooldown süresini ve email tercihini tutar (`prisma/schema.prisma:1015`).
2. Scheduler veya watchdog `runAlarmCheck()` çağırır; runner in-process mutex ve `AlarmCheckLog` tabanlı ikinci bir guard kullanır (`lib/alarms/alarm-runner.ts:123`, `lib/alarms/alarm-runner.ts:234`).
3. Detection engine yalnızca `enabled=true` definition'ları yükler ve severity önceliğiyle değerlendirir (`lib/alarms/detection-engine.ts:370`).
4. Query registry, event cache, FortiAnalyzer/FortiGate/VMware ve NMS kaynakları üzerinden eşleşmeler bulunur.
5. Suppression ve whitelist kontrollerinden geçen eşleşme için `AlarmEvent` oluşturulur (`lib/alarms/detection-engine.ts:2266`, `lib/alarms/detection-engine.ts:2280`).
6. Definition üzerinde `notifyEmail=true` ise email denenir; başarılı gönderimde event üzerinde `notifiedAt` ve `notifyChannel` güncellenir (`lib/alarms/detection-engine.ts:2295`).
7. SMTP hataları `NotificationDLQ` kaydına dönüşebilir ve alarm check döngüsünde yeniden denenir (`lib/notifications/dlq-worker.ts:43`, `lib/alarms/alarm-runner.ts:398`).
8. `/api/alarms` eventleri 25 kayıtlık sayfalarla döndürür; UI infinite scroll ile sonraki offsetleri yükler (`app/api/alarms/route.ts:19`, `app/dashboard/alerts/page.tsx:369`).
9. Kullanıcı PATCH ile eventleri onaylar. API `acknowledged`, `acknowledgedBy` ve `acknowledgedAt` alanlarını günceller (`app/api/alarms/route.ts:115`).
10. Eski eventler manuel cleanup endpointi üzerinden fiziksel olarak silinebilir (`app/api/alarms/cleanup/route.ts:13`).

### AlarmDefinition ve AlarmEvent İlişkisi

- Bir `AlarmDefinition` birden fazla `AlarmEvent` üretebilir.
- `AlarmEvent.alarmId`, definition kaydına zorunlu foreign key ile bağlıdır (`prisma/schema.prisma:1035`).
- Migration foreign key'i `ON DELETE RESTRICT` olarak oluşturur; event varken definition silinemez (`prisma/migrations/20260331134657_add_nms_integration/migration.sql:389`).
- Event kendi severity değerini snapshot olarak saklar; ancak category, definition source ve definition name event üzerinde snapshot değildir. Bu bilgiler listeleme sırasında güncel definition ilişkisinden okunur (`app/api/alarms/route.ts:73`). Definition daha sonra değiştirilirse geçmiş eventin sınıflandırma görünümü de değişebilir.
- Eventte yalnızca `createdAt` vardır. Kaynak olayın özgün zamanı, external event ID'si ve immutable source identity alanı bulunmaz; bunlar varsa `rawData` içinde dağınık kalır.

## Sorunlu Noktalar

### 1. Acknowledge ile Resolve Aynı Kavram Gibi Kullanılıyor

`AlarmEvent` üzerinde ayrı lifecycle status alanı yoktur. Kullanıcı onayı da sistemin teknik olarak problemi çözmesi de aynı `acknowledged` alanına yazılır.

- Kullanıcı onayı `acknowledgedBy='admin'` yazar (`app/api/alarms/route.ts:124`).
- NMS port recovery `acknowledgedBy='system:auto-resolve'` yazar (`lib/alarms/detection-engine.ts:3995`).
- NMS device recovery aynı alanı kullanır (`lib/alarms/detection-engine.ts:4233`).

Sonuç olarak "operatör gördü fakat sorun devam ediyor" ile "kaynak koşul gerçekten düzeldi" ayırt edilemez. Anayasanın auto-resolve zorunluluğu yalnızca iki NMS alarmında kısmen uygulanmıştır; diğer alarm kaynaklarında genel recovery/lifecycle kontratı yoktur.

### 2. Kullanıcı Kimliği Güvenilir Değil

Acknowledge endpointi session aktörünü kullanmak yerine `acknowledgedBy='admin'` değerini hardcoded yazar. UI da body içinde aynı değeri gönderir; API ise body'deki aktörü kullanmasa bile gerçek kullanıcıyı kaydetmez (`app/dashboard/alerts/page.tsx:547`, `app/api/alarms/route.ts:127`).

Whitelist oluşturma API'si `createdBy` değerini request body'den kabul eder; UI yine `admin` gönderir (`app/api/alarms/whitelist/route.ts:11`, `app/dashboard/alerts/page.tsx:626`). Bu davranış güvenilir audit actor üretmez.

### 3. Notification Durumu Belirsiz

`notifiedAt=null` aşağıdaki durumların tamamını temsil edebilir:

- Email alarm için kapalıdır.
- SMTP yapılandırılmamıştır.
- Rate limit veya email cooldown nedeniyle gönderim atlanmıştır.
- Gönderim başarısızdır ve DLQ pending durumundadır.
- Gönderim kalıcı olarak başarısızdır.

Detection engine son 24 saatte `notifiedAt=null` olan eventleri doğrudan tekrar dener (`lib/alarms/detection-engine.ts:547`). Aynı alarm check sonunda DLQ worker da pending kayıtları tekrar işler (`lib/alarms/alarm-runner.ts:398`). Tek authoritative notification attempt state bulunmadığı için aynı bildirimin iki mekanizma tarafından denenmesi ve operasyonel durumun yanlış yorumlanması mümkündür.

### 4. NMS Katalog Sözleşmesi Eksik

Detection engine `NMS_PORT_DOWN`, health ve unreachable definition'larını DB'de arar (`lib/alarms/detection-engine.ts:3950`). Query registry'de de NMS kodları vardır (`lib/alarms/queries/index.ts:291`). Ancak güncel 98 definition içeren `ALARM_DEFINITIONS` kataloğunda `NMS_*` tanımı bulunmamaktadır. Fresh kurulumda bu definition'lar başka bir kalıcı kaynaktan oluşturulmuyorsa NMS evaluator sessizce boş döner.

### 5. Dokümantasyon ve Runtime Davranışı Ayrışıyor

Architecture overview, alarm cleanup işini günlük 02:00 görevi olarak gösterir (`docs/10-architecture/OVERVIEW.md`, Background Services). `cleanup-scheduler.ts` bu zamanlamayı tanımlar ancak `startAlarmCleanupScheduler()` fonksiyonunu çağıran hiçbir runtime noktası bulunmamaktadır (`lib/alarms/cleanup-scheduler.ts:367`). Otomatik retention fiilen başlamıyor olabilir.

## Alarm Silmenin Riskleri

### Fiziksel Silme Yolları

Tek bir event için `DELETE /api/alarms/:id` endpointi yoktur. Bunun yerine iki cleanup implementasyonu vardır:

- UI ve API üzerinden çalışan manuel cleanup: varsayılan 7 gün, varsayılan olarak yalnızca acknowledged eventler (`app/api/alarms/cleanup/route.ts:13`).
- Başlatılmayan scheduler tasarımı: acknowledged için 30 gün, unacknowledged için 90 gün (`lib/alarms/cleanup-scheduler.ts:22`).

UI'daki event detayındaki `Discard` butonu event silmez; seçilen IP/user/device değerini whitelist'e ekleyerek gelecekteki alarmları bastırır (`app/dashboard/alerts/page.tsx:598`, `app/dashboard/alerts/page.tsx:2179`). Mevcut event otomatik olarak acknowledge, resolve veya archive edilmez.

### Veri ve Audit Riskleri

1. **Korelasyon hafızası kaybı:** Correlation kuralları precursor olarak geçmiş `AlarmEvent` kayıtlarını sorgular (`lib/alarms/detection-engine.ts:629`). Cleanup gelecekteki korelasyon sonuçlarını değiştirir.
2. **Notification kanıtı kaybı:** Manuel cleanup önce bağlı DLQ kayıtlarını, sonra eventleri siler. İşlem transaction içinde değildir (`app/api/alarms/cleanup/route.ts:74`). Event silme başarısız olursa notification geçmişi daha önce silinmiş olabilir.
3. **Scheduler FK hatası:** Scheduler doğrudan `alarmEvent.deleteMany()` çağırır, bağlı DLQ kayıtlarını temizlemez (`lib/alarms/cleanup-scheduler.ts:133`). Foreign key `ON DELETE RESTRICT` olduğu için DLQ ilişkili eventlerde cleanup başarısız olabilir.
4. **Eksik audit:** Manuel cleanup audit kaydı oluşturmaz. Scheduler toplu bir audit kaydı yazmayı dener ancak event bazında hangi kanıtların silindiğini saklamaz (`lib/alarms/cleanup-scheduler.ts:248`).
5. **Yetki aşımı:** Middleware `POST` isteklerini `write` sayar. `alarms:write` ADMIN ve EDITOR rollerine açıktır. Bu nedenle EDITOR fiziksel cleanup çalıştırabilir; `alarms:delete` kontrolü devreye girmez (`middleware.ts:31`, `lib/auth/permission-policy.ts:14`).
6. **Açık alarm kaybı:** Manuel endpoint `acknowledged=false` parametresiyle eski unacknowledged eventleri de fiziksel olarak silebilir (`app/api/alarms/cleanup/route.ts:19`).
7. **Raporlama zayıflığı:** Alarm trendi, MTTA/MTTR, recurrence, false-positive oranı ve notification delivery başarısı fiziksel silinen kayıtlar üzerinden hesaplanamaz.

## Eksik Lifecycle Alanları

Mevcut `AlarmEvent` modelinde aşağıdaki kavramlar bulunmamaktadır:

| Eksik alan/kavram | Amaç |
|---|---|
| `status` | OPEN, ACKNOWLEDGED, RESOLVED, CLOSED gibi operasyonel durum |
| `fingerprint` | Aynı problem/varlığın deterministik kimliği |
| `entityType`, `entityId`, `conditionKey` | Alarmın hangi cihaz, port, kullanıcı veya nesneye ait olduğu |
| `firstSeenAt`, `lastSeenAt` | Problemin başlangıç ve son görülme zamanı |
| `occurrenceCount` | Aynı incident altında kaç kez tekrarlandığı |
| `resolvedAt`, `resolvedBy`, `resolutionReason` | Teknik çözülme kanıtı |
| `closedAt`, `closedBy`, `closeReason` | Operasyonel kapatma bilgisi |
| `assignedTo`, `assignedAt` | Incident sahipliği |
| `reopenedAt`, `reopenCount` | Aynı condition tekrar aktif olduğunda takip |
| `archivedAt`, `archiveReason` | Operasyonel görünümden çıkarma; silmeden saklama |
| `retentionClass`, `legalHold` | Saklama ve purge politikası |
| `sourceEventId`, `sourceOccurredAt` | External eventin immutable kimliği ve gerçek zamanı |

Lifecycle geçişleri için immutable transition tablosu da yoktur. `acknowledged` alanı tekrar false yapılabildiği halde bu geçişin geçmişi veya nedeni saklanmaz.

## Deduplication İhtiyacı

### Mevcut Mekanizmalar

- Birçok alarm yalnızca `alarmId + createdAt >= cooldownThreshold` sorgusuyla global cooldown uygular (`lib/alarms/detection-engine.ts:907`). Bu, aynı alarm kodunun farklı cihazlardaki gerçek olaylarını da bastırabilir.
- Bazı VPN alarmları kullanıcı bazında event arar (`lib/alarms/detection-engine.ts:2155`).
- Bazı per-user yollar `AlarmCooldown(alarmId, deviceName)` tablosunu kullanır (`prisma/schema.prisma:1061`).
- NMS port alarmı loop içi `Set`, cooldown tablosu ve legacy event kontrolünü birlikte kullanır (`lib/alarms/detection-engine.ts:4023`).
- NMS health ve unreachable alarmları `findFirst` ardından `create` yaptığı için eşzamanlı workerlar arasında atomik değildir (`lib/alarms/detection-engine.ts:4163`, `lib/alarms/detection-engine.ts:4289`).
- Email katmanı ayrıca process-local ve yalnızca alarm code bazlı 5 dakikalık cooldown kullanır (`lib/notifications/email.ts:67`, `lib/notifications/email.ts:184`). Restart veya farklı process bu hafızayı paylaşmaz.

### Kritik Race Condition

NMS port akışındaki `findUnique -> upsert -> AlarmEvent.create` sırası gerçek bir atomik claim değildir. İki worker aynı expired/missing cooldown kaydını görebilir; ikinci `upsert` mevcut kaydı update ederek başarılı olur ve iki worker da event oluşturmaya devam edebilir (`lib/alarms/detection-engine.ts:4057`). P2002 yakalama mantığı bu upsert davranışında her zaman "kaybeden worker" üretmez.

### Önerilen Fingerprint

Deduplication, cooldown'dan ayrılmalıdır. Her detection aşağıdaki bileşenlerden deterministik fingerprint üretmelidir:

```text
fingerprint = hash(alarmCode + normalizedEntityKey + conditionDiscriminator)
```

Örnek entity key'ler:

- NMS port: `nmsDeviceId:interfaceIndex`
- NMS cihaz: kalıcı `deviceId`
- VMware: vCenter ID + MoRef
- VPN: kullanıcı + remote source IP + session ID
- Firewall config: device + VDOM + cfgpath + object ID
- Kaynak log: FortiAnalyzer log ID veya external event ID

Aynı fingerprint için tek açık incident veritabanı unique constraint ve transaction/upsert ile korunmalıdır. Cooldown yalnızca tekrar bildirim zamanını yönetmeli; event kanıtını veya incident lifecycle'ını belirlememelidir.

## Archive/Retention İhtiyacı

### Önerilen Başlangıç Politikası

| Veri sınıfı | Hot retention | Archive/Purge davranışı |
|---|---:|---|
| OPEN/ACKNOWLEDGED incident | Süresiz | Resolve/close olmadan purge edilmez |
| RESOLVED/CLOSED incident özeti | En az 365 gün | Arşivden sorgulanabilir kalır |
| Ham occurrence payload | 90 gün | Sonrasında compact/archive edilir |
| Lifecycle transition ve audit metadata | En az 730 gün | Legal hold varsa purge edilmez |
| Notification attempt/DLQ geçmişi | En az 180 gün | Incident ile ilişki korunur |

Süreler müşteri politikasına göre yapılandırılabilir olmalıdır. v1 için aynı PostgreSQL içinde soft archive yeterlidir. Fiziksel purge ancak archive tamamlandıktan sonra, ADMIN veya system actor ile, transaction içinde ve audit kaydı üreterek çalışmalıdır.

### Retention Worker Gereksinimleri

- Uygulama başlangıcında gerçekten register edilmeli veya ayrı worker/container olarak çalışmalıdır.
- Birden çok replica için PostgreSQL advisory lock veya job lease kullanmalıdır.
- Batch/cursor ile işlemeli; büyük `IN (...)` ve uzun table lock oluşturmamalıdır.
- Active incident, pending notification, legal hold ve audit ilişkilerini kontrol etmelidir.
- Dry-run sonucu ile gerçek çalışma aynı policy evaluator'ı kullanmalıdır.
- Çalışma özeti, hata ve son başarılı run zamanı health/monitoring yüzeyinde görünmelidir.

## UI Filtreleme İhtiyacı

### Mevcut Davranış

- API varsayılan 25, maksimum 200 event döndürür ve offset pagination kullanır (`app/api/alarms/route.ts:19`).
- UI infinite scroll ile eventleri DOM'a eklemeye devam eder (`app/dashboard/alerts/page.tsx:421`). Çok uzun listelerde DOM ve client memory büyür.
- Yeni eventler listenin başına eklendiğinde offset kayar; sonraki sayfalarda kayıt atlama veya duplicate gösterme riski vardır.
- Sessiz refresh ilk sayfayı yeniden yükler fakat mevcut offset state'ini her zaman sıfırlamaz (`app/dashboard/alerts/page.tsx:492`).
- Kaynak filtre sayaçları yalnızca yüklenmiş `events` dizisinden hesaplanır; toplam DB sayısını göstermez (`app/dashboard/alerts/page.tsx:852`).
- "Tümünü Onayla" yalnızca tarayıcıya yüklenmiş event ID'lerini gönderir (`app/dashboard/alerts/page.tsx:582`). API validatorü en fazla 100 ID kabul eder (`lib/validators/alarms.ts:3`).
- UI'da acknowledge/severity/source/search filtreleri vardır ancak lifecycle status, incident, tarih aralığı, assignee, archived, reopened, notification status ve retention class filtreleri yoktur.
- Cleanup ve cleanup stats butonları ana NOC ekranında görünür; fiziksel veri yönetimi günlük alarm operasyonuyla karışmıştır (`app/dashboard/alerts/page.tsx:783`).

### Önerilen UI Ayrımı

1. **Aktif Incidentler:** OPEN ve ACKNOWLEDGED; varsayılan operasyon ekranı.
2. **Çözülenler:** RESOLVED/CLOSED; tarih ve çözüm filtresi.
3. **Arşiv:** Salt okunur, ayrı sorgu ve export yüzeyi.
4. **Occurrence geçmişi:** Incident detayında timeline; ana listede her tekrar ayrı satır olmamalı.
5. **Retention yönetimi:** Yalnızca ADMIN settings/maintenance ekranında; dry-run ve audit özetiyle.

Listeleme cursor tabanlı olmalı. Sayaçlar server-side aggregate API'den gelmeli ve lifecycle/source/severity/date filtreleriyle aynı query contract'ını kullanmalıdır.

## P0 / P1 / P2 Düzeltme Listesi

### P0 - Veri Kaybını ve Yanlış Lifecycle'ı Durdur

1. Manuel fiziksel cleanup'ı yalnızca ADMIN'e sınırlandır; `POST=write` üzerinden delete yetkisi bypass edilmesini kapat.
2. OPEN/ACKNOWLEDGED kayıtların fiziksel silinmesini engelle; lifecycle mimarisi gelene kadar cleanup'ı resolved/archived olmayan kayıtlarda fail-closed yap.
3. Acknowledge ile resolve alanlarını ayır; NMS auto-resolve'un kullanıcı onayı yazmasını durdur.
4. Session kullanıcı ID/email bilgisini acknowledge, whitelist ve cleanup audit actor olarak kullan; hardcoded/client-supplied `admin` değerlerini kaldır.
5. Dedup için kalıcı fingerprint ve atomik tek-açık-incident constraint'i ekle; NMS cooldown upsert race'ini gider.
6. Cleanup + NotificationDLQ ilişkilerini tek transaction içinde yönet; partial delete ve FK hatalarını engelle.
7. Detection retry ve DLQ retry mekanizmalarını tek authoritative `NotificationAttempt` akışında birleştir.
8. NMS evaluator/registry kodlarının definition kataloğunda bulunmasını garanti et ve startup contract testine bağla.

### P1 - Lifecycle ve Retention Ürünleştirmesi

1. `AlarmIncident`, `AlarmOccurrence` ve `AlarmLifecycleTransition` modelini ekle.
2. OPEN -> ACKNOWLEDGED -> RESOLVED -> CLOSED ve REOPENED geçiş kurallarını merkezi lifecycle service içinde uygula.
3. Tüm alarm kaynakları için entity key ve recovery strategy kontratı tanımla.
4. Soft archive ve yapılandırılabilir retention policy ekle; worker'ı distributed lock ile güvenilir şekilde başlat.
5. Notification attempt status, kanal, retry ve error geçmişini incident/occurrence ile ilişkilendir.
6. Cursor pagination, server-side sayaçlar ve lifecycle/date/assignee/archive filtrelerini ekle.
7. Incident transition, whitelist, retention ve purge işlemlerini immutable audit log'a yaz.
8. MTTA, MTTR, recurrence, reopen ve false-positive metriklerini raporlama yüzeyine ekle.

### P2 - Ölçek ve Uzun Dönem Saklama

1. `AlarmOccurrence` için aylık PostgreSQL partitioning değerlendir.
2. Cold archive/export ve restore/read-only sorgu akışı ekle.
3. Legal hold ve müşteri bazlı retention policy profilleri ekle.
4. Duplicate rate, open-incident age, archive backlog ve retention worker health metriklerini oluştur.
5. Büyük listeler için virtualized table ve saved filters/views ekle.
6. Alarm gürültüsü için occurrence rate/anomaly tabanlı dinamik notification policy değerlendir.

## Önerilen Yeni Alarm Mimarisi

```text
AlarmDefinition
      |
      | detection policy, severity, category, source, recovery strategy
      v
AlarmIncident  <---- one active row per fingerprint
      |
      +---- AlarmOccurrence[]          append-only source evidence
      +---- AlarmLifecycleTransition[] immutable state/audit history
      +---- NotificationAttempt[]      delivery and retry history
```

### AlarmDefinition

Kural ve varsayılan politika kaynağı olarak kalır. `source` serbest metin yerine kontrollü enum/contract olmalı. Definition; entity key üretme, fingerprint discriminator ve recovery strategy metadata'sını taşımalıdır.

### AlarmIncident

Tek operasyonel problemi temsil eder. Önerilen temel alanlar:

- `fingerprint`
- `definitionId`
- `status`
- `entityType`, `entityId`, `conditionKey`
- `severitySnapshot`, `categorySnapshot`, `sourceSnapshot`
- `firstSeenAt`, `lastSeenAt`, `occurrenceCount`
- acknowledge, assignment, resolution, close ve archive metadata
- `reopenCount`, `retentionClass`, `legalHold`

OPEN ve ACKNOWLEDGED durumları için fingerprint unique olmalıdır. Condition yeniden görülürse yeni incident oluşturmak yerine `lastSeenAt` ve `occurrenceCount` güncellenmeli; incident kapanmışsa policy'ye göre REOPENED veya yeni incident oluşturulmalıdır.

### AlarmOccurrence

Her kaynak olayın append-only kanıtıdır. External source event ID, source timestamp, normalized entity bilgisi ve raw payload burada tutulmalıdır. Duplicate external event ID aynı occurrence'ı ikinci kez oluşturmamalıdır.

### AlarmLifecycleTransition

Her durum değişimini `fromStatus`, `toStatus`, actor, reason ve timestamp ile immutable kaydeder. Kullanıcı işlemleri session actor; recovery işlemleri açık bir system actor ile yazılır.

### NotificationAttempt

Email/DLQ için tek authoritative durum kaynağıdır. `PENDING`, `SENT`, `FAILED_RETRYABLE`, `FAILED_PERMANENT`, `SKIPPED_DISABLED` gibi durumları ayırır. Notification cooldown incident/fingerprint bazında uygulanır; event/occurrence kaydını engellemez.

### Lifecycle Akışı

```text
Yeni fingerprint  -> OPEN
OPEN              -> ACKNOWLEDGED  (operatör gördü, sorun devam edebilir)
OPEN/ACKNOWLEDGED -> RESOLVED      (kaynak koşul düzeldi)
RESOLVED          -> REOPENED      (aynı condition tekrar aktif)
RESOLVED          -> CLOSED        (operasyonel inceleme tamamlandı)
CLOSED            -> ARCHIVED      (hot görünümden çıkarıldı)
ARCHIVED          -> PURGED        (retention + legal hold koşulları sağlandı)
```

Archive operasyonel status'tan ayrı bir storage state olarak modellenmelidir; audit ve lifecycle geçmişi purge edilmeden korunmalıdır.

## Sonuç

Mevcut sistem alarm üretme ve bildirim gönderme açısından işlevseldir; ancak event tabanlı kayıt modeli incident lifecycle ihtiyacını karşılamamaktadır. Fiziksel cleanup, alarm gürültüsünü azaltan bir ürün davranışı değil, geçmiş kanıtı silen bir bakım işlemidir. Öncelik yeni alarm eklemekten önce veri kaybını durdurmak, acknowledge/resolve ayrımını yapmak ve fingerprint tabanlı tek aktif incident modeline geçmek olmalıdır.
