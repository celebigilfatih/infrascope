DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LicenseTier') THEN
    CREATE TYPE "LicenseTier" AS ENUM ('TRIAL', 'STANDARD', 'ENTERPRISE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LicenseStatus') THEN
    CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'SUSPENDED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerStatus') THEN
    CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActivationStatus') THEN
    CREATE TYPE "ActivationStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'EXPIRED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "customers" (
  "id" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "contact_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "tier" "LicenseTier" NOT NULL DEFAULT 'STANDARD',
  "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "licenses" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "tier" "LicenseTier" NOT NULL,
  "max_devices" INTEGER NOT NULL DEFAULT 50,
  "max_users" INTEGER NOT NULL DEFAULT 5,
  "valid_from" TIMESTAMP(3) NOT NULL,
  "valid_until" TIMESTAMP(3) NOT NULL,
  "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
  "activation_limit" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "license_activations" (
  "id" TEXT NOT NULL,
  "license_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "machine_id" TEXT NOT NULL,
  "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3),
  "ip_address" TEXT,
  "hostname" TEXT,
  "version" TEXT,
  "status" "ActivationStatus" NOT NULL DEFAULT 'ACTIVE',
  "usage_data" JSONB,

  CONSTRAINT "license_activations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "license_heartbeats" (
  "id" TEXT NOT NULL,
  "license_id" TEXT NOT NULL,
  "machine_id" TEXT NOT NULL,
  "device_count" INTEGER NOT NULL DEFAULT 0,
  "user_count" INTEGER NOT NULL DEFAULT 0,
  "app_version" TEXT,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "license_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customers_email_key" ON "customers"("email");
CREATE INDEX IF NOT EXISTS "customers_status_idx" ON "customers"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "licenses_key_key" ON "licenses"("key");
CREATE INDEX IF NOT EXISTS "licenses_customer_id_idx" ON "licenses"("customer_id");
CREATE INDEX IF NOT EXISTS "licenses_status_idx" ON "licenses"("status");
CREATE INDEX IF NOT EXISTS "licenses_key_idx" ON "licenses"("key");

CREATE UNIQUE INDEX IF NOT EXISTS "license_activations_license_id_machine_id_key" ON "license_activations"("license_id", "machine_id");
CREATE INDEX IF NOT EXISTS "license_activations_customer_id_idx" ON "license_activations"("customer_id");
CREATE INDEX IF NOT EXISTS "license_activations_status_idx" ON "license_activations"("status");

CREATE INDEX IF NOT EXISTS "license_heartbeats_license_id_created_at_idx" ON "license_heartbeats"("license_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_customer_id_fkey') THEN
    ALTER TABLE "licenses"
      ADD CONSTRAINT "licenses_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'license_activations_license_id_fkey') THEN
    ALTER TABLE "license_activations"
      ADD CONSTRAINT "license_activations_license_id_fkey"
      FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'license_activations_customer_id_fkey') THEN
    ALTER TABLE "license_activations"
      ADD CONSTRAINT "license_activations_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'license_heartbeats_license_id_fkey') THEN
    ALTER TABLE "license_heartbeats"
      ADD CONSTRAINT "license_heartbeats_license_id_fkey"
      FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
