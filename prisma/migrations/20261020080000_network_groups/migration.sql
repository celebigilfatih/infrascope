CREATE TABLE "network_groups" (
 "id" TEXT NOT NULL, "name" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
 "kind" TEXT NOT NULL DEFAULT 'WAN', "sourceDeviceId" TEXT NOT NULL, "sourcePortId" TEXT,
 "positions" JSONB NOT NULL DEFAULT '{}', "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "network_groups_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "network_group_members" (
 "groupId" TEXT NOT NULL, "buildingId" TEXT NOT NULL,
 CONSTRAINT "network_group_members_pkey" PRIMARY KEY ("groupId", "buildingId")
);
CREATE UNIQUE INDEX "network_groups_organizationId_name_key" ON "network_groups"("organizationId", "name");
CREATE INDEX "network_groups_sourceDeviceId_idx" ON "network_groups"("sourceDeviceId");
CREATE UNIQUE INDEX "network_group_members_buildingId_key" ON "network_group_members"("buildingId");
ALTER TABLE "network_groups" ADD CONSTRAINT "network_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "network_groups" ADD CONSTRAINT "network_groups_sourceDeviceId_fkey" FOREIGN KEY ("sourceDeviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "network_group_members" ADD CONSTRAINT "network_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "network_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "network_group_members" ADD CONSTRAINT "network_group_members_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
