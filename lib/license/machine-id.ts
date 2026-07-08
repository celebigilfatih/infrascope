/**
 * Machine ID generation for license activation.
 *
 * Creates a stable hardware fingerprint from the host machine so that
 * each on-premise installation can be uniquely identified and bound
 * to a license activation.
 *
 * Strategy:
 *  - Docker: uses container hostname + volume UUID (stable across restarts)
 *  - Linux: reads /etc/machine-id
 *  - macOS: uses IOPlatformSerialNumber from ioreg
 *  - Fallback: random UUID persisted to .machine-id file
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { hostname } from 'os';
import path from 'path';

const MACHINE_ID_PATH = process.env.MACHINE_ID_PATH || path.join(process.cwd(), '.machine-id');

function safeExec(cmd: string, timeout = 3000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout }).trim();
  } catch {
    return '';
  }
}

function detectMachineId(): string {
  const machineIdFile = resolveMachineIdFile();

  // 1. Docker container — use hostname (container ID) + volume marker
  if (existsSync('/.dockerenv')) {
    const hn = hostname();
    if (existsSync(machineIdFile)) {
      return readFileSync(machineIdFile, 'utf-8').trim();
    }
    // Persist a generated ID for container stability
    const id = createHash('sha256')
      .update(`docker:${hn}:${Date.now()}`)
      .digest('hex')
      .slice(0, 32);
    try {
      mkdirSync(path.dirname(machineIdFile), { recursive: true });
      writeFileSync(machineIdFile, id);
    } catch {
      // Read-only FS — fall through
    }
    return id;
  }

  // 2. Linux — /etc/machine-id
  if (existsSync('/etc/machine-id')) {
    const mid = readFileSync('/etc/machine-id', 'utf-8').trim();
    if (mid) return mid;
  }

  // 3. macOS — IOPlatformSerialNumber
  const serial = safeExec(
    "ioreg -l | awk '/IOPlatformSerialNumber/ { print $4; }' | tr -d '\"'"
  );
  if (serial) {
    return createHash('sha256').update(`macos:${serial}`).digest('hex').slice(0, 32);
  }

  // 4. Fallback — persisted random ID
  if (existsSync(machineIdFile)) {
    return readFileSync(machineIdFile, 'utf-8').trim();
  }

  const id = createHash('sha256')
    .update(`fallback:${hostname()}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 32);
  try {
    mkdirSync(path.dirname(machineIdFile), { recursive: true });
    writeFileSync(machineIdFile, id);
  } catch {
    // Read-only FS
  }
  return id;
}

function resolveMachineIdFile(): string {
  try {
    if (existsSync(MACHINE_ID_PATH) && statSync(MACHINE_ID_PATH).isDirectory()) {
      return path.join(MACHINE_ID_PATH, 'machine-id');
    }
  } catch {
    // Fall through to the configured path.
  }
  return MACHINE_ID_PATH;
}

let cachedMachineId: string | null = null;

/**
 * Returns a stable machine fingerprint (cached after first call).
 */
export function getMachineId(): string {
  if (!cachedMachineId) {
    cachedMachineId = detectMachineId();
  }
  return cachedMachineId;
}

/**
 * Returns a short, human-readable machine ID for display.
 */
export function getMachineIdShort(): string {
  return getMachineId().slice(0, 12);
}
