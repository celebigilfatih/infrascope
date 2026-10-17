import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { organizationPayload } from '@/lib/organizations/workspace';
import { organizationFailure } from '@/lib/organizations/api';

// The response depends on the current database identity and mutable location tree.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authorization = await authorizeApiRequest(request, 'organizations', 'read');
  if (!authorization.allowed) return authorization.response;
  try {
    // Keep the shared locations tree contract; settings also uses related-resource counts.
    const organizations = await prisma.organization.findMany({
      include: {
        _count: { select: { vlans: true, subnets: true, vmwareClusters: true, vmwareDatastores: true } },
        buildings: {
          include: {
            floors: {
              include: {
                rooms: {
                  include: {
                    racks: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        maxUnits: true,
                        roomId: true,
                        operationalStatus: true,
                        coordX: true,
                        coordY: true,
                        coordZ: true,
                        rotation: true,
                        _count: {
                          select: { devices: true }
                        }
                      }
                    }
                  }
                }
              },
              orderBy: {
                floorNumber: 'asc'
              }
            }
          },
          orderBy: {
            name: 'asc'
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return NextResponse.json({ success: true, data: organizations, timestamp: new Date(), cached: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return organizationFailure(error); }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeApiRequest(request, 'organizations', 'write');
  if (!authorization.allowed) return authorization.response;
  let data;
  try { data = organizationPayload(await request.json()); }
  catch { return NextResponse.json({ success: false, code: 'INVALID', error: 'Ad, kod ve açıklama bilgilerini kontrol edin.' }, { status: 400 }); }
  try {
    const organization = await prisma.organization.create({ data: { name: data.name!, code: data.code!, description: data.description } });
    return NextResponse.json({ success: true, data: organization, timestamp: new Date() }, { status: 201 });
  } catch (error) { return organizationFailure(error); }
}
