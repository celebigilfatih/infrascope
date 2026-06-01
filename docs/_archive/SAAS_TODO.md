# SaaS Lansmanı - TODO Listesi

> Admin Login Fail alarmları ve genel SaaS hazırlığı için yapılacak düzeltmeler

**Oluşturulma Tarihi:** 2026-02-17  
**Durum:** Planlandı, implementasyon bekliyor

---

## 🔴 P0 - Kritik (Lansman Öncesi Yapılmalı)

### 1. SSL/TLS Konfigürasyonu - Müşteri Bazlı

**Dosyalar:**
- `lib/integrations/fortianalyzer.ts`
- `.env.example`
- `lib/alarms/event-cache.ts`

**Sorun:**
- Şu an: `NODE_TLS_REJECT_UNAUTHORIZED=0` ile tüm sertifikalar bypass ediliyor
- SaaS'ta: Her müşterinin farklı FortiAnalyzer SSL konfigürasyonu olabilir
- Güvenlik riski: Production'da sertifika doğrulaması zorunlu

**Çözüm:**
```env
# .env.example (müşteri konfigürasyonu)
FORTIANALYZER_CA_CERT_PATH="/path/to/cert.pem"  # Opsiyonel
FORTIANALYZER_SKIP_TLS_VERIFY=false              # Açık rıza ile (uyarı göster)
```

```typescript
// fortianalyzer.ts
const httpsAgent = process.env.FORTIANALYZER_SKIP_TLS_VERIFY === 'true'
  ? new https.Agent({ rejectUnauthorized: false })
  : process.env.FORTIANALYZER_CA_CERT_PATH
  ? new https.Agent({ 
      ca: fs.readFileSync(process.env.FORTIANALYZER_CA_CERT_PATH),
      rejectUnauthorized: true 
    })
  : undefined; // Sistem varsayılanlarını kullan
```

**Test:**
- [ ] Self-signed sertifika ile çalışan müşteri senaryosu
- [ ] CA-signed sertifika ile çalışan müşteri senaryosu
- [ ] Sertifika olmadan çalışan müşteri senaryosu (eğer skip=true)

**Tahmini Süre:** 4-6 saat

---

### 2. FortiAnalyzer API Rate Limiting

**Dosyalar:**
- `lib/integrations/fortianalyzer.ts`
- `lib/alarms/alarm-runner.ts`

**Sorun:**
- 100+ müşteri aynı anda FortiAnalyzer'a istek atarsa rate limit'e takılır
- Şu an retry logic yok

**Çözüm:**
```typescript
// Rate limiter ekle (Token bucket veya sliding window)
class FortiAnalyzerRateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  canRequest(host: string, maxPerMinute: number = 60): boolean {
    const now = Date.now();
    const minuteAgo = now - 60000;
    const reqs = this.requests.get(host) || [];
    const recent = reqs.filter(t => t > minuteAgo);
    
    if (recent.length < maxPerMinute) {
      recent.push(now);
      this.requests.set(host, recent);
      return true;
    }
    return false;
  }
}
```

**Test:**
- [ ] Rate limit aşıldığında backoff uygulanıyor mu?
- [ ] Multiple concurrent requests handle ediliyor mu?

**Tahmini Süre:** 3-4 saat

---

### 3. Error Boundaries - Müşteri Bazlı İzolasyon

**Dosyalar:**
- `lib/alarms/alarm-runner.ts`
- `lib/alarms/detection-engine.ts`

**Sorun:**
- Bir müşterinin FortiAnalyzer'ı down olunca tüm alarm check duruyor
- Graceful degradation yok

**Çözüm:**
```typescript
class AlarmQueryResult {
  events: Record<string, unknown>[];
  source: 'cache' | 'fortianalyzer' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
  
  static fromCache(events) {
    return { events, source: 'cache', confidence: 'high' };
  }
  
  static fromFA(events) {
    return { events, source: 'fortianalyzer', confidence: 'high' };
  }
  
  static staleCache(events) {
    return { events, source: 'cache', confidence: 'low' };
  }
}

// Alarm runner'da try-catch ile isolate et
try {
  const result = await queryFortiAnalyzer(...);
  return result;
} catch (error) {
  console.warn(`[AlarmQuery] FA failed for customer ${customerId}, using cache`);
  return AlarmQueryResult.staleCache(await queryCache(...));
}
```

