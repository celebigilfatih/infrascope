# InfraScope Production Readiness Audit

**Tarih:** 2026-06-14
**Kapsam:** Auth/authz, API güvenliği, Prisma/DB, raw SQL, alarm engine, logging/monitoring, deployment/env/secrets, test coverage
**Not:** İstenen `docs/PROJECT_CONSTITUTION.md` ve `docs/CODEX_WORKFLOW.md` dosyaları repo'da bulunamadı. Anchor olarak mevcut authoritative kaynak `docs/00-product/CONSTITUTION.md` kullanıldı.
**Kural:** Kod değiştirilmedi; bu dosya yalnızca audit raporudur.

---

## Genel Durum

InfraScope production'a yaklaşmış, domain modeli güçlü ve operasyonel alarm mantığı ciddi şekilde olgunlaşmış bir platformdur. Önceki mimari risklerin bir kısmı kapatılmış görünüyor: API middleware artık spoof edilebilir `x-user-role` yerine httpOnly JWT session cookie doğruluyor; alarm scheduler HTTP yerine in-process runner kullanıyor; alarm health endpoint'i scheduler/cache/detection/email/DLQ durumunu ayrıştırıyor; raw SQL injection riski topology tarafında parameterized `Prisma.sql` ile azaltılmış.

Buna rağmen uygulama production için hâlâ **şartlı hazır değil**. Ana blokajlar authz kapsamının eksik olması, public olması gereken invite/reset akışlarının middleware tarafından kilitlenmesi, bazı güçlü API route'ların yalnızca "authenticated" bırakılması, entegrasyon servislerinde `new PrismaClient()` kullanımı, secrets/env hijyeninin zayıf olması, formal test runner/coverage yokluğu ve alarm/cache/NMS retention tarafındaki ölçek riskleridir.

**Production readiness tahmini:** 64/100

| Alan | Durum | Not |
|---|---|---|
| Authentication | Orta | httpOnly JWT var; UI route guard ve public reset/invite akışı sorunlu |
| Authorization | Zayıf-Orta | Sadece bazı API prefix'leri resource map'te; çok sayıda güçlü route auth-only |
| API Security | Orta | Rate limit var; CSRF/idempotency/body-size/route-specific RBAC eksik |
| Prisma/DB | Orta | Singleton var ama bazı servisler ayrı PrismaClient açıyor |
| Raw SQL | Orta-İyi | Unsafe raw yok; tagged queryRaw kullanımı çoğunlukla güvenli |
| Alarm Engine | Orta-İyi | Runner/watchdog iyi; cache cap ve büyük engine karmaşıklığı risk |
| Observability | Orta | Pino var; metrics/tracing/alerting standardı eksik |
| Deployment/Secrets | Zayıf-Orta | Prod compose var; env dosyaları tracked, dev secret fallback'leri var |
| Test Coverage | Zayıf | Test framework yok; manuel scriptler var |

---

## Güçlü Taraflar

- **Ürün anayasası ve mimari invariantlar var:** `docs/00-product/CONSTITUTION.md` net kurallar koyuyor: mock veri yok, alarm registry zorunlu, singleton integration client, tek Prisma client, TLS bypass production'da yasak.
- **Session auth eski haline göre ciddi iyileşmiş:** `middleware.ts` artık `infrascope_session` httpOnly cookie içindeki JWT'yi `verifySessionToken()` ile doğruluyor.
- **Rate limiting tüm API'lere uygulanıyor:** Middleware public route'ları bile rate limit'ten geçiriyor.
- **Alarm runner güvenilirliği artmış:** `lib/alarms/alarm-runner.ts` HTTP trigger yerine direct in-process execution, in-process mutex, DB guard, RUNNING sentinel ve 10 dakikalık global timeout kullanıyor.
- **Alarm health endpoint'i ayrıntılı:** `/api/health/alarms` scheduler heartbeat, event cache, detection, email, FA circuit breaker ve DLQ bileşenlerini ayrı raporluyor.
- **FortiAnalyzer lifecycle dokümante ve uygulanmış:** logout/invalidate/backoff/circuit breaker modeli mevcut.
- **Raw SQL injection riski azaltılmış:** Topology graph query'si artık `Prisma.sql` ile parameterized.
- **Pino logger mevcut:** `lib/logger.ts` structured logging için ortak yardımcı sağlıyor.
- **Production Docker temel sertleştirme içeriyor:** prod compose non-root runtime, no-new-privileges, read-only filesystem ve internal DB network yaklaşımı içeriyor.

