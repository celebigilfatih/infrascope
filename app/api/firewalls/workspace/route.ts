import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { FirewallWorkspaceError, readFirewallWorkspace, saveFirewallWorkspace, testFirewallWorkspace } from '@/lib/firewall/workspace-settings';
export const dynamic = 'force-dynamic';
function failed(error: unknown) {
  if (error instanceof FirewallWorkspaceError) return NextResponse.json({ success: false, code: error.code, error: 'FortiGate hedefini ve ayarlarını kontrol edin.' }, { status: error.status });
  console.error('[Firewall workspace]', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json({ success: false, error: 'Güvenlik duvarı işlemi tamamlanamadı.' }, { status: 500 });
}
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'firewall', 'read'); if (!access.allowed) return access.response;
  try { return await readFirewallWorkspace(request.nextUrl.searchParams.get('configId'), request.nextUrl.searchParams.get('vdom')); } catch (error) { return failed(error); }
}
export async function POST(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'firewall', 'write'); if (!access.allowed) return access.response;
  let body: Record<string, unknown>;
  try { body = await request.json(); if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error(); } catch { return NextResponse.json({ success: false, code: 'INVALID_SETTINGS' }, { status: 400 }); }
  try {
    if (body.action === 'save') return await saveFirewallWorkspace(body);
    if (body.action === 'test-saved' || body.action === 'test-draft') return await testFirewallWorkspace(body);
    return NextResponse.json({ success: false, code: 'INVALID_ACTION' }, { status: 400 });
  } catch (error) { return failed(error); }
}
