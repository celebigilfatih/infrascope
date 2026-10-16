"""Exercise the real probe/router with a fake subprocess; no app startup or DB."""
import ast
import asyncio
import hmac
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Optional
from unittest.mock import patch

os.environ.setdefault('NMS_LOG_DIR', '/tmp/infrascope-nms-probe-check')
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from nms_service import connection_test as probe  # noqa: E402
from nms_service.snmp.session import SNMPError, SNMPSession  # noqa: E402

BODY = dict(managementIp='192.0.2.10', snmpPort=161, snmpVersion='2c', snmpCommunity='fixture-community')


def application():
    # Load only the actual authentication function, never the polling app startup.
    source = Path('nms_service/main.py').read_text()
    tree = ast.parse(source)
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'require_internal_token')
    namespace = dict(Optional=Optional, Header=Header, HTTPException=HTTPException, hmac=hmac, config=SimpleNamespace(internal_token='fixture-internal-only'))
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<internal-auth>', 'exec'), namespace)
    app = FastAPI()
    app.include_router(probe.connection_test_router(namespace['require_internal_token']))
    assert 'app.include_router(connection_test_router(require_internal_token))' in source
    return app


async def request(app, body=BODY, token='fixture-internal-only'):
    messages = []
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return dict(type='http.request', body=body if isinstance(body, bytes) else json.dumps(body).encode(), more_body=False)
        return dict(type='http.disconnect')

    async def send(message):
        messages.append(message)

    headers = [(b'content-type', b'application/json')]
    if token is not None:
        headers.append((b'x-infrascope-internal-token', token.encode()))
    await app(dict(type='http', asgi={'version': '3.0'}, http_version='1.1', method='POST', scheme='http', path='/test-connection', raw_path=b'/test-connection', query_string=b'', headers=headers, client=('127.0.0.1', 1), server=('fixture', 80), root_path=''), receive, send)
    status = next(item['status'] for item in messages if item['type'] == 'http.response.start')
    return status, json.loads(b''.join(item.get('body', b'') for item in messages if item['type'] == 'http.response.body'))


