import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

export class AlarmExecutionError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'AlarmExecutionError'; }
}

export interface AlarmExecution {
  signal: AbortSignal;
  assertActive(): void;
  fence(tx: Prisma.TransactionClient): Promise<void>;
}

const root = globalThis as typeof globalThis & { __infrascopeAlarmExecution?: AsyncLocalStorage<AlarmExecution | undefined> };
const storage = root.__infrascopeAlarmExecution ??= new AsyncLocalStorage<AlarmExecution | undefined>();
export const currentAlarmExecution = () => storage.getStore();
export function assertAlarmExecutionActive(): void { currentAlarmExecution()?.assertActive(); }
export function withAlarmExecution<T>(execution: AlarmExecution, work: () => T): T { return storage.run(execution, work); }
export function withoutAlarmExecution<T>(work: () => T): T { return storage.run(undefined, work); }

export function alarmExecutionSignal(parent?: AbortSignal): AbortSignal | undefined {
  assertAlarmExecutionActive();
  const signal = currentAlarmExecution()?.signal;
  return signal && parent ? AbortSignal.any([signal, parent]) : signal ?? parent;
}

/** A timed-out search cannot keep running under the still-live parent check. */
export async function withAlarmStage<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
  const parent = currentAlarmExecution(), controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const stage: AlarmExecution = {
    signal: parent ? AbortSignal.any([parent.signal, controller.signal]) : controller.signal,
    assertActive() {
      parent?.assertActive();
      if (controller.signal.aborted || Date.now() >= deadline) throw new AlarmExecutionError('ALARM_STAGE_TIMEOUT', 'Alarm search timed out or was cancelled');
    },
    async fence(tx) { stage.assertActive(); await parent?.fence(tx); stage.assertActive(); },
  };
  try {
    parent?.assertActive();
    return await Promise.race([
      // Direct engine invocations outside a finite runner retain their existing DB contract.
      parent ? withAlarmExecution(stage, work) : work(),
      new Promise<never>((_, reject) => {
        cancel = () => { controller.abort(); reject(new AlarmExecutionError('ALARM_STAGE_TIMEOUT', 'Alarm search timed out or was cancelled')); };
        parent?.signal.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(cancel, timeoutMs);
      }),
    ]);
  } finally {
    controller.abort();
    if (timer !== undefined) clearTimeout(timer);
    if (cancel) parent?.signal.removeEventListener('abort', cancel);
  }
}
