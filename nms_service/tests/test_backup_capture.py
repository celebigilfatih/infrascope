import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import paramiko
from nms_service.ssh.backups import BackupError, PROFILES, _read_exec, capture_configuration, resolve_platform, validate_configuration
from nms_service.ssh.poller import SSHDeviceConfig
from nms_service.recovery import create_bundle, extract_bundle
from nms_service import recovery
from nms_service.tests.ssh_fixture import FixtureServer
from nms_service.ssh.poller import host_key_fingerprint

IOS = 'version 15.2\nhostname fixture-switch\ninterface GigabitEthernet0/1\n description fixture-uplink\n!\nend\n'
FIXTURES = {
    'cisco_ios': IOS, 'cisco_nxos': IOS, 'arista_eos': IOS,
    'comware': '#\nversion 7.1\nsysname fixture-switch\n#\ninterface GigabitEthernet1/0/1\n description fixture\n#\nreturn\n',
    'huawei_vrp': '#\nversion 8.1\nsysname fixture-switch\n#\ninterface GigabitEthernet1/0/1\n description fixture\n#\nreturn\n',
    'aruba_switch': '; JL071A Configuration Editor; Created on release #KB.16.10\nhostname "fixture-switch"\nvlan 1\n name "DEFAULT_VLAN"\n exit\n',
    'aruba_cx': '!Version AOS-CX 10.13\nhostname fixture-switch\ninterface 1/1/1\n no shutdown\n vlan access 1\n',
    'junos': 'set version 22.4R1\nset system host-name fixture-switch\nset interfaces ge-0/0/0 description fixture\n',
    'fortios': '#config-version=FGT-fixture\nconfig system global\n    set hostname "fixture-firewall"\nend\n',
    'routeros': '# RouterOS 7.16 fixture export\n/system identity set name=fixture-router\n/interface bridge add name=bridge\n',
}


