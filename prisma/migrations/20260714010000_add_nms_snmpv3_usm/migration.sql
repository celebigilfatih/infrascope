ALTER TABLE "devices"
  ADD COLUMN "snmp_v3_username" TEXT,
  ADD COLUMN "snmp_v3_security_level" TEXT,
  ADD COLUMN "snmp_v3_auth_protocol" TEXT,
  ADD COLUMN "snmp_v3_auth_password" TEXT,
  ADD COLUMN "snmp_v3_privacy_protocol" TEXT,
  ADD COLUMN "snmp_v3_privacy_password" TEXT;
