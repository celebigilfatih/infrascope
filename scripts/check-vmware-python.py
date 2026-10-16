"""Actual Python protocol/collectors and local TLS; no customer systems."""
import importlib.metadata
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from xml.etree import ElementTree
from contextlib import redirect_stdout
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace as Obj
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import vmware_helper as helper


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


snapshots = load_script('get-snapshots')
hosts = load_script('get-host-details')


class ProtocolTests(unittest.TestCase):
    def invoke(self, op='snapshots', rows=None, raw=None, env=None, fault=None):
        calls = []
        view = Obj(view=rows or [], Destroy=lambda: calls.append('destroy'))
        def create(*_):
            if fault == 'permission':
                raise type('NoPermission', (Exception,), {})('fixture-secret')
            return view
        content = Obj(rootFolder=Obj(), viewManager=Obj(CreateContainerView=create))
        service = Obj(RetrieveContent=lambda: content)
        def connect(**kwargs):
            calls.append(kwargs)
            if fault == 'auth':
                raise type('InvalidLogin', (Exception,), {})('fixture-secret')
            if fault == 'timeout':
                raise TimeoutError('fixture-secret')
            if fault == 'tls':
                raise ssl.SSLCertVerificationError('fixture-secret')
            return service
        vim = Obj(VirtualMachine=object, HostSystem=object)
        request = {'protocol': 1, 'operation': op, 'host': 'fixture.invalid:8443', 'username': 'fixture-reader',
                   'password': ' şifre \' " $() & | ;\n 雪 ', 'tls': {'verify': True}}
        collector = snapshots.collect_snapshots if op == 'snapshots' else hosts.collect_hosts
        buffer = io.StringIO()
        with patch.dict(os.environ, env or {'NODE_ENV': 'production'}, clear=True), \
             patch.object(sys, 'stdin', Obj(buffer=io.BytesIO((raw or json.dumps(request)).encode()))), \
             patch.object(helper, 'sdk', return_value=(connect, lambda _: calls.append('disconnect'), vim)), \
             redirect_stdout(buffer):
            status = helper.main(op, collector)
        self.assertNotIn('fixture-secret', buffer.getvalue())
        return status, json.loads(buffer.getvalue()), calls

    def test_verified_empty_collection_and_cleanup(self):
        for op in ('hosts', 'snapshots'):
            status, data, calls = self.invoke(op)
            self.assertEqual(status, 0)
            self.assertEqual(data[op], [])
            self.assertEqual(calls[-2:], ['destroy', 'disconnect'])
            self.assertTrue(calls[0]['sslContext'].check_hostname)
            self.assertEqual(calls[0]['sslContext'].verify_mode, ssl.CERT_REQUIRED)
            self.assertEqual(calls[0]['port'], 8443)
            self.assertIn('$()', calls[0]['pwd'])
            self.assertIn('\n', calls[0]['pwd'])

    def test_explicit_vm_without_snapshots_is_empty_success(self):
        raw = json.dumps({'protocol': 1, 'operation': 'snapshots', 'host': 'fixture.invalid', 'username': 'reader',
                          'password': 'fixture', 'vmId': 'vm-1', 'tls': {'verify': True}})
        status, data, _ = self.invoke(rows=[Obj(_moId='vm-1', snapshot=None)], raw=raw)
        self.assertEqual(status, 0)
        self.assertEqual(data['snapshots'], [])

    def test_missing_vm_is_not_no_snapshots(self):
        request = {'protocol': 1, 'operation': 'snapshots', 'host': 'fixture.invalid', 'username': 'reader',
                   'password': 'fixture', 'vmId': 'vm-missing', 'tls': {'verify': True}}
        status, data, calls = self.invoke(raw=json.dumps(request))
        self.assertEqual(status, 1)
        self.assertEqual(data['code'], 'VM_NOT_FOUND')
        self.assertEqual(calls[-2:], ['destroy', 'disconnect'])

    def test_fault_classes_are_sanitized(self):
        for fault, code in [('auth', 'AUTH_FAILED'), ('permission', 'PERMISSION_DENIED'), ('timeout', 'SOURCE_TIMEOUT'), ('tls', 'TLS_ERROR')]:
            for op in ('hosts', 'snapshots'):
                status, data, calls = self.invoke(op, fault=fault)
                self.assertEqual(status, 1)
                self.assertEqual(data['code'], code)
                self.assertNotIn(op, data)
                if fault == 'permission':
                    self.assertEqual(calls[-1], 'disconnect')

    def test_partial_iteration_is_not_success(self):
        status, data, calls = self.invoke(rows=[Obj(_moId='vm-1')])
        self.assertEqual(status, 1)
        self.assertEqual(data['code'], 'SOURCE_ERROR')
        self.assertEqual(calls[-2:], ['destroy', 'disconnect'])

    def test_host_data_comes_from_required_hardware(self):
        hardware = Obj(systemInfo=Obj(vendor='Fixture', model='Fixture'), memorySize=16 * 1024**3, cpuInfo=Obj(numCpuCores=8))
        row = Obj(_moId='host-1', name='Fixture', hardware=hardware, summary=Obj(hardware=Obj(numCpuCores=8)),
                  config=Obj(product=Obj(version='8.fixture', build='fixture', fullName='ESXi fixture')))
        status, data, _ = self.invoke('hosts', [row])
        self.assertEqual(status, 0)
        self.assertEqual(data['hosts'][0]['host_moid'], 'host-1')
        self.assertEqual(data['hosts'][0]['cpu_cores'], 8)
        self.assertEqual(data['hosts'][0]['memory_size_mb'], 16384)

    def test_snapshot_recursion_and_utc(self):
        created = datetime(2026, 10, 16, 3, 0, tzinfo=timezone(timedelta(hours=3)))
        child = Obj(snapshot=Obj(_moId='snapshot-2'), name='Child', description=None, createTime=created, state='poweredOn', childSnapshotList=[])
        root = Obj(snapshot=Obj(_moId='snapshot-1'), name='Root', description='', createTime=created, state='poweredOn', childSnapshotList=[child])
        vm = Obj(_moId='vm-1', name='VM', snapshot=Obj(rootSnapshotList=[root]), layoutEx=Obj(file=[Obj(type='snapshotData', size=2048)]))
        status, data, _ = self.invoke(rows=[vm])
        self.assertEqual(status, 0)
        self.assertEqual(len(data['snapshots']), 2)
        self.assertEqual(data['snapshots'][0]['createTime'], '2026-10-16T00:00:00+00:00')

    def test_invalid_json_and_duplicate_fields_fail(self):
        for raw in ['not json', '[]', '{"protocol":true,"operation":"snapshots"}',
                    '{"protocol":1,"protocol":1,"operation":"snapshots"}',
                    '{"protocol":1,"operation":"hosts"}']:
            status, data, calls = self.invoke(raw=raw)
            self.assertEqual(status, 1)
            self.assertEqual(data['code'], 'INVALID_REQUEST')
            self.assertEqual(calls, [])

    def test_production_bypass_is_blocked_in_both_entry_points(self):
        for op in ('hosts', 'snapshots'):
            request = {'protocol': 1, 'operation': op, 'host': 'fixture.invalid', 'username': 'reader', 'password': 'fixture', 'tls': {'verify': False}}
            status, data, calls = self.invoke(op, raw=json.dumps(request))
            self.assertEqual(status, 1)
            self.assertEqual(data['code'], 'TLS_POLICY')
            self.assertEqual(calls, [])

    def test_production_env_bypass_is_blocked_even_with_verified_input(self):
        for env in [{'NODE_ENV': 'production', 'VMWARE_TLS_INSECURE': 'true'}, {'NODE_ENV': 'production', 'NODE_TLS_REJECT_UNAUTHORIZED': '0'}]:
            status, data, calls = self.invoke(env=env)
            self.assertEqual(status, 1)
            self.assertEqual(data['code'], 'TLS_POLICY')
            self.assertEqual(calls, [])

    def test_explicit_development_exception_only(self):
        for env in [{'NODE_ENV': 'development'}, {}, {'NODE_ENV': 'development', 'VMWARE_TLS_INSECURE': '1'}]:
            with patch.dict(os.environ, env, clear=True):
                if env.get('VMWARE_TLS_INSECURE'):
                    context = helper.tls_context({'verify': False})
                    self.assertEqual(context.verify_mode, ssl.CERT_NONE)
                else:
                    with self.assertRaises(helper.HelperError):
                        helper.tls_context({'verify': False})

    def test_ipv6_authority(self):
        request = {'protocol': 1, 'operation': 'hosts', 'host': '[::1]:8443', 'username': 'reader', 'password': 'fixture', 'tls': {'verify': True}}
        status, _, calls = self.invoke('hosts', raw=json.dumps(request))
        self.assertEqual(status, 0)
        self.assertEqual(calls[0]['host'], '::1')
        self.assertEqual(calls[0]['port'], 8443)

    def test_missing_sdk_is_structured_in_actual_interpreter(self):
        result = subprocess.run([sys.executable, '-S', '-B', str(ROOT / 'vmware_helper.py')],
                                input='{"protocol":1,"operation":"preflight"}', text=True, capture_output=True, timeout=10,
                                env={**os.environ, 'NODE_ENV': 'production', 'VMWARE_TLS_INSECURE': 'false'})
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['code'], 'SDK_MISSING')
        self.assertEqual(result.stderr, '')

    def test_installed_pinned_runtime_preflight_without_network(self):
        version = importlib.metadata.version('pyvmomi')
        self.assertEqual('pyvmomi==' + version, (ROOT / 'requirements-vmware.txt').read_text().strip())
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'vmware_helper.py')],
                                input='{"protocol":1,"operation":"preflight"}', text=True, capture_output=True, timeout=10,
                                env={**os.environ, 'NODE_ENV': 'production', 'VMWARE_TLS_INSECURE': 'false'})
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue(json.loads(result.stdout)['success'])
        self.assertEqual(result.stderr, '')


class LocalTlsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='vmware-tls-')
        cls.cert = Path(cls.temp.name) / 'server.crt'
        cls.key = Path(cls.temp.name) / 'server.key'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(cls.key),
                        '-out', str(cls.cert), '-days', '1', '-subj', '/CN=fixture.local', '-addext', 'subjectAltName=DNS:fixture.local,DNS:localhost,IP:127.0.0.1'],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def handshake(self, context, hostname):
        server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server_context.load_cert_chain(self.cert, self.key)
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        listener.settimeout(3)
        port = listener.getsockname()[1]
        def serve():
            try:
                connection, _ = listener.accept()
                with connection:
                    try:
                        with server_context.wrap_socket(connection, server_side=True):
                            pass
                    except ssl.SSLError:
                        pass
            finally:
                listener.close()
        thread = threading.Thread(target=serve, daemon=True)
        thread.start()
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=3) as connection:
                with context.wrap_socket(connection, server_hostname=hostname):
                    pass
        finally:
            thread.join(timeout=4)
            self.assertFalse(thread.is_alive())

    def test_configured_ca_accepts_matching_hostname(self):
        self.handshake(helper.tls_context({'verify': True, 'caPem': self.cert.read_text()}), 'fixture.local')

    def test_untrusted_certificate_rejected(self):
        with self.assertRaises(ssl.SSLCertVerificationError):
            self.handshake(helper.tls_context({'verify': True}), 'fixture.local')

    def test_wrong_hostname_rejected_with_trusted_ca(self):
        with self.assertRaises(ssl.SSLCertVerificationError):
            self.handshake(helper.tls_context({'verify': True, 'caPem': self.cert.read_text()}), 'wrong.fixture.invalid')

    def test_real_sdk_login_and_logout_over_verified_local_soap(self):
        from pyVmomi.VmomiSupport import versionIdMap
        events = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def reply(self, body):
                encoded = body.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/xml; charset=utf-8')
                self.send_header('Content-Length', str(len(encoded)))
                self.send_header('Set-Cookie', 'vmware_soap_session="fixture-owned-session"; Path=/sdk')
                self.end_headers()
                self.wfile.write(encoded)

            def do_GET(self):
                versions = ''.join('<version>' + v + '</version>' for v in sorted(set(versionIdMap.values())))
                self.reply('<namespaces version="1.0"><namespace><name>urn:vim25</name><version>8.0.0.0</version>'
                           '<priorVersions>' + versions + '</priorVersions></namespace></namespaces>')

            def do_POST(self):
                document = ElementTree.fromstring(self.rfile.read(int(self.headers['Content-Length'])))
                operation = list(document.find('{http://schemas.xmlsoap.org/soap/envelope/}Body'))[0]
                name = operation.tag.split('}')[-1]
                events.append(name)
                if name == 'RetrieveServiceContent':
                    value = '<returnval><rootFolder type="Folder">group-root</rootFolder>' \
                            '<propertyCollector type="PropertyCollector">propertyCollector</propertyCollector>' \
                            '<viewManager type="ViewManager">ViewManager</viewManager>' \
                            '<sessionManager type="SessionManager">SessionManager</sessionManager>' \
                            '<about><name>Fixture</name><fullName>Fixture</fullName><vendor>Fixture</vendor>' \
                            '<version>8.0.0</version><build>fixture</build><apiType>VirtualCenter</apiType><apiVersion>8.0.0.0</apiVersion></about></returnval>'
                elif name == 'Login':
                    events.append({child.tag.split('}')[-1]: child.text for child in operation})
                    value = '<returnval><key>fixture-session</key><userName>fixture-reader</userName><fullName>Fixture</fullName>' \
                            '<loginTime>2026-10-16T00:00:00Z</loginTime><lastActiveTime>2026-10-16T00:00:00Z</lastActiveTime>' \
                            '<locale>en_US</locale><messageLocale>en</messageLocale></returnval>'
                else:
                    value = ''
                self.reply('<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">'
                           '<soapenv:Body><' + name + 'Response xmlns="urn:vim25">' + value + '</' + name + 'Response>'
                           '</soapenv:Body></soapenv:Envelope>')
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(self.cert, self.key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        password = ' şifre \' " $() & | ; 雪 '
        try:
            with patch.dict(os.environ, {'NODE_ENV': 'production'}, clear=True):
                result = helper.collect({'host': '127.0.0.1:' + str(server.server_port), 'username': 'fixture-reader',
                                         'password': password, 'tls': {'verify': True, 'caPem': self.cert.read_text()}},
                                        'hosts', lambda *_: [])
            self.assertTrue(result['success'])
            self.assertIn('Login', events)
            self.assertIn('Logout', events)
            login = next(item for item in events if isinstance(item, dict))
            self.assertEqual(login['userName'], 'fixture-reader')
            self.assertEqual(login['password'], password)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
