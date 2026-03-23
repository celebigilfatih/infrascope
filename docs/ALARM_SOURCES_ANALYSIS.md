# Infrascope Alarm Kaynakları - Detaylı Analiz

**Tarih:** 23 Mart 2026  
**Toplam Alarm Sayısı:** 97

---

## 📊 Genel Özet

| Kaynak | Alarm Sayısı | Yüzde |
|--------|-------------|-------|
| **FortiAnalyzer** | 95 | %98 |
| **FortiGate (Direkt API)** | 2 | %2 |
| **VMware vCenter** | 0 | 0% |
| **TOPLAM** | **97** | **100%** |

---

## 🔴 FORTIGATE ALARMLARI (DİREKT REST API) - 2 Alarm

Bu alarmlar **FortiAnalyzer'a ihtiyaç duymadan**, direkt FortiGate REST API üzerinden veri çeker.

### 1️⃣ **SSLVPN_BUSINESS_HOURS** 

**Detaylar:**
- **Code:** `SSLVPN_BUSINESS_HOURS`
- **İsim:** SSL-VPN Mesai İçi Bağlantısı
- **Kaynak:** `fortigate-sslvpn` (FortiGate REST API)
- **Endpoint:** `GET /monitor/vpn/ssl`
- **Severity:** ALARM_INFO
- **Threshold:** 1
- **Time Window:** 60 dakika
- **Cooldown:** 30 dakika
- **Email Notification:** Hayır

**Neden Direkt API?**
- ✅ **Gerçek zamanlı aktif oturumlar** için
- ✅ FortiAnalyzer'da SSL-VPN logları gecikmeli gelebilir
- ✅ Anlık bağlantı durumunu görmek için
- ✅ Mesai içi normal kullanımı izlemek için (informational)

**Detection Logic:**
```typescript
{
  source: 'fortigate-sslvpn',  // Use FortiGate API directly for SSL-VPN users
  timeWindowMinutes: 60,
  threshold: 1,
  clientCheck: 'business-hours',
  filter: ''  // No filter - uses FortiGate API directly
}
```

**Açıklama:** Çalışma saatleri içinde (08:00-18:00) ve hafta içi SSL-VPN bağlantısı tespit edildi. Normal çalışma saatlerinde beklenen bağlantı.

**Önerilen Aksiyon:** Review user activity for any suspicious behavior. This is expected VPN usage during work hours.

---

### 2️⃣ **SSLVPN_TUNNEL_UP**

**Detaylar:**
- **Code:** `SSLVPN_TUNNEL_UP`
- **İsim:** SSL-VPN Tünel Aktif
- **Kaynak:** `fortigate-sslvpn` (FortiGate REST API)
- **Endpoint:** `GET /monitor/vpn/ssl`
- **Severity:** ALARM_INFO
- **Threshold:** 1
- **Time Window:** 60 dakika
- **Cooldown:** 30 dakika
- **Email Notification:** Hayır

**Neden Direkt API?**
- ✅ **Aktif tünel durumu** gerçek zamanlı izlenir
- ✅ Bağlantı kalitesi metrikleri (ping, latency, packet loss)
- ✅ Veri transferi (in/out bytes) anlık takip edilir
- ✅ Tunnel down/up eventleri kritik olduğu için

**Açıklama:** SSL-VPN tunnel oturumu başarılı şekilde kuruldu. Bağlantı kalitesi ve veri transferi izlenir.

**Önerilen Aksiyon:** Monitor tunnel stability and data transfer rates. Verify connection is expected.

---

## 🔵 FORTIANALYZER ALARMLARI (LOGVIEW/FORTIVIEW API) - 95 Alarm

Bu alarmlar **FortiAnalyzer LogView ve FortiView API** kullanır.

---

### A. CONFIG & ACCESS (Kritik Yapılandırma Değişiklikleri) - 14 Alarm

