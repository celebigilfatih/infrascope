import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { organizationPayload } from '@/lib/organizations/workspace';
import { organizationFailure } from '@/lib/organizations/api';
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'organizations', 'write'); if (!auth.allowed) return auth.response;
  let data;
  try { data = organizationPayload(await request.json(), true); }
  catch { return NextResponse.json({ success: false, code: 'INVALID', error: 'Ad, kod ve açıklama bilgilerini kontrol edin.' }, { status: 400 }); }
  try {
    const { id } = await params;
    const organization = await prisma.organization.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: organization, timestamp: new Date() });
  } catch (error) { return organizationFailure(error); }
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'organizations', 'delete'); if (!auth.allowed) return auth.response;
  try {
    const { id } = await params;
    await prisma.organization.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id }, message: 'Organizasyon silindi.', timestamp: new Date() });
  } catch (error) { return organizationFailure(error); }
}
