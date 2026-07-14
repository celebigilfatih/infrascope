export type FirewallWriteAuditOutcome = 'SUCCEEDED' | 'FAILED';

export type FirewallWriteAuditReservation<Request> = {
  operationId: string;
  auditId: string;
  request: Request;
};

export type FirewallWriteAuditDependencies<Request> = {
  reserve: (request: Request) => Promise<FirewallWriteAuditReservation<Request>>;
  recordOutcome: (
    reservation: FirewallWriteAuditReservation<Request>,
    outcome: FirewallWriteAuditOutcome,
    error?: unknown
  ) => Promise<void>;
};

export async function executeAuditedFirewallWrite<Request, Result>(
  request: Request,
  operation: () => Promise<Result>,
  dependencies: FirewallWriteAuditDependencies<Request>
): Promise<{ result: Result; reservation: FirewallWriteAuditReservation<Request> }> {
  const reservation = await dependencies.reserve(request);

  let result: Result;
  try {
    result = await operation();
  } catch (error) {
    await dependencies.recordOutcome(reservation, 'FAILED', error);
    throw error;
  }

  await dependencies.recordOutcome(reservation, 'SUCCEEDED');
  return { result, reservation };
}
