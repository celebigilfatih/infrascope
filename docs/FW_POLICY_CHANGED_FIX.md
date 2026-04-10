# FW_POLICY_CHANGED Alarm - Çözüm Dokümantasyonu

## Problem Tanımı

Firewall'da policy değişikliği yapıldığında Alarm Merkezi'ne `FW_POLICY_CHANGED` alarmı gelmiyordu.

## Kök Nedenler

### 1. CMDB Snapshot Persistence Sorunu
**Problem:** Her alarm check çalıştırıldığında yeni bir `FortiGateService` instance'ı oluşturuluyordu. CMDB snapshot'ları bu service instance'ının hafızasında (`_cmdbSnapshotStore`) tutuluyordu. Yeni run'da eski snapshot kayboluyordu.

**Çözüm:** Module-level singleton pattern uygulandı.

**Dosyalar:**
- `lib/alarms/alarm-runner.ts` - FortiGate singleton oluşturuldu
- `lib/alarms/detection-engine.ts` - `injectFortiGateService()` metodu eklendi

```typescript
// alarm-runner.ts - Module-level singleton
let _sharedFortiGateService: FortiGateService | null = null;
let _sharedFortiGateConfigHash: string | null = null;

async function getOrInitFortiGateService(): Promise<FortiGateService | null> {
  const fgConfig = await prisma.integrationConfig.findFirst({
    where: { type: 'FORTIGATE', enabled: true },
  });
  if (!fgConfig) return null;

  const configHash = JSON.stringify(fgConfig.config);
  if (_sharedFortiGateService && _sharedFortiGateConfigHash === configHash) {
    return _sharedFortiGateService;
  }

  const cfg = fgConfig.config as any;
  _sharedFortiGateService = new FortiGateService({
    host: cfg.host,
    username: cfg.username,  // CRITICAL: Bearer token boş olduğu için cookie auth gerekli
    password: cfg.password,
    accessToken: cfg.accessToken,
    pollingInterval: cfg.pollingInterval || 5,
    syncMode: 'rest',
    enabledModules: {
      interfaces: true, vlans: true, policies: true,
      addresses: true, vips: true, sdwan: true,
    },
  });
  _sharedFortiGateConfigHash = configHash;
  return _sharedFortiGateService;
}
```

### 2. HTTP 401 Authentication Hatası
**Problem:** FortiGateService oluşturulurken `username` ve `password` parametreleri geçirilmemişti. `accessToken` boş olduğu için Bearer auth başarısız oluyordu.

**Çözüm:** Constructor'a username/password eklendi (cookie-based authentication).

### 3. Frozen Snapshots - Multiple Alarms Race Condition
**Problem:** `CORE_CONFIG_CHANGE` ve `FW_POLICY_CHANGED` aynı endpoint'i (`/cmdb/firewall/policy`) polling ediyordu. `CORE_CONFIG_CHANGE` önce çalışıp snapshot'u güncelliyordu, sonra `FW_POLICY_CHANGED` çalıştığında snapshot zaten güncel olduğu için "no change" diyordu.

**Çözüm:** Cycle başlangıcında snapshot'lar "freeze" edildi - tüm alarm'lar aynı baseline'a göre karşılaştırma yapıyor.

```typescript
// fortigate.ts
private _frozenSnapshots = new Map<string, string>();

clearCmdbResponseCache(): void {
  this._cmdbResponseCache.clear();
  // Cycle başlangıcında mevcut snapshot'ları freeze et
  this._frozenSnapshots = new Map(this._cmdbSnapshotStore);
}

async getCmdbChanges(endpoint: string) {
  // Frozen snapshot'tan karşılaştır (live snapshot'tan değil)
  const stored = this._frozenSnapshots.get(endpoint) ?? this._cmdbSnapshotStore.get(endpoint);
  // ...
}
```

**Dosyalar:**
- `lib/integrations/fortigate.ts` - `_frozenSnapshots` ve `clearCmdbResponseCache()` güncellendi
- `lib/alarms/detection-engine.ts` - Duplicate `clearCmdbResponseCache()` çağrısı kaldırıldı