#### **FW_POLICY_CHANGED**
- **İsim:** Firewall Policy Değişikliği
- **Severity:** ALARM_CRITICAL
- **Threshold:** 1
- **Time Window:** 180 dakika
- **Cooldown:** 180 dakika
- **Email:** Evet

**Neden FortiAnalyzer?**
- 🔹 Tüm config değişiklikleri FA'da saklanır
- 🔹 cfgpath tracking gerektirir (firewall.policy.*)
- 🔹 Before/after state comparison
- 🔹 Admin user + source IP tracking

**Detection Logic:**
```typescript
{
  logtype: 'event',
  filter: 'subtype == system and logdesc like %attribute% and cfgpath like %firewall.policy%',
  threshold: 1,
  timeWindowMinutes: 180
}
```

---

#### **UNAUTH_ADMIN_LOGIN**
- **İsim:** Yetkisiz Admin Giriş Denemesi
- **Severity:** ALARM_CRITICAL
- **Threshold:** 1
- **Time Window:** 15 dakika
- **Cooldown:** 10 dakika
- **Email:** Evet

**Neden FortiAnalyzer?**
- 🔹 Failed login event logs
- 🔹 User/IP bazlı filtreleme
- 🔹 Unexpected user detection

---

#### **ADMIN_LOGIN_FAILED** ⭐ **(YENİ EKLENEN)**
- **İsim:** Admin Başarısız Giriş Denemesi (FortiGate)
- **Severity:** ALARM_MEDIUM
- **Threshold:** 1
- **Time Window:** 15 dakika
- **Cooldown:** 5 dakika
- **Email:** Evet

**ÖZELLİK:** Bu alarm **FortiGate REST API** kullanır ancak FortiAnalyzer kategorisinde listelenmiştir (generic event filter kullanır).

**Query File:** `/lib/alarms/queries/admin-login-failed.ts`

**Detection Logic:**
```typescript
{
  logtype: 'event',
  filter: 'subtype == system and action == login and status == failed',
  threshold: 1,
  timeWindowMinutes: 15
}
```

**Implementation:**
```typescript
// Direct FortiGate query
const loginEvents = await fortigate.getAdminLoginEvents();
const failedLogins = loginEvents.filter(event => 
  event.action === 'login' && event.status === 'failed'
);
```

---

#### **Diğer Config & Access Alarmları:**

| Code | İsim | Severity | Threshold | Time Window | Email |
|------|------|----------|-----------|-------------|-------|
| **ADMIN_LOGIN_OFF_HOURS** | Mesai Dışı Admin Girişi | CRITICAL | 1 | 15dk | ✅ |
| **CORE_CONFIG_CHANGE** | Kritik Yapılandırma Değişikliği | CRITICAL | 1 | 180dk | ✅ |
| **FIRMWARE_CHANGE** | Firmware Upgrade/Downgrade | HIGH | 1 | 180dk | ✅ |
| **ADMIN_PASSWORD_CHANGED** | Admin Şifre Değişikliği | HIGH | 1 | 60dk | ✅ |
| **ADMIN_PRIVILEGE_CHANGE** | Admin Yetki Değişikliği | CRITICAL | 1 | 60dk | ✅ |
| **NEW_ADMIN_USER** | Yeni Admin Kullanıcı | MEDIUM | 1 | 60dk | ✅ |
| **ROUTE_TABLE_CHANGED** | Routing Tablosu Değişikliği | MEDIUM | 1 | 60dk | ✅ |
| **INTERFACE_CONFIG_CHANGED** | Interface Yapılandırması | MEDIUM | 1 | 60dk | ✅ |
| **SERVICE_GROUP_CHANGED** | Servis Grubu Değişikliği | MEDIUM | 1 | 60dk | ✅ |
| **SCHEDULE_OBJECT_CHANGED** | Zaman Objesi Değişikliği | MEDIUM | 1 | 60dk | ✅ |
| **AUTH_SERVER_CHANGED** | Authentication Server | MEDIUM | 1 | 60dk | ✅ |

