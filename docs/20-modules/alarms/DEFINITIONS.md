# Alarm Definitions Catalog

> **Auto-generated** from `lib/alarms/alarm-definitions.ts` on 2026-05-18
> **Total:** 98 alarm definitions
> **Regenerate:** `npx tsx scripts/generate-alarm-catalog.ts`

---

## Table of Contents

1. [Config & Access](#config-access) (20 alarms)
2. [Security](#security) (21 alarms)
3. [Risk & Anomaly](#risk-anomaly) (13 alarms)
4. [Operational](#operational) (30 alarms)
5. [SOC Correlation](#soc-correlation) (14 alarms)

---

## Summary by Severity

| Severity | Count |
|---|---|
| 🔴 CRITICAL | 22 |
| 🟠 HIGH | 32 |
| 🟡 MEDIUM | 27 |
| 🔵 LOW | 8 |
| ⚪ INFO | 9 |
| **Total** | **98** |

---

## Config & Access

| Code | Name | Severity | Source | Cooldown | Email | Threshold | Window |
|---|---|---|---|---|---|---|---|
| `ADMIN_LOGIN_OFF_HOURS` | Mesai Disi Admin Girisi | 🔴 CRITICAL | FortiAnalyzer | 30m |  | 1 | 10m |
| `CORE_CONFIG_CHANGE` | Kritik Yapilandirma Degisikligi | 🔴 CRITICAL | FortiAnalyzer | 180m |  | 1 | 180m |
| `FIRMWARE_CHANGE` | Firmware Upgrade/Downgrade | 🔴 CRITICAL | FortiAnalyzer | 60m |  | 1 | 60m |
| `FW_POLICY_CHANGED` | Firewall Policy Degisikligi | 🔴 CRITICAL | FortiAnalyzer | 30m |  | 1 | 30m |
| `NEW_ADMIN_USER` | Yeni Admin Kullanici Olusturuldu | 🔴 CRITICAL | FortiAnalyzer | 5m |  | 1 | 30m |
| `NEW_VIP` | Yeni Virtual IP (DNAT) Olusturuldu | 🔴 CRITICAL | FortiAnalyzer | 5m |  | 1 | 30m |
| `UNAUTH_ADMIN_LOGIN` | Yetkisiz Admin Giris Denemesi | 🔴 CRITICAL | FortiAnalyzer | 10m |  | 1 | 15m |
| `ADDRESS_OBJECT_CHANGED` | Firewall Adres Nesnesi Degistirildi | 🟠 HIGH | FortiAnalyzer | 30m |  | 1 | 30m |
| `ADMIN_PASSWORD_CHANGED` | Admin Sifre Degisikligi | 🟠 HIGH | FortiAnalyzer | 15m |  | 1 | 30m |
| `ADMIN_PRIVILEGE_CHANGE` | Admin Yetki Degisikligi | 🟠 HIGH | FortiAnalyzer | 15m |  | 1 | 60m |
| `AUTH_SERVER_CHANGED` | Authentication Server Degisikligi | 🟠 HIGH | FortiAnalyzer | 15m |  | 1 | 30m |
| `IPSEC_TUNNEL_CHANGED` | IPsec VPN Yapilandirma Degisikligi | 🟠 HIGH | FortiAnalyzer | 15m |  | 1 | 30m |
| `NAT_POLICY_CHANGED` | NAT Politika Degisikligi | 🟠 HIGH | FortiAnalyzer | 15m |  | 1 | 30m |
| `ROUTE_TABLE_CHANGED` | Routing Tablosu Degisikligi | 🟠 HIGH | FortiAnalyzer | 15m |  | 1 | 60m |
| `SERVICE_GROUP_CHANGED` | Servis Grubu Degisikligi | 🟠 HIGH | FortiAnalyzer | 15m |  | 1 | 30m |
| `SSL_VPN_SETTINGS_CHANGED` | SSL-VPN Ayarlari Degisikligi | 🟠 HIGH | FortiAnalyzer | 15m |  | 1 | 30m |
| `ADDRESS_GROUP_CHANGED` | Adres Grubu Degisikligi | 🟡 MEDIUM | FortiAnalyzer | 15m |  | 1 | 60m |
| `CONFIG_CHANGE_AFTER_HOURS` | Mesai Disi Konfig Degisikligi | 🟡 MEDIUM | VMware vCenter | 30m | ✓ | 1 | 15m |
| `INTERFACE_CONFIG_CHANGED` | Interface Yapilandirma Degisikligi | 🟡 MEDIUM | FortiAnalyzer | 15m |  | 1 | 30m |
| `VM_RECONFIGURED` | VM Konfigurasyon Degisikligi | 🟡 MEDIUM | VMware vCenter | 30m |  | 10 | 15m |

### `ADMIN_LOGIN_OFF_HOURS`

**Mesai Disi Admin Girisi** — 🔴 CRITICAL

> Calisma saatleri disinda (08:00-18:00) admin girisi tespit edildi. Hafta sonu ve tatil gunleri vurgulanir.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `event` |
| Filter | `subtype == system and action == login and status == success` |
| Client Check | `off-hours` |

**Recommended Action:** Confirm login was planned/authorized. If unexpected, investigate immediately. Check what changes were made during off-hours session.

### `CORE_CONFIG_CHANGE`

**Kritik Yapilandirma Degisikligi** — 🔴 CRITICAL

> Interface, routing, HA veya system-level degisiklikler tespit edildi. Risk etkisi yuksek.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 180 minutes |
| Threshold | ≥ 1 events |
| Time Window | 180 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% or logdesc like %changed%` |

**Recommended Action:** Review change details in config revisions. Verify authorized change window. Assess blast radius - did change affect redundancy or routing?

### `FIRMWARE_CHANGE`

**Firmware Upgrade/Downgrade** — 🔴 CRITICAL

> FortiGate firmware versiyonu degisikligi tespit edildi. Downgrade daha yuksek risk olarak isaretlenir.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %firmware%` |

**Recommended Action:** Verify firmware change was planned. If downgrade, investigate reason. Ensure backup was taken before change. Validate HA synchronization.

### `FW_POLICY_CHANGED`

**Firewall Policy Degisikligi** — 🔴 CRITICAL

> Firewall kurallarinda ekleme, duzenleme veya silme tespit edildi. Kim tarafindan, nereden ve ne degistirildigini izler.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.policy% and ui != ha_daemon` |

**Recommended Action:** Verify change was authorized. Check admin identity and source IP. Review before/after policy state in config revisions.

### `NEW_ADMIN_USER`

**Yeni Admin Kullanici Olusturuldu** — 🔴 CRITICAL

> FortiGate a yeni admin kullanici eklendi. Yetkisiz erisim riski.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 5 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %system.admin% and action == Add` |

**Recommended Action:** Yeni admin hesabinin yetkili olup olmadigini dogrulayin. Verilen yetkileri kontrol edin. 2FA aktif edildiginden emin olun.

### `NEW_VIP`

**Yeni Virtual IP (DNAT) Olusturuldu** — 🔴 CRITICAL

> Yeni Virtual IP tanimlandi. Dahili sunuculari disariya acar, kritik guvenlik etkisi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 5 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.vip% and action == Add` |

**Recommended Action:** VIP in yetkili degisiklik olup olmadigini dogrulayin. Acilan portu ve dahili sunucuyu kontrol edin. SSL inspection ve IPS korumasi aktif mi kontrol edin.

### `UNAUTH_ADMIN_LOGIN`

**Yetkisiz Admin Giris Denemesi** — 🔴 CRITICAL

> Beklenmeyen kullanici, IP veya yontemle admin giris denemesi tespit edildi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 10 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == system and action == login and status == failed` |

**Recommended Action:** Investigate source IP and username. Check if this is a known admin. Block IP if suspicious. Enable 2FA if not already active.

### `ADDRESS_OBJECT_CHANGED`

**Firewall Adres Nesnesi Degistirildi** — 🟠 HIGH

> Mevcut IP, subnet veya FQDN nesnesi duzenlendi veya silindi. Politika etkisi incelenmeli.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.address%` |

**Recommended Action:** Review changed address object and identify all policies referencing it. Verify change was authorized. Check before/after values.

### `ADMIN_PASSWORD_CHANGED`

**Admin Sifre Degisikligi** — 🟠 HIGH

> Admin kullanici sifresi degistirildi. Hesap guvenligi etkisi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %system.admin% and logdesc like %password%` |

**Recommended Action:** Sifre degisikliginin yetkili oldugunu dogrulayin. Admin ile iletisime gecin. Suphe varsa hesabi kilitleyin.

### `ADMIN_PRIVILEGE_CHANGE`

**Admin Yetki Degisikligi** — 🟠 HIGH

> Admin profili veya yetkilendirme ayarlari degistirildi. Privilege escalation riski.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %system.admin%` |

**Recommended Action:** Degisikligi kimin yaptigini dogrulayin. Hangi yetkilerin degistirildigini kontrol edin. Admin oturum loglarini inceleyin. En az yetki ilkesini uygulayın.

### `AUTH_SERVER_CHANGED`

**Authentication Server Degisikligi** — 🟠 HIGH

> LDAP, RADIUS veya TACACS+ sunucu yapilandirmasi degistirildi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and (cfgpath like %user.ldap% or cfgpath like %user.radius% or cfgpath like %user.tacacs%)` |

**Recommended Action:** Auth server degisikligini dogrulayin. Kullanici girislerini test edin. Failover sunucu yapilandirmasini kontrol edin.

### `IPSEC_TUNNEL_CHANGED`

**IPsec VPN Yapilandirma Degisikligi** — 🟠 HIGH

> IPsec Phase1 veya Phase2 yapilandirmasi degistirildi. Site-to-site VPN etkisi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and (cfgpath like %vpn.ipsec.phase1% or cfgpath like %vpn.ipsec.phase2%)` |

**Recommended Action:** VPN degisikliginin yetkili oldugunu dogrulayin. Etkilenen tunnel larin durumunu kontrol edin. Remote site ile koordinasyon saglayin.

### `NAT_POLICY_CHANGED`

**NAT Politika Degisikligi** — 🟠 HIGH

> Central NAT veya IP Pool yapilandirmasi degistirildi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and (cfgpath like %firewall.central-snat% or cfgpath like %firewall.ippool%)` |

**Recommended Action:** NAT degisikliginin amacini dogrulayin. Etkilenen trafik akislarini kontrol edin. IP pool exhaustion riski var mi inceleyin.

### `ROUTE_TABLE_CHANGED`

**Routing Tablosu Degisikligi** — 🟠 HIGH

> Statik veya dinamik route degisikligi tespit edildi. Trafik yonlendirme uzerinde etkisi olabilir.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %router%` |

**Recommended Action:** Route degisiklik detaylarini inceleyin. Trafik akisinin dogru oldugunu dogrulayin. Routing donguleri kontrol edin. Kritik hedeflere baglanti testleri yapin.

### `SERVICE_GROUP_CHANGED`

**Servis Grubu Degisikligi** — 🟠 HIGH

> Firewall servis grubu uzerinde ekleme, silme veya duzenleme tespit edildi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.service.group%` |

**Recommended Action:** Hangi servis grubunun degistigini kontrol edin. Etkilenen tum policy leri inceleyin. Change management onayini dogrulayin.

### `SSL_VPN_SETTINGS_CHANGED`

**SSL-VPN Ayarlari Degisikligi** — 🟠 HIGH

> SSL-VPN portal, realm veya settings yapilandirmasi degistirildi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %vpn.ssl%` |

**Recommended Action:** SSL-VPN degisikliginin yetkili oldugunu dogrulayin. Portal ve realm ayarlarini kontrol edin. Kullanici erisimlerini test edin.

### `ADDRESS_GROUP_CHANGED`

**Adres Grubu Degisikligi** — 🟡 MEDIUM

> Firewall adres grubu (address group) uzerinde ekleme, silme veya duzenleme tespit edildi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.addrgrp%` |

**Recommended Action:** Hangi adres grubunun degistigini inceleyin. Bu grubu referans alan tum politikalari kontrol edin. Degisikligin change management ile onaylandigini dogrulayin.

### `CONFIG_CHANGE_AFTER_HOURS`

**Mesai Disi Konfig Degisikligi** — 🟡 MEDIUM

> Host veya Cluster config degisikligi mesai disi yapildi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `configChange == true` |
| Client Check | `off-hours` |

**Recommended Action:** Degisiklik kim tarafindan yapildi kontrol edin. Change management sureci takip edildi mi dogrulayin. Kritik config degisimleri varsa geri alin.

### `INTERFACE_CONFIG_CHANGED`

**Interface Yapilandirma Degisikligi** — 🟡 MEDIUM

> Network interface ayarlari degistirildi. IP, VLAN veya mode degisikligi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %system.interface%` |

**Recommended Action:** Interface degisikliginin amacini dogrulayin. Network baglantisini test edin. HA senkronizasyonunu kontrol edin.

### `VM_RECONFIGURED`

**VM Konfigurasyon Degisikligi** — 🟡 MEDIUM

> VM kaynak ayarlari degistirildi (CPU, RAM, disk). Kapasite planlamasi takibi.

| Property | Value |
|---|---|
| Category | Config & Access |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 10 events |
| Time Window | 15 minutes |
| Log Type | `vmware` |
| Filter | `vmReconfigured == true` |

**Recommended Action:** Degisiklik nedenini ve kim tarafindan yapildigini kontrol edin. Host kaynaklarinin yeterli oldugunu dogrulayin. Lisans etkisi varsa kontrol edin.

## Security

| Code | Name | Severity | Source | Cooldown | Email | Threshold | Window |
|---|---|---|---|---|---|---|---|
| `ESXI_MAINTENANCE_OUT_OF_HOURS` | Mesai Disi Maintenance Mode | 🔴 CRITICAL | VMware vCenter | 30m | ✓ | 1 | 15m |
| `SNAPSHOT_REVERTED_OFF_HOURS` | Mesai Disi Snapshot Geri Yukleme | 🔴 CRITICAL | VMware vCenter | 15m | ✓ | 1 | 10m |
| `VM_DELETED` | VM Silindi | 🔴 CRITICAL | VMware vCenter | 15m | ✓ | 1 | 10m |
| `ADMIN_BRUTE_FORCE` | Admin Brute Force Denemesi | 🟠 HIGH | FortiAnalyzer | 15m |  | 5 | 15m |
| `DNS_MALICIOUS` | Zararli DNS Istegi Engellendi | 🟠 HIGH | FortiAnalyzer | 10m |  | 1 | 10m |
| `DNS_TUNNEL_SUSPECT` | DNS Tunelleme Suphesi | 🟠 HIGH | FortiAnalyzer | 30m |  | 50 | 15m |
| `IPS_CRITICAL_ALERT` | IPS Kritik Seviye Alarm | 🟠 HIGH | FortiAnalyzer | 10m |  | 1 | 10m |
| `MALWARE_DETECTED` | Malware Tespit Edildi | 🟠 HIGH | FortiAnalyzer | 10m |  | 1 | 10m |
| `SSLVPN_LOCKOUT` | SSL-VPN Hesap Kilitlendi | 🟠 HIGH | FortiAnalyzer | 30m | ✓ | 1 | 30m |
| `SSLVPN_MULTI_FAIL` | SSL-VPN Coklu Hatali Giris | 🟠 HIGH | FortiAnalyzer | 15m | ✓ | 3 | 10m |
| `VM_POWERED_ON_OFF_HOURS` | Mesai Disi VM Baslatma | 🟠 HIGH | VMware vCenter | 30m | ✓ | 1 | 10m |
| `VPN_BRUTE_FORCE` | VPN Brute Force Denemesi | 🟠 HIGH | FortiAnalyzer | 15m |  | 5 | 15m |
| `VPN_LOGIN_OFF_HOURS` | Mesai Disi SSL-VPN Baglantisi | 🟠 HIGH | FortiGate SSL-VPN | 240m | ✓ | 1 | 240m |
| `WEBFILTER_HIGH_RISK` | Yuksek Riskli Web Erisim | 🟠 HIGH | FortiAnalyzer | 15m |  | 3 | 15m |
| `WEBFILTER_OVERRIDE` | WebFilter Bypass/Override | 🟠 HIGH | FortiAnalyzer | 30m |  | 1 | 15m |
| `ADMIN_LOGIN_FAILED` | Admin Basarisiz Giris Denemesi (FortiGate) | 🟡 MEDIUM | FortiAnalyzer | 5m | ✓ | 1 | 15m |
| `SSLVPN_AUTH_FAILED` | SSL-VPN Giris Hatasi | 🟡 MEDIUM | FortiAnalyzer | 10m | ✓ | 1 | 15m |
| `USER_SESSION_OFF_HOURS` | Mesai Disi Kullanici Oturumu | 🟡 MEDIUM | FortiAnalyzer | 60m |  | 1 | 60m |
| `VPN_NEW_USER` | Yeni SSL-VPN Kullanicisi | 🟡 MEDIUM | FortiAnalyzer | 60m |  | 1 | 30m |
| `SSLVPN_BUSINESS_HOURS` | SSL-VPN Mesai Içi Baglantisi | ⚪ INFO | FortiGate SSL-VPN | 60m |  | 1 | 60m |
| `SSLVPN_CONNECTION` | SSL-VPN Baglanti Tespit Edildi | ⚪ INFO | FortiAnalyzer | 60m | ✓ | 1 | 60m |

### `ESXI_MAINTENANCE_OUT_OF_HOURS`

**Mesai Disi Maintenance Mode** — 🔴 CRITICAL

> ESXi host 22:00-06:00 arasi maintenance mode a alindi. MITRE Impact/Persistence.

| Property | Value |
|---|---|
| Category | Security |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `maintenanceMode == true` |
| Client Check | `off-hours` |

**Recommended Action:** ACIL: Maintenance i kim yapti kontrol edin. Yetkisiz mudahale ise host u inceleyin. Change management sureci takip edilmis mi dogrulayin.

### `SNAPSHOT_REVERTED_OFF_HOURS`

**Mesai Disi Snapshot Geri Yukleme** — 🔴 CRITICAL

> Calisma saatleri disinda snapshot revert yapildi. Ransomware recovery veya yetkisiz mudahale.

| Property | Value |
|---|---|
| Category | Security |
| Source | VMware vCenter |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `snapshotReverted == true` |
| Client Check | `off-hours` |

**Recommended Action:** ACIL: Revert i kim yapti ve nedenini kontrol edin. Ransomware suphesi varsa forensic inceleme baslatın. Change management kontrolu yapin.

### `VM_DELETED`

**VM Silindi** — 🔴 CRITICAL

> VM delete event tespit edildi. SOC entegrasyonu icin altin alarm.

| Property | Value |
|---|---|
| Category | Security |
| Source | VMware vCenter |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `vmDeleted == true` |

**Recommended Action:** ACIL: VM i kim sildi kontrol edin. Yetkisiz islem ise forensic inceleme baslatın. Yedekten geri yukleme gerekebilir. Change ticket kontrol edin.

### `ADMIN_BRUTE_FORCE`

**Admin Brute Force Denemesi** — 🟠 HIGH

> Esik degerini asan basarisiz admin giris denemeleri tespit edildi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 5 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == system and action == login and status == failed` |
| Client Check | `brute-force-group` |

**Recommended Action:** Block source IP. Verify admin account integrity. Enable account lockout policy. Review admin access control list.

### `DNS_MALICIOUS`

**Zararli DNS Istegi Engellendi** — 🟠 HIGH

> Bilinen zararli domain veya C2 trafigi tespit ve engellendi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 10 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `dns` |
| Filter | `action == blocked` |

**Recommended Action:** Identify requesting host. Check for malware infection. Block domain at multiple layers. Update threat intelligence feeds.

### `DNS_TUNNEL_SUSPECT`

**DNS Tunelleme Suphesi** — 🟠 HIGH

> Tek bir domaine asiri DNS sorgusu tespit edildi. DNS tunelleme veya C2 haberlesme gostergesi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 50 events |
| Time Window | 15 minutes |
| Log Type | `dns` |
| Filter | `(srcip != 10.5.2.1 and srcip != 10.5.2.2) and (dstip != 8.8.8.8 and dstip != 8.8.4.4 and dstip != 1.1.1.1 and dstip != 1.0.0.1 and dstip != 208.67.222.222 and dstip != 208.67.220.220 and dstip != 195.175.39.39 and dstip != 195.175.39.40)` |
| Client Check | `brute-force-group` |

**Recommended Action:** Sorgulanan domaini ve kaynak hostu belirleyin. DNS tunelleme araclari kontrol edin. Suphe yaratan domaini engelleyin. Endpoint i malware taramasindan gecirin.

### `IPS_CRITICAL_ALERT`

**IPS Kritik Seviye Alarm** — 🟠 HIGH

> Exploit imzalari, CVE ile iliskili olaylar tespit edildi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 10 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `attack` |
| Filter | `severity == critical` |

**Recommended Action:** Investigate targeted system. Check if exploit was successful. Patch vulnerable systems. Review IPS signature updates.

### `MALWARE_DETECTED`

**Malware Tespit Edildi** — 🟠 HIGH

> Antivirus tarafindan kotu amacli yazilim tespit edildi ve engellendi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 10 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `virus` |
| Filter | `action == blocked` |

**Recommended Action:** Identify infected host. Run full AV scan on endpoint. Check for lateral movement. Review web filtering policies.

### `SSLVPN_LOCKOUT`

**SSL-VPN Hesap Kilitlendi** — 🟠 HIGH

> Tekrarlanan basarisiz giris denemeleri nedeniyle SSL-VPN hesabi kilitlendi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Email Notify | ✓ |
| Log Type | `event` |
| Filter | `subtype == vpn and logdesc like %lockout%` |

**Recommended Action:** ACIL: Hesap sahibi ile iletisime gecin. Yetkisiz erisim denemesi mi yoksa kullanici hatasi mi belirleyin. Kaynak IP yi inceleyin ve gerekirse engelleyin.

### `SSLVPN_MULTI_FAIL`

**SSL-VPN Coklu Hatali Giris** — 🟠 HIGH

> Ayni kaynak IP den veya kullanicidan kisa surede birden fazla basarisiz giris denemesi. Brute force saldirisi veya unuttum-sifre durumu.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 3 events |
| Time Window | 10 minutes |
| Email Notify | ✓ |
| Log Type | `event` |
| Filter | `subtype == vpn and action == ssl-login-fail` |
| Client Check | `brute-force-group` |

**Recommended Action:** Kaynak IP yi gecici olarak engelleyin. Kullanici hesabini kontrol edin. Hesap kilitlenmis mi dogrulayin. Israrci saldiri varsa kalici engelleme uygulayın.

### `VM_POWERED_ON_OFF_HOURS`

**Mesai Disi VM Baslatma** — 🟠 HIGH

> Calisma saatleri disinda VM power-on edildi. Yetkisiz mudahale riski.

| Property | Value |
|---|---|
| Category | Security |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `powerState == poweredOn` |
| Client Check | `off-hours` |

**Recommended Action:** ACIL: VM i kim baslatti kontrol edin. Change management sureci takip edilmis mi dogrulayin. Yetkisiz ise VM i kapatip inceleyin.

### `VPN_BRUTE_FORCE`

**VPN Brute Force Denemesi** — 🟠 HIGH

> Kisa surede birden fazla basarisiz VPN giris denemesi (SSL/IPsec). Ayni kaynak IP veya birden fazla kullanici.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 5 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == vpn and action == ssl-login-fail` |
| Client Check | `brute-force-group` |

**Recommended Action:** Block source IP at firewall. Check if credentials compromised. Review VPN authentication policies. Consider rate limiting.

### `VPN_LOGIN_OFF_HOURS`

**Mesai Disi SSL-VPN Baglantisi** — 🟠 HIGH

> Calisma saatleri disinda (08:00-18:00) veya hafta sonu SSL-VPN baglantisi tespit edildi. Yetkisiz uzaktan erisim riski.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiGate SSL-VPN |
| Cooldown | 240 minutes |
| Threshold | ≥ 1 events |
| Time Window | 240 minutes |
| Email Notify | ✓ |
| Log Type | `event` |
| Filter | `subtype == user and action == auth-logon` |
| Client Check | `off-hours` |

**Recommended Action:** Verify VPN user identity and authorization. Check if remote work was planned. Review accessed resources during off-hours session. Contact user if unexpected.

### `WEBFILTER_HIGH_RISK`

**Yuksek Riskli Web Erisim** — 🟠 HIGH

> Malware, phishing, proxy-avoidance gibi yuksek riskli kategorilere erisim denemesi tespit edildi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 3 events |
| Time Window | 15 minutes |
| Log Type | `webfilter` |
| Filter | `action == blocked` |

**Recommended Action:** Kullanici ve hostu belirleyin. Malware enfeksiyonu kontrolu yapin. Tarama gecmisini inceleyin. Birden fazla deneme varsa endpoint taramasi baslatmayi degerlendiriniz.

### `WEBFILTER_OVERRIDE`

**WebFilter Bypass/Override** — 🟠 HIGH

> Kullanici veya admin tarafindan WebFilter kurali bypass edildi veya override yapildi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `webfilter` |
| Filter | `action == passthrough` |

**Recommended Action:** Override iznini kimin verdigini kontrol edin. Hedef URL/domaini inceleyin. Override in gecici ve gerekce ile yapildigini dogrulayin.

### `ADMIN_LOGIN_FAILED`

**Admin Basarisiz Giris Denemesi (FortiGate)** — 🟡 MEDIUM

> FortiGate uzerinden tespit edilen basarisiz admin giris denemesi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 5 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Email Notify | ✓ |
| Log Type | `event` |
| Filter | `subtype == system and action == login and status == failed` |

**Recommended Action:** Review source IP and username. Verify if this is a legitimate admin. Consider blocking IP after multiple failures. Enable 2FA for all admin accounts.

### `SSLVPN_AUTH_FAILED`

**SSL-VPN Giris Hatasi** — 🟡 MEDIUM

> SSL-VPN giris denemesi basarisiz oldu. Yanlis sifre veya kullanici adi hatasi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 10 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Email Notify | ✓ |
| Log Type | `event` |
| Filter | `subtype == vpn and action == ssl-login-fail` |

**Recommended Action:** Kaynak IP ve kullanici adini kontrol edin. Birden fazla hatali deneme varsa brute force suphesi arastirin. Kullanicinin sifreyi degistirmesi gerekebilir.

### `USER_SESSION_OFF_HOURS`

**Mesai Disi Kullanici Oturumu** — 🟡 MEDIUM

> Calisma saatleri disinda (18:00-08:00) veya hafta sonu kullanici oturumu acildi. Yetkisiz erisim riski.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `traffic` |
| Filter | `action == accept` |
| Client Check | `off-hours` |

**Recommended Action:** Kullanici kimligini dogrulayin. Oturum neden acildi arastirin. Erisilen kaynaklari kontrol edin. Planli calisma ise onaylayin.

### `VPN_NEW_USER`

**Yeni SSL-VPN Kullanicisi** — 🟡 MEDIUM

> Daha once gorulmemis bir kullanici ile SSL-VPN baglantisi tespit edildi.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == user and action == auth-logon` |
| Client Check | `geo-anomaly` |

**Recommended Action:** Kullanici kimligini ve yetkilendirmesini dogrulayin. Hesabin yakın zamanda olusturulup olusturulmadigini kontrol edin. Kullanici icin VPN erisim politikalarini inceleyin.

### `SSLVPN_BUSINESS_HOURS`

**SSL-VPN Mesai Içi Baglantisi** — ⚪ INFO

> Calisma saatleri içinde (08:00-18:00) ve hafta içi SSL-VPN baglantisi tespit edildi. Normal çalışma saatlerinde beklenen bağlantı.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiGate SSL-VPN |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Client Check | `business-hours` |

**Recommended Action:** Review user activity for any suspicious behavior. This is expected VPN usage during work hours.

### `SSLVPN_CONNECTION`

**SSL-VPN Baglanti Tespit Edildi** — ⚪ INFO

> Yeni SSL-VPN baglantisi tespit edildi. Kullanici, kaynak IP, interface ve baglanti detaylari kaydedilir.

| Property | Value |
|---|---|
| Category | Security |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Email Notify | ✓ |
| Log Type | `event` |
| Filter | `subtype == user and action == auth-logon` |
| Client Check | `per-user-dedup` |

**Recommended Action:** Baglantiyi dogrulayin. Beklenmeyen kullanicilar veya lokasyonlar icin kullanici ile iletisime gecin.

## Risk & Anomaly

| Code | Name | Severity | Source | Cooldown | Email | Threshold | Window |
|---|---|---|---|---|---|---|---|
| `DATA_EXFIL_SUSPECT` | Veri Sizintisi Suphesi | 🟠 HIGH | FortiAnalyzer | 30m |  | 1 | 30m |
| `APP_CONTROL_VIOLATION` | Uygulama Kontrol Ihlali | 🟡 MEDIUM | FortiAnalyzer | 30m |  | 5 | 15m |
| `DENIED_TRAFFIC_SPIKE` | Engellenen Trafik Artisi | 🟡 MEDIUM | FortiAnalyzer | 15m |  | 50 | 15m |
| `EXCESSIVE_BANDWIDTH` | Tek Host Asiri Bant Genisligi | 🟡 MEDIUM | FortiAnalyzer | 30m |  | 1 | 15m |
| `HIGH_SESSION_COUNT` | Asiri Oturum Sayisi | 🟡 MEDIUM | FortiAnalyzer | 15m |  | 1 | 15m |
| `NEW_ADDRESS_OBJECT` | Yeni Firewall Adres Nesnesi | 🟡 MEDIUM | FortiAnalyzer | 60m |  | 1 | 60m |
| `NEW_SERVICE_OBJECT` | Yeni Firewall Servis Nesnesi | 🟡 MEDIUM | FortiAnalyzer | 30m |  | 1 | 60m |
| `POLICY_DISABLED` | Firewall Politikasi Devre Disi | 🟡 MEDIUM | FortiAnalyzer | 15m |  | 1 | 30m |
| `POLICY_HIT_ANOMALY` | Policy Hit Rate Anomalisi | 🟡 MEDIUM | FortiAnalyzer | 30m |  | 1000 | 15m |
| `SCHEDULE_OBJECT_CHANGED` | Zaman Objesi Degisikligi | 🟡 MEDIUM | FortiAnalyzer | 30m |  | 1 | 30m |
| `SNAT_POOL_CHANGED` | SNAT IP Pool Degisikligi | 🟡 MEDIUM | FortiAnalyzer | 30m |  | 1 | 30m |
| `SSLVPN_HIGH_TRAFFIC` | SSL-VPN Yuksek Trafik Tespit Edildi | 🟡 MEDIUM | FortiAnalyzer | 60m | ✓ | 1 | 30m |
| `UNUSUAL_COUNTRY_TRAFFIC` | Olagan Disi Ulke Trafigi | 🟡 MEDIUM | FortiAnalyzer | 60m |  | 1 | 30m |

### `DATA_EXFIL_SUSPECT`

**Veri Sizintisi Suphesi** — 🟠 HIGH

> Tek bir hosttan disariya yuksek hacimde veri transferi tespit edildi.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `traffic` |
| Client Check | `anomaly` |
| FortiView | `top-sources` |

**Recommended Action:** Hostu ve hedefi belirleyin. Transferin meşru olup olmadigini kontrol edin (yedekleme, senkronizasyon). Kullanici aktivitesini araştırın. Yetkisizse engelleyin.

### `APP_CONTROL_VIOLATION`

**Uygulama Kontrol Ihlali** — 🟡 MEDIUM

> Engellenen veya kisitlanan uygulama kullanimi tespit edildi.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 5 events |
| Time Window | 15 minutes |
| Log Type | `app-ctrl` |
| Filter | `action == blocked` |

**Recommended Action:** Review blocked applications. Identify users/hosts. Update application control policies if needed. Address shadow IT concerns.

### `DENIED_TRAFFIC_SPIKE`

**Engellenen Trafik Artisi** — 🟡 MEDIUM

> Deny edilen trafik sayisinda ani artis tespit edildi. Port taramasi veya saldiri gostergesi olabilir.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 50 events |
| Time Window | 15 minutes |
| Log Type | `traffic` |
| Filter | `action == deny` |

**Recommended Action:** Engellenen trafikteki kaynak IP leri belirleyin. Tarama veya saldiri kalibini kontrol edin. Israrci kaynaklari cevre guvenlik duvarinda engelleyin.

### `EXCESSIVE_BANDWIDTH`

**Tek Host Asiri Bant Genisligi** — 🟡 MEDIUM

> Tek bir host normalin cok ustunde bant genisligi kullaniyor.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `traffic` |
| Client Check | `anomaly` |
| FortiView | `top-sources` |

**Recommended Action:** Identify the host and user. Check application usage. Verify if legitimate (backup, update) or suspicious (exfiltration).

### `HIGH_SESSION_COUNT`

**Asiri Oturum Sayisi** — 🟡 MEDIUM

> Tek bir IP adresinden cok sayida esanli oturum tespit edildi. Botnet veya DDoS gostergesi olabilir.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `traffic` |
| Client Check | `anomaly` |
| FortiView | `top-sources` |

**Recommended Action:** Kaynak hostu belirleyin. Calisan surecler ve servisleri kontrol edin. Oturum limitlerini uygulayin. Botnet suphesi varsa izole edin.

### `NEW_ADDRESS_OBJECT`

**Yeni Firewall Adres Nesnesi** — 🟡 MEDIUM

> Yeni IP, subnet veya FQDN nesnesi olusturuldu.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.address% and action == Add` |

**Recommended Action:** Verify address object was authorized. Check if it bypasses existing security policies. Review associated policy references.

### `NEW_SERVICE_OBJECT`

**Yeni Firewall Servis Nesnesi** — 🟡 MEDIUM

> Yeni port veya protokol tanimlandi. Shadow IT veya yetkisiz servis acilisi olabilir.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.service% and action == Add` |

**Recommended Action:** Review new service object. Verify it was requested through change management. Check if port is commonly exploited.

### `POLICY_DISABLED`

**Firewall Politikasi Devre Disi** — 🟡 MEDIUM

> Bir veya daha fazla firewall politikasi devre disi birakildi.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.policy% and logdesc like %status%` |

**Recommended Action:** Hangi policy nin devre disi birakildigini kontrol edin. Guvenlik etkisini degerlendiriniz. Gecici mi kalici mi belirleyin.

### `POLICY_HIT_ANOMALY`

**Policy Hit Rate Anomalisi** — 🟡 MEDIUM

> Baseline degerine gore ani trafik artisi tespit edildi.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1000 events |
| Time Window | 15 minutes |
| Log Type | `traffic` |
| Client Check | `anomaly` |

**Recommended Action:** Identify top talkers and affected policies. Compare with historical baseline. Check for DDoS indicators. Review bandwidth usage.

### `SCHEDULE_OBJECT_CHANGED`

**Zaman Objesi Degisikligi** — 🟡 MEDIUM

> Firewall schedule objesi degistirildi. Policy zamanlama etkisi.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.schedule%` |

**Recommended Action:** Schedule degisikliginin hangi policy leri etkiledigini kontrol edin. Is saatleri disinda aktif olacak kurallari inceleyin.

### `SNAT_POOL_CHANGED`

**SNAT IP Pool Degisikligi** — 🟡 MEDIUM

> Source NAT IP pool yapilandirmasi degistirildi.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %firewall.ippool%` |

**Recommended Action:** IP pool degisikligini dogrulayin. Exhaustion riski var mi kontrol edin. External servislerle IP degisikligini koordine edin.

### `SSLVPN_HIGH_TRAFFIC`

**SSL-VPN Yuksek Trafik Tespit Edildi** — 🟡 MEDIUM

> Tek bir SSL-VPN oturumundan anormal derecede yuksek veri transferi. Veri sizintisi veya normal is yukunun ustunde kullanim.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Email Notify | ✓ |
| Log Type | `traffic` |
| Filter | `action == accept and tunneltype == ssl-web` |
| Client Check | `anomaly` |

**Recommended Action:** Kullanici aktivitesini inceleyin. Transfer edilen veri turlerini belirleyin. Suphe yaratan durumlarda oturumu sonlandirin.

### `UNUSUAL_COUNTRY_TRAFFIC`

**Olagan Disi Ulke Trafigi** — 🟡 MEDIUM

> Normalde gorulmeyen ulkelere veya ulkelerden gelen trafik anomalisi tespit edildi.

| Property | Value |
|---|---|
| Category | Risk & Anomaly |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `traffic` |
| Client Check | `geo-anomaly` |
| FortiView | `top-countries` |

**Recommended Action:** Hedef ulkeleri inceleyin. Is gereksinimiyle uyumlu olup olmadigini kontrol edin. Suphe yaratan ulke trafigini geo-IP politikalariyla engelleyin.

## Operational

| Code | Name | Severity | Source | Cooldown | Email | Threshold | Window |
|---|---|---|---|---|---|---|---|
| `CLUSTER_HA_RISK` | HA Failover Kapasitesi Yetersiz | 🔴 CRITICAL | VMware vCenter | 120m | ✓ | 1 | 60m |
| `DATASTORE_SPACE_CRITICAL` | Datastore Alan Kritik | 🔴 CRITICAL | VMware vCenter | 60m |  | 1 | 15m |
| `HOST_DISCONNECTED` | ESXi Host Baglanti Kesildi | 🔴 CRITICAL | VMware vCenter | 5m |  | 1 | 5m |
| `SNAPSHOT_DISK_GROWTH` | Snapshot Disk Sismesi | 🔴 CRITICAL | VMware vCenter | 240m | ✓ | 1 | 60m |
| `DATASTORE_SPACE_LOW` | Datastore Alan Dusuk | 🟠 HIGH | VMware vCenter | 60m |  | 1 | 30m |
| `HA_CONFIG_SYNC_FAIL` | HA Config Senkronizasyon Hatasi | 🟠 HIGH | FortiAnalyzer | 30m |  | 1 | 15m |
| `HA_FAILOVER` | HA Failover Tespit Edildi | 🟠 HIGH | FortiAnalyzer | 30m |  | 1 | 15m |
| `HOST_CPU_CRITICAL` | Host CPU Kritik Kullanim | 🟠 HIGH | VMware vCenter | 30m |  | 1 | 10m |
| `HOST_MEMORY_CRITICAL` | Host Bellek Kritik Kullanim | 🟠 HIGH | VMware vCenter | 30m |  | 1 | 10m |
| `VM_POWERED_OFF` | VM Beklenmedik Kapanma | 🟠 HIGH | VMware vCenter | 15m |  | 1 | 15m |
| `DRS_IMBALANCE` | DRS Dengesizligi | 🟡 MEDIUM | VMware vCenter | 60m |  | 1 | 60m |
| `MULTIPLE_SNAPSHOTS` | Coklu Snapshot Zinciri | 🟡 MEDIUM | VMware vCenter | 120m |  | 1 | 60m |
| `SNAPSHOT_REVERTED` | Snapshot Geri Yuklendi | 🟡 MEDIUM | VMware vCenter | 15m | ✓ | 1 | 10m |
| `VM_CPU_CRITICAL` | VM CPU Kritik Kullanim | 🟡 MEDIUM | VMware vCenter | 30m |  | 1 | 10m |
| `VM_MEMORY_CRITICAL` | VM Bellek Kritik Kullanim | 🟡 MEDIUM | VMware vCenter | 30m |  | 1 | 10m |
| `DEVICE_REBOOT` | FortiGate Reboot Tespit Edildi | 🔵 LOW | FortiAnalyzer | 60m |  | 1 | 30m |
| `DISK_USAGE_HIGH` | Disk Kullanimi Yuksek | 🔵 LOW | FortiAnalyzer | 60m |  | 1 | 60m |
| `HIGH_CPU_MEMORY` | Yuksek CPU/Memory Kullanimi | 🔵 LOW | FortiAnalyzer | 30m |  | 1 | 15m |
| `INTERFACE_FLAP` | Interface Down/Up | 🔵 LOW | FortiAnalyzer | 15m |  | 1 | 10m |
| `SSLVPN_TUNNEL_DOWN` | SSL-VPN Tunel Kapandi | 🔵 LOW | FortiAnalyzer | 15m |  | 1 | 15m |
| `VM_RESTARTED` | VM Yeniden Baslatildi | 🔵 LOW | VMware vCenter | 30m |  | 1 | 10m |
| `VM_SUSPENDED` | VM Suspend Edildi | 🔵 LOW | VMware vCenter | 30m |  | 1 | 15m |
| `VPN_TUNNEL_DOWN` | VPN Tunnel Down | 🔵 LOW | FortiAnalyzer | 15m | ✓ | 1 | 10m |
| `SNAPSHOT_CREATED` | Snapshot Olusturuldu | ⚪ INFO | VMware vCenter | 75m | ✓ | 1 | 60m |
| `SNAPSHOT_DELETED` | Snapshot Silindi | ⚪ INFO | VMware vCenter | 30m | ✓ | 1 | 15m |
| `SSLVPN_TUNNEL_UP` | SSL-VPN Tunel Aktif | ⚪ INFO | FortiAnalyzer | 15m |  | 1 | 15m |
| `VM_CLONED` | VM Klonlandi | ⚪ INFO | VMware vCenter | 30m |  | 10 | 15m |
| `VM_CREATED` | VM Olusturuldu | ⚪ INFO | VMware vCenter | 15m |  | 1 | 10m |
| `VM_MIGRATED` | VM Tasindi (vMotion/Storage vMotion) | ⚪ INFO | VMware vCenter | 30m |  | 10 | 15m |
| `VM_POWERED_ON` | VM Acildi | ⚪ INFO | VMware vCenter | 15m |  | 1 | 10m |

### `CLUSTER_HA_RISK`

**HA Failover Kapasitesi Yetersiz** — 🔴 CRITICAL

> 1 host down senaryosunda CPU veya RAM kapasitesi %100 asacak. HA failover riski.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 120 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `haFailoverRisk == true` |

**Recommended Action:** ACIL: Cluster a yeni host ekleyin veya VM leri baska cluster a tasiyin. HA admission control ayarlarini gozden gecirin. VM resource ayarlarini optimize edin.

### `DATASTORE_SPACE_CRITICAL`

**Datastore Alan Kritik** — 🔴 CRITICAL

> Datastore bos alani %3 altina dustu. Acil mudahale gerekli.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `vmware` |
| Filter | `datastoreFreePercent < 3` |

**Recommended Action:** ACIL: Snapshot lari derhal silin. Gereksiz dosyalari temizleyin. VM leri baska datastore a tasiyin. Yeni storage ekleyin.

### `HOST_DISCONNECTED`

**ESXi Host Baglanti Kesildi** — 🔴 CRITICAL

> ESXi host ile vCenter baglantisi kesildi. Kritik altyapi sorunu.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 5 minutes |
| Threshold | ≥ 1 events |
| Time Window | 5 minutes |
| Log Type | `vmware` |
| Filter | `connectionState != connected` |

**Recommended Action:** Host fiziksel durumunu kontrol edin. Network baglantisini dogrulayin. vCenter agent durumunu kontrol edin. HA failover durumunu izleyin.

### `SNAPSHOT_DISK_GROWTH`

**Snapshot Disk Sismesi** — 🔴 CRITICAL

> Snapshot disk buyumesi son 24 saatte %20 yi asti. Disk alani riski.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 240 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `snapshotGrowthPercent24h > 20` |

**Recommended Action:** Snapshot lari derhal kontrol edin. Eski ve gereksiz snapshot lari silin. Snapshot retention policy gozden gecirin. Datastore bos alanini kontrol edin.

### `DATASTORE_SPACE_LOW`

**Datastore Alan Dusuk** — 🟠 HIGH

> Datastore bos alani %15 altina dustu. Kapasite planlama gerekli.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `vmware` |
| Filter | `datastoreFreePercent < 15` |

**Recommended Action:** Gereksiz snapshot lari silin. Eski template ve ISO dosyalarini temizleyin. Storage vMotion ile bazi VM leri tasiyin. Kapasite artisi planlayin.

### `HA_CONFIG_SYNC_FAIL`

**HA Config Senkronizasyon Hatasi** — 🟠 HIGH

> HA peerlar arasi konfigurasyon senkronizasyonu basarisiz oldu. Cluster uyumsuzlugu riski.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == ha and logdesc like %out of sync%` |

**Recommended Action:** HA senkronizasyon durumunu kontrol edin. Gerekirse manuel senkronizasyon zorlayın. Her iki peer in ayni konfigurasyona sahip oldugunu dogrulayin. Heartbeat baglantisini kontrol edin.

### `HA_FAILOVER`

**HA Failover Tespit Edildi** — 🟠 HIGH

> FortiGate HA cluster aktif-pasif gecis tespit edildi. Servis kesintisi riski.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == ha` |

**Recommended Action:** Her iki HA peer i kontrol edin. Servislerin kurtarildigini dogrulayin. Failover nedenini araştırın. HA senkronizasyonunun stabil oldugunu dogrulayin.

### `HOST_CPU_CRITICAL`

**Host CPU Kritik Kullanim** — 🟠 HIGH

> ESXi host CPU kullanimi %85 uzerinde. VM performansi etkilenebilir.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `vmware` |
| Filter | `hostCpuUsage > 85` |

**Recommended Action:** Host uzerindeki VM dagilimini kontrol edin. vMotion ile bazi VM leri diger hostlara tasiyin. DRS ayarlarini gozden gecirin.

### `HOST_MEMORY_CRITICAL`

**Host Bellek Kritik Kullanim** — 🟠 HIGH

> ESXi host bellek kullanimi %90 uzerinde. Memory ballooning veya swapping baslar.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `vmware` |
| Filter | `hostMemoryUsage > 90` |

**Recommended Action:** Ballooning ve swap durumunu kontrol edin. VM leri diger hostlara tasiyin. Bellek reservation ayarlarini gozden gecirin.

### `VM_POWERED_OFF`

**VM Beklenmedik Kapanma** — 🟠 HIGH

> Sanal makine son 15 dakikada kapandi. Sadece kullanici tarafindan yapilan kapanmalar alarm uretir (backup/servis hesaplari haric).

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `vmware` |
| Filter | `powerState == poweredOff` |

**Recommended Action:** VM durumunu ve event loglarini kontrol edin. Graceful shutdown mu yoksa unexpected power-off mu oldugunu inceleyin. Gerekirse VM yi yeniden baslatin. Tekrarlayan kapanmalarda root cause analizi yapin.

### `DRS_IMBALANCE`

**DRS Dengesizligi** — 🟡 MEDIUM

> Cluster icinde host CPU farki %25 i asti. DRS load balancing calismadi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `vmware` |
| Filter | `drsImbalance > 25` |

**Recommended Action:** DRS ayarlarini kontrol edin (automation level, migration threshold). VM affinity/anti-affinity kurallari gozden gecirin. Manuel vMotion ile dengeleme yapin.

### `MULTIPLE_SNAPSHOTS`

**Coklu Snapshot Zinciri** — 🟡 MEDIUM

> Tek bir VM de 3 ten fazla snapshot tespit edildi. Performans ve disk riski.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 120 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `vmware` |
| Filter | `snapshotCount > 3` |

**Recommended Action:** Gereksiz snapshot lari silin. Snapshot consolidation yapin. Snapshot retention policy hatirlatın. Sadece gerekli snapshot lari tutun.

### `SNAPSHOT_REVERTED`

**Snapshot Geri Yuklendi** — 🟡 MEDIUM

> VM snapshot a geri yuklendi. Kritik rollback islemi tespit edildi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `snapshotReverted == true` |

**Recommended Action:** Revert nedenini inceleyin (patch geri alma, test hatasi, ransomware recovery). VM durumunu dogrulayin. Backup guncellemesi gerekebilir.

### `VM_CPU_CRITICAL`

**VM CPU Kritik Kullanim** — 🟡 MEDIUM

> Sanal makine CPU kullanimi %90 uzerinde. Performans sorunu veya kaynak yetersizligi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `vmware` |
| Filter | `cpuUsage > 90` |

**Recommended Action:** VM uzerinde calisan surecleri kontrol edin. Gerekirse vCPU sayisini artirin veya load balancing yapin. Uygulamayi optimize edin.

### `VM_MEMORY_CRITICAL`

**VM Bellek Kritik Kullanim** — 🟡 MEDIUM

> Sanal makine bellek kullanimi %90 uzerinde. Bellek yetersizligi veya memory leak.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `vmware` |
| Filter | `memoryUsage > 90` |

**Recommended Action:** VM bellek kullanimini analiz edin. Memory leak kontrolu yapin. Gerekirse RAM artirin. Uygulama restart gerekebilir.

### `DEVICE_REBOOT`

**FortiGate Reboot Tespit Edildi** — 🔵 LOW

> Beklenmedik yeniden baslatma veya crash tespit edildi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %restart%` |

**Recommended Action:** Check if reboot was planned. Review crash logs. Verify HA failover occurred correctly. Check uptime after reboot.

### `DISK_USAGE_HIGH`

**Disk Kullanimi Yuksek** — 🔵 LOW

> %80 uyari, %90 kritik disk doluluk esigi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %disk%` |

**Recommended Action:** Check disk usage on device. Clear old logs if needed. Verify log rotation settings. Consider expanding storage.

### `HIGH_CPU_MEMORY`

**Yuksek CPU/Memory Kullanimi** — 🔵 LOW

> Surdurulebilir esik degeri asimi tespit edildi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %conserve%` |

**Recommended Action:** Check current CPU/memory via dashboard. Identify resource-heavy processes. Review session count. Consider traffic optimization.

### `INTERFACE_FLAP`

**Interface Down/Up** — 🔵 LOW

> Link flap veya interface instabilitesi tespit edildi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %link%` |

**Recommended Action:** Check physical connectivity. Review switch port status. Monitor for recurring flaps. Check SFP module health.

### `SSLVPN_TUNNEL_DOWN`

**SSL-VPN Tunel Kapandi** — 🔵 LOW

> SSL-VPN tunnel oturumu sonlandirildi veya koptu.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == vpn and action == tunnel-down` |

**Recommended Action:** Tekrarlayan beklenmedik kapanislar icin network baglantisini kontrol edin. Session timeout ayarlarini gozden gecirin.

### `VM_RESTARTED`

**VM Yeniden Baslatildi** — 🔵 LOW

> VM restart edildi. Guvenlik patch veya beklenmeyen sistem hatasi olabilir.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `vmware` |
| Filter | `vmRestarted == true` |

**Recommended Action:** Restart nedenini kontrol edin. Windows Update, patch veya crash loglarini inceleyin. Tekrarlayan restart varsa root cause analizi yapin.

### `VM_SUSPENDED`

**VM Suspend Edildi** — 🔵 LOW

> VM suspend (askiya alma) durumuna alindi. Bellek dump disk e yazildi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `vmware` |
| Filter | `powerState == suspended` |

**Recommended Action:** Suspend nedenini kontrol edin. Uzun sure suspended kalan VM ler varsa resume veya shutdown yapin. Datastore alanini kontrol edin.

### `VPN_TUNNEL_DOWN`

**VPN Tunnel Down** — 🔵 LOW

> IPsec veya SSL tunnel kesintisi tespit edildi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Email Notify | ✓ |
| Log Type | `event` |
| Filter | `subtype == vpn and action == tunnel-down` |

**Recommended Action:** Check remote peer status. Verify internet connectivity at both ends. Review Phase 1/2 SA negotiation logs. Restart tunnel if needed.

### `SNAPSHOT_CREATED`

**Snapshot Olusturuldu** — ⚪ INFO

> VM snapshot alindi. Disk alani takibi ve yedekleme sureci izleme. Veeam backup ve Sure Backup test snapshot lari haric tutulur.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 75 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `snapshotCreated == true` |

**Recommended Action:** Snapshot amacini kontrol edin (backup, test, patch oncesi). Datastore bos alanini dogrulayin. Snapshot retention policy hatirlatın.

### `SNAPSHOT_DELETED`

**Snapshot Silindi** — ⚪ INFO

> VM snapshot silindi veya commit edildi. Disk alani kurtarma islemi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Email Notify | ✓ |
| Log Type | `vmware` |
| Filter | `snapshotDeleted == true` |

**Recommended Action:** Snapshot silme isleminin tamamlandigini kontrol edin. Datastore bos alaninin arttigini dogrulayin. Consolidation gerekiyorsa yapin.

### `SSLVPN_TUNNEL_UP`

**SSL-VPN Tunel Aktif** — ⚪ INFO

> SSL-VPN tunnel oturumu basarili sekilde kuruldu. Baglanti kalitesi ve veri transferi izlenir.

| Property | Value |
|---|---|
| Category | Operational |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == vpn and action == tunnel-up` |

**Recommended Action:** Normal operasyon olarak kabul edin. Beklenmeyen lokasyonlardan tunnel kurulumu varsa arastirin.

### `VM_CLONED`

**VM Klonlandi** — ⚪ INFO

> VM clone islemi tespit edildi. Kapasite planlamasi ve lisans takibi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 10 events |
| Time Window | 15 minutes |
| Log Type | `vmware` |
| Filter | `vmCloned == true` |

**Recommended Action:** Clone amacini kontrol edin (test, dev, prod replica). Lisans gereksinimlerini dogrulayin. Resource allocation kontrolu yapin.

### `VM_CREATED`

**VM Olusturuldu** — ⚪ INFO

> Yeni sanal makine olusturuldu. SOC entegrasyonu ve envanter takibi icin.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `vmware` |
| Filter | `vmCreated == true` |

**Recommended Action:** VM i kimin olustuurdugunu kontrol edin. Change ticket ile eslestirin. Resource allocation ayarlarini gozden gecirin.

### `VM_MIGRATED`

**VM Tasindi (vMotion/Storage vMotion)** — ⚪ INFO

> VM baska host veya datastore a tasindi. Migration islemi kaydedildi.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 30 minutes |
| Threshold | ≥ 10 events |
| Time Window | 15 minutes |
| Log Type | `vmware` |
| Filter | `vmMigrated == true` |

**Recommended Action:** Migration basarili tamamlandi mi kontrol edin. VM performansini dogrulayin. DRS otomatik migration ise policy yi gozden gecirin.

### `VM_POWERED_ON`

**VM Acildi** — ⚪ INFO

> Sanal makine power on edildi. Beklenmeyen VM baslatma izleme.

| Property | Value |
|---|---|
| Category | Operational |
| Source | VMware vCenter |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `vmware` |
| Filter | `powerState == poweredOn` |

**Recommended Action:** VM baslatma isleminin planli olup olmadigini kontrol edin. Boot time ve startup service lerini izleyin.

## SOC Correlation

| Code | Name | Severity | Source | Cooldown | Email | Threshold | Window |
|---|---|---|---|---|---|---|---|
| `BRUTE_THEN_SUCCESS` | Brute Force Sonrasi Basarili Giris | 🔴 CRITICAL | FortiAnalyzer | 30m |  | 1 | 30m |
| `IPS_THEN_OUTBOUND` | IPS Sonrasi Disari Baglanti | 🔴 CRITICAL | FortiAnalyzer | 30m |  | 1 | 30m |
| `LOGIN_THEN_CONFIG` | Giris Sonrasi Hizli Config Degisikligi | 🔴 CRITICAL | FortiAnalyzer | 15m |  | 1 | 15m |
| `MULTI_VECTOR_ATTACK` | Coklu Vektor Saldirisi (APT) | 🔴 CRITICAL | FortiAnalyzer | 60m |  | 3 | 60m |
| `SECURITY_PROFILE_DISABLED` | Guvenlik Profili Devre Disi | 🔴 CRITICAL | FortiAnalyzer | 5m |  | 1 | 10m |
| `SSLVPN_BRUTE_THEN_SUCCESS` | SSL-VPN Brute Force Sonrasi Basarili Giris | 🔴 CRITICAL | FortiAnalyzer | 30m | ✓ | 1 | 30m |
| `VPN_GEO_THEN_EXFIL` | Yeni Lokasyondan VPN + Veri Cikisi | 🔴 CRITICAL | FortiAnalyzer | 60m |  | 1 | 60m |
| `WEBBLOCK_THEN_TUNNEL` | Web Engeli Sonrasi DNS Tuneli | 🔴 CRITICAL | FortiAnalyzer | 30m |  | 1 | 30m |
| `ADMIN_NEW_GEO` | Yeni Ulke/IP'den Admin Girisi | 🟠 HIGH | FortiAnalyzer | 60m |  | 1 | 15m |
| `CONFIG_THEN_SPIKE` | Config Degisikligi Sonrasi Trafik Artisi | 🟠 HIGH | FortiAnalyzer | 30m |  | 1 | 15m |
| `MULTI_SECURITY_EVENTS` | Ayni Kaynaktan Coklu Guvenlik Olaylari | 🟠 HIGH | FortiAnalyzer | 15m |  | 10 | 15m |
| `TOP_THREAT_WEIGHT` | En Yuksek Tehdit Skoru | 🟠 HIGH | FortiAnalyzer | 30m |  | 1 | 30m |
| `RISKY_CLOUD_APP` | Riskli Bulut Uygulamasi | 🟡 MEDIUM | FortiAnalyzer | 60m |  | 1 | 30m |
| `SHADOW_IT_DETECTED` | Shadow IT Tespiti | 🟡 MEDIUM | FortiAnalyzer | 60m |  | 3 | 30m |

### `BRUTE_THEN_SUCCESS`

**Brute Force Sonrasi Basarili Giris** — 🔴 CRITICAL

> Ayni IP den brute force denemesi ardindan basarili giris tespit edildi. Kimlik bilgilerinin ele gecirilmis olma ihtimali yuksek.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `event` |
| Client Check | `correlation` |
| Correlation Precursors | `ADMIN_BRUTE_FORCE`, `VPN_BRUTE_FORCE` |
| Correlation Lookback | 30 minutes |
| Correlation Match Field | `sourceIp` |

**Recommended Action:** Hesabi derhal devre disi birakin. Sifre sifirlamasi zorunlu kilin. Kaynak IP yi kalici olarak engelleyin. Oturumda yapilan islemleri inceleyin.

### `IPS_THEN_OUTBOUND`

**IPS Sonrasi Disari Baglanti** — 🔴 CRITICAL

> IPS saldiri alarmi tetiklenen hedef IP den disariya baglanti tespit edildi. Post-exploitation (basarili sizma) gostergesi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `traffic` |
| Client Check | `correlation` |
| Correlation Precursors | `IPS_CRITICAL_ALERT`, `MULTI_SECURITY_EVENTS` |
| Correlation Lookback | 30 minutes |
| Correlation Match Field | `destIp` |

**Recommended Action:** Hedef sistemi derhal izole edin. Disari giden trafigi analiz edin (C2 suphesi). Full malware taramasi yapin. Forensic inceleme basla.

### `LOGIN_THEN_CONFIG`

**Giris Sonrasi Hizli Config Degisikligi** — 🔴 CRITICAL

> Admin girisi ardindan kisa sure icinde yapilandirma degisikligi tespit edildi. Ic tehdit zinciri gostergesi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Client Check | `correlation` |
| Correlation Precursors | `ADMIN_LOGIN_OFF_HOURS`, `ADMIN_NEW_GEO`, `UNAUTH_ADMIN_LOGIN` |
| Correlation Lookback | 15 minutes |
| Correlation Match Field | `sourceIp` |

**Recommended Action:** Yapilan degisiklikleri derhal inceleyin. Admin kimligini dogrulayin. Gerekirse degisiklikleri geri alin. Oturumu sonlandirin.

### `MULTI_VECTOR_ATTACK`

**Coklu Vektor Saldirisi (APT)** — 🔴 CRITICAL

> Tek bir IP den 3 veya daha fazla farkli alarm tipi tespit edildi. Gelismis kalici tehdit (APT) gostergesi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 3 events |
| Time Window | 60 minutes |
| Log Type | `event` |
| Client Check | `correlation` |
| Correlation Precursors | `IPS_CRITICAL_ALERT`, `MALWARE_DETECTED`, `DNS_MALICIOUS`, `DNS_TUNNEL_SUSPECT`, `WEBFILTER_HIGH_RISK`, `VPN_BRUTE_FORCE`, `ADMIN_BRUTE_FORCE`, `DATA_EXFIL_SUSPECT`, `MULTI_SECURITY_EVENTS`, `DENIED_TRAFFIC_SPIKE` |
| Correlation Lookback | 60 minutes |
| Correlation Match Field | `sourceIp` |
| Min Distinct Codes | 3 |

**Recommended Action:** Kaynak IP yi tum katmanlarda derhal engelleyin. Tum hedef sistemleri inceleyin. Lateral movement kontrol edin. Olay mudahale prosedurunu aktive edin. IoC listesine ekleyin.

### `SECURITY_PROFILE_DISABLED`

**Guvenlik Profili Devre Disi** — 🔴 CRITICAL

> IPS, AV, WebFilter devre disi birakildi veya bypass edildi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 5 minutes |
| Threshold | ≥ 1 events |
| Time Window | 10 minutes |
| Log Type | `event` |
| Filter | `subtype == system and logdesc like %attribute% and cfgpath like %security%` |

**Recommended Action:** Immediately verify if change was authorized. Re-enable security profiles. Investigate who made the change and why. Audit affected traffic window.

### `SSLVPN_BRUTE_THEN_SUCCESS`

**SSL-VPN Brute Force Sonrasi Basarili Giris** — 🔴 CRITICAL

> Ayni IP den SSL-VPN brute force saldirisi ardindan basarili giris tespit edildi. Kimlik bilgileri ele gecirilmis olabilir.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Email Notify | ✓ |
| Log Type | `event` |
| Client Check | `correlation` |
| Correlation Precursors | `SSLVPN_MULTI_FAIL`, `VPN_BRUTE_FORCE`, `SSLVPN_LOCKOUT` |
| Correlation Lookback | 30 minutes |
| Correlation Match Field | `sourceIp` |

**Recommended Action:** ACIL: VPN oturumunu derhal sonlandirin. Kullanici hesabini kilitleyin. Kaynak IP yi kalici olarak engelleyin. Hesap aktivitelerini ve erisilen kaynaklari inceleyin. Sifre degisikligi zorunlu kilin.

### `VPN_GEO_THEN_EXFIL`

**Yeni Lokasyondan VPN + Veri Cikisi** — 🔴 CRITICAL

> Bilinmeyen lokasyondan VPN baglantisi ardindan yuksek hacimde veri transferi tespit edildi. Veri hirsizligi zinciri.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 60 minutes |
| Log Type | `traffic` |
| Client Check | `correlation` |
| Correlation Precursors | `ADMIN_NEW_GEO`, `VPN_LOGIN_OFF_HOURS`, `VPN_NEW_USER` |
| Correlation Lookback | 60 minutes |
| Correlation Match Field | `sourceIp` |

**Recommended Action:** VPN oturumunu derhal sonlandirin. Transfer edilen verileri belirleyin. Kullanici hesabini kilitleyin. Veri sizintisi prosedurunu baslatin.

### `WEBBLOCK_THEN_TUNNEL`

**Web Engeli Sonrasi DNS Tuneli** — 🔴 CRITICAL

> WebFilter tarafindan engellenen hosttan DNS tunelleme aktivitesi tespit edildi. Guvenlik atlatma denemesi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `dns` |
| Client Check | `correlation` |
| Correlation Precursors | `WEBFILTER_HIGH_RISK`, `DNS_MALICIOUS` |
| Correlation Lookback | 30 minutes |
| Correlation Match Field | `sourceIp` |

**Recommended Action:** Hostu izole edin. DNS trafigini detayli analiz edin. Malware taramasi yapin. DNS tunelleme araci kalintilari arayin.

### `ADMIN_NEW_GEO`

**Yeni Ulke/IP'den Admin Girisi** — 🟠 HIGH

> Daha once gorulmemis Geo-IP veya ASN anomalisi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == system and action == login and status == success` |
| Client Check | `geo-anomaly` |

**Recommended Action:** Verify admin identity. Check if VPN/proxy is in use. Cross-reference with known admin locations. Force password reset if suspicious.

### `CONFIG_THEN_SPIKE`

**Config Degisikligi Sonrasi Trafik Artisi** — 🟠 HIGH

> Yapilandirma degisikligi ile trafik anomalisi arasinda zamansal korelasyon.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 15 minutes |
| Log Type | `event` |
| Filter | `subtype == system and action == config-change` |
| Client Check | `anomaly` |

**Recommended Action:** Review the config change that preceded the spike. Check if new policy allows unwanted traffic. Correlate with user activity.

### `MULTI_SECURITY_EVENTS`

**Ayni Kaynaktan Coklu Guvenlik Olaylari** — 🟠 HIGH

> Tek bir IP/host'tan korelasyonlu saldirilar tespit edildi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 15 minutes |
| Threshold | ≥ 10 events |
| Time Window | 15 minutes |
| Log Type | `attack` |
| Client Check | `brute-force-group` |

**Recommended Action:** Block source IP immediately. Investigate all affected targets. Check for lateral movement. Create threat intelligence entry.

### `TOP_THREAT_WEIGHT`

**En Yuksek Tehdit Skoru** — 🟠 HIGH

> FortiView top-threats analizinde kritik seviye tehdit skoru tespit edildi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 30 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `attack` |
| Client Check | `anomaly` |
| FortiView | `top-threats` |

**Recommended Action:** Tehdit kaynagini ve hedefini araştırın. Saldirinin engellenip engellenmedigini kontrol edin. IPS imzalarini guncelleyin. Tehdit gostergeleri icin IoC kaydi olusturun.

### `RISKY_CLOUD_APP`

**Riskli Bulut Uygulamasi** — 🟡 MEDIUM

> FortiView top-cloud-applications analizinde yuksek riskli bulut uygulamasi kullanimi tespit edildi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 1 events |
| Time Window | 30 minutes |
| Log Type | `app-ctrl` |
| Client Check | `anomaly` |
| FortiView | `top-cloud-applications` |

**Recommended Action:** Kullanicilari ve riskli uygulamalari belirleyin. Is ihtiyacini degerlendirin. Yetkisiz bulut uygulamalarini engelleyin. Uygulama kontrol politikalarini guncelleyin.

### `SHADOW_IT_DETECTED`

**Shadow IT Tespiti** — 🟡 MEDIUM

> Daha once gorulmemis uygulama veya servisler tespit edildi.

| Property | Value |
|---|---|
| Category | SOC Correlation |
| Source | FortiAnalyzer |
| Cooldown | 60 minutes |
| Threshold | ≥ 3 events |
| Time Window | 30 minutes |
| Log Type | `app-ctrl` |
| Filter | `action == detected` |

**Recommended Action:** Identify applications and users. Assess risk of new applications. Update application control policies. Educate users on IT policy.

---

*This document was auto-generated on 2026-05-18. Do not edit manually — regenerate with `npx tsx scripts/generate-alarm-catalog.ts`.*