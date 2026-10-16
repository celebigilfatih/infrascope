import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { prisma } from '@/lib/prisma';
import { nmsInternalFetch } from '@/lib/nms/internal-client';
import { NmsSnmpValidationError, normalizeSnmpVersion, normalizeSnmpV3Username, normalizeSnmpV3SecurityLevel, normalizeSnmpV3AuthProtocol, normalizeSnmpV3PrivacyProtocol, validateSnmpCommunity, validateSnmpV3Secret } from '@/lib/nms/snmp-config';
import { parseSnmpTestResult, validManagementIp } from '@/lib/nms/add-device-form';

export async function POST(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'write');
  if (!access.allowed) return access.response;
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json({ error: 'Test ayarları çok uzun.' }, 400);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch { return json({ error: 'Geçerli bağlantı ayarlarını gönderin.' }, 400); }
  try {
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const managementIp = typeof body.managementIp === 'string' ? body.managementIp.trim() : '';
    const snmpPort = body.snmpPort;
    if (!deviceId || !isIP(managementIp) || !validManagementIp(managementIp) || typeof snmpPort !== 'number' || !Number.isInteger(snmpPort) || snmpPort < 1 || snmpPort > 65535) return json({ error: 'Cihazı seçin; geçerli bir yönetim IP adresi ve SNMP portu girin.' }, 400);
    const version = normalizeSnmpVersion(body.snmpVersion);
    if (version === '1') return json({ error: 'Test için SNMPv2c veya SNMPv3 seçin.' }, 400);
    const settings: Record<string, unknown> = { managementIp, snmpPort, snmpVersion: version };
    if (version === '2c') settings.snmpCommunity = validateSnmpCommunity(body.snmpCommunity);
    else {
      settings.snmpV3Username = normalizeSnmpV3Username(body.snmpV3Username);
      settings.snmpV3SecurityLevel = normalizeSnmpV3SecurityLevel(body.snmpV3SecurityLevel);
      settings.snmpV3AuthProtocol = normalizeSnmpV3AuthProtocol(body.snmpV3AuthProtocol);
      settings.snmpV3AuthPassword = validateSnmpV3Secret(body.snmpV3AuthPassword, 'SNMPv3 authentication password');
      if (settings.snmpV3SecurityLevel === 'authPriv') {
        settings.snmpV3PrivacyProtocol = normalizeSnmpV3PrivacyProtocol(body.snmpV3PrivacyProtocol);
        settings.snmpV3PrivacyPassword = validateSnmpV3Secret(body.snmpV3PrivacyPassword, 'SNMPv3 privacy password');
      }
    }
    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { id: true, nmsDeviceId: true } });
    if (!device) return json({ error: 'Envanter cihazı bulunamadı.' }, 404);
    if (device.nmsDeviceId !== null) return json({ error: 'Bu cihaz zaten izleniyor. Ayarlarını izlenen cihazlar listesinden açın.' }, 409);
    const response = await nmsInternalFetch('/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings), timeoutMs: 10000, cache: 'no-store' });
    if (!response.ok) return json({ error: response.status === 429 ? 'Test hizmeti meşgul. Biraz sonra tekrar deneyin.' : 'NMS test hizmeti kullanılamıyor. Ajanın güncel ve erişilebilir olduğunu kontrol edin.' }, 503);
    const result = parseSnmpTestResult(await response.json());
    if (!result) return json({ error: 'Test hizmetinden geçerli bir sonuç alınamadı.' }, 502);
    return json({ result });
  } catch (error) {
    if (error instanceof NmsSnmpValidationError) return json({ error: 'SNMP kimlik bilgilerini kontrol edin. Kullanıcı adı ve parola uzunlukları cihaz ayarlarıyla uyumlu olmalı.' }, 400);
    // Never return or log request credentials, CLI output or upstream error bodies.
    return json({ error: 'NMS ajanına ulaşılamadı veya test süresi doldu. Ajan bağlantısını kontrol edip tekrar deneyin.' }, 503);
  }
}
