import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const policies = await prisma.firewallPolicy.findMany({
      include: {
        device: {
          select: {
            id: true,
            name: true,
            fortiDeviceId: true,
          },
        },
      },
      orderBy: {
        hitCount: 'desc',
      },
    });

    // Serialize BigInt to string for JSON
    const serializedPolicies = policies.map(policy => ({
      ...policy,
      hitCount: policy.hitCount.toString(),
    }));

    return NextResponse.json({
      success: true,
      data: serializedPolicies,
      count: policies.length,
    });
  } catch (error) {
    console.error('Error fetching firewall policies:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