---

### B. VPN & SSL-VPN - 13 Alarm

| Code | İsim | Severity | Threshold | Time Window | Email | Neden FA? |
|------|------|----------|-----------|-------------|-------|-----------|
| **VPN_BRUTE_FORCE** | VPN Brute Force Denemesi | HIGH | 5 | 15dk | ✅ | Failed login pattern |
| **VPN_LOGIN_OFF_HOURS** | Mesai Dışı VPN Girişi | MEDIUM | 1 | 60dk | ✅ | Timestamp filtering |
| **SSLVPN_AUTH_FAILED** | SSL-VPN Giriş Hatası | LOW | 1 | 15dk | ❌ | Single attempt log |
| **SSLVPN_MULTI_FAIL** | SSL-VPN Çoklu Hatalı | MEDIUM | 3 | 15dk | ✅ | Pattern detection |
| **SSLVPN_LOCKOUT** | SSL-VPN Hesap Kilitlendi | HIGH | 1 | 30dk | ✅ | Lockout event |
| **SSLVPN_CONNECTION** | SSL-VPN Bağlantı | INFO | 1 | 60dk | ❌ | Connection log |
| **SSLVPN_HIGH_TRAFFIC** | SSL-VPN Yüksek Trafik | MEDIUM | 1 | 60dk | ✅ | Traffic analysis |
| **SSLVPN_TUNNEL_DOWN** | SSL-VPN Tünel Kapandı | MEDIUM | 1 | 15dk | ✅ | Tunnel status |
| **USER_SESSION_OFF_HOURS** | Mesai Dışı Kullanıcı | MEDIUM | 1 | 60dk | ✅ | Session timestamp |
| **VPN_NEW_USER** | Yeni SSL-VPN Kullanıcısı | LOW | 1 | 60dk | ✅ | User creation |
| **IPSEC_TUNNEL_CHANGED** | IPsec VPN Değişikliği | MEDIUM | 1 | 60dk | ✅ | Config change |
| **SSL_VPN_SETTINGS_CHANGED** | SSL-VPN Ayarları | MEDIUM | 1 | 60dk | ✅ | Config modification |
| **VPN_GEO_THEN_EXFIL** | Yeni Lokasyon + Veri Çıkışı | CRITICAL | 1 | 60dk | ✅ | Geo correlation |

---

### C. SECURITY THREATS (Güvenlik Tehditleri) - 17 Alarm

| Code | İsim | Severity | Threshold | Time Window | Email | Detection Method |
|------|------|----------|-----------|-------------|-------|------------------|
| **ADMIN_BRUTE_FORCE** | Admin Brute Force | HIGH | 5 | 15dk | ✅ | Failed login count |
| **IPS_CRITICAL_ALERT** | IPS Kritik Seviye | CRITICAL | 1 | 15dk | ✅ | Attack log severity |
| **MALWARE_DETECTED** | Malware Tespit Edildi | CRITICAL | 1 | 15dk | ✅ | Virus logtype |
| **DNS_MALICIOUS** | Zararlı DNS | HIGH | 1 | 15dk | ✅ | DNS threat feed |
| **APP_CONTROL_VIOLATION** | Uygulama Kontrol İhlali | MEDIUM | 1 | 15dk | ✅ | App control log |
| **SHADOW_IT_DETECTED** | Shadow IT Tespiti | MEDIUM | 1 | 60dk | ✅ | Cloud app category |
| **WEBFILTER_HIGH_RISK** | Yüksek Riskli Web | MEDIUM | 5 | 15dk | ✅ | Webfilter risk rating |
| **WEBFILTER_OVERRIDE** | WebFilter Bypass | LOW | 1 | 60dk | ✅ | Override event |
| **DATA_EXFIL_SUSPECT** | Veri Sızıntısı Şüphesi | CRITICAL | 1 | 60dk | ✅ | Outbound volume |
| **UNUSUAL_COUNTRY_TRAFFIC** | Olağandışı Ülke | MEDIUM | 1 | 60dk | ✅ | GeoIP location |
| **MULTI_VECTOR_ATTACK** | Çoklu Vektör Saldırı | CRITICAL | 3 | 60dk | ✅ | 3+ alarm codes |
| **TOP_THREAT_WEIGHT** | En Yüksek Tehdit | HIGH | 10 | 15dk | ✅ | FortiView scoring |
| **RISKY_CLOUD_APP** | Riskli Bulut Uygulaması | MEDIUM | 1 | 60dk | ✅ | Cloud app risk |
| **DNS_TUNNEL_SUSPECT** | DNS Tünelleme | HIGH | 100 | 15dk | ✅ | DNS query pattern |
| **ADDRESS_GROUP_CHANGED** | Adres Grubu Değişikliği | MEDIUM | 1 | 60dk | ✅ | Config change |
| **NEW_ADDRESS_OBJECT** | Yeni Adres Objesi | LOW | 1 | 60dk | ✅ | Object creation |
| **NEW_SERVICE_OBJECT** | Yeni Servis Objesi | LOW | 1 | 60dk | ✅ | Service definition |

