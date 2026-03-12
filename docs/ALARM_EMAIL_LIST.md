# Alarm E-posta Bildirim Listesi

> Son güncelleme: Mart 2026  
> Toplam: 96 alarm tanımı — **85 aktif mail**, 10 sessiz, 1 devre dışı

---

## Mail Gelen Alarmlar (85 Aktif)

### 🔴 CONFIG_ACCESS — Yapılandırma Erişimi

| Kod | Alarm Adı | Seviye | Cooldown |
|-----|-----------|--------|----------|
| `CORE_CONFIG_CHANGE` | Kritik Yapılandırma Değişikliği | CRITICAL | 135 dk |
| `NEW_ADMIN_USER` | Yeni Admin Kullanıcı Oluşturuldu | CRITICAL | 45 dk |
| `ADMIN_LOGIN_OFF_HOURS` | Mesai Dışı Admin Girişi | CRITICAL | 30 dk |
| `UNAUTH_ADMIN_LOGIN` | Yetkisiz Admin Giriş Denemesi | CRITICAL | 30 dk |
| `FIRMWARE_CHANGE` | Firmware Upgrade/Downgrade | CRITICAL | 75 dk |
| `NEW_VIP` | Yeni Virtual IP (DNAT) Oluşturuldu | CRITICAL | 45 dk |
| `FW_POLICY_CHANGED` | Firewall Policy Değişikliği | CRITICAL | 135 dk |
| `IPSEC_TUNNEL_CHANGED` | IPsec VPN Yapılandırma Değişikliği | HIGH | 45 dk |
| `ADMIN_PASSWORD_CHANGED` | Admin Şifre Değişikliği | HIGH | 45 dk |
| `ADMIN_PRIVILEGE_CHANGE` | Admin Yetki Değişikliği | HIGH | 75 dk |
| `SERVICE_GROUP_CHANGED` | Servis Grubu Değişikliği | HIGH | 45 dk |
| `ROUTE_TABLE_CHANGED` | Routing Tablosu Değişikliği | HIGH | 75 dk |
| `AUTH_SERVER_CHANGED` | Authentication Server Değişikliği | HIGH | 45 dk |
| `NAT_POLICY_CHANGED` | NAT Politika Değişikliği | HIGH | 45 dk |
| `SSL_VPN_SETTINGS_CHANGED` | SSL-VPN Ayarları Değişikliği | HIGH | 45 dk |
| `ADDRESS_OBJECT_CHANGED` | Firewall Adres Nesnesi Değiştirildi | HIGH | 75 dk |
| `CONFIG_CHANGE_AFTER_HOURS` | Mesai Dışı Konfig Değişikliği | MEDIUM | 30 dk |
| `INTERFACE_CONFIG_CHANGED` | Interface Yapılandırma Değişikliği | MEDIUM | 45 dk |
| `ADDRESS_GROUP_CHANGED` | Adres Grubu Değişikliği | MEDIUM | 75 dk |

### 🔴 SECURITY — Güvenlik

| Kod | Alarm Adı | Seviye | Cooldown |
|-----|-----------|--------|----------|
| `VM_DELETED` | VM Silindi | CRITICAL | 75 dk |
| `ESXI_MAINTENANCE_OUT_OF_HOURS` | Mesai Dışı Maintenance Mode | CRITICAL | 30 dk |
| `SNAPSHOT_REVERTED_OFF_HOURS` | Mesai Dışı Snapshot Geri Yükleme | CRITICAL | 15 dk |
| `SSLVPN_LOCKOUT` | SSL-VPN Hesap Kilitlendi | HIGH | 45 dk |
| `DNS_TUNNEL_SUSPECT` | DNS Tünelleme Şüphesi | HIGH | 30 dk |
| `VM_POWERED_ON_OFF_HOURS` | Mesai Dışı VM Başlatma | HIGH | 30 dk |
| `IPS_CRITICAL_ALERT` | IPS Kritik Seviye Alarm | HIGH | 25 dk |
| `DNS_MALICIOUS` | Zararlı DNS İsteği Engellendi | HIGH | 25 dk |
| `ADMIN_BRUTE_FORCE` | Admin Brute Force Denemesi | HIGH | 30 dk |
| `VPN_BRUTE_FORCE` | VPN Brute Force Denemesi | HIGH | 30 dk |
| `VPN_LOGIN_OFF_HOURS` | Mesai Dışı SSL-VPN Bağlantısı | HIGH | 75 dk |
| `SSLVPN_MULTI_FAIL` | SSL-VPN Çoklu Hatalı Giriş | HIGH | 15 dk |
| `WEBFILTER_OVERRIDE` | WebFilter Bypass/Override | HIGH | 30 dk |
| `MALWARE_DETECTED` | Malware Tespit Edildi | HIGH | 25 dk |
| `WEBFILTER_HIGH_RISK` | Yüksek Riskli Web Erişim | HIGH | 30 dk |
| `SSLVPN_AUTH_FAILED` | SSL-VPN Giriş Hatası | MEDIUM | 30 dk |
| `USER_SESSION_OFF_HOURS` | Mesai Dışı Kullanıcı Oturumu | MEDIUM | 75 dk |
| `VPN_NEW_USER` | Yeni SSL-VPN Kullanıcısı | MEDIUM | 60 dk |
| `SSLVPN_CONNECTION` | SSL-VPN Bağlantı Tespit Edildi | INFO | 25 dk |

