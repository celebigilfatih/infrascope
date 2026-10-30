import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { PRESENTATION_KEY, reconcilePresentation, validatePresentation, type TopologyPresentation } from '@/lib/topology/presentation';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0' };
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
interface Stored { revision: number; document: TopologyPresentation }
function decode(value?: string): Stored | null {
  if (!value) return null;
  const result = JSON.parse(value) as Stored;
  if (!Number.isSafeInteger(result.revision) || result.revision < 1 || !result.document) throw new Error('Invalid stored presentation');
  return result;
}
export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) return reply({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    const row = await prisma.systemConfig.findUnique({ where: { key: PRESENTATION_KEY } });
    const stored = decode(row?.value);
    const buildings=await prisma.building.findMany({select:{id:true}});
    const document=stored?reconcilePresentation(stored.document,new Set(buildings.map(b=>b.id))):null;
    return reply({ success: true, data: { revision: stored?.revision || 0, document, canEdit: canAccessSync(actor.role, 'devices', 'write') } });
  } catch { return reply({ success: false, error: 'Topoloji görünümü yüklenemedi. Yeniden deneyin.' }, 503); }
}
export async function PUT(request: NextRequest) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) return reply({ success: false, error: 'Oturum süreniz doldu. Yeniden giriş yapın; düzenleme taslağınız korunuyor.' }, 401);
    if (!canAccessSync(actor.role, 'devices', 'write')) return reply({ success: false, error: 'Topoloji görünümünü değiştirme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    if (!body || !Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0 || JSON.stringify(body).length > 2_000_000) return reply({ success: false, error: 'Geçerli bir görünüm ve revizyon belirtin.' }, 400);
    const buildings = await prisma.building.findMany({ select: { id: true } });
    const error = validatePresentation(body.document, new Set(buildings.map(b => b.id)));
    if (error) return reply({ success: false, error }, 400);
    const row = await prisma.systemConfig.findUnique({ where: { key: PRESENTATION_KEY } });
    const current = decode(row?.value);
    // A committed write whose response was lost can be repeated without a second revision.
    if (current && JSON.stringify(current.document) === JSON.stringify(body.document)) return reply({ success: true, data: { ...current, canEdit: true } });
    if ((current?.revision || 0) !== body.baseRevision) return reply({ success: false, error: 'Görünüm başka bir kullanıcı tarafından değiştirildi. Taslağınızı koruyarak güncel görünümü yükleyin.' }, 409);
    const next: Stored = { revision: body.baseRevision + 1, document: body.document };
    if (row) {
      const result = await prisma.systemConfig.updateMany({ where: { key: PRESENTATION_KEY, value: row.value }, data: { value: JSON.stringify(next) } });
      if (result.count !== 1) return reply({ success: false, error: 'Görünüm eşzamanlı olarak değiştirildi; taslağınız korunuyor.' }, 409);
    } else {
      try { await prisma.systemConfig.create({ data: { key: PRESENTATION_KEY, value: JSON.stringify(next) } }); }
      catch (error) { if ((error as { code?: string }).code === 'P2002') return reply({ success: false, error: 'Görünüm eşzamanlı olarak oluşturuldu; taslağınız korunuyor.' }, 409); throw error; }
    }
    return reply({ success: true, data: { ...next, canEdit: true } });
  } catch { return reply({ success: false, error: 'Topoloji görünümü kaydedilemedi. Taslağınız korunuyor; yeniden deneyin.' }, 503); }
}
