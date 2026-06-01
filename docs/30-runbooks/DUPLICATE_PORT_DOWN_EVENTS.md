# Runbook: NMS_PORT_DOWN Yinelenen Eventler (Race Condition)

> **Kategori:** Alarm gürültüsü / duplicate event
> **Etkilenen alarm:** `NMS_PORT_DOWN`
> **Belirti:** Aynı port için **1ms aralıkla 2 kez** alarm event'i oluşması.
> **İlgili dosyalar:** [`lib/alarms/detection-engine.ts`](../../lib/alarms/detection-engine.ts), [`lib/alarms/queries/nms.ts`](../../lib/alarms/queries/nms.ts)

---

## 1. Belirtiler

| Yer | Görünüm |
|---|---|
| Alarm sayfası | Aynı `deviceName + interface_name` için arka arkaya 2 alarm |
| DB sorgusu | `SELECT createdAt FROM alarm_events WHERE alarmId=... ORDER BY createdAt DESC` → fark < 5ms |
| Örnek | `Elk_Sw_1 if10202` için 4 event, 2 çift halinde 1ms aralıkla |

---

## 2. Kök Neden

NMS port-down detection döngüsü:
```
for (const iface of downInterfaces) {
  const existing = await prisma.alarmEvent.findFirst({...});  // cooldown check
  if (!existing) await prisma.alarmEvent.create({...});
}
```

**Race condition:** Aynı interface için iki tetikleyici (örn. iki ayrı NMS poll cycle veya
tek cycle içinde duplicate kayıt) `findFirst`'ün **DB'ye yazılan ama henüz commit olmayan**
event'i göremediği için ikisi de geçer → iki event oluşur.

Ek olarak eski cooldown check sadece `deviceName`'e bakıyordu;
aynı cihazın farklı interface'leri için event tek bir cooldown'a takılıyor,
ya da aynı interface farklı koşullarda iki farklı event üretiyordu.

---

## 3. Kalıcı Çözüm (Uygulanmış)

`detection-engine.ts` içinde **iki katmanlı koruma**:

### Katman 1 — In-memory dedup (loop içinde)
```ts
const createdPortsThisEval = new Set<string>();

for (const iface of downInterfaces) {
  const portKey = `${iface.nmsDeviceId}:${iface.interfaceIndex}`;
  if (createdPortsThisEval.has(portKey)) continue;     // skip duplicate
  ...
  createdPortsThisEval.add(portKey);
}
```

### Katman 2 — DB cooldown (interface_name dahil)
```ts
const existing = await prisma.alarmEvent.findFirst({
  where: {
    alarmId: portDownAlarm.id,
    deviceName,
    AND: [
      { createdAt: { gte: new Date(Date.now() - cooldownMs) } },
      { rawData: { path: ['interface_name'], equals: iface.interfaceName } },
    ],
  },
});
```

**Anayasa AI-6** uyarınca cooldown anahtarı: `deviceName + interface_name + alarmCode` üçlüsü.

---

## 4. Doğrulama

```sql
-- Son 24 saatteki yinelenen NMS_PORT_DOWN event'leri:
SELECT
  ae.deviceName,
  ae.rawData->>'interface_name' AS iface,
  COUNT(*) AS event_count,
  MIN(ae."createdAt"),
  MAX(ae."createdAt"),
  MAX(ae."createdAt") - MIN(ae."createdAt") AS span
FROM alarm_events ae
JOIN alarms a ON a.id = ae."alarmId"
WHERE a.code = 'NMS_PORT_DOWN'
  AND ae."createdAt" >= NOW() - INTERVAL '24 hours'
GROUP BY ae.deviceName, ae.rawData->>'interface_name'
HAVING COUNT(*) > 1
ORDER BY span ASC;
```

`span < 5 seconds` olan satır olmamalı.

---

## 5. Yeniden Olursa

- [ ] `detection-engine.ts`'de `createdPortsThisEval` Set'i hâlâ duruyor mu?
- [ ] Cooldown check `rawData.path: ['interface_name']` içeriyor mu?
- [ ] Aynı NMS cihazı iki farklı poller (cron + manual trigger) tarafından eş zamanlı poll ediliyor mu?
  - Çözüm: NMS poll'larına `pollerLockKey` ekleyip lock-based serialization.
- [ ] Alarm runner birden çok pod/replica'da mı çalışıyor? Tek replica zorunluluğu var (Anayasa AI-7).

---

## 6. İzleme

`/admin/system-health` sayfasında "Last 24h NMS_PORT_DOWN duplicate count" sayacı eklenmeli.
Eşik: > 0 → uyarı.

---

## 7. İlgili Anayasa Maddeleri

- AI-6: `deviceName + interface_name + alarmCode` cooldown anahtarı
- AI-7: Cron/scheduler işleri idempotent

---

## 8. Değişiklik Geçmişi

| Tarih | Değişiklik |
|---|---|
| 2026-02-17 | İlk sürüm — race condition kök nedeni, two-layer fix dokümante edildi |
