export interface NmsPortState {
  monitored: boolean;
  adminStatus: string;
  operStatus: string;
  operUpSince: Date | string | null;
  downSince: Date | string | null;
  lastPolledAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

function timestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function isNmsPortDownCandidate(
  state: NmsPortState,
  now = Date.now(),
  options: { minimumDownMs?: number; freshnessMs?: number } = {}
): boolean {
  const minimumDownMs = options.minimumDownMs ?? 5 * 60 * 1000;
  const freshnessMs = options.freshnessMs ?? 10 * 60 * 1000;
  const collectedAt = timestamp(state.lastPolledAt) ?? timestamp(state.updatedAt);
  const downSince = timestamp(state.downSince);

  return state.monitored
    && state.adminStatus === 'up'
    && state.operStatus === 'down'
    && timestamp(state.operUpSince) !== null
    && collectedAt !== null
    && now - collectedAt < freshnessMs
    && downSince !== null
    && now - downSince >= minimumDownMs;
}

export function isNmsPortRecovered(
  state: Pick<NmsPortState, 'monitored' | 'operStatus' | 'operUpSince'>,
  now = Date.now(),
  minimumUpMs = 5 * 60 * 1000
): boolean {
  if (!state.monitored) return true;
  const upSince = timestamp(state.operUpSince);
  return state.operStatus === 'up'
    && upSince !== null
    && now - upSince >= minimumUpMs;
}
