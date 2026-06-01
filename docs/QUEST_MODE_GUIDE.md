# Quest Mode Kullanım Rehberi

> Bu dosya, eksik/bozuk özellikleri Quest Mode ile çözmek için **kopyala-yapıştır** prompt'ları içerir.
> Her prompt, Quest'in okuması gereken **anchor dosyaları** ile birlikte verilir.

---

## Nasıl Kullanılır

1. Qoder'da **Quest Mode** aç (⌘K → "Quest" veya sağ üstteki Quest butonu)
2. Aşağıdaki prompt'lardan **birini** kopyala-yapıştır yap
3. Quest, anchor dosyalarını otomatik okuyacak, plan yapacak ve uygulayacak
4. Bittiğinde **knowledge capture** adımını kontrol et (CHANGELOG + runbook güncellemesi)

---

## Quest 1: NMS/Vmware Alarmlarını Registry'e Ekle

**Sorun:** `ALARM_QUERY_REGISTRY`'de sadece FortiAnalyzer alarmları var. NMS ve VMware alarmları
generic `performLogSearch()` ile çalışıyor — bu hatalı çünkü:
- NMS_PORT_DOWN → Prisma `nmsInterface` tablosu sorgusu gerektir (event log değil)
- DATASTORE_SPACE_CRITICAL → VMware datastore metric gerektir
- VM_RECONFIGURED, VM_CLONED → VMware event sync gerektir

**Scope:** ~15 alarm (NMS: 3, VMware: ~12)

### Quest Prompt

```
Anchors:
- docs/00-product/CONSTITUTION.md
- docs/10-architecture/adr/ADR-002-alarm-query-registry-pattern.md
- lib/alarms/queries/index.ts (ALARM_QUERY_REGISTRY satır 195-250)
- lib/alarms/queries/vmware.ts (varsa)
- lib/alarms/queries/nms.ts (varsa)
- lib/alarms/alarm-definitions.ts

Task: NMS ve VMware alarmlarını ALARM_QUERY_REGISTRY'ye ekle.

1. lib/alarms/queries/index.ts içinde şu alarm kodlarını registry'ye kaydet:
   NMS_PORT_DOWN, NMS_DEVICE_UNREACHABLE, NMS_BACKUP_FAILED
   DATASTORE_SPACE_CRITICAL, DATASTORE_SPACE_LOW
   VM_RECONFIGURED, VM_CLONED, VM_DELETED, VM_CREATED
   VM_POWERED_ON, VM_POWERED_OFF, VM_SUSPENDED, VM_RESTARTED
   VM_CPU_CRITICAL, VM_MEMORY_CRITICAL, VM_MIGRATED
   SNAPSHOT_CREATED, SNAPSHOT_DELETED, SNAPSHOT_REVERTED

2. Eğer query fonksiyonları yoksa, stub fonksiyonlar yaz:
   - Her fonksiyon AlarmQueryFn interface'ini implement etsin
   - runAlarmQuery() pattern'ini kullan (cache-first, FA fallback)
   - VMware alarmları için: cached_events tablosundan source='vmware' filtresi
   - NMS alarmları için: nmsInterface / nms_health_metrics tablolarından sorgu

3. Her alarm için:
   - alarm-definitions.ts'deki source alanına bak ('vmware' ise VMware query, değilse generic)
   - Eğer source='vmware' ise → VMware event sync verisinden sorgula
   - Eğer NMS alarmı ise → nmsInterface tablosundan sorgula

4. Test: `npx tsc --noEmit` hatasız geçmeli

Knowledge capture:
- [ ] CHANGELOG.md'ye ekle
- [ ] docs/30-runbooks/DATASTORE_CRITICAL.md güncelle (kaynak değişiklik)
```

---

## Quest 2: FortiAnalyzer Session Expiry Detection'ı Tüm API Metodlarına Yay

**Sorun:** `lib/integrations/fortianalyzer.ts` içinde `invalidateSession()` sadece `getStatus()`
için eklenmiş. Diğer metodlar (getAdoms, getDevices, startLogSearch, fetchLogResults,
getFortiView, getMitreAttackMatrix) hâlâ session-expiry check yapmıyor.

**Scope:** 6 metod

### Quest Prompt