---

## Kritik Eksikler

### 1. Public auth akışları middleware ile çakışıyor

`app/verify/page.tsx` ve `app/reset-password/page.tsx` sırasıyla `/api/users/verify` ve `/api/users/reset-password` çağırıyor. Ancak `middleware.ts` yalnızca `/api/auth/*` ve `/api/health` rotalarını public bırakıyor. `/api/users/*` resource map'e dahil olduğu için bu endpoint'ler session olmadan 401 alır.

**Etki:** Davet kabulü ve şifre sıfırlama production'da çalışmayabilir.
**Riskli dosyalar:** `middleware.ts`, `app/api/users/verify/route.ts`, `app/api/users/reset-password/route.ts`, `app/verify/page.tsx`, `app/reset-password/page.tsx`

### 2. Authorization kapsamı yetersiz

Middleware resource map sadece şu prefix'leri biliyor: users, alarms, devices, organizations, settings, audit, permissions. Bunun dışındaki route'lar için sadece geçerli session aranıyor; resource/action bazlı yetki uygulanmıyor.

Örnek auth-only kalan güçlü alanlar:
- `/api/integrations/*`
- `/api/security/*`
- `/api/firewall-policies`
- `/api/topology`
- `/api/reports`
- `/api/license/*`
- `/api/racks`, `/api/rooms`, `/api/floors`, `/api/services`

**Etki:** VIEWER gibi düşük yetkili kullanıcılar bazı operasyonel/entegrasyon/security endpoint'lerine erişebilir.
**Riskli dosyalar:** `middleware.ts`, `lib/auth/permissions.ts`, `app/api/integrations/**`, `app/api/security/**`, `app/api/topology/route.ts`

### 3. UI route'ları server-side korunmuyor

Middleware yalnızca `/api/*` matcher'ına bağlı. Sayfalar server-side session kontrolü yapmıyor. API'ler veri koruduğu için veri sızıntısı sınırlı olabilir, fakat kullanıcı protected UI shell'lerini görebilir ve auth deneyimi tutarsızdır.

**Etki:** Production UX ve security posture zayıf; route-level access control yok.
**Riskli dosyalar:** `middleware.ts`, `app/layout.tsx`, protected app route'ları

### 4. Session secret fallback production riski

`lib/auth/session.ts` içinde `NEXTAUTH_SECRET` yoksa `infrascope-session-dev-secret` fallback kullanılıyor. `lib/license/jwt.ts` de secret fallback zinciri içeriyor.

**Etki:** Yanlış env ile production başlarsa imzalı token güvenliği zayıflar.
**Riskli dosyalar:** `lib/auth/session.ts`, `lib/license/jwt.ts`, `docker-compose.prod.yml`, `.env.production`

### 5. Prisma singleton invariant tam uygulanmıyor

`lib/prisma.ts` singleton doğru kurulmuş; ancak bazı servisler doğrudan `new PrismaClient()` açıyor:
- `lib/integrations/fortigate.ts`
- `lib/integrations/vmware.ts`
- `lib/integrations/zabbix.ts`
- `lib/topology/relationship-engine.ts`
- `lib/reports/reports-service.ts`

**Etki:** Connection pool şişmesi, hot reload/production concurrency altında gereksiz bağlantı, anayasa AI-3 ihlali.
**Riskli dosyalar:** Yukarıdaki servisler

