import { spawn } from 'child_process';
import path from 'path';
import { getPythonTlsPolicy } from '@/lib/security/tls';
import { SourceQueryError } from './source-query-error';
import type { VMwareConfig } from './vmware';
import type { ClusterWorkspaceRecord } from '@/lib/virtualization/cluster-workspace';
import type { HostWorkspaceRecord } from '@/lib/virtualization/host-workspace';
import type { VMWorkspaceRecord } from '@/lib/virtualization/vm-workspace';
import type { DatastoreWorkspaceRecord } from '@/lib/virtualization/datastore-workspace';

export interface VMwareSnapshot {
  id: string; vmId: string; vmName: string; name: string; description: string;
  createTime: string; state: string; size: number;
}
export interface VMwareHostDetails {
  host_moid: string; name: string; vendor: string; model: string; cpu_cores: number;
  memory_size_mb: number; esxi_version: string; esxi_build: string; esxi_full_name: string;
}
type Results = { snapshots: VMwareSnapshot[]; hosts: VMwareHostDetails[]; clusters: ClusterWorkspaceRecord[]; hostWorkspace: HostWorkspaceRecord[]; vmWorkspace: VMWorkspaceRecord[]; datastoreWorkspace: DatastoreWorkspaceRecord[]; preflight: { python: string; sdk: string } };
type Operation = keyof Results;
const scripts: Record<Operation, string> = { snapshots: 'get-snapshots.py', hosts: 'get-host-details.py', clusters: 'get-cluster-details.py', hostWorkspace: 'get-host-workspace.py', vmWorkspace: 'get-vm-workspace.py', datastoreWorkspace: 'get-datastore-workspace.py', preflight: 'vmware_helper.py' };
const failures = new Set(['SDK_MISSING', 'AUTH_FAILED', 'PERMISSION_DENIED', 'TLS_ERROR', 'TLS_POLICY', 'SOURCE_TIMEOUT', 'SOURCE_ERROR', 'INVALID_REQUEST', 'VM_NOT_FOUND']);
const messages: Record<string, string> = {
  UNAVAILABLE: 'VMware Python çalışma ortamı veya yardımcı dosyası bulunamadı.',
  SDK_MISSING: 'VMware Python SDK (PyVmomi) kurulu değil.',
  AUTH_FAILED: 'VMware Python kaynağında kimlik doğrulaması başarısız.',
  PERMISSION_DENIED: 'VMware veri toplama yetkisi yetersiz.',
  TLS_ERROR: 'VMware sertifikası doğrulanamadı. CA ve sunucu adını kontrol edin.',
  TLS_POLICY: 'VMware TLS güvenlik ayarları geçersiz.',
  SOURCE_TIMEOUT: 'VMware veri toplama süresi aşıldı.',
  VM_NOT_FOUND: 'İstenen sanal makine kaynakta bulunamadı.',
  OUTPUT_INVALID: 'VMware Python yanıtı geçersiz veya eksik.',
  PROCESS_EXIT: 'VMware Python yardımcı programı çalıştırılamadı.',
  SOURCE_INCOMPLETE: 'VMware host donanım verileri eksik; kaynak okuma yetkilerini kontrol edin.',
};
function failure(code: string): SourceQueryError {
  return new SourceQueryError(`VMWARE_HELPER_${code}`, 'VMware Python collection failed');
}
export function isVMwarePythonError(error: unknown): error is SourceQueryError {
  return typeof error === 'object' && error !== null && 'code' in error &&
    typeof error.code === 'string' && error.code.startsWith('VMWARE_HELPER_');
}
export function vmwareCollectionErrorMessage(error: unknown): string {
  const code = isVMwarePythonError(error) ? error.code.slice('VMWARE_HELPER_'.length) : '';
  return messages[code] ?? 'VMware verileri alınamadı; kaynak ve Python toplama ayarlarını kontrol edin.';
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function strings(value: Record<string, unknown>, fields: string[]): boolean { return fields.every(field => typeof value[field] === 'string'); }
function nonnegative(value: unknown): boolean { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function nullableNumbers(value: Record<string, unknown>, fields: string[]): boolean { return fields.every(field => value[field] === null || nonnegative(value[field])); }
function nullableBooleans(value: Record<string, unknown>, fields: string[]): boolean { return fields.every(field => value[field] === null || typeof value[field] === 'boolean'); }
function validHost(value: unknown): value is Record<string, unknown> {
  return object(value) && strings(value, ['id', 'name', 'connectionState', 'powerState', 'overallStatus']) && Boolean(value.id) &&
    nullableNumbers(value, ['cpuCores', 'totalCpuMHz', 'totalMemoryBytes', 'usedCpuMHz', 'usedMemoryBytes']) &&
    nullableBooleans(value, ['maintenance']) && (value.version === null || typeof value.version === 'string');
}
function validHostWorkspace(value: Record<string, unknown>): boolean {
  if (!validHost(value) || !['vendor', 'model', 'build'].every(field => value[field] === null || typeof value[field] === 'string')) return false;
  if (value.clusterMembership === 'cluster') return typeof value.clusterId === 'string' && Boolean(value.clusterId) && typeof value.clusterName === 'string' && Boolean(value.clusterName);
  return ['standalone', 'unknown'].includes(String(value.clusterMembership)) && value.clusterId === null && value.clusterName === null;
}
function validCluster(value: Record<string, unknown>): boolean {
  if (!strings(value, ['id', 'name', 'overallStatus']) || !value.id || !Number.isInteger(value.hostCount) || !nonnegative(value.hostCount) ||
      !nullableNumbers(value, ['effectiveHosts', 'cpuCores', 'totalCpuMHz', 'totalMemoryBytes']) ||
      !nullableBooleans(value, ['haEnabled', 'drsEnabled']) || !Array.isArray(value.hosts)) return false;
  const ids = new Set<string>();
  return value.hosts.every(host => {
    if (!validHost(host) || ids.has(String(host.id))) return false;
    ids.add(String(host.id)); return true;
  });
}
function validVMWorkspace(value: Record<string, unknown>): boolean {
  if (!strings(value, ['id', 'name', 'powerState', 'connectionState', 'overallStatus', 'guestState']) || !value.id ||
      !nullableNumbers(value, ['cpuCount', 'cpuCapacityMHz', 'usedCpuMHz', 'memoryBytes', 'activeMemoryBytes', 'hostMemoryBytes']) ||
      !nullableBooleans(value, ['template']) || !['ip', 'os'].every(field => value[field] === null || typeof value[field] === 'string')) return false;
  if (value.hostAssignment === 'assigned') return typeof value.hostId === 'string' && Boolean(value.hostId) && typeof value.hostName === 'string' && Boolean(value.hostName);
  return ['unassigned', 'unknown'].includes(String(value.hostAssignment)) && value.hostId === null && value.hostName === null;
}
function validDatastoreWorkspace(value: Record<string, unknown>): boolean {
  if (!strings(value, ['id', 'name', 'type', 'maintenanceMode']) || !value.id || !nullableBooleans(value, ['accessible', 'multipleHostAccess']) ||
      !nullableNumbers(value, ['capacityBytes', 'freeBytes'])) return false;
  if (value.hosts === null) return true;
  if (!Array.isArray(value.hosts)) return false;
  const ids = new Set<string>();
  return value.hosts.every(host => {
    if (!object(host) || !strings(host, ['id', 'name', 'connectionState', 'accessMode']) || !host.id || ids.has(String(host.id)) ||
        !nullableBooleans(host, ['mounted', 'accessible']) || !(host.inaccessibleReason === null || typeof host.inaccessibleReason === 'string')) return false;
    ids.add(String(host.id)); return true;
  });
}
function parseResult(operation: Operation, stdout: string, exit: number | null, vmId?: string): unknown {
  if (exit !== 0 && !stdout.trim()) throw failure('PROCESS_EXIT');
  let value: unknown;
  try { value = JSON.parse(stdout); } catch { throw failure('OUTPUT_INVALID'); }
  if (!object(value) || value.protocol !== 1) throw failure('OUTPUT_INVALID');
  if (value.success === false) throw failure(typeof value.code === 'string' && failures.has(value.code) ? value.code : 'SOURCE_ERROR');
  if (exit !== 0) throw failure('PROCESS_EXIT');
  if (value.success !== true) throw failure('OUTPUT_INVALID');
  if (operation === 'preflight') {
    if (!object(value.runtime) || !strings(value.runtime, ['python', 'sdk'])) throw failure('OUTPUT_INVALID');
    return value.runtime;
  }
  const rows = value[operation];
  if (!Array.isArray(rows)) throw failure('OUTPUT_INVALID');
  const valid = rows.every(row => {
    if (!object(row)) return false;
    if (operation === 'clusters') return validCluster(row);
    if (operation === 'hostWorkspace') return validHostWorkspace(row);
    if (operation === 'vmWorkspace') return validVMWorkspace(row);
    if (operation === 'datastoreWorkspace') return validDatastoreWorkspace(row);
    if (operation === 'hosts') return strings(row, ['host_moid', 'name', 'vendor', 'model', 'esxi_version', 'esxi_build', 'esxi_full_name']) &&
      !!row.host_moid && nonnegative(row.cpu_cores) && nonnegative(row.memory_size_mb);
    return strings(row, ['id', 'vmId', 'vmName', 'name', 'description', 'createTime', 'state']) && !!row.id && !!row.vmId &&
      (vmId === undefined || row.vmId === vmId) && nonnegative(row.size) &&
      typeof row.createTime === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(row.createTime) && Number.isFinite(Date.parse(row.createTime));
  });
  if (!valid) throw failure('OUTPUT_INVALID');
  if (['clusters', 'hostWorkspace', 'vmWorkspace', 'datastoreWorkspace'].includes(operation) && new Set(rows.map(row => row.id)).size !== rows.length) throw failure('OUTPUT_INVALID');
  return rows;
}

/** Fixed script selection; secrets and caller-controlled fields travel only over stdin. */
export async function runVMwarePython<K extends Operation>(operation: K, config?: VMwareConfig, vmId?: string): Promise<Results[K]> {
  if (!Object.prototype.hasOwnProperty.call(scripts, operation)) throw failure('INVALID_REQUEST');
  let tls: ReturnType<typeof getPythonTlsPolicy>;
  try { tls = getPythonTlsPolicy('VMWARE'); } catch { throw failure('TLS_POLICY'); }
  if (operation !== 'preflight' && !config) throw failure('INVALID_REQUEST');
  const input = JSON.stringify(operation === 'preflight' ? { protocol: 1, operation } : {
    protocol: 1, operation, host: config!.host, username: config!.username, password: config!.password, vmId, tls,
  });
  if (Buffer.byteLength(input) > 1024 * 1024) throw failure('INVALID_REQUEST');
  const result = await new Promise<unknown>((resolve, reject) => {
    let child: ReturnType<typeof spawn> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false, stdout = '', outputBytes = 0;
    const finish = (error?: SourceQueryError, data?: unknown) => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      if (error) { child?.kill('SIGKILL'); reject(error); } else resolve(data);
    };
    try {
      child = spawn(process.env.VMWARE_PYTHON_BIN || 'python3', ['-B', path.resolve(process.cwd(), 'scripts', scripts[operation])], {
        shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: process.env.NODE_ENV,
          VMWARE_TLS_INSECURE: process.env.VMWARE_TLS_INSECURE, NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
          PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      });
      child.on('error', () => finish(failure('UNAVAILABLE')));
      child.stdout!.setEncoding('utf8');
      child.stdout!.on('data', (chunk: string) => {
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > 10 * 1024 * 1024) finish(failure('OUTPUT_LIMIT')); else stdout += chunk;
      });
      child.stderr!.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > 10 * 1024 * 1024) finish(failure('OUTPUT_LIMIT'));
      });
      child.stdin!.on('error', () => finish(failure('PROCESS_EXIT')));
      child.on('close', code => {
        if (finished) return;
        try { finish(undefined, parseResult(operation, stdout, code, vmId)); }
        catch (error) { finish(isVMwarePythonError(error) ? error : failure('OUTPUT_INVALID')); }
      });
      timer = setTimeout(() => finish(failure('SOURCE_TIMEOUT')), 30_000);
      child.stdin!.end(input);
    } catch { finish(failure('UNAVAILABLE')); }
  });
  return result as Results[K];
}
