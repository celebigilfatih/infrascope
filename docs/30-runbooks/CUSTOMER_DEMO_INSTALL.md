# Runbook: Customer Server Demo Install and License Activation

> **Kategori:** Demo / onboarding
> **Amaç:** Müşteri sunucusunda tek-tenant Docker kurulumu yapıp lisansı merkezi sunucudan aktive etmek.
> **Merkezi lisans sunucusu:** `https://lisans.webmahsul.com.tr`

---

## 1. Demo Modeli

InfraScope müşteriye **tek-tenant Docker deployment** olarak kurulur. Müşteri verisi kendi PostgreSQL veritabanında kalır. Lisans üretimi, aktivasyon, validate ve heartbeat işlemleri merkezi lisans sunucusundan yönetilir.

Müşteriye **verilmeyecek** parçalar:

- `deploy/license-server/`
- `DEPLOYMENT_MODE=license-server`
- `LICENSE_SERVER_MODE=true`
- lisans oluşturma scriptleri veya merkezi lisans DB erişimi

Müşteriye verilecek kritik bilgiler:

```env
LICENSE_SERVER_URL=https://lisans.webmahsul.com.tr
LICENSE_KEY=IS-2026-XXXX-XXXX-XXXX
```

---

## 2. Demo Öncesi Lisans Hazırlığı

Merkezi panele gir:

```text
https://lisans.webmahsul.com.tr/license-admin
```

`Create License` ile demo lisansı oluştur:

| Alan | Değer |
|---|---|
| Company | Müşteri firma adı |
| Contact | Müşteri yetkilisi |
| Email | Müşteri yetkilisi emaili |
| Tier | `STANDARD` |
| Max Devices | `250` |
| Max Users | `10` |
| Days | `30` |
| Activation Limit | `1` |
| Notes | `POC / Demo license` |

Oluşan key'i müşteriye ver. Demo için key formatı:

```text
IS-2026-XXXX-XXXX-XXXX
```

---

## 3. Müşteri Sunucusu Ön Kontrolü

Müşteri sunucusunda:

```bash
docker --version
docker compose version
docker info
curl -I https://lisans.webmahsul.com.tr
```

Port kontrolü:

```bash
ss -ltnp | grep ':8170' || true
```

Beklenen:

- Docker Engine çalışıyor.
- Docker Compose v2 var.
- Sunucudan `https://lisans.webmahsul.com.tr` erişilebilir.
- Demo portu boş; önerilen port `8170`.
- Image registry erişimi hazır veya image demo öncesi pull/build edilmiş.

---

## 4. Müşteri Sunucusunda İlk Kurulum

Kurulum klasörü:

```bash
mkdir infrascope
cd infrascope
```

Müşteri paketinde bulunacak dosyalar:

```text
docker-compose.yml
.env.example
install.sh
update.sh
INSTALL.md
DEMO_INSTALL.md
```

Kurulum:

```bash
cp .env.example .env
chmod +x install.sh update.sh
./install.sh
```

Script sorularında:

| Soru | Demo değeri |
|---|---|
| License key | Merkezi panelden üretilen demo key |
| App URL | `http://SUNUCU_IP:8170` |
| Host port | `8170` |
| Version | `.env.example` içindeki pinli sürüm, örn. `1.0.0` |

Script otomatik üretir:

- `NEXTAUTH_SECRET`
- `POSTGRES_PASSWORD`
- `data/license-cache`
- `data/machine-id`

Servis kontrolü:

```bash
docker compose ps
docker compose logs -f app
```

Container readiness kontrolü:

```bash
curl -sf http://localhost:8170/api/health/ready
```

Not: `/api/health` ve `/api/health/alarms`, entegrasyonlar yapılandırılmadan `degraded` dönebilir. Docker readiness için `/api/health/ready` kullanılır.

---

## 5. İlk Açılış Senaryosu

Browser:

```text
http://SUNUCU_IP:8170/setup
```

Wizard akışı:

1. Lisans aktivasyonu.
2. Firma / organization adı.
3. İlk admin kullanıcı.
4. Login ekranına yönlendirme.

İlk admin bilgileri müşteri tarafından belirlenir. Default admin yoktur.

Login sonrası gösterilecekler:

- Dashboard açılır.
- `/settings/license` lisans durumunu gösterir.
- Merkezi `/license-admin` panelinde aynı lisans için `activationCount: 1` görünür.
- License detail içinde machine activation kaydı oluşur.

---

## 6. Demo Anlatım Notları

- Her müşterinin ayrı Docker/Postgres kurulumu vardır.
- Müşteri verisi müşteri sunucusunda kalır.
- Lisans merkezi sunucudan doğrulanır.
- Activation limit `1` ise lisans tek sunucuda aktiftir.
- Sunucu değişirse eski activation merkezi panelden deactivate edilir.
- Lisans suspend/revoke edilirse validate başarısız olur.
- Merkezi lisans sunucusu müşteriye kurulmaz.

---

## 7. Fallback

Müşteri sunucusunda Docker, port, firewall veya registry sorunu çıkarsa local demo kullan:

```text
http://localhost:8170/login
```

Anlatım cümlesi:

```text
Kurulum modeli aynı; şu an local instance üzerinden müşteri on-prem kurulum akışını simüle ediyoruz.
```

---

## 8. Kabul Kriterleri

- `docker compose ps` app ve postgres servislerini ayakta gösterir.
- `http://SUNUCU_IP:8170/setup` açılır.
- Lisans aktivasyonu başarılı olur.
- İlk admin oluşturulur.
- Login yapılır ve dashboard açılır.
- Merkezi panelde aktivasyon kaydı görünür.