### 6. Env ve secret hijyeni production için yetersiz

`.env.local` ve `.env.production` git tarafından tracked görünüyor. `.gitignore` bu dosyaları ignore ediyor olsa da dosyalar geçmişte eklenmiş. Ayrıca dev compose içinde `NEXTAUTH_SECRET` ve DB password fallback'leri var; NMS config default SSH password içeriyor; test scriptlerinde gerçek görünümlü FortiAnalyzer credential stringleri var.

**Etki:** Secret sızıntısı ve yanlış env ile production başlatma riski.
**Riskli dosyalar:** `.env.local`, `.env.production`, `docker-compose.yml`, `nms_service/core/config.py`, `scripts/test-fa-login.mjs`, `scripts/test-fa-events.js`, `scripts/create-admin.js`

### 7. TLS bypass production gate'i kapatıldı, sertifika operasyonu izlenmeli

Middleware ve container entrypoint production'da `NODE_TLS_REJECT_UNAUTHORIZED=0` için fail-fast davranacak şekilde sertleştirildi. FortiAnalyzer, FortiGate ve VMware entegrasyonları global TLS bypass yerine merkezi TLS helper ve CA certificate path modeline taşındı.

**Kalan operasyonel risk:** Müşteri self-signed cihaz sertifikalarını `*_TLS_CA_CERT_PATH` ile doğru mount etmezse entegrasyon bağlantıları başarısız olur.
**Takip dosyaları:** `lib/security/tls.ts`, `scripts/entrypoint.sh`, `deploy/INSTALL.md`

### 8. Test coverage yok

`package.json` içinde test script'i yok. Jest/Vitest/Playwright/Cypress dependency yok. Sadece manuel diagnostic/test scriptleri var.

**Etki:** Auth, RBAC, alarm runner, query registry ve integration regressions production'a kaçabilir.
**Riskli alanlar:** Auth middleware, alarm engine, integrations, Prisma migrations, NMS polling

---

## İnceleme Alanlarına Göre Notlar

### Authentication / Authorization

**İyi:**
- Login bcrypt doğrulaması yapıyor.
- Session httpOnly cookie olarak set ediliyor.
- Cookie `secure` production'da true, `sameSite: strict`.
- `/api/auth/me` session token'a ek olarak DB'den user status kontrol ediyor.

**Eksik:**
- `verifySessionToken()` token içindeki role'ü DB'den yeniden doğrulamıyor; role değişikliği token süresi bitene kadar etkili olmayabilir.
- Middleware dynamic DB permission yerine `DEFAULT_PERMISSIONS` sync matrix kullanıyor; DB permission matrix UI'da değişse bile middleware'e yansımaz.
- Public olması gereken invite/reset endpoint'ler public listesinde değil.
- UI sayfalarında server-side auth guard yok.
- Login brute-force protection sadece global IP rate limit'e dayanıyor; account/email bazlı lockout yok.
- Login page "SSO" ve "2FA" destek metinleri gösteriyor, fakat gerçek SSO/2FA implementation görünmüyor.

### API Route Güvenliği

**İyi:**
- Tüm `/api/*` rotaları middleware'den geçiyor.
- Public rotalar da rate limited.
- Bazı body validator'lar `zod` ile uygulanmış.

**Eksik:**
- Çok sayıda route resource-level RBAC dışında kalıyor.
- Manual alarm control endpoint'leri (`/api/alarms/check`, scheduler, monitor, seed) EDITOR seviyesinde write olarak erişilebilir; production'da ADMIN-only olması daha doğru.
- CSRF token yok; SameSite strict iyi ama tüm state-changing endpoint'ler için explicit CSRF/idempotency standardı yok.
- Body size limit, request schema coverage ve route-specific audit logging standart değil.
- Error response'larda bazı route'lar `(error as Error).message` döndürüyor; internal detay sızdırabilir.

### Prisma ve Database Kullanımı

