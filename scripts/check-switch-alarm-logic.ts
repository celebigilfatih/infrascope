import assert from 'node:assert/strict';
import { isNmsPortDownCandidate, isNmsPortRecovered } from '../lib/alarms/nms-port-state';

const now = new Date('2026-07-15T12:00:00.000Z').getTime();
const base = {
  monitored: true,
  adminStatus: 'up',
  operStatus: 'down',
  operUpSince: new Date(now - 60 * 60 * 1000),
  downSince: new Date(now - 6 * 60 * 1000),
  lastPolledAt: new Date(now - 60 * 1000),
};

assert.equal(isNmsPortDownCandidate(base, now), true, 'stable monitored port down must trigger');
assert.equal(isNmsPortDownCandidate({ ...base, monitored: false }, now), false, 'unmonitored port must not trigger');
assert.equal(isNmsPortDownCandidate({ ...base, downSince: new Date(now - 4 * 60 * 1000) }, now), false, 'short outage must not trigger');
assert.equal(isNmsPortDownCandidate({ ...base, operUpSince: null }, now), false, 'port without an up baseline must not trigger');
assert.equal(isNmsPortDownCandidate({ ...base, lastPolledAt: new Date(now - 11 * 60 * 1000) }, now), false, 'stale data must not trigger');

assert.equal(isNmsPortRecovered({ monitored: false, operStatus: 'down', operUpSince: null }, now), true, 'disabled monitoring resolves the incident');
assert.equal(isNmsPortRecovered({ monitored: true, operStatus: 'up', operUpSince: new Date(now - 6 * 60 * 1000) }, now), true, 'stable recovery resolves the incident');
assert.equal(isNmsPortRecovered({ monitored: true, operStatus: 'up', operUpSince: new Date(now - 4 * 60 * 1000) }, now), false, 'brief recovery must not resolve');

console.log('Switch alarm state checks passed.');
