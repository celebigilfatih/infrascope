# InfraScope Authentication & Authorization Audit

**Tarih:** 2026-06-14
**Kapsam:** Kullanıcı kimliği kaynağı, role/permission kontrolü, header trust, API route yetkilendirme boşlukları, organization izolasyonu
**Anchor:** `docs/00-product/CONSTITUTION.md` okundu. Anayasa "Multi-tenancy"yi out of scope olarak tanımlar; bu nedenle organization izolasyonu, müşteri/tenant boundary'si değil, tek-organizasyon ürününde yanlış organizasyon seçimi ve veri karışması riski olarak değerlendirildi.
**Kural:** Kod değiştirilmedi; bu dosya yalnızca audit raporudur.

---

## Genel Sonuç

InfraScope'ta authentication artık temel olarak server-side üretilmiş JWT session cookie üzerinden çalışıyor. Eski tarz `x-user-role` gibi client header'ına güvenen bir RBAC akışı aktif görünmüyor. Bu önemli bir iyileşme.

Buna rağmen authorization katmanı production için tamamlanmış değil. `middleware.ts` sadece sınırlı sayıda API prefix'ini resource/action bazlı kontrol ediyor; çok sayıda kritik route yalnızca "geçerli session var mı?" seviyesinde kalıyor. Bu nedenle düşük yetkili bir kullanıcı, login olduktan sonra integrations, security, topology, reports, license ve fiziksel envanter route'larının önemli bir kısmına erişebilir.

**Kısa karar:** Authentication orta seviyede; authorization kapsamı eksik. Production öncesi P0 düzeltme gerekir.

---

## 1. Kullanıcı Kimliği Nereden Geliyor?

Kullanıcı kimliği login sırasında DB'den okunuyor ve signed JWT içine yazılıyor.

Akış:

1. `app/api/auth/login/route.ts` email/password alıyor.
2. Kullanıcı `prisma.user.findUnique({ where: { email } })` ile bulunuyor.
3. `verifyPassword()` ile bcrypt doğrulaması yapılıyor.
4. Kullanıcının `id`, `role`, `email` bilgisi `signSessionToken()` ile JWT'ye yazılıyor.
5. Token `infrascope_session` adlı httpOnly cookie olarak set ediliyor.

Referanslar:

- `app/api/auth/login/route.ts:21` kullanıcı DB'den bulunuyor.
- `app/api/auth/login/route.ts:55` password doğrulanıyor.
- `app/api/auth/login/route.ts:84` session payload oluşturuluyor.
- `app/api/auth/login/route.ts:101` `infrascope_session` cookie set ediliyor.
- `lib/auth/session.ts:17` session cookie adı tanımlı.
- `lib/auth/session.ts:34` JWT imzalama yapılıyor.
- `lib/auth/session.ts:46` JWT doğrulama yapılıyor.

Ek not:

`/api/auth/me` middleware'den public geçmesine rağmen kendi içinde cookie doğruluyor ve DB'den kullanıcıyı yeniden okuyarak `status` kontrolü yapıyor. Bu doğru yönde bir kontrol, fakat middleware'in kendisi role/status bilgisini DB'den yeniden okumuyor.

---

## 2. Role / Permission Kontrolü Nerede Yapılıyor?

Ana kontrol noktası `middleware.ts`.

Middleware davranışı:

- Sadece `/api/:path*` matcher'ı var.
- Public API prefix'leri: `/api/auth/`, `/api/health`.
- Diğer API rotalarında cookie'den `infrascope_session` okunuyor.
- JWT `verifySessionToken()` ile doğrulanıyor.
- Route prefix'i `ROUTE_RESOURCE_MAP` içinde ise HTTP method `read/write/delete` action'ına çevriliyor.
- Role kontrolü `canAccessSync()` ile static permission matrix üzerinden yapılıyor.

Mapped resource listesi:

| Prefix | Resource |
|---|---|
| `/api/users` | `users` |
| `/api/alarms` | `alarms` |
| `/api/devices` | `devices` |
| `/api/organizations` | `organizations` |
| `/api/settings` | `settings` |
| `/api/audit` | `audit` |
| `/api/permissions` | `settings` |

Referanslar:

