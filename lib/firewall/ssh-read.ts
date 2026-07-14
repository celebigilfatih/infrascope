import { prisma } from '@/lib/prisma';
import { availableFirewallData, unavailableFirewallData } from './capabilities';
import { persistFirewallCapability } from './capability-store';
import { FirewallReadTargetError } from './read-service';
import { NmsInternalError, nmsInternalFetch, parseNmsResponse } from '@/lib/nms/internal-client';

const SSH_CAPABILITIES = ['identity', 'system-status', 'config-backup'];

async function loadSshTarget(connectorId: string) {
  const connector = await prisma.firewallConnector.findUnique({
    where: { id: connectorId },
    select: {
      id: true,
      deviceId: true,
      vdom: true,
      monitoringMode: true,
      device: {
        select: {
          nmsDeviceId: true,
          sshUsername: true,
          sshPassword: true,
          sshHostKeyAlgorithm: true,
          sshHostKeyFingerprint: true,
        },
      },
    },
  });
  if (!connector) throw new FirewallReadTargetError('Firewall connector not found', 404);
  return connector;
}

function safeTarget(context: Awaited<ReturnType<typeof loadSshTarget>>) {
  return {
    connectorId: context.id,
    deviceId: context.deviceId,
    nmsDeviceId: context.device.nmsDeviceId,
    vdom: context.vdom,
    monitoringMode: context.monitoringMode,
  };
}

export async function inspectFirewallSshHostKey(connectorId: string) {
  const context = await loadSshTarget(connectorId);
  if (!context.device.nmsDeviceId) {
    throw new FirewallReadTargetError('Configure NMS monitoring before inspecting the SSH host key', 409);
  }
  const observed = await parseNmsResponse<{
    algorithm: string;
    fingerprint: string;
    observed_at: string;
  }>(await nmsInternalFetch(`/devices/${context.device.nmsDeviceId}/ssh-host-key`));
  return {
    target: safeTarget(context),
    observed,
    trusted: context.device.sshHostKeyFingerprint
      ? {
          algorithm: context.device.sshHostKeyAlgorithm,
          fingerprint: context.device.sshHostKeyFingerprint,
          matches: context.device.sshHostKeyFingerprint === observed.fingerprint,
        }
      : null,
  };
}

export async function readFirewallSshStatus(connectorId: string) {
  const context = await loadSshTarget(connectorId);
  const target = safeTarget(context);
  if (
    !context.device.nmsDeviceId
    || !context.device.sshUsername
    || !context.device.sshPassword
    || !context.device.sshHostKeyFingerprint
  ) {
    const reason = 'SSH requires NMS monitoring, encrypted credentials, and an approved host key';
    await persistFirewallCapability({
      connectorId,
      source: 'ssh',
      status: 'unconfigured',
      capabilities: SSH_CAPABILITIES,
      reason,
    });
    return { target, envelope: unavailableFirewallData('ssh', reason) };
  }
  try {
    const response = await parseNmsResponse<{
      status: Record<string, string>;
      collected_at: string;
    }>(await nmsInternalFetch(`/devices/${context.device.nmsDeviceId}/ssh-status`, { timeoutMs: 30_000 }));
    await persistFirewallCapability({
      connectorId,
      source: 'ssh',
      status: 'available',
      capabilities: SSH_CAPABILITIES,
      lastSuccessAt: response.collected_at,
    });
    return {
      target,
      envelope: availableFirewallData(response.status, 'ssh', response.collected_at),
    };
  } catch (error) {
    const reason = error instanceof NmsInternalError
      ? error.message
      : 'Trusted SSH status read failed';
    await persistFirewallCapability({
      connectorId,
      source: 'ssh',
      status: 'unavailable',
      capabilities: SSH_CAPABILITIES,
      reason,
    });
    return { target, envelope: unavailableFirewallData('ssh', reason, { retryable: true }) };
  }
}