**İyi:**
- `lib/prisma.ts` connection limit ve pool timeout parametreleri ekliyor.
- Prisma singleton ana API route'ların çoğunda kullanılıyor.
- Migrations dizini mevcut.
- Event cache 24 saatten eski FA cached event'leri siliyor.

**Eksik:**
- Bazı servisler `new PrismaClient()` açıyor.
- `scripts/entrypoint.sh` migration failure durumunda "warning" basıp devam ediyor. Production'da schema/code drift ile ayağa kalkma riski var.
- NMS metric tabloları için retention/aggregation net görünmüyor.
- `app/api/audit/export/route.ts` `take: 10000` ile büyük export yapıyor; pagination/streaming yok.
- Offset pagination yoğun tablolarda büyüdükçe yavaşlar.

### Raw SQL / queryRaw / executeRaw Riskleri

**İyi:**
- `$queryRawUnsafe` ve `$executeRawUnsafe` bulunmadı.
- Topology query parameterized `Prisma.sql` kullanıyor.
- Reports raw query'leri çoğunlukla statik SQL.

**Eksik/Risk:**
- Raw SQL kullanan servisler merkezi review/test kapsamına alınmalı.
- `ReportsService` kendi PrismaClient'ını açıyor.
- Raw SQL ile erişilen tablo/kolonlar migration drift'ten daha kolay etkilenir; type coverage sınırlı.

### Alarm Engine ve Alarm Runner

**İyi:**
- In-process runner eski HTTP drop/mutex lock riskini azaltıyor.
- 10 dakikalık global evaluation timeout var.
- DB-level RUNNING sentinel ve stale lock cleanup var.
- Watchdog son check gecikirse recovery run tetikliyor.
- `/api/health/alarms` dış watchdog için uygun.
- `ALARM_QUERY_REGISTRY` pattern'i net.

**Eksik/Risk:**
- Detection engine çok büyük ve karmaşık; regression riski yüksek.
- Event cache genel logtype sync'te 5000 event cap'e sahip. High-volume logtype'larda kritik event'ler targeted filter kapsamı dışında kalabilir.
- Cache query DB-level filtreleri sadece bazı basit condition'ları push ediyor; karmaşık filtreler hâlâ client-side.
- Scheduler/monitor state in-process; multi-replica production'da distributed lock/leader election yok.
- Health endpoint `/api/health` scheduler/monitor auto-start side effect'i içeriyor; health check'in state değiştirmesi production'da tartışmalı.

### Logging, Error Handling ve Monitoring

**İyi:**
- Pino tabanlı `createLogger()` var.
- Alarm/email/integration servislerinde structured logging kullanımı başlamış.
- `/api/health` ve `/api/health/alarms` önemli sinyaller veriyor.
- DLQ ve email throttling var.

**Eksik:**
- Çok sayıda route/component hâlâ `console.error` kullanıyor.
- Request ID/correlation ID yok.
- Metrics endpoint yok: Prometheus/OpenTelemetry/exporter yok.
- Alerting health endpoint'e bırakılmış; dış monitor dokümantasyonu eksik.
- Error taxonomy standart değil; route'lar farklı response shape kullanıyor.

### Deployment / Env / Secrets

**İyi:**
- Prod compose DB portunu localhost'a sınırlandırıyor.
- Prod web no-new-privileges/read-only filesystem yaklaşımı var.
- Docker docs secret generation checklist içeriyor.

**Eksik:**
- `.env.local` ve `.env.production` tracked.
- `.env.production` placeholder içeriyor ama gerçek production env dosyası gibi repo'da duruyor.
- TLS bypass production'da fail-fast kapatıldı; self-signed cihazlar için CA certificate path operasyonu takip edilmeli.
- Dockerfile build aşamasında `package-lock.json` kopyalanmıyor; deterministic build zayıflar.
- Entrypoint migration failure'da devam ediyor.
- NMS service prod compose içinde yok; deployment topolojisi dokümanla compose arasında net değil.

