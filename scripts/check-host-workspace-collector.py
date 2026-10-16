"""ESXi workspace collector with synthetic SDK objects; no VMware connection."""
import importlib.util
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace as Obj

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('host_workspace_collector', ROOT / 'get-host-workspace.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class ComputeResource: pass
class ClusterComputeResource(ComputeResource):
    def __init__(self, id, name): self._moId, self.name = id, name


def host(id, parent, connection='connected', cpu=12000):
    runtime = Obj(connectionState=connection, powerState='poweredOn', inMaintenanceMode=False)
    stats = Obj(overallCpuUsage=cpu, overallMemoryUsage=32768)
    hardware = Obj(numCpuCores=16, cpuMhz=2500, memorySize=128 * 1024**3, vendor='Fixture vendor', model='Fixture model')
    return Obj(_moId=id, name='Same host name', parent=parent, summary=Obj(runtime=runtime, quickStats=stats, hardware=hardware, overallStatus='yellow', config=Obj(product=Obj(version='8.0', build='test'))))


class CollectorTests(unittest.TestCase):
    def collect(self, rows):
        self.destroyed = False
        def destroy(): self.destroyed = True
        view = Obj(view=rows, Destroy=destroy)
        content = Obj(rootFolder=Obj(), viewManager=Obj(CreateContainerView=lambda *_: view))
        return collector.collect_host_workspace(content, Obj(HostSystem=object, ClusterComputeResource=ClusterComputeResource, ComputeResource=ComputeResource), None)

    def test_duplicate_names_keep_exact_membership_and_reported_status(self):
        rows = self.collect([host('h1', ClusterComputeResource('c1', 'Same cluster name')), host('h2', ClusterComputeResource('c2', 'Same cluster name'))])
        self.assertEqual([row['clusterId'] for row in rows], ['c1', 'c2'])
        self.assertEqual(rows[0]['overallStatus'], 'yellow')
        self.assertEqual(rows[0]['totalCpuMHz'], 40000)
        self.assertEqual(rows[0]['usedMemoryBytes'], 32768*1024**2)
        self.assertEqual(rows[0]['vendor'], 'Fixture vendor'); self.assertEqual(rows[0]['build'], 'test')
        self.assertTrue(self.destroyed)

    def test_standalone_and_unknown_membership_are_distinct(self):
        rows = self.collect([host('h1', ComputeResource()), host('h2', None)])
        self.assertEqual([row['clusterMembership'] for row in rows], ['standalone', 'unknown'])
        self.assertTrue(all(row['clusterId'] is None for row in rows))

    def test_missing_or_disconnected_usage_is_unknown_and_zero_is_preserved(self):
        rows = self.collect([host('h1', None, cpu=-1), host('h2', None, connection='notResponding'), host('h3', None, cpu=0)])
        self.assertIsNone(rows[0]['usedCpuMHz']); self.assertIsNone(rows[1]['usedMemoryBytes']); self.assertEqual(rows[2]['usedCpuMHz'], 0)

    def test_empty_and_source_failure_cleanup(self):
        self.assertEqual(self.collect([]), []); self.assertTrue(self.destroyed)
        with self.assertRaises(AttributeError): self.collect([Obj(_moId='broken')])
        self.assertTrue(self.destroyed)


if __name__ == '__main__': unittest.main()
