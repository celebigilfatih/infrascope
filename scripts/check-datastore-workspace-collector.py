"""Read-only collector checks against synthetic SDK objects. No source connection."""
import importlib.util
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace as Obj

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('datastore_collector', ROOT / 'get-datastore-workspace.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

def mount(id='h1', **info):
    values = dict(accessible=True, accessMode='readWrite'); values.update(info)
    return Obj(key=Obj(_moId=id, name='Same host name', runtime=Obj(connectionState='connected')), mountInfo=Obj(**values))

def datastore(id='d1', **summary):
    values = dict(accessible=True, capacity=10000, freeSpace=0, type='VMFS', maintenanceMode='normal', multipleHostAccess=True); values.update(summary)
    return Obj(_moId=id, name='Datastore', summary=Obj(**values), host=[mount('h1'), mount('h2', accessible=False, mounted=False, accessMode='readOnly', inaccessibleReason='PermanentDeviceLoss')])

class CollectorTests(unittest.TestCase):
    def collect(self, records):
        self.destroyed = False
        def destroy(): self.destroyed = True
        view = Obj(view=records, Destroy=destroy)
        result = collector.collect_datastore_workspace(Obj(rootFolder=Obj(), viewManager=Obj(CreateContainerView=lambda *_: view)), Obj(Datastore=object), None)
        self.assertTrue(self.destroyed)
        return result

    def test_exact_bytes_zero_free_and_real_host_mounts(self):
        row = self.collect([datastore()])[0]
        self.assertEqual(row['capacityBytes'], 10000); self.assertEqual(row['freeBytes'], 0)
        self.assertEqual([host['id'] for host in row['hosts']], ['h1', 'h2'])
        self.assertTrue(row['accessible']); self.assertFalse(row['hosts'][1]['accessible'])
        self.assertFalse(row['hosts'][1]['mounted']); self.assertEqual(row['hosts'][1]['accessMode'], 'readOnly')
        self.assertEqual(row['hosts'][1]['inaccessibleReason'], 'PermanentDeviceLoss')
        self.assertTrue(row['hosts'][0]['mounted'], 'SDK default for absent optional mounted flag is true')

    def test_inaccessible_or_unknown_summary_cannot_report_valid_capacity(self):
        for accessible in [False, None]:
            row = self.collect([datastore(accessible=accessible)])[0]
            self.assertIsNone(row['capacityBytes']); self.assertIsNone(row['freeBytes'])

    def test_missing_or_invalid_measurements_and_host_data_remain_unknown(self):
        item = datastore(capacity=-1, freeSpace=None); item.host = None
        row = self.collect([item])[0]
        self.assertIsNone(row['capacityBytes']); self.assertIsNone(row['freeBytes']); self.assertIsNone(row['hosts'])
        item.host = [mount()]; item.host[0].mountInfo = None
        host = self.collect([item])[0]['hosts'][0]
        self.assertIsNone(host['mounted']); self.assertIsNone(host['accessible']); self.assertEqual(host['accessMode'], 'unknown')

    def test_empty_host_list_differs_from_unknown_and_zero_capacity_survives(self):
        item = datastore(capacity=0, freeSpace=0); item.host = []
        row = self.collect([item])[0]
        self.assertEqual(row['hosts'], []); self.assertEqual(row['capacityBytes'], 0)

    def test_empty_and_partial_failure_destroy_view(self):
        self.assertEqual(self.collect([]), [])
        with self.assertRaises(AttributeError): self.collect([datastore(), Obj()])
        self.assertTrue(self.destroyed)

if __name__ == '__main__': unittest.main()
