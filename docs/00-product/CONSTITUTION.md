# InfraScope Ürün Anayasası

> Bu doküman ürünün **değişmez ilkelerini** tanımlar.
> Her yeni görev (Quest, PR, alarm, entegrasyon) başlamadan önce bu dosya okunur.
> İhlal eden bir karar alınacaksa **yeni bir ADR** yazılır.

**Versiyon:** 1.0 — 2026-02-17
**Sahibi:** Ürün ekibi
**Güncelleme kuralı:** Her ihlal/değişiklik bir ADR ile gerekçelenir.

---

## 1. North Star (Tek Cümle)

> InfraScope, **fiziksel + sanal + ağ + güvenlik** altyapısının tek bir camdan izlenip yönetildiği,
> **gerçek-zamana yakın görünürlük** ve **eyleme dönük alarmlar** sunan kurumsal operasyon platformudur.

---

## 2. Hedef Kullanıcılar

| Persona | Birincil ihtiyaç | Hangi sayfaları kullanır |
|---|---|---|
| **NOC Operatörü** | Hangi cihaz/port/servis düştü, ne yapmalıyım? | `/dashboard/alerts`, `/network/*`, `/integrations/*` |
| **SecOps Analisti** | Şüpheli oturum, exposed servis, IOC, IPS olayı | `/security/*`, `/dashboard/risks` |
| **IT Yöneticisi** | Kapasite, sprawl, support sözleşme bitişleri | `/analytics/*`, `/reports`, `/dashboard` |
| **Sistem Yöneticisi** | Konfig değişiklikleri, drift, audit izi | `/audit/*`, `/network/config-revisions` |

---

## 3. Pazarlığa Kapalı İlkeler (Non-Negotiables)

### 3.1 Veri Bütünlüğü
1. **Asla mock/sahte veri gösterilmez.** Entegrasyon down ise UI "kullanılamıyor / unavailable" döner.
2. **Cache + canlı kaynak** karıştırılmaz; UI hangisini gösterdiğini açıkça söyler (badge / timestamp).
3. **Yazma yolları okuma yollarını bloklamaz.** UI render olmalı, entegrasyonlar ölü olsa bile.

### 3.2 Alarm Disiplini
4. **Alarmlar sinyaldir, gürültü değildir.** Her alarm tipinin bir **runbook**'u olmalı.
5. **Cooldown ve auto-resolve zorunludur.** Cooldown'suz alarm → otomatik anti-pattern.
6. **Otomasyon eventleri filtrelenir.** (veeam, pyvmomi, vcenter, com.vmware.vim.eam, vb.)
7. **Alarm sorguları `ALARM_QUERY_REGISTRY`'e kaydedilir.** Inline sorgu yasak.

### 3.3 Entegrasyon Hijyeni
8. **Her login'in bir logout'u olmalı.** Sunucu tarafında session pile-up yasaktır.
9. **Her entegrasyon şu üçünü sağlar:** exponential backoff + session lifecycle + `/api/health` bilgisi.
10. **Singleton client pattern** zorunlu. Dağınık `new XService()` yasak.
11. **Hesap kilidi tespiti**: `code === -22 / locked` görüldüğünde backoff penceresi otomatik genişler.

### 3.4 Kod ve Mimari
12. **Bounded context'lere saygı:** alarms / integrations / topology / inventory / audit ayrı modüller.
13. **`lib/prisma.ts` tek Prisma client.** Yeni `new PrismaClient()` yasak.
14. **Cron / scheduler işleri idempotent.** Yeniden çalışmak duplicate state yaratamaz.
15. **TypeScript strict.** `any` kullanımı PR'da gerekçelendirilir.

### 3.5 Dil
16. **Kod / yorum / log / commit mesajı: İngilizce.**
17. **Kullanıcı yüzeyi (UI string, alarm başlığı): Türkçe.**
18. **Karışım yasak.** (Geçmiş tribal-knowledge yitiminin en büyük nedeni.)

### 3.6 Güvenlik
19. Şifre / token kaynağı: env veya şifrelenmiş DB; kodda hard-coded yasak.
20. SSL/TLS doğrulama production'da bypass edilemez.
21. Audit-log'lar değiştirilemez (immutable append-only mantık).

---

