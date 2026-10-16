# Runbook: FortiAnalyzer Hesap Kilidi (Session Pile-Up)

> **Kategori:** Entegrasyon hatası
> **Etkilenen alarmlar:** Tüm FA tabanlı alarmlar (config-change, IPS, IOC, SSL-VPN, web-analytics, ...)
> **Belirti:** Alarm runner loglarında **"no TID"** hatası, FA login `code=-22`, hesap kilitli.
> **İlgili dosyalar:** [`lib/integrations/fortianalyzer.ts`](../../lib/integrations/fortianalyzer.ts), [`lib/alarms/alarm-runner.ts`](../../lib/alarms/alarm-runner.ts)

---

## 1. Belirtiler

| Yer | Görünüm |
|---|---|
| Alarm runner log | `search-timeout` veya `no TID` (özellikle FA tabanlı sorgularda) |
| FA login log | `[FortiAnalyzer] 🔒 Account LOCKED (code=-22)` |
| `/api/health` | `fortianalyzer.consecutiveFailures > 0`, `isAccountLocked: true` |
| FA GUI | System → Administrators → `infrascope` → "Locked" rozeti |
| Alarm sayfası | Birden çok FA tabanlı alarm `error: "search-timeout"` ile başarısız |

---

## 2. Kök Neden (Bilinen)

FA hesap kilitleri **iki birikim** yüzünden oluşur:

1. **Sunucu tarafı session pile-up.**
   FA admin başına max-concurrent-session limiti var (genelde 5).
   `FortiAnalyzerService.logout()` çağrılmazsa her login yeni session yaratır,
   eski session'lar admin session table'da kalır, limit aşıldığında FA hesabı "abusive" işaretler.
2. **Stale session yeniden kullanımı.**
   `admin-idletimeout` (varsayılan 5 dk) dolduğunda FA session'ı server-side iptal eder.
   Kod hâlâ aynı session'ı gönderirse FA bunu **failed auth** sayar →
   `admin-lockout-threshold`'u aşınca hesap kilitlenir.

GUI'den "Unlock" sadece kilit bayrağını siler; orphan session'lar ve abuse counter kalır,
bu yüzden hesap kısa süre sonra tekrar kilitlenir.
**Sadece kullanıcıyı silip yeniden oluşturmak** abuse counter + orphan session listesini sıfırlar.

---

## 3. Acil Müdahale (Triage — 5 dakika)

```text
1. /api/health endpoint'ini kontrol et:
   curl -s http://<host>/api/health | jq '.fortianalyzer'
   → consecutiveFailures, isAccountLocked, backoffRemainingSec

2. Backoff aktifse (>0) BEKLE. Login deneme yapma.
   Backoff penceresinde uygulamanın yeniden başlatılması durumu KÖTÜLEŞTİRİR.

3. FA hesabı kilitli ise FA GUI üzerinden:
   System → Administrators → infrascope → 🔓 Unlock
```

---

## 4. Kalıcı Çözüm (Code-Level Önlem)

`lib/integrations/fortianalyzer.ts` aşağıdaki üçünü zorunlu olarak yapmalı:

| # | Koruma | Doğrulama |
|---|---|---|
| 1 | `logout()` metodu (`/sys/logout` çağrısı) | `grep "private async logout" lib/integrations/fortianalyzer.ts` |
| 2 | Yeni login öncesi stale session için `logout()` | `login()` içinde `if (state.session) { await this.logout(); }` |
| 3 | API yanıtında `code === -11 / -6` → `invalidateSession()` | `isSessionExpiredError()` helper var |

Bu üçü kurulduktan sonra **FA hesabı bir daha aynı sebepten kilitlenmez.**

---

## 5. Tekrar Kilitleniyorsa (Code-Level Önlemler Etkin Değilse)

Aşağıdaki kontrol listesini sırayla:

- [ ] `grep -rn "new FortiAnalyzerService" app/ lib/` → singleton dışı kullanım var mı? Hepsi `getSharedFortiAnalyzerService()` veya `initSharedFortiAnalyzerService()` üzerinden olmalı (Anayasa AI-2).
- [ ] FA'da `config system global` altında `admin-lockout-duration` ve `admin-lockout-threshold` makul mü? Önerilen: threshold ≥ 10, duration = 60s.
- [ ] FA'da `admin-idletimeout` minimum 30 dk olmalı (kodun lokal session TTL'i de 30 dk).
- [ ] Backoff senkron mu? `globalThis._fazGlobalState` farklı modül instance'ları arasında paylaşılıyor mu?
- [ ] Şifre doğru mu? Yanlış şifre her retry'da counter artırır → kilit.