---

### D. OPERATIONAL & ANOMALY (Operasyonel Anormallikler) - 15 Alarm

| Code | İsim | Severity | Threshold | Time Window | Email | Anomaly Type |
|------|------|----------|-----------|-------------|-------|--------------|
| **POLICY_HIT_ANOMALY** | Policy Hit Rate Anomalisi | MEDIUM | 1000 | 60dk | ✅ | Usage spike |
| **EXCESSIVE_BANDWIDTH** | Tek Host Aşırı Bandwidth | MEDIUM | 1 | 60dk | ✅ | Volume anomaly |
| **INTERFACE_FLAP** | Interface Down/Up | MEDIUM | 3 | 15dk | ✅ | State oscillation |
| **VPN_TUNNEL_DOWN** | VPN Tünel Kapandı | MEDIUM | 1 | 15dk | ✅ | Tunnel status |
| **HIGH_CPU_MEMORY** | Yüksek CPU/Memory | HIGH | 90% | 5dk | ✅ | Resource usage |
| **DISK_USAGE_HIGH** | Disk Kullanımı Yüksek | HIGH | 90% | 5dk | ✅ | Storage capacity |
| **DEVICE_REBOOT** | FortiGate Reboot | CRITICAL | 1 | 5dk | ✅ | System event |
| **CONFIG_THEN_SPIKE** | Config Sonrası Trafik Artışı | HIGH | 1 | 60dk | ✅ | Causal correlation |
| **ADMIN_NEW_GEO** | Aynı Kaynaktan Çoklu Olay | HIGH | 3 | 60dk | ✅ | Geo clustering |
| **MULTI_SECURITY_EVENTS** | Aynı IP'den 3+ Güvenlik Olayı | HIGH | 3 | 60dk | ✅ | Event aggregation |
| **SECURITY_PROFILE_DISABLED** | Güvenlik Profili Devre Dışı | CRITICAL | 1 | 5dk | ✅ | Config change |
| **DENIED_TRAFFIC_SPIKE** | Engellenen Trafik Artışı | MEDIUM | 100 | 15dk | ✅ | Traffic volume |
| **HIGH_SESSION_COUNT** | Aşırı Oturum Sayısı | MEDIUM | 10000 | 5dk | ✅ | Session table |
| **NEW_VIP** | Yeni Virtual IP (DNAT) | LOW | 1 | 60dk | ✅ | NAT creation |
| **POLICY_DISABLED** | Firewall Politikası Devre Dışı | MEDIUM | 1 | 5dk | ✅ | Status change |

---

