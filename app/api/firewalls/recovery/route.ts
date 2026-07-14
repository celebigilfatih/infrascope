import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getFirewallRecoverySchedulerStatus } from '@/lib/firewall/recovery-scheduler';

type RecoveryHeartbeat = {
  at?: string;
  claimed?: number;
  succeeded?: number;
  unavailable?: number;
  failed?: number;
  durationMs?: number;
};

function parseHeartbeat(value: string | undefined): RecoveryHeartbeat | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as RecoveryHeartbeat;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const heartbeat = await prisma.systemConfig.findUnique({
      where: { key: 'firewall_recovery_last_tick' },
      select: { value: true },
    });
    const runtime = getFirewallRecoverySchedulerStatus();
    return NextResponse.json({
      success: true,
      data: {
        running: runtime.running,
        cycleInProgress: runtime.cycleInProgress,
        heartbeat: parseHeartbeat(heartbeat?.value),
      },
    });
  } catch (error) {
    console.error('Firewall recovery status failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load firewall recovery status' },
      { status: 500 }
    );
  }
}