```
Anchors:
- docs/00-product/CONSTITUTION.md
- docs/10-architecture/adr/ADR-003-fa-session-management.md
- lib/integrations/fortianalyzer.ts

Task: Session-expiry detection'ı tüm FA API metodlarına ekle.

1. getStatus() metodundaki pattern'i incele (satır ~300 civarı):
   - outerErr.code === -11/-6 → invalidateSession()
   - innerStatus.code === -11/-6 → invalidateSession()

2. Aynı pattern'i şu metodların response handler'larına ekle:
   - getAdoms()
   - getDevices()
   - startLogSearch()
   - fetchLogResults()
   - getFortiView()
   - getMitreAttackMatrix()
   - getMitreTechniqueDetails()

3. Pattern her metodda:
   ```typescript
   const outerErr = data.error;
   const innerStatus = data.result?.[0]?.status;
   if (outerErr && this.isSessionExpiredError(outerErr.code, outerErr.message)) {
     this.invalidateSession(`${methodName} outer error code=${outerErr.code}`);
     return null;
   }
   if (innerStatus && innerStatus.code !== 0 &&
       this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
     this.invalidateSession(`${methodName} status code=${innerStatus.code}`);
     return null;
   }
   ```

4. Test: `npx tsc --noEmit` hatasız geçmeli

Knowledge capture:
- [ ] CHANGELOG.md'ye ekle
- [ ] docs/10-architecture/adr/ADR-003-fa-session-management.md güncelle (tüm metodlar artık covered)
```

---

## Quest 3: Singleton Pattern İhlallerini Düzelt

**Sorun:** 4 yerde `new FortiAnalyzerService()` kullanılıyor — Constitution İlke #10 ihlal ediliyor.
Bu yerler global session state'i paylaşmıyor, dolayısıyla session pile-up riski devam ediyor.

**Locations:**
- `app/api/integrations/fortianalyzer/route.ts` (2 occurrence)
- `app/api/integrations/fortianalyzer/mitre/route.ts`
- `app/api/alarms/check-vmware/route.ts`

### Quest Prompt