class ProbeTests(unittest.TestCase):
    def test_validation_and_exact_entered_settings(self):
        settings = probe.settings_from(BODY)
        self.assertEqual((settings['community_string'], settings['timeout'], settings['retries']), ('fixture-community', 2, 0))
        self.assertEqual(probe.settings_from({**BODY, 'managementIp': '2001:db8::1'})['ip_address'], 'udp6:[2001:db8::1]')
        for changes in [{'managementIp': '0.0.0.0'}, {'managementIp': '239.0.0.1'}, {'managementIp': 'host.invalid'}, {'snmpPort': True}, {'snmpPort': 0}, {'snmpVersion': '1'}, {'snmpCommunity': ''}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError): probe.settings_from({**BODY, **changes})

    def test_v3_authentication_and_privacy_scopes(self):
        body = {**BODY, 'snmpVersion': '3', 'snmpV3Username': 'fixture-user', 'snmpV3SecurityLevel': 'authNoPriv', 'snmpV3AuthProtocol': 'SHA-256', 'snmpV3AuthPassword': 'fixture-auth'}
        settings = probe.settings_from(body)
        self.assertNotIn('community_string', settings); self.assertNotIn('v3_privacy_password', settings)
        private = probe.settings_from({**body, 'snmpV3SecurityLevel': 'authPriv', 'snmpV3PrivacyProtocol': 'AES', 'snmpV3PrivacyPassword': 'fixture-privacy'})
        self.assertEqual(private['v3_privacy_password'], 'fixture-privacy')
        for changes in [{'snmpV3Username': 'user name'}, {'snmpV3AuthPassword': 'short'}, {'snmpV3AuthProtocol': 'MD5'}, {'snmpV3SecurityLevel': 'noAuthNoPriv'}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError): probe.settings_from({**body, **changes})

    def test_real_cli_boundary_and_zero_uptime(self):
        output = f'.{probe.UPTIME} 0\n.{probe.NAME} "Fixture switch"\n'
        with patch('nms_service.snmp.session.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=output)) as run:
            result = probe.probe(probe.settings_from(BODY))
        self.assertTrue(result['reachable']); self.assertEqual(result['uptimeSeconds'], 0)
        self.assertEqual(result['systemName'], 'Fixture switch')
        self.assertEqual(run.call_args.args[0][-3:], ['192.0.2.10:161', probe.UPTIME, probe.NAME])
        self.assertEqual(run.call_args.kwargs['timeout'], 7)
        self.assertNotIn('fixture-community', json.dumps(result))

    def test_no_response_is_distinct_from_tool_failure(self):
        app = application()
        for failure in [SimpleNamespace(returncode=1, stderr='Timeout: No Response', stdout=''), subprocess.TimeoutExpired('snmpget', 7)]:
            kwargs = {'side_effect': failure} if isinstance(failure, Exception) else {'return_value': failure}
            with patch('nms_service.snmp.session.subprocess.run', **kwargs): status, result = asyncio.run(request(app))
            self.assertEqual(status, 200); self.assertFalse(result['reachable']); self.assertEqual(result['outcome'], 'no_response')
        with patch('nms_service.snmp.session.subprocess.run', side_effect=FileNotFoundError('fixture-private-detail')), patch('nms_service.snmp.session.logger.error') as log:
            status, result = asyncio.run(request(app))
        self.assertEqual(status, 503); self.assertEqual(result, {'error': 'Test service unavailable'}); log.assert_not_called()

    def test_legacy_multiple_get_keeps_its_existing_contract(self):
        session = SNMPSession(**probe.settings_from(BODY))
        with patch('nms_service.snmp.session.subprocess.run', side_effect=FileNotFoundError()), patch('nms_service.snmp.session.logger.error'):
            self.assertEqual(session.get_multiple([probe.NAME]), {probe.NAME: None})
            with self.assertRaises(SNMPError): session.get_multiple([probe.NAME], strict_errors=True)

    def test_session_closes_on_success_and_failure(self):
        closed = []
        class Session:
            def __init__(self, **settings): pass
            def get_multiple(self, *_args, **_kwargs): return {probe.NAME: 'fixture'}
            def close(self): closed.append(True)
        probe.probe(probe.settings_from(BODY), Session)
        with patch.object(Session, 'get_multiple', side_effect=RuntimeError('fixture')):
            with self.assertRaises(RuntimeError): probe.probe(probe.settings_from(BODY), Session)
        self.assertEqual(len(closed), 2)

    def test_authentication_precedes_body_validation_and_io(self):
        with patch('nms_service.snmp.session.subprocess.run') as run:
            for token in [None, 'wrong-fixture-token']:
                status, result = asyncio.run(request(application(), b'{', token))
                self.assertEqual(status, 401); self.assertNotIn('reachable', result)
            run.assert_not_called()

    def test_invalid_and_oversized_bodies_do_not_probe(self):
        with patch('nms_service.snmp.session.subprocess.run') as run:
            for body in [b'{', [], {**BODY, 'snmpPort': 70000}, b'x' * 8193]:
                self.assertEqual(asyncio.run(request(application(), body))[0], 400)
            run.assert_not_called()

    def test_capacity_limit_and_slot_release_after_failure(self):
        for _ in range(4): self.assertTrue(probe._slots.acquire(blocking=False))
        try:
            with patch('nms_service.snmp.session.subprocess.run') as run:
                self.assertEqual(asyncio.run(request(application()))[0], 429); run.assert_not_called()
        finally:
            for _ in range(4): probe._slots.release()
        with patch('nms_service.snmp.session.subprocess.run', side_effect=FileNotFoundError()):
            for _ in range(6): self.assertEqual(asyncio.run(request(application()))[0], 503)


if __name__ == '__main__':
    assert 'nms_service.database.models' not in sys.modules, 'The probe must not load the database or polling startup'
    unittest.main()
