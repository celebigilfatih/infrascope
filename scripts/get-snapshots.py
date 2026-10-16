#!/usr/bin/env python3
"""Collect snapshots using the shared VMware stdin/TLS protocol."""
import sys
from datetime import timezone
from vmware_helper import HelperError, main


def collect_snapshots(content, vim, vm_id):
    view = content.viewManager.CreateContainerView(content.rootFolder, [vim.VirtualMachine], True)
    try:
        snapshots = []
        found = vm_id is None
        for vm in view.view:
            if vm_id is not None and vm._moId != vm_id:
                continue
            found = True
            if not vm.snapshot:
                continue

            def extract(tree):
                for snapshot in tree:
                    size = sum(file.size for file in (vm.layoutEx.file if vm.layoutEx else [])
                               if file.type == 'snapshotData')
                    created = snapshot.createTime
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    snapshots.append({
                        'id': snapshot.snapshot._moId, 'vmId': vm._moId, 'vmName': vm.name,
                        'name': snapshot.name, 'description': snapshot.description or '',
                        'createTime': created.astimezone(timezone.utc).isoformat(), 'state': snapshot.state, 'size': size,
                    })
                    extract(snapshot.childSnapshotList or [])
            extract(vm.snapshot.rootSnapshotList)
        if not found:
            raise HelperError('VM_NOT_FOUND')
        return snapshots
    finally:
        view.Destroy()


if __name__ == '__main__':
    sys.exit(main('snapshots', collect_snapshots))
