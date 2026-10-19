import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { FortiGateConnectorError, getFortiGateConnector } from '@/lib/firewall/connector-factory';
import { classifyFortiGateError } from '@/lib/firewall/errors';
import { firewallErrorMessage } from '@/lib/firewall/workspace';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'firewall', 'read'); if (!access.allowed) return access.response;
  const query = new URL(request.url).searchParams;
  const configId = query.get('configId'), vdom = query.get('vdom'), expectedHost = query.get('expectedHost');
  if (!configId || !vdom || !expectedHost) return NextResponse.json({ success: false, error: 'Cihaz, VDOM ve bağlantı adresi seçilmelidir.' }, { status: 400, headers });
  try {
    const { service, target } = await getFortiGateConnector({ configId, vdom });
    if (target.host !== expectedHost || target.vdom !== vdom) return NextResponse.json({ success: false, error: 'Bağlantı değişmiş. Cihaz listesini yenileyin.' }, { status: 409, headers });
    const snapshot = await service.getIPsecWorkspace();
    return NextResponse.json({ success: true, source: 'fortigate-rest', target: { configId: target.configId, vdom: target.vdom, host: target.host }, data: snapshot }, { headers });
  } catch (failure) {
    if (failure instanceof FortiGateConnectorError) return NextResponse.json({ success: false, error: 'Seçili güvenlik duvarı bağlantısı kullanılamıyor. Bağlantı ayarlarını kontrol edin.', code: failure.code }, { status: failure.status, headers });
    const error = classifyFortiGateError(failure);
    console.error('IPsec workspace read failed', error.code);
    return NextResponse.json({ success: false, error: firewallErrorMessage(error.code), code: error.code }, { status: error.responseStatus, headers });
  }
}
