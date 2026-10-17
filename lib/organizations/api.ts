import { NextResponse } from 'next/server';
export function organizationFailure(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  const mapped = code === 'P2002' ? { code: 'DUPLICATE', error: 'Bu ad veya kod başka bir organizasyonda kullanılıyor.', status: 409 } : code === 'P2025' ? { code: 'NOT_FOUND', error: 'Organizasyon bulunamadı.', status: 404 } : code === 'P2003' ? { code: 'RELATED', error: 'Bağlı kayıtlar nedeniyle işlem tamamlanamadı.', status: 409 } : { code: 'FAILED', error: 'Organizasyon işlemi tamamlanamadı.', status: 500 };
  console.error('[Organizations]', mapped.code);
  return NextResponse.json({ success: false, code: mapped.code, error: mapped.error }, { status: mapped.status });
}