### 4. CMDB Query Timeout (146 saniye)
**Problem:** `/cmdb/firewall/policy` endpoint'inden 429 policy çekmek 146 saniye sürüyordu. Default timeout 25-30 saniye idi.

**Çözüm:** CMDB-based alarm'lar için timeout 180 saniyeye çıkarıldı.

```typescript
// detection-engine.ts
const CMDB_ALARMS = new Set([
  'FW_POLICY_CHANGED', 'CORE_CONFIG_CHANGE', 'INTERFACE_CONFIG_CHANGED',
  'ADDRESS_OBJECT_CHANGED', 'IPSEC_TUNNEL_CHANGED',
]);
const timeoutMs = CMDB_ALARMS.has(alarm.code) ? 180000 : 30000;
```

### 5. Synthetic Event Structure Hatası
**Problem:** CMDB query'nin döndüğü synthetic event yanlış formattaydı:
```javascript
{
  rawLog: { endpoint, description, ... },
  timestamp: Date.now() / 1000
}
```

Detection engine'in `parseLogTime()` fonksiyonu `itime_t` veya `itime` field'larını arıyordu, `timestamp`'i görmüyordu. Bu yüzden time window filtering başarısız oluyordu.

**Çözüm:** Event structure düzeltildi:
```javascript
{
  endpoint,
  description,
  itime_t: Math.floor(Date.now() / 1000),  // parseLogTime bunu görebiliyor
  // ...
}
```

**Dosyalar:**
- `lib/alarms/queries/fortigate-cmdb.ts` - `cmdbDiff()` ve `cmdbCoreConfigChange()` fonksiyonları güncellendi

### 6. Alarm Mesajı Zenginleştirme
**Problem:** Alarm sadece "firewall/policy endpoint'inde değişiklik var" diyordu, hangi policy'nin değiştiğini gösteremiyordu.

**Çözüm:** Detaylı diff hesaplama eklendi:

```typescript
// fortigate-cmdb.ts
function computeArrayDiff(previous: any[], current: any[]) {
  // Her item'ı policyid/name/id ile map'le
  // Eklenenleri bul
  // Silinenleri bul
  // Değiştirilenleri ve hangi field'ların değiştiğini bul
  return { added, removed, modified };
}

function findObjectChanges(oldObj: any, newObj: any) {
  // Tüm field'ları karşılaştır
  // Değişen field'ları { field, oldValue, newValue } formatında döndür
  return changes;
}
```

**Alarm Mesajı Örneği:**
```
Endpoint: /cmdb/firewall/policy
Toplam Obje: 429
Tespit: 2026-04-10T12:49:00.402Z

Degistirilenler (1):
1. #15 (2 degisiklik)
   - status: enable -> disable
   - comments: "" -> "Disabled by admin"

Onerilen Aksiyon: Verify change was authorized...
```

**Dosyalar:**
- `lib/alarms/queries/fortigate-cmdb.ts` - `computeArrayDiff()` ve `findObjectChanges()` eklendi
- `lib/alarms/detection-engine.ts` - CMDB diff alarm mesajı formatı güncellendi

## CMDB Diff Sistemi - Nasıl Çalışır?

### İlk Run (Snapshot Initialization)
```
1. getCmdbChanges('/cmdb/firewall/policy') çağrılır
2. FortiGate'den tüm policy'ler çekilir (429 items)
3. JSON.stringify() ile fingerprint oluşturulur
4. _cmdbSnapshotStore'a kaydedilir
5. isFirstRun: true → alarm fire edilmez
```