class CaptureTests(unittest.TestCase):
    def test_database_url_preserves_encoded_password_and_tls_options(self):
        from sqlalchemy.engine import make_url
        from nms_service.core.config import Config
        with patch.dict(os.environ, {'DATABASE_URL':'postgresql://fixture:p%40ss%2Fword@db:5432/company?sslmode=verify-full&sslrootcert=%2Fcerts%2Fca.pem&schema=public&connection_limit=2'}):
            parsed=make_url(Config().database.connection_string)
        self.assertEqual(parsed.password,'p@ss/word')
        self.assertEqual(parsed.query['sslmode'],'verify-full')
        self.assertEqual(parsed.query['sslrootcert'],'/certs/ca.pem')
        self.assertNotIn('schema',parsed.query)

    def test_real_ssh_exec_and_startup_protocol(self):
        with FixtureServer() as server:
            cfg=SSHDeviceConfig(1,'fixture','127.0.0.1','fixture','fixture-password',port=server.port,host_key_fingerprint=host_key_fingerprint(server.key))
            running=capture_configuration(cfg,'cisco_ios','Running Config')
            startup=capture_configuration(cfg,'cisco_ios','Startup Config')
            self.assertIn('hostname fixture-running',running)
            self.assertIn('hostname fixture-startup',startup)
            self.assertEqual(server.commands,['show running-config','show startup-config'])

    def test_real_terminal_only_server(self):
        with FixtureServer(interactive=True) as server:
            cfg=SSHDeviceConfig(1,'fixture','127.0.0.1','fixture','fixture-password',port=server.port,host_key_fingerprint=host_key_fingerprint(server.key))
            output=capture_configuration(cfg,'cisco_ios','Running Config')
            self.assertIn('hostname fixture-running',output)
            self.assertEqual(server.commands,['terminal length 0','show running-config'])

    def test_real_truncated_server_is_rejected(self):
        with FixtureServer(truncated=True) as server:
            cfg=SSHDeviceConfig(1,'fixture','127.0.0.1','fixture','fixture-password',port=server.port,host_key_fingerprint=host_key_fingerprint(server.key))
            with self.assertRaises(BackupError) as error: capture_configuration(cfg,'cisco_ios','Running Config')
            self.assertEqual(error.exception.code,'INCOMPLETE_OUTPUT')

    def test_real_mismatched_host_key_rejects_before_authentication(self):
        with FixtureServer() as server:
            cfg=SSHDeviceConfig(1,'fixture','127.0.0.1','fixture','fixture-password',port=server.port,host_key_fingerprint='SHA256:incorrect')
            with self.assertRaises(BackupError) as error: capture_configuration(cfg,'cisco_ios','Running Config')
            self.assertEqual(error.exception.code,'HOST_KEY_REJECTED')
            self.assertEqual(server.auth_attempts,0)

    def test_all_profile_fixtures(self):
        self.assertEqual(set(PROFILES), set(FIXTURES))
        for platform, output in FIXTURES.items():
            with self.subTest(platform=platform):
                self.assertEqual(validate_configuration(output, platform), output)

    def test_partial_output_is_not_a_backup(self):
        for platform, marker in [('cisco_ios', 'end'), ('comware', 'return'), ('huawei_vrp', 'return'), ('fortios', 'end')]:
            with self.subTest(platform=platform), self.assertRaises(BackupError):
                validate_configuration(FIXTURES[platform].rsplit(marker, 1)[0], platform)

    def test_structural_failure_explains_missing_procurve_marker_without_config_contents(self):
        for original, expected in [('Configuration Editor', 'Configuration Editor'), ('hostname "fixture-switch"', 'hostname')]:
            output = FIXTURES['aruba_switch'].replace(original, 'fixture-private-value')
            with self.subTest(marker=original), self.assertRaises(BackupError) as error:
                validate_configuration(output, 'aruba_switch')
            self.assertEqual(error.exception.code, 'INCOMPLETE_OUTPUT')
            self.assertIn('HP ProCurve / ArubaOS-Switch', str(error.exception))
            self.assertIn(expected, str(error.exception))
            self.assertNotIn('fixture-private-value', str(error.exception))
            self.assertFalse(error.exception.retryable)

    def test_pager_error_and_invalid_encoding_rejected(self):
        for output in [IOS+'--More--', IOS+'\n% Invalid input', IOS+'\ufffd', 'hostname short']:
            with self.assertRaises(BackupError): validate_configuration(output, 'cisco_ios')

    def test_platforms_are_not_inferred_from_device_names(self):
        cases = [('HP', '2530', 'aruba_switch'), ('HP', '5510', 'comware'), ('HP', '', None), ('Aruba', '', None), ('Aruba', 'AOS-CX 6300', 'aruba_cx'), ('Cisco', '', 'cisco_ios')]
        for vendor, model, expected in cases:
            self.assertEqual(resolve_platform(SimpleNamespace(vendor=vendor, model=model)), expected)
        self.assertEqual(resolve_platform(SimpleNamespace(backup_platform='comware', vendor='HP')), 'comware')

    def test_startup_uses_a_different_command(self):
        cfg = SSHDeviceConfig(1,'fixture','127.0.0.1','fixture','fixture',host_key_fingerprint='fixture')
        session = MagicMock()
        session.connect.return_value = True
        with patch('nms_service.ssh.backups.SSHSession', return_value=session), patch('nms_service.ssh.backups._read_exec', return_value=IOS) as read:
            capture_configuration(cfg, 'cisco_ios', 'Startup Config')
            self.assertEqual(read.call_args.args[1], 'show startup-config')
            session.close.assert_called_once()
        with self.assertRaises(BackupError) as error: capture_configuration(cfg, 'comware', 'Startup Config')
        self.assertEqual(error.exception.code, 'UNSUPPORTED_TYPE')

    def test_auth_and_pin_failures_do_not_retry(self):
        cfg = SSHDeviceConfig(1,'fixture','127.0.0.1','fixture','fixture',host_key_fingerprint='fixture')
        for failure, expected in [(paramiko.AuthenticationException('failed'), 'AUTH_FAILED'), (paramiko.SSHException('SSH host key mismatch'), 'HOST_KEY_REJECTED')]:
            session = MagicMock(); session.connect.return_value=False; session.last_error=failure
            with patch('nms_service.ssh.backups.SSHSession', return_value=session), self.assertRaises(BackupError) as error:
                capture_configuration(cfg, 'cisco_ios', 'Running Config')
            self.assertEqual(error.exception.code, expected)
            self.assertFalse(error.exception.retryable)
            session.close.assert_called_once()

    def test_exec_drains_before_exit_status_and_rejects_nonzero(self):
        for status in [0, 1]:
            channel = MagicMock()
            channel.recv_ready.side_effect = [True, False]
            channel.recv_stderr_ready.side_effect = [False, False]
            channel.recv.return_value = IOS.encode()
            channel.eof_received=True; channel.exit_status_ready.return_value=True
            channel.recv_exit_status.return_value=status
            stdout=SimpleNamespace(channel=channel, close=lambda: None)
            client=MagicMock(); client.exec_command.return_value=(io.BytesIO(),stdout,io.BytesIO())
            if status:
                with self.assertRaises(BackupError): _read_exec(client, 'show running-config', 10**20)
            else:
                self.assertEqual(_read_exec(client, 'show running-config', 10**20), IOS)
            channel.close.assert_called_once()

    def test_exec_has_total_deadline(self):
        channel=MagicMock(); channel.eof_received=False; channel.closed=False
        channel.recv_ready.return_value=False; channel.recv_stderr_ready.return_value=False
        client=MagicMock(); client.exec_command.return_value=(io.BytesIO(), SimpleNamespace(channel=channel,close=lambda:None), io.BytesIO())
        with patch('nms_service.ssh.backups.time.monotonic', side_effect=[0,100]), self.assertRaises(BackupError) as error:
            _read_exec(client, 'show running-config', 10)
        self.assertEqual(error.exception.code, 'TIMEOUT')


