import { NextResponse, type NextRequest } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const permission = await authorizeApiRequest(request, 'users', 'read');
    if (!permission.allowed) return permission.response;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = Number(searchParams.get('limit') || '5');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ success: false, error: 'Kayıt sınırı 1–100 arasında bir tam sayı olmalıdır.' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const activities = await prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const formatted = activities.map((a) => ({
      id: a.id,
      action: a.action,
      details: a.details,
      createdAt: formatTimeAgo(a.createdAt),
      occurredAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: formatted }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching user activities:', error);
    return NextResponse.json(
      { success: false, error: 'Hesap kayıtları alınamadı.' },
      { status: 500 }
    );
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Az önce';
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} sa önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;
  return new Date(date).toLocaleDateString('tr-TR');
}