---

## 6. Mevcut Orphan Session'ları Temizleme

FA CLI üzerinden:
```text
get system admin-session                              # tüm aktif session'ları listele
diagnose system admin-session clear all-sessions      # tüm session'ları kapat
diagnose system admin-session clear vdom <vdom>       # tek vdom için
```

Bu komut **abuse counter**'ı sıfırlamaz. Counter'ı sıfırlamanın bilinen yolu:
1. Hesabı sil
2. Aynı isimle yeniden oluştur (yeni profil objesi → yeni counter)

---

## 7. İzleme

`/api/health` endpoint'ine eklenmesi gereken alanlar (zaten var):

```json
{
  "fortianalyzer": {
    "consecutiveFailures": 0,
    "isAccountLocked": false,
    "backoffRemainingSec": 0,
    "lastFailureAt": null
  }
}
```

İdeal olarak `/admin/system-health` sayfasında bu durum kırmızı/sarı/yeşil rozet ile gösterilmeli.

---

## 8. İlgili ADR'ler ve Anayasa Maddeleri

- Anayasa İlke #8: **Her login'in bir logout'u olmalı**
- Anayasa İlke #11: **Hesap kilidi tespiti zorunlu**
- Anayasa İlke #10: **Singleton client pattern**
- ✅ **ADR-003**: FA Session Lifecycle (logout + invalidateSession + isSessionExpiredError)

---

## 9. Değişiklik Geçmişi

| Tarih | Değişiklik |
|---|---|
| 2026-02-17 | İlk sürüm — session pile-up kök nedeni, kod-seviyesi önlemler |
| 2026-10-15 | B05: credential-owned sessions, account-owned backoff and bounded transient connection tests; see ADR-012. |

## B05 connection tests and authentication ownership

The historical host-only state references above have been replaced by credential-owned sessions in `_fazAuthStateV2`. Shared clients with identical credentials still reuse one session/login result; other accounts or password revisions cannot adopt it. The HTTP connection test uses the centralized transient probe and closes only its own successfully authenticated session. Saving configuration resets only the configured account's backoff, without clearing unrelated sessions or hosts.

A failed probe can activate backoff for the same host/account, including a changed password. This protects the remote account from repeated attempts; it is not evidence that a suppressed request reached the provider. An active collector session remains usable. Different accounts are independent. On failure, check the supplied credentials and actual source account state, wait for backoff, or explicitly save corrected settings before retesting. Tests do not save settings.

Login request/body parsing and account queue waits each have a 60-second deadline; logout is best effort with a 10-second deadline. Cancellation prevents late responses from publishing sessions. Unobserved remote sessions after network cancellation may still need provider-side expiry; the older absolute lockout-prevention claim is not a guarantee.

Run `npm run test:fortianalyzer-auth` with the source/dispatch/health and integration-permission suites. Tests use fake source/ORM I/O and do not contact real accounts. Details and executed results: [ADR-012](../10-architecture/adr/ADR-012-fortianalyzer-credential-session-ownership.md).

## B06 settings changes and cache lifecycle

After a successful FA settings save, an active collector is retired and rebound asynchronously to the newly stored revision. Its recurring timer is cleared and source searches, polling and live query fallbacks use cancellation. Native events are stored/read within their revision; an already issued old DB write may complete only in its old namespace. Failed or denied saves retain the current collector. Source failure after a successful save leaves coverage unavailable; it must not restore old-source freshness.

Inspect `/api/health` event-cache `sourceRevision`, `stopped`, per-logtype freshness and failures. A warmup may remain stale while it runs; matching live source fallback still works. Disabled, deleted, malformed or unverifiable configuration cannot authorize old-source collection. Scheduled cycles detect external changes by re-reading the configuration record. Writers must maintain the model's `updatedAt` contract; legacy plaintext secrets are deliberately excluded from persisted revision digests.

Deploy this lifecycle implementation with one application-process restart to remove timers created by older code that had no stop handle. Subsequent settings changes under this implementation do not require restart. No cache-table migration or incident deletion is needed; unscoped historical FA cache rows are not reused as current data and normal retention removes expired FA rows. Inactive CMDB-diff helpers remain outside the active alarm registry.

Run `npm run test:fortianalyzer-cache` offline. `npm run test:fortianalyzer-cache:db` requires explicit `INFRASCOPE_FA_CACHE_DB_TEST=1` and a local disposable `*_cache_tests` or `*_occurrence_tests` database; never direct it at an installation DB. See [ADR-013](../10-architecture/adr/ADR-013-fortianalyzer-cache-configuration-lifecycle.md) for commands and actual verification limits.