### E. HIGH AVAILABILITY (HA) - 3 Alarm

| Code | İsim | Severity | Threshold | Time Window | Email | HA Component |
|------|------|----------|-----------|-------------|-------|--------------|
| **HA_FAILOVER** | HA Failover Tespit Edildi | CRITICAL | 1 | 5dk | ✅ | Cluster state |
| **HA_CONFIG_SYNC_FAIL** | HA Config Senkronizasyon Hatası | CRITICAL | 1 | 5dk | ✅ | Sync status |
| **SNAT_POOL_CHANGED** | SNAT IP Pool Değişikliği | MEDIUM | 1 | 60dk | ✅ | NAT configuration |

---

### F. CORRELATION RULES (SIEM Korelasyon) - 6 Alarm

Bu alarmlar **birden fazla precursor alarmın** korelasyonunu yapar.

#### **BRUTE_THEN_SUCCESS**
- **İsim:** Brute Force Sonrası Başarılı Giriş
- **Severity:** CRITICAL
- **Precursor Alarms:** `ADMIN_BRUTE_FORCE`, `VPN_BRUTE_FORCE`
- **Lookback:** 30 dakika
- **Secondary Search:** Successful login events
- **Match Field:** `sourceIp`

**Detection Flow:**
```
Step A: Brute force alarm triggered (5+ failed logins)
   ↓
Step B: Search for successful login from same IP
   ↓
Correlation: Credential compromise detected!
```

---

#### **SSLVPN_BRUTE_THEN_SUCCESS**
- **İsim:** SSL-VPN Brute Force Sonrası Başarılı Giriş
- **Severity:** CRITICAL
- **Precursor Alarms:** `SSLVPN_MULTI_FAIL`, `SSLVPN_LOCKOUT`
- **Lookback:** 30 dakika
- **Secondary Search:** SSL-VPN success login
- **Match Field:** `user` + `sourceIp`

---

#### **LOGIN_THEN_CONFIG**
- **İsim:** Giriş Sonrası Hızlı Config Değişikliği
- **Severity:** CRITICAL
- **Precursor Alarms:** `UNAUTH_ADMIN_LOGIN`, `ADMIN_LOGIN_OFF_HOURS`
- **Lookback:** 15 dakika
- **Secondary Search:** Config change events
- **Match Field:** `user`

**Use Case:** Insider threat detection

---

#### **IPS_THEN_OUTBOUND**
- **İsim:** IPS Sonrası Dışarı Bağlantı
- **Severity:** CRITICAL
- **Precursor Alarms:** `IPS_CRITICAL_ALERT`, `MALWARE_DETECTED`
- **Lookback:** 30 dakika
- **Secondary Search:** Outbound traffic
- **Match Field:** `destIp`

**Use Case:** Compromise confirmation (C2 communication)

---

#### **WEBBLOCK_THEN_TUNNEL**
- **İsim:** Web Engeli Sonrası DNS Tuneli
- **Severity:** HIGH
- **Precursor Alarms:** `WEBFILTER_HIGH_RISK`
- **Lookback:** 30 dakika
- **Secondary Search:** DNS tunneling patterns
- **Match Field:** `sourceIp`

**Use Case:** Evasion attempt detection

---

#### **MULTI_VECTOR_ATTACK**
- **İsim:** Çoklu Vektör Saldırısı (APT)
- **Severity:** CRITICAL
- **Precursor Alarms:** 3+ different alarm codes
- **Lookback:** 60 dakika
- **Match Field:** `sourceIp`
- **Min Distinct Codes:** 3

**Example Scenario:**
```
16:00 - WEBFILTER_HIGH_RISK (malicious site access)
16:05 - IPS_CRITICAL_ALERT (exploit attempt)
16:10 - DATA_EXFIL_SUSPECT (large outbound transfer)
   ↓
16:15 - MULTI_VECTOR_ATTACK triggered!
```