### 🔴 SOC_CORRELATION — Korelasyon

| Kod | Alarm Adı | Seviye | Cooldown |
|-----|-----------|--------|----------|
| `MULTI_VECTOR_ATTACK` | Çoklu Vektör Saldırısı (APT) | CRITICAL | 75 dk |
| `SECURITY_PROFILE_DISABLED` | Güvenlik Profili Devre Dışı | CRITICAL | 25 dk |
| `WEBBLOCK_THEN_TUNNEL` | Web Engeli Sonrası DNS Tüneli | CRITICAL | 45 dk |
| `BRUTE_THEN_SUCCESS` | Brute Force Sonrası Başarılı Giriş | CRITICAL | 45 dk |
| `LOGIN_THEN_CONFIG` | Giriş Sonrası Hızlı Config Değişikliği | CRITICAL | 30 dk |
| `SSLVPN_BRUTE_THEN_SUCCESS` | SSL-VPN Brute Force Sonrası Başarılı Giriş | CRITICAL | 45 dk |
| `VPN_GEO_THEN_EXFIL` | Yeni Lokasyondan VPN + Veri Çıkışı | CRITICAL | 75 dk |
| `IPS_THEN_OUTBOUND` | IPS Sonrası Dışarı Bağlantı | CRITICAL | 45 dk |
| `TOP_THREAT_WEIGHT` | En Yüksek Tehdit Skoru | HIGH | 45 dk |
| `CONFIG_THEN_SPIKE` | Config Değişikliği Sonrası Trafik Artışı | HIGH | 30 dk |
| `MULTI_SECURITY_EVENTS` | Aynı Kaynaktan Çoklu Güvenlik Olayları | HIGH | 30 dk |
| `ADMIN_NEW_GEO` | Yeni Ülke/IP'den Admin Girişi | HIGH | 60 dk |
| `SHADOW_IT_DETECTED` | Shadow IT Tespiti | MEDIUM | 60 dk |
| `RISKY_CLOUD_APP` | Riskli Bulut Uygulaması | MEDIUM | 60 dk |

### 🟡 OPERATIONAL — Operasyonel

| Kod | Alarm Adı | Seviye | Cooldown |
|-----|-----------|--------|----------|
| `SNAPSHOT_DISK_GROWTH` | Snapshot Disk Şişmesi | CRITICAL | 240 dk |
| `HOST_DISCONNECTED` | ESXi Host Bağlantı Kesildi | CRITICAL | 20 dk |
| `DATASTORE_SPACE_CRITICAL` | Datastore Alan Kritik | CRITICAL | 30 dk |
| `CLUSTER_HA_RISK` | HA Failover Kapasitesi Yetersiz | CRITICAL | 120 dk |
| `HA_CONFIG_SYNC_FAIL` | HA Config Senkronizasyon Hatası | HIGH | 30 dk |
| `VM_POWERED_OFF` | VM Beklenmedik Kapanma | HIGH | 30 dk |
| `DATASTORE_SPACE_LOW` | Datastore Alan Düşük | HIGH | 60 dk |
| `HA_FAILOVER` | HA Failover Tespit Edildi | HIGH | 30 dk |
| `HOST_CPU_CRITICAL` | Host CPU Kritik Kullanım | HIGH | 30 dk |
| `HOST_MEMORY_CRITICAL` | Host Bellek Kritik Kullanım | HIGH | 30 dk |
| `VM_CPU_CRITICAL` | VM CPU Kritik Kullanım | MEDIUM | 30 dk |
| `VM_MEMORY_CRITICAL` | VM Bellek Kritik Kullanım | MEDIUM | 30 dk |
| `SNAPSHOT_REVERTED` | Snapshot Geri Yüklendi | MEDIUM | 15 dk |
| `DEVICE_REBOOT` | FortiGate Reboot Tespit Edildi | LOW | 60 dk |
| `DISK_USAGE_HIGH` | Disk Kullanımı Yüksek | LOW | 75 dk |
| `VPN_TUNNEL_DOWN` | VPN Tunnel Down | LOW | 15 dk |
| `INTERFACE_FLAP` | Interface Down/Up | LOW | 15 dk |
| `HIGH_CPU_MEMORY` | Yüksek CPU/Memory Kullanımı | LOW | 30 dk |
| `SNAPSHOT_CREATED` | Snapshot Oluşturuldu | INFO | 75 dk |
| `SNAPSHOT_DELETED` | Snapshot Silindi | INFO | 75 dk |
| `VM_CREATED` | VM Oluşturuldu | INFO | 75 dk |

