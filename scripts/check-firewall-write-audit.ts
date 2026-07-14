import assert from 'node:assert/strict';
import { executeAuditedFirewallWrite } from '../lib/firewall/write-audit-contract';

async function main() {
  let operationCalls = 0;
  let outcomeCalls = 0;
  await assert.rejects(() => executeAuditedFirewallWrite(
    { action: 'test' },
    async () => { operationCalls += 1; },
    {
      reserve: async () => { throw new Error('audit unavailable'); },
      recordOutcome: async () => { outcomeCalls += 1; },
    }
  ));
  assert.equal(operationCalls, 0, 'external write must not run when audit reservation fails');
  assert.equal(outcomeCalls, 0, 'outcome must not run without a reservation');

  const order: string[] = [];
  const request = { action: 'test' };
  const reservation = { operationId: 'operation-1', auditId: 'audit-1', request };
  const success = await executeAuditedFirewallWrite(
    request,
    async () => { order.push('operation'); return true; },
    {
      reserve: async () => { order.push('reserve'); return reservation; },
      recordOutcome: async (_reservation, outcome) => { order.push(`outcome:${outcome}`); },
    }
  );
  assert.equal(success.result, true);
  assert.deepEqual(order, ['reserve', 'operation', 'outcome:SUCCEEDED']);

  const failure = new Error('upstream failed');
  let recordedError: unknown;
  await assert.rejects(() => executeAuditedFirewallWrite(
    request,
    async () => { throw failure; },
    {
      reserve: async () => reservation,
      recordOutcome: async (_reservation, outcome, error) => {
        assert.equal(outcome, 'FAILED');
        recordedError = error;
      },
    }
  ), failure);
  assert.equal(recordedError, failure);

  let successOutcomeAttempts = 0;
  await assert.rejects(() => executeAuditedFirewallWrite(
    request,
    async () => true,
    {
      reserve: async () => reservation,
      recordOutcome: async (_reservation, outcome) => {
        successOutcomeAttempts += 1;
        assert.equal(outcome, 'SUCCEEDED');
        throw new Error('audit completion unavailable');
      },
    }
  ));
  assert.equal(successOutcomeAttempts, 1, 'a failed success record must not be rewritten as an operation failure');

  console.log('Firewall write audit contract checks passed.');
}

void main();
