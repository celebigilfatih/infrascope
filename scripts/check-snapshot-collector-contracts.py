"""Snapshot SDK/protocol regressions; synthetic records and mocked connection only."""
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace as Obj
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import vmware_helper as helper
from pyVmomi import vim

spec = importlib.util.spec_from_file_location('snapshot_collector', ROOT / 'get-snapshot-workspace.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


def snapshot(id='snapshot-1', children=None, created=None):
    return Obj(snapshot=vim.VirtualMachineSnapshot(id), name='Fixture snapshot', description='',
               createTime=created or datetime(2026, 10, 16, 15, tzinfo=timezone(timedelta(hours=3))),
               state='poweredOff', childSnapshotList=children or [])


def machine(id='vm-1', tree=None):
    layout = vim.vm.FileLayoutEx.SnapshotLayout(key=vim.VirtualMachineSnapshot('snapshot-1'), dataKey=1, memoryKey=-1,
        disk=[vim.vm.FileLayoutEx.DiskLayout(key=2000, chain=[vim.vm.FileLayoutEx.DiskUnit(fileKey=[2, 3])])])
    files = [vim.vm.FileLayoutEx.FileInfo(key=key, name=f'fixture-{key}', type='snapshotData', size=size, accessible=access)
             for key, size, access in [(1, 0, True), (2, 1024, True), (3, 512, False)]]
    return Obj(_moId=id, name='Same VM name', summary=Obj(config=Obj(template=False),
               runtime=Obj(connectionState='connected', powerState='poweredOff')),
               runtime=Obj(connectionState='connected', powerState='poweredOff'),
               snapshot=Obj(rootSnapshotList=tree if tree is not None else [snapshot()]),
               layoutEx=Obj(snapshot=[layout], file=files))


class SnapshotCollectorContracts(unittest.TestCase):
    def setUp(self):
        self.calls = []

    def content(self, records):
        return Obj(rootFolder=Obj(), viewManager=Obj(CreateContainerView=lambda *_: Obj(
            view=records, Destroy=lambda: self.calls.append('destroy'))))

    def collect(self, records):
        return collector.collect_snapshot_workspace(self.content(records), vim, None)

    def test_real_sdk_layout_references_zero_and_inaccessible_size(self):
        row = self.collect([machine()])[0]
        self.assertEqual(row['snapshots'][0]['fileKeys'], [1, 2, 3])
        self.assertEqual(row['snapshots'][0]['createTime'], '2026-10-16T12:00:00+00:00')
        self.assertEqual(row['files'], [{'key': 1, 'sizeBytes': 0}, {'key': 2, 'sizeBytes': 1024}, {'key': 3, 'sizeBytes': None}])
        self.assertEqual(self.calls, ['destroy'])

    def test_nested_tree_and_equal_snapshot_ids_in_different_vms(self):
        first = machine('vm-1', [snapshot(children=[snapshot('child')])])
        rows = self.collect([machine('vm-2'), first])
        self.assertEqual([row['id'] for row in rows], ['vm-1', 'vm-2'])
        self.assertEqual([row['id'] for row in rows[0]['snapshots']], ['snapshot-1', 'child'])
        self.assertIsNone(rows[0]['snapshots'][1]['fileKeys'])

    def test_empty_inventory_and_no_snapshot_vm_are_distinct_valid_results(self):
        self.assertEqual(self.collect([]), [])
        vm = machine(); vm.snapshot = None
        row = self.collect([vm])[0]
        self.assertEqual(row['snapshots'], []); self.assertEqual(row['files'], [])

    def test_missing_layout_date_and_template_remain_unknown(self):
        vm = machine(); vm.layoutEx = None; vm.summary = None
        vm.snapshot.rootSnapshotList[0].createTime = None
        row = self.collect([vm])[0]
        self.assertIsNone(row['snapshots'][0]['fileKeys'])
        self.assertIsNone(row['snapshots'][0]['createTime'])
        self.assertIsNone(row['template'])

    def test_unknown_reference_is_not_invented_zero(self):
        vm = machine(); vm.layoutEx.file = []
        self.assertTrue(all(file['sizeBytes'] is None for file in self.collect([vm])[0]['files']))

    def test_bad_or_missing_disk_chain_keeps_file_coverage_unknown(self):
        for keys in [None, [], [True], [-1], [1.5]]:
            layout = Obj(dataKey=1, memoryKey=-1, disk=[Obj(chain=[Obj(fileKey=keys)])])
            self.assertIsNone(collector.file_keys(layout))
        self.assertIsNone(collector.file_keys(Obj(dataKey=None)))
        self.assertIsNone(collector.file_keys(Obj(dataKey=1, disk=[Obj(chain=[])])))

    def test_file_keys_deduplicate_and_optional_memory_sentinel_is_not_a_file(self):
        layout = Obj(dataKey=1, memoryKey=-1, disk=[Obj(chain=[Obj(fileKey=[1, 2, 2])])])
        self.assertEqual(collector.file_keys(layout), [1, 2])
        layout.memoryKey = 4
        self.assertEqual(collector.file_keys(layout), [1, 2, 4])

    def test_duplicate_file_or_layout_keys_cannot_silently_overwrite_measurements(self):
        for field in ['file', 'snapshot']:
            vm = machine(); getattr(vm.layoutEx, field).append(getattr(vm.layoutEx, field)[0])
            with self.assertRaises(ValueError):
                self.collect([vm])
            self.assertEqual(self.calls[-1], 'destroy')

    def test_source_fault_cleans_view_and_disconnects_without_partial_success(self):
        class BrokenVM:
            summary = None
            @property
            def snapshot(self):
                raise type('NoPermission', (Exception,), {})('fixture-secret')
        service = Obj(RetrieveContent=lambda: self.content([machine(), BrokenVM()]))
        request = {'protocol': 1, 'operation': 'snapshotWorkspace', 'host': 'fixture.invalid',
                   'username': 'fixture-reader', 'password': 'fixture-secret', 'tls': {'verify': True}}
        output = io.StringIO()
        with patch.dict(os.environ, {'NODE_ENV': 'test'}, clear=True), \
             patch.object(sys, 'stdin', Obj(buffer=io.BytesIO(json.dumps(request).encode()))), \
             patch.object(helper, 'sdk', return_value=(lambda **_: service, lambda _: self.calls.append('disconnect'), vim)), \
             redirect_stdout(output):
            status = helper.main('snapshotWorkspace', collector.collect_snapshot_workspace)
        response = json.loads(output.getvalue())
        self.assertEqual(status, 1); self.assertEqual(response['code'], 'PERMISSION_DENIED')
        self.assertNotIn('snapshotWorkspace', response); self.assertNotIn('fixture-secret', output.getvalue())
        self.assertEqual(self.calls, ['destroy', 'disconnect'])


if __name__ == '__main__':
    unittest.main()
