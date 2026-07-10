-- Add SSH credentials used by NMS config backup/polling flows.
ALTER TABLE "devices"
ADD COLUMN IF NOT EXISTS "ssh_username" TEXT,
ADD COLUMN IF NOT EXISTS "ssh_password" TEXT,
ADD COLUMN IF NOT EXISTS "ssh_port" INTEGER DEFAULT 22;