### 🟡 RISK_ANOMALY — Risk / Anomali

| Kod | Alarm Adı | Seviye | Cooldown |
|-----|-----------|--------|----------|
| `DATA_EXFIL_SUSPECT` | Veri Sızıntısı Şüphesi | HIGH | 45 dk |
| `HIGH_SESSION_COUNT` | Aşırı Oturum Sayısı | MEDIUM | 30 dk |
| `NEW_ADDRESS_OBJECT` | Yeni Firewall Adres Nesnesi | MEDIUM | 75 dk |
| `POLICY_HIT_ANOMALY` | Policy Hit Rate Anomalisi | MEDIUM | 30 dk |
| `EXCESSIVE_BANDWIDTH` | Tek Host Aşırı Bant Genişliği | MEDIUM | 30 dk |
| `POLICY_DISABLED` | Firewall Politikası Devre Dışı | MEDIUM | 45 dk |
| `SSLVPN_HIGH_TRAFFIC` | SSL-VPN Yüksek Trafik | MEDIUM | 60 dk |
| `SNAT_POOL_CHANGED` | SNAT IP Pool Değişikliği | MEDIUM | 45 dk |
| `APP_CONTROL_VIOLATION` | Uygulama Kontrol İhlali | MEDIUM | 30 dk |
| `NEW_SERVICE_OBJECT` | Yeni Firewall Servis Nesnesi | MEDIUM | 75 dk |
| `SCHEDULE_OBJECT_CHANGED` | Zaman Objesi Değişikliği | MEDIUM | 45 dk |
| `DENIED_TRAFFIC_SPIKE` | Engellenen Trafik Artışı | MEDIUM | 30 dk |

---

## ❌ Mail Gelmeyen Alarmlar (10 Alarm)

Bu alarmlar aktif olarak tetikleniyor ancak e-posta bildirimi **gönderilmiyor** (`notifyEmail = false`).

| Kod | Alarm Adı | Kategori | Seviye |
|-----|-----------|----------|--------|
| `VM_RECONFIGURED` | VM Konfigürasyon Değişikliği | CONFIG_ACCESS | MEDIUM |
| `DRS_IMBALANCE` | DRS Dengesizliği | OPERATIONAL | MEDIUM |
| `MULTIPLE_SNAPSHOTS` | Çoklu Snapshot Zinciri | OPERATIONAL | MEDIUM |
| `VM_SUSPENDED` | VM Suspend Edildi | OPERATIONAL | LOW |
| `VM_RESTARTED` | VM Yeniden Başlatıldı | OPERATIONAL | LOW |
| `SSLVPN_TUNNEL_DOWN` | SSL-VPN Tünel Kapandı | OPERATIONAL | LOW |
| `VM_CLONED` | VM Klonlandı | OPERATIONAL | INFO |
| `VM_POWERED_ON` | VM Açıldı | OPERATIONAL | INFO |
| `VM_MIGRATED` | VM Taşındı (vMotion/Storage vMotion) | OPERATIONAL | INFO |
| `SSLVPN_TUNNEL_UP` | SSL-VPN Tünel Aktif | OPERATIONAL | INFO |

---

## ⚠️ Devre Dışı Alarmlar (1 Alarm)

Mail açık tanımlı ancak alarm tamamen devre dışı (`enabled = false`).

| Kod | Alarm Adı | Kategori | Seviye |
|-----|-----------|----------|--------|
| `UNUSUAL_COUNTRY_TRAFFIC` | Olağan Dışı Ülke Trafiği | RISK_ANOMALY | MEDIUM |

---

## Notlar

- **Cooldown**: Aynı alarmın tekrar tetiklenmesi için gereken minimum bekleme süresi.
- Mail bildirimleri için `notifyEmail = true` ve `enabled = true` olması zorunludur.
- Mail almak istediğiniz / istemediğiniz bir alarm varsa `alarm_definitions` tablosunda veya `lib/alarms/alarm-definitions.ts` dosyasında `notifyEmail` alanı güncellenerek değiştirilebilir.