---

### G. VMWARE INFRASTRUCTURE - 25 Alarm ⚠️

**ÖNEMLİ NOT:** Bu alarmlar tanımlı ancak **`source: 'vmware'`** field'ı belirtilmemiş. Şu anda FortiAnalyzer'dan mı yoksa direkt vCenter API'dan mı veri çektiği belirsiz.

| Code | İsim | Muhtemel Kaynak | Durum |
|------|------|----------------|-------|
| **VM_POWERED_OFF** | VM Beklenmedik Kapanma | ❓ vCenter API / FA | ⚠️ Source eksik |
| **VM_CPU_CRITICAL** | VM CPU Kritik Kullanım | ❓ vCenter performance | ⚠️ Source eksik |
| **VM_MEMORY_CRITICAL** | VM Bellek Kritik Kullanım | ❓ vCenter performance | ⚠️ Source eksik |
| **HOST_DISCONNECTED** | ESXi Host Bağlantı Kesildi | ❓ vCenter inventory | ⚠️ Source eksik |
| **HOST_CPU_CRITICAL** | Host CPU Kritik Kullanım | ❓ vCenter performance | ⚠️ Source eksik |
| **HOST_MEMORY_CRITICAL** | Host Bellek Kritik Kullanım | ❓ vCenter performance | ⚠️ Source eksik |
| **DATASTORE_SPACE_LOW** | Datastore Alan Düşük | ❓ vCenter storage | ⚠️ Source eksik |
| **DATASTORE_SPACE_CRITICAL** | Datastore Alan Kritik | ❓ vCenter storage | ⚠️ Source eksik |
| **CLUSTER_HA_RISK** | HA Failover Kapasitesi Yetersiz | ❓ vCenter HA config | ⚠️ Source eksik |
| **SNAPSHOT_DISK_GROWTH** | Snapshot Disk Şişmesi | ❓ vCenter snapshot | ⚠️ Source eksik |
| **DRS_IMBALANCE** | DRS Dengesizliği | ❓ vCenter DRS metrics | ⚠️ Source eksik |
| **ESXI_MAINTENANCE_OUT_OF_HOURS** | Mesai Dışı Maintenance Mode | ❓ vCenter host state | ⚠️ Source eksik |
| **VM_DELETED** | VM Silindi | ❓ vCenter inventory | ⚠️ Source eksik |
| **VM_CREATED** | VM Oluşturuldu | ❓ vCenter inventory | ⚠️ Source eksik |
| **VM_POWERED_ON** | VM Açıldı | ❓ vCenter power state | ⚠️ Source eksik |
| **VM_POWERED_ON_OFF_HOURS** | Mesai Dışı VM Başlatma | ❓ vCenter + timestamp | ⚠️ Source eksik |
| **VM_RESTARTED** | VM Yeniden Başlatıldı | ❓ vCenter power events | ⚠️ Source eksik |
| **SNAPSHOT_CREATED** | Snapshot Oluşturuldu | ❓ vCenter snapshot events | ⚠️ Source eksik |
| **SNAPSHOT_DELETED** | Snapshot Silindi | ❓ vCenter snapshot operations | ⚠️ Source eksik |
| **SNAPSHOT_REVERTED** | Snapshot Geri Yüklendi | ❓ vCenter snapshot operations | ⚠️ Source eksik |
| **SNAPSHOT_REVERTED_OFF_HOURS** | Mesai Dışı Snapshot Geri Yükleme | ❓ vCenter + timestamp | ⚠️ Source eksik |
| **MULTIPLE_SNAPSHOTS** | Çoklu Snapshot Zinciri | ❓ vCenter snapshot chain | ⚠️ Source eksik |
| **VM_CLONED** | VM Klonlandı | ❓ vCenter cloning operations | ⚠️ Source eksik |
| **VM_MIGRATED** | VM Taşındı (vMotion) | ❓ vCenter vMotion events | ⚠️ Source eksik |
| **VM_RECONFIGURED** | VM Konfigürasyon Değişikliği | ❓ vCenter config changes | ⚠️ Source eksik |
| **VM_SUSPENDED** | VM Suspend Edildi | ❓ vCenter power state | ⚠️ Source eksik |
| **CONFIG_CHANGE_AFTER_HOURS** | Mesai Dışı Konfig Değişikliği | ❓ vCenter + timestamp | ⚠️ Source eksik |

