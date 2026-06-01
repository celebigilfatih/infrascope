# Runbook: VMware Datastore Kritik Doluluk Alarmı

> **Kategori:** Kapasite alarmı (gerçek olay, otomasyona kapalı)
> **Etkilenen alarmlar:** `DATASTORE_SPACE_CRITICAL`, `DATASTORE_SPACE_LOW`
> **Belirti:** Datastore'lar kapasite eşiklerini aşıyor; alarm tetikleniyor.
> **İlgili dosyalar:** [`lib/alarms/alarm-definitions.ts`](../../lib/alarms/alarm-definitions.ts), [`lib/integrations/vmware.ts`](../../lib/integrations/vmware.ts), [`lib/alarms/queries/vmware.ts`](../../lib/alarms/queries/vmware.ts)

---

## 1. Belirtiler

| Yer | Görünüm |
|---|---|
| Alarm sayfası | `DATASTORE_SPACE_CRITICAL` (severity: CRITICAL), `DATASTORE_SPACE_LOW` (severity: WARNING) |
| Etkilenen kaynak | Datastore adı + kullanım yüzdesi |
| `/virtualization/datastores` | İlgili datastore'lar kırmızı/sarı boyalı |

---

## 2. Eşikler (Mevcut)

| Alarm | Eşik | Severity | Cooldown |
|---|---|---|---|
| `DATASTORE_SPACE_LOW` | %85 doluluk | WARNING | 30 dk |
| `DATASTORE_SPACE_CRITICAL` | %92 doluluk | CRITICAL | 15 dk |

**Not:** Bu eşikler yapılandırılabilir; değişiklik için ADR + `alarm-definitions.ts` güncellemesi gerekir.

---

## 3. Bu Alarm Otomatik Çözülmez

Datastore kapasite alarmları **gerçek operasyonel** sorunlardır.
Auto-resolve yapılmaz çünkü:
- VM dosyaları zamanla büyür → durum kötüleşir, kendi kendine düzelmez.
- Snapshot temizliği / VM taşıma / disk genişletme **insan kararı** gerektirir.
- Otomatik silme/temizleme **veri kaybı** riski taşır.

Bu, Anayasa İlke #5'in (cooldown ve auto-resolve zorunludur) **istisnasıdır**:
zira durum kalıcıdır, alarm zaten kendi cooldown penceresinde tetiklenir, geçici dalgalanma yoktur.

---

## 4. Triage (15 dakika)

```text
1. Hangi datastore? Alarm event'inin "datastoreName" alanını oku.

2. Doluluk trendi:
   /virtualization/datastores → grafik
   Hızlı mı doluyor (saatler), yavaş mı (günler)?

3. En büyük dosyaları/VM'leri listele:
   vCenter > Storage > Datastore > Files veya:
   PowerCLI: Get-Datastore <name> | Get-VM | Sort UsedSpaceGB -Desc

4. Snapshot'lara bak (en yaygın sebep):
   PowerCLI: Get-VM | Get-Snapshot | Sort SizeGB -Desc | Select -First 20
   → Eski/orphan snapshot'lar genelde >%30 boşluk geri kazandırır.
```

---

## 5. Çözüm Eylemleri (Önce Az Riskliden Çoğa)

| # | Eylem | Risk | Tahmini Kazanım |
|---|---|---|---|
| 1 | Eski snapshot'ları sil | Düşük | %10–%40 |
| 2 | Power-off VM'lerin diskini sıkıştır (thin shrink) | Düşük | %5–%15 |
| 3 | Düşük öncelikli VM'leri başka datastore'a Storage vMotion | Orta | İstendiği kadar |
| 4 | Datastore'u büyüt (LUN extend / yeni disk) | Orta-Yüksek | Limitsiz |
| 5 | Yeni datastore ekle, yük dağıt | Yüksek | Limitsiz |

**ASLA YAPILMAZ:**
- ❌ VM dosyalarını manuel silme (kataloglu olmayan dosya bile orphan VM olabilir).
- ❌ "Cleanup" cron'u kurma (otomatik silme = veri kaybı riski).

---

## 6. Tekrar Tetiklenme Önlemi

Alarmı sustur değil, **eşiği gözden geçir**:
- Eğer datastore kalıcı olarak %85+ çalışıyorsa kapasite planlama yapılır.
- Eğer "VM şişme" sorunu varsa kullanıcı eğitimi + thin provisioning politikası.

Eşik değişikliği için **ADR** açılır.

---

## 7. Otomasyonu Engelleme

Bu alarm tipinde `isTrustedAutomation()` filtresi **çalışmaz** (zaten datastore-event değil, kapasite event'i).
Yani veeam/pyvmomi/vcenter olayları bu alarmı tetiklemez veya susturmaz.

---

## 8. İzleme

- Aylık kapasite raporu: `/reports` → "Datastore Capacity Trend"
- Eşik aşımı önceden öngörülmek isteniyorsa **forecast** modülü (`/analytics/forecast`) kullanılır.

---

## 9. İlgili Anayasa Maddeleri

- İlke #4: **Alarmlar sinyaldir, gürültü değildir** — bu alarm tipi istisna olarak auto-resolve etmez.
- İlke #1: **Asla mock veri** — vCenter down ise bu alarm hiç tetiklenmez (durum bilinemez).

---

## 10. Değişiklik Geçmişi

| Tarih | Değişiklik |
|---|---|
| 2026-02-17 | İlk sürüm — eşikler, triage adımları, "auto-resolve etmiyoruz" gerekçesi |
| 2026-05-18 | DATASTORE_SPACE_CRITICAL/LOW alarmları ALARM_QUERY_REGISTRY'ye kaydedildi (vmware.ts) |
