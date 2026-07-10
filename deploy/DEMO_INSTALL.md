# InfraScope Customer Demo Install

Bu dosya müşteri sunucusunda canlı demo için kısa kurulum akışıdır. Merkezi lisans sunucusu müşteriye kurulmaz; müşteri instance sadece lisans doğrulaması için aşağıdaki adrese bağlanır:

```text
https://lisans.webmahsul.com.tr
```

## 1. Ön Kontrol

```bash
docker --version
docker compose version
docker info
curl -I https://lisans.webmahsul.com.tr
ss -ltnp | grep ':8170' || true
```

Beklenen:

- Docker çalışıyor.
- Docker Compose v2 var.
- `lisans.webmahsul.com.tr` erişilebilir.
- `8170` portu boş veya kullanılacak başka port seçildi.

## 2. Lisans Bilgisi

Demo lisansı InfraScope merkezi panelinden üretilir:

```text
https://lisans.webmahsul.com.tr/license-admin
```

Müşteri `.env` içinde sadece bu bilgileri kullanır:

```env
LICENSE_SERVER_URL=https://lisans.webmahsul.com.tr
LICENSE_KEY=IS-2026-XXXX-XXXX-XXXX
```

## 3. Kurulum

```bash
mkdir infrascope
cd infrascope
cp env.example .env
chmod +x install.sh update.sh
./install.sh
```

Not: Paket içinde sadece `.env.example` varsa `cp .env.example .env` komutunu kullan. Başında nokta olan dosyalar Windows/macOS tarafında gizli görünebilir.

Script sorularında:

```text
License key: merkezi panelden üretilen demo key
App URL: http://SUNUCU_IP:8170
Host port: 8170
```

Script otomatik üretir:

- `NEXTAUTH_SECRET`
- `POSTGRES_PASSWORD`
- `data/license-cache`
- `data/machine-id`

## 4. Kontrol

```bash
docker compose ps
curl -sf http://localhost:8170/api/health/ready
docker compose logs -f app
```

`/api/health/ready` app ve DB readiness kontrolüdür. Entegrasyonlar henüz yapılandırılmadıysa `/api/health` veya `/api/health/alarms` `degraded` dönebilir.

## 5. İlk Açılış

Browser:

```text
http://SUNUCU_IP:8170/setup
```

Wizard:

1. License activation
2. Company / organization
3. First admin account
4. Login

Default admin yoktur. İlk admin müşteri tarafından bu wizard içinde oluşturulur.

## 6. Demo Sonrası Doğrulama

Merkezi panelde ilgili lisansı aç:

```text
https://lisans.webmahsul.com.tr/license-admin
```

Beklenen:

- License status: `ACTIVE`
- Activation count: `1`
- Machine activation kaydı görünür
