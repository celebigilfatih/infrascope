interface Bounds { left: number; top: number; right: number; bottom: number }

/** Scroll may be dispatched after its geometry already settled, or elsewhere. */
export function topologyMenuAnchorMoved(before: Bounds | null, after: Bounds | null) {
  return !before || !after || (['left', 'top', 'right', 'bottom'] as const).some(side => Math.abs(before[side] - after[side]) > .5);
}
