# InfraScope On-Premise Installation

InfraScope customer deployments run as a single-tenant Docker installation. Customer data stays in the local PostgreSQL database; licensing is validated against the central InfraScope license service.

The central license service is:

```text
https://lisans.webmahsul.com.tr
```

Do not copy `deploy/license-server/` to customer servers. That directory is only for the InfraScope operator.

## Requirements

- Docker Engine
- Docker Compose v2
- Access to `registry.infrascope.com`
- InfraScope license key

## Install

```bash
mkdir infrascope
cd infrascope
cp .env.example .env
./install.sh
```

For a live customer demo, use the shorter operator checklist in:

```text
DEMO_INSTALL.md
```

Browser-ready HTML copies are also available in:

```text
Kurulum/customer_demo_install.html
Kurulum/demo_install.html
```

The installer will:

- create required `data/` and `logs/` directories
- ask for the license key, public app URL, and host port
- configure license validation against `https://lisans.webmahsul.com.tr`
- generate `NEXTAUTH_SECRET`
- generate `POSTGRES_PASSWORD`
- start the Docker services

## First Setup

Open:

```text
http://SERVER_IP:APP_PORT/setup
```

Complete:

1. License activation
2. Company / organization name
3. First admin user

There are no default admin credentials. The first admin is created only through the setup wizard.

## Self-Signed Infrastructure Certificates

Production installs must not disable TLS verification. If FortiAnalyzer, FortiGate, or vCenter uses a private/self-signed certificate, copy the issuing CA certificate into `./certs` and reference it from `.env`:

```env
FORTIANALYZER_TLS_CA_CERT_PATH=/app/certs/fortianalyzer-ca.pem
FORTIGATE_TLS_CA_CERT_PATH=/app/certs/fortigate-ca.pem
VMWARE_TLS_CA_CERT_PATH=/app/certs/vmware-ca.pem
```

Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` in production. The container will refuse to start with that setting.

## Operations

```bash
docker compose ps
curl -sf http://localhost:APP_PORT/api/health/ready
docker compose logs -f app
docker compose restart app
docker compose down
```

`/api/health/ready` checks application and database readiness for Docker health checks.
`/api/health` and `/api/health/alarms` include integrations and may report `degraded`
until FortiAnalyzer, VMware, NMS, or email are configured.

## Updates

Pin a release in `.env`:

```env
VERSION=1.0.0
```

Then run:

```bash
./update.sh
```
