"""Execute the actual orchestrator class with fake time/DB/SNMP/SSH, using stdlib only."""
import ast
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as NS
from typing import Dict, Optional, Set
import threading
import unittest


class Clock:
    now = datetime(2026, 10, 16, 12)

    @classmethod
    def utcnow(cls):
        return cls.now


class Quiet:
    def __getattr__(self, _name):
        return lambda *_args, **_kwargs: None


def fixture(interval=30):
    Clock.now = datetime(2026, 10, 16, 12)
    state = NS(rows=[], source_calls=0, health_calls=0, updates=0, closed=0, jitter_calls=0,
               interfaces=True, health=True, metrics_fail=False, register_fail=False, gate=None)
    settings = NS(poll_interval_snmp_ok=60, poll_interval_ssh_only=300, poll_interval_unstable=600,
                  poll_jitter_max=10, polling=NS(interface_poll_interval=30, topology_poll_interval=3600))
    device = NS(nms_device_id=1, name='fixture-switch', vendor='Fixture', polling_interval=interval,
                polling_enabled=True, management_ip='192.0.2.1', snmp_version='2c', snmp_community='fixture-community',
                snmp_v3_auth_password=None, snmp_v3_privacy_password=None, snmp_v3_security_level=None,
                snmp_v3_username=None, snmp_v3_auth_protocol=None, snmp_v3_privacy_protocol=None,
                snmp_port=161, ssh_username=None, ssh_password=None)
    state.rows = [device]

    class Poller:
        def __init__(self):
            self.sessions = {}

        def register_device(self, config):
            self.sessions[config.device_id] = NS(device_name=config.device_name)

        def unregister_device(self, identity):
            self.sessions.pop(identity, None)

        def poll_interfaces(self, _identity):
            state.source_calls += 1
            if state.gate:
                state.gate[0].set()
                if not state.gate[1].wait(2):
                    raise RuntimeError('Fixture gate timeout')
            if not state.interfaces:
                return []
            return [NS(interface_index=1, interface_name='fixture-port', description='', admin_status='up', oper_status='up',
                       speed=1000, in_octets=1, out_octets=1, in_errors=0, out_errors=0, mtu=1500)]

        def poll_device_health(self, *_args):
            state.health_calls += 1
            return NS(uptime_seconds=1, cpu_usage=1, memory_usage=1, temperature=1) if state.health else None

        def poll_topology(self, _identity):
            return []

        def close_all(self):
            pass

    class Session:
        def close(self):
            state.closed += 1

    class Devices:
        def __init__(self, _session):
            pass

        def get_all_polling_enabled(self):
            if state.register_fail:
                raise RuntimeError('Fixture registration DB failure')
            return [row for row in state.rows if row.polling_enabled]

        def update_last_polled(self, _identity):
            state.updates += 1

    class Metrics:
        def __init__(self, _session):
            pass

        def save_interface_metrics(self, **_kwargs):
            if state.metrics_fail:
                raise RuntimeError('Fixture persistence failure')

        def save_health_metrics(self, **_kwargs):
            pass

    def jitter(_low, high):
        state.jitter_calls += 1
        return min(3, high)

    source = Path(__file__).resolve().parents[1] / 'nms_service/orchestrator.py'
    tree = ast.parse(source.read_text(encoding='utf-8'))
    node = next(item for item in tree.body if isinstance(item, ast.ClassDef) and item.name == 'NMSOrchestrator')
    scope = dict(Dict=Dict, Optional=Optional, Set=Set, Device=NS, datetime=Clock, config=settings,
                 logger=Quiet(), random=NS(randint=jitter), threading=threading,
                 db_manager=NS(get_session=Session, close=lambda: None), DeviceRepository=Devices, MetricsRepository=Metrics,
                 DeviceConfig=NS, SSHDeviceConfig=NS, CredentialEnvelopeError=ValueError,
                 decrypt_nms_credential=lambda value, _field: value)
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), 'exec'), scope)
    orchestrator = scope['NMSOrchestrator'].__new__(scope['NMSOrchestrator'])
    orchestrator.poller = Poller()
    orchestrator.ssh_poller = Poller()
    for key in ['device_map', 'last_topology_poll', 'last_device_poll', 'device_status', '_jitter_offset']:
        setattr(orchestrator, key, {})
    for key in ['_active_polls', '_pending_cancellations', '_snmp_config_warnings', '_ssh_config_warnings']:
        setattr(orchestrator, key, set())
    for key in ['_active_lock', '_last_poll_lock', '_topo_lock']:
        setattr(orchestrator, key, threading.Lock())
    orchestrator._registration_ready = False
    orchestrator._registration_summary = None
    orchestrator._executor = NS(shutdown=lambda **_kwargs: None)
    orchestrator.register_devices_from_db()
    assert orchestrator._registration_ready, 'Synthetic device registration must complete before checking timing'
    return orchestrator, state, device, settings, scope


