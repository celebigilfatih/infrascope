"""Synthetic snapshot trees and layout references; no vCenter connection or writes."""
import importlib.util
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace as Obj
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('snapshot_workspace_collector', ROOT / 'get-snapshot-workspace.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

def snapshot(id, children=None, created=None):
    return Obj(snapshot=Obj(_moId=id), name='Same name', description='', createTime=created or datetime(2026, 10, 1, 10, tzinfo=timezone(timedelta(hours=3))), state='poweredOn', childSnapshotList=children or [])

def layout(id, data_key, disk_keys):
    return Obj(key=Obj(_moId=id), dataKey=data_key, memoryKey=-1, disk=[Obj(chain=[Obj(fileKey=disk_keys)])])

def vm(id='v1'):
    tree = snapshot('s1', [snapshot('s2')])
    files = [Obj(key=1, size=100), Obj(key=2, size=0), Obj(key=10, size=1000), Obj(key=20, size=2000), Obj(key=99, size=999999)]
    return Obj(_moId=id, name='VM', summary=Obj(config=Obj(template=False), runtime=Obj(connectionState='connected', powerState='poweredOn')), snapshot=Obj(rootSnapshotList=[tree]), layoutEx=Obj(snapshot=[layout('s1', 1, [10]), layout('s2', 2, [10, 20])], file=files))

class CollectorTests(unittest.TestCase):
    def collect(self, records):
        self.destroyed = False
        def destroy(): self.destroyed = True
        view = Obj(view=records, Destroy=destroy)
        rows = collector.collect_snapshot_workspace(Obj(rootFolder=Obj(), viewManager=Obj(CreateContainerView=lambda *_: view)), Obj(VirtualMachine=object), None)
        self.assertTrue(self.destroyed)
        return rows

    def test_nested_tree_matches_own_files_and_shares_base_without_duplicating_file_table(self):
        row = self.collect([vm()])[0]
        self.assertEqual([snap['id'] for snap in row['snapshots']], ['s1', 's2'])
        self.assertEqual(row['snapshots'][0]['fileKeys'], [1, 10]); self.assertEqual(row['snapshots'][1]['fileKeys'], [2, 10, 20])
        self.assertEqual([file['key'] for file in row['files']], [1, 2, 10, 20], 'Unrelated VM files must not enter the snapshot footprint')
        self.assertEqual(row['files'][1]['sizeBytes'], 0)
        self.assertEqual(row['snapshots'][0]['createTime'], '2026-10-01T07:00:00+00:00')

    def test_memory_file_is_included_and_duplicate_references_count_once(self):
        item = vm(); item.layoutEx.snapshot[0].memoryKey = 20; item.layoutEx.snapshot[0].disk[0].chain[0].fileKey = [10, 10]
        row = self.collect([item])[0]
        self.assertEqual(row['snapshots'][0]['fileKeys'], [1, 10, 20])

    def test_missing_layout_missing_file_and_inaccessible_file_do_not_become_zero(self):
        item = vm(); item.layoutEx = None
        row = self.collect([item])[0]
        self.assertIsNone(row['files']); self.assertIsNone(row['snapshots'][0]['fileKeys'])
        item = vm(); item.layoutEx.file[0].accessible = False; item.layoutEx.file = item.layoutEx.file[:-2]
        row = self.collect([item])[0]
        self.assertIsNone(row['files'][0]['sizeBytes']); self.assertIsNone(row['files'][-1]['sizeBytes'])

    def test_missing_disk_chain_cannot_claim_partial_size(self):
        item = vm(); item.layoutEx.snapshot[0].disk[0].chain = []
        self.assertIsNone(self.collect([item])[0]['snapshots'][0]['fileKeys'])

    def test_vm_without_snapshots_still_available_for_create_and_missing_date_is_unknown(self):
        item = vm(); item.snapshot = None
        row = self.collect([item])[0]
        self.assertEqual(row['snapshots'], []); self.assertEqual(row['files'], []); self.assertFalse(row['template'])
        item = vm(); item.snapshot.rootSnapshotList[0].createTime = None
        self.assertIsNone(self.collect([item])[0]['snapshots'][0]['createTime'])

    def test_same_snapshot_ids_on_distinct_vms_survive_and_failed_read_destroys_view(self):
        self.assertEqual(len(self.collect([vm('v1'), vm('v2')])), 2)
        self.assertEqual(self.collect([]), [])
        with self.assertRaises(AttributeError): self.collect([vm(), Obj()])
        self.assertTrue(self.destroyed)

if __name__ == '__main__': unittest.main()
