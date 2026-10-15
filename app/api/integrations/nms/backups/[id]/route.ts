import { NextRequest, NextResponse } from 'next/server';
import { readBackup, deleteBackup } from '@/lib/nms/backup-service';
export const dynamic = 'force-dynamic';
interface Params { params: { id: string } }
export async function GET(req: NextRequest, { params }: Params) {
  try { return await readBackup(req, params.id); }
  catch { return NextResponse.json({ error: 'Yedek okunamadı.' }, { status: 503 }); }
}
export async function DELETE(req: NextRequest, { params }: Params) {
  try { return await deleteBackup(req, params.id); }
  catch { return NextResponse.json({ error: 'Yedek silinemedi.' }, { status: 503 }); }
}