**Test:**
- [ ] Bir müşteri FA down, diğer müşterilerin alarmları çalışıyor mu?
- [ ] Stale cache ile alarm üretiliyor mu?

**Tahmini Süre:** 4-5 saat

---

## 🟡 P1 - Önemli (Lansmandan Sonra Hızlıca Yapılmalı)

### 4. URL Decoding - Generic Çözüm

**Dosyalar:**
- `lib/alarms/event-cache.ts`
- `lib/alarms/queries/auth-events.ts`

**Sorun:**
- Şu an sadece `msg` field'ı decode ediliyor
- Diğer field'lar (`user`, `devname`, `service`) de URL-encoded olabilir
- Kırılgan çözüm

**Çözüm:**
```typescript
// event-cache.ts - saveEvents fonksiyonunda
private decodeLogFields(log: Record<string, unknown>): Record<string, unknown> {
  const decoded = { ...log };
  for (const [key, value] of Object.entries(decoded)) {
    if (typeof value === 'string' && value.includes('%')) {
      try {
        decoded[key] = decodeURIComponent(value);
      } catch (e) {
        // URL-encoded değil, orijinalini bırak
        decoded[key] = value;
      }
    }
  }
  return decoded;
}

// saveEvents içinde kullan
const decodedLog = this.decodeLogFields(log);
// ... decodedLog ile devam et
```

**Test:**
- [ ] Tüm string field'lar decode ediliyor mu?
- [ ] Decode hatası durumunda fallback çalışıyor mu?
- [ ] Performance impact negligible mi?

**Tahmini Süre:** 2-3 saat

---

### 5. Failed Login Query Optimizasyonu

**Dosyalar:**
- `lib/alarms/queries/auth-events.ts`
- `lib/alarms/queries/base.ts`

**Sorun:**
- Şu an 1000+ login event çekilip bellekte filtreleniyor
- Ölçeklenmez (100+ müşteri)

**Çözüm - Seçenek A: Timestamp bazlı sorgu**
```typescript
const lastCheckTime = getLastCheckTime('ADMIN_LOGIN_FAILED');
const logs = await fa.query({
  logtype: 'event',
  filter: `action == login and itime_t > ${lastCheckTime}`,
  limit: 100  // Sadece son event'ler
});
```

**Çözüm - Seçenek B: Database computed column**
```sql
-- Migration ekle
ALTER TABLE cached_events 
ADD COLUMN msg_decoded TEXT GENERATED ALWAYS AS (
  CASE 
    WHEN msg LIKE '%@%' THEN decode_url_component(msg)
    ELSE msg
  END
) STORED;

CREATE INDEX idx_cached_events_msg_decoded ON cached_events(msg_decoded);
```

```typescript
// Artık DB-level filter çalışır
await prisma.cachedEvent.findMany({
  where: {
    msg_decoded: { contains: 'failed' }
  }
});
```

**Test:**
- [ ] Query performance < 100ms mi?
- [ ] Doğru failed login'ler bulunuyor mu?
- [ ] Memory usage azaldı mı?

**Tahmini Süre:** 4-6 saat

---

### 6. Sync Health Monitoring Dashboard

**Dosyalar:**
- `app/api/health/alarms/route.ts`
- Yeni: `app/dashboard/sync-health/page.tsx`

**Sorun:**
- Event cache sync başarısız olunda bildirim yok
- Admin manuel kontrol etmek zorunda

**Çözüm:**
```typescript
// Health endpoint'e sync metrics ekle
{
  eventCache: {
    lastSync: '2026-02-17T10:30:00Z',
    consecutiveFailures: 0,
    totalEvents: 1234,
    syncDurationMs: 4523,
    status: 'healthy' // healthy | degraded | failed
  }
}
```

