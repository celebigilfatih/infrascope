-- CreateTable
CREATE TABLE "nms_device_metrics" (
    "id" TEXT NOT NULL,
    "nms_device_id" INTEGER NOT NULL,
    "metric_type" TEXT NOT NULL,
    "metric_name" TEXT,
    "metric_value" DECIMAL(10,2),
    "metric_unit" TEXT,
    "threshold_warning" DECIMAL(10,2),
    "threshold_critical" DECIMAL(10,2),
    "status" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nms_device_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nms_interface_metrics" (
    "id" TEXT NOT NULL,
    "nms_device_id" INTEGER NOT NULL,
    "interface_index" INTEGER NOT NULL,
    "interface_name" TEXT,
    "description" TEXT,
    "admin_status" TEXT,
    "oper_status" TEXT,
    "speed" BIGINT,
    "in_octets" BIGINT,
    "out_octets" BIGINT,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nms_interface_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nms_backups" (
    "id" TEXT NOT NULL,
    "nms_device_id" INTEGER NOT NULL,
    "backup_type" TEXT NOT NULL DEFAULT 'config',
    "backup_file" TEXT,
    "description" TEXT,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "configuration" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nms_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nms_device_metrics_nms_device_id_collected_at_idx" ON "nms_device_metrics"("nms_device_id", "collected_at");

-- CreateIndex
CREATE INDEX "nms_device_metrics_metric_type_idx" ON "nms_device_metrics"("metric_type");

-- CreateIndex
CREATE INDEX "nms_device_metrics_collected_at_idx" ON "nms_device_metrics"("collected_at");

-- CreateIndex
CREATE INDEX "nms_interface_metrics_nms_device_id_interface_index_collect_idx" ON "nms_interface_metrics"("nms_device_id", "interface_index", "collected_at");

-- CreateIndex
CREATE INDEX "nms_interface_metrics_collected_at_idx" ON "nms_interface_metrics"("collected_at");

-- CreateIndex
CREATE INDEX "nms_backups_nms_device_id_idx" ON "nms_backups"("nms_device_id");

-- CreateIndex
CREATE INDEX "nms_backups_created_at_idx" ON "nms_backups"("created_at");

-- AddForeignKey
ALTER TABLE "nms_device_metrics" ADD CONSTRAINT "nms_device_metrics_nms_device_id_fkey" FOREIGN KEY ("nms_device_id") REFERENCES "devices"("nms_device_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nms_interface_metrics" ADD CONSTRAINT "nms_interface_metrics_nms_device_id_fkey" FOREIGN KEY ("nms_device_id") REFERENCES "devices"("nms_device_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nms_backups" ADD CONSTRAINT "nms_backups_nms_device_id_fkey" FOREIGN KEY ("nms_device_id") REFERENCES "devices"("nms_device_id") ON DELETE CASCADE ON UPDATE CASCADE;