- `middleware.ts:16` route/resource map.
- `middleware.ts:27` method/action map.
- `middleware.ts:58` public route listesi.
- `middleware.ts:72` unmapped route davranışı.
- `middleware.ts:109` role JWT payload'undan alınıyor.
- `middleware.ts:117` permission check `canAccessSync()` ile yapılıyor.
- `lib/auth/permissions.ts:12` static default permission matrix.
- `lib/auth/permissions.ts:43` DB-backed `canAccess()` var.
- `lib/auth/permissions.ts:62` middleware'in kullandığı sync/static `canAccessSync()` var.

Önemli tasarım açığı:

DB'de `Permission` ve `RolePermission` modeli var, `/api/permissions` bu matrix'i değiştirebiliyor; ancak middleware DB-backed `canAccess()` kullanmıyor. Dolayısıyla UI'dan değiştirilen permission matrix, gerçek middleware enforcement'a yansımaz.

---

## 3. Header'dan Gelen User / Role Bilgilerine Güveniliyor Mu?

Aktif authz akışında `x-user-role`, `x-user-id` veya benzeri client-provided identity header'ına güvenildiğine dair kritik bir kullanım bulunmadı.

Olumlu bulgu:

- `middleware.ts:92` yorumunda eski spoofable `x-user-role` yaklaşımının cookie/JWT ile değiştirildiği belirtiliyor.
- `rg` taramasında `x-user-role` aktif role kaynağı olarak kullanılmıyor.
- Role bilgisi `middleware.ts:109` satırında JWT payload'undan alınıyor.

Sınırlı header kullanımları:

- `x-forwarded-for`, `x-real-ip`, `x-app-version` license activation/heartbeat metadata için kullanılıyor. Bunlar auth identity kaynağı değil.
- `x-cache-bypass` FortiGate/VMware cache revalidation için kullanılıyor. Bu da user identity değil, fakat route auth-only-unmapped olduğu için düşük yetkili kullanıcı cache bypass davranışını tetikleyebilir.

Risk:

Header spoofing ile doğrudan ADMIN olunamıyor. Ancak JWT payload içindeki role 8 saat boyunca DB'den refresh edilmediği için kullanıcının role/status değişikliği middleware tarafında token expire olana kadar etkili olmayabilir. `/api/auth/me` DB status kontrolü yapıyor ama middleware her API çağrısında DB status/role doğrulaması yapmıyor.

---

## 4. API Route'larda Yetki Kontrolü Eksik Olan Endpoint Var Mı?

Evet. İki ana kategori var.

### A. Auth-only ama RBAC'siz route'lar

Bu rotalar public değil; geçerli session gerekir. Ancak `ROUTE_RESOURCE_MAP` içinde olmadıkları için role/action kontrolü yapılmaz. Login olmuş VIEWER da bu endpoint'lere ulaşabilir.

Öne çıkan kritik örnekler:

| Route | Risk |
|---|---|
| `/api/integrations/fortigate` | Config okuma, status/test/sync gibi entegrasyon operasyonları |
| `/api/integrations/vmware` | vCenter veri okuma, sync, config/status işlemleri |
| `/api/integrations/zabbix` | Zabbix status/sync/config işlemleri |
| `/api/integrations/fortianalyzer` | FA security/event verisi ve entegrasyon erişimi |
| `/api/integrations/nms/**` | NMS cihaz, backup, discovery, port monitoring işlemleri |
| `/api/security/quarantine` | FortiGate üzerinde IP quarantine/release yapabiliyor |
| `/api/security/risky-rules` | Security policy/risk verisi |
| `/api/firewall-policies` | Firewall policy verisi |
| `/api/topology` | Topology graph okuma ve `correlateAll()` write-like operasyonu |
| `/api/reports` | Inventory/capacity/VMware/integration/alerts raporları |
| `/api/license/*` | License status/activate/validate/heartbeat |
| `/api/buildings`, `/api/floors`, `/api/rooms`, `/api/racks` | Fiziksel lokasyon/envanter yönetimi |
| `/api/services`, `/api/services/dependencies` | Servis/dependency yönetimi |
| `/api/network-connections`, `/api/building-connections` | Network/fiziksel bağlantı yönetimi |
| `/api/dashboard/summary` | Dashboard aggregate verileri |

Referans:

- `middleware.ts:72` unmapped route'larda sadece authentication kontrolü yapılıp `NextResponse.next()` dönülüyor.
- `app/api/security/quarantine/route.ts:80` POST IP quarantine yapıyor.
- `app/api/security/quarantine/route.ts:116` DELETE quarantine release yapıyor.
- `app/api/topology/route.ts:35` POST topology action alıyor.
- `app/api/topology/route.ts:46` `correlateAll()` çalıştırıyor.
- `app/api/integrations/fortigate/route.ts:411` sync action başlıyor.
- `app/api/integrations/fortigate/route.ts:468` FortiGate sync inventory'ye yazıyor.
- `app/api/integrations/vmware/route.ts:841` sync action başlıyor.
- `app/api/integrations/vmware/route.ts:895` VMware sync inventory'ye yazıyor.

### B. Mapped ama fazla geniş role izni olan route'lar

`/api/alarms/*` mapped olduğu için RBAC alıyor, ama tüm POST/PATCH/PUT write işlemleri EDITOR'a açık. Bazı alarm operasyonları sıradan alarm editinden daha güçlü:

| Route | Mevcut efektif kontrol | Risk |
|---|---|---|
| `/api/alarms/check` | `alarms:write` -> ADMIN/EDITOR | Manual alarm runner tetikler |
| `/api/alarms/scheduler` | `alarms:write` -> ADMIN/EDITOR | Scheduler start yapar |
| `/api/alarms/monitor` | `alarms:write` -> ADMIN/EDITOR | Monitor start/stop/force-check yapar |
| `/api/alarms/definitions/seed` | `alarms:write` -> ADMIN/EDITOR | Alarm definition seed/update yapabilir |

Referans:

- `app/api/alarms/check/route.ts:18` manual runner POST.
- `app/api/alarms/check/route.ts:31` GET de POST'u çağırıyor; GET method middleware'de `read` sayıldığı için VIEWER manual alarm check tetikleyebilir.
- `app/api/alarms/scheduler/route.ts:26` scheduler POST start.
- `app/api/alarms/monitor/route.ts:27` monitor POST action alıyor.
- `app/api/alarms/monitor/route.ts:42` stop action.
- `app/api/alarms/monitor/route.ts:49` force-check action.

### C. Public olması gereken ama mapped olduğu için kırılan auth akışları

`/api/users/verify` ve `/api/users/reset-password` public invite/reset akışları gibi tasarlanmış. Fakat `/api/users` prefix'i mapped olduğundan middleware bunlara session ister.

Etkisi:

- Davet kabul ekranı session yokken token doğrulayamaz.
- Şifre sıfırlama ekranı session yokken token doğrulayamaz.
- Reset request POST da authenticated kullanıcı gerektirir hale gelir.

Referans:

- `middleware.ts:17` `/api/users` mapped.
- `middleware.ts:58` public listesinde sadece `/api/auth/` ve `/api/health` var.
- `app/api/users/verify/route.ts:9` invitation accept POST.
- `app/api/users/verify/route.ts:118` token validate GET.
- `app/api/users/reset-password/route.ts:13` reset request POST.
- `app/api/users/reset-password/route.ts:80` reset confirm PATCH.
- `app/api/users/reset-password/route.ts:162` token validate GET.

---

## 5. Tenant / Organization İzolasyonu Doğru Uygulanıyor Mu?

Anayasa çok net: ürün multi-tenant değildir. Bu yüzden "kullanıcı A sadece tenant A verisini görmeli" gibi bir security boundary beklenmiyor.

Ancak kodda `Organization` modeli ve birçok `organizationId` ilişkisi var. Bu yapı tenant security boundary olarak kullanılmıyor; daha çok envanter/lokasyon gruplaması gibi duruyor.

Bulgu:

- `User` modelinde `organizationId` yok. Kullanıcı bir organization'a bağlı değil.
- `Organization` modeli ayrı var, ama auth session payload'unda organization yok.
- Middleware veya API route'lar "user hangi organization'a ait?" kontrolü yapmıyor.
- Bazı integration sync endpoint'leri `organizationId` değerini request body'den alıyor veya ilk organization'a fallback yapıyor.
- Topology endpoint'i `organizationId` query parametresini doğrudan kullanıyor.

Referanslar:

