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
- Access to `ghcr.io/celebigilfatih`
- If the image is private, a GHCR token with `read:packages`
- InfraScope license key

## Install

```bash
mkdir infrascope
cd infrascope
cp env.example .env
./install.sh
```

If your package only contains `.env.example`, use `cp .env.example .env` instead. Files starting with a dot may be hidden in Windows/macOS file explorers.

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
- generate `INTEGRATION_CREDENTIALS_KEY`
- generate `POSTGRES_PASSWORD`
- start the Docker services

If GHCR access is private, log in before running the installer:

```bash
docker login ghcr.io
docker pull ghcr.io/celebigilfatih/infrascope:1.0.0
```

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

## FortiGate Change Safety

Direct FortiGate quarantine changes are disabled by default:

```env
FORTIGATE_LEGACY_WRITES_ENABLED=false
```

FortiGate REST calls use a 15-second timeout by default. Read-only GET calls use a bounded retry policy; write calls are never retried automatically. Override only when a slow WAN path requires it:

```env
FORTIGATE_REQUEST_TIMEOUT_MS=15000
```

Keep this value `false` for customer installations. Firewall monitoring and read-only data collection continue to work. Controlled firewall changes will use the preview and approval workflow instead of the legacy direct-write endpoint.

## Integration Credential Encryption

FortiGate/FortiAnalyzer credentials, NMS SNMP/SSH credentials, and configuration backup content are stored with AES-256-GCM. The installer generates the encryption and internal NMS service keys in `.env`:

```env
INTEGRATION_CREDENTIALS_KEY=<generated-32-byte-key>
INTEGRATION_CREDENTIALS_PREVIOUS_KEY=
NMS_INTERNAL_TOKEN=<generated-random-token>
```

Back up `.env` securely. Losing both the active key and its backup makes encrypted integration credentials unrecoverable; users must enter them again. Do not copy the key into tickets, screenshots, logs, or the customer cookbook.

For controlled key rotation:

1. Generate a new 32-byte key with `openssl rand -base64 32`.
2. Move the current key to `INTEGRATION_CREDENTIALS_PREVIOUS_KEY` and put the new key in `INTEGRATION_CREDENTIALS_KEY`.
3. Restart the app and NMS sidecar. Startup automatically re-encrypts integration and NMS credentials with the new key.
4. Confirm integrations, SNMP polling, and SSH backup access, then clear `INTEGRATION_CREDENTIALS_PREVIOUS_KEY` and restart again.

Never remove the previous key before the first successful restart and integration check.

SSH host keys are not accepted automatically. In **NMS Izlenen Cihazlar > Izleme Ayarlari > SSH**, use **Anahtari Kontrol Et** and have an ADMIN approve the displayed SHA-256 fingerprint after comparing it with the network team's known value. A changed fingerprint blocks SSH until it is explicitly reviewed again. No terminal, CA file, or global TLS bypass is required for this SSH trust flow.

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
