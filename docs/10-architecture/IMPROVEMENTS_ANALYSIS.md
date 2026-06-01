# InfraScope - İyileştirme Önerileri

Son güncelleme: 18 Şubat 2026

---

## 📋 Genel Bakış

Bu döküman, InfraScope projesinin mevcut mimari yapısının analizi ve gelecekteki iyileştirme önerilerini içerir.

---

## 🏗️ Mevcut Mimari Analizi

### VMware Entegrasyonu - 3 Farklı API Kullanımı

#### 1. vSphere REST API (`/api/vcenter/*`)
**Kullanım Alanları:**
- VM listesi, Host listesi, Cluster listesi
- Datastore listesi
- VM detayları ve Guest Identity (IP adresi)
- VM power operations (on/off/suspend)

**Avantajlar:**
- ✅ Modern & Kolay (JSON response, HTTP auth, stateless)
- ✅ vSphere 7+ için VMware'ın önerdiği yaklaşım
- ✅ Lightweight (SDK gerekmez, native fetch() ile çalışır)

**Kısıtlamalar:**
- ❌ VM→Host mapping temel endpoint'te yok (workaround uygulandı)
- ❌ Event History yok
- ❌ Detaylı performans metrikleri yok

#### 2. vSphere SOAP API (`/sdk` endpoint)
**Kullanım Alanları:**
- EventHistoryCollector (snapshot events, VM lifecycle)
- ServiceContent (EventManager reference)
- Authentication (vmware_soap_session cookie)

**Avantajlar:**
- ✅ Event History - EventManager sadece SOAP'ta var
- ✅ Full API - Tüm vSphere fonksiyonları mevcut
- ✅ Historical Data - Geçmiş olayları sorgulayabilme

**Kısıtlamalar:**
- ❌ XML Parsing karmaşık
- ❌ Session management complexity
- ❌ **vCenter Limitation**: Bazı event'ler log'lanmıyor (VmSnapshotCreatedEvent gibi)

