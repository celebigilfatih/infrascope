#!/usr/bin/env python3
"""All ESXi hosts, including standalone hosts, through the shared TLS/stdin lifecycle."""
import sys
from vmware_helper import main
from vmware_workspace import host_row


def collect_host_workspace(content, vim, _vm_id):
    view = content.viewManager.CreateContainerView(content.rootFolder, [vim.HostSystem], True)
    try:
        rows = []
        for host in view.view:
            row = host_row(host)
            parent = host.parent
            membership = 'cluster' if isinstance(parent, vim.ClusterComputeResource) else 'standalone' if isinstance(parent, vim.ComputeResource) else 'unknown'
            hardware = getattr(host.summary, 'hardware', None)
            product = getattr(getattr(host.summary, 'config', None), 'product', None)
            row.update({
                'clusterMembership': membership,
                'clusterId': parent._moId if membership == 'cluster' else None,
                'clusterName': parent.name if membership == 'cluster' else None,
                'vendor': getattr(hardware, 'vendor', None), 'model': getattr(hardware, 'model', None),
                'build': getattr(product, 'build', None),
            })
            rows.append(row)
        return sorted(rows, key=lambda row: (row['name'], row['id']))
    finally:
        view.Destroy()


if __name__ == '__main__':
    sys.exit(main('hostWorkspace', collect_host_workspace))