### Test Coverage

**Mevcut:**
- `type-check` ve `lint` scriptleri var.
- Manuel scripts: FA, VMware, event-cache, snapshot alarm vb.

**Eksik:**
- `npm test` yok.
- Unit/integration/e2e framework yok.
- Auth middleware, permissions, validators, alarm query registry, event cache parser, alarm runner lock/timeout behavior için otomatik test yok.
- CI pipeline görünmüyor.

---

## P0 / P1 / P2 Görev Listesi

### P0 — Production Blocker

1. **Public auth endpointlerini düzelt:** `/api/users/verify` ve `/api/users/reset-password` için güvenli public allowlist veya `/api/auth/*` altına taşıma.
2. **RBAC resource map'i tamamla:** integrations, security, topology, reports, license, racks, rooms, floors, services için resource/action mapping ekle; yüksek riskli control endpoint'leri ADMIN-only yap.
3. **Secret hijyenini düzelt:** `.env.local` ve `.env.production` tracked durumunu kaldır; gerçek credential içeren test scriptlerini temizle/rotate et; secret scan ekle.
4. **Production env fail-fast ekle:** `NEXTAUTH_SECRET`, `DATABASE_URL`, TLS doğrulama, placeholder env ve dev-secret fallback durumunda production boot etmesin.
5. **Prisma singleton ihlallerini kaldır:** integration/report/topology servislerinde `new PrismaClient()` yerine `lib/prisma.ts` kullan.

### P1 — High Priority

1. **Middleware DB-backed permission stratejisini netleştir:** Ya Edge-safe signed permission version kullan ya da API route-level DB permission guard ekle.
2. **UI route guard ekle:** protected page'lerde server/client session guard ve role-aware redirect.
3. **CSRF/idempotency standardı kur:** State-changing endpoint'ler için CSRF token veya same-site + origin check + idempotency key.
4. **Alarm cache cap riskini azalt:** high-volume logtype'lar için cursor pagination ve filter-specific DB queries.
5. **NMS metrics retention ekle:** raw retention, hourly/daily aggregation, cleanup scheduler.
6. **Migration failure fail-fast:** production entrypoint migration deploy başarısızsa app başlamasın.
7. **Structured error response standardı:** API error shape, internal message masking, correlation ID.
8. **Test framework kur:** Vitest/Jest + Playwright veya API integration test altyapısı.

### P2 — Hardening / Scale

1. **Prometheus/OpenTelemetry metrics ekle:** alarm duration, cache hit/miss, scheduler heartbeat, DB pool, DLQ backlog.
2. **Distributed scheduler lock:** multi-replica için DB advisory lock veya leader election.
3. **Reports pagination/streaming:** büyük export/report sorgularını stream/paginate et.
4. **Backup/restore runbook ve smoke test:** DB backup job ve restore doğrulama.
5. **NMS prod compose/topoloji netleştirme:** NMS sidecar production deployment'a eklenmeli veya dokümanda opsiyonel olduğu açıkça belirtilmeli.
6. **Dependency/security scanning:** `npm audit`, container scan, secret scan CI gate.
7. **Audit log immutability hardening:** append-only enforcement ve update/delete guard.

---

## İlk Uygulanması Gereken 5 Görev

1. **Middleware public allowlist + RBAC map düzeltmesi**
   - Reset/invite akışı çalışır hale gelsin.
   - High-risk API route'lar ADMIN/EDITOR/VIEWER ayrımına bağlansın.

2. **Secrets/env production gate**
   - Tracked env dosyaları temizlensin.
   - Dev fallback secret'ler production'da hard fail versin.
   - TLS bypass production'da boot blocker olsun.

3. **Prisma singleton refactor**
   - `FortiGateService`, `VMwareService`, `ZabbixService`, `TopologyRelationshipEngine`, `ReportsService` singleton `prisma` importuna geçirilsin.