### İkinci Run (Change Detection)
```
1. clearCmdbResponseCache() çağrılır (cycle başlangıcı)
   - _cmdbResponseCache temizlenir
   - _frozenSnapshots = snapshot'ların kopyası
2. getCmdbChanges('/cmdb/firewall/policy') çağrılır
3. FortiGate'den güncel policy'ler çekilir
4. Yeni fingerprint ile frozen snapshot karşılaştırılır
5. Farklıysa → changed: true
6. computeArrayDiff() ile detaylı diff hesaplanır:
   - Eklenen policy'ler
   - Silinen policy'ler
   - Değiştirilen policy'ler ve field değişiklikleri
7. Synthetic event oluşturulur (diffDetails dahil)
8. Detection engine alarm'ı fire eder
9. Alarm mesajında detaylı değişiklikler gösterilir
```

### Frozen Snapshots Neden Önemli?
```
Cycle 1:
  - clearCmdbResponseCache() → frozenSnapshots = { policy: "snapshot_A" }
  
  - CORE_CONFIG_CHANGE çalışır:
    getCmdbChanges('/cmdb/firewall/policy')
    → frozen: "snapshot_A" vs current: "snapshot_B" → CHANGED ✓
    → live snapshot'ı "snapshot_B" olarak günceller
  
  - FW_POLICY_CHANGED çalışır:
    getCmdbChanges('/cmdb/firewall/policy')
    → frozen: "snapshot_A" vs current: "snapshot_B" → CHANGED ✓
    (live snapshot "snapshot_B" olsa bile, frozen "snapshot_A" kullanıldığı için değişiklik tespit edilir!)
```

## Test Sonuçları

### Başarılı Alarm Check
```json
{
  "success": true,
  "summary": {
    "total": 97,
    "triggered": 2,
    "skippedCooldown": 2,
    "errors": 1
  },
  "triggered": [
    {
      "code": "FW_POLICY_CHANGED",
      "matchCount": 1
    },
    {
      "code": "CORE_CONFIG_CHANGE",
      "matchCount": 1
    }
  ]
}
```

### Database'de Alarm Kaydı
```sql
code: FW_POLICY_CHANGED
severity: ALARM_CRITICAL
title: Firewall Policy Degisikligi
message: |
  Endpoint: /cmdb/firewall/policy
  Toplam Obje: 429
  Tespit: 2026-04-10T12:49:00.402Z
  
  Degistirilenler (1):
  1. #15 (2 degisiklik)
     - status: enable -> disable
     - comments: "" -> "Disabled by admin"
  
  Onerilen Aksiyon: Verify change was authorized. Check admin identity and source IP.
```

## Önemli Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `lib/alarms/alarm-runner.ts` | FortiGate singleton, injectFortiGateService |
| `lib/alarms/detection-engine.ts` | Frozen snapshots support, CMDB timeout, diff mesajı |
| `lib/integrations/fortigate.ts` | _frozenSnapshots, clearCmdbResponseCache(), getCmdbSnapshot() |
| `lib/alarms/queries/fortigate-cmdb.ts` | computeArrayDiff(), findObjectChanges(), zenginleştirilmiş event |
| `lib/alarms/alarm-definitions.ts` | Cooldown 180→30 dakika |
| `lib/alarms/seed-alarms.ts` | cooldownMinutes update branch eklendi |

## Öğretilen Dersler

1. **CMDB Diff İki Snapshot Gerektirir**: Farklı zamanlarda alınmış iki snapshot olmalı. Server restart sonrası ilk snapshot change'i içeriyorsa, değişiklik asla tespit edilemez.

2. **Singleton Pattern State Persistence İçin Şart**: Her run'da yeni instance oluşturmak state kaybına yol açar.

3. **Frozen Snapshots Race Condition'ı Önler**: Aynı endpoint'i birden fazla alarm polling ediyorsa, hepsi aynı baseline'a göre karşılaştırma yapmalı.

4. **Timeout Değerleri Realistic Olmalı**: 400+ item içeren CMDB endpoint'leri 2+ dakika sürebilir.

5. **Synthetic Event Structure Detection Engine ile Uyumlu Olmalı**: `parseLogTime()`, `itime_t` veya `itime` field'larını bekliyor.

6. **Authentication Credentials Critical**: FortiGate v7.2.11 Bearer token yerine cookie-based auth kullanıyor.
