import type { Prisma, PrismaClient } from '@prisma/client';
import { currentAlarmExecution } from './execution-context';

export async function verifyAlarmExecution(client: PrismaClient): Promise<void> {
  const execution = currentAlarmExecution();
  if (!execution) return;
  execution.assertActive();
  await client.$transaction(tx => execution.fence(tx), { maxWait: 5_000, timeout: 10_000 });
  execution.assertActive();
}

/** Preserve the shared client; fence only operations initiated by a finite alarm run. */
export function alarmExecutionPrisma<T extends object>(client: T): T {
  const base = client as unknown as PrismaClient;
  const delegates = new Map<PropertyKey, object>();
  const reads = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);
  async function guarded(work: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    const execution = currentAlarmExecution();
    execution?.assertActive();
    return base.$transaction(async tx => {
      if (execution) await execution.fence(tx);
      const result = await work(tx);
      execution?.assertActive();
      return result;
    }, { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 10_000 });
  }
  return new Proxy(client, {
    get(target, key) {
      const value = Reflect.get(target as object, key);
      if (typeof key !== 'string') return value;
      if (key === '$transaction') return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => {
        if (!currentAlarmExecution()) return value.call(target, work, options);
        return guarded(work);
      };
      if (['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe'].includes(key)) return (...args: unknown[]) => {
        if (!currentAlarmExecution()) return value.apply(target, args);
        return guarded(tx => Reflect.apply(Reflect.get(tx, key), tx, args));
      };
      if (key.startsWith('$') || !value || typeof value !== 'object') return typeof value === 'function' ? value.bind(target) : value;
      if (!delegates.has(key)) delegates.set(key, new Proxy(value, {
        get(model, operation) {
          const method = Reflect.get(model, operation);
          if (typeof method !== 'function') return method;
          return async (...args: unknown[]) => {
            const execution = currentAlarmExecution();
            if (!execution) return method.apply(model, args);
            execution.assertActive();
            if (!reads.has(String(operation))) {
              return guarded(tx => Reflect.get(Reflect.get(tx, key), operation).apply(Reflect.get(tx, key), args));
            }
            const result = await method.apply(model, args);
            execution.assertActive();
            return result;
          };
        },
      }));
      return delegates.get(key);
    },
  });
}
