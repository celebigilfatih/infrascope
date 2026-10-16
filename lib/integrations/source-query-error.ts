/** A source failure must never be represented by an authoritative empty dataset. */
export class SourceQueryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'SourceQueryError';
  }
}

export function throwIfSourceCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new SourceQueryError('SOURCE_CANCELLED', 'Source operation was cancelled');
}

/** Bound the whole operation, including response parsing, and cancel its I/O. */
export async function withSourceDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new SourceQueryError('SOURCE_CANCELLED', 'Source operation was cancelled'));
    };
    if (parentSignal?.aborted) { cancel(); return; }
    parentSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new SourceQueryError('SOURCE_TIMEOUT', 'Source operation exceeded its deadline'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, Promise.resolve().then(() => {
      throwIfSourceCancelled(controller.signal);
      return operation(controller.signal);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (cancel) parentSignal?.removeEventListener('abort', cancel);
  }
}

export function waitForSource(ms: number, signal: AbortSignal): Promise<void> {
  throwIfSourceCancelled(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new SourceQueryError('SOURCE_CANCELLED', 'Source operation was cancelled'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
