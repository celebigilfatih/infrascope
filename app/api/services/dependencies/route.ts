import { NextRequest, NextResponse } from 'next/server';
import type { DependencyType, DeviceCriticality } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { dependencyPayload, dependencyDate, dependencyObject } from '@/lib/services/dependencies';
import { dependencySelect } from '@/lib/services/dependency-select';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'read'); if (!access.allowed) return access.response;
  try {
    const searchParams = request.nextUrl.searchParams;
    const serviceId = searchParams.get('serviceId');

    if (serviceId) {
      // A service filter addresses outgoing records, never a coincident device ID.
      const dependencies = await prisma.dependency.findMany({
        where: {
          sourceServiceId: serviceId,
        },
        include: {
          sourceService: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          targetDevice: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return NextResponse.json({
        success: true,
        dependencies,
        count: dependencies.length,
      });
    }

    // Get all dependencies
    const dependencies = await prisma.dependency.findMany({
      include: {
        sourceService: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        targetDevice: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      dependencies,
      count: dependencies.length,
    });
  } catch (error) {
    console.error('Error fetching dependencies:', error);
    return NextResponse.json(
      { success: false, error: 'Bağımlılık kayıtları alınamadı.' },
      { status: 500 }
    );
  }
}

function failure(code: string, message: string, status: number) { return NextResponse.json({ success: false, code, error: message }, { status, headers }); }
function databaseFailure(error: unknown) {
  const code = dependencyObject(error) ? error.code : null;
  if (code === 'P2002') return failure('DUPLICATE', 'Aynı kaynak servis, hedef cihaz ve ilişki türü zaten kayıtlı.', 409);
  if (code === 'P2003') return failure('RELATED', 'Seçili servis veya cihaz artık kullanılamıyor. Seçenekleri yenileyin.', 409);
  if (code === 'P2025') return failure('NOT_FOUND', 'İlişki kaydı bulunamadı. Listeyi yenileyin.', 404);
  if (code === 'P2034') return failure('CHANGED', 'Kayıt işlem sırasında değişti. Listeyi yenileyip tekrar inceleyin.', 409);
  return failure('FAILED', 'İlişki işlemi tamamlanamadı. Sonucu listeyi yenileyerek kontrol edin.', 503);
}
async function readBody(request: NextRequest) { try { const body: unknown = await request.json(); return dependencyObject(body) ? body : null; } catch { return null; } }
export async function POST(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'write'); if (!access.allowed) return access.response;
  const body = await readBody(request); let data: ReturnType<typeof dependencyPayload>;
  try { data = dependencyPayload(body); } catch (error) { return failure('INVALID', error instanceof Error ? error.message : 'İlişki bilgileri geçersiz.', 400); }
  try {
    const dependency = await prisma.dependency.create({ data: { sourceServiceId: data.sourceServiceId!, targetDeviceId: data.targetDeviceId!, type: data.type as DependencyType, criticality: data.criticality as DeviceCriticality, description: data.description }, select: dependencySelect });
    return NextResponse.json({ success: true, dependency }, { headers });
  } catch (error) { return databaseFailure(error); }
}
export async function PUT(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'write'); if (!access.allowed) return access.response;
  const body = await readBody(request); if (!body || typeof body.id !== 'string' || !body.id.trim() || body.id.length > 200) return failure('INVALID', 'İlişki kimliği gereklidir.', 400);
  let data: ReturnType<typeof dependencyPayload>;
  try { data = dependencyPayload(body, true); } catch (error) { return failure('INVALID', error instanceof Error ? error.message : 'İlişki bilgileri geçersiz.', 400); }
  const version = body.expectedUpdatedAt === undefined ? undefined : dependencyDate(body.expectedUpdatedAt);
  if (version === null) return failure('INVALID', 'Kayıt sürümü doğrulanamadı. Listeyi yenileyin.', 400);
  try {
    const outcome = await prisma.$transaction(async tx => {
      const existing = await tx.dependency.findUnique({ where: { id: body.id as string }, select: { sourceServiceId: true, targetDeviceId: true } });
      if (!existing) return 'NOT_FOUND' as const;
      if (body.sourceServiceId !== undefined && body.sourceServiceId !== existing.sourceServiceId || body.targetDeviceId !== undefined && body.targetDeviceId !== existing.targetDeviceId) return 'IMMUTABLE' as const;
      const updated = await tx.dependency.updateMany({ where: { id: body.id as string, ...(version ? { updatedAt: new Date(version) } : {}) }, data: { ...(data.type !== undefined ? { type: data.type as DependencyType } : {}), ...(data.criticality !== undefined ? { criticality: data.criticality as DeviceCriticality } : {}), ...(data.description !== undefined ? { description: data.description } : {}) } });
      if (!updated.count) return 'CHANGED' as const;
      return tx.dependency.findUnique({ where: { id: body.id as string }, select: dependencySelect });
    }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 });
    if (outcome === 'NOT_FOUND' || !outcome) return failure('NOT_FOUND', 'İlişki kaydı bulunamadı. Listeyi yenileyin.', 404);
    if (outcome === 'IMMUTABLE') return failure('INVALID', 'Kaynak servis ve hedef cihaz düzenleme sırasında değiştirilemez.', 400);
    if (outcome === 'CHANGED') return failure('CHANGED', 'Kayıt son okumadan sonra değişti. Listeyi yenileyip tekrar inceleyin.', 409);
    return NextResponse.json({ success: true, dependency: outcome }, { headers });
  } catch (error) { return databaseFailure(error); }
}
export async function DELETE(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'delete'); if (!access.allowed) return access.response;
  const query = request.nextUrl.searchParams, id = query.get('id'); if (!id?.trim() || id.length > 200) return failure('INVALID', 'İlişki kimliği gereklidir.', 400);
  const version = query.has('expectedUpdatedAt') ? dependencyDate(query.get('expectedUpdatedAt')) : undefined;
  if (version === null) return failure('INVALID', 'Kayıt sürümü doğrulanamadı. Listeyi yenileyin.', 400);
  try {
    const deleted = await prisma.dependency.deleteMany({ where: { id, ...(version ? { updatedAt: new Date(version) } : {}) } });
    if (!deleted.count) return failure('CHANGED', 'İlişki kaldırılmış veya son okumadan sonra değişmiş. Listeyi yenileyin.', 409);
    return NextResponse.json({ success: true, dependency: { id }, message: 'İlişki kaydı kaldırıldı.' }, { headers });
  } catch (error) { return databaseFailure(error); }
}