**UI Features:**
- [ ] Son sync zamanı
- [ ] Başarısız sync denemeleri
- [ ] Event count per logtype
- [ ] Manuel retry butonu
- [ ] Alerting (email/Slack)

**Tahmini Süre:** 6-8 saat

---

## 🟢 P2 - Nice to Have (İsteğe Bağlı)

### 7. Müşteri FortiAnalyzer Konfigürasyon UI'ı

**Dosyalar:**
- `app/settings/integrations/fortianalyzer/page.tsx` (yeni)
- `app/api/integrations/fortianalyzer/route.ts`

**Özellikler:**
- [ ] SSL sertifika yükleme
- [ ] Connection test butonu
- [ ] Sync status görüntüleme
- [ ] Log seviyesi ayarlama
- [ ] Retry policy konfigürasyonu

**Tahmini Süre:** 8-12 saat

---

### 8. Otomatik Retry with Exponential Backoff

**Dosyalar:**
- `lib/integrations/fortianalyzer.ts`
- `lib/alarms/event-cache.ts`

**Çözüm:**
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
      console.warn(`[Retry] Attempt ${i + 1} failed, retrying in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Tahmini Süre:** 3-4 saat

---

### 9. Circuit Breaker Pattern

**Dosyalar:**
- `lib/integrations/fortianalyzer.ts` (genişlet)

**Çözüm:**
```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures: number = 0;
  private lastFailure: Date | null = null;
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

**Tahmini Süre:** 4-5 saat

---

### 10. Multi-tenant Event Isolation

**Dosyalar:**
- `prisma/schema.prisma`
- `lib/alarms/event-cache.ts`

**Sorun:**
- Tüm müşterilerin event'leri aynı `cached_events` tablosunda
- Query'ler müşteri bazlı filtreleme yapmıyor

**Çözüm:**
```sql
-- Migration
ALTER TABLE cached_events 
ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);

CREATE INDEX idx_cached_events_tenant ON cached_events(tenant_id);
```

```typescript
// Tüm query'lere tenant filter ekle
await prisma.cachedEvent.findMany({
  where: {
    tenantId: context.tenantId,
    logtype: 'event',
    // ...
  }
});
```

**Tahmini Süre:** 8-10 saat

---

## 📊 Özet

| Priority | Task | Süre | Durum |
|----------|------|------|-------|
| P0 | SSL/TLS Konfigürasyonu | 4-6 saat | ⏳ Bekliyor |
| P0 | API Rate Limiting | 3-4 saat | ⏳ Bekliyor |
| P0 | Error Boundaries | 4-5 saat | ⏳ Bekliyor |
| P1 | Generic URL Decoding | 2-3 saat | ⏳ Bekliyor |
| P1 | Failed Login Optimizasyonu | 4-6 saat | ⏳ Bekliyor |
| P1 | Sync Health Dashboard | 6-8 saat | ⏳ Bekliyor |
| P2 | Konfigürasyon UI'ı | 8-12 saat | ⏳ Bekliyor |
| P2 | Otomatik Retry | 3-4 saat | ⏳ Bekliyor |
| P2 | Circuit Breaker | 4-5 saat | ⏳ Bekliyor |
| P2 | Multi-tenant Isolation | 8-10 saat | ⏳ Bekliyor |

**Toplam Tahmini Süre:** 46-63 saat (~6-8 iş günü)

---

## ✅ Tamamlanan İşler

- [x] Event cache timestamp parsing (itime_t önceliği)
- [x] Development auto-start script
- [x] Environment dokümantasyonu
- [x] In-memory filter for failed logins (temporary fix)

---

## 📝 Notlar

1. **P0 tasks** lansman öncesinde mutlaka tamamlanmalı
2. **P1 tasks** lansmandan sonraki ilk sprint'te yapılmalı
3. **P2 tasks** roadmap'e eklenebilir, önceliklendirilmeli
4. Her task için unit test ve integration test yazılmalı
5. Production'a deploy öncesi load testing yapılmalı

---

**Güncellemeler:**
- 2026-02-17: İlk oluşturma, SaaS hazırlık ihtiyaçları belirlendi
