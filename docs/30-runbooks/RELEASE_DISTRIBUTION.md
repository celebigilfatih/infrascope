# Runbook: Release and Customer Distribution

> Amaç: InfraScope uygulamasını kalıcı dağıtım modeliyle yayınlamak.
> Model: kaynak kod private ana repoda kalır, Docker image GHCR'ye push edilir, müşteri sadece installer repo/zip ve lisans key alır.

## 1. Dağıtım Modeli

- Ana kaynak kod reposu: `celebigilfatih/infrascope`
- Müşteri installer repo: `celebigilfatih/infrascope-customer-install`
- Docker image registry: `ghcr.io/celebigilfatih/infrascope`
- Merkezi lisans server: `https://lisans.webmahsul.com.tr`

Müşteri ana kaynak kod reposuna erişmez. Uygulama dosyalarını kaynak kod olarak çekmez; çalışan uygulama Docker image içinde gelir.

## 2. Image Yayınlama

GitHub Actions workflow'u tag push ile image yayınlar.

```bash
git tag v1.0.0
git push origin v1.0.0
```

Beklenen image:

```text
ghcr.io/celebigilfatih/infrascope:1.0.0
```

Workflow manuel de çalıştırılabilir:

```text
GitHub → Actions → Publish InfraScope Image → Run workflow → version=1.0.0
```

## 3. Customer Deploy Paketi

```bash
VERSION=1.0.0 npm run deploy:package:customer
```

Beklenen çıktı:

```text
dist/infrascope-customer-deploy-1.0.0.zip
```

Paket içeriği:

```text
docker-compose.yml
.env.example
install.sh
update.sh
INSTALL.md
infrascope_customer_cookbook.html
```

Paket içinde `deploy/license-server/` bulunmamalıdır.

## 4. Installer Repo Yayını

Customer deploy zip içeriği `celebigilfatih/infrascope-customer-install` reposuna tag'li olarak koyulur.

```bash
git clone git@github.com:celebigilfatih/infrascope-customer-install.git /tmp/infrascope-customer-install
cd /tmp/infrascope-customer-install
rm -rf ./*
unzip /path/to/dist/infrascope-customer-deploy-1.0.0.zip
cp -R infrascope/* .
rm -rf infrascope
git add .
git commit -m "release: customer install v1.0.0"
git tag v1.0.0
git push origin main --tags
```

## 5. Müşteriye Verilecek Bilgiler

```text
Installer repo: https://github.com/celebigilfatih/infrascope-customer-install
Branch/tag: v1.0.0
Image: ghcr.io/celebigilfatih/infrascope:1.0.0
License server: https://lisans.webmahsul.com.tr
License key: IS-2026-XXXX-XXXX-XXXX
```

Private erişim gerekiyorsa:

- Installer repo için read-only deploy key veya fine-grained token.
- GHCR private image için `read:packages` yetkili token.
- Token ana kaynak kod reposuna erişmemelidir.

## 6. Müşteri Kurulum Komutu

```bash
git clone --branch v1.0.0 https://github.com/celebigilfatih/infrascope-customer-install.git infrascope
cd infrascope
docker login ghcr.io
cp .env.example .env
chmod +x install.sh update.sh
./install.sh
```

Kurulum sırasında:

```text
License key: müşteriye üretilen key
Application URL: http://SERVER_IP:8170
Host port: 8170
```

## 7. Doğrulama

```bash
docker pull ghcr.io/celebigilfatih/infrascope:1.0.0
docker compose ps
curl -sf http://localhost:8170/api/health/ready
```

Tarayıcı:

```text
http://SERVER_IP:8170/setup
```
