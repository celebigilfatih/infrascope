"""Synthetic vSphere SDK records; never connects to a VMware source."""
import importlib.util
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace as Obj

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('vm_collector', ROOT / 'get-vm-workspace.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

def vm(id='v1', **runtime):
    state = dict(host=Obj(_moId='h1', name='Runtime ESXi'), powerState='poweredOn', connectionState='connected', maxCpuUsage=10000)
    state.update(runtime)
    return Obj(_moId=id, name='VM', parent=Obj(_moId='folder1', name='Wrong folder'), guest=Obj(guestState='unknown'), summary=Obj(config=Obj(template=False, numCpu=4, memorySizeMB=8192, guestFullName='Configured OS'), runtime=Obj(**state), overallStatus='green', guest=Obj(ipAddress=None, guestFullName=None), quickStats=Obj(overallCpuUsage=2500, guestMemoryUsage=2048, hostMemoryUsage=4096)))

class CollectorTests(unittest.TestCase):
    def collect(self, records):
        self.destroyed = False
        def destroy(): self.destroyed = True
        view = Obj(view=records, Destroy=destroy)
        result = collector.collect_vm_workspace(Obj(rootFolder=Obj(), viewManager=Obj(CreateContainerView=lambda *_: view)), Obj(VirtualMachine=object), None)
        self.assertTrue(self.destroyed)
        return result

    def test_runtime_power_and_host_not_guest_or_parent(self):
        row = self.collect([vm()])[0]
        self.assertEqual(row['powerState'], 'poweredOn'); self.assertEqual(row['guestState'], 'unknown')
        self.assertEqual(row['hostId'], 'h1'); self.assertEqual(row['hostName'], 'Runtime ESXi')
        self.assertEqual(row['cpuCapacityMHz'], 10000); self.assertEqual(row['usedCpuMHz'], 2500)
        self.assertEqual(row['activeMemoryBytes'], 2048*1024**2); self.assertEqual(row['hostMemoryBytes'], 4096*1024**2)
        self.assertEqual(row['memoryBytes'], 8192*1024**2); self.assertEqual(row['os'], 'Configured OS')

    def test_off_suspended_and_disconnected_do_not_reuse_stats(self):
        for override in [dict(powerState='poweredOff'), dict(powerState='suspended'), dict(connectionState='inaccessible')]:
            row = self.collect([vm(**override)])[0]
            self.assertIsNone(row['usedCpuMHz']); self.assertIsNone(row['activeMemoryBytes']); self.assertIsNone(row['hostMemoryBytes'])

    def test_missing_zero_invalid_stats_and_assignment(self):
        item = vm(host=None); item.summary.quickStats.overallCpuUsage = 0; item.summary.quickStats.guestMemoryUsage = -1
        row = self.collect([item])[0]
        self.assertEqual(row['usedCpuMHz'], 0); self.assertIsNone(row['activeMemoryBytes']); self.assertEqual(row['hostAssignment'], 'unassigned')
        item.summary.runtime = None; item.summary.config = None
        row = self.collect([item])[0]
        self.assertEqual(row['hostAssignment'], 'unknown'); self.assertIsNone(row['template']); self.assertIsNone(row['cpuCount'])

    def test_templates_empty_and_failure_cleanup(self):
        item = vm(); item.summary.config.template = True
        self.assertEqual(self.collect([item]), []); self.assertEqual(self.collect([]), [])
        with self.assertRaises(AttributeError): self.collect([Obj()])
        self.assertTrue(self.destroyed)

if __name__ == '__main__': unittest.main()
