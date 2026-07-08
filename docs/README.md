# InfraScope Dokümantasyon Haritası

Bu klasör InfraScope'un **kalıcı bilgi tabanıdır**.
Her yeni görev/Quest başlamadan önce ilgili kısım okunur.

> **Önemli:** Geçmiş `INDEX.md`, `DELIVERABLES.md`, `NEXT_STEPS.md`, `PROJECT_SUMMARY.md`, `QUICK_START.md`
> dosyaları **v1.0 (2024)** dönemine ait ve büyük ölçüde geçersizdir.
> Yeni gerçek kaynak buradaki yapıdır.

---

## Klasör Yapısı

```
docs/
├── 00-product/         ← Ürün ne, kim için, hangi ilkelerle? (DEĞİŞMEZ)
├── 10-architecture/    ← Teknik mimari, ADR'ler, data flow
├── 20-modules/         ← Bounded context başına detay (alarms, integrations, ...)
├── 30-runbooks/        ← Olay müdahale rehberleri
└── 40-changelog/       ← Sürüm + değişiklik tarihçesi
```

---

## 1. Ürün Anayasası (önce burayı oku)

- **[CONSTITUTION.md](./00-product/CONSTITUTION.md)** — Ürünün değişmez ilkeleri ve mimari invariantları
- _(planlı)_ `00-product/GLOSSARY.md` — Domain terimleri (Alarm, Event, CMDB diff, ...)
- _(planlı)_ `00-product/PERSONAS.md` — NOC / SecOps / IT yöneticisi profilleri

## 2. Mimari

- ✅ `10-architecture/OVERVIEW.md` — Mevcut sistem mimarisi, veri akışı ve invariantlar
- ✅ `10-architecture/BOUNDED_CONTEXTS.md` — alarms / integrations / topology / inventory / audit / security / nms / virtualization
- ✅ `10-architecture/adr/_template.md` — ADR şablonu
- ✅ `10-architecture/adr/ADR-001-prefer-config-revisions-over-cmdb-diff.md` — CMDB-diff yerine FA config-events
- ✅ `10-architecture/adr/ADR-002-alarm-query-registry-pattern.md` — Alarm query registry pattern
- ✅ `10-architecture/adr/ADR-003-fa-session-management.md` — FA session lifecycle (logout + expiry detection)
- ✅ `10-architecture/adr/ADR-004-port-mapping-strategy.md` — Docker internal/external port mapping
- _(planlı)_ `10-architecture/DATA_FLOW.md` — FA → cached_events → alarm-runner → UI

## 3. Modül Detayları

- ✅ `20-modules/alarms/README.md` — Engine, registry, definition + cooldown akışı
- ✅ `20-modules/alarms/DEFINITIONS.md` — Auto-generated alarm kataloğu
- ✅ `20-modules/integrations/README.md` — Integration module overview (FA, FG, VMware, NMS)
- ✅ `20-modules/integrations/fortianalyzer.md` — Session lifecycle, auth, batch query
- ✅ `20-modules/integrations/fortigate.md` — CMDB diff, REST + SSH karışımı
- ✅ `20-modules/integrations/vmware.md` — vCenter event sync
- ✅ `20-modules/integrations/nms.md` — SNMP/SSH polling, port-down detection
- ✅ `20-modules/topology/README.md`
- ✅ `20-modules/inventory/README.md`

## 4. Runbook'lar (Olay Müdahale)

- ✅ **[FA_ACCOUNT_LOCKED.md](./30-runbooks/FA_ACCOUNT_LOCKED.md)** — FortiAnalyzer hesap kilitleri
- ✅ **[DUPLICATE_PORT_DOWN_EVENTS.md](./30-runbooks/DUPLICATE_PORT_DOWN_EVENTS.md)** — NMS_PORT_DOWN race condition
- ✅ **[DATASTORE_CRITICAL.md](./30-runbooks/DATASTORE_CRITICAL.md)** — VMware datastore doluluk
- ✅ **[CUSTOMER_DEMO_INSTALL.md](./30-runbooks/CUSTOMER_DEMO_INSTALL.md)** — Müşteri sunucusunda demo kurulum + lisans aktivasyonu

## 5. Sürüm Tarihçesi

- ✅ `../CHANGELOG.md` — Kullanıcı-görünür değişikliklerin tek kaynağı

---

## Quest Mode için Kullanım

Yeni bir Quest açarken:

```
Anchors:
- docs/00-product/CONSTITUTION.md           ← Her zaman
- docs/20-modules/<domain>/README.md        ← İlgili modül
- docs/30-runbooks/<incident>.md            ← Varsa olay rehberi

Knowledge capture (zorunlu kapanış):
- [ ] CHANGELOG entry eklendi
- [ ] Etkilenen runbook güncellendi
- [ ] Yeni invariant gerekti ise ADR yazıldı
```

---

**Doküman hijyeni Anayasa İlke #4'ün (alarmlar sinyaldir) doküman karşılığıdır:
gürültülü/güncel olmayan doküman, hiç doküman olmamasından kötüdür.**
