import { createHash } from 'node:crypto';

/** Keep target/user incident grouping separate from readable deviceName metadata. */
export function fortiGateAlarmEntity(targetKey: string, username?: string) {
  return username === undefined
    ? { entityType: 'fortigate-target', entityId: targetKey }
    : { entityType: 'fortigate-user', entityId: JSON.stringify([targetKey, username]) };
}

/** Active-session counters change every poll and must never identify an occurrence. */
export function fortiGateSessionOccurrenceId(targetKey: string, sessions: Array<Record<string, unknown>>): string {
  const evidence = sessions.map(session => JSON.stringify([
    session.user, session.loginTime, session.remoteIp, session.assignedIp, session.interface,
  ])).sort();
  const digest = createHash('sha256').update(JSON.stringify([targetKey, evidence])).digest('hex');
  return `fortigate-session:v1:${digest}`;
}