class RecoveryTests(unittest.TestCase):
    def test_verify_authenticates_bundle_without_publishing_plaintext(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);dump=root/'database.dump';dump.write_bytes(os.urandom(2*1024*1024))
            bundle=root/'verified.isbackup';phrase=b'fixture-passphrase-32-characters'
            create_bundle(dump,bundle,phrase,{'NEXTAUTH_SECRET':'fixture-key'})
            before=set(root.iterdir())
            self.assertEqual(recovery.verify_bundle(bundle,phrase)['format'],1)
            self.assertEqual(set(root.iterdir()),before)
            with self.assertRaises(Exception):recovery.verify_bundle(bundle,b'wrong-fixture-passphrase')
            data=bytearray(bundle.read_bytes());data[-17]^=1;bundle.write_bytes(data)
            with self.assertRaises(Exception):recovery.verify_bundle(bundle,phrase)
            self.assertEqual(set(root.iterdir()),before)

    def test_https_ca_and_metadata_are_authenticated_encrypted_and_restored(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); dump=root/'database.dump'; dump.write_bytes(b'fixture database')
            material=root/'installation'; material.mkdir()
            private_ca=b'fixture-only private CA key material'+os.urandom(32000)
            metadata=b'{"project":"fixture-https","caHash":"fixture-fingerprint"}'
            (material/'https-recovery.tar').write_bytes(private_ca)
            (material/'https-recovery.json').write_bytes(metadata)
            bundle=root/'tls.isbackup'; phrase=b'fixture-passphrase-32-characters'
            create_bundle(dump,bundle,phrase,{'NEXTAUTH_SECRET':'fixture-key'},material)
            self.assertNotIn(b'fixture-only private CA key material',bundle.read_bytes())
            extract_bundle(bundle,root/'restored',phrase)
            recovered=json.loads((root/'restored/installation-keys.json').read_text())
            self.assertEqual(recovered['format'],2)
            self.assertEqual((root/'restored/https-recovery.tar').read_bytes(),private_ca)
            self.assertEqual((root/'restored/https-recovery.json').read_bytes(),metadata)

    def test_oversized_tls_recovery_material_is_rejected_before_publishing_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); dump=root/'database.dump'; dump.write_bytes(b'fixture')
            material=root/'installation'; material.mkdir()
            (material/'https-recovery.tar').write_bytes(b'x'*(2*1024*1024+1))
            (material/'https-recovery.json').write_bytes(b'{}')
            output=root/'rejected.isbackup'
            with self.assertRaises(ValueError):
                create_bundle(dump,output,b'fixture-passphrase-32-characters',{'NEXTAUTH_SECRET':'fixture-key'},material)
            self.assertFalse(output.exists())

    def test_partial_tls_recovery_material_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); dump=root/'database.dump'; dump.write_bytes(b'fixture')
            material=root/'installation'; material.mkdir()
            (material/'https-recovery.json').write_bytes(b'{}')
            with self.assertRaises(ValueError):
                create_bundle(dump,root/'rejected.isbackup',b'fixture-passphrase-32-characters',{'NEXTAUTH_SECRET':'fixture-key'},material)

    def test_authenticated_bundle_round_trip(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root); dump=root/'database.dump'; payload=os.urandom(2*1024*1024+13); dump.write_bytes(payload)
            bundle=root/'recovery.isbackup'; phrase=b'fixture-passphrase-32-characters'
            env={'INTEGRATION_CREDENTIALS_KEY':'fixture-private-key','NEXTAUTH_SECRET':'fixture-session-secret'}
            material=root/'installation'; material.mkdir()
            (material/'machine-id').write_text('fixture-installation-identity')
            (material/'environment.env').write_text('VERSION=fixture\n')
            create_bundle(dump,bundle,phrase,env,material)
            self.assertNotIn(b'fixture-private-key',bundle.read_bytes())
            extract_bundle(bundle,root/'restored',phrase)
            self.assertEqual((root/'restored/database.dump').read_bytes(),payload)
            self.assertIn('fixture-private-key',(root/'restored/installation-keys.json').read_text())
            self.assertEqual((root/'restored/machine-id').read_text(),'fixture-installation-identity')
            self.assertEqual((root/'restored/environment.env').read_text(),'VERSION=fixture\n')
            for index, wrong in enumerate([True, False]):
                destination=root/f'failure-{index}'
                if not wrong:
                    data=bytearray(bundle.read_bytes()); data[len(data)//2]^=1; bundle.write_bytes(data)
                with self.assertRaises(Exception): extract_bundle(bundle,destination,b'wrong-passphrase-32-characters' if wrong else phrase)
                self.assertFalse(destination.exists())
