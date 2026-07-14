import type { Prisma } from '@prisma/client';

const NMS_DEVICE_ID_LOCK = 2_147_380_047;

export async function reserveNextNmsDeviceId(tx: Prisma.TransactionClient): Promise<number> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${NMS_DEVICE_ID_LOCK})`;
  const rows = await tx.$queryRaw<Array<{ nextId: bigint | number }>>`
    SELECT COALESCE(MAX(nms_device_id), 0) + 1 AS "nextId"
    FROM devices
    WHERE nms_device_id IS NOT NULL
  `;
  const nextId = Number(rows[0]?.nextId || 1);
  if (!Number.isSafeInteger(nextId) || nextId < 1) {
    throw new Error('Unable to reserve an NMS device identifier');
  }
  return nextId;
}