- `prisma/schema.prisma:28` `User` modeli başlıyor; organization relation yok.
- `lib/auth/session.ts:20` session payload sadece `userId`, `role`, `email` içeriyor.
- `app/api/integrations/fortigate/route.ts:413` request body'den `organizationId` alıyor.
- `app/api/integrations/vmware/route.ts:844` request body'den `organizationId` alıyor veya first organization kullanıyor.
- `app/api/integrations/zabbix/route.ts:88` request body'den `organizationId` alıyor veya first organization kullanıyor.
- `app/api/topology/route.ts:11` query parametresinden `organizationId` alıyor.
- `app/api/buildings/route.ts:84` create body'den `organizationId` alıyor.

Değerlendirme:

Tek-organizasyon ürün ilkesi açısından bu P0 tenant breakout değil. Fakat organization kavramı UI/DB'de bulunduğu için yanlış kullanılırsa veri karışması, yanlış envantere sync ve ileride multi-org beklentisi doğarsa ciddi authorization açığı oluşur. OrganizationId client input'u trust boundary gibi kullanılmamalı; ya tek default organization server-side belirlenmeli ya da gerçek org-scoped auth modeli tasarlanmalı.

---

## Kritik Güvenlik Açıkları

### P0

1. **RBAC kapsamı eksik: kritik route'lar auth-only kalıyor**
   - Etki: VIEWER gibi düşük yetkili kullanıcı integrations, security quarantine, topology correlation, reports, license, NMS backup/discovery gibi operasyonlara erişebilir.
   - Kanıt: `middleware.ts:72` unmapped route yalnızca auth kontrolü yapıyor.
   - Öneri: `ROUTE_RESOURCE_MAP` tüm API surface'i kapsamalı veya route-level guard zorunlu hale getirilmeli. Security/integrations/license/admin-operational endpoint'leri ADMIN-only olmalı.

2. **GET `/api/alarms/check` state-changing iş yapıyor ve VIEWER tarafından tetiklenebilir**
   - Etki: VIEWER manuel alarm evaluation çalıştırabilir; bu operasyon DB/entegrasyon yükü ve alarm side-effect'i yaratabilir.
   - Kanıt: `app/api/alarms/check/route.ts:31` GET, POST'u çağırıyor; middleware GET'i `read` sayıyor.
   - Öneri: Manual check sadece POST olmalı ve ADMIN-only ya da ayrı `alarms:execute` permission'ı gerektirmeli.

3. **Permission UI/DB matrix enforcement'a bağlı değil**
   - Etki: Admin UI'da permission kapatılsa bile middleware static `DEFAULT_PERMISSIONS` ile karar verir; güvenlik ayarı gerçekte uygulanmaz.
   - Kanıt: `middleware.ts:117` `canAccessSync()`, `lib/auth/permissions.ts:62`; DB-backed `canAccess()` kullanılmıyor.
   - Öneri: Edge-safe merkezi permission snapshot/version veya API route-level DB-backed guard kullanılmalı.

### P1

1. **Public invite/reset akışları middleware tarafından kilitleniyor**
   - Etki: Güvenlik açığından çok auth correctness sorunu; kullanıcı onboarding ve şifre sıfırlama kırılır.
   - Kanıt: `/api/users/verify` ve `/api/users/reset-password`, `/api/users` mapping altına düşüyor.
   - Öneri: Bu rotalar explicit public allowlist'e alınmalı veya `/api/auth/verify-invitation` ve `/api/auth/reset-password` altına taşınmalı.

2. **JWT role/status middleware'de DB'den refresh edilmiyor**
   - Etki: Kullanıcı suspend edilse veya role düşürülse bile mevcut JWT süresi boyunca API erişimi devam edebilir.
   - Kanıt: `verifySessionToken()` payload'ı döndürüyor; middleware DB user lookup yapmıyor.
   - Öneri: Session token'a role version/session version eklenmeli veya route guard DB-backed active user check yapmalı.

3. **Session secret fallback var**
   - Etki: Production env eksikse herkesçe bilinebilecek dev secret ile JWT doğrulama yapılır.
   - Kanıt: `lib/auth/session.ts:14`.
   - Öneri: Production'da `NEXTAUTH_SECRET` zorunlu olmalı; fallback sadece development'ta çalışmalı.

