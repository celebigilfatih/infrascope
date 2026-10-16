"""Bounded, read-only SNMP setup probe. No registration or database writes."""
import asyncio
import ipaddress
import threading
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from nms_service.snmp.session import SNMPSession

_slots = threading.BoundedSemaphore(4)
UPTIME = '1.3.6.1.2.1.1.3.0'
NAME = '1.3.6.1.2.1.1.5.0'


def settings_from(body):
    if not isinstance(body, dict):
        raise ValueError('Invalid settings')
    address = ipaddress.ip_address(body.get('managementIp', ''))
    if address.is_multicast or address.is_unspecified or str(address) == '255.255.255.255':
        raise ValueError('Unicast address required')
    port = body.get('snmpPort')
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('Invalid port')
    version = body.get('snmpVersion')
    if version not in ('2c', '3'):
        raise ValueError('Invalid version')
    def secret(name, minimum=8):
        value = body.get(name, '')
        if not isinstance(value, str) or not minimum <= len(value) <= 255:
            raise ValueError('Invalid credential')
        return value
    kwargs = dict(device_id=0, device_name='setup-probe', ip_address=f'udp6:[{address}]' if address.version == 6 else str(address), version=version, port=port, timeout=2, retries=0)
    if version == '2c':
        kwargs['community_string'] = secret('snmpCommunity', 1)
    else:
        username = body.get('snmpV3Username', '')
        level = body.get('snmpV3SecurityLevel')
        auth = body.get('snmpV3AuthProtocol')
        if not isinstance(username, str) or not 1 <= len(username) <= 64 or not all(33 <= ord(char) <= 126 for char in username) or level not in ('authPriv', 'authNoPriv') or auth not in ('SHA', 'SHA-256'):
            raise ValueError('Invalid v3 settings')
        kwargs.update(v3_username=username, v3_security_level=level, v3_auth_protocol=auth, v3_auth_password=secret('snmpV3AuthPassword'))
        if level == 'authPriv':
            if body.get('snmpV3PrivacyProtocol') != 'AES':
                raise ValueError('Invalid privacy settings')
            kwargs.update(v3_privacy_protocol='AES', v3_privacy_password=secret('snmpV3PrivacyPassword'))
    return kwargs


def probe(settings, session_factory=SNMPSession):
    started = time.monotonic()
    session = session_factory(**settings)
    try:
        values = session.get_multiple([UPTIME, NAME], strict_errors=True)
    finally:
        session.close()
    name = values.get(NAME)
    name = str(name)[:255] if name is not None and str(name).strip() else None
    ticks = values.get(UPTIME)
    uptime = float(ticks) / 100 if isinstance(ticks, (int, float)) and not isinstance(ticks, bool) and 0 <= ticks < float('inf') else None
    # net-snmp may render TimeTicks text; a non-empty value still proves a reply.
    reachable = name is not None or ticks is not None
    return dict(reachable=reachable, outcome='response' if reachable else 'no_response', systemName=name, uptimeSeconds=uptime, checkedAt=datetime.now(timezone.utc).isoformat(), durationMs=round((time.monotonic() - started) * 1000))


def connection_test_router(authenticate):
    router = APIRouter()

    @router.post('/test-connection', dependencies=[Depends(authenticate)])
    async def test_connection(request: Request):
        try:
            raw = await request.body()
            if len(raw) > 8192:
                raise ValueError('Too large')
            import json
            settings = settings_from(json.loads(raw))
        except Exception:
            return JSONResponse({'error': 'Invalid connection settings'}, status_code=400)
        if not _slots.acquire(blocking=False):
            return JSONResponse({'error': 'Test service busy'}, status_code=429)
        def run():
            try:
                return probe(settings)
            finally:
                _slots.release()
        try:
            return await asyncio.to_thread(run)
        except Exception:
            return JSONResponse({'error': 'Test service unavailable'}, status_code=503)

    return router
