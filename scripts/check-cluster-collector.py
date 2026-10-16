"""Real cluster collector against synthetic SDK objects; no VMware connection."""
import importlib.util
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace as Obj

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('cluster_collector', ROOT / 'get-cluster-details.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


def host(id, **changes):
    runtime = Obj(connectionState=changes.get('connection', 'connected'), powerState='poweredOn', inMaintenanceMode=False)
    stats = Obj(overallCpuUsage=changes.get('cpu', 12000), overallMemoryUsage=32768)
    hardware = Obj(numCpuCores=16, cpuMhz=2500, memorySize=128 * 1024**3)
    return Obj(_moId=id, name='Same host name', summary=Obj(runtime=runtime, quickStats=stats, hardware=hardware, overallStatus='green', config=Obj(product=Obj(version='8.0'))))


class CollectorTests(unittest.TestCase):
    def collect(self, rows):
        self.destroyed = False
        def destroy(): self.destroyed = True
        view = Obj(view=rows, Destroy=destroy)
        content = Obj(rootFolder=Obj(), viewManager=Obj(CreateContainerView=lambda *_: view))
        return collector.collect_clusters(content, Obj(ClusterComputeResource=object), None)

    def cluster(self, id='domain-c1', hosts=None):
        return Obj(_moId=id, name='Same cluster name', overallStatus='yellow', host=hosts or [], summary=Obj(numHosts=len(hosts or []), numEffectiveHosts=1, numCpuCores=32, totalCpu=80000, totalMemory=256*1024**3), configurationEx=Obj(dasConfig=Obj(enabled=True), drsConfig=Obj(enabled=False)))

    def test_membership_uses_ids_and_preserves_reported_health(self):
        rows = self.collect([self.cluster('c1', [host('h1')]), self.cluster('c2', [host('h2')])])
        self.assertEqual([row['hosts'][0]['id'] for row in rows], ['h1', 'h2'])
        self.assertEqual(rows[0]['overallStatus'], 'yellow')
        self.assertEqual(rows[0]['hosts'][0]['totalCpuMHz'], 40000)
        self.assertEqual(rows[0]['hosts'][0]['usedMemoryBytes'], 32768*1024**2)
        self.assertTrue(rows[0]['haEnabled']); self.assertFalse(rows[0]['drsEnabled'])
        self.assertTrue(self.destroyed)

    def test_missing_and_disconnected_usage_remains_unknown(self):
        rows = self.collect([self.cluster(hosts=[host('h1', cpu=-1), host('h2', connection='notResponding')])])
        self.assertIsNone(rows[0]['hosts'][0]['usedCpuMHz'])
        self.assertIsNone(rows[0]['hosts'][1]['usedMemoryBytes'])
        self.assertEqual(rows[0]['hosts'][1]['connectionState'], 'notResponding')

    def test_empty_is_explicit_and_fault_never_becomes_empty_success(self):
        self.assertEqual(self.collect([]), []); self.assertTrue(self.destroyed)
        with self.assertRaises(AttributeError): self.collect([Obj(_moId='broken')])
        self.assertTrue(self.destroyed)


if __name__ == '__main__': unittest.main()
