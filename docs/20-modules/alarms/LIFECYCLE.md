# Alarm Incident Lifecycle

InfraScope alarm yönetiminin authoritative operasyon nesnesi `AlarmIncident` modelidir. `AlarmEvent` artık silinebilir bir alarm satırı değil, bir incident altında tutulan append-only teknik occurrence kaydıdır.

## Veri modeli

| Model | Sorumluluk |
|---|---|
| `AlarmDefinition` | Kural, kategori, severity ve varsayılan bildirim politikası |
| `AlarmIncident` | Aynı koşulun aktif operasyon kaydı; durum, ilk/son görülme ve tekrar sayısı |
| `AlarmEvent` | Her kaynak olayın teknik kanıtı ve ham payload'ı |
| `AlarmLifecycleTransition` | Değiştirilemeyen durum ve operatör aksiyonu geçmişi |
| `NotificationAttempt` | Email gönderimlerinin durum, deneme ve hata geçmişi |
| `AlarmArchivePayload` | Arşivlenen eski occurrence payload'ının gzip sıkıştırılmış kopyası |

## Fingerprint ve deduplication

Incident fingerprint'i `alarmCode + entityType + entityId + conditionKey` bileşiminden SHA-256 ile üretilir. `activeFingerprint` unique constraint'i aynı koşul için yalnızca bir açık incident bulunmasını sağlar. Kaynak olay kimliği ayrıca `(alarmId, sourceEventId)` unique constraint'i ile korunur; aynı teknik olay ikinci kez occurrence oluşturmaz.

## Yaşam döngüsü

```text
OPEN -> ACKNOWLEDGED -> RESOLVED -> CLOSED -> ARCHIVED
  |                         ^
  +------ RESOLVED ---------+

RESOLVED + yeni occurrence -> OPEN (REOPENED)
```

- `ACKNOWLEDGED`: Operatör alarmı gördü; problem devam edebilir.
- `RESOLVED`: Koşul ortadan kalktı veya operatör çözüm kaydetti.
- `CLOSED`: Çözüm doğrulandı; aktif fingerprint serbest bırakılır.
- `ARCHIVED`: Operasyon listesinden ayrılır, kanıt ve audit izi korunur.
- `legalHold=true`: Otomatik retention ve payload compact işlemlerini engeller.

Her geçiş aynı transaction içinde `AlarmLifecycleTransition` ve `AuditLog` kaydı üretir. Kullanıcı aksiyonlarında actor gerçek authenticated session'dan alınır; istemciden gönderilen kullanıcı adına güvenilmez.

## Retention

Varsayılan politika:

- OPEN ve ACKNOWLEDGED incident: süresiz hot storage.
- CLOSED incident: 365 gün sonra soft archive.
- Arşivlenmiş occurrence ham payload: 90 gün sonra gzip compact.
- Notification attempt: 730 gün.
- Lifecycle transition ve audit metadata: fiziksel olarak silinmez.

Değerler `ALARM_RAW_PAYLOAD_RETENTION_DAYS`, `ALARM_INCIDENT_ARCHIVE_DAYS`, `ALARM_NOTIFICATION_RETENTION_DAYS` ve `ALARM_RETENTION_BATCH_SIZE` env değişkenleriyle ayarlanabilir.

## API

- `GET /api/alarm-incidents`: cursor pagination ve status/severity/source/archive filtreleri.
- `GET /api/alarm-incidents/:id`: occurrence, transition ve notification attempt geçmişi.
- `PATCH /api/alarm-incidents`: lifecycle, assignment, archive ve legal-hold aksiyonları.
- `GET|POST /api/alarm-incidents/retention`: retention durumu ve ADMIN tarafından worker çalıştırma.
- `GET|POST /api/alarms/cleanup`: geriye uyumlu soft-archive endpoint'i; fiziksel silme yapmaz.

`/api/alarms` eski header bildirimleri ve geriye uyumluluk için kalır. Yeni Alarm Center ekranı `/api/alarm-incidents` kullanır.
