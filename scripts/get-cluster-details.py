#!/usr/bin/env python3
"""Read cluster membership, reported health and physical capacity through the shared TLS/stdin helper."""
import sys
from vmware_helper import main
from vmware_workspace import host_row, number, text


def collect_clusters(content, vim, _vm_id):
    view = content.viewManager.CreateContainerView(content.rootFolder, [vim.ClusterComputeResource], True)
    try:
        rows = []
        for cluster in view.view:
            summary = cluster.summary
            config = cluster.configurationEx
            hosts = sorted((host_row(host) for host in cluster.host), key=lambda host: (host['name'], host['id']))
            ha = getattr(getattr(config, 'dasConfig', None), 'enabled', None)
            drs = getattr(getattr(config, 'drsConfig', None), 'enabled', None)
            rows.append({
                'id': cluster._moId, 'name': cluster.name,
                'overallStatus': text(getattr(cluster, 'overallStatus', None)),
                'hostCount': number(getattr(summary, 'numHosts', None)) if getattr(summary, 'numHosts', None) is not None else len(hosts),
                'effectiveHosts': number(getattr(summary, 'numEffectiveHosts', None)),
                'cpuCores': number(getattr(summary, 'numCpuCores', None)),
                'totalCpuMHz': number(getattr(summary, 'totalCpu', None)),
                'totalMemoryBytes': number(getattr(summary, 'totalMemory', None)),
                'haEnabled': ha if type(ha) is bool else None, 'drsEnabled': drs if type(drs) is bool else None,
                'hosts': hosts,
            })
        return sorted(rows, key=lambda cluster: (cluster['name'], cluster['id']))
    finally:
        view.Destroy()


if __name__ == '__main__':
    sys.exit(main('clusters', collect_clusters))
