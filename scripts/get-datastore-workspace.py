#!/usr/bin/env python3
"""Read datastore bytes and exact host mounts via the shared verified SDK lifecycle."""
import sys
from vmware_helper import main
from vmware_workspace import number, text

def boolean(value):
    return value if type(value) is bool else None

def collect_datastore_workspace(content, vim, _vm_id):
    view = content.viewManager.CreateContainerView(content.rootFolder, [vim.Datastore], True)
    try:
        rows = []
        host_details = {}
        for datastore in view.view:
            summary = datastore.summary
            accessible = boolean(getattr(summary, 'accessible', None))
            mounts = getattr(datastore, 'host', None)
            hosts = None
            if mounts is not None:
                hosts = []
                for mount in mounts:
                    host = mount.key
                    if host._moId not in host_details:
                        host_details[host._moId] = {
                            'id': host._moId, 'name': host.name,
                            'connectionState': text(getattr(getattr(host, 'runtime', None), 'connectionState', None)),
                        }
                    info = getattr(mount, 'mountInfo', None)
                    mounted = getattr(info, 'mounted', None)
                    # The SDK specifies true as the default when this optional flag is absent.
                    if info is not None and mounted is None:
                        mounted = True
                    hosts.append({
                        **host_details[host._moId],
                        'mounted': boolean(mounted), 'accessible': boolean(getattr(info, 'accessible', None)),
                        'accessMode': text(getattr(info, 'accessMode', None)),
                        'inaccessibleReason': getattr(info, 'inaccessibleReason', None),
                    })
                hosts.sort(key=lambda host: (host['name'], host['id']))
            rows.append({
                'id': datastore._moId, 'name': datastore.name, 'type': text(getattr(summary, 'type', None)),
                'accessible': accessible,
                # vSphere guarantees these measurements only for accessible datastores.
                'capacityBytes': number(getattr(summary, 'capacity', None)) if accessible is True else None,
                'freeBytes': number(getattr(summary, 'freeSpace', None)) if accessible is True else None,
                'maintenanceMode': text(getattr(summary, 'maintenanceMode', None)),
                'multipleHostAccess': boolean(getattr(summary, 'multipleHostAccess', None)),
                'hosts': hosts,
            })
        return sorted(rows, key=lambda row: (row['name'], row['id']))
    finally:
        view.Destroy()

if __name__ == '__main__':
    sys.exit(main('datastoreWorkspace', collect_datastore_workspace))