## 4. Mimari Değişmezler (Architecture Invariants)

| # | Kural | İhlal sonucu |
|---|---|---|
| AI-1 | Alarm tanımı `alarm-definitions.ts` + `ALARM_QUERY_REGISTRY` ikilisinde olmalı | Alarm engine bulamaz, sessizce başarısız olur |
| AI-2 | Entegrasyon client'i `getSharedXService()` üzerinden alınır | Backoff state senkron olmaz, hesap kilitlenir |
| AI-3 | DB erişimi `lib/prisma.ts` üzerinden | Connection pool exhaustion |
| AI-4 | UI sayfaları kendi API'sine `lib/api.ts` ile bağlanır | Yarım kalan request, race condition |
| AI-5 | Migrasyon sırası: schema.prisma → migrate dev → kod | Drift, üretimde patlama |
| AI-6 | Cooldown: `deviceName + interface_name + alarmCode` üçlüsü | Aynı portta seri alarm spam |
| AI-7 | Her dış API çağrısı: timeout + retry + abort signal | Hanging fetch → engine kilidi |

---

## 5. Yapmayacağımız Şeyler (Out of Scope)

- ❌ **Multi-tenancy.** Tek-organizasyon ürünüdür.
- ❌ **Native mobil uygulama.** Sadece responsive web.
- ❌ **Custom auth sistemi.** SSO/OAuth dışında yok.
- ❌ **Realtime websocket bildirimi** (en azından şimdilik; polling + cache yeterli).
- ❌ **Kendi log toplama altyapımız.** FortiAnalyzer + cached_events kullanılır.
- ❌ **Müşteri-kaynaklı plug-in sistemi.** Genişletmeler PR ile yapılır.

---

## 6. Karar Tetikleyicileri (Decision Triggers)

Aşağıdaki durumlarda **önce ADR yaz, sonra kodla**:

- Bir invariant'ı (Bölüm 4) ihlal etmek gerekiyorsa
- Yeni bir bounded context açılıyorsa
- Yeni bir 3rd-party entegrasyon ekleniyorsa
- Veri modelinde geri-uyumsuz (breaking) bir değişiklik gerekiyorsa
- Bir alarm'ın severity / cooldown'u kalıcı değişiyorsa
- Yeni bir auth/authz mekanizması ekleniyorsa

ADR şablonu: `docs/10-architecture/adr/_template.md`

---

## 7. Quest Mode Kullanım Kuralları

Her Quest şu üçünü içermek zorundadır:

1. **Anchors:** İlgili modülün README'si + bu CONSTITUTION + varsa runbook.
2. **Tek bounded context:** Birden fazla domain'i kesiyorsa Quest'i böl.
3. **Knowledge capture step:** Bitişte ilgili runbook / ADR / CHANGELOG güncellenir.

Quest sonu tamamlanmış sayılmaz eğer:
- Doc güncellemesi yoksa
- Type-check geçmiyorsa
- Yeni invariant gerekti ama ADR yazılmadıysa

---

## 8. Sürüm ve Değişiklik Yönetimi

- Tüm kullanıcı-görünür değişiklikler → `CHANGELOG.md`
- Tüm mimari kararlar → `docs/10-architecture/adr/ADR-XXX-*.md`
- Tüm operasyonel olaylar → `docs/30-runbooks/*.md`
- Bu Anayasa bir minor değişiklikte revize edilebilir;
  major (sayılı maddenin anlamı değişiyorsa) ekip onayı gerekir.

---

## 9. Hızlı Kontrol Listesi (Her Görev Öncesi)

```
[ ] Bu işin domain'i hangisi? (alarms / integrations / topology / inventory / audit / security)
[ ] İlgili modül README'sini okudum mu?
[ ] Mevcut ADR'lere baktım mı?
[ ] Bu değişiklik bir invariant ihlal ediyor mu?
[ ] Yeni alarm ekliyorsam: registry + definition + runbook üçlüsünü tamamlayacak mıyım?
[ ] Yeni entegrasyon ekliyorsam: backoff + logout + health verecek miyim?
[ ] Bitişte hangi doc güncellenecek?
```

---

**Bu dosya değişmedikçe ürün yönü değişmez.**
**Bu dosya değişiyorsa bir ADR + ekip onayı gerekir.**