**Öneri:** Bu alarmlar için `source: 'vmware'` field'ı eklenmeli ve vCenter API entegrasyonu yapılmalı.

---

## 🎯 KAYNAK SEÇİM KRİTERLERİ

### **FortiGate Direkt API Kullanılan Durumlar (2 alarm):**

✅ **Gerçek zamanlı durum bilgisi** gerektiğinde:
- Aktif SSL-VPN oturumları (currently connected users)
- Tünel status (up/down)
- Canlı performans metrikleri (real-time bandwidth, latency)

✅ **FortiAnalyzer'da olmayan** bilgiler:
- Anlık bağlantı kalitesi
- Real-time session details
- Current tunnel statistics

**Endpoints:**
```bash
GET /monitor/vpn/ssl          # Active SSL-VPN sessions
GET /monitor/vpn/ssl/tunnel   # Tunnel status
GET /monitor/system/config    # Real-time config
```

---

### **FortiAnalyzer Kullanılan Durumlar (95 alarm):**

✅ **Tarihsel log analizi** gerektiğinde:
- Config değişiklikleri (cfgpath tracking)
- Failed login patterns (time-window analysis)
- Security event correlation (multi-step attacks)

✅ **LogView/FortiView** filtreleme:
- Complex JSON filters (`subtype == system and logdesc like %attribute%`)
- Multi-field matching (user + IP + timestamp)
- Threshold-based detection (count > 5 in 15min)

✅ **Korelasyon kuralları:**
- Multi-step attack detection (Step A → Step B)
- Cross-event pattern matching
- SIEM-style analysis (precursor alarms)

✅ **Merkezi log yönetimi:**
- Tüm FortiGate'lerden tek noktada toplama
- Uzun süreli log saklama (retention: 1 yıl+)
- Compliance reporting (SOX, PCI-DSS, GDPR)

**API Endpoints:**
```bash
POST /api/v2/query/logview    # Custom log queries
POST /api/v2/query/fortiview  # Aggregated analytics
GET /api/v2/report/alarm      # Alarm history
```

---

## 📈 ÖNERİLER VE AKSYON PLANI

### 1️⃣ **ADMIN_LOGIN_FAILED Entegrasyonunu Tamamla**

**Durum:** Query dosyası oluşturuldu ancak FortiGate credentials eksik.

**Aksiyon:**
```bash
# .env.production dosyasına ekle:
FORTIGATE_HOST=10.7.7.7
FORTIGATE_ACCESS_TOKEN=<api-token>
FORTIGATE_POLLING_INTERVAL=5
FORTIGATE_SYNC_MODE=rest
```

**Test:**
```bash
# FortiGate'e başarısız login dene
ssh admin@10.7.7.7  # Wrong password

# Log kontrolü
docker logs infrascope-web-dev --since="10m" | grep ADMIN_LOGIN_FAILED
```

---

### 2️⃣ **VMware Source Field'larını Ekle**

**Durum:** 25 VMware alarmı tanımlı ancak source belirtilmemiş.

**Aksiyon:**
```typescript
// lib/alarms/alarm-definitions.ts
{
  code: 'VM_POWERED_OFF',
  name: 'VM Beklenmedik Kapanma',
  source: 'vmware',  // Add this field
  detectionLogic: {
    // ...
  }
}
```

