import type { Prisma } from '@prisma/client';

const NMS_DEVICE_ID_LOCK = 2_147_380_047;

/** Call in ReadCommitted isolation and persist the ID before the transaction completes. */
export async function reserveNextNmsDeviceId(tx: Prisma.TransactionClient): Promise<number> {
  // Returning void directly is not supported by Prisma's raw-query decoder.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${NMS_DEVICE_ID_LOCK})`;
  const rows = await tx.$queryRaw<Array<{ nextId: bigint | number }>>`
    SELECT COALESCE(MAX(nms_device_id)::bigint, 0) + 1 AS "nextId"
    FROM devices
    WHERE nms_device_id IS NOT NULL
  `;
  const raw = rows[0]?.nextId;
  const nextId = Number(raw);
  if ((typeof raw !== 'bigint' && typeof raw !== 'number') || !Number.isSafeInteger(nextId) || nextId < 1 || nextId > 2_147_483_647) {
    throw new Error('Unable to reserve an NMS device identifier');
  }
  return nextId;
}