```
Anchors:
- docs/00-product/CONSTITUTION.md (İlke #10: Singleton client pattern)
- docs/10-architecture/adr/ADR-003-fa-session-management.md
- lib/integrations/fortianalyzer.ts (getSharedFortiAnalyzerService, initSharedFortiAnalyzerService)

Task: Tüm `new FortiAnalyzerService()` çağrılarını singleton pattern'e çevir.

1. Şu dosyalarda `new FortiAnalyzerService(` ara ve değiştir:
   - app/api/integrations/fortianalyzer/route.ts (2 yer)
   - app/api/integrations/fortianalyzer/mitre/route.ts (1 yer)
   - app/api/alarms/check-vmware/route.ts (1 yer)

2. Her yerde şu pattern'i uygula:
   ```typescript
   // ÖNCE:
   const faService = new FortiAnalyzerService(config);
   await faService.login();

   // SONRA:
   const faService = await initSharedFortiAnalyzerService(config);
   // initShared zaten login() çağırır, ayrıca login() çağırma
   ```

3. Eğer config farklı ise (ör. farklı FA host), config'i de güncelle.

4. Test: `npx tsc --noEmit` hatasız geçmeli

Knowledge capture:
- [ ] CHANGELOG.md'ye ekle
- [ ] docs/30-runbooks/FA_ACCOUNT_LOCKED.md → "Recurrence checklist"e bu 4 dosyayı da ekle
```

---

## Quest 4: Auto-Generated Alarm Catalog

**Sorun:** 94 alarm tanımı var ama elle dökümante edilmemiş. `alarm-definitions.ts`'den
otomatik olarak `docs/20-modules/alarms/DEFINITIONS.md` üretilebilir.

**Scope:** Script yaz + çalıştır

### Quest Prompt

```
Anchors:
- docs/00-product/CONSTITUTION.md
- lib/alarms/alarm-definitions.ts

Task: alarm-definitions.ts'den markdown alarm kataloğu üret.

1. scripts/generate-alarm-catalog.mjs scripti yaz:
   - alarm-definitions.ts'yi import et (ESM ile)
   - Her alarm için markdown tablo satırı üret:
     | Code | Name | Severity | Category | Cooldown | Source | Description |
   - Severity'yi renkli badge yap: 🔴 CRITICAL, 🟠 HIGH, 🟡 MEDIUM, 🔵 LOW, ⚪ INFO
   - Category'ye göre grupla (CONFIG_ACCESS, SECURITY, RISK_ANOMALY, OPERATIONAL, SOC_CORRELATION)
   - Dosya sonuna istatistik ekle: toplam alarm, kategori dağılımı, severity dağılımı

2. Output: docs/20-modules/alarms/DEFINITIONS.md

3. package.json'a script ekle:
   "scripts": {
     "generate:alarm-catalog": "node scripts/generate-alarm-catalog.mjs"
   }

4. Test: `npm run generate:alarm-catalog` hatasız çalışmalı, DEFINITIONS.md üretmeli

Knowledge capture:
- [ ] CHANGELOG.md'ye ekle
- [ ] docs/20-modules/alarms/README.md → "Planned" listesinden kaldır
```

---

## Quest 5: HEALTH Endpoint'e FA/VMware/NMS Status Ekle

**Sorun:** `/api/health` endpoint'i var ama sadece DB connectivity kontrol ediyor.
FA session status, VMware sync status, NMS agent status eklenmeli.

**Scope:** `/api/health/route.ts` + health check logic

### Quest Prompt

```
Anchors:
- docs/00-product/CONSTITUTION.md (İlke #9: health check zorunlu)
- app/api/health/route.ts
- lib/integrations/fortianalyzer.ts (getFortiAnalyzerLoginHealth)
- lib/integrations/vmware.ts (varsa health check)

Task: Health endpoint'i genişlet.

1. GET /api/health response'unu şu yapıya çevir:
   ```json
   {
     "status": "ok|degraded|critical",
     "timestamp": "2026-02-17T10:30:00Z",
     "checks": {
       "database": { "status": "ok", "latency_ms": 5 },
       "fortianalyzer": {
         "status": "ok|degraded|critical",
         "session_valid": true,
         "consecutive_failures": 0,
         "is_account_locked": false,
         "backoff_remaining_sec": 0
       },
       "vmware": {
         "status": "ok|degraded|critical",
         "last_sync_at": "2026-02-17T10:25:00Z",
         "vm_count": 150,
         "datastore_count": 8
       },
       "nms": {
         "status": "ok|degraded|critical",
         "agent_reachable": true,
         "devices_monitored": 45,
         "last_poll_at": "2026-02-17T10:29:00Z"
       }
     }
   }
   ```

2. Her check için timeout 5s — bir check takılırsa "degraded" dönsün, diğer checks devam etsin.

3. Overall status:
   - "ok" → tüm checks ok
   - "degraded" → en az bir check degraded, hiçbiri critical değil
   - "critical" → en az bir check critical

4. Test: `curl http://localhost:3000/api/health` valid JSON dönmeli

Knowledge capture:
- [ ] CHANGELOG.md'ye ekle
- [ ] docs/20-modules/integrations/fortianalyzer.md → Health Endpoint bölümünü güncelle
```

---

## Quest 6: Documentation OVERVIEW + BOUNDED_CONTEXTS

**Sorun:** `docs/10-architecture/OVERVIEW.md` ve `BOUNDED_CONTEXTS.md` planlı ama yok.
Eski `ARCHITECTURE.md` (archive'de) geçersiz.

**Scope:** 2 dosya

### Quest Prompt

```
Anchors:
- docs/00-product/CONSTITUTION.md
- docs/README.md
- package.json (sayfa sayısı, bağımlılıklar)
- lib/ (dizin yapısı)
- app/ (dizin yapısı)

Task: Mevcut mimariyi dokümante et.

1. docs/10-architecture/OVERVIEW.md yaz:
   - Tech stack (Next.js 14, Prisma, PostgreSQL, React Flow, shadcn/ui)
   - Deployment (Docker Compose, dev vs prod)
   - Sayfa sayısı (~25), entegrasyon sayısı (4), alarm sayısı (94)
   - Veri akışı: FA/FG/VMware/NMS → cached_events → alarm-runner → Prisma → UI
   - Dizin yapısı özeti (app/, lib/, components/, prisma/)

2. docs/10-architecture/BOUNDED_CONTEXTS.md yaz:
   - 6 bounded context tanımı:
     1. alarms (detection engine, query registry, definitions, notifications)
     2. integrations (FA, FG, VMware, NMS client services)
     3. topology (React Flow, network connections, switch views)
     4. inventory (organizations, buildings, floors, racks, devices)
     5. audit (config revisions, change timeline, drift detection)
     6. security (IOC, IPS, exposed assets, MITRE ATT&CK, risk scores)
   - Her context için: ownership, data sources, API routes, UI pages
   - Cross-context dependencies (örn: alarms ← integrations, alarms ← inventory)

3. Her dosyanın sonuna "Last updated: 2026-02-17" ekle.

Knowledge capture:
- [ ] CHANGELOG.md'ye ekle
- [ ] docs/README.md → "planlı" olanları "✅" yap
```

---

## Öncelik Sırası

| # | Quest | Süre | Risk |
|---|---|---|---|
| 1 | NMS/VMware alarms → registry | 30 dk | Düşük (backward compatible) |
| 2 | FA session expiry → tüm metodlar | 20 dk | Düşük (sadece error handling) |
| 3 | Singleton pattern fix | 15 dk | Düşük (api route'lar etkilenir) |
| 4 | Auto-generated alarm catalog | 45 dk | Yok (sadece docs) |
| 5 | Health endpoint expansion | 1 saat | Orta (yeni endpoint behavior) |
| 6 | Architecture docs | 1 saat | Yok (sadece docs) |

**Önerilen sıra:** 2 → 3 → 1 → 5 → 4 → 6
(Önce bug fix'ler, sonra feature'lar, en son docs)