4. **Auth/RBAC testleri**
   - Login, cookie, `/api/auth/me`, public reset/verify, viewer/editor/admin permission matrix ve protected route regression testleri yazılsın.

5. **Alarm cache pagination/coverage testleri**
   - `queryCachedEvents`, targeted sync, registry coverage ve high-volume >5000 event senaryoları test edilsin.

---

## Riskli Dosyalar

| Dosya | Risk |
|---|---|
| `middleware.ts` | Auth/RBAC merkezi; public route allowlist ve resource map eksik |
| `lib/auth/session.ts` | Dev secret fallback; DB role refresh yok |
| `lib/auth/permissions.ts` | Middleware dynamic DB permission yerine static matrix kullanıyor |
| `app/api/users/verify/route.ts` | Public olması gereken invitation endpoint middleware altında auth ister |
| `app/api/users/reset-password/route.ts` | Public olması gereken reset endpoint middleware altında auth ister |
| `app/api/alarms/check/route.ts` | Manual alarm trigger; güçlü operasyonel endpoint |
| `app/api/alarms/scheduler/route.ts` | Scheduler start/management; ADMIN-only olmalı |
| `app/api/alarms/monitor/route.ts` | Monitor stop/force-check yapabiliyor; ADMIN-only olmalı |
| `app/api/alarms/definitions/seed/route.ts` | Alarm definition seed/update yapıyor |
| `lib/alarms/detection-engine.ts` | Çok büyük kritik engine; test coverage şart |
| `lib/alarms/event-cache.ts` | Cache freshness, pagination, high-volume event coverage |
| `lib/alarms/alarm-runner.ts` | Scheduler/runner lock, timeout, DB sentinel |
| `lib/integrations/fortianalyzer.ts` | Session lifecycle, TLS, account lockout |
| `lib/integrations/fortigate.ts` | Direct PrismaClient, TLS bypass, external API credentials |
| `lib/integrations/vmware.ts` | Direct PrismaClient, `execSync` command construction, TLS bypass |
| `lib/integrations/zabbix.ts` | Direct PrismaClient |
| `lib/topology/relationship-engine.ts` | Raw SQL + direct PrismaClient fallback |
| `lib/reports/reports-service.ts` | Raw SQL + direct PrismaClient fallback |
| `scripts/entrypoint.sh` | Migration failure currently non-fatal |
| `.env.local`, `.env.production` | Tracked env files |
| `scripts/test-fa-login.mjs`, `scripts/test-fa-events.js` | Hardcoded credential-looking values |
| `nms_service/core/config.py` | Default DB/SSH passwords |

---

## Önerilen Geliştirme Sırası

1. **Security correctness first**
   - Public auth endpoints, RBAC map, session/role validation, UI guards.

2. **Secrets and deployment gates**
   - Env tracking cleanup, production fail-fast, TLS gate, deterministic Docker build.

3. **Database connection hygiene**
   - Prisma singleton everywhere, migration failure behavior, retention jobs.

4. **Alarm reliability and scale**
   - Cache pagination, registry coverage tests, multi-replica lock strategy.

5. **Observability**
   - Correlation ID, structured API error shape, metrics endpoint, external monitor runbook.

6. **Automated tests**
   - Auth/RBAC unit tests, API integration tests, alarm query tests, Playwright smoke tests.

7. **Operational hardening**
   - Backup/restore verification, CI security scans, production NMS deployment clarity.

---

## Kapanış

InfraScope'un domain ve alarm mimarisi güçlü; production'a taşınmadan önce en kritik eksik güvenlik ve operasyonel guardrail katmanında. Kodun en riskli kısmı artık "hiç auth yok" değil; daha ince ama production için önemli bir problem var: **auth var, fakat kapsamı ve public/private route ayrımı tamamlanmamış**. Bu nedenle ilk sprint auth/RBAC/env/Prisma singleton ekseninde tutulmalı; ardından alarm cache ölçek ve test coverage işleri gelmeli.