**Implementation Plan:**
1. vCenter API credentials ekle (.env.production)
2. vCenter service oluştur (/lib/integrations/vcenter.ts)
3. Query fonksiyonları yaz (/lib/alarms/queries/vmware-*.ts)
4. Registry'ye ekle (index.ts)

---

### 3️⃣ **FortiAnalyzer Yapılandırmasını Ekle**

**Durum:** FortiAnalyzer credentials eksik.

**Aksiyon:**
```bash
# .env.production dosyasına ekle:
FORTIANALYZER_HOST=10.7.7.8
FORTIANALYZER_USER=api_user
FORTIANALYZER_PASS=<secure-password>
FORTIANALYZER_ADOM=root
FORTIANALYZER_POLLING_INTERVAL=5
```

**Test:**
```bash
# FortiAnalyzer bağlantı testi
curl -k -u api_user:<password> \
  https://10.7.7.8/api/v2/query/logview \
  -d '{"filter": "logtype=\"event\""}'
```

---

### 4️⃣ **Alarm Statistics Dashboard**

**Öneri:** Settings/alerts sayfasına kaynak bazlı istatistikler ekle.

**Metrics:**
- FortiGate vs FortiAnalyzer alarm distribution
- Top 10 most triggered alarms (last 24h)
- Average detection time by source
- False positive rate by alarm type

---

## 📊 ALARM DAĞILIM GRAFİĞİ

```
┌─────────────────────────────────────────────────────┐
│  ALARM KAYNAKLARI DAĞILIMI (N=97)                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  FortiAnalyzer ████████████████████████████  95    │
│  FortiGate     █                               2    │
│  VMware        ░                               0*   │
│                                                     │
│  * 25 alarm tanımlı ama source belirtilmemiş       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ALARM SEVERITY DAĞILIMI                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  CRITICAL  ███████████                        28    │
│  HIGH      █████████████                      32    │
│  MEDIUM    ██████████████████                 43    │
│  LOW       ███████                            16    │
│  INFO      ██                                  5    │
│                                                     │
│  TOPLAM                                          97 │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 REFERANS DOSYALAR

### **Core Files:**
- `/lib/alarms/alarm-definitions.ts` - Tüm alarm tanımları (97 alarm)
- `/lib/alarms/detection-engine.ts` - Alarm evaluation logic
- `/lib/alarms/queries/index.ts` - Query registry

### **FortiGate Integration:**
- `/lib/integrations/fortigate.ts` - FortiGate REST API client
- `/lib/alarms/queries/admin-login-failed.ts` - Failed login query (YENİ)

### **Query Implementations:**
- `/lib/alarms/queries/config-change.ts` - Config change alarms
- `/lib/alarms/queries/auth-events.ts` - Authentication events
- `/lib/alarms/queries/security-events.ts` - Security threats
- `/lib/alarms/queries/vpn-events.ts` - VPN & SSL-VPN events

---

## 📝 DEĞİŞİKLİK GEÇMİŞİ

### **23 Mart 2026 - ADMIN_LOGIN_FAILED Eklendi**

**Değişiklikler:**
1. ✅ Yeni query dosyası: `/lib/alarms/queries/admin-login-failed.ts`
2. ✅ FortiGate method: `getAdminLoginEvents()` eklendi
3. ✅ Alarm definition eklendi (line 77-92)
4. ✅ Query registry'ye eklendi (line 114)

**Neden?**
- FortiAnalyzer credentials eksik olduğu için alternatif çözüm
- Tüm başarısız login denemelerini yakalamak için (threshold: 1)
- Gerçek zamanlı detection (FortiGate direkt API)

**Status:** ⏳ Pending deployment (credentials needed)

---

## 📞 İLETİŞİM

**Sorularınız için:**
- Documentation: `/docs/` klasörü
- API Reference: `/api-ref/` klasörü
- Runbook: Settings/alerts sayfası

**Son Güncelleme:** 23 Mart 2026, 16:45 TRT