class PollScheduling(unittest.TestCase):
    def test_saved_base_survives_every_outcome(self):
        for interval in [10, 30, 60, 300, 1200, 86400]:
            for status, floor in [(None, 0), ('snmp_ok', 0), ('ssh_only', 300), ('unstable', 600)]:
                with self.subTest(interval=interval, status=status):
                    o, _s, d, _c, _g = fixture(interval)
                    o.device_status[1] = status
                    self.assertEqual(o._effective_interval(1, d), max(interval, floor) + 3)

    def test_jitter_is_stable_and_bounded(self):
        o, s, d, c, _g = fixture()
        self.assertEqual(o._effective_interval(1, d), 33)
        self.assertEqual(o._effective_interval(1, d), 33)
        self.assertEqual(s.jitter_calls, 1)
        for bound in [0, -1, 2, 10]:
            o._jitter_offset.clear()
            c.poll_jitter_max = bound
            self.assertTrue(30 <= o._effective_interval(1, d) <= 30 + max(0, bound))

    def test_actual_poll_throttle_obeys_saved_seconds_and_due_boundary(self):
        o, s, _d, _c, _g = fixture(10)
        self.assertTrue(o._poll_single_device(1))
        Clock.now += timedelta(seconds=12.999)
        self.assertFalse(o._poll_single_device(1))
        self.assertEqual(s.source_calls, 1)
        Clock.now += timedelta(seconds=.001)
        self.assertTrue(o._poll_single_device(1))
        self.assertEqual(s.source_calls, 2)

    def test_interval_edits_are_reloaded_without_restart(self):
        o, s, d, _c, _g = fixture(300)
        o._poll_single_device(1)
        Clock.now += timedelta(seconds=33)
        d.polling_interval = 30
        o.register_devices_from_db()
        self.assertTrue(o._poll_single_device(1))
        d.polling_interval = 1200
        o.register_devices_from_db()
        Clock.now += timedelta(seconds=33)
        self.assertFalse(o._poll_single_device(1))
        self.assertEqual(s.source_calls, 2)

    def test_ssh_and_failure_outcomes_keep_recovery_floors(self):
        for status, interval in [('ssh_only', 303), ('unstable', 603)]:
            o, s, _d, _c, _g = fixture(10)
            o.device_status[1] = status
            o.last_device_poll[1] = Clock.now
            Clock.now += timedelta(seconds=interval - .01)
            self.assertFalse(o._poll_single_device(1))
            Clock.now += timedelta(seconds=.01)
            self.assertTrue(o._poll_single_device(1))
            self.assertEqual(s.source_calls, 1)

    def test_successful_recovery_returns_to_saved_snmp_base(self):
        o, _s, d, _c, _g = fixture(30)
        o.device_status[1] = 'unstable'
        self.assertTrue(o._poll_single_device(1))
        self.assertEqual(o.device_status[1], 'snmp_ok')
        self.assertEqual(o._effective_interval(1, d), 33)

    def test_disable_delete_and_reenable_clear_old_schedule_state(self):
        for mode in ['disable', 'delete']:
            o, s, d, _c, _g = fixture()
            o._poll_single_device(1)
            o.last_topology_poll[1] = Clock.now
            d.polling_enabled = False
            if mode == 'delete':
                s.rows = []
            o.register_devices_from_db()
            self.assertFalse(o._poll_single_device(1))
            for mapping in [o.device_map, o.device_status, o.last_device_poll, o.last_topology_poll, o._jitter_offset]:
                self.assertNotIn(1, mapping)
            d.polling_enabled = True
            s.rows = [d]
            o.register_devices_from_db()
            self.assertTrue(o._poll_single_device(1))

    def test_no_data_and_failed_persistence_do_not_trigger_fast_retries(self):
        for failure in ['source', 'database']:
            o, s, _d, _c, _g = fixture(30)
            if failure == 'source':
                s.interfaces = False
                s.health = False
            else:
                s.metrics_fail = True
            self.assertFalse(o._poll_single_device(1))
            self.assertEqual(s.updates, 0)
            self.assertEqual(o.device_status[1], 'unstable')
            self.assertEqual(o._effective_interval(1, _d), 603)
            Clock.now += timedelta(seconds=5)
            self.assertFalse(o._poll_single_device(1))
            self.assertEqual(s.source_calls, 1)

    def test_sleep_tracks_short_intervals_and_refreshes_settings_within_five_seconds(self):
        o, _s, _d, _c, _g = fixture(10)
        o._poll_single_device(1)
        self.assertEqual(o._next_poll_delay(), 5)
        Clock.now += timedelta(seconds=12)
        self.assertEqual(o._next_poll_delay(), 1)
        o._active_polls.add(1)
        Clock.now += timedelta(seconds=10)
        self.assertEqual(o._next_poll_delay(), 5)

    def test_bad_or_missing_interval_uses_safe_fallback(self):
        for invalid in [None, 0, -1, 1.5, '30', True, 86401]:
            o, _s, d, _c, _g = fixture(invalid)
            self.assertEqual(o._effective_interval(1, d), 63)

    def test_registration_failure_prevents_loop_from_using_stale_settings(self):
        o, s, _d, _c, scope = fixture()
        s.register_fail = True
        sleeps = []
        def sleep(seconds):
            sleeps.append(seconds)
            raise KeyboardInterrupt()
        scope['time'] = NS(sleep=sleep)
        o.poll_cycle = lambda: self.fail('Stale registration must not poll')
        o.run()
        self.assertFalse(o._registration_ready)
        self.assertTrue(sleeps[0] <= 5)

    def test_same_device_cannot_overlap_when_interval_changes_mid_poll(self):
        o, s, d, _c, _g = fixture(10)
        entered, release = threading.Event(), threading.Event()
        s.gate = (entered, release)
        worker = threading.Thread(target=o._poll_single_device, args=(1,))
        worker.start()
        try:
            self.assertTrue(entered.wait(1))
            d.polling_interval = 30
            Clock.now += timedelta(seconds=60)
            self.assertFalse(o._poll_single_device(1))
            self.assertEqual(s.source_calls, 1)
        finally:
            release.set()
            worker.join(2)
        self.assertFalse(worker.is_alive())

    def test_actual_ssh_only_collection_uses_recovery_floor(self):
        o, s, d, _c, _g = fixture(30)
        o.poller.sessions.clear()
        o.ssh_poller.sessions[1] = NS(device_name='fixture-ssh')
        self.assertTrue(o._poll_single_device(1))
        self.assertEqual(o.device_status[1], 'ssh_only')
        self.assertEqual(o._effective_interval(1, d), 303)
        self.assertEqual(s.updates, 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