#### 3. Snapshot List-Based Detection (Workaround)
**Neden Gerekli:**
vCenter SOAP API'si `VmSnapshotCreatedEvent`'leri güvenilir şekilde döndürmüyor (VMware'ın bilinen limitasyonu).

**Çözüm:**
```typescript
async fetchRecentlyCreatedSnapshots(timeWindowMinutes: number) {
  // 1. Tüm snapshot'ları listele
  // 2. createTime'a göre filtrele
  // 3. Son X dakikada oluşanları bul
}
```

---

## 🔔 Alarm Sistemi Yapısı

### Dual-Domain Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ALARM DETECTION ENGINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────┐          │
│  │   FortiGate Alarms   │    │    VMware Alarms     │          │
│  │   (FortiAnalyzer)    │    │     (vCenter)        │          │
│  └──────────┬───────────┘    └──────────┬───────────┘          │
│             │                           │                        │
│             ▼                           ▼                        │
│  ┌──────────────────────┐    ┌──────────────────────┐          │
│  │  LogView API         │    │  REST + SOAP API     │          │
│  │  - event logs        │    │  - VM state          │          │
│  │  - traffic logs      │    │  - Host state        │          │
│  │  - utm logs          │    │  - Datastore         │          │
│  │  - FortiView         │    │  - Snapshot list     │          │
│  └──────────────────────┘    └──────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### API Endpoints

| Endpoint | Amaç | Kullanım |
|----------|------|----------|
| `POST /api/alarms/check` | Tüm alarmları değerlendir | Scheduler (5dk) |
| `POST /api/alarms/check-vmware` | Sadece VMware alarmları | Hızlı check |
| `GET /api/alarms/scheduler` | Scheduler durumu | Status check |
| `POST /api/alarms/scheduler` | Scheduler'ı başlat | Auto-start |

### Alarm Kategorileri

#### FortiGate Alarms (55+ alarm)
- **CONFIG_ACCESS**: Kritik config değişiklikleri
- **SECURITY**: Güvenlik tehditleri (VPN brute force, IPS blocks)
- **OPERATIONAL**: Operasyonel sorunlar (HA failover, tunnel down)
- **SOC_CORRELATION**: Gelişmiş korelasyon (multi-vector attacks)

#### VMware Alarms (10+ alarm)
- **SNAPSHOT**: Snapshot yönetimi (created, deleted, old, large)
- **VM_LIFECYCLE**: VM yaşam döngüsü (created, deleted, power)
- **HOST**: ESXi host durumu (disconnected, maintenance)
- **STORAGE**: Depolama (low space, inaccessible)

---

## ✅ Mevcut Yapının Güçlü Yönleri

1. **Separation of Concerns**
   - REST API → CRUD operasyonları, envanter
   - SOAP API → Event history, audit
   - Fallback → Snapshot list detection

2. **Graceful Degradation**
   - SOAP başarısız → REST ile devam
   - Guest Identity yok → IP gösterme
   - Host mapping yok → Unknown göster

3. **Caching**
   - snapshotCache (5 dakika TTL)

4. **Alarm Architecture**
   - FortiGate ve VMware alarmları ayrı metodlarla
   - Cooldown mekanizması
   - Detaylı email bildirimleri

---

## 🚀 Öncelikli İyileştirme Önerileri

### 1. PyVmomi (Python vSphere SDK) Entegrasyonu
**Priority: MEDIUM**

**Problem:**
- vSphere REST API bazı VM properties'lerini eksik döndürüyor
- SOAP API XML parsing karmaşık

**Çözüm:**
```python
# Python microservice veya subprocess
from pyVim.connect import SmartConnect
from pyVmomi import vim

# Full VM properties, advanced queries
# Performance metrics (CPU, Memory, Disk I/O)
# Network adapter details
```

**Avantajlar:**
- ✅ Full VM properties
- ✅ Performance metrics API
- ✅ Advanced queries (PowerCLI eşdeğeri)

**Implementation:**
- Option A: Python FastAPI microservice
- Option B: Node.js child_process ile Python script
- Option C: GraphQL API layer

**Dosyalar:**
- `services/vmware-sdk/pyVmomi-service.py`
- `lib/integrations/vmware-sdk.ts` (Node.js wrapper)

---

### 2. Event Caching ve Database Storage
**Priority: HIGH**

**Problem:**
- vCenter SOAP events güvenilir değil
- Her sorguda SOAP API'ye gidiyoruz
- Event history kaybolabiliyor

**Çözüm:**
```typescript
// Prisma schema addition
model VMwareEvent {
  id          String   @id @default(cuid())
  eventId     String   @unique
  eventType   String
  vmName      String?
  vmId        String?
  userName    String
  message     String
  createdTime DateTime
  fetchedAt   DateTime @default(now())
  
  @@index([eventType, createdTime])
  @@index([vmId, createdTime])
}
```

**Implementation:**
- Background job: Her 5 dakikada SOAP events çek → DB'ye kaydet
- Alarm evaluation: DB'den sorgula (SOAP yerine)
- Retention policy: 30 gün sonra eski event'leri sil

**Avantajlar:**
- ✅ Event reliability
- ✅ Hızlı sorgular (DB index)
- ✅ Historical analysis
- ✅ Audit trail

**Dosyalar:**
- `prisma/schema.prisma` (model ekleme)
- `lib/integrations/vmware-event-cache.ts`
- `app/api/integrations/vmware/sync-events/route.ts`

---

### 3. Batch API Calls ve Rate Limiting
**Priority: MEDIUM**

**Problem:**
- 238 VM için 238 API call (guest identity için)
- vCenter API rate limiting riskli

**Çözüm:**
```typescript
// Batch processing with concurrency control
async function fetchVMsWithConcurrency(vms: VMBasic[], concurrency = 10) {
  const chunks = chunkArray(vms, concurrency);
  const results = [];
  
  for (const chunk of chunks) {
    const batchResults = await Promise.all(
      chunk.map(vm => fetchVMDetails(vm).catch(err => null))
    );
    results.push(...batchResults);
    await sleep(1000); // Rate limiting
  }
  
  return results.filter(Boolean);
}
```

**Implementation:**
- Concurrency control (max 10 parallel requests)
- Exponential backoff on errors
- Cache layer (Redis veya in-memory)

**Dosyalar:**
- `lib/integrations/vmware-batch.ts`
- `lib/utils/rate-limiter.ts`

---

### 4. FortiView API Integration
**Priority: HIGH**

**Problem:**
- Şu anda sadece LogView API kullanıyoruz
- FortiView daha zengin threat intelligence sağlar

**Çözüm:**
```typescript
interface FortiViewThreat {
  threat: string;
  threatType: string;
  level: string;
  weight: number;
  incidents: number;
  blockedCount: number;
  passedCount: number;
  topSources: Array<{ ip: string; country: string; count: number }>;
  topTargets: Array<{ ip: string; port: number; count: number }>;
}

// New FortiAnalyzer method
async getFortiViewThreats(timeRange: string): Promise<FortiViewThreat[]>
```

**Yeni Alarmlar:**
- `THREAT_SPIKE` - Threat skor artışı
- `TOP_ATTACKER_NEW` - Yeni en çok saldıran IP
- `THREAT_DIVERSITY` - Farklı threat tiplerinin artması

**Dosyalar:**
- `lib/integrations/fortianalyzer-fortiview.ts`
- `lib/alarms/alarm-definitions.ts` (yeni alarm'lar)

---

### 5. WebSocket Real-Time Notifications
**Priority: LOW**

**Problem:**
- Email notification'lar delayed (5 dakika scheduler)
- Dashboard'da real-time update yok

**Çözüm:**
```typescript
// WebSocket server (Next.js API route)
// /api/alarms/stream

// Client subscription
const ws = new WebSocket('ws://localhost:8170/api/alarms/stream');
ws.onmessage = (event) => {
  const alarm = JSON.parse(event.data);
  showToast(alarm);
};
```

**Implementation:**
- Server-Sent Events (SSE) veya WebSocket
- Redis pub/sub (multi-instance support)
- Client-side toast notifications

**Dosyalar:**
- `app/api/alarms/stream/route.ts`
- `components/layout/AlarmNotifications.tsx`

---

## 📊 Performance Optimizations

### A. VM List Caching
```typescript
// Cache VM list for 5 minutes
const vmCache = new Map<string, { data: VM[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;
```

### B. Database Indexing
```sql
-- Alarm events için kritik index'ler
CREATE INDEX idx_alarm_events_alarm_created ON alarm_events(alarm_id, created_at DESC);
CREATE INDEX idx_alarm_events_severity ON alarm_events(severity, created_at DESC);
CREATE INDEX idx_alarm_events_device ON alarm_events(device_name, created_at DESC);
```

### C. GraphQL Data Loader
```typescript
// Batch ve cache ile N+1 query problemi çözümü
const vmLoader = new DataLoader(async (vmIds: string[]) => {
  const vms = await fetchVMsByIds(vmIds);
  return vmIds.map(id => vms.find(vm => vm.id === id));
});
```

---

## 🔐 Security Improvements

### A. API Key Rotation
```typescript
// VMware credentials rotation
// FortiAnalyzer API key expiry check
// Encrypted credential storage (Prisma encryption)
```

### B. Audit Logging
```typescript
// All alarm actions logged
model AlarmAuditLog {
  id        String   @id @default(cuid())
  action    String   // TRIGGERED, ACKNOWLEDGED, RESOLVED
  alarmId   String
  userId    String?
  metadata  Json
  timestamp DateTime @default(now())
}
```

---

## 📝 Implementation Roadmap

### Phase 1: Stability (Q1 2026)
- [x] Alarm scheduler auto-start
- [x] VM host ve IP bilgisi ekleme
- [ ] Event caching implementation
- [ ] Rate limiting ve batch processing

### Phase 2: Features (Q2 2026)
- [ ] FortiView API integration
- [ ] PyVmomi SDK microservice
- [ ] Advanced correlation alarms
- [ ] Dashboard real-time updates

### Phase 3: Scale (Q3 2026)
- [ ] Redis caching layer
- [ ] Multi-tenant support
- [ ] API rate limiting
- [ ] Performance monitoring

---

## 🧪 Testing Requirements

### Unit Tests
```typescript
// VMware integration tests
describe('VMwareService', () => {
  it('should fetch VMs with host mapping', async () => {
    const vms = await service.fetchVMs();
    expect(vms[0].parent).toBeDefined();
  });
  
  it('should fallback to snapshot list on SOAP failure', async () => {
    // Mock SOAP failure
    const snapshots = await service.fetchRecentlyCreatedSnapshots(15);
    expect(snapshots.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests
```typescript
// Alarm evaluation end-to-end test
it('should trigger SNAPSHOT_CREATED alarm', async () => {
  // Create snapshot
  await createSnapshot('test-vm', 'test-snapshot');
  
  // Wait for alarm evaluation
  await sleep(5000);
  
  // Check alarm triggered
  const events = await prisma.alarmEvent.findMany({
    where: { alarmCode: 'SNAPSHOT_CREATED' }
  });
  expect(events.length).toBe(1);
});
```

---

## 📚 Documentation Updates

### Required Documentation
- [ ] API endpoint documentation (Swagger/OpenAPI)
- [ ] Alarm definition reference
- [ ] VMware integration architecture diagram
- [ ] Deployment guide (Docker production)
- [ ] Troubleshooting guide

### Code Documentation
- [ ] JSDoc comments for all public methods
- [ ] README.md için architecture section
- [ ] CONTRIBUTING.md for developers

---

## 🎯 Success Metrics

### Performance
- VM list fetch time: < 2 seconds (currently ~10s)
- Alarm evaluation: < 30 seconds (currently ~5 minutes)
- Email delivery: < 10 seconds

### Reliability
- Event capture rate: > 95% (currently ~70% due to SOAP issues)
- Alarm false positive rate: < 5%
- System uptime: > 99.9%

### Scalability
- Support 1000+ VMs
- Support 100+ alarm definitions
- Support 10+ concurrent alarm checks

---

## 🔧 Technical Debt

### High Priority
1. **SOAP API reliability** - Event caching çözümü
2. **Rate limiting** - vCenter API overload
3. **Error handling** - Graceful degradation

### Medium Priority
1. **Code duplication** - Alarm evaluation logic
2. **Test coverage** - < 30% şu an
3. **TypeScript strictness** - any type kullanımı

### Low Priority
1. **ESLint warnings** - Code quality
2. **Bundle size** - Next.js optimization
3. **Accessibility** - ARIA labels

---

## 📞 Contact & Support

**Owner:** InfraScope Development Team
**Last Updated:** 18 Şubat 2026
**Review Frequency:** Quarterly

---

## 🔗 Related Documents

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [API_REFERENCE.md](./docs/API_REFERENCE.md) - API documentation
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues

---

**Not:** Bu döküman mevcut sistemin detaylı analizi ve gelecek iyileştirme önerilerini içerir. Her öneri için implementation detayları ve priority seviyeleri belirtilmiştir.