4. **OrganizationId client input'u güvenlik boundary'si gibi kullanılmaya açık**
   - Etki: Yanlış organization'a sync/write; ileride multi-org beklentisi oluşursa horizontal access açığı.
   - Kanıt: integration sync ve topology route'ları body/query `organizationId` alıyor.
   - Öneri: Tek-org ise server-side default organization kullan; multi-org olacaksa User-Organization relation ve scoped guards tasarla.

5. **Operational alarm endpoint'leri fazla geniş**
   - Etki: EDITOR alarm scheduler/monitor/seed gibi sistem operasyonlarını tetikleyebilir.
   - Kanıt: `/api/alarms/*` tamamı `alarms:write` altında.
   - Öneri: `alarms:execute`, `alarms:admin`, `scheduler:admin` gibi daha dar action/resource ayrımı.

### P2

1. **UI route'ları server-side protected değil**
   - Etki: API data korunsa bile protected ekran shell'leri ve route deneyimi tutarsız.
   - Kanıt: middleware matcher sadece `/api/:path*`.
   - Öneri: Protected dashboard/settings/security page'leri için route guard ekle.

2. **Route-specific audit logging standart değil**
   - Etki: Yetkisiz/başarısız authorization denemeleri ve sensitive operasyonlar merkezi audit'te görünmeyebilir.
   - Öneri: Middleware 401/403 ve high-risk successful operations audit standardı.

3. **CSRF/origin kontrolü standart değil**
   - Etki: SameSite strict yardımcı olur ama state-changing endpoint'lerde origin/idempotency standardı yok.
   - Öneri: Mutating API'lerde origin check ve CSRF/idempotency policy belirle.

---

## Endpoint Sınıflandırması

### Resource-based RBAC alan route'lar

- `/api/users/**`
- `/api/alarms/**`
- `/api/devices/**`
- `/api/organizations/**`
- `/api/audit/**`
- `/api/permissions`

Not: `/api/permissions` `settings` resource'una bağlı. `/api/settings` route'u map'te var ama mevcut route listesinde görünmedi.

### Public route'lar

- `/api/auth/**`
- `/api/health/**`

Not: `/api/auth/me` public prefix altında olsa da kendi içinde session cookie kontrolü yapıyor. `/api/auth/logout` auth gerektirmeden cookie temizliyor; bu düşük riskli.

### Auth-only ama RBAC'siz route aileleri

- `/api/integrations/**`
- `/api/security/**`
- `/api/firewall-policies`
- `/api/topology`
- `/api/reports`
- `/api/license/**`
- `/api/buildings/**`
- `/api/floors/**`
- `/api/rooms/**`
- `/api/racks/**`
- `/api/services/**`
- `/api/network-connections`
- `/api/building-connections/**`
- `/api/dashboard/summary`

---

## Önerilen Düzeltme Sırası

1. **Middleware route/resource map'i kapat**
   - Tüm API route ailelerini resource/action modeline bağla.
   - Unmapped route'lar production'da default deny olsun.

2. **Sensitive operation permission'larını ayır**
   - `read/write/delete` yeterli değil.
   - `execute`, `admin`, `sync`, `configure`, `quarantine`, `export` gibi action'lar eklenmeli.

3. **Public auth endpoint'lerini explicit tasarla**
   - Invite verify ve password reset route'ları public ama token-bound olmalı.
   - `/api/users` altındaki public/authenticated karışımı temizlenmeli.

4. **Session validity modelini güçlendir**
   - Production'da secret fallback'i kaldır.
   - Role/status değişiklikleri token süresini beklemeden etkili olmalı.

5. **Organization model kararını netleştir**
   - Tek-org kalacaksa client-provided organizationId azaltılmalı.
   - Multi-org olacaksa ADR, User-Organization relation ve scoped authorization gerekir.

---

## Kapanış

InfraScope'ta artık "header gönderip admin olma" gibi kaba bir açık görünmüyor. Fakat authorization tamamlanmış sayılmaz; sistemin asıl riski mapped/unmapped API ayrımında. Middleware unmapped rotalarda sadece login kontrolü yaptığı için, production'da en kritik operasyonel yüzeylerin bir kısmı role kontrolü dışında kalıyor. İlk sprint bu RBAC kapsam boşluğunu kapatmalı.
