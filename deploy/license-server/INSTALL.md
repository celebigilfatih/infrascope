# InfraScope Central License Server

This deployment is for the InfraScope operator only. Do not include this
directory in customer on-premise installation packages.

## DNS and TLS

Create an `A` record for `lisans.webmahsul.com.tr` pointing to the VPS or load
balancer that hosts this deployment.

Terminate TLS with your preferred reverse proxy:

- Caddy/Nginx/Traefik on the host
- the optional Caddy service in `docker-compose.yml`
- an external load balancer

The public URL must be:

```text
https://lisans.webmahsul.com.tr
```

## Install

This deployment uses an existing PostgreSQL server. It does not start a
PostgreSQL container.

```bash
cd deploy/license-server
cp .env.example .env
```

Fill these values with strong secrets:

```env
DB_HOST=host.docker.internal
DB_PORT=5432
POSTGRES_PASSWORD=
DATABASE_URL=postgresql://infrascope_license:<password>@host.docker.internal:5432/infrascope_license?schema=public
NEXTAUTH_SECRET=
LICENSE_JWT_SECRET=
```

Create the database and user on the existing PostgreSQL server:

```sql
CREATE USER infrascope_license WITH PASSWORD '<strong-password>';
CREATE DATABASE infrascope_license OWNER infrascope_license;
GRANT ALL PRIVILEGES ON DATABASE infrascope_license TO infrascope_license;
```

Start the service:

```bash
docker compose up -d
```

If this deployment ever needs to call private infrastructure with self-signed
certificates, place the issuing CA certificate under `./certs` and configure the
matching `*_TLS_CA_CERT_PATH`. Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0` in
production.

Check health:

```bash
curl https://lisans.webmahsul.com.tr/api/health/ready
```

## Create a License

Run the license generator against the central license server database:

```bash
DATABASE_URL="postgresql://infrascope_license:<password>@localhost:5432/infrascope_license" \
npm run license:create -- \
  --company "Acme Ltd" \
  --contact "Ali Veli" \
  --email "admin@acme.com" \
  --tier STANDARD \
  --max-devices 250 \
  --max-users 10 \
  --days 365 \
  --activation-limit 1
```

Send only the generated license key to the customer. Customer installations must
use:

```env
LICENSE_SERVER_URL=https://lisans.webmahsul.com.tr
LICENSE_KEY=<generated-key>
```

Never send this directory, the license database, or `LICENSE_JWT_SECRET` to a
customer.
