import { NextResponse } from 'next/server';
import { NetworkGroupError } from './network-group-service';
export const groupResult = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
export function groupFailure(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (error instanceof NetworkGroupError) return groupResult({ success: false, error: error.message }, error.status);
  if (['P2002','P2003','P2034'].includes(String(code))) return groupResult({ success: false, error: 'Grup veya konum bilgileri değişti ya da aynı ad kullanılıyor. Yenileyip tekrar deneyin.' }, 409);
  return groupResult({ success: false, error: 'Ağ grupları işlenemedi. Yeniden deneyin.' }, 503);
}
