/**
 * FortiAnalyzer Circuit Breaker
 * 
 * Prevents cascading failures when FortiAnalyzer is unavailable.
 * Pattern: If FA fails N consecutive times, open the circuit for M minutes.
 * 
 * States:
 * - CLOSED: Normal operation, requests go through
 * - OPEN: FA unavailable, requests fail fast (no actual API call)
 * - HALF_OPEN: After cool-down, allow one test request to check recovery
 * 
 * Benefits:
 * - Prevents wasting resources on failing FA requests
 * - Allows FA time to recover without being hammered
 * - Fast failure for downstream components
 */

// Circuit breaker configuration
const FAILURE_THRESHOLD = 3;        // Open circuit after 3 consecutive failures
const RECOVERY_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes cool-down before retry
const SUCCESS_THRESHOLD = 2;        // Close circuit after 2 consecutive successes in half-open

// Circuit state
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;  // Used in HALF_OPEN state
  lastFailureTime: number | null;
  openUntil: number | null;
  lastError: string | null;
}

// Module-level state (survives across requests in same process)
let circuitState: CircuitBreakerState = {
  state: 'CLOSED',
  failureCount: 0,
  successCount: 0,
  lastFailureTime: null,
  openUntil: null,
  lastError: null,
};

/**
 * Check if requests are allowed through the circuit
 */
export function canCallFA(): { allowed: boolean; reason?: string } {
  const now = Date.now();

  switch (circuitState.state) {
    case 'CLOSED':
      return { allowed: true };

    case 'OPEN':
      // Check if cool-down period has passed
      if (circuitState.openUntil && now > circuitState.openUntil) {
        // Transition to HALF_OPEN
        circuitState.state = 'HALF_OPEN';
        circuitState.successCount = 0;
        console.log('[FA-CircuitBreaker] Transitioning to HALF_OPEN (testing recovery)');
        return { allowed: true, reason: 'Testing recovery after cool-down' };
      }
      
      const remainingMs = circuitState.openUntil ? circuitState.openUntil - now : 0;
      const remainingMin = Math.ceil(remainingMs / 60000);
      return {
        allowed: false,
        reason: `Circuit OPEN - FA unavailable. Will retry in ${remainingMin} min. Last error: ${circuitState.lastError}`,
      };

    case 'HALF_OPEN':
      // Allow one request through to test recovery
      return { allowed: true, reason: 'Half-open test request' };

    default:
      return { allowed: true };
  }
}

/**
 * Record a successful FA operation
 */
export function recordFASuccess(): void {
  switch (circuitState.state) {
    case 'CLOSED':
      // Reset failure count on success
      circuitState.failureCount = 0;
      break;

    case 'HALF_OPEN':
      circuitState.successCount++;
      console.log(`[FA-CircuitBreaker] Success in HALF_OPEN (${circuitState.successCount}/${SUCCESS_THRESHOLD})`);
      
      if (circuitState.successCount >= SUCCESS_THRESHOLD) {
        // Enough successes, close the circuit
        circuitState.state = 'CLOSED';
        circuitState.failureCount = 0;
        circuitState.successCount = 0;
        circuitState.lastError = null;
        console.log('[FA-CircuitBreaker] Circuit CLOSED - FA recovered');
      }
      break;

    case 'OPEN':
      // Shouldn't happen, but handle gracefully
      break;
  }
}

/**
 * Record a failed FA operation
 */
export function recordFAFailure(error: string): void {
  const now = Date.now();

  switch (circuitState.state) {
    case 'CLOSED':
      circuitState.failureCount++;
      circuitState.lastFailureTime = now;
      circuitState.lastError = error.substring(0, 200);
      
      console.log(`[FA-CircuitBreaker] Failure ${circuitState.failureCount}/${FAILURE_THRESHOLD}`);
      
      if (circuitState.failureCount >= FAILURE_THRESHOLD) {
        // Trip the circuit
        circuitState.state = 'OPEN';
        circuitState.openUntil = now + RECOVERY_TIMEOUT_MS;
        console.warn(`[FA-CircuitBreaker] Circuit OPEN - FA failing. Will retry at ${new Date(circuitState.openUntil).toISOString()}`);
      }
      break;

    case 'HALF_OPEN':
      // Failed during recovery test — back to OPEN
      circuitState.state = 'OPEN';
      circuitState.openUntil = now + RECOVERY_TIMEOUT_MS;
      circuitState.lastError = error.substring(0, 200);
      circuitState.successCount = 0;
      console.warn(`[FA-CircuitBreaker] Recovery failed, circuit re-OPENED until ${new Date(circuitState.openUntil).toISOString()}`);
      break;

    case 'OPEN':
      // Already open, update error
      circuitState.lastError = error.substring(0, 200);
      break;
  }
}

/**
 * Get current circuit breaker status (for monitoring/health checks)
 */
export function getCircuitBreakerStatus(): {
  state: CircuitState;
  failureCount: number;
  lastError: string | null;
  openUntil: Date | null;
  isAvailable: boolean;
} {
  return {
    state: circuitState.state,
    failureCount: circuitState.failureCount,
    lastError: circuitState.lastError,
    openUntil: circuitState.openUntil ? new Date(circuitState.openUntil) : null,
    isAvailable: canCallFA().allowed,
  };
}

/**
 * Force reset the circuit breaker (for admin/debug use)
 */
export function resetCircuitBreaker(): void {
  circuitState = {
    state: 'CLOSED',
    failureCount: 0,
    successCount: 0,
    lastFailureTime: null,
    openUntil: null,
    lastError: null,
  };
  console.log('[FA-CircuitBreaker] Circuit manually reset to CLOSED');
}

/**
 * Wrapper to execute an FA operation with circuit breaker protection
 * 
 * Usage:
 *   const result = await withCircuitBreaker(async () => {
 *     return await faService.login();
 *   });
 */
export async function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  operationName = 'FA operation'
): Promise<T> {
  const check = canCallFA();
  
  if (!check.allowed) {
    throw new Error(`[CircuitBreaker] ${check.reason}`);
  }

  try {
    const result = await operation();
    recordFASuccess();
    return result;
  } catch (error) {
    const errorMsg = (error as Error).message || 'Unknown error';
    recordFAFailure(errorMsg);
    console.error(`[FA-CircuitBreaker] ${operationName} failed:`, errorMsg);
    throw error;
  }
}
